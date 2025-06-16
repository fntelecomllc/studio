package logging

import (
	"encoding/json"
	"log"
	"os"
	"runtime"
	"time"

	"github.com/google/uuid"
)

// LogLevel represents the severity of a log entry
type LogLevel string

const (
	LogLevelDebug LogLevel = "DEBUG"
	LogLevelInfo  LogLevel = "INFO"
	LogLevelWarn  LogLevel = "WARN"
	LogLevelError LogLevel = "ERROR"
	LogLevelFatal LogLevel = "FATAL"
)

// LogCategory represents the category of authentication operation
type LogCategory string

const (
	CategoryAuth        LogCategory = "AUTH"
	CategorySession     LogCategory = "SESSION"
	CategoryPassword    LogCategory = "PASSWORD"
	CategoryDatabase    LogCategory = "DATABASE"
	CategoryMiddleware  LogCategory = "MIDDLEWARE"
	CategoryRateLimit   LogCategory = "RATE_LIMIT"
	CategorySecurity    LogCategory = "SECURITY"
	CategoryPerformance LogCategory = "PERFORMANCE"
)

// AuthLogEntry represents a structured log entry for authentication operations
type AuthLogEntry struct {
	Timestamp    time.Time              `json:"timestamp"`
	Level        LogLevel               `json:"level"`
	Category     LogCategory            `json:"category"`
	Operation    string                 `json:"operation"`
	UserID       *uuid.UUID             `json:"userId,omitempty"`
	SessionID    *string                `json:"sessionId,omitempty"`
	IPAddress    string                 `json:"ipAddress,omitempty"`
	UserAgent    string                 `json:"userAgent,omitempty"`
	RequestID    string                 `json:"requestId,omitempty"`
	Duration     *time.Duration         `json:"durationMs,omitempty"`
	Success      *bool                  `json:"success,omitempty"`
	ErrorCode    string                 `json:"errorCode,omitempty"`
	ErrorMessage string                 `json:"errorMessage,omitempty"`
	Details      map[string]interface{} `json:"details,omitempty"`
	StackTrace   string                 `json:"stackTrace,omitempty"`
	File         string                 `json:"file,omitempty"`
	Line         int                    `json:"line,omitempty"`
	Function     string                 `json:"function,omitempty"`
}

// DatabaseMetrics represents database operation metrics
type DatabaseMetrics struct {
	QueryDuration     time.Duration `json:"queryDurationMs"`
	ConnectionsActive int           `json:"connectionsActive"`
	ConnectionsIdle   int           `json:"connectionsIdle"`
	ConnectionsTotal  int           `json:"connectionsTotal"`
	QueryType         string        `json:"queryType"`
	TableName         string        `json:"tableName,omitempty"`
	RowsAffected      int64         `json:"rowsAffected,omitempty"`
	RowsReturned      int           `json:"rowsReturned,omitempty"`
}

// SecurityMetrics represents security-related metrics
type SecurityMetrics struct {
	RiskScore          int    `json:"riskScore"`
	ThreatLevel        string `json:"threatLevel"`
	FailedAttempts     int    `json:"failedAttempts"`
	AccountLocked      bool   `json:"accountLocked"`
	SuspiciousActivity bool   `json:"suspiciousActivity"`
	GeolocationCheck   bool   `json:"geolocationCheck"`
	DeviceFingerprint  string `json:"deviceFingerprint,omitempty"`
}

// PerformanceMetrics represents performance-related metrics
type PerformanceMetrics struct {
	RequestDuration time.Duration `json:"requestDurationMs"`
	DatabaseTime    time.Duration `json:"databaseTimeMs"`
	ValidationTime  time.Duration `json:"validationTimeMs"`
	EncryptionTime  time.Duration `json:"encryptionTimeMs"`
	MemoryUsage     uint64        `json:"memoryUsageBytes"`
	GoroutineCount  int           `json:"goroutineCount"`
}

// AuthLogger provides structured logging for authentication operations
type AuthLogger struct {
	logger *log.Logger
	level  LogLevel
}

