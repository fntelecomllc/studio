package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"os"
	"path/filepath"
	"sort"
	"time"
)

// TestReport represents the structure of our test report
type TestReport struct {
	TotalCoverage       float64               `json:"totalCoverage"`
	PackageCoverage     map[string]float64    `json:"packageCoverage"`
	LowCoveragePackages []string              `json:"lowCoveragePackages"`
	CoreServiceCoverage map[string]float64    `json:"coreServiceCoverage"`
	TestResults         map[string]TestResult `json:"testResults"`
	Timestamp           string                `json:"timestamp"`
}

// TestResult represents the result of a test
type TestResult struct {
	Passed  bool    `json:"passed"`
	Failed  bool    `json:"failed"`
	Skipped bool    `json:"skipped"`
	Time    float64 `json:"time"`
}

// DashboardData represents the data for the dashboard template
type DashboardData struct {
	Report         TestReport
	FormattedTime  string
	PassRate       float64
	CoverageStatus string
	CoreServicesOK bool
	FailedPackages []string
	SortedPackages []string
}

const dashboardTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DomainFlow Backend Test Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
        }
        .timestamp {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
        }
        .good {
            color: #27ae60;
        }
        .warning {
            color: #f39c12;
        }
        .danger {
            color: #e74c3c;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
        }
        tr:hover {
            background-color: #f1f1f1;
        }
        .progress-bar {
            height: 10px;
            background-color: #ecf0f1;
            border-radius: 5px;
            overflow: hidden;
            margin-top: 5px;
        }
        .progress {
            height: 100%;
            background-color: #3498db;
            border-radius: 5px;
        }
        .progress.good {
            background-color: #27ae60;
        }
        .progress.warning {
            background-color: #f39c12;
        }
        .progress.danger {
            background-color: #e74c3c;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>DomainFlow Backend Test Dashboard</h1>
        <div class="timestamp">Generated: {{.FormattedTime}}</div>
    </div>

    <div class="summary">
        <div class="card">
            <h3>Total Coverage</h3>
            <div class="metric {{if ge .Report.TotalCoverage 80.0}}good{{else if ge .Report.TotalCoverage 60.0}}warning{{else}}danger{{end}}">
                {{printf "%.2f" .Report.TotalCoverage}}%
            </div>
            <div class="progress-bar">
                <div class="progress {{if ge .Report.TotalCoverage 80.0}}good{{else if ge .Report.TotalCoverage 60.0}}warning{{else}}danger{{end}}" style="width: {{.Report.TotalCoverage}}%;"></div>
            </div>
        </div>
        <div class="card">
            <h3>Pass Rate</h3>
            <div class="metric {{if ge .PassRate 95.0}}good{{else if ge .PassRate 80.0}}warning{{else}}danger{{end}}">
                {{printf "%.2f" .PassRate}}%
            </div>
            <div class="progress-bar">
                <div class="progress {{if ge .PassRate 95.0}}good{{else if ge .PassRate 80.0}}warning{{else}}danger{{end}}" style="width: {{.PassRate}}%;"></div>
            </div>
        </div>
        <div class="card">
            <h3>Core Services</h3>
            <div class="metric {{if .CoreServicesOK}}good{{else}}danger{{end}}">
                {{if .CoreServicesOK}}✓{{else}}✗{{end}}
            </div>
            <div>{{if .CoreServicesOK}}All core services have 100% coverage{{else}}Some core services need more tests{{end}}</div>
        </div>
    </div>

    <h2>Core Service Coverage</h2>
    <table>
        <thead>
            <tr>
                <th>Service</th>
                <th>Coverage</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            {{range $service, $coverage := .Report.CoreServiceCoverage}}
            <tr>
                <td>{{$service}}</td>
                <td>{{printf "%.2f" $coverage}}%</td>
                <td>
                    {{if eq $coverage 100.0}}
                    <span class="good">✓ Complete</span>
                    {{else}}
                    <span class="danger">✗ Incomplete</span>
                    {{end}}
                </td>
            </tr>
            {{end}}
        </tbody>
    </table>

    <h2>Package Coverage</h2>
    <table>
        <thead>
            <tr>
                <th>Package</th>
                <th>Coverage</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            {{range $index, $package := .SortedPackages}}
            {{$coverage := index $.Report.PackageCoverage $package}}
            <tr>
                <td>{{$package}}</td>
                <td>
                    {{printf "%.2f" $coverage}}%
                    <div class="progress-bar">
                        <div class="progress {{if ge $coverage 80.0}}good{{else if ge $coverage 60.0}}warning{{else}}danger{{end}}" style="width: {{$coverage}}%;"></div>
                    </div>
                </td>
                <td>
                    {{if ge $coverage 80.0}}
                    <span class="good">Good</span>
                    {{else if ge $coverage 60.0}}
                    <span class="warning">Needs Improvement</span>
                    {{else}}
                    <span class="danger">Critical</span>
                    {{end}}
                </td>
            </tr>
            {{end}}
        </tbody>
    </table>

    {{if .FailedPackages}}
    <h2>Failed Tests</h2>
    <table>
        <thead>
            <tr>
                <th>Package</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            {{range $index, $package := .FailedPackages}}
            <tr>
                <td>{{$package}}</td>
                <td><span class="danger">Failed</span></td>
            </tr>
            {{end}}
        </tbody>
    </table>
    {{end}}
</body>
</html>
`

func main() {
	// Check if coverage report exists
	coverageReportPath := "coverage_report.json"
	if _, err := os.Stat(coverageReportPath); os.IsNotExist(err) {
		log.Fatalf("Coverage report not found: %s", coverageReportPath)
	}

	// Read coverage report
	coverageData, err := os.ReadFile(coverageReportPath)
	if err != nil {
		log.Fatalf("Failed to read coverage report: %v", err)
	}

	// Parse coverage report
	var report TestReport
	if err := json.Unmarshal(coverageData, &report); err != nil {
		log.Fatalf("Failed to parse coverage report: %v", err)
	}

	// Add timestamp if not present
	if report.Timestamp == "" {
		report.Timestamp = time.Now().Format(time.RFC3339)
	}

	// Initialize test results if not present
	if report.TestResults == nil {
		report.TestResults = make(map[string]TestResult)
	}

	// Calculate pass rate
	totalTests := len(report.TestResults)
	passedTests := 0
	failedPackages := []string{}

	for pkg, result := range report.TestResults {
		if result.Passed {
			passedTests++
		}
		if result.Failed {
			failedPackages = append(failedPackages, pkg)
		}
	}

	passRate := 100.0
	if totalTests > 0 {
		passRate = float64(passedTests) / float64(totalTests) * 100.0
	}

	// Check if all core services have 100% coverage
	coreServicesOK := true
	for _, coverage := range report.CoreServiceCoverage {
		if coverage < 100.0 {
			coreServicesOK = false
			break
		}
	}

	// Get sorted list of packages
	sortedPackages := make([]string, 0, len(report.PackageCoverage))
	for pkg := range report.PackageCoverage {
		sortedPackages = append(sortedPackages, pkg)
	}
	sort.Strings(sortedPackages)

	// Determine coverage status
	coverageStatus := "good"
	if report.TotalCoverage < 80.0 {
		coverageStatus = "warning"
	}
	if report.TotalCoverage < 60.0 {
		coverageStatus = "danger"
	}

	// Prepare dashboard data
	data := DashboardData{
		Report:         report,
		FormattedTime:  time.Now().Format("January 2, 2006 15:04:05"),
		PassRate:       passRate,
		CoverageStatus: coverageStatus,
		CoreServicesOK: coreServicesOK,
		FailedPackages: failedPackages,
		SortedPackages: sortedPackages,
	}

	// Create template
	tmpl, err := template.New("dashboard").Parse(dashboardTemplate)
	if err != nil {
		log.Fatalf("Failed to parse template: %v", err)
	}

	// Create output directory if it doesn't exist
	outputDir := "test-reports"
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		log.Fatalf("Failed to create output directory: %v", err)
	}

	// Generate output filename with timestamp
	timestamp := time.Now().Format("20060102-150405")
	outputPath := filepath.Join(outputDir, fmt.Sprintf("test-dashboard-%s.html", timestamp))

	// Create output file
	file, err := os.Create(outputPath)
	if err != nil {
		log.Fatalf("Failed to create output file: %v", err)
	}
	defer file.Close()

	// Execute template
	if err := tmpl.Execute(file, data); err != nil {
		log.Fatalf("Failed to execute template: %v", err)
	}

	// Create a symlink to the latest report
	latestPath := filepath.Join(outputDir, "test-dashboard-latest.html")
	_ = os.Remove(latestPath) // Remove existing symlink if it exists
	if err := os.Symlink(outputPath, latestPath); err != nil {
		log.Printf("Warning: Failed to create symlink to latest report: %v", err)
	}

	fmt.Printf("Test dashboard generated: %s\n", outputPath)
	fmt.Printf("Latest dashboard available at: %s\n", latestPath)
}
