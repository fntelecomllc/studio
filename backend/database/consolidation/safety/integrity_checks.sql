-- DomainFlow Migration Safety - Integrity Checks
-- Real-time data validation during migration process
-- Continuous monitoring for data consistency and constraint violations
-- Created: 2025-06-16

-- =====================================================
-- INTEGRITY MONITORING INFRASTRUCTURE
-- =====================================================

-- Create integrity monitoring tables
CREATE TABLE IF NOT EXISTS safety.integrity_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_name TEXT NOT NULL,
    check_type TEXT NOT NULL, -- 'constraint', 'referential', 'business_rule', 'data_type'
    check_sql TEXT NOT NULL,
    severity_level TEXT DEFAULT 'warning', -- 'info', 'warning', 'error', 'critical'
    enabled BOOLEAN DEFAULT TRUE,
    auto_fix_enabled BOOLEAN DEFAULT FALSE,
    auto_fix_sql TEXT,
    check_frequency_seconds INTEGER DEFAULT 60,
    last_check_at TIMESTAMPTZ,
    last_result JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integrity violation log
CREATE TABLE IF NOT EXISTS safety.integrity_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_id UUID NOT NULL REFERENCES safety.integrity_monitoring(id),
    violation_count INTEGER NOT NULL,
    violation_details JSONB,
    severity_level TEXT NOT NULL,
    auto_fix_attempted BOOLEAN DEFAULT FALSE,
    auto_fix_successful BOOLEAN,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_method TEXT, -- 'auto_fix', 'manual', 'rollback'
    notes TEXT
);

-- Real-time monitoring status
CREATE TABLE IF NOT EXISTS safety.monitoring_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitoring_session_id UUID NOT NULL,
    migration_phase TEXT NOT NULL, -- 'preparation', 'shadow_creation', 'data_migration', 'cutover', 'cleanup'
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active', -- 'active', 'paused', 'stopped', 'error'
    checks_performed INTEGER DEFAULT 0,
    violations_detected INTEGER DEFAULT 0,
    critical_violations INTEGER DEFAULT 0,
    monitoring_config JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_integrity_monitoring_enabled ON safety.integrity_monitoring(enabled, check_frequency_seconds);
CREATE INDEX IF NOT EXISTS idx_integrity_violations_severity ON safety.integrity_violations(severity_level, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_status_session ON safety.monitoring_status(monitoring_session_id, migration_phase);

-- =====================================================
-- CORE INTEGRITY CHECK FUNCTIONS
-- =====================================================

-- Function to register standard integrity checks
CREATE OR REPLACE FUNCTION safety.setup_standard_integrity_checks()
RETURNS JSONB AS $$
DECLARE
    setup_results JSONB := '{"registered_checks": []}'::jsonb;
    check_id UUID;
BEGIN
    -- Check 1: Foreign key constraints
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds)
    VALUES 
    ('foreign_key_violations', 'referential',
     'SELECT COUNT(*) as violation_count, ''campaigns_users'' as constraint_name FROM campaigns c LEFT JOIN auth.users u ON c.user_id = u.id WHERE c.user_id IS NOT NULL AND u.id IS NULL',
     'critical', 30)
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'foreign_key_violations'));
    
    -- Check 2: Unique constraint violations
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds)
    VALUES 
    ('duplicate_emails', 'constraint',
     'SELECT COUNT(*) as violation_count FROM (SELECT email, COUNT(*) as email_count FROM auth.users GROUP BY email HAVING COUNT(*) > 1) duplicates',
     'error', 60)
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'duplicate_emails'));
    
    -- Check 3: Data type consistency
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds)
    VALUES 
    ('invalid_progress_percentages', 'business_rule',
     'SELECT COUNT(*) as violation_count FROM campaigns WHERE progress_percentage < 0 OR progress_percentage > 100',
     'warning', 120)
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'invalid_progress_percentages'));
    
    -- Check 4: Session integrity
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds, auto_fix_enabled, auto_fix_sql)
    VALUES 
    ('expired_active_sessions', 'business_rule',
     'SELECT COUNT(*) as violation_count FROM auth.sessions WHERE is_active = TRUE AND expires_at < NOW()',
     'warning', 60, TRUE,
     'UPDATE auth.sessions SET is_active = FALSE WHERE is_active = TRUE AND expires_at < NOW()')
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'expired_active_sessions'));
    
    -- Check 5: Orphaned generated domains
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds)
    VALUES 
    ('orphaned_generated_domains', 'referential',
     'SELECT COUNT(*) as violation_count FROM generated_domains gd LEFT JOIN campaigns c ON gd.domain_generation_campaign_id = c.id WHERE c.id IS NULL',
     'error', 180)
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'orphaned_generated_domains'));
    
    -- Check 6: Invalid JSON structures
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds)
    VALUES 
    ('invalid_persona_configs', 'data_type',
     'SELECT COUNT(*) as violation_count FROM personas WHERE config_details IS NULL OR NOT jsonb_typeof(config_details) = ''object''',
     'error', 300)
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'invalid_persona_configs'));
    
    -- Check 7: Sequence consistency
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds)
    VALUES 
    ('sequence_consistency', 'data_type',
     'SELECT COUNT(*) as violation_count FROM (SELECT 0) t WHERE EXISTS (SELECT 1 FROM auth.auth_audit_log WHERE id > (SELECT last_value FROM auth.auth_audit_log_id_seq))',
     'warning', 600)
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'sequence_consistency'));
    
    -- Check 8: Campaign data consistency
    INSERT INTO safety.integrity_monitoring 
    (check_name, check_type, check_sql, severity_level, check_frequency_seconds)
    VALUES 
    ('campaign_data_consistency', 'business_rule',
     'SELECT COUNT(*) as violation_count FROM campaigns WHERE processed_items > total_items AND total_items > 0',
     'error', 90)
    RETURNING id INTO check_id;
    
    setup_results := jsonb_set(setup_results, '{registered_checks}', 
                              (setup_results->'registered_checks') || 
                              jsonb_build_object('check_id', check_id, 'name', 'campaign_data_consistency'));
    
    setup_results := setup_results || jsonb_build_object(
        'setup_completed_at', NOW(),
        'total_checks_registered', jsonb_array_length(setup_results->'registered_checks')
    );
    
    RETURN setup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to execute a single integrity check
