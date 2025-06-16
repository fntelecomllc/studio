-- DomainFlow Migration Safety - Emergency Procedures
-- Emergency response procedures for critical situations during consolidation
-- Rapid response protocols with automated recovery mechanisms
-- Created: 2025-06-16

-- =====================================================
-- EMERGENCY RESPONSE INFRASTRUCTURE
-- =====================================================

-- Emergency response log
CREATE TABLE IF NOT EXISTS safety.emergency_response_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_timestamp TIMESTAMPTZ DEFAULT NOW(),
    incident_type TEXT NOT NULL, -- 'data_corruption', 'performance_degradation', 'system_failure', 'constraint_violation'
    severity_level TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
    incident_description TEXT NOT NULL,
    detected_by TEXT, -- 'automated_monitoring', 'manual_detection', 'user_report'
    detection_details JSONB,
    response_actions JSONB DEFAULT '[]'::jsonb,
    response_status TEXT DEFAULT 'detected', -- 'detected', 'responding', 'resolved', 'escalated'
    resolution_time_seconds INTEGER,
    impact_assessment JSONB,
    lessons_learned TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

-- Emergency contacts and escalation
CREATE TABLE IF NOT EXISTS safety.emergency_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_name TEXT NOT NULL,
    contact_role TEXT NOT NULL, -- 'dba', 'sysadmin', 'developer', 'manager'
    contact_method TEXT NOT NULL, -- 'email', 'sms', 'slack', 'pager'
    contact_details TEXT NOT NULL, -- email address, phone number, etc.
    escalation_level INTEGER NOT NULL, -- 1=immediate, 2=secondary, 3=management
    availability_hours TEXT DEFAULT '24/7',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emergency response procedures registry
CREATE TABLE IF NOT EXISTS safety.emergency_procedures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    procedure_name TEXT NOT NULL UNIQUE,
    incident_type TEXT NOT NULL,
    severity_threshold TEXT NOT NULL,
    procedure_sql TEXT NOT NULL,
    auto_execute BOOLEAN DEFAULT FALSE,
    max_execution_time_seconds INTEGER DEFAULT 300,
    rollback_sql TEXT,
    description TEXT,
    prerequisites JSONB DEFAULT '[]'::jsonb,
    side_effects JSONB DEFAULT '[]'::jsonb,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_executed TIMESTAMPTZ,
    execution_count INTEGER DEFAULT 0
);

