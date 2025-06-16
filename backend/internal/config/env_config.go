package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// LoadWithEnv loads configuration from JSON file and overrides with environment variables
func LoadWithEnv(mainConfigPath string) (*AppConfig, error) {
	// First load from JSON file
	appConfig, err := Load(mainConfigPath)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if appConfig == nil {
		appConfig = &AppConfig{}
	}

	// Override with environment variables
	applyEnvironmentOverrides(appConfig)

	// Load database configuration from environment
	dbConfig := loadDatabaseConfig()

	// Update the server config with database settings
	if dbConfig != nil {
		// Store database config in a way that can be accessed by the database connection code
		appConfig.Server.DatabaseConfig = dbConfig
	}

	// Note: AuthConfig in ServerConfig is the comprehensive auth configuration
	// from auth_config.go, not the simpler environment-based config.
	// The environment variables are used elsewhere in the application.

	return appConfig, nil
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	Host               string `json:"host"`
	Port               int    `json:"port"`
	Name               string `json:"name"`
	User               string `json:"user"`
	Password           string `json:"password"`
	SSLMode            string `json:"sslmode"`
	MaxConnections     int    `json:"maxConnections"`
	MaxIdleConnections int    `json:"maxIdleConnections"`
	ConnectionLifetime int    `json:"connectionLifetime"`
}

// EnvAuthConfig holds authentication settings from environment variables
type EnvAuthConfig struct {
	JWTSecret      string `json:"jwtSecret"`
	SessionSecret  string `json:"sessionSecret"`
	EncryptionKey  string `json:"encryptionKey"`
	APIKeySalt     string `json:"apiKeySalt"`
	SessionTimeout string `json:"sessionTimeout"`
	CookieSecure   bool   `json:"cookieSecure"`
	CookieHTTPOnly bool   `json:"cookieHttpOnly"`
	CookieSameSite string `json:"cookieSameSite"`
}

// Update ServerConfig to include database and auth configs
type EnhancedServerConfig struct {
	ServerConfig
	DatabaseConfig *DatabaseConfig `json:"database,omitempty"`
	AuthConfig     *EnvAuthConfig  `json:"auth,omitempty"`
}

func loadDatabaseConfig() *DatabaseConfig {
	config := &DatabaseConfig{
		Host:               getEnvOrDefault("DATABASE_HOST", "localhost"),
		Port:               getEnvAsInt("DATABASE_PORT", 5432),
		Name:               getEnvOrDefault("DATABASE_NAME", "domainflow_production"),
		User:               getEnvOrDefault("DATABASE_USER", "domainflow"),
		Password:           getEnvOrDefault("DATABASE_PASSWORD", ""),
		SSLMode:            getEnvOrDefault("DATABASE_SSL_MODE", "disable"),
		MaxConnections:     getEnvAsInt("DATABASE_MAX_CONNECTIONS", 100),
		MaxIdleConnections: getEnvAsInt("DATABASE_MAX_IDLE_CONNECTIONS", 20),
		ConnectionLifetime: getEnvAsInt("DATABASE_CONNECTION_LIFETIME", 600),
	}

	// Check if critical database config is missing
	if config.Password == "" {
		// Try to load from config.json as fallback
		if configData, err := os.ReadFile("config.json"); err == nil {
			var jsonConfig map[string]interface{}
			if err := json.Unmarshal(configData, &jsonConfig); err == nil {
				if dbSection, ok := jsonConfig["database"].(map[string]interface{}); ok {
					if pwd, ok := dbSection["password"].(string); ok {
						config.Password = pwd
					}
				}
			}
		}
	}

	return config
}

func loadAuthConfig() *EnvAuthConfig {
	return &EnvAuthConfig{
		JWTSecret:      getEnvOrDefault("JWT_SECRET", ""),
		SessionSecret:  getEnvOrDefault("SESSION_SECRET", ""),
		EncryptionKey:  getEnvOrDefault("ENCRYPTION_KEY", ""),
		APIKeySalt:     getEnvOrDefault("API_KEY_SALT", ""),
		SessionTimeout: getEnvOrDefault("SESSION_TIMEOUT", "24h"),
		CookieSecure:   getEnvAsBool("SESSION_COOKIE_SECURE", true),
		CookieHTTPOnly: getEnvAsBool("SESSION_COOKIE_HTTPONLY", true),
		CookieSameSite: getEnvOrDefault("SESSION_COOKIE_SAMESITE", "strict"),
	}
}

func applyEnvironmentOverrides(config *AppConfig) {
	// Server overrides
	if port := os.Getenv("SERVER_PORT"); port != "" {
		config.Server.Port = port
	}
	if ginMode := os.Getenv("GIN_MODE"); ginMode != "" {
		config.Server.GinMode = ginMode
	}

	// Worker overrides
	if numWorkers := getEnvAsInt("WORKER_COUNT", 0); numWorkers > 0 {
		config.Worker.NumWorkers = numWorkers
	}
	// Note: BatchSize doesn't exist in WorkerConfig
	if pollInterval := getEnvAsInt("WORKER_POLL_INTERVAL", 0); pollInterval > 0 {
		config.Worker.PollIntervalSeconds = pollInterval
	}

	// Logging overrides
	if logLevel := os.Getenv("LOG_LEVEL"); logLevel != "" {
		config.Logging.Level = logLevel
	}
	// Note: LogDirectory doesn't exist in LoggingConfig

	// DNS Validator overrides
	if rateLimitDPS := getEnvAsInt("DNS_RATE_LIMIT_DPS", 0); rateLimitDPS > 0 {
		config.DNSValidator.RateLimitDPS = float64(rateLimitDPS)
	}
	if rateLimitBurst := getEnvAsInt("DNS_RATE_LIMIT_BURST", 0); rateLimitBurst > 0 {
		config.DNSValidator.RateLimitBurst = rateLimitBurst
	}

	// HTTP Validator overrides
	if httpRateLimitDPS := getEnvAsInt("HTTP_RATE_LIMIT_DPS", 0); httpRateLimitDPS > 0 {
		config.HTTPValidator.RateLimitDPS = float64(httpRateLimitDPS)
	}
	if httpRateLimitBurst := getEnvAsInt("HTTP_RATE_LIMIT_BURST", 0); httpRateLimitBurst > 0 {
		config.HTTPValidator.RateLimitBurst = httpRateLimitBurst
	}
	if httpTimeout := getEnvAsInt("HTTP_TIMEOUT_SECONDS", 0); httpTimeout > 0 {
		config.HTTPValidator.RequestTimeoutSeconds = httpTimeout
	}
}

// Helper functions
func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		value = strings.ToLower(value)
		return value == "true" || value == "1" || value == "yes" || value == "on"
	}
	return defaultValue
}

// GetDatabaseDSN returns the database connection string
func GetDatabaseDSN(config *DatabaseConfig) string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		config.Host,
		config.Port,
		config.User,
		config.Password,
		config.Name,
		config.SSLMode,
	)
}
