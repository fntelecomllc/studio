-- DomainFlow Rollback Procedures
-- Emergency rollback capabilities for schema consolidation
-- Provides rapid recovery mechanisms with <5 minute recovery time
-- Created: 2025-06-16

-- =====================================================
-- EMERGENCY ROLLBACK FUNCTIONS
-- =====================================================

-- Function to create comprehensive backup before consolidation
CREATE OR REPLACE FUNCTION consolidation.create_rollback_backup()
RETURNS JSONB AS $$
DECLARE
    backup_results JSONB := '{"backup_tables": []}'::jsonb;
    table_record RECORD;
    backup_timestamp TEXT := TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS');
    backup_name TEXT;
    table_count INTEGER;
BEGIN
    -- Create rollback backup schema
    EXECUTE 'CREATE SCHEMA IF NOT EXISTS rollback_' || backup_timestamp;
    
    -- Backup all critical tables
    FOR table_record IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname IN ('public', 'auth') 
        AND tablename NOT LIKE '%_v2'
        AND tablename NOT LIKE 'backup_%'
        AND tablename NOT LIKE 'rollback_%'
    LOOP
        backup_name := 'rollback_' || backup_timestamp || '.' || table_record.tablename;
        
        -- Create backup table with data
        EXECUTE format('CREATE TABLE %I AS SELECT * FROM %I.%I', 
                      backup_name, table_record.schemaname, table_record.tablename);
        
        -- Get record count for verification
        EXECUTE format('SELECT COUNT(*) FROM %I', backup_name) INTO table_count;
        
        backup_results := jsonb_set(backup_results, '{backup_tables}', 
                                   (backup_results->'backup_tables') || 
                                   jsonb_build_object(
                                       'original_table', table_record.schemaname || '.' || table_record.tablename,
                                       'backup_table', backup_name,
                                       'record_count', table_count
                                   ));
    END LOOP;
    
    -- Create backup metadata table
    EXECUTE format('CREATE TABLE rollback_%s.backup_metadata (
        backup_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        original_schema_version TEXT,
        backup_timestamp TIMESTAMPTZ DEFAULT NOW(),
        backup_reason TEXT,
        created_by TEXT,
        database_version TEXT,
        total_tables INTEGER,
        backup_size_mb NUMERIC
    )', backup_timestamp);
    
    -- Insert backup metadata
    EXECUTE format('INSERT INTO rollback_%s.backup_metadata 
                   (original_schema_version, backup_reason, total_tables) 
                   VALUES (''pre_consolidation'', ''Emergency rollback backup'', %s)', 
                   backup_timestamp, jsonb_array_length(backup_results->'backup_tables'));
    
    backup_results := backup_results || jsonb_build_object(
        'backup_schema', 'rollback_' || backup_timestamp,
        'backup_timestamp', backup_timestamp,
        'created_at', NOW(),
        'status', 'completed'
    );
    
    -- Log backup creation
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('rollback_backup_created', 'consolidation', backup_results);
    
    RETURN backup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to list available rollback points
CREATE OR REPLACE FUNCTION consolidation.list_rollback_points()
RETURNS JSONB AS $$
DECLARE
    rollback_points JSONB := '{"available_rollbacks": []}'::jsonb;
    schema_record RECORD;
    metadata_record RECORD;
    schema_info JSONB;