-- Create indexes for emergency response
CREATE INDEX IF NOT EXISTS idx_emergency_log_timestamp ON safety.emergency_response_log(incident_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_log_severity ON safety.emergency_response_log(severity_level, response_status);
CREATE INDEX IF NOT EXISTS idx_emergency_contacts_escalation ON safety.emergency_contacts(escalation_level, enabled);

-- =====================================================
-- EMERGENCY DETECTION FUNCTIONS
-- =====================================================

-- Function to detect critical system conditions
CREATE OR REPLACE FUNCTION safety.detect_critical_conditions()
RETURNS JSONB AS $$
DECLARE
    detection_results JSONB := '{"critical_conditions": []}'::jsonb;
    condition_detected BOOLEAN;
    condition_details JSONB;
    critical_count INTEGER := 0;
BEGIN
    -- Check 1: Database connection exhaustion
    SELECT COUNT(*) > 180 INTO condition_detected
    FROM pg_stat_activity WHERE state = 'active';
    
    IF condition_detected THEN
        condition_details := jsonb_build_object(
            'condition', 'connection_exhaustion',
            'severity', 'critical',
            'current_connections', (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active'),
            'detection_time', NOW()
        );
        detection_results := jsonb_set(detection_results, '{critical_conditions}', 
                                     (detection_results->'critical_conditions') || condition_details);
        critical_count := critical_count + 1;
    END IF;
    
    -- Check 2: Long running transactions blocking migration
    SELECT EXISTS (
        SELECT 1 FROM pg_stat_activity 
        WHERE state = 'active' 
        AND query_start < NOW() - INTERVAL '30 minutes'
        AND query LIKE '%ALTER TABLE%' OR query LIKE '%CREATE INDEX%'
    ) INTO condition_detected;
    
    IF condition_detected THEN
        condition_details := jsonb_build_object(
            'condition', 'long_running_migration_blocking',
            'severity', 'high',
            'longest_query_minutes', (
                SELECT EXTRACT(EPOCH FROM (NOW() - MIN(query_start))) / 60
                FROM pg_stat_activity 
                WHERE state = 'active' AND query_start IS NOT NULL
            ),
            'detection_time', NOW()
        );
        detection_results := jsonb_set(detection_results, '{critical_conditions}', 
                                     (detection_results->'critical_conditions') || condition_details);
        critical_count := critical_count + 1;
    END IF;
    
    -- Check 3: Deadlock spike
    SELECT deadlocks > 10 INTO condition_detected
    FROM pg_stat_database 
    WHERE datname = current_database();
    
    IF condition_detected THEN
        condition_details := jsonb_build_object(
            'condition', 'deadlock_spike',
            'severity', 'high',
            'deadlock_count', (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()),
            'detection_time', NOW()
        );
        detection_results := jsonb_set(detection_results, '{critical_conditions}', 
                                     (detection_results->'critical_conditions') || condition_details);
        critical_count := critical_count + 1;
    END IF;
    
    -- Check 4: Disk space critical
    SELECT pg_size_pretty(pg_database_size(current_database()))::TEXT LIKE '%GB%' 
    AND CAST(SUBSTRING(pg_size_pretty(pg_database_size(current_database())) FROM '([0-9.]+)') AS NUMERIC) > 50 
    INTO condition_detected;
    
    IF condition_detected THEN
        condition_details := jsonb_build_object(
            'condition', 'disk_space_critical',
            'severity', 'critical',
            'database_size', pg_size_pretty(pg_database_size(current_database())),
            'detection_time', NOW()
        );
        detection_results := jsonb_set(detection_results, '{critical_conditions}', 
                                     (detection_results->'critical_conditions') || condition_details);
        critical_count := critical_count + 1;
    END IF;
    
    -- Check 5: Cache hit ratio degradation
    SELECT 100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)) < 80 INTO condition_detected
    FROM pg_stat_database WHERE datname = current_database();
    
    IF condition_detected THEN
        condition_details := jsonb_build_object(
            'condition', 'cache_hit_ratio_degradation',
            'severity', 'medium',
            'current_ratio', (
                SELECT ROUND(100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)), 2)
                FROM pg_stat_database WHERE datname = current_database()
            ),
            'detection_time', NOW()
        );
        detection_results := jsonb_set(detection_results, '{critical_conditions}', 
                                     (detection_results->'critical_conditions') || condition_details);
        critical_count := critical_count + 1;
    END IF;
    
    -- Check 6: Massive lock waits
    SELECT COUNT(*) > 50 INTO condition_detected
    FROM pg_locks WHERE NOT granted;
    
    IF condition_detected THEN
        condition_details := jsonb_build_object(
            'condition', 'massive_lock_waits',
            'severity', 'high',
            'waiting_locks', (SELECT COUNT(*) FROM pg_locks WHERE NOT granted),
            'detection_time', NOW()
        );
        detection_results := jsonb_set(detection_results, '{critical_conditions}', 
                                     (detection_results->'critical_conditions') || condition_details);
        critical_count := critical_count + 1;
    END IF;
    
    detection_results := detection_results || jsonb_build_object(
        'total_critical_conditions', critical_count,
        'overall_system_health', CASE 
            WHEN critical_count = 0 THEN 'healthy'
            WHEN critical_count <= 2 THEN 'degraded'
            ELSE 'critical'
        END,
        'detection_timestamp', NOW()
    );
    
    RETURN detection_results;
END;
$$ LANGUAGE plpgsql;

