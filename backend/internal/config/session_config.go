package config

import (
	"time"
)

// SessionSettings contains all session-related configuration
type SessionSettings struct {
	// Session duration and timeouts
	SessionDuration      time.Duration `json:"session_duration"`
	IdleTimeout          time.Duration `json:"idle_timeout"`
	CleanupInterval      time.Duration `json:"cleanup_interval"`
	MaxSessionsPerUser   int           `json:"max_sessions_per_user"`
	SessionIDLength      int           `json:"session_id_length"`

	// Security settings
	RequireIPMatch       bool `json:"require_ip_match"`
	RequireUAMatch       bool `json:"require_ua_match"`
	EnableFingerprinting bool `json:"enable_fingerprinting"`

	// Cookie settings
	CookieName           string `json:"cookie_name"`
	CookiePath           string `json:"cookie_path"`
	CookieDomain         string `json:"cookie_domain"`
	CookieSecure         bool   `json:"cookie_secure"`
	CookieHttpOnly       bool   `json:"cookie_http_only"`
	CookieSameSite       string `json:"cookie_same_site"` // "strict", "lax", "none"
	CookieMaxAge         int    `json:"cookie_max_age"`

	// CSRF Protection (without tokens)
	RequireOriginValidation bool     `json:"require_origin_validation"`
	RequireCustomHeader     bool     `json:"require_custom_header"`
	AllowedOrigins          []string `json:"allowed_origins"`
	CustomHeaderName        string   `json:"custom_header_name"`
	CustomHeaderValue       string   `json:"custom_header_value"`

	// Rate limiting
	RateLimitEnabled       bool          `json:"rate_limit_enabled"`
	RateLimitWindow        time.Duration `json:"rate_limit_window"`
	MaxLoginAttempts       int           `json:"max_login_attempts"`
	MaxSessionValidations  int           `json:"max_session_validations"`
}

// SessionConfig holds configuration for session management
type SessionConfig struct {
	Duration           time.Duration // 2 hours
	IdleTimeout        time.Duration // 30 minutes
	CleanupInterval    time.Duration // 5 minutes
	MaxSessionsPerUser int           // 5 sessions per user
	SessionIDLength    int           // 128 characters
	RequireIPMatch     bool          // Whether to require IP address match
	RequireUAMatch     bool          // Whether to require user agent match
}

// Cookie configuration
const (
	CookieDomain   = "" // Let browser decide
)

// GetDefaultSessionSettings returns default session configuration
func GetDefaultSessionSettings() *SessionSettings {
	return &SessionSettings{
		// Session duration and timeouts
		SessionDuration:      2 * time.Hour,
		IdleTimeout:          30 * time.Minute,
		CleanupInterval:      5 * time.Minute,
		MaxSessionsPerUser:   5,
		SessionIDLength:      128,

		// Security settings - conservative defaults
		RequireIPMatch:       false, // Disabled for flexibility with mobile/proxy usage
		RequireUAMatch:       false, // Disabled for flexibility with browser updates
		EnableFingerprinting: true,  // Enabled for enhanced security

		// Cookie settings for session-only authentication
		CookieName:     SessionCookieName,
		CookiePath:     CookiePath,
		CookieDomain:   CookieDomain,
		CookieSecure:   CookieSecure,   // HTTPS only in production
		CookieHttpOnly: CookieHttpOnly, // No JavaScript access
		CookieSameSite: "strict",       // Strong CSRF protection
		CookieMaxAge:   CookieMaxAge,

		// CSRF Protection without tokens
		RequireOriginValidation: true,
		RequireCustomHeader:     true,
		AllowedOrigins: []string{
			"https://localhost:3000",
			"http://localhost:3000", // Development only
		},
		CustomHeaderName:  "X-Requested-With",
		CustomHeaderValue: "XMLHttpRequest",

		// Rate limiting
		RateLimitEnabled:      true,
		RateLimitWindow:       15 * time.Minute,
		MaxLoginAttempts:      10,
		MaxSessionValidations: 1000, // High limit for normal session validation
	}
}

// GetProductionSessionSettings returns production-optimized session configuration
func GetProductionSessionSettings() *SessionSettings {
	settings := GetDefaultSessionSettings()
	
	// Production-specific overrides
	settings.RequireIPMatch = false       // Still disabled for production flexibility
	settings.RequireUAMatch = false       // Still disabled for production flexibility
	settings.EnableFingerprinting = true  // Enhanced security for production
	settings.CookieSecure = true          // Always HTTPS in production
	settings.AllowedOrigins = []string{
		"https://domainflow.app",
		"https://app.domainflow.com",
		"https://studio.domainflow.com",
	}
	
	return settings
}

