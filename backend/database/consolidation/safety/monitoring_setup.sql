-- DomainFlow Migration Safety - Monitoring Setup
-- Performance monitoring during schema consolidation migration
-- Real-time system health and performance tracking
-- Created: 2025-06-16

-- =====================================================
-- MONITORING INFRASTRUCTURE
-- =====================================================

-- Create monitoring schema if not exists
CREATE SCHEMA IF NOT EXISTS monitoring;

-- System performance metrics table
CREATE TABLE IF NOT EXISTS monitoring.system_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_timestamp TIMESTAMPTZ DEFAULT NOW(),
    migration_phase TEXT, -- 'preparation', 'shadow_creation', 'data_migration', 'cutover', 'cleanup'
    cpu_usage_percent NUMERIC(5,2),
    memory_usage_percent NUMERIC(5,2),
    disk_usage_percent NUMERIC(5,2),
    disk_io_read_mb_per_sec NUMERIC(10,2),
    disk_io_write_mb_per_sec NUMERIC(10,2),
    network_io_kb_per_sec NUMERIC(10,2),
    active_connections INTEGER,
    idle_connections INTEGER,
    longest_running_query_seconds INTEGER,
    database_size_mb NUMERIC(12,2),
    buffer_cache_hit_ratio NUMERIC(5,2),
    lock_waits INTEGER,
    deadlocks INTEGER,
    temp_files_created INTEGER,
    temp_bytes_used BIGINT,
    checkpoints_requested INTEGER,
    checkpoints_scheduled INTEGER,
    wal_files_archived INTEGER,
    wal_archive_failures INTEGER
);

-- Database performance metrics table
CREATE TABLE IF NOT EXISTS monitoring.database_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    measured_at TIMESTAMPTZ DEFAULT NOW(),
    migration_phase TEXT,
    table_name TEXT NOT NULL,
    schema_name TEXT NOT NULL,
    table_size_mb NUMERIC(12,2),
    index_size_mb NUMERIC(12,2),
    seq_scan_count BIGINT,
    seq_tup_read BIGINT,
    idx_scan_count BIGINT,
    idx_tup_fetch BIGINT,
    n_tup_ins BIGINT,
    n_tup_upd BIGINT,
    n_tup_del BIGINT,
    n_live_tup BIGINT,
    n_dead_tup BIGINT,
    vacuum_count BIGINT,
    autovacuum_count BIGINT,
    analyze_count BIGINT,
    autoanalyze_count BIGINT
);

-- Query performance monitoring
CREATE TABLE IF NOT EXISTS monitoring.query_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    migration_phase TEXT,
    query_hash TEXT,
    query_text TEXT,
    calls BIGINT,
    total_time_ms NUMERIC(15,3),
    mean_time_ms NUMERIC(15,3),
    stddev_time_ms NUMERIC(15,3),
    min_time_ms NUMERIC(15,3),
    max_time_ms NUMERIC(15,3),
    rows_examined BIGINT,
    rows_returned BIGINT,
    shared_blks_hit BIGINT,
    shared_blks_read BIGINT,
    shared_blks_dirtied BIGINT,
    shared_blks_written BIGINT,
    local_blks_hit BIGINT,
    local_blks_read BIGINT,
    temp_blks_read BIGINT,
    temp_blks_written BIGINT
);

-- Migration operation log
CREATE TABLE IF NOT EXISTS monitoring.migration_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_timestamp TIMESTAMPTZ DEFAULT NOW(),
    migration_phase TEXT NOT NULL,
    operation_type TEXT NOT NULL, -- 'table_creation', 'data_copy', 'index_creation', 'constraint_addition'
    operation_target TEXT NOT NULL, -- table/index/constraint name
    operation_status TEXT DEFAULT 'started', -- 'started', 'completed', 'failed'
    duration_seconds NUMERIC(10,3),
    rows_affected BIGINT,
    error_message TEXT,
    operation_details JSONB,
    performance_impact JSONB -- CPU, memory, I/O impact
);