-- Function to execute emergency response
CREATE OR REPLACE FUNCTION safety.execute_emergency_response(
    incident_type TEXT,
    severity_level TEXT,
    incident_description TEXT,
    auto_execute_procedures BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    incident_id UUID;
    response_results JSONB := '{"executed_procedures": []}'::jsonb;
    procedure_record RECORD;
    execution_result JSONB;
    start_time TIMESTAMPTZ := NOW();
BEGIN
    -- Log the incident
    INSERT INTO safety.emergency_response_log 
    (incident_type, severity_level, incident_description, detected_by, response_status)
    VALUES 
    (incident_type, severity_level, incident_description, 'automated_system', 'responding')
    RETURNING id INTO incident_id;
    
    response_results := response_results || jsonb_build_object(
        'incident_id', incident_id,
        'incident_type', incident_type,
        'severity_level', severity_level,
        'response_started_at', start_time
    );
    
    -- Execute applicable emergency procedures
    FOR procedure_record IN 
        SELECT * FROM safety.emergency_procedures
        WHERE enabled = TRUE
        AND incident_type = procedure_record.incident_type
        AND (auto_execute_procedures = TRUE AND auto_execute = TRUE)
        ORDER BY 
            CASE severity_level 
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                ELSE 4
            END
    LOOP
        BEGIN
            -- Execute the emergency procedure
            EXECUTE procedure_record.procedure_sql;
            
            -- Update procedure execution count
            UPDATE safety.emergency_procedures
            SET last_executed = NOW(),
                execution_count = execution_count + 1
            WHERE id = procedure_record.id;
            
            execution_result := jsonb_build_object(
                'procedure_name', procedure_record.procedure_name,
                'execution_status', 'success',
                'executed_at', NOW()
            );
            
        EXCEPTION WHEN OTHERS THEN
            execution_result := jsonb_build_object(
                'procedure_name', procedure_record.procedure_name,
                'execution_status', 'failed',
                'error_message', SQLERRM,
                'executed_at', NOW()
            );
        END;
        
        response_results := jsonb_set(response_results, '{executed_procedures}', 
                                     (response_results->'executed_procedures') || execution_result);
    END LOOP;
    
    -- Update incident log with response actions
    UPDATE safety.emergency_response_log
    SET response_actions = response_results,
        response_status = 'resolved',
        resolution_time_seconds = EXTRACT(EPOCH FROM (NOW() - start_time)),
        resolved_at = NOW(),
        resolved_by = 'automated_system'
    WHERE id = incident_id;
    
    response_results := response_results || jsonb_build_object(
        'response_completed_at', NOW(),
        'total_response_time_seconds', EXTRACT(EPOCH FROM (NOW() - start_time))
    );
    
    RETURN response_results;
END;
$$ LANGUAGE plpgsql;

-- Function to setup default emergency procedures
CREATE OR REPLACE FUNCTION safety.setup_default_emergency_procedures()
RETURNS JSONB AS $$
DECLARE
    setup_results JSONB := '{"configured_procedures": []}'::jsonb;
    procedure_id UUID;
BEGIN
    -- Procedure 1: Kill long-running queries
    INSERT INTO safety.emergency_procedures 
    (procedure_name, incident_type, severity_threshold, procedure_sql, auto_execute, description)
    VALUES 
    ('kill_long_running_queries', 'performance_degradation', 'high',
     'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = ''active'' AND query_start < NOW() - INTERVAL ''1 hour'' AND query NOT LIKE ''%emergency_procedures%''',
     TRUE, 'Terminates queries running longer than 1 hour')
    ON CONFLICT (procedure_name) DO NOTHING
    RETURNING id INTO procedure_id;
    
    IF procedure_id IS NOT NULL THEN
        setup_results := jsonb_set(setup_results, '{configured_procedures}', 
                                  (setup_results->'configured_procedures') || 
                                  jsonb_build_object('procedure', 'kill_long_running_queries', 'id', procedure_id));
    END IF;
    
    -- Procedure 2: Emergency connection cleanup
    INSERT INTO safety.emergency_procedures 
    (procedure_name, incident_type, severity_threshold, procedure_sql, auto_execute, description)
    VALUES 
    ('emergency_connection_cleanup', 'system_failure', 'critical',
     'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = ''idle'' AND state_change < NOW() - INTERVAL ''30 minutes''',
     TRUE, 'Terminates idle connections older than 30 minutes')
    ON CONFLICT (procedure_name) DO NOTHING
    RETURNING id INTO procedure_id;
    
    -- Procedure 3: Force vacuum on critical tables
    INSERT INTO safety.emergency_procedures 
    (procedure_name, incident_type, severity_threshold, procedure_sql, auto_execute, description)
    VALUES 
    ('emergency_vacuum_critical_tables', 'performance_degradation', 'high',
     'VACUUM (VERBOSE, ANALYZE) campaigns; VACUUM (VERBOSE, ANALYZE) generated_domains; VACUUM (VERBOSE, ANALYZE) auth.sessions;',
     FALSE, 'Forces vacuum on critical tables to reclaim space and update statistics')
    ON CONFLICT (procedure_name) DO NOTHING
    RETURNING id INTO procedure_id;
    
    -- Procedure 4: Emergency index rebuild
    INSERT INTO safety.emergency_procedures 
    (procedure_name, incident_type, severity_threshold, procedure_sql, auto_execute, description)
    VALUES 
    ('emergency_index_rebuild', 'performance_degradation', 'critical',
     'REINDEX INDEX CONCURRENTLY idx_campaigns_user_status_created; REINDEX INDEX CONCURRENTLY idx_sessions_validation;',
     FALSE, 'Rebuilds critical indexes that may be corrupted or bloated')
    ON CONFLICT (procedure_name) DO NOTHING
    RETURNING id INTO procedure_id;
    
    -- Procedure 5: Emergency session cleanup
    INSERT INTO safety.emergency_procedures 
    (procedure_name, incident_type, severity_threshold, procedure_sql, auto_execute, description)
    VALUES 
    ('emergency_session_cleanup', 'data_corruption', 'medium',
     'UPDATE auth.sessions SET is_active = FALSE WHERE expires_at < NOW(); DELETE FROM auth.sessions WHERE is_active = FALSE AND last_activity_at < NOW() - INTERVAL ''7 days'';',
     TRUE, 'Cleans up expired and old inactive sessions')
    ON CONFLICT (procedure_name) DO NOTHING
    RETURNING id INTO procedure_id;
    
    -- Procedure 6: Emergency constraint check
    INSERT INTO safety.emergency_procedures 
    (procedure_name, incident_type, severity_threshold, procedure_sql, auto_execute, description)
    VALUES 
    ('emergency_constraint_validation', 'constraint_violation', 'high',
     'SELECT consolidation.validate_referential_integrity();',
     TRUE, 'Validates all referential integrity constraints')
    ON CONFLICT (procedure_name) DO NOTHING
    RETURNING id INTO procedure_id;
    
    setup_results := setup_results || jsonb_build_object(
        'setup_completed_at', NOW(),
        'total_procedures_configured', (SELECT COUNT(*) FROM safety.emergency_procedures)
    );
    
    RETURN setup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to initiate emergency rollback
CREATE OR REPLACE FUNCTION safety.initiate_emergency_rollback(
    rollback_reason TEXT,
    force_rollback BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    rollback_results JSONB;
    latest_backup TEXT;
    validation_result JSONB;
    incident_id UUID;
BEGIN
    -- Log emergency rollback initiation
    INSERT INTO safety.emergency_response_log 
    (incident_type, severity_level, incident_description, detected_by, response_status)
    VALUES 
    ('system_failure', 'critical', 'Emergency rollback initiated: ' || rollback_reason, 
     'manual_intervention', 'responding')
    RETURNING id INTO incident_id;
    
    -- Find the latest valid backup
    SELECT backup_name INTO latest_backup
    FROM safety.backup_registry
    WHERE backup_status = 'completed'
    AND verification_status = 'verified'
    AND backup_type = 'full'
    ORDER BY backup_started_at DESC
    LIMIT 1;
    
    IF latest_backup IS NULL THEN
        UPDATE safety.emergency_response_log
        SET response_status = 'failed',
            resolution_time_seconds = 0,
            resolved_at = NOW(),
            impact_assessment = '{"error": "No valid backup found for emergency rollback"}'::jsonb
        WHERE id = incident_id;
        
        RETURN jsonb_build_object(
            'status', 'failed',
            'error', 'No valid backup found for emergency rollback',
            'incident_id', incident_id
        );
    END IF;
    
    -- Validate rollback point unless forced
    IF NOT force_rollback THEN
        validation_result := consolidation.validate_rollback_point('rollback_' || replace(latest_backup, '-', '_'));
        
        IF validation_result->>'overall_status' != 'PASS' THEN
            UPDATE safety.emergency_response_log
            SET response_status = 'failed',
                resolution_time_seconds = 0,
                resolved_at = NOW(),
                impact_assessment = jsonb_build_object('error', 'Rollback validation failed', 'validation_details', validation_result)
            WHERE id = incident_id;
            
            RETURN jsonb_build_object(
                'status', 'validation_failed',
                'validation_details', validation_result,
                'recommendation', 'Use force_rollback=true to override validation',
                'incident_id', incident_id
            );
        END IF;
    END IF;
    
    -- Execute emergency rollback
    rollback_results := consolidation.execute_emergency_rollback(
        'rollback_' || replace(latest_backup, '-', '_'),
        'EMERGENCY: ' || rollback_reason,
        force_rollback
    );
    
    -- Update incident log
    UPDATE safety.emergency_response_log
    SET response_actions = rollback_results,
        response_status = CASE WHEN rollback_results->>'status' = 'COMPLETED' THEN 'resolved' ELSE 'failed' END,
        resolution_time_seconds = (rollback_results->>'duration_seconds')::INTEGER,
        resolved_at = NOW(),
        resolved_by = 'emergency_system'
    WHERE id = incident_id;
    
    rollback_results := rollback_results || jsonb_build_object(
        'emergency_incident_id', incident_id,
        'rollback_reason', rollback_reason,
        'backup_used', latest_backup,
        'force_rollback', force_rollback
    );
    
    RETURN rollback_results;
END;
$$ LANGUAGE plpgsql;

-- Function to send emergency notifications
CREATE OR REPLACE FUNCTION safety.send_emergency_notification(
    incident_id UUID,
    escalation_level INTEGER DEFAULT 1
)
RETURNS JSONB AS $$
DECLARE
    incident_record RECORD;
    contact_record RECORD;
    notification_results JSONB := '{"notifications_sent": []}'::jsonb;
    notification_count INTEGER := 0;
BEGIN
    -- Get incident details
    SELECT * INTO incident_record
    FROM safety.emergency_response_log
    WHERE id = incident_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'failed',
            'error', 'Incident not found: ' || incident_id
        );
    END IF;
    
    -- Send notifications to appropriate contacts
    FOR contact_record IN 
        SELECT * FROM safety.emergency_contacts
        WHERE enabled = TRUE
        AND escalation_level <= escalation_level
        ORDER BY escalation_level, contact_role
    LOOP
        -- Note: In a real implementation, this would integrate with actual notification systems
        -- For now, we'll log the notification attempt
        INSERT INTO audit_logs (action, entity_type, details)
        VALUES ('emergency_notification_sent', 'consolidation',
                jsonb_build_object(
                    'incident_id', incident_id,
                    'contact_name', contact_record.contact_name,
                    'contact_method', contact_record.contact_method,
                    'incident_type', incident_record.incident_type,
                    'severity_level', incident_record.severity_level,
                    'notification_time', NOW()
                ));
        
        notification_count := notification_count + 1;
        
        notification_results := jsonb_set(notification_results, '{notifications_sent}', 
                                         (notification_results->'notifications_sent') || 
                                         jsonb_build_object(
                                             'contact_name', contact_record.contact_name,
                                             'contact_method', contact_record.contact_method,
                                             'escalation_level', contact_record.escalation_level,
                                             'sent_at', NOW()
                                         ));
    END LOOP;
    
    notification_results := notification_results || jsonb_build_object(
        'incident_id', incident_id,
        'escalation_level', escalation_level,
        'total_notifications_sent', notification_count,
        'notification_timestamp', NOW()
    );
    
    RETURN notification_results;
END;
$$ LANGUAGE plpgsql;

-- Function to run emergency health check
CREATE OR REPLACE FUNCTION safety.emergency_health_check()
RETURNS JSONB AS $$
DECLARE
    health_results JSONB := '{}'::jsonb;
    critical_conditions JSONB;
    integrity_status JSONB;
    system_status JSONB;
    overall_health TEXT;
BEGIN
    -- Detect critical conditions
    critical_conditions := safety.detect_critical_conditions();
    
    -- Check integrity status
    integrity_status := safety.get_integrity_status();
    
    -- Get basic system status
    system_status := jsonb_build_object(
        'database_size', pg_size_pretty(pg_database_size(current_database())),
        'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
        'longest_query_minutes', (
            SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - query_start)) / 60), 0)
            FROM pg_stat_activity 
            WHERE state = 'active' AND query_start IS NOT NULL
        ),
        'cache_hit_ratio', (
            SELECT ROUND(100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)), 2)
            FROM pg_stat_database WHERE datname = current_database()
        )
    );
    
    -- Determine overall health
    overall_health := CASE 
        WHEN (critical_conditions->>'total_critical_conditions')::INTEGER > 0 THEN 'CRITICAL'
        WHEN (integrity_status->'integrity_overview'->>'critical_violations_1h')::INTEGER > 0 THEN 'DEGRADED'
        WHEN (system_status->>'active_connections')::INTEGER > 150 THEN 'WARNING'
        WHEN (system_status->>'cache_hit_ratio')::NUMERIC < 90 THEN 'WARNING'
        ELSE 'HEALTHY'
    END;
    
    health_results := jsonb_build_object(
        'overall_health', overall_health,
        'check_timestamp', NOW(),
        'critical_conditions', critical_conditions,
        'integrity_status', integrity_status,
        'system_status', system_status,
        'recommendations', CASE overall_health
            WHEN 'CRITICAL' THEN '["Consider emergency rollback", "Investigate critical conditions immediately"]'::jsonb
            WHEN 'DEGRADED' THEN '["Review integrity violations", "Monitor system closely"]'::jsonb
            WHEN 'WARNING' THEN '["Monitor performance metrics", "Consider preventive actions"]'::jsonb
            ELSE '["System operating normally"]'::jsonb
        END
    );
    
    -- Log health check
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('emergency_health_check', 'consolidation', health_results);
    
    RETURN health_results;
