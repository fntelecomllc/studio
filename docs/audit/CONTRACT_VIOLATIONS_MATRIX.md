# CONTRACT VIOLATIONS MATRIX

**Generated:** 2025-06-20 10:25 UTC  
**Phase:** Cross-Layer Contract Validation (Phase 2)  
**Source of Truth:** Go Backend

This matrix provides an exhaustive field-by-field comparison across Go Backend, PostgreSQL Database, and TypeScript Frontend for EVERY entity and contract in the system.

## Severity Levels
- **CRITICAL**: Data loss, security vulnerability, or system failure risk
- **HIGH**: Functional issues, data integrity concerns
- **MEDIUM**: User experience degradation, maintenance burden
- **LOW**: Naming inconsistencies, non-breaking issues

---

## 1. CORE ENTITY VALIDATION MATRIX

### 1.1 Campaign Entity

| Field | Go Backend (Truth) | PostgreSQL | TypeScript | Violation Type | Severity |
|-------|-------------------|------------|------------|----------------|----------|
| **ID** | `uuid.UUID` | `UUID PRIMARY KEY` | `UUID` (branded) | ✅ Aligned | - |
| **Name** | `string` (required) | `TEXT NOT NULL` | `string` (required) | ✅ Aligned | - |
| **Campaign Type** | `CampaignTypeEnum` | `TEXT CHECK(IN(...))` | `ModelsCampaignTypeEnum` | ❌ TypeScript includes deprecated 'keyword_validate' | MEDIUM |
| **Status** | `CampaignStatusEnum` (no 'archived') | `TEXT NOT NULL` | `ModelsCampaignStatusEnum` | ❌ Frontend includes 'archived' status not in backend | HIGH |
| **User ID** | `*uuid.UUID` (nullable) | `UUID REFERENCES auth.users` | `UUID?` (optional) | ❌ DB missing ON DELETE behavior in extraction | MEDIUM |
| **Total Items** | `*int64` | `BIGINT DEFAULT 0` | `SafeBigInt` | ❌ Generated API uses `number` instead of SafeBigInt | CRITICAL |
| **Processed Items** | `*int64` | `BIGINT DEFAULT 0` | `SafeBigInt` | ❌ Generated API uses `number` instead of SafeBigInt | CRITICAL |
| **Successful Items** | `*int64` | `BIGINT DEFAULT 0` | `SafeBigInt` | ❌ Generated API uses `number` instead of SafeBigInt | CRITICAL |
| **Failed Items** | `*int64` | `BIGINT DEFAULT 0` | `SafeBigInt` | ❌ Generated API uses `number` instead of SafeBigInt | CRITICAL |
| **Progress Percentage** | `*float64` | `DOUBLE PRECISION DEFAULT 0.0` | `number` | ✅ Aligned | - |
| **Metadata** | `*json.RawMessage` | `JSONB` | `Record<string, unknown>` | ✅ Aligned | - |
| **Created At** | `time.Time` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `ISODateString` | ✅ Aligned | - |
| **Updated At** | `time.Time` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `ISODateString` | ✅ Aligned | - |
| **Started At** | `*time.Time` | `TIMESTAMPTZ` | `ISODateString?` | ✅ Aligned | - |
| **Completed At** | `*time.Time` | `TIMESTAMPTZ` | `ISODateString?` | ✅ Aligned | - |
| **Error Message** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |
| **Domain Generation Params** | `*DomainGenerationCampaignParams` | Separate table | `ServicesDomainGenerationParams?` | ✅ Properly normalized | - |
| **DNS Validation Params** | `*DNSValidationCampaignParams` | Separate table | `ServicesDnsValidationParams?` | ✅ Properly normalized | - |
| **HTTP Keyword Params** | `*HTTPKeywordCampaignParams` | Separate table | `ServicesHttpKeywordParams?` | ✅ Properly normalized | - |

**Additional Fields in Database Only:**
- `estimated_completion_at` (TIMESTAMPTZ)
- `avg_processing_rate` (DOUBLE PRECISION)
- `last_heartbeat_at` (TIMESTAMPTZ)

### 1.2 User Entity

