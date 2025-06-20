# FIELD ALIGNMENT ANALYSIS

**Generated:** 2025-06-20 10:28 UTC  
**Phase:** Cross-Layer Contract Validation (Phase 2)  
**Purpose:** Entity-by-entity field comparison showing current vs expected alignment

This document provides a detailed analysis of every entity's field alignment across the three layers, with the Go backend as the source of truth.

---

## 1. CAMPAIGN ENTITY ALIGNMENT

### Core Campaign Fields

| Field Name | Go Type (Truth) | Current DB Column | Current TS Type | Expected DB Column | Expected TS Type | Action Required |
|------------|-----------------|-------------------|------------------|-------------------|------------------|-----------------|
| ID | `uuid.UUID` | `id UUID PK` | `UUID` (branded) | ✅ Correct | ✅ Correct | None |
| Name | `string` | `name TEXT NOT NULL` | `string` | ✅ Correct | ✅ Correct | None |
| CampaignType | `CampaignTypeEnum` | `campaign_type TEXT CHECK` | `ModelsCampaignTypeEnum` | ✅ Correct | Remove 'keyword_validate' | Fix TS enum |
| Status | `CampaignStatusEnum` | `status TEXT NOT NULL` | `ModelsCampaignStatusEnum` | ✅ Correct | Remove 'archived' | Fix TS enum |
| UserID | `*uuid.UUID` | `user_id UUID REF` | `UUID?` | Add `ON DELETE SET NULL` | ✅ Correct | Fix DB constraint |
| TotalItems | `*int64` | `total_items BIGINT` | `number` (generated) | ✅ Correct | `SafeBigInt?` | Fix TS type |
| ProcessedItems | `*int64` | `processed_items BIGINT` | `number` (generated) | ✅ Correct | `SafeBigInt?` | Fix TS type |
| SuccessfulItems | `*int64` | `successful_items BIGINT` | `number` (generated) | ✅ Correct | `SafeBigInt?` | Fix TS type |
| FailedItems | `*int64` | `failed_items BIGINT` | `number` (generated) | ✅ Correct | `SafeBigInt?` | Fix TS type |
| ProgressPercentage | `*float64` | `progress_percentage DOUBLE` | `number?` | ✅ Correct | ✅ Correct | None |
| Metadata | `*json.RawMessage` | `metadata JSONB` | `Record<string, unknown>?` | ✅ Correct | ✅ Correct | None |
| CreatedAt | `time.Time` | `created_at TIMESTAMPTZ` | `ISODateString` | ✅ Correct | ✅ Correct | None |
| UpdatedAt | `time.Time` | `updated_at TIMESTAMPTZ` | `ISODateString` | ✅ Correct | ✅ Correct | None |
| StartedAt | `*time.Time` | `started_at TIMESTAMPTZ` | `ISODateString?` | ✅ Correct | ✅ Correct | None |
| CompletedAt | `*time.Time` | `completed_at TIMESTAMPTZ` | `ISODateString?` | ✅ Correct | ✅ Correct | None |
| ErrorMessage | `*string` | `error_message TEXT` | `string?` | ✅ Correct | ✅ Correct | None |

### Campaign Type-Specific Parameters

| Parameter Type | Go Struct | DB Table | TS Interface | Alignment Status |
|----------------|-----------|----------|--------------|------------------|
| DomainGenerationParams | `*DomainGenerationCampaignParams` | `domain_generation_campaign_params` | `ServicesDomainGenerationParams?` | ✅ Properly normalized |
| DNSValidationParams | `*DNSValidationCampaignParams` | `dns_validation_params` | `ServicesDnsValidationParams?` | ✅ Properly normalized |
| HTTPKeywordParams | `*HTTPKeywordCampaignParams` | `http_keyword_campaign_params` | `ServicesHttpKeywordParams?` | ❌ Missing sourceType field in TS |

### Database-Only Fields (Not in Go Backend)

| DB Column | Type | Purpose | Should Add to Backend? |
|-----------|------|---------|----------------------|
| estimated_completion_at | TIMESTAMPTZ | Performance tracking | Yes - useful for UI |
| avg_processing_rate | DOUBLE PRECISION | Performance metrics | Yes - useful for UI |
| last_heartbeat_at | TIMESTAMPTZ | Health monitoring | Yes - for timeout detection |

---

## 2. USER ENTITY ALIGNMENT

### Core User Fields