END;
$$ LANGUAGE plpgsql;

-- Function to generate emergency response report
CREATE OR REPLACE FUNCTION safety.generate_emergency_report(hours_back INTEGER DEFAULT 24)
RETURNS TEXT AS $$
DECLARE
    report TEXT := '';
    incident_record RECORD;
    summary_stats RECORD;
BEGIN
    -- Get summary statistics
    SELECT 
        COUNT(*) as total_incidents,
        COUNT(CASE WHEN severity_level = 'critical' THEN 1 END) as critical_incidents,
        COUNT(CASE WHEN response_status = 'resolved' THEN 1 END) as resolved_incidents,
        AVG(resolution_time_seconds) as avg_resolution_time
    INTO summary_stats
    FROM safety.emergency_response_log
    WHERE incident_timestamp > NOW() - (hours_back || ' hours')::INTERVAL;
    
    -- Build report header
    report := report || E'DomainFlow Emergency Response Report\n';
    report := report || E'===================================\n\n';
    report := report || E'Time Range: Last ' || hours_back || E' hours\n';
    report := report || E'Generated: ' || NOW() || E'\n\n';
    
    -- Summary statistics
    report := report || E'SUMMARY:\n';
    report := report || E'  Total Incidents: ' || summary_stats.total_incidents || E'\n';
    report := report || E'  Critical Incidents: ' || summary_stats.critical_incidents || E'\n';
    report := report || E'  Resolved Incidents: ' || summary_stats.resolved_incidents || E'\n';
    report := report || E'  Average Resolution Time: ' || COALESCE(ROUND(summary_stats.avg_resolution_time, 0)::TEXT, 'N/A') || E' seconds\n\n';
    
    -- Recent incidents
    IF summary_stats.total_incidents > 0 THEN
        report := report || E'RECENT INCIDENTS:\n';
        FOR incident_record IN 
            SELECT incident_timestamp, incident_type, severity_level, 
                   incident_description, response_status, resolution_time_seconds
            FROM safety.emergency_response_log
            WHERE incident_timestamp > NOW() - (hours_back || ' hours')::INTERVAL
            ORDER BY incident_timestamp DESC
            LIMIT 10
        LOOP
            report := report || E'  [' || incident_record.incident_timestamp || E'] ';
            report := report || upper(incident_record.severity_level) || E' - ';
            report := report || incident_record.incident_type || E': ';
            report := report || incident_record.incident_description || E'\n';
            report := report || E'    Status: ' || incident_record.response_status;
            
            IF incident_record.resolution_time_seconds IS NOT NULL THEN
                report := report || E' (Resolved in ' || incident_record.resolution_time_seconds || E' seconds)';
            END IF;
            
            report := report || E'\n\n';
        END LOOP;
    ELSE
        report := report || E'No emergency incidents recorded in the specified time range.\n\n';
    END IF;
    
    -- System health status
    report := report || E'CURRENT SYSTEM HEALTH:\n';
    report := report || (safety.emergency_health_check()->>'overall_health') || E'\n\n';
    
    RETURN report;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION safety.detect_critical_conditions() IS 
