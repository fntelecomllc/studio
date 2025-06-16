package middleware

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/logging"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
)

// AuthMiddleware provides authentication middleware
type AuthMiddleware struct {
	sessionService *services.SessionService
	config         *config.SessionSettings
}

// NewAuthMiddleware creates a new authentication middleware
func NewAuthMiddleware(sessionService *services.SessionService, sessionConfig *config.SessionSettings) *AuthMiddleware {
	return &AuthMiddleware{
		sessionService: sessionService,
		config:         sessionConfig,
	}
}

// SessionAuth validates session-based authentication
func (m *AuthMiddleware) SessionAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		startTime := time.Now()
		requestID := uuid.New().String()
		ipAddress := getClientIP(c)
		userAgent := c.GetHeader("User-Agent")

		// Log middleware execution start
		logging.LogMiddlewareExecution(
			"session_auth",
			nil,
			nil,
			ipAddress,
			userAgent,
			requestID,
			0,
			true,
			0,
			map[string]interface{}{
				"method": c.Request.Method,
				"path":   c.Request.URL.Path,
				"stage":  "start",
			},
		)

		// Skip OPTIONS requests
		if c.Request.Method == http.MethodOptions {
			duration := time.Since(startTime)
			logging.LogMiddlewareExecution(
				"session_auth",
				nil,
				nil,
				ipAddress,
				userAgent,
				requestID,
				duration,
				true,
				http.StatusOK,
				map[string]interface{}{
					"method": c.Request.Method,
					"path":   c.Request.URL.Path,
					"stage":  "options_skip",
				},
			)
			c.Next()
			return
		}

		// Enhanced session-based CSRF protection through origin validation
		if !m.validateRequestOrigin(c) {
			duration := time.Since(startTime)
			
			logging.LogMiddlewareExecution(
				"session_auth",
				nil,
				nil,
				ipAddress,
				userAgent,
				requestID,
				duration,
				false,
				http.StatusForbidden,
				map[string]interface{}{
					"method": c.Request.Method,
					"path":   c.Request.URL.Path,
					"stage":  "origin_validation_failed",
					"origin": c.GetHeader("Origin"),
					"referer": c.GetHeader("Referer"),
				},
			)

			logging.LogSecurityEvent(
				"session_auth_invalid_origin",
				nil,
				nil,
				ipAddress,
				userAgent,
				&logging.SecurityMetrics{
					RiskScore:          7,
					ThreatLevel:        "high",
					FailedAttempts:     0,
					AccountLocked:      false,
					SuspiciousActivity: true,
				},
				map[string]interface{}{
					"path":    c.Request.URL.Path,
					"method":  c.Request.Method,
					"origin":  c.GetHeader("Origin"),
					"referer": c.GetHeader("Referer"),
				},
			)

			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Invalid request origin",
				"code":  "INVALID_ORIGIN",
			})
			return
		}

		// Get session ID from cookie (try new names first, then fallback to legacy)
		cookieStart := time.Now()
		sessionID, err := c.Cookie(m.config.CookieName)
		if err != nil {
			// Try legacy cookie name for backward compatibility
			sessionID, err = c.Cookie(config.LegacySessionCookieName)
		}
		cookieDuration := time.Since(cookieStart)

		if err != nil {
			duration := time.Since(startTime)

			// Log missing session cookie
			logging.LogMiddlewareExecution(
				"session_auth",
				nil,
				nil,
				ipAddress,
				userAgent,
				requestID,
				duration,
				false,
				http.StatusUnauthorized,
				map[string]interface{}{
					"method":                   c.Request.Method,
					"path":                     c.Request.URL.Path,
					"stage":                    "cookie_missing",
					"error":                    err.Error(),
					"cookie_check_duration_ms": cookieDuration.Milliseconds(),
				},
			)

			// Log security event for missing session
			logging.LogSecurityEvent(
				"session_auth_no_cookie",
				nil,
				nil,
				ipAddress,
				userAgent,
				&logging.SecurityMetrics{
					RiskScore:          3,
					ThreatLevel:        "low",
					FailedAttempts:     0,
					AccountLocked:      false,
					SuspiciousActivity: false,
				},
				map[string]interface{}{
					"path":   c.Request.URL.Path,
					"method": c.Request.Method,
				},
			)

			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
				"code":  "AUTH_REQUIRED",
			})
			return
		}

		// Log session cookie found
		logging.LogSessionEvent(
			"session_cookie_found",
			nil,
			&sessionID,
			ipAddress,
			userAgent,
			true,
			nil,
			map[string]interface{}{
				"cookie_check_duration_ms": cookieDuration.Milliseconds(),
				"session_id_length":        len(sessionID),
			},
		)

		// Validate session using the session service
		validationStart := time.Now()
		sessionData, err := m.sessionService.ValidateSession(sessionID, ipAddress)
		validationDuration := time.Since(validationStart)
		
		// Create security context from session data
		var securityContext *models.SecurityContext
		if sessionData != nil {
			securityContext = &models.SecurityContext{
				UserID:                 sessionData.UserID,
				SessionID:              sessionData.ID,
				Permissions:            sessionData.Permissions,
				Roles:                  sessionData.Roles,
				SessionExpiry:          sessionData.ExpiresAt,
				RequiresPasswordChange: sessionData.RequiresPasswordChange,
				RiskScore:              0, // Default risk score
			}
		}

		if err != nil {
			duration := time.Since(startTime)

			// Clear invalid session cookies (session-based approach)
			m.clearSessionCookies(c)

			// Log session validation failure
			logging.LogSessionEvent(
				"session_validation_failed",
				nil,
				&sessionID,
				ipAddress,
				userAgent,
				false,
				nil,
				map[string]interface{}{
					"validation_duration_ms": validationDuration.Milliseconds(),
					"error":                  err.Error(),
				},
			)

			// Determine error type and risk score
			var statusCode int
			var errorMsg string
			var riskScore int
			var threatLevel string

			switch err {
			case services.ErrSessionExpired, services.ErrSessionNotFound:
				statusCode = http.StatusUnauthorized
				errorMsg = "Session expired"
				riskScore = 2
				threatLevel = "low"
			case services.ErrSessionSecurityViolation:
				statusCode = http.StatusForbidden
				errorMsg = "Security violation detected"
				riskScore = 6
				threatLevel = "medium"
			default:
				statusCode = http.StatusInternalServerError
				errorMsg = "Authentication failed"
				riskScore = 5
				threatLevel = "medium"
			}

			// Log security event
			logging.LogSecurityEvent(
				"session_auth_failed",
				nil,
				&sessionID,
				ipAddress,
				userAgent,
				&logging.SecurityMetrics{
					RiskScore:          riskScore,
					ThreatLevel:        threatLevel,
					FailedAttempts:     0,
					AccountLocked:      false,
					SuspiciousActivity: riskScore > 5,
				},
				map[string]interface{}{
					"error_type":             err.Error(),
					"validation_duration_ms": validationDuration.Milliseconds(),
					"path":                   c.Request.URL.Path,
					"method":                 c.Request.Method,
				},
			)

			// Log middleware execution failure
			logging.LogMiddlewareExecution(
				"session_auth",
				nil,
				&sessionID,
				ipAddress,
				userAgent,
				requestID,
				duration,
				false,
				statusCode,
				map[string]interface{}{
					"method":                 c.Request.Method,
					"path":                   c.Request.URL.Path,
					"stage":                  "validation_failed",
					"error":                  err.Error(),
					"validation_duration_ms": validationDuration.Milliseconds(),
				},
			)

			c.AbortWithStatusJSON(statusCode, gin.H{
				"error": errorMsg,
				"code":  m.getErrorCode(err),
			})
			return
		}

		// Log successful session validation
		logging.LogSessionEvent(
			"session_validation_success",
			&securityContext.UserID,
			&sessionID,
			ipAddress,
			userAgent,
			true,
			&securityContext.SessionExpiry,
			map[string]interface{}{
				"validation_duration_ms":   validationDuration.Milliseconds(),
				"user_permissions_count":   len(securityContext.Permissions),
				"user_roles_count":         len(securityContext.Roles),
				"requires_password_change": securityContext.RequiresPasswordChange,
				"risk_score":               securityContext.RiskScore,
			},
		)

		// Store security context for use in handlers
		c.Set("security_context", securityContext)
		c.Set("user_id", securityContext.UserID)
		c.Set("session_id", securityContext.SessionID)
		c.Set("request_id", requestID)

		// Log successful middleware execution
		duration := time.Since(startTime)
		logging.LogMiddlewareExecution(
			"session_auth",
			&securityContext.UserID,
			&sessionID,
			ipAddress,
			userAgent,
			requestID,
			duration,
			true,
			http.StatusOK,
			map[string]interface{}{
				"method":                   c.Request.Method,
				"path":                     c.Request.URL.Path,
				"stage":                    "success",
				"cookie_check_duration_ms": cookieDuration.Milliseconds(),
				"validation_duration_ms":   validationDuration.Milliseconds(),
				"user_permissions_count":   len(securityContext.Permissions),
				"user_roles_count":         len(securityContext.Roles),
				"requires_password_change": securityContext.RequiresPasswordChange,
			},
		)

		c.Next()
	}
}

