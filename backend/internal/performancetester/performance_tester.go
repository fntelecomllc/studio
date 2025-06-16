package performancetester

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// PerformanceTester analyzes performance test results
type PerformanceTester struct{}

// HeyResult represents the result of a hey performance test
type HeyResult struct {
	URL                string         `json:"url"`
	StatusCodeDist     map[string]int `json:"statusCodeDistribution"`
	TotalRequests      int            `json:"total"`
	SuccessfulRequests int            `json:"success"`
	TotalTime          float64        `json:"totalTimeSeconds"`
	AverageTime        float64        `json:"averageTimeSeconds"`
	FastestTime        float64        `json:"fastestTimeSeconds"`
	SlowestTime        float64        `json:"slowestTimeSeconds"`
	AverageSize        int            `json:"averageResponseSizeBytes"`
	Percentiles        struct {
		P50 float64 `json:"p50"`
		P75 float64 `json:"p75"`
		P90 float64 `json:"p90"`
		P95 float64 `json:"p95"`
		P99 float64 `json:"p99"`
	} `json:"percentiles"`
	RPS       float64        `json:"rps"`
	ErrorDist map[string]int `json:"errorDistribution"`
}

// EndpointResult represents the performance test result for a specific endpoint
type EndpointResult struct {
	Endpoint           string
	Method             string
	TotalRequests      int
	SuccessfulRequests int
	SuccessRate        float64
	AverageTime        float64
	P95Time            float64
	P99Time            float64
	RPS                float64
	ErrorCount         int
	StatusCodes        map[string]int
	Errors             map[string]int
}

// PerformanceTestResults contains all performance test results
type PerformanceTestResults struct {
	EndpointResults     []EndpointResult
	TotalRequests       int
	SuccessfulRequests  int
	OverallSuccessRate  float64
	AverageResponseTime float64
	AverageRPS          float64
	TestDate            time.Time
}

// NewPerformanceTester creates a new PerformanceTester
func NewPerformanceTester() *PerformanceTester {
	return &PerformanceTester{}
}

// ParseResults parses the results of performance tests
func (p *PerformanceTester) ParseResults(resultFiles []string) (*PerformanceTestResults, error) {
	results := &PerformanceTestResults{
		TestDate: time.Now(),
	}

	totalResponseTime := 0.0
	totalRPS := 0.0

	for _, file := range resultFiles {
		// Read file
		data, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("failed to read result file %s: %w", file, err)
		}

		// Parse JSON
		var heyResult HeyResult
		if err := json.Unmarshal(data, &heyResult); err != nil {
			return nil, fmt.Errorf("failed to parse result file %s: %w", file, err)
		}

		// Extract method from URL (hey doesn't include method in output JSON)
		method := "GET" // Default to GET

		// Extract endpoint name from file name
		endpointName := strings.TrimSuffix(filepath.Base(file), ".json")

		// Calculate success rate
		successRate := 0.0
		if heyResult.TotalRequests > 0 {
			successRate = float64(heyResult.SuccessfulRequests) / float64(heyResult.TotalRequests) * 100
		}

		// Count errors
		errorCount := 0
		for _, count := range heyResult.ErrorDist {
			errorCount += count
		}

		// Create endpoint result
		endpointResult := EndpointResult{
			Endpoint:           endpointName,
			Method:             method,
			TotalRequests:      heyResult.TotalRequests,
			SuccessfulRequests: heyResult.SuccessfulRequests,
			SuccessRate:        successRate,
			AverageTime:        heyResult.AverageTime * 1000,     // Convert to ms
			P95Time:            heyResult.Percentiles.P95 * 1000, // Convert to ms
			P99Time:            heyResult.Percentiles.P99 * 1000, // Convert to ms
			RPS:                heyResult.RPS,
			ErrorCount:         errorCount,
			StatusCodes:        heyResult.StatusCodeDist,
			Errors:             heyResult.ErrorDist,
		}

		results.EndpointResults = append(results.EndpointResults, endpointResult)

		// Update totals
		results.TotalRequests += heyResult.TotalRequests
		results.SuccessfulRequests += heyResult.SuccessfulRequests
		totalResponseTime += heyResult.AverageTime
		totalRPS += heyResult.RPS
	}

	// Calculate overall metrics
	if results.TotalRequests > 0 {
		results.OverallSuccessRate = float64(results.SuccessfulRequests) / float64(results.TotalRequests) * 100
	}

	if len(results.EndpointResults) > 0 {
		results.AverageResponseTime = totalResponseTime / float64(len(results.EndpointResults)) * 1000 // Convert to ms
		results.AverageRPS = totalRPS / float64(len(results.EndpointResults))
	}

	// Sort results by endpoint name
	sort.Slice(results.EndpointResults, func(i, j int) bool {
		return results.EndpointResults[i].Endpoint < results.EndpointResults[j].Endpoint
	})

	return results, nil
}

