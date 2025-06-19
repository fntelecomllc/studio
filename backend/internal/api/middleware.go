// File: backend/internal/api/middleware.go
package api

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// LoggingMiddleware logs the incoming HTTP request
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		srw := NewStatusResponseWriter(w)

		log.Printf("Request Start: %s %s %s", r.Method, r.RequestURI, r.RemoteAddr)
		next.ServeHTTP(srw, r)
		log.Printf("Request End: %s %s (Status: %d) %s (Duration: %s)", r.Method, r.RequestURI, srw.statusCode, r.RemoteAddr, time.Since(start))
	})
}

// StatusResponseWriter wraps ResponseWriter to capture status code
// and implements http.Flusher if the underlying writer supports it.
type StatusResponseWriter struct {
	http.ResponseWriter
	statusCode int
	flushed    bool
}

func NewStatusResponseWriter(w http.ResponseWriter) *StatusResponseWriter {
	return &StatusResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
}

func (srw *StatusResponseWriter) WriteHeader(code int) {
	if !srw.flushed {
		srw.statusCode = code
		srw.ResponseWriter.WriteHeader(code)
	}
}

func (srw *StatusResponseWriter) Write(b []byte) (int, error) {
	if srw.statusCode == 0 && !srw.flushed {
	}
	return srw.ResponseWriter.Write(b)
}

func (srw *StatusResponseWriter) Flush() {
	if srw.statusCode == 0 && !srw.flushed {
	}

	if flusher, ok := srw.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
		srw.flushed = true
	} else {
	}
}

// APIKeyAuthMiddleware (for net/http handlers)
func APIKeyAuthMiddleware(apiKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				log.Printf("Auth Error: Missing Authorization header from %s for %s %s", r.RemoteAddr, r.Method, r.RequestURI)
				http.Error(w, "Authorization header required", http.StatusUnauthorized)
				return
			}
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				log.Printf("Auth Error: Invalid Authorization header format from %s for %s %s", r.RemoteAddr, r.Method, r.RequestURI)
				http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
				return
			}
			if parts[1] != apiKey {
				log.Printf("Auth Error: Invalid API Key provided by %s for %s %s", r.RemoteAddr, r.Method, r.RequestURI)
				http.Error(w, "Invalid API Key", http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// GinAPIKeyAuthMiddleware provides API Key authentication for Gin handlers.
func GinAPIKeyAuthMiddleware(apiKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodOptions {
			c.Next() // Proceed to the next handler for OPTIONS requests
			return
		}

		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			log.Printf("Gin Auth Error: Missing Authorization header from %s for %s %s", c.Request.RemoteAddr, c.Request.Method, c.Request.RequestURI)
			c.AbortWithStatusJSON(http.StatusUnauthorized, map[string]string{"error": "Authorization header required"})
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			log.Printf("Gin Auth Error: Invalid Authorization header format from %s for %s %s", c.Request.RemoteAddr, c.Request.Method, c.Request.RequestURI)
			c.AbortWithStatusJSON(http.StatusUnauthorized, map[string]string{"error": "Invalid Authorization header format"})
			return
		}

		if parts[1] != apiKey {
			log.Printf("Gin Auth Error: Invalid API Key provided by %s for %s %s", c.Request.RemoteAddr, c.Request.Method, c.Request.RequestURI)
			c.AbortWithStatusJSON(http.StatusUnauthorized, map[string]string{"error": "Invalid API Key"})
			return
		}
		c.Next() // Proceed to the next handler
	}
}

// GinCORSMiddleware provides basic CORS headers for Gin handlers.
func GinCORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
