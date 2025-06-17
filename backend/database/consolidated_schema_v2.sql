-- DomainFlow Consolidated Database Schema v2.0
-- Optimized Production-Ready PostgreSQL Schema
-- Consolidates migrations 000001-000017 with performance enhancements
-- Created: 2025-06-16

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =====================================================
-- AUTHENTICATION SCHEMA (auth.*)
-- =====================================================

-- Create auth schema for authentication system
CREATE SCHEMA IF NOT EXISTS auth;

-- Users table with comprehensive security features
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
    -- MFA support fields
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret_encrypted BYTEA,
    mfa_backup_codes_encrypted BYTEA,
    mfa_last_used_at TIMESTAMP,
    -- Additional security fields
    encrypted_fields JSONB DEFAULT '{}'::jsonb,
    security_questions_encrypted BYTEA,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Optimized indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email_active ON auth.users(email) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON auth.users(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON auth.users(email_verification_token) WHERE email_verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON auth.users(id) WHERE mfa_enabled = TRUE;

-- Sessions table - Enhanced for session-based authentication
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

-- High-performance indexes for session operations
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON auth.sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON auth.sessions(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON auth.sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_sessions_fingerprint ON auth.sessions(session_fingerprint) WHERE session_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_user_agent_hash ON auth.sessions(user_agent_hash) WHERE user_agent_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_ip_address ON auth.sessions(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_validation ON auth.sessions(id, is_active, expires_at, user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cleanup ON auth.sessions(is_active, expires_at) WHERE is_active = false OR expires_at < NOW();

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

CREATE INDEX IF NOT EXISTS idx_roles_name ON auth.roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_system ON auth.roles(is_system_role);

-- Permissions table with enhanced resource management
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

CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON auth.permissions(resource, action);
CREATE INDEX IF NOT EXISTS idx_permissions_name ON auth.permissions(name);

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
CREATE INDEX IF NOT EXISTS idx_user_roles_expires ON auth.user_roles(expires_at) WHERE expires_at IS NOT NULL;

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
CREATE INDEX IF NOT EXISTS idx_password_reset_unused ON auth.password_reset_tokens(expires_at) WHERE used_at IS NULL;

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

-- Partitioned indexes for audit log performance
CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth.auth_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_event_type ON auth.auth_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth.auth_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_auth_audit_risk_score ON auth.auth_audit_log(risk_score);
CREATE INDEX IF NOT EXISTS idx_auth_audit_session_fingerprint ON auth.auth_audit_log(session_fingerprint) WHERE session_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_audit_high_risk ON auth.auth_audit_log(created_at, risk_score) WHERE risk_score > 7;

-- Rate limiting table with enhanced strategy support
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
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup ON auth.rate_limits(window_start) WHERE blocked_until IS NULL;

-- =====================================================
-- APPLICATION SCHEMA (public.*)
-- =====================================================

-- Campaigns Table: Central table for all campaign types with enhanced metadata
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    campaign_type TEXT NOT NULL DEFAULT 'domain_generation' CHECK (campaign_type IN ('domain_generation', 'dns_validation', 'http_keyword_validation')),
    status TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Changed to UUID and proper reference
    total_items BIGINT DEFAULT 0,
    processed_items BIGINT DEFAULT 0,
    successful_items BIGINT DEFAULT 0,
    failed_items BIGINT DEFAULT 0,
    progress_percentage DOUBLE PRECISION DEFAULT 0.0,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    -- Performance and monitoring fields
    estimated_completion_at TIMESTAMPTZ,
    avg_processing_rate DOUBLE PRECISION,
    last_heartbeat_at TIMESTAMPTZ
);

-- Enhanced indexes for campaigns with performance optimization
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status_created ON campaigns(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_active_status ON campaigns(status, updated_at DESC) WHERE status IN ('pending', 'queued', 'running', 'paused');
CREATE INDEX IF NOT EXISTS idx_campaigns_completion_tracking ON campaigns(status, estimated_completion_at) WHERE status IN ('running', 'paused');

-- Domain Generation Parameters Table with enhanced validation
CREATE TABLE IF NOT EXISTS domain_generation_campaign_params (
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    pattern_type TEXT NOT NULL,
    variable_length INT,
    character_set TEXT,
    constant_string TEXT,
    tld TEXT NOT NULL,
    num_domains_to_generate INT NOT NULL,
    total_possible_combinations BIGINT NOT NULL,
    current_offset BIGINT NOT NULL DEFAULT 0,
    -- Performance tracking
    generation_rate_per_second DOUBLE PRECISION,
    estimated_completion_time INTERVAL,
    -- Validation constraints
    CONSTRAINT chk_positive_domains CHECK (num_domains_to_generate > 0),
    CONSTRAINT chk_positive_combinations CHECK (total_possible_combinations > 0),
    CONSTRAINT chk_valid_offset CHECK (current_offset >= 0),
    CONSTRAINT chk_valid_length CHECK (variable_length IS NULL OR variable_length > 0)
);

-- Generated Domains Table with partitioning support readiness
CREATE TABLE IF NOT EXISTS generated_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_generation_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL,
    source_keyword TEXT,
    source_pattern TEXT,
    tld TEXT,
    offset_index BIGINT NOT NULL DEFAULT 0,
    validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'error', 'skipped')),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Performance tracking
    generation_batch_id UUID,
    validation_attempts INTEGER DEFAULT 0,
    last_validation_at TIMESTAMPTZ,
    
    CONSTRAINT uq_generated_domains_campaign_name UNIQUE (domain_generation_campaign_id, domain_name)
);

-- High-performance indexes for generated domains
CREATE INDEX IF NOT EXISTS idx_generated_domains_offset ON generated_domains(domain_generation_campaign_id, offset_index);
CREATE INDEX IF NOT EXISTS idx_generated_domains_campaign_id ON generated_domains(domain_generation_campaign_id);
CREATE INDEX IF NOT EXISTS idx_generated_domains_name ON generated_domains(domain_name);
CREATE INDEX IF NOT EXISTS idx_generated_domains_status ON generated_domains(validation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_domains_batch ON generated_domains(generation_batch_id) WHERE generation_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generated_domains_validation_pending ON generated_domains(domain_generation_campaign_id, validation_status, created_at) WHERE validation_status = 'pending';

-- Domain Generation Config State Table with enhanced tracking
CREATE TABLE IF NOT EXISTS domain_generation_config_states (
    config_hash TEXT PRIMARY KEY,
    last_offset BIGINT NOT NULL,
    config_details JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generation_rate DOUBLE PRECISION,
    total_generated BIGINT DEFAULT 0,
    success_rate DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_config_states_updated ON domain_generation_config_states(updated_at DESC);

-- Personas Table with enhanced configuration validation
CREATE TABLE IF NOT EXISTS personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    persona_type TEXT NOT NULL CHECK (persona_type IN ('dns', 'http')),
    config_details JSONB NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Performance and monitoring
    last_used_at TIMESTAMPTZ,
    usage_count BIGINT DEFAULT 0,
    success_rate DOUBLE PRECISION,
    avg_response_time_ms INTEGER,
    
    CONSTRAINT uq_personas_name_type UNIQUE (name, persona_type)
);

-- Optimized indexes for personas
CREATE INDEX IF NOT EXISTS idx_personas_type ON personas(persona_type);
CREATE INDEX IF NOT EXISTS idx_personas_is_enabled ON personas(is_enabled);
CREATE INDEX IF NOT EXISTS idx_personas_type_enabled ON personas(persona_type, is_enabled) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_personas_performance ON personas(success_rate DESC, avg_response_time_ms ASC) WHERE is_enabled = TRUE;

-- Keyword Sets Table with enhanced rule management
CREATE TABLE IF NOT EXISTS keyword_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Usage tracking
    usage_count BIGINT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    match_success_rate DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_keyword_sets_enabled ON keyword_sets(is_enabled, created_at DESC) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_keyword_sets_name ON keyword_sets(name);
CREATE INDEX IF NOT EXISTS idx_keyword_sets_usage ON keyword_sets(usage_count DESC, last_used_at DESC) WHERE is_enabled = TRUE;

-- Keyword Rules Table (from migration 000006)
CREATE TABLE IF NOT EXISTS keyword_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_set_id UUID NOT NULL REFERENCES keyword_sets(id) ON DELETE CASCADE,
    pattern TEXT NOT NULL,
    rule_type TEXT NOT NULL CHECK (rule_type IN ('string', 'regex', 'case_insensitive')),
    weight DOUBLE PRECISION DEFAULT 1.0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keyword_rules_set_id ON keyword_rules(keyword_set_id);
CREATE INDEX IF NOT EXISTS idx_keyword_rules_active ON keyword_rules(is_active, rule_type);

-- DNS Validation Campaign Parameters Table
CREATE TABLE IF NOT EXISTS dns_validation_params (
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    source_generation_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    persona_ids UUID[] NOT NULL,
    rotation_interval_seconds INT DEFAULT 0,
    processing_speed_per_minute INT DEFAULT 0,
    batch_size INT DEFAULT 50 CHECK (batch_size > 0),
    retry_attempts INT DEFAULT 1 CHECK (retry_attempts >= 0),
    metadata JSONB,
    -- Performance optimization fields
    parallel_workers INT DEFAULT 1 CHECK (parallel_workers > 0),
    timeout_seconds INT DEFAULT 30 CHECK (timeout_seconds > 0)
);

-- DNS Validation Results Table with enhanced tracking
CREATE TABLE IF NOT EXISTS dns_validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dns_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    generated_domain_id UUID REFERENCES generated_domains(id) ON DELETE SET NULL,
    domain_name TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    dns_records JSONB,
    validated_by_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
    attempts INT DEFAULT 0,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Performance tracking
    response_time_ms INTEGER,
    error_details JSONB,
    resolver_ip INET,
    
    CONSTRAINT uq_dns_results_campaign_domain UNIQUE (dns_campaign_id, domain_name)
);

-- High-performance indexes for DNS validation
CREATE INDEX IF NOT EXISTS idx_dns_results_campaign_id ON dns_validation_results(dns_campaign_id);
CREATE INDEX IF NOT EXISTS idx_dns_results_domain_name ON dns_validation_results(domain_name);
CREATE INDEX IF NOT EXISTS idx_dns_results_status ON dns_validation_results(validation_status);
CREATE INDEX IF NOT EXISTS idx_dns_results_campaign_created ON dns_validation_results(dns_campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dns_results_performance ON dns_validation_results(validation_status, response_time_ms) WHERE response_time_ms IS NOT NULL;

-- HTTP Keyword Campaign Parameters Table
CREATE TABLE IF NOT EXISTS http_keyword_campaign_params (
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    source_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('DomainGeneration', 'DNSValidation')),
    persona_ids UUID[] NOT NULL,
    keyword_set_ids UUID[],
    ad_hoc_keywords TEXT[],
    proxy_ids UUID[],
    proxy_pool_id UUID,
    proxy_selection_strategy TEXT,
    rotation_interval_seconds INT DEFAULT 0,
    processing_speed_per_minute INT DEFAULT 0,
    batch_size INT DEFAULT 10 CHECK (batch_size > 0),
    retry_attempts INT DEFAULT 1 CHECK (retry_attempts >= 0),
    target_http_ports INT[],
    last_processed_domain_name TEXT,
    metadata JSONB,
    -- Enhanced configuration
    follow_redirects BOOLEAN DEFAULT TRUE,
    max_redirects INT DEFAULT 5,
    request_timeout_seconds INT DEFAULT 30
);

-- Proxies Table with enhanced health monitoring
CREATE TABLE IF NOT EXISTS proxies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    address TEXT NOT NULL UNIQUE,
    protocol TEXT,
    username TEXT,
    password_hash TEXT,
    host TEXT,
    port INT,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_healthy BOOLEAN NOT NULL DEFAULT TRUE,
    last_status TEXT,
    last_checked_at TIMESTAMPTZ,
    latency_ms INT,
    city TEXT,
    country_code TEXT,
    provider TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Enhanced monitoring
    success_rate DOUBLE PRECISION,
    total_requests BIGINT DEFAULT 0,
    failed_requests BIGINT DEFAULT 0,
    avg_response_time_ms INTEGER,
    last_error_message TEXT,
    consecutive_failures INT DEFAULT 0
);

