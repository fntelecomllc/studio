package keywordscanner

import (
	"context" // Added context
	"fmt"
	"regexp" // Added for compiling regex rules
	"strings"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid" // For parsing keywordSetID string to UUID
)

// Service is responsible for scanning content for keywords.
// It now uses KeywordStore to fetch keyword sets and rules.
type Service struct {
	kStore store.KeywordStore
	// appConfig *config.AppConfig // Potentially remove if no other global configs are needed by scanner
}

// NewService creates a new keyword scanner service.
func NewService(ks store.KeywordStore /*, appCfg *config.AppConfig*/) *Service {
	return &Service{
		kStore: ks,
		// appConfig: appCfg,
	}
}

// CompiledKeywordRule holds a rule with its regex pre-compiled for efficiency.
type CompiledKeywordRule struct {
	models.KeywordRule
	CompiledRegex *regexp.Regexp
}

// ScanWithRules directly takes content and a list of already fetched and compiled rules.
// This is useful if the caller (e.g., HTTPKeywordCampaignService) has already fetched the rules.
func (s *Service) ScanWithRules(ctx context.Context, content []byte, rules []CompiledKeywordRule) ([]string, error) {
	if len(content) == 0 || len(rules) == 0 {
		return nil, nil
	}
	contentStrLower := strings.ToLower(string(content)) // Pre-convert content to lower for case-insensitive string matches
	var foundPatterns []string

	for _, rule := range rules {
		if rule.KeywordRule.Pattern == "" {
			continue
		}
		matched := false
		switch rule.KeywordRule.RuleType {
		case models.KeywordRuleTypeRegex:
			if rule.CompiledRegex != nil {
				if rule.CompiledRegex.Match(content) {
					matched = true
				}
			}
		case models.KeywordRuleTypeString:
			patternToMatch := rule.KeywordRule.Pattern
			contentToSearch := string(content)
			if !rule.KeywordRule.IsCaseSensitive {
				patternToMatch = strings.ToLower(rule.KeywordRule.Pattern)
				contentToSearch = contentStrLower
			}
			if strings.Contains(contentToSearch, patternToMatch) {
				matched = true
			}
		}

		if matched {
			// Decide what to return: rule.Pattern, rule.Category.String, or a more complex match object
			foundPatterns = append(foundPatterns, rule.KeywordRule.Pattern)
		}
	}
	return foundPatterns, nil
}

// ScanBySetIDs fetches keyword sets and their rules from the store and then scans content.
// Returns a map where keys are keywordSetIDs (string) and values are slices of matched keyword patterns.
func (s *Service) ScanBySetIDs(ctx context.Context, exec store.Querier, content []byte, keywordSetIDs []string) (map[string][]string, error) {
	if len(content) == 0 || len(keywordSetIDs) == 0 {
		return nil, nil
	}

	results := make(map[string][]string)
	contentStrLower := strings.ToLower(string(content))

	for _, setIDStr := range keywordSetIDs {
		setID_uuid, err := uuid.Parse(setIDStr)
		if err != nil {
			// Or log and continue: fmt.Errorf("invalid keywordSetID format '%s': %w", setIDStr, err)
			continue
		}

		// Fetch keyword set (primarily to confirm it exists and is enabled, though rules are fetched separately)
		kset, err := s.kStore.GetKeywordSetByID(ctx, exec, setID_uuid) // Pass exec as Querier
		if err != nil || !kset.IsEnabled {
			continue // Skip if set not found or not enabled
		}

		modelRules, err := s.kStore.GetKeywordRulesBySetID(ctx, exec, setID_uuid) // Pass exec as Querier
		if err != nil {
			// Or log and continue: fmt.Errorf("failed to fetch rules for keyword set %s: %w", setIDStr, err)
			continue
		}
		if len(modelRules) == 0 {
			continue
		}

		var compiledRules []CompiledKeywordRule
		for _, mr := range modelRules {
			cr := CompiledKeywordRule{KeywordRule: mr}
			if mr.RuleType == models.KeywordRuleTypeRegex {
				re, compErr := regexp.Compile(mr.Pattern) // Compile regex here
				if compErr == nil {
					cr.CompiledRegex = re
				} else {
					// Log regex compilation error and skip this rule
					fmt.Printf("Error compiling regex for rule %s (pattern: %s): %v\n", mr.ID.String(), mr.Pattern, compErr)
					continue
				}
			}
			compiledRules = append(compiledRules, cr)
		}

		var foundInSet []string
		for _, rule := range compiledRules {
			if rule.KeywordRule.Pattern == "" {
				continue
			}
			matched := false
			switch rule.KeywordRule.RuleType {
			case models.KeywordRuleTypeRegex:
				if rule.CompiledRegex != nil && rule.CompiledRegex.Match(content) {
					matched = true
				}
			case models.KeywordRuleTypeString:
				patternToMatch := rule.KeywordRule.Pattern
				contentToSearch := string(content)
				if !rule.KeywordRule.IsCaseSensitive {
					patternToMatch = strings.ToLower(rule.KeywordRule.Pattern)
					contentToSearch = contentStrLower
				}
				if strings.Contains(contentToSearch, patternToMatch) {
					matched = true
				}
			}
			if matched {
				foundInSet = append(foundInSet, rule.KeywordRule.Pattern)
			}
		}

		if len(foundInSet) > 0 {
			results[setIDStr] = foundInSet
		}
	}
	return results, nil
}

// ScanAdHocKeywords scans content for a simple list of ad-hoc keyword strings (case-insensitive contains).
func (s *Service) ScanAdHocKeywords(ctx context.Context, content []byte, adHocKeywords []string) ([]string, error) {
	if len(content) == 0 || len(adHocKeywords) == 0 {
		return nil, nil
	}
	contentStrLower := strings.ToLower(string(content))
	var foundKeywords []string
	for _, keyword := range adHocKeywords {
		if strings.Contains(contentStrLower, strings.ToLower(keyword)) {
			foundKeywords = append(foundKeywords, keyword)
		}
	}
	return foundKeywords, nil
}
