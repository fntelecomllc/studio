-- DomainFlow Performance Benchmarking Tool
-- Before/after performance comparison for schema consolidation
-- Measures query performance, index efficiency, and system metrics
-- Created: 2025-06-16

-- =====================================================
-- PERFORMANCE BENCHMARK INFRASTRUCTURE
-- =====================================================

-- Create benchmarking schema and tables
CREATE SCHEMA IF NOT EXISTS benchmarks;

-- Performance test results table
CREATE TABLE IF NOT EXISTS benchmarks.performance_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_suite_id UUID NOT NULL,
    test_name TEXT NOT NULL,
    test_category TEXT NOT NULL, -- 'query', 'index', 'insert', 'update', 'delete'
    schema_version TEXT NOT NULL, -- 'pre_consolidation', 'post_consolidation'
    execution_time_ms NUMERIC NOT NULL,
    rows_affected INTEGER,
    query_plan JSONB,
    system_metrics JSONB,
    test_sql TEXT,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- Benchmark test suites table
CREATE TABLE IF NOT EXISTS benchmarks.test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_name TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    avg_performance_improvement NUMERIC,
    notes TEXT
);

-- Benchmark comparisons table
CREATE TABLE IF NOT EXISTS benchmarks.performance_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pre_consolidation_suite_id UUID REFERENCES benchmarks.test_suites(id),
    post_consolidation_suite_id UUID REFERENCES benchmarks.test_suites(id),
    comparison_results JSONB NOT NULL,
    overall_improvement_percentage NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_performance_tests_suite_category ON benchmarks.performance_tests(test_suite_id, test_category);
CREATE INDEX IF NOT EXISTS idx_performance_tests_schema_version ON benchmarks.performance_tests(schema_version, test_name);
CREATE INDEX IF NOT EXISTS idx_test_suites_version ON benchmarks.test_suites(schema_version, started_at DESC);

-- =====================================================
-- CORE BENCHMARKING FUNCTIONS
-- =====================================================

-- Function to execute a single performance test
CREATE OR REPLACE FUNCTION benchmarks.execute_performance_test(
    p_test_suite_id UUID,
    p_test_name TEXT,
    p_test_category TEXT,
    p_test_sql TEXT,
    p_schema_version TEXT,
    p_expected_rows INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time_ms NUMERIC;
    rows_affected INTEGER := 0;
    query_plan JSONB;
    system_metrics JSONB;
    test_result JSONB;
    test_id UUID;
BEGIN
    -- Generate test ID
    test_id := gen_random_uuid();
    
    -- Collect system metrics before test
    system_metrics := jsonb_build_object(
        'shared_buffers_hit_ratio', 
        (SELECT ROUND(100.0 * sum(blks_hit) / sum(blks_hit + blks_read), 2) 
         FROM pg_stat_database WHERE datname = current_database()),
        'active_connections',
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
        'cache_hit_ratio',
        (SELECT ROUND(100.0 * sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)), 2)
         FROM pg_statio_user_tables)
    );
    
    -- Get query plan
    BEGIN
        EXECUTE 'EXPLAIN (FORMAT JSON, ANALYZE FALSE) ' || p_test_sql INTO query_plan;
    EXCEPTION WHEN OTHERS THEN
        query_plan := jsonb_build_object('error', 'Could not generate plan: ' || SQLERRM);
    END;
    
    -- Execute the test
    start_time := clock_timestamp();
    
    BEGIN
        EXECUTE p_test_sql;
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        end_time := clock_timestamp();
        execution_time_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
        
        INSERT INTO benchmarks.performance_tests 
        (id, test_suite_id, test_name, test_category, schema_version, execution_time_ms, 
         rows_affected, query_plan, system_metrics, test_sql, notes)
        VALUES 
        (test_id, p_test_suite_id, p_test_name, p_test_category, p_schema_version, 
         execution_time_ms, 0, query_plan, system_metrics, p_test_sql, 
         'FAILED: ' || SQLERRM);
        
        RETURN jsonb_build_object(
            'test_id', test_id,
            'status', 'FAILED',
            'error', SQLERRM,
            'execution_time_ms', execution_time_ms
        );
    END;
    
    end_time := clock_timestamp();
    execution_time_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    
    -- Insert test result
    INSERT INTO benchmarks.performance_tests 
    (id, test_suite_id, test_name, test_category, schema_version, execution_time_ms, 
     rows_affected, query_plan, system_metrics, test_sql)
    VALUES 
    (test_id, p_test_suite_id, p_test_name, p_test_category, p_schema_version, 
     execution_time_ms, rows_affected, query_plan, system_metrics, p_test_sql);
    
    -- Build result
    test_result := jsonb_build_object(
        'test_id', test_id,
        'status', 'SUCCESS',
        'execution_time_ms', execution_time_ms,
        'rows_affected', rows_affected,
        'expected_rows_match', CASE 
            WHEN p_expected_rows IS NULL THEN true
            ELSE rows_affected = p_expected_rows
        END
    );
    
    RETURN test_result;
