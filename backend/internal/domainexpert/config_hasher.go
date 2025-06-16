// File: backend/internal/domainexpert/config_hasher.go
package domainexpert

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json" // Was missing from original snippet, but json.Marshal is used
	"fmt"
	"sort"
	"strings"

	"github.com/fntelecomllc/studio/backend/internal/models" // Assuming NormalizedDomainGenerationParams is here
	"golang.org/x/exp/slog"                                  // Assuming this is your logging library
)

// GenerateDomainGenerationConfigHashInput is a subset of DomainGenerationCampaignParams used for hashing.
// It is effectively the same as models.NormalizedDomainGenerationParams but defined here for clarity of input.
type GenerateDomainGenerationConfigHashInput struct { // Corrected: 'type' keyword moved here
	PatternType    string
	VariableLength int
	CharacterSet   string
	ConstantString string
	TLD            string
}

// GenerateDomainGenerationConfigHashResult holds the generated hash and the normalized params used.
type GenerateDomainGenerationConfigHashResult struct { // Corrected: 'type' keyword moved here
	HashString       string
	NormalizedParams models.NormalizedDomainGenerationParams // Assuming this type exists in models
}

// GenerateDomainGenerationConfigHash creates a stable hash for a given set of domain generation parameters.
// It normalizes the parameters (e.g., sorts CharacterSet) before hashing to ensure consistency.
// It returns the hex-encoded SHA256 hash string and the normalized parameters used for hashing.
func GenerateDomainGenerationConfigHash(params models.DomainGenerationCampaignParams) (*GenerateDomainGenerationConfigHashResult, error) {
	// Normalize CharacterSet: convert to lowercase and sort characters
	var charSetValue string
	if params.CharacterSet != nil {
		charSetValue = *params.CharacterSet
	} else {
		// Decide behavior if CharacterSet is nil. For hashing, an empty string might be acceptable.
		// If it's a required field for generation, an error should have been caught earlier.
		slog.Warn("GenerateDomainGenerationConfigHash: params.CharacterSet is nil, using empty string for hashing.")
	}
	charSet := strings.ToLower(charSetValue)
	chars := strings.Split(charSet, "")
	sort.Strings(chars)
	normalizedCharSet := strings.Join(chars, "")

	// Normalize TLD: convert to lowercase and remove leading/trailing dots if any, ensure single leading dot.
	normalizedTLD := strings.ToLower(strings.Trim(params.TLD, "."))
	if normalizedTLD != "" && !strings.HasPrefix(normalizedTLD, ".") {
		normalizedTLD = "." + normalizedTLD
	}

	// Assuming models.NormalizedDomainGenerationParams is defined in your models package like this:
	// type NormalizedDomainGenerationParams struct {
	//     PatternType    string `json:"patternType"`
	//     VariableLength int    `json:"variableLength"`
	//     CharacterSet   string `json:"characterSet"`
	//     ConstantString string `json:"constantString"`
	//     TLD            string `json:"tld"`
	// }
	var varLengthValue int
	if params.VariableLength != nil {
		varLengthValue = *params.VariableLength
	} else {
		slog.Warn("GenerateDomainGenerationConfigHash: params.VariableLength is nil, using 0 for hashing.")
		// Or return an error: return nil, fmt.Errorf("VariableLength cannot be nil for hashing")
	}

	var constStrValue string
	if params.ConstantString != nil {
		constStrValue = *params.ConstantString
	} else {
		slog.Warn("GenerateDomainGenerationConfigHash: params.ConstantString is nil, using empty string for hashing.")
	}

	normalizedParams := models.NormalizedDomainGenerationParams{
		PatternType:    strings.ToLower(params.PatternType), // Also normalize PatternType to lowercase for consistency
		VariableLength: varLengthValue,
		CharacterSet:   normalizedCharSet,
		ConstantString: constStrValue, // Assuming ConstantString is case-sensitive as per generation logic
		TLD:            normalizedTLD,
	}

	// Marshal the normalized struct to JSON for hashing
	// Using JSON ensures a stable representation if new fields are added (though order isn't guaranteed by spec, it's often stable for structs)
	// For absolute stability, one might construct a canonical string representation manually as in previous versions.
	jsonData, err := json.Marshal(normalizedParams)
	if err != nil {
		slog.Error("Failed to marshal normalized params for hashing", "error", err, "params", normalizedParams)
		return nil, fmt.Errorf("failed to marshal normalized params for hashing: %w", err) // Added fmt.Errorf
	}

	hash := sha256.Sum256(jsonData)
	hashString := hex.EncodeToString(hash[:])

	return &GenerateDomainGenerationConfigHashResult{
		HashString:       hashString,
		NormalizedParams: normalizedParams,
	}, nil
}