// NewAuthLogger creates a new authentication logger
func NewAuthLogger() *AuthLogger {
	return &AuthLogger{
		logger: log.New(os.Stdout, "", 0),
		level:  LogLevelInfo,
	}
}

// SetLevel sets the minimum log level
func (l *AuthLogger) SetLevel(level LogLevel) {
	l.level = level
}

// Debug logs a debug message
func (l *AuthLogger) Debug(category LogCategory, operation string, details map[string]interface{}) {
	success := true
	l.log(LogLevelDebug, category, operation, nil, nil, "", "", "", &success, "", "", details, nil, nil, nil)
}

// Info logs an info message
func (l *AuthLogger) Info(category LogCategory, operation string, details map[string]interface{}) {
	success := true
	l.log(LogLevelInfo, category, operation, nil, nil, "", "", "", &success, "", "", details, nil, nil, nil)
}

// Warn logs a warning message
func (l *AuthLogger) Warn(category LogCategory, operation string, details map[string]interface{}) {
	success := false
	l.log(LogLevelWarn, category, operation, nil, nil, "", "", "", &success, "", "", details, nil, nil, nil)
}

// Error logs an error message
func (l *AuthLogger) Error(category LogCategory, operation string, err error, details map[string]interface{}) {
	errorCode := ""
	errorMessage := ""
	if err != nil {
		errorCode = "UNKNOWN_ERROR"
		errorMessage = err.Error()
	}
	success := false
	l.log(LogLevelError, category, operation, nil, nil, "", "", "", &success, errorCode, errorMessage, details, nil, nil, nil)
}

// LogAuthOperation logs a complete authentication operation
func (l *AuthLogger) LogAuthOperation(
	level LogLevel,
	category LogCategory,
	operation string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent, requestID string,
	duration *time.Duration,
	success *bool,
	errorCode, errorMessage string,
	details map[string]interface{},
) {
	l.log(level, category, operation, userID, sessionID, ipAddress, userAgent, requestID, success, errorCode, errorMessage, details, duration, nil, nil)
}

// LogDatabaseOperation logs a database operation with metrics
func (l *AuthLogger) LogDatabaseOperation(
	operation string,
	userID *uuid.UUID,
	success bool,
	duration time.Duration,
	metrics *DatabaseMetrics,
	err error,
) {
	details := map[string]interface{}{
		"database_metrics": metrics,
	}

	errorCode := ""
	errorMessage := ""
	if err != nil {
		errorCode = "DATABASE_ERROR"
		errorMessage = err.Error()
	}

	l.log(LogLevelInfo, CategoryDatabase, operation, userID, nil, "", "", "", &success, errorCode, errorMessage, details, &duration, nil, nil)
}

// LogSecurityEvent logs a security-related event
func (l *AuthLogger) LogSecurityEvent(
	operation string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent string,
	metrics *SecurityMetrics,
	details map[string]interface{},
) {
	if details == nil {
		details = make(map[string]interface{})
	}
	details["security_metrics"] = metrics

	level := LogLevelInfo
	if metrics.RiskScore > 7 || metrics.SuspiciousActivity {
		level = LogLevelWarn
	}
	if metrics.RiskScore > 9 {
		level = LogLevelError
	}

	l.log(level, CategorySecurity, operation, userID, sessionID, ipAddress, userAgent, "", nil, "", "", details, nil, nil, metrics)
}

// LogPerformanceMetrics logs performance metrics
func (l *AuthLogger) LogPerformanceMetrics(
	operation string,
	userID *uuid.UUID,
	metrics *PerformanceMetrics,
	details map[string]interface{},
) {
	if details == nil {
		details = make(map[string]interface{})
	}
	details["performance_metrics"] = metrics

	level := LogLevelInfo
	if metrics.RequestDuration > 5*time.Second {
		level = LogLevelWarn
	}
	if metrics.RequestDuration > 10*time.Second {
		level = LogLevelError
	}

	l.log(level, CategoryPerformance, operation, userID, nil, "", "", "", nil, "", "", details, &metrics.RequestDuration, metrics, nil)
}