CREATE OR REPLACE FUNCTION safety.execute_integrity_check(check_id UUID)
RETURNS JSONB AS $$
DECLARE
    check_record RECORD;
    check_result RECORD;
    violation_count INTEGER := 0;
    check_results JSONB;
    violation_id UUID;
BEGIN
    -- Get check configuration
    SELECT * INTO check_record
    FROM safety.integrity_monitoring
    WHERE id = check_id AND enabled = TRUE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'skipped',
            'reason', 'Check not found or disabled'
        );
    END IF;
    
    -- Execute the check
    BEGIN
        EXECUTE check_record.check_sql INTO check_result;
        violation_count := COALESCE(check_result.violation_count, 0);
        
        check_results := jsonb_build_object(
            'check_id', check_id,
            'check_name', check_record.check_name,
            'violation_count', violation_count,
            'severity_level', check_record.severity_level,
            'executed_at', NOW(),
            'status', 'completed'
        );
        
        -- Log violations if any
        IF violation_count > 0 THEN
            INSERT INTO safety.integrity_violations 
            (check_id, violation_count, violation_details, severity_level)
            VALUES 
            (check_id, violation_count, check_results, check_record.severity_level)
            RETURNING id INTO violation_id;
            
            check_results := check_results || jsonb_build_object('violation_id', violation_id);
            
            -- Attempt auto-fix if enabled
            IF check_record.auto_fix_enabled AND check_record.auto_fix_sql IS NOT NULL THEN
                BEGIN
                    EXECUTE check_record.auto_fix_sql;
                    
                    UPDATE safety.integrity_violations
                    SET auto_fix_attempted = TRUE,
                        auto_fix_successful = TRUE,
                        resolution_method = 'auto_fix'
                    WHERE id = violation_id;
                    
                    check_results := check_results || jsonb_build_object('auto_fix_applied', true);
                    
                EXCEPTION WHEN OTHERS THEN
                    UPDATE safety.integrity_violations
                    SET auto_fix_attempted = TRUE,
                        auto_fix_successful = FALSE,
                        notes = 'Auto-fix failed: ' || SQLERRM
                    WHERE id = violation_id;
                    
                    check_results := check_results || jsonb_build_object(
                        'auto_fix_applied', false,
                        'auto_fix_error', SQLERRM
                    );
                END;
            END IF;
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        check_results := jsonb_build_object(
            'check_id', check_id,
            'check_name', check_record.check_name,
            'status', 'failed',
            'error', SQLERRM,
            'executed_at', NOW()
        );
    END;
    
    -- Update last check time
    UPDATE safety.integrity_monitoring
    SET last_check_at = NOW(),
        last_result = check_results
    WHERE id = check_id;
    
    RETURN check_results;
END;
$$ LANGUAGE plpgsql;

