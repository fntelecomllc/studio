-- Initial schema migration for DomainFlow

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Campaigns Table: Central table for all campaign types
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    campaign_type TEXT NOT NULL DEFAULT 'domain_generation' CHECK (campaign_type IN ('domain_generation', 'dns_validation', 'http_keyword_validation')),
    status TEXT NOT NULL,
    user_id TEXT,
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
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_type ON campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- Campaign Jobs Table
CREATE TABLE IF NOT EXISTS campaign_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    job_payload JSONB,
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    last_error TEXT,
    last_attempted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_server_id TEXT,
    next_execution_at TIMESTAMPTZ,
    locked_at TIMESTAMPTZ,
    locked_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_campaign_jobs_campaign_id ON campaign_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_status ON campaign_jobs(status);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_scheduled_at ON campaign_jobs(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_next_execution ON campaign_jobs(next_execution_at);

-- Domain Generation Parameters Table
CREATE TABLE IF NOT EXISTS domain_generation_campaign_params (
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    pattern_type TEXT NOT NULL,
    variable_length INT,
    character_set TEXT,
    constant_string TEXT,
    tld TEXT NOT NULL,
    num_domains_to_generate INT NOT NULL,
    total_possible_combinations BIGINT NOT NULL,
    current_offset BIGINT NOT NULL DEFAULT 0
);

-- Domain Generation Config State Table
CREATE TABLE IF NOT EXISTS domain_generation_config_states (
    config_hash TEXT PRIMARY KEY,
    last_offset BIGINT NOT NULL,
    config_details JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated Domains Table
CREATE TABLE IF NOT EXISTS generated_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_generation_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL,
    source_keyword TEXT,
    source_pattern TEXT,
    tld TEXT,
    offset_index BIGINT NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_generated_domains_campaign_name UNIQUE (domain_generation_campaign_id, domain_name)
);

-- Add indexes for generated_domains
CREATE INDEX IF NOT EXISTS idx_generated_domains_offset 
    ON generated_domains(domain_generation_campaign_id, offset_index);
CREATE INDEX IF NOT EXISTS idx_generated_domains_campaign_id ON generated_domains(domain_generation_campaign_id);
CREATE INDEX IF NOT EXISTS idx_generated_domains_name ON generated_domains(domain_name);

-- Personas Table (for DNS and HTTP configurations)
CREATE TABLE IF NOT EXISTS personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    persona_type TEXT NOT NULL,
    config_details JSONB NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_personas_name_type UNIQUE (name, persona_type)
);

CREATE INDEX IF NOT EXISTS idx_personas_type ON personas(persona_type);
CREATE INDEX IF NOT EXISTS idx_personas_is_enabled ON personas(is_enabled);

-- Keyword Sets Table
CREATE TABLE IF NOT EXISTS keyword_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- DNS Validation Campaign Parameters Table
CREATE TABLE IF NOT EXISTS dns_validation_campaign_params (
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    source_generation_campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    persona_ids UUID[] NOT NULL,
    rotation_interval_seconds INT DEFAULT 0,
    processing_speed_per_minute INT DEFAULT 0,
    batch_size INT DEFAULT 50 CHECK (batch_size > 0),
    retry_attempts INT DEFAULT 1 CHECK (retry_attempts >= 0),
    metadata JSONB
);

-- DNS Validation Results Table
CREATE TABLE IF NOT EXISTS dns_validation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dns_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    generated_domain_id UUID REFERENCES generated_domains(id) ON DELETE SET NULL,
    domain_name TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    dns_records JSONB,
    validated_by_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
    attempts INT DEFAULT 0,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dns_results_campaign_domain UNIQUE (dns_campaign_id, domain_name)
);

CREATE INDEX IF NOT EXISTS idx_dns_results_campaign_id ON dns_validation_results(dns_campaign_id);
CREATE INDEX IF NOT EXISTS idx_dns_results_domain_name ON dns_validation_results(domain_name);
CREATE INDEX IF NOT EXISTS idx_dns_results_status ON dns_validation_results(validation_status);

-- HTTP Keyword Campaign Parameters Table
CREATE TABLE IF NOT EXISTS http_keyword_campaign_params (
    campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    source_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    persona_ids UUID[] NOT NULL,
    keyword_set_ids UUID[] NOT NULL,
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
    metadata JSONB
);

-- Proxies Table
CREATE TABLE IF NOT EXISTS proxies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proxies_is_enabled ON proxies(is_enabled);

-- HTTP Keyword Results Table
CREATE TABLE IF NOT EXISTS http_keyword_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    http_keyword_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    dns_result_id UUID REFERENCES dns_validation_results(id) ON DELETE SET NULL,
    domain_name TEXT NOT NULL,
    validation_status TEXT NOT NULL,
    http_status_code INT,
    response_headers JSONB,
    page_title TEXT,
    extracted_content_snippet TEXT,
    found_keywords_from_sets JSONB,
    found_ad_hoc_keywords JSONB, -- In the Go model this is []string, so JSONB might be an issue if not handled. Assuming TEXT[] or JSONB array of strings.
    content_hash TEXT,
    validated_by_persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
    used_proxy_id UUID REFERENCES proxies(id) ON DELETE SET NULL,
    attempts INT NOT NULL DEFAULT 0,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_http_results_campaign_domain UNIQUE (http_keyword_campaign_id, domain_name)
);

-- FIXED: Correct column name in index below!
CREATE INDEX IF NOT EXISTS idx_http_results_campaign_id ON http_keyword_results(http_keyword_campaign_id);
CREATE INDEX IF NOT EXISTS idx_http_results_domain_name ON http_keyword_results(domain_name);
CREATE INDEX IF NOT EXISTS idx_http_results_status ON http_keyword_results(validation_status);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    details JSONB,
    client_ip TEXT,
    user_agent TEXT
);

-- Create a function to update the updated_at column
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update updated_at columns
DO $$
BEGIN
    -- Campaigns table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_campaigns') THEN
        CREATE TRIGGER set_timestamp_campaigns
        BEFORE UPDATE ON campaigns
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_timestamp();
    END IF;

    -- Personas table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_personas') THEN
        CREATE TRIGGER set_timestamp_personas
        BEFORE UPDATE ON personas
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_timestamp();
    END IF;

    -- Keyword sets table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_keyword_sets') THEN
        CREATE TRIGGER set_timestamp_keyword_sets
        BEFORE UPDATE ON keyword_sets
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_timestamp();
    END IF;

    -- Proxies table trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_timestamp_proxies') THEN
        CREATE TRIGGER set_timestamp_proxies
        BEFORE UPDATE ON proxies
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_timestamp();
    END IF;
END $$;