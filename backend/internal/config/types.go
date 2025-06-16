// File: backend/internal/config/types.go
package config

import "time"

// TLSClientHelloConfig defines TLS client hello parameters.
type TLSClientHelloConfig struct {
	MinVersion       string   `json:"minVersion,omitempty"`
	MaxVersion       string   `json:"maxVersion,omitempty"`
	CipherSuites     []string `json:"cipherSuites,omitempty"`
	CurvePreferences []string `json:"curvePreferences,omitempty"`
}

// HTTP2SettingsConfig defines HTTP/2 specific settings.
type HTTP2SettingsConfig struct {
	Enabled *bool `json:"enabled,omitempty"`
}

// CookieHandlingConfig defines how cookies should be handled.
type CookieHandlingConfig struct {
	Mode string `json:"mode,omitempty"`
}

// LoggingConfig defines logging parameters.
type LoggingConfig struct {
	Level string `json:"level"`
}

// WorkerConfig defines settings for the background campaign workers.
type WorkerConfig struct {
	NumWorkers                    int `json:"numWorkers,omitempty"`
	PollIntervalSeconds           int `json:"pollIntervalSeconds,omitempty"`
	ErrorRetryDelaySeconds        int `json:"errorRetryDelaySeconds,omitempty"`
	MaxJobRetries                 int `json:"maxJobRetries,omitempty"`
	JobProcessingTimeoutMinutes   int `json:"jobProcessingTimeoutMinutes,omitempty"`
	DNSSubtaskConcurrency         int `json:"dnsSubtaskConcurrency,omitempty"`         // Added
	HTTPKeywordSubtaskConcurrency int `json:"httpKeywordSubtaskConcurrency,omitempty"` // Added
}

// ServerConfig defines server-specific settings.
type ServerConfig struct {
	Port                     string          `json:"port"`
	APIKey                   string          `json:"apiKey"`
	StreamChunkSize          int             `json:"streamChunkSize,omitempty"`
	GinMode                  string          `json:"ginMode,omitempty"`
	DBMaxOpenConns           int             `json:"dbMaxOpenConns,omitempty"`
	DBMaxIdleConns           int             `json:"dbMaxIdleConns,omitempty"`
	DBConnMaxLifetimeMinutes int             `json:"dbConnMaxLifetimeMinutes,omitempty"`
	DatabaseConfig           *DatabaseConfig `json:"database,omitempty"`
	AuthConfig               *AuthConfig     `json:"auth,omitempty"`
}

// DNSValidatorConfig holds the effective configuration for DNSValidator.
type DNSValidatorConfig struct {
	Resolvers                  []string
	UseSystemResolvers         bool
	QueryTimeout               time.Duration
	MaxDomainsPerRequest       int
	ResolverStrategy           string
	ResolversWeighted          map[string]int
	ResolversPreferredOrder    []string
	ConcurrentQueriesPerDomain int
	QueryDelayMin              time.Duration
	QueryDelayMax              time.Duration
	MaxConcurrentGoroutines    int
	RateLimitDPS               float64
	RateLimitBurst             int
	QueryTimeoutSeconds        int `json:"-"`
	JSONQueryDelayMinMs        int `json:"-"`
	JSONQueryDelayMaxMs        int `json:"-"`
}

// DNSValidatorConfigJSON is used for marshalling/unmarshalling DNSValidator settings.
type DNSValidatorConfigJSON struct {
	Resolvers                  []string       `json:"resolvers,omitempty"`
	UseSystemResolvers         bool           `json:"useSystemResolvers"`
	QueryTimeoutSeconds        int            `json:"queryTimeoutSeconds,omitempty"`
	MaxDomainsPerRequest       int            `json:"maxDomainsPerRequest,omitempty"`
	ResolverStrategy           string         `json:"resolverStrategy,omitempty"`
	ResolversWeighted          map[string]int `json:"resolversWeighted,omitempty"`
	ResolversPreferredOrder    []string       `json:"resolversPreferredOrder,omitempty"`
	ConcurrentQueriesPerDomain int            `json:"concurrentQueriesPerDomain,omitempty"`
	QueryDelayMinMs            int            `json:"queryDelayMinMs,omitempty"`
	QueryDelayMaxMs            int            `json:"queryDelayMaxMs,omitempty"`
	MaxConcurrentGoroutines    int            `json:"maxConcurrentGoroutines,omitempty"`
	RateLimitDPS               float64        `json:"rateLimitDps,omitempty"`
	RateLimitBurst             int            `json:"rateLimitBurst,omitempty"`
}

// HTTPValidatorConfig holds the effective configuration for HTTPValidator.
type HTTPValidatorConfig struct {
	DefaultUserAgent        string
	UserAgents              []string
	DefaultHeaders          map[string]string
	RequestTimeout          time.Duration
	MaxRedirects            int
	FollowRedirects         bool
	MaxDomainsPerRequest    int
	AllowInsecureTLS        bool
	MaxConcurrentGoroutines int
	RateLimitDPS            float64
	RateLimitBurst          int
	MaxBodyReadBytes        int64
	RequestTimeoutSeconds   int `json:"-"`
}

// HTTPValidatorConfigJSON is used for marshalling/unmarshalling HTTPValidator settings.
type HTTPValidatorConfigJSON struct {
	DefaultUserAgent        string            `json:"defaultUserAgent,omitempty"`
	UserAgents              []string          `json:"userAgents,omitempty"`
	DefaultHeaders          map[string]string `json:"defaultHeaders,omitempty"`
	RequestTimeoutSeconds   int               `json:"requestTimeoutSeconds,omitempty"`
	MaxRedirects            int               `json:"maxRedirects,omitempty"`
	FollowRedirects         *bool             `json:"followRedirects,omitempty"`
	MaxDomainsPerRequest    int               `json:"maxDomainsPerRequest,omitempty"`
	AllowInsecureTLS        bool              `json:"allowInsecureTLS"`
	MaxConcurrentGoroutines int               `json:"maxConcurrentGoroutines,omitempty"`
	RateLimitDPS            float64           `json:"rateLimitDps,omitempty"`
	RateLimitBurst          int               `json:"rateLimitBurst,omitempty"`
	MaxBodyReadBytes        int64             `json:"maxBodyReadBytes,omitempty"`
}

// AppConfigJSON defines the structure of the main config.json file.
// This struct is used to unmarshal the config.json file.
type AppConfigJSON struct {
	Server        ServerConfig            `json:"server"`
	Worker        WorkerConfig            `json:"worker,omitempty"` // WorkerConfig now includes the new fields
	DNSValidator  DNSValidatorConfigJSON  `json:"dnsValidator"`
	HTTPValidator HTTPValidatorConfigJSON `json:"httpValidator"`
	Logging       LoggingConfig           `json:"logging"`
}