-- Alert thresholds configuration
CREATE TABLE IF NOT EXISTS monitoring.alert_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL UNIQUE,
    threshold_type TEXT NOT NULL, -- 'warning', 'critical'
    threshold_value NUMERIC NOT NULL,
    comparison_operator TEXT NOT NULL, -- '>', '<', '>=', '<=', '='
    enabled BOOLEAN DEFAULT TRUE,
    alert_frequency_minutes INTEGER DEFAULT 5,
    last_alert_sent TIMESTAMPTZ,
    alert_message_template TEXT,
    auto_action_enabled BOOLEAN DEFAULT FALSE,
    auto_action_sql TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert log
CREATE TABLE IF NOT EXISTS monitoring.alert_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_timestamp TIMESTAMPTZ DEFAULT NOW(),
    alert_threshold_id UUID REFERENCES monitoring.alert_thresholds(id),
    metric_name TEXT NOT NULL,
    current_value NUMERIC NOT NULL,
    threshold_value NUMERIC NOT NULL,
    severity_level TEXT NOT NULL,
    alert_message TEXT,
    auto_action_executed BOOLEAN DEFAULT FALSE,
    auto_action_result TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON monitoring.system_metrics(metric_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_phase ON monitoring.system_metrics(migration_phase, metric_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_database_performance_table ON monitoring.database_performance(schema_name, table_name, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_performance_captured ON monitoring.query_performance(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_operations_phase ON monitoring.migration_operations(migration_phase, operation_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alert_log_timestamp ON monitoring.alert_log(alert_timestamp DESC);

-- =====================================================
-- MONITORING COLLECTION FUNCTIONS
-- =====================================================

-- Function to collect system metrics
CREATE OR REPLACE FUNCTION monitoring.collect_system_metrics(migration_phase TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    metrics_record RECORD;
    collection_results JSONB;
BEGIN
    -- Collect current system metrics
    SELECT 
        -- Database connections
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
        
        -- Longest running query
        (SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - query_start))), 0)
         FROM pg_stat_activity 
         WHERE state = 'active' AND query_start IS NOT NULL) as longest_running_query_seconds,
        
        -- Database size
        (SELECT ROUND(pg_database_size(current_database()) / 1024.0 / 1024.0, 2)) as database_size_mb,
        
        -- Buffer cache hit ratio
        (SELECT ROUND(100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)), 2)
         FROM pg_stat_database WHERE datname = current_database()) as buffer_cache_hit_ratio,
        
        -- Lock waits and deadlocks
        (SELECT count(*) FROM pg_locks WHERE NOT granted) as lock_waits,
        (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()) as deadlocks,
        
        -- Temporary files
        (SELECT temp_files FROM pg_stat_database WHERE datname = current_database()) as temp_files_created,
        (SELECT temp_bytes FROM pg_stat_database WHERE datname = current_database()) as temp_bytes_used,
        
        -- WAL stats
        (SELECT archived_count FROM pg_stat_archiver) as wal_files_archived,
        (SELECT failed_count FROM pg_stat_archiver) as wal_archive_failures
    INTO metrics_record;
    
    -- Insert metrics into monitoring table
    INSERT INTO monitoring.system_metrics (
        migration_phase, active_connections, idle_connections, longest_running_query_seconds,
        database_size_mb, buffer_cache_hit_ratio, lock_waits, deadlocks,
        temp_files_created, temp_bytes_used, wal_files_archived, wal_archive_failures
    ) VALUES (
        migration_phase, metrics_record.active_connections, metrics_record.idle_connections,
        metrics_record.longest_running_query_seconds, metrics_record.database_size_mb,
        metrics_record.buffer_cache_hit_ratio, metrics_record.lock_waits, metrics_record.deadlocks,
        metrics_record.temp_files_created, metrics_record.temp_bytes_used,
        metrics_record.wal_files_archived, metrics_record.wal_archive_failures
    );
    
    collection_results := jsonb_build_object(
        'migration_phase', migration_phase,
        'collected_at', NOW(),
        'metrics', row_to_json(metrics_record)
    );
    
    RETURN collection_results;
END;
$$ LANGUAGE plpgsql;

