package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"golang.org/x/crypto/bcrypt"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
)

// AuthHandler handles authentication-related HTTP requests
type AuthHandler struct {
	sessionService *services.SessionService
	config         *config.SessionSettings
	db             *sqlx.DB
}

// NewAuthHandler creates a new authentication handler
func NewAuthHandler(sessionService *services.SessionService, sessionConfig *config.SessionSettings, db *sqlx.DB) *AuthHandler {
	return &AuthHandler{
		sessionService: sessionService,
		config:         sessionConfig,
		db:             db,
	}
}

// Login handles user login requests
func (h *AuthHandler) Login(c *gin.Context) {
	fmt.Println("DEBUG: Login handler started")
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fmt.Printf("DEBUG: JSON binding failed: %v\n", err)
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request format")
		return
	}
	fmt.Printf("DEBUG: Request parsed successfully: %s\n", req.Email)

	// Get client information
	ipAddress := getClientIP(c)
	fmt.Printf("DEBUG: Client IP: %s\n", ipAddress)

	// Validate credentials and authenticate user
	fmt.Println("DEBUG: About to authenticate user")
	user, err := h.authenticateUser(req.Email, req.Password, ipAddress)
	if err != nil {
		fmt.Printf("DEBUG: Authentication failed: %v\n", err)
		// Handle authentication errors with appropriate responses
		switch err.Error() {
		case "user not found":
			respondWithErrorGin(c, http.StatusUnauthorized, "Invalid email or password")
		case "invalid password":
			respondWithErrorGin(c, http.StatusUnauthorized, "Invalid email or password")
		case "account locked":
			respondWithErrorGin(c, http.StatusLocked, "Account is temporarily locked due to multiple failed login attempts")
		case "account inactive":
			respondWithErrorGin(c, http.StatusForbidden, "Account is not active")
		default:
			respondWithErrorGin(c, http.StatusInternalServerError, "Authentication failed")
		}
		return
	}

	// Create proper session using session service
	fmt.Printf("DEBUG: Creating session using session service for user ID: %s\n", user.ID.String())
	sessionData, err := h.sessionService.CreateSession(user.ID, ipAddress, c.GetHeader("User-Agent"))
	if err != nil {
		fmt.Printf("DEBUG: Session creation failed: %v\n", err)
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to create session")
		return
	}
	fmt.Printf("DEBUG: Session created successfully with ID: %s\n", sessionData.ID)

	// Set session cookie
	fmt.Printf("DEBUG: Setting session cookie with name: %s, value: %s\n", h.config.CookieName, sessionData.ID)
	c.SetCookie(
		h.config.CookieName,
		sessionData.ID,
		int(sessionData.ExpiresAt.Sub(time.Now()).Seconds()),
		h.config.CookiePath,
		h.config.CookieDomain,
		h.config.CookieSecure,
		h.config.CookieHttpOnly,
	)
	fmt.Printf("DEBUG: Cookie set with domain: %s, path: %s, secure: %v, httpOnly: %v\n", 
		h.config.CookieDomain, h.config.CookiePath, h.config.CookieSecure, h.config.CookieHttpOnly)

	// Update last login information
	h.updateLastLogin(user.ID, ipAddress)

	// Create session data for response
	sessionResponse := map[string]interface{}{
		"user":      user.PublicUser(),
		"sessionId": sessionData.ID,
		"expiresAt": sessionData.ExpiresAt.Format(time.RFC3339),
	}

	// Return successful login response with correct field names
	respondWithJSONGin(c, http.StatusOK, sessionResponse)
}

