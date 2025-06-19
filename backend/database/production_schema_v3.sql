-- =====================================================
-- DomainFlow Production Database Schema v3.0
-- =====================================================
-- This is the complete, production-ready PostgreSQL schema for DomainFlow
-- Generated: 2024-12-19
-- Status: Ready for production deployment
-- 
-- This schema includes:
-- - Complete database structure with all tables, indexes, and constraints
-- - Session-based authentication system (no CSRF tokens)
-- - Role-based permissions system
-- - Campaign management with multiple validation types
-- - Audit logging and security features
-- - Default production data (roles, permissions, admin users)
-- 
-- Default Users Created:
-- - admin@domainflow.local (Password: TempPassword123!) - Super Admin
-- - dbadmin@domainflow.local (Password: dbpassword123!) - Super Admin  
-- - user@domainflow.com (Password: user123!) - Standard User
-- 
-- DEPLOYMENT INSTRUCTIONS:
-- 1. Create a new PostgreSQL database
-- 2. Run: psql "your_connection_string" < backend/database/production_schema_v3.sql
-- 3. Verify deployment using the included integrity checks
-- 4. Change default passwords immediately after deployment
-- =====================================================

-- Production-Ready PostgreSQL Schema for DomainFlow (Version with metadata in param tables)
-- Updated for Session-Based Authentication (No CSRF Tokens)

-- Set search path to public schema
SET search_path TO public;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create auth schema for authentication system
CREATE SCHEMA IF NOT EXISTS auth;