-- Function to collect database performance metrics
CREATE OR REPLACE FUNCTION monitoring.collect_database_performance(migration_phase TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    table_record RECORD;
    collection_results JSONB := '{"collected_tables": []}'::jsonb;
    collected_count INTEGER := 0;
BEGIN
    -- Collect performance metrics for all relevant tables
    FOR table_record IN 
        SELECT 
            schemaname, tablename,
            ROUND(pg_total_relation_size(schemaname||'.'||tablename) / 1024.0 / 1024.0, 2) as table_size_mb,
            ROUND(pg_indexes_size(schemaname||'.'||tablename) / 1024.0 / 1024.0, 2) as index_size_mb,
            seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
            n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup,
            vacuum_count, autovacuum_count, analyze_count, autoanalyze_count
        FROM pg_stat_user_tables
        WHERE schemaname IN ('public', 'auth')
    LOOP
        -- Insert performance data
        INSERT INTO monitoring.database_performance (
            migration_phase, table_name, schema_name, table_size_mb, index_size_mb,
            seq_scan_count, seq_tup_read, idx_scan_count, idx_tup_fetch,
            n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup,
            vacuum_count, autovacuum_count, analyze_count, autoanalyze_count
        ) VALUES (
            migration_phase, table_record.tablename, table_record.schemaname,
            table_record.table_size_mb, table_record.index_size_mb,
            table_record.seq_scan, table_record.seq_tup_read,
            table_record.idx_scan, table_record.idx_tup_fetch,
            table_record.n_tup_ins, table_record.n_tup_upd, table_record.n_tup_del,
            table_record.n_live_tup, table_record.n_dead_tup,
            table_record.vacuum_count, table_record.autovacuum_count,
            table_record.analyze_count, table_record.autoanalyze_count
        );
        
        collected_count := collected_count + 1;
        
        collection_results := jsonb_set(collection_results, '{collected_tables}', 
                                       (collection_results->'collected_tables') || 
                                       to_jsonb(table_record.schemaname || '.' || table_record.tablename));
    END LOOP;
    
    collection_results := collection_results || jsonb_build_object(
        'migration_phase', migration_phase,
        'collected_at', NOW(),
        'tables_collected', collected_count
    );
    
    RETURN collection_results;
END;
$$ LANGUAGE plpgsql;

-- Function to collect query performance metrics
CREATE OR REPLACE FUNCTION monitoring.collect_query_performance(migration_phase TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    query_record RECORD;
    collection_results JSONB := '{"collected_queries": []}'::jsonb;
    collected_count INTEGER := 0;
BEGIN
    -- Collect performance metrics for slow queries
    FOR query_record IN 
        SELECT 
            md5(query) as query_hash,
            substr(query, 1, 500) as query_text,
            calls, total_time, mean_time, stddev_time, min_time, max_time,
            rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written,
            local_blks_hit, local_blks_read, temp_blks_read, temp_blks_written
        FROM pg_stat_statements
        WHERE query NOT LIKE '%pg_stat_statements%'
        AND calls > 10
        ORDER BY mean_time DESC
        LIMIT 50
    LOOP
        -- Insert query performance data
        INSERT INTO monitoring.query_performance (
            migration_phase, query_hash, query_text, calls, total_time_ms, mean_time_ms,
            stddev_time_ms, min_time_ms, max_time_ms, rows_returned,
            shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written,
            local_blks_hit, local_blks_read, temp_blks_read, temp_blks_written
        ) VALUES (
            migration_phase, query_record.query_hash, query_record.query_text,
            query_record.calls, query_record.total_time, query_record.mean_time,
            query_record.stddev_time, query_record.min_time, query_record.max_time,
            query_record.rows, query_record.shared_blks_hit, query_record.shared_blks_read,
            query_record.shared_blks_dirtied, query_record.shared_blks_written,
            query_record.local_blks_hit, query_record.local_blks_read,
            query_record.temp_blks_read, query_record.temp_blks_written
        );
        
        collected_count := collected_count + 1;
    END LOOP;
    
    collection_results := collection_results || jsonb_build_object(
        'migration_phase', migration_phase,
        'collected_at', NOW(),
        'queries_collected', collected_count
    );
    
    RETURN collection_results;
END;
$$ LANGUAGE plpgsql;

-- Function to setup default alert thresholds
CREATE OR REPLACE FUNCTION monitoring.setup_default_alert_thresholds()
RETURNS JSONB AS $$
DECLARE
    setup_results JSONB := '{"configured_alerts": []}'::jsonb;
    threshold_id UUID;
BEGIN
    -- High CPU usage (warning at 80%, critical at 95%)
    INSERT INTO monitoring.alert_thresholds 
    (metric_name, threshold_type, threshold_value, comparison_operator, alert_message_template)
    VALUES 
    ('cpu_usage_percent', 'warning', 80, '>=', 'CPU usage is high: {{current_value}}%')
    ON CONFLICT (metric_name) DO NOTHING
    RETURNING id INTO threshold_id;
    
    IF threshold_id IS NOT NULL THEN
        setup_results := jsonb_set(setup_results, '{configured_alerts}', 
                                  (setup_results->'configured_alerts') || 
                                  jsonb_build_object('alert', 'cpu_usage_warning', 'id', threshold_id));
    END IF;
    
    -- Memory usage warning
    INSERT INTO monitoring.alert_thresholds 
    (metric_name, threshold_type, threshold_value, comparison_operator, alert_message_template)
    VALUES 
    ('memory_usage_percent', 'warning', 85, '>=', 'Memory usage is high: {{current_value}}%')
    ON CONFLICT (metric_name) DO NOTHING
    RETURNING id INTO threshold_id;
    
    -- Active connections warning
    INSERT INTO monitoring.alert_thresholds 
    (metric_name, threshold_type, threshold_value, comparison_operator, alert_message_template)
    VALUES 
    ('active_connections', 'warning', 100, '>=', 'High number of active connections: {{current_value}}')
    ON CONFLICT (metric_name) DO NOTHING
    RETURNING id INTO threshold_id;
    
    -- Long running queries
    INSERT INTO monitoring.alert_thresholds 
    (metric_name, threshold_type, threshold_value, comparison_operator, alert_message_template)
    VALUES 
    ('longest_running_query_seconds', 'warning', 300, '>=', 'Long running query detected: {{current_value}} seconds')
    ON CONFLICT (metric_name) DO NOTHING
    RETURNING id INTO threshold_id;
    
    -- Buffer cache hit ratio
    INSERT INTO monitoring.alert_thresholds 
    (metric_name, threshold_type, threshold_value, comparison_operator, alert_message_template)
    VALUES 
    ('buffer_cache_hit_ratio', 'warning', 95, '<', 'Low buffer cache hit ratio: {{current_value}}%')
    ON CONFLICT (metric_name) DO NOTHING
    RETURNING id INTO threshold_id;
    
    -- Lock waits
    INSERT INTO monitoring.alert_thresholds 
    (metric_name, threshold_type, threshold_value, comparison_operator, alert_message_template)
    VALUES 
    ('lock_waits', 'warning', 10, '>=', 'High number of lock waits: {{current_value}}')
    ON CONFLICT (metric_name) DO NOTHING
    RETURNING id INTO threshold_id;
    
    -- Deadlocks
    INSERT INTO monitoring.alert_thresholds 
    (metric_name, threshold_type, threshold_value, comparison_operator, alert_message_template)
    VALUES 
    ('deadlocks', 'critical', 1, '>=', 'Deadlocks detected: {{current_value}}')
    ON CONFLICT (metric_name) DO NOTHING
    RETURNING id INTO threshold_id;
    
    setup_results := setup_results || jsonb_build_object(
        'setup_completed_at', NOW(),
        'total_thresholds_configured', (SELECT COUNT(*) FROM monitoring.alert_thresholds)
    );
    
    RETURN setup_results;
END;
$$ LANGUAGE plpgsql;

-- Function to check alert thresholds
CREATE OR REPLACE FUNCTION monitoring.check_alert_thresholds()
RETURNS JSONB AS $$
DECLARE
    threshold_record RECORD;
    current_value NUMERIC;
    alert_triggered BOOLEAN;
    check_results JSONB := '{"triggered_alerts": []}'::jsonb;
    triggered_count INTEGER := 0;
BEGIN
    FOR threshold_record IN 
        SELECT * FROM monitoring.alert_thresholds 
        WHERE enabled = TRUE
        AND (last_alert_sent IS NULL OR last_alert_sent < NOW() - (alert_frequency_minutes || ' minutes')::INTERVAL)
    LOOP
        -- Get current metric value from latest system metrics
        EXECUTE format('SELECT %I FROM monitoring.system_metrics ORDER BY metric_timestamp DESC LIMIT 1', 
                      threshold_record.metric_name) INTO current_value;
        
        -- Check if threshold is exceeded
        EXECUTE format('SELECT %s %s %s', 
                      current_value, 
                      threshold_record.comparison_operator, 
                      threshold_record.threshold_value) INTO alert_triggered;
        
        IF alert_triggered THEN
            -- Log alert
            INSERT INTO monitoring.alert_log 
            (alert_threshold_id, metric_name, current_value, threshold_value, 
             severity_level, alert_message)
            VALUES 
            (threshold_record.id, threshold_record.metric_name, current_value, 
             threshold_record.threshold_value, threshold_record.threshold_type,
             replace(replace(threshold_record.alert_message_template, '{{current_value}}', current_value::TEXT),
                    '{{threshold_value}}', threshold_record.threshold_value::TEXT));
            
            -- Update last alert sent time
            UPDATE monitoring.alert_thresholds
            SET last_alert_sent = NOW()
            WHERE id = threshold_record.id;
            
            triggered_count := triggered_count + 1;
            
            check_results := jsonb_set(check_results, '{triggered_alerts}', 
                                      (check_results->'triggered_alerts') || 
                                      jsonb_build_object(
                                          'metric_name', threshold_record.metric_name,
                                          'severity_level', threshold_record.threshold_type,
                                          'current_value', current_value,
                                          'threshold_value', threshold_record.threshold_value,
                                          'triggered_at', NOW()
                                      ));
            
            -- Execute auto-action if enabled
            IF threshold_record.auto_action_enabled AND threshold_record.auto_action_sql IS NOT NULL THEN
                BEGIN
                    EXECUTE threshold_record.auto_action_sql;
                    
                    UPDATE monitoring.alert_log
                    SET auto_action_executed = TRUE,
                        auto_action_result = 'SUCCESS'
                    WHERE alert_threshold_id = threshold_record.id
                    AND alert_timestamp = (SELECT MAX(alert_timestamp) FROM monitoring.alert_log WHERE alert_threshold_id = threshold_record.id);
                    
                EXCEPTION WHEN OTHERS THEN
                    UPDATE monitoring.alert_log
                    SET auto_action_executed = TRUE,
                        auto_action_result = 'FAILED: ' || SQLERRM
                    WHERE alert_threshold_id = threshold_record.id
                    AND alert_timestamp = (SELECT MAX(alert_timestamp) FROM monitoring.alert_log WHERE alert_threshold_id = threshold_record.id);
                END;
            END IF;
        END IF;
    END LOOP;
    
    check_results := check_results || jsonb_build_object(
        'checked_at', NOW(),
        'triggered_count', triggered_count
    );
    
    RETURN check_results;
END;
$$ LANGUAGE plpgsql;

-- Function to log migration operation
CREATE OR REPLACE FUNCTION monitoring.log_migration_operation(
    migration_phase TEXT,
    operation_type TEXT,
    operation_target TEXT,
    operation_status TEXT DEFAULT 'started',
    duration_seconds NUMERIC DEFAULT NULL,
    rows_affected BIGINT DEFAULT NULL,
    operation_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    operation_id UUID;
BEGIN
    INSERT INTO monitoring.migration_operations 
    (migration_phase, operation_type, operation_target, operation_status, 
     duration_seconds, rows_affected, operation_details)
    VALUES 
    (migration_phase, operation_type, operation_target, operation_status,
     duration_seconds, rows_affected, operation_details)
    RETURNING id INTO operation_id;
    
    RETURN operation_id;
END;
$$ LANGUAGE plpgsql;

-- Function to start comprehensive monitoring
CREATE OR REPLACE FUNCTION monitoring.start_migration_monitoring(migration_phase TEXT)
RETURNS JSONB AS $$
DECLARE
    monitoring_session_id UUID := gen_random_uuid();
    monitoring_results JSONB;
BEGIN
    -- Collect initial baseline metrics
    PERFORM monitoring.collect_system_metrics(migration_phase);
    PERFORM monitoring.collect_database_performance(migration_phase);
    PERFORM monitoring.collect_query_performance(migration_phase);
    
    -- Setup alert thresholds if not already configured
    PERFORM monitoring.setup_default_alert_thresholds();
    
    monitoring_results := jsonb_build_object(
        'monitoring_session_id', monitoring_session_id,
        'migration_phase', migration_phase,
        'started_at', NOW(),
        'baseline_collected', true,
        'alert_thresholds_configured', true
    );
    
    -- Log monitoring start
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('migration_monitoring_started', 'consolidation', monitoring_results);
    
    RETURN monitoring_results;
END;
$$ LANGUAGE plpgsql;

-- Function to generate monitoring report
CREATE OR REPLACE FUNCTION monitoring.generate_monitoring_report(
    migration_phase TEXT DEFAULT NULL,
    time_range_hours INTEGER DEFAULT 1
)
RETURNS TEXT AS $$
DECLARE
    report TEXT := '';
    metric_summary RECORD;
    alert_summary RECORD;
    operation_summary RECORD;
BEGIN
    -- Report header
    report := report || E'DomainFlow Migration Monitoring Report\n';
    report := report || E'====================================\n\n';
    report := report || E'Migration Phase: ' || COALESCE(migration_phase, 'All Phases') || E'\n';
    report := report || E'Time Range: Last ' || time_range_hours || E' hours\n';
    report := report || E'Generated: ' || NOW() || E'\n\n';
    
    -- System metrics summary
    SELECT 
        AVG(active_connections) as avg_connections,
        MAX(active_connections) as max_connections,
        AVG(buffer_cache_hit_ratio) as avg_cache_hit_ratio,
        MIN(buffer_cache_hit_ratio) as min_cache_hit_ratio,
        MAX(longest_running_query_seconds) as max_query_time,
        SUM(lock_waits) as total_lock_waits,
        SUM(deadlocks) as total_deadlocks
    INTO metric_summary
    FROM monitoring.system_metrics
    WHERE metric_timestamp > NOW() - (time_range_hours || ' hours')::INTERVAL
    AND (migration_phase IS NULL OR monitoring.system_metrics.migration_phase = migration_phase);
    
    report := report || E'SYSTEM METRICS SUMMARY:\n';
    report := report || E'  Average Active Connections: ' || COALESCE(ROUND(metric_summary.avg_connections, 0)::TEXT, 'N/A') || E'\n';
    report := report || E'  Peak Active Connections: ' || COALESCE(metric_summary.max_connections::TEXT, 'N/A') || E'\n';
    report := report || E'  Average Cache Hit Ratio: ' || COALESCE(ROUND(metric_summary.avg_cache_hit_ratio, 2)::TEXT, 'N/A') || E'%\n';
    report := report || E'  Minimum Cache Hit Ratio: ' || COALESCE(ROUND(metric_summary.min_cache_hit_ratio, 2)::TEXT, 'N/A') || E'%\n';
    report := report || E'  Longest Query Time: ' || COALESCE(metric_summary.max_query_time::TEXT, 'N/A') || E' seconds\n';
    report := report || E'  Total Lock Waits: ' || COALESCE(metric_summary.total_lock_waits::TEXT, 'N/A') || E'\n';
    report := report || E'  Total Deadlocks: ' || COALESCE(metric_summary.total_deadlocks::TEXT, 'N/A') || E'\n\n';
    
    -- Alert summary
    SELECT 
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN severity_level = 'critical' THEN 1 END) as critical_alerts,
        COUNT(CASE WHEN severity_level = 'warning' THEN 1 END) as warning_alerts,
        COUNT(CASE WHEN acknowledged = true THEN 1 END) as acknowledged_alerts
    INTO alert_summary
    FROM monitoring.alert_log
    WHERE alert_timestamp > NOW() - (time_range_hours || ' hours')::INTERVAL;
    
    report := report || E'ALERTS SUMMARY:\n';
    report := report || E'  Total Alerts: ' || alert_summary.total_alerts || E'\n';
    report := report || E'  Critical Alerts: ' || alert_summary.critical_alerts || E'\n';
    report := report || E'  Warning Alerts: ' || alert_summary.warning_alerts || E'\n';
    report := report || E'  Acknowledged Alerts: ' || alert_summary.acknowledged_alerts || E'\n\n';
    
    -- Migration operations summary
    SELECT 
        COUNT(*) as total_operations,
        COUNT(CASE WHEN operation_status = 'completed' THEN 1 END) as completed_operations,
        COUNT(CASE WHEN operation_status = 'failed' THEN 1 END) as failed_operations,
        AVG(duration_seconds) as avg_duration,
        SUM(rows_affected) as total_rows_affected
    INTO operation_summary
    FROM monitoring.migration_operations
    WHERE operation_timestamp > NOW() - (time_range_hours || ' hours')::INTERVAL
    AND (migration_phase IS NULL OR monitoring.migration_operations.migration_phase = migration_phase);
    
    report := report || E'MIGRATION OPERATIONS:\n';
    report := report || E'  Total Operations: ' || COALESCE(operation_summary.total_operations::TEXT, '0') || E'\n';
    report := report || E'  Completed Operations: ' || COALESCE(operation_summary.completed_operations::TEXT, '0') || E'\n';
    report := report || E'  Failed Operations: ' || COALESCE(operation_summary.failed_operations::TEXT, '0') || E'\n';
    report := report || E'  Average Duration: ' || COALESCE(ROUND(operation_summary.avg_duration, 2)::TEXT, 'N/A') || E' seconds\n';
    report := report || E'  Total Rows Affected: ' || COALESCE(operation_summary.total_rows_affected::TEXT, 'N/A') || E'\n\n';
    
    -- Recommendations
    report := report || E'RECOMMENDATIONS:\n';
    IF metric_summary.min_cache_hit_ratio < 95 THEN
        report := report || E'⚠ Consider increasing shared_buffers - cache hit ratio below 95%\n';
    END IF;
    
    IF metric_summary.max_connections > 150 THEN
        report := report || E'⚠ High connection count detected - monitor for connection pooling issues\n';
    END IF;
    
    IF metric_summary.total_deadlocks > 0 THEN
        report := report || E'🔴 Deadlocks detected - review transaction isolation levels\n';
    END IF;
    
    IF alert_summary.critical_alerts > 0 THEN
        report := report || E'🔴 Critical alerts require immediate attention\n';
    END IF;
    
    RETURN report;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION monitoring.collect_system_metrics(TEXT) IS 
'Collects real-time system performance metrics for migration monitoring.';

COMMENT ON FUNCTION monitoring.start_migration_monitoring(TEXT) IS 
'Starts comprehensive monitoring for specified migration phase.';

COMMENT ON FUNCTION monitoring.check_alert_thresholds() IS 
'Checks all enabled alert thresholds and triggers alerts as needed.';

COMMENT ON FUNCTION monitoring.generate_monitoring_report(TEXT, INTEGER) IS 
'Generates comprehensive monitoring report for specified time range and migration phase.';

-- Create monitoring dashboard view
CREATE OR REPLACE VIEW monitoring.migration_dashboard AS
SELECT 
    sm.migration_phase,
    sm.metric_timestamp,
    sm.active_connections,
    sm.buffer_cache_hit_ratio,
    sm.longest_running_query_seconds,
    sm.lock_waits,
    sm.deadlocks,
    COUNT(al.id) as recent_alerts,
    COUNT(CASE WHEN al.severity_level = 'critical' THEN al.id END) as critical_alerts
FROM monitoring.system_metrics sm
LEFT JOIN monitoring.alert_log al ON al.alert_timestamp BETWEEN sm.metric_timestamp - INTERVAL '5 minutes' 
                                  AND sm.metric_timestamp + INTERVAL '5 minutes'
WHERE sm.metric_timestamp > NOW() - INTERVAL '24 hours'
GROUP BY sm.migration_phase, sm.metric_timestamp, sm.active_connections, 
         sm.buffer_cache_hit_ratio, sm.longest_running_query_seconds, 
         sm.lock_waits, sm.deadlocks
ORDER BY sm.metric_timestamp DESC;

COMMENT ON VIEW monitoring.migration_dashboard IS 
'Real-time dashboard view combining system metrics with recent alerts for migration monitoring.';