END;
$$ LANGUAGE plpgsql;

-- Function to run comprehensive performance benchmark suite
CREATE OR REPLACE FUNCTION benchmarks.run_comprehensive_benchmark(
    p_schema_version TEXT,
    p_suite_name TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    suite_id UUID;
    suite_name TEXT;
    benchmark_results JSONB := '{"test_results": []}'::jsonb;
    test_result JSONB;
    total_tests INTEGER := 0;
    passed_tests INTEGER := 0;
    failed_tests INTEGER := 0;
    start_time TIMESTAMP := NOW();
BEGIN
    -- Generate suite name if not provided
    suite_name := COALESCE(p_suite_name, 'benchmark_' || p_schema_version || '_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MISS'));
    
    -- Create test suite
    INSERT INTO benchmarks.test_suites (suite_name, schema_version, started_at)
    VALUES (suite_name, p_schema_version, start_time)
    RETURNING id INTO suite_id;
    
    benchmark_results := benchmark_results || jsonb_build_object(
        'suite_id', suite_id,
        'suite_name', suite_name,
        'schema_version', p_schema_version,
        'started_at', start_time
    );
    
    -- Test 1: Campaign listing query (most common query)
    test_result := benchmarks.execute_performance_test(
        suite_id, 
        'campaign_listing_by_user', 
        'query',
        'SELECT c.id, c.name, c.status, c.progress_percentage, c.created_at FROM campaigns c WHERE c.user_id IS NOT NULL ORDER BY c.created_at DESC LIMIT 50',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 2: Domain generation with large offset
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'domain_generation_large_offset',
        'query',
        'SELECT gd.id, gd.domain_name, gd.offset_index FROM generated_domains gd WHERE gd.offset_index > 10000 ORDER BY gd.offset_index LIMIT 100',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 3: Session validation query (critical for auth performance)
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'session_validation',
        'query',
        'SELECT s.id, s.user_id, s.expires_at, s.is_active FROM auth.sessions s WHERE s.is_active = true AND s.expires_at > NOW() LIMIT 100',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 4: Complex campaign statistics query
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'campaign_statistics_complex',
        'query',
        'SELECT c.id, COUNT(gd.id) as domain_count, COUNT(dvr.id) as dns_results, COUNT(hkr.id) as http_results FROM campaigns c LEFT JOIN generated_domains gd ON c.id = gd.domain_generation_campaign_id LEFT JOIN dns_validation_results dvr ON c.id = dvr.dns_campaign_id LEFT JOIN http_keyword_results hkr ON c.id = hkr.http_keyword_campaign_id GROUP BY c.id LIMIT 50',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 5: User permissions query (RBAC performance)
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'user_permissions_lookup',
        'query',
        'SELECT u.id, u.email, array_agg(DISTINCT p.name) as permissions FROM auth.users u LEFT JOIN auth.user_roles ur ON u.id = ur.user_id LEFT JOIN auth.roles r ON ur.role_id = r.id LEFT JOIN auth.role_permissions rp ON r.id = rp.role_id LEFT JOIN auth.permissions p ON rp.permission_id = p.id WHERE u.is_active = true GROUP BY u.id, u.email LIMIT 100',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 6: Audit log search (large table scan)
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'audit_log_search',
        'query',
        'SELECT al.id, al.action, al.entity_type, al.timestamp FROM audit_logs al WHERE al.timestamp > NOW() - INTERVAL ''7 days'' ORDER BY al.timestamp DESC LIMIT 1000',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 7: Insert performance test
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'campaign_insert_performance',
        'insert',
        'INSERT INTO campaigns (name, campaign_type, status, user_id, total_items) VALUES (''benchmark_test_' || extract(epoch from now()) || ''', ''domain_generation'', ''pending'', null, 1000)',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 8: Update performance test
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'campaign_update_performance',
        'update',
        'UPDATE campaigns SET progress_percentage = 50.0, processed_items = 500 WHERE name LIKE ''benchmark_test_%''',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 9: Index usage analysis
    test_result := benchmarks.execute_performance_test(
        suite_id,
        'index_usage_analysis',
        'query',
        'SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch FROM pg_stat_user_indexes WHERE schemaname IN (''public'', ''auth'') ORDER BY idx_scan DESC LIMIT 20',
        p_schema_version
    );
    benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                  (benchmark_results->'test_results') || test_result);
    total_tests := total_tests + 1;
    IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    
    -- Test 10: Materialized view performance (if exists)
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'campaign_statistics') THEN
        test_result := benchmarks.execute_performance_test(
            suite_id,
            'materialized_view_query',
            'query',
            'SELECT cs.id, cs.campaign_type, cs.total_domains, cs.avg_processing_time_per_item FROM campaign_statistics cs ORDER BY cs.created_at DESC LIMIT 100',
            p_schema_version
        );
        benchmark_results := jsonb_set(benchmark_results, '{test_results}', 
                                      (benchmark_results->'test_results') || test_result);
        total_tests := total_tests + 1;
        IF test_result->>'status' = 'SUCCESS' THEN passed_tests := passed_tests + 1; ELSE failed_tests := failed_tests + 1; END IF;
    END IF;
    
    -- Clean up test data
    DELETE FROM campaigns WHERE name LIKE 'benchmark_test_%';
    
    -- Update test suite with results
    UPDATE benchmarks.test_suites
    SET completed_at = NOW(),
        total_tests = total_tests,
        passed_tests = passed_tests,
        failed_tests = failed_tests
    WHERE id = suite_id;
    
    -- Finalize results
    benchmark_results := benchmark_results || jsonb_build_object(
        'completed_at', NOW(),
        'duration_seconds', EXTRACT(EPOCH FROM (NOW() - start_time)),
        'total_tests', total_tests,
        'passed_tests', passed_tests,
        'failed_tests', failed_tests,
        'success_rate', ROUND(passed_tests::NUMERIC / total_tests * 100, 2)
    );
    
    RETURN benchmark_results;