-- Function to run all enabled integrity checks
CREATE OR REPLACE FUNCTION safety.run_all_integrity_checks()
RETURNS JSONB AS $$
DECLARE
    monitoring_results JSONB := '{"check_results": []}'::jsonb;
    check_record RECORD;
    check_result JSONB;
    total_checks INTEGER := 0;
    total_violations INTEGER := 0;
    critical_violations INTEGER := 0;
    start_time TIMESTAMPTZ := NOW();
BEGIN
    FOR check_record IN 
        SELECT id, check_name, severity_level
        FROM safety.integrity_monitoring
        WHERE enabled = TRUE
        ORDER BY 
            CASE severity_level 
                WHEN 'critical' THEN 1
                WHEN 'error' THEN 2
                WHEN 'warning' THEN 3
                ELSE 4
            END
    LOOP
        check_result := safety.execute_integrity_check(check_record.id);
        total_checks := total_checks + 1;
        
        IF (check_result->>'violation_count')::INTEGER > 0 THEN
            total_violations := total_violations + (check_result->>'violation_count')::INTEGER;
            
            IF check_record.severity_level = 'critical' THEN
                critical_violations := critical_violations + (check_result->>'violation_count')::INTEGER;
            END IF;
        END IF;
        
        monitoring_results := jsonb_set(monitoring_results, '{check_results}', 
                                       (monitoring_results->'check_results') || check_result);
    END LOOP;
    
    monitoring_results := monitoring_results || jsonb_build_object(
        'summary', jsonb_build_object(
            'total_checks', total_checks,
            'total_violations', total_violations,
            'critical_violations', critical_violations,
            'execution_time_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
            'overall_status', CASE 
                WHEN critical_violations > 0 THEN 'CRITICAL'
                WHEN total_violations > 10 THEN 'ERROR'
                WHEN total_violations > 0 THEN 'WARNING'
                ELSE 'OK'
            END
        ),
        'executed_at', NOW()
    );
    
    RETURN monitoring_results;
END;
$$ LANGUAGE plpgsql;

-- Function to start continuous monitoring session
CREATE OR REPLACE FUNCTION safety.start_monitoring_session(
    migration_phase TEXT,
    monitoring_config JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
    session_id UUID := gen_random_uuid();
    session_results JSONB;
BEGIN
    -- Register monitoring session
    INSERT INTO safety.monitoring_status 
    (monitoring_session_id, migration_phase, monitoring_config)
    VALUES 
    (session_id, migration_phase, monitoring_config);
    
    session_results := jsonb_build_object(
        'monitoring_session_id', session_id,
        'migration_phase', migration_phase,
        'started_at', NOW(),
        'status', 'active',
        'monitoring_config', monitoring_config
    );
    
    -- Log session start
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('monitoring_session_started', 'consolidation', session_results);
    
    RETURN session_results;
END;
$$ LANGUAGE plpgsql;

-- Function to update monitoring session heartbeat
CREATE OR REPLACE FUNCTION safety.update_monitoring_heartbeat(
    session_id UUID,
    checks_performed INTEGER DEFAULT 0,
    violations_detected INTEGER DEFAULT 0,
    critical_violations INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
    update_results JSONB;
BEGIN
    UPDATE safety.monitoring_status
    SET last_heartbeat = NOW(),
        checks_performed = checks_performed,
        violations_detected = violations_detected,
        critical_violations = critical_violations
    WHERE monitoring_session_id = session_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'failed',
            'error', 'Monitoring session not found: ' || session_id
        );
    END IF;
    
    update_results := jsonb_build_object(
        'monitoring_session_id', session_id,
        'heartbeat_updated_at', NOW(),
        'checks_performed', checks_performed,
        'violations_detected', violations_detected,
        'critical_violations', critical_violations
    );
    
    RETURN update_results;
END;
$$ LANGUAGE plpgsql;

-- Function to stop monitoring session
CREATE OR REPLACE FUNCTION safety.stop_monitoring_session(
    session_id UUID,
    final_status TEXT DEFAULT 'completed'
)
RETURNS JSONB AS $$
DECLARE
    session_record RECORD;
    stop_results JSONB;
BEGIN
    -- Get session details
    SELECT * INTO session_record
    FROM safety.monitoring_status
    WHERE monitoring_session_id = session_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'failed',
            'error', 'Monitoring session not found: ' || session_id
        );
    END IF;
    
    -- Update session status
    UPDATE safety.monitoring_status
    SET status = final_status,
        last_heartbeat = NOW()
    WHERE monitoring_session_id = session_id;
    
    stop_results := jsonb_build_object(
        'monitoring_session_id', session_id,
        'migration_phase', session_record.migration_phase,
        'started_at', session_record.started_at,
        'stopped_at', NOW(),
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - session_record.started_at)),
        'final_status', final_status,
        'total_checks_performed', session_record.checks_performed,
        'total_violations_detected', session_record.violations_detected,
        'critical_violations', session_record.critical_violations
    );
    
    -- Log session stop
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('monitoring_session_stopped', 'consolidation', stop_results);
    
    RETURN stop_results;