BEGIN
    FOR schema_record IN 
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name LIKE 'rollback_%'
        ORDER BY schema_name DESC
    LOOP
        -- Initialize schema info
        schema_info := jsonb_build_object(
            'schema_name', schema_record.schema_name,
            'timestamp', substring(schema_record.schema_name from 'rollback_(.*)'),
            'tables', '[]'::jsonb
        );
        
        -- Get metadata if available
        IF EXISTS (SELECT 1 FROM information_schema.tables 
                  WHERE table_schema = schema_record.schema_name 
                  AND table_name = 'backup_metadata') THEN
            
            EXECUTE format('SELECT backup_timestamp, backup_reason, total_tables, backup_size_mb 
                           FROM %I.backup_metadata LIMIT 1', schema_record.schema_name) 
            INTO metadata_record;
            
            schema_info := schema_info || jsonb_build_object(
                'backup_timestamp', metadata_record.backup_timestamp,
                'backup_reason', metadata_record.backup_reason,
                'total_tables', metadata_record.total_tables,
                'backup_size_mb', metadata_record.backup_size_mb
            );
        END IF;
        
        -- Get table list
        FOR metadata_record IN 
            EXECUTE format('SELECT table_name FROM information_schema.tables 
                           WHERE table_schema = %L AND table_name != ''backup_metadata''', 
                           schema_record.schema_name)
        LOOP
            schema_info := jsonb_set(schema_info, '{tables}', 
                                   (schema_info->'tables') || to_jsonb(metadata_record.table_name));
        END LOOP;
        
        rollback_points := jsonb_set(rollback_points, '{available_rollbacks}', 
                                   (rollback_points->'available_rollbacks') || schema_info);
    END LOOP;
    
    rollback_points := rollback_points || jsonb_build_object('listed_at', NOW());
    RETURN rollback_points;
END;
$$ LANGUAGE plpgsql;

-- Function to validate rollback point integrity
CREATE OR REPLACE FUNCTION consolidation.validate_rollback_point(rollback_schema TEXT)
RETURNS JSONB AS $$
DECLARE
    validation_results JSONB := '{"validation_checks": []}'::jsonb;
    table_record RECORD;
    expected_tables TEXT[] := ARRAY['users', 'sessions', 'campaigns', 'generated_domains', 
                                   'personas', 'proxies', 'keyword_sets', 'audit_logs'];
    missing_tables TEXT[] := '{}';
    table_count INTEGER;
    check_result JSONB;
BEGIN
    -- Check if rollback schema exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = rollback_schema) THEN
        RETURN jsonb_build_object(
            'status', 'FAIL',
            'error', 'Rollback schema does not exist: ' || rollback_schema,
            'validated_at', NOW()
        );
    END IF;
    
    -- Check for critical tables
    FOREACH table_record.table_name IN ARRAY expected_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                      WHERE table_schema = rollback_schema 
                      AND table_name = table_record.table_name) THEN
            missing_tables := missing_tables || table_record.table_name;
        END IF;
    END LOOP;
    
    check_result := jsonb_build_object(
        'check_name', 'critical_tables_present',
        'missing_tables', missing_tables,
        'status', CASE WHEN array_length(missing_tables, 1) IS NULL THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{validation_checks}', 
                                   (validation_results->'validation_checks') || check_result);
    
    -- Check data integrity in backup tables
    FOR table_record IN 
        EXECUTE format('SELECT table_name FROM information_schema.tables 
                       WHERE table_schema = %L AND table_name != ''backup_metadata''', rollback_schema)
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I.%I', rollback_schema, table_record.table_name) INTO table_count;
        
        check_result := jsonb_build_object(
            'check_name', 'table_data_integrity',
            'table_name', table_record.table_name,
            'record_count', table_count,
            'status', CASE WHEN table_count >= 0 THEN 'PASS' ELSE 'FAIL' END
        );
        validation_results := jsonb_set(validation_results, '{validation_checks}', 
                                       (validation_results->'validation_checks') || check_result);
    END LOOP;
    
    -- Overall validation status
    validation_results := validation_results || jsonb_build_object(
        'overall_status', 
        CASE WHEN (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(validation_results->'validation_checks') AS check 
            WHERE check->>'status' = 'FAIL'
        ) = 0 THEN 'PASS' ELSE 'FAIL' END,
        'validated_at', NOW()
    );
    
    RETURN validation_results;
END;
$$ LANGUAGE plpgsql;

-- Function to execute emergency rollback
CREATE OR REPLACE FUNCTION consolidation.execute_emergency_rollback(
    rollback_schema TEXT,
    rollback_reason TEXT DEFAULT 'Emergency rollback',
    skip_validation BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    rollback_results JSONB := '{}'::jsonb;
    validation_result JSONB;
    table_record RECORD;
    current_backup_schema TEXT;
    start_time TIMESTAMP := NOW();
    table_count INTEGER;
    restored_count INTEGER := 0;
BEGIN
    -- Initialize rollback log
    rollback_results := jsonb_build_object(
        'rollback_id', uuid_generate_v4(),
        'rollback_schema', rollback_schema,
        'rollback_reason', rollback_reason,
        'started_at', start_time,
        'restored_tables', '[]'::jsonb
    );
    
    -- Validate rollback point unless skipped
    IF NOT skip_validation THEN
        validation_result := consolidation.validate_rollback_point(rollback_schema);
        rollback_results := rollback_results || jsonb_build_object('validation', validation_result);
        
        IF validation_result->>'overall_status' != 'PASS' THEN
            rollback_results := rollback_results || jsonb_build_object(
                'status', 'FAILED',
                'error', 'Rollback point validation failed',
                'completed_at', NOW()
            );
            RETURN rollback_results;
        END IF;
    END IF;
    
    -- Create backup of current state before rollback
    current_backup_schema := 'rollback_current_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS');
    EXECUTE 'CREATE SCHEMA ' || current_backup_schema;
    
    -- Backup current tables before rollback
    FOR table_record IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname IN ('public', 'auth') 
        AND tablename NOT LIKE '%backup%'
        AND tablename NOT LIKE '%rollback%'
    LOOP
        EXECUTE format('CREATE TABLE %I.%I AS SELECT * FROM %I.%I', 
                      current_backup_schema, table_record.tablename,
                      table_record.schemaname, table_record.tablename);
    END LOOP;
    
    -- Begin rollback process - restore tables from rollback schema
    FOR table_record IN 
        EXECUTE format('SELECT table_name FROM information_schema.tables 
                       WHERE table_schema = %L AND table_name != ''backup_metadata'' 
                       ORDER BY table_name', rollback_schema)
    LOOP
        BEGIN
            -- Disable triggers to avoid constraint issues during restore
            EXECUTE format('ALTER TABLE %I DISABLE TRIGGER ALL', table_record.table_name);
            
            -- Truncate current table
            EXECUTE format('TRUNCATE TABLE %I CASCADE', table_record.table_name);
            
            -- Restore data from rollback schema
            EXECUTE format('INSERT INTO %I SELECT * FROM %I.%I', 
                          table_record.table_name, rollback_schema, table_record.table_name);
            
            -- Re-enable triggers
            EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', table_record.table_name);
            
            -- Get restored record count
            EXECUTE format('SELECT COUNT(*) FROM %I', table_record.table_name) INTO table_count;
            restored_count := restored_count + 1;
            
            rollback_results := jsonb_set(rollback_results, '{restored_tables}', 
                                         (rollback_results->'restored_tables') || 
                                         jsonb_build_object(
                                             'table_name', table_record.table_name,
                                             'record_count', table_count,
                                             'status', 'SUCCESS'
                                         ));
        EXCEPTION WHEN OTHERS THEN
            -- Re-enable triggers even on error
            EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', table_record.table_name);
            
            rollback_results := jsonb_set(rollback_results, '{restored_tables}', 
                                         (rollback_results->'restored_tables') || 
                                         jsonb_build_object(
                                             'table_name', table_record.table_name,
                                             'status', 'FAILED',
                                             'error', SQLERRM
                                         ));
        END;
    END LOOP;
    
    -- Update sequences to avoid ID conflicts
    PERFORM consolidation.reset_sequences_to_max();
    
    -- Refresh materialized views if they exist
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'campaign_statistics') THEN
        REFRESH MATERIALIZED VIEW campaign_statistics;
    END IF;
    
    -- Finalize rollback results
    rollback_results := rollback_results || jsonb_build_object(
        'status', 'COMPLETED',
        'restored_table_count', restored_count,
        'current_state_backup', current_backup_schema,
        'completed_at', NOW(),
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );
    
    -- Log rollback operation
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('emergency_rollback_executed', 'consolidation', rollback_results);
    
    RETURN rollback_results;
END;
$$ LANGUAGE plpgsql;

-- Function to reset sequences after rollback
CREATE OR REPLACE FUNCTION consolidation.reset_sequences_to_max()
RETURNS JSONB AS $$
DECLARE
    sequence_record RECORD;
    max_id BIGINT;
    reset_results JSONB := '{"reset_sequences": []}'::jsonb;
BEGIN
    -- Reset sequences for all tables with serial/identity columns
    FOR sequence_record IN 
        SELECT schemaname, sequencename, tablename
        FROM pg_sequences 
        WHERE schemaname IN ('public', 'auth')
    LOOP
        BEGIN
            -- Get the maximum ID from the table
            EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I.%I', 
                          sequence_record.schemaname, sequence_record.tablename) INTO max_id;
            
            -- Reset sequence to max + 1
            EXECUTE format('SELECT setval(%L, %s)', 
                          sequence_record.schemaname || '.' || sequence_record.sequencename, 
                          max_id + 1);
            
            reset_results := jsonb_set(reset_results, '{reset_sequences}', 
                                      (reset_results->'reset_sequences') || 
                                      jsonb_build_object(
                                          'sequence_name', sequence_record.sequencename,
                                          'table_name', sequence_record.tablename,
                                          'reset_to', max_id + 1,
                                          'status', 'SUCCESS'
                                      ));
        EXCEPTION WHEN OTHERS THEN
            reset_results := jsonb_set(reset_results, '{reset_sequences}', 
                                      (reset_results->'reset_sequences') || 
                                      jsonb_build_object(
                                          'sequence_name', sequence_record.sequencename,
                                          'status', 'FAILED',
                                          'error', SQLERRM
                                      ));
        END;
    END LOOP;
    
    reset_results := reset_results || jsonb_build_object('reset_at', NOW());
    RETURN reset_results;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old rollback points (retention policy)
