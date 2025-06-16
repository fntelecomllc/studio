// File: backend/internal/config/app.go
package config

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"time"
)

// AppConfig is the main application configuration structure.
// It aggregates all other configuration parts.
type AppConfig struct {
	Server         ServerConfig        `json:"server"`
	Worker         WorkerConfig        `json:"worker"` // Added WorkerConfig
	DNSValidator   DNSValidatorConfig  `json:"dnsValidator"`
	HTTPValidator  HTTPValidatorConfig `json:"httpValidator"`
	Logging        LoggingConfig       `json:"logging"`
	DNSPersonas    []DNSPersona        `json:"dnsPersonas"`
	HTTPPersonas   []HTTPPersona       `json:"httpPersonas"`
	Proxies        []ProxyConfigEntry  `json:"proxies"`
	KeywordSets    []KeywordSet        `json:"keywordSets"`
	loadedFromPath string
}

// GetLoadedFromPath returns the file path from which the main config was loaded.
func (ac *AppConfig) GetLoadedFromPath() string {
	return ac.loadedFromPath
}

// GetDNSPersonaConfigByID retrieves a specific DNS persona configuration by its ID.
func (ac *AppConfig) GetDNSPersonaConfigByID(personaID string) (*DNSPersona, error) {
	for i := range ac.DNSPersonas {
		if ac.DNSPersonas[i].ID == personaID {
			return &ac.DNSPersonas[i], nil
		}
	}
	return nil, fmt.Errorf("DNS persona with ID '%s' not found in AppConfig", personaID)
}

// GetHTTPPersonaByID retrieves a specific HTTP persona configuration by its ID.
func (ac *AppConfig) GetHTTPPersonaByID(personaID string) (*HTTPPersona, error) {
	for i := range ac.HTTPPersonas {
		if ac.HTTPPersonas[i].ID == personaID {
			return &ac.HTTPPersonas[i], nil
		}
	}
	return nil, fmt.Errorf("HTTP persona with ID '%s' not found in AppConfig", personaID)
}

// GetProxyConfigByID retrieves a specific Proxy configuration by its ID.
func (ac *AppConfig) GetProxyConfigByID(proxyID string) (*ProxyConfigEntry, error) {
	for i := range ac.Proxies {
		if ac.Proxies[i].ID == proxyID {
			return &ac.Proxies[i], nil
		}
	}
	return nil, fmt.Errorf("proxy configuration with ID '%s' not found in AppConfig", proxyID)
}

// GetKeywordSetByID retrieves a specific KeywordSet by its ID.
func (ac *AppConfig) GetKeywordSetByID(keywordSetID string) (*KeywordSet, error) {
	for i := range ac.KeywordSets {
		if ac.KeywordSets[i].ID == keywordSetID {
			return &ac.KeywordSets[i], nil
		}
	}
	return nil, fmt.Errorf("keyword set with ID '%s' not found in AppConfig", keywordSetID)
}

// Load initializes the application configuration by reading config.json and supplemental files.
func Load(mainConfigPath string) (*AppConfig, error) {
	if mainConfigPath == "" {
		mainConfigPath = "config.json"
	}
	log.Printf("Config: Attempting to load main config from: %s", mainConfigPath)

	appCfgJSON := DefaultAppConfigJSON()
	var originalLoadError error

	data, err := ioutil.ReadFile(mainConfigPath)
	if err != nil {
		originalLoadError = err
		if os.IsNotExist(err) {
			log.Printf("Config: Main config file '%s' not found. Using defaults and attempting to save.", mainConfigPath)
			defaultAppCfg := ConvertJSONToAppConfig(appCfgJSON)
			defaultAppCfg.loadedFromPath = mainConfigPath
			if saveErr := SaveAppConfig(defaultAppCfg); saveErr != nil {
				log.Printf("Config: Failed to save default config file '%s': %v", mainConfigPath, saveErr)
				// If save fails, originalLoadError (file not found) is still the relevant error.
			} else {
				log.Printf("Config: Saved default config to '%s'", mainConfigPath)
				originalLoadError = nil // Successfully saved default, so no error for this specific case.
			}
		} else {
			log.Printf("Config: Error reading main config '%s': %v. Using defaults.", mainConfigPath, err)
		}
	} else {
		if errUnmarshal := json.Unmarshal(data, &appCfgJSON); errUnmarshal != nil {
			log.Printf("Config: Error unmarshalling main config '%s': %v. Using defaults for unparsed/defaulted fields.", mainConfigPath, errUnmarshal)
			originalLoadError = errUnmarshal
		}
	}

	appConfig := ConvertJSONToAppConfig(appCfgJSON)
	appConfig.loadedFromPath = mainConfigPath

	// Apply post-load defaults or sanity checks for fields not directly in AppConfigJSON root
	if appConfig.Server.StreamChunkSize <= 0 {
		appConfig.Server.StreamChunkSize = DefaultStreamChunkSize
	}
	// WorkerConfig defaults are applied within ConvertJSONToAppConfig
	// HTTPValidator defaults (like DefaultUserAgent, MaxBodyReadBytes) applied in ConvertJSONToHTTPConfig

	configDir := filepath.Dir(mainConfigPath)
	if mainConfigPath == "" || filepath.Base(mainConfigPath) == mainConfigPath {
		cwd, _ := os.Getwd()
		configDir = cwd
	}

	var loadErr error
	appConfig.DNSPersonas, loadErr = LoadDNSPersonas(configDir)
	if loadErr != nil {
		log.Printf("Config Notice: DNS Personas: %v", loadErr)
		appConfig.DNSPersonas = []DNSPersona{}
	}
	appConfig.HTTPPersonas, loadErr = LoadHTTPPersonas(configDir)
	if loadErr != nil {
		log.Printf("Config Notice: HTTP Personas: %v", loadErr)
		appConfig.HTTPPersonas = []HTTPPersona{}
	}
	appConfig.Proxies, loadErr = LoadProxies(configDir)
	if loadErr != nil {
		log.Printf("Config Notice: Proxies: %v", loadErr)
		appConfig.Proxies = []ProxyConfigEntry{}
	}
	appConfig.KeywordSets, loadErr = LoadKeywordSets(configDir)
	if loadErr != nil {
		log.Printf("Config Notice: Keyword Sets: %v", loadErr)
		appConfig.KeywordSets = []KeywordSet{}
	}

	return appConfig, originalLoadError
}