END;
$$ LANGUAGE plpgsql;

-- Function to get real-time integrity status
CREATE OR REPLACE FUNCTION safety.get_integrity_status()
RETURNS JSONB AS $$
DECLARE
    status_results JSONB := '{}'::jsonb;
    active_sessions INTEGER;
    recent_violations INTEGER;
    critical_violations INTEGER;
    latest_check RECORD;
BEGIN
    -- Get active monitoring sessions
    SELECT COUNT(*) INTO active_sessions
    FROM safety.monitoring_status
    WHERE status = 'active'
    AND last_heartbeat > NOW() - INTERVAL '5 minutes';
    
    -- Get recent violations (last hour)
    SELECT COUNT(*) INTO recent_violations
    FROM safety.integrity_violations
    WHERE detected_at > NOW() - INTERVAL '1 hour';
    
    -- Get critical violations (last hour)
    SELECT COUNT(*) INTO critical_violations
    FROM safety.integrity_violations
    WHERE detected_at > NOW() - INTERVAL '1 hour'
    AND severity_level = 'critical';
    
    -- Get latest check results
    SELECT check_name, last_check_at, last_result
    INTO latest_check
    FROM safety.integrity_monitoring
    WHERE last_check_at IS NOT NULL
    ORDER BY last_check_at DESC
    LIMIT 1;
    
    status_results := jsonb_build_object(
        'integrity_overview', jsonb_build_object(
            'active_monitoring_sessions', active_sessions,
            'recent_violations_1h', recent_violations,
            'critical_violations_1h', critical_violations,
            'overall_health_status', CASE 
                WHEN critical_violations > 0 THEN 'CRITICAL'
                WHEN recent_violations > 5 THEN 'DEGRADED'
                WHEN active_sessions > 0 THEN 'MONITORING'
                ELSE 'STABLE'
            END
        ),
        'latest_check', CASE 
            WHEN latest_check.check_name IS NOT NULL THEN
                jsonb_build_object(
                    'check_name', latest_check.check_name,
                    'last_executed', latest_check.last_check_at,
                    'result', latest_check.last_result
                )
            ELSE NULL
        END,
        'status_generated_at', NOW()
    );
    
    RETURN status_results;
END;
$$ LANGUAGE plpgsql;

-- Function to generate integrity report
CREATE OR REPLACE FUNCTION safety.generate_integrity_report(
    time_range_hours INTEGER DEFAULT 24
)
RETURNS TEXT AS $$
DECLARE
    report TEXT := '';
    violation_record RECORD;
    check_record RECORD;
    summary_stats RECORD;
