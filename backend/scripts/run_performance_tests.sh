#!/bin/bash
set -e

# This script runs performance tests on the API endpoints

# Check if API base URL is provided
if [ -z "$1" ]; then
  echo "Error: API base URL is required"
  echo "Usage: $0 <api_base_url>"
  echo "Example: $0 http://localhost:8080/api"
  exit 1
fi

API_BASE_URL=$1
OUTPUT_FILE="performance_test_report.md"

echo "Running performance tests..."
cd "$(dirname "$0")/.."

# Check if hey is installed
if ! command -v hey &> /dev/null; then
    echo "hey not found. Installing..."
    go install github.com/rakyll/hey@latest
fi

# Create a temporary directory for test results
mkdir -p ./tmp/performance_tests
rm -f ./tmp/performance_tests/*.json

# Run performance tests for each endpoint
echo "Testing API endpoints..."

# Health check endpoint
echo "Testing health check endpoint..."
hey -n 1000 -c 50 -o json -m GET "$API_BASE_URL/health" > ./tmp/performance_tests/health.json

# Other endpoints can be added here
# For example:
# echo "Testing campaigns endpoint..."
# hey -n 500 -c 20 -o json -m GET "$API_BASE_URL/campaigns" > ./tmp/performance_tests/campaigns.json

# Generate report
echo "Generating performance test report..."
go run cmd/performance_tester/main.go --results-dir ./tmp/performance_tests --output "$OUTPUT_FILE"

# Clean up temporary files
rm -rf ./tmp/performance_tests

echo "Performance tests completed successfully. Report written to $OUTPUT_FILE"