// SaveAppConfig saves the main application configuration (AppConfig) to its loadedFromPath.
func SaveAppConfig(cfg *AppConfig) error {
	if cfg.loadedFromPath == "" {
		return fmt.Errorf("cannot save AppConfig, loadedFromPath is empty")
	}
	appCfgJSON := ConvertAppConfigToJSON(cfg)
	data, err := json.MarshalIndent(appCfgJSON, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal app config to JSON: %w", err)
	}
	if err := ioutil.WriteFile(cfg.loadedFromPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write app config to file '%s': %w", cfg.loadedFromPath, err)
	}
	log.Printf("Config: Successfully saved main configuration to '%s'", cfg.loadedFromPath)
	return nil
}

// ConvertJSONToAppConfig converts the JSON structure (AppConfigJSON) to the internal AppConfig model.
func ConvertJSONToAppConfig(jsonCfg AppConfigJSON) *AppConfig {
	appCfg := &AppConfig{
		Server:        jsonCfg.Server,
		Worker:        ConvertJSONToWorkerConfig(jsonCfg.Worker), // Convert WorkerConfig
		DNSValidator:  ConvertJSONToDNSConfig(jsonCfg.DNSValidator),
		HTTPValidator: ConvertJSONToHTTPConfig(jsonCfg.HTTPValidator),
		Logging:       jsonCfg.Logging,
	}

	if appCfg.Server.GinMode == "" {
		appCfg.Server.GinMode = DefaultGinMode
	}
	if appCfg.Server.DBMaxOpenConns == 0 {
		appCfg.Server.DBMaxOpenConns = DefaultDBMaxOpenConns
	}
	if appCfg.Server.DBMaxIdleConns == 0 {
		appCfg.Server.DBMaxIdleConns = DefaultDBMaxIdleConns
	}
	if appCfg.Server.DBConnMaxLifetimeMinutes == 0 {
		appCfg.Server.DBConnMaxLifetimeMinutes = DefaultDBConnMaxLifetimeMinutes
	}

	return appCfg
}

// ConvertAppConfigToJSON converts the internal AppConfig model to the AppConfigJSON structure for saving.
func ConvertAppConfigToJSON(appCfg *AppConfig) AppConfigJSON {
	return AppConfigJSON{
		Server:        appCfg.Server,
		Worker:        ConvertWorkerConfigToJSON(appCfg.Worker), // Convert WorkerConfig
		DNSValidator:  ConvertDNSConfigToJSON(appCfg.DNSValidator),
		HTTPValidator: ConvertHTTPConfigToJSON(appCfg.HTTPValidator),
		Logging:       appCfg.Logging,
	}
}

