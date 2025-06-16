package config

// Cookie names - shared between frontend and backend
const (
	SessionCookieName    = "domainflow_session"  // Fixed to match frontend expectation
	AuthTokensCookieName = "auth_tokens"

	// Legacy cookie name for backward compatibility
	LegacySessionCookieName = "sessionId"  // Swapped: old name is now legacy
)

// Cookie settings
const (
	CookieMaxAge   = 7200 // 2 hours in seconds (as per security audit)
	CookiePath     = "/"
	CookieSecure   = false // Disabled for development (HTTP localhost)
	CookieHttpOnly = true
	CookieSameSite = "Lax" // More flexible for development
)
