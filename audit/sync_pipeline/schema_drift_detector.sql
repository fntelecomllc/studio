-- ==============================================================================
-- SCHEMA DRIFT DETECTOR - PostgreSQL Contract Validation
-- ==============================================================================
--
-- This SQL script detects drift between the expected database schema and the
-- actual schema, helping identify contract misalignments with the Go backend.
--
-- Usage:
--   psql -d your_database -f schema_drift_detector.sql
--   
-- The script creates temporary functions to analyze schema drift and outputs
-- a report of discrepancies that need attention.
--

-- Set up error handling
\set ON_ERROR_STOP on
\set ECHO all

-- ==============================================================================
-- SETUP
-- ==============================================================================

-- Create temporary schema for drift detection
CREATE SCHEMA IF NOT EXISTS drift_detection;

-- ==============================================================================
-- TYPE VALIDATION
-- ==============================================================================

-- Function to detect int64 fields without proper constraints
CREATE OR REPLACE FUNCTION drift_detection.check_int64_safety()
RETURNS TABLE (
    table_name text,
    column_name text,
    data_type text,
    issue text,
    severity text,
    remediation text
) AS $$
BEGIN
    RETURN QUERY
    -- Check for bigint columns without JavaScript safety constraints
    SELECT 
        c.table_name::text,
        c.column_name::text,
        c.data_type::text,
        'Missing JavaScript integer safety check'::text as issue,
        'HIGH'::text as severity,
        format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I <= 9007199254740991)',
               c.table_name, 
               c.column_name || '_js_safe_check',
               c.column_name)::text as remediation
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
        AND c.data_type = 'bigint'
        AND c.column_name IN (
            'total_domains', 'processed_domains', 'successful_domains', 'failed_domains',
            'total_items', 'processed_items', 'successful_items', 'failed_items',
            'offset', 'total_generated', 'total_validated'
        )
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.check_constraints cc
            WHERE cc.constraint_schema = c.table_schema
                AND cc.constraint_name LIKE c.column_name || '%js_safe%'
        );
    
    -- Check for counter fields without non-negative constraints
    RETURN QUERY
    SELECT 
        c.table_name::text,
        c.column_name::text,
        c.data_type::text,
        'Counter field missing non-negative constraint'::text as issue,
        'MEDIUM'::text as severity,
        format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I >= 0)',
               c.table_name, 
               c.column_name || '_non_negative',
               c.column_name)::text as remediation
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
        AND c.data_type IN ('integer', 'bigint')
        AND c.column_name LIKE ANY(ARRAY['%_count', '%_total', '%_items', 'processed_%', 'successful_%', 'failed_%'])
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.check_constraints cc
            WHERE cc.constraint_schema = c.table_schema
                AND cc.constraint_name LIKE c.column_name || '%non_negative%'
        );
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- ENUM VALIDATION
-- ==============================================================================

-- Function to validate enum consistency with Go backend
CREATE OR REPLACE FUNCTION drift_detection.check_enum_consistency()
RETURNS TABLE (
    enum_name text,
    db_values text[],
    expected_values text[],
    missing_values text[],
    extra_values text[],
    severity text
) AS $$
DECLARE
    campaign_status_expected text[] := ARRAY['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'];
    source_type_expected text[] := ARRAY['DomainGeneration', 'DNSValidation', 'HTTPValidation'];
    processing_status_expected text[] := ARRAY['pending', 'processing', 'completed', 'failed'];
