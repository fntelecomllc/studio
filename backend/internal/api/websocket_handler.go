package api

import (
	"log"
	"net/http"
	"os"
	"strings"

	// Alias your internal websocket package to avoid collision with gorilla/websocket
	"github.com/fntelecomllc/studio/backend/internal/services"
	internalwebsocket "github.com/fntelecomllc/studio/backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket" // This will be identified by the package name 'websocket'
)

// upgrader uses the gorilla/websocket package
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// CRITICAL SECURITY FIX: Proper origin validation for production
		origin := r.Header.Get("Origin")
		
		log.Printf("WebSocket origin validation check: origin='%s', gin.Mode='%s'", origin, gin.Mode())

		// Debug: Log environment variables
		log.Printf("WebSocket env debug: ENV='%s', DEPLOYMENT_ENVIRONMENT='%s', DEV_MODE='%s', NODE_ENV='%s'",
			os.Getenv("ENV"), os.Getenv("DEPLOYMENT_ENVIRONMENT"), os.Getenv("DEV_MODE"), os.Getenv("NODE_ENV"))

		// Enhanced development mode detection - check multiple conditions
		isDevelopment := gin.Mode() == gin.DebugMode ||
			gin.Mode() == gin.TestMode ||
			os.Getenv("GIN_MODE") == "debug" ||
			os.Getenv("NODE_ENV") == "development" ||
			strings.Contains(os.Getenv("GO_ENV"), "dev") ||
			os.Getenv("ENV") == "development" ||
			os.Getenv("DEPLOYMENT_ENVIRONMENT") == "development" ||
			os.Getenv("DEV_MODE") == "true" ||
			strings.EqualFold(os.Getenv("ENV"), "dev") ||
			strings.EqualFold(os.Getenv("ENVIRONMENT"), "development") ||
			strings.EqualFold(os.Getenv("ENVIRONMENT"), "dev")
		
		// ADDITIONAL: If environment variables indicate production but we're clearly in a local development setup
		// (localhost origins), treat it as development. This handles cases where deploy scripts set ENV=production
		// but we're actually running locally for development.
		isLocalhost := strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1") || strings.Contains(origin, "0.0.0.0")
		if !isDevelopment && isLocalhost {
			log.Printf("WebSocket: Detected localhost origin '%s' - treating as development despite environment settings", origin)
			isDevelopment = true
		}

		// In development, be more permissive with localhost origins
		if isDevelopment {
			developmentOrigins := []string{
				"http://localhost:3000",
				"http://127.0.0.1:3000",
				"http://localhost:3001", // Next.js sometimes uses 3001
				"http://127.0.0.1:3001",
				"http://localhost:8080",
				"http://127.0.0.1:8080",
				"http://localhost:8000",
				"http://127.0.0.1:8000",
				"http://0.0.0.0:3000",   // Docker development
				"http://0.0.0.0:3001",
			}
			
			for _, allowed := range developmentOrigins {
				if origin == allowed {
					log.Printf("WebSocket origin validation: ALLOWED development origin '%s'", origin)
					return true
				}
			}
			
			// Additional check for any localhost pattern in development
			if strings.Contains(origin, "localhost") || strings.Contains(origin, "127.0.0.1") || strings.Contains(origin, "0.0.0.0") {
				log.Printf("WebSocket origin validation: ALLOWED localhost pattern '%s' in development mode", origin)
				return true
			}
		}

		// In production, check against environment-configured allowed origins
		allowedOrigins := os.Getenv("WEBSOCKET_ALLOWED_ORIGINS")
		if allowedOrigins != "" {
			origins := strings.Split(allowedOrigins, ",")
			for _, allowed := range origins {
				if strings.TrimSpace(allowed) == origin {
					log.Printf("WebSocket origin validation: ALLOWED configured origin '%s'", origin)
					return true
				}
			}
		}

		// Default production origins if not configured
		if gin.Mode() == gin.ReleaseMode {
			productionOrigins := []string{
				"https://domainflow.studio",
				"https://www.domainflow.studio",
			}
			for _, allowed := range productionOrigins {
				if origin == allowed {
					log.Printf("WebSocket origin validation: ALLOWED production origin '%s'", origin)
					return true
				}
			}
		}

		// If no origin header (e.g., same-origin requests), allow in development
		if origin == "" && isDevelopment {
			log.Printf("WebSocket origin validation: ALLOWED empty origin in development mode")
			return true
		}

		log.Printf("WebSocket origin validation: REJECTED origin '%s' (mode: %s, isDev: %v)", origin, gin.Mode(), isDevelopment)
		return false
	},
}

// WebSocketHandler handles WebSocket connections.
// It uses the Broadcaster interface from your internalwebsocket package.
type WebSocketHandler struct {
	hub         internalwebsocket.Broadcaster
	authService *services.AuthService
}

// NewWebSocketHandler creates a new WebSocketHandler.
// It expects a Broadcaster from your internalwebsocket package.
func NewWebSocketHandler(hub internalwebsocket.Broadcaster, authService *services.AuthService) *WebSocketHandler {
	return &WebSocketHandler{
		hub:         hub,
		authService: authService,
	}
}