END;
$$ LANGUAGE plpgsql;

-- Function to compare performance between schema versions
CREATE OR REPLACE FUNCTION benchmarks.compare_performance(
    pre_consolidation_suite_id UUID,
    post_consolidation_suite_id UUID
)
RETURNS JSONB AS $$
DECLARE
    comparison_results JSONB := '{"test_comparisons": []}'::jsonb;
    test_comparison JSONB;
    pre_test RECORD;
    post_test RECORD;
    improvement_percentage NUMERIC;
    total_improvement NUMERIC := 0;
    test_count INTEGER := 0;
    comparison_id UUID;
BEGIN
    comparison_id := gen_random_uuid();
    
    -- Compare matching tests between suites
    FOR pre_test IN 
        SELECT test_name, test_category, execution_time_ms, rows_affected
        FROM benchmarks.performance_tests 
        WHERE test_suite_id = pre_consolidation_suite_id
    LOOP
        SELECT execution_time_ms, rows_affected
        INTO post_test
        FROM benchmarks.performance_tests
        WHERE test_suite_id = post_consolidation_suite_id
        AND test_name = pre_test.test_name
        AND test_category = pre_test.test_category;
        
        IF FOUND THEN
            -- Calculate improvement percentage
            improvement_percentage := ROUND(
                ((pre_test.execution_time_ms - post_test.execution_time_ms) / pre_test.execution_time_ms) * 100,
                2
            );
            
            test_comparison := jsonb_build_object(
                'test_name', pre_test.test_name,
                'test_category', pre_test.test_category,
                'pre_consolidation_ms', pre_test.execution_time_ms,
                'post_consolidation_ms', post_test.execution_time_ms,
                'improvement_percentage', improvement_percentage,
                'performance_status', CASE 
                    WHEN improvement_percentage > 10 THEN 'SIGNIFICANT_IMPROVEMENT'
                    WHEN improvement_percentage > 0 THEN 'IMPROVEMENT'
                    WHEN improvement_percentage = 0 THEN 'NO_CHANGE'
                    WHEN improvement_percentage > -10 THEN 'SLIGHT_DEGRADATION'
                    ELSE 'SIGNIFICANT_DEGRADATION'
                END,
                'rows_affected_pre', pre_test.rows_affected,
                'rows_affected_post', post_test.rows_affected
            );
            
            comparison_results := jsonb_set(comparison_results, '{test_comparisons}', 
                                          (comparison_results->'test_comparisons') || test_comparison);
            
            total_improvement := total_improvement + improvement_percentage;
            test_count := test_count + 1;
        END IF;
    END LOOP;
    
    -- Calculate overall improvement
    comparison_results := comparison_results || jsonb_build_object(
        'overall_improvement_percentage', ROUND(total_improvement / GREATEST(test_count, 1), 2),
        'total_compared_tests', test_count,
        'comparison_summary', jsonb_build_object(
            'significant_improvements', (
                SELECT COUNT(*) 
                FROM jsonb_array_elements(comparison_results->'test_comparisons') AS test 
                WHERE (test->>'improvement_percentage')::NUMERIC > 10
            ),
            'improvements', (
                SELECT COUNT(*) 
                FROM jsonb_array_elements(comparison_results->'test_comparisons') AS test 
                WHERE (test->>'improvement_percentage')::NUMERIC > 0
            ),
            'degradations', (
                SELECT COUNT(*) 
                FROM jsonb_array_elements(comparison_results->'test_comparisons') AS test 
                WHERE (test->>'improvement_percentage')::NUMERIC < 0
            )
        ),
        'created_at', NOW()
    );
    
    -- Store comparison results
    INSERT INTO benchmarks.performance_comparisons 
    (id, pre_consolidation_suite_id, post_consolidation_suite_id, comparison_results, overall_improvement_percentage)
    VALUES 
    (comparison_id, pre_consolidation_suite_id, post_consolidation_suite_id, comparison_results, 
     (comparison_results->>'overall_improvement_percentage')::NUMERIC);
    
    comparison_results := comparison_results || jsonb_build_object('comparison_id', comparison_id);
    
    RETURN comparison_results;
