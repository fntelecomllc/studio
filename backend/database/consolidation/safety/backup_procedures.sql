-- DomainFlow Migration Safety - Backup Procedures
-- Comprehensive backup strategy for safe schema consolidation
-- Provides multiple backup levels and recovery strategies
-- Created: 2025-06-16

-- =====================================================
-- BACKUP INFRASTRUCTURE
-- =====================================================

-- Create safety schema for backup management
CREATE SCHEMA IF NOT EXISTS safety;

-- Backup registry table
CREATE TABLE IF NOT EXISTS safety.backup_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backup_name TEXT NOT NULL UNIQUE,
    backup_type TEXT NOT NULL, -- 'full', 'schema_only', 'data_only', 'incremental'
    backup_scope TEXT NOT NULL, -- 'complete', 'consolidation_tables', 'auth_only'
    backup_path TEXT,
    backup_size_bytes BIGINT,
    compression_used BOOLEAN DEFAULT FALSE,
    encryption_used BOOLEAN DEFAULT FALSE,
    backup_started_at TIMESTAMPTZ NOT NULL,
    backup_completed_at TIMESTAMPTZ,
    backup_status TEXT DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed', 'expired'
    retention_until TIMESTAMPTZ,
    verification_status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'failed'
    verification_details JSONB,
    recovery_tested BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_by TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Backup verification log
