package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/logging"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
)

// Session service errors
var (
	ErrSessionSecurityViolation = fmt.Errorf("session security violation")
	ErrSessionLimitExceeded    = fmt.Errorf("session limit exceeded")
	ErrSessionNotFound         = fmt.Errorf("session not found")
	ErrSessionExpired          = fmt.Errorf("session expired")
)

// DefaultSessionConfig returns default session configuration
func DefaultSessionConfig() *config.SessionConfig {
	return &config.SessionConfig{
		Duration:           2 * time.Hour,
		IdleTimeout:        30 * time.Minute,
		CleanupInterval:    5 * time.Minute,
		MaxSessionsPerUser: 5,
		SessionIDLength:    128,
		RequireIPMatch:     false, // Disabled by default for flexibility
		RequireUAMatch:     false, // Disabled by default for flexibility
	}
}

// InMemorySessionStore provides fast in-memory session storage
type InMemorySessionStore struct {
	sessions     *sync.Map // sessionID -> *SessionData
	userSessions *sync.Map // userID -> []sessionID
	cleanup      *time.Ticker
	metrics      *SessionMetrics
	mutex        sync.RWMutex
}

// SessionData represents session information stored in memory
type SessionData struct {
	ID                     string
	UserID                 uuid.UUID
	IPAddress              string
	UserAgent              string
	Fingerprint            string
	BrowserFingerprint     string
	ScreenResolution       string
	CreatedAt              time.Time
	LastActivity           time.Time
	ExpiresAt              time.Time
	Permissions            []string
	Roles                  []string
	IsActive               bool
	RequiresPasswordChange bool
}

// SessionMetrics tracks session performance metrics
type SessionMetrics struct {
	TotalSessions    int64
	ActiveSessions   int64
	CacheHitRate     float64
	AvgLookupTime    time.Duration
	CleanupCount     int64
	SecurityEvents   int64
	mutex            sync.RWMutex
}

// SessionService provides comprehensive session management
type SessionService struct {
	db              *sqlx.DB
	inMemoryStore   *InMemorySessionStore
	config          *config.SessionConfig
	auditLogStore   store.AuditLogStore
	cleanupTicker   *time.Ticker
	mutex           sync.RWMutex
}

// NewSessionService creates a new session service
func NewSessionService(db *sqlx.DB, config *config.SessionConfig, auditLogStore store.AuditLogStore) (*SessionService, error) {
	if config == nil {
		config = DefaultSessionConfig()
	}

	// Initialize in-memory store
	inMemoryStore := &InMemorySessionStore{
		sessions:     &sync.Map{},
		userSessions: &sync.Map{},
		metrics:      &SessionMetrics{},
	}

	service := &SessionService{
		db:            db,
		inMemoryStore: inMemoryStore,
		config:        config,
		auditLogStore: auditLogStore,
	}

	// Start cleanup goroutine
	service.startCleanup()

	return service, nil
}

// CreateSession creates a new session with fingerprinting
func (s *SessionService) CreateSession(userID uuid.UUID, ipAddress, userAgent string) (*SessionData, error) {
	startTime := time.Now()
	requestID := uuid.New().String()

	// Log session creation start
	logging.LogSessionEvent(
		"session_creation_start",
		&userID,
		nil,
		ipAddress,
		userAgent,
		false,
		nil,
		map[string]interface{}{
			"request_id": requestID,
		},
	)

	// Generate secure session ID
	sessionID, err := s.generateSecureSessionID()
	if err != nil {
		return nil, fmt.Errorf("failed to generate session ID: %w", err)
	}
	fmt.Printf("DEBUG: Generated session ID: %s\n", sessionID)

	// Check concurrent session limits
	if err := s.enforceSessionLimits(userID); err != nil {
		return nil, err
	}

	// Load user permissions and roles
	permissions, roles, err := s.loadUserPermissions(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to load user permissions: %w", err)
	}

	// Create session data
	// Note: Fingerprint fields will be populated automatically by database trigger
	session := &SessionData{
		ID:           sessionID,
		UserID:       userID,
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
		CreatedAt:    time.Now(),
		LastActivity: time.Now(),
		ExpiresAt:    time.Now().Add(s.config.Duration),
		Permissions:  permissions,
		Roles:        roles,
		IsActive:     true,
	}

	// Store in database
	fmt.Printf("DEBUG: Persisting session to database: %s\n", session.ID)
	if err := s.persistSession(session); err != nil {
		return nil, fmt.Errorf("failed to persist session: %w", err)
	}
	fmt.Printf("DEBUG: Session successfully persisted to database\n")

	// Store in memory for fast access
	fmt.Printf("DEBUG: Storing session in memory: %s\n", session.ID)
	s.storeInMemory(session)
	fmt.Printf("DEBUG: Session successfully stored in memory\n")

	// Update metrics
	s.inMemoryStore.metrics.mutex.Lock()
	s.inMemoryStore.metrics.TotalSessions++
	s.inMemoryStore.metrics.ActiveSessions++
	s.inMemoryStore.metrics.mutex.Unlock()

	duration := time.Since(startTime)

	// Log successful session creation
	logging.LogSessionEvent(
		"session_created",
		&userID,
		&sessionID,
		ipAddress,
		userAgent,
		true,
		&session.ExpiresAt,
		map[string]interface{}{
			"session_duration":     s.config.Duration.String(),
			"creation_duration_ms": duration.Milliseconds(),
			"permissions_count":    len(permissions),
			"roles_count":          len(roles),
			"fingerprint":          session.Fingerprint,
		},
	)

	// Log audit event for session creation
	s.logAuditEvent(nil, sessionID, userID, "session_created", fmt.Sprintf("Session created for user %s", userID))

	return session, nil
}