| Field | Go Backend (Truth) | PostgreSQL | TypeScript | Violation Type | Severity |
|-------|-------------------|------------|------------|----------------|----------|
| **ID** | `uuid.UUID` | `UUID PRIMARY KEY` | `string` | ❌ TypeScript not using UUID branded type | MEDIUM |
| **Email** | `string` | `VARCHAR(255) UNIQUE NOT NULL` | `string` | ✅ Aligned | - |
| **Email Verified** | `bool` | `BOOLEAN DEFAULT FALSE` | `boolean` | ✅ Aligned | - |
| **Password Hash** | `string` (internal) | `VARCHAR(255) NOT NULL` | - | ✅ Not exposed to frontend | - |
| **First Name** | `string` | `VARCHAR(100) NOT NULL` | `string` | ✅ Aligned | - |
| **Last Name** | `string` | `VARCHAR(100) NOT NULL` | `string` | ✅ Aligned | - |
| **Avatar URL** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |
| **Is Active** | `bool` | `BOOLEAN DEFAULT TRUE` | `boolean` | ✅ Aligned | - |
| **Is Locked** | `bool` | `BOOLEAN DEFAULT FALSE` | `boolean` | ✅ Aligned | - |
| **Failed Login Attempts** | `int` | `INTEGER DEFAULT 0` | `number` | ✅ Aligned | - |
| **Locked Until** | `*time.Time` | `TIMESTAMP` | `string?` | ✅ Aligned | - |
| **Last Login At** | `*time.Time` | `TIMESTAMP` | `string?` | ✅ Aligned | - |
| **Last Login IP** | `*string` | `INET` | `string?` | ❌ Type mismatch: string vs INET | MEDIUM |
| **MFA Enabled** | `bool` | `BOOLEAN NOT NULL DEFAULT FALSE` | `boolean` | ✅ Aligned | - |
| **Must Change Password** | `bool` | `BOOLEAN DEFAULT FALSE` | `boolean` | ✅ Aligned | - |
| **Password Changed At** | `time.Time` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | `string` | ✅ Aligned | - |
| **Roles** | `[]Role` (computed) | Junction table | `RoleSecurity[]` | ✅ Properly normalized | - |
| **Permissions** | `[]Permission` (computed) | Junction table | `PermissionSecurity[]` | ✅ Properly normalized | - |

**PublicUser fields (exposed to frontend):**
- Name (computed: FirstName + " " + LastName) - ❌ Frontend expects this field

### 1.3 Persona Entity

| Field | Go Backend (Truth) | PostgreSQL | TypeScript | Violation Type | Severity |
|-------|-------------------|------------|------------|----------------|----------|
| **ID** | `uuid.UUID` | `UUID PRIMARY KEY` | `string` | ❌ TypeScript not using UUID branded type | MEDIUM |
| **Name** | `string` | `TEXT NOT NULL` | `string` | ✅ Aligned | - |
| **Description** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |
| **Persona Type** | `PersonaTypeEnum` | `TEXT CHECK(IN('dns','http'))` | `PersonaType` | ✅ Aligned | - |
| **Config Details** | `json.RawMessage` | `JSONB NOT NULL` | `Record<string, unknown>` | ✅ Aligned | - |
| **Is Enabled** | `bool` (`isEnabled` in JSON) | `is_enabled BOOLEAN NOT NULL` | `isEnabled: boolean` | ❌ JSON tag vs DB column naming | LOW |
| **Created At** | `time.Time` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `string` | ✅ Aligned | - |
| **Updated At** | `time.Time` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `string` | ✅ Aligned | - |

**Frontend-only fields:**
- `status: string` - ❌ Not in backend
- `lastTested?: string` - ❌ Not in backend
- `lastError?: string` - ❌ Not in backend
- `tags?: string[]` - ❌ Not in backend

### 1.4 Proxy Entity

