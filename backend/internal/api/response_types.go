// Package api provides unified response types for API endpoints
package api

import (
	"time"
)

// ErrorCode represents standard error codes for the API
type ErrorCode string

const (
	// Client errors (4xx)
	ErrorCodeBadRequest        ErrorCode = "BAD_REQUEST"
	ErrorCodeUnauthorized      ErrorCode = "UNAUTHORIZED"
	ErrorCodeForbidden         ErrorCode = "FORBIDDEN"
	ErrorCodeNotFound          ErrorCode = "NOT_FOUND"
	ErrorCodeConflict          ErrorCode = "CONFLICT"
	ErrorCodeValidation        ErrorCode = "VALIDATION_ERROR"
	ErrorCodeRateLimitExceeded ErrorCode = "RATE_LIMIT_EXCEEDED"
	ErrorCodeRequestTimeout    ErrorCode = "REQUEST_TIMEOUT"

	// Server errors (5xx)
	ErrorCodeInternalServer     ErrorCode = "INTERNAL_SERVER_ERROR"
	ErrorCodeDatabaseError      ErrorCode = "DATABASE_ERROR"
	ErrorCodeServiceUnavailable ErrorCode = "SERVICE_UNAVAILABLE"
	ErrorCodeGatewayTimeout     ErrorCode = "GATEWAY_TIMEOUT"

	// Business logic errors
	ErrorCodeCampaignInProgress ErrorCode = "CAMPAIGN_IN_PROGRESS"
	ErrorCodeQuotaExceeded      ErrorCode = "QUOTA_EXCEEDED"
	ErrorCodeInvalidState       ErrorCode = "INVALID_STATE"
)

// ErrorDetail provides detailed information about a specific error
type ErrorDetail struct {
	Field   string      `json:"field,omitempty"`   // Field that caused the error (for validation)
	Code    ErrorCode   `json:"code"`              // Error code
	Message string      `json:"message"`           // Human-readable error message
	Context interface{} `json:"context,omitempty"` // Additional context data
}

// APIResponse represents the unified response format for all API endpoints
type APIResponse struct {
	Success   bool        `json:"success"`            // Indicates if the request was successful
	Data      interface{} `json:"data,omitempty"`     // Response data (only present on success)
	Error     *ErrorInfo  `json:"error,omitempty"`    // Error information (only present on failure)
	Metadata  *Metadata   `json:"metadata,omitempty"` // Optional metadata
	RequestID string      `json:"requestId"`          // Unique request identifier for tracing
}

// ErrorInfo contains comprehensive error information
type ErrorInfo struct {
	Code      ErrorCode     `json:"code"`              // Primary error code
	Message   string        `json:"message"`           // Primary error message
	Details   []ErrorDetail `json:"details,omitempty"` // Detailed error information
	Timestamp time.Time     `json:"timestamp"`         // When the error occurred
	Path      string        `json:"path,omitempty"`    // API path that generated the error
}

// Metadata contains optional response metadata
type Metadata struct {
	Page       *PageInfo              `json:"page,omitempty"`       // Pagination info
	RateLimit  *RateLimitInfo         `json:"rateLimit,omitempty"`  // Rate limiting info
	Processing *ProcessingInfo        `json:"processing,omitempty"` // Processing time info
	Extra      map[string]interface{} `json:"extra,omitempty"`      // Additional metadata
}

// PageInfo contains pagination metadata
type PageInfo struct {
	Current  int `json:"current"`  // Current page number
	Total    int `json:"total"`    // Total number of pages
	PageSize int `json:"pageSize"` // Items per page
	Count    int `json:"count"`    // Total item count
}

// RateLimitInfo contains rate limiting information
type RateLimitInfo struct {
	Limit     int       `json:"limit"`     // Request limit
	Remaining int       `json:"remaining"` // Remaining requests
	Reset     time.Time `json:"reset"`     // When the limit resets
}

// ProcessingInfo contains request processing metadata
type ProcessingInfo struct {
	Duration string `json:"duration"` // Processing duration (e.g., "125ms")
	Version  string `json:"version"`  // API version
}

// NewSuccessResponse creates a successful API response
func NewSuccessResponse(data interface{}, requestID string) *APIResponse {
	return &APIResponse{
		Success:   true,
		Data:      data,
		RequestID: requestID,
	}
}

// NewErrorResponse creates an error API response
func NewErrorResponse(code ErrorCode, message string, requestID string, path string) *APIResponse {
	return &APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:      code,
			Message:   message,
			Timestamp: time.Now().UTC(),
			Path:      path,
		},
		RequestID: requestID,
	}
}

// NewValidationErrorResponse creates a validation error response with field details
func NewValidationErrorResponse(errors []ErrorDetail, requestID string, path string) *APIResponse {
	return &APIResponse{
		Success: false,
		Error: &ErrorInfo{
			Code:      ErrorCodeValidation,
			Message:   "Validation failed",
			Details:   errors,
			Timestamp: time.Now().UTC(),
			Path:      path,
		},
		RequestID: requestID,
	}
}

// WithMetadata adds metadata to the response
func (r *APIResponse) WithMetadata(metadata *Metadata) *APIResponse {
	r.Metadata = metadata
	return r
}

// AddErrorDetail adds an error detail to an error response
func (r *APIResponse) AddErrorDetail(detail ErrorDetail) *APIResponse {
	if r.Error != nil {
		r.Error.Details = append(r.Error.Details, detail)
	}
	return r
}