// LogMiddlewareExecution logs middleware execution details
func (l *AuthLogger) LogMiddlewareExecution(
	middlewareName string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent, requestID string,
	duration time.Duration,
	success bool,
	statusCode int,
	details map[string]interface{},
) {
	if details == nil {
		details = make(map[string]interface{})
	}
	details["middleware_name"] = middlewareName
	details["status_code"] = statusCode

	l.log(LogLevelInfo, CategoryMiddleware, "middleware_execution", userID, sessionID, ipAddress, userAgent, requestID, &success, "", "", details, &duration, nil, nil)
}

// LogRateLimitEvent logs rate limiting events
func (l *AuthLogger) LogRateLimitEvent(
	operation string,
	identifier string,
	ipAddress string,
	attempts int,
	maxAttempts int,
	windowStart time.Time,
	blocked bool,
	details map[string]interface{},
) {
	if details == nil {
		details = make(map[string]interface{})
	}
	details["identifier"] = identifier
	details["attempts"] = attempts
	details["max_attempts"] = maxAttempts
	details["window_start"] = windowStart
	details["blocked"] = blocked

	level := LogLevelInfo
	if blocked {
		level = LogLevelWarn
	}

	success := !blocked
	l.log(level, CategoryRateLimit, operation, nil, nil, ipAddress, "", "", &success, "", "", details, nil, nil, nil)
}

// LogPasswordEvent logs password-related operations
func (l *AuthLogger) LogPasswordEvent(
	operation string,
	userID *uuid.UUID,
	ipAddress, userAgent string,
	success bool,
	passwordStrength string,
	details map[string]interface{},
) {
	if details == nil {
		details = make(map[string]interface{})
	}
	details["password_strength"] = passwordStrength

	level := LogLevelInfo
	if !success {
		level = LogLevelWarn
	}

	l.log(level, CategoryPassword, operation, userID, nil, ipAddress, userAgent, "", &success, "", "", details, nil, nil, nil)
}

// LogSessionEvent logs session management operations
func (l *AuthLogger) LogSessionEvent(
	operation string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent string,
	success bool,
	sessionExpiry *time.Time,
	details map[string]interface{},
) {
	if details == nil {
		details = make(map[string]interface{})
	}
	if sessionExpiry != nil {
		details["session_expiry"] = sessionExpiry
	}

	l.log(LogLevelInfo, CategorySession, operation, userID, sessionID, ipAddress, userAgent, "", &success, "", "", details, nil, nil, nil)
}

// Private method to handle actual logging
func (l *AuthLogger) log(
	level LogLevel,
	category LogCategory,
	operation string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent, requestID string,
	success *bool,
	errorCode, errorMessage string,
	details map[string]interface{},
	duration *time.Duration,
	perfMetrics *PerformanceMetrics,
	secMetrics *SecurityMetrics,
) {
	if !l.shouldLog(level) {
		return
	}

	// Get caller information
	_, file, line, ok := runtime.Caller(3)
	if !ok {
		file = "unknown"
		line = 0
	}

	pc, _, _, ok := runtime.Caller(3)
	function := "unknown"
	if ok {
		function = runtime.FuncForPC(pc).Name()
	}

	entry := AuthLogEntry{
		Timestamp:    time.Now().UTC(),
		Level:        level,
		Category:     category,
		Operation:    operation,
		UserID:       userID,
		SessionID:    sessionID,
		IPAddress:    ipAddress,
		UserAgent:    userAgent,
		RequestID:    requestID,
		Duration:     duration,
		Success:      success,
		ErrorCode:    errorCode,
		ErrorMessage: errorMessage,
		Details:      details,
		File:         file,
		Line:         line,
		Function:     function,
	}

	// Add stack trace for errors
	if level == LogLevelError || level == LogLevelFatal {
		entry.StackTrace = l.getStackTrace()
	}

	// Serialize and log
	jsonData, err := json.Marshal(entry)
	if err != nil {
		l.logger.Printf("Failed to marshal log entry: %v", err)
		return
	}

	l.logger.Println(string(jsonData))
}

