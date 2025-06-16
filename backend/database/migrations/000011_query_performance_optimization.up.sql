-- Phase 4: Query Performance Optimization
-- Implements performance improvements from DOMAINFLOW_TECHNICAL_AUDIT_REPORT.md

-- Composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_user_status_created 
ON campaigns(user_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_campaign_offset_status 
ON generated_domains(domain_generation_campaign_id, offset_index, validation_status);

-- Additional performance indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dns_validation_campaign_created
ON dns_validation_results(campaign_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_http_validation_campaign_created
ON http_keyword_validation_results(campaign_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaign_jobs_status_next_exec
ON campaign_jobs(status, next_execution_at)
WHERE status IN ('queued', 'running');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_timestamp
ON audit_logs(entity_id, timestamp DESC)
WHERE entity_type = 'Campaign';

-- Partial indexes for active campaigns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_active_status
ON campaigns(status, updated_at DESC)
WHERE status IN ('pending', 'queued', 'running', 'paused');

-- Index for persona lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_personas_user_type
ON personas(user_id, persona_type, is_active)
WHERE is_active = true;

-- Index for keyword set lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_keyword_sets_user_enabled
ON keyword_sets(user_id, is_enabled, created_at DESC)
WHERE is_enabled = true;

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
    COALESCE(c.total_items, 0) as total_items,
    COALESCE(c.processed_items, 0) as processed_items,
    COALESCE(c.progress_percentage, 0) as progress_percentage,
    -- Domain generation statistics
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.id IS NOT NULL) as total_domains,
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'valid') as valid_domains,
    COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'invalid') as invalid_domains,
    -- DNS validation statistics
    COUNT(DISTINCT dns.id) FILTER (WHERE dns.id IS NOT NULL) as total_dns_validations,
    COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'resolved') as dns_resolved,
    COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'unresolved') as dns_unresolved,
    -- HTTP validation statistics
    COUNT(DISTINCT http.id) FILTER (WHERE http.id IS NOT NULL) as total_http_validations,
    COUNT(DISTINCT http.id) FILTER (WHERE http.keywords_found = true) as http_keywords_found,
    COUNT(DISTINCT http.id) FILTER (WHERE http.keywords_found = false) as http_keywords_not_found,
    -- Performance metrics
    EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.created_at)) as duration_seconds,
    CASE 
        WHEN c.processed_items > 0 AND c.completed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (c.completed_at - c.started_at)) / c.processed_items
        ELSE NULL
    END as avg_processing_time_per_item
FROM campaigns c
LEFT JOIN generated_domains gd ON gd.domain_generation_campaign_id = c.id
LEFT JOIN dns_validation_results dns ON dns.campaign_id = c.id
LEFT JOIN http_keyword_validation_results http ON http.campaign_id = c.id
GROUP BY c.id, c.user_id, c.campaign_type, c.status, c.created_at, c.started_at, c.completed_at, c.total_items, c.processed_items, c.progress_percentage;

-- Create unique index on the materialized view
CREATE UNIQUE INDEX ON campaign_statistics(id);

-- Create additional indexes on the materialized view for fast lookups
CREATE INDEX ON campaign_statistics(user_id, created_at DESC);
CREATE INDEX ON campaign_statistics(status, created_at DESC);
CREATE INDEX ON campaign_statistics(campaign_type, created_at DESC);

-- Function to refresh campaign statistics for a specific campaign
CREATE OR REPLACE FUNCTION refresh_campaign_statistics(campaign_id UUID)
RETURNS void AS $$
BEGIN
    -- Refresh only the row for the specified campaign
    DELETE FROM campaign_statistics WHERE id = campaign_id;
    
    INSERT INTO campaign_statistics
    SELECT 
        c.id,
        c.user_id,
        c.campaign_type,
        c.status,
        c.created_at,
        c.started_at,
        c.completed_at,
        COALESCE(c.total_items, 0) as total_items,
        COALESCE(c.processed_items, 0) as processed_items,
        COALESCE(c.progress_percentage, 0) as progress_percentage,
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.id IS NOT NULL) as total_domains,
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'valid') as valid_domains,
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'invalid') as invalid_domains,
        COUNT(DISTINCT dns.id) FILTER (WHERE dns.id IS NOT NULL) as total_dns_validations,
        COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'resolved') as dns_resolved,
        COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'unresolved') as dns_unresolved,
        COUNT(DISTINCT http.id) FILTER (WHERE http.id IS NOT NULL) as total_http_validations,
        COUNT(DISTINCT http.id) FILTER (WHERE http.keywords_found = true) as http_keywords_found,
        COUNT(DISTINCT http.id) FILTER (WHERE http.keywords_found = false) as http_keywords_not_found,
        EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.created_at)) as duration_seconds,
        CASE 
            WHEN c.processed_items > 0 AND c.completed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (c.completed_at - c.started_at)) / c.processed_items
            ELSE NULL
        END as avg_processing_time_per_item
    FROM campaigns c
    LEFT JOIN generated_domains gd ON gd.domain_generation_campaign_id = c.id
    LEFT JOIN dns_validation_results dns ON dns.campaign_id = c.id
    LEFT JOIN http_keyword_validation_results http ON http.campaign_id = c.id
    WHERE c.id = campaign_id
    GROUP BY c.id, c.user_id, c.campaign_type, c.status, c.created_at, c.started_at, c.completed_at, c.total_items, c.processed_items, c.progress_percentage;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to refresh statistics when campaign is updated
CREATE OR REPLACE FUNCTION trigger_refresh_campaign_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- Only refresh if status or progress changed
    IF NEW.status != OLD.status OR 
       NEW.progress_percentage != OLD.progress_percentage OR
       NEW.processed_items != OLD.processed_items OR
       NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
        PERFORM refresh_campaign_statistics(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_campaign_statistics_on_update
AFTER UPDATE ON campaigns
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_campaign_statistics();

-- Analyze tables to update statistics for query planner
ANALYZE campaigns;
ANALYZE generated_domains;
ANALYZE dns_validation_results;
ANALYZE http_keyword_validation_results;
ANALYZE campaign_jobs;
ANALYZE personas;
ANALYZE keyword_sets;

-- Add comment explaining the optimization
COMMENT ON MATERIALIZED VIEW campaign_statistics IS 'Materialized view for fast campaign statistics queries. Automatically refreshed on campaign updates.';