| Field Name | Go Type (Truth) | Current DB Column | Current TS Type | Expected DB Column | Expected TS Type | Action Required |
|------------|-----------------|-------------------|------------------|-------------------|------------------|-----------------|
| ID | `uuid.UUID` | `id UUID PK` | `string` | ✅ Correct | `UUID` (branded) | Fix TS type |
| Email | `string` | `email VARCHAR(255) UNIQUE` | `string` | ✅ Correct | `Email` (branded) | Consider branded type |
| EmailVerified | `bool` | `email_verified BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |
| PasswordHash | `string` | `password_hash VARCHAR(255)` | Not exposed | ✅ Correct | ✅ Not exposed | None |
| FirstName | `string` | `first_name VARCHAR(100)` | `string` | ✅ Correct | ✅ Correct | None |
| LastName | `string` | `last_name VARCHAR(100)` | `string` | ✅ Correct | ✅ Correct | None |
| AvatarURL | `*string` | `avatar_url TEXT` | `string?` | ✅ Correct | `URL?` (branded) | Consider branded type |
| IsActive | `bool` | `is_active BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |
| IsLocked | `bool` | `is_locked BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |
| FailedLoginAttempts | `int` | `failed_login_attempts INTEGER` | `number` | ✅ Correct | ✅ Correct | None |
| LockedUntil | `*time.Time` | `locked_until TIMESTAMP` | `string?` | ✅ Correct | `ISODateString?` | Fix TS type |
| LastLoginAt | `*time.Time` | `last_login_at TIMESTAMP` | `string?` | ✅ Correct | `ISODateString?` | Fix TS type |
| LastLoginIP | `*string` | `last_login_ip INET` | `string?` | ✅ Type appropriate | ✅ Correct | None (backend validates) |
| MFAEnabled | `bool` | `mfa_enabled BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |
| PasswordChangedAt | `time.Time` | `password_changed_at TIMESTAMP` | `string` | ✅ Correct | `ISODateString` | Fix TS type |
| MustChangePassword | `bool` | `must_change_password BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |

### Computed Fields (PublicUser)

| Field Name | Go Computation | Frontend Expectation | Action Required |
|------------|----------------|---------------------|-----------------|
| Name | `FirstName + " " + LastName` | `name?: string` | Frontend expects this field |
| Roles | Loaded from junction | `RoleSecurity[]` | ✅ Correct approach |
| Permissions | Loaded from junction | `PermissionSecurity[]` | ✅ Correct approach |

---

## 3. PERSONA ENTITY ALIGNMENT

### Core Persona Fields

| Field Name | Go Type (Truth) | Current DB Column | Current TS Type | Expected DB Column | Expected TS Type | Action Required |
|------------|-----------------|-------------------|------------------|-------------------|------------------|-----------------|
| ID | `uuid.UUID` | `id UUID PK` | `string` | ✅ Correct | `UUID` (branded) | Fix TS type |
| Name | `string` | `name TEXT NOT NULL` | `string` | ✅ Correct | ✅ Correct | None |
| Description | `*string` | `description TEXT` | `string?` | ✅ Correct | ✅ Correct | None |
| PersonaType | `PersonaTypeEnum` | `persona_type TEXT CHECK` | `PersonaType` | ✅ Correct | ✅ Correct | None |
| ConfigDetails | `json.RawMessage` | `config_details JSONB` | `Record<string, unknown>` | ✅ Correct | ✅ Correct | None |
| IsEnabled | `bool` | `is_enabled BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |
| CreatedAt | `time.Time` | `created_at TIMESTAMPTZ` | `string` | ✅ Correct | `ISODateString` | Fix TS type |
| UpdatedAt | `time.Time` | `updated_at TIMESTAMPTZ` | `string` | ✅ Correct | `ISODateString` | Fix TS type |

### Frontend-Only Fields (Not in Backend)

| TS Field | Type | Purpose | Should Add to Backend? |
|----------|------|---------|----------------------|
| status | `string` | Runtime status | No - compute from health checks |
| lastTested | `string?` | Testing history | Maybe - could be useful |
| lastError | `string?` | Error tracking | Maybe - for debugging |
| tags | `string[]?` | Organization | Yes - useful feature |

### Naming Misalignment

| JSON Tag | DB Column | Issue |
|----------|-----------|-------|
| `isEnabled` | `is_enabled` | camelCase vs snake_case |

---

## 4. PROXY ENTITY ALIGNMENT

### Core Proxy Fields