// shouldLog checks if the log level should be logged
func (l *AuthLogger) shouldLog(level LogLevel) bool {
	levels := map[LogLevel]int{
		LogLevelDebug: 0,
		LogLevelInfo:  1,
		LogLevelWarn:  2,
		LogLevelError: 3,
		LogLevelFatal: 4,
	}

	return levels[level] >= levels[l.level]
}

// getStackTrace returns the current stack trace
func (l *AuthLogger) getStackTrace() string {
	buf := make([]byte, 4096)
	n := runtime.Stack(buf, false)
	return string(buf[:n])
}

// Global logger instance
var GlobalAuthLogger = NewAuthLogger()

// Convenience functions for global logger
func Debug(category LogCategory, operation string, details map[string]interface{}) {
	GlobalAuthLogger.Debug(category, operation, details)
}

func Info(category LogCategory, operation string, details map[string]interface{}) {
	GlobalAuthLogger.Info(category, operation, details)
}

func Warn(category LogCategory, operation string, details map[string]interface{}) {
	GlobalAuthLogger.Warn(category, operation, details)
}

func Error(category LogCategory, operation string, err error, details map[string]interface{}) {
	GlobalAuthLogger.Error(category, operation, err, details)
}

func LogAuthOperation(
	level LogLevel,
	category LogCategory,
	operation string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent, requestID string,
	duration *time.Duration,
	success *bool,
	errorCode, errorMessage string,
	details map[string]interface{},
) {
	GlobalAuthLogger.LogAuthOperation(level, category, operation, userID, sessionID, ipAddress, userAgent, requestID, duration, success, errorCode, errorMessage, details)
}

func LogDatabaseOperation(
	operation string,
	userID *uuid.UUID,
	success bool,
	duration time.Duration,
	metrics *DatabaseMetrics,
	err error,
) {
	GlobalAuthLogger.LogDatabaseOperation(operation, userID, success, duration, metrics, err)
}

func LogSecurityEvent(
	operation string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent string,
	metrics *SecurityMetrics,
	details map[string]interface{},
) {
	GlobalAuthLogger.LogSecurityEvent(operation, userID, sessionID, ipAddress, userAgent, metrics, details)
}

func LogPerformanceMetrics(
	operation string,
	userID *uuid.UUID,
	metrics *PerformanceMetrics,
	details map[string]interface{},
) {
	GlobalAuthLogger.LogPerformanceMetrics(operation, userID, metrics, details)
}

func LogMiddlewareExecution(
	middlewareName string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent, requestID string,
	duration time.Duration,
	success bool,
	statusCode int,
	details map[string]interface{},
) {
	GlobalAuthLogger.LogMiddlewareExecution(middlewareName, userID, sessionID, ipAddress, userAgent, requestID, duration, success, statusCode, details)
}

func LogRateLimitEvent(
	operation string,
	identifier string,
	ipAddress string,
	attempts int,
	maxAttempts int,
	windowStart time.Time,
	blocked bool,
	details map[string]interface{},
) {
	GlobalAuthLogger.LogRateLimitEvent(operation, identifier, ipAddress, attempts, maxAttempts, windowStart, blocked, details)
}

func LogPasswordEvent(
	operation string,
	userID *uuid.UUID,
	ipAddress, userAgent string,
	success bool,
	passwordStrength string,
	details map[string]interface{},
) {
	GlobalAuthLogger.LogPasswordEvent(operation, userID, ipAddress, userAgent, success, passwordStrength, details)
}

func LogSessionEvent(
	operation string,
	userID *uuid.UUID,
	sessionID *string,
	ipAddress, userAgent string,
	success bool,
	sessionExpiry *time.Time,
	details map[string]interface{},
) {
	GlobalAuthLogger.LogSessionEvent(operation, userID, sessionID, ipAddress, userAgent, success, sessionExpiry, details)
}
