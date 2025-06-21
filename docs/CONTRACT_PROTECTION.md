# Contract Protection & CI/CD Pipeline Enforcement

## Overview

This document describes the comprehensive contract protection system that enforces alignment between Go backend, PostgreSQL database, and TypeScript frontend. The system prevents contract violations through automated validation in CI/CD pipelines and pre-commit hooks.

## 🎯 **PROTECTION STATUS: ACTIVE** ✅

**Last Updated:** 2025-06-21T17:38:00Z
**Validation Status:** ✅ ALL SYSTEMS OPERATIONAL
**Contract Alignment:** ✅ PASSED (0 critical, 0 high, 0 medium, 0 low issues)
**TypeScript Compilation:** ✅ CLEAN (0 errors)
**ESLint Validation:** ✅ ZERO WARNINGS ACHIEVED
**Pre-commit Hooks:** ✅ INSTALLED AND ACTIVE
**GitHub Actions:** ✅ WORKFLOWS OPERATIONAL

**System transitioned from remediation to protected state on 2025-06-21.**

## 🔒 Protection Mechanisms

### 1. Contract Sync Validation
- **Backend Source of Truth**: Go models and API endpoints are extracted and used as the authoritative source
- **Type Generation**: TypeScript types are auto-generated from Go contracts to ensure 100% alignment
- **Database Schema Validation**: Database migrations must match Go model structures
- **API Endpoint Verification**: All required endpoints must be implemented and accessible

### 2. Type Safety Enforcement
- **SafeBigInt Protection**: All int64/uint64 fields must use SafeBigInt branded types
- **UUID Validation**: ID fields must use UUID branded types instead of primitive strings
- **Enum Consistency**: Enum values must match exactly across all layers (Go, DB constraints, TS)
- **Branded Type Usage**: Prevents primitive type usage where branded types are required

### 3. Schema Snapshot Protection
- **Change Detection**: Schema changes require explicit snapshot updates
- **Test Coverage Gates**: New types must have corresponding test files
- **Breaking Change Prevention**: Unauthorized schema modifications are blocked

### 4. Code Quality Gates
- **Zero-Warning ESLint**: No ESLint warnings allowed in production code
- **Prettier Formatting**: Consistent code formatting enforced
- **TypeScript Compilation**: Must compile without errors
- **Import Validation**: Proper import usage and dependency management

## 🚀 GitHub Actions Workflows

### Contract Alignment Workflow (`.github/workflows/contract-alignment.yml`)

**Triggers:**
- Pull requests affecting backend models, API handlers, database migrations, frontend types, or API client
- Pushes to main/develop branches

**Jobs:**
1. **validate-contracts**: Extracts Go contracts and validates alignment across all layers
2. **check-migrations**: Verifies database migration integrity
3. **security-check**: Flags security-sensitive contract changes for review

**Failure Conditions:**
- Contract drift detected between backend and frontend
- Missing required API endpoints
- Enum value mismatches
- Database schema inconsistencies

### Type Safety Workflow (`.github/workflows/type-safety.yml`)

**Triggers:**
- Changes to TypeScript files, configs, or package.json

**Jobs:**
1. **lint-and-format**: Zero-tolerance ESLint and Prettier validation
2. **type-safety-validation**: SafeBigInt, UUID, and enum usage validation
3. **schema-consistency**: Zod schema validation
4. **test-coverage-gate**: Ensures new types have tests
5. **snapshot-validation**: Schema change detection and validation

**Failure Conditions:**
- Any ESLint warnings or errors
- Formatting violations
- TypeScript compilation errors
- Primitive type usage where branded types required
- Missing test coverage for new types
- Unauthorized schema changes

## 🪝 Pre-commit Hooks

The pre-commit hook (`scripts/contract-sync/pre-commit-hook.sh`) provides local validation before commits:

**Validation Steps:**
1. Detects contract-affecting changes
2. Extracts fresh Go contracts
3. Validates alignment with frontend types
4. Checks for type regeneration needs
5. Prevents commits with critical/high severity issues

**Installation:**
```bash
./scripts/setup-hooks.sh
```