// ValidateSession validates a session and returns session data
func (s *SessionService) ValidateSession(sessionID, clientIP string) (*SessionData, error) {
	startTime := time.Now()
	fmt.Printf("DEBUG: Validating session ID: %s for client IP: %s\n", sessionID, clientIP)
	
	// Try memory first for performance
	session, found := s.getFromMemory(sessionID)
	cacheHit := found
	fmt.Printf("DEBUG: Memory lookup result: found=%v\n", found)
	
	if !found {
		// Fallback to database
		fmt.Printf("DEBUG: Session not in memory, checking database\n")
		var err error
		session, err = s.loadFromDatabase(sessionID)
		if err != nil {
			fmt.Printf("DEBUG: Database lookup failed: %v\n", err)
			return nil, ErrSessionNotFound
		}
		fmt.Printf("DEBUG: Session found in database, caching in memory\n")
		// Cache in memory
		s.storeInMemory(session)
	}

	// Update cache hit rate metric
	s.updateCacheMetrics(cacheHit)

	// Validate session state
	if !session.IsActive {
		return nil, ErrSessionExpired
	}

	now := time.Now()
	
	// Check hard expiration
	if now.After(session.ExpiresAt) {
		s.invalidateSession(sessionID)
		return nil, ErrSessionExpired
	}

	// Check idle timeout
	if now.Sub(session.LastActivity) > s.config.IdleTimeout {
		s.invalidateSession(sessionID)
		s.logAuditEvent(nil, sessionID, session.UserID, "session_expired", "Session expired due to idle timeout")
		return nil, ErrSessionExpired
	}

	// Enhanced security checks
	if err := s.validateSessionSecurity(session, clientIP, ""); err != nil {
		s.logAuditEvent(nil, sessionID, session.UserID, "session_security_violation", fmt.Sprintf("Security violation: %s", err.Error()))
		s.invalidateSession(sessionID)
		return nil, err
	}

	// Update last activity
	session.LastActivity = now
	s.updateLastActivity(sessionID, now)

	duration := time.Since(startTime)

	// Log successful validation
	logging.LogSessionEvent(
		"session_validated",
		&session.UserID,
		&sessionID,
		clientIP,
		"",
		true,
		&session.ExpiresAt,
		map[string]interface{}{
			"validation_duration_ms": duration.Milliseconds(),
			"cache_hit":              cacheHit,
			"idle_time_mins":         now.Sub(session.LastActivity).Minutes(),
		},
	)

	return session, nil
}

// InvalidateSession invalidates a specific session
func (s *SessionService) InvalidateSession(sessionID string) error {
	s.removeFromMemory(sessionID)
	
	// Update metrics
	s.inMemoryStore.metrics.mutex.Lock()
	s.inMemoryStore.metrics.ActiveSessions--
	s.inMemoryStore.metrics.mutex.Unlock()
	
	return s.markInactiveInDatabase(sessionID)
}

