package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHealthCheckHandler_HandleHealthCheck(t *testing.T) {
	// Test cases
	tests := []struct {
		name           string
		dbError        error
		expectedStatus string
		expectedCode   int
	}{
		{
			name:           "healthy service",
			dbError:        nil,
			expectedStatus: "ok",
			expectedCode:   http.StatusOK,
		},
		{
			name:           "database unavailable",
			dbError:        sqlmock.ErrCancelled,
			expectedStatus: "degraded",
			expectedCode:   http.StatusOK, // Still return 200 but with degraded status
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Set up mock DB for each test case with monitoring pings enabled
			db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
			require.NoError(t, err)
			defer db.Close()

			// Set up expectations
			mock.ExpectPing().WillReturnError(tc.dbError)

			// Set up router
			gin.SetMode(gin.TestMode)
			router := gin.New()
			handler := NewHealthCheckHandler(db)
			RegisterHealthCheckRoutes(router, handler)

			// Create request
			req, err := http.NewRequest(http.MethodGet, "/health", nil)
			require.NoError(t, err)

			// Record response
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assert response
			assert.Equal(t, tc.expectedCode, w.Code)

			// Parse response body
			var response HealthStatus
			err = json.Unmarshal(w.Body.Bytes(), &response)
			require.NoError(t, err)

			// Assert status
			assert.Equal(t, tc.expectedStatus, response.Status)
			assert.NotEmpty(t, response.Version)
			assert.NotEmpty(t, response.BuildTime)
			assert.NotEmpty(t, response.Environment)
			assert.Contains(t, response.Components, "database")

			// Verify all expectations were met
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestHealthCheckHandler_HandleReadinessCheck(t *testing.T) {
	// Test cases
	tests := []struct {
		name         string
		dbError      error
		expectedCode int
	}{
		{
			name:         "service ready",
			dbError:      nil,
			expectedCode: http.StatusOK,
		},
		{
			name:         "service not ready",
			dbError:      sqlmock.ErrCancelled,
			expectedCode: http.StatusServiceUnavailable,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Set up mock DB for each test case with monitoring pings enabled
			db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
			require.NoError(t, err)
			defer db.Close()

			// Set up expectations
			mock.ExpectPing().WillReturnError(tc.dbError)

			// Set up router
			gin.SetMode(gin.TestMode)
			router := gin.New()
			handler := NewHealthCheckHandler(db)
			RegisterHealthCheckRoutes(router, handler)

			// Create request
			req, err := http.NewRequest(http.MethodGet, "/health/ready", nil)
			require.NoError(t, err)

			// Record response
			w := httptest.NewRecorder()
			router.ServeHTTP(w, req)

			// Assert response
			assert.Equal(t, tc.expectedCode, w.Code)

			// Verify all expectations were met
			assert.NoError(t, mock.ExpectationsWereMet())
		})
	}
}

func TestHealthCheckHandler_HandleLivenessCheck(t *testing.T) {
	// Set up mock DB
	db, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	require.NoError(t, err)
	defer db.Close()

	// Set up router
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewHealthCheckHandler(db)
	RegisterHealthCheckRoutes(router, handler)

	// Create request
	req, err := http.NewRequest(http.MethodGet, "/health/live", nil)
	require.NoError(t, err)

	// Record response
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Assert response
	assert.Equal(t, http.StatusOK, w.Code)

	// Parse response body
	var response map[string]string
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Assert status
	assert.Equal(t, "alive", response["status"])

	// Verify all expectations were met
	assert.NoError(t, mock.ExpectationsWereMet())
}
