-- Migration: 001_critical_type_alignments.sql
-- Purpose: Fix integer overflow risks and align numeric types with Go backend
-- Risk Level: CRITICAL
-- Rollback: Included at end of file
-- 
-- This migration addresses the critical int64 type mismatches identified in Phase 4
-- Backend uses int64, database uses bigint, frontend must handle SafeBigInt

BEGIN;

-- Add safety check for existing data
DO $$
DECLARE
    max_value bigint;
BEGIN
    -- Check if any values exceed JavaScript's safe integer range (2^53 - 1)
    SELECT GREATEST(
        COALESCE((SELECT MAX(total_items) FROM campaigns), 0),
        COALESCE((SELECT MAX(processed_items) FROM campaigns), 0),
        COALESCE((SELECT MAX(successful_items) FROM campaigns), 0),
        COALESCE((SELECT MAX(failed_items) FROM campaigns), 0),
        COALESCE((SELECT MAX(offset_index) FROM generated_domains), 0),
        COALESCE((SELECT MAX(total_possible_combinations) FROM domain_generation_campaign_params), 0),
        COALESCE((SELECT MAX(current_offset) FROM domain_generation_campaign_params), 0)
    ) INTO max_value;
    
    IF max_value > 9007199254740991 THEN
        RAISE WARNING 'Found values exceeding JavaScript safe integer range: %', max_value;
        -- Note: This is a warning, not an error, as the backend can handle it
    END IF;
END $$;

-- 1. Add CHECK constraints to ensure non-negative values for counter fields
ALTER TABLE campaigns 
    ADD CONSTRAINT chk_campaigns_total_items_non_negative 
    CHECK (total_items >= 0),
    ADD CONSTRAINT chk_campaigns_processed_items_non_negative 
    CHECK (processed_items >= 0),
    ADD CONSTRAINT chk_campaigns_successful_items_non_negative 
    CHECK (successful_items >= 0),
    ADD CONSTRAINT chk_campaigns_failed_items_non_negative 
    CHECK (failed_items >= 0);

-- 2. Add CHECK constraint for progress percentage
ALTER TABLE campaigns
    ADD CONSTRAINT chk_campaigns_progress_percentage_range
    CHECK (progress_percentage IS NULL OR (progress_percentage >= 0 AND progress_percentage <= 100));

-- 3. Add CHECK constraints for domain generation params
ALTER TABLE domain_generation_campaign_params
    ADD CONSTRAINT chk_domain_gen_total_combinations_positive
    CHECK (total_possible_combinations > 0),
    ADD CONSTRAINT chk_domain_gen_current_offset_non_negative
    CHECK (current_offset >= 0),
    ADD CONSTRAINT chk_domain_gen_num_domains_positive
    CHECK (num_domains_to_generate > 0),
    ADD CONSTRAINT chk_domain_gen_variable_length_positive
    CHECK (variable_length IS NULL OR variable_length > 0);

-- 4. Add CHECK constraints for generated domains
ALTER TABLE generated_domains
    ADD CONSTRAINT chk_generated_domains_offset_non_negative
    CHECK (offset_index >= 0);

-- 5. Add missing pattern_type constraint
ALTER TABLE domain_generation_campaign_params
    ADD CONSTRAINT chk_domain_gen_pattern_type
    CHECK (pattern_type IN ('prefix', 'suffix', 'both'));

-- 6. Create a view to help frontend identify large numeric values
CREATE OR REPLACE VIEW v_campaign_numeric_safety AS
SELECT 
    id,
    name,
    campaign_type,
    status,
    -- Flag fields that may need special handling in frontend
    CASE WHEN total_items > 9007199254740991 THEN true ELSE false END AS total_items_exceeds_safe_range,
    CASE WHEN processed_items > 9007199254740991 THEN true ELSE false END AS processed_items_exceeds_safe_range,
    CASE WHEN successful_items > 9007199254740991 THEN true ELSE false END AS successful_items_exceeds_safe_range,
    CASE WHEN failed_items > 9007199254740991 THEN true ELSE false END AS failed_items_exceeds_safe_range,
    total_items,
    processed_items,
    successful_items,
    failed_items
FROM campaigns;

COMMENT ON VIEW v_campaign_numeric_safety IS 
'Helper view to identify campaigns with numeric values exceeding JavaScript safe integer range';

-- 7. Add index for better performance on large numeric queries
CREATE INDEX IF NOT EXISTS idx_campaigns_large_numeric_values 
ON campaigns(id) 
WHERE total_items > 9007199254740991 
   OR processed_items > 9007199254740991 
   OR successful_items > 9007199254740991 
   OR failed_items > 9007199254740991;

