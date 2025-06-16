package apicontracttester

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

/*
IMPORTANT: This package is a stub implementation for demonstration purposes.
For a full implementation, the following external dependencies need to be installed:

go get github.com/getkin/kin-openapi/openapi3
go get github.com/getkin/kin-openapi/openapi3filter
go get github.com/getkin/kin-openapi/routers
go get github.com/getkin/kin-openapi/routers/gorillamux

The current implementation provides basic API testing functionality without OpenAPI validation.
*/

// APIContractTester tests API endpoints against an OpenAPI specification
type APIContractTester struct {
	BaseURL string
	client  *http.Client
}

// TestResult represents the result of a single API test
type TestResult struct {
	Endpoint     string
	Method       string
	StatusCode   int
	Expected     int
	Error        string
	ResponseTime time.Duration
	Success      bool
}

// TestResults contains all test results
type TestResults struct {
	Success             bool
	TotalTests          int
	PassedTests         int
	FailedTests         int
	Results             []TestResult
	SpecErrors          []string
	AverageResponseTime time.Duration
}

// NewAPIContractTester creates a new APIContractTester
func NewAPIContractTester(baseURL string) *APIContractTester {
	return &APIContractTester{
		BaseURL: baseURL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// RunTests runs all API contract tests
func (t *APIContractTester) RunTests() (*TestResults, error) {
	// Initialize results
	results := &TestResults{
		Success:    true,
		TotalTests: 0,
		Results:    []TestResult{},
		SpecErrors: []string{},
	}

	// In the stub implementation, we'll just test a few common endpoints
	endpoints := []struct {
		path   string
		method string
	}{
		{"/health", "GET"},
		{"/api/v2/v2/campaigns", "GET"},
		{"/api/v2/personas/dns", "GET"},
		{"/api/v2/personas/http", "GET"},
	}

	totalResponseTime := time.Duration(0)

	for _, endpoint := range endpoints {
		// Create test result
		testResult := TestResult{
			Endpoint: endpoint.path,
			Method:   endpoint.method,
			Success:  true,
			Expected: 200, // Default expected status code
		}

		// Create request
		url := t.BaseURL + endpoint.path
		req, err := http.NewRequest(endpoint.method, url, nil)
		if err != nil {
			testResult.Error = fmt.Sprintf("Failed to create request: %v", err)
			testResult.Success = false
			results.Results = append(results.Results, testResult)
			results.Success = false
			results.FailedTests++
			results.TotalTests++
			continue
		}

		// Add headers
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		// Add API key authentication for /api/v2/* endpoints
		if strings.HasPrefix(endpoint.path, "/api/v2/") {
			req.Header.Set("Authorization", "Bearer 641f018600f939b24bb496ea87e6bb2edf1922457a058d5a3aa27a00c7073147")
		}

		// Execute request
		startTime := time.Now()
		resp, err := t.client.Do(req)
		responseTime := time.Since(startTime)
		testResult.ResponseTime = responseTime
		totalResponseTime += responseTime

		if err != nil {
			testResult.Error = fmt.Sprintf("Request failed: %v", err)
			testResult.Success = false
			results.Results = append(results.Results, testResult)
			results.Success = false
			results.FailedTests++
			results.TotalTests++
			continue
		}
		defer resp.Body.Close()

		// Check status code
		testResult.StatusCode = resp.StatusCode
		if resp.StatusCode != testResult.Expected {
			testResult.Error = fmt.Sprintf("Unexpected status code: got %d, expected %d", resp.StatusCode, testResult.Expected)
			testResult.Success = false
			results.Success = false
		}

		// Read response body
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			testResult.Error = fmt.Sprintf("Failed to read response body: %v", err)
			testResult.Success = false
			results.Success = false
		}

		// Basic JSON validation
		if testResult.Success && len(body) > 0 {
			var jsonData interface{}
			if err := json.Unmarshal(body, &jsonData); err != nil {
				testResult.Error = fmt.Sprintf("Invalid JSON response: %v", err)
				testResult.Success = false
				results.Success = false
			}
		}

		// Update results
		if testResult.Success {
			results.PassedTests++
		} else {
			results.FailedTests++
		}
		results.TotalTests++
		results.Results = append(results.Results, testResult)
	}

	// Calculate average response time
	if results.TotalTests > 0 {
		results.AverageResponseTime = totalResponseTime / time.Duration(results.TotalTests)
	}

	return results, nil
}

// GenerateReport generates a report of the test results
func (t *APIContractTester) GenerateReport(results *TestResults) string {
	var report strings.Builder

	// Add header
	report.WriteString("# API Contract Test Report\n\n")
	report.WriteString(fmt.Sprintf("Generated: %s\n\n", time.Now().Format(time.RFC3339)))
	report.WriteString(fmt.Sprintf("Base URL: %s\n\n", t.BaseURL))

	// Add summary
	report.WriteString("## Summary\n\n")
	if results.Success {
		report.WriteString("✅ **All tests passed**\n\n")
	} else {
		report.WriteString("❌ **Some tests failed**\n\n")
	}
	report.WriteString(fmt.Sprintf("- Total Tests: %d\n", results.TotalTests))
	report.WriteString(fmt.Sprintf("- Passed Tests: %d\n", results.PassedTests))
	report.WriteString(fmt.Sprintf("- Failed Tests: %d\n", results.FailedTests))
	report.WriteString(fmt.Sprintf("- Average Response Time: %s\n\n", results.AverageResponseTime))

	// Add specification errors
	if len(results.SpecErrors) > 0 {
		report.WriteString("## Specification Errors\n\n")
		for _, err := range results.SpecErrors {
			report.WriteString(fmt.Sprintf("- %s\n", err))
		}
		report.WriteString("\n")
	}

	// Add test results
	report.WriteString("## Test Results\n\n")
	report.WriteString("| Endpoint | Method | Status Code | Expected | Response Time | Result |\n")
	report.WriteString("|----------|--------|-------------|----------|---------------|--------|\n")
	for _, result := range results.Results {
		status := "✅ Pass"
		if !result.Success {
			status = "❌ Fail"
		}
		report.WriteString(fmt.Sprintf("| %s | %s | %d | %d | %s | %s |\n",
			result.Endpoint,
			result.Method,
			result.StatusCode,
			result.Expected,
			result.ResponseTime,
			status,
		))
	}
	report.WriteString("\n")

	// Add failed tests details
	failedTests := []TestResult{}
	for _, result := range results.Results {
		if !result.Success {
			failedTests = append(failedTests, result)
		}
	}

	if len(failedTests) > 0 {
		report.WriteString("## Failed Tests Details\n\n")
		for i, result := range failedTests {
			report.WriteString(fmt.Sprintf("### %d. %s %s\n\n", i+1, result.Method, result.Endpoint))
			report.WriteString(fmt.Sprintf("- Status Code: %d (Expected: %d)\n", result.StatusCode, result.Expected))
			report.WriteString(fmt.Sprintf("- Response Time: %s\n", result.ResponseTime))
			report.WriteString(fmt.Sprintf("- Error: %s\n\n", result.Error))
		}
	}

	// Add note about stub implementation
	report.WriteString("## Note\n\n")
	report.WriteString("This is a stub implementation for demonstration purposes. ")
	report.WriteString("For a full implementation with OpenAPI validation, install the required dependencies:\n\n")
	report.WriteString("```\n")
	report.WriteString("go get github.com/getkin/kin-openapi/openapi3\n")
	report.WriteString("go get github.com/getkin/kin-openapi/openapi3filter\n")
	report.WriteString("go get github.com/getkin/kin-openapi/routers\n")
	report.WriteString("go get github.com/getkin/kin-openapi/routers/gorillamux\n")
	report.WriteString("```\n")

	return report.String()
}

// PrintSummary prints a summary of the test results to the console
func (t *APIContractTester) PrintSummary(results *TestResults) {
	fmt.Println("\nAPI Contract Test Summary:")
	fmt.Println("-------------------------")

	if results.Success {
		fmt.Println("✅ All tests passed")
	} else {
		fmt.Println("❌ Some tests failed")
	}

	fmt.Printf("Total Tests: %d\n", results.TotalTests)
	fmt.Printf("Passed Tests: %d\n", results.PassedTests)
	fmt.Printf("Failed Tests: %d\n", results.FailedTests)
	fmt.Printf("Average Response Time: %s\n", results.AverageResponseTime)

	if len(results.SpecErrors) > 0 {
		fmt.Println("\nSpecification Errors:")
		for _, err := range results.SpecErrors {
			fmt.Printf("- %s\n", err)
		}
	}

	if !results.Success {
		fmt.Println("\nFailed Tests:")
		for i, result := range results.Results {
			if !result.Success {
				fmt.Printf("%d. %s %s - %s\n", i+1, result.Method, result.Endpoint, result.Error)
			}
		}
	}

	fmt.Println("\nNote: This is a stub implementation. Install required dependencies for full functionality.")
}
