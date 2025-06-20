#!/bin/bash

# Pre-commit hook for contract validation
# 
# This hook prevents commits that would introduce contract misalignments
# Install by copying to .git/hooks/pre-commit or using a git hooks manager
#
# Installation:
#   cp scripts/contract-sync/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit

set -e

echo "🔍 Running contract alignment validation..."

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo "❌ This script must be run from the project root"
    exit 1
fi

# Check if contract sync scripts exist
if [ ! -f "scripts/contract-sync/validate-alignment.ts" ]; then
    echo "❌ Contract validation scripts not found. Skipping validation."
    exit 0
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track if any critical changes are detected
CRITICAL_CHANGES=0

# Check for changes in critical files
echo "Checking for contract-affecting changes..."

# Backend model changes
if git diff --cached --name-only | grep -q "backend/internal/models/"; then
    echo -e "${YELLOW}⚠️  Backend model changes detected${NC}"
    CRITICAL_CHANGES=1
fi

# Backend API handler changes
if git diff --cached --name-only | grep -q "backend/internal/api/.*_handlers\.go"; then
    echo -e "${YELLOW}⚠️  Backend API handler changes detected${NC}"
    CRITICAL_CHANGES=1
fi

# Database migration changes
if git diff --cached --name-only | grep -q "backend/database/migrations/"; then
    echo -e "${YELLOW}⚠️  Database migration changes detected${NC}"
    CRITICAL_CHANGES=1
fi

# Frontend type changes
if git diff --cached --name-only | grep -q "src/lib/types/"; then
    echo -e "${YELLOW}⚠️  Frontend type changes detected${NC}"
    CRITICAL_CHANGES=1
fi

# API client changes
if git diff --cached --name-only | grep -q "src/lib/api-client/"; then
    echo -e "${YELLOW}⚠️  API client changes detected${NC}"
    CRITICAL_CHANGES=1
fi

if [ $CRITICAL_CHANGES -eq 0 ]; then
    echo -e "${GREEN}✅ No contract-affecting changes detected${NC}"
    exit 0
fi

# Extract Go contracts
echo "Extracting Go contracts..."
if ! npx ts-node scripts/contract-sync/extract-go-contracts.ts backend extracted-contracts.json; then
    echo -e "${RED}❌ Failed to extract Go contracts${NC}"
    exit 1
fi

# Validate alignment
echo "Validating contract alignment..."
if ! npx ts-node scripts/contract-sync/validate-alignment.ts validation-report.json; then
    echo -e "${RED}❌ Contract validation failed!${NC}"
    echo ""
    echo "See validation-report.md for details"
    echo ""
    
    # Show critical issues
    if [ -f "validation-report.json" ]; then
        CRITICAL_COUNT=$(jq '.issueCount.critical' validation-report.json)
        HIGH_COUNT=$(jq '.issueCount.high' validation-report.json)
        
        if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 0 ]; then
            echo -e "${RED}Found $CRITICAL_COUNT critical and $HIGH_COUNT high severity issues${NC}"
            echo ""
            echo "Critical issues must be fixed before committing:"
            jq -r '.issues[] | select(.severity == "CRITICAL") | "  - " + .description' validation-report.json
            echo ""
            echo "To bypass this check (NOT RECOMMENDED), use:"
            echo "  git commit --no-verify"
        fi
    fi
    
    exit 1
fi

echo -e "${GREEN}✅ Contract validation passed${NC}"

# Check if types need regeneration
echo "Checking if types need regeneration..."
if [ -f "extracted-contracts.json" ]; then
    # Compare with existing generated types timestamp
    if [ -d "src/lib/types/generated" ]; then
        CONTRACTS_TIME=$(stat -f "%m" extracted-contracts.json 2>/dev/null || stat -c "%Y" extracted-contracts.json)
        TYPES_TIME=$(stat -f "%m" src/lib/types/generated/index.ts 2>/dev/null || stat -c "%Y" src/lib/types/generated/index.ts)
        
        if [ "$CONTRACTS_TIME" -gt "$TYPES_TIME" ]; then
            echo -e "${YELLOW}⚠️  Generated types are out of date${NC}"
            echo "Run: npx ts-node scripts/contract-sync/generate-types.ts"
            echo ""
            echo "To auto-generate now, set AUTO_GENERATE_TYPES=1"
            
            if [ "$AUTO_GENERATE_TYPES" = "1" ]; then
                echo "Auto-generating types..."
                if npx ts-node scripts/contract-sync/generate-types.ts; then
                    echo -e "${GREEN}✅ Types regenerated successfully${NC}"
                    git add src/lib/types/generated/
                else
                    echo -e "${RED}❌ Failed to regenerate types${NC}"
                    exit 1
                fi
            else
                exit 1
            fi
        fi
    fi
fi

# Clean up temporary files
rm -f extracted-contracts.json validation-report.json validation-report.md

echo -e "${GREEN}✅ All contract checks passed${NC}"
exit 0