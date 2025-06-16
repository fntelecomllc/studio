#!/bin/bash
set -e

# This script generates documentation for the data models in the project

# Check if DSN is provided
if [ -z "$1" ]; then
  echo "Error: Database connection string (DSN) is required"
  echo "Usage: $0 <dsn>"
  exit 1
fi

DSN=$1
OUTPUT_FILE="data_model_documentation.md"

echo "Generating data model documentation..."
cd "$(dirname "$0")/.."
go run cmd/model_documenter/main.go --dsn "$DSN" --output "$OUTPUT_FILE"

# Check exit code
if [ $? -ne 0 ]; then
  echo "Data model documentation generation failed. See logs for details."
  exit 1
fi

echo "Data model documentation generated successfully at $OUTPUT_FILE"