# REMEDIATION EXECUTION PLAN

**Generated:** 2025-06-20 10:52 UTC  
**Phase:** Contract Alignment Implementation  
**Duration:** 5 weeks total  
**Approach:** Phased rollout with validation gates

## Executive Summary

This plan provides step-by-step instructions for remediating 87 contract violations across the codebase. Implementation follows a risk-based approach with Critical (P0) issues first, followed by High (P1), Medium (P2), and Low (P3) priority items.

---

## Phase 1: Critical Fixes (Week 1)

### Day 1-2: Int64 Safety Implementation

#### Step 1.1: Database Migration Preparation
```bash
# 1. Backup affected tables
pg_dump -h localhost -U postgres -t campaigns -t domain_generation_params -t generated_domains > backup_int64_tables.sql

# 2. Verify backup
pg_restore --list backup_int64_tables.sql

# 3. Test migration in staging
psql -h staging -U postgres -d appdb < migrations/contract_alignment/001_critical_int64_fields.sql
```

#### Step 1.2: Deploy Database Changes
```sql
-- Run migration with monitoring
BEGIN;
-- Execute migration
\i migrations/contract_alignment/001_critical_int64_fields.sql
-- Verify changes
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name IN ('campaigns', 'domain_generation_params') 
AND column_name LIKE '%items%';
COMMIT;
```

#### Step 1.3: Update Frontend Types
```bash
# 1. Copy aligned types to production
cp src/lib/types/aligned/*.ts src/lib/types/

# 2. Update imports in API client wrapper
# Edit src/lib/api/api-client-wrapper.ts to use new types

# 3. Test type safety
npm run type-check
```

#### Step 1.4: Update API Transformations
```typescript
// Update src/lib/api/transformers/campaign-transformers.ts
import { transformCampaign } from '@/lib/types/aligned/transformation-layer';

// Apply to all campaign endpoints
export const campaignApiTransformers = {
  transformResponse: transformCampaign,
  transformRequest: serializeCampaignForAPI
};
```

**Validation Checkpoint:**
- [ ] Run test suite: `npm test -- --coverage`
- [ ] Test with value 9,007,199,254,740,992 (> MAX_SAFE_INTEGER)
- [ ] Verify WebSocket messages handle int64 correctly
- [ ] Check API serialization in network tab

### Day 3-4: User Management API Implementation

#### Step 2.1: Create Backend Handlers
```go
// Create backend/internal/api/user_management_handlers.go
// Implement CRUD operations with proper validation
```

#### Step 2.2: Add Routes
```go
// Update backend/cmd/apiserver/main.go
adminGroup := v2.Group("/admin", middleware.RequireAdmin())
{
    adminGroup.GET("/users", handlers.ListUsers)
    adminGroup.POST("/users", handlers.CreateUser)
    adminGroup.PUT("/users/:id", handlers.UpdateUser)
    adminGroup.DELETE("/users/:id", handlers.DeleteUser)
}
```

#### Step 2.3: Add Database Methods
```go
// Create backend/internal/store/postgres/user_store.go
// Implement store interface methods
```

#### Step 2.4: Update Frontend Service
```typescript
// Update src/lib/services/adminService.ts
async listUsers(params?: ListUsersRequest): Promise<ListUsersResponse> {
  return this.get('/api/v2/admin/users', { params });
}
```

**Validation Checkpoint:**
- [ ] Test all CRUD operations via Postman/curl
- [ ] Verify permission checks (403 for non-admin)
- [ ] Check audit logging for all operations
- [ ] Test pagination and filtering

### Day 5: Missing Required Fields

#### Step 3.1: Run Database Migration
```bash
psql -U postgres -d appdb < migrations/contract_alignment/002_missing_required_columns.sql
```

#### Step 3.2: Update Go Models
```go
// Update backend/internal/services/campaign_orchestrator_service.go
type DomainGenerationCampaignParams struct {
    // ... existing fields
    TotalPossibleCombinations int64 `json:"totalPossibleCombinations" validate:"required,min=1"`
    CurrentOffset            int64 `json:"currentOffset" validate:"min=0"`
}
```

#### Step 3.3: Update OpenAPI Spec
```yaml
# Update backend/docs/swagger.yaml
DomainGenerationParams:
  required:
    - totalPossibleCombinations
    - currentOffset
```

#### Step 3.4: Regenerate TypeScript Client
```bash
# If using OpenAPI generator
npm run generate:api-client
```

**Validation Checkpoint:**
- [ ] Create domain generation campaign with all fields
- [ ] Verify offset tracking works correctly
- [ ] Test campaign resume functionality
- [ ] Check field validation errors

---

## Phase 2: High Priority Fixes (Week 2)

### Day 6-7: Enum Alignment

#### Step 4.1: Run Enum Migration
```bash
psql -U postgres -d appdb < migrations/contract_alignment/003_enum_constraints_alignment.sql
```

#### Step 4.2: Update Frontend Enums
```typescript
// Remove 'archived' from CampaignStatus
// Update all references in components
// Fix HTTPSourceType to use PascalCase
```

#### Step 4.3: Add Enum Validation
```go
// Backend validation
if !models.IsValidCampaignStatus(req.Status) {
    return errors.New("invalid campaign status")
}
```

**Validation Checkpoint:**
- [ ] Test all enum values via API
- [ ] Verify database constraints work
- [ ] Check UI dropdowns show correct values
- [ ] Test invalid enum rejection

### Day 8: Session Refresh Implementation

