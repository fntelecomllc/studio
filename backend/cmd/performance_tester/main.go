package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"github.com/fntelecomllc/studio/backend/internal/performancetester"
)

func main() {
	// Parse command line flags
	resultsDir := flag.String("results-dir", "", "Directory containing performance test results (required)")
	outputFile := flag.String("output", "performance_test_report.md", "Output file for the performance test report")
	flag.Parse()

	// Validate required flags
	if *resultsDir == "" {
		log.Fatal("Error: --results-dir flag is required")
	}

	// Create the performance tester
	log.Println("Creating performance tester...")
	tester := performancetester.NewPerformanceTester()

	// Get all result files
	log.Println("Reading performance test results...")
	resultFiles, err := filepath.Glob(filepath.Join(*resultsDir, "*.json"))
	if err != nil {
		log.Fatalf("Error finding result files: %v", err)
	}

	if len(resultFiles) == 0 {
		log.Fatal("No result files found in the specified directory")
	}

	// Parse results
	log.Println("Parsing performance test results...")
	results, err := tester.ParseResults(resultFiles)
	if err != nil {
		log.Fatalf("Error parsing performance test results: %v", err)
	}

	// Generate report
	log.Println("Generating report...")
	report := tester.GenerateReport(results)

	// Write report to file
	err = os.WriteFile(*outputFile, []byte(report), 0644)
	if err != nil {
		log.Fatalf("Error writing report to file: %v", err)
	}

	// Print summary
	tester.PrintSummary(results)

	log.Printf("Performance test report generated successfully. Written to %s", *outputFile)
}
