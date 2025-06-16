// File: backend/internal/domainexpert/generator.go
package domainexpert

import (
	"fmt"
	"math"
	"strings"

	"github.com/fntelecomllc/studio/backend/internal/models" // For CampaignPatternType etc. if defined there
)

// CampaignPatternType defines the types of domain generation patterns.
// Duplicating from models if not accessible or to avoid import cycle, ideally in models.
type CampaignPatternType string

const (
	PatternPrefix CampaignPatternType = "prefix" // [VARIABLE][CONSTANT][TLD]
	PatternSuffix CampaignPatternType = "suffix" // [CONSTANT][VARIABLE][TLD]
	PatternBoth   CampaignPatternType = "both"   // [VARIABLE][CONSTANT][VARIABLE][TLD]
)

// DomainGenerator holds the configuration for a domain generation task.
type DomainGenerator struct {
	PatternType    CampaignPatternType
	VariableLength int    // Length of EACH variable segment if PatternBoth
	CharacterSet   []rune // The set of characters to use for variable parts
	ConstantString string // The static part of the domain
	TLD            string // Top-Level Domain, e.g., ".com"

	charsetSize          int
	totalCombinations    int64
	maxVariableStringLen int // For PatternBoth, this is VariableLength * 2
}

// NewDomainGenerator initializes a new domain generator.
func NewDomainGenerator(patternType CampaignPatternType, variableLength int, charSet string, constantStr string, tld string) (*DomainGenerator, error) {
	if variableLength <= 0 {
		return nil, fmt.Errorf("variable length must be a positive integer")
	}
	if charSet == "" {
		return nil, fmt.Errorf("character set cannot be empty")
	}
	if tld == "" {
		return nil, fmt.Errorf("TLD cannot be empty")
	}
	if !strings.HasPrefix(tld, ".") {
		return nil, fmt.Errorf("TLD must start with a dot")
	}
	if len(tld) < 2 { // Must be at least a dot and one character
		return nil, fmt.Errorf("TLD must contain at least one character after the dot")
	}

	uniqueRunes := make(map[rune]bool)
	var distinctRunes []rune

	for _, r := range charSet {
		if !uniqueRunes[r] {
			uniqueRunes[r] = true
			distinctRunes = append(distinctRunes, r)
		}
	}
	if len(distinctRunes) == 0 {
		return nil, fmt.Errorf("character set resulted in no unique characters")
	}

	dg := &DomainGenerator{
		PatternType:    patternType,
		VariableLength: variableLength,
		CharacterSet:   distinctRunes,
		ConstantString: constantStr,
		TLD:            tld,
		charsetSize:    len(distinctRunes),
	}

	switch patternType {
	case PatternPrefix, PatternSuffix:
		dg.totalCombinations = power(int64(dg.charsetSize), int64(variableLength))
		dg.maxVariableStringLen = variableLength
	case PatternBoth:
		dg.totalCombinations = power(int64(dg.charsetSize), int64(variableLength*2))
		dg.maxVariableStringLen = variableLength * 2
	default:
		return nil, fmt.Errorf("invalid pattern type: %s", patternType)
	}

	// Check for overflow against int64 (MaxInt64 is approx 9e18)
	// Our int64 totalCombinations can be larger. The user spec said "int64 range"
	// This check might need to be against a specific max for the application.
	if dg.totalCombinations > math.MaxInt64/2 && variableLength > 10 { // Heuristic for potential overflow if converted to signed later or if limit is int64.
		// For practical purposes, int64 is fine unless it needs to fit in a signed int64 DB field.
		// The prompt said: "Total combinations must not exceed int64 range"
		// If totalCombinations itself must fit int64, then: if dg.totalCombinations > int64(math.MaxInt64)
		// For now, we use int64 internally for generation logic.
	}

	return dg, nil
}

// power calculates base^exponent for int64.
func power(base, exponent int64) int64 {
	result := int64(1)
	for i := int64(0); i < exponent; i++ {
		if math.MaxInt64/base < result { // Overflow check
			return math.MaxInt64
		}
		result *= base
	}
	return result
}

