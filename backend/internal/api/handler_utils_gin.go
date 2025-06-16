// File: backend/internal/api/handler_utils_gin.go
package api

import (
	"log"
	"net" // Added for net.SplitHostPort
	"net/http"
	"net/url" // Added for url.ParseRequestURI
	"strconv" // Added for strconv.Atoi for port validation
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
)

// Global validator instance
var validate *validator.Validate

// ValidateHostnamePortOrURL implements the custom validation logic for resolver strings.
func ValidateHostnamePortOrURL(fl validator.FieldLevel) bool {
	resolver := fl.Field().String()
	if resolver == "" {
		return true // Allow empty string, or return false if it must be non-empty
	}

	// Check for host:port format
	host, port, err := net.SplitHostPort(resolver)
	if err == nil {
		if host == "" || port == "" { // Host and port must be non-empty
			return false
		}
		_, portErr := strconv.Atoi(port)
		if portErr != nil {
			return false // Port is not a number
		}
		// Basic format is valid. More advanced validation (e.g., actual host resolvability) is out of scope for struct tag validation.
		return true
	}

	// If not host:port, check if it's a valid URL (e.g., for DoH/DoT resolvers)
	// This check is basic; specific schemes (https, dns+tls) might be enforced based on requirements.
	u, urlErr := url.ParseRequestURI(resolver)
	if urlErr == nil {
		// Ensure scheme is present and host is present for it to be a usable resolver URL
		if u.Scheme != "" && u.Host != "" {
			// Further restrict schemes if necessary, e.g.:
			// return strings.HasPrefix(u.Scheme, "https") || strings.HasPrefix(u.Scheme, "dns")
			return true
		}
	}
	return false
}

func init() {
	validate = validator.New()
	// Register custom validation function
	if err := validate.RegisterValidation("hostname_port_or_url", ValidateHostnamePortOrURL); err != nil {
		log.Fatalf("FATAL: Failed to register custom validation 'hostname_port_or_url': %v", err)
	}
	log.Println("API Validator initialized and custom validations registered.")
}

// getRequestID gets or generates a request ID for tracing
func getRequestID(c *gin.Context) string {
	// Try to get from header first
	requestID := c.GetHeader("X-Request-ID")
	if requestID != "" {
		return requestID
	}

	// Try to get from context
	if id, exists := c.Get("request_id"); exists {
		if strID, ok := id.(string); ok {
			return strID
		}
	}

	// Generate new ID
	return uuid.New().String()
}

// respondWithErrorGin sends a unified error response using Gin context
func respondWithErrorGin(c *gin.Context, code int, message string) {
	requestID := getRequestID(c)
	errorCode := httpStatusToErrorCode(code)

	log.Printf("API Error: status=%d, code=%s, message=%s, path=%s, clientIP=%s, requestID=%s",
		code, errorCode, message, c.Request.URL.Path, c.ClientIP(), requestID)

	response := NewErrorResponse(errorCode, message, requestID, c.Request.URL.Path)
	c.JSON(code, response)
}

// respondWithDetailedErrorGin sends a unified error response with error details
func respondWithDetailedErrorGin(c *gin.Context, code int, errorCode ErrorCode, message string, details []ErrorDetail) {
	requestID := getRequestID(c)

	log.Printf("API Error: status=%d, code=%s, message=%s, path=%s, clientIP=%s, requestID=%s, details=%d",
		code, errorCode, message, c.Request.URL.Path, c.ClientIP(), requestID, len(details))

	response := &APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:      errorCode,
			Message:   message,
			Details:   details,
			Timestamp: time.Now().UTC(),
			Path:      c.Request.URL.Path,
		},
		RequestID: requestID,
	}

	c.JSON(code, response)
}

// respondWithValidationErrorGin sends a validation error response
func respondWithValidationErrorGin(c *gin.Context, errors []ErrorDetail) {
	requestID := getRequestID(c)
	response := NewValidationErrorResponse(errors, requestID, c.Request.URL.Path)
	c.JSON(http.StatusBadRequest, response)
}

// respondWithJSONGin sends a unified success response using Gin context
func respondWithJSONGin(c *gin.Context, code int, payload interface{}) {
	if payload == nil && code == http.StatusNoContent {
		c.Status(code) // Send no body for 204 No Content
		return
	}

	requestID := getRequestID(c)
	response := NewSuccessResponse(payload, requestID)

	// Add rate limit info if available
	if limit := c.GetHeader("X-RateLimit-Limit"); limit != "" {
		if remaining := c.GetHeader("X-RateLimit-Remaining"); remaining != "" {
			if reset := c.GetHeader("X-RateLimit-Reset"); reset != "" {
				limitInt, _ := strconv.Atoi(limit)
				remainingInt, _ := strconv.Atoi(remaining)
				resetInt, _ := strconv.ParseInt(reset, 10, 64)

				response.WithMetadata(&Metadata{
					RateLimit: &RateLimitInfo{
						Limit:     limitInt,
						Remaining: remainingInt,
						Reset:     time.Unix(resetInt, 0),
					},
				})
			}
		}
	}

	c.JSON(code, response)
}

// streamErrorEventGin sends an error event for SSE using Gin
func streamErrorEventGin(c *gin.Context, flusher http.Flusher, errorMessage string) {
	select {
	case <-c.Writer.CloseNotify():
		log.Printf("streamErrorEventGin: Client disconnected before sending error: %s", errorMessage)
		return
	default:
	}

	requestID := getRequestID(c)
	errorEvent := map[string]interface{}{
		"error": map[string]interface{}{
			"message":    errorMessage,
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
			"request_id": requestID,
		},
	}

	c.SSEvent("error", errorEvent)
	if flusher != nil {
		flusher.Flush()
	}
}

// httpStatusToErrorCode maps HTTP status codes to error codes
func httpStatusToErrorCode(status int) ErrorCode {
	switch status {
	case http.StatusBadRequest:
		return ErrorCodeBadRequest
	case http.StatusUnauthorized:
		return ErrorCodeUnauthorized
	case http.StatusForbidden:
		return ErrorCodeForbidden
	case http.StatusNotFound:
		return ErrorCodeNotFound
	case http.StatusConflict:
		return ErrorCodeConflict
	case http.StatusRequestTimeout:
		return ErrorCodeRequestTimeout
	case http.StatusTooManyRequests:
		return ErrorCodeRateLimitExceeded
	case http.StatusInternalServerError:
		return ErrorCodeInternalServer
	case http.StatusServiceUnavailable:
		return ErrorCodeServiceUnavailable
	case http.StatusGatewayTimeout:
		return ErrorCodeGatewayTimeout
	default:
		if status >= 400 && status < 500 {
			return ErrorCodeBadRequest
		}
		return ErrorCodeInternalServer
	}
}
