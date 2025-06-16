package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"github.com/fntelecomllc/studio/backend/internal/regressiontester"
)

func main() {
	// Parse command line flags
	resultsDir := flag.String("results-dir", "", "Directory containing regression test results (required)")
	outputFile := flag.String("output", "regression_test_report.md", "Output file for the regression test report")
	flag.Parse()

	// Validate required flags
	if *resultsDir == "" {
		log.Fatal("Error: --results-dir flag is required")
	}

	// Create the regression tester
	log.Println("Creating regression tester...")
	tester := regressiontester.NewRegressionTester()

	// Get all result files
	log.Println("Reading regression test results...")
	resultFiles, err := filepath.Glob(filepath.Join(*resultsDir, "*.json"))
	if err != nil {
		log.Fatalf("Error finding result files: %v", err)
	}

	if len(resultFiles) == 0 {
		log.Fatal("No result files found in the specified directory")
	}

	// Parse results
	log.Println("Parsing regression test results...")
	results, err := tester.ParseResults(resultFiles)
	if err != nil {
		log.Fatalf("Error parsing regression test results: %v", err)
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

	// Exit with error if there are failures
	if results.FailedTests > 0 {
		os.Exit(1)
	}

	log.Printf("Regression test report generated successfully. Written to %s", *outputFile)
}