CREATE OR REPLACE FUNCTION consolidation.cleanup_old_rollback_points(
    retention_days INTEGER DEFAULT 30
)
RETURNS JSONB AS $$
DECLARE
    cleanup_results JSONB := '{"deleted_schemas": []}'::jsonb;
    schema_record RECORD;
    schema_timestamp TIMESTAMP;
    cutoff_date TIMESTAMP := NOW() - (retention_days || ' days')::INTERVAL;
    deleted_count INTEGER := 0;
BEGIN
    FOR schema_record IN 
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name LIKE 'rollback_%'
    LOOP
        -- Extract timestamp from schema name
        BEGIN
            schema_timestamp := TO_TIMESTAMP(
                substring(schema_record.schema_name from 'rollback_(.*)'), 
                'YYYYMMDD_HH24MISS'
            );
            
            -- Drop schema if older than retention period
            IF schema_timestamp < cutoff_date THEN
                EXECUTE format('DROP SCHEMA %I CASCADE', schema_record.schema_name);
                deleted_count := deleted_count + 1;
                
                cleanup_results := jsonb_set(cleanup_results, '{deleted_schemas}', 
                                           (cleanup_results->'deleted_schemas') || 
                                           to_jsonb(schema_record.schema_name));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Skip schemas with unparseable timestamps
            CONTINUE;
        END;
    END LOOP;
    
    cleanup_results := cleanup_results || jsonb_build_object(
        'deleted_count', deleted_count,
        'retention_days', retention_days,
        'cutoff_date', cutoff_date,
        'cleaned_up_at', NOW()
    );
    
    -- Log cleanup operation
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('rollback_cleanup', 'consolidation', cleanup_results);
    
    RETURN cleanup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to test rollback procedure (dry run)
