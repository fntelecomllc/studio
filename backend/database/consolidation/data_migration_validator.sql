-- DomainFlow Data Migration Validator
-- Comprehensive data integrity validation procedures for schema consolidation
-- Ensures data consistency and integrity during migration process
-- Created: 2025-06-16

-- =====================================================
-- CORE VALIDATION FUNCTIONS
-- =====================================================

-- Function to validate referential integrity across all tables
CREATE OR REPLACE FUNCTION consolidation.validate_referential_integrity()
RETURNS JSONB AS $$
DECLARE
    validation_results JSONB := '{"integrity_checks": []}'::jsonb;
    orphaned_count INTEGER;
    check_result JSONB;
BEGIN
    -- Check campaigns -> users referential integrity
    SELECT COUNT(*) INTO orphaned_count
    FROM campaigns c
    LEFT JOIN auth.users u ON c.user_id = u.id
    WHERE c.user_id IS NOT NULL AND u.id IS NULL;
    
    check_result := jsonb_build_object(
        'check_name', 'campaigns_users_integrity',
        'orphaned_records', orphaned_count,
        'status', CASE WHEN orphaned_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{integrity_checks}', 
                                   (validation_results->'integrity_checks') || check_result);
    
    -- Check generated_domains -> campaigns integrity
    SELECT COUNT(*) INTO orphaned_count
    FROM generated_domains gd
    LEFT JOIN campaigns c ON gd.domain_generation_campaign_id = c.id
    WHERE c.id IS NULL;
    
    check_result := jsonb_build_object(
        'check_name', 'generated_domains_campaigns_integrity',
        'orphaned_records', orphaned_count,
        'status', CASE WHEN orphaned_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{integrity_checks}', 
                                   (validation_results->'integrity_checks') || check_result);
    
    -- Check dns_validation_results -> campaigns integrity
    SELECT COUNT(*) INTO orphaned_count
    FROM dns_validation_results dvr
    LEFT JOIN campaigns c ON dvr.dns_campaign_id = c.id
    WHERE c.id IS NULL;
    
    check_result := jsonb_build_object(
        'check_name', 'dns_validation_campaigns_integrity',
        'orphaned_records', orphaned_count,
        'status', CASE WHEN orphaned_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{integrity_checks}', 
                                   (validation_results->'integrity_checks') || check_result);
    
    -- Check http_keyword_results -> campaigns integrity
    SELECT COUNT(*) INTO orphaned_count
    FROM http_keyword_results hkr
    LEFT JOIN campaigns c ON hkr.http_keyword_campaign_id = c.id
    WHERE c.id IS NULL;
    
    check_result := jsonb_build_object(
        'check_name', 'http_keyword_campaigns_integrity',
        'orphaned_records', orphaned_count,
        'status', CASE WHEN orphaned_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{integrity_checks}', 
                                   (validation_results->'integrity_checks') || check_result);
    
    -- Check auth.sessions -> auth.users integrity
    SELECT COUNT(*) INTO orphaned_count
    FROM auth.sessions s
    LEFT JOIN auth.users u ON s.user_id = u.id
    WHERE u.id IS NULL;
    
    check_result := jsonb_build_object(
        'check_name', 'sessions_users_integrity',
        'orphaned_records', orphaned_count,
        'status', CASE WHEN orphaned_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{integrity_checks}', 
                                   (validation_results->'integrity_checks') || check_result);
    
    -- Check auth.user_roles integrity
    SELECT COUNT(*) INTO orphaned_count
    FROM auth.user_roles ur
    LEFT JOIN auth.users u ON ur.user_id = u.id
    LEFT JOIN auth.roles r ON ur.role_id = r.id
    WHERE u.id IS NULL OR r.id IS NULL;
    
    check_result := jsonb_build_object(
        'check_name', 'user_roles_integrity',
        'orphaned_records', orphaned_count,
        'status', CASE WHEN orphaned_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{integrity_checks}', 
                                   (validation_results->'integrity_checks') || check_result);
    
    -- Calculate overall status
    validation_results := validation_results || jsonb_build_object(
        'overall_status', 
        CASE WHEN (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(validation_results->'integrity_checks') AS check 
            WHERE check->>'status' = 'FAIL'
        ) = 0 THEN 'PASS' ELSE 'FAIL' END,
        'validated_at', NOW()
    );
    
    RETURN validation_results;
END;
$$ LANGUAGE plpgsql;

