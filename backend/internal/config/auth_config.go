package config

import "time"

// AuthConfig holds authentication-related configuration
type AuthConfig struct {
	// Password security
	BcryptCost        int    `json:"bcryptCost" mapstructure:"bcrypt_cost"`
	PepperKey         string `json:"pepperKey" mapstructure:"pepper_key"`
	PasswordMinLength int    `json:"passwordMinLength" mapstructure:"password_min_length"`

	// Session configuration
	SessionDuration     time.Duration `json:"sessionDuration" mapstructure:"session_duration"`
	SessionIdleTimeout  time.Duration `json:"sessionIdleTimeout" mapstructure:"session_idle_timeout"`
	SessionCookieName   string        `json:"sessionCookieName" mapstructure:"session_cookie_name"`
	SessionCookieDomain string        `json:"sessionCookieDomain" mapstructure:"session_cookie_domain"`
	SessionCookieSecure bool          `json:"sessionCookieSecure" mapstructure:"session_cookie_secure"`

	// Token configuration
	ResetTokenExpiry time.Duration `json:"resetTokenExpiry" mapstructure:"reset_token_expiry"`

	// Account lockout
	MaxFailedAttempts   int           `json:"maxFailedAttempts" mapstructure:"max_failed_attempts"`
	AccountLockDuration time.Duration `json:"accountLockDuration" mapstructure:"account_lock_duration"`

	// Rate limiting
	RateLimitWindow          time.Duration `json:"rateLimitWindow" mapstructure:"rate_limit_window"`
	MaxLoginAttempts         int           `json:"maxLoginAttempts" mapstructure:"max_login_attempts"`
	MaxPasswordResetAttempts int           `json:"maxPasswordResetAttempts" mapstructure:"max_password_reset_attempts"`

	// CAPTCHA configuration
	RecaptchaSiteKey   string `json:"recaptchaSiteKey" mapstructure:"recaptcha_site_key"`
	RecaptchaSecretKey string `json:"recaptchaSecretKey" mapstructure:"recaptcha_secret_key"`
	CaptchaThreshold   int    `json:"captchaThreshold" mapstructure:"captcha_threshold"`

	// Email configuration (for password reset)
	SMTPHost     string `json:"smtpHost" mapstructure:"smtp_host"`
	SMTPPort     int    `json:"smtpPort" mapstructure:"smtp_port"`
	SMTPUsername string `json:"smtpUsername" mapstructure:"smtp_username"`
	SMTPPassword string `json:"smtpPassword" mapstructure:"smtp_password"`
	FromEmail    string `json:"fromEmail" mapstructure:"from_email"`
	FromName     string `json:"fromName" mapstructure:"from_name"`
}

// GetDefaultAuthConfig returns default authentication configuration
func GetDefaultAuthConfig() AuthConfig {
	return AuthConfig{
		BcryptCost:               12,
		PepperKey:                "", // Must be set via environment variable
		PasswordMinLength:        12,
		SessionDuration:          120 * time.Minute, // 120 minutes to match frontend production configuration
		SessionIdleTimeout:       30 * time.Minute,
		SessionCookieName:        "domainflow_session",
		SessionCookieDomain:      "",
		SessionCookieSecure:      true,
		ResetTokenExpiry:         15 * time.Minute,
		MaxFailedAttempts:        5,
		AccountLockDuration:      15 * time.Minute,
		RateLimitWindow:          15 * time.Minute,
		MaxLoginAttempts:         10,
		MaxPasswordResetAttempts: 5,
		CaptchaThreshold:         3,
		SMTPPort:                 587,
		FromName:                 "DomainFlow",
	}
}
