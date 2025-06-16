package securityscanner

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// SecurityScanner analyzes security scan results
type SecurityScanner struct{}

// GosecResult represents a single vulnerability found by gosec
type GosecResult struct {
	Severity   string `json:"severity"`
	Confidence string `json:"confidence"`
	File       string `json:"file"`
	Line       int    `json:"line"`
	Column     int    `json:"column"`
	Message    string `json:"details"`
	Code       string `json:"code"`
}

// GosecResults represents the results of a gosec scan
type GosecResults struct {
	Issues []GosecResult `json:"Issues"`
}

// DependencyVulnerability represents a vulnerability in a dependency
type DependencyVulnerability struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Severity    string   `json:"severity"`
	CVSS        float64  `json:"cvss"`
	References  []string `json:"references"`
}

// DependencyResult represents a single dependency with vulnerabilities
type DependencyResult struct {
	Name            string                    `json:"name"`
	Version         string                    `json:"version"`
	Vulnerabilities []DependencyVulnerability `json:"vulnerabilities"`
}

// DependencyResults represents the results of a dependency check
type DependencyResults struct {
	Dependencies []DependencyResult `json:"dependencies"`
}

// SecurityScanResults contains all security scan results
type SecurityScanResults struct {
	GosecIssues          []GosecResult
	DependencyIssues     []DependencyResult
	TotalVulnerabilities int
	HighSeverityCount    int
	MediumSeverityCount  int
	LowSeverityCount     int
	UnknownSeverityCount int
}

// NewSecurityScanner creates a new SecurityScanner
func NewSecurityScanner() *SecurityScanner {
	return &SecurityScanner{}
}

// ParseResults parses the results of security scans
func (s *SecurityScanner) ParseResults(gosecData, dependencyData []byte) (*SecurityScanResults, error) {
	results := &SecurityScanResults{}

	// Parse gosec results
	var gosecResults GosecResults
	if err := json.Unmarshal(gosecData, &gosecResults); err != nil {
		return nil, fmt.Errorf("failed to parse gosec results: %w", err)
	}
	results.GosecIssues = gosecResults.Issues

	// Parse dependency check results
	var dependencyResults DependencyResults
	if err := json.Unmarshal(dependencyData, &dependencyResults); err != nil {
		return nil, fmt.Errorf("failed to parse dependency check results: %w", err)
	}

	// Filter dependencies with vulnerabilities
	for _, dep := range dependencyResults.Dependencies {
		if len(dep.Vulnerabilities) > 0 {
			results.DependencyIssues = append(results.DependencyIssues, dep)
		}
	}

	// Count vulnerabilities by severity
	for _, issue := range results.GosecIssues {
		results.TotalVulnerabilities++
		switch strings.ToLower(issue.Severity) {
		case "high":
			results.HighSeverityCount++
		case "medium":
			results.MediumSeverityCount++
		case "low":
			results.LowSeverityCount++
		default:
			results.UnknownSeverityCount++
		}
	}

	for _, dep := range results.DependencyIssues {
		for _, vuln := range dep.Vulnerabilities {
			results.TotalVulnerabilities++
			switch strings.ToLower(vuln.Severity) {
			case "high", "critical":
				results.HighSeverityCount++
			case "medium":
				results.MediumSeverityCount++
			case "low":
				results.LowSeverityCount++
			default:
				results.UnknownSeverityCount++
			}
		}
	}

	return results, nil
}