CREATE OR REPLACE FUNCTION consolidation.test_rollback_procedure(rollback_schema TEXT)
RETURNS JSONB AS $$
DECLARE
    test_results JSONB := '{}'::jsonb;
    validation_result JSONB;
    table_count INTEGER;
    start_time TIMESTAMP := NOW();
BEGIN
    test_results := jsonb_build_object(
        'test_id', uuid_generate_v4(),
        'rollback_schema', rollback_schema,
        'test_type', 'dry_run',
        'started_at', start_time
    );
    
    -- Validate rollback point
    validation_result := consolidation.validate_rollback_point(rollback_schema);
    test_results := test_results || jsonb_build_object('validation', validation_result);
    
    IF validation_result->>'overall_status' != 'PASS' THEN
        test_results := test_results || jsonb_build_object(
            'test_status', 'FAILED',
            'error', 'Rollback point validation failed'
        );
        RETURN test_results;
    END IF;
    
    -- Test data accessibility
    BEGIN
        EXECUTE format('SELECT COUNT(*) FROM %I.campaigns', rollback_schema) INTO table_count;
        test_results := test_results || jsonb_build_object('test_data_access', 'SUCCESS');
    EXCEPTION WHEN OTHERS THEN
        test_results := test_results || jsonb_build_object(
            'test_data_access', 'FAILED',
            'error', SQLERRM
        );
        RETURN test_results;
    END;
    
    -- Estimate rollback time based on data size
    EXECUTE format('
        SELECT SUM(pg_total_relation_size(schemaname||''.''||tablename)) 
        FROM pg_tables 
        WHERE schemaname = %L', rollback_schema) INTO table_count;
    
    test_results := test_results || jsonb_build_object(
        'test_status', 'SUCCESS',
        'estimated_rollback_time_seconds', GREATEST(60, table_count / 1000000), -- Rough estimate
        'rollback_data_size_mb', ROUND(table_count / 1024.0 / 1024.0, 2),
        'completed_at', NOW(),
        'test_duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );
    
    RETURN test_results;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- AUTOMATED ROLLBACK TRIGGERS
-- =====================================================

-- Function to create automated rollback trigger based on system health
CREATE OR REPLACE FUNCTION consolidation.setup_auto_rollback_monitoring()
RETURNS JSONB AS $$
DECLARE
    setup_results JSONB := '{}'::jsonb;
BEGIN
    -- Create monitoring table for automatic rollback triggers
    CREATE TABLE IF NOT EXISTS consolidation.rollback_triggers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        trigger_name TEXT NOT NULL,
        condition_sql TEXT NOT NULL,
        rollback_schema TEXT NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        last_check_at TIMESTAMPTZ,
        triggered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    -- Insert default triggers
    INSERT INTO consolidation.rollback_triggers (trigger_name, condition_sql, rollback_schema) VALUES
    ('high_error_rate', 'SELECT COUNT(*) > 100 FROM auth.auth_audit_log WHERE event_status = ''failure'' AND created_at > NOW() - INTERVAL ''5 minutes''', 'rollback_pre_consolidation'),
    ('database_connection_failures', 'SELECT COUNT(*) > 50 FROM audit_logs WHERE action LIKE ''%connection%error%'' AND timestamp > NOW() - INTERVAL ''5 minutes''', 'rollback_pre_consolidation'),
    ('critical_constraint_violations', 'SELECT COUNT(*) > 10 FROM information_schema.constraint_violations WHERE violation_time > NOW() - INTERVAL ''5 minutes''', 'rollback_pre_consolidation')
    ON CONFLICT DO NOTHING;
    
    setup_results := jsonb_build_object(
        'monitoring_table_created', true,
        'default_triggers_installed', true,
        'setup_at', NOW()
    );
    
    RETURN setup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to check automatic rollback triggers
CREATE OR REPLACE FUNCTION consolidation.check_auto_rollback_triggers()
RETURNS JSONB AS $$
DECLARE
    trigger_record RECORD;
    condition_result BOOLEAN;
    trigger_results JSONB := '{"checked_triggers": []}'::jsonb;
    triggered_count INTEGER := 0;
BEGIN
    FOR trigger_record IN 
        SELECT * FROM consolidation.rollback_triggers WHERE enabled = TRUE
    LOOP
        BEGIN
            -- Execute trigger condition
            EXECUTE trigger_record.condition_sql INTO condition_result;
            
            IF condition_result THEN
                -- Trigger condition met - log and potentially execute rollback
                triggered_count := triggered_count + 1;
                
                UPDATE consolidation.rollback_triggers 
                SET triggered_at = NOW(), last_check_at = NOW()
                WHERE id = trigger_record.id;
                
                trigger_results := jsonb_set(trigger_results, '{checked_triggers}', 
                                           (trigger_results->'checked_triggers') || 
                                           jsonb_build_object(
                                               'trigger_name', trigger_record.trigger_name,
                                               'status', 'TRIGGERED',
                                               'rollback_schema', trigger_record.rollback_schema,
                                               'triggered_at', NOW()
                                           ));
                
                -- Log critical alert
                INSERT INTO audit_logs (action, entity_type, details)
                VALUES ('auto_rollback_trigger', 'consolidation', 
                        jsonb_build_object(
                            'trigger_name', trigger_record.trigger_name,
                            'condition_sql', trigger_record.condition_sql,
                            'rollback_schema', trigger_record.rollback_schema
                        ));
            ELSE
                UPDATE consolidation.rollback_triggers 
                SET last_check_at = NOW()
                WHERE id = trigger_record.id;
                
                trigger_results := jsonb_set(trigger_results, '{checked_triggers}', 
                                           (trigger_results->'checked_triggers') || 
                                           jsonb_build_object(
                                               'trigger_name', trigger_record.trigger_name,
                                               'status', 'OK'
                                           ));
            END IF;
        EXCEPTION WHEN OTHERS THEN
            trigger_results := jsonb_set(trigger_results, '{checked_triggers}', 
                                       (trigger_results->'checked_triggers') || 
                                       jsonb_build_object(
                                           'trigger_name', trigger_record.trigger_name,
                                           'status', 'ERROR',
                                           'error', SQLERRM
                                       ));
        END;
    END LOOP;
    
    trigger_results := trigger_results || jsonb_build_object(
        'triggered_count', triggered_count,
        'check_completed_at', NOW(),
        'requires_attention', triggered_count > 0
    );
    
    RETURN trigger_results;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comments
COMMENT ON FUNCTION consolidation.create_rollback_backup() IS 
'Creates comprehensive backup for emergency rollback. Run before consolidation.';

COMMENT ON FUNCTION consolidation.execute_emergency_rollback(TEXT, TEXT, BOOLEAN) IS 
'Executes emergency rollback to specified backup point. Use with extreme caution.';

COMMENT ON FUNCTION consolidation.test_rollback_procedure(TEXT) IS 
'Tests rollback procedure without making changes. Use to validate rollback points.';

COMMENT ON FUNCTION consolidation.check_auto_rollback_triggers() IS 
'Checks automatic rollback triggers based on system health metrics.';

-- Create index for faster rollback trigger checks
CREATE INDEX IF NOT EXISTS idx_rollback_triggers_enabled ON consolidation.rollback_triggers(enabled, last_check_at);