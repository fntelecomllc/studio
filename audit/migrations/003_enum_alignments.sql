-- Migration: 003_enum_alignments.sql
-- Purpose: Ensure enum values match Go definitions exactly
-- Risk Level: LOW
-- Rollback: Included at end of file

BEGIN;

-- 1. Create a function to safely update enum values in existing data
CREATE OR REPLACE FUNCTION migrate_enum_values() RETURNS void AS $$
BEGIN
    -- Log any campaigns with 'archived' status (frontend-only value)
    IF EXISTS (SELECT 1 FROM campaigns WHERE status = 'archived') THEN
        RAISE WARNING 'Found % campaigns with "archived" status - these need to be migrated to a valid status', 
            (SELECT COUNT(*) FROM campaigns WHERE status = 'archived');
        
        -- Update archived campaigns to 'completed' as the closest semantic match
        UPDATE campaigns 
        SET status = 'completed',
            metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{migrated_from_archived}',
                'true'::jsonb
            )
        WHERE status = 'archived';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration
SELECT migrate_enum_values();

-- 2. Create enum types to match Go backend exactly
-- These will serve as documentation and can be used for future migrations

-- Campaign Type Enum (already enforced by constraint)
CREATE TYPE campaign_type_enum AS ENUM (
    'domain_generation',
    'dns_validation', 
    'http_keyword_validation'
);
COMMENT ON TYPE campaign_type_enum IS 'Maps to Go CampaignTypeEnum';

-- Campaign Status Enum (without 'archived')
CREATE TYPE campaign_status_enum AS ENUM (
    'pending',
    'queued',
    'running',
    'pausing',
    'paused',
    'completed',
    'failed',
    'cancelled'
);
COMMENT ON TYPE campaign_status_enum IS 'Maps to Go CampaignStatusEnum - no archived status';

-- Persona Type Enum
CREATE TYPE persona_type_enum AS ENUM (
    'dns',
    'http'
);
COMMENT ON TYPE persona_type_enum IS 'Maps to Go PersonaTypeEnum';

-- Proxy Protocol Enum
CREATE TYPE proxy_protocol_enum AS ENUM (
    'http',
    'https',
    'socks5',
    'socks4'
);
COMMENT ON TYPE proxy_protocol_enum IS 'Maps to Go ProxyProtocolEnum';

-- Keyword Rule Type Enum
CREATE TYPE keyword_rule_type_enum AS ENUM (
    'string',
    'regex'
);
COMMENT ON TYPE keyword_rule_type_enum IS 'Maps to Go KeywordRuleTypeEnum';

-- Campaign Job Status Enum
CREATE TYPE campaign_job_status_enum AS ENUM (
    'pending',
    'queued',
    'running',
    'processing',
    'completed',
    'failed',
    'retry'
);
COMMENT ON TYPE campaign_job_status_enum IS 'Maps to Go CampaignJobStatusEnum';

-- Validation Status Enum (base)
CREATE TYPE validation_status_enum AS ENUM (
    'pending',
    'valid',
    'invalid',
    'error',
    'skipped'
);
COMMENT ON TYPE validation_status_enum IS 'Maps to Go ValidationStatusEnum';

-- DNS Validation Status Enum
CREATE TYPE dns_validation_status_enum AS ENUM (
    'resolved',
    'unresolved',
    'timeout',
    'error'
);
COMMENT ON TYPE dns_validation_status_enum IS 'Maps to Go DNSValidationStatusEnum';

-- HTTP Validation Status Enum
CREATE TYPE http_validation_status_enum AS ENUM (
    'success',
    'failed',
    'timeout',
    'error'
);
COMMENT ON TYPE http_validation_status_enum IS 'Maps to Go HTTPValidationStatusEnum';