// DualAuth supports both API key and session authentication
func (m *AuthMiddleware) DualAuth(apiKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip OPTIONS requests
		if c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}

		// Check for API key first
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				if parts[1] == apiKey {
					// Valid API key - set a basic context
					c.Set("auth_type", "api_key")
					c.Next()
					return
				} else {
					c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
						"error": "Invalid API key",
					})
					return
				}
			}
		}

		// Fall back to session authentication
		sessionID, err := c.Cookie(m.config.CookieName)
		if err != nil {
			// Try legacy cookie name
			sessionID, err = c.Cookie(config.LegacySessionCookieName)
			if err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "Authentication required",
					"code":  "AUTH_REQUIRED",
				})
				return
			}
		}

		// Get client IP
		ipAddress := getClientIP(c)

		// Validate session
		sessionData, err := m.sessionService.ValidateSession(sessionID, ipAddress)
		if err != nil {
			// Clear invalid session cookies
			m.clearSessionCookies(c)

			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication failed",
				"code":  m.getErrorCode(err),
			})
			return
		}

		// Create security context from session data
		securityContext := &models.SecurityContext{
			UserID:                 sessionData.UserID,
			SessionID:              sessionData.ID,
			Permissions:            sessionData.Permissions,
			Roles:                  sessionData.Roles,
			SessionExpiry:          sessionData.ExpiresAt,
			RequiresPasswordChange: sessionData.RequiresPasswordChange,
			RiskScore:              0, // Default risk score
		}

		// Store security context for use in handlers
		c.Set("auth_type", "session")
		c.Set("security_context", securityContext)
		c.Set("user_id", securityContext.UserID)
		c.Set("session_id", securityContext.SessionID)

		c.Next()
	}
}

