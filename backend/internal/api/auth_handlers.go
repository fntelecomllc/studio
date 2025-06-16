package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
)

// AuthHandler handles authentication-related HTTP requests
type AuthHandler struct {
	authService    *services.AuthService
	sessionService *services.SessionService
	config         *config.SessionSettings
}

// NewAuthHandler creates a new authentication handler
func NewAuthHandler(authService *services.AuthService, sessionService *services.SessionService, sessionConfig *config.SessionSettings) *AuthHandler {
	return &AuthHandler{
		authService:    authService,
		sessionService: sessionService,
		config:         sessionConfig,
	}
}

// Login handles user login requests
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Get client IP and user agent
	ipAddress := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Perform login
	response, err := h.authService.Login(&req, ipAddress, userAgent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Internal server error",
		})
		return
	}

	// If login failed, return the response as-is
	if !response.Success {
		c.JSON(http.StatusOK, response)
		return
	}

	// If login successful, set secure session cookie ONLY
	if response.SessionID != "" {
		// Set SameSite mode based on configuration
		switch h.config.CookieSameSite {
		case "strict":
			c.SetSameSite(http.SameSiteStrictMode)
		case "lax":
			c.SetSameSite(http.SameSiteLaxMode)
		case "none":
			c.SetSameSite(http.SameSiteNoneMode)
		default:
			c.SetSameSite(http.SameSiteStrictMode)
		}

		// Set only the session cookie - no CSRF token or auth tokens
		c.SetCookie(
			h.config.CookieName,
			response.SessionID,
			h.config.CookieMaxAge,
			h.config.CookiePath,
			h.config.CookieDomain,
			h.config.CookieSecure,
			h.config.CookieHttpOnly,
		)

		// Also set legacy cookie for backward compatibility during transition
		c.SetCookie(config.LegacySessionCookieName, response.SessionID, h.config.CookieMaxAge, h.config.CookiePath, h.config.CookieDomain, h.config.CookieSecure, h.config.CookieHttpOnly)
	}

	c.JSON(http.StatusOK, response)
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
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "Logged out successfully",
			})
			return
		}
	}

	// Get client IP and user agent
	ipAddress := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Perform logout using auth service
	if err := h.authService.Logout(sessionID, ipAddress, userAgent); err != nil {
		// Still clear cookies even if logout fails
		h.clearSessionCookies(c)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "Logged out successfully",
		})
		return
	}

	// Clear all session cookies
	h.clearSessionCookies(c)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Logged out successfully",
	})
}

// Me returns current user information
func (h *AuthHandler) Me(c *gin.Context) {
	// Get security context from middleware
	securityContext, exists := c.Get("security_context")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Authentication required",
		})
		return
	}

	ctx := securityContext.(*models.SecurityContext)

	// Get complete user details with roles and permissions from auth service
	user, err := h.authService.GetUserWithRolesAndPermissions(ctx.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get user details",
		})
		return
	}

	// Return complete user object in the format expected by frontend
	c.JSON(http.StatusOK, user.PublicUser())
}

// ChangePassword handles password change requests
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req models.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Get security context from middleware
	securityContext, exists := c.Get("security_context")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Authentication required",
		})
		return
	}

	ctx := securityContext.(*models.SecurityContext)

	// Get client IP and user agent
	ipAddress := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Change password
	err := h.authService.ChangePassword(ctx.UserID, req.CurrentPassword, req.NewPassword, ipAddress, userAgent)
	if err != nil {
		switch err {
		case services.ErrInvalidCredentials:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Current password is incorrect",
			})
		case services.ErrPasswordTooWeak:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Password does not meet security requirements",
			})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to change password",
			})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
	})
}

// ForgotPassword handles forgot password requests
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req models.ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Get client IP and user agent
	ipAddress := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Initiate password reset
	err := h.authService.ForgotPassword(req.Email, ipAddress, userAgent)
	if err != nil {
		if err == services.ErrRateLimitExceeded {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"error":   "Too many password reset attempts. Please try again later.",
			})
			return
		}
		// Always return success for security (don't reveal if email exists)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "If the email address exists, a password reset link has been sent.",
	})
}

