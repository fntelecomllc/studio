package main

import (
	"flag"
	"log"
	"os"

	"github.com/fntelecomllc/studio/backend/internal/securityscanner"
)

func main() {
	// Parse command line flags
	gosecResults := flag.String("gosec-results", "", "Path to gosec results JSON file (required)")
	dependencyResults := flag.String("dependency-results", "", "Path to dependency check results JSON file (required)")
	outputFile := flag.String("output", "security_scan_report.md", "Output file for the security scan report")
	flag.Parse()

	// Validate required flags
	if *gosecResults == "" {
		log.Fatal("Error: --gosec-results flag is required")
	}
	if *dependencyResults == "" {
		log.Fatal("Error: --dependency-results flag is required")
	}

	// Read gosec results
	log.Println("Reading gosec results...")
	gosecData, err := os.ReadFile(*gosecResults)
	if err != nil {
		log.Fatalf("Error reading gosec results: %v", err)
	}

	// Read dependency check results
	log.Println("Reading dependency check results...")
	dependencyData, err := os.ReadFile(*dependencyResults)
	if err != nil {
		log.Fatalf("Error reading dependency check results: %v", err)
	}

	// Create the security scanner
	log.Println("Creating security scanner...")
	scanner := securityscanner.NewSecurityScanner()

	// Parse results
	log.Println("Parsing security scan results...")
	results, err := scanner.ParseResults(gosecData, dependencyData)
	if err != nil {
		log.Fatalf("Error parsing security scan results: %v", err)
	}

	// Generate report
	log.Println("Generating report...")
	report := scanner.GenerateReport(results)

	// Write report to file
	err = os.WriteFile(*outputFile, []byte(report), 0644)
	if err != nil {
		log.Fatalf("Error writing report to file: %v", err)
	}

	// Print summary
	scanner.PrintSummary(results)

	// Exit with error if there are vulnerabilities
	if results.TotalVulnerabilities > 0 {
		os.Exit(1)
	}

	log.Printf("Security scan completed successfully. Report written to %s", *outputFile)
}
