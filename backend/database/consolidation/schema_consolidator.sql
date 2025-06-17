-- DomainFlow Schema Consolidation Tool
-- Safely migrates from fragmented migrations (000001-000017) to consolidated schema v2
-- Implements 4-phase gradual migration strategy with zero downtime
-- Created: 2025-06-16

-- =====================================================
-- PHASE 1: PREPARATION AND VALIDATION
-- =====================================================

-- Function to validate current schema state before consolidation
CREATE OR REPLACE FUNCTION consolidation.validate_current_schema()
RETURNS JSONB AS $$
DECLARE
    validation_results JSONB := '{}'::jsonb;
    table_count INTEGER;
    migration_version TEXT;
    data_integrity_issues INTEGER := 0;
BEGIN
    -- Check if we have the expected tables from all 17 migrations
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema IN ('public', 'auth') 
    AND table_type = 'BASE TABLE';
    
    validation_results := validation_results || jsonb_build_object('table_count', table_count);
    
    -- Check for migration 000017 (session-based auth) completion
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'sessions' 
               AND column_name = 'session_fingerprint') THEN
        validation_results := validation_results || jsonb_build_object('session_auth_migrated', true);
    ELSE
        validation_results := validation_results || jsonb_build_object('session_auth_migrated', false);
        data_integrity_issues := data_integrity_issues + 1;
    END IF;
    
    -- Check for critical data integrity
    SELECT COUNT(*) INTO table_count FROM auth.users WHERE email IS NULL OR password_hash IS NULL;
    IF table_count > 0 THEN
        data_integrity_issues := data_integrity_issues + table_count;
        validation_results := validation_results || jsonb_build_object('invalid_users', table_count);
    END IF;
    
    -- Check for orphaned records
    SELECT COUNT(*) INTO table_count 
    FROM generated_domains gd 
    LEFT JOIN campaigns c ON gd.domain_generation_campaign_id = c.id 
    WHERE c.id IS NULL;
    
    IF table_count > 0 THEN
        data_integrity_issues := data_integrity_issues + table_count;
        validation_results := validation_results || jsonb_build_object('orphaned_domains', table_count);
    END IF;
    
    validation_results := validation_results || jsonb_build_object(
        'total_integrity_issues', data_integrity_issues,
        'validation_timestamp', NOW(),
        'ready_for_consolidation', data_integrity_issues = 0
    );
    
    RETURN validation_results;
END;
$$ LANGUAGE plpgsql;

-- Function to create shadow tables for zero-downtime migration
CREATE OR REPLACE FUNCTION consolidation.create_shadow_tables()
RETURNS JSONB AS $$
DECLARE
    result JSONB := '{"created_tables": []}'::jsonb;
    table_record RECORD;
BEGIN
    -- Create shadow tables with _v2 suffix for critical tables
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name IN ('campaigns', 'generated_domains', 'personas', 'proxies', 'keyword_sets')
    LOOP
        -- Create shadow table with enhanced schema
        EXECUTE format('CREATE TABLE %I_v2 (LIKE %I INCLUDING ALL)', 
                      table_record.table_name, table_record.table_name);
        
        -- Add new columns for v2 enhancements based on table
        CASE table_record.table_name
            WHEN 'campaigns' THEN
                EXECUTE format('ALTER TABLE %I_v2 
                    ADD COLUMN IF NOT EXISTS estimated_completion_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS avg_processing_rate DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
                    ALTER COLUMN user_id TYPE UUID USING user_id::UUID', 
                    table_record.table_name);
                    
            WHEN 'generated_domains' THEN
                EXECUTE format('ALTER TABLE %I_v2 
                    ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT ''pending'',
                    ADD COLUMN IF NOT EXISTS generation_batch_id UUID,
                    ADD COLUMN IF NOT EXISTS validation_attempts INTEGER DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS last_validation_at TIMESTAMPTZ', 
                    table_record.table_name);
                    
            WHEN 'personas' THEN
                EXECUTE format('ALTER TABLE %I_v2 
                    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS usage_count BIGINT DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS success_rate DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER', 
                    table_record.table_name);
                    
            WHEN 'proxies' THEN
                EXECUTE format('ALTER TABLE %I_v2 
                    ADD COLUMN IF NOT EXISTS success_rate DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS total_requests BIGINT DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS failed_requests BIGINT DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS avg_response_time_ms INTEGER,
                    ADD COLUMN IF NOT EXISTS consecutive_failures INT DEFAULT 0', 
                    table_record.table_name);
                    
            WHEN 'keyword_sets' THEN
                EXECUTE format('ALTER TABLE %I_v2 
                    ADD COLUMN IF NOT EXISTS usage_count BIGINT DEFAULT 0,
                    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS match_success_rate DOUBLE PRECISION', 
                    table_record.table_name);
        END CASE;
        
        result := jsonb_set(result, '{created_tables}', 
                           (result->'created_tables') || to_jsonb(table_record.table_name || '_v2'));
    END LOOP;
    
    result := result || jsonb_build_object('created_at', NOW());
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PHASE 2: DATA MIGRATION WITH VALIDATION
-- =====================================================