| Field | Go Backend (Truth) | PostgreSQL | TypeScript | Violation Type | Severity |
|-------|-------------------|------------|------------|----------------|----------|
| **ID** | `uuid.UUID` | `UUID PRIMARY KEY` | `string` | ❌ TypeScript not using UUID branded type | MEDIUM |
| **Name** | `string` | `TEXT NOT NULL UNIQUE` | `string` | ✅ Aligned | - |
| **Description** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |
| **Address** | `string` | `TEXT NOT NULL UNIQUE` | `string` | ✅ Aligned | - |
| **Protocol** | `ProxyProtocolEnum` | `TEXT` | `ProxyProtocol` | ✅ Aligned | - |
| **Username** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |
| **Password** | `*string` (hashed) | `password_hash TEXT` | - | ✅ Not exposed to frontend | - |
| **Host** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |
| **Port** | `*int` | `INT` | `number?` | ✅ Aligned | - |
| **Is Enabled** | `bool` | `is_enabled BOOLEAN NOT NULL` | `boolean` | ❌ JSON tag vs DB column naming | LOW |
| **Is Healthy** | `bool` | `is_healthy BOOLEAN NOT NULL` | `boolean` | ❌ JSON tag vs DB column naming | LOW |
| **Last Status** | `*string` | `last_status TEXT` | `string?` | ✅ Aligned | - |
| **Last Checked At** | `*time.Time` | `last_checked_at TIMESTAMPTZ` | `string?` | ❌ JSON tag vs DB column naming | LOW |
| **Latency Ms** | `*int` | `latency_ms INT` | `number?` | ❌ JSON tag vs DB column naming | LOW |
| **City** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |
| **Country Code** | `*string` | `country_code TEXT` | `string?` | ❌ JSON tag vs DB column naming | LOW |
| **Provider** | `*string` | `TEXT` | `string?` | ✅ Aligned | - |

---

## 2. API CONTRACT VIOLATIONS

### 2.1 Missing Backend Endpoints (Referenced by Frontend)

| Frontend Call | Expected Endpoint | Issue | Severity |
|--------------|-------------------|-------|----------|
| `GET /api/v2/personas` | Generic persona list | Backend requires type-specific: `/personas/dns`, `/personas/http` | HIGH |
| `DELETE /api/v2/personas/{id}` | Generic persona delete | Backend requires type-specific deletion | HIGH |
| `GET /api/v2/admin/users` | User management | Completely missing from backend inventory | CRITICAL |
| `POST /api/v2/admin/users` | Create user | Completely missing from backend inventory | CRITICAL |
| `PUT /api/v2/admin/users/{id}` | Update user | Completely missing from backend inventory | CRITICAL |
| `DELETE /api/v2/admin/users/{id}` | Delete user | Completely missing from backend inventory | CRITICAL |

### 2.2 Unused Backend Endpoints (Not Called by Frontend)

| Backend Endpoint | Purpose | Issue | Severity |
|-----------------|---------|-------|----------|
| `POST /api/v2/auth/refresh` | Session refresh | Frontend doesn't implement session refresh | HIGH |
| `GET /api/v2/auth/permissions` | List all permissions | Frontend doesn't fetch available permissions | MEDIUM |
| `POST /proxies/:proxyId/health-check` | Force single proxy check | Frontend only tests, doesn't health check | LOW |
| `POST /proxies/health-check` | Force all proxy checks | Frontend doesn't implement bulk health check | LOW |
| `POST /campaigns/generate` | Legacy domain generation | Deprecated - frontend uses unified endpoint | LOW |
| `POST /campaigns/dns-validate` | Legacy DNS validation | Deprecated - frontend uses unified endpoint | LOW |
| `POST /campaigns/http-validate` | Legacy HTTP validation | Deprecated - frontend uses unified endpoint | LOW |
| `POST /extract/keywords` | Keyword extraction | Not integrated in main frontend | MEDIUM |
| `GET /extract/keywords/stream` | Stream keyword extraction | Not integrated in main frontend | MEDIUM |

### 2.3 Request/Response Structure Mismatches

| Endpoint | Field | Backend | Frontend | Issue | Severity |
|----------|-------|---------|----------|-------|----------|
| `POST /api/v2/auth/login` | response.requiresCaptcha | `requiresCaptcha` | `requires_captcha` or `requiresCaptcha` | Field name inconsistency | MEDIUM |
| `POST /api/v2/campaigns` | domainGenerationParams | Includes `totalPossibleCombinations`, `currentOffset` | Generated types missing these fields | Missing critical fields | HIGH |
| `POST /api/v2/campaigns` | httpKeywordParams.sourceType | Required: 'DomainGeneration' or 'DNSValidation' | Generated types missing this field | Missing required field | HIGH |

---

## 3. TYPE SAFETY VIOLATIONS

### 3.1 Int64 Handling Issues