// ConvertJSONToWorkerConfig applies defaults to WorkerConfig from JSON.
func ConvertJSONToWorkerConfig(jsonCfg WorkerConfig) WorkerConfig {
	cfg := jsonCfg // Start with values from JSON
	if cfg.NumWorkers <= 0 {
		cfg.NumWorkers = DefaultNumWorkers
	}
	if cfg.PollIntervalSeconds <= 0 {
		cfg.PollIntervalSeconds = DefaultPollIntervalSeconds
	}
	if cfg.ErrorRetryDelaySeconds <= 0 {
		cfg.ErrorRetryDelaySeconds = DefaultErrorRetryDelaySeconds
	}
	if cfg.MaxJobRetries <= 0 {
		cfg.MaxJobRetries = DefaultMaxJobRetries
	}
	if cfg.JobProcessingTimeoutMinutes <= 0 {
		cfg.JobProcessingTimeoutMinutes = DefaultJobProcessingTimeoutMinutes
	}
	return cfg
}

// ConvertWorkerConfigToJSON prepares WorkerConfig for JSON (currently same structure).
func ConvertWorkerConfigToJSON(cfg WorkerConfig) WorkerConfig {
	return cfg // No specific conversion needed if JSON struct is same as internal
}

// ConvertJSONToDNSConfig, ConvertDNSConfigToJSON, ConvertJSONToHTTPConfig, ConvertHTTPConfigToJSON
// remain largely the same but ensure they handle their respective defaults correctly.

func ConvertJSONToDNSConfig(jsonCfg DNSValidatorConfigJSON) DNSValidatorConfig {
	cfg := DNSValidatorConfig{
		Resolvers:                  jsonCfg.Resolvers,
		UseSystemResolvers:         jsonCfg.UseSystemResolvers,
		QueryTimeout:               time.Duration(jsonCfg.QueryTimeoutSeconds) * time.Second,
		MaxDomainsPerRequest:       jsonCfg.MaxDomainsPerRequest,
		ResolverStrategy:           jsonCfg.ResolverStrategy,
		ResolversWeighted:          jsonCfg.ResolversWeighted,
		ResolversPreferredOrder:    jsonCfg.ResolversPreferredOrder,
		ConcurrentQueriesPerDomain: jsonCfg.ConcurrentQueriesPerDomain,
		QueryDelayMin:              time.Duration(jsonCfg.QueryDelayMinMs) * time.Millisecond,
		QueryDelayMax:              time.Duration(jsonCfg.QueryDelayMaxMs) * time.Millisecond,
		MaxConcurrentGoroutines:    jsonCfg.MaxConcurrentGoroutines,
		RateLimitDPS:               jsonCfg.RateLimitDPS,
		RateLimitBurst:             jsonCfg.RateLimitBurst,
		QueryTimeoutSeconds:        jsonCfg.QueryTimeoutSeconds,
		JSONQueryDelayMinMs:        jsonCfg.QueryDelayMinMs,
		JSONQueryDelayMaxMs:        jsonCfg.QueryDelayMaxMs,
	}
	if cfg.QueryTimeout == 0 {
		cfg.QueryTimeout = 5 * time.Second
		cfg.QueryTimeoutSeconds = 5
	}
	if cfg.MaxDomainsPerRequest == 0 {
		cfg.MaxDomainsPerRequest = 100
	}
	if cfg.ResolverStrategy == "" {
		cfg.ResolverStrategy = "random_rotation"
	}
	if cfg.ConcurrentQueriesPerDomain == 0 {
		cfg.ConcurrentQueriesPerDomain = 1
	}
	if cfg.MaxConcurrentGoroutines == 0 {
		cfg.MaxConcurrentGoroutines = 10
	}
	if cfg.RateLimitDPS == 0 && jsonCfg.RateLimitDPS == 0 {
		cfg.RateLimitDPS = DefaultRateLimitDPS
	}
	if cfg.RateLimitBurst == 0 && jsonCfg.RateLimitBurst == 0 {
		cfg.RateLimitBurst = DefaultRateLimitBurst
	}
	return cfg
}

func ConvertDNSConfigToJSON(cfg DNSValidatorConfig) DNSValidatorConfigJSON {
	// Ensure original JSON int values are used if they were set
	jsonQueryTimeout := cfg.QueryTimeoutSeconds
	if jsonQueryTimeout == 0 && cfg.QueryTimeout > 0 { // If internal duration was set but original int was 0/missing
		jsonQueryTimeout = int(cfg.QueryTimeout.Seconds())
	}
	jsonDelayMinMs := cfg.JSONQueryDelayMinMs
	if jsonDelayMinMs == 0 && cfg.QueryDelayMin > 0 {
		jsonDelayMinMs = int(cfg.QueryDelayMin.Milliseconds())
	}
	jsonDelayMaxMs := cfg.JSONQueryDelayMaxMs
	if jsonDelayMaxMs == 0 && cfg.QueryDelayMax > 0 {
		jsonDelayMaxMs = int(cfg.QueryDelayMax.Milliseconds())
	}

	return DNSValidatorConfigJSON{
		Resolvers:                  cfg.Resolvers,
		UseSystemResolvers:         cfg.UseSystemResolvers,
		QueryTimeoutSeconds:        jsonQueryTimeout,
		MaxDomainsPerRequest:       cfg.MaxDomainsPerRequest,
		ResolverStrategy:           cfg.ResolverStrategy,
		ResolversWeighted:          cfg.ResolversWeighted,
		ResolversPreferredOrder:    cfg.ResolversPreferredOrder,
		ConcurrentQueriesPerDomain: cfg.ConcurrentQueriesPerDomain,
		QueryDelayMinMs:            jsonDelayMinMs,
		QueryDelayMaxMs:            jsonDelayMaxMs,
		MaxConcurrentGoroutines:    cfg.MaxConcurrentGoroutines,
		RateLimitDPS:               cfg.RateLimitDPS,
		RateLimitBurst:             cfg.RateLimitBurst,
	}
}

