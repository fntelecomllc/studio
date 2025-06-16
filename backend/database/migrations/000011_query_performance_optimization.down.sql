-- Rollback Phase 4: Query Performance Optimization

-- Drop trigger first
DROP TRIGGER IF EXISTS refresh_campaign_statistics_on_update ON campaigns;

-- Drop functions
DROP FUNCTION IF EXISTS trigger_refresh_campaign_statistics();
DROP FUNCTION IF EXISTS refresh_campaign_statistics(UUID);

-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS campaign_statistics;

-- Drop indexes in reverse order
DROP INDEX IF EXISTS idx_keyword_sets_user_enabled;
DROP INDEX IF EXISTS idx_personas_user_type;
DROP INDEX IF EXISTS idx_campaigns_active_status;
DROP INDEX IF EXISTS idx_audit_logs_entity_timestamp;
DROP INDEX IF EXISTS idx_campaign_jobs_status_next_exec;
DROP INDEX IF EXISTS idx_http_validation_campaign_created;
DROP INDEX IF EXISTS idx_dns_validation_campaign_created;
DROP INDEX IF EXISTS idx_domains_campaign_offset_status;
DROP INDEX IF EXISTS idx_campaigns_user_status_created;