// ResetPassword handles password reset requests
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req models.ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Get client IP and user agent
	ipAddress := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Reset password
	err := h.authService.ResetPassword(req.Token, req.Password, ipAddress, userAgent)
	if err != nil {
		switch err {
		case services.ErrInvalidToken:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Invalid or expired reset token",
			})
		case services.ErrTokenExpired:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Reset token has expired",
			})
		case services.ErrPasswordTooWeak:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Password does not meet security requirements",
			})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to reset password",
			})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Password reset successfully",
	})
}

// RefreshSession refreshes the current session
func (h *AuthHandler) RefreshSession(c *gin.Context) {
	// Get session ID from cookie
	sessionID, err := c.Cookie(h.config.CookieName)
	if err != nil {
		// Try legacy cookie name
		sessionID, err = c.Cookie(config.LegacySessionCookieName)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "No active session",
				"code":    "NO_SESSION",
			})
			return
		}
	}

	// Get client IP
	ipAddress := getClientIP(c)

	// Validate session (this also updates last activity)
	_, err = h.authService.ValidateSession(sessionID, ipAddress)
	if err != nil {
		// Clear invalid session cookies
		h.clearSessionCookies(c)

		switch err {
		case services.ErrSessionExpired, services.ErrSessionNotFound:
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Session expired",
				"code":    "SESSION_EXPIRED",
			})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to refresh session",
				"code":    "REFRESH_ERROR",
			})
		}
		return
	}

	// Extend session if needed
	newExpiry := time.Now().Add(h.sessionService.GetConfig().Duration)
	if err := h.sessionService.ExtendSession(sessionID, newExpiry); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to extend session",
			"code":    "EXTEND_ERROR",
		})
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

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"expires_at": newExpiry.Format(time.RFC3339),
	})
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

// clearSessionCookies clears all session-related cookies
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
	c.SetCookie(config.LegacySessionCookieName, "", -1, config.CookiePath, "", config.CookieSecure, config.CookieHttpOnly)
	c.SetCookie(config.AuthTokensCookieName, "", -1, config.CookiePath, "", config.CookieSecure, false)
}

// User management handlers (admin only)

// ListUsers lists all users (admin only)
func (h *AuthHandler) ListUsers(c *gin.Context) {
	// Get pagination parameters
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	_ = c.Query("search") // TODO: Use search parameter

	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}

	// TODO: Implement user listing in auth service
	// For now, return placeholder
	c.JSON(http.StatusOK, gin.H{
		"users": []interface{}{},
		"pagination": gin.H{
			"page":  page,
			"limit": limit,
			"total": 0,
		},
	})
}

// CreateUser creates a new user (admin only)
func (h *AuthHandler) CreateUser(c *gin.Context) {
	var req models.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Get client IP and user agent
	ipAddress := getClientIP(c)
	userAgent := c.GetHeader("User-Agent")

	// Create user
	user, err := h.authService.CreateUser(&req, ipAddress, userAgent)
	if err != nil {
		switch err {
		case services.ErrEmailExists:
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "Email already exists",
			})
		case services.ErrPasswordTooWeak:
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Password does not meet security requirements",
			})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to create user",
			})
		}
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "User created successfully",
		"user":    user,
	})
}

// GetUser gets a user by ID
func (h *AuthHandler) GetUser(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	// TODO: Implement get user by ID in auth service
	c.JSON(http.StatusOK, gin.H{
		"user_id": userID,
	})
}

// UpdateUser updates a user
func (h *AuthHandler) UpdateUser(c *gin.Context) {
	userIDStr := c.Param("userId")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	var req models.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// TODO: Implement user update in auth service
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"user_id": userID,
	})
}

// DeleteUser deletes a user (admin only)
func (h *AuthHandler) DeleteUser(c *gin.Context) {
	userIDStr := c.Param("userId")
	_, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	// TODO: Implement user deletion in auth service
	c.JSON(http.StatusNoContent, nil)
}
