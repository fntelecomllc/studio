package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// SecurityMiddleware provides various security-related middleware
type SecurityMiddleware struct{}

// NewSecurityMiddleware creates a new security middleware
func NewSecurityMiddleware() *SecurityMiddleware {
	return &SecurityMiddleware{}
}

// SecurityHeaders adds comprehensive security headers
func (m *SecurityMiddleware) SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Content Security Policy
		csp := "default-src 'self'; " +
			"script-src 'self' 'unsafe-inline' https://apis.google.com https://www.google.com https://www.gstatic.com; " +
			"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
			"font-src 'self' https://fonts.gstatic.com; " +
			"img-src 'self' data: https:; " +
			"connect-src 'self' wss: https:; " +
			"frame-ancestors 'none'; " +
			"base-uri 'self'; " +
			"form-action 'self'"

		c.Header("Content-Security-Policy", csp)

		// Prevent MIME type sniffing
		c.Header("X-Content-Type-Options", "nosniff")

		// Prevent clickjacking
		c.Header("X-Frame-Options", "DENY")

		// Enable XSS protection
		c.Header("X-XSS-Protection", "1; mode=block")

		// Strict Transport Security (HTTPS only)
		if c.Request.TLS != nil {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload")
		}

		// Referrer Policy
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions Policy
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

		c.Next()
	}
}

// SessionProtection validates X-Requested-With headers for session-based CSRF protection
func (m *SecurityMiddleware) SessionProtection() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip GET, HEAD, OPTIONS requests
		if c.Request.Method == "GET" || c.Request.Method == "HEAD" || c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		// Skip if using API key authentication
		authType, exists := c.Get("auth_type")
		if exists && authType == "api_key" {
			c.Next()
			return
		}

		// Get security context (must be authenticated)
		_, exists = c.Get("security_context")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "Authentication required",
			})
			return
		}

		// For session-based authentication, require X-Requested-With header
		// This provides session-based CSRF protection by validating proper AJAX requests
		requestedWith := c.GetHeader("X-Requested-With")
		if requestedWith == "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "X-Requested-With header required for session-based protection",
			})
			return
		}

		c.Next()
	}
}

// EnhancedCORS provides enhanced CORS handling with security considerations
func (m *SecurityMiddleware) EnhancedCORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// Define allowed origins for production
		productionOrigins := []string{
			"https://domainflow.com",
			"https://app.domainflow.com",
		}

		// Check if origin is allowed
		isAllowed := false

		// Allow any localhost origin for development
		if origin != "" {
			// Check for localhost origins (development)
			if len(origin) >= 16 && origin[:16] == "http://localhost" {
				isAllowed = true
			} else {
				// Check production origins
				for _, allowed := range productionOrigins {
					if origin == allowed {
						isAllowed = true
						break
					}
				}
			}
		}

		// Always set CORS headers for allowed origins
		if isAllowed || origin == "" {
			if origin != "" {
				c.Header("Access-Control-Allow-Origin", origin)
			} else {
				// For requests without Origin header (like direct API calls)
				c.Header("Access-Control-Allow-Origin", "*")
			}
		}

		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Header("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")
		c.Header("Access-Control-Max-Age", "86400") // 24 hours

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// InputSanitization provides basic input sanitization
func (m *SecurityMiddleware) InputSanitization() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Add security headers to prevent XSS
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-XSS-Protection", "1; mode=block")

		// TODO: Implement input sanitization logic
		// This could include:
		// - HTML sanitization using bluemonday
		// - SQL injection prevention (handled by parameterized queries)
		// - JSON input validation

		c.Next()
	}
}

// AuditLogging logs security-relevant events
func (m *SecurityMiddleware) AuditLogging() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Log the request
		// TODO: Implement comprehensive audit logging
		// This should log:
		// - Authentication attempts
		// - Authorization failures
		// - Sensitive operations
		// - Suspicious activities

		c.Next()

		// Log the response if needed
		// TODO: Log response status and any security events
	}
}

// RequestSizeLimit limits the size of incoming requests
func (m *SecurityMiddleware) RequestSizeLimit(maxSize int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxSize {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": "Request too large",
			})
			return
		}

		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxSize)
		c.Next()
	}
}

// IPWhitelist restricts access to specific IP addresses
func (m *SecurityMiddleware) IPWhitelist(allowedIPs []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientIP := c.ClientIP()

		// Check if IP is in whitelist
		allowed := false
		for _, ip := range allowedIPs {
			if clientIP == ip {
				allowed = true
				break
			}
		}

		if !allowed {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "Access denied",
			})
			return
		}

		c.Next()
	}
}

// RequireHTTPS redirects HTTP requests to HTTPS
func (m *SecurityMiddleware) RequireHTTPS() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Header.Get("X-Forwarded-Proto") == "http" {
			httpsURL := "https://" + c.Request.Host + c.Request.RequestURI
			c.Redirect(http.StatusMovedPermanently, httpsURL)
			c.Abort()
			return
		}

		c.Next()
	}
}

// SessionSecurity adds session-specific security measures
func (m *SecurityMiddleware) SessionSecurity() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check for session fixation attacks
		// TODO: Implement session security checks
		// - Validate session binding to IP/User-Agent
		// - Check for concurrent sessions
		// - Detect session hijacking attempts

		c.Next()
	}
}