BEGIN
    -- Check campaign status enum
    RETURN QUERY
    WITH campaign_status_check AS (
        SELECT 
            'campaign_status'::text as enum_name,
            array_agg(DISTINCT status ORDER BY status) as db_values
        FROM campaigns
        WHERE status IS NOT NULL
    )
    SELECT 
        csc.enum_name,
        csc.db_values,
        campaign_status_expected,
        array(SELECT unnest(campaign_status_expected) EXCEPT SELECT unnest(csc.db_values)) as missing_values,
        array(SELECT unnest(csc.db_values) EXCEPT SELECT unnest(campaign_status_expected)) as extra_values,
        CASE 
            WHEN 'archived' = ANY(csc.db_values) THEN 'CRITICAL'
            WHEN array_length(array(SELECT unnest(csc.db_values) EXCEPT SELECT unnest(campaign_status_expected)), 1) > 0 THEN 'HIGH'
            ELSE 'INFO'
        END as severity
    FROM campaign_status_check csc;
    
    -- Check source type enum
    RETURN QUERY
    WITH source_type_check AS (
        SELECT 
            'http_source_type'::text as enum_name,
            array_agg(DISTINCT source_type ORDER BY source_type) as db_values
        FROM http_validations
        WHERE source_type IS NOT NULL
    )
    SELECT 
        stc.enum_name,
        stc.db_values,
        source_type_expected,
        array(SELECT unnest(source_type_expected) EXCEPT SELECT unnest(stc.db_values)) as missing_values,
        array(SELECT unnest(stc.db_values) EXCEPT SELECT unnest(source_type_expected)) as extra_values,
        CASE 
            WHEN array_length(array(SELECT unnest(stc.db_values) EXCEPT SELECT unnest(source_type_expected)), 1) > 0 THEN 'HIGH'
            ELSE 'INFO'
        END as severity
    FROM source_type_check stc;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- CONSTRAINT VALIDATION
-- ==============================================================================

-- Function to check for missing or incorrect constraints
CREATE OR REPLACE FUNCTION drift_detection.check_constraint_alignment()
RETURNS TABLE (
    table_name text,
    constraint_type text,
    issue text,
    expected_constraint text,
    severity text
) AS $$
BEGIN
    -- Check for missing UUID constraints
    RETURN QUERY
    SELECT 
        c.table_name::text,
        'UUID Format'::text as constraint_type,
        'Missing UUID format validation'::text as issue,
        format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'')',
               c.table_name, 
               c.column_name || '_uuid_format',
               c.column_name)::text as expected_constraint,
        'MEDIUM'::text as severity
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
        AND c.column_name LIKE '%_id'
        AND c.data_type = 'character varying'
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.check_constraints cc
            WHERE cc.constraint_schema = c.table_schema
                AND cc.constraint_name LIKE '%uuid_format%'
        );
    
    -- Check for missing timestamp constraints
    RETURN QUERY
    SELECT 
        c.table_name::text,
        'Timestamp'::text as constraint_type,
        'Missing timezone awareness'::text as issue,
        format('Ensure all timestamp columns use TIMESTAMPTZ type')::text as expected_constraint,
        'HIGH'::text as severity
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
        AND c.column_name IN ('created_at', 'updated_at', 'deleted_at', 'completed_at', 'started_at')
        AND c.data_type = 'timestamp without time zone';
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- INDEX VALIDATION
-- ==============================================================================

-- Function to check for missing performance-critical indexes
CREATE OR REPLACE FUNCTION drift_detection.check_index_coverage()
RETURNS TABLE (
    table_name text,
    column_name text,
    index_type text,
    issue text,
    suggested_index text,
    severity text
) AS $$
BEGIN
    -- Check for missing indexes on foreign keys
    RETURN QUERY
    SELECT 
        tc.table_name::text,
        kcu.column_name::text,
        'Foreign Key'::text as index_type,
        'Missing index on foreign key'::text as issue,
        format('CREATE INDEX idx_%s_%s ON %I (%I)',
               tc.table_name,
               kcu.column_name,
               tc.table_name,
               kcu.column_name)::text as suggested_index,
        'MEDIUM'::text as severity
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND NOT EXISTS (
            SELECT 1 
            FROM pg_indexes i
            WHERE i.schemaname = tc.table_schema
                AND i.tablename = tc.table_name
                AND i.indexdef LIKE '%' || kcu.column_name || '%'
        );
    
    -- Check for missing indexes on status/state columns
    RETURN QUERY
    SELECT 
        c.table_name::text,
        c.column_name::text,
        'Status Column'::text as index_type,
        'Missing index on frequently queried status column'::text as issue,
        format('CREATE INDEX idx_%s_%s ON %I (%I)',
               c.table_name,
               c.column_name,
               c.table_name,
               c.column_name)::text as suggested_index,
        'LOW'::text as severity
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
        AND c.column_name IN ('status', 'state', 'validation_status', 'processing_status')
        AND NOT EXISTS (
            SELECT 1 
            FROM pg_indexes i
            WHERE i.schemaname = c.table_schema
                AND i.tablename = c.table_name
                AND i.indexdef LIKE '%' || c.column_name || '%'
        );
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- JSON FIELD VALIDATION
-- ==============================================================================

