-- Phase 5.1: Database Optimization Strategies - Additional Performance Indexes

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_user_status_created 
ON campaigns(user_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_campaign_offset_status 
ON generated_domains(domain_generation_campaign_id, offset_index);

-- Index for DNS validation lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dns_validation_campaign_domain
ON dns_validation_results(dns_campaign_id, domain_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dns_validation_status_checked
ON dns_validation_results(validation_status, last_checked_at DESC);

-- Index for HTTP keyword validation lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_http_validation_campaign_domain
ON http_keyword_results(http_keyword_campaign_id, domain_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_http_validation_status_checked
ON http_keyword_results(validation_status, last_checked_at DESC);

-- Persona lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personas_type_enabled
ON personas(persona_type, is_enabled);

-- Proxy health check optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proxies_healthy_checked
ON proxies(is_healthy, last_checked_at DESC);

-- Campaign job processing optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_jobs_status_scheduled
ON campaign_jobs(status, scheduled_at)
WHERE status IN ('queued', 'processing');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_jobs_next_execution
ON campaign_jobs(next_execution_at)
WHERE status = 'queued';

-- Audit log query optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_timestamp
ON audit_logs(user_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_type_id
ON audit_logs(entity_type, entity_id, timestamp DESC);

-- Materialized view for campaign statistics
CREATE MATERIALIZED VIEW IF NOT EXISTS campaign_statistics AS
SELECT 
    c.id,
    c.user_id,
    c.campaign_type,
    c.status,
    c.created_at,
    c.started_at,
    c.completed_at,
    c.progress_percentage,
    COUNT(DISTINCT gd.id) as total_domains,
    COUNT(DISTINCT CASE WHEN dvr.validation_status = 'resolved' THEN dvr.id END) as resolved_domains,
    COUNT(DISTINCT CASE WHEN hkr.validation_status = 'success' THEN hkr.id END) as validated_domains,
    EXTRACT(EPOCH FROM (COALESCE(c.completed_at, CURRENT_TIMESTAMP) - c.started_at)) as duration_seconds
FROM campaigns c
LEFT JOIN domain_generation_campaign_params dgcp ON dgcp.campaign_id = c.id
LEFT JOIN generated_domains gd ON gd.domain_generation_campaign_id = c.id
LEFT JOIN dns_validation_campaign_params dvcp ON dvcp.campaign_id = c.id
LEFT JOIN dns_validation_results dvr ON dvr.dns_campaign_id = c.id
LEFT JOIN http_keyword_campaign_params hkcp ON hkcp.campaign_id = c.id
LEFT JOIN http_keyword_results hkr ON hkr.http_keyword_campaign_id = c.id
GROUP BY c.id, c.user_id, c.campaign_type, c.status, c.created_at, c.started_at, c.completed_at, c.progress_percentage;

CREATE UNIQUE INDEX ON campaign_statistics(id);
CREATE INDEX ON campaign_statistics(user_id, status);
CREATE INDEX ON campaign_statistics(campaign_type, status);

-- Create refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_campaign_statistics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_statistics;
END;
$$ LANGUAGE plpgsql;

-- ANALYZE tables to update statistics
ANALYZE campaigns;
ANALYZE generated_domains;
ANALYZE dns_validation_results;
ANALYZE http_keyword_results;
ANALYZE personas;
ANALYZE proxies;
ANALYZE campaign_jobs;
ANALYZE audit_logs;