// InvalidateAllUserSessions invalidates all sessions for a user
func (s *SessionService) InvalidateAllUserSessions(userID uuid.UUID) error {
	s.inMemoryStore.mutex.Lock()
	defer s.inMemoryStore.mutex.Unlock()

	// Get all user sessions from memory
	if sessionIDsInterface, exists := s.inMemoryStore.userSessions.Load(userID); exists {
		sessionIDs := sessionIDsInterface.([]string)
		
		// Remove from memory
		for _, sessionID := range sessionIDs {
			s.inMemoryStore.sessions.Delete(sessionID)
			
			// Update metrics
			s.inMemoryStore.metrics.mutex.Lock()
			s.inMemoryStore.metrics.ActiveSessions--
			s.inMemoryStore.metrics.mutex.Unlock()
		}
		s.inMemoryStore.userSessions.Delete(userID)
	}

	// Mark inactive in database
	query := `UPDATE auth.sessions SET is_active = false WHERE user_id = $1`
	_, err := s.db.Exec(query, userID)
	
	if err == nil {
		s.logAuditEvent(nil, "", userID, "all_sessions_invalidated", fmt.Sprintf("All sessions invalidated for user %s", userID))
	}
	
	return err
}

// ExtendSession extends a session's expiration time
func (s *SessionService) ExtendSession(sessionID string, newExpiry time.Time) error {
	// Update in memory
	if sessionInterface, exists := s.inMemoryStore.sessions.Load(sessionID); exists {
		session := sessionInterface.(*SessionData)
		session.ExpiresAt = newExpiry
		s.inMemoryStore.sessions.Store(sessionID, session)
	}

	// Update in database
	query := `UPDATE auth.sessions SET expires_at = $1 WHERE id = $2`
	_, err := s.db.Exec(query, newExpiry, sessionID)
	return err
}

// GetConfig returns the session configuration
func (s *SessionService) GetConfig() *config.SessionConfig {
	return s.config
}

// GetMetrics returns session metrics
func (s *SessionService) GetMetrics() *SessionMetrics {
	s.inMemoryStore.metrics.mutex.RLock()
	defer s.inMemoryStore.metrics.mutex.RUnlock()
	
	// Return a copy to avoid race conditions
	return &SessionMetrics{
		TotalSessions:  s.inMemoryStore.metrics.TotalSessions,
		ActiveSessions: s.inMemoryStore.metrics.ActiveSessions,
		CacheHitRate:   s.inMemoryStore.metrics.CacheHitRate,
		AvgLookupTime:  s.inMemoryStore.metrics.AvgLookupTime,
		CleanupCount:   s.inMemoryStore.metrics.CleanupCount,
		SecurityEvents: s.inMemoryStore.metrics.SecurityEvents,
	}
}

// Private methods

func (s *SessionService) generateSecureSessionID() (string, error) {
	bytes := make([]byte, s.config.SessionIDLength/2)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func (s *SessionService) generateFingerprint(ipAddress, userAgent string) string {
	data := fmt.Sprintf("%s:%s:%d", ipAddress, userAgent, time.Now().UnixNano())
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:16]) // First 16 bytes for fingerprint
}

func (s *SessionService) enforceSessionLimits(userID uuid.UUID) error {
	if sessionIDsInterface, exists := s.inMemoryStore.userSessions.Load(userID); exists {
		sessionIDs := sessionIDsInterface.([]string)
		
		if len(sessionIDs) >= s.config.MaxSessionsPerUser {
			// Remove oldest session
			oldestSessionID := sessionIDs[0]
			s.InvalidateSession(oldestSessionID)
			
			// Update user sessions list
			newSessionIDs := sessionIDs[1:]
			s.inMemoryStore.userSessions.Store(userID, newSessionIDs)
		}
	}
	return nil
}

func (s *SessionService) loadUserPermissions(userID uuid.UUID) ([]string, []string, error) {
	// Load roles
	rolesQuery := `
		SELECT r.name
		FROM auth.roles r
		JOIN auth.user_roles ur ON r.id = ur.role_id
		WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`

	var roleNames []string
	err := s.db.Select(&roleNames, rolesQuery, userID)
	if err != nil {
		return nil, nil, err
	}

	// Load permissions
	permissionsQuery := `
		SELECT DISTINCT p.name
		FROM auth.permissions p
		JOIN auth.role_permissions rp ON p.id = rp.permission_id
		JOIN auth.user_roles ur ON rp.role_id = ur.role_id
		WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`

	var permissionNames []string
	err = s.db.Select(&permissionNames, permissionsQuery, userID)
	if err != nil {
		return nil, nil, err
	}

	return permissionNames, roleNames, nil
}