-- Function to validate data consistency between original and shadow tables
CREATE OR REPLACE FUNCTION consolidation.validate_shadow_table_consistency()
RETURNS JSONB AS $$
DECLARE
    validation_results JSONB := '{"consistency_checks": []}'::jsonb;
    table_record RECORD;
    original_count INTEGER;
    shadow_count INTEGER;
    check_result JSONB;
BEGIN
    FOR table_record IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        AND table_name IN ('campaigns', 'generated_domains', 'personas', 'proxies', 'keyword_sets')
        AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = table_record.table_name || '_v2')
    LOOP
        -- Get record counts
        EXECUTE format('SELECT COUNT(*) FROM %I', table_record.table_name) INTO original_count;
        EXECUTE format('SELECT COUNT(*) FROM %I_v2', table_record.table_name) INTO shadow_count;
        
        check_result := jsonb_build_object(
            'table_name', table_record.table_name,
            'original_count', original_count,
            'shadow_count', shadow_count,
            'count_match', original_count = shadow_count,
            'status', CASE WHEN original_count = shadow_count THEN 'PASS' ELSE 'FAIL' END
        );
        
        validation_results := jsonb_set(validation_results, '{consistency_checks}', 
                                       (validation_results->'consistency_checks') || check_result);
    END LOOP;
    
    -- Calculate overall consistency status
    validation_results := validation_results || jsonb_build_object(
        'overall_status', 
        CASE WHEN (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(validation_results->'consistency_checks') AS check 
            WHERE (check->>'count_match')::BOOLEAN = false
        ) = 0 THEN 'PASS' ELSE 'FAIL' END,
        'validated_at', NOW()
    );
    
    RETURN validation_results;
END;
$$ LANGUAGE plpgsql;

-- Function to validate critical business rules and constraints
CREATE OR REPLACE FUNCTION consolidation.validate_business_rules()
RETURNS JSONB AS $$
DECLARE
    validation_results JSONB := '{"business_rule_checks": []}'::jsonb;
    violation_count INTEGER;
    check_result JSONB;
BEGIN
    -- Check for campaigns with invalid progress percentages
    SELECT COUNT(*) INTO violation_count
    FROM campaigns 
    WHERE progress_percentage < 0 OR progress_percentage > 100;
    
    check_result := jsonb_build_object(
        'rule_name', 'valid_progress_percentage',
        'violations', violation_count,
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{business_rule_checks}', 
                                   (validation_results->'business_rule_checks') || check_result);
    
    -- Check for campaigns with processed_items > total_items
    SELECT COUNT(*) INTO violation_count
    FROM campaigns 
    WHERE processed_items > total_items AND total_items > 0;
    
    check_result := jsonb_build_object(
        'rule_name', 'processed_not_exceeding_total',
        'violations', violation_count,
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{business_rule_checks}', 
                                   (validation_results->'business_rule_checks') || check_result);
    
    -- Check for users without valid email addresses
    SELECT COUNT(*) INTO violation_count
    FROM auth.users 
    WHERE email IS NULL OR email = '' OR email NOT LIKE '%@%';
    
    check_result := jsonb_build_object(
        'rule_name', 'valid_user_emails',
        'violations', violation_count,
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{business_rule_checks}', 
                                   (validation_results->'business_rule_checks') || check_result);
    
    -- Check for active sessions with past expiration dates
    SELECT COUNT(*) INTO violation_count
    FROM auth.sessions 
    WHERE is_active = TRUE AND expires_at < NOW();
    
    check_result := jsonb_build_object(
        'rule_name', 'valid_active_sessions',
        'violations', violation_count,
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{business_rule_checks}', 
                                   (validation_results->'business_rule_checks') || check_result);
    
    -- Check for personas with invalid configuration JSON
    SELECT COUNT(*) INTO violation_count
    FROM personas 
    WHERE config_details IS NULL OR NOT jsonb_typeof(config_details) = 'object';
    
    check_result := jsonb_build_object(
        'rule_name', 'valid_persona_config',
        'violations', violation_count,
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{business_rule_checks}', 
                                   (validation_results->'business_rule_checks') || check_result);
    
    -- Check for duplicate domain names within same campaign
    SELECT COUNT(*) INTO violation_count
    FROM (
        SELECT domain_generation_campaign_id, domain_name, COUNT(*) as dup_count
        FROM generated_domains
        GROUP BY domain_generation_campaign_id, domain_name
        HAVING COUNT(*) > 1
    ) duplicates;
    
    check_result := jsonb_build_object(
        'rule_name', 'unique_domains_per_campaign',
        'violations', violation_count,
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{business_rule_checks}', 
                                   (validation_results->'business_rule_checks') || check_result);
    
    -- Calculate overall business rules status
    validation_results := validation_results || jsonb_build_object(
        'overall_status', 
        CASE WHEN (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(validation_results->'business_rule_checks') AS check 
            WHERE check->>'status' = 'FAIL'
        ) = 0 THEN 'PASS' ELSE 'FAIL' END,
        'validated_at', NOW()
    );
    
    RETURN validation_results;