// Logout handles user logout requests
func (h *AuthHandler) Logout(c *gin.Context) {
	// Get session ID from any of the possible cookie names
	sessionID, err := c.Cookie(h.config.CookieName)
	if err != nil {
		// Try legacy cookie name
		sessionID, err = c.Cookie(config.LegacySessionCookieName)
		if err != nil {
			// No active session - just clear cookies and return success
			h.clearSessionCookies(c)
			respondWithJSONGin(c, http.StatusOK, map[string]string{
				"message": "Logged out successfully",
			})
			return
		}
	}

	// Invalidate session using session service
	if err := h.sessionService.InvalidateSession(sessionID); err != nil {
		// Still clear cookies even if logout fails
		h.clearSessionCookies(c)
		respondWithJSONGin(c, http.StatusOK, map[string]string{"message": "Logged out successfully"})
		return
	}

	// Clear the session from database if it exists
	if sessionID != "" {
		err = h.sessionService.InvalidateSession(sessionID)
		if err != nil {
			// Log the error but don't fail the logout
			fmt.Printf("Failed to invalidate session %s: %v\n", sessionID, err)
		}
	}

	// Clear all session cookies
	h.clearSessionCookies(c)

	respondWithJSONGin(c, http.StatusOK, map[string]string{
		"message": "Logged out successfully",
	})
}

// Me returns current user information
func (h *AuthHandler) Me(c *gin.Context) {
	// Get security context from middleware
	securityContext, exists := c.Get("security_context")
	if !exists {
		respondWithErrorGin(c, http.StatusUnauthorized, "Authentication required")
		return
	}

	ctx := securityContext.(*models.SecurityContext)

	// Fetch full user data from database
	var user models.User
	query := `
		SELECT id, email, email_verified, password_hash, password_pepper_version,
		       first_name, last_name, avatar_url, is_active, is_locked,
		       failed_login_attempts, locked_until, last_login_at, last_login_ip,
		       password_changed_at, must_change_password, created_at, updated_at
		FROM auth.users
		WHERE id = $1`
	
	err := h.db.Get(&user, query, ctx.UserID)
	if err != nil {
		if err == sql.ErrNoRows {
			respondWithErrorGin(c, http.StatusNotFound, "User not found")
			return
		}
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to retrieve user information")
		return
	}

	// Get user roles and permissions using the same logic as sessionService
	// Load roles
	rolesQuery := `
		SELECT r.name
		FROM auth.roles r
		JOIN auth.user_roles ur ON r.id = ur.role_id
		WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`

	var roleNames []string
	err = h.db.Select(&roleNames, rolesQuery, ctx.UserID)
	if err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch user roles")
		return
	}

	// Load permissions
	permissionsQuery := `
		SELECT DISTINCT p.name
		FROM auth.permissions p
		JOIN auth.role_permissions rp ON p.id = rp.permission_id
		JOIN auth.user_roles ur ON rp.role_id = ur.role_id
		WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`

	var permissionNames []string
	err = h.db.Select(&permissionNames, permissionsQuery, ctx.UserID)
	if err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch user permissions")
		return
	}

	// Convert to Role and Permission structs (similar to how login handler works)
	var roles []models.Role
	for _, roleName := range roleNames {
		roles = append(roles, models.Role{Name: roleName})
	}

	var permissions []models.Permission
	for _, permName := range permissionNames {
		permissions = append(permissions, models.Permission{Name: permName})
	}

	// Set roles and permissions on user object
	user.Roles = roles
	user.Permissions = permissions

	// Return full user information (same format as login)
	respondWithJSONGin(c, http.StatusOK, user.PublicUser())
}

// ChangePassword handles password change requests
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request format")
		return
	}

	// TODO: Implement password change functionality
	respondWithErrorGin(c, http.StatusNotImplemented, "Password change functionality not yet implemented in session-based system")
}