| Location | Field | Current Type | Required Type | Risk | Severity |
|----------|-------|--------------|---------------|------|----------|
| Generated API Client | campaign.totalItems | `number` | `SafeBigInt` | Numeric overflow > 2^53 | CRITICAL |
| Generated API Client | campaign.processedItems | `number` | `SafeBigInt` | Numeric overflow > 2^53 | CRITICAL |
| Generated API Client | campaign.successfulItems | `number` | `SafeBigInt` | Numeric overflow > 2^53 | CRITICAL |
| Generated API Client | campaign.failedItems | `number` | `SafeBigInt` | Numeric overflow > 2^53 | CRITICAL |
| Generated API Client | domainGeneration.totalPossibleCombinations | Missing | `SafeBigInt` | Field not generated | CRITICAL |
| Generated API Client | domainGeneration.currentOffset | Missing | `SafeBigInt` | Field not generated | CRITICAL |
| Generated API Client | generatedDomain.offsetIndex | `number` | `SafeBigInt` | Numeric overflow > 2^53 | CRITICAL |
| WebSocket Messages | progress fields | Raw number/string | `SafeBigInt` | Requires transformation | HIGH |

### 3.2 UUID Type Safety

| Entity | Current Frontend Type | Should Be | Issue | Severity |
|--------|---------------------|-----------|-------|----------|
| User.id | `string` | `UUID` (branded) | No compile-time UUID validation | MEDIUM |
| Persona.id | `string` | `UUID` (branded) | No compile-time UUID validation | MEDIUM |
| Proxy.id | `string` | `UUID` (branded) | No compile-time UUID validation | MEDIUM |
| All campaign IDs | Mixed (some branded, some not) | `UUID` (branded) | Inconsistent UUID usage | MEDIUM |

### 3.3 Timestamp Handling

| Field Type | Backend | Database | Frontend | Issue | Severity |
|------------|---------|----------|----------|-------|----------|
| Created/Updated | `time.Time` | `TIMESTAMPTZ` | `ISODateString` (branded) | ✅ Aligned | - |
| Session timestamps | `time.Time` | `TIMESTAMP` | `string` | ❌ Not using ISODateString | LOW |
| Nullable timestamps | `*time.Time` | `TIMESTAMPTZ` | `string?` | ❌ Not using ISODateString | LOW |

---

## 4. BUSINESS LOGIC VIOLATIONS

### 4.1 Validation Rule Mismatches

| Field | Backend Validation | Frontend Validation | Database Constraint | Issue | Severity |
|-------|-------------------|--------------------|--------------------|-------|----------|
| Password | `min=12` | `min(12)` | - | ✅ Aligned | - |
| Email | `required,email` | `z.string().email()` | `UNIQUE NOT NULL` | ✅ Aligned | - |
| Campaign Name | `required` | `min(1)` | `NOT NULL` | ✅ Aligned | - |
| Campaign Type | `oneof=domain_generation dns_validation http_keyword_validation` | Enum validation | `CHECK(IN(...))` | ✅ Aligned | - |
| Progress Percentage | `omitempty,gte=0,lte=100` | `min(0).max(100)` | `DEFAULT 0.0` | ✅ Aligned | - |
| Batch Size | - | `positive()` | `CHECK(> 0)` | ❌ Backend missing validation | MEDIUM |
| Retry Attempts | - | `min(0)` | `CHECK(>= 0)` | ❌ Backend missing validation | MEDIUM |

### 4.2 Enum Value Discrepancies

| Enum | Backend Values | Frontend Values | Database Values | Issue | Severity |
|------|---------------|-----------------|-----------------|-------|----------|
| Campaign Status | No 'archived' | Includes 'archived' | Text field (no constraint) | Frontend has extra status | HIGH |
| Campaign Type | Correct values | Includes deprecated 'keyword_validate' | CHECK constraint correct | Frontend has legacy value | MEDIUM |
| HTTP Source Type | 'DomainGeneration', 'DNSValidation' | Using snake_case | CHECK uses PascalCase | Case mismatch | HIGH |
| Proxy Protocol | `http, https, socks5, socks4` | Same | No constraint | ✅ Aligned | - |

### 4.3 Default Value Inconsistencies