END;
$$ LANGUAGE plpgsql;

-- Function to validate data type consistency and constraints
CREATE OR REPLACE FUNCTION consolidation.validate_data_types()
RETURNS JSONB AS $$
DECLARE
    validation_results JSONB := '{"data_type_checks": []}'::jsonb;
    violation_count INTEGER;
    check_result JSONB;
BEGIN
    -- Check for invalid UUID formats in campaigns.user_id
    SELECT COUNT(*) INTO violation_count
    FROM campaigns 
    WHERE user_id IS NOT NULL 
    AND user_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    
    check_result := jsonb_build_object(
        'check_name', 'valid_campaign_user_id_format',
        'violations', violation_count,
        'description', 'Campaigns with invalid UUID format in user_id',
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{data_type_checks}', 
                                   (validation_results->'data_type_checks') || check_result);
    
    -- Check for invalid timestamp values (future dates in created_at)
    SELECT COUNT(*) INTO violation_count
    FROM campaigns 
    WHERE created_at > NOW() + INTERVAL '1 hour';
    
    check_result := jsonb_build_object(
        'check_name', 'reasonable_creation_timestamps',
        'violations', violation_count,
        'description', 'Records with creation dates too far in the future',
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{data_type_checks}', 
                                   (validation_results->'data_type_checks') || check_result);
    
    -- Check for negative values where they shouldn't exist
    SELECT COUNT(*) INTO violation_count
    FROM campaigns 
    WHERE total_items < 0 OR processed_items < 0 OR successful_items < 0 OR failed_items < 0;
    
    check_result := jsonb_build_object(
        'check_name', 'non_negative_counters',
        'violations', violation_count,
        'description', 'Campaigns with negative counter values',
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{data_type_checks}', 
                                   (validation_results->'data_type_checks') || check_result);
    
    -- Check for invalid email formats in users table
    SELECT COUNT(*) INTO violation_count
    FROM auth.users 
    WHERE email IS NOT NULL 
    AND email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
    
    check_result := jsonb_build_object(
        'check_name', 'valid_email_formats',
        'violations', violation_count,
        'description', 'Users with invalid email format',
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{data_type_checks}', 
                                   (validation_results->'data_type_checks') || check_result);
    
    -- Check for valid JSON in metadata fields
    SELECT COUNT(*) INTO violation_count
    FROM campaigns 
    WHERE metadata IS NOT NULL 
    AND jsonb_typeof(metadata) != 'object';
    
    check_result := jsonb_build_object(
        'check_name', 'valid_json_metadata',
        'violations', violation_count,
        'description', 'Campaigns with invalid JSON metadata',
        'status', CASE WHEN violation_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{data_type_checks}', 
                                   (validation_results->'data_type_checks') || check_result);
    
    -- Calculate overall data type validation status
    validation_results := validation_results || jsonb_build_object(
        'overall_status', 
        CASE WHEN (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(validation_results->'data_type_checks') AS check 
            WHERE check->>'status' = 'FAIL'
        ) = 0 THEN 'PASS' ELSE 'FAIL' END,
        'validated_at', NOW()
    );
    
    RETURN validation_results;
END;
$$ LANGUAGE plpgsql;

-- Function to validate schema migration completeness
CREATE OR REPLACE FUNCTION consolidation.validate_migration_completeness()
RETURNS JSONB AS $$
DECLARE
    validation_results JSONB := '{"migration_checks": []}'::jsonb;
    missing_count INTEGER;
    check_result JSONB;
