#!/bin/bash

# ==============================================================================
# CONTRACT VALIDATOR - Pre-commit Hook for Three-Layer Contract Alignment
# ==============================================================================
#
# This script validates contract alignment between Go backend, PostgreSQL 
# database, and TypeScript frontend before allowing commits.
#
# Installation:
#   1. Copy to .git/hooks/pre-commit
#   2. Make executable: chmod +x .git/hooks/pre-commit
#   3. Or symlink: ln -s ../../audit/sync_pipeline/contract_validator.sh .git/hooks/pre-commit
#
# Features:
#   - Detects changes to contract-defining files
#   - Validates type alignment across layers
#   - Checks for int64 safety in TypeScript
#   - Ensures enum consistency
#   - Validates WebSocket message formats
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation failed, commit blocked
#   2 - Script error

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# File patterns to monitor
GO_PATTERNS=(
    "backend/internal/models/*.go"
    "backend/internal/api/*_handlers.go"
    "backend/internal/websocket/message_types.go"
)

TS_PATTERNS=(
    "src/lib/types/*.ts"
    "src/lib/api-client/model/*.ts"
    "src/lib/websocket/*.ts"
)

SQL_PATTERNS=(
    "migrations/*.sql"
    "backend/migrations/*.sql"
)

# Contract files
BACKEND_CONTRACTS="audit/backend_contracts.json"
FRONTEND_CONTRACTS="audit/frontend_contracts.json"
DATABASE_SCHEMA="audit/database_schema.json"
VALIDATION_REPORT="audit/cross_layer_validation_report.json"

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if any files matching patterns have been staged
has_staged_files() {
    local patterns=("$@")
    for pattern in "${patterns[@]}"; do
        if git diff --cached --name-only | grep -q "$pattern"; then
            return 0
        fi
    done
    return 1
}

# ==============================================================================
# VALIDATION FUNCTIONS
# ==============================================================================

# Check for unsafe number usage in TypeScript for int64 fields
check_typescript_int64_safety() {
    log_info "Checking TypeScript int64 safety..."
    
    local errors=0
    local int64_fields=(
        "totalDomains"
        "processedDomains"
        "successfulDomains"
        "failedDomains"
        "offset"
        "totalItems"
        "processedItems"
        "successfulItems"
        "failedItems"
        "totalGenerated"
        "totalValidated"
    )
    
    for file in $(git diff --cached --name-only | grep -E '\.ts$'); do
        if [[ ! -f "$file" ]]; then
            continue
        fi
        
        for field in "${int64_fields[@]}"; do
            # Check for unsafe number type usage
            if grep -n "${field}:.*number" "$file" | grep -v "SafeBigInt"; then
                log_error "Unsafe number type for int64 field '$field' in $file"
                grep -n "${field}:.*number" "$file" | grep -v "SafeBigInt" || true
                ((errors++))
            fi
            
            # Check for direct numeric comparisons without conversion
            if grep -n "${field}.*[<>]=*.*[0-9]" "$file" | grep -v "Number("; then
                log_warning "Direct numeric comparison with int64 field '$field' in $file"
                grep -n "${field}.*[<>]=*.*[0-9]" "$file" | grep -v "Number(" || true
            fi
        done
    done
    
    if [[ $errors -eq 0 ]]; then
        log_success "TypeScript int64 safety check passed"
        return 0
    else
        return 1
    fi
}

# Validate enum consistency across layers
check_enum_consistency() {
    log_info "Checking enum consistency..."
    
    local errors=0
    
    # Check campaign status enum
    if git diff --cached --name-only | grep -qE '(models|types).*\.ts$|\.go$'; then
        # Expected values (excluding 'archived' which was removed)
        local valid_statuses=("pending" "running" "paused" "completed" "failed" "cancelled")
        
        # Check TypeScript files for invalid status
        for file in $(git diff --cached --name-only | grep -E '\.ts$'); do
            if [[ -f "$file" ]] && grep -q "archived" "$file" | grep -i "status"; then
                log_error "Invalid campaign status 'archived' found in $file"
                grep -n "archived" "$file" | grep -i "status" || true
                ((errors++))
            fi
        done
    fi
    
    if [[ $errors -eq 0 ]]; then
        log_success "Enum consistency check passed"
        return 0
    else
        return 1
    fi
}