-- 8. Create function to validate numeric safety
CREATE OR REPLACE FUNCTION fn_validate_numeric_safety()
RETURNS TRIGGER AS $$
BEGIN
    -- Only warn, don't block, as backend can handle large values
    IF NEW.total_items > 9007199254740991 THEN
        RAISE NOTICE 'total_items exceeds JavaScript safe range: %', NEW.total_items;
    END IF;
    IF NEW.processed_items > 9007199254740991 THEN
        RAISE NOTICE 'processed_items exceeds JavaScript safe range: %', NEW.processed_items;
    END IF;
    IF NEW.successful_items > 9007199254740991 THEN
        RAISE NOTICE 'successful_items exceeds JavaScript safe range: %', NEW.successful_items;
    END IF;
    IF NEW.failed_items > 9007199254740991 THEN
        RAISE NOTICE 'failed_items exceeds JavaScript safe range: %', NEW.failed_items;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. Add trigger to warn about large numeric values
CREATE TRIGGER trg_campaigns_numeric_safety
    BEFORE INSERT OR UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_numeric_safety();

-- 10. Add comments documenting the int64 nature of fields
COMMENT ON COLUMN campaigns.total_items IS 'Total items in campaign (Go: int64, JS: requires SafeBigInt)';
COMMENT ON COLUMN campaigns.processed_items IS 'Items processed (Go: int64, JS: requires SafeBigInt)';
COMMENT ON COLUMN campaigns.successful_items IS 'Successful items (Go: int64, JS: requires SafeBigInt)';
COMMENT ON COLUMN campaigns.failed_items IS 'Failed items (Go: int64, JS: requires SafeBigInt)';
COMMENT ON COLUMN generated_domains.offset_index IS 'Generation offset (Go: int64, JS: requires SafeBigInt)';
COMMENT ON COLUMN domain_generation_campaign_params.total_possible_combinations IS 'Total combinations (Go: int64, JS: requires SafeBigInt)';
COMMENT ON COLUMN domain_generation_campaign_params.current_offset IS 'Current offset (Go: int64, JS: requires SafeBigInt)';

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
-- BEGIN;
-- 
-- -- Remove trigger and function
-- DROP TRIGGER IF EXISTS trg_campaigns_numeric_safety ON campaigns;
-- DROP FUNCTION IF EXISTS fn_validate_numeric_safety();
-- 
-- -- Remove view
-- DROP VIEW IF EXISTS v_campaign_numeric_safety;
-- 
-- -- Remove index
-- DROP INDEX IF EXISTS idx_campaigns_large_numeric_values;
-- 
-- -- Remove constraints
-- ALTER TABLE campaigns 
--     DROP CONSTRAINT IF EXISTS chk_campaigns_total_items_non_negative,
--     DROP CONSTRAINT IF EXISTS chk_campaigns_processed_items_non_negative,
--     DROP CONSTRAINT IF EXISTS chk_campaigns_successful_items_non_negative,
--     DROP CONSTRAINT IF EXISTS chk_campaigns_failed_items_non_negative,
--     DROP CONSTRAINT IF EXISTS chk_campaigns_progress_percentage_range;
-- 
-- ALTER TABLE domain_generation_campaign_params
--     DROP CONSTRAINT IF EXISTS chk_domain_gen_total_combinations_positive,
--     DROP CONSTRAINT IF EXISTS chk_domain_gen_current_offset_non_negative,
--     DROP CONSTRAINT IF EXISTS chk_domain_gen_num_domains_positive,
--     DROP CONSTRAINT IF EXISTS chk_domain_gen_variable_length_positive,
--     DROP CONSTRAINT IF EXISTS chk_domain_gen_pattern_type;
-- 
-- ALTER TABLE generated_domains
--     DROP CONSTRAINT IF EXISTS chk_generated_domains_offset_non_negative;
-- 
-- -- Remove comments
-- COMMENT ON COLUMN campaigns.total_items IS NULL;
-- COMMENT ON COLUMN campaigns.processed_items IS NULL;
-- COMMENT ON COLUMN campaigns.successful_items IS NULL;
-- COMMENT ON COLUMN campaigns.failed_items IS NULL;
-- COMMENT ON COLUMN generated_domains.offset_index IS NULL;
-- COMMENT ON COLUMN domain_generation_campaign_params.total_possible_combinations IS NULL;
-- COMMENT ON COLUMN domain_generation_campaign_params.current_offset IS NULL;
-- 
-- COMMIT;