// RequirePermission checks if the user has a specific permission
func (m *AuthMiddleware) RequirePermission(permission string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get security context
		securityContext, exists := c.Get("security_context")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}

		ctx := securityContext.(*models.SecurityContext)

		// Check permission
		if !ctx.HasPermission(permission) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Insufficient permissions",
			})
			return
		}

		c.Next()
	}
}

// RequireRole checks if the user has a specific role
func (m *AuthMiddleware) RequireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get security context
		securityContext, exists := c.Get("security_context")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}

		ctx := securityContext.(*models.SecurityContext)

		// Check role
		if !ctx.HasRole(role) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Insufficient privileges",
			})
			return
		}

		c.Next()
	}
}

// RequireAnyRole checks if the user has any of the specified roles
func (m *AuthMiddleware) RequireAnyRole(roles []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get security context
		securityContext, exists := c.Get("security_context")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}

		ctx := securityContext.(*models.SecurityContext)

		// Check roles
		if !ctx.HasAnyRole(roles) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Insufficient privileges",
			})
			return
		}

		c.Next()
	}
}

// RequireResourceAccess checks if the user can access a resource with a specific action
func (m *AuthMiddleware) RequireResourceAccess(resource, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get security context
		securityContext, exists := c.Get("security_context")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}

		ctx := securityContext.(*models.SecurityContext)

		// Check resource access
		if !ctx.CanAccess(resource, action) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Access denied",
			})
			return
		}

		c.Next()
	}
}