END;
$$ LANGUAGE plpgsql;

-- Function to generate performance report
CREATE OR REPLACE FUNCTION benchmarks.generate_performance_report(comparison_id UUID)
RETURNS TEXT AS $$
DECLARE
    comparison_data RECORD;
    report TEXT := '';
    test_comparison JSONB;
BEGIN
    -- Get comparison data
    SELECT pc.*, 
           pre.suite_name as pre_suite_name, pre.started_at as pre_started_at,
           post.suite_name as post_suite_name, post.started_at as post_started_at
    INTO comparison_data
    FROM benchmarks.performance_comparisons pc
    JOIN benchmarks.test_suites pre ON pc.pre_consolidation_suite_id = pre.id
    JOIN benchmarks.test_suites post ON pc.post_consolidation_suite_id = post.id
    WHERE pc.id = comparison_id;
    
    IF NOT FOUND THEN
        RETURN 'Performance comparison not found for ID: ' || comparison_id;
    END IF;
    
    -- Build report header
    report := report || E'DomainFlow Schema Consolidation Performance Report\n';
    report := report || E'============================================\n\n';
    report := report || E'Comparison ID: ' || comparison_id || E'\n';
    report := report || E'Generated: ' || NOW() || E'\n';
    report := report || E'Overall Performance Improvement: ' || comparison_data.overall_improvement_percentage || E'%\n\n';
    
    -- Pre-consolidation info
    report := report || E'Pre-Consolidation Benchmark:\n';
    report := report || E'  Suite: ' || comparison_data.pre_suite_name || E'\n';
    report := report || E'  Run Date: ' || comparison_data.pre_started_at || E'\n\n';
    
    -- Post-consolidation info
    report := report || E'Post-Consolidation Benchmark:\n';
    report := report || E'  Suite: ' || comparison_data.post_suite_name || E'\n';
    report := report || E'  Run Date: ' || comparison_data.post_started_at || E'\n\n';
    
    -- Summary statistics
    report := report || E'Summary:\n';
    report := report || E'  Total Tests Compared: ' || (comparison_data.comparison_results->>'total_compared_tests') || E'\n';
    report := report || E'  Significant Improvements: ' || (comparison_data.comparison_results->'comparison_summary'->>'significant_improvements') || E'\n';
    report := report || E'  Total Improvements: ' || (comparison_data.comparison_results->'comparison_summary'->>'improvements') || E'\n';
    report := report || E'  Degradations: ' || (comparison_data.comparison_results->'comparison_summary'->>'degradations') || E'\n\n';
    
    -- Detailed test results
    report := report || E'Detailed Test Results:\n';
    report := report || E'=====================\n\n';
    
    FOR test_comparison IN 
        SELECT value FROM jsonb_array_elements(comparison_data.comparison_results->'test_comparisons')
    LOOP
        report := report || E'Test: ' || (test_comparison->>'test_name') || E'\n';
        report := report || E'  Category: ' || (test_comparison->>'test_category') || E'\n';
        report := report || E'  Pre-Consolidation: ' || (test_comparison->>'pre_consolidation_ms') || E' ms\n';
        report := report || E'  Post-Consolidation: ' || (test_comparison->>'post_consolidation_ms') || E' ms\n';
        report := report || E'  Improvement: ' || (test_comparison->>'improvement_percentage') || E'%\n';
        report := report || E'  Status: ' || (test_comparison->>'performance_status') || E'\n\n';
    END LOOP;
    
    -- Recommendations
    report := report || E'Recommendations:\n';
    report := report || E'================\n';
    
    IF comparison_data.overall_improvement_percentage > 50 THEN
        report := report || E'✓ Excellent performance improvement achieved\n';
        report := report || E'✓ Schema consolidation was highly successful\n';
    ELSIF comparison_data.overall_improvement_percentage > 20 THEN
        report := report || E'✓ Good performance improvement achieved\n';
        report := report || E'✓ Schema consolidation was successful\n';
    ELSIF comparison_data.overall_improvement_percentage > 0 THEN
        report := report || E'✓ Moderate performance improvement achieved\n';
        report := report || E'• Consider additional optimizations for critical queries\n';
    ELSE
        report := report || E'⚠ Performance degradation detected\n';
        report := report || E'• Review query plans and index usage\n';
        report := report || E'• Consider rolling back if degradation is significant\n';
    END IF;
    
    RETURN report;
