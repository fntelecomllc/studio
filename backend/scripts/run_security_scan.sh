#!/bin/bash
set -e

# This script runs security scanning on the codebase to identify potential vulnerabilities

OUTPUT_FILE="security_scan_report.md"

echo "Running security scanning..."
cd "$(dirname "$0")/.."

# Run gosec for Go security scanning
echo "Running gosec for Go security scanning..."
if ! command -v gosec &> /dev/null; then
    echo "gosec not found. Installing..."
    go install github.com/securego/gosec/v2/cmd/gosec@latest
fi

gosec -fmt=json -out=security_scan_results.json ./...
GOSEC_EXIT_CODE=$?

# Run dependency check for vulnerable dependencies
echo "Running dependency check..."
if ! command -v nancy &> /dev/null; then
    echo "nancy not found. Installing..."
    go install github.com/sonatype-nexus-community/nancy@latest
fi

go list -json -deps ./... | nancy sleuth -o json > dependency_check_results.json
NANCY_EXIT_CODE=$?

# Generate report
echo "Generating security scan report..."
go run cmd/security_scanner/main.go --gosec-results security_scan_results.json --dependency-results dependency_check_results.json --output "$OUTPUT_FILE"

# Clean up temporary files
rm -f security_scan_results.json dependency_check_results.json

# Check exit codes
if [ $GOSEC_EXIT_CODE -ne 0 ] || [ $NANCY_EXIT_CODE -ne 0 ]; then
  echo "Security scanning found issues. See $OUTPUT_FILE for details."
  exit 1
fi

echo "Security scanning completed successfully."