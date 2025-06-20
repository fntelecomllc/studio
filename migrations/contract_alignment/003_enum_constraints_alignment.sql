-- Migration: 003_enum_constraints_alignment.sql
-- Purpose: Align enum constraints between backend and database, fix case sensitivity issues
-- Author: Contract Alignment Team
-- Date: 2025-06-20
-- Severity: HIGH - Enum mismatches cause functional failures

BEGIN;

-- Check if migration already applied
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '003_enum_constraints_alignment') THEN
        RAISE EXCEPTION 'Migration 003_enum_constraints_alignment already applied';
    END IF;
END $$;

-- 1. Fix Campaign Status Enum (remove 'archived' if exists in data, update constraint)
DO $$
BEGIN
    -- First, check if any campaigns have 'archived' status
    IF EXISTS (SELECT 1 FROM public.campaigns WHERE status = 'archived') THEN
        -- Move archived campaigns to 'completed' status with metadata
        UPDATE public.campaigns 
        SET 
            status = 'completed',
            metadata = COALESCE(metadata, '{}'::jsonb) || '{"archived": true, "archived_at": "' || NOW()::text || '", "previous_status": "archived"}'::jsonb
        WHERE status = 'archived';
        
        RAISE NOTICE 'Migrated % campaigns from archived to completed status', (SELECT COUNT(*) FROM public.campaigns WHERE status = 'archived');
    END IF;

    -- Drop existing constraint if exists
    ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
    
    -- Add proper constraint matching Go backend enum
    ALTER TABLE public.campaigns 
    ADD CONSTRAINT campaigns_status_check 
    CHECK (status IN ('pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled'));
END $$;

-- 2. Fix Campaign Type Enum (remove deprecated 'keyword_validate')
DO $$
BEGIN
    -- Check if any campaigns use deprecated 'keyword_validate' type
    IF EXISTS (SELECT 1 FROM public.campaigns WHERE campaign_type = 'keyword_validate') THEN
        -- Update to proper type
        UPDATE public.campaigns 
        SET campaign_type = 'http_keyword_validation'
        WHERE campaign_type = 'keyword_validate';
        
        RAISE NOTICE 'Migrated % campaigns from keyword_validate to http_keyword_validation', (SELECT COUNT(*) FROM public.campaigns WHERE campaign_type = 'keyword_validate');
    END IF;

    -- Drop existing constraint if exists
    ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_campaign_type_check;
    
    -- Add proper constraint matching Go backend enum
    ALTER TABLE public.campaigns 
    ADD CONSTRAINT campaigns_campaign_type_check 
    CHECK (campaign_type IN ('domain_generation', 'dns_validation', 'http_keyword_validation'));
END $$;

-- 3. Fix HTTP Source Type Enum (enforce PascalCase)
DO $$
BEGIN
    -- Fix case sensitivity in http_keyword_params source_type
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'http_keyword_params' 
               AND column_name = 'source_type') THEN
        
        -- Update snake_case to PascalCase
        UPDATE public.http_keyword_params 
        SET source_type = 'DomainGeneration'
        WHERE LOWER(source_type) IN ('domain_generation', 'domaingeneration');
        
        UPDATE public.http_keyword_params 
        SET source_type = 'DNSValidation'
        WHERE LOWER(source_type) IN ('dns_validation', 'dnsvalidation');
        
        -- Drop existing constraint if exists
        ALTER TABLE public.http_keyword_params DROP CONSTRAINT IF EXISTS http_keyword_params_source_type_check;
        
        -- Add proper constraint with exact case matching Go backend
        ALTER TABLE public.http_keyword_params 
        ADD CONSTRAINT http_keyword_params_source_type_check 
        CHECK (source_type IN ('DomainGeneration', 'DNSValidation'));
    END IF;
END $$;

-- 4. Fix Persona Type Enum
DO $$
BEGIN
    -- Ensure persona type constraint exists and is correct
    ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_persona_type_check;
    
    ALTER TABLE public.personas 
    ADD CONSTRAINT personas_persona_type_check 
    CHECK (persona_type IN ('dns', 'http'));
END $$;

-- 5. Fix Proxy Protocol Enum
DO $$
BEGIN
    -- Ensure proxy protocol constraint exists
    ALTER TABLE public.proxies DROP CONSTRAINT IF EXISTS proxies_protocol_check;
    
    ALTER TABLE public.proxies 
    ADD CONSTRAINT proxies_protocol_check 
    CHECK (protocol IN ('http', 'https', 'socks5', 'socks4'));
END $$;