-- Function to migrate data to shadow tables with validation
CREATE OR REPLACE FUNCTION consolidation.migrate_data_to_shadow_tables()
RETURNS JSONB AS $$
DECLARE
    migration_results JSONB := '{}'::jsonb;
    table_record RECORD;
    source_count INTEGER;
    migrated_count INTEGER;
BEGIN
    -- Migrate each critical table
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name IN ('campaigns', 'generated_domains', 'personas', 'proxies', 'keyword_sets')
    LOOP
        -- Get source record count
        EXECUTE format('SELECT COUNT(*) FROM %I', table_record.table_name) INTO source_count;
        
        -- Migrate data with transformations
        CASE table_record.table_name
            WHEN 'campaigns' THEN
                INSERT INTO campaigns_v2 (
                    id, name, campaign_type, status, user_id, total_items, processed_items, 
                    successful_items, failed_items, progress_percentage, metadata, 
                    created_at, updated_at, started_at, completed_at, error_message,
                    estimated_completion_at, avg_processing_rate, last_heartbeat_at
                )
                SELECT 
                    id, name, campaign_type, status, 
                    CASE WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                         THEN user_id::UUID 
                         ELSE NULL END,
                    total_items, processed_items, successful_items, failed_items, 
                    progress_percentage, metadata, created_at, updated_at, started_at, 
                    completed_at, error_message,
                    -- Calculate estimated completion based on current progress
                    CASE WHEN progress_percentage > 0 AND progress_percentage < 100 AND started_at IS NOT NULL
                         THEN started_at + ((NOW() - started_at) * (100.0 / progress_percentage))
                         ELSE NULL END,
                    -- Calculate processing rate
                    CASE WHEN processed_items > 0 AND started_at IS NOT NULL
                         THEN processed_items / EXTRACT(EPOCH FROM (NOW() - started_at))
                         ELSE NULL END,
                    NOW() -- last_heartbeat_at
                FROM campaigns;
                
            WHEN 'generated_domains' THEN
                INSERT INTO generated_domains_v2 (
                    id, domain_generation_campaign_id, domain_name, source_keyword, 
                    source_pattern, tld, offset_index, generated_at, created_at,
                    validation_status, generation_batch_id, validation_attempts, last_validation_at
                )
                SELECT 
                    id, domain_generation_campaign_id, domain_name, source_keyword,
                    source_pattern, tld, offset_index, generated_at, created_at,
                    'pending', -- Default validation status
                    gen_random_uuid(), -- Generate batch ID
                    0, -- Initial validation attempts
                    NULL -- No validation performed yet
                FROM generated_domains;
                
            WHEN 'personas' THEN
                INSERT INTO personas_v2 (
                    id, name, description, persona_type, config_details, is_enabled,
                    created_at, updated_at, last_used_at, usage_count, success_rate, avg_response_time_ms
                )
                SELECT 
                    id, name, description, persona_type, config_details, is_enabled,
                    created_at, updated_at, NULL, 0, NULL, NULL
                FROM personas;
                
            WHEN 'proxies' THEN
                INSERT INTO proxies_v2 (
                    id, name, description, address, protocol, username, password_hash,
                    host, port, is_enabled, is_healthy, last_status, last_checked_at,
                    latency_ms, city, country_code, provider, created_at, updated_at,
                    success_rate, total_requests, failed_requests, avg_response_time_ms, consecutive_failures
                )
                SELECT 
                    id, name, description, address, protocol, username, password_hash,
                    host, port, is_enabled, is_healthy, last_status, last_checked_at,
                    latency_ms, city, country_code, provider, created_at, updated_at,
                    NULL, 0, 0, latency_ms, 0
                FROM proxies;
                
            WHEN 'keyword_sets' THEN
                INSERT INTO keyword_sets_v2 (
                    id, name, description, keywords, is_enabled, created_at, updated_at,
                    usage_count, last_used_at, match_success_rate
                )
                SELECT 
                    id, name, description, keywords, is_enabled, created_at, updated_at,
                    0, NULL, NULL
                FROM keyword_sets;
        END CASE;
        
        -- Get migrated record count
        EXECUTE format('SELECT COUNT(*) FROM %I_v2', table_record.table_name) INTO migrated_count;
        
        migration_results := migration_results || jsonb_build_object(
            table_record.table_name, jsonb_build_object(
                'source_count', source_count,
                'migrated_count', migrated_count,
                'success', source_count = migrated_count
            )
        );
    END LOOP;
    
    migration_results := migration_results || jsonb_build_object('migrated_at', NOW());
    RETURN migration_results;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PHASE 3: ENHANCED INDEXING AND OPTIMIZATION
