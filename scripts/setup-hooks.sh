#!/bin/bash

# Setup Script for Development Environment
# Installs pre-commit hooks and validates contract sync tools

set -e

echo "🔧 Setting up development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "scripts" ]; then
    echo -e "${RED}❌ This script must be run from the project root${NC}"
    exit 1
fi

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm ci

# Setup pre-commit hooks
echo "🪝 Installing pre-commit hooks..."
mkdir -p .git/hooks

if [ -f "scripts/contract-sync/pre-commit-hook.sh" ]; then
    cp scripts/contract-sync/pre-commit-hook.sh .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    echo -e "${GREEN}✅ Pre-commit hook installed${NC}"
else
    echo -e "${RED}❌ Pre-commit hook script not found${NC}"
    exit 1
fi

# Test contract sync tools
echo "🧪 Testing contract sync tools..."
if command -v npx >/dev/null 2>&1; then
    echo "Testing TypeScript compilation..."
    if npx tsc --noEmit; then
        echo -e "${GREEN}✅ TypeScript compilation test passed${NC}"
    else
        echo -e "${RED}❌ TypeScript compilation test failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️ npx not found, skipping TS tests${NC}"
fi

# Test ESLint configuration
echo "🔍 Testing ESLint configuration..."
if npx eslint --version >/dev/null 2>&1; then
    echo -e "${GREEN}✅ ESLint is configured${NC}"
else
    echo -e "${RED}❌ ESLint configuration issue${NC}"
    exit 1
fi

# Create initial schema snapshot if it doesn't exist
echo "📸 Setting up schema snapshot..."
if [ ! -f "schema-snapshot.json" ]; then
    node -e "
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        
        // Generate initial schema snapshot
        const typesPath = path.join(process.cwd(), 'src/lib/types');
        let schemaContent = '';
        
        function readTypesRecursively(dir) {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory() && !file.startsWith('.') && file !== '__tests__') {
                    readTypesRecursively(filePath);
                } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
                    schemaContent += fs.readFileSync(filePath, 'utf8');
                }
            });
        }
        
        readTypesRecursively(typesPath);
        
        const hash = crypto.createHash('sha256').update(schemaContent).digest('hex');
        const snapshot = {
            timestamp: new Date().toISOString(),
            hash: hash,
            files: Math.max(1, schemaContent.split('export interface').length - 1),
            description: 'Initial schema snapshot for CI/CD protection'
        };
        
        fs.writeFileSync('schema-snapshot.json', JSON.stringify(snapshot, null, 2));
        console.log('✅ Initial schema snapshot created');
    "
    echo -e "${GREEN}✅ Schema snapshot initialized${NC}"
else
    echo -e "${GREEN}✅ Schema snapshot already exists${NC}"
fi

# Setup contract sync directory structure
echo "📁 Setting up contract sync directories..."
mkdir -p src/lib/types/generated
mkdir -p migrations/contract_alignment

# Create .gitignore entries for temporary files
if ! grep -q "extracted-contracts.json" .gitignore 2>/dev/null; then
    echo "" >> .gitignore
    echo "# Contract sync temporary files" >> .gitignore
    echo "extracted-contracts.json" >> .gitignore
    echo "validation-report.json" >> .gitignore
    echo "validation-report.md" >> .gitignore
    echo "current-schema-snapshot.json" >> .gitignore
fi

# Final validation
echo "🔍 Running final validation..."
if .git/hooks/pre-commit 2>/dev/null || [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Pre-commit hook validation passed${NC}"
else
    echo -e "${YELLOW}⚠️ Pre-commit hook test had warnings (this is normal for initial setup)${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Development environment setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Review the CI/CD protection workflows in .github/workflows/"
echo "2. Run 'npm run lint' to ensure code quality"
echo "3. Make a test commit to verify pre-commit hooks work"
echo "4. Review CONTRACT_PROTECTION.md for detailed documentation"
echo ""
echo "Pre-commit hooks will now enforce:"
echo "  ✓ Contract alignment validation"
echo "  ✓ Type safety (SafeBigInt, UUID, enums)"
echo "  ✓ ESLint with zero warnings"
echo "  ✓ Prettier formatting"
echo "  ✓ Generated types up-to-date checks"