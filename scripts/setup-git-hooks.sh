#!/bin/bash

#
# Setup Git Hooks for TypeScript Strict Mode Enforcement
# 
# This script installs pre-commit hooks that enforce TypeScript strict mode
# and contract alignment validation before allowing commits.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_SOURCE_DIR="$PROJECT_ROOT/.github/hooks"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

echo "🔧 Setting up Git hooks for TypeScript strict mode enforcement..."
echo "Project root: $PROJECT_ROOT"

# Check if we're in a git repository
if [ ! -d "$PROJECT_ROOT/.git" ]; then
    echo "❌ Error: Not in a Git repository"
    echo "Please run this script from within a Git repository"
    exit 1
fi

# Check if hooks source directory exists
if [ ! -d "$HOOKS_SOURCE_DIR" ]; then
    echo "❌ Error: Hooks source directory not found: $HOOKS_SOURCE_DIR"
    exit 1
fi

# Create git hooks directory if it doesn't exist
if [ ! -d "$GIT_HOOKS_DIR" ]; then
    echo "📁 Creating Git hooks directory..."
    mkdir -p "$GIT_HOOKS_DIR"
fi

# Install pre-commit hook
echo "📦 Installing pre-commit hook..."
if [ -f "$HOOKS_SOURCE_DIR/pre-commit" ]; then
    cp "$HOOKS_SOURCE_DIR/pre-commit" "$GIT_HOOKS_DIR/pre-commit"
    chmod +x "$GIT_HOOKS_DIR/pre-commit"
    echo "✅ Pre-commit hook installed and made executable"
else
    echo "❌ Error: Pre-commit hook source not found"
    exit 1
fi

# Verify installation
echo "🔍 Verifying installation..."
if [ -x "$GIT_HOOKS_DIR/pre-commit" ]; then
    echo "✅ Pre-commit hook is installed and executable"
else
    echo "❌ Error: Pre-commit hook installation failed"
    exit 1
fi

# Test npm scripts availability
echo "🧪 Testing npm scripts availability..."

if npm run typecheck:strict --silent > /dev/null 2>&1; then
    echo "✅ typecheck:strict script available"
else
    echo "⚠️  Warning: typecheck:strict script not available"
    echo "   Add the following to package.json scripts:"
    echo "   \"typecheck:strict\": \"tsc --noEmit --strict\""
fi

if npm run contracts:sync --silent > /dev/null 2>&1; then
    echo "✅ contracts:sync script available"
else
    echo "⚠️  Warning: contracts:sync script not available"
    echo "   Contract sync functionality may be limited"
fi

# Create hook configuration file
echo "📄 Creating hook configuration..."
cat > "$PROJECT_ROOT/.githooks.config" << EOF
# Git Hooks Configuration for DomainFlow Frontend
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# TypeScript strict mode enforcement
ENFORCE_STRICT_TYPESCRIPT=true
ENFORCE_SAFEBIGINT_PATTERNS=true

# Contract validation
VALIDATE_CONTRACT_ALIGNMENT=true
WARN_ON_CONTRACT_CHANGES=true

# Performance settings
MAX_TYPECHECK_TIME=30
ENABLE_PARALLEL_CHECKS=true

# Hook version
HOOKS_VERSION=1.0.0
EOF

echo "✅ Hook configuration created at .githooks.config"

echo ""
echo "🎉 Git hooks setup completed successfully!"
echo ""
echo "📋 What was installed:"
echo "  • Pre-commit hook: Enforces TypeScript strict mode (0 errors)"
echo "  • SafeBigInt pattern validation"
echo "  • Contract alignment warnings"
echo ""
echo "💡 Next steps:"
echo "  1. Test the hook: git commit -m 'test commit'"
echo "  2. Run full validation: npm run ci:validate"
echo "  3. Enable for team: Add this script to setup documentation"
echo ""
echo "🚫 To bypass hooks temporarily (not recommended):"
echo "   git commit --no-verify -m 'message'"
echo ""
echo "✨ Your commits will now be validated for TypeScript strict mode compliance!"