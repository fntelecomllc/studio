// File: backend/internal/config/config_test.go
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testConfigDir = "test_config_data"
const mainTestConfigFilename = "test_app_config.json"

func setupTestEnvironment(t *testing.T) (string, func()) {
	t.Helper()
	err := os.MkdirAll(testConfigDir, 0755)
	require.NoError(t, err, "Failed to create test config directory")

	// Create a minimal main config file for testing load
	defaultCfgJSON := DefaultAppConfigJSON()
	defaultCfgJSON.Server.APIKey = "test-api-key-from-default-json"
	defaultCfgJSON.Worker.NumWorkers = 3                // Change a worker default
	defaultCfgJSON.DNSValidator.QueryTimeoutSeconds = 7 // Change a DNS default
	defaultCfgJSON.HTTPValidator.MaxRedirects = 3       // Change an HTTP default

	mainConfigPath := filepath.Join(testConfigDir, mainTestConfigFilename)
	data, err := json.MarshalIndent(defaultCfgJSON, "", "  ")
	require.NoError(t, err)
	err = os.WriteFile(mainConfigPath, data, 0644)
	require.NoError(t, err)

	// Create dummy supplemental files
	dnsPersonas := []DNSPersona{
		{ID: uuid.NewString(), Name: "Test DNS Persona", Config: DNSValidatorConfigJSON{QueryTimeoutSeconds: 3}},
	}
	saveOrFail(t, dnsPersonas, filepath.Join(testConfigDir, dnsPersonasConfigFilename))

	httpPersonas := []HTTPPersona{
		{ID: uuid.NewString(), Name: "Test HTTP Persona", UserAgent: "TestAgent/1.0"},
	}
	saveOrFail(t, httpPersonas, filepath.Join(testConfigDir, httpPersonasConfigFilename))

	proxies := []ProxyConfigEntry{
		{ID: uuid.NewString(), Name: "Test Proxy", Protocol: "http", Address: "127.0.0.1:8080"},
	}
	saveOrFail(t, proxies, filepath.Join(testConfigDir, proxiesConfigFilename))

	keywordSets := []KeywordSet{
		{ID: uuid.NewString(), Name: "Test Keyword Set", Rules: []KeywordRule{{Pattern: "test", Type: "string"}}},
	}
	saveOrFail(t, keywordSets, filepath.Join(testConfigDir, keywordsConfigFilename))

	return mainConfigPath, func() {
		os.RemoveAll(testConfigDir)
	}
}

func saveOrFail(t *testing.T, data interface{}, path string) {
	t.Helper()
	jsonData, err := json.MarshalIndent(data, "", "  ")
	require.NoError(t, err)
	err = os.WriteFile(path, jsonData, 0644)
	require.NoError(t, err)
}