// RefreshSession refreshes the current session
func (h *AuthHandler) RefreshSession(c *gin.Context) {
	// Get session ID from cookie
	sessionID, err := c.Cookie(h.config.CookieName)
	if err != nil {
		// Try legacy cookie name
		sessionID, err = c.Cookie(config.LegacySessionCookieName)
		if err != nil {
			respondWithErrorGin(c, http.StatusUnauthorized, "No active session")
			return
		}
	}

	// Get client IP
	ipAddress := getClientIP(c)

	// Validate session using session service
	_, err = h.sessionService.ValidateSession(sessionID, ipAddress)
	if err != nil {
		// Clear invalid session cookies
		h.clearSessionCookies(c)

		switch err {
		case services.ErrSessionExpired, services.ErrSessionNotFound:
			respondWithErrorGin(c, http.StatusUnauthorized, "Session expired")
		default:
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to refresh session")
		}
		return
	}

	// Extend session if needed
	newExpiry := time.Now().Add(h.sessionService.GetConfig().Duration)
	if err := h.sessionService.ExtendSession(sessionID, newExpiry); err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to extend session")
		return
	}

	// Update cookie with new expiry
	c.SetCookie(
		h.config.CookieName,
		sessionID,
		int(newExpiry.Sub(time.Now()).Seconds()),
		h.config.CookiePath,
		h.config.CookieDomain,
		h.config.CookieSecure,
		h.config.CookieHttpOnly,
	)

	respondWithJSONGin(c, http.StatusOK, map[string]string{
		"expiresAt": newExpiry.Format(time.RFC3339),
	})
}

// Authentication helper methods

// authenticateUser validates user credentials and returns user information
func (h *AuthHandler) authenticateUser(email, password, ipAddress string) (*models.User, error) {
	var user models.User
	
	// Query user by email (only fields that exist in the actual schema)
	query := `
		SELECT id, email, email_verified, password_hash, password_pepper_version,
		       first_name, last_name, avatar_url, is_active, is_locked,
		       failed_login_attempts, locked_until, last_login_at, last_login_ip,
		       password_changed_at, must_change_password, created_at, updated_at
		FROM auth.users
		WHERE email = $1`
	
	err := h.db.Get(&user, query, email)
	if err != nil {
		if err == sql.ErrNoRows {
			// Increment failed attempts for this IP to prevent enumeration
			h.recordFailedLogin("", ipAddress, "user not found")
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("database error: %w", err)
	}

	// Check if account is locked
	if user.IsLocked && user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
		h.recordFailedLogin(user.ID.String(), ipAddress, "account locked")
		return nil, fmt.Errorf("account locked")
	}

	// Check if account is active
	if !user.IsActive {
		h.recordFailedLogin(user.ID.String(), ipAddress, "account inactive")
		return nil, fmt.Errorf("account inactive")
	}

	// Verify password using pgcrypto
	var passwordValid bool
	passwordQuery := `SELECT crypt($1, $2) = $2 AS password_valid`
	err = h.db.Get(&passwordValid, passwordQuery, password, user.PasswordHash)
	if err != nil {
		return nil, fmt.Errorf("password verification error: %w", err)
	}

	if !passwordValid {
		// Increment failed login attempts
		h.incrementFailedAttempts(user.ID, ipAddress)
		return nil, fmt.Errorf("invalid password")
	}

	// Reset failed login attempts on successful authentication
	h.resetFailedAttempts(user.ID)

	// Check if account was temporarily locked and should be unlocked
	if user.IsLocked && user.LockedUntil != nil && time.Now().After(*user.LockedUntil) {
		h.unlockAccount(user.ID)
		user.IsLocked = false
	}

	return &user, nil
}

// incrementFailedAttempts increments failed login attempts and locks account if threshold reached
func (h *AuthHandler) incrementFailedAttempts(userID uuid.UUID, ipAddress string) {
	const maxFailedAttempts = 5
	const lockoutDuration = 30 * time.Minute

	query := `
		UPDATE auth.users
		SET failed_login_attempts = failed_login_attempts + 1,
		    is_locked = CASE
		        WHEN failed_login_attempts + 1 >= $2 THEN true
		        ELSE is_locked
		    END,
		    locked_until = CASE
		        WHEN failed_login_attempts + 1 >= $2 THEN NOW() + INTERVAL '%d minutes'
		        ELSE locked_until
		    END,
		    updated_at = NOW()
		WHERE id = $1`

	_, err := h.db.Exec(fmt.Sprintf(query, int(lockoutDuration.Minutes())), userID, maxFailedAttempts)
	if err != nil {
		// Log error but don't fail the authentication flow
		fmt.Printf("Failed to increment failed attempts for user %s: %v\n", userID, err)
	}

	h.recordFailedLogin(userID.String(), ipAddress, "invalid password")
}

