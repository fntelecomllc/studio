# Database Schema Inventory

## 1. Schemas

-   `public`
-   `auth`

## 2. Extensions

-   `uuid-ossp`
-   `pgcrypto`

## 3. Tables

### Schema: `auth`

#### `auth.users`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `email` | `VARCHAR(255)` | `UNIQUE NOT NULL` | |
| `email_verified` | `BOOLEAN` | | `FALSE` |
| `email_verification_token` | `VARCHAR(255)` | | |
| `email_verification_expires_at` | `TIMESTAMP` | | |
| `password_hash` | `VARCHAR(255)` | `NOT NULL` | |
| `password_pepper_version` | `INTEGER` | | `1` |
| `first_name` | `VARCHAR(100)` | `NOT NULL` | |
| `last_name` | `VARCHAR(100)` | `NOT NULL` | |
| `avatar_url` | `TEXT` | | |
| `is_active` | `BOOLEAN` | | `TRUE` |
| `is_locked` | `BOOLEAN` | | `FALSE` |
| `failed_login_attempts` | `INTEGER` | | `0` |
| `locked_until` | `TIMESTAMP` | | |
| `last_login_at` | `TIMESTAMP` | | |
| `last_login_ip` | `INET` | | |
| `password_changed_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |
| `must_change_password` | `BOOLEAN` | | `FALSE` |
| `mfa_enabled` | `BOOLEAN` | `NOT NULL` | `FALSE` |
| `created_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |

#### `auth.sessions`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `VARCHAR(128)` | `PRIMARY KEY` | |
| `user_id` | `UUID` | `NOT NULL, FOREIGN KEY (auth.users.id)` | |
| `ip_address` | `INET` | | |
| `user_agent` | `TEXT` | | |
| `user_agent_hash` | `VARCHAR(64)` | | |
| `session_fingerprint` | `VARCHAR(255)` | | |
| `browser_fingerprint` | `TEXT` | | |
| `screen_resolution` | `VARCHAR(20)` | | |
| `is_active` | `BOOLEAN` | | `TRUE` |
| `expires_at` | `TIMESTAMP` | `NOT NULL` | |
| `last_activity_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |
| `created_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |

#### `auth.roles`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `name` | `VARCHAR(50)` | `UNIQUE NOT NULL` | |
| `display_name` | `VARCHAR(100)` | `NOT NULL` | |
| `description` | `TEXT` | | |
| `is_system_role` | `BOOLEAN` | | `FALSE` |
| `created_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |

#### `auth.permissions`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `name` | `VARCHAR(100)` | `UNIQUE NOT NULL` | |
| `display_name` | `VARCHAR(150)` | `NOT NULL` | |
| `description` | `TEXT` | | |
| `resource` | `VARCHAR(50)` | `NOT NULL` | |
| `action` | `VARCHAR(20)` | `NOT NULL` | |
| `created_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |
| `(resource, action)` | | `UNIQUE` | |

#### `auth.user_roles`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `user_id` | `UUID` | `PRIMARY KEY, NOT NULL, FOREIGN KEY (auth.users.id)` | |
| `role_id` | `UUID` | `PRIMARY KEY, NOT NULL, FOREIGN KEY (auth.roles.id)` | |
| `assigned_by` | `UUID` | `FOREIGN KEY (auth.users.id)` | |
| `assigned_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |
| `expires_at` | `TIMESTAMP` | | |

#### `auth.role_permissions`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `role_id` | `UUID` | `PRIMARY KEY, NOT NULL, FOREIGN KEY (auth.roles.id)` | |
| `permission_id` | `UUID` | `PRIMARY KEY, NOT NULL, FOREIGN KEY (auth.permissions.id)` | |

#### `auth.password_reset_tokens`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `user_id` | `UUID` | `NOT NULL, FOREIGN KEY (auth.users.id)` | |
| `token_hash` | `VARCHAR(255)` | `NOT NULL` | |
| `expires_at` | `TIMESTAMP` | `NOT NULL` | |
| `used_at` | `TIMESTAMP` | | |
| `ip_address` | `INET` | | |
| `user_agent` | `TEXT` | | |
| `created_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |

#### `auth.auth_audit_log`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | `PRIMARY KEY` | |
| `user_id` | `UUID` | `FOREIGN KEY (auth.users.id)` | |
| `session_id` | `VARCHAR(128)` | | |
| `event_type` | `VARCHAR(50)` | `NOT NULL` | |
| `event_status` | `VARCHAR(20)` | `NOT NULL` | |
| `ip_address` | `INET` | | |
| `user_agent` | `TEXT` | | |
| `session_fingerprint` | `VARCHAR(255)` | | |
| `security_flags` | `JSONB` | | `'{}'::jsonb` |
| `details` | `JSONB` | | |
| `risk_score` | `INTEGER` | | `0` |
| `created_at` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |

#### `auth.rate_limits`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `BIGSERIAL` | `PRIMARY KEY` | |
| `identifier` | `VARCHAR(255)` | `NOT NULL` | |
| `action` | `VARCHAR(50)` | `NOT NULL` | |
| `attempts` | `INTEGER` | | `1` |
| `window_start` | `TIMESTAMP` | | `CURRENT_TIMESTAMP` |
| `blocked_until` | `TIMESTAMP` | | |
| `(identifier, action)` | | `UNIQUE` | |

### Schema: `public`

#### `campaigns`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `name` | `TEXT` | `NOT NULL` | |
| `campaign_type` | `TEXT` | `NOT NULL, CHECK (campaign_type IN ('domain_generation', 'dns_validation', 'http_keyword_validation'))` | `'domain_generation'` |
| `status` | `TEXT` | `NOT NULL` | |
| `user_id` | `UUID` | `FOREIGN KEY (auth.users.id) ON DELETE SET NULL` | |
| `total_items` | `BIGINT` | | `0` |
| `processed_items` | `BIGINT` | | `0` |
| `successful_items` | `BIGINT` | | `0` |
| `failed_items` | `BIGINT` | | `0` |
| `progress_percentage` | `DOUBLE PRECISION` | | `0.0` |
| `metadata` | `JSONB` | | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `started_at` | `TIMESTAMPTZ` | | |
| `completed_at` | `TIMESTAMPTZ` | | |
| `error_message` | `TEXT` | | |

#### `domain_generation_campaign_params`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `campaign_id` | `UUID` | `PRIMARY KEY, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `pattern_type` | `TEXT` | `NOT NULL` | |
| `variable_length` | `INT` | | |
| `character_set` | `TEXT` | | |
| `constant_string` | `TEXT` | | |
| `tld` | `TEXT` | `NOT NULL` | |
| `num_domains_to_generate` | `INT` | `NOT NULL` | |
| `total_possible_combinations` | `BIGINT` | `NOT NULL` | |
| `current_offset` | `BIGINT` | `NOT NULL` | `0` |

#### `generated_domains`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `domain_generation_campaign_id` | `UUID` | `NOT NULL, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `domain_name` | `TEXT` | `NOT NULL` | |
| `source_keyword` | `TEXT` | | |
| `source_pattern` | `TEXT` | | |
| `tld` | `TEXT` | | |
| `offset_index` | `BIGINT` | `NOT NULL` | `0` |
| `generated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `(domain_generation_campaign_id, domain_name)` | | `UNIQUE` | |

#### `domain_generation_config_states`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `config_hash` | `TEXT` | `PRIMARY KEY` | |
| `last_offset` | `BIGINT` | `NOT NULL` | |
| `config_details` | `JSONB` | `NOT NULL` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |

#### `personas`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `name` | `TEXT` | `NOT NULL` | |
| `description` | `TEXT` | | |
| `persona_type` | `TEXT` | `NOT NULL, CHECK (persona_type IN ('dns', 'http'))` | |
| `config_details` | `JSONB` | `NOT NULL` | |
| `is_enabled` | `BOOLEAN` | `NOT NULL` | `TRUE` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `(name, persona_type)` | | `UNIQUE` | |

#### `keyword_sets`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `name` | `TEXT` | `NOT NULL, UNIQUE` | |
| `description` | `TEXT` | | |
| `rules` | `JSONB` | `NOT NULL` | `'[]'::jsonb` |
| `is_enabled` | `BOOLEAN` | `NOT NULL` | `TRUE` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |

#### `dns_validation_params`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `campaign_id` | `UUID` | `PRIMARY KEY, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `source_generation_campaign_id` | `UUID` | `FOREIGN KEY (campaigns.id) ON DELETE SET NULL` | |
| `persona_ids` | `UUID[]` | `NOT NULL` | |
| `rotation_interval_seconds` | `INT` | | `0` |
| `processing_speed_per_minute` | `INT` | | `0` |
| `batch_size` | `INT` | `CHECK (batch_size > 0)` | `50` |
| `retry_attempts` | `INT` | `CHECK (retry_attempts >= 0)` | `1` |
| `metadata` | `JSONB` | | |