func TestLoadAppConfig(t *testing.T) {
	mainConfigPath, cleanup := setupTestEnvironment(t)
	defer cleanup()

	appCfg, err := Load(mainConfigPath)
	require.NoError(t, err, "Load should not return an error when config file exists")
	require.NotNil(t, appCfg, "AppConfig should not be nil")

	// Check main config loaded values
	assert.Equal(t, "test-api-key-from-default-json", appCfg.Server.APIKey)
	assert.Equal(t, 3, appCfg.Worker.NumWorkers)
	assert.Equal(t, 7*time.Second, appCfg.DNSValidator.QueryTimeout) // Check converted value
	assert.Equal(t, 3, appCfg.HTTPValidator.MaxRedirects)
	assert.Equal(t, mainConfigPath, appCfg.GetLoadedFromPath())

	// Check supplemental configs loaded
	assert.Len(t, appCfg.DNSPersonas, 1, "Should load DNS personas")
	if len(appCfg.DNSPersonas) > 0 {
		assert.Equal(t, "Test DNS Persona", appCfg.DNSPersonas[0].Name)
		assert.Equal(t, 3, appCfg.DNSPersonas[0].Config.QueryTimeoutSeconds)
	}

	assert.Len(t, appCfg.HTTPPersonas, 1, "Should load HTTP personas")
	if len(appCfg.HTTPPersonas) > 0 {
		assert.Equal(t, "Test HTTP Persona", appCfg.HTTPPersonas[0].Name)
	}

	assert.Len(t, appCfg.Proxies, 1, "Should load proxies")
	if len(appCfg.Proxies) > 0 {
		assert.Equal(t, "Test Proxy", appCfg.Proxies[0].Name)
	}

	assert.Len(t, appCfg.KeywordSets, 1, "Should load keyword sets")
	if len(appCfg.KeywordSets) > 0 {
		assert.Equal(t, "Test Keyword Set", appCfg.KeywordSets[0].Name)
		require.Len(t, appCfg.KeywordSets[0].Rules, 1)
		assert.Equal(t, "test", appCfg.KeywordSets[0].Rules[0].Pattern)
	}

	// Test regex compilation in keyword sets
	keywordSetsWithRegex := []KeywordSet{
		{
			ID:   uuid.NewString(),
			Name: "Regex Set",
			Rules: []KeywordRule{
				{Pattern: "^valid.*regex$", Type: "regex", CaseSensitive: true},
				{Pattern: "invalid[", Type: "regex"},      // Invalid regex
				{Pattern: "goodstring", Type: "string"},   // String type
				{Pattern: "", Type: "regex"},              // Empty regex pattern
				{Pattern: "unknown", Type: "unknownType"}, // Unknown type
			},
		},
	}
	regexKeywordPath := filepath.Join(testConfigDir, "regex_keywords.json")
	saveOrFail(t, keywordSetsWithRegex, regexKeywordPath)

	// Temporarily overwrite keywordsConfigFilename for this part of the test
	// This is a bit hacky; a better approach might involve passing configDir to LoadKeywordSets
	// or making keywordsConfigFilename a variable that can be changed for tests.
	// For this example, we'll reload the AppConfig with a different set of keyword files
	// by renaming the files, so Load will pick up the new one. This assumes LoadKeywordSets uses `keywordsConfigFilename` constant.

	originalKeywordsFilename := keywordsConfigFilename
	_ = os.Rename(filepath.Join(testConfigDir, originalKeywordsFilename), filepath.Join(testConfigDir, "keywords.config.json.bak"))
	_ = os.Rename(regexKeywordPath, filepath.Join(testConfigDir, originalKeywordsFilename))

	appCfgRegex, errRegex := Load(mainConfigPath) // Reload to pick up the new keyword file
	require.NoError(t, errRegex)
	require.Len(t, appCfgRegex.KeywordSets, 1)
	ks := appCfgRegex.KeywordSets[0]
	assert.Equal(t, "Regex Set", ks.Name)
	require.Len(t, ks.Rules, 5)
	assert.NotNil(t, ks.Rules[0].CompiledRegex, "Valid regex should be compiled")
	assert.Nil(t, ks.Rules[1].CompiledRegex, "Invalid regex should not be compiled")
	assert.Nil(t, ks.Rules[2].CompiledRegex, "String type should not have compiled regex")
	assert.Nil(t, ks.Rules[3].CompiledRegex, "Empty regex pattern should result in nil CompiledRegex")
	assert.Nil(t, ks.Rules[4].CompiledRegex, "Unknown type should not have compiled regex")

	// Restore original files
	_ = os.Rename(filepath.Join(testConfigDir, originalKeywordsFilename), regexKeywordPath) // rename back
	_ = os.Rename(filepath.Join(testConfigDir, "keywords.config.json.bak"), filepath.Join(testConfigDir, originalKeywordsFilename))

}

func TestLoadAppConfig_NonExistentMainConfig(t *testing.T) {
	cleanup := func() { os.RemoveAll(testConfigDir) } // Ensure cleanup even if setup fails
	err := os.MkdirAll(testConfigDir, 0755)
	require.NoError(t, err)
	defer cleanup()

	nonExistentPath := filepath.Join(testConfigDir, "does_not_exist.json")
	appCfg, err := Load(nonExistentPath)

	// Load should still return a default config and try to save it.
	// The error returned by Load reflects the *original* file read error if any,
	// or nil if a default was successfully loaded and saved.
	// Here, os.IsNotExist(err) would be true for the initial ReadFile.
	// After attempting to save, if successful, Load might return nil.
	// Let's check if a default config was created.
	require.NoError(t, err, "Load with non-existent main config should use defaults and attempt save, potentially returning nil error after save")
	require.NotNil(t, appCfg, "AppConfig should not be nil even if main config file doesn't exist")

	_, statErr := os.Stat(nonExistentPath)
	assert.NoError(t, statErr, "A default config file should have been created at the non-existent path")

	// Check some default values
	assert.Equal(t, DefaultAppConfigJSON().Server.Port, appCfg.Server.Port)
	assert.Equal(t, DefaultAppConfigJSON().Logging.Level, appCfg.Logging.Level)
	assert.Equal(t, nonExistentPath, appCfg.GetLoadedFromPath())

	// Supplemental files would not be loaded as their loading depends on configDir derived from mainConfigPath
	assert.Empty(t, appCfg.DNSPersonas, "DNS Personas should be empty if main config was defaulted (or loaded from empty dir)")
	assert.Empty(t, appCfg.HTTPPersonas)
	assert.Empty(t, appCfg.Proxies)
	assert.Empty(t, appCfg.KeywordSets)
}

