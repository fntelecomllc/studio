#!/bin/bash
set -e

# This script verifies database migrations by applying them to a test database
# and checking for any issues or inconsistencies

# Check if DSN is provided
if [ -z "$1" ]; then
  echo "Error: Database connection string (DSN) is required"
  echo "Usage: $0 <dsn>"
  exit 1
fi

DSN=$1
OUTPUT_FILE="migration_verification_report.md"

echo "Running migration verification tests..."
cd "$(dirname "$0")/.."
go run cmd/migration_verifier/main.go --dsn "$DSN" --output "$OUTPUT_FILE"

# Check exit code
if [ $? -ne 0 ]; then
  echo "Migration verification failed. See $OUTPUT_FILE for details."
  exit 1
fi

echo "Migration verification successful."