'Automatically detects critical system conditions that require emergency response.';

COMMENT ON FUNCTION safety.execute_emergency_response(TEXT, TEXT, TEXT, BOOLEAN) IS 
'Executes automated emergency response procedures for detected incidents.';

COMMENT ON FUNCTION safety.initiate_emergency_rollback(TEXT, BOOLEAN) IS 
'Initiates emergency rollback to latest verified backup. Use with extreme caution.';

COMMENT ON FUNCTION safety.emergency_health_check() IS 
'Performs comprehensive emergency health check and returns system status.';

-- Create emergency monitoring view
CREATE OR REPLACE VIEW safety.emergency_dashboard AS
SELECT 
    erl.incident_timestamp,
    erl.incident_type,
    erl.severity_level,
    erl.response_status,
    erl.resolution_time_seconds,
    COUNT(CASE WHEN erl.incident_timestamp > NOW() - INTERVAL '1 hour' THEN 1 END) OVER() as incidents_last_hour,
    COUNT(CASE WHEN erl.severity_level = 'critical' AND erl.incident_timestamp > NOW() - INTERVAL '24 hours' THEN 1 END) OVER() as critical_incidents_24h
FROM safety.emergency_response_log erl
WHERE erl.incident_timestamp > NOW() - INTERVAL '7 days'
ORDER BY erl.incident_timestamp DESC;

COMMENT ON VIEW safety.emergency_dashboard IS 
'Real-time emergency response dashboard showing recent incidents and system health trends.';

-- Setup default emergency contacts (template)
INSERT INTO safety.emergency_contacts (contact_name, contact_role, contact_method, contact_details, escalation_level)
VALUES 
('DBA On-Call', 'dba', 'pager', 'dba-oncall@domainflow.local', 1),
('System Administrator', 'sysadmin', 'email', 'sysadmin@domainflow.local', 1),
('Development Team Lead', 'developer', 'slack', '#emergency-alerts', 2),
('Operations Manager', 'manager', 'email', 'ops-manager@domainflow.local', 3)
ON CONFLICT DO NOTHING;

-- Log emergency procedures setup
INSERT INTO audit_logs (action, entity_type, details)
VALUES ('emergency_procedures_installed', 'consolidation',
        jsonb_build_object('installed_at', NOW(), 'version', 'v2.0'));