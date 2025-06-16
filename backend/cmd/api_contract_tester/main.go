package main

import (
	"flag"
	"log"
	"os"

	"github.com/fntelecomllc/studio/backend/internal/apicontracttester"
)

func main() {
	// Parse command line flags
	apiURL := flag.String("api-url", "", "Base URL of the API to test (required)")
	outputFile := flag.String("output", "api_contract_test_report.md", "Output file for the test report")
	flag.Parse()

	// Validate required flags
	if *apiURL == "" {
		log.Fatal("Error: --api-url flag is required")
	}

	// Create the API contract tester
	log.Println("Creating API contract tester...")
	tester := apicontracttester.NewAPIContractTester(*apiURL)

	// Run the tests
	log.Println("Running API contract tests...")
	results, err := tester.RunTests()
	if err != nil {
		log.Fatalf("Error running API contract tests: %v", err)
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
	if !results.Success {
		os.Exit(1)
	}

	log.Printf("API contract tests completed successfully. Report written to %s", *outputFile)
}