-- 6. Add Domain Generation Pattern Type Enum
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'domain_generation_params' 
               AND column_name = 'pattern_type') THEN
        
        -- Drop existing constraint if exists
        ALTER TABLE public.domain_generation_params DROP CONSTRAINT IF EXISTS domain_generation_params_pattern_type_check;
        
        -- Add proper constraint
        ALTER TABLE public.domain_generation_params 
        ADD CONSTRAINT domain_generation_params_pattern_type_check 
        CHECK (pattern_type IN ('fixed', 'variable', 'hybrid'));
    END IF;
END $$;

-- 7. Add Job Status Enum for campaign_jobs table
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_schema = 'public' 
               AND table_name = 'campaign_jobs') THEN
        
        -- Drop existing constraint if exists
        ALTER TABLE public.campaign_jobs DROP CONSTRAINT IF EXISTS campaign_jobs_status_check;
        
        -- Add proper constraint
        ALTER TABLE public.campaign_jobs 
        ADD CONSTRAINT campaign_jobs_status_check 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying'));
    END IF;
END $$;

-- 8. Create enum validation function for runtime checks
CREATE OR REPLACE FUNCTION public.validate_enum_value(
    enum_type TEXT,
    value TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    valid_values TEXT[];
BEGIN
    CASE enum_type
        WHEN 'campaign_status' THEN
            valid_values := ARRAY['pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled'];
        WHEN 'campaign_type' THEN
            valid_values := ARRAY['domain_generation', 'dns_validation', 'http_keyword_validation'];
        WHEN 'http_source_type' THEN
            valid_values := ARRAY['DomainGeneration', 'DNSValidation'];
        WHEN 'persona_type' THEN
            valid_values := ARRAY['dns', 'http'];
        WHEN 'proxy_protocol' THEN
            valid_values := ARRAY['http', 'https', 'socks5', 'socks4'];
        WHEN 'pattern_type' THEN
            valid_values := ARRAY['fixed', 'variable', 'hybrid'];
        WHEN 'job_status' THEN
            valid_values := ARRAY['pending', 'processing', 'completed', 'failed', 'retrying'];
        ELSE
            RETURN FALSE;
    END CASE;
    
    RETURN value = ANY(valid_values);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 9. Create trigger to log enum validation failures for monitoring
CREATE TABLE IF NOT EXISTS public.enum_validation_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    invalid_value TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    context JSONB
);

-- 10. Add comments documenting valid enum values
COMMENT ON COLUMN public.campaigns.status IS 'Valid values: pending, queued, running, pausing, paused, completed, failed, cancelled';
COMMENT ON COLUMN public.campaigns.campaign_type IS 'Valid values: domain_generation, dns_validation, http_keyword_validation';
COMMENT ON COLUMN public.http_keyword_params.source_type IS 'Valid values: DomainGeneration, DNSValidation (PascalCase required)';
COMMENT ON COLUMN public.personas.persona_type IS 'Valid values: dns, http';
COMMENT ON COLUMN public.proxies.protocol IS 'Valid values: http, https, socks5, socks4';

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('003_enum_constraints_alignment', 'Align enum constraints with Go backend, fix case sensitivity issues');

COMMIT;

-- Rollback procedure
-- To rollback this migration, run:
/*
BEGIN;

-- Remove constraints
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_campaign_type_check;
ALTER TABLE public.http_keyword_params DROP CONSTRAINT IF EXISTS http_keyword_params_source_type_check;
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_persona_type_check;
ALTER TABLE public.proxies DROP CONSTRAINT IF EXISTS proxies_protocol_check;
ALTER TABLE public.domain_generation_params DROP CONSTRAINT IF EXISTS domain_generation_params_pattern_type_check;
ALTER TABLE public.campaign_jobs DROP CONSTRAINT IF EXISTS campaign_jobs_status_check;

-- Drop validation function
DROP FUNCTION IF EXISTS public.validate_enum_value(TEXT, TEXT);

-- Drop validation failures table
DROP TABLE IF EXISTS public.enum_validation_failures;

-- Remove comments
COMMENT ON COLUMN public.campaigns.status IS NULL;
COMMENT ON COLUMN public.campaigns.campaign_type IS NULL;
COMMENT ON COLUMN public.http_keyword_params.source_type IS NULL;
COMMENT ON COLUMN public.personas.persona_type IS NULL;
COMMENT ON COLUMN public.proxies.protocol IS NULL;

-- Mark as rolled back
UPDATE public.schema_migrations 
SET rolled_back_at = NOW() 
WHERE version = '003_enum_constraints_alignment';

COMMIT;
*/