func TestSaveAppConfig(t *testing.T) {
	mainConfigPath, cleanup := setupTestEnvironment(t)
	defer cleanup()

	appCfg, err := Load(mainConfigPath)
	require.NoError(t, err)
	require.NotNil(t, appCfg)

	// Modify some values
	originalAPIKey := appCfg.Server.APIKey
	appCfg.Server.APIKey = "new-saved-api-key"
	appCfg.Logging.Level = "DEBUG"
	appCfg.Worker.NumWorkers = 10

	err = SaveAppConfig(appCfg)
	require.NoError(t, err, "SaveAppConfig should not return an error")

	// Reload and check if changes were persisted
	reloadedCfg, err := Load(mainConfigPath)
	require.NoError(t, err)
	require.NotNil(t, reloadedCfg)

	assert.Equal(t, "new-saved-api-key", reloadedCfg.Server.APIKey)
	assert.Equal(t, "DEBUG", reloadedCfg.Logging.Level)
	assert.Equal(t, 10, reloadedCfg.Worker.NumWorkers)

	// Restore original value for other tests if setupTestEnvironment is reused across test functions
	// (not strictly necessary here as each test function has its own setup/cleanup)
	appCfg.Server.APIKey = originalAPIKey
}

func TestSupplementalFileLoading_MissingFile(t *testing.T) {
	mainConfigPath, cleanup := setupTestEnvironment(t)
	defer cleanup()

	// Remove one of the supplemental files
	dnsPersonasPath := filepath.Join(testConfigDir, dnsPersonasConfigFilename)
	err := os.Remove(dnsPersonasPath)
	require.NoError(t, err)

	appCfg, err := Load(mainConfigPath)
	require.NoError(t, err, "Load should not fail if a supplemental file is missing")
	require.NotNil(t, appCfg)

	assert.Empty(t, appCfg.DNSPersonas, "DNS Personas should be empty if its file is missing")
	assert.NotEmpty(t, appCfg.HTTPPersonas, "Other supplemental files should still load")
}

func TestDefaultConfigValues(t *testing.T) {
	defaultCfg := DefaultConfig()
	require.NotNil(t, defaultCfg)

	defaultJSON := DefaultAppConfigJSON()

	assert.Equal(t, defaultJSON.Server.Port, defaultCfg.Server.Port)
	assert.Equal(t, defaultJSON.Server.APIKey, defaultCfg.Server.APIKey)
	assert.Equal(t, DefaultStreamChunkSize, defaultCfg.Server.StreamChunkSize)

	assert.Equal(t, DefaultNumWorkers, defaultCfg.Worker.NumWorkers)

	assert.Equal(t, time.Duration(defaultJSON.DNSValidator.QueryTimeoutSeconds)*time.Second, defaultCfg.DNSValidator.QueryTimeout)
	assert.Equal(t, time.Duration(defaultJSON.HTTPValidator.RequestTimeoutSeconds)*time.Second, defaultCfg.HTTPValidator.RequestTimeout)
	assert.Equal(t, DefaultHTTPUserAgent, defaultCfg.HTTPValidator.DefaultUserAgent)
	assert.Equal(t, DefaultMaxBodyReadBytes, defaultCfg.HTTPValidator.MaxBodyReadBytes)
}

func TestGetPersonaByID(t *testing.T) {
	cfg := &AppConfig{
		DNSPersonas: []DNSPersona{
			{ID: "dns-1", Name: "DNS Alpha"},
			{ID: "dns-2", Name: "DNS Beta"},
		},
		HTTPPersonas: []HTTPPersona{
			{ID: "http-1", Name: "HTTP Gamma"},
		},
	}

	p, err := cfg.GetDNSPersonaConfigByID("dns-1")
	assert.NoError(t, err)
	assert.NotNil(t, p)
	assert.Equal(t, "DNS Alpha", p.Name)

	_, err = cfg.GetDNSPersonaConfigByID("non-existent")
	assert.Error(t, err)

	hp, err := cfg.GetHTTPPersonaByID("http-1")
	assert.NoError(t, err)
	assert.NotNil(t, hp)
	assert.Equal(t, "HTTP Gamma", hp.Name)
}

func TestGetProxyConfigByID(t *testing.T) {
	cfg := &AppConfig{
		Proxies: []ProxyConfigEntry{
			{ID: "proxy-1", Name: "Proxy One"},
		},
	}
	p, err := cfg.GetProxyConfigByID("proxy-1")
	assert.NoError(t, err)
	assert.NotNil(t, p)
	assert.Equal(t, "Proxy One", p.Name)

	_, err = cfg.GetProxyConfigByID("non-existent")
	assert.Error(t, err)
}

func TestGetKeywordSetByID(t *testing.T) {
	cfg := &AppConfig{
		KeywordSets: []KeywordSet{
			{ID: "ks-1", Name: "Keywords Alpha"},
		},
	}
	ks, err := cfg.GetKeywordSetByID("ks-1")
	assert.NoError(t, err)
	assert.NotNil(t, ks)
	assert.Equal(t, "Keywords Alpha", ks.Name)

	_, err = cfg.GetKeywordSetByID("non-existent")
	assert.Error(t, err)
}
