-- Drop all performance optimization indexes and materialized views

-- Drop materialized view and its function
DROP MATERIALIZED VIEW IF EXISTS campaign_statistics;
DROP FUNCTION IF EXISTS refresh_campaign_statistics();

-- Drop composite indexes
DROP INDEX IF EXISTS idx_campaigns_user_status_created;
DROP INDEX IF EXISTS idx_domains_campaign_offset_status;

-- Drop DNS validation indexes
DROP INDEX IF EXISTS idx_dns_validation_campaign_domain;
DROP INDEX IF EXISTS idx_dns_validation_status_checked;

-- Drop HTTP validation indexes
DROP INDEX IF EXISTS idx_http_validation_campaign_domain;
DROP INDEX IF EXISTS idx_http_validation_status_checked;

-- Drop other optimization indexes
DROP INDEX IF EXISTS idx_personas_type_enabled;
DROP INDEX IF EXISTS idx_proxies_healthy_checked;
DROP INDEX IF EXISTS idx_campaign_jobs_status_scheduled;
DROP INDEX IF EXISTS idx_campaign_jobs_next_execution;
DROP INDEX IF EXISTS idx_audit_logs_user_timestamp;
DROP INDEX IF EXISTS idx_audit_logs_entity_type_id;