-- Rollback Migration 000008: Fix UUID Array Validation and Schema Constraints

-- Remove indexes
DROP INDEX IF EXISTS idx_dns_validation_params_persona_ids;
DROP INDEX IF EXISTS idx_campaign_jobs_campaign_status;
DROP INDEX IF EXISTS idx_generated_domains_campaign_status;

-- Remove triggers and functions for persona_ids validation
DROP TRIGGER IF EXISTS validate_persona_ids_exist_trigger ON dns_validation_params;
DROP FUNCTION IF EXISTS validate_persona_ids_exist();

-- Remove trigger and function for persona config validation
DROP TRIGGER IF EXISTS validate_persona_config_trigger ON personas;
DROP FUNCTION IF EXISTS validate_persona_config();

-- Remove constraint on dns_validation_params
ALTER TABLE dns_validation_params 
DROP CONSTRAINT IF EXISTS check_persona_ids_valid;

-- Restore original foreign key constraints (without CASCADE)
-- Note: We're restoring to SET NULL behavior which was likely the original intent

-- Restore campaign_jobs foreign key
ALTER TABLE campaign_jobs
DROP CONSTRAINT IF EXISTS campaign_jobs_campaign_id_fkey;

ALTER TABLE campaign_jobs
ADD CONSTRAINT campaign_jobs_campaign_id_fkey
FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

-- Restore generated_domains foreign key
ALTER TABLE generated_domains
DROP CONSTRAINT IF EXISTS generated_domains_domain_generation_campaign_id_fkey;

ALTER TABLE generated_domains
ADD CONSTRAINT generated_domains_domain_generation_campaign_id_fkey
FOREIGN KEY (domain_generation_campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

-- Restore dns_validation_params foreign key
ALTER TABLE dns_validation_params
DROP CONSTRAINT IF EXISTS dns_validation_params_campaign_id_fkey;

ALTER TABLE dns_validation_params
ADD CONSTRAINT dns_validation_params_campaign_id_fkey
FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

-- Restore http_validation_results foreign key
ALTER TABLE http_validation_results
DROP CONSTRAINT IF EXISTS http_validation_results_http_keyword_campaign_id_fkey;

ALTER TABLE http_validation_results
ADD CONSTRAINT http_validation_results_http_keyword_campaign_id_fkey
FOREIGN KEY (http_keyword_campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;

-- Note: We don't need to remove comments as they are harmless if left