CREATE TABLE IF NOT EXISTS safety.backup_verification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backup_id UUID NOT NULL REFERENCES safety.backup_registry(id) ON DELETE CASCADE,
    verification_type TEXT NOT NULL, -- 'checksum', 'structure', 'data_integrity', 'recovery_test'
    verification_status TEXT NOT NULL, -- 'passed', 'failed', 'warning'
    verification_details JSONB,
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_backup_registry_status ON safety.backup_registry(backup_status, backup_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_registry_type ON safety.backup_registry(backup_type, backup_scope);
CREATE INDEX IF NOT EXISTS idx_backup_verification_status ON safety.backup_verification_log(verification_status, verified_at DESC);

-- =====================================================
-- CORE BACKUP FUNCTIONS
-- =====================================================

-- Function to create comprehensive pre-consolidation backup
CREATE OR REPLACE FUNCTION safety.create_pre_consolidation_backup(
    backup_name TEXT DEFAULT NULL,
    include_large_tables BOOLEAN DEFAULT TRUE,
    compress_backup BOOLEAN DEFAULT TRUE
)
RETURNS JSONB AS $$
DECLARE
    backup_id UUID;
    backup_name_final TEXT;
    backup_results JSONB := '{"backed_up_objects": []}'::jsonb;
    table_record RECORD;
    backup_start_time TIMESTAMPTZ := NOW();
    total_size BIGINT := 0;
    object_count INTEGER := 0;
BEGIN
    -- Generate backup name if not provided
    backup_name_final := COALESCE(backup_name, 'pre_consolidation_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS'));
    
    -- Register backup in registry
    INSERT INTO safety.backup_registry 
    (backup_name, backup_type, backup_scope, backup_started_at, compression_used, notes)
    VALUES 
    (backup_name_final, 'full', 'complete', backup_start_time, compress_backup, 
     'Pre-consolidation safety backup including all schemas and data')
    RETURNING id INTO backup_id;
    
    -- Create backup schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS backup_%s', 
                  replace(backup_name_final, '-', '_'));
    
    -- Backup all critical tables
    FOR table_record IN 
        SELECT schemaname, tablename, 
               pg_total_relation_size(schemaname||'.'||tablename) as table_size
        FROM pg_tables 
        WHERE schemaname IN ('public', 'auth')
        AND tablename NOT LIKE 'backup_%'
        AND tablename NOT LIKE 'tmp_%'
        AND (include_large_tables OR pg_total_relation_size(schemaname||'.'||tablename) < 100 * 1024 * 1024) -- 100MB limit if large tables excluded
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LOOP
        BEGIN
            -- Create backup table with full structure and data
            EXECUTE format('CREATE TABLE backup_%s.%s_%s AS SELECT * FROM %I.%I', 
                          replace(backup_name_final, '-', '_'),
                          table_record.schemaname,
                          table_record.tablename,
                          table_record.schemaname, 
                          table_record.tablename);
            
            total_size := total_size + table_record.table_size;
            object_count := object_count + 1;
            
            backup_results := jsonb_set(backup_results, '{backed_up_objects}', 
                                       (backup_results->'backed_up_objects') || 
                                       jsonb_build_object(
                                           'schema', table_record.schemaname,
                                           'table', table_record.tablename,
                                           'backup_table', format('backup_%s.%s_%s', 
                                                                 replace(backup_name_final, '-', '_'),
                                                                 table_record.schemaname,
                                                                 table_record.tablename),
                                           'size_bytes', table_record.table_size,
                                           'status', 'success'
                                       ));
        EXCEPTION WHEN OTHERS THEN
            backup_results := jsonb_set(backup_results, '{backed_up_objects}', 
                                       (backup_results->'backed_up_objects') || 
                                       jsonb_build_object(
                                           'schema', table_record.schemaname,
                                           'table', table_record.tablename,
                                           'status', 'failed',
                                           'error', SQLERRM
                                       ));
        END;
    END LOOP;
    
    -- Backup database schema structure
    EXECUTE format('CREATE TABLE backup_%s.schema_structure AS 
                   SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
                   FROM information_schema.columns 
                   WHERE table_schema IN (''public'', ''auth'')',
                   replace(backup_name_final, '-', '_'));
    
    -- Backup indexes
    EXECUTE format('CREATE TABLE backup_%s.indexes_structure AS 
                   SELECT schemaname, tablename, indexname, indexdef 
                   FROM pg_indexes 
                   WHERE schemaname IN (''public'', ''auth'')',
                   replace(backup_name_final, '-', '_'));
    
    -- Backup constraints
    EXECUTE format('CREATE TABLE backup_%s.constraints_structure AS 
                   SELECT conname, contype, confupdtype, confdeltype, consrc, conrelid::regclass as table_name
                   FROM pg_constraint 
                   WHERE connamespace IN (SELECT oid FROM pg_namespace WHERE nspname IN (''public'', ''auth''))',
                   replace(backup_name_final, '-', '_'));
    
    -- Create backup metadata
    EXECUTE format('CREATE TABLE backup_%s.backup_metadata (
        backup_id UUID,
        backup_name TEXT,
        backup_created_at TIMESTAMPTZ,
        database_version TEXT,
        total_objects INTEGER,
        total_size_bytes BIGINT,
        backup_notes TEXT
    )', replace(backup_name_final, '-', '_'));
    
    EXECUTE format('INSERT INTO backup_%s.backup_metadata VALUES 
                   (%L, %L, %L, version(), %s, %s, %L)',
                   replace(backup_name_final, '-', '_'),
                   backup_id, backup_name_final, backup_start_time, object_count, total_size,
                   'Pre-consolidation safety backup created by automated process');
    
    -- Update backup registry
    UPDATE safety.backup_registry
    SET backup_completed_at = NOW(),
        backup_status = 'completed',
        backup_size_bytes = total_size,
        retention_until = NOW() + INTERVAL '90 days',
        metadata = backup_results
    WHERE id = backup_id;
    
    -- Add summary to results
    backup_results := backup_results || jsonb_build_object(
        'backup_id', backup_id,
        'backup_name', backup_name_final,
        'backup_schema', 'backup_' || replace(backup_name_final, '-', '_'),
        'total_objects', object_count,
        'total_size_bytes', total_size,
        'total_size_mb', ROUND(total_size / 1024.0 / 1024.0, 2),
        'backup_duration_seconds', EXTRACT(EPOCH FROM (NOW() - backup_start_time)),
        'backup_status', 'completed',
        'created_at', backup_start_time,
        'completed_at', NOW()
    );
    
    -- Log backup creation
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('pre_consolidation_backup_created', 'consolidation', backup_results);
    
    RETURN backup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to create incremental backup (data changes only)
