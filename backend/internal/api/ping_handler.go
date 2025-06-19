// File: backend/internal/api/ping_handler.go
package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// PingHandlerGin responds to ping requests to check server health using Gin.
func PingHandlerGin(c *gin.Context) {
	respondWithJSONGin(c, http.StatusOK, map[string]string{
		"message": "pong", 
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