BEGIN
    -- Check for presence of session-based authentication fields
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sessions' 
        AND column_name = 'session_fingerprint'
    ) THEN 0 ELSE 1 END INTO missing_count;
    
    check_result := jsonb_build_object(
        'migration_name', 'session_based_authentication',
        'missing_features', missing_count,
        'status', CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{migration_checks}', 
                                   (validation_results->'migration_checks') || check_result);
    
    -- Check for MFA support fields
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'mfa_enabled'
    ) THEN 0 ELSE 1 END INTO missing_count;
    
    check_result := jsonb_build_object(
        'migration_name', 'mfa_support',
        'missing_features', missing_count,
        'status', CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{migration_checks}', 
                                   (validation_results->'migration_checks') || check_result);
    
    -- Check for performance optimization indexes
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname LIKE '%_performance%'
    ) THEN 0 ELSE 1 END INTO missing_count;
    
    check_result := jsonb_build_object(
        'migration_name', 'performance_indexes',
        'missing_features', missing_count,
        'status', CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{migration_checks}', 
                                   (validation_results->'migration_checks') || check_result);
    
    -- Check for keyword rules table (migration 000006)
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'keyword_rules'
    ) THEN 0 ELSE 1 END INTO missing_count;
    
    check_result := jsonb_build_object(
        'migration_name', 'keyword_rules_table',
        'missing_features', missing_count,
        'status', CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END
    );
    validation_results := jsonb_set(validation_results, '{migration_checks}', 
                                   (validation_results->'migration_checks') || check_result);
    
    -- Calculate overall migration completeness status
    validation_results := validation_results || jsonb_build_object(
        'overall_status', 
        CASE WHEN (
            SELECT COUNT(*) 
            FROM jsonb_array_elements(validation_results->'migration_checks') AS check 
            WHERE check->>'status' = 'FAIL'
        ) = 0 THEN 'PASS' ELSE 'FAIL' END,
        'validated_at', NOW()
    );
    
    RETURN validation_results;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMPREHENSIVE VALIDATION ORCHESTRATOR
-- =====================================================

-- Main validation function that runs all validation checks
CREATE OR REPLACE FUNCTION consolidation.run_comprehensive_validation()
RETURNS JSONB AS $$
DECLARE
    comprehensive_results JSONB := '{}'::jsonb;
    start_time TIMESTAMP := NOW();
    validation_result JSONB;
    overall_status TEXT := 'PASS';
BEGIN
    -- Initialize results
    comprehensive_results := jsonb_build_object(
        'validation_id', gen_random_uuid(),
        'started_at', start_time,
        'validations', '{}'::jsonb
    );
    
    -- Run referential integrity validation
    validation_result := consolidation.validate_referential_integrity();
    comprehensive_results := jsonb_set(comprehensive_results, '{validations,referential_integrity}', validation_result);
    IF validation_result->>'overall_status' != 'PASS' THEN
        overall_status := 'FAIL';
    END IF;
    
    -- Run shadow table consistency validation (if shadow tables exist)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name LIKE '%_v2') THEN
        validation_result := consolidation.validate_shadow_table_consistency();
        comprehensive_results := jsonb_set(comprehensive_results, '{validations,shadow_table_consistency}', validation_result);
        IF validation_result->>'overall_status' != 'PASS' THEN
            overall_status := 'FAIL';
        END IF;
    END IF;
    
    -- Run business rules validation
    validation_result := consolidation.validate_business_rules();
    comprehensive_results := jsonb_set(comprehensive_results, '{validations,business_rules}', validation_result);
    IF validation_result->>'overall_status' != 'PASS' THEN
        overall_status := 'FAIL';
    END IF;
    
    -- Run data type validation
    validation_result := consolidation.validate_data_types();
    comprehensive_results := jsonb_set(comprehensive_results, '{validations,data_types}', validation_result);
    IF validation_result->>'overall_status' != 'PASS' THEN
        overall_status := 'FAIL';
    END IF;
    
    -- Run migration completeness validation
    validation_result := consolidation.validate_migration_completeness();
    comprehensive_results := jsonb_set(comprehensive_results, '{validations,migration_completeness}', validation_result);
    IF validation_result->>'overall_status' != 'PASS' THEN
        overall_status := 'FAIL';
    END IF;
    
    -- Add summary
    comprehensive_results := comprehensive_results || jsonb_build_object(
        'overall_status', overall_status,
        'completed_at', NOW(),
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );
    
    -- Log validation results
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('comprehensive_validation', 'consolidation', comprehensive_results);
    
    RETURN comprehensive_results;
END;
$$ LANGUAGE plpgsql;

-- Function to generate validation report in human-readable format
CREATE OR REPLACE FUNCTION consolidation.generate_validation_report()
RETURNS TEXT AS $$
DECLARE
    validation_results JSONB;
    report TEXT := '';
    validation_section JSONB;
    check_item JSONB;
