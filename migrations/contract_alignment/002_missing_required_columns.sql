-- Migration: 002_missing_required_columns.sql
-- Purpose: Add missing required columns identified in contract validation
-- Author: Contract Alignment Team
-- Date: 2025-06-20
-- Severity: CRITICAL - Required fields missing for domain generation

BEGIN;

-- Check if migration already applied
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '002_missing_required_columns') THEN
        RAISE EXCEPTION 'Migration 002_missing_required_columns already applied';
    END IF;
END $$;

-- 1. Add missing columns to domain_generation_params table
-- These fields are required by the Go backend but missing in database
DO $$
BEGIN
    -- Ensure domain_generation_params table exists
    CREATE TABLE IF NOT EXISTS public.domain_generation_params (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
        pattern_type TEXT NOT NULL,
        tld TEXT NOT NULL,
        constant_string TEXT,
        variable_length INTEGER NOT NULL CHECK (variable_length > 0),
        character_set TEXT NOT NULL,
        num_domains_to_generate INTEGER NOT NULL DEFAULT 1000 CHECK (num_domains_to_generate > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Add total_possible_combinations if not exists (critical for domain generation)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'domain_generation_params' 
        AND column_name = 'total_possible_combinations'
    ) THEN
        ALTER TABLE public.domain_generation_params 
        ADD COLUMN total_possible_combinations BIGINT NOT NULL DEFAULT 0;
    END IF;

    -- Add current_offset if not exists (critical for resumable generation)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'domain_generation_params' 
        AND column_name = 'current_offset'
    ) THEN
        ALTER TABLE public.domain_generation_params 
        ADD COLUMN current_offset BIGINT NOT NULL DEFAULT 0;
    END IF;
END $$;

-- 2. Add missing columns to http_keyword_params table
DO $$
BEGIN
    -- Ensure http_keyword_params table exists
    CREATE TABLE IF NOT EXISTS public.http_keyword_params (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
        target_url TEXT NOT NULL,
        keyword_set_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Add source_type if not exists (required enum field)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'http_keyword_params' 
        AND column_name = 'source_type'
    ) THEN
        ALTER TABLE public.http_keyword_params 
        ADD COLUMN source_type TEXT NOT NULL DEFAULT 'DomainGeneration' 
        CHECK (source_type IN ('DomainGeneration', 'DNSValidation'));
    END IF;

    -- Add source_campaign_id if not exists (links to source campaign)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'http_keyword_params' 
        AND column_name = 'source_campaign_id'
    ) THEN
        ALTER TABLE public.http_keyword_params 
        ADD COLUMN source_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Add missing columns to campaigns table for better tracking
DO $$
BEGIN
    -- Add estimated_completion_at if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'estimated_completion_at'
    ) THEN
        ALTER TABLE public.campaigns 
        ADD COLUMN estimated_completion_at TIMESTAMPTZ;
    END IF;

    -- Add avg_processing_rate if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'avg_processing_rate'
    ) THEN
        ALTER TABLE public.campaigns 
        ADD COLUMN avg_processing_rate DOUBLE PRECISION;
    END IF;

    -- Add last_heartbeat_at if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'last_heartbeat_at'
    ) THEN
        ALTER TABLE public.campaigns 
        ADD COLUMN last_heartbeat_at TIMESTAMPTZ;
    END IF;
END $$;

-- 4. Add missing user management tables (critical for admin functionality)
-- Create schema if not exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Ensure users table has required fields
DO $$
BEGIN
    -- Add must_change_password if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'must_change_password'
    ) THEN
        ALTER TABLE auth.users 
        ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    -- Add password_changed_at if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'password_changed_at'
    ) THEN
        ALTER TABLE auth.users 
        ADD COLUMN password_changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;

    -- Ensure last_login_ip is INET type (not just TEXT)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'last_login_ip'
        AND data_type = 'text'
    ) THEN
        -- First add temporary column
        ALTER TABLE auth.users ADD COLUMN last_login_ip_new INET;
        
        -- Copy and convert data
        UPDATE auth.users 
        SET last_login_ip_new = last_login_ip::INET 
        WHERE last_login_ip IS NOT NULL 
        AND last_login_ip ~ '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$';
        
        -- Drop old column and rename new
        ALTER TABLE auth.users DROP COLUMN last_login_ip;
        ALTER TABLE auth.users RENAME COLUMN last_login_ip_new TO last_login_ip;
    END IF;
END $$;

-- 5. Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_domain_gen_params_campaign_id ON public.domain_generation_params(campaign_id);
CREATE INDEX IF NOT EXISTS idx_http_keyword_params_campaign_id ON public.http_keyword_params(campaign_id);
CREATE INDEX IF NOT EXISTS idx_http_keyword_params_source_campaign_id ON public.http_keyword_params(source_campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_last_heartbeat ON public.campaigns(last_heartbeat_at) WHERE last_heartbeat_at IS NOT NULL;

-- 6. Add missing constraints
ALTER TABLE public.domain_generation_params
    ADD CONSTRAINT chk_offset_within_bounds 
    CHECK (current_offset >= 0 AND current_offset <= total_possible_combinations);

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('002_missing_required_columns', 'Add missing required columns for domain generation, HTTP keywords, and user management');

COMMIT;

-- Rollback procedure
-- To rollback this migration, run:
/*
BEGIN;

-- Remove constraints
ALTER TABLE public.domain_generation_params DROP CONSTRAINT IF EXISTS chk_offset_within_bounds;

-- Remove indexes
DROP INDEX IF EXISTS idx_domain_gen_params_campaign_id;
DROP INDEX IF EXISTS idx_http_keyword_params_campaign_id;
DROP INDEX IF EXISTS idx_http_keyword_params_source_campaign_id;
DROP INDEX IF EXISTS idx_campaigns_last_heartbeat;

-- Remove columns (only if safe - check for data first)
-- ALTER TABLE public.domain_generation_params DROP COLUMN IF EXISTS total_possible_combinations;
-- ALTER TABLE public.domain_generation_params DROP COLUMN IF EXISTS current_offset;
-- ALTER TABLE public.http_keyword_params DROP COLUMN IF EXISTS source_type;
-- ALTER TABLE public.http_keyword_params DROP COLUMN IF EXISTS source_campaign_id;
-- ALTER TABLE public.campaigns DROP COLUMN IF EXISTS estimated_completion_at;
-- ALTER TABLE public.campaigns DROP COLUMN IF EXISTS avg_processing_rate;
-- ALTER TABLE public.campaigns DROP COLUMN IF EXISTS last_heartbeat_at;
-- ALTER TABLE auth.users DROP COLUMN IF EXISTS must_change_password;
-- ALTER TABLE auth.users DROP COLUMN IF EXISTS password_changed_at;

-- Mark as rolled back
UPDATE public.schema_migrations 
SET rolled_back_at = NOW() 
WHERE version = '002_missing_required_columns';

COMMIT;
*/