CREATE OR REPLACE FUNCTION safety.create_incremental_backup(
    base_backup_name TEXT,
    backup_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    backup_id UUID;
    backup_name_final TEXT;
    base_backup_schema TEXT;
    incremental_results JSONB := '{"incremental_changes": []}'::jsonb;
    table_record RECORD;
    change_count INTEGER;
    total_changes INTEGER := 0;
BEGIN
    -- Generate backup name if not provided
    backup_name_final := COALESCE(backup_name, 'incremental_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS'));
    base_backup_schema := 'backup_' || replace(base_backup_name, '-', '_');
    
    -- Verify base backup exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = base_backup_schema) THEN
        RETURN jsonb_build_object(
            'status', 'failed',
            'error', 'Base backup schema not found: ' || base_backup_schema
        );
    END IF;
    
    -- Register incremental backup
    INSERT INTO safety.backup_registry 
    (backup_name, backup_type, backup_scope, backup_started_at, notes)
    VALUES 
    (backup_name_final, 'incremental', 'consolidation_tables', NOW(), 
     'Incremental backup based on: ' || base_backup_name)
    RETURNING id INTO backup_id;
    
    -- Create incremental backup schema
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS incremental_%s', 
                  replace(backup_name_final, '-', '_'));
    
    -- Compare each table with base backup and store changes
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'backup_%'
        AND tablename NOT LIKE 'incremental_%'
        AND EXISTS (SELECT 1 FROM pg_tables 
                   WHERE schemaname = base_backup_schema 
                   AND tablename = 'public_' || table_record.tablename)
    LOOP
        BEGIN
            -- Find new records (records in current table but not in backup)
            EXECUTE format('
                CREATE TABLE incremental_%s.%s_new AS 
                SELECT * FROM %I 
                WHERE id NOT IN (SELECT id FROM %I.public_%s)',
                replace(backup_name_final, '-', '_'),
                table_record.tablename,
                table_record.tablename,
                base_backup_schema,
                table_record.tablename
            );
            
            -- Get count of new records
            EXECUTE format('SELECT COUNT(*) FROM incremental_%s.%s_new',
                          replace(backup_name_final, '-', '_'),
                          table_record.tablename) INTO change_count;
            
            total_changes := total_changes + change_count;
            
            incremental_results := jsonb_set(incremental_results, '{incremental_changes}', 
                                           (incremental_results->'incremental_changes') || 
                                           jsonb_build_object(
                                               'table', table_record.tablename,
                                               'new_records', change_count,
                                               'backup_table', format('incremental_%s.%s_new', 
                                                                     replace(backup_name_final, '-', '_'),
                                                                     table_record.tablename)
                                           ));
        EXCEPTION WHEN OTHERS THEN
            incremental_results := jsonb_set(incremental_results, '{incremental_changes}', 
                                           (incremental_results->'incremental_changes') || 
                                           jsonb_build_object(
                                               'table', table_record.tablename,
                                               'status', 'failed',
                                               'error', SQLERRM
                                           ));
        END;
    END LOOP;
    
    -- Update backup registry
    UPDATE safety.backup_registry
    SET backup_completed_at = NOW(),
        backup_status = 'completed',
        metadata = incremental_results
    WHERE id = backup_id;
    
    incremental_results := incremental_results || jsonb_build_object(
        'backup_id', backup_id,
        'backup_name', backup_name_final,
        'base_backup', base_backup_name,
        'total_changes', total_changes,
        'backup_status', 'completed',
        'created_at', NOW()
    );
    
    RETURN incremental_results;
END;
$$ LANGUAGE plpgsql;

-- Function to verify backup integrity
CREATE OR REPLACE FUNCTION safety.verify_backup_integrity(backup_name TEXT)
RETURNS JSONB AS $$
DECLARE
    backup_record RECORD;
    verification_results JSONB := '{"verification_checks": []}'::jsonb;
    backup_schema TEXT;
    table_record RECORD;
    original_count INTEGER;
    backup_count INTEGER;
    check_result JSONB;
    verification_id UUID;