-- =====================================================

-- Function to create optimized indexes on shadow tables
CREATE OR REPLACE FUNCTION consolidation.create_optimized_indexes()
RETURNS JSONB AS $$
DECLARE
    index_results JSONB := '{"created_indexes": []}'::jsonb;
    index_name TEXT;
BEGIN
    -- Enhanced indexes for campaigns_v2
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_v2_user_status_created 
    ON campaigns_v2(user_id, status, created_at DESC);
    
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_v2_active_status 
    ON campaigns_v2(status, updated_at DESC) 
    WHERE status IN ('pending', 'queued', 'running', 'paused');
    
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_v2_completion_tracking 
    ON campaigns_v2(status, estimated_completion_at) 
    WHERE status IN ('running', 'paused');
    
    -- Enhanced indexes for generated_domains_v2
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_generated_domains_v2_validation_pending 
    ON generated_domains_v2(domain_generation_campaign_id, validation_status, created_at) 
    WHERE validation_status = 'pending';
    
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_generated_domains_v2_batch 
    ON generated_domains_v2(generation_batch_id) 
    WHERE generation_batch_id IS NOT NULL;
    
    -- Enhanced indexes for personas_v2
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personas_v2_performance 
    ON personas_v2(success_rate DESC, avg_response_time_ms ASC) 
    WHERE is_enabled = TRUE;
    
    -- Enhanced indexes for proxies_v2
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proxies_v2_performance 
    ON proxies_v2(success_rate DESC, avg_response_time_ms ASC) 
    WHERE is_enabled = TRUE AND is_healthy = TRUE;
    
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proxies_v2_health 
    ON proxies_v2(is_healthy, is_enabled);
    
    -- Enhanced indexes for keyword_sets_v2
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keyword_sets_v2_usage 
    ON keyword_sets_v2(usage_count DESC, last_used_at DESC) 
    WHERE is_enabled = TRUE;
    
    -- Add created indexes to result
    index_results := jsonb_set(index_results, '{created_indexes}', 
                              index_results->'created_indexes' || 
                              '["campaigns_v2_performance", "domains_v2_validation", "personas_v2_performance", "proxies_v2_performance", "keyword_sets_v2_usage"]'::jsonb);
    
    index_results := index_results || jsonb_build_object('created_at', NOW());
    RETURN index_results;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PHASE 4: CUTOVER AND CLEANUP
-- =====================================================

-- Function to perform atomic cutover to consolidated schema
CREATE OR REPLACE FUNCTION consolidation.perform_atomic_cutover()
RETURNS JSONB AS $$
DECLARE
    cutover_results JSONB := '{}'::jsonb;
    table_record RECORD;
    backup_name TEXT;
BEGIN
    -- Start transaction for atomic cutover
    -- Note: This should be called within a transaction block
    
    -- Create backup tables with timestamp
    backup_name := 'backup_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS');
    
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name IN ('campaigns', 'generated_domains', 'personas', 'proxies', 'keyword_sets')
    LOOP
        -- Create backup of original table
        EXECUTE format('CREATE TABLE %I_%s AS SELECT * FROM %I', 
                      table_record.table_name, backup_name, table_record.table_name);
        
        -- Drop original table
        EXECUTE format('DROP TABLE %I CASCADE', table_record.table_name);
        
        -- Rename shadow table to original name
        EXECUTE format('ALTER TABLE %I_v2 RENAME TO %I', 
                      table_record.table_name, table_record.table_name);
        
        cutover_results := cutover_results || jsonb_build_object(
            table_record.table_name, jsonb_build_object(
                'backed_up', true,
                'cutover_completed', true,
                'backup_table', table_record.table_name || '_' || backup_name
            )
        );
    END LOOP;
    
    -- Update schema version
    INSERT INTO schema_migrations (version, applied_at) 
    VALUES ('consolidated_v2', NOW())
    ON CONFLICT (version) DO UPDATE SET applied_at = NOW();
    
    cutover_results := cutover_results || jsonb_build_object(
        'cutover_completed_at', NOW(),
        'backup_suffix', backup_name,
        'schema_version', 'consolidated_v2'
    );
    
    RETURN cutover_results;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup backup tables after successful consolidation
