#!/bin/bash
set -e

# This script runs the schema validator to ensure database schema and Go models are in sync

# Check if DSN is provided
if [ -z "$1" ]; then
  echo "Error: Database connection string (DSN) is required"
  echo "Usage: $0 <dsn>"
  exit 1
fi

DSN=$1
OUTPUT_FILE="schema_validation_report.md"

echo "Running schema validator..."
cd "$(dirname "$0")/.."
go run cmd/schema_validator/main.go cmd/schema_validator/schema_validator_wrapper.go --dsn "$DSN" --output "$OUTPUT_FILE"

# Check exit code
if [ $? -ne 0 ]; then
  echo "Schema validation failed. See $OUTPUT_FILE for details."
  exit 1
fi

echo "Schema validation successful."