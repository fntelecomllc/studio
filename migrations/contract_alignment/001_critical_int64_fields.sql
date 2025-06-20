-- Migration: 001_critical_int64_fields.sql
-- Purpose: Ensure all int64 fields in Go backend are properly mapped to BIGINT in PostgreSQL
-- Author: Contract Alignment Team
-- Date: 2025-06-20
-- Severity: CRITICAL - Prevents numeric overflow for values > 2^53

BEGIN;

-- Create migration tracking table if not exists
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rolled_back_at TIMESTAMPTZ,
    description TEXT
);

-- Check if migration already applied
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '001_critical_int64_fields') THEN
        RAISE EXCEPTION 'Migration 001_critical_int64_fields already applied';
    END IF;
END $$;

-- 1. Campaign table int64 fields
-- Ensure all counter fields are BIGINT (may already be correct, but making idempotent)
ALTER TABLE public.campaigns 
    ALTER COLUMN total_items TYPE BIGINT USING total_items::BIGINT,
    ALTER COLUMN processed_items TYPE BIGINT USING processed_items::BIGINT,
    ALTER COLUMN successful_items TYPE BIGINT USING successful_items::BIGINT,
    ALTER COLUMN failed_items TYPE BIGINT USING failed_items::BIGINT;

-- Ensure proper defaults
ALTER TABLE public.campaigns 
    ALTER COLUMN total_items SET DEFAULT 0,
    ALTER COLUMN processed_items SET DEFAULT 0,
    ALTER COLUMN successful_items SET DEFAULT 0,
    ALTER COLUMN failed_items SET DEFAULT 0;

-- 2. Domain generation parameters table
-- Check if domain_generation_params exists and has the required fields
DO $$
BEGIN
    -- Add total_possible_combinations if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'domain_generation_params' 
        AND column_name = 'total_possible_combinations'
    ) THEN
        ALTER TABLE public.domain_generation_params 
        ADD COLUMN total_possible_combinations BIGINT NOT NULL DEFAULT 0;
    ELSE
        -- Ensure it's BIGINT if it exists
        ALTER TABLE public.domain_generation_params 
        ALTER COLUMN total_possible_combinations TYPE BIGINT USING total_possible_combinations::BIGINT;
    END IF;

    -- Add current_offset if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'domain_generation_params' 
        AND column_name = 'current_offset'
    ) THEN
        ALTER TABLE public.domain_generation_params 
        ADD COLUMN current_offset BIGINT NOT NULL DEFAULT 0;
    ELSE
        -- Ensure it's BIGINT if it exists
        ALTER TABLE public.domain_generation_params 
        ALTER COLUMN current_offset TYPE BIGINT USING current_offset::BIGINT;
    END IF;
END $$;

-- 3. Generated domains table
-- Ensure offset_index is BIGINT
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'generated_domains' 
        AND column_name = 'offset_index'
    ) THEN
        ALTER TABLE public.generated_domains 
        ALTER COLUMN offset_index TYPE BIGINT USING offset_index::BIGINT;
    END IF;
END $$;

-- 4. Campaign jobs table (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'campaign_jobs'
    ) THEN
        -- Ensure batch-related counters are BIGINT
        ALTER TABLE public.campaign_jobs 
        ALTER COLUMN items_in_batch TYPE BIGINT USING items_in_batch::BIGINT,
        ALTER COLUMN successful_items TYPE BIGINT USING successful_items::BIGINT,
        ALTER COLUMN failed_items TYPE BIGINT USING failed_items::BIGINT;
    END IF;
END $$;

-- 5. Add constraints to ensure data integrity
ALTER TABLE public.campaigns
    ADD CONSTRAINT chk_campaign_items_non_negative 
    CHECK (
        total_items >= 0 AND 
        processed_items >= 0 AND 
        successful_items >= 0 AND 
        failed_items >= 0
    );

ALTER TABLE public.domain_generation_params
    ADD CONSTRAINT chk_domain_gen_values_non_negative 
    CHECK (
        total_possible_combinations >= 0 AND 
        current_offset >= 0 AND 
        current_offset <= total_possible_combinations
    );

-- Create indexes for performance on large int64 values
CREATE INDEX IF NOT EXISTS idx_campaigns_total_items ON public.campaigns(total_items) WHERE total_items > 0;
CREATE INDEX IF NOT EXISTS idx_campaigns_processed_items ON public.campaigns(processed_items) WHERE processed_items > 0;
CREATE INDEX IF NOT EXISTS idx_domain_gen_offset ON public.domain_generation_params(current_offset);

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('001_critical_int64_fields', 'Ensure all int64 fields are BIGINT to prevent numeric overflow');

COMMIT;

-- Rollback procedure
-- To rollback this migration, run:
/*
BEGIN;

-- Remove constraints
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS chk_campaign_items_non_negative;
ALTER TABLE public.domain_generation_params DROP CONSTRAINT IF EXISTS chk_domain_gen_values_non_negative;

-- Remove indexes
DROP INDEX IF EXISTS idx_campaigns_total_items;
DROP INDEX IF EXISTS idx_campaigns_processed_items;
DROP INDEX IF EXISTS idx_domain_gen_offset;

-- Note: We don't revert BIGINT back to INTEGER as that could cause data loss
-- The BIGINT type is backward compatible with INTEGER values

-- Mark as rolled back
UPDATE public.schema_migrations 
SET rolled_back_at = NOW() 
WHERE version = '001_critical_int64_fields';

COMMIT;
*/