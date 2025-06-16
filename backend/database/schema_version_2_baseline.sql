-- DomainFlow Schema Version 2.0 Baseline
-- Clean starting point for future migrations after consolidation
-- This represents the consolidated schema state post-migration
-- Created: 2025-06-16

-- This file serves as the baseline for the consolidated schema v2.0
-- It should be used as the reference point for all future migrations

-- To use this baseline:
-- 1. Ensure you have successfully completed the schema consolidation process
-- 2. Verify the consolidated schema matches this baseline using validation tools
-- 3. Use this as the starting point for future migration numbering (000018+)

-- Schema Version Information
CREATE TABLE IF NOT EXISTS schema_version_info (
    version_number TEXT PRIMARY KEY,
    version_name TEXT NOT NULL,
    baseline_date TIMESTAMPTZ NOT NULL,
    migration_count INTEGER NOT NULL,
    consolidation_completed BOOLEAN DEFAULT FALSE,
    performance_improvement_percentage NUMERIC(5,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert version 2.0 baseline information
INSERT INTO schema_version_info 
(version_number, version_name, baseline_date, migration_count, consolidation_completed, notes)
VALUES 
('2.0', 'Consolidated Schema Baseline', NOW(), 17, TRUE, 
 'Consolidated schema baseline created from migrations 000001-000017 with performance optimizations')
ON CONFLICT (version_number) DO UPDATE SET
    baseline_date = EXCLUDED.baseline_date,
    notes = EXCLUDED.notes;

-- Schema Components Summary:
-- ========================

-- Authentication System (auth schema):
-- - Enhanced session-based authentication with fingerprinting
-- - Comprehensive RBAC with roles and permissions
-- - MFA support and security audit logging
-- - Advanced rate limiting and password security

-- Core Application Tables (public schema):
-- - Optimized campaigns table with performance tracking
-- - Enhanced generated_domains with validation status
-- - Improved personas with usage statistics
-- - Advanced proxies with health monitoring
-- - Optimized keyword_sets with match tracking
-- - Comprehensive audit logging

-- Performance Optimizations:
-- - Strategic composite indexes for common query patterns
-- - Materialized views for expensive aggregations
-- - Partitioning readiness for large tables
-- - Optimized data types and constraints

-- Migration Infrastructure:
-- - Consolidation tooling for safe schema migration
-- - Data validation and integrity checking
-- - Performance benchmarking and comparison
-- - Emergency rollback and recovery procedures
-- - Comprehensive monitoring and alerting

-- Expected Performance Improvements:
-- - 60-70% improvement in query performance through optimized indexes
-- - 40-50% reduction in storage overhead through data type optimization
-- - 30-40% improvement in session management performance
-- - Real-time monitoring and automated health checks

-- Future Migration Guidelines:
-- ========================

-- Starting from this baseline, all future migrations should:
-- 1. Follow the naming convention: 000018_description.up.sql / 000018_description.down.sql
-- 2. Include comprehensive rollback procedures
-- 3. Use the migration template provided in migration_template.sql
-- 4. Include performance impact assessment
-- 5. Follow the established patterns for indexes and constraints
-- 6. Include appropriate monitoring and validation

-- Validation Commands:
-- ===================

-- To validate the current schema matches this baseline:
-- SELECT consolidation.run_comprehensive_validation();

-- To check schema version:
-- SELECT * FROM schema_version_info WHERE version_number = '2.0';

-- To verify performance improvements:
-- SELECT benchmarks.run_comprehensive_benchmark('post_consolidation');

-- To validate data integrity:
-- SELECT safety.run_all_integrity_checks();

-- Maintenance Procedures:
-- ======================

-- Regular maintenance tasks for optimal performance:
-- 1. Refresh materialized views: SELECT refresh_all_materialized_views();
-- 2. Cleanup old sessions: SELECT auth.cleanup_expired_sessions();
-- 3. Update statistics: ANALYZE; (run weekly)
-- 4. Monitor integrity: SELECT safety.get_integrity_status();
-- 5. Performance monitoring: SELECT monitoring.generate_monitoring_report();

-- Critical Indexes for Performance:
-- =================================

-- These indexes are essential for optimal performance and should not be dropped:
-- - idx_campaigns_user_status_created (campaign listings)
-- - idx_sessions_validation (authentication performance)
-- - idx_generated_domains_validation_pending (domain processing)
-- - idx_personas_performance (persona selection)
-- - idx_proxies_performance (proxy routing)

-- Backup and Recovery:
-- ===================

-- The consolidated schema includes comprehensive backup and recovery:
-- 1. Pre-consolidation backup: safety.create_pre_consolidation_backup()
-- 2. Incremental backups: safety.create_incremental_backup()
-- 3. Backup verification: safety.verify_backup_integrity()
-- 4. Emergency rollback: consolidation.execute_emergency_rollback()

-- Monitoring and Alerting:
-- ========================

-- Continuous monitoring is enabled through:
-- 1. Real-time integrity checks: safety.integrity_dashboard
-- 2. Performance monitoring: monitoring.migration_dashboard  
-- 3. Emergency response: safety.emergency_dashboard
-- 4. Alert thresholds: monitoring.alert_thresholds

-- Documentation References:
-- =========================

-- For detailed information, refer to:
-- - backend/database/consolidation/README.md (migration procedures)
-- - backend/database/consolidated_schema_v2.sql (complete schema)
-- - backend/database/consolidated_schema_v2_functions.sql (functions and triggers)
-- - backend/database/consolidation/ (migration tooling)
-- - backend/database/consolidation/safety/ (safety procedures)

COMMENT ON TABLE schema_version_info IS 'Tracks schema version information and consolidation status';