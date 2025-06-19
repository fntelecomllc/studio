package api

import (
	"context"
	"database/sql"
	"net/http"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
)

// HealthStatus represents the health status of various components
type HealthStatus struct {
	Status      string            `json:"status"`
	Version     string            `json:"version"`
	BuildTime   string            `json:"buildTime"`
	Environment string            `json:"environment"`
	Components  map[string]Status `json:"components"`
	SystemInfo  SystemInfo        `json:"systemInfo"`
}

// Status represents the health status of a single component
type Status struct {
	Status    string `json:"status"`
	Message   string `json:"message,omitempty"`
	Timestamp string `json:"timestamp"`
}

// SystemInfo provides information about the system resources
type SystemInfo struct {
	NumGoroutine int    `json:"numGoroutine"`
	NumCPU       int    `json:"numCPU"`
	GoVersion    string `json:"goVersion"`
}

// BuildInfo contains build-time information
var BuildInfo = struct {
	Version   string
	BuildTime string
	Env       string
}{
	Version:   "dev",
	BuildTime: time.Now().Format(time.RFC3339),
	Env:       "development",
}

// HealthCheckHandler handles health check requests
type HealthCheckHandler struct {
	db *sql.DB
}

// NewHealthCheckHandler creates a new health check handler
func NewHealthCheckHandler(db *sql.DB) *HealthCheckHandler {
	return &HealthCheckHandler{
		db: db,
	}
}

// HandleHealthCheck handles GET /health requests
func (h *HealthCheckHandler) HandleHealthCheck(c *gin.Context) {
	status := HealthStatus{
		Status:      "ok",
		Version:     BuildInfo.Version,
		BuildTime:   BuildInfo.BuildTime,
		Environment: BuildInfo.Env,
		Components:  make(map[string]Status),
		SystemInfo: SystemInfo{
			NumGoroutine: runtime.NumGoroutine(),
			NumCPU:       runtime.NumCPU(),
			GoVersion:    runtime.Version(),
		},
	}

	// Check database connection
	dbStatus := h.checkDatabaseStatus()
	status.Components["database"] = dbStatus

	// If any component is not healthy, set overall status to degraded
	for _, componentStatus := range status.Components {
		if componentStatus.Status != "ok" {
			status.Status = "degraded"
			break
		}
	}

	respondWithJSONGin(c, http.StatusOK, status)
}

// HandleReadinessCheck handles GET /health/ready requests
func (h *HealthCheckHandler) HandleReadinessCheck(c *gin.Context) {
	// Check if database is ready
	dbStatus := h.checkDatabaseStatus()

	if dbStatus.Status != "ok" {
		respondWithErrorGin(c, http.StatusServiceUnavailable, "Service not ready: database unavailable")
		return
	}

	respondWithJSONGin(c, http.StatusOK, map[string]string{"status": "ready"})
}

// HandleLivenessCheck handles GET /health/live requests
func (h *HealthCheckHandler) HandleLivenessCheck(c *gin.Context) {
	// For liveness, we just check if the service is running
	respondWithJSONGin(c, http.StatusOK, map[string]string{"status": "alive"})
}

// checkDatabaseStatus checks the status of the database connection
func (h *HealthCheckHandler) checkDatabaseStatus() Status {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	status := Status{
		Status:    "ok",
		Timestamp: time.Now().Format(time.RFC3339),
	}

	if err := h.db.PingContext(ctx); err != nil {
		status.Status = "error"
		status.Message = "Database connection failed"
	}

	return status
}

// RegisterHealthCheckRoutes registers health check routes
func RegisterHealthCheckRoutes(router *gin.Engine, handler *HealthCheckHandler) {
	router.GET("/health", handler.HandleHealthCheck)
	router.GET("/health/ready", handler.HandleReadinessCheck)
	router.GET("/health/live", handler.HandleLivenessCheck)
}