END;
$$ LANGUAGE plpgsql;

-- Function to monitor ongoing performance during consolidation
CREATE OR REPLACE FUNCTION benchmarks.monitor_consolidation_performance()
RETURNS JSONB AS $$
DECLARE
    monitoring_results JSONB := '{}'::jsonb;
BEGIN
    monitoring_results := jsonb_build_object(
        'timestamp', NOW(),
        'active_connections', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
        'database_size_mb', (SELECT pg_size_pretty(pg_database_size(current_database()))),
        'cache_hit_ratio', (
            SELECT ROUND(100.0 * sum(blks_hit) / (sum(blks_hit) + sum(blks_read)), 2)
            FROM pg_stat_database 
            WHERE datname = current_database()
        ),
        'table_bloat_check', (
            SELECT jsonb_agg(jsonb_build_object(
                'table_name', schemaname || '.' || tablename,
                'size_mb', ROUND(pg_total_relation_size(schemaname||'.'||tablename) / 1024.0 / 1024.0, 2)
            ))
            FROM pg_tables 
            WHERE schemaname IN ('public', 'auth')
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
            LIMIT 10
        ),
        'slow_queries', (
            SELECT jsonb_agg(jsonb_build_object(
                'query', substr(query, 1, 100),
                'calls', calls,
                'mean_time_ms', ROUND(mean_time, 2),
                'total_time_ms', ROUND(total_time, 2)
            ))
            FROM pg_stat_statements 
            WHERE query NOT LIKE '%pg_stat_statements%'
            ORDER BY mean_time DESC
            LIMIT 5
        )
    );
    
    RETURN monitoring_results;
END;
$$ LANGUAGE plpgsql;

-- Add helpful comments
COMMENT ON FUNCTION benchmarks.run_comprehensive_benchmark(TEXT, TEXT) IS 
'Runs comprehensive performance benchmark suite. Use before and after consolidation for comparison.';

COMMENT ON FUNCTION benchmarks.compare_performance(UUID, UUID) IS 
'Compares performance between two benchmark suites and calculates improvements.';

COMMENT ON FUNCTION benchmarks.generate_performance_report(UUID) IS 
'Generates human-readable performance comparison report.';

COMMENT ON FUNCTION benchmarks.monitor_consolidation_performance() IS 
'Monitors real-time performance metrics during consolidation process.';

-- Create view for easy benchmark analysis
CREATE OR REPLACE VIEW benchmarks.latest_performance_summary AS
SELECT 
    ts.schema_version,
    ts.suite_name,
    ts.started_at,
    ts.total_tests,
    ts.passed_tests,
    ts.failed_tests,
    ROUND(AVG(pt.execution_time_ms), 2) as avg_execution_time_ms,
    ROUND(MIN(pt.execution_time_ms), 2) as min_execution_time_ms,
    ROUND(MAX(pt.execution_time_ms), 2) as max_execution_time_ms
FROM benchmarks.test_suites ts
JOIN benchmarks.performance_tests pt ON ts.id = pt.test_suite_id
GROUP BY ts.id, ts.schema_version, ts.suite_name, ts.started_at, ts.total_tests, ts.passed_tests, ts.failed_tests
ORDER BY ts.started_at DESC;

COMMENT ON VIEW benchmarks.latest_performance_summary IS 
'Summary view of performance benchmark results for easy analysis and reporting.';