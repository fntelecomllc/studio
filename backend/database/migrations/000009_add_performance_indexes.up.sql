-- Migration: Add performance indexes for common query patterns
-- Purpose: Optimize database performance based on technical audit recommendations
-- Date: 2025-06-14

-- Index for campaigns filtered by user, status, and creation date
-- This supports common queries that list campaigns for a specific user with status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_user_status_created 
ON campaigns(user_id, status, created_at DESC);

-- Index for generated domains lookup by campaign, offset, and validation status
-- This optimizes queries that fetch domains for a campaign with pagination and status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_domains_campaign_offset_status 
ON generated_domains(domain_generation_campaign_id, offset_index, validation_status);

-- Additional index for campaigns filtered by user, status, and campaign type
-- This supports queries that need to filter campaigns by type in addition to user and status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_user_status_type 
ON campaigns(user_id, status, campaign_type);

-- Create materialized view for campaign statistics
-- This provides pre-computed aggregated data for frequently accessed campaign metrics
CREATE MATERIALIZED VIEW IF NOT EXISTS campaign_statistics AS
SELECT 
    c.id AS campaign_id,
    c.user_id,
    c.status,
    c.campaign_type,
    c.created_at,
    c.updated_at,
    COUNT(DISTINCT gd.id) AS total_domains,
    COUNT(DISTINCT CASE WHEN gd.validation_status = 'valid' THEN gd.id END) AS valid_domains,
    COUNT(DISTINCT CASE WHEN gd.validation_status = 'invalid' THEN gd.id END) AS invalid_domains,
    COUNT(DISTINCT CASE WHEN gd.validation_status = 'pending' THEN gd.id END) AS pending_domains,
    COUNT(DISTINCT CASE WHEN gd.validation_status = 'error' THEN gd.id END) AS error_domains,
    MAX(gd.offset_index) AS max_offset_index,
    MIN(gd.created_at) AS first_domain_created_at,
    MAX(gd.created_at) AS last_domain_created_at,
    AVG(EXTRACT(EPOCH FROM (gd.updated_at - gd.created_at))) AS avg_validation_time_seconds
FROM 
    campaigns c
LEFT JOIN 
    generated_domains gd ON c.id = gd.domain_generation_campaign_id
GROUP BY 
    c.id, c.user_id, c.status, c.campaign_type, c.created_at, c.updated_at;

-- Create unique index on materialized view for efficient lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_statistics_campaign_id 
ON campaign_statistics(campaign_id);

-- Create index for user-based queries on the materialized view
CREATE INDEX IF NOT EXISTS idx_campaign_statistics_user_id 
ON campaign_statistics(user_id);

-- Create index for status-based queries on the materialized view
CREATE INDEX IF NOT EXISTS idx_campaign_statistics_status 
ON campaign_statistics(status);

-- Comment on the materialized view
COMMENT ON MATERIALIZED VIEW campaign_statistics IS 'Pre-computed campaign statistics for performance optimization. Refresh regularly via scheduled job.';

-- Function to refresh campaign statistics materialized view
CREATE OR REPLACE FUNCTION refresh_campaign_statistics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_statistics;
END;
$$ LANGUAGE plpgsql;

-- Comment on the refresh function
COMMENT ON FUNCTION refresh_campaign_statistics() IS 'Refreshes the campaign_statistics materialized view. Should be called periodically (e.g., every 5-10 minutes) via a scheduled job.';