-- Performance indexes for proxies
CREATE INDEX IF NOT EXISTS idx_proxies_is_enabled ON proxies(is_enabled);
CREATE INDEX IF NOT EXISTS idx_proxies_health ON proxies(is_healthy, is_enabled);
CREATE INDEX IF NOT EXISTS idx_proxies_performance ON proxies(success_rate DESC, avg_response_time_ms ASC) WHERE is_enabled = TRUE AND is_healthy = TRUE;
CREATE INDEX IF NOT EXISTS idx_proxies_country ON proxies(country_code, is_enabled) WHERE country_code IS NOT NULL;

-- HTTP Keyword Results Table with enhanced content analysis
CREATE TABLE IF NOT EXISTS http_keyword_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    http_keyword_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    dns_result_id UUID REFERENCES dns_validation_results(id) ON DELETE SET NULL,
    domain_name TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    http_status_code INT,
    response_headers JSONB,
    page_title TEXT,
    extracted_content_snippet TEXT,
    found_keywords_from_sets JSONB,
    found_ad_hoc_keywords JSONB,
    content_hash TEXT,
    validated_by_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
    used_proxy_id UUID REFERENCES proxies(id) ON DELETE SET NULL,
    attempts INT DEFAULT 0,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Enhanced analysis fields
    response_time_ms INTEGER,
    content_length BIGINT,
    final_url TEXT, -- In case of redirects
    redirect_count INT DEFAULT 0,
    ssl_cert_valid BOOLEAN,
    security_headers JSONB,
    
    CONSTRAINT uq_http_results_campaign_domain UNIQUE (http_keyword_campaign_id, domain_name)
);