// GetDevelopmentSessionSettings returns development-friendly session configuration
func GetDevelopmentSessionSettings() *SessionSettings {
	settings := GetDefaultSessionSettings()
	
	// Development-specific overrides
	settings.CookieSecure = false // Allow HTTP in development
	settings.AllowedOrigins = append(settings.AllowedOrigins,
		"http://localhost:3000",
		"http://localhost:3001",
		"http://127.0.0.1:3000",
		"http://127.0.0.1:3001",
	)
	
	return settings
}

// ToServiceConfig converts SessionSettings to SessionConfig
func (s *SessionSettings) ToServiceConfig() *SessionConfig {
	return &SessionConfig{
		Duration:           s.SessionDuration,
		IdleTimeout:        s.IdleTimeout,
		CleanupInterval:    s.CleanupInterval,
		MaxSessionsPerUser: s.MaxSessionsPerUser,
		SessionIDLength:    s.SessionIDLength,
		RequireIPMatch:     s.RequireIPMatch,
		RequireUAMatch:     s.RequireUAMatch,
	}
}

// ValidateOrigin checks if an origin is allowed
func (s *SessionSettings) ValidateOrigin(origin string) bool {
	if !s.RequireOriginValidation {
		return true
	}
	
	for _, allowed := range s.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

// ValidateCustomHeader checks if the custom header is present and valid
func (s *SessionSettings) ValidateCustomHeader(headerValue string) bool {
	if !s.RequireCustomHeader {
		return true
	}
	
	return headerValue == s.CustomHeaderValue
}

// IsSecureCookie returns whether cookies should be secure based on settings
func (s *SessionSettings) IsSecureCookie() bool {
	return s.CookieSecure
}

// GetCookieSameSiteMode returns the appropriate SameSite mode
func (s *SessionSettings) GetCookieSameSiteMode() string {
	return s.CookieSameSite
}

// SessionConfigManager manages session configuration for different environments
type SessionConfigManager struct {
	currentSettings *SessionSettings
	environment     string
}

// NewSessionConfigManager creates a new session configuration manager
func NewSessionConfigManager(environment string) *SessionConfigManager {
	var settings *SessionSettings
	
	switch environment {
	case "production":
		settings = GetProductionSessionSettings()
	case "development", "dev":
		settings = GetDevelopmentSessionSettings()
	default:
		settings = GetDefaultSessionSettings()
	}
	
	return &SessionConfigManager{
		currentSettings: settings,
		environment:     environment,
	}
}

// GetSettings returns the current session settings
func (m *SessionConfigManager) GetSettings() *SessionSettings {
	return m.currentSettings
}

// UpdateSettings updates the session settings
func (m *SessionConfigManager) UpdateSettings(settings *SessionSettings) {
	m.currentSettings = settings
}

// GetEnvironment returns the current environment
func (m *SessionConfigManager) GetEnvironment() string {
	return m.environment
}

// Security validation helpers

// IsValidSessionID validates session ID format and length
func IsValidSessionID(sessionID string) bool {
	if len(sessionID) < 32 || len(sessionID) > 256 {
		return false
	}
	
	// Check if it's a valid hex string
	for _, char := range sessionID {
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
			return false
		}
	}
	
	return true
}

// IsValidFingerprint validates session fingerprint format
func IsValidFingerprint(fingerprint string) bool {
	return len(fingerprint) >= 16 && len(fingerprint) <= 64
}

// Security constants for fingerprinting
const (
	MinFingerprintLength = 16
	MaxFingerprintLength = 64
	DefaultFingerprintAlgorithm = "sha256"
)

// Fingerprinting configuration
type FingerprintConfig struct {
	IncludeIP            bool `json:"include_ip"`
	IncludeUserAgent     bool `json:"include_user_agent"`
	IncludeScreenRes     bool `json:"include_screen_resolution"`
	IncludeTimezone      bool `json:"include_timezone"`
	IncludeLanguage      bool `json:"include_language"`
	HashAlgorithm        string `json:"hash_algorithm"`
	TruncateLength       int  `json:"truncate_length"`
}

// GetDefaultFingerprintConfig returns default fingerprinting configuration
func GetDefaultFingerprintConfig() *FingerprintConfig {
	return &FingerprintConfig{
		IncludeIP:        true,
		IncludeUserAgent: true,
		IncludeScreenRes: false, // Optional, may change frequently
		IncludeTimezone:  false, // Optional, privacy consideration
		IncludeLanguage:  false, // Optional, may change
		HashAlgorithm:    DefaultFingerprintAlgorithm,
		TruncateLength:   32, // 32 characters for balance of security and storage
	}
}