// resetFailedAttempts resets failed login attempts on successful authentication
func (h *AuthHandler) resetFailedAttempts(userID uuid.UUID) {
	query := `
		UPDATE auth.users
		SET failed_login_attempts = 0,
		    updated_at = NOW()
		WHERE id = $1`

	_, err := h.db.Exec(query, userID)
	if err != nil {
		fmt.Printf("Failed to reset failed attempts for user %s: %v\n", userID, err)
	}
}

// unlockAccount unlocks a temporarily locked account
func (h *AuthHandler) unlockAccount(userID uuid.UUID) {
	query := `
		UPDATE auth.users
		SET is_locked = false,
		    locked_until = NULL,
		    failed_login_attempts = 0,
		    updated_at = NOW()
		WHERE id = $1`

	_, err := h.db.Exec(query, userID)
	if err != nil {
		fmt.Printf("Failed to unlock account for user %s: %v\n", userID, err)
	}
}

// updateLastLogin updates the user's last login information
func (h *AuthHandler) updateLastLogin(userID uuid.UUID, ipAddress string) {
	query := `
		UPDATE auth.users
		SET last_login_at = NOW(),
		    last_login_ip = $2,
		    updated_at = NOW()
		WHERE id = $1`

	_, err := h.db.Exec(query, userID, ipAddress)
	if err != nil {
		fmt.Printf("Failed to update last login for user %s: %v\n", userID, err)
	}

	// Record successful login in audit log
	h.recordSuccessfulLogin(userID.String(), ipAddress)
}

// recordFailedLogin records a failed login attempt in the audit log
func (h *AuthHandler) recordFailedLogin(userID, ipAddress, reason string) {
	var userUUID *uuid.UUID
	if userID != "" {
		if parsed, err := uuid.Parse(userID); err == nil {
			userUUID = &parsed
		}
	}

	query := `
		INSERT INTO auth.auth_audit_log
		(user_id, event_type, event_status, ip_address, details, risk_score, created_at)
		VALUES ($1, 'login', 'failure', $2, $3, 3, NOW())`

	details := fmt.Sprintf(`{"reason": "%s", "timestamp": "%s"}`, reason, time.Now().Format(time.RFC3339))
	_, err := h.db.Exec(query, userUUID, ipAddress, details)
	if err != nil {
		fmt.Printf("Failed to record failed login: %v\n", err)
	}
}

// recordSuccessfulLogin records a successful login in the audit log
func (h *AuthHandler) recordSuccessfulLogin(userID, ipAddress string) {
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		fmt.Printf("Invalid user ID for audit log: %s\n", userID)
		return
	}

	query := `
		INSERT INTO auth.auth_audit_log
		(user_id, event_type, event_status, ip_address, details, risk_score, created_at)
		VALUES ($1, 'login', 'success', $2, $3, 1, NOW())`

	details := fmt.Sprintf(`{"timestamp": "%s"}`, time.Now().Format(time.RFC3339))
	_, err = h.db.Exec(query, userUUID, ipAddress, details)
	if err != nil {
		fmt.Printf("Failed to record successful login: %v\n", err)
	}
}

// GetPermissions returns all available permission strings in the system
func (h *AuthHandler) GetPermissions(c *gin.Context) {
	// Define all permission strings used throughout the application
	// This should be the single source of truth for permission strings
	permissions := []string{
		// Persona permissions
		"personas:create",
		"personas:read", 
		"personas:update",
		"personas:delete",
		
		// Proxy permissions
		"proxies:create",
		"proxies:read",
		"proxies:update", 
		"proxies:delete",
		
		// Campaign permissions
		"campaigns:create",
		"campaigns:read",
		"campaigns:update",
		"campaigns:delete",
		"campaigns:execute",
		
		// System configuration permissions
		"system:config",
		
		// Admin permissions
		"admin:users",
		"admin:roles",
		"admin:system",
	}
	
	respondWithJSONGin(c, http.StatusOK, map[string][]string{
		"permissions": permissions,
	})
}

// Admin User Management Endpoints

