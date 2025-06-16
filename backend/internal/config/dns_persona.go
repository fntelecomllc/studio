package config

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
)

// DNSPersona defines the structure for a DNS persona, including its specific DNS validator configuration.
type DNSPersona struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Config      DNSValidatorConfigJSON `json:"config"` // Uses the JSON variant for easy load/save
}

// LoadDNSPersonas loads DNS persona configurations from the specified file in configDir.
func LoadDNSPersonas(configDir string) ([]DNSPersona, error) {
	filePath := filepath.Join(configDir, dnsPersonasConfigFilename) // Uses constant from defaults.go
	var personas []DNSPersona
	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Config: DNS Personas config file '%s' not found. No DNS personas will be loaded.", filePath)
			return personas, nil // Return empty list, not an error, if file simply doesn't exist
		}
		return nil, fmt.Errorf("failed to read DNS Personas config file '%s': %w", filePath, err)
	}

	if err := json.Unmarshal(data, &personas); err != nil {
		return nil, fmt.Errorf("error unmarshalling DNS Personas from '%s': %w", filePath, err)
	}
	log.Printf("Config: Loaded %d DNS Personas from '%s'", len(personas), filePath)
	return personas, nil
}

// SaveDNSPersonas saves the DNS personas to their configuration file.
func SaveDNSPersonas(personas []DNSPersona, configDir string) error {
	filePath := filepath.Join(configDir, dnsPersonasConfigFilename) // Uses constant from defaults.go
	data, err := json.MarshalIndent(personas, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal DNS personas to JSON: %w", err)
	}
	if err := ioutil.WriteFile(filePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write DNS personas to file '%s': %w", filePath, err)
	}
	log.Printf("Config: Successfully saved %d DNS Personas to '%s'", len(personas), filePath)
	return nil
}
