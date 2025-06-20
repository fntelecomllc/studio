-- Migration: 002_constraint_additions.sql
-- Purpose: Add missing CHECK constraints and defaults to match Go backend validation
-- Risk Level: MEDIUM
-- Rollback: Included at end of file

BEGIN;

-- 1. Campaign status constraint (aligning with Go backend)
-- Note: Frontend has 'archived' which backend doesn't - excluding it
ALTER TABLE campaigns
    ADD CONSTRAINT chk_campaigns_status_valid
    CHECK (status IN ('pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled'));

-- 2. Campaign job status constraint
ALTER TABLE campaign_jobs
    ADD CONSTRAINT chk_campaign_jobs_status_valid
    CHECK (status IN ('pending', 'queued', 'running', 'processing', 'completed', 'failed', 'retry'));

-- 3. Campaign job type constraint (must match campaign types)
ALTER TABLE campaign_jobs
    ADD CONSTRAINT chk_campaign_jobs_type_valid
    CHECK (job_type IN ('domain_generation', 'dns_validation', 'http_keyword_validation'));

-- 4. HTTP keyword campaign source type constraint (exact casing as per DB constraint)
-- This already exists but let's ensure it's correct
ALTER TABLE http_keyword_campaign_params
    DROP CONSTRAINT IF EXISTS http_keyword_campaign_params_source_type_check;
    
ALTER TABLE http_keyword_campaign_params
    ADD CONSTRAINT chk_http_keyword_source_type_valid
    CHECK (source_type IN ('DomainGeneration', 'DNSValidation'));

-- 5. Proxy protocol constraint
ALTER TABLE proxies
    ADD CONSTRAINT chk_proxies_protocol_valid
    CHECK (protocol IS NULL OR protocol IN ('http', 'https', 'socks5', 'socks4'));

-- 6. DNS validation status constraint
ALTER TABLE dns_validation_results
    ADD CONSTRAINT chk_dns_validation_status_valid
    CHECK (validation_status IN ('pending', 'resolved', 'unresolved', 'timeout', 'error'));

-- 7. HTTP validation status constraint
ALTER TABLE http_keyword_results
    ADD CONSTRAINT chk_http_validation_status_valid
    CHECK (validation_status IN ('pending', 'success', 'failed', 'timeout', 'error'));

-- 8. Keyword rule type constraint
-- This already exists but ensure it matches backend
ALTER TABLE keyword_rules
    DROP CONSTRAINT IF EXISTS keyword_rules_rule_type_check;
    
ALTER TABLE keyword_rules
    ADD CONSTRAINT chk_keyword_rules_type_valid
    CHECK (rule_type IN ('string', 'regex'));

-- 9. Add default values where missing
ALTER TABLE campaigns
    ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE campaign_jobs
    ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE proxies
    ALTER COLUMN is_enabled SET DEFAULT true,
    ALTER COLUMN is_healthy SET DEFAULT true;

ALTER TABLE personas
    ALTER COLUMN is_enabled SET DEFAULT true;

ALTER TABLE keyword_sets
    ALTER COLUMN is_enabled SET DEFAULT true;

-- 10. Add NOT NULL constraints where backend expects them
-- (Based on Go struct tags and validation rules)
ALTER TABLE campaigns
    ALTER COLUMN name SET NOT NULL;

ALTER TABLE personas
    ALTER COLUMN name SET NOT NULL,
    ALTER COLUMN persona_type SET NOT NULL,
    ALTER COLUMN config_details SET NOT NULL;

ALTER TABLE proxies
    ALTER COLUMN name SET NOT NULL,
    ALTER COLUMN address SET NOT NULL;

ALTER TABLE keyword_sets
    ALTER COLUMN name SET NOT NULL;

-- 11. Add length constraints based on backend validation
ALTER TABLE personas
    ADD CONSTRAINT chk_personas_name_length
    CHECK (char_length(name) >= 1 AND char_length(name) <= 255);

ALTER TABLE proxies
    ADD CONSTRAINT chk_proxies_name_length
    CHECK (char_length(name) >= 1 AND char_length(name) <= 255);

ALTER TABLE keyword_sets
    ADD CONSTRAINT chk_keyword_sets_name_length
    CHECK (char_length(name) >= 1 AND char_length(name) <= 255);

-- 12. Add port range constraint for proxies
ALTER TABLE proxies
    ADD CONSTRAINT chk_proxies_port_range
    CHECK (port IS NULL OR (port > 0 AND port <= 65535));

-- 13. Add constraint for proxy pool strategy
ALTER TABLE proxy_pools
    ADD CONSTRAINT chk_proxy_pools_strategy_valid
    CHECK (pool_strategy IN ('round_robin', 'random', 'least_used', 'weighted'));

-- 14. Add constraints for timing fields
ALTER TABLE dns_validation_params
    ADD CONSTRAINT chk_dns_validation_rotation_interval_non_negative
    CHECK (rotation_interval_seconds IS NULL OR rotation_interval_seconds >= 0),
    ADD CONSTRAINT chk_dns_validation_processing_speed_non_negative
    CHECK (processing_speed_per_minute IS NULL OR processing_speed_per_minute >= 0);