| Field Name | Go Type (Truth) | Current DB Column | Current TS Type | Expected DB Column | Expected TS Type | Action Required |
|------------|-----------------|-------------------|------------------|-------------------|------------------|-----------------|
| ID | `uuid.UUID` | `id UUID PK` | `string` | ✅ Correct | `UUID` (branded) | Fix TS type |
| Name | `string` | `name TEXT UNIQUE` | `string` | ✅ Correct | ✅ Correct | None |
| Description | `*string` | `description TEXT` | `string?` | ✅ Correct | ✅ Correct | None |
| Address | `string` | `address TEXT UNIQUE` | `string` | ✅ Correct | ✅ Correct | None |
| Protocol | `ProxyProtocolEnum` | `protocol TEXT` | `ProxyProtocol` | Add CHECK constraint | ✅ Correct | Add DB constraint |
| Username | `*string` | `username TEXT` | `string?` | ✅ Correct | ✅ Correct | None |
| Password | `*string` | `password_hash TEXT` | Not exposed | ✅ Correct | ✅ Not exposed | None |
| Host | `*string` | `host TEXT` | `string?` | ✅ Correct | ✅ Correct | None |
| Port | `*int` | `port INT` | `number?` | ✅ Correct | ✅ Correct | None |
| IsEnabled | `bool` | `is_enabled BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |
| IsHealthy | `bool` | `is_healthy BOOLEAN` | `boolean` | ✅ Correct | ✅ Correct | None |
| LastStatus | `*string` | `last_status TEXT` | `string?` | ✅ Correct | ✅ Correct | None |
| LastCheckedAt | `*time.Time` | `last_checked_at TIMESTAMPTZ` | `string?` | ✅ Correct | `ISODateString?` | Fix TS type |
| LatencyMs | `*int` | `latency_ms INT` | `number?` | ✅ Correct | ✅ Correct | None |
| City | `*string` | `city TEXT` | `string?` | ✅ Correct | ✅ Correct | None |
| CountryCode | `*string` | `country_code TEXT` | `string?` | ✅ Correct | ✅ Correct | None |
| Provider | `*string` | `provider TEXT` | `string?` | ✅ Correct | ✅ Correct | None |

### Systematic Naming Issues

| JSON Tag | DB Column | Pattern |
|----------|-----------|---------|
| `isEnabled` | `is_enabled` | All boolean fields |
| `isHealthy` | `is_healthy` | All boolean fields |
| `lastStatus` | `last_status` | All multi-word fields |
| `lastCheckedAt` | `last_checked_at` | All timestamps |
| `latencyMs` | `latency_ms` | All measurements |
| `countryCode` | `country_code` | All multi-word fields |

---

## 5. DOMAIN GENERATION PARAMETERS ALIGNMENT

### ServicesDomainGenerationParams

| Field Name | Go Type (Truth) | Current DB Column | Current TS Type | Expected TS Type | Action Required |
|------------|-----------------|-------------------|------------------|------------------|-----------------|
| PatternType | `string` | `pattern_type TEXT` | `'prefix' \| 'suffix' \| 'both'` | ✅ Correct | None |
| VariableLength | `int` | `variable_length INT` | `number?` | ✅ Correct | None |
| CharacterSet | `string` | `character_set TEXT` | `string?` | ✅ Correct | None |
| ConstantString | `string` | `constant_string TEXT` | `string?` | ✅ Correct | None |
| TLD | `string` | `tld TEXT NOT NULL` | `string` | ✅ Correct | None |
| NumDomainsToGenerate | `int` | `num_domains_to_generate INT` | `number?` | ✅ Correct | None |
| **TotalPossibleCombinations** | `int64` | `total_possible_combinations BIGINT` | **MISSING** | `SafeBigInt` | **ADD TO TS** |
| **CurrentOffset** | `int64` | `current_offset BIGINT` | **MISSING** | `SafeBigInt` | **ADD TO TS** |

---

## 6. HTTP KEYWORD PARAMETERS ALIGNMENT

### ServicesHttpKeywordParams

| Field Name | Go Type (Truth) | Current DB Column | Current TS Type | Expected TS Type | Action Required |
|------------|-----------------|-------------------|------------------|------------------|-----------------|
| SourceCampaignID | `uuid.UUID` | `source_campaign_id UUID` | `string` | `UUID` | Fix TS type |
| **SourceType** | `string` (enum) | `source_type TEXT CHECK` | **MISSING** | `'DomainGeneration' \| 'DNSValidation'` | **ADD TO TS** |
| PersonaIDs | `[]uuid.UUID` | `persona_ids UUID[]` | `string[]` | `UUID[]` | Fix TS type |
| KeywordSetIDs | `[]uuid.UUID` | `keyword_set_ids UUID[]` | `string[]?` | `UUID[]?` | Fix TS type |
| AdHocKeywords | `[]string` | `ad_hoc_keywords TEXT[]` | `string[]?` | ✅ Correct | None |
| ProxyIDs | `[]uuid.UUID` | `proxy_ids UUID[]` | Missing | `UUID[]?` | Add to TS |
| ProxyPoolID | `*uuid.UUID` | `proxy_pool_id UUID` | `string?` | `UUID?` | Fix TS type |
| ProxySelectionStrategy | `*string` | `proxy_selection_strategy TEXT` | `string?` | ✅ Correct | None |
| RotationIntervalSeconds | `int` | `rotation_interval_seconds INT` | `number?` | ✅ Correct | None |
| ProcessingSpeedPerMinute | `int` | `processing_speed_per_minute INT` | `number?` | ✅ Correct | None |
| BatchSize | `int` | `batch_size INT CHECK(> 0)` | `number?` | ✅ Correct | None |
| RetryAttempts | `int` | `retry_attempts INT CHECK(>= 0)` | `number?` | ✅ Correct | None |
| TargetHTTPPorts | `[]int` | `target_http_ports INT[]` | `number[]?` | ✅ Correct | None |

---

## 7. WEBSOCKET MESSAGE ALIGNMENT

### WebSocketMessage Structure

| Field Name | Go Type (Truth) | Current TS Type | Expected TS Type | Action Required |
|------------|-----------------|------------------|------------------|-----------------|
| ID | `string` | Not used | Remove from backend | Simplify |
| Timestamp | `string` | `string` | `ISODateString` | Use branded type |
| Type | `string` | `string` | ✅ Correct | None |
| SequenceNumber | `int64` | Not used | Remove from backend | Simplify |
| Data | `interface{}` | `unknown` | ✅ Correct | None |
| **Multiple optional fields** | Various | Not used | Remove from backend | Use typed data field |

### Campaign Progress Payload

| Field Name | Go Type | Current TS Handling | Expected TS Type | Action Required |
|------------|---------|-------------------|------------------|-----------------|
| campaignId | `string` | `string` | `UUID` | Use branded type |
| totalItems | `int64` | Raw parse | `SafeBigInt` | Transform on parse |
| processedItems | `int64` | Raw parse | `SafeBigInt` | Transform on parse |
| successfulItems | `int64` | Raw parse | `SafeBigInt` | Transform on parse |
| failedItems | `int64` | Raw parse | `SafeBigInt` | Transform on parse |
| progressPercent | `float64` | `number` | ✅ Correct | None |

---

## 8. ENUM ALIGNMENT SUMMARY

### Campaign Type Enum

| Backend Values | Frontend Values | Database CHECK | Action |
|----------------|-----------------|----------------|--------|
| `domain_generation` | ✅ Same | ✅ Same | None |
| `dns_validation` | ✅ Same | ✅ Same | None |
| `http_keyword_validation` | ✅ Same | ✅ Same | None |
| - | `keyword_validate` (deprecated) | - | Remove from frontend |

### Campaign Status Enum

| Backend Values | Frontend Values | Database | Action |
|----------------|-----------------|----------|--------|
| `pending` | ✅ Same | No constraint | None |
| `queued` | ✅ Same | No constraint | None |
| `running` | ✅ Same | No constraint | None |
| `pausing` | ✅ Same | No constraint | None |
| `paused` | ✅ Same | No constraint | None |
| `completed` | ✅ Same | No constraint | None |
| `failed` | ✅ Same | No constraint | None |
| `cancelled` | ✅ Same | No constraint | None |
| **Not present** | `archived` | No constraint | Remove from frontend |

### HTTP Source Type Enum

| Backend Values | Frontend Usage | Database CHECK | Action |
|----------------|----------------|----------------|--------|
| `DomainGeneration` | `domain_generation` | CHECK uses PascalCase | Fix frontend to PascalCase |
| `DNSValidation` | `dns_validation` | CHECK uses PascalCase | Fix frontend to PascalCase |

---

## ALIGNMENT SUMMARY

### Critical Alignment Issues
1. **Int64 fields** using `number` instead of `SafeBigInt` (15 fields)
2. **Missing fields** in TypeScript interfaces (4 fields)
3. **Enum value mismatches** (3 enums)
4. **UUID type safety** missing in TypeScript (20+ fields)

### Systematic Issues
1. **camelCase vs snake_case** - Affects all entities (50+ fields)
2. **Timestamp types** - Not using `ISODateString` branded type consistently
3. **Frontend-only fields** - Several entities have UI-specific fields

### Well-Aligned Areas
1. **Data normalization** - Params properly split into separate tables
2. **Security fields** - Passwords/sensitive data properly hidden
3. **Core data types** - Most primitive types correctly mapped
4. **Nullability** - Optional fields properly marked

### Recommended Approach
1. Fix critical int64 and missing field issues first
2. Implement proper type branding for UUIDs and timestamps
3. Standardize on camelCase for JSON, snake_case for DB
4. Add contract tests to prevent future drift
5. Consider generating TypeScript types from Go structs

---

**Analysis Complete**  
For violation details, see CONTRACT_VIOLATIONS_MATRIX.md  
For remediation steps, see CRITICAL_ISSUES_REPORT.md