// ListUsers handles GET /api/v2/admin/users
func (h *AuthHandler) ListUsers(c *gin.Context) {
	// Get pagination parameters
	page := 1
	limit := 10
	
	if pageStr := c.Query("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}
	
	if limitStr := c.Query("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}
	
	offset := (page - 1) * limit
	
	// Get users from database
	query := `
		SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.is_locked, 
		       u.created_at, u.updated_at, u.last_login_at, u.failed_login_attempts, u.mfa_enabled
		FROM auth.users u
		ORDER BY u.created_at DESC
		LIMIT $1 OFFSET $2`
	
	rows, err := h.db.Query(query, limit, offset)
	if err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch users")
		return
	}
	defer rows.Close()
	
	var users []models.User
	for rows.Next() {
		var user models.User
		var lastLoginAt sql.NullTime
		
		err := rows.Scan(
			&user.ID, &user.Email, &user.FirstName, &user.LastName, 
			&user.IsActive, &user.IsLocked, &user.CreatedAt, &user.UpdatedAt,
			&lastLoginAt, &user.FailedLoginAttempts, &user.MFAEnabled,
		)
		if err != nil {
			respondWithErrorGin(c, http.StatusInternalServerError, "Failed to scan user data")
			return
		}
		
		if lastLoginAt.Valid {
			user.LastLoginAt = &lastLoginAt.Time
		}
		
		users = append(users, user)
	}
	
	// Get total count
	var totalCount int
	err = h.db.Get(&totalCount, "SELECT COUNT(*) FROM auth.users")
	if err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to get user count")
		return
	}
	
	response := map[string]interface{}{
		"users": users,
		"pagination": map[string]interface{}{
			"page":       page,
			"limit":      limit,
			"total":      totalCount,
			"totalPages": (totalCount + limit - 1) / limit,
		},
	}
	
	respondWithJSONGin(c, http.StatusOK, response)
}

// CreateUser handles POST /api/v2/admin/users
func (h *AuthHandler) CreateUser(c *gin.Context) {
	var req models.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request format")
		return
	}
	
	// Hash the password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to hash password")
		return
	}
	
	// Create user in database
	userID := uuid.New()
	query := `
		INSERT INTO auth.users (id, email, first_name, last_name, password_hash, is_active, mfa_enabled)
		VALUES ($1, $2, $3, $4, $5, true, false)
		RETURNING created_at, updated_at`
	
	var createdAt, updatedAt time.Time
	err = h.db.QueryRow(query, userID, req.Email, req.FirstName, req.LastName, string(hashedPassword)).
		Scan(&createdAt, &updatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			respondWithErrorGin(c, http.StatusConflict, "User with this email already exists")
			return
		}
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to create user")
		return
	}
	
	// Return created user
	user := models.User{
		ID:        userID,
		Email:     req.Email,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		IsActive:  true,
		IsLocked:  false,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
		MFAEnabled: false,
	}
	
	respondWithJSONGin(c, http.StatusCreated, user)
}

// GetUser handles GET /api/v2/admin/users/:userId
func (h *AuthHandler) GetUser(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid user ID")
		return
	}
	
	// Get user from database
	query := `
		SELECT u.id, u.email, u.first_name, u.last_name, u.is_active, u.is_locked,
		       u.created_at, u.updated_at, u.last_login_at, u.failed_login_attempts, u.mfa_enabled
		FROM auth.users u
		WHERE u.id = $1`
	
	var user models.User
	var lastLoginAt sql.NullTime
	
	err = h.db.QueryRow(query, userID).Scan(
		&user.ID, &user.Email, &user.FirstName, &user.LastName,
		&user.IsActive, &user.IsLocked, &user.CreatedAt, &user.UpdatedAt,
		&lastLoginAt, &user.FailedLoginAttempts, &user.MFAEnabled,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			respondWithErrorGin(c, http.StatusNotFound, "User not found")
			return
		}
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to fetch user")
		return
	}
	
	if lastLoginAt.Valid {
		user.LastLoginAt = &lastLoginAt.Time
	}
	
	respondWithJSONGin(c, http.StatusOK, user)
}