#### Step 5.1: Implement Refresh Logic
```typescript
// src/lib/services/authService.ts
private async refreshSession(): Promise<void> {
  const response = await this.post('/api/v2/auth/refresh', {
    sessionId: this.currentSessionId
  });
  
  this.updateSession(response.data);
  this.scheduleNextRefresh(response.data.expiresAt);
}
```

#### Step 5.2: Add Auto-Refresh
```typescript
// Set up refresh 5 minutes before expiry
private scheduleNextRefresh(expiresAt: string) {
  const expiryTime = new Date(expiresAt).getTime();
  const refreshTime = expiryTime - (5 * 60 * 1000); // 5 minutes before
  const delay = refreshTime - Date.now();
  
  if (delay > 0) {
    setTimeout(() => this.refreshSession(), delay);
  }
}
```

**Validation Checkpoint:**
- [ ] Test session extends without logout
- [ ] Verify concurrent requests handled
- [ ] Check refresh failure handling
- [ ] Monitor network traffic

### Day 9-10: API Endpoint Fixes

#### Step 6.1: Update Persona Service
```typescript
// Fix persona API calls to use type-specific endpoints
async listPersonas(type: PersonaType): Promise<Persona[]> {
  return this.get(`/api/v2/personas/${type}`);
}

async deletePersona(id: string, type: PersonaType): Promise<void> {
  return this.delete(`/api/v2/personas/${type}/${id}`);
}
```

#### Step 6.2: Fix HTTP Source Type
```typescript
// Update campaign form to send PascalCase
const params = {
  sourceType: 'DomainGeneration', // Not 'domain_generation'
  sourceCampaignId: selectedCampaign.id
};
```

**Validation Checkpoint:**
- [ ] Test persona CRUD for both types
- [ ] Verify HTTP keyword campaigns work
- [ ] Check error messages for wrong type
- [ ] Test campaign creation flow

---

## Phase 3: Medium Priority Fixes (Week 3-4)

### Day 11-15: Type Safety Improvements

#### Step 7.1: Implement UUID Branding
```typescript
// Apply UUID type throughout codebase
import { UUID, createUUID } from '@/lib/types/branded';

// Update all ID references
const userId: UUID = createUUID(response.data.id);
```

#### Step 7.2: Add Validation Rules
```go
// Backend validation additions
type UpdateCampaignRequest struct {
    BatchSize     int `json:"batchSize" validate:"omitempty,min=1,max=10000"`
    RetryAttempts int `json:"retryAttempts" validate:"omitempty,min=0,max=10"`
}
```

### Day 16-20: Security Enhancements

#### Step 8.1: MFA UI Implementation
```typescript
// Create MFA setup flow
// Add TOTP generation
// Implement recovery codes
// Add to user settings
```

#### Step 8.2: Session Fingerprinting
```typescript
// Collect browser fingerprint
const fingerprint = await generateFingerprint();
// Include in auth requests
```

#### Step 8.3: Audit Log UI
```typescript
// Create audit log viewer component
// Add to admin panel
// Implement filtering and export
```

---

## Phase 4: Low Priority Fixes (Week 5)

### Day 21-25: Technical Debt

#### Step 9.1: Naming Conventions
```bash
# Run naming convention migration
psql -U postgres -d appdb < migrations/contract_alignment/004_naming_convention_fixes.sql
```

#### Step 9.2: Monitoring UI
```typescript
// Add rate limit feedback
// Show security warnings
// Implement metric dashboards
```

---

## Validation Gates

### After Each Phase:

1. **Automated Testing**
   ```bash
   # Backend tests
   cd backend && go test ./... -cover
   
   # Frontend tests
   npm test -- --coverage
   
   # E2E tests
   npm run test:e2e
   ```

2. **Contract Validation**
   ```bash
   # Extract and validate contracts
   npx ts-node scripts/contract-sync/extract-go-contracts.ts
   npx ts-node scripts/contract-sync/validate-alignment.ts
   ```

3. **Performance Testing**
   ```bash
   # Load test critical endpoints
   npm run test:load
   ```

4. **Security Scan**
   ```bash
   # Run security scanner
   cd backend && go run cmd/security_scanner/main.go
   ```

---

## Rollback Procedures

### For Database Changes:
```sql
-- Each migration includes rollback
-- Example for int64 fields:
UPDATE public.schema_migrations 
SET rolled_back_at = NOW() 
WHERE version = '001_critical_int64_fields';
```

### For Code Changes:
```bash
# Use git tags for each phase
git tag phase1-complete
git push --tags

# Rollback if needed
git checkout phase1-complete
```

### For Feature Flags:
```typescript
// Disable features via config
{
  "features": {
    "userManagementAPI": false,
    "safeBigIntHandling": false
  }
}
```

---

## Success Criteria

- [ ] All 87 contract violations resolved
- [ ] Zero data loss during migration
- [ ] No increase in error rates
- [ ] All tests passing
- [ ] Performance benchmarks maintained
- [ ] Security audit passed

---

## Post-Implementation

1. **Remove Feature Flags** (Week 6)
2. **Update Documentation** (Week 6)
3. **Team Training** on new patterns (Week 6)
4. **Set Up Continuous Monitoring** (Week 6)
5. **Schedule Follow-up Audit** (Week 8)

---

**Critical Path:** Phase 1 must complete before Phase 2. Phases 3 and 4 can run in parallel if resources allow.

**Point of Contact:** Assign a technical lead for each phase to ensure accountability.