package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// CoverageReport represents the structure of the coverage report
type CoverageReport struct {
	TotalCoverage       float64            `json:"totalCoverage"`
	PackageCoverage     map[string]float64 `json:"packageCoverage"`
	LowCoveragePackages []string           `json:"lowCoveragePackages"`
	CoreServiceCoverage map[string]float64 `json:"coreServiceCoverage"`
}

// CoreServices defines the core business services that require 100% test coverage
var CoreServices = []string{
	"internal/services/campaign_orchestrator_service",
	"internal/services/dns_campaign_service",
	"internal/services/http_keyword_campaign_service",
	"internal/services/domain_generation_service",
	"internal/services/campaign_worker_service",
}

func main() {
	// Run tests with coverage
	fmt.Println("Running tests with coverage...")
	cmd := exec.Command("go", "test", "./...", "-coverprofile=coverage.out")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		log.Fatalf("Failed to run tests: %v", err)
	}

	// Parse coverage profile
	fmt.Println("Parsing coverage profile...")
	coverageData, err := parseCoverageProfile("coverage.out")
	if err != nil {
		log.Fatalf("Failed to parse coverage profile: %v", err)
	}

	// Generate report
	report := generateReport(coverageData)

	// Output report
	outputReport(report)

	// Check if core services have 100% coverage
	checkCoreServiceCoverage(report)
}

func parseCoverageProfile(filename string) (map[string]float64, error) {
	// Run go tool cover to get coverage data
	cmd := exec.Command("go", "tool", "cover", "-func="+filename)
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run go tool cover: %v", err)
	}

	// Parse the output
	coverageData := make(map[string]float64)
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "total:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}

		// Extract package path
		filePath := fields[0]
		packagePath := filepath.Dir(filePath)

		// Extract coverage percentage
		coverageStr := strings.TrimSuffix(fields[len(fields)-1], "%")
		var coverage float64
		fmt.Sscanf(coverageStr, "%f", &coverage)

		// Aggregate coverage by package
		if existingCoverage, ok := coverageData[packagePath]; ok {
			coverageData[packagePath] = (existingCoverage + coverage) / 2
		} else {
			coverageData[packagePath] = coverage
		}
	}

	return coverageData, nil
}

func generateReport(coverageData map[string]float64) CoverageReport {
	report := CoverageReport{
		PackageCoverage:     coverageData,
		LowCoveragePackages: []string{},
		CoreServiceCoverage: make(map[string]float64),
	}

	// Calculate total coverage
	var totalCoverage float64
	for _, coverage := range coverageData {
		totalCoverage += coverage
	}
	report.TotalCoverage = totalCoverage / float64(len(coverageData))

	// Identify low coverage packages (below 80%)
	for pkg, coverage := range coverageData {
		if coverage < 80.0 {
			report.LowCoveragePackages = append(report.LowCoveragePackages, pkg)
		}
	}
	sort.Strings(report.LowCoveragePackages)

	// Extract core service coverage
	for _, coreService := range CoreServices {
		for pkg, coverage := range coverageData {
			if strings.Contains(pkg, coreService) {
				report.CoreServiceCoverage[coreService] = coverage
			}
		}
	}

	return report
}

func outputReport(report CoverageReport) {
	// Print summary to console
	fmt.Printf("Total Coverage: %.2f%%\n", report.TotalCoverage)
	fmt.Println("\nCore Service Coverage:")
	for service, coverage := range report.CoreServiceCoverage {
		fmt.Printf("  %s: %.2f%%\n", service, coverage)
	}

	fmt.Println("\nLow Coverage Packages:")
	for _, pkg := range report.LowCoveragePackages {
		fmt.Printf("  %s: %.2f%%\n", pkg, report.PackageCoverage[pkg])
	}

	// Write JSON report
	jsonData, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal report to JSON: %v", err)
	}

	if err := os.WriteFile("coverage_report.json", jsonData, 0644); err != nil {
		log.Fatalf("Failed to write JSON report: %v", err)
	}
	fmt.Println("\nDetailed report written to coverage_report.json")
}

func checkCoreServiceCoverage(report CoverageReport) {
	// Check if any core services have less than 100% coverage
	var incompleteServices []string
	for service, coverage := range report.CoreServiceCoverage {
		if coverage < 100.0 {
			incompleteServices = append(incompleteServices, service)
		}
	}

	if len(incompleteServices) > 0 {
		fmt.Println("\n⚠️ The following core services do not have 100% test coverage:")
		for _, service := range incompleteServices {
			fmt.Printf("  %s: %.2f%%\n", service, report.CoreServiceCoverage[service])
		}
		fmt.Println("\nPlease add tests to achieve 100% coverage for these core services.")
	} else {
		fmt.Println("\n✅ All core services have 100% test coverage!")
	}
}
