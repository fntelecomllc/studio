#!/bin/bash
set -e

# This script runs regression tests to ensure that recent changes haven't broken existing functionality

# Check if database connection string is provided
if [ -z "$1" ]; then
  echo "Error: Database connection string (DSN) is required"
  echo "Usage: $0 <dsn>"
  exit 1
fi

DSN=$1
OUTPUT_FILE="regression_test_report.md"

echo "Running regression tests..."
cd "$(dirname "$0")/.."

# Create a temporary directory for test results
mkdir -p ./tmp/regression_tests

# Run the regression tests
echo "Running API regression tests..."
go test -tags=regression ./internal/api/... -v -dsn "$DSN" -json > ./tmp/regression_tests/api_tests.json

echo "Running service regression tests..."
go test -tags=regression ./internal/services/... -v -dsn "$DSN" -json > ./tmp/regression_tests/service_tests.json

echo "Running store regression tests..."
go test -tags=regression ./internal/store/... -v -dsn "$DSN" -json > ./tmp/regression_tests/store_tests.json

# Generate report
echo "Generating regression test report..."
go run cmd/regression_tester/main.go --results-dir ./tmp/regression_tests --output "$OUTPUT_FILE"

# Check if any tests failed
if grep -q "\"Action\":\"fail\"" ./tmp/regression_tests/*.json; then
  echo "Regression tests failed. See $OUTPUT_FILE for details."
  exit 1
fi

# Clean up temporary files
rm -rf ./tmp/regression_tests

echo "Regression tests completed successfully. Report written to $OUTPUT_FILE"