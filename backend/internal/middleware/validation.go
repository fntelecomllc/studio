package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ValidateRequestMiddleware validates incoming request payloads
func ValidateRequestMiddleware() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		// Only validate POST, PUT, PATCH requests with JSON content
		if c.Request.Method == "GET" || c.Request.Method == "DELETE" {
			c.Next()
			return
		}

		contentType := c.GetHeader("Content-Type")
		if !strings.Contains(contentType, "application/json") {
			c.Next()
			return
		}

		// Read the request body
		bodyBytes, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Failed to read request body",
				"code":  "INVALID_REQUEST_BODY",
			})
			c.Abort()
			return
		}

		// Restore the request body for the handler
		c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

		// Parse JSON to validate structure
		var requestData interface{}
		if len(bodyBytes) > 0 {
			if err := json.Unmarshal(bodyBytes, &requestData); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": "Invalid JSON format",
					"code":  "INVALID_JSON",
				})
				c.Abort()
				return
			}

			// Validate common fields if present
			if err := validateCommonFields(requestData); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"error": fmt.Sprintf("Validation failed: %s", err.Error()),
					"code":  "VALIDATION_FAILED",
				})
				c.Abort()
				return
			}
		}

		c.Next()
	})
}

// ValidateResponseMiddleware validates outgoing responses in development
func ValidateResponseMiddleware() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		// Only run in development mode
		if gin.Mode() != gin.DebugMode {
			c.Next()
			return
		}

		// Capture the response
		writer := &responseWriter{
			ResponseWriter: c.Writer,
			body:          &bytes.Buffer{},
		}
		c.Writer = writer

		c.Next()

		// Validate response structure
		if writer.body.Len() > 0 {
			var responseData interface{}
			if err := json.Unmarshal(writer.body.Bytes(), &responseData); err == nil {
				if err := validateCommonFields(responseData); err != nil {
					// Log validation error but don't block response
					fmt.Printf("Response validation warning: %s\n", err.Error())
				}
			}
		}
	})
}

// validateCommonFields validates common field patterns
func validateCommonFields(data interface{}) error {
	dataMap, ok := data.(map[string]interface{})
	if !ok {
		return nil // Not a JSON object, skip validation
	}

	// Validate UUID fields
	for key, value := range dataMap {
		if strings.Contains(strings.ToLower(key), "id") || strings.HasSuffix(strings.ToLower(key), "_id") {
			if strValue, ok := value.(string); ok {
				if !isValidUUID(strValue) {
					return fmt.Errorf("field '%s' must be a valid UUID", key)
				}
			}
		}

		// Validate email fields
		if strings.Contains(strings.ToLower(key), "email") {
			if strValue, ok := value.(string); ok {
				if !isValidEmail(strValue) {
					return fmt.Errorf("field '%s' must be a valid email address", key)
				}
			}
		}

		// Recursively validate nested objects
		if nestedMap, ok := value.(map[string]interface{}); ok {
			if err := validateCommonFields(nestedMap); err != nil {
				return err
			}
		}

		// Validate arrays
		if array, ok := value.([]interface{}); ok {
			for _, item := range array {
				if err := validateCommonFields(item); err != nil {
					return err
				}
			}
		}
	}

	return nil
}

// isValidUUID checks if a string is a valid UUID
func isValidUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

// isValidEmail checks if a string is a valid email
func isValidEmail(email string) bool {
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	return emailRegex.MatchString(email)
}

// responseWriter captures response body for validation
type responseWriter struct {
	gin.ResponseWriter
	body *bytes.Buffer
}

func (w *responseWriter) Write(b []byte) (int, error) {
	w.body.Write(b)
	return w.ResponseWriter.Write(b)
}