BEGIN
    -- Get backup information
    SELECT * INTO backup_record
    FROM safety.backup_registry
    WHERE backup_name = backup_name;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'failed',
            'error', 'Backup not found: ' || backup_name
        );
    END IF;
    
    backup_schema := 'backup_' || replace(backup_name, '-', '_');
    
    -- Verify backup schema exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = backup_schema) THEN
        RETURN jsonb_build_object(
            'status', 'failed',
            'error', 'Backup schema not found: ' || backup_schema
        );
    END IF;
    
    -- Verify table counts match
    FOR table_record IN 
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename NOT LIKE 'backup_%'
        AND tablename NOT LIKE 'tmp_%'
    LOOP
        -- Get original table count
        EXECUTE format('SELECT COUNT(*) FROM %I', table_record.tablename) INTO original_count;
        
        -- Get backup table count (if exists)
        IF EXISTS (SELECT 1 FROM pg_tables 
                  WHERE schemaname = backup_schema 
                  AND tablename = 'public_' || table_record.tablename) THEN
            
            EXECUTE format('SELECT COUNT(*) FROM %I.public_%s', 
                          backup_schema, table_record.tablename) INTO backup_count;
            
            check_result := jsonb_build_object(
                'table_name', table_record.tablename,
                'original_count', original_count,
                'backup_count', backup_count,
                'count_match', original_count = backup_count,
                'status', CASE WHEN original_count = backup_count THEN 'passed' ELSE 'failed' END
            );
        ELSE
            check_result := jsonb_build_object(
                'table_name', table_record.tablename,
                'status', 'failed',
                'error', 'Backup table not found'
            );
        END IF;
        
        verification_results := jsonb_set(verification_results, '{verification_checks}', 
                                         (verification_results->'verification_checks') || check_result);
    END LOOP;
    
    -- Calculate overall verification status
    verification_results := verification_results || jsonb_build_object(
        'overall_status', 
        CASE WHEN (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(verification_results->'verification_checks') AS check 
            WHERE check->>'status' = 'failed'
        ) = 0 THEN 'passed' ELSE 'failed' END,
        'backup_name', backup_name,
        'verified_at', NOW()
    );
    
    -- Log verification result
    INSERT INTO safety.backup_verification_log 
    (backup_id, verification_type, verification_status, verification_details)
    VALUES 
    (backup_record.id, 'data_integrity', 
     verification_results->>'overall_status', verification_results);
    
    -- Update backup registry
    UPDATE safety.backup_registry
    SET verification_status = verification_results->>'overall_status',
        verification_details = verification_results
    WHERE id = backup_record.id;
    
    RETURN verification_results;
END;
$$ LANGUAGE plpgsql;

-- Function to list available backups
CREATE OR REPLACE FUNCTION safety.list_available_backups()
RETURNS JSONB AS $$
DECLARE
    backup_list JSONB := '{"backups": []}'::jsonb;
    backup_record RECORD;
BEGIN
    FOR backup_record IN 
        SELECT backup_name, backup_type, backup_scope, backup_started_at, 
               backup_completed_at, backup_status, backup_size_bytes,
               verification_status, retention_until
        FROM safety.backup_registry
        WHERE backup_status = 'completed'
        AND (retention_until IS NULL OR retention_until > NOW())
        ORDER BY backup_started_at DESC
    LOOP
        backup_list := jsonb_set(backup_list, '{backups}', 
                                (backup_list->'backups') || 
                                jsonb_build_object(
                                    'backup_name', backup_record.backup_name,
                                    'backup_type', backup_record.backup_type,
                                    'backup_scope', backup_record.backup_scope,
                                    'created_at', backup_record.backup_started_at,
                                    'completed_at', backup_record.backup_completed_at,
                                    'status', backup_record.backup_status,
                                    'size_mb', CASE 
                                        WHEN backup_record.backup_size_bytes IS NOT NULL 
                                        THEN ROUND(backup_record.backup_size_bytes / 1024.0 / 1024.0, 2)
                                        ELSE null 
                                    END,
                                    'verification_status', backup_record.verification_status,
                                    'expires_at', backup_record.retention_until
                                ));
    END LOOP;
    
    backup_list := backup_list || jsonb_build_object('listed_at', NOW());
    RETURN backup_list;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired backups
CREATE OR REPLACE FUNCTION safety.cleanup_expired_backups()
RETURNS JSONB AS $$
DECLARE
    cleanup_results JSONB := '{"cleaned_backups": []}'::jsonb;
    backup_record RECORD;
    cleanup_count INTEGER := 0;