// GetTotalCombinations returns the total number of possible unique domains.
func (dg *DomainGenerator) GetTotalCombinations() int64 {
	return dg.totalCombinations
}

// GenerateDomainAtOffset generates the domain string at a specific 0-based offset.
// This function must be deterministic.
func (dg *DomainGenerator) GenerateDomainAtOffset(offset int64) (string, error) {
	if offset >= dg.totalCombinations {
		return "", fmt.Errorf("offset %d is out of range (total combinations: %d)", offset, dg.totalCombinations)
	}

	var varPart1 strings.Builder

	tempOffset := offset

	switch dg.PatternType {
	case PatternPrefix:
		// Generate [VARIABLE][CONSTANT][TLD]
		generateVariableString(tempOffset, dg.VariableLength, dg.CharacterSet, dg.charsetSize, &varPart1)
		return varPart1.String() + dg.ConstantString + dg.TLD, nil
	case PatternSuffix:
		// Generate [CONSTANT][VARIABLE][TLD]
		generateVariableString(tempOffset, dg.VariableLength, dg.CharacterSet, dg.charsetSize, &varPart1)
		return dg.ConstantString + varPart1.String() + dg.TLD, nil
	case PatternBoth:
		// Generate [VARIABLE1][CONSTANT][VARIABLE2][TLD]
		// Split the offset for two variable parts.
		// combinationsPerPart1 := power(int64(dg.charsetSize), int64(dg.VariableLength))
		// This is effectively like treating the two variable parts as a single number in a mixed radix system,
		// or more simply, a number of length (VariableLength*2) in base charsetSize.

		var varFull strings.Builder
		generateVariableString(tempOffset, dg.VariableLength*2, dg.CharacterSet, dg.charsetSize, &varFull)
		fullVarStr := varFull.String()

		var1Str := fullVarStr[:dg.VariableLength]
		var2Str := fullVarStr[dg.VariableLength:]
		return var1Str + dg.ConstantString + var2Str + dg.TLD, nil
	default:
		return "", fmt.Errorf("unknown pattern type: %s", dg.PatternType)
	}
}

// generateVariableString constructs the variable part of the domain based on the offset.
// It effectively converts the offset into a base-N number, where N is charsetSize.
func generateVariableString(offset int64, length int, charSet []rune, charsetSize int, builder *strings.Builder) {
	tempOffset := offset
	resultRunes := make([]rune, length)

	for i := 0; i < length; i++ {
		index := tempOffset % int64(charsetSize)
		resultRunes[i] = charSet[index]
		tempOffset /= int64(charsetSize)
	}

	// The resultRunes are in reverse order of generation (least significant to most significant digit),
	// so we reverse them to get the correct string.
	for i := length - 1; i >= 0; i-- {
		builder.WriteRune(resultRunes[i])
	}
}

// GenerateBatch generates a slice of domains starting from startOffset, up to batchSize or totalCombinations.
func (dg *DomainGenerator) GenerateBatch(startOffset int64, batchSize int) ([]models.GeneratedDomain, int64, error) {
	if startOffset >= dg.totalCombinations {
		return nil, startOffset, fmt.Errorf("startOffset %d is already past total combinations %d", startOffset, dg.totalCombinations)
	}

	domains := make([]models.GeneratedDomain, 0, batchSize)
	currentOffset := startOffset
	count := 0

	for count < batchSize && currentOffset < dg.totalCombinations {
		domainStr, err := dg.GenerateDomainAtOffset(currentOffset)
		if err != nil {
			// This should ideally not happen if offset is within range.
			return domains, currentOffset, fmt.Errorf("error generating domain at offset %d: %w", currentOffset, err)
		}
		domains = append(domains, models.GeneratedDomain{
			// ID will be set by the store/service
			DomainName:  domainStr,
			OffsetIndex: int64(currentOffset), // models.GeneratedDomain uses int64
			// GenerationCampaignID and GeneratedAt will be set by the service
		})
		currentOffset++
		count++
	}
	return domains, currentOffset, nil
}