// HandleConnections upgrades HTTP GET requests to WebSocket connections.
func (h *WebSocketHandler) HandleConnections(c *gin.Context) {
	// Session-based authentication: Validate session before upgrading to WebSocket
	// Try the primary session cookie name first
	sessionID, err := c.Cookie("domainflow_session")
	if err != nil {
		// Try legacy cookie name for backward compatibility
		sessionID, err = c.Cookie("session_id")
		if err != nil {
			log.Printf("WebSocket connection rejected: no session cookie found")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			return
		}
	}

	// Origin validation for cross-site request protection (no token-based CSRF needed)
	origin := c.GetHeader("Origin")
	customHeader := c.GetHeader("X-Requested-With")
	
	// Validate origin for cross-site request protection
	if !h.isValidOrigin(origin) {
		log.Printf("WebSocket connection rejected: invalid origin '%s'", origin)
		c.JSON(http.StatusForbidden, gin.H{"error": "Invalid origin"})
		return
	}

	// For additional cross-site protection, require custom header from non-same-origin requests
	if origin != "" && customHeader != "XMLHttpRequest" {
		log.Printf("WebSocket connection rejected: missing required custom header")
		c.JSON(http.StatusForbidden, gin.H{"error": "Invalid request headers"})
		return
	}

	// Validate the session with enhanced security checks
	clientIP := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")
	
	// Use session service for validation with fingerprinting
	sessionInfo, err := h.authService.ValidateSessionWithContext(sessionID, clientIP, userAgent)
	if err != nil {
		log.Printf("WebSocket connection rejected: invalid session - %v", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired session"})
		return
	}

	// Additional security checks for WebSocket connections
	if sessionInfo.UserID == "" {
		log.Printf("WebSocket connection rejected: no user ID in session")
		c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient permissions"})
		return
	}

	// Validate session fingerprint for enhanced security
	if !h.validateSessionFingerprint(sessionInfo, clientIP, userAgent) {
		log.Printf("WebSocket connection rejected: session fingerprint mismatch for user %s", sessionInfo.UserID)
		c.JSON(http.StatusForbidden, gin.H{"error": "Session security validation failed"})
		return
	}

	// Upgrade the connection using gorilla/websocket upgrader
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade to websocket: %+v", err)
		return
	}

	// Create a new client with session-based security context
	wsSecurityContext := &internalwebsocket.SecurityContext{
		UserID:      sessionInfo.UserID,
		SessionID:   sessionID,
		ClientIP:    clientIP,
		Permissions: sessionInfo.Permissions,
	}

	// Create and start the client (note: client is used by being passed to the constructor)
	internalwebsocket.NewClientWithSecurity(h.hub, conn, wsSecurityContext)

	// Log successful connection
	log.Printf("WebSocket client connected for user: %s (IP: %s) with session-based authentication", sessionInfo.UserID, clientIP)
}

// isValidOrigin validates the origin for cross-site request protection
func (h *WebSocketHandler) isValidOrigin(origin string) bool {
	if origin == "" {
		// Allow same-origin requests (no origin header)
		return true
	}

	// Check development mode
	isDevelopment := gin.Mode() == gin.DebugMode ||
		gin.Mode() == gin.TestMode ||
		os.Getenv("GIN_MODE") == "debug" ||
		os.Getenv("NODE_ENV") == "development" ||
		strings.Contains(os.Getenv("GO_ENV"), "dev") ||
		os.Getenv("ENV") == "development" ||
		os.Getenv("DEPLOYMENT_ENVIRONMENT") == "development" ||
		os.Getenv("DEV_MODE") == "true"

	// Additional check for localhost patterns
	isLocalhost := strings.Contains(origin, "localhost") ||
		strings.Contains(origin, "127.0.0.1") ||
		strings.Contains(origin, "0.0.0.0")
	
	if !isDevelopment && isLocalhost {
		isDevelopment = true
	}

	// In development, allow localhost origins
	if isDevelopment {
		developmentOrigins := []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://localhost:3001",
			"http://127.0.0.1:3001",
			"http://localhost:8080",
			"http://127.0.0.1:8080",
			"http://localhost:8000",
			"http://127.0.0.1:8000",
			"http://0.0.0.0:3000",
			"http://0.0.0.0:3001",
		}
		
		for _, allowed := range developmentOrigins {
			if origin == allowed {
				return true
			}
		}
		
		// Additional check for any localhost pattern in development
		if isLocalhost {
			return true
		}
	}

	// In production, check against environment-configured allowed origins
	allowedOrigins := os.Getenv("WEBSOCKET_ALLOWED_ORIGINS")
	if allowedOrigins != "" {
		origins := strings.Split(allowedOrigins, ",")
		for _, allowed := range origins {
			if strings.TrimSpace(allowed) == origin {
				return true
			}
		}
	}

	// Default production origins
	if gin.Mode() == gin.ReleaseMode {
		productionOrigins := []string{
			"https://domainflow.studio",
			"https://www.domainflow.studio",
		}
		for _, allowed := range productionOrigins {
			if origin == allowed {
				return true
			}
		}
	}

	return false
}

// validateSessionFingerprint validates the session fingerprint for enhanced security
func (h *WebSocketHandler) validateSessionFingerprint(sessionInfo *services.SessionInfo, clientIP, userAgent string) bool {
	// Basic fingerprint validation - check if key session details match
	if sessionInfo.IPAddress != clientIP {
		log.Printf("Session fingerprint mismatch: IP changed from %s to %s", sessionInfo.IPAddress, clientIP)
		return false
	}

	// Allow some flexibility in user agent (browsers can update minor versions)
	if sessionInfo.UserAgent != "" && userAgent != "" {
		// Extract major browser info for comparison
		sessionBrowser := h.extractBrowserInfo(sessionInfo.UserAgent)
		currentBrowser := h.extractBrowserInfo(userAgent)
		
		if sessionBrowser != currentBrowser {
			log.Printf("Session fingerprint mismatch: User agent browser changed from %s to %s", sessionBrowser, currentBrowser)
			return false
		}
	}

	return true
}

// extractBrowserInfo extracts basic browser information for fingerprint comparison
func (h *WebSocketHandler) extractBrowserInfo(userAgent string) string {
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