#### `dns_validation_results`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `dns_campaign_id` | `UUID` | `NOT NULL, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `generated_domain_id` | `UUID` | `FOREIGN KEY (generated_domains.id) ON DELETE SET NULL` | |
| `domain_name` | `TEXT` | `NOT NULL` | |
| `validation_status` | `TEXT` | `NOT NULL` | |
| `dns_records` | `JSONB` | | |
| `validated_by_persona_id` | `UUID` | `FOREIGN KEY (personas.id) ON DELETE SET NULL` | |
| `attempts` | `INT` | `CHECK (attempts >= 0)` | `0` |
| `last_checked_at` | `TIMESTAMPTZ` | | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `(dns_campaign_id, domain_name)` | | `UNIQUE` | |

#### `http_keyword_campaign_params`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `campaign_id` | `UUID` | `PRIMARY KEY, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `source_campaign_id` | `UUID` | `NOT NULL, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `source_type` | `TEXT` | `NOT NULL, CHECK (source_type IN ('DomainGeneration', 'DNSValidation'))` | |
| `persona_ids` | `UUID[]` | `NOT NULL` | |
| `keyword_set_ids` | `UUID[]` | | |
| `ad_hoc_keywords` | `TEXT[]` | | |
| `proxy_ids` | `UUID[]` | | |
| `proxy_pool_id` | `UUID` | | |
| `proxy_selection_strategy` | `TEXT` | | |
| `rotation_interval_seconds` | `INT` | | `0` |
| `processing_speed_per_minute` | `INT` | | `0` |
| `batch_size` | `INT` | `CHECK (batch_size > 0)` | `10` |
| `retry_attempts` | `INT` | `CHECK (retry_attempts >= 0)` | `1` |
| `target_http_ports` | `INT[]` | | |
| `last_processed_domain_name` | `TEXT` | | |
| `metadata` | `JSONB` | | |

#### `proxies`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `name` | `TEXT` | `NOT NULL, UNIQUE` | |
| `description` | `TEXT` | | |
| `address` | `TEXT` | `NOT NULL, UNIQUE` | |
| `protocol` | `TEXT` | | |
| `username` | `TEXT` | | |
| `password_hash` | `TEXT` | | |
| `host` | `TEXT` | | |
| `port` | `INT` | | |
| `is_enabled` | `BOOLEAN` | `NOT NULL` | `TRUE` |
| `is_healthy` | `BOOLEAN` | `NOT NULL` | `TRUE` |
| `last_status` | `TEXT` | | |
| `last_checked_at` | `TIMESTAMPTZ` | | |
| `latency_ms` | `INT` | | |
| `city` | `TEXT` | | |
| `country_code` | `TEXT` | | |
| `provider` | `TEXT` | | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |

#### `http_keyword_results`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `http_keyword_campaign_id` | `UUID` | `NOT NULL, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `dns_result_id` | `UUID` | `FOREIGN KEY (dns_validation_results.id) ON DELETE SET NULL` | |
| `domain_name` | `TEXT` | `NOT NULL` | |
| `validation_status` | `TEXT` | `NOT NULL` | |
| `http_status_code` | `INT` | | |
| `response_headers` | `JSONB` | | |
| `page_title` | `TEXT` | | |
| `extracted_content_snippet` | `TEXT` | | |
| `found_keywords_from_sets` | `JSONB` | | |
| `found_ad_hoc_keywords` | `JSONB` | | |
| `content_hash` | `TEXT` | | |
| `validated_by_persona_id` | `UUID` | `FOREIGN KEY (personas.id) ON DELETE SET NULL` | |
| `used_proxy_id` | `UUID` | `FOREIGN KEY (proxies.id) ON DELETE SET NULL` | |
| `attempts` | `INT` | | `0` |
| `last_checked_at` | `TIMESTAMPTZ` | | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `(http_keyword_campaign_id, domain_name)` | | `UNIQUE` | |

#### `audit_logs`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `timestamp` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `user_id` | `UUID` | `FOREIGN KEY (auth.users.id) ON DELETE SET NULL` | |
| `action` | `TEXT` | `NOT NULL` | |
| `entity_type` | `TEXT` | | |
| `entity_id` | `UUID` | | |
| `details` | `JSONB` | | |
| `client_ip` | `TEXT` | | |
| `user_agent` | `TEXT` | | |

#### `campaign_jobs`