func (s *SessionService) persistSession(session *SessionData) error {
	// Let the database trigger handle fingerprint generation automatically
	// Only insert the essential fields and let the database populate the fingerprint fields
	insertQuery := `
		INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, is_active, expires_at,
		                          last_activity_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`

	_, err := s.db.Exec(insertQuery, session.ID, session.UserID, session.IPAddress, session.UserAgent,
		session.IsActive, session.ExpiresAt, session.LastActivity, session.CreatedAt)
	
	if err != nil {
		return err
	}

	// Retrieve the fingerprint fields that were generated by the database trigger
	selectQuery := `
		SELECT session_fingerprint, browser_fingerprint, screen_resolution
		FROM auth.sessions
		WHERE id = $1`
	
	var fingerprint, browserFingerprint, screenResolution sql.NullString
	err = s.db.QueryRow(selectQuery, session.ID).Scan(&fingerprint, &browserFingerprint, &screenResolution)
	if err != nil {
		return fmt.Errorf("failed to retrieve generated session fingerprints: %w", err)
	}

	// Update the session object with the generated fingerprint data
	session.Fingerprint = fingerprint.String
	session.BrowserFingerprint = browserFingerprint.String
	session.ScreenResolution = screenResolution.String

	return nil
}

func (s *SessionService) storeInMemory(session *SessionData) {
	s.inMemoryStore.sessions.Store(session.ID, session)
	
	// Update user sessions mapping
	if sessionIDsInterface, exists := s.inMemoryStore.userSessions.Load(session.UserID); exists {
		sessionIDs := sessionIDsInterface.([]string)
		sessionIDs = append(sessionIDs, session.ID)
		s.inMemoryStore.userSessions.Store(session.UserID, sessionIDs)
	} else {
		s.inMemoryStore.userSessions.Store(session.UserID, []string{session.ID})
	}
}

func (s *SessionService) getFromMemory(sessionID string) (*SessionData, bool) {
	if sessionInterface, exists := s.inMemoryStore.sessions.Load(sessionID); exists {
		return sessionInterface.(*SessionData), true
	}
	return nil, false
}

func (s *SessionService) removeFromMemory(sessionID string) {
	if sessionInterface, exists := s.inMemoryStore.sessions.Load(sessionID); exists {
		session := sessionInterface.(*SessionData)
		
		// Remove from sessions map
		s.inMemoryStore.sessions.Delete(sessionID)
		
		// Remove from user sessions map
		if sessionIDsInterface, exists := s.inMemoryStore.userSessions.Load(session.UserID); exists {
			sessionIDs := sessionIDsInterface.([]string)
			newSessionIDs := make([]string, 0, len(sessionIDs))
			for _, id := range sessionIDs {
				if id != sessionID {
					newSessionIDs = append(newSessionIDs, id)
				}
			}
			if len(newSessionIDs) > 0 {
				s.inMemoryStore.userSessions.Store(session.UserID, newSessionIDs)
			} else {
				s.inMemoryStore.userSessions.Delete(session.UserID)
			}
		}
	}
}

func (s *SessionService) loadFromDatabase(sessionID string) (*SessionData, error) {
	query := `
		SELECT id, user_id, ip_address, user_agent, session_fingerprint, browser_fingerprint,
		       screen_resolution, is_active, expires_at, last_activity_at, created_at
		FROM auth.sessions
		WHERE id = $1`

	var session SessionData
	var ipAddress, userAgent, fingerprint, browserFingerprint, screenResolution sql.NullString
	
	err := s.db.QueryRow(query, sessionID).Scan(
		&session.ID, &session.UserID, &ipAddress, &userAgent, &fingerprint,
		&browserFingerprint, &screenResolution, &session.IsActive,
		&session.ExpiresAt, &session.LastActivity, &session.CreatedAt,
	)
	
	if err != nil {
		return nil, err
	}

	// Handle nullable fields - these are now populated by database trigger
	session.IPAddress = ipAddress.String
	session.UserAgent = userAgent.String
	session.Fingerprint = fingerprint.String
	session.BrowserFingerprint = browserFingerprint.String
	session.ScreenResolution = screenResolution.String

	// Load permissions and roles
	permissions, roles, err := s.loadUserPermissions(session.UserID)
	if err != nil {
		return nil, err
	}
	session.Permissions = permissions
	session.Roles = roles

	return &session, nil
}

func (s *SessionService) markInactiveInDatabase(sessionID string) error {
	query := `UPDATE auth.sessions SET is_active = false WHERE id = $1`
	_, err := s.db.Exec(query, sessionID)
	return err
}

func (s *SessionService) updateLastActivity(sessionID string, lastActivity time.Time) error {
	query := `UPDATE auth.sessions SET last_activity_at = $1 WHERE id = $2`
	_, err := s.db.Exec(query, lastActivity, sessionID)
	return err
}

