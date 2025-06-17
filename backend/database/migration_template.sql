-- Migration Template for DomainFlow Schema v2.0+
-- Use this template for all migrations after schema consolidation
-- Follow best practices and include comprehensive safety measures
-- Created: 2025-06-16

-- =====================================================
-- MIGRATION HEADER TEMPLATE
-- =====================================================

-- Migration: 000XXX_descriptive_migration_name.up.sql
-- Description: [Detailed description of what this migration does]
-- Author: [Your name]
-- Date: [Creation date]
-- Schema Version: 2.0+
-- 
-- Dependencies:
-- - Requires successful schema consolidation v2.0
-- - [List any specific dependencies]
--
-- Performance Impact: [Estimated impact - LOW/MEDIUM/HIGH]
-- Estimated Duration: [Expected execution time]
-- Rollback Strategy: [Description of rollback approach]

-- =====================================================
-- PRE-MIGRATION VALIDATION
-- =====================================================

-- Check schema version compatibility
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM schema_version_info 
        WHERE version_number = '2.0' 
        AND consolidation_completed = TRUE
    ) THEN
        RAISE EXCEPTION 'Schema consolidation v2.0 required before applying this migration';
    END IF;
END $$;

-- Check for required permissions
DO $$
BEGIN
    IF NOT has_schema_privilege('public', 'CREATE') THEN
        RAISE EXCEPTION 'Insufficient privileges to execute migration';
    END IF;
END $$;

-- Validate system health before migration
DO $$
DECLARE
    health_check JSONB;
    system_health TEXT;
BEGIN
    -- Perform basic health check
    SELECT safety.emergency_health_check() INTO health_check;
    system_health := health_check->>'overall_health';
    
    IF system_health IN ('CRITICAL', 'DEGRADED') THEN
        RAISE WARNING 'System health is %: %', system_health, health_check;
        -- Uncomment next line to block migration on health issues
        -- RAISE EXCEPTION 'Migration blocked due to system health: %', system_health;
    END IF;
END $$;

-- =====================================================
-- BACKUP AND SAFETY PREPARATION
-- =====================================================

-- Create pre-migration backup
DO $$
DECLARE
    backup_result JSONB;
BEGIN
    -- Create incremental backup before migration
    SELECT safety.create_incremental_backup(
        'pre_consolidation_backup',  -- Base backup name
        '000XXX_pre_migration_backup'  -- New backup name
    ) INTO backup_result;
    
    IF backup_result->>'status' = 'failed' THEN
        RAISE EXCEPTION 'Pre-migration backup failed: %', backup_result->>'error';
    END IF;
    
    RAISE NOTICE 'Pre-migration backup created: %', backup_result->>'backup_name';
END $$;

-- Start migration monitoring
DO $$
DECLARE
    monitoring_session JSONB;
BEGIN
    SELECT monitoring.start_migration_monitoring('migration_000XXX') INTO monitoring_session;
    RAISE NOTICE 'Migration monitoring started: %', monitoring_session->>'monitoring_session_id';
END $$;

-- Log migration start
INSERT INTO audit_logs (action, entity_type, details)
VALUES ('migration_000XXX_started', 'schema_migration', 
        jsonb_build_object(
            'migration_name', '000XXX_descriptive_migration_name',
            'started_at', NOW(),
            'schema_version', '2.0+'
        ));

-- =====================================================
-- MIGRATION OPERATIONS
-- =====================================================

-- Begin transaction for atomic migration
BEGIN;

-- Set migration context
SET LOCAL application_name = 'migration_000XXX';
SET LOCAL statement_timeout = '30min'; -- Adjust based on expected duration

-- Example migration operations (replace with actual migration code):

