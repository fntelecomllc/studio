package config

// import "time" // Removed unused import

const (
	dnsPersonasConfigFilename       = "dns_personas.config.json"
	httpPersonasConfigFilename      = "http_personas.config.json"
	proxiesConfigFilename           = "proxies.config.json"
	keywordsConfigFilename          = "keywords.config.json"
	DefaultRateLimitDPS             = 10.0
	DefaultRateLimitBurst           = 5
	DefaultHTTPRateLimitDPS         = 5.0
	DefaultHTTPRateLimitBurst       = 3
	DefaultSystemAPIKeyPlaceholder  = "SET_A_REAL_KEY_IN_CONFIG_OR_ENV_d9f8s7d9f8s7d9f8"
	DefaultStreamChunkSize          = 200
	DefaultGinMode                  = "debug"
	DefaultDBMaxOpenConns           = 25
	DefaultDBMaxIdleConns           = 25
	DefaultDBConnMaxLifetimeMinutes = 5

	// WorkerConfig Defaults
	DefaultNumWorkers                  = 5
	DefaultPollIntervalSeconds         = 5
	DefaultErrorRetryDelaySeconds      = 30
	DefaultMaxJobRetries               = 3
	DefaultJobProcessingTimeoutMinutes = 15

	// HTTPValidatorConfig Defaults
	DefaultHTTPUserAgent                   = "DomainFlowBot/1.2 (DefaultStudioAgent)"
	DefaultMaxBodyReadBytes          int64 = 10 * 1024 * 1024 // 10MB
	DefaultHTTPFollowRedirects             = true
	DefaultHTTPRequestTimeoutSeconds       = 15
	DefaultHTTPMaxRedirects                = 7
)

// DefaultAppConfigJSON returns the default application configuration as an AppConfigJSON struct.
func DefaultAppConfigJSON() AppConfigJSON {
	defaultFollowRedirects := DefaultHTTPFollowRedirects
	return AppConfigJSON{
		Server: ServerConfig{
			Port:                     "8080",
			APIKey:                   DefaultSystemAPIKeyPlaceholder,
			StreamChunkSize:          DefaultStreamChunkSize,
			GinMode:                  DefaultGinMode,
			DBMaxOpenConns:           DefaultDBMaxOpenConns,
			DBMaxIdleConns:           DefaultDBMaxIdleConns,
			DBConnMaxLifetimeMinutes: DefaultDBConnMaxLifetimeMinutes,
		},
		Worker: WorkerConfig{
			NumWorkers:                  DefaultNumWorkers,
			PollIntervalSeconds:         DefaultPollIntervalSeconds,
			ErrorRetryDelaySeconds:      DefaultErrorRetryDelaySeconds,
			MaxJobRetries:               DefaultMaxJobRetries,
			JobProcessingTimeoutMinutes: DefaultJobProcessingTimeoutMinutes,
		},
		DNSValidator: DNSValidatorConfigJSON{
			Resolvers: []string{
				"https://cloudflare-dns.com/dns-query", "1.1.1.1:53",
				"https://dns.google/dns-query", "8.8.8.8:53",
			},
			UseSystemResolvers:         false,
			QueryTimeoutSeconds:        5,
			MaxDomainsPerRequest:       100,
			ResolverStrategy:           "random_rotation",
			ConcurrentQueriesPerDomain: 1,
			QueryDelayMinMs:            0,
			QueryDelayMaxMs:            50,
			MaxConcurrentGoroutines:    10,
			RateLimitDPS:               DefaultRateLimitDPS,
			RateLimitBurst:             DefaultRateLimitBurst,
		},
		HTTPValidator: HTTPValidatorConfigJSON{
			DefaultUserAgent: DefaultHTTPUserAgent,
			UserAgents: []string{
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
			},
			DefaultHeaders: map[string]string{
				"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
			},
			RequestTimeoutSeconds:   DefaultHTTPRequestTimeoutSeconds,
			MaxRedirects:            DefaultHTTPMaxRedirects,
			FollowRedirects:         &defaultFollowRedirects,
			MaxDomainsPerRequest:    50,
			AllowInsecureTLS:        false,
			MaxConcurrentGoroutines: 15,
			RateLimitDPS:            DefaultHTTPRateLimitDPS,
			RateLimitBurst:          DefaultHTTPRateLimitBurst,
			MaxBodyReadBytes:        DefaultMaxBodyReadBytes,
		},
		Logging: LoggingConfig{
			Level: "INFO",
		},
	}
}

// DefaultConfig initializes and returns a default AppConfig structure by converting DefaultAppConfigJSON.
func DefaultConfig() *AppConfig {
	return ConvertJSONToAppConfig(DefaultAppConfigJSON())
}
