# PostgreSQL Database Schema Extraction Report

**Generated:** 2025-06-20  
**Database:** domainflow_production  
**Schema Version:** Production Schema v3.0  
**Status:** Complete extraction from production-ready schema

## Table of Contents
1. [Schema Overview](#schema-overview)
2. [Authentication Schema Tables](#authentication-schema-tables)
3. [Application Schema Tables](#application-schema-tables)
4. [Custom Types and Enums](#custom-types-and-enums)
5. [Foreign Key Relationships](#foreign-key-relationships)
6. [Indexes](#indexes)
7. [Functions and Triggers](#functions-and-triggers)
8. [Default Data](#default-data)
9. [Schema Comparison Summary](#schema-comparison-summary)

---

## Schema Overview

The DomainFlow database uses PostgreSQL with the following characteristics:
- **Extensions:** uuid-ossp, pgcrypto
- **Schemas:** public (default), auth (authentication)
- **Session-based authentication** (no CSRF tokens)
- **Role-based permissions system (RBAC)**
- **Comprehensive audit logging**

---

## Authentication Schema Tables

### auth.users
**Purpose:** Stores user account information

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Unique user identifier |
| email | VARCHAR(255) | UNIQUE NOT NULL | - | User email address |
| email_verified | BOOLEAN | - | FALSE | Email verification status |
| email_verification_token | VARCHAR(255) | - | - | Email verification token |
| email_verification_expires_at | TIMESTAMP | - | - | Token expiration time |
| password_hash | VARCHAR(255) | NOT NULL | - | Bcrypt password hash |
| password_pepper_version | INTEGER | - | 1 | Password pepper version |
| first_name | VARCHAR(100) | NOT NULL | - | User's first name |
| last_name | VARCHAR(100) | NOT NULL | - | User's last name |
| avatar_url | TEXT | - | - | Profile picture URL |
| is_active | BOOLEAN | - | TRUE | Account active status |
| is_locked | BOOLEAN | - | FALSE | Account lock status |
| failed_login_attempts | INTEGER | - | 0 | Failed login counter |
| locked_until | TIMESTAMP | - | - | Account lock expiration |
| last_login_at | TIMESTAMP | - | - | Last successful login |
| last_login_ip | INET | - | - | Last login IP address |
| password_changed_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Password change timestamp |
| must_change_password | BOOLEAN | - | FALSE | Force password change flag |
| mfa_enabled | BOOLEAN | NOT NULL | FALSE | Multi-factor auth status |
| created_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Account creation time |
| updated_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Last update time |

### auth.sessions
**Purpose:** Manages user sessions for authentication

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | VARCHAR(128) | PRIMARY KEY | - | Secure random session ID |
| user_id | UUID | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | - | Session owner |
| ip_address | INET | - | - | Client IP for validation |
| user_agent | TEXT | - | - | Browser user agent |
| user_agent_hash | VARCHAR(64) | - | - | SHA-256 hash of user agent |
| session_fingerprint | VARCHAR(255) | - | - | SHA-256 hash of IP, UA, resolution |
| browser_fingerprint | TEXT | - | - | SHA-256 hash of UA and resolution |
| screen_resolution | VARCHAR(20) | - | - | Screen resolution for fingerprinting |
| is_active | BOOLEAN | - | TRUE | Session active state |
| expires_at | TIMESTAMP | NOT NULL | - | Hard expiration time |
| last_activity_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Idle timeout tracking |
| created_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Session creation time |

### auth.roles
**Purpose:** Defines system roles for authorization

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Unique role identifier |
| name | VARCHAR(50) | UNIQUE NOT NULL | - | Role system name |
| display_name | VARCHAR(100) | NOT NULL | - | Human-readable name |
| description | TEXT | - | - | Role description |
| is_system_role | BOOLEAN | - | FALSE | System role flag |
| created_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Last update timestamp |

### auth.permissions
**Purpose:** Defines granular permissions for resources

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Unique permission ID |
| name | VARCHAR(100) | UNIQUE NOT NULL | - | Permission system name |
| display_name | VARCHAR(150) | NOT NULL | - | Human-readable name |
| description | TEXT | - | - | Permission description |
| resource | VARCHAR(50) | NOT NULL | - | Resource type (campaigns, personas, etc.) |
| action | VARCHAR(20) | NOT NULL | - | Action type (create, read, update, delete, execute) |
| created_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Creation timestamp |

**Unique Constraint:** (resource, action)

### auth.user_roles
**Purpose:** Junction table linking users to roles

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| user_id | UUID | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | - | User reference |
| role_id | UUID | NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE | - | Role reference |
| assigned_by | UUID | REFERENCES auth.users(id) | - | Who assigned the role |
| assigned_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Assignment timestamp |
| expires_at | TIMESTAMP | - | - | Optional role expiration |

**Primary Key:** (user_id, role_id)

### auth.role_permissions
**Purpose:** Junction table linking roles to permissions

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| role_id | UUID | NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE | - | Role reference |
| permission_id | UUID | NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE | - | Permission reference |

**Primary Key:** (role_id, permission_id)

### auth.password_reset_tokens
**Purpose:** Manages password reset requests

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Token identifier |
| user_id | UUID | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | - | User requesting reset |
| token_hash | VARCHAR(255) | NOT NULL | - | Hashed reset token |
| expires_at | TIMESTAMP | NOT NULL | - | Token expiration |
| used_at | TIMESTAMP | - | - | When token was used |
| ip_address | INET | - | - | Request IP address |
| user_agent | TEXT | - | - | Request user agent |
| created_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Token creation time |

### auth.auth_audit_log
**Purpose:** Comprehensive security audit logging

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | BIGSERIAL | PRIMARY KEY | - | Audit log ID |
| user_id | UUID | REFERENCES auth.users(id) | - | User involved |
| session_id | VARCHAR(128) | - | - | Session involved |
| event_type | VARCHAR(50) | NOT NULL | - | Event type (login, logout, etc.) |
| event_status | VARCHAR(20) | NOT NULL | - | Status (success, failure, blocked) |
| ip_address | INET | - | - | Client IP address |
| user_agent | TEXT | - | - | Client user agent |
| session_fingerprint | VARCHAR(255) | - | - | Session fingerprint |
| security_flags | JSONB | - | '{}' | Security metadata |
| details | JSONB | - | - | Event details |
| risk_score | INTEGER | - | 0 | Calculated risk score |
| created_at | TIMESTAMP | - | CURRENT_TIMESTAMP | Event timestamp |

### auth.rate_limits
**Purpose:** API rate limiting tracking

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | BIGSERIAL | PRIMARY KEY | - | Rate limit ID |
| identifier | VARCHAR(255) | NOT NULL | - | IP address or user ID |
| action | VARCHAR(50) | NOT NULL | - | Action being limited |
| attempts | INTEGER | - | 1 | Attempt counter |
| window_start | TIMESTAMP | - | CURRENT_TIMESTAMP | Window start time |
| blocked_until | TIMESTAMP | - | - | Block expiration |

**Unique Constraint:** (identifier, action)

---

## Application Schema Tables

### campaigns
**Purpose:** Central table for all campaign types

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Campaign identifier |
| name | TEXT | NOT NULL | - | User-defined campaign name |
| campaign_type | TEXT | NOT NULL CHECK (IN ('domain_generation', 'dns_validation', 'http_keyword_validation')) | 'domain_generation' | Campaign type |
| status | TEXT | NOT NULL | - | Current status (pending, queued, running, paused, completed, failed, archived) |
| user_id | UUID | REFERENCES auth.users(id) ON DELETE SET NULL | - | Campaign owner |
| total_items | BIGINT | - | 0 | Total items to process |
| processed_items | BIGINT | - | 0 | Items processed |
| successful_items | BIGINT | - | 0 | Successful items |
| failed_items | BIGINT | - | 0 | Failed items |
| progress_percentage | DOUBLE PRECISION | - | 0.0 | Progress (0-100) |
| metadata | JSONB | - | - | Campaign metadata |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Last update timestamp |
| started_at | TIMESTAMPTZ | - | - | Processing start time |
| completed_at | TIMESTAMPTZ | - | - | Completion time |
| error_message | TEXT | - | - | Last error message |

### domain_generation_campaign_params
**Purpose:** Parameters for domain generation campaigns

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| campaign_id | UUID | PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE | - | Campaign reference |
| pattern_type | TEXT | NOT NULL | - | Generation pattern (prefix_suffix, char_permutation) |
| variable_length | INT | - | - | Variable part length |
| character_set | TEXT | - | - | Character set (alphanumeric, letters, numbers) |
| constant_string | TEXT | - | - | Constant string component |
| tld | TEXT | NOT NULL | - | Top-level domain |
| num_domains_to_generate | INT | NOT NULL | - | Target domain count |
| total_possible_combinations | BIGINT | NOT NULL | - | Total possible combinations |
| current_offset | BIGINT | NOT NULL | 0 | Current generation offset |

### generated_domains
**Purpose:** Stores generated domain names

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Domain record ID |
| domain_generation_campaign_id | UUID | NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE | - | Source campaign |
| domain_name | TEXT | NOT NULL | - | Generated domain |
| source_keyword | TEXT | - | - | Source keyword |
| source_pattern | TEXT | - | - | Generation pattern |
| tld | TEXT | - | - | Top-level domain |
| offset_index | BIGINT | NOT NULL | 0 | Generation offset |
| generated_at | TIMESTAMPTZ | NOT NULL | NOW() | Generation timestamp |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Record creation time |

**Unique Constraint:** (domain_generation_campaign_id, domain_name)

### domain_generation_config_states
**Purpose:** Tracks domain generation progress for resumption

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| config_hash | TEXT | PRIMARY KEY | - | Configuration hash |
| last_offset | BIGINT | NOT NULL | - | Last processed offset |
| config_details | JSONB | NOT NULL | - | Configuration details |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Last update time |

### personas
**Purpose:** Validation persona configurations

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Persona identifier |
| name | TEXT | NOT NULL | - | Persona name |
| description | TEXT | - | - | Persona description |
| persona_type | TEXT | NOT NULL CHECK (IN ('dns', 'http')) | - | Persona type |
| config_details | JSONB | NOT NULL | - | Configuration JSON |
| is_enabled | BOOLEAN | NOT NULL | TRUE | Enable status |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Creation time |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Last update |

**Unique Constraint:** (name, persona_type)

### keyword_sets
**Purpose:** Keyword collections for HTTP validation

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Keyword set ID |
| name | TEXT | NOT NULL UNIQUE | - | Set name |
| description | TEXT | - | - | Set description |
| rules | JSONB | NOT NULL | '[]' | KeywordRule array |
| is_enabled | BOOLEAN | NOT NULL | TRUE | Enable status |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Creation time |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Last update |

### dns_validation_params
**Purpose:** DNS validation campaign parameters

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| campaign_id | UUID | PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE | - | Campaign reference |
| source_generation_campaign_id | UUID | REFERENCES campaigns(id) ON DELETE SET NULL | - | Source campaign |
| persona_ids | UUID[] | NOT NULL | - | DNS persona array |
| rotation_interval_seconds | INT | - | 0 | Persona rotation interval |
| processing_speed_per_minute | INT | - | 0 | Processing speed |
| batch_size | INT | CHECK (> 0) | 50 | Batch size |
| retry_attempts | INT | CHECK (>= 0) | 1 | Retry count |
| metadata | JSONB | - | - | Additional metadata |

### dns_validation_results
**Purpose:** DNS validation results

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Result ID |
| dns_campaign_id | UUID | NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE | - | Campaign reference |
| generated_domain_id | UUID | REFERENCES generated_domains(id) ON DELETE SET NULL | - | Source domain |
| domain_name | TEXT | NOT NULL | - | Validated domain |
| validation_status | TEXT | NOT NULL | - | Status (Resolved, Unresolved, Error, Pending, Skipped) |
| dns_records | JSONB | - | - | DNS records found |
| validated_by_persona_id | UUID | REFERENCES personas(id) ON DELETE SET NULL | - | Persona used |
| attempts | INT | CHECK (>= 0) | 0 | Validation attempts |
| last_checked_at | TIMESTAMPTZ | - | - | Last check time |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Creation time |

**Unique Constraint:** (dns_campaign_id, domain_name)

### http_keyword_campaign_params
**Purpose:** HTTP keyword validation parameters

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| campaign_id | UUID | PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE | - | Campaign reference |
| source_campaign_id | UUID | NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE | - | Source campaign |
| source_type | TEXT | NOT NULL CHECK (IN ('DomainGeneration', 'DNSValidation')) | - | Source type |
| persona_ids | UUID[] | NOT NULL | - | HTTP persona array |
| keyword_set_ids | UUID[] | - | - | Keyword set references |
| ad_hoc_keywords | TEXT[] | - | - | Ad-hoc keywords |
| proxy_ids | UUID[] | - | - | Proxy references |
| proxy_pool_id | UUID | - | - | Proxy pool reference |
| proxy_selection_strategy | TEXT | - | - | Proxy strategy |
| rotation_interval_seconds | INT | - | 0 | Persona rotation |
| processing_speed_per_minute | INT | - | 0 | Processing speed |
| batch_size | INT | CHECK (> 0) | 10 | Batch size |
| retry_attempts | INT | CHECK (>= 0) | 1 | Retry count |
| target_http_ports | INT[] | - | - | Target ports |
| last_processed_domain_name | TEXT | - | - | Resume point |
| metadata | JSONB | - | - | Additional metadata |

### proxies
**Purpose:** Proxy server configurations

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Proxy ID |
| name | TEXT | NOT NULL UNIQUE | - | Proxy name |
| description | TEXT | - | - | Description |
| address | TEXT | NOT NULL UNIQUE | - | Proxy address |
| protocol | TEXT | - | - | Protocol (http, https, socks5) |
| username | TEXT | - | - | Auth username |
| password_hash | TEXT | - | - | Auth password hash |
| host | TEXT | - | - | Proxy hostname/IP |
| port | INT | - | - | Proxy port |
| is_enabled | BOOLEAN | NOT NULL | TRUE | Enable status |
| is_healthy | BOOLEAN | NOT NULL | TRUE | Health status |
| last_status | TEXT | - | - | Last status |
| last_checked_at | TIMESTAMPTZ | - | - | Last health check |
| latency_ms | INT | - | - | Measured latency |
| city | TEXT | - | - | Location city |
| country_code | TEXT | - | - | Location country |
| provider | TEXT | - | - | Proxy provider |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Creation time |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Last update |

### http_keyword_results
**Purpose:** HTTP keyword validation results

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Result ID |
| http_keyword_campaign_id | UUID | NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE | - | Campaign reference |
| dns_result_id | UUID | REFERENCES dns_validation_results(id) ON DELETE SET NULL | - | DNS result reference |
| domain_name | TEXT | NOT NULL | - | Validated domain |
| validation_status | TEXT | NOT NULL | - | Status (Success, ContentMismatch, KeywordsNotFound, etc.) |
| http_status_code | INT | - | - | HTTP response code |
| response_headers | JSONB | - | - | Response headers |
| page_title | TEXT | - | - | Page title |
| extracted_content_snippet | TEXT | - | - | Content snippet |
| found_keywords_from_sets | JSONB | - | - | Keywords from sets |
| found_ad_hoc_keywords | JSONB | - | - | Ad-hoc keywords found |
| content_hash | TEXT | - | - | Content hash |
| validated_by_persona_id | UUID | REFERENCES personas(id) ON DELETE SET NULL | - | Persona used |
| used_proxy_id | UUID | REFERENCES proxies(id) ON DELETE SET NULL | - | Proxy used |
| attempts | INT | - | 0 | Validation attempts |
| last_checked_at | TIMESTAMPTZ | - | - | Last check time |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Creation time |

**Unique Constraint:** (http_keyword_campaign_id, domain_name)

### audit_logs
**Purpose:** Application audit logging

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Audit log ID |
| timestamp | TIMESTAMPTZ | NOT NULL | NOW() | Event timestamp |
| user_id | UUID | REFERENCES auth.users(id) ON DELETE SET NULL | - | User performing action |
| action | TEXT | NOT NULL | - | Action performed |
| entity_type | TEXT | - | - | Entity type affected |
| entity_id | UUID | - | - | Entity ID affected |
| details | JSONB | - | - | Additional details |
| client_ip | TEXT | - | - | Client IP address |
| user_agent | TEXT | - | - | Client user agent |

### campaign_jobs
**Purpose:** Background job queue for campaigns

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | gen_random_uuid() | Job ID |
| campaign_id | UUID | NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE | - | Campaign reference |
| job_type | TEXT | NOT NULL | - | Job type |
| status | TEXT | NOT NULL | 'pending' | Job status |
| scheduled_at | TIMESTAMPTZ | NOT NULL | NOW() | Schedule time |
| attempts | INT | CHECK (>= 0) | 0 | Attempt count |
| max_attempts | INT | CHECK (> 0) | 3 | Max attempts |
| last_attempted_at | TIMESTAMPTZ | - | - | Last attempt time |
| last_error | TEXT | - | - | Last error message |
| processing_server_id | TEXT | - | - | Processing server |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Creation time |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Last update |
| job_payload | JSONB | - | - | Job data |
| next_execution_at | TIMESTAMPTZ | - | - | Next execution |
| locked_at | TIMESTAMPTZ | - | - | Lock timestamp |
| locked_by | TEXT | - | - | Lock owner |

---

## Custom Types and Enums

### Campaign Type Enum (CHECK constraint)
- `domain_generation`
- `dns_validation` 
- `http_keyword_validation`

### Persona Type Enum (CHECK constraint)
- `dns`
- `http`

### Source Type Enum (CHECK constraint)
- `DomainGeneration`
- `DNSValidation`

### Status Values (conventions)
**Campaign Status:**
- pending, queued, running, paused, completed, failed, archived

**DNS Validation Status:**
- Resolved, Unresolved, Error, Pending, Skipped

**HTTP Validation Status:**
- Success, ContentMismatch, KeywordsNotFound, Unreachable, AccessDenied, ProxyError, DNSError, Timeout, Error, Pending, Skipped

**Job Status:**
- Pending, Queued, Running, Completed, Failed, Retry

---

## Foreign Key Relationships

### Authentication Relationships
1. `auth.sessions.user_id` → `auth.users.id` (CASCADE DELETE)
2. `auth.user_roles.user_id` → `auth.users.id` (CASCADE DELETE)
3. `auth.user_roles.role_id` → `auth.roles.id` (CASCADE DELETE)
4. `auth.user_roles.assigned_by` → `auth.users.id`
5. `auth.role_permissions.role_id` → `auth.roles.id` (CASCADE DELETE)
6. `auth.role_permissions.permission_id` → `auth.permissions.id` (CASCADE DELETE)
7. `auth.password_reset_tokens.user_id` → `auth.users.id` (CASCADE DELETE)
8. `auth.auth_audit_log.user_id` → `auth.users.id`

### Campaign Relationships
1. `campaigns.user_id` → `auth.users.id` (SET NULL)
2. `domain_generation_campaign_params.campaign_id` → `campaigns.id` (CASCADE DELETE)
3. `generated_domains.domain_generation_campaign_id` → `campaigns.id` (CASCADE DELETE)
4. `dns_validation_params.campaign_id` → `campaigns.id` (CASCADE DELETE)
5. `dns_validation_params.source_generation_campaign_id` → `campaigns.id` (SET NULL)
6. `dns_validation_results.dns_campaign_id` → `campaigns.id` (CASCADE DELETE)
7. `dns_validation_results.generated_domain_id` → `generated_domains.id` (SET NULL)
8. `dns_validation_results.validated_by_persona_id` → `personas.id` (SET NULL)
9. `http_keyword_campaign_params.campaign_id` → `campaigns.id` (CASCADE DELETE)
10. `http_keyword_campaign_params.source_campaign_id` → `campaigns.id` (CASCADE DELETE)
11. `http_keyword_results.http_keyword_campaign_id` → `campaigns.id` (CASCADE DELETE)
12. `http_keyword_results.dns_result_id` → `dns_validation_results.id` (SET NULL)
13. `http_keyword_results.validated_by_persona_id` → `personas.id` (SET NULL)
14. `http_keyword_results.used_proxy_id` → `proxies.id` (SET NULL)
15. `audit_logs.user_id` → `auth.users.id` (SET NULL)
16. `campaign_jobs.campaign_id` → `campaigns.id` (CASCADE DELETE)

---

## Indexes

### Authentication Indexes
1. `idx_sessions_user_id` - auth.sessions(user_id)
2. `idx_sessions_expires_at` - auth.sessions(expires_at)
3. `idx_sessions_active` - auth.sessions(is_active, expires_at)
4. `idx_sessions_last_activity` - auth.sessions(last_activity_at)
5. `idx_sessions_fingerprint` - auth.sessions(session_fingerprint) WHERE session_fingerprint IS NOT NULL
6. `idx_sessions_user_agent_hash` - auth.sessions(user_agent_hash) WHERE user_agent_hash IS NOT NULL
7. `idx_sessions_ip_address` - auth.sessions(ip_address) WHERE ip_address IS NOT NULL
8. `idx_sessions_validation` - auth.sessions(id, is_active, expires_at, user_id)
9. `idx_user_roles_user_id` - auth.user_roles(user_id)
10. `idx_user_roles_role_id` - auth.user_roles(role_id)
11. `idx_role_permissions_role_id` - auth.role_permissions(role_id)
12. `idx_role_permissions_permission_id` - auth.role_permissions(permission_id)
13. `idx_password_reset_user_id` - auth.password_reset_tokens(user_id)
14. `idx_password_reset_expires` - auth.password_reset_tokens(expires_at)
15. `idx_auth_audit_user_id` - auth.auth_audit_log(user_id)
16. `idx_auth_audit_event_type` - auth.auth_audit_log(event_type)
17. `idx_auth_audit_created_at` - auth.auth_audit_log(created_at)
18. `idx_auth_audit_risk_score` - auth.auth_audit_log(risk_score)
19. `idx_auth_audit_session_fingerprint` - auth.auth_audit_log(session_fingerprint) WHERE session_fingerprint IS NOT NULL
20. `idx_rate_limits_identifier` - auth.rate_limits(identifier)
21. `idx_rate_limits_blocked_until` - auth.rate_limits(blocked_until)

### Application Indexes
1. `idx_campaigns_status` - campaigns(status)
2. `idx_campaigns_type` - campaigns(campaign_type)
3. `idx_campaigns_user_id` - campaigns(user_id)
4. `idx_campaigns_created_at` - campaigns(created_at DESC)
5. `idx_generated_domains_offset` - generated_domains(domain_generation_campaign_id, offset_index)
6. `idx_generated_domains_campaign_id` - generated_domains(domain_generation_campaign_id)
7. `idx_generated_domains_name` - generated_domains(domain_name)
8. `idx_personas_type` - personas(persona_type)
9. `idx_personas_is_enabled` - personas(is_enabled)
10. `idx_dns_results_campaign_id` - dns_validation_results(dns_campaign_id)
11. `idx_dns_results_domain_name` - dns_validation_results(domain_name)
12. `idx_dns_results_status` - dns_validation_results(validation_status)
13. `idx_proxies_is_enabled` - proxies(is_enabled)
14. `idx_http_results_campaign_id` - http_keyword_results(http_keyword_campaign_id)
15. `idx_http_results_domain_name` - http_keyword_results(domain_name)
16. `idx_http_results_status` - http_keyword_results(validation_status)
17. `idx_http_keyword_results_dns_result_id` - http_keyword_results(dns_result_id)
18. `idx_audit_logs_timestamp` - audit_logs(timestamp DESC)
19. `idx_audit_logs_user_id` - audit_logs(user_id)
20. `idx_audit_logs_entity_type_id` - audit_logs(entity_type, entity_id)
21. `idx_campaign_jobs_campaign_id` - campaign_jobs(campaign_id)
22. `idx_campaign_jobs_status_scheduled_at` - campaign_jobs(status, scheduled_at ASC)
23. `idx_campaign_jobs_type` - campaign_jobs(job_type)

---

## Functions and Triggers

### Functions

#### generate_user_agent_hash(user_agent_text TEXT)
- **Returns:** VARCHAR(64)
- **Purpose:** Generates SHA-256 hash of user agent for fast comparison
- **Language:** plpgsql IMMUTABLE

#### auth.update_session_fingerprint()
- **Returns:** TRIGGER
- **Purpose:** Automatically updates session fingerprints on insert/update
- **Generates:**
  - session_fingerprint: SHA-256 of IP + user agent + screen resolution
  - user_agent_hash: SHA-256 of user agent
  - browser_fingerprint: SHA-256 of user agent + screen resolution
- **Language:** plpgsql IMMUTABLE

#### auth.validate_session_security()
- **Parameters:**
  - p_session_id VARCHAR(128)
  - p_client_ip INET
  - p_user_agent TEXT
  - p_require_ip_match BOOLEAN DEFAULT FALSE
  - p_require_ua_match BOOLEAN DEFAULT FALSE
- **Returns:** TABLE (is_valid BOOLEAN, user_id UUID, security_flags JSONB, permissions TEXT[], roles TEXT[])
- **Purpose:** Comprehensive session validation with security checks
- **Language:** plpgsql

#### auth.cleanup_expired_sessions()
- **Returns:** INTEGER (deleted count)
- **Purpose:** Removes expired and inactive sessions
- **Language:** plpgsql

#### trigger_set_timestamp()
- **Returns:** TRIGGER
- **Purpose:** Updates 'updated_at' column automatically
- **Language:** plpgsql

### Triggers

1. **trigger_session_fingerprint** ON auth.sessions
   - BEFORE INSERT OR UPDATE
   - Executes: auth.update_session_fingerprint()

2. **set_timestamp_auth_users** ON auth.users
   - BEFORE UPDATE
   - Executes: trigger_set_timestamp()

3. **set_timestamp_auth_roles** ON auth.roles
   - BEFORE UPDATE
   - Executes: trigger_set_timestamp()

4. **set_timestamp_campaigns** ON campaigns
   - BEFORE UPDATE
   - Executes: trigger_set_timestamp()

5. **set_timestamp_personas** ON personas
   - BEFORE UPDATE
   - Executes: trigger_set_timestamp()

6. **set_timestamp_keyword_sets** ON keyword_sets
   - BEFORE UPDATE
   - Executes: trigger_set_timestamp()

7. **set_timestamp_proxies** ON proxies
   - BEFORE UPDATE
   - Executes: trigger_set_timestamp()

8. **set_timestamp_campaign_jobs** ON campaign_jobs
   - BEFORE UPDATE
   - Executes: trigger_set_timestamp()

---

## Default Data

### Default Roles
1. **super_admin** (00000000-0000-0000-0000-000000000001)
   - Display: Super Administrator
   - Description: Full system access with all permissions
   - System Role: true

2. **admin** (00000000-0000-0000-0000-000000000002)
   - Display: Administrator
   - Description: Administrative access to most system features
   - System Role: true

3. **user** (00000000-0000-0000-0000-000000000003)
   - Display: Standard User
   - Description: Standard user with basic access permissions
   - System Role: true

4. **viewer** (00000000-0000-0000-0000-000000000004)
   - Display: Viewer
   - Description: Read-only access to system resources
   - System Role: true

### Default Permissions (17 total)
- **Campaigns:** create, read, update, delete, execute
- **Personas:** create, read, update, delete
- **Proxies:** create, read, update, delete
- **System:** admin, config
- **Users:** manage
- **Reports:** generate

### Default Users
1. **admin@domainflow.local** (00000000-0000-0000-0000-000000000001)
   - Password: TempPassword123! (hashed with bcrypt)
   - Role: super_admin
   - Must Change Password: true

2. **user@domainflow.com** (00000000-0000-0000-0000-000000000002)
   - Password: user123! (hashed with bcrypt)
   - Role: user
   - Must Change Password: false

3. **dbadmin@domainflow.local** (00000000-0000-0000-0000-000000000003)
   - Password: dbpassword123! (hashed with bcrypt)
   - Role: super_admin
   - Must Change Password: false

---

## Schema Comparison Summary

This extracted PostgreSQL schema will be compared against the Go backend contracts in the next phase. Key areas for comparison include:

1. **Data Type Mapping**
   - PostgreSQL UUID ↔ Go uuid.UUID
   - PostgreSQL TEXT ↔ Go string
   - PostgreSQL BIGINT ↔ Go int64
   - PostgreSQL JSONB ↔ Go json.RawMessage or structs
   - PostgreSQL TIMESTAMP/TIMESTAMPTZ ↔ Go time.Time

2. **Enum Validation**
   - Campaign types match CHECK constraints
   - Status values follow conventions
   - Persona types align with constraints

3. **Relationship Integrity**
   - Foreign key cascades match application logic
   - Junction tables properly implement many-to-many relationships

4. **Business Logic**
   - Triggers align with application expectations
   - Functions support required security features
   - Default data provides expected initial state

5. **Security Features**
   - Session-based authentication fully implemented
   - Audit logging comprehensive
   - Rate limiting in place
   - Password hashing using bcrypt/pgcrypto

---

**End of PostgreSQL Database Schema Extraction Report**