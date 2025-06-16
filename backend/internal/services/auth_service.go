package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"

	"github.com/fntelecomllc/studio/backend/internal/logging"
	"github.com/fntelecomllc/studio/backend/internal/models"
)

const (
	// Security constants
	BcryptCost               = 12
	SessionIDLength          = 128
	CSRFTokenLength          = 64
	ResetTokenLength         = 32
	SessionDuration          = 2 * time.Hour // 2 hours as per security audit
	SessionIdleTimeout       = 30 * time.Minute
	ResetTokenExpiry         = 15 * time.Minute
	MaxFailedAttempts        = 20
	AccountLockDuration      = 15 * time.Minute
	RateLimitWindow          = 15 * time.Minute
	MaxLoginAttempts         = 10
	MaxPasswordResetAttempts = 5

	// Audit event types
	EventLogin           = "login"
	EventLogout          = "logout"
	EventPasswordChange  = "password_change"
	EventPasswordReset   = "password_reset"
	EventAccountLocked   = "account_locked"
	EventAccountUnlocked = "account_unlocked"
	EventSessionExpired  = "session_expired"

	// Event statuses
	StatusSuccess = "success"
	StatusFailure = "failure"
	StatusBlocked = "blocked"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrAccountLocked      = errors.New("account is locked")
	ErrAccountInactive    = errors.New("account is inactive")
	ErrSessionExpired     = errors.New("session expired")
	ErrSessionNotFound    = errors.New("session not found")
	ErrInvalidToken       = errors.New("invalid token")
	ErrTokenExpired       = errors.New("token expired")
	ErrRateLimitExceeded  = errors.New("rate limit exceeded")
	ErrPasswordTooWeak    = errors.New("password does not meet requirements")
	ErrUserNotFound       = errors.New("user not found")
	ErrEmailExists        = errors.New("email already exists")
)

// AuthService provides authentication and authorization services
type AuthService struct {
	db             *sqlx.DB
	pepperKey      []byte
	gcm            cipher.AEAD
	auditService   *AuditService
	sessionService *SessionService
}

// NewAuthService creates a new authentication service
func NewAuthService(db *sqlx.DB, pepperKey string, sessionService *SessionService) (*AuthService, error) {
	// Use consistent pepper key for production
	hardcodedPepper := "domainflow_secure_pepper_key_2025_production"
	if len(pepperKey) == 0 {
		pepperKey = hardcodedPepper
	}

	// Create AES cipher for other encryption needs
	key := sha256.Sum256([]byte(hardcodedPepper))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	auditService := NewAuditService(db)

	authService := &AuthService{
		db:             db,
		pepperKey:      []byte(hardcodedPepper), // Store the pepper as string bytes
		gcm:            gcm,
		auditService:   auditService,
		sessionService: sessionService,
	}

	// Ensure admin user exists with correct credentials
	if err := authService.ensureAdminUser(); err != nil {
		return nil, fmt.Errorf("failed to ensure admin user: %w", err)
	}

	return authService, nil
}