-- 3. Create validation functions to ensure enum consistency
CREATE OR REPLACE FUNCTION validate_campaign_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status NOT IN ('pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid campaign status: %. Must match Go CampaignStatusEnum', NEW.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Add trigger for strict validation (optional - enable if you want runtime enforcement)
-- CREATE TRIGGER trg_validate_campaign_status
--     BEFORE INSERT OR UPDATE ON campaigns
--     FOR EACH ROW
--     EXECUTE FUNCTION validate_campaign_status();

-- 5. Create helper views for enum documentation
CREATE OR REPLACE VIEW v_enum_documentation AS
SELECT 
    'CampaignType' as enum_name,
    unnest(ARRAY['domain_generation', 'dns_validation', 'http_keyword_validation']) as valid_values
UNION ALL
SELECT 
    'CampaignStatus' as enum_name,
    unnest(ARRAY['pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled']) as valid_values
UNION ALL
SELECT 
    'PersonaType' as enum_name,
    unnest(ARRAY['dns', 'http']) as valid_values
UNION ALL
SELECT 
    'ProxyProtocol' as enum_name,
    unnest(ARRAY['http', 'https', 'socks5', 'socks4']) as valid_values
UNION ALL
SELECT 
    'KeywordRuleType' as enum_name,
    unnest(ARRAY['string', 'regex']) as valid_values
UNION ALL
SELECT 
    'HTTPSourceType' as enum_name,
    unnest(ARRAY['DomainGeneration', 'DNSValidation']) as valid_values;

COMMENT ON VIEW v_enum_documentation IS 'Documentation of valid enum values matching Go backend';

-- 6. Add function to validate all enum fields in a table
CREATE OR REPLACE FUNCTION validate_all_enums() RETURNS TABLE (
    table_name text,
    column_name text,
    invalid_value text,
    row_count bigint
) AS $$
BEGIN
    -- Check campaigns.status
    RETURN QUERY
    SELECT 'campaigns'::text, 'status'::text, c.status::text, COUNT(*)::bigint
    FROM campaigns c
    WHERE c.status NOT IN ('pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled')
    GROUP BY c.status;
    
    -- Check campaigns.campaign_type
    RETURN QUERY
    SELECT 'campaigns'::text, 'campaign_type'::text, c.campaign_type::text, COUNT(*)::bigint
    FROM campaigns c
    WHERE c.campaign_type NOT IN ('domain_generation', 'dns_validation', 'http_keyword_validation')
    GROUP BY c.campaign_type;
    
    -- Check personas.persona_type
    RETURN QUERY
    SELECT 'personas'::text, 'persona_type'::text, p.persona_type::text, COUNT(*)::bigint
    FROM personas p
    WHERE p.persona_type NOT IN ('dns', 'http')
    GROUP BY p.persona_type;
    
    -- Check http_keyword_campaign_params.source_type
    RETURN QUERY
    SELECT 'http_keyword_campaign_params'::text, 'source_type'::text, h.source_type::text, COUNT(*)::bigint
    FROM http_keyword_campaign_params h
    WHERE h.source_type NOT IN ('DomainGeneration', 'DNSValidation')
    GROUP BY h.source_type;
END;
$$ LANGUAGE plpgsql;

-- 7. Run validation and report any issues
DO $$
DECLARE
    invalid_count integer;
BEGIN
    SELECT COUNT(*) INTO invalid_count FROM validate_all_enums();
    IF invalid_count > 0 THEN
        RAISE WARNING 'Found % enum values that do not match Go backend definitions', invalid_count;
    ELSE
        RAISE NOTICE 'All enum values are correctly aligned with Go backend';
    END IF;
END $$;

-- Clean up temporary function
DROP FUNCTION IF EXISTS migrate_enum_values();

COMMIT;

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
-- BEGIN;
-- 
-- -- Drop views and functions
-- DROP VIEW IF EXISTS v_enum_documentation;
-- DROP FUNCTION IF EXISTS validate_all_enums();
-- DROP FUNCTION IF EXISTS validate_campaign_status();
-- -- DROP TRIGGER IF EXISTS trg_validate_campaign_status ON campaigns;
-- 
-- -- Drop enum types
-- DROP TYPE IF EXISTS campaign_type_enum;
-- DROP TYPE IF EXISTS campaign_status_enum;
-- DROP TYPE IF EXISTS persona_type_enum;
-- DROP TYPE IF EXISTS proxy_protocol_enum;
-- DROP TYPE IF EXISTS keyword_rule_type_enum;
-- DROP TYPE IF EXISTS campaign_job_status_enum;
-- DROP TYPE IF EXISTS validation_status_enum;
-- DROP TYPE IF EXISTS dns_validation_status_enum;
-- DROP TYPE IF EXISTS http_validation_status_enum;
-- 
-- -- If you need to restore 'archived' status campaigns:
-- -- UPDATE campaigns 
-- -- SET status = 'archived'
-- -- WHERE metadata->>'migrated_from_archived' = 'true';
-- 
-- COMMIT;