ALTER TABLE http_keyword_campaign_params
    ADD CONSTRAINT chk_http_keyword_rotation_interval_non_negative
    CHECK (rotation_interval_seconds IS NULL OR rotation_interval_seconds >= 0),
    ADD CONSTRAINT chk_http_keyword_processing_speed_non_negative
    CHECK (processing_speed_per_minute IS NULL OR processing_speed_per_minute >= 0);

-- 15. Create index for common status queries
CREATE INDEX IF NOT EXISTS idx_campaigns_status_updated ON campaigns(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_status_next_execution ON campaign_jobs(status, next_execution_at)
    WHERE status IN ('pending', 'queued', 'retry');

-- 16. Add comment explaining status values
COMMENT ON COLUMN campaigns.status IS 'Campaign status - must match Go CampaignStatusEnum (no archived status)';
COMMENT ON COLUMN http_keyword_campaign_params.source_type IS 'Source type with exact casing: DomainGeneration or DNSValidation';

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
-- BEGIN;
-- 
-- -- Remove indexes
-- DROP INDEX IF EXISTS idx_campaigns_status_updated;
-- DROP INDEX IF EXISTS idx_campaign_jobs_status_next_execution;
-- 
-- -- Remove constraints
-- ALTER TABLE campaigns
--     DROP CONSTRAINT IF EXISTS chk_campaigns_status_valid,
--     ALTER COLUMN status DROP DEFAULT;
-- 
-- ALTER TABLE campaign_jobs
--     DROP CONSTRAINT IF EXISTS chk_campaign_jobs_status_valid,
--     DROP CONSTRAINT IF EXISTS chk_campaign_jobs_type_valid,
--     ALTER COLUMN status DROP DEFAULT;
-- 
-- ALTER TABLE http_keyword_campaign_params
--     DROP CONSTRAINT IF EXISTS chk_http_keyword_source_type_valid;
-- 
-- ALTER TABLE proxies
--     DROP CONSTRAINT IF EXISTS chk_proxies_protocol_valid,
--     DROP CONSTRAINT IF EXISTS chk_proxies_name_length,
--     DROP CONSTRAINT IF EXISTS chk_proxies_port_range,
--     ALTER COLUMN is_enabled DROP DEFAULT,
--     ALTER COLUMN is_healthy DROP DEFAULT;
-- 
-- ALTER TABLE dns_validation_results
--     DROP CONSTRAINT IF EXISTS chk_dns_validation_status_valid;
-- 
-- ALTER TABLE http_keyword_results
--     DROP CONSTRAINT IF EXISTS chk_http_validation_status_valid;
-- 
-- ALTER TABLE keyword_rules
--     DROP CONSTRAINT IF EXISTS chk_keyword_rules_type_valid;
-- 
-- ALTER TABLE personas
--     DROP CONSTRAINT IF EXISTS chk_personas_name_length,
--     ALTER COLUMN is_enabled DROP DEFAULT;
-- 
-- ALTER TABLE keyword_sets
--     DROP CONSTRAINT IF EXISTS chk_keyword_sets_name_length,
--     ALTER COLUMN is_enabled DROP DEFAULT;
-- 
-- ALTER TABLE proxy_pools
--     DROP CONSTRAINT IF EXISTS chk_proxy_pools_strategy_valid;
-- 
-- ALTER TABLE dns_validation_params
--     DROP CONSTRAINT IF EXISTS chk_dns_validation_rotation_interval_non_negative,
--     DROP CONSTRAINT IF EXISTS chk_dns_validation_processing_speed_non_negative;
-- 
-- ALTER TABLE http_keyword_campaign_params
--     DROP CONSTRAINT IF EXISTS chk_http_keyword_rotation_interval_non_negative,
--     DROP CONSTRAINT IF EXISTS chk_http_keyword_processing_speed_non_negative;
-- 
-- -- Remove NOT NULL constraints (if they weren't there before)
-- -- Note: Only remove if you're sure they weren't there originally
-- -- ALTER TABLE campaigns ALTER COLUMN name DROP NOT NULL;
-- -- etc...
-- 
-- -- Remove comments
-- COMMENT ON COLUMN campaigns.status IS NULL;
-- COMMENT ON COLUMN http_keyword_campaign_params.source_type IS NULL;
-- 
-- -- Re-add original constraint if it existed
-- ALTER TABLE http_keyword_campaign_params
--     ADD CONSTRAINT http_keyword_campaign_params_source_type_check
--     CHECK (source_type = ANY (ARRAY['DomainGeneration'::text, 'DNSValidation'::text]));
-- 
-- ALTER TABLE keyword_rules
--     ADD CONSTRAINT keyword_rules_rule_type_check
--     CHECK (rule_type = ANY (ARRAY['string'::text, 'regex'::text]));
-- 
-- COMMIT;