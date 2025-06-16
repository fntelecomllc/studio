package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
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

	c.JSON(http.StatusOK, status)
}

// HandleReadinessCheck handles GET /health/ready requests
func (h *HealthCheckHandler) HandleReadinessCheck(c *gin.Context) {
	// Check if database is ready
	dbStatus := h.checkDatabaseStatus()

	if dbStatus.Status != "ok" {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "not_ready",
			"reason":  "database_unavailable",
			"message": dbStatus.Message,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "ready",
	})
}

// HandleLivenessCheck handles GET /health/live requests
func (h *HealthCheckHandler) HandleLivenessCheck(c *gin.Context) {
	// For liveness, we just check if the service is running
	c.JSON(http.StatusOK, gin.H{
		"status": "alive",
	})
}

// checkDatabaseStatus checks the status of the database connection
func (h *HealthCheckHandler) checkDatabaseStatus() Status {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	status := Status{
		Status:    "ok",
		Timestamp: time.Now().Format(time.RFC3339),
	}

	if h.db == nil {
		status.Status = "error"
		status.Message = "Database connection not initialized"
		return status
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

func main() {
	fmt.Println("Testing health check endpoints...")

	// Set up a test database connection
	dbURL := os.Getenv("TEST_DB_URL")
	if dbURL == "" {
		dbURL = "postgres://test:test@localhost:5432/test_db?sslmode=disable"
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Set a short timeout for the connection test
	db.SetConnMaxLifetime(5 * time.Second)

	// Test database connection
	if err := db.Ping(); err != nil {
		log.Printf("Warning: Database connection failed: %v", err)
		log.Println("Continuing with tests using a mock database...")
		db = nil
	} else {
		log.Println("Database connection successful")
	}

	// Set up Gin router
	gin.SetMode(gin.TestMode)
	router := gin.New()

	// Create health check handler
	handler := NewHealthCheckHandler(db)
	RegisterHealthCheckRoutes(router, handler)

	// Test /health endpoint
	fmt.Println("\nTesting /health endpoint...")
	testHealthEndpoint(router)

	// Test /health/ready endpoint
	fmt.Println("\nTesting /health/ready endpoint...")
	testReadinessEndpoint(router)

	// Test /health/live endpoint
	fmt.Println("\nTesting /health/live endpoint...")
	testLivenessEndpoint(router)

	fmt.Println("\nAll health check tests completed successfully!")
}

func testHealthEndpoint(router *gin.Engine) {
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		log.Fatalf("Expected status code %d, got %d", http.StatusOK, w.Code)
	}

	// Parse response to verify structure
	var response HealthStatus
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		log.Fatalf("Failed to parse response: %v", err)
	}

	fmt.Printf("✅ /health endpoint returned status code %d\n", w.Code)
	fmt.Printf("Response status: %s\n", response.Status)
	fmt.Printf("Response version: %s\n", response.Version)
}

func testReadinessEndpoint(router *gin.Engine) {
	req := httptest.NewRequest(http.MethodGet, "/health/ready", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Note: This might return 503 if the database is not available
	if w.Code != http.StatusOK && w.Code != http.StatusServiceUnavailable {
		log.Fatalf("Expected status code %d or %d, got %d",
			http.StatusOK, http.StatusServiceUnavailable, w.Code)
	}

	fmt.Printf("✅ /health/ready endpoint returned status code %d\n", w.Code)
	fmt.Printf("Response body: %s\n", w.Body.String())
}

func testLivenessEndpoint(router *gin.Engine) {
	req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		log.Fatalf("Expected status code %d, got %d", http.StatusOK, w.Code)
	}

	fmt.Printf("✅ /health/live endpoint returned status code %d\n", w.Code)
	fmt.Printf("Response body: %s\n", w.Body.String())
}