func (s *SessionService) validateSessionSecurity(session *SessionData, clientIP, userAgent string) error {
	// IP validation (if enabled)
	if s.config.RequireIPMatch && session.IPAddress != clientIP {
		s.inMemoryStore.metrics.mutex.Lock()
		s.inMemoryStore.metrics.SecurityEvents++
		s.inMemoryStore.metrics.mutex.Unlock()
		
		return fmt.Errorf("IP address mismatch: expected %s, got %s", session.IPAddress, clientIP)
	}

	// User Agent validation (if enabled)
	if s.config.RequireUAMatch && userAgent != "" && session.UserAgent != userAgent {
		s.inMemoryStore.metrics.mutex.Lock()
		s.inMemoryStore.metrics.SecurityEvents++
		s.inMemoryStore.metrics.mutex.Unlock()
		
		return fmt.Errorf("user agent mismatch")
	}

	return nil
}

func (s *SessionService) updateCacheMetrics(cacheHit bool) {
	s.inMemoryStore.metrics.mutex.Lock()
	defer s.inMemoryStore.metrics.mutex.Unlock()
	
	// Simple moving average for cache hit rate
	if cacheHit {
		s.inMemoryStore.metrics.CacheHitRate = (s.inMemoryStore.metrics.CacheHitRate*0.9 + 1.0*0.1)
	} else {
		s.inMemoryStore.metrics.CacheHitRate = (s.inMemoryStore.metrics.CacheHitRate * 0.9)
	}
}

func (s *SessionService) startCleanup() {
	s.cleanupTicker = time.NewTicker(s.config.CleanupInterval)
	
	go func() {
		for range s.cleanupTicker.C {
			s.performCleanup()
		}
	}()
}

func (s *SessionService) performCleanup() {
	now := time.Now()
	expiredSessions := 0
	
	// Clean up expired sessions from memory
	s.inMemoryStore.sessions.Range(func(key, value interface{}) bool {
		session := value.(*SessionData)
		if now.After(session.ExpiresAt) || now.Sub(session.LastActivity) > s.config.IdleTimeout {
			s.inMemoryStore.sessions.Delete(key)
			expiredSessions++
		}
		return true
	})

	// Clean up expired sessions from database
	query := `UPDATE auth.sessions SET is_active = false 
	          WHERE is_active = true AND (expires_at < NOW() OR last_activity_at < NOW() - INTERVAL '%d minutes')`
	
	_, err := s.db.Exec(fmt.Sprintf(query, int(s.config.IdleTimeout.Minutes())))
	if err != nil {
		logging.LogDatabaseOperation(
			"session_cleanup",
			nil,
			false,
			0,
			&logging.DatabaseMetrics{
				QueryType: "UPDATE",
				TableName: "auth.sessions",
			},
			err,
		)
	}

	// Update cleanup metrics
	s.inMemoryStore.metrics.mutex.Lock()
	s.inMemoryStore.metrics.CleanupCount++
	s.inMemoryStore.metrics.ActiveSessions -= int64(expiredSessions)
	s.inMemoryStore.metrics.mutex.Unlock()

	if expiredSessions > 0 {
		logging.LogSessionEvent(
			"session_cleanup",
			nil,
			nil,
			"",
			"",
			true,
			nil,
			map[string]interface{}{
				"expired_sessions": expiredSessions,
				"cleanup_count":    s.inMemoryStore.metrics.CleanupCount,
			},
		)
	}
}

// logAuditEvent logs an audit event for session operations
func (s *SessionService) logAuditEvent(ctx context.Context, sessionID string, userID uuid.UUID, action, description string) {
	if s.auditLogStore == nil {
		return
	}

	detailsJSON := json.RawMessage(fmt.Sprintf(`{"session_id": "%s", "description": "%s"}`, sessionID, description))
	auditLog := &models.AuditLog{
		ID:         uuid.New(),
		Timestamp:  time.Now().UTC(),
		UserID:     uuid.NullUUID{UUID: userID, Valid: true},
		Action:     action,
		EntityType: sql.NullString{String: "session", Valid: true},
		EntityID:   uuid.NullUUID{UUID: userID, Valid: true}, // Use userID as entity for session events
		Details:    &detailsJSON,
	}

	if ctx == nil {
		ctx = context.Background()
	}

	if err := s.auditLogStore.CreateAuditLog(ctx, s.db, auditLog); err != nil {
		// Log error but don't fail the operation
		fmt.Printf("Failed to create audit log for session %s: %v\n", sessionID, err)
	}
}

// Stop stops the session service cleanup
func (s *SessionService) Stop() {
	if s.cleanupTicker != nil {
		s.cleanupTicker.Stop()
	}
}

// invalidateSession is a private helper that calls InvalidateSession
func (s *SessionService) invalidateSession(sessionID string) {
	s.InvalidateSession(sessionID)
}