-- 1. Create new table (if needed)
-- CREATE TABLE IF NOT EXISTS new_feature_table (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     name TEXT NOT NULL,
--     description TEXT,
--     config_data JSONB,
--     is_enabled BOOLEAN DEFAULT TRUE,
--     created_at TIMESTAMPTZ DEFAULT NOW(),
--     updated_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- 2. Add new column to existing table (if needed)
-- ALTER TABLE campaigns 
-- ADD COLUMN IF NOT EXISTS new_feature_enabled BOOLEAN DEFAULT FALSE;

-- 3. Create indexes (use CONCURRENTLY for large tables)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_new_feature 
-- ON campaigns(new_feature_enabled) 
-- WHERE new_feature_enabled = TRUE;

-- 4. Update existing data (if needed)
-- UPDATE campaigns 
-- SET new_feature_enabled = TRUE 
-- WHERE campaign_type = 'domain_generation' 
-- AND created_at > NOW() - INTERVAL '30 days';

-- 5. Add constraints (if needed)
-- ALTER TABLE campaigns 
-- ADD CONSTRAINT chk_valid_new_feature 
-- CHECK (new_feature_enabled IN (TRUE, FALSE));

-- 6. Create or update functions (if needed)
-- CREATE OR REPLACE FUNCTION example_migration_function()
-- RETURNS JSONB AS $$
-- BEGIN
--     RETURN jsonb_build_object('migration', '000XXX', 'status', 'success');
-- END;
-- $$ LANGUAGE plpgsql;

-- 7. Update triggers (if needed)
-- -- Add trigger for updated_at if new table created
-- CREATE TRIGGER set_timestamp_new_feature_table
--     BEFORE UPDATE ON new_feature_table
--     FOR EACH ROW
--     EXECUTE FUNCTION trigger_set_timestamp();

-- =====================================================
-- POST-MIGRATION VALIDATION
-- =====================================================

-- Validate migration results
DO $$
DECLARE
    validation_result JSONB;
    validation_status TEXT;
BEGIN
    -- Run data validation checks
    SELECT consolidation.validate_migration_step('post_migration') INTO validation_result;
    validation_status := validation_result->>'overall_status';
    
    IF validation_status != 'PASS' THEN
        RAISE EXCEPTION 'Migration validation failed: %', validation_result;
    END IF;
    
    RAISE NOTICE 'Migration validation passed: %', validation_result;
END $$;

-- Check for any constraint violations
DO $$
DECLARE
    violation_count INTEGER;
BEGIN
    -- Check for foreign key violations (adjust table names as needed)
    SELECT COUNT(*) INTO violation_count
    FROM campaigns c
    LEFT JOIN auth.users u ON c.user_id = u.id
    WHERE c.user_id IS NOT NULL AND u.id IS NULL;
    
    IF violation_count > 0 THEN
        RAISE EXCEPTION 'Foreign key violations detected: % rows', violation_count;
    END IF;
END $$;

-- Update schema version tracking
INSERT INTO migration_history (
    migration_number,
    migration_name,
    applied_at,
    applied_by,
    execution_time_seconds,
    rollback_sql
) VALUES (
    '000XXX',
    'descriptive_migration_name',
    NOW(),
    current_user,
    0, -- Will be updated at the end
    -- Rollback SQL (customize based on your changes)
    'ALTER TABLE campaigns DROP COLUMN IF EXISTS new_feature_enabled;'
);

-- Commit the transaction
COMMIT;

-- =====================================================
-- POST-COMMIT OPERATIONS
-- =====================================================

-- Refresh materialized views (if affected)
-- SELECT refresh_all_materialized_views();

-- Update table statistics
ANALYZE campaigns;
-- ANALYZE new_feature_table; -- If new table created

-- Run integrity checks
DO $$
DECLARE
    integrity_result JSONB;
BEGIN
    SELECT safety.run_all_integrity_checks() INTO integrity_result;
    
    IF (integrity_result->'summary'->>'critical_violations')::INTEGER > 0 THEN
        RAISE WARNING 'Critical integrity violations detected after migration: %', integrity_result;
    END IF;
END $$;

-- Log migration completion
INSERT INTO audit_logs (action, entity_type, details)
VALUES ('migration_000XXX_completed', 'schema_migration', 
        jsonb_build_object(
            'migration_name', '000XXX_descriptive_migration_name',
            'completed_at', NOW(),
            'success', TRUE
        ));

-- Stop migration monitoring
DO $$
DECLARE
    monitoring_result JSONB;
BEGIN
    -- Note: You'll need to get the actual session ID from the start
    -- This is a placeholder - implement session tracking as needed
    SELECT monitoring.generate_monitoring_report('migration_000XXX', 1) INTO monitoring_result;
    RAISE NOTICE 'Migration monitoring report: %', monitoring_result;
END $$;

-- =====================================================
-- ROLLBACK TEMPLATE (000XXX_descriptive_migration_name.down.sql)
-- =====================================================

-- Use this template for the corresponding .down.sql file:

/*
-- Migration Rollback: 000XXX_descriptive_migration_name.down.sql
-- Rollback for: [Migration description]
-- Author: [Your name]
-- Date: [Creation date]

-- Pre-rollback validation
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM migration_history WHERE migration_number = '000XXX') THEN
        RAISE EXCEPTION 'Migration 000XXX was not applied, cannot rollback';
    END IF;
END $$;

-- Create rollback backup
DO $$
DECLARE
    backup_result JSONB;
BEGIN
    SELECT safety.create_incremental_backup(
        'current_state',
        '000XXX_pre_rollback_backup'
    ) INTO backup_result;
    
    RAISE NOTICE 'Pre-rollback backup created: %', backup_result->>'backup_name';
END $$;

BEGIN;

-- Rollback operations (reverse order of original migration):

-- 1. Drop constraints
-- ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS chk_valid_new_feature;

-- 2. Drop indexes
-- DROP INDEX IF EXISTS idx_campaigns_new_feature;

-- 3. Drop columns
-- ALTER TABLE campaigns DROP COLUMN IF EXISTS new_feature_enabled;

-- 4. Drop tables
-- DROP TABLE IF EXISTS new_feature_table;

-- 5. Drop functions
-- DROP FUNCTION IF EXISTS example_migration_function();

-- Remove from migration history
DELETE FROM migration_history WHERE migration_number = '000XXX';

COMMIT;

-- Log rollback completion
INSERT INTO audit_logs (action, entity_type, details)
VALUES ('migration_000XXX_rolled_back', 'schema_migration', 
        jsonb_build_object(
            'migration_name', '000XXX_descriptive_migration_name',
            'rolled_back_at', NOW()
        ));

*/

-- =====================================================
-- MIGRATION BEST PRACTICES CHECKLIST
-- =====================================================

/*
□ Pre-migration backup created
□ System health validated
□ Migration monitoring started
□ All operations wrapped in transaction
□ Proper error handling implemented
□ Data validation included
□ Constraint checks performed
□ Rollback script created and tested
□ Documentation updated
□ Performance impact assessed
□ Team notification sent
□ Post-migration monitoring planned

Additional Considerations:
□ Use CONCURRENTLY for index creation on large tables
□ Consider maintenance windows for high-impact changes
□ Test migration on staging environment first
□ Plan for zero-downtime deployment if required
□ Coordinate with application deployment if schema changes affect code
□ Update API documentation if public-facing changes
□ Consider backwards compatibility requirements
□ Plan monitoring for performance regressions
*/

-- =====================================================
-- COMMENTS AND DOCUMENTATION
-- =====================================================

COMMENT ON FUNCTION example_migration_function IS 
'Example function created by migration 000XXX - replace with actual function documentation';

-- Add table comments for new tables
-- COMMENT ON TABLE new_feature_table IS 'Description of the new table and its purpose';
-- COMMENT ON COLUMN new_feature_table.config_data IS 'JSONB configuration data for the feature';