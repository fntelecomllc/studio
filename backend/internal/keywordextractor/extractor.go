package keywordextractor

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/fntelecomllc/studio/backend/internal/models" // Changed to models.KeywordRule
	"golang.org/x/net/html"
)

// KeywordExtractionResult holds the details of a single keyword match.
type KeywordExtractionResult struct {
	MatchedPattern string   `json:"matchedPattern"`
	MatchedText    string   `json:"matchedText"`
	Category       string   `json:"category,omitempty"`
	Contexts       []string `json:"contexts,omitempty"`
}

// CleanHTMLToText parses HTML content and extracts clean, searchable text.
func CleanHTMLToText(htmlBody string) (string, error) {
	doc, err := html.Parse(strings.NewReader(htmlBody))
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	var extract func(*html.Node)
	extract = func(n *html.Node) {
		if n.Type == html.TextNode {
			trimmedData := strings.TrimSpace(n.Data)
			if trimmedData != "" {
				sb.WriteString(trimmedData)
				sb.WriteString(" ")
			}
		} else if n.Type == html.ElementNode &&
			(n.Data == "script" || n.Data == "style" || n.Data == "noscript" || n.Data == "head" || n.Data == "title" || n.Data == "nav" || n.Data == "footer" || n.Data == "aside") {
			return
		} else if n.Type == html.ElementNode && n.Data == "br" {
			sb.WriteString(" ")
		}

		for c := n.FirstChild; c != nil; c = c.NextSibling {
			extract(c)
		}

		if n.Type == html.ElementNode {
			switch n.Data {
			case "p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "article", "section", "header":
				sb.WriteString(" ")
			}
		}
	}

	extract(doc)
	cleanedText := strings.Join(strings.Fields(sb.String()), " ")
	return cleanedText, nil
}

// ExtractKeywordsFromText extracts keywords from already cleaned plain text based on a set of model rules.
// Regex rules are compiled on-the-fly here. For performance with many calls, pre-compile regexes.
func ExtractKeywordsFromText(plainTextContent string, rules []models.KeywordRule) ([]KeywordExtractionResult, error) {
	results := []KeywordExtractionResult{}
	if strings.TrimSpace(plainTextContent) == "" {
		return results, nil // No text content to search
	}

	for _, rule := range rules {
		var allMatches [][]int

		switch rule.RuleType {
		case models.KeywordRuleTypeRegex:
			re, err := regexp.Compile(rule.Pattern) // Compile regex for each rule
			if err != nil {
				// Log or return error for bad regex pattern
				return nil, fmt.Errorf("failed to compile regex pattern '%s' for rule %s: %w", rule.Pattern, rule.ID, err)
			}
			allMatches = re.FindAllStringIndex(plainTextContent, -1)
		case models.KeywordRuleTypeString:
			searchPattern := rule.Pattern
			textContentToSearch := plainTextContent
			if !rule.IsCaseSensitive {
				searchPattern = strings.ToLower(searchPattern)
				textContentToSearch = strings.ToLower(textContentToSearch)
			}
			idx := 0
			for {
				foundIdx := strings.Index(textContentToSearch[idx:], searchPattern)
				if foundIdx == -1 {
					break
				}
				actualFoundIdx := idx + foundIdx
				allMatches = append(allMatches, []int{actualFoundIdx, actualFoundIdx + len(searchPattern)})
				idx = actualFoundIdx + len(searchPattern)
				if idx >= len(textContentToSearch) {
					break
				}
			}
		default:
			continue // Skip unknown rule type
		}

		for _, matchIndices := range allMatches {
			start := matchIndices[0]
			end := matchIndices[1]
			matchedText := plainTextContent[start:end]

			var contexts []string
			if rule.ContextChars > 0 {
				contextStart := start - rule.ContextChars
				if contextStart < 0 {
					contextStart = 0
				}
				contextEnd := end + rule.ContextChars
				if contextEnd > len(plainTextContent) {
					contextEnd = len(plainTextContent)
				}
				contexts = append(contexts, plainTextContent[contextStart:contextEnd])
			}

			result := KeywordExtractionResult{
				MatchedPattern: rule.Pattern,
				MatchedText:    matchedText,
				Category:       rule.Category.String, // Use .String from sql.NullString
				Contexts:       contexts,
			}
			results = append(results, result)
		}
	}
	return results, nil
}

// ExtractKeywords (from HTML) now uses ExtractKeywordsFromText after cleaning HTML.
func ExtractKeywords(htmlContent []byte, rules []models.KeywordRule) ([]KeywordExtractionResult, error) {
	plainTextContent, err := CleanHTMLToText(string(htmlContent))
	if err != nil {
		return nil, fmt.Errorf("failed to clean HTML content: %w", err)
	}
	return ExtractKeywordsFromText(plainTextContent, rules)
}