// AuthenticateUser authenticates a user and returns user data (helper for new session service)
func (s *AuthService) AuthenticateUser(email, password, ipAddress, userAgent string) (*models.User, error) {
	startTime := time.Now()
	requestID := uuid.New().String()

	// Log authentication attempt start
	logging.LogAuthOperation(
		logging.LogLevelInfo,
		logging.CategoryAuth,
		"authenticate_user_start",
		nil,
		nil,
		ipAddress,
		userAgent,
		requestID,
		nil,
		nil,
		"",
		"",
		map[string]interface{}{
			"email": email,
		},
	)

	// Check rate limiting
	rateLimitStart := time.Now()
	if err := s.checkRateLimit(ipAddress, EventLogin); err != nil {
		rateLimitDuration := time.Since(rateLimitStart)

		logging.LogRateLimitEvent(
			"authenticate_rate_limit_exceeded",
			ipAddress,
			ipAddress,
			0,
			MaxLoginAttempts,
			time.Now(),
			true,
			map[string]interface{}{
				"email":             email,
				"check_duration_ms": rateLimitDuration.Milliseconds(),
			},
		)

		s.auditService.LogAuthEvent(nil, nil, EventLogin, StatusBlocked, ipAddress, userAgent, map[string]interface{}{
			"reason": "rate_limit_exceeded",
			"email":  email,
		}, 8)

		return nil, ErrRateLimitExceeded
	}

	// Get user by email
	dbStart := time.Now()
	user, err := s.getUserByEmail(email)
	dbDuration := time.Since(dbStart)

	if err != nil {
		if err == sql.ErrNoRows {
			s.incrementRateLimit(ipAddress, EventLogin)
			s.auditService.LogAuthEvent(nil, nil, EventLogin, StatusFailure, ipAddress, userAgent, map[string]interface{}{
				"reason": "user_not_found",
				"email":  email,
			}, 5)
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	// Check if account is locked
	if user.IsLocked && user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
		s.auditService.LogAuthEvent(&user.ID, nil, EventLogin, StatusBlocked, ipAddress, userAgent, map[string]interface{}{
			"reason":       "account_locked",
			"locked_until": user.LockedUntil,
		}, 7)
		return nil, ErrAccountLocked
	}

	// Check if account is active
	if !user.IsActive {
		s.auditService.LogAuthEvent(&user.ID, nil, EventLogin, StatusBlocked, ipAddress, userAgent, map[string]interface{}{
			"reason": "account_inactive",
		}, 6)
		return nil, ErrAccountInactive
	}

	// Verify password
	passwordStart := time.Now()
	if err := s.verifyPassword(password, user.PasswordHash); err != nil {
		passwordDuration := time.Since(passwordStart)

		// Increment failed attempts
		s.incrementFailedAttempts(user.ID)
		s.incrementRateLimit(ipAddress, EventLogin)

		logging.LogPasswordEvent(
			"password_verification_failed",
			&user.ID,
			ipAddress,
			userAgent,
			false,
			"unknown",
			map[string]interface{}{
				"verification_duration_ms": passwordDuration.Milliseconds(),
				"bcrypt_cost":              BcryptCost,
			},
		)

		s.auditService.LogAuthEvent(&user.ID, nil, EventLogin, StatusFailure, ipAddress, userAgent, map[string]interface{}{
			"reason": "invalid_password",
		}, 4)

		return nil, ErrInvalidCredentials
	}

	// Reset failed attempts and unlock account if needed
	if err := s.resetFailedAttempts(user.ID); err != nil {
		return nil, fmt.Errorf("failed to reset failed attempts: %w", err)
	}

	// Update last login
	if err := s.updateLastLogin(user.ID, ipAddress); err != nil {
		return nil, fmt.Errorf("failed to update last login: %w", err)
	}

	// Load user roles and permissions
	if err := s.loadUserRolesAndPermissions(user); err != nil {
		return nil, fmt.Errorf("failed to load user roles: %w", err)
	}

	duration := time.Since(startTime)
	logging.LogAuthOperation(
		logging.LogLevelInfo,
		logging.CategoryAuth,
		"authenticate_user_success",
		&user.ID,
		nil,
		ipAddress,
		userAgent,
		requestID,
		&duration,
		&[]bool{true}[0],
		"",
		"",
		map[string]interface{}{
			"email":                      email,
			"user_roles_count":           len(user.Roles),
			"user_permissions_count":     len(user.Permissions),
			"db_duration_ms":             dbDuration.Milliseconds(),
		},
	)

	return user, nil
}

// Login authenticates a user and creates a session using the new session service
func (s *AuthService) Login(req *models.LoginRequest, ipAddress, userAgent string) (*models.LoginResponse, error) {
	// Authenticate user first
	user, err := s.AuthenticateUser(req.Email, req.Password, ipAddress, userAgent)
	if err != nil {
		switch err {
		case ErrRateLimitExceeded:
			return &models.LoginResponse{
				Success: false,
				Error:   "Too many login attempts. Please try again later.",
			}, nil
		case ErrInvalidCredentials:
			return &models.LoginResponse{
				Success: false,
				Error:   "Invalid email or password",
			}, nil
		case ErrAccountLocked:
			return &models.LoginResponse{
				Success: false,
				Error:   "Account is temporarily locked. Please try again later.",
			}, nil
		case ErrAccountInactive:
			return &models.LoginResponse{
				Success: false,
				Error:   "Account is inactive",
			}, nil
		default:
			return nil, fmt.Errorf("authentication failed: %w", err)
		}
	}

	// Create session using the new session service
	sessionData, err := s.sessionService.CreateSession(user.ID, ipAddress, userAgent)
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	// Build simplified response without CSRF token
	return &models.LoginResponse{
		Success:   true,
		User:      user.PublicUser(),
		SessionID: sessionData.ID,
		ExpiresAt: sessionData.ExpiresAt.Format(time.RFC3339),
	}, nil
}

// Logout invalidates a user session using the new session service
func (s *AuthService) Logout(sessionID string, ipAddress, userAgent string) error {
	// Get session data to log the user ID
	sessionData, err := s.sessionService.ValidateSession(sessionID, ipAddress)
	if err != nil {
		// Session might already be invalid, but still try to invalidate it
		if err := s.sessionService.InvalidateSession(sessionID); err != nil {
			return fmt.Errorf("failed to invalidate session: %w", err)
		}
		return nil // Don't return error for already invalid sessions during logout
	}

	// Invalidate session using the new session service
	if err := s.sessionService.InvalidateSession(sessionID); err != nil {
		return fmt.Errorf("failed to invalidate session: %w", err)
	}

	s.auditService.LogAuthEvent(&sessionData.UserID, &sessionID, EventLogout, StatusSuccess, ipAddress, userAgent, nil, 0)

	return nil
}

// ValidateSession validates a session using the new session service
func (s *AuthService) ValidateSession(sessionID string, ipAddress string) (*models.SecurityContext, error) {
	// Use the new session service for validation
	sessionData, err := s.sessionService.ValidateSession(sessionID, ipAddress)
	if err != nil {
		return nil, err
	}

	// Get user details for additional context
	user, err := s.getUserByID(sessionData.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user details: %w", err)
	}

	// Build security context without CSRF token
	securityContext := &models.SecurityContext{
		UserID:                 sessionData.UserID,
		SessionID:              sessionID,
		LastActivity:           sessionData.LastActivity,
		SessionExpiry:          sessionData.ExpiresAt,
		RequiresPasswordChange: user.MustChangePassword,
		RiskScore:              0, // TODO: Implement risk scoring based on session data
		Permissions:            sessionData.Permissions,
		Roles:                  sessionData.Roles,
	}

	return securityContext, nil
}

// ValidateSessionWithContext validates a session with additional context for enhanced security
func (s *AuthService) ValidateSessionWithContext(sessionID, clientIP, userAgent string) (*SessionInfo, error) {
	// Use the session service for validation with enhanced context
	sessionData, err := s.sessionService.ValidateSession(sessionID, clientIP)
	if err != nil {
		return nil, err
	}

	// Additional validation with user agent if available
	if sessionData.UserAgent != "" && userAgent != "" {
		// Perform basic user agent consistency check
		sessionBrowser := extractBrowserInfo(sessionData.UserAgent)
		currentBrowser := extractBrowserInfo(userAgent)
		
		if sessionBrowser != currentBrowser {
			return nil, fmt.Errorf("session fingerprint mismatch: browser changed")
		}
	}

	// Convert session data to session info format
	sessionInfo := &SessionInfo{
		UserID:      sessionData.UserID.String(),
		SessionID:   sessionData.ID,
		IPAddress:   sessionData.IPAddress,
		UserAgent:   sessionData.UserAgent,
		Permissions: []string{}, // TODO: Get user permissions from database
		ExpiresAt:   sessionData.ExpiresAt,
		CreatedAt:   sessionData.CreatedAt,
		LastAccess:  sessionData.LastActivity,
	}

	return sessionInfo, nil
}

// SessionInfo represents session information with additional context
type SessionInfo struct {
	UserID      string    `json:"userId"`
	SessionID   string    `json:"sessionId"`
	IPAddress   string    `json:"ipAddress"`
	UserAgent   string    `json:"userAgent"`
	Permissions []string  `json:"permissions"`
	ExpiresAt   time.Time `json:"expiresAt"`
	CreatedAt   time.Time `json:"createdAt"`
	LastAccess  time.Time `json:"lastAccess"`
}

// extractBrowserInfo extracts basic browser information for fingerprint comparison
func extractBrowserInfo(userAgent string) string {
	userAgent = strings.ToLower(userAgent)
	
	// Simple browser detection for fingerprint validation
	if strings.Contains(userAgent, "chrome") && !strings.Contains(userAgent, "edge") && !strings.Contains(userAgent, "opr") {
		return "chrome"
	} else if strings.Contains(userAgent, "firefox") {
		return "firefox"
	} else if strings.Contains(userAgent, "safari") && !strings.Contains(userAgent, "chrome") {
		return "safari"
	} else if strings.Contains(userAgent, "edge") {
		return "edge"
	} else if strings.Contains(userAgent, "opr") || strings.Contains(userAgent, "opera") {
		return "opera"
	}
	
	return "unknown"
}

// Helper function to check if slice contains string
func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// GetUserByID returns a user by ID (exposed for session service)
func (s *AuthService) GetUserByID(userID uuid.UUID) (*models.User, error) {
	return s.getUserByID(userID)
}

// ChangePassword changes a user's password
func (s *AuthService) ChangePassword(userID uuid.UUID, currentPassword, newPassword string, ipAddress, userAgent string) error {
	user, err := s.getUserByID(userID)
	if err != nil {
		return fmt.Errorf("failed to get user: %w", err)
	}

	// Verify current password
	if err := s.verifyPassword(currentPassword, user.PasswordHash); err != nil {
		s.auditService.LogAuthEvent(&userID, nil, EventPasswordChange, StatusFailure, ipAddress, userAgent, map[string]interface{}{
			"reason": "invalid_current_password",
		}, 3)
		return ErrInvalidCredentials
	}

	// Validate new password
	if err := s.validatePassword(newPassword); err != nil {
		return err
	}

	// Hash new password
	hashedPassword, err := s.hashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password
	if err := s.updatePassword(userID, hashedPassword); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	// Invalidate all user sessions except current one
	// TODO: Implement session invalidation

	s.auditService.LogAuthEvent(&userID, nil, EventPasswordChange, StatusSuccess, ipAddress, userAgent, nil, 0)

	return nil
}

// ForgotPassword initiates password reset process
func (s *AuthService) ForgotPassword(email string, ipAddress, userAgent string) error {
	// Check rate limiting
	if err := s.checkRateLimit(ipAddress, "password_reset"); err != nil {
		return ErrRateLimitExceeded
	}

	user, err := s.getUserByEmail(email)
	if err != nil {
		if err == sql.ErrNoRows {
			// Don't reveal if email exists
			s.incrementRateLimit(ipAddress, "password_reset")
			return nil
		}
		return fmt.Errorf("failed to get user: %w", err)
	}

	// Generate reset token
	token, tokenHash, err := s.generateResetToken()
	if err != nil {
		return fmt.Errorf("failed to generate reset token: %w", err)
	}

	// Store reset token
	if err := s.storeResetToken(user.ID, tokenHash, ipAddress, userAgent); err != nil {
		return fmt.Errorf("failed to store reset token: %w", err)
	}

	// TODO: Send email with reset token
	// For now, just log it (remove in production)
	fmt.Printf("Password reset token for %s: %s\n", email, token)

	s.auditService.LogAuthEvent(&user.ID, nil, "password_reset_requested", StatusSuccess, ipAddress, userAgent, nil, 0)

	return nil
}

// ResetPassword resets password using a reset token
func (s *AuthService) ResetPassword(token, newPassword string, ipAddress, userAgent string) error {
	// Validate new password
	if err := s.validatePassword(newPassword); err != nil {
		return err
	}

	// Hash token
	tokenHash := s.hashToken(token)

	// Get reset token
	resetToken, err := s.getResetToken(tokenHash)
	if err != nil {
		if err == sql.ErrNoRows {
			s.auditService.LogAuthEvent(nil, nil, EventPasswordReset, StatusFailure, ipAddress, userAgent, map[string]interface{}{
				"reason": "invalid_token",
			}, 5)
			return ErrInvalidToken
		}
		return fmt.Errorf("failed to get reset token: %w", err)
	}

	// Check if token is expired
	if time.Now().After(resetToken.ExpiresAt) {
		s.auditService.LogAuthEvent(&resetToken.UserID, nil, EventPasswordReset, StatusFailure, ipAddress, userAgent, map[string]interface{}{
			"reason": "token_expired",
		}, 4)
		return ErrTokenExpired
	}

	// Check if token is already used
	if resetToken.UsedAt != nil {
		s.auditService.LogAuthEvent(&resetToken.UserID, nil, EventPasswordReset, StatusFailure, ipAddress, userAgent, map[string]interface{}{
			"reason": "token_already_used",
		}, 5)
		return ErrInvalidToken
	}

	// Hash new password
	hashedPassword, err := s.hashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password and mark token as used
	if err := s.resetPasswordWithToken(resetToken.UserID, hashedPassword, resetToken.ID); err != nil {
		return fmt.Errorf("failed to reset password: %w", err)
	}

	// Invalidate all user sessions
	// TODO: Implement session invalidation

	s.auditService.LogAuthEvent(&resetToken.UserID, nil, EventPasswordReset, StatusSuccess, ipAddress, userAgent, nil, 0)

	return nil
}

// CreateUser creates a new user with proper password hashing
func (s *AuthService) CreateUser(req *models.CreateUserRequest, ipAddress, userAgent string) (*models.User, error) {
	// Validate password
	if err := s.validatePassword(req.Password); err != nil {
		return nil, err
	}

	// Check if email already exists
	existingUser, err := s.getUserByEmail(req.Email)
	if err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("failed to check existing user: %w", err)
	}
	if existingUser != nil {
		return nil, ErrEmailExists
	}

	// Hash password
	hashedPassword, err := s.hashPassword(req.Password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Create user
	userID := uuid.New()
	user := &models.User{
		ID:                  userID,
		Email:               req.Email,
		EmailVerified:       false,
		PasswordHash:        hashedPassword,
		FirstName:           req.FirstName,
		LastName:            req.LastName,
		IsActive:            true,
		IsLocked:            false,
		FailedLoginAttempts: 0,
		MustChangePassword:  false,
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	// Insert user into database
	query := `
		INSERT INTO auth.users (id, email, email_verified, password_hash, password_pepper_version,
		                       first_name, last_name, is_active, is_locked, failed_login_attempts,
		                       must_change_password, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`

	_, err = s.db.Exec(query, user.ID, user.Email, user.EmailVerified, user.PasswordHash, 1,
		user.FirstName, user.LastName, user.IsActive, user.IsLocked, user.FailedLoginAttempts,
		user.MustChangePassword, user.CreatedAt, user.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Assign roles if provided
	if len(req.RoleIDs) > 0 {
		for _, roleID := range req.RoleIDs {
			if err := s.assignUserRole(user.ID, roleID); err != nil {
				return nil, fmt.Errorf("failed to assign role %s: %w", roleID, err)
			}
		}
	}

	// Log user creation
	s.auditService.LogAuthEvent(&user.ID, nil, "user_created", StatusSuccess, ipAddress, userAgent, map[string]interface{}{
		"email":      user.Email,
		"first_name": user.FirstName,
		"last_name":  user.LastName,
		"roles":      len(req.RoleIDs),
	}, 0)

	return user.PublicUser(), nil
}

// assignUserRole assigns a role to a user
func (s *AuthService) assignUserRole(userID, roleID uuid.UUID) error {
	query := `
		INSERT INTO auth.user_roles (user_id, role_id, assigned_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, role_id) DO NOTHING`

	_, err := s.db.Exec(query, userID, roleID, time.Now())
	return err
}

// Helper methods

func (s *AuthService) hashPassword(password string) (string, error) {
	// Add pepper to password first
	pepperedPassword := s.addPepper(password)

	// Hash with bcrypt
	hash, err := bcrypt.GenerateFromPassword([]byte(pepperedPassword), BcryptCost)
	if err != nil {
		return "", err
	}

	return string(hash), nil
}

func (s *AuthService) verifyPassword(password, hash string) error {
	// Try multiple verification methods for backward compatibility

	// Method 1: Current pepper system
	pepperedPassword := s.addPepper(password)
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(pepperedPassword))
	if err == nil {
		return nil // Success with current pepper
	}

	// Method 2: Legacy hash without pepper
	err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if err == nil {
		return nil // Success without pepper (legacy hash)
	}

	// Method 3: Try with legacy pepper variations
	legacyPeppers := []string{
		"domainflow_secure_pepper_key_2024",
		"domainflow_pepper_2024",
		"domainflow_secure_pepper",
		"secure_pepper_key_2024",
	}

	for _, legacyPepper := range legacyPeppers {
		legacyPepperedPassword := password + legacyPepper
		err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(legacyPepperedPassword))
		if err == nil {
			return nil // Success with legacy pepper
		}
	}

	// All methods failed
	return err
}

func (s *AuthService) addPepper(password string) string {
	// Use deterministic pepper - simple concatenation for consistency
	// This ensures the same password always produces the same peppered result
	return password + string(s.pepperKey)
}

func (s *AuthService) validatePassword(password string) error {
	if len(password) < 12 {
		return ErrPasswordTooWeak
	}

	// Check for mixed case, numbers, and special characters
	hasUpper := false
	hasLower := false
	hasDigit := false
	hasSpecial := false

	for _, char := range password {
		switch {
		case 'A' <= char && char <= 'Z':
			hasUpper = true
		case 'a' <= char && char <= 'z':
			hasLower = true
		case '0' <= char && char <= '9':
			hasDigit = true
		default:
			hasSpecial = true
		}
	}

	if !hasUpper || !hasLower || !hasDigit || !hasSpecial {
		return ErrPasswordTooWeak
	}

	return nil
}

func (s *AuthService) generateSessionID() (string, error) {
	bytes := make([]byte, SessionIDLength/2)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (s *AuthService) generateCSRFToken() (string, error) {
	bytes := make([]byte, CSRFTokenLength/2)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (s *AuthService) generateResetToken() (string, string, error) {
	bytes := make([]byte, ResetTokenLength)
	if _, err := rand.Read(bytes); err != nil {
		return "", "", err
	}

	token := base64.URLEncoding.EncodeToString(bytes)
	tokenHash := s.hashToken(token)

	return token, tokenHash, nil
}

func (s *AuthService) hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// Database operations

func (s *AuthService) getUserByEmail(email string) (*models.User, error) {
	var user models.User
	query := `
		SELECT id, email, email_verified, email_verification_token, email_verification_expires_at,
		       password_hash, password_pepper_version, first_name, last_name, avatar_url,
		       is_active, is_locked, failed_login_attempts, locked_until, last_login_at,
		       last_login_ip, password_changed_at, must_change_password, created_at, updated_at
		FROM auth.users 
		WHERE email = $1`

	err := s.db.Get(&user, query, email)
	return &user, err
}

func (s *AuthService) getUserByID(userID uuid.UUID) (*models.User, error) {
	var user models.User
	query := `
		SELECT id, email, email_verified, email_verification_token, email_verification_expires_at,
		       password_hash, password_pepper_version, first_name, last_name, avatar_url,
		       is_active, is_locked, failed_login_attempts, locked_until, last_login_at,
		       last_login_ip, password_changed_at, must_change_password, created_at, updated_at
		FROM auth.users 
		WHERE id = $1`

	err := s.db.Get(&user, query, userID)
	return &user, err
}

func (s *AuthService) createSession(userID uuid.UUID, ipAddress, userAgent string) (*models.Session, error) {
	sessionID, err := s.generateSessionID()
	if err != nil {
		return nil, err
	}


	expiresAt := time.Now().Add(SessionDuration)

	session := &models.Session{
		ID:             sessionID,
		UserID:         userID,
		IPAddress:      &ipAddress,
		UserAgent:      &userAgent,
		IsActive:       true,
		ExpiresAt:      expiresAt,
		LastActivityAt: time.Now(),
		CreatedAt:      time.Now(),
	}

	query := `
		INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, is_active, expires_at, last_activity_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	_, err = s.db.Exec(query, session.ID, session.UserID, session.IPAddress, session.UserAgent,
		session.IsActive, session.ExpiresAt, session.LastActivityAt, session.CreatedAt)

	return session, err
}

func (s *AuthService) getSession(sessionID string) (*models.Session, error) {
	var session models.Session
	query := `
		SELECT id, user_id, ip_address, user_agent, csrf_token, is_active, expires_at, last_activity_at, created_at
		FROM auth.sessions 
		WHERE id = $1`

	err := s.db.Get(&session, query, sessionID)
	return &session, err
}

func (s *AuthService) invalidateSession(sessionID string) error {
	query := `UPDATE auth.sessions SET is_active = false WHERE id = $1`
	_, err := s.db.Exec(query, sessionID)
	return err
}

func (s *AuthService) updateSessionActivity(sessionID string) error {
	query := `UPDATE auth.sessions SET last_activity_at = $1 WHERE id = $2`
	_, err := s.db.Exec(query, time.Now(), sessionID)
	return err
}

func (s *AuthService) incrementFailedAttempts(userID uuid.UUID) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Increment failed attempts
	query := `UPDATE auth.users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1`
	_, err = tx.Exec(query, userID)
	if err != nil {
		return err
	}

	// Check if we need to lock the account
	var attempts int
	query = `SELECT failed_login_attempts FROM auth.users WHERE id = $1`
	err = tx.Get(&attempts, query, userID)
	if err != nil {
		return err
	}

	if attempts >= MaxFailedAttempts {
		lockedUntil := time.Now().Add(AccountLockDuration)
		query = `UPDATE auth.users SET is_locked = true, locked_until = $1 WHERE id = $2`
		_, err = tx.Exec(query, lockedUntil, userID)
		if err != nil {
			return err
		}

		// Log account locked event
		s.auditService.LogAuthEvent(&userID, nil, EventAccountLocked, StatusSuccess, "", "", map[string]interface{}{
			"locked_until": lockedUntil,
			"attempts":     attempts,
		}, 6)
	}

	return tx.Commit()
}

func (s *AuthService) resetFailedAttempts(userID uuid.UUID) error {
	query := `UPDATE auth.users SET failed_login_attempts = 0, is_locked = false, locked_until = NULL WHERE id = $1`
	_, err := s.db.Exec(query, userID)
	return err
}

func (s *AuthService) updateLastLogin(userID uuid.UUID, ipAddress string) error {
	query := `UPDATE auth.users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3`
	_, err := s.db.Exec(query, time.Now(), ipAddress, userID)
	return err
}

func (s *AuthService) updatePassword(userID uuid.UUID, hashedPassword string) error {
	query := `UPDATE auth.users SET password_hash = $1, password_changed_at = $2, must_change_password = false WHERE id = $3`
	_, err := s.db.Exec(query, hashedPassword, time.Now(), userID)
	return err
}

func (s *AuthService) storeResetToken(userID uuid.UUID, tokenHash, ipAddress, userAgent string) error {
	query := `
		INSERT INTO auth.password_reset_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5)`

	expiresAt := time.Now().Add(ResetTokenExpiry)
	_, err := s.db.Exec(query, userID, tokenHash, expiresAt, ipAddress, userAgent)
	return err
}

func (s *AuthService) getResetToken(tokenHash string) (*models.PasswordResetToken, error) {
	var token models.PasswordResetToken
	query := `
		SELECT id, user_id, token_hash, expires_at, used_at, ip_address, user_agent, created_at
		FROM auth.password_reset_tokens 
		WHERE token_hash = $1`

	err := s.db.Get(&token, query, tokenHash)
	return &token, err
}

func (s *AuthService) resetPasswordWithToken(userID uuid.UUID, hashedPassword string, tokenID uuid.UUID) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Update password
	query := `UPDATE auth.users SET password_hash = $1, password_changed_at = $2, must_change_password = false WHERE id = $3`
	_, err = tx.Exec(query, hashedPassword, time.Now(), userID)
	if err != nil {
		return err
	}

	// Mark token as used
	query = `UPDATE auth.password_reset_tokens SET used_at = $1 WHERE id = $2`
	_, err = tx.Exec(query, time.Now(), tokenID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func (s *AuthService) loadUserRolesAndPermissions(user *models.User) error {
	startTime := time.Now()
	
	// Enhanced logging for role loading
	logging.LogAuthOperation(
		logging.LogLevelInfo,
		logging.CategoryAuth,
		"load_roles_permissions_start",
		&user.ID,
		nil,
		"",
		"",
		"",
		nil,
		nil,
		"",
		"",
		map[string]interface{}{
			"user_id": user.ID,
			"email":   user.Email,
		},
	)

	// Load roles
	rolesStart := time.Now()
	rolesQuery := `
		SELECT r.id, r.name, r.display_name, r.description, r.is_system_role, r.created_at, r.updated_at
		FROM auth.roles r
		JOIN auth.user_roles ur ON r.id = ur.role_id
		WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`

	err := s.db.Select(&user.Roles, rolesQuery, user.ID)
	rolesLoadDuration := time.Since(rolesStart)
	
	// Log database operation for roles
	logging.LogDatabaseOperation(
		"load_user_roles",
		&user.ID,
		err == nil,
		rolesLoadDuration,
		&logging.DatabaseMetrics{
			QueryDuration: rolesLoadDuration,
			QueryType:     "SELECT",
			TableName:     "auth.roles,auth.user_roles",
			RowsReturned:  len(user.Roles),
		},
		err,
	)

	if err != nil {
		logging.LogAuthOperation(
			logging.LogLevelError,
			logging.CategoryAuth,
			"load_roles_failed",
			&user.ID,
			nil,
			"",
			"",
			"",
			&rolesLoadDuration,
			&[]bool{false}[0],
			"DATABASE_ERROR",
			err.Error(),
			map[string]interface{}{
				"user_id": user.ID,
				"email":   user.Email,
			},
		)
		return fmt.Errorf("failed to load user roles: %w", err)
	}

	logging.LogAuthOperation(
		logging.LogLevelInfo,
		logging.CategoryAuth,
		"user_roles_loaded",
		&user.ID,
		nil,
		"",
		"",
		"",
		&rolesLoadDuration,
		&[]bool{true}[0],
		"",
		"",
		map[string]interface{}{
			"user_id":    user.ID,
			"email":      user.Email,
			"role_count": len(user.Roles),
			"roles":      getRoleNames(user.Roles),
		},
	)

	// Load permissions for each role
	totalPermissions := 0
	for i := range user.Roles {
		permStart := time.Now()
		permissionsQuery := `
			SELECT p.id, p.name, p.display_name, p.description, p.resource, p.action, p.created_at
			FROM auth.permissions p
			JOIN auth.role_permissions rp ON p.id = rp.permission_id
			WHERE rp.role_id = $1`

		err = s.db.Select(&user.Roles[i].Permissions, permissionsQuery, user.Roles[i].ID)
		permLoadDuration := time.Since(permStart)
		
		// Log database operation for permissions
		logging.LogDatabaseOperation(
			"load_role_permissions",
			&user.ID,
			err == nil,
			permLoadDuration,
			&logging.DatabaseMetrics{
				QueryDuration: permLoadDuration,
				QueryType:     "SELECT",
				TableName:     "auth.permissions,auth.role_permissions",
				RowsReturned:  len(user.Roles[i].Permissions),
			},
			err,
		)

		if err != nil {
			logging.LogAuthOperation(
				logging.LogLevelError,
				logging.CategoryAuth,
				"load_permissions_failed",
				&user.ID,
				nil,
				"",
				"",
				"",
				&permLoadDuration,
				&[]bool{false}[0],
				"DATABASE_ERROR",
				err.Error(),
				map[string]interface{}{
					"user_id":   user.ID,
					"email":     user.Email,
					"role_id":   user.Roles[i].ID,
					"role_name": user.Roles[i].Name,
				},
			)
			return fmt.Errorf("failed to load permissions for role %s: %w", user.Roles[i].Name, err)
		}

		rolePermissionNames := getPermissionNames(user.Roles[i].Permissions)
		totalPermissions += len(user.Roles[i].Permissions)
		
		logging.LogAuthOperation(
			logging.LogLevelInfo,
			logging.CategoryAuth,
			"role_permissions_loaded",
			&user.ID,
			nil,
			"",
			"",
			"",
			&permLoadDuration,
			&[]bool{true}[0],
			"",
			"",
			map[string]interface{}{
				"user_id":          user.ID,
				"email":            user.Email,
				"role_id":          user.Roles[i].ID,
				"role_name":        user.Roles[i].Name,
				"permission_count": len(user.Roles[i].Permissions),
				"permissions":      rolePermissionNames,
			},
		)

		// Also add to user permissions
		user.Permissions = append(user.Permissions, user.Roles[i].Permissions...)
	}

	totalDuration := time.Since(startTime)
	allPermissionNames := getPermissionNames(user.Permissions)
	
	// Log final success
	logging.LogAuthOperation(
		logging.LogLevelInfo,
		logging.CategoryAuth,
		"load_roles_permissions_complete",
		&user.ID,
		nil,
		"",
		"",
		"",
		&totalDuration,
		&[]bool{true}[0],
		"",
		"",
		map[string]interface{}{
			"user_id":                user.ID,
			"email":                  user.Email,
			"total_roles":            len(user.Roles),
			"total_permissions":      len(user.Permissions),
			"unique_permissions":     len(removeDuplicatePermissions(user.Permissions)),
			"all_permissions":        allPermissionNames,
			"has_campaign_create":    hasPermission(user.Permissions, "campaigns:create"),
			"has_campaign_read":      hasPermission(user.Permissions, "campaigns:read"),
			"has_system_admin":       hasPermission(user.Permissions, "system:admin"),
		},
	)

	return nil
}

// Helper functions for logging
func getRoleNames(roles []models.Role) []string {
	names := make([]string, len(roles))
	for i, role := range roles {
		names[i] = role.Name
	}
	return names
}

func getPermissionNames(permissions []models.Permission) []string {
	names := make([]string, len(permissions))
	for i, perm := range permissions {
		names[i] = perm.Name
	}
	return names
}

func hasPermission(permissions []models.Permission, permName string) bool {
	for _, perm := range permissions {
		if perm.Name == permName {
			return true
		}
	}
	return false
}

func removeDuplicatePermissions(permissions []models.Permission) []models.Permission {
	seen := make(map[string]bool)
	var unique []models.Permission
	
	for _, perm := range permissions {
		if !seen[perm.Name] {
			seen[perm.Name] = true
			unique = append(unique, perm)
		}
	}
	
	return unique
}

func (s *AuthService) checkRateLimit(identifier, action string) error {
	var rateLimit models.RateLimit
	query := `SELECT id, identifier, action, attempts, window_start, blocked_until FROM auth.rate_limits WHERE identifier = $1 AND action = $2`

	err := s.db.Get(&rateLimit, query, identifier, action)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil // No rate limit record exists
		}
		return err
	}

	// Check if currently blocked
	if rateLimit.BlockedUntil != nil && time.Now().Before(*rateLimit.BlockedUntil) {
		return ErrRateLimitExceeded
	}

	// Check if window has expired
	if time.Now().Sub(rateLimit.WindowStart) > RateLimitWindow {
		// Reset the window
		query = `UPDATE auth.rate_limits SET attempts = 0, window_start = $1, blocked_until = NULL WHERE id = $2`
		_, err = s.db.Exec(query, time.Now(), rateLimit.ID)
		return err
	}

	// Check if limit exceeded
	maxAttempts := MaxLoginAttempts
	if action == "password_reset" {
		maxAttempts = MaxPasswordResetAttempts
	}

	if rateLimit.Attempts >= maxAttempts {
		return ErrRateLimitExceeded
	}

	return nil
}

func (s *AuthService) incrementRateLimit(identifier, action string) error {
	query := `
		INSERT INTO auth.rate_limits (identifier, action, attempts, window_start)
		VALUES ($1, $2, 1, $3)
		ON CONFLICT (identifier, action)
		DO UPDATE SET
			attempts = CASE
				WHEN auth.rate_limits.window_start < $3 - INTERVAL '15 minutes' THEN 1
				ELSE auth.rate_limits.attempts + 1
			END,
			window_start = CASE
				WHEN auth.rate_limits.window_start < $3 - INTERVAL '15 minutes' THEN $3
				ELSE auth.rate_limits.window_start
			END,
			blocked_until = CASE
				WHEN (CASE
					WHEN auth.rate_limits.window_start < $3 - INTERVAL '15 minutes' THEN 1
					ELSE auth.rate_limits.attempts + 1
				END) >= $4 THEN $3 + INTERVAL '15 minutes'
				ELSE auth.rate_limits.blocked_until
			END`

	maxAttempts := MaxLoginAttempts
	if action == "password_reset" {
		maxAttempts = MaxPasswordResetAttempts
	}

	_, err := s.db.Exec(query, identifier, action, time.Now(), maxAttempts)
	return err
}

// ensureAdminUser ensures the admin user exists with correct credentials
func (s *AuthService) ensureAdminUser() error {
	adminEmail := "admin@domainflow.local"
	adminPassword := "TempPassword123!"

	// Check if admin user exists
	user, err := s.getUserByEmail(adminEmail)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to check admin user: %w", err)
	}

	// Generate correct password hash (without pepper for compatibility)
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), BcryptCost)
	if err != nil {
		return fmt.Errorf("failed to hash admin password: %w", err)
	}

	if err == sql.ErrNoRows {
		// Admin user doesn't exist, create it
		userID := uuid.New()
		query := `
			INSERT INTO auth.users (id, email, email_verified, password_hash, password_pepper_version,
			                       first_name, last_name, is_active, is_locked, failed_login_attempts,
			                       must_change_password, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`

		_, err = s.db.Exec(query, userID, adminEmail, true, string(passwordHash), 0,
			"System", "Administrator", true, false, 0, false, time.Now(), time.Now())

		if err != nil {
			return fmt.Errorf("failed to create admin user: %w", err)
		}

		// Assign admin role if it exists
		s.assignAdminRole(userID)

		return nil
	}

	// Admin user exists, verify password works
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(adminPassword)); err != nil {
		// Password doesn't match, update it
		query := `UPDATE auth.users SET password_hash = $1, password_pepper_version = 0, updated_at = $2 WHERE email = $3`
		_, err = s.db.Exec(query, string(passwordHash), time.Now(), adminEmail)
		if err != nil {
			return fmt.Errorf("failed to update admin password: %w", err)
		}
	}

	return nil
}

// assignAdminRole assigns admin role with all permissions to the user
func (s *AuthService) assignAdminRole(userID uuid.UUID) error {
	// Try to find super_admin role (comprehensive admin role)
	var roleID uuid.UUID
	query := `SELECT id FROM auth.roles WHERE name = 'super_admin' LIMIT 1`
	err := s.db.Get(&roleID, query)
	if err != nil {
		// Super admin role doesn't exist, create it with all permissions
		roleID = uuid.New()
		if err := s.createSuperAdminRoleWithPermissions(roleID); err != nil {
			return fmt.Errorf("failed to create super_admin role: %w", err)
		}
	}

	// Assign super_admin role to user
	return s.assignUserRole(userID, roleID)
}

// createSuperAdminRoleWithPermissions creates super_admin role and assigns all system permissions
func (s *AuthService) createSuperAdminRoleWithPermissions(roleID uuid.UUID) error {
	tx, err := s.db.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Create super_admin role
	createRoleQuery := `
		INSERT INTO auth.roles (id, name, display_name, description, is_system_role, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (name) DO NOTHING`

	_, err = tx.Exec(createRoleQuery, roleID, "super_admin", "Super Administrator",
		"System super administrator with full access to all resources", true, time.Now(), time.Now())
	if err != nil {
		return err
	}

	// Ensure all essential permissions exist and assign them to super_admin
	essentialPermissions := []struct {
		name        string
		displayName string
		description string
		resource    string
		action      string
	}{
		{"campaigns:create", "Create Campaigns", "Permission to create new campaigns", "campaigns", "create"},
		{"campaigns:read", "Read Campaigns", "Permission to view campaigns", "campaigns", "read"},
		{"campaigns:update", "Update Campaigns", "Permission to modify campaigns", "campaigns", "update"},
		{"campaigns:delete", "Delete Campaigns", "Permission to delete campaigns", "campaigns", "delete"},
		{"campaigns:execute", "Execute Campaigns", "Permission to start/stop campaigns", "campaigns", "execute"},
		{"personas:create", "Create Personas", "Permission to create personas", "personas", "create"},
		{"personas:read", "Read Personas", "Permission to view personas", "personas", "read"},
		{"personas:update", "Update Personas", "Permission to modify personas", "personas", "update"},
		{"personas:delete", "Delete Personas", "Permission to delete personas", "personas", "delete"},
		{"proxies:create", "Create Proxies", "Permission to create proxies", "proxies", "create"},
		{"proxies:read", "Read Proxies", "Permission to view proxies", "proxies", "read"},
		{"proxies:update", "Update Proxies", "Permission to modify proxies", "proxies", "update"},
		{"proxies:delete", "Delete Proxies", "Permission to delete proxies", "proxies", "delete"},
		{"system:admin", "System Administration", "Full system administration access", "system", "admin"},
		{"system:config", "System Configuration", "Permission to modify system configuration", "system", "config"},
		{"system:users", "User Management", "Permission to manage users", "system", "users"},
		{"system:audit", "Audit Access", "Permission to view audit logs", "system", "audit"},
	}

	for _, perm := range essentialPermissions {
		// Create permission if it doesn't exist
		permID := uuid.New()
		permQuery := `
			INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (name) DO UPDATE SET
				display_name = EXCLUDED.display_name,
				description = EXCLUDED.description,
				resource = EXCLUDED.resource,
				action = EXCLUDED.action
			RETURNING id`

		err = tx.Get(&permID, permQuery, permID, perm.name, perm.displayName, perm.description, perm.resource, perm.action, time.Now())
		if err != nil {
			// If there was a conflict, get the existing permission ID
			getPermQuery := `SELECT id FROM auth.permissions WHERE name = $1`
			err = tx.Get(&permID, getPermQuery, perm.name)
			if err != nil {
				return fmt.Errorf("failed to get permission ID for %s: %w", perm.name, err)
			}
		}

		// Assign permission to super_admin role
		rolePermQuery := `
			INSERT INTO auth.role_permissions (role_id, permission_id)
			VALUES ($1, $2)
			ON CONFLICT (role_id, permission_id) DO NOTHING`

		_, err = tx.Exec(rolePermQuery, roleID, permID)
		if err != nil {
			return fmt.Errorf("failed to assign permission %s to super_admin role: %w", perm.name, err)
		}
	}

	return tx.Commit()
}

// AuditService provides audit logging functionality
type AuditService struct {
	db *sqlx.DB
}

// NewAuditService creates a new audit service
func NewAuditService(db *sqlx.DB) *AuditService {
	return &AuditService{db: db}
}

// LogAuthEvent logs an authentication event
func (s *AuditService) LogAuthEvent(userID *uuid.UUID, sessionID *string, eventType, status, ipAddress, userAgent string, details map[string]interface{}, riskScore int) error {
	var detailsJSON *string
	if details != nil {
		// Convert details to JSON string
		// In a real implementation, you'd use json.Marshal
		detailsStr := fmt.Sprintf("%v", details)
		detailsJSON = &detailsStr
	}

	query := `
		INSERT INTO auth.auth_audit_log (user_id, session_id, event_type, event_status, ip_address, user_agent, details, risk_score)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	_, err := s.db.Exec(query, userID, sessionID, eventType, status, ipAddress, userAgent, detailsJSON, riskScore)
	return err
}