// GenerateReport generates a report of the performance test results
func (p *PerformanceTester) GenerateReport(results *PerformanceTestResults) string {
	var report strings.Builder

	// Add header
	report.WriteString("# Performance Test Report\n\n")
	report.WriteString(fmt.Sprintf("Generated: %s\n\n", results.TestDate.Format(time.RFC3339)))

	// Add summary
	report.WriteString("## Summary\n\n")
	report.WriteString(fmt.Sprintf("- Total Requests: %d\n", results.TotalRequests))
	report.WriteString(fmt.Sprintf("- Successful Requests: %d\n", results.SuccessfulRequests))
	report.WriteString(fmt.Sprintf("- Overall Success Rate: %.2f%%\n", results.OverallSuccessRate))
	report.WriteString(fmt.Sprintf("- Average Response Time: %.2f ms\n", results.AverageResponseTime))
	report.WriteString(fmt.Sprintf("- Average Requests Per Second: %.2f\n\n", results.AverageRPS))

	// Add endpoint results
	report.WriteString("## Endpoint Results\n\n")
	report.WriteString("| Endpoint | Method | Requests | Success Rate | Avg Time (ms) | P95 Time (ms) | P99 Time (ms) | RPS |\n")
	report.WriteString("|----------|--------|----------|--------------|---------------|---------------|---------------|-----|\n")

	for _, result := range results.EndpointResults {
		report.WriteString(fmt.Sprintf("| %s | %s | %d | %.2f%% | %.2f | %.2f | %.2f | %.2f |\n",
			result.Endpoint,
			result.Method,
			result.TotalRequests,
			result.SuccessRate,
			result.AverageTime,
			result.P95Time,
			result.P99Time,
			result.RPS,
		))
	}
	report.WriteString("\n")

	// Add detailed results for each endpoint
	report.WriteString("## Detailed Results\n\n")

	for _, result := range results.EndpointResults {
		report.WriteString(fmt.Sprintf("### %s (%s)\n\n", result.Endpoint, result.Method))

		report.WriteString(fmt.Sprintf("- Total Requests: %d\n", result.TotalRequests))
		report.WriteString(fmt.Sprintf("- Successful Requests: %d\n", result.SuccessfulRequests))
		report.WriteString(fmt.Sprintf("- Success Rate: %.2f%%\n", result.SuccessRate))
		report.WriteString(fmt.Sprintf("- Average Response Time: %.2f ms\n", result.AverageTime))
		report.WriteString(fmt.Sprintf("- 95th Percentile Response Time: %.2f ms\n", result.P95Time))
		report.WriteString(fmt.Sprintf("- 99th Percentile Response Time: %.2f ms\n", result.P99Time))
		report.WriteString(fmt.Sprintf("- Requests Per Second: %.2f\n", result.RPS))
		report.WriteString(fmt.Sprintf("- Error Count: %d\n\n", result.ErrorCount))

		// Add status code distribution
		if len(result.StatusCodes) > 0 {
			report.WriteString("#### Status Code Distribution\n\n")
			report.WriteString("| Status Code | Count |\n")
			report.WriteString("|-------------|-------|\n")

			// Sort status codes
			statusCodes := make([]string, 0, len(result.StatusCodes))
			for code := range result.StatusCodes {
				statusCodes = append(statusCodes, code)
			}
			sort.Strings(statusCodes)

			for _, code := range statusCodes {
				report.WriteString(fmt.Sprintf("| %s | %d |\n", code, result.StatusCodes[code]))
			}
			report.WriteString("\n")
		}

		// Add error distribution
		if len(result.Errors) > 0 {
			report.WriteString("#### Error Distribution\n\n")
			report.WriteString("| Error | Count |\n")
			report.WriteString("|-------|-------|\n")

			// Sort errors
			errors := make([]string, 0, len(result.Errors))
			for err := range result.Errors {
				errors = append(errors, err)
			}
			sort.Strings(errors)

			for _, err := range errors {
				report.WriteString(fmt.Sprintf("| %s | %d |\n", err, result.Errors[err]))
			}
			report.WriteString("\n")
		}
	}

	// Add recommendations
	report.WriteString("## Recommendations\n\n")

	// Find slow endpoints
	var slowEndpoints []EndpointResult
	for _, result := range results.EndpointResults {
		if result.AverageTime > 100 { // More than 100ms average response time
			slowEndpoints = append(slowEndpoints, result)
		}
	}

	if len(slowEndpoints) > 0 {
		report.WriteString("### Slow Endpoints\n\n")
		report.WriteString("The following endpoints have high response times and should be optimized:\n\n")

		for _, result := range slowEndpoints {
			report.WriteString(fmt.Sprintf("- **%s** (%s): %.2f ms average response time\n", result.Endpoint, result.Method, result.AverageTime))
		}
		report.WriteString("\n")
	}

	// Find endpoints with errors
	var errorEndpoints []EndpointResult
	for _, result := range results.EndpointResults {
		if result.ErrorCount > 0 {
			errorEndpoints = append(errorEndpoints, result)
		}
	}

	if len(errorEndpoints) > 0 {
		report.WriteString("### Endpoints with Errors\n\n")
		report.WriteString("The following endpoints have errors that should be investigated:\n\n")

		for _, result := range errorEndpoints {
			report.WriteString(fmt.Sprintf("- **%s** (%s): %d errors\n", result.Endpoint, result.Method, result.ErrorCount))
		}
		report.WriteString("\n")
	}

	// General recommendations
	report.WriteString("### General Recommendations\n\n")
	report.WriteString("- Implement caching for frequently accessed endpoints\n")
	report.WriteString("- Consider pagination for endpoints returning large datasets\n")
	report.WriteString("- Optimize database queries for slow endpoints\n")
	report.WriteString("- Monitor memory usage during high load\n")
	report.WriteString("- Consider implementing rate limiting for public APIs\n")

	return report.String()
}

