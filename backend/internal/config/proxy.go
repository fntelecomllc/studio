package config

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
)

// ProxyConfigEntry defines the structure for a single proxy configuration.
type ProxyConfigEntry struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Protocol    string `json:"protocol"` // e.g., "http", "https", "socks5"
	Address     string `json:"address"`  // e.g., "127.0.0.1:8080"
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	Notes       string `json:"notes,omitempty"`
	UserEnabled *bool  `json:"userEnabled,omitempty"` // Pointer to distinguish not set, true, false. Defaults to true if nil.
}

// LoadProxies loads proxy configurations from the specified file in configDir.
func LoadProxies(configDir string) ([]ProxyConfigEntry, error) {
	filePath := filepath.Join(configDir, proxiesConfigFilename) // Uses constant from defaults.go
	var proxies []ProxyConfigEntry
	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Config: Proxies config file '%s' not found. No pre-defined proxies will be loaded.", filePath)
			return proxies, nil
		}
		return nil, fmt.Errorf("failed to read Proxies config file '%s': %w", filePath, err)
	}

	if err := json.Unmarshal(data, &proxies); err != nil {
		return nil, fmt.Errorf("error unmarshalling Proxies config file '%s': %w", filePath, err)
	}

	// Default UserEnabled to true if nil (not present in JSON or explicitly set to null)
	for i := range proxies {
		if proxies[i].UserEnabled == nil {
			defaultValue := true
			proxies[i].UserEnabled = &defaultValue
		}
	}

	log.Printf("Config: Loaded %d Proxies from '%s'", len(proxies), filePath)
	return proxies, nil
}

// SaveProxies saves the proxy configurations to their file.
func SaveProxies(proxies []ProxyConfigEntry, configDir string) error {
	filePath := filepath.Join(configDir, proxiesConfigFilename) // Uses constant from defaults.go
	data, err := json.MarshalIndent(proxies, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal proxies to JSON: %w", err)
	}
	if err := ioutil.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write proxies to file '%s': %w", filePath, err)
	}
	log.Printf("Config: Successfully saved %d proxies to '%s'", len(proxies), filePath)
	return nil
}