// validateRequestOrigin checks if the request origin is allowed for session-based CSRF protection
func (m *AuthMiddleware) validateRequestOrigin(c *gin.Context) bool {
	origin := c.GetHeader("Origin")
	referer := c.GetHeader("Referer")
	host := c.Request.Host

	// Check if origin validation is required
	if !m.config.RequireOriginValidation {
		return true
	}

	// Build allowed origins list
	allowedOrigins := m.config.AllowedOrigins
	if len(allowedOrigins) == 0 {
		// Default allowed origins based on host
		allowedOrigins = []string{
			fmt.Sprintf("https://%s", host),
			fmt.Sprintf("http://%s", host), // Development only
		}
	}

	// Check origin header
	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}

	// Check referer header as fallback
	for _, allowed := range allowedOrigins {
		if strings.HasPrefix(referer, allowed) {
			return true
		}
	}

	// For API requests, require custom header as additional session-based CSRF protection
	if m.config.RequireCustomHeader {
		headerValue := c.GetHeader(m.config.CustomHeaderName)
		if !m.config.ValidateCustomHeader(headerValue) {
			return false
		}
		return true // Custom header validated successfully
	}

	return false
}

// clearSessionCookies clears all session-related cookies
func (m *AuthMiddleware) clearSessionCookies(c *gin.Context) {
	// Clear new session cookie
	c.SetCookie(
		m.config.CookieName,
		"",
		-1,
		m.config.CookiePath,
		m.config.CookieDomain,
		m.config.CookieSecure,
		m.config.CookieHttpOnly,
	)

	// Clear legacy cookies for backward compatibility
	c.SetCookie(config.LegacySessionCookieName, "", -1, config.CookiePath, "", config.CookieSecure, config.CookieHttpOnly)
	c.SetCookie(config.AuthTokensCookieName, "", -1, config.CookiePath, "", config.CookieSecure, false)
}

// getErrorCode returns appropriate error code based on the error type
func (m *AuthMiddleware) getErrorCode(err error) string {
	switch err {
	case services.ErrSessionExpired:
		return "SESSION_EXPIRED"
	case services.ErrSessionNotFound:
		return "SESSION_NOT_FOUND"
	case services.ErrSessionSecurityViolation:
		return "SECURITY_VIOLATION"
	case services.ErrSessionSecurityViolation:
		return "SECURITY_VIOLATION"
	default:
		return "INVALID_SESSION"
	}
}

// SecurityHeadersMiddleware adds security headers
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Add security headers
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		
		// Only add HSTS in production with HTTPS
		if c.Request.TLS != nil {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		
		c.Next()
	}
}

// ContentTypeValidationMiddleware validates content type for enhanced security
func ContentTypeValidationMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != "GET" && c.Request.Method != "OPTIONS" {
			contentType := c.GetHeader("Content-Type")
			if !strings.Contains(contentType, "application/json") {
				c.JSON(http.StatusUnsupportedMediaType, gin.H{
					"error": "Invalid content type",
					"code":  "INVALID_CONTENT_TYPE",
				})
				c.Abort()
				return
			}
		}
		c.Next()
	}
}

// getClientIP extracts the real client IP address
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
