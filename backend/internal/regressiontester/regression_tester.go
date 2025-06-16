package regressiontester

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// RegressionTester analyzes regression test results
type RegressionTester struct{}

// TestEvent represents a single test event from go test -json output
type TestEvent struct {
	Time    time.Time `json:"Time"`
	Action  string    `json:"Action"`
	Package string    `json:"Package"`
	Test    string    `json:"Test"`
	Output  string    `json:"Output"`
	Elapsed float64   `json:"Elapsed"`
}

// TestResult represents the result of a single test
type TestResult struct {
	Package     string
	TestName    string
	Status      string // "pass", "fail", "skip"
	Duration    float64
	Output      []string
	FailMessage string
}

// PackageResult represents the results of all tests in a package
type PackageResult struct {
	PackageName string
	Tests       []TestResult
	PassCount   int
	FailCount   int
	SkipCount   int
	Duration    float64
}

// RegressionTestResults contains all regression test results
type RegressionTestResults struct {
	PackageResults []PackageResult
	TotalTests     int
	PassedTests    int
	FailedTests    int
	SkippedTests   int
	TotalDuration  float64
	TestDate       time.Time
}

// NewRegressionTester creates a new RegressionTester
func NewRegressionTester() *RegressionTester {
	return &RegressionTester{}
}

// ParseResults parses the results of regression tests
func (r *RegressionTester) ParseResults(resultFiles []string) (*RegressionTestResults, error) {
	results := &RegressionTestResults{
		TestDate: time.Now(),
	}

	packageMap := make(map[string]*PackageResult)

	for _, file := range resultFiles {
		// Read file
		data, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("failed to read result file %s: %w", file, err)
		}

		// Split into lines (each line is a JSON object)
		lines := strings.Split(string(data), "\n")

		// Process each line
		testMap := make(map[string]*TestResult)

		for _, line := range lines {
			if line == "" {
				continue
			}

			// Parse JSON
			var event TestEvent
			if err := json.Unmarshal([]byte(line), &event); err != nil {
				return nil, fmt.Errorf("failed to parse test event: %w", err)
			}

			// Skip non-test events
			if event.Test == "" {
				continue
			}

			// Get or create test result
			testKey := event.Package + ":" + event.Test
			testResult, ok := testMap[testKey]
			if !ok {
				testResult = &TestResult{
					Package:  event.Package,
					TestName: event.Test,
					Output:   []string{},
				}
				testMap[testKey] = testResult
			}

			// Update test result based on event
			switch event.Action {
			case "run":
				// Test started
			case "output":
				// Test output
				if event.Output != "" {
					testResult.Output = append(testResult.Output, event.Output)
				}
			case "pass":
				// Test passed
				testResult.Status = "pass"
				testResult.Duration = event.Elapsed
			case "fail":
				// Test failed
				testResult.Status = "fail"
				testResult.Duration = event.Elapsed

				// Extract failure message from output
				for _, line := range testResult.Output {
					if strings.Contains(line, "Error:") || strings.Contains(line, "Failed:") {
						testResult.FailMessage = line
						break
					}
				}

				// If no specific error message found, use the last output line
				if testResult.FailMessage == "" && len(testResult.Output) > 0 {
					testResult.FailMessage = testResult.Output[len(testResult.Output)-1]
				}
			case "skip":
				// Test skipped
				testResult.Status = "skip"
			}

			// Get or create package result
			if _, exists := packageMap[event.Package]; !exists {
				packageMap[event.Package] = &PackageResult{
					PackageName: event.Package,
					Tests:       []TestResult{},
				}
			}
		}

		// Add test results to package results
		for _, testResult := range testMap {
			packageResult, ok := packageMap[testResult.Package]
			if !ok {
				continue
			}

			// Add test to package
			packageResult.Tests = append(packageResult.Tests, *testResult)

			// Update package counts
			switch testResult.Status {
			case "pass":
				packageResult.PassCount++
				results.PassedTests++
			case "fail":
				packageResult.FailCount++
				results.FailedTests++
			case "skip":
				packageResult.SkipCount++
				results.SkippedTests++
			}

			// Update package duration
			packageResult.Duration += testResult.Duration

			// Update total counts
			results.TotalTests++
			results.TotalDuration += testResult.Duration
		}
	}

	// Convert package map to slice
	for _, packageResult := range packageMap {
		// Sort tests by name
		sort.Slice(packageResult.Tests, func(i, j int) bool {
			return packageResult.Tests[i].TestName < packageResult.Tests[j].TestName
		})

		results.PackageResults = append(results.PackageResults, *packageResult)
	}

	// Sort package results by name
	sort.Slice(results.PackageResults, func(i, j int) bool {
		return results.PackageResults[i].PackageName < results.PackageResults[j].PackageName
	})

	return results, nil
}