// PrintSummary prints a summary of the performance test results to the console
func (p *PerformanceTester) PrintSummary(results *PerformanceTestResults) {
	fmt.Println("\nPerformance Test Summary:")
	fmt.Println("-------------------------")
	fmt.Printf("Total Requests: %d\n", results.TotalRequests)
	fmt.Printf("Successful Requests: %d\n", results.SuccessfulRequests)
	fmt.Printf("Overall Success Rate: %.2f%%\n", results.OverallSuccessRate)
	fmt.Printf("Average Response Time: %.2f ms\n", results.AverageResponseTime)
	fmt.Printf("Average Requests Per Second: %.2f\n", results.AverageRPS)

	fmt.Println("\nEndpoint Results:")
	for _, result := range results.EndpointResults {
		fmt.Printf("\n%s (%s):\n", result.Endpoint, result.Method)
		fmt.Printf("  Requests: %d\n", result.TotalRequests)
		fmt.Printf("  Success Rate: %.2f%%\n", result.SuccessRate)
		fmt.Printf("  Avg Time: %.2f ms\n", result.AverageTime)
		fmt.Printf("  P95 Time: %.2f ms\n", result.P95Time)
		fmt.Printf("  RPS: %.2f\n", result.RPS)

		if result.ErrorCount > 0 {
			fmt.Printf("  Errors: %d\n", result.ErrorCount)
		}
	}
}