// GenerateReport generates a report of the security scan results
func (s *SecurityScanner) GenerateReport(results *SecurityScanResults) string {
	var report strings.Builder

	// Add header
	report.WriteString("# Security Scan Report\n\n")
	report.WriteString(fmt.Sprintf("Generated: %s\n\n", time.Now().Format(time.RFC3339)))

	// Add summary
	report.WriteString("## Summary\n\n")
	if results.TotalVulnerabilities == 0 {
		report.WriteString("✅ **No vulnerabilities found**\n\n")
	} else {
		report.WriteString(fmt.Sprintf("❌ **%d vulnerabilities found**\n\n", results.TotalVulnerabilities))
	}
	report.WriteString(fmt.Sprintf("- High Severity: %d\n", results.HighSeverityCount))
	report.WriteString(fmt.Sprintf("- Medium Severity: %d\n", results.MediumSeverityCount))
	report.WriteString(fmt.Sprintf("- Low Severity: %d\n", results.LowSeverityCount))
	report.WriteString(fmt.Sprintf("- Unknown Severity: %d\n\n", results.UnknownSeverityCount))

	// Add gosec issues
	if len(results.GosecIssues) > 0 {
		report.WriteString("## Code Vulnerabilities\n\n")
		for i, issue := range results.GosecIssues {
			report.WriteString(fmt.Sprintf("### %d. %s (%s)\n\n", i+1, issue.Message, issue.Severity))
			report.WriteString(fmt.Sprintf("- **File**: %s:%d\n", issue.File, issue.Line))
			report.WriteString(fmt.Sprintf("- **Confidence**: %s\n", issue.Confidence))
			report.WriteString(fmt.Sprintf("- **Code**:\n```go\n%s\n```\n\n", issue.Code))
		}
	} else {
		report.WriteString("## Code Vulnerabilities\n\n")
		report.WriteString("No code vulnerabilities found.\n\n")
	}

	// Add dependency issues
	if len(results.DependencyIssues) > 0 {
		report.WriteString("## Vulnerable Dependencies\n\n")
		for i, dep := range results.DependencyIssues {
			report.WriteString(fmt.Sprintf("### %d. %s (%s)\n\n", i+1, dep.Name, dep.Version))

			report.WriteString("| Vulnerability | Severity | CVSS | Description |\n")
			report.WriteString("|---------------|----------|------|-------------|\n")

			for _, vuln := range dep.Vulnerabilities {
				report.WriteString(fmt.Sprintf("| %s | %s | %.1f | %s |\n",
					vuln.ID,
					vuln.Severity,
					vuln.CVSS,
					truncateString(vuln.Description, 100),
				))
			}

			report.WriteString("\n")

			// Add references for the first few vulnerabilities
			if len(dep.Vulnerabilities) > 0 && len(dep.Vulnerabilities[0].References) > 0 {
				report.WriteString("#### References\n\n")
				for _, ref := range dep.Vulnerabilities[0].References[:min(3, len(dep.Vulnerabilities[0].References))] {
					report.WriteString(fmt.Sprintf("- %s\n", ref))
				}
				report.WriteString("\n")
			}
		}
	} else {
		report.WriteString("## Vulnerable Dependencies\n\n")
		report.WriteString("No vulnerable dependencies found.\n\n")
	}

	// Add recommendations
	report.WriteString("## Recommendations\n\n")
	if results.HighSeverityCount > 0 {
		report.WriteString("### High Severity Issues\n\n")
		report.WriteString("- Address all high severity issues immediately\n")
		report.WriteString("- Consider these issues as blocking for production deployments\n\n")
	}

	if results.MediumSeverityCount > 0 {
		report.WriteString("### Medium Severity Issues\n\n")
		report.WriteString("- Create tickets to address medium severity issues\n")
		report.WriteString("- Prioritize fixes based on exploitability and impact\n\n")
	}

	if results.LowSeverityCount > 0 {
		report.WriteString("### Low Severity Issues\n\n")
		report.WriteString("- Document low severity issues for future reference\n")
		report.WriteString("- Address during regular maintenance cycles\n\n")
	}

	return report.String()
}

// PrintSummary prints a summary of the security scan results to the console
func (s *SecurityScanner) PrintSummary(results *SecurityScanResults) {
	fmt.Println("\nSecurity Scan Summary:")
	fmt.Println("----------------------")

	if results.TotalVulnerabilities == 0 {
		fmt.Println("✅ No vulnerabilities found")
	} else {
		fmt.Printf("❌ %d vulnerabilities found\n", results.TotalVulnerabilities)
	}

	fmt.Printf("High Severity: %d\n", results.HighSeverityCount)
	fmt.Printf("Medium Severity: %d\n", results.MediumSeverityCount)
	fmt.Printf("Low Severity: %d\n", results.LowSeverityCount)
	fmt.Printf("Unknown Severity: %d\n", results.UnknownSeverityCount)

	if len(results.GosecIssues) > 0 {
		fmt.Printf("\nCode Vulnerabilities: %d\n", len(results.GosecIssues))
	}

	if len(results.DependencyIssues) > 0 {
		fmt.Printf("\nVulnerable Dependencies: %d\n", len(results.DependencyIssues))
		vulnCount := 0
		for _, dep := range results.DependencyIssues {
			vulnCount += len(dep.Vulnerabilities)
		}
		fmt.Printf("Total Dependency Vulnerabilities: %d\n", vulnCount)
	}
}

// Helper functions

// truncateString truncates a string to the specified length and adds "..." if truncated
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