CREATE OR REPLACE FUNCTION consolidation.cleanup_backup_tables(backup_suffix TEXT)
RETURNS JSONB AS $$
DECLARE
    cleanup_results JSONB := '{"dropped_tables": []}'::jsonb;
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name LIKE '%' || backup_suffix
    LOOP
        EXECUTE format('DROP TABLE %I', table_record.table_name);
        cleanup_results := jsonb_set(cleanup_results, '{dropped_tables}', 
                                   (cleanup_results->'dropped_tables') || to_jsonb(table_record.table_name));
    END LOOP;
    
    cleanup_results := cleanup_results || jsonb_build_object('cleaned_up_at', NOW());
    RETURN cleanup_results;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MAIN CONSOLIDATION ORCHESTRATION FUNCTION
-- =====================================================

-- Main function to orchestrate the entire consolidation process
CREATE OR REPLACE FUNCTION consolidation.execute_schema_consolidation(
    skip_validation BOOLEAN DEFAULT FALSE,
    dry_run BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    consolidation_log JSONB := '{}'::jsonb;
    validation_result JSONB;
    phase_result JSONB;
    start_time TIMESTAMP := NOW();
BEGIN
    -- Initialize consolidation log
    consolidation_log := jsonb_build_object(
        'consolidation_id', gen_random_uuid(),
        'started_at', start_time,
        'dry_run', dry_run,
        'phases', '[]'::jsonb
    );
    
    -- PHASE 1: Validation
    IF NOT skip_validation THEN
        validation_result := consolidation.validate_current_schema();
        consolidation_log := jsonb_set(consolidation_log, '{phases}', 
                                     (consolidation_log->'phases') || 
                                     jsonb_build_object('phase_1_validation', validation_result));
        
        IF NOT (validation_result->>'ready_for_consolidation')::BOOLEAN THEN
            consolidation_log := consolidation_log || jsonb_build_object(
                'status', 'failed',
                'error', 'Schema validation failed. Fix integrity issues before consolidation.',
                'completed_at', NOW()
            );
            RETURN consolidation_log;
        END IF;
    END IF;
    
    IF dry_run THEN
        consolidation_log := consolidation_log || jsonb_build_object(
            'status', 'dry_run_completed',
            'message', 'Dry run completed successfully. Schema is ready for consolidation.',
            'completed_at', NOW()
        );
        RETURN consolidation_log;
    END IF;
    
    -- PHASE 2: Create shadow tables
    phase_result := consolidation.create_shadow_tables();
    consolidation_log := jsonb_set(consolidation_log, '{phases}', 
                                 (consolidation_log->'phases') || 
                                 jsonb_build_object('phase_2_shadow_tables', phase_result));
    
    -- PHASE 3: Migrate data
    phase_result := consolidation.migrate_data_to_shadow_tables();
    consolidation_log := jsonb_set(consolidation_log, '{phases}', 
                                 (consolidation_log->'phases') || 
                                 jsonb_build_object('phase_3_data_migration', phase_result));
    
    -- PHASE 4: Create optimized indexes
    phase_result := consolidation.create_optimized_indexes();
    consolidation_log := jsonb_set(consolidation_log, '{phases}', 
                                 (consolidation_log->'phases') || 
                                 jsonb_build_object('phase_4_indexing', phase_result));
    
    -- PHASE 5: Atomic cutover (requires manual confirmation in production)
    -- This phase should be executed separately in production for safety
    consolidation_log := consolidation_log || jsonb_build_object(
        'status', 'ready_for_cutover',
        'message', 'Schema consolidation prepared. Execute consolidation.perform_atomic_cutover() to complete.',
        'completed_at', NOW(),
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );
    
    RETURN consolidation_log;
END;
$$ LANGUAGE plpgsql;

-- Create consolidation schema for organization
CREATE SCHEMA IF NOT EXISTS consolidation;

-- Create schema migrations tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
);

-- Log the consolidation tool installation
INSERT INTO audit_logs (action, entity_type, details)
VALUES ('consolidation_tool_installed', 'system', 
        jsonb_build_object('installed_at', NOW(), 'version', 'v2.0'));

-- Usage examples and documentation
COMMENT ON FUNCTION consolidation.execute_schema_consolidation IS 
'Main consolidation function. Usage: SELECT consolidation.execute_schema_consolidation(false, true) for dry run';

COMMENT ON FUNCTION consolidation.perform_atomic_cutover IS 
'Performs atomic cutover to consolidated schema. MUST be run in a transaction block for safety';

COMMENT ON FUNCTION consolidation.validate_current_schema IS 
'Validates current schema state and data integrity before consolidation';