-- Users table
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    email_verification_expires_at TIMESTAMP,
    password_hash VARCHAR(255) NOT NULL,
    password_pepper_version INTEGER DEFAULT 1,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_locked BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    last_login_ip INET,
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    must_change_password BOOLEAN DEFAULT FALSE,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table - Updated for session-based authentication (no CSRF tokens)
CREATE TABLE IF NOT EXISTS auth.sessions (
    id VARCHAR(128) PRIMARY KEY,                    -- Secure random session ID
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ip_address INET,                                -- For IP validation
    user_agent TEXT,                                -- For user agent validation
    user_agent_hash VARCHAR(64),                    -- SHA-256 hash of user agent for fast comparison
    session_fingerprint VARCHAR(255),               -- SHA-256 hash of IP, user agent, and screen resolution
    browser_fingerprint TEXT,                       -- SHA-256 hash of user agent and screen resolution
    screen_resolution VARCHAR(20),                  -- Screen resolution for enhanced fingerprinting
    is_active BOOLEAN DEFAULT TRUE,                 -- Session state
    expires_at TIMESTAMP NOT NULL,                  -- Hard expiration
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Idle timeout tracking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optimized indexes for session performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth.sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON auth.sessions(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON auth.sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_sessions_fingerprint ON auth.sessions(session_fingerprint) WHERE session_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_user_agent_hash ON auth.sessions(user_agent_hash) WHERE user_agent_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_ip_address ON auth.sessions(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_validation ON auth.sessions(id, is_active, expires_at, user_id);
-- This index was removed because it uses the non-immutable function NOW(), which is not allowed in index predicates.
-- CREATE INDEX IF NOT EXISTS idx_sessions_cleanup ON auth.sessions(is_active, expires_at) WHERE is_active = false OR expires_at < NOW();

-- Roles table
CREATE TABLE IF NOT EXISTS auth.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS auth.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    resource VARCHAR(50) NOT NULL, -- campaigns, personas, proxies, etc.
    action VARCHAR(20) NOT NULL,   -- create, read, update, delete, execute
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(resource, action)
);

-- User roles junction table
CREATE TABLE IF NOT EXISTS auth.user_roles (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON auth.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON auth.user_roles(role_id);

-- Role permissions junction table
CREATE TABLE IF NOT EXISTS auth.role_permissions (
    role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
    
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON auth.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON auth.role_permissions(permission_id);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON auth.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON auth.password_reset_tokens(expires_at);

-- Authentication audit log - Enhanced for session-based security
CREATE TABLE IF NOT EXISTS auth.auth_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    session_id VARCHAR(128),
    event_type VARCHAR(50) NOT NULL, -- login, logout, password_change, session_security_violation, etc.
    event_status VARCHAR(20) NOT NULL, -- success, failure, blocked
    ip_address INET,
    user_agent TEXT,
    session_fingerprint VARCHAR(255), -- For tracking session security events
    security_flags JSONB DEFAULT '{}'::jsonb, -- Security-related metadata
    details JSONB,
    risk_score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth.auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event_type ON auth.auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth.auth_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_audit_risk_score ON auth.auth_audit_log(risk_score);
CREATE INDEX IF NOT EXISTS idx_auth_audit_session_fingerprint ON auth.auth_audit_log(session_fingerprint) WHERE session_fingerprint IS NOT NULL;

-- Rate limiting table
CREATE TABLE IF NOT EXISTS auth.rate_limits (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- IP address or user ID
    action VARCHAR(50) NOT NULL,      -- login, password_reset, etc.
    attempts INTEGER DEFAULT 1,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blocked_until TIMESTAMP,
    
    UNIQUE(identifier, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON auth.rate_limits(identifier);
CREATE INDEX IF NOT EXISTS idx_rate_limits_blocked_until ON auth.rate_limits(blocked_until);


-- Campaigns Table: Central table for all campaign types
CREATE TABLE IF NOT EXISTS campaigns (
    -- Unique identifier for the campaign, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- User-defined name for the campaign for easy identification.
    name TEXT NOT NULL,
    -- Type of the campaign, restricted to predefined values. Defaults to 'domain_generation'.
    -- Allowed values: 'domain_generation', 'dns_validation', 'http_keyword_validation'.
    campaign_type TEXT NOT NULL DEFAULT 'domain_generation' CHECK (campaign_type IN ('domain_generation', 'dns_validation', 'http_keyword_validation')),
    -- Current status of the campaign (e.g., 'pending', 'queued', 'running', 'paused', 'completed', 'failed', 'archived').
    status TEXT NOT NULL,
    -- Identifier for the user who created or owns the campaign. Can be NULL if system-generated or authentication is not used.
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Total number of items expected to be processed in this campaign.
    total_items BIGINT DEFAULT 0,
    -- Number of items that have been processed so far.
    processed_items BIGINT DEFAULT 0,
    -- Number of items that were processed successfully.
    successful_items BIGINT DEFAULT 0,
    -- Number of items that failed during processing.
    failed_items BIGINT DEFAULT 0,
    -- Progress of the campaign, typically calculated as (processed_items / total_items) * 100.
    progress_percentage DOUBLE PRECISION DEFAULT 0.0,
    -- Flexible JSONB field to store any additional campaign-specific metadata.
    metadata JSONB,
    -- Timestamp of when the campaign record was created.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamp of when the campaign record was last updated. Automatically updated by a trigger.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamp of when the campaign processing actually started.
    started_at TIMESTAMPTZ,
    -- Timestamp of when the campaign processing completed or was terminated.
    completed_at TIMESTAMPTZ,
    -- Stores the last error message if the campaign failed or encountered a critical error.
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- Domain Generation Parameters Table - stores specific parameters for domain generation campaigns.
CREATE TABLE IF NOT EXISTS domain_generation_campaign_params (
    -- Foreign key referencing the 'campaigns' table. This is also the primary key for this table, ensuring a one-to-one relationship.
    -- If the referenced campaign is deleted, these parameters will also be deleted (ON DELETE CASCADE).
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    -- Type of pattern used for domain generation (e.g., 'prefix_suffix', 'char_permutation').
    pattern_type TEXT NOT NULL,
    -- Length of the variable part of the generated domain, if applicable to the pattern_type.
    variable_length INT,
    -- Character set to be used for the variable part of the domain (e.g., 'alphanumeric', 'letters', 'numbers').
    character_set TEXT,
    -- A constant string component used in the domain generation pattern.
    constant_string TEXT,
    -- The Top-Level Domain (TLD) to be used for generated domains (e.g., 'com', 'net').
    tld TEXT NOT NULL,
    -- The target number of unique domains to generate for this campaign.
    num_domains_to_generate INT NOT NULL,
    -- The total number of unique domain combinations possible with the given parameters.
    total_possible_combinations BIGINT NOT NULL,
    -- The current offset in the generation sequence, used for resuming or batching.
    current_offset BIGINT NOT NULL DEFAULT 0
);

-- Generated Domains Table: Stores individual domain names generated by domain generation campaigns.
CREATE TABLE IF NOT EXISTS generated_domains (
    -- Unique identifier for the generated domain record, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Foreign key referencing the 'campaigns' table (specifically, a domain generation campaign).
    -- If the referenced campaign is deleted, all its generated domains will also be deleted (ON DELETE CASCADE).
    domain_generation_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    -- The fully qualified domain name that was generated.
    domain_name TEXT NOT NULL,
    -- The keyword(s) used as a source for generating this domain, if applicable.
    source_keyword TEXT,
    -- The pattern or rule used to generate this specific domain, if applicable.
    source_pattern TEXT,
    -- The Top-Level Domain (TLD) of the generated domain (e.g., 'com', 'org').
    tld TEXT,
    -- The offset or index within the generation sequence that produced this domain. Useful for tracking and resuming.
    offset_index BIGINT NOT NULL DEFAULT 0,
    -- Timestamp of when this specific domain was generated by the campaign logic.
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamp of when this record was inserted into the database.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensures that within a single domain generation campaign, each domain name is unique.
    CONSTRAINT uq_generated_domains_campaign_name UNIQUE (domain_generation_campaign_id, domain_name)
);

-- Add index for faster lookups by offset_index
CREATE INDEX IF NOT EXISTS idx_generated_domains_offset 
ON generated_domains(domain_generation_campaign_id, offset_index);

CREATE INDEX IF NOT EXISTS idx_generated_domains_campaign_id ON generated_domains(domain_generation_campaign_id);
CREATE INDEX IF NOT EXISTS idx_generated_domains_name ON generated_domains(domain_name);

-- Domain Generation Config State Table: Tracks the progress/state of unique domain generation configurations to allow resumption.
CREATE TABLE IF NOT EXISTS domain_generation_config_states (
    -- A unique hash representing a specific domain generation configuration (parameters). This is the primary key.
    config_hash TEXT PRIMARY KEY,
    -- The last successfully processed offset for this particular configuration.
    last_offset BIGINT NOT NULL,
    -- The actual domain generation parameters (e.g., marshalled NormalizedDomainGenerationParams) associated with this config_hash.
    config_details JSONB NOT NULL,
    -- Timestamp of when this configuration state was last updated.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Personas Table: Stores configurations for different validation personas (e.g., specific DNS resolvers or HTTP client settings).
CREATE TABLE IF NOT EXISTS personas (
    -- Unique identifier for the persona, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- User-defined name for the persona for easy identification.
    name TEXT NOT NULL,
    -- Optional description of the persona and its configuration.
    description TEXT,
    -- Type of the persona, indicating whether it's for DNS or HTTP validation. Restricted to 'DNS' or 'HTTP'.
    persona_type TEXT NOT NULL CHECK (persona_type IN ('dns', 'http')),
    -- JSONB field storing the specific configuration details for this persona (e.g., DNSValidatorConfigJSON or HTTPValidatorConfigJSON).
    config_details JSONB NOT NULL,
    -- Flag indicating whether this persona is currently active and can be used in campaigns. Defaults to TRUE.
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    -- Timestamp of when the persona record was created.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamp of when the persona record was last updated. Automatically updated by a trigger.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensures that the combination of persona name and type is unique.
    CONSTRAINT uq_personas_name_type UNIQUE (name, persona_type)
);

CREATE INDEX IF NOT EXISTS idx_personas_type ON personas(persona_type);
CREATE INDEX IF NOT EXISTS idx_personas_is_enabled ON personas(is_enabled);

-- Keyword Sets Table: Stores collections of keywords that can be used in HTTP keyword validation campaigns.
CREATE TABLE IF NOT EXISTS keyword_sets (
    -- Unique identifier for the keyword set, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- User-defined name for the keyword set, must be unique.
    name TEXT NOT NULL UNIQUE,
    -- Optional description of the keyword set.
    description TEXT,
    -- JSONB array storing KeywordRule objects (e.g., [{"pattern": "findme", "ruleType": "string"}, ...]). Defaults to an empty array.
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Flag indicating whether this keyword set is currently active and can be used. Defaults to TRUE.
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    -- Timestamp of when the keyword set record was created.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamp of when the keyword set record was last updated. Automatically updated by a trigger.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DNS Validation Campaign Parameters Table: Stores parameters specific to DNS validation campaigns.
CREATE TABLE IF NOT EXISTS dns_validation_params (
    -- Foreign key referencing the 'campaigns' table (specifically, a DNS validation campaign). This is also the primary key.
    -- If the referenced campaign is deleted, these parameters will also be deleted (ON DELETE CASCADE).
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    -- Optional foreign key to a 'campaigns' table record (specifically, a domain generation campaign) that serves as the source of domains for this DNS validation campaign.
    -- If the source campaign is deleted, this field will be set to NULL (ON DELETE SET NULL).
    source_generation_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    -- Array of persona IDs (from the 'personas' table) to be used for DNS validation. At least one persona must be specified.
    persona_ids UUID[] NOT NULL,
    -- Interval in seconds for rotating through the specified personas, if multiple are provided. 0 means no rotation or use all simultaneously based on other logic.
    rotation_interval_seconds INT DEFAULT 0,
    -- Target processing speed in terms of domains per minute. 0 might indicate no specific limit or use system default.
    processing_speed_per_minute INT DEFAULT 0,
    -- Number of domains to process in a single batch.
    batch_size INT DEFAULT 50 CHECK (batch_size > 0),
    -- Number of times to retry validation for a domain if it fails.
    retry_attempts INT DEFAULT 1 CHECK (retry_attempts >= 0),
    -- Flexible JSONB field for any additional DNS validation-specific metadata.
    metadata JSONB
);

-- DNS Validation Results Table: Stores the outcome of DNS validation attempts for each domain in a DNS validation campaign.
CREATE TABLE IF NOT EXISTS dns_validation_results (
    -- Unique identifier for this DNS validation result record, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Foreign key referencing the 'campaigns' table (specifically, a DNS validation campaign).
    -- If the referenced campaign is deleted, all its DNS validation results will also be deleted (ON DELETE CASCADE).
    dns_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    -- Optional foreign key to the 'generated_domains' table, if this domain was sourced from a generation campaign.
    -- If the referenced generated domain is deleted, this field will be set to NULL (ON DELETE SET NULL).
    generated_domain_id UUID REFERENCES generated_domains(id) ON DELETE SET NULL,
    -- The fully qualified domain name that was validated.
    domain_name TEXT NOT NULL,
    -- Status of the DNS validation (e.g., 'Resolved', 'Unresolved', 'Error', 'Pending', 'Skipped').
    validation_status TEXT NOT NULL,
    -- JSONB field to store the DNS records found for the domain, if any (e.g., A, MX, CNAME records).
    dns_records JSONB,
    -- Optional foreign key to the 'personas' table, indicating which DNS persona was used for this specific validation attempt.
    -- If the referenced persona is deleted, this field will be set to NULL (ON DELETE SET NULL).
    validated_by_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
    -- Number of validation attempts made for this domain.
    attempts INT DEFAULT 0 CHECK (attempts >= 0),
    -- Timestamp of when this domain was last checked/validated.
    last_checked_at TIMESTAMPTZ,
    -- Timestamp of when this record was created.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensures that for a given DNS campaign, each domain name result is unique.
    CONSTRAINT uq_dns_results_campaign_domain UNIQUE (dns_campaign_id, domain_name)
);

CREATE INDEX IF NOT EXISTS idx_dns_results_campaign_id ON dns_validation_results(dns_campaign_id);
CREATE INDEX IF NOT EXISTS idx_dns_results_domain_name ON dns_validation_results(domain_name);
CREATE INDEX IF NOT EXISTS idx_dns_results_status ON dns_validation_results(validation_status);

-- HTTP Keyword Campaign Parameters Table: Stores parameters specific to HTTP keyword validation campaigns.
CREATE TABLE IF NOT EXISTS http_keyword_campaign_params (
    -- Foreign key referencing the 'campaigns' table (specifically, an HTTP keyword campaign). This is also the primary key.
    -- If the referenced campaign is deleted, these parameters will also be deleted (ON DELETE CASCADE).
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    -- Foreign key to a 'campaigns' table record that serves as the source of domains for this HTTP keyword campaign.
    -- This source campaign must exist, and if it's deleted, this HTTP keyword campaign's parameters will also be deleted (ON DELETE CASCADE).
    source_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    -- Type of the source campaign, indicating whether domains come from 'DomainGeneration' or 'DNSValidation'.
    source_type TEXT NOT NULL CHECK (source_type IN ('DomainGeneration', 'DNSValidation')),
    -- Array of persona IDs (from the 'personas' table, type 'HTTP') to be used for HTTP requests. At least one persona must be specified.
    persona_ids UUID[] NOT NULL,
    -- Array of keyword set IDs (from 'keyword_sets' table) to be used for validation.
    keyword_set_ids UUID[],
    -- Array of ad-hoc keywords or phrases to search for, in addition to those in keyword_sets.
    ad_hoc_keywords TEXT[],
    -- Array of proxy IDs (from 'proxies' table) to be used for requests.
    proxy_ids UUID[],
    -- Optional foreign key to a specific proxy pool (if proxy management involves pools).
    proxy_pool_id UUID,
    -- Strategy for selecting proxies from proxy_ids or proxy_pool_id (e.g., 'random', 'round-robin').
    proxy_selection_strategy TEXT,
    -- Interval in seconds for rotating through specified HTTP personas, if multiple are provided. 0 means no rotation.
    rotation_interval_seconds INT DEFAULT 0,
    -- Target processing speed in terms of domains per minute. 0 might indicate no specific limit.
    processing_speed_per_minute INT DEFAULT 0,
    -- Number of domains to process in a single batch for HTTP checks.
    batch_size INT DEFAULT 10 CHECK (batch_size > 0),
    -- Number of times to retry HTTP checks for a domain if it fails.
    retry_attempts INT DEFAULT 1 CHECK (retry_attempts >= 0),
    -- Array of HTTP ports to target for validation (e.g., [80, 443]).
    target_http_ports INT[],
    -- The last domain name that was processed or attempted in this campaign, for resumption.
    last_processed_domain_name TEXT,
    -- Flexible JSONB field for any additional HTTP keyword campaign-specific metadata.
    metadata JSONB
);

-- Proxies Table: Stores information about proxy servers that can be used for HTTP requests.
CREATE TABLE IF NOT EXISTS proxies (
    -- Unique identifier for the proxy, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- User-defined name for the proxy, must be unique for easy identification.
    name TEXT NOT NULL UNIQUE,
    -- Optional description of the proxy.
    description TEXT,
    -- The full proxy address (e.g., 'http://user:pass@host:port' or 'socks5://host:port'), must be unique.
    address TEXT NOT NULL UNIQUE,
    -- Protocol of the proxy (e.g., 'http', 'https', 'socks5').
    protocol TEXT,
    -- Username for proxy authentication, if required.
    username TEXT,
    -- Hashed password for proxy authentication, if required. Store hashes, not plain text.
    password_hash TEXT,
    -- Hostname or IP address of the proxy server.
    host TEXT,
    -- Port number of the proxy server.
    port INT,
    -- Flag indicating whether this proxy is currently enabled and can be used. Defaults to TRUE.
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    -- Flag indicating the last known health status of the proxy. Defaults to TRUE (optimistic).
    is_healthy BOOLEAN NOT NULL DEFAULT TRUE,
    -- Last reported status of the proxy (e.g., 'Active', 'Inactive', 'Error', 'Banned').
    last_status TEXT,
    -- Timestamp of when the proxy's health was last checked.
    last_checked_at TIMESTAMPTZ,
    -- Last measured latency to the proxy in milliseconds, if available.
    latency_ms INT,
    -- City where the proxy server is located, if known.
    city TEXT,
    -- Country code (e.g., 'US', 'GB') of the proxy server's location, if known.
    country_code TEXT,
    -- Name of the proxy provider or service, if applicable.
    provider TEXT,
    -- Timestamp of when the proxy record was created.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamp of when the proxy record was last updated. Automatically updated by a trigger.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proxies_is_enabled ON proxies(is_enabled);

-- HTTP Keyword Results Table
CREATE TABLE IF NOT EXISTS http_keyword_results (
    -- Primary key for the result, automatically generated using UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Foreign key to the 'campaigns' table, ensuring each result is tied to a specific HTTP campaign.
    -- If the referenced campaign is deleted, all associated HTTP keyword results will also be deleted (ON DELETE CASCADE).
    http_keyword_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    -- Foreign key to 'dns_validation_results' table if this result is based on a prior DNS validation.
    -- If the referenced DNS result is deleted, this field will be set to NULL (ON DELETE SET NULL).
    dns_result_id UUID REFERENCES dns_validation_results(id) ON DELETE SET NULL,
    domain_name TEXT NOT NULL,
    validation_status TEXT NOT NULL, -- e.g., 'Success', 'ContentMismatch', 'KeywordsNotFound', 'Unreachable', 'Error'
    http_status_code INT,
    response_headers JSONB,
    page_title TEXT,
    extracted_content_snippet TEXT,
    found_keywords_from_sets JSONB, -- Keywords found that were part of predefined sets
    found_ad_hoc_keywords JSONB, -- Keywords found that were provided ad-hoc for this campaign run
    content_hash TEXT, -- Hash of the page content to detect changes
    validated_by_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
    used_proxy_id UUID REFERENCES proxies(id) ON DELETE SET NULL,
    attempts INT DEFAULT 0,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_http_results_campaign_domain UNIQUE (http_keyword_campaign_id, domain_name)
);

CREATE INDEX IF NOT EXISTS idx_http_results_campaign_id ON http_keyword_results(http_keyword_campaign_id);
CREATE INDEX IF NOT EXISTS idx_http_results_domain_name ON http_keyword_results(domain_name);
CREATE INDEX IF NOT EXISTS idx_http_results_status ON http_keyword_results(validation_status);
CREATE INDEX IF NOT EXISTS idx_http_keyword_results_dns_result_id ON http_keyword_results(dns_result_id);

-- Audit Logs Table: Records significant actions performed within the system for auditing and tracking purposes.
CREATE TABLE IF NOT EXISTS audit_logs (
    -- Unique identifier for the audit log entry, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Timestamp of when the audited action occurred. Defaults to the current time.
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Identifier of the user who performed the action, if applicable.
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Description of the action performed (e.g., 'CampaignCreated', 'PersonaUpdated', 'ProxyTested'). This should be a controlled vocabulary.
    action TEXT NOT NULL,
    -- Type of the entity that was affected by the action (e.g., 'Campaign', 'Persona', 'Proxy').
    entity_type TEXT,
    -- Unique identifier of the specific entity instance that was affected, if applicable.
    entity_id UUID,
    -- JSONB field to store additional details or context about the audited action.
    details JSONB,
    -- IP address of the client that initiated the action, if available.
    client_ip TEXT,
    -- User-Agent string of the client that initiated the action, if available.
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);

-- Campaign Jobs Table: Manages individual jobs or tasks associated with campaigns, typically processed by a worker service.
CREATE TABLE IF NOT EXISTS campaign_jobs (
    -- Unique identifier for the campaign job, automatically generated as a UUID v4.
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Foreign key referencing the 'campaigns' table to which this job belongs.
    -- If the referenced campaign is deleted, all its associated jobs will also be deleted (ON DELETE CASCADE).
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    -- Type of the job, often corresponding to the campaign_type (e.g., 'DomainGeneration', 'DNSValidation', 'HTTPKeywordScan').
    job_type TEXT NOT NULL,
    -- Current status of the job (e.g., 'Pending', 'Queued', 'Running', 'Completed', 'Failed', 'Retry').
    status TEXT NOT NULL DEFAULT 'pending',
    -- Timestamp indicating when the job is scheduled to be processed. Defaults to the current time.
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Number of times this job has been attempted.
    attempts INT DEFAULT 0 CHECK (attempts >= 0),
    -- Maximum number of attempts allowed for this job before marking it as permanently failed.
    max_attempts INT DEFAULT 3 CHECK (max_attempts > 0),
    -- Timestamp of the last time an attempt was made to process this job.
    last_attempted_at TIMESTAMPTZ,
    -- Stores the last error message if the job failed during its last attempt.
    last_error TEXT,
    -- Identifier of the worker server or instance that is currently processing or last processed this job.
    processing_server_id TEXT,
    -- Timestamp of when the campaign job record was created.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Timestamp of when the campaign job record was last updated. Automatically updated by a trigger.
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- JSONB field to store any specific payload or data required for processing this job.
    job_payload JSONB,
    -- Timestamp for the next scheduled execution, particularly for retries.
    next_execution_at TIMESTAMPTZ,
    -- Timestamp indicating when a worker locked this job for processing.
    locked_at TIMESTAMPTZ,
    -- Identifier of the worker that has locked this job.
    locked_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_campaign_id ON campaign_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_status_scheduled_at ON campaign_jobs(status, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_type ON campaign_jobs(job_type);

-- Function to generate user agent hash for session security
CREATE OR REPLACE FUNCTION generate_user_agent_hash(user_agent_text TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Generate SHA-256 hash of user agent for faster comparison
    RETURN encode(digest(user_agent_text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update session fingerprints automatically
CREATE OR REPLACE FUNCTION auth.update_session_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate session fingerprint from IP and user agent
    IF NEW.ip_address IS NOT NULL AND NEW.user_agent IS NOT NULL THEN
        NEW.session_fingerprint := encode(
            digest(
                COALESCE(host(NEW.ip_address), '') || '|' ||
                COALESCE(NEW.user_agent, '') || '|' ||
                COALESCE(NEW.screen_resolution, ''),
                'sha256'
            ),
            'hex'
        );
    END IF;
    
    -- Generate user agent hash
    IF NEW.user_agent IS NOT NULL THEN
        NEW.user_agent_hash := generate_user_agent_hash(NEW.user_agent);
    END IF;
    
    -- Generate browser fingerprint (simplified version)
    IF NEW.user_agent IS NOT NULL THEN
    	NEW.browser_fingerprint := encode(
    		digest(
    			COALESCE(NEW.user_agent, '') || '|' ||
    			COALESCE(NEW.screen_resolution, ''),
    			'sha256'
    		),
    		'hex'
    	);
    END IF;
    
    RETURN NEW;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
   
   -- Function to validate session security with comprehensive checks
   CREATE OR REPLACE FUNCTION auth.validate_session_security(
       p_session_id VARCHAR(128),
       p_client_ip INET,
    p_user_agent TEXT,
    p_require_ip_match BOOLEAN DEFAULT FALSE,
    p_require_ua_match BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    is_valid BOOLEAN,
    user_id UUID,
    security_flags JSONB,
    permissions TEXT[],
    roles TEXT[]
) AS $$
DECLARE
    session_record RECORD;
    current_fingerprint VARCHAR(255);
    security_issues JSONB := '{}'::jsonb;
BEGIN
    -- Get session record with user permissions and roles
    SELECT s.*, array_agg(DISTINCT p.name) as user_permissions, array_agg(DISTINCT r.name) as user_roles
    INTO session_record
    FROM auth.sessions s
    JOIN auth.users u ON s.user_id = u.id
    LEFT JOIN auth.user_roles ur ON u.id = ur.user_id
    LEFT JOIN auth.roles r ON ur.role_id = r.id
    LEFT JOIN auth.role_permissions rp ON r.id = rp.role_id
    LEFT JOIN auth.permissions p ON rp.permission_id = p.id
    WHERE s.id = p_session_id
    AND s.is_active = TRUE
    AND s.expires_at > NOW()
    AND u.is_active = TRUE
    AND u.is_locked = FALSE
    GROUP BY s.id, s.user_id, s.ip_address, s.user_agent, s.session_fingerprint,
             s.browser_fingerprint, s.user_agent_hash, s.is_active, s.expires_at,
             s.last_activity_at, s.created_at, s.screen_resolution;
    
    -- Check if session exists and is valid
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, '{"error": "session_not_found"}'::jsonb, NULL::TEXT[], NULL::TEXT[];
        RETURN;
    END IF;
    
    -- Generate current fingerprint for comparison
    IF p_client_ip IS NOT NULL AND p_user_agent IS NOT NULL THEN
        current_fingerprint := encode(
            digest(
                COALESCE(host(p_client_ip), '') || '|' ||
                COALESCE(p_user_agent, ''),
                'sha256'
            ),
            'hex'
        );
    END IF;
    
    -- Security validations
    IF p_require_ip_match AND session_record.ip_address != p_client_ip THEN
        security_issues := security_issues || '{"ip_mismatch": true}'::jsonb;
    END IF;
    
    IF p_require_ua_match AND session_record.user_agent_hash != generate_user_agent_hash(p_user_agent) THEN
        security_issues := security_issues || '{"user_agent_mismatch": true}'::jsonb;
    END IF;
    
    -- Check for session fingerprint changes
    IF session_record.session_fingerprint IS NOT NULL AND current_fingerprint IS NOT NULL
       AND session_record.session_fingerprint != current_fingerprint THEN
        security_issues := security_issues || '{"fingerprint_mismatch": true}'::jsonb;
    END IF;
    
    -- Check for idle timeout (30 minutes default)
    IF session_record.last_activity_at < (NOW() - INTERVAL '30 minutes') THEN
        security_issues := security_issues || '{"idle_timeout": true}'::jsonb;
    END IF;
    
    -- Return validation result
    IF jsonb_object_keys(security_issues) IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, session_record.user_id, security_issues, NULL::TEXT[], NULL::TEXT[];
    ELSE
        RETURN QUERY SELECT TRUE, session_record.user_id, '{}'::jsonb,
                           session_record.user_permissions, session_record.user_roles;
    END IF;
    
    -- Update last activity
    UPDATE auth.sessions
    SET last_activity_at = NOW()
    WHERE id = p_session_id;
   END;
   $$ LANGUAGE plpgsql;
   
   -- Function to cleanup expired sessions
   CREATE OR REPLACE FUNCTION auth.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired sessions
    WITH deleted AS (
        DELETE FROM auth.sessions
        WHERE expires_at < NOW()
        OR (is_active = FALSE AND last_activity_at < (NOW() - INTERVAL '7 days'))
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    -- Log cleanup operation
    INSERT INTO auth.auth_audit_log (event_type, event_status, details)
    VALUES ('session_cleanup', 'success',
            jsonb_build_object('deleted_sessions', deleted_count, 'cleanup_time', NOW()));
    
    RETURN deleted_count;
   END;
   $$ LANGUAGE plpgsql;

-- Function to update 'updated_at' column automatically
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers for session fingerprinting
DROP TRIGGER IF EXISTS trigger_session_fingerprint ON auth.sessions;
CREATE TRIGGER trigger_session_fingerprint
    BEFORE INSERT OR UPDATE ON auth.sessions
    FOR EACH ROW
    EXECUTE FUNCTION auth.update_session_fingerprint();

-- Apply the trigger to tables that have an 'updated_at' column
DROP TRIGGER IF EXISTS set_timestamp_auth_users ON auth.users;
CREATE TRIGGER set_timestamp_auth_users
BEFORE UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_auth_roles ON auth.roles;
CREATE TRIGGER set_timestamp_auth_roles
BEFORE UPDATE ON auth.roles
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_campaigns ON campaigns;
CREATE TRIGGER set_timestamp_campaigns
BEFORE UPDATE ON campaigns
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_personas ON personas;
CREATE TRIGGER set_timestamp_personas
BEFORE UPDATE ON personas
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_keyword_sets ON keyword_sets;
CREATE TRIGGER set_timestamp_keyword_sets
BEFORE UPDATE ON keyword_sets
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_proxies ON proxies;
CREATE TRIGGER set_timestamp_proxies
BEFORE UPDATE ON proxies
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_campaign_jobs ON campaign_jobs;
CREATE TRIGGER set_timestamp_campaign_jobs
BEFORE UPDATE ON campaign_jobs
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Session-based authentication comments
COMMENT ON COLUMN auth.sessions.session_fingerprint IS 'SHA-256 hash of IP address, user agent, and screen resolution for session security';
COMMENT ON COLUMN auth.sessions.browser_fingerprint IS 'SHA-256 hash of user agent and screen resolution for browser identification';
COMMENT ON COLUMN auth.sessions.user_agent_hash IS 'SHA-256 hash of user agent for fast comparison';
COMMENT ON COLUMN auth.sessions.screen_resolution IS 'Screen resolution for enhanced browser fingerprinting';
COMMENT ON FUNCTION auth.validate_session_security IS 'Validates session security with optional IP and user agent matching';
COMMENT ON FUNCTION auth.cleanup_expired_sessions IS 'Removes expired and inactive sessions from the database';
COMMENT ON FUNCTION generate_user_agent_hash IS 'Generates SHA-256 hash of user agent string';

-- Application schema comments
COMMENT ON COLUMN campaigns.campaign_type IS 'e.g., DomainGeneration, DNSValidation, HTTPKeywordScan';
COMMENT ON COLUMN campaigns.status IS 'e.g., Pending, Queued, Running, Paused, Completed, Failed, Archived';
COMMENT ON COLUMN personas.persona_type IS 'DNS or HTTP';
COMMENT ON COLUMN personas.config_details IS 'Stores DNSValidatorConfigJSON or HTTPValidatorConfigJSON';
COMMENT ON COLUMN keyword_sets.rules IS 'Array of KeywordRule objects: [{"pattern": "findme", "ruleType": "string", ...}]';
COMMENT ON COLUMN dns_validation_results.validation_status IS 'e.g., Resolved, Unresolved, Error, Pending, Skipped';
COMMENT ON COLUMN http_keyword_campaign_params.source_type IS 'DomainGeneration or DNSValidation to indicate which type source_campaign_id refers to';
COMMENT ON COLUMN http_keyword_results.validation_status IS 'e.g., Success, ContentMismatch, KeywordsNotFound, Unreachable, AccessDenied, ProxyError, DNSError, Timeout, Error, Pending, Skipped';
COMMENT ON COLUMN audit_logs.action IS 'e.g., CampaignCreated, PersonaUpdated, ProxyTested';
COMMENT ON COLUMN audit_logs.entity_type IS 'e.g., Campaign, Persona, Proxy';
COMMENT ON COLUMN campaign_jobs.job_type IS 'e.g., DomainGeneration, DNSValidation, HTTPKeywordScan (matches campaign_type usually)';
COMMENT ON COLUMN campaign_jobs.status IS 'e.g., Pending, Queued, Running, Completed, Failed, Retry';

-- =====================================================
-- DEFAULT DATA FOR PRODUCTION-READY SETUP
-- =====================================================

-- Insert default roles
INSERT INTO auth.roles (id, name, display_name, description, is_system_role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'super_admin', 'Super Administrator', 'Full system access with all permissions', true),
    ('00000000-0000-0000-0000-000000000002', 'admin', 'Administrator', 'Administrative access to most system features', true),
    ('00000000-0000-0000-0000-000000000003', 'user', 'Standard User', 'Standard user with basic access permissions', true),
    ('00000000-0000-0000-0000-000000000004', 'viewer', 'Viewer', 'Read-only access to system resources', true)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO auth.permissions (id, name, display_name, description, resource, action) VALUES
    ('00000000-0000-0000-0001-000000000001', 'campaigns:create', 'Create Campaigns', 'Create new campaigns', 'campaigns', 'create'),
    ('00000000-0000-0000-0001-000000000002', 'campaigns:read', 'Read Campaigns', 'View campaign details', 'campaigns', 'read'),
    ('00000000-0000-0000-0001-000000000003', 'campaigns:update', 'Update Campaigns', 'Modify existing campaigns', 'campaigns', 'update'),
    ('00000000-0000-0000-0001-000000000004', 'campaigns:delete', 'Delete Campaigns', 'Remove campaigns from system', 'campaigns', 'delete'),
    ('00000000-0000-0000-0001-000000000005', 'campaigns:execute', 'Execute Campaigns', 'Start and stop campaign execution', 'campaigns', 'execute'),
    ('00000000-0000-0000-0001-000000000006', 'personas:create', 'Create Personas', 'Create new validation personas', 'personas', 'create'),
    ('00000000-0000-0000-0001-000000000007', 'personas:read', 'Read Personas', 'View persona configurations', 'personas', 'read'),
    ('00000000-0000-0000-0001-000000000008', 'personas:update', 'Update Personas', 'Modify existing personas', 'personas', 'update'),
    ('00000000-0000-0000-0001-000000000009', 'personas:delete', 'Delete Personas', 'Remove personas from system', 'personas', 'delete'),
    ('00000000-0000-0000-0001-000000000010', 'proxies:create', 'Create Proxies', 'Add new proxy servers', 'proxies', 'create'),
    ('00000000-0000-0000-0001-000000000011', 'proxies:read', 'Read Proxies', 'View proxy configurations and status', 'proxies', 'read'),
    ('00000000-0000-0000-0001-000000000012', 'proxies:update', 'Update Proxies', 'Modify existing proxy settings', 'proxies', 'update'),
    ('00000000-0000-0000-0001-000000000013', 'proxies:delete', 'Delete Proxies', 'Remove proxy servers', 'proxies', 'delete'),
    ('00000000-0000-0000-0001-000000000014', 'system:admin', 'System Administration', 'Full administrative access to system', 'system', 'admin'),
    ('00000000-0000-0000-0001-000000000015', 'system:config', 'System Configuration', 'Modify system configuration settings', 'system', 'config'),
    ('00000000-0000-0000-0001-000000000016', 'users:manage', 'User Management', 'Create, update, and delete user accounts', 'users', 'manage'),
    ('00000000-0000-0000-0001-000000000017', 'reports:generate', 'Generate Reports', 'Generate and export system reports', 'reports', 'generate')
ON CONFLICT (resource, action) DO NOTHING;

-- Assign all permissions to super_admin role
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000001'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000002'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000003'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000004'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000005'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000006'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000007'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000008'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000009'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000010'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000011'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000012'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000013'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000014'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000015'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000016'),
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0001-000000000017')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign appropriate permissions to admin role
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000001'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000002'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000003'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000004'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000005'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000006'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000007'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000008'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000009'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000010'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000011'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000012'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000013'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000016'),
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0001-000000000017')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign basic permissions to user role
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000001'),
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000002'),
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000003'),
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000005'),
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000007'),
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0001-000000000011')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Assign read-only permissions to viewer role
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES
    ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000002'),
    ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000007'),
    ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0001-000000000011')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Insert default admin user (matches deploy-quick.sh credentials)
-- Email: admin@domainflow.local, Password: TempPassword123!
INSERT INTO auth.users (
    id,
    email,
    email_verified,
    password_hash,
    password_pepper_version,
    first_name,
    last_name,
    is_active,
    is_locked,
    failed_login_attempts,
    must_change_password
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@domainflow.local',
    true,
    crypt('TempPassword123!', gen_salt('bf', 12)),
    1,
    'System',
    'Administrator',
    true,
    false,
    0,
    true
) ON CONFLICT (email) DO NOTHING;

-- Assign super_admin role to default admin user
INSERT INTO auth.user_roles (user_id, role_id) VALUES
    ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Insert example regular user
-- Password: user123! (bcrypt hash with standard cost)
INSERT INTO auth.users (
    id,
    email,
    email_verified,
    password_hash,
    password_pepper_version,
    first_name,
    last_name,
    is_active,
    is_locked,
    failed_login_attempts,
    must_change_password
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    'user@domainflow.com',
    true,
    '$2a$12$4.5XY0w0Zz9lCKIjFJbTm.jJKvJPCMYdEzUYYKnqK3YnJWzCFUyN.',
    1,
    'Test',
    'User',
    true,
    false,
    0,
    false
) ON CONFLICT (email) DO NOTHING;

-- Assign user role to example user
INSERT INTO auth.user_roles (user_id, role_id) VALUES
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Insert default database admin user for easy database access
-- Email: dbadmin@domainflow.local, Password: dbpassword123!
INSERT INTO auth.users (
    id,
    email,
    email_verified,
    password_hash,
    password_pepper_version,
    first_name,
    last_name,
    is_active,
    is_locked,
    failed_login_attempts,
    must_change_password
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    'dbadmin@domainflow.local',
    true,
    crypt('dbpassword123!', gen_salt('bf', 12)),
    1,
    'Database',
    'Administrator',
    true,
    false,
    0,
    false
) ON CONFLICT (email) DO NOTHING;

-- Assign super_admin role to database admin user for full access
INSERT INTO auth.user_roles (user_id, role_id) VALUES
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Comments for default data
COMMENT ON TABLE auth.roles IS 'System roles with default setup: super_admin (full access), admin (administrative), user (standard), viewer (read-only)';
COMMENT ON TABLE auth.permissions IS 'System permissions covering all major resources: campaigns, personas, proxies, system, users, reports';
COMMENT ON TABLE auth.users IS 'Default users: admin@domainflow.local (TempPassword123!), user@domainflow.com (user123!), dbadmin@domainflow.local (dbpassword123!)';

-- =====================================================
-- POST-DEPLOYMENT VERIFICATION
-- =====================================================

-- Verify schema integrity
DO $$
DECLARE
    table_count INTEGER;
    user_count INTEGER;
    role_count INTEGER;
    permission_count INTEGER;
BEGIN
    -- Count major tables
    SELECT COUNT(*) INTO table_count FROM information_schema.tables 
    WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE';
    
    -- Count default data
    SELECT COUNT(*) INTO user_count FROM auth.users;
    SELECT COUNT(*) INTO role_count FROM auth.roles;
    SELECT COUNT(*) INTO permission_count FROM auth.permissions;
    
    RAISE NOTICE 'Schema deployment verification:';
    RAISE NOTICE '- Tables created: %', table_count;
    RAISE NOTICE '- Default users: %', user_count;
    RAISE NOTICE '- Default roles: %', role_count;
    RAISE NOTICE '- Default permissions: %', permission_count;
    
    IF table_count < 15 THEN
        RAISE EXCEPTION 'Schema deployment incomplete - insufficient tables created';
    END IF;
    
    IF user_count < 3 THEN
        RAISE EXCEPTION 'Default users not created properly';
    END IF;
    
    RAISE NOTICE 'Schema deployment successful!';
END $$;

-- =====================================================
-- END OF PRODUCTION SCHEMA v3.0
-- =====================================================
