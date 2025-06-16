-- Drop all tables in reverse order of creation to avoid foreign key constraint violations

-- Drop triggers first
DROP TRIGGER IF EXISTS set_timestamp_proxies ON proxies;
DROP TRIGGER IF EXISTS set_timestamp_keyword_sets ON keyword_sets;
DROP TRIGGER IF EXISTS set_timestamp_personas ON personas;
DROP TRIGGER IF EXISTS set_timestamp_campaigns ON campaigns;

-- Drop the trigger function
DROP FUNCTION IF EXISTS trigger_set_timestamp();

-- Drop tables in reverse order of their dependencies
-- Drop audit logs first as it has no dependencies
DROP TABLE IF EXISTS audit_logs;

-- Drop HTTP keyword results
DROP TABLE IF EXISTS http_keyword_results;

-- Drop HTTP keyword campaign params
DROP TABLE IF EXISTS http_keyword_campaign_params;

-- Drop DNS validation results
DROP TABLE IF EXISTS dns_validation_results;

-- Drop DNS validation params
DROP TABLE IF EXISTS dns_validation_params;

-- Drop proxies
DROP TABLE IF EXISTS proxies;

-- Drop keyword sets
DROP TABLE IF EXISTS keyword_sets;

-- Drop personas
DROP TABLE IF EXISTS personas;

-- Drop generated domains
DROP TABLE IF EXISTS generated_domains;

-- Drop domain generation config states
DROP TABLE IF EXISTS domain_generation_config_states;

-- Drop domain generation campaign params
DROP TABLE IF EXISTS domain_generation_campaign_params;

-- Drop campaign jobs
DROP TABLE IF EXISTS campaign_jobs;

-- Finally drop campaigns
DROP TABLE IF EXISTS campaigns;

-- Drop the UUID extension if no other objects depend on it
-- Note: Only drop the extension if you're sure no other objects are using it
-- DROP EXTENSION IF EXISTS "uuid-ossp";
