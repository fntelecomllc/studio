#!/bin/bash

# Contract Validation Script for CI/CD Pipeline
# Ensures backend OpenAPI spec matches the committed specification

set -e

echo "🔍 Starting contract validation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo -e "${RED}❌ Error: Must be run from the project root directory${NC}"
    exit 1
fi

# Generate fresh OpenAPI spec from backend
echo -e "${YELLOW}📋 Generating fresh OpenAPI specification from backend...${NC}"
cd backend
if ! swag init -g cmd/apiserver/main.go --exclude internal/models/models.go -o docs; then
    echo -e "${RED}❌ Failed to generate Swagger docs${NC}"
    exit 1
fi

# Convert to OpenAPI 3.0
cd ..
if ! npx swagger2openapi backend/docs/swagger.json -o backend/docs/openapi-fresh.json; then
    echo -e "${RED}❌ Failed to convert to OpenAPI 3.0${NC}"
    exit 1
fi

# Check if committed openapi.json exists
if [ ! -f "backend/docs/openapi.json" ]; then
    echo -e "${YELLOW}⚠️  No committed openapi.json found. This is the first generation.${NC}"
    mv backend/docs/openapi-fresh.json backend/docs/openapi.json
    echo -e "${GREEN}✅ Created initial openapi.json${NC}"
    exit 0
fi

# Compare the specs
echo -e "${YELLOW}🔍 Comparing current spec with committed spec...${NC}"
if diff -q backend/docs/openapi.json backend/docs/openapi-fresh.json > /dev/null; then
    echo -e "${GREEN}✅ Contract validation passed - specs are identical${NC}"
    rm backend/docs/openapi-fresh.json
    exit 0
else
    echo -e "${RED}❌ Contract validation failed - specs differ!${NC}"
    echo ""
    echo "The generated OpenAPI specification differs from the committed version."
    echo "This means the backend API has changed without updating the contract."
    echo ""
    echo "Options:"
    echo "1. If the backend changes are intentional, run: npm run api:generate"
    echo "2. If the backend changes are unintentional, revert the backend changes"
    echo ""
    echo "Differences:"
    diff backend/docs/openapi.json backend/docs/openapi-fresh.json || true
    rm backend/docs/openapi-fresh.json
    exit 1
fi