-- Function to validate JSON field structures match Go structs
CREATE OR REPLACE FUNCTION drift_detection.check_json_field_contracts()
RETURNS TABLE (
    table_name text,
    column_name text,
    sample_keys text[],
    issue text,
    severity text
) AS $$
BEGIN
    -- Check dns_records JSON structure
    RETURN QUERY
    SELECT 
        'dns_validations'::text as table_name,
        'dns_records'::text as column_name,
        array_agg(DISTINCT jsonb_object_keys(dns_records))::text[] as sample_keys,
        CASE 
            WHEN COUNT(DISTINCT jsonb_typeof(dns_records)) > 1 THEN 'Inconsistent JSON structure'
            WHEN NOT EXISTS (SELECT 1 WHERE dns_records ? 'A' OR dns_records ? 'CNAME') THEN 'Missing expected DNS record types'
            ELSE 'Check JSON structure matches Go DNSRecord type'
        END as issue,
        'MEDIUM'::text as severity
    FROM dns_validations
    WHERE dns_records IS NOT NULL
    GROUP BY table_name, column_name
    HAVING COUNT(*) > 0;
    
    -- Check request/response headers JSON structure
    RETURN QUERY
    SELECT 
        'http_validations'::text as table_name,
        'request_headers'::text as column_name,
        array_agg(DISTINCT jsonb_object_keys(request_headers))::text[] as sample_keys,
        'Verify headers match Go http.Header type structure'::text as issue,
        'LOW'::text as severity
    FROM http_validations
    WHERE request_headers IS NOT NULL
    GROUP BY table_name, column_name
    HAVING COUNT(*) > 0
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- GENERATE DRIFT REPORT
-- ==============================================================================

-- Main function to generate comprehensive drift report
CREATE OR REPLACE FUNCTION drift_detection.generate_drift_report()
RETURNS TABLE (
    check_category text,
    severity text,
    issue_count bigint
) AS $$
BEGIN
    -- Create temporary table for results
    CREATE TEMP TABLE IF NOT EXISTS drift_results (
        check_category text,
        check_name text,
        severity text,
        details jsonb
    );
    
    -- Run int64 safety checks
    INSERT INTO drift_results
    SELECT 
        'Type Safety' as check_category,
        'int64_safety' as check_name,
        severity,
        jsonb_build_object(
            'table', table_name,
            'column', column_name,
            'issue', issue,
            'fix', remediation
        ) as details
    FROM drift_detection.check_int64_safety();
    
    -- Run enum consistency checks
    INSERT INTO drift_results
    SELECT 
        'Enum Consistency' as check_category,
        'enum_values' as check_name,
        severity,
        jsonb_build_object(
            'enum', enum_name,
            'db_values', db_values,
            'expected', expected_values,
            'extra', extra_values,
            'missing', missing_values
        ) as details
    FROM drift_detection.check_enum_consistency();
    
    -- Run constraint checks
    INSERT INTO drift_results
    SELECT 
        'Constraints' as check_category,
        'constraint_alignment' as check_name,
        severity,
        jsonb_build_object(
            'table', table_name,
            'type', constraint_type,
            'issue', issue,
            'fix', expected_constraint
        ) as details
    FROM drift_detection.check_constraint_alignment();
    
    -- Run index checks
    INSERT INTO drift_results
    SELECT 
        'Performance' as check_category,
        'index_coverage' as check_name,
        severity,
        jsonb_build_object(
            'table', table_name,
            'column', column_name,
            'type', index_type,
            'issue', issue,
            'fix', suggested_index
        ) as details
    FROM drift_detection.check_index_coverage();
    
    -- Run JSON contract checks
    INSERT INTO drift_results
    SELECT 
        'JSON Contracts' as check_category,
        'json_structure' as check_name,
        severity,
        jsonb_build_object(
            'table', table_name,
            'column', column_name,
            'sample_keys', sample_keys,
            'issue', issue
        ) as details
    FROM drift_detection.check_json_field_contracts();
    
    -- Generate summary
    RETURN QUERY
    SELECT 
        check_category,
        severity,
        COUNT(*) as issue_count
    FROM drift_results
    GROUP BY check_category, severity
    ORDER BY 
        CASE severity
            WHEN 'CRITICAL' THEN 1
            WHEN 'HIGH' THEN 2
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 4
            ELSE 5
        END,
        check_category;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- EXECUTE DRIFT DETECTION