BEGIN
    -- Get summary statistics
    SELECT 
        COUNT(DISTINCT im.id) as total_checks,
        COUNT(DISTINCT CASE WHEN im.enabled THEN im.id END) as enabled_checks,
        COUNT(iv.id) as total_violations,
        COUNT(CASE WHEN iv.severity_level = 'critical' THEN iv.id END) as critical_violations,
        COUNT(CASE WHEN iv.auto_fix_successful THEN iv.id END) as auto_fixed_violations
    INTO summary_stats
    FROM safety.integrity_monitoring im
    LEFT JOIN safety.integrity_violations iv ON im.id = iv.check_id
    AND iv.detected_at > NOW() - (time_range_hours || ' hours')::INTERVAL;
    
    -- Build report header
    report := report || E'DomainFlow Integrity Monitoring Report\n';
    report := report || E'=====================================\n\n';
    report := report || E'Time Range: Last ' || time_range_hours || E' hours\n';
    report := report || E'Generated: ' || NOW() || E'\n\n';
    
    -- Summary section
    report := report || E'SUMMARY:\n';
    report := report || E'  Total Integrity Checks: ' || summary_stats.total_checks || E'\n';
    report := report || E'  Enabled Checks: ' || summary_stats.enabled_checks || E'\n';
    report := report || E'  Total Violations: ' || summary_stats.total_violations || E'\n';
    report := report || E'  Critical Violations: ' || summary_stats.critical_violations || E'\n';
    report := report || E'  Auto-Fixed Violations: ' || summary_stats.auto_fixed_violations || E'\n\n';
    
    -- Violations by severity
    report := report || E'VIOLATIONS BY SEVERITY:\n';
    FOR violation_record IN 
        SELECT severity_level, COUNT(*) as violation_count
        FROM safety.integrity_violations
        WHERE detected_at > NOW() - (time_range_hours || ' hours')::INTERVAL
        GROUP BY severity_level
        ORDER BY 
            CASE severity_level 
                WHEN 'critical' THEN 1
                WHEN 'error' THEN 2
                WHEN 'warning' THEN 3
                ELSE 4
            END
    LOOP
        report := report || E'  ' || upper(violation_record.severity_level) || E': ' || violation_record.violation_count || E'\n';
    END LOOP;
    
    report := report || E'\n';
    
    -- Recent violations detail
    IF summary_stats.total_violations > 0 THEN
        report := report || E'RECENT VIOLATIONS:\n';
        FOR violation_record IN 
            SELECT iv.detected_at, im.check_name, iv.severity_level, 
                   iv.violation_count, iv.auto_fix_attempted, iv.auto_fix_successful
            FROM safety.integrity_violations iv
            JOIN safety.integrity_monitoring im ON iv.check_id = im.id
            WHERE iv.detected_at > NOW() - (time_range_hours || ' hours')::INTERVAL
            ORDER BY iv.detected_at DESC
            LIMIT 10
        LOOP
            report := report || E'  [' || violation_record.detected_at || E'] ';
            report := report || upper(violation_record.severity_level) || E': ';
            report := report || violation_record.check_name || E' (' || violation_record.violation_count || E' violations)';
            
            IF violation_record.auto_fix_attempted THEN
                report := report || E' - Auto-fix: ' || 
                          CASE WHEN violation_record.auto_fix_successful THEN 'SUCCESS' ELSE 'FAILED' END;
            END IF;
            
            report := report || E'\n';
        END LOOP;
    ELSE
        report := report || E'No violations detected in the specified time range.\n';
    END IF;
    
    report := report || E'\n';
    
    -- Check status
    report := report || E'CHECK STATUS:\n';
    FOR check_record IN 
        SELECT check_name, enabled, last_check_at, 
               (last_result->>'violation_count')::INTEGER as last_violation_count
        FROM safety.integrity_monitoring
        ORDER BY check_name
    LOOP
        report := report || E'  ✓ ' || check_record.check_name || E': ';
        report := report || CASE WHEN check_record.enabled THEN 'ENABLED' ELSE 'DISABLED' END;
        
        IF check_record.last_check_at IS NOT NULL THEN
            report := report || E' (Last: ' || check_record.last_check_at || E')';
            IF check_record.last_violation_count > 0 THEN
                report := report || E' [' || check_record.last_violation_count || E' violations]';
            END IF;
        ELSE
            report := report || E' (Never executed)';
        END IF;
        
        report := report || E'\n';
    END LOOP;
    
    RETURN report;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION safety.setup_standard_integrity_checks() IS 
'Sets up standard integrity checks for common data validation scenarios.';

COMMENT ON FUNCTION safety.run_all_integrity_checks() IS 
'Executes all enabled integrity checks and returns comprehensive results.';

COMMENT ON FUNCTION safety.start_monitoring_session(TEXT, JSONB) IS 
'Starts continuous monitoring session for specified migration phase.';

COMMENT ON FUNCTION safety.get_integrity_status() IS 
'Returns real-time integrity status including violations and monitoring health.';

COMMENT ON TABLE safety.integrity_monitoring IS 
'Configuration table for integrity checks with auto-fix capabilities.';

COMMENT ON TABLE safety.integrity_violations IS 
'Log of all detected integrity violations with resolution tracking.';

-- Create automated monitoring view
CREATE OR REPLACE VIEW safety.integrity_dashboard AS
SELECT 
    im.check_name,
    im.check_type,
    im.severity_level,
    im.enabled,
    im.last_check_at,
    (im.last_result->>'violation_count')::INTEGER as last_violation_count,
    COUNT(iv.id) as violations_24h,
    COUNT(CASE WHEN iv.auto_fix_successful THEN iv.id END) as auto_fixed_24h,
    MAX(iv.detected_at) as last_violation_at
FROM safety.integrity_monitoring im
LEFT JOIN safety.integrity_violations iv ON im.id = iv.check_id
AND iv.detected_at > NOW() - INTERVAL '24 hours'
GROUP BY im.id, im.check_name, im.check_type, im.severity_level, 
         im.enabled, im.last_check_at, im.last_result
ORDER BY im.severity_level, im.check_name;

COMMENT ON VIEW safety.integrity_dashboard IS 
'Real-time dashboard view of integrity monitoring status and recent violations.';