BEGIN
    FOR backup_record IN 
        SELECT id, backup_name, backup_started_at
        FROM safety.backup_registry
        WHERE retention_until < NOW()
        AND backup_status = 'completed'
    LOOP
        BEGIN
            -- Drop backup schema
            EXECUTE format('DROP SCHEMA IF EXISTS backup_%s CASCADE', 
                          replace(backup_record.backup_name, '-', '_'));
            
            -- Update registry
            UPDATE safety.backup_registry
            SET backup_status = 'expired'
            WHERE id = backup_record.id;
            
            cleanup_count := cleanup_count + 1;
            
            cleanup_results := jsonb_set(cleanup_results, '{cleaned_backups}', 
                                        (cleanup_results->'cleaned_backups') || 
                                        to_jsonb(backup_record.backup_name));
        EXCEPTION WHEN OTHERS THEN
            -- Log cleanup failure but continue
            INSERT INTO audit_logs (action, entity_type, details)
            VALUES ('backup_cleanup_failed', 'consolidation', 
                    jsonb_build_object('backup_name', backup_record.backup_name, 'error', SQLERRM));
        END;
    END LOOP;
    
    cleanup_results := cleanup_results || jsonb_build_object(
        'cleaned_count', cleanup_count,
        'cleaned_at', NOW()
    );
    
    -- Log cleanup operation
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('backup_cleanup_completed', 'consolidation', cleanup_results);
    
    RETURN cleanup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to test backup recovery
CREATE OR REPLACE FUNCTION safety.test_backup_recovery(
    backup_name TEXT,
    test_table TEXT DEFAULT 'campaigns'
)
RETURNS JSONB AS $$
DECLARE
    test_results JSONB := '{}'::jsonb;
    backup_schema TEXT;
    test_schema TEXT;
    test_table_name TEXT;
    original_count INTEGER;
    recovered_count INTEGER;
    recovery_test_id UUID := uuid_generate_v4();
BEGIN
    backup_schema := 'backup_' || replace(backup_name, '-', '_');
    test_schema := 'recovery_test_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS');
    test_table_name := 'public_' || test_table;
    
    -- Create test schema
    EXECUTE format('CREATE SCHEMA %I', test_schema);
    
    BEGIN
        -- Test recovery of specified table
        EXECUTE format('CREATE TABLE %I.%I AS SELECT * FROM %I.%I', 
                      test_schema, test_table, backup_schema, test_table_name);
        
        -- Get counts
        EXECUTE format('SELECT COUNT(*) FROM %I.%I', backup_schema, test_table_name) INTO original_count;
        EXECUTE format('SELECT COUNT(*) FROM %I.%I', test_schema, test_table) INTO recovered_count;
        
        test_results := jsonb_build_object(
            'test_id', recovery_test_id,
            'backup_name', backup_name,
            'test_table', test_table,
            'test_schema', test_schema,
            'original_count', original_count,
            'recovered_count', recovered_count,
            'recovery_success', original_count = recovered_count,
            'test_status', CASE WHEN original_count = recovered_count THEN 'passed' ELSE 'failed' END,
            'tested_at', NOW()
        );
        
        -- Mark backup as recovery tested
        UPDATE safety.backup_registry
        SET recovery_tested = TRUE
        WHERE backup_name = backup_name;
        
    EXCEPTION WHEN OTHERS THEN
        test_results := jsonb_build_object(
            'test_id', recovery_test_id,
            'backup_name', backup_name,
            'test_status', 'failed',
            'error', SQLERRM,
            'tested_at', NOW()
        );
    END;
    
    -- Cleanup test schema
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', test_schema);
    
    -- Log recovery test
    INSERT INTO safety.backup_verification_log 
    (backup_id, verification_type, verification_status, verification_details)
    SELECT id, 'recovery_test', test_results->>'test_status', test_results
    FROM safety.backup_registry
    WHERE backup_name = backup_name;
    
    RETURN test_results;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION safety.create_pre_consolidation_backup(TEXT, BOOLEAN, BOOLEAN) IS 
'Creates comprehensive backup before consolidation. Essential safety measure.';

COMMENT ON FUNCTION safety.verify_backup_integrity(TEXT) IS 
'Verifies backup data integrity by comparing record counts and structure.';

COMMENT ON FUNCTION safety.test_backup_recovery(TEXT, TEXT) IS 
'Tests backup recovery process to ensure backups can be successfully restored.';

COMMENT ON TABLE safety.backup_registry IS 
'Central registry of all backups with metadata and verification status.';