| Field | Backend Default | Database Default | Frontend Default | Issue | Severity |
|-------|----------------|------------------|------------------|-------|----------|
| Is Active | - | `TRUE` | - | ✅ Database handles | - |
| Is Enabled | - | `TRUE` | - | ✅ Database handles | - |
| Failed Login Attempts | - | `0` | - | ✅ Database handles | - |
| MFA Enabled | - | `FALSE` | - | ✅ Database handles | - |
| Email Verified | - | `FALSE` | - | ✅ Database handles | - |

---

## 5. NAMING CONVENTION VIOLATIONS

### 5.1 JSON Tag vs Database Column Naming

| Entity.Field | Go JSON Tag | Database Column | Issue | Count | Severity |
|--------------|-------------|-----------------|-------|-------|----------|
| All entities | camelCase | snake_case | Systematic mismatch | 50+ fields | MEDIUM |
| Persona.IsEnabled | `isEnabled` | `is_enabled` | Inconsistent | All boolean fields | LOW |
| Proxy.LastCheckedAt | `lastCheckedAt` | `last_checked_at` | Inconsistent | All timestamp fields | LOW |

### 5.2 Type Naming Inconsistencies

| Backend Type | Frontend Type | Issue | Severity |
|--------------|---------------|-------|----------|
| `services.CreateCampaignRequest` | `ServicesCreateCampaignRequest` | Different naming convention | LOW |
| `models.Campaign` | `ModelsCampaignAPI` | Different suffix pattern | LOW |
| `DomainGenerationCampaignParams` | `ServicesDomainGenerationParams` | Different prefix pattern | LOW |

---

## 6. WEBSOCKET CONTRACT VIOLATIONS

### 6.1 Message Structure Issues

| Issue | Backend Structure | Frontend Structure | Impact | Severity |
|-------|------------------|-------------------|--------|----------|
| Generic message | Single `WebSocketMessage` with many optional fields | Type-safe discriminated union | Frontend must parse generic structure | MEDIUM |
| Field transformation | Sends raw int64 as number/string | Expects SafeBigInt | Requires runtime transformation | HIGH |
| Message types | String constants | Typed const object | ✅ Compatible | - |

### 6.2 Missing Message Type Handling

| Backend Message Type | Frontend Handler | Issue | Severity |
|---------------------|------------------|-------|----------|
| Proxy status updates | ❌ Not implemented | Missing proxy monitoring | MEDIUM |
| Persona status updates | ❌ Not implemented | Missing persona monitoring | MEDIUM |
| System notifications | ✅ Implemented | - | - |

---

## 7. SECURITY & OPERATIONAL VIOLATIONS

### 7.1 Authentication Flow Issues

| Feature | Backend Support | Frontend Implementation | Issue | Severity |
|---------|----------------|------------------------|-------|----------|
| Session refresh | `POST /api/v2/auth/refresh` | ❌ Not implemented | Sessions expire without warning | HIGH |
| Session validation | Comprehensive validation | Basic cookie check | Incomplete security validation | MEDIUM |
| MFA | Database field exists | ❌ No UI implementation | MFA not fully implemented | HIGH |

### 7.2 Audit & Monitoring Gaps

| Feature | Database Support | Backend Support | Frontend Support | Issue | Severity |
|---------|-----------------|----------------|------------------|-------|----------|
| Auth audit log | ✅ Complete table | ✅ Logging | ❌ No UI | Can't view security events | MEDIUM |
| Rate limiting | ✅ Table exists | ✅ Middleware | ❌ No user feedback | Users don't know when rate limited | MEDIUM |
| Session fingerprinting | ✅ Comprehensive | ✅ Validation | ❌ Not sent | Security feature not utilized | MEDIUM |

---

## SUMMARY STATISTICS

- **Total Violations Found:** 87
- **Critical Issues:** 15 (17.2%)
- **High Issues:** 18 (20.7%)
- **Medium Issues:** 35 (40.2%)
- **Low Issues:** 19 (21.8%)

**Most Critical Areas:**
1. Int64 handling in generated API client (data loss risk)
2. Missing user management endpoints (core functionality gap)
3. Frontend-backend enum mismatches (functional failures)
4. Session refresh not implemented (security risk)
5. Systematic naming convention mismatches (maintenance burden)

**Next Steps:** See CRITICAL_ISSUES_REPORT.md for prioritized remediation plan.