BEGIN
    -- Run comprehensive validation
    validation_results := consolidation.run_comprehensive_validation();
    
    -- Build report header
    report := report || E'DomainFlow Database Validation Report\n';
    report := report || E'Generated: ' || (validation_results->>'started_at') || E'\n';
    report := report || E'Overall Status: ' || (validation_results->>'overall_status') || E'\n';
    report := report || E'Duration: ' || (validation_results->>'duration_seconds') || E' seconds\n\n';
    
    -- Process each validation section
    FOR validation_section IN SELECT value FROM jsonb_each(validation_results->'validations')
    LOOP
        report := report || E'=== ' || upper(replace(validation_section->>'validation_type', '_', ' ')) || E' ===\n';
        report := report || E'Status: ' || (validation_section->>'overall_status') || E'\n';
        
        -- Add detailed checks if available
        IF validation_section ? 'integrity_checks' THEN
            FOR check_item IN SELECT value FROM jsonb_array_elements(validation_section->'integrity_checks')
            LOOP
                report := report || E'  ✓ ' || (check_item->>'check_name') || E': ' || (check_item->>'status');
                IF (check_item->>'orphaned_records')::INTEGER > 0 THEN
                    report := report || E' (' || (check_item->>'orphaned_records') || E' orphaned records)';
                END IF;
                report := report || E'\n';
            END LOOP;
        END IF;
        
        IF validation_section ? 'consistency_checks' THEN
            FOR check_item IN SELECT value FROM jsonb_array_elements(validation_section->'consistency_checks')
            LOOP
                report := report || E'  ✓ ' || (check_item->>'table_name') || E': ' || (check_item->>'status');
                report := report || E' (Original: ' || (check_item->>'original_count') || 
                          E', Shadow: ' || (check_item->>'shadow_count') || E')\n';
            END LOOP;
        END IF;
        
        IF validation_section ? 'business_rule_checks' THEN
            FOR check_item IN SELECT value FROM jsonb_array_elements(validation_section->'business_rule_checks')
            LOOP
                report := report || E'  ✓ ' || (check_item->>'rule_name') || E': ' || (check_item->>'status');
                IF (check_item->>'violations')::INTEGER > 0 THEN
                    report := report || E' (' || (check_item->>'violations') || E' violations)';
                END IF;
                report := report || E'\n';
            END LOOP;
        END IF;
        
        report := report || E'\n';
    END LOOP;
    
    -- Add recommendations if there are failures
    IF validation_results->>'overall_status' = 'FAIL' THEN
        report := report || E'RECOMMENDATIONS:\n';
        report := report || E'- Review and fix all FAIL status items before proceeding with consolidation\n';
        report := report || E'- Run data cleanup procedures for orphaned records\n';
        report := report || E'- Verify data integrity constraints are properly enforced\n';
        report := report || E'- Consider running validation again after fixes\n';
    ELSE
        report := report || E'READY FOR CONSOLIDATION: All validation checks passed successfully.\n';
    END IF;
    
    RETURN report;
END;
$$ LANGUAGE plpgsql;

-- Function to validate specific data migration steps
CREATE OR REPLACE FUNCTION consolidation.validate_migration_step(step_name TEXT)
RETURNS JSONB AS $$
DECLARE
    step_result JSONB := '{}'::jsonb;
BEGIN
    CASE step_name
        WHEN 'pre_migration' THEN
            step_result := consolidation.validate_referential_integrity();
            step_result := step_result || consolidation.validate_business_rules();
            
        WHEN 'post_shadow_creation' THEN
            step_result := consolidation.validate_shadow_table_consistency();
            
        WHEN 'post_data_migration' THEN
            step_result := consolidation.validate_shadow_table_consistency();
            step_result := step_result || consolidation.validate_referential_integrity();
            
        WHEN 'post_consolidation' THEN
            step_result := consolidation.run_comprehensive_validation();
            
        ELSE
            step_result := jsonb_build_object(
                'error', 'Unknown validation step: ' || step_name,
                'available_steps', '["pre_migration", "post_shadow_creation", "post_data_migration", "post_consolidation"]'
            );
    END CASE;
    
    step_result := step_result || jsonb_build_object(
        'step_name', step_name,
        'validated_at', NOW()
    );
    
    RETURN step_result;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comments
COMMENT ON FUNCTION consolidation.run_comprehensive_validation() IS 
'Runs all validation checks and returns comprehensive results. Use before and after consolidation.';

COMMENT ON FUNCTION consolidation.generate_validation_report() IS 
'Generates a human-readable validation report. Useful for documentation and auditing.';

COMMENT ON FUNCTION consolidation.validate_migration_step(TEXT) IS 
'Validates specific migration steps. Available steps: pre_migration, post_shadow_creation, post_data_migration, post_consolidation';

COMMENT ON FUNCTION consolidation.validate_referential_integrity() IS 
'Validates foreign key relationships and identifies orphaned records across all tables.';

COMMENT ON FUNCTION consolidation.validate_business_rules() IS 
'Validates critical business logic constraints and data consistency rules.';