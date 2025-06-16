-- Rollback migration: Remove performance indexes and materialized view
-- Purpose: Revert performance optimization changes if needed
-- Date: 2025-06-14

-- Drop the refresh function first
DROP FUNCTION IF EXISTS refresh_campaign_statistics();

-- Drop indexes on the materialized view
DROP INDEX IF EXISTS idx_campaign_statistics_status;
DROP INDEX IF EXISTS idx_campaign_statistics_user_id;
DROP INDEX IF EXISTS idx_campaign_statistics_campaign_id;

-- Drop the materialized view
DROP MATERIALIZED VIEW IF EXISTS campaign_statistics;

-- Drop the composite indexes
DROP INDEX IF EXISTS idx_campaigns_user_status_type;
DROP INDEX IF EXISTS idx_domains_campaign_offset_status;
DROP INDEX IF EXISTS idx_campaigns_user_status_created;