-- ==============================================================================

\echo '=============================================='
\echo 'DATABASE SCHEMA DRIFT DETECTION REPORT'
\echo '=============================================='
\echo ''

-- Generate and display summary
\echo 'SUMMARY BY CATEGORY AND SEVERITY:'
\echo '---------------------------------'
SELECT * FROM drift_detection.generate_drift_report();

\echo ''
\echo 'CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION:'
\echo '----------------------------------------------'
SELECT 
    check_category,
    check_name,
    jsonb_pretty(details) as issue_details
FROM drift_results
WHERE severity = 'CRITICAL'
ORDER BY check_category, check_name;

\echo ''
\echo 'HIGH PRIORITY ISSUES:'
\echo '--------------------'
SELECT 
    check_category,
    check_name,
    jsonb_pretty(details) as issue_details
FROM drift_results
WHERE severity = 'HIGH'
ORDER BY check_category, check_name
LIMIT 10;

\echo ''
\echo 'REMEDIATION SCRIPT GENERATION:'
\echo '-----------------------------'
\echo 'To generate a remediation script, run:'
\echo 'SELECT drift_detection.generate_remediation_script();'

-- Function to generate remediation SQL
CREATE OR REPLACE FUNCTION drift_detection.generate_remediation_script()
RETURNS text AS $$
DECLARE
    script text := '';
    rec record;
BEGIN
    script := '-- Auto-generated remediation script for schema drift' || E'\n';
    script := script || '-- Generated: ' || NOW()::text || E'\n\n';
    
    -- Add int64 safety fixes
    script := script || '-- INT64 SAFETY CONSTRAINTS' || E'\n';
    FOR rec IN SELECT * FROM drift_detection.check_int64_safety() WHERE severity IN ('CRITICAL', 'HIGH')
    LOOP
        script := script || rec.remediation || ';' || E'\n';
    END LOOP;
    
    -- Add constraint fixes
    script := script || E'\n' || '-- MISSING CONSTRAINTS' || E'\n';
    FOR rec IN SELECT * FROM drift_detection.check_constraint_alignment() WHERE severity IN ('CRITICAL', 'HIGH')
    LOOP
        script := script || rec.expected_constraint || ';' || E'\n';
    END LOOP;
    
    -- Add index creation
    script := script || E'\n' || '-- PERFORMANCE INDEXES' || E'\n';
    FOR rec IN SELECT * FROM drift_detection.check_index_coverage() WHERE severity = 'MEDIUM'
    LOOP
        script := script || rec.suggested_index || ';' || E'\n';
    END LOOP;
    
    RETURN script;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- CLEANUP
-- ==============================================================================

-- Note: Functions are kept for future use
-- To remove them, uncomment the following:
-- DROP SCHEMA drift_detection CASCADE;

\echo ''
\echo 'Drift detection complete. Review the results above.'
\echo ''