-- High-performance indexes for HTTP results
CREATE INDEX IF NOT EXISTS idx_http_results_campaign_id ON http_keyword_results(http_keyword_campaign_id);
CREATE INDEX IF NOT EXISTS idx_http_results_domain_name ON http_keyword_results(domain_name);
CREATE INDEX IF NOT EXISTS idx_http_results_status ON http_keyword_results(validation_status);
CREATE INDEX IF NOT EXISTS idx_http_keyword_results_dns_result_id ON http_keyword_results(dns_result_id);
CREATE INDEX IF NOT EXISTS idx_http_results_campaign_created ON http_keyword_results(http_keyword_campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_http_results_performance ON http_keyword_results(validation_status, response_time_ms) WHERE response_time_ms IS NOT NULL;

-- Audit Logs Table with enhanced filtering
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    client_ip INET,
    user_agent TEXT,
    session_id VARCHAR(128),
    -- Enhanced fields
    resource_path TEXT,
    http_method TEXT,
    response_status INT,
    processing_time_ms INTEGER
);

-- Partitioned indexes for audit log performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id) WHERE session_id IS NOT NULL;

-- Campaign Jobs Table with enhanced job management
CREATE TABLE IF NOT EXISTS campaign_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts INT DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INT DEFAULT 3 CHECK (max_attempts > 0),
    last_attempted_at TIMESTAMPTZ,
    last_error TEXT,
    processing_server_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    job_payload JSONB,
    next_execution_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    -- Enhanced job management
    priority INT DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    timeout_seconds INT DEFAULT 3600,
    estimated_duration_seconds INT,
    actual_duration_seconds INT,
    resource_requirements JSONB -- CPU, memory, etc.
);