**Manual Installation:**
```bash
cp scripts/contract-sync/pre-commit-hook.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## 🛠️ Contract Sync Tools

### Extract Go Contracts
```bash
npx ts-node scripts/contract-sync/extract-go-contracts.ts backend extracted-contracts.json
```

Extracts type definitions, enums, and API endpoints from Go codebase.

### Validate Alignment
```bash
npx ts-node scripts/contract-sync/validate-alignment.ts validation-report.json
```

Validates contract alignment and generates detailed reports.

### Generate TypeScript Types
```bash
npx ts-node scripts/contract-sync/generate-types.ts extracted-contracts.json src/lib/types/generated
```

Auto-generates TypeScript types from Go contracts with SafeBigInt integration.

## 📋 NPM Scripts

Add these to your `package.json`:

```json
{
  "scripts": {
    "contracts:extract": "npx ts-node scripts/contract-sync/extract-go-contracts.ts backend extracted-contracts.json",
    "contracts:validate": "npx ts-node scripts/contract-sync/validate-alignment.ts validation-report.json",
    "contracts:generate": "npx ts-node scripts/contract-sync/generate-types.ts extracted-contracts.json src/lib/types/generated",
    "contracts:sync": "npm run contracts:extract && npm run contracts:generate",
    "contracts:full-check": "npm run contracts:extract && npm run contracts:validate",
    "lint:strict": "eslint src --ext .ts,.tsx --max-warnings=0",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,js,jsx,json,md}\"",
    "format:fix": "prettier --write \"src/**/*.{ts,tsx,js,jsx,json,md}\"",
    "type-check": "tsc --noEmit"
  }
}
```

## 🔧 Usage Examples

### Daily Development Workflow

1. **Make Backend Changes:**
   ```bash
   # Modify Go models/API handlers
   vim backend/internal/models/campaign.go
   ```

2. **Sync Frontend Types:**
   ```bash
   npm run contracts:sync
   ```

3. **Validate Changes:**
   ```bash
   npm run contracts:validate
   ```

4. **Commit (Automatically Validated):**
   ```bash
   git add .
   git commit -m "feat: add new campaign field"
   # Pre-commit hook automatically validates
   ```

### Handling Contract Violations

**Critical Issues (Blocks CI/CD):**
- int64 fields using primitive `number` instead of `SafeBigInt`
- Missing required API endpoints
- Enum value mismatches between layers

**Resolution:**
1. Review validation report: `validation-report.md`
2. Fix critical issues first
3. Regenerate types if needed: `npm run contracts:generate`
4. Re-run validation: `npm run contracts:validate`

### Emergency Bypass (NOT RECOMMENDED)

```bash
# Only in true emergencies
git commit --no-verify -m "Emergency commit"
```

**Warning:** This bypasses ALL safety checks and may introduce contract violations.

## 📊 Validation Reports

The system generates detailed reports in JSON and Markdown formats:

**validation-report.json**: Machine-readable validation results
**validation-report.md**: Human-readable report with issues and recommendations

**Sample Report Structure:**
```json
{
  "timestamp": "2025-01-20T10:00:00Z",
  "passed": false,
  "issueCount": {
    "critical": 2,
    "high": 1,
    "medium": 0,
    "low": 3
  },
  "issues": [
    {
      "severity": "CRITICAL",
      "layer": "frontend",
      "type": "int64_type_mismatch",
      "field": "Campaign.totalItems",
      "expected": "SafeBigInt",
      "actual": "number",
      "description": "TypeScript field should use SafeBigInt for int64 values"
    }
  ],
  "recommendations": [
    "Implement SafeBigInt across all int64 fields to prevent numeric overflow"
  ]
}
```

## 🔍 Monitoring & Alerts

### CI/CD Failure Notifications
- Failed contract validation appears as PR comments
- Artifacts contain detailed validation reports
- Security-sensitive changes trigger review requirements

### Metrics Tracked
- Contract alignment success rate
- Number of validation issues by severity
- Time to resolve contract violations
- Type safety compliance percentage

## 🎯 Best Practices

### For Backend Developers
1. **Always define proper Go types** with appropriate JSON tags
2. **Use int64 for large numbers** that might exceed JavaScript's safe integer range
3. **Define enums as constants** with clear naming patterns
4. **Include proper struct validation tags**

### For Frontend Developers
1. **Use generated types exclusively** - never manually define backend-matching types
2. **Always use SafeBigInt** for int64 fields from backend
3. **Use UUID branded types** for ID fields
4. **Import from generated types directory** rather than manually typed interfaces

### For DevOps/CI/CD
1. **Monitor workflow success rates** and investigate frequent failures
2. **Set up alerts** for critical contract validation failures
3. **Review security-flagged changes** thoroughly
4. **Keep contract sync tools updated** with backend changes

## 🚨 Security Considerations

**Contract changes affecting authentication, authorization, or user data trigger additional security review requirements:**

- Changes to `auth`, `user`, `session`, or `permission` related models
- Automatic labeling with `security-review-required`
- Mandatory security team approval before merging

## 📈 Continuous Improvement

The contract protection system includes mechanisms for continuous improvement:

1. **Regular validation reports** help identify common issues
2. **Automated type generation** reduces manual sync overhead  
3. **Snapshot-based change detection** prevents unauthorized modifications
4. **Comprehensive test coverage requirements** ensure reliability

This system ensures that your frontend always stays synchronized with your backend contracts, preventing runtime errors and data inconsistencies while maintaining type safety across the entire stack.