// GenerateReport generates a report of the regression test results
func (r *RegressionTester) GenerateReport(results *RegressionTestResults) string {
	var report strings.Builder

	// Add header
	report.WriteString("# Regression Test Report\n\n")
	report.WriteString(fmt.Sprintf("Generated: %s\n\n", results.TestDate.Format(time.RFC3339)))

	// Add summary
	report.WriteString("## Summary\n\n")

	if results.FailedTests == 0 {
		report.WriteString("✅ **All tests passed**\n\n")
	} else {
		report.WriteString(fmt.Sprintf("❌ **%d tests failed**\n\n", results.FailedTests))
	}

	report.WriteString(fmt.Sprintf("- Total Tests: %d\n", results.TotalTests))
	report.WriteString(fmt.Sprintf("- Passed Tests: %d\n", results.PassedTests))
	report.WriteString(fmt.Sprintf("- Failed Tests: %d\n", results.FailedTests))
	report.WriteString(fmt.Sprintf("- Skipped Tests: %d\n", results.SkippedTests))
	report.WriteString(fmt.Sprintf("- Total Duration: %.2f seconds\n\n", results.TotalDuration))

	// Add package results
	report.WriteString("## Package Results\n\n")
	report.WriteString("| Package | Tests | Passed | Failed | Skipped | Duration |\n")
	report.WriteString("|---------|-------|--------|--------|---------|----------|\n")

	for _, packageResult := range results.PackageResults {
		report.WriteString(fmt.Sprintf("| %s | %d | %d | %d | %d | %.2f s |\n",
			packageResult.PackageName,
			len(packageResult.Tests),
			packageResult.PassCount,
			packageResult.FailCount,
			packageResult.SkipCount,
			packageResult.Duration,
		))
	}
	report.WriteString("\n")

	// Add failed tests
	if results.FailedTests > 0 {
		report.WriteString("## Failed Tests\n\n")

		for _, packageResult := range results.PackageResults {
			failedTests := []TestResult{}
			for _, test := range packageResult.Tests {
				if test.Status == "fail" {
					failedTests = append(failedTests, test)
				}
			}

			if len(failedTests) > 0 {
				report.WriteString(fmt.Sprintf("### %s\n\n", packageResult.PackageName))

				for i, test := range failedTests {
					report.WriteString(fmt.Sprintf("#### %d. %s\n\n", i+1, test.TestName))
					report.WriteString(fmt.Sprintf("- **Duration**: %.2f seconds\n", test.Duration))
					report.WriteString(fmt.Sprintf("- **Error**: %s\n\n", test.FailMessage))

					// Add test output (limited to last 10 lines)
					if len(test.Output) > 0 {
						report.WriteString("```\n")
						startIdx := 0
						if len(test.Output) > 10 {
							startIdx = len(test.Output) - 10
							report.WriteString("... (output truncated)\n")
						}
						for _, line := range test.Output[startIdx:] {
							report.WriteString(line)
						}
						report.WriteString("```\n\n")
					}
				}
			}
		}
	}

	// Add test details
	report.WriteString("## Test Details\n\n")

	for _, packageResult := range results.PackageResults {
		report.WriteString(fmt.Sprintf("### %s\n\n", packageResult.PackageName))
		report.WriteString("| Test | Status | Duration |\n")
		report.WriteString("|------|--------|----------|\n")

		for _, test := range packageResult.Tests {
			status := "✅ Pass"
			if test.Status == "fail" {
				status = "❌ Fail"
			} else if test.Status == "skip" {
				status = "⏭️ Skip"
			}

			report.WriteString(fmt.Sprintf("| %s | %s | %.2f s |\n",
				test.TestName,
				status,
				test.Duration,
			))
		}
		report.WriteString("\n")
	}

	return report.String()
}

// PrintSummary prints a summary of the regression test results to the console
func (r *RegressionTester) PrintSummary(results *RegressionTestResults) {
	fmt.Println("\nRegression Test Summary:")
	fmt.Println("------------------------")

	if results.FailedTests == 0 {
		fmt.Println("✅ All tests passed")
	} else {
		fmt.Printf("❌ %d tests failed\n", results.FailedTests)
	}

	fmt.Printf("Total Tests: %d\n", results.TotalTests)
	fmt.Printf("Passed Tests: %d\n", results.PassedTests)
	fmt.Printf("Failed Tests: %d\n", results.FailedTests)
	fmt.Printf("Skipped Tests: %d\n", results.SkippedTests)
	fmt.Printf("Total Duration: %.2f seconds\n", results.TotalDuration)

	if results.FailedTests > 0 {
		fmt.Println("\nFailed Tests:")
		for _, packageResult := range results.PackageResults {
			for _, test := range packageResult.Tests {
				if test.Status == "fail" {
					fmt.Printf("- %s: %s\n", packageResult.PackageName, test.TestName)
				}
			}
		}
	}
}