-- Enhanced indexes for campaign jobs
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_campaign_id ON campaign_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_status_scheduled_at ON campaign_jobs(status, scheduled_at ASC);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_type ON campaign_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_priority_queue ON campaign_jobs(priority DESC, scheduled_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_locked ON campaign_jobs(locked_at, locked_by) WHERE locked_at IS NOT NULL;

-- =====================================================
-- PERFORMANCE OPTIMIZATION: MATERIALIZED VIEWS
-- =====================================================

-- Enhanced Campaign Statistics Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS campaign_statistics AS
SELECT 
    c.id,
    c.user_id,
    c.campaign_type,
    c.status,
    c.created_at,
    c.started_at,
    c.completed_at,
    c.updated_at,
    COALESCE(c.total_items, 0) as total_items,
    COALESCE(c.processed_items, 0) as processed_items,
    COALESCE(c.progress_percentage, 0) as progress_percentage,
    
    -- Domain generation statistics
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.id IS NOT NULL) as total_domains,
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'valid') as valid_domains,
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'invalid') as invalid_domains,
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'pending') as pending_domains,
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'error') as error_domains,
    
    -- DNS validation statistics
    COUNT(DISTINCT dns.id) FILTER (WHERE dns.id IS NOT NULL) as total_dns_validations,
    COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'resolved') as dns_resolved,
    COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'unresolved') as dns_unresolved,
    AVG(dns.response_time_ms) FILTER (WHERE dns.response_time_ms IS NOT NULL) as avg_dns_response_time,
    
    -- HTTP validation statistics
    COUNT(DISTINCT http.id) FILTER (WHERE http.id IS NOT NULL) as total_http_validations,
    COUNT(DISTINCT http.id) FILTER (WHERE http.validation_status = 'success') as http_success,
    COUNT(DISTINCT http.id) FILTER (WHERE http.found_keywords_from_sets IS NOT NULL AND jsonb_array_length(http.found_keywords_from_sets) > 0) as http_keywords_found,
    AVG(http.response_time_ms) FILTER (WHERE http.response_time_ms IS NOT NULL) as avg_http_response_time,
    
    -- Performance metrics
    EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.created_at)) as duration_seconds,
    CASE 
        WHEN c.processed_items > 0 AND c.completed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (c.completed_at - COALESCE(c.started_at, c.created_at))) / c.processed_items
        ELSE NULL
    END as avg_processing_time_per_item,
    
    -- Resource utilization
    COUNT(DISTINCT cj.id) FILTER (WHERE cj.status IN ('running', 'pending')) as active_jobs,
    MAX(gd.offset_index) as max_domain_offset,
    MIN(gd.created_at) as first_domain_created_at,
    MAX(gd.created_at) as last_domain_created_at