# Validate WebSocket message structure
check_websocket_format() {
    log_info "Checking WebSocket message format..."
    
    local errors=0
    
    # Check for old WebSocket message structure
    for file in $(git diff --cached --name-only | grep -E 'websocket.*\.ts$'); do
        if [[ ! -f "$file" ]]; then
            continue
        fi
        
        # Check for removed fields
        local removed_fields=("id:" "sequenceNumber:" "message:" "progress:")
        for field in "${removed_fields[@]}"; do
            if grep -q "$field" "$file" | grep -i "websocketmessage"; then
                log_error "WebSocket message contains removed field '$field' in $file"
                grep -n "$field" "$file" | grep -i "websocketmessage" || true
                ((errors++))
            fi
        done
        
        # Ensure correct structure (type, timestamp, data)
        if grep -q "interface.*WebSocketMessage" "$file"; then
            if ! grep -q "type:.*string" "$file"; then
                log_error "WebSocket message missing required 'type' field in $file"
                ((errors++))
            fi
            if ! grep -q "timestamp:.*string" "$file"; then
                log_error "WebSocket message missing required 'timestamp' field in $file"
                ((errors++))
            fi
            if ! grep -q "data:.*unknown" "$file"; then
                log_error "WebSocket message missing required 'data' field in $file"
                ((errors++))
            fi
        fi
    done
    
    if [[ $errors -eq 0 ]]; then
        log_success "WebSocket format check passed"
        return 0
    else
        return 1
    fi
}

# Run contract extraction if needed
update_contracts_if_needed() {
    local regenerate=false
    
    if has_staged_files "${GO_PATTERNS[@]}"; then
        log_info "Go files changed, regenerating backend contracts..."
        regenerate=true
    fi
    
    if has_staged_files "${TS_PATTERNS[@]}"; then
        log_info "TypeScript files changed, regenerating frontend contracts..."
        regenerate=true
    fi
    
    if has_staged_files "${SQL_PATTERNS[@]}"; then
        log_info "SQL files changed, regenerating database schema..."
        regenerate=true
    fi
    
    if [[ "$regenerate" == "true" ]]; then
        # Run contract extraction scripts
        if [[ -f "audit/extract_backend_contracts.py" ]]; then
            python3 audit/extract_backend_contracts.py || {
                log_error "Failed to extract backend contracts"
                return 1
            }
        fi
        
        if [[ -f "audit/extract_frontend_contracts.py" ]]; then
            python3 audit/extract_frontend_contracts.py || {
                log_error "Failed to extract frontend contracts"
                return 1
            }
        fi
        
        if [[ -f "audit/database_introspection.py" ]]; then
            python3 audit/database_introspection.py || {
                log_error "Failed to introspect database schema"
                return 1
            }
        fi
        
        # Run cross-layer validation
        if [[ -f "audit/cross_layer_validator.py" ]]; then
            python3 audit/cross_layer_validator.py || {
                log_error "Failed to validate cross-layer contracts"
                return 1
            }
        fi
    fi
    
    return 0
}

# Check validation report for critical issues
check_validation_report() {
    if [[ ! -f "$VALIDATION_REPORT" ]]; then
        log_warning "Validation report not found, skipping check"
        return 0
    fi
    
    log_info "Checking validation report for critical issues..."
    
    # Check for CRITICAL severity issues
    local critical_count=$(jq '.validation_results[] | select(.severity == "CRITICAL") | .severity' "$VALIDATION_REPORT" 2>/dev/null | wc -l || echo "0")
    
    if [[ $critical_count -gt 0 ]]; then
        log_error "Found $critical_count CRITICAL contract alignment issues!"
        echo ""
        jq -r '.validation_results[] | select(.severity == "CRITICAL") | "  - \(.category): \(.message)"' "$VALIDATION_REPORT" 2>/dev/null || true
        echo ""
        return 1
    else
        log_success "No critical contract alignment issues found"
        return 0
    fi
}

# ==============================================================================
# MAIN VALIDATION FLOW
# ==============================================================================

main() {
    echo "=================================================="
    echo "Contract Alignment Validator - Pre-commit Hook"
    echo "=================================================="
    echo ""
    
    local validation_failed=false
    
    # Skip if no relevant files are staged
    if ! has_staged_files "${GO_PATTERNS[@]}" && \
       ! has_staged_files "${TS_PATTERNS[@]}" && \
       ! has_staged_files "${SQL_PATTERNS[@]}"; then
        log_info "No contract-related files changed, skipping validation"
        exit 0
    fi
    
    # Run validations
    check_typescript_int64_safety || validation_failed=true
    check_enum_consistency || validation_failed=true
    check_websocket_format || validation_failed=true
    
    # Update contracts if needed
    update_contracts_if_needed || validation_failed=true
    
    # Check validation report
    check_validation_report || validation_failed=true
    
    echo ""
    echo "=================================================="
    
    if [[ "$validation_failed" == "true" ]]; then
        echo -e "${RED}Contract validation FAILED!${NC}"
        echo ""
        echo "Please fix the issues above before committing."
        echo "Run 'npm run validate:contracts' for detailed report."
        exit 1
    else
        echo -e "${GREEN}Contract validation PASSED!${NC}"
        echo ""
        exit 0
    fi
}

# Run main function
main "$@"