package config

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// KeywordRule defines a single rule for extracting keywords.
// Ensure Type is either "string" or "regex".
// CompiledRegex is populated internally if Type is "regex", not from JSON.
type KeywordRule struct {
	ID            string         `json:"id,omitempty"`
	Pattern       string         `json:"pattern"`
	Type          string         `json:"type"` // "string" or "regex"
	CaseSensitive bool           `json:"caseSensitive"`
	Category      string         `json:"category,omitempty"`
	ContextChars  int            `json:"contextChars,omitempty"` // Characters for context snippet
	CompiledRegex *regexp.Regexp `json:"-"`                      // Not stored in JSON, compiled at load time
}

// KeywordSet groups related keyword rules.
type KeywordSet struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Description string        `json:"description,omitempty"`
	Rules       []KeywordRule `json:"rules"`
}

// LoadKeywordSets loads keyword definitions from the configuration file.
func LoadKeywordSets(configDir string) ([]KeywordSet, error) {
	filePath := filepath.Join(configDir, keywordsConfigFilename) // Uses constant from defaults.go
	var keywordSets []KeywordSet
	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("Config: Keyword Sets config file '%s' not found. No keyword sets will be loaded.", filePath)
			return keywordSets, nil
		}
		return nil, fmt.Errorf("failed to read Keyword Sets config file '%s': %w", filePath, err)
	}

	if err := json.Unmarshal(data, &keywordSets); err != nil {
		return nil, fmt.Errorf("error unmarshalling Keyword Sets from '%s': %w", filePath, err)
	}

	// Pre-compile regex patterns
	for i, ks := range keywordSets {
		for j, rule := range ks.Rules {
			if strings.ToLower(rule.Type) == "regex" {
				if rule.Pattern == "" {
					log.Printf("Config Warning: Keyword set '%s' ('%s'), Rule ID '%s' (or index %d) is of type regex but has empty pattern. Skipping compilation.", ks.ID, ks.Name, rule.ID, j)
					continue
				}
				patternToCompile := rule.Pattern
				if !rule.CaseSensitive {
					patternToCompile = "(?i)" + rule.Pattern // Apply case-insensitivity flag directly to regex
				}
				compiled, err := regexp.Compile(patternToCompile)
				if err != nil {
					log.Printf("Config Warning: Failed to compile regex for keyword set '%s' ('%s'), Rule ID '%s' (pattern: '%s'): %v. This rule will be skipped.", ks.ID, ks.Name, rule.ID, rule.Pattern, err)
					keywordSets[i].Rules[j].CompiledRegex = nil
				} else {
					keywordSets[i].Rules[j].CompiledRegex = compiled
				}
			} else if strings.ToLower(rule.Type) != "string" {
				log.Printf("Config Warning: Keyword set '%s' ('%s'), Rule ID '%s' (or index %d) has unknown type '%s'. It should be 'string' or 'regex'. This rule may not function as expected.", ks.ID, ks.Name, rule.ID, j, rule.Type)
			}
		}
	}

	log.Printf("Config: Loaded %d Keyword Sets from '%s'", len(keywordSets), filePath)
	return keywordSets, nil
}

// TODO: Add SaveKeywordSets if needed in the future.