FROM campaigns c
LEFT JOIN generated_domains gd ON gd.domain_generation_campaign_id = c.id
LEFT JOIN dns_validation_results dns ON dns.dns_campaign_id = c.id
LEFT JOIN http_keyword_results http ON http.http_keyword_campaign_id = c.id
LEFT JOIN campaign_jobs cj ON cj.campaign_id = c.id
GROUP BY c.id, c.user_id, c.campaign_type, c.status, c.created_at, c.started_at, c.completed_at, 
         c.updated_at, c.total_items, c.processed_items, c.progress_percentage;

-- Indexes for materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_statistics_id ON campaign_statistics(id);
CREATE INDEX IF NOT EXISTS idx_campaign_statistics_user_created ON campaign_statistics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_statistics_status_created ON campaign_statistics(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_statistics_type_created ON campaign_statistics(campaign_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_statistics_performance ON campaign_statistics(avg_processing_time_per_item ASC, progress_percentage DESC) WHERE status IN ('running', 'completed');

-- User Activity Summary Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS user_activity_summary AS
SELECT 
    u.id as user_id,
    u.email,
    u.first_name,
    u.last_name,
    u.is_active,
    u.last_login_at,
    COUNT(DISTINCT c.id) as total_campaigns,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'completed') as completed_campaigns,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status IN ('running', 'pending', 'queued')) as active_campaigns,
    COUNT(DISTINCT s.id) as active_sessions,
    COUNT(DISTINCT aal.id) FILTER (WHERE aal.created_at > NOW() - INTERVAL '30 days') as recent_logins,
    MAX(c.created_at) as last_campaign_created_at,
    SUM(c.processed_items) as total_processed_items
FROM auth.users u
LEFT JOIN campaigns c ON c.user_id = u.id
LEFT JOIN auth.sessions s ON s.user_id = u.id AND s.is_active = TRUE AND s.expires_at > NOW()
LEFT JOIN auth.auth_audit_log aal ON aal.user_id = u.id AND aal.event_type = 'login' AND aal.event_status = 'success'
GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_active, u.last_login_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_activity_user_id ON user_activity_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_last_login ON user_activity_summary(last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_campaigns ON user_activity_summary(total_campaigns DESC, completed_campaigns DESC);

-- System Performance Summary Materialized View
CREATE MATERIALIZED VIEW IF NOT EXISTS system_performance_summary AS
SELECT 
    DATE_TRUNC('hour', NOW()) as snapshot_time,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'running') as running_campaigns,
    COUNT(DISTINCT c.id) FILTER (WHERE c.created_at > NOW() - INTERVAL '24 hours') as campaigns_last_24h,
    COUNT(DISTINCT s.id) as active_sessions,
    COUNT(DISTINCT u.id) FILTER (WHERE u.last_login_at > NOW() - INTERVAL '1 hour') as active_users_last_hour,
    AVG(cs.avg_processing_time_per_item) FILTER (WHERE cs.status = 'running') as avg_processing_rate,
    COUNT(DISTINCT cj.id) FILTER (WHERE cj.status = 'pending') as pending_jobs,
    COUNT(DISTINCT cj.id) FILTER (WHERE cj.status = 'running') as running_jobs,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_healthy = TRUE AND p.is_enabled = TRUE) as healthy_proxies,
    AVG(p.success_rate) FILTER (WHERE p.is_enabled = TRUE) as avg_proxy_success_rate
FROM campaigns c
LEFT JOIN campaign_statistics cs ON cs.id = c.id
LEFT JOIN auth.sessions s ON s.is_active = TRUE AND s.expires_at > NOW()
LEFT JOIN auth.users u ON u.is_active = TRUE
LEFT JOIN campaign_jobs cj ON TRUE
LEFT JOIN proxies p ON TRUE;

CREATE INDEX IF NOT EXISTS idx_system_performance_snapshot ON system_performance_summary(snapshot_time DESC);