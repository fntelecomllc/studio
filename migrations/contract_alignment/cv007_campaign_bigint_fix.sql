-- Migration: CV-007 Campaign BIGINT Fix
-- Purpose: Convert campaign counter columns from INTEGER to BIGINT to match Go int64 backend types
-- Issue: CV-007 - Database Column total_items Type Mismatch
-- Author: Contract Alignment Team
-- Date: 2025-06-20
-- Severity: CRITICAL - Prevents numeric overflow for values > 2.1 billion

BEGIN;

-- Create migration tracking table if not exists (idempotent)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rolled_back_at TIMESTAMPTZ,
    description TEXT
);

-- Function to check column data type
CREATE OR REPLACE FUNCTION check_column_type(
    p_table_name TEXT,
    p_column_name TEXT,
    p_expected_type TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_data_type TEXT;
BEGIN
    SELECT data_type INTO v_data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = p_table_name
    AND column_name = p_column_name;
    
    RETURN v_data_type = p_expected_type;
END;
$$ LANGUAGE plpgsql;

-- Check if migration is needed
DO $$
DECLARE
    v_needs_migration BOOLEAN := FALSE;
BEGIN
    -- Check if any of the columns are still INTEGER
    IF NOT check_column_type('campaigns', 'total_items', 'bigint') OR
       NOT check_column_type('campaigns', 'processed_items', 'bigint') OR
       NOT check_column_type('campaigns', 'successful_items', 'bigint') OR
       NOT check_column_type('campaigns', 'failed_items', 'bigint') THEN
        v_needs_migration := TRUE;
    END IF;

    -- Only proceed if migration is needed
    IF v_needs_migration THEN
        -- Log migration start
        RAISE NOTICE 'CV-007: Starting INTEGER to BIGINT conversion for campaigns table';
        
        -- 1. Drop existing constraints if they exist (to avoid conflicts)
        ALTER TABLE public.campaigns
            DROP CONSTRAINT IF EXISTS chk_campaign_items_non_negative;
        
        -- 2. Convert INTEGER columns to BIGINT
        -- Using conditional logic to only alter columns that need it
        IF NOT check_column_type('campaigns', 'total_items', 'bigint') THEN
            ALTER TABLE public.campaigns 
                ALTER COLUMN total_items TYPE BIGINT USING total_items::BIGINT;
            RAISE NOTICE 'CV-007: Converted total_items to BIGINT';
        END IF;
        
        IF NOT check_column_type('campaigns', 'processed_items', 'bigint') THEN
            ALTER TABLE public.campaigns 
                ALTER COLUMN processed_items TYPE BIGINT USING processed_items::BIGINT;
            RAISE NOTICE 'CV-007: Converted processed_items to BIGINT';
        END IF;
        
        IF NOT check_column_type('campaigns', 'successful_items', 'bigint') THEN
            ALTER TABLE public.campaigns 
                ALTER COLUMN successful_items TYPE BIGINT USING successful_items::BIGINT;
            RAISE NOTICE 'CV-007: Converted successful_items to BIGINT';
        END IF;
        
        IF NOT check_column_type('campaigns', 'failed_items', 'bigint') THEN
            ALTER TABLE public.campaigns 
                ALTER COLUMN failed_items TYPE BIGINT USING failed_items::BIGINT;
            RAISE NOTICE 'CV-007: Converted failed_items to BIGINT';
        END IF;
        
        -- 3. Ensure proper defaults (idempotent)
        ALTER TABLE public.campaigns 
            ALTER COLUMN total_items SET DEFAULT 0,
            ALTER COLUMN processed_items SET DEFAULT 0,
            ALTER COLUMN successful_items SET DEFAULT 0,
            ALTER COLUMN failed_items SET DEFAULT 0;
        
        -- 4. Re-add the constraint to ensure data integrity
        ALTER TABLE public.campaigns
            ADD CONSTRAINT chk_campaign_items_non_negative 
            CHECK (
                total_items >= 0 AND 
                processed_items >= 0 AND 
                successful_items >= 0 AND 
                failed_items >= 0
            );
        
        -- 5. Also check and fix campaign_jobs table if it exists
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'campaign_jobs'
        ) THEN
            -- Check and convert campaign_jobs columns
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'campaign_jobs' 
                AND column_name = 'items_in_batch'
                AND data_type != 'bigint'
            ) THEN
                ALTER TABLE public.campaign_jobs 
                    ALTER COLUMN items_in_batch TYPE BIGINT USING items_in_batch::BIGINT;
                RAISE NOTICE 'CV-007: Converted campaign_jobs.items_in_batch to BIGINT';
            END IF;
            
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'campaign_jobs' 
                AND column_name = 'successful_items'
                AND data_type != 'bigint'
            ) THEN
                ALTER TABLE public.campaign_jobs 
                    ALTER COLUMN successful_items TYPE BIGINT USING successful_items::BIGINT;
                RAISE NOTICE 'CV-007: Converted campaign_jobs.successful_items to BIGINT';
            END IF;
            
            IF EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'campaign_jobs' 
                AND column_name = 'failed_items'
                AND data_type != 'bigint'
            ) THEN
                ALTER TABLE public.campaign_jobs 
                    ALTER COLUMN failed_items TYPE BIGINT USING failed_items::BIGINT;
                RAISE NOTICE 'CV-007: Converted campaign_jobs.failed_items to BIGINT';
            END IF;
        END IF;
        
        -- 6. Create indexes for performance (idempotent)
        CREATE INDEX IF NOT EXISTS idx_campaigns_total_items 
            ON public.campaigns(total_items) 
            WHERE total_items > 0;
            
        CREATE INDEX IF NOT EXISTS idx_campaigns_processed_items 
            ON public.campaigns(processed_items) 
            WHERE processed_items > 0;
        
        -- Record successful migration
        INSERT INTO public.schema_migrations (version, description) 
        VALUES ('cv007_campaign_bigint_fix', 'CV-007: Convert campaign counter columns from INTEGER to BIGINT')
        ON CONFLICT (version) DO UPDATE 
        SET applied_at = NOW(),
            rolled_back_at = NULL,
            description = EXCLUDED.description;
        
        RAISE NOTICE 'CV-007: Migration completed successfully';
    ELSE
        RAISE NOTICE 'CV-007: All columns are already BIGINT - no migration needed';
        
        -- Still record that we checked
        INSERT INTO public.schema_migrations (version, description) 
        VALUES ('cv007_campaign_bigint_fix', 'CV-007: Verified all campaign counter columns are BIGINT (no changes needed)')
        ON CONFLICT (version) DO UPDATE 
        SET applied_at = NOW(),
            rolled_back_at = NULL,
            description = EXCLUDED.description;
    END IF;