func ConvertJSONToHTTPConfig(jsonCfg HTTPValidatorConfigJSON) HTTPValidatorConfig {
	followRedirectsDefault := true
	if jsonCfg.FollowRedirects != nil {
		followRedirectsDefault = *jsonCfg.FollowRedirects
	}
	cfg := HTTPValidatorConfig{
		DefaultUserAgent:        jsonCfg.DefaultUserAgent,
		UserAgents:              jsonCfg.UserAgents,
		DefaultHeaders:          jsonCfg.DefaultHeaders,
		RequestTimeout:          time.Duration(jsonCfg.RequestTimeoutSeconds) * time.Second,
		MaxRedirects:            jsonCfg.MaxRedirects,
		FollowRedirects:         followRedirectsDefault,
		MaxDomainsPerRequest:    jsonCfg.MaxDomainsPerRequest,
		AllowInsecureTLS:        jsonCfg.AllowInsecureTLS,
		MaxConcurrentGoroutines: jsonCfg.MaxConcurrentGoroutines,
		RateLimitDPS:            jsonCfg.RateLimitDPS,
		RateLimitBurst:          jsonCfg.RateLimitBurst,
		MaxBodyReadBytes:        jsonCfg.MaxBodyReadBytes,
		RequestTimeoutSeconds:   jsonCfg.RequestTimeoutSeconds,
	}
	if cfg.DefaultUserAgent == "" {
		cfg.DefaultUserAgent = DefaultHTTPUserAgent
	}
	if cfg.RequestTimeout == 0 {
		cfg.RequestTimeout = 15 * time.Second
		cfg.RequestTimeoutSeconds = 15
	}
	if cfg.MaxRedirects == 0 {
		cfg.MaxRedirects = 7
	}
	if cfg.MaxDomainsPerRequest == 0 {
		cfg.MaxDomainsPerRequest = 50
	}
	if cfg.MaxConcurrentGoroutines == 0 {
		cfg.MaxConcurrentGoroutines = 15
	}
	if cfg.RateLimitDPS == 0 && jsonCfg.RateLimitDPS == 0 {
		cfg.RateLimitDPS = DefaultHTTPRateLimitDPS
	}
	if cfg.RateLimitBurst == 0 && jsonCfg.RateLimitBurst == 0 {
		cfg.RateLimitBurst = DefaultHTTPRateLimitBurst
	}
	if cfg.MaxBodyReadBytes == 0 {
		cfg.MaxBodyReadBytes = DefaultMaxBodyReadBytes
	}
	return cfg
}

func ConvertHTTPConfigToJSON(cfg HTTPValidatorConfig) HTTPValidatorConfigJSON {
	followRedirectsPtr := new(bool)
	*followRedirectsPtr = cfg.FollowRedirects

	jsonTimeoutSeconds := cfg.RequestTimeoutSeconds
	if jsonTimeoutSeconds == 0 && cfg.RequestTimeout > 0 {
		jsonTimeoutSeconds = int(cfg.RequestTimeout.Seconds())
	}

	return HTTPValidatorConfigJSON{
		DefaultUserAgent:        cfg.DefaultUserAgent,
		UserAgents:              cfg.UserAgents,
		DefaultHeaders:          cfg.DefaultHeaders,
		RequestTimeoutSeconds:   jsonTimeoutSeconds,
		MaxRedirects:            cfg.MaxRedirects,
		FollowRedirects:         followRedirectsPtr,
		MaxDomainsPerRequest:    cfg.MaxDomainsPerRequest,
		AllowInsecureTLS:        cfg.AllowInsecureTLS,
		MaxConcurrentGoroutines: cfg.MaxConcurrentGoroutines,
		RateLimitDPS:            cfg.RateLimitDPS,
		RateLimitBurst:          cfg.RateLimitBurst,
		MaxBodyReadBytes:        cfg.MaxBodyReadBytes,
	}
}
