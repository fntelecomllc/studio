-- Drop all validation triggers and functions

-- Drop campaign validation triggers
DROP TRIGGER IF EXISTS validate_campaign_status_transition_trigger ON campaigns;
DROP TRIGGER IF EXISTS validate_campaign_metadata_trigger ON campaigns;

-- Drop persona validation trigger
DROP TRIGGER IF EXISTS validate_persona_config_trigger ON personas;

-- Drop validation functions
DROP FUNCTION IF EXISTS validate_campaign_status_transition();
DROP FUNCTION IF EXISTS validate_campaign_metadata();
DROP FUNCTION IF EXISTS validate_persona_config();
DROP FUNCTION IF EXISTS validate_http_persona_config();
DROP FUNCTION IF EXISTS validate_dns_persona_config();

-- Drop check constraints
ALTER TABLE campaigns
DROP CONSTRAINT IF EXISTS check_progress_percentage_range;

ALTER TABLE campaigns
DROP CONSTRAINT IF EXISTS check_items_counts_valid;

ALTER TABLE campaigns
DROP CONSTRAINT IF EXISTS check_processed_items_not_exceed_total;