// UpdateUser handles PUT /api/v2/admin/users/:userId
func (h *AuthHandler) UpdateUser(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid user ID")
		return
	}
	
	var req models.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid request format")
		return
	}
	
	// Build dynamic update query
	setParts := []string{}
	args := []interface{}{}
	argIndex := 1
	
	if req.FirstName != "" {
		setParts = append(setParts, fmt.Sprintf("first_name = $%d", argIndex))
		args = append(args, req.FirstName)
		argIndex++
	}
	
	if req.LastName != "" {
		setParts = append(setParts, fmt.Sprintf("last_name = $%d", argIndex))
		args = append(args, req.LastName)
		argIndex++
	}
	
	if req.IsActive != nil {
		setParts = append(setParts, fmt.Sprintf("is_active = $%d", argIndex))
		args = append(args, *req.IsActive)
		argIndex++
	}
	
	if len(setParts) == 0 {
		respondWithErrorGin(c, http.StatusBadRequest, "No fields to update")
		return
	}
	
	// Add updated_at
	setParts = append(setParts, fmt.Sprintf("updated_at = $%d", argIndex))
	args = append(args, time.Now())
	argIndex++
	
	// Add user ID for WHERE clause
	args = append(args, userID)
	
	query := fmt.Sprintf(`
		UPDATE auth.users 
		SET %s
		WHERE id = $%d
		RETURNING id, email, first_name, last_name, is_active, is_locked,
		          created_at, updated_at, last_login_at, failed_login_attempts, mfa_enabled`,
		strings.Join(setParts, ", "), argIndex)
	
	var user models.User
	var lastLoginAt sql.NullTime
	
	err = h.db.QueryRow(query, args...).Scan(
		&user.ID, &user.Email, &user.FirstName, &user.LastName,
		&user.IsActive, &user.IsLocked, &user.CreatedAt, &user.UpdatedAt,
		&lastLoginAt, &user.FailedLoginAttempts, &user.MFAEnabled,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			respondWithErrorGin(c, http.StatusNotFound, "User not found")
			return
		}
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to update user")
		return
	}
	
	if lastLoginAt.Valid {
		user.LastLoginAt = &lastLoginAt.Time
	}
	
	respondWithJSONGin(c, http.StatusOK, user)
}

// DeleteUser handles DELETE /api/v2/admin/users/:userId
func (h *AuthHandler) DeleteUser(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		respondWithErrorGin(c, http.StatusBadRequest, "Invalid user ID")
		return
	}
	
	// Check if user exists first
	var exists bool
	err = h.db.Get(&exists, "SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = $1)", userID)
	if err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to check user existence")
		return
	}
	
	if !exists {
		respondWithErrorGin(c, http.StatusNotFound, "User not found")
		return
	}
	
	// Delete user
	_, err = h.db.Exec("DELETE FROM auth.users WHERE id = $1", userID)
	if err != nil {
		respondWithErrorGin(c, http.StatusInternalServerError, "Failed to delete user")
		return
	}
	
	respondWithJSONGin(c, http.StatusOK, map[string]string{"message": "User deleted successfully"})
}

// Helper functions

func getClientIP(c *gin.Context) string {
	// Check for forwarded IP first
	forwarded := c.GetHeader("X-Forwarded-For")
	if forwarded != "" {
		// Take the first IP if multiple are present
		ips := strings.Split(forwarded, ",")
		return strings.TrimSpace(ips[0])
	}

	// Check for real IP header
	realIP := c.GetHeader("X-Real-IP")
	if realIP != "" {
		return realIP
	}

	// Fall back to remote address
	return c.ClientIP()
}

func (h *AuthHandler) clearSessionCookies(c *gin.Context) {
	// Clear new session cookie
	c.SetCookie(
		h.config.CookieName,
		"",
		-1,
		h.config.CookiePath,
		h.config.CookieDomain,
		h.config.CookieSecure,
		h.config.CookieHttpOnly,
	)

	// Clear legacy cookies for backward compatibility
	c.SetCookie("session_token", "", -1, "/", "", h.config.CookieSecure, true)
	c.SetCookie("auth_tokens", "", -1, "/", "", h.config.CookieSecure, false)
}