| Column | Data Type | Constraints | Default Value |
| --- | --- | --- | --- |
| `id` | `UUID` | `PRIMARY KEY` | `gen_random_uuid()` |
| `campaign_id` | `UUID` | `NOT NULL, FOREIGN KEY (campaigns.id) ON DELETE CASCADE` | |
| `job_type` | `TEXT` | `NOT NULL` | |
| `status` | `TEXT` | `NOT NULL` | `'pending'` |
| `scheduled_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `attempts` | `INT` | `CHECK (attempts >= 0)` | `0` |
| `max_attempts` | `INT` | `CHECK (max_attempts > 0)` | `3` |
| `last_attempted_at` | `TIMESTAMPTZ` | | |
| `last_error` | `TEXT` | | |
| `processing_server_id` | `TEXT` | | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |
| `job_payload` | `JSONB` | | |
| `next_execution_at` | `TIMESTAMPTZ` | | |
| `locked_at` | `TIMESTAMPTZ` | | |
| `locked_by` | `TEXT` | | |

## 4. Custom Types & Enums

No custom types or enums are defined using `CREATE TYPE`. The schema uses `CHECK` constraints to restrict values in certain columns, effectively creating enum-like behavior.

-   **`campaigns.campaign_type`**: `domain_generation`, `dns_validation`, `http_keyword_validation`
-   **`personas.persona_type`**: `dns`, `http`
-   **`http_keyword_campaign_params.source_type`**: `DomainGeneration`, `DNSValidation`

## 5. Functions & Triggers

### Functions

-   `generate_user_agent_hash(user_agent_text TEXT)`: Returns `VARCHAR(64)`. Generates a SHA-256 hash of the user agent string.
-   `auth.update_session_fingerprint()`: Returns `TRIGGER`. Updates session fingerprint and user agent hash.
-   `auth.validate_session_security(p_session_id VARCHAR(128), p_client_ip INET, p_user_agent TEXT, p_require_ip_match BOOLEAN, p_require_ua_match BOOLEAN)`: Returns a table with session validity information.
-   `auth.cleanup_expired_sessions()`: Returns `INTEGER`. Deletes expired sessions and logs the operation.
-   `trigger_set_timestamp()`: Returns `TRIGGER`. Sets the `updated_at` column to the current timestamp.

### Triggers

-   `trigger_session_fingerprint` on `auth.sessions`: `BEFORE INSERT OR UPDATE`, executes `auth.update_session_fingerprint()`.
-   `set_timestamp_auth_users` on `auth.users`: `BEFORE UPDATE`, executes `trigger_set_timestamp()`.
-   `set_timestamp_auth_roles` on `auth.roles`: `BEFORE UPDATE`, executes `trigger_set_timestamp()`.
-   `set_timestamp_campaigns` on `campaigns`: `BEFORE UPDATE`, executes `trigger_set_timestamp()`.
-   `set_timestamp_personas` on `personas`: `BEFORE UPDATE`, executes `trigger_set_timestamp()`.
-   `set_timestamp_keyword_sets` on `keyword_sets`: `BEFORE UPDATE`, executes `trigger_set_timestamp()`.
-   `set_timestamp_proxies` on `proxies`: `BEFORE UPDATE`, executes `trigger_set_timestamp()`.
-   `set_timestamp_campaign_jobs` on `campaign_jobs`: `BEFORE UPDATE`, executes `trigger_set_timestamp()`.

## 6. Indexes

### `auth.sessions`

-   `idx_sessions_user_id` on (`user_id`)
-   `idx_sessions_expires_at` on (`expires_at`)
-   `idx_sessions_active` on (`is_active`, `expires_at`)
-   `idx_sessions_last_activity` on (`last_activity_at`)
-   `idx_sessions_fingerprint` on (`session_fingerprint`) WHERE `session_fingerprint IS NOT NULL`
-   `idx_sessions_user_agent_hash` on (`user_agent_hash`) WHERE `user_agent_hash IS NOT NULL`
-   `idx_sessions_ip_address` on (`ip_address`) WHERE `ip_address IS NOT NULL`
-   `idx_sessions_validation` on (`id`, `is_active`, `expires_at`, `user_id`)

### `auth.user_roles`

-   `idx_user_roles_user_id` on (`user_id`)
-   `idx_user_roles_role_id` on (`role_id`)

### `auth.role_permissions`

-   `idx_role_permissions_role_id` on (`role_id`)
-   `idx_role_permissions_permission_id` on (`permission_id`)

### `auth.password_reset_tokens`

-   `idx_password_reset_user_id` on (`user_id`)
-   `idx_password_reset_expires` on (`expires_at`)

### `auth.auth_audit_log`

-   `idx_auth_audit_user_id` on (`user_id`)
-   `idx_auth_audit_event_type` on (`event_type`)
-   `idx_auth_audit_created_at` on (`created_at`)
-   `idx_auth_audit_risk_score` on (`risk_score`)
-   `idx_auth_audit_session_fingerprint` on (`session_fingerprint`) WHERE `session_fingerprint IS NOT NULL`

### `auth.rate_limits`

-   `idx_rate_limits_identifier` on (`identifier`)
-   `idx_rate_limits_blocked_until` on (`blocked_until`)

### `campaigns`

-   `idx_campaigns_status` on (`status`)
-   `idx_campaigns_type` on (`campaign_type`)
-   `idx_campaigns_user_id` on (`user_id`)
-   `idx_campaigns_created_at` on (`created_at` DESC)

### `generated_domains`

-   `idx_generated_domains_offset` on (`domain_generation_campaign_id`, `offset_index`)
-   `idx_generated_domains_campaign_id` on (`domain_generation_campaign_id`)
-   `idx_generated_domains_name` on (`domain_name`)

### `personas`

-   `idx_personas_type` on (`persona_type`)
-   `idx_personas_is_enabled` on (`is_enabled`)

### `dns_validation_results`

-   `idx_dns_results_campaign_id` on (`dns_campaign_id`)
-   `idx_dns_results_domain_name` on (`domain_name`)
-   `idx_dns_results_status` on (`validation_status`)

### `proxies`

-   `idx_proxies_is_enabled` on (`is_enabled`)

### `http_keyword_results`

-   `idx_http_results_campaign_id` on (`http_keyword_campaign_id`)
-   `idx_http_results_domain_name` on (`domain_name`)
-   `idx_http_results_status` on (`validation_status`)
-   `idx_http_keyword_results_dns_result_id` on (`dns_result_id`)

### `audit_logs`

-   `idx_audit_logs_timestamp` on (`timestamp` DESC)
-   `idx_audit_logs_user_id` on (`user_id`)
-   `idx_audit_logs_entity_type_id` on (`entity_type`, `entity_id`)

### `campaign_jobs`

-   `idx_campaign_jobs_campaign_id` on (`campaign_id`)
-   `idx_campaign_jobs_status_scheduled_at` on (`status`, `scheduled_at` ASC)
-   `idx_campaign_jobs_type` on (`job_type`)