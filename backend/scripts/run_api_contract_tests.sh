#!/bin/bash
set -e

# This script runs API contract tests to ensure the API endpoints conform to the OpenAPI specification

# Check if API base URL is provided
if [ -z "$1" ]; then
  echo "Error: API base URL is required"
  echo "Usage: $0 <api_base_url>"
  echo "Example: $0 http://localhost:8080/api"
  exit 1
fi

API_BASE_URL="http://localhost:8081"
OUTPUT_FILE="api_contract_test_report.md"

echo "Running API contract tests..."
cd "$(dirname "$0")/.."
go run cmd/api_contract_tester/main.go --api-url "$API_BASE_URL" --output "$OUTPUT_FILE"

# Check exit code
if [ $? -ne 0 ]; then
  echo "API contract tests failed. See $OUTPUT_FILE for details."
  exit 1
fi

echo "API contract tests completed successfully."