END $$;

-- Clean up the temporary function
DROP FUNCTION IF EXISTS check_column_type(TEXT, TEXT, TEXT);

COMMIT;

-- =====================================================
-- ROLLBACK PROCEDURE
-- =====================================================
-- To rollback this migration, execute the following:
-- Note: Rolling back from BIGINT to INTEGER may cause data loss if values exceed INTEGER range!

/*
BEGIN;

-- Remove constraints
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS chk_campaign_items_non_negative;

-- Remove indexes
DROP INDEX IF EXISTS idx_campaigns_total_items;
DROP INDEX IF EXISTS idx_campaigns_processed_items;

-- CAUTION: Converting back to INTEGER will fail if any values exceed 2,147,483,647
-- First check if it's safe to rollback
DO $$
DECLARE
    v_max_value BIGINT;
BEGIN
    SELECT GREATEST(
        COALESCE(MAX(total_items), 0),
        COALESCE(MAX(processed_items), 0),
        COALESCE(MAX(successful_items), 0),
        COALESCE(MAX(failed_items), 0)
    ) INTO v_max_value
    FROM public.campaigns;
    
    IF v_max_value > 2147483647 THEN
        RAISE EXCEPTION 'Cannot rollback: Campaign values exceed INTEGER range (max value: %)', v_max_value;
    END IF;
END $$;

-- If safe, convert back to INTEGER (NOT RECOMMENDED)
ALTER TABLE public.campaigns 
    ALTER COLUMN total_items TYPE INTEGER USING total_items::INTEGER,
    ALTER COLUMN processed_items TYPE INTEGER USING processed_items::INTEGER,
    ALTER COLUMN successful_items TYPE INTEGER USING successful_items::INTEGER,
    ALTER COLUMN failed_items TYPE INTEGER USING failed_items::INTEGER;

-- Mark as rolled back
UPDATE public.schema_migrations 
SET rolled_back_at = NOW() 
WHERE version = 'cv007_campaign_bigint_fix';

COMMIT;
*/

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries to verify the migration:

/*
-- 1. Check column data types
SELECT 
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'campaigns'
AND column_name IN ('total_items', 'processed_items', 'successful_items', 'failed_items')
ORDER BY column_name;

-- 2. Check constraints
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.campaigns'::regclass
AND conname = 'chk_campaign_items_non_negative';

-- 3. Check indexes
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'campaigns'
AND indexname IN ('idx_campaigns_total_items', 'idx_campaigns_processed_items');

-- 4. Check migration status
SELECT * FROM public.schema_migrations WHERE version = 'cv007_campaign_bigint_fix';
*/