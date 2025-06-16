package config

// Cookie names - shared between frontend and backend
const (
	SessionCookieName    = "sessionId"
	AuthTokensCookieName = "auth_tokens"

	// Legacy cookie name for backward compatibility
	LegacySessionCookieName = "domainflow_session"
)

// Cookie settings
const (
	CookieMaxAge   = 7200 // 2 hours in seconds (as per security audit)
	CookiePath     = "/"
	CookieSecure   = true // HTTPS only for production security
	CookieHttpOnly = true
	CookieSameSite = "Strict"
)
