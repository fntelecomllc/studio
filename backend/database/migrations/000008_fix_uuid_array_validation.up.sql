-- Migration 000008: Fix UUID Array Validation and Schema Constraints
-- Phase 1.3 of DomainFlow Technical Audit Remediation
-- CRITICAL: Addresses CVSS 8.2, 7.1, and 6.8 vulnerabilities

-- 1. UUID ARRAY SERIALIZATION FIX (CVSS 8.2)
-- Fix Backend []uuid.UUID vs Database UUID[] type mismatch
-- Add constraint to validate persona_ids array format

-- First, let's check and fix any existing invalid data
DO $$
BEGIN
    -- Remove any NULL values from persona_ids arrays
    UPDATE dns_validation_params 
    SET persona_ids = array_remove(persona_ids, NULL)
    WHERE persona_ids IS NOT NULL AND NULL = ANY(persona_ids);
    
    -- Set empty arrays to NULL temporarily (will be fixed with default)
    UPDATE dns_validation_params 
    SET persona_ids = NULL
    WHERE persona_ids = '{}' OR array_length(persona_ids, 1) IS NULL;
END $$;

-- Add constraint to ensure valid UUID array
ALTER TABLE dns_validation_params 
ADD CONSTRAINT check_persona_ids_valid 
CHECK (
    persona_ids IS NOT NULL 
    AND array_length(persona_ids, 1) >= 1
    AND NOT EXISTS (
        SELECT 1 FROM unnest(persona_ids) AS pid
        WHERE pid IS NULL
    )
);

-- 2. JSONB SCHEMA VALIDATION (CVSS 7.1)
-- Create validation function for persona config_details

CREATE OR REPLACE FUNCTION validate_persona_config()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if config_details is NULL (not allowed)
    IF NEW.config_details IS NULL THEN
        RAISE EXCEPTION 'config_details cannot be NULL';
    END IF;
    
    -- Validate based on persona_type
    IF NEW.persona_type = 'DNS' THEN
        -- Validate DNS config schema
        IF NOT (NEW.config_details ? 'dns_servers'
            AND NEW.config_details ? 'record_type') THEN
            RAISE EXCEPTION 'Invalid DNS persona configuration: missing required fields (dns_servers, record_type)';
        END IF;
        
        -- Validate dns_servers is an array
        IF jsonb_typeof(NEW.config_details->'dns_servers') != 'array' THEN
            RAISE EXCEPTION 'Invalid DNS persona configuration: dns_servers must be an array';
        END IF;
        
        -- Validate dns_servers is not empty
        IF jsonb_array_length(NEW.config_details->'dns_servers') = 0 THEN
            RAISE EXCEPTION 'Invalid DNS persona configuration: dns_servers array cannot be empty';
        END IF;
        
        -- Validate record_type is a string
        IF jsonb_typeof(NEW.config_details->'record_type') != 'string' THEN
            RAISE EXCEPTION 'Invalid DNS persona configuration: record_type must be a string';
        END IF;
        
    ELSIF NEW.persona_type = 'HTTP' THEN
        -- Validate HTTP config schema
        IF NOT (NEW.config_details ? 'headers'
            AND NEW.config_details ? 'timeout') THEN
            RAISE EXCEPTION 'Invalid HTTP persona configuration: missing required fields (headers, timeout)';
        END IF;
        
        -- Validate headers is an object
        IF jsonb_typeof(NEW.config_details->'headers') != 'object' THEN
            RAISE EXCEPTION 'Invalid HTTP persona configuration: headers must be an object';
        END IF;
        
        -- Validate timeout is a number
        IF jsonb_typeof(NEW.config_details->'timeout') != 'number' THEN
            RAISE EXCEPTION 'Invalid HTTP persona configuration: timeout must be a number';
        END IF;
        
        -- Validate timeout is positive
        IF (NEW.config_details->>'timeout')::numeric <= 0 THEN
            RAISE EXCEPTION 'Invalid HTTP persona configuration: timeout must be positive';
        END IF;
        
    ELSE
        -- Unknown persona type
        RAISE EXCEPTION 'Unknown persona type: %', NEW.persona_type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate persona config before INSERT or UPDATE
CREATE TRIGGER validate_persona_config_trigger
BEFORE INSERT OR UPDATE ON personas
FOR EACH ROW EXECUTE FUNCTION validate_persona_config();

-- 3. FOREIGN KEY CASCADE BEHAVIOR FIX (CVSS 6.8)
-- Review and fix inconsistent CASCADE vs SET NULL policies

-- Fix campaign_jobs foreign key to campaigns (should CASCADE on delete)
ALTER TABLE campaign_jobs
DROP CONSTRAINT IF EXISTS campaign_jobs_campaign_id_fkey;

ALTER TABLE campaign_jobs
ADD CONSTRAINT campaign_jobs_campaign_id_fkey
FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Fix generated_domains foreign keys
ALTER TABLE generated_domains
DROP CONSTRAINT IF EXISTS generated_domains_domain_generation_campaign_id_fkey;

ALTER TABLE generated_domains
ADD CONSTRAINT generated_domains_domain_generation_campaign_id_fkey
FOREIGN KEY (domain_generation_campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Fix dns_validation_params foreign key to campaigns
ALTER TABLE dns_validation_params
DROP CONSTRAINT IF EXISTS dns_validation_params_campaign_id_fkey;

ALTER TABLE dns_validation_params
ADD CONSTRAINT dns_validation_params_campaign_id_fkey
FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Fix http_validation_results foreign key to campaigns
ALTER TABLE http_validation_results
DROP CONSTRAINT IF EXISTS http_validation_results_http_keyword_campaign_id_fkey;

ALTER TABLE http_validation_results
ADD CONSTRAINT http_validation_results_http_keyword_campaign_id_fkey
FOREIGN KEY (http_keyword_campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Fix dns_validation_params persona_ids foreign key array
-- This requires a custom function to validate array elements
CREATE OR REPLACE FUNCTION validate_persona_ids_exist()
RETURNS TRIGGER AS $$
DECLARE
    persona_id uuid;
BEGIN
    -- Check each persona_id in the array exists
    FOREACH persona_id IN ARRAY NEW.persona_ids
    LOOP
        IF NOT EXISTS (SELECT 1 FROM personas WHERE id = persona_id) THEN
            RAISE EXCEPTION 'Persona ID % does not exist', persona_id;
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate persona_ids references
CREATE TRIGGER validate_persona_ids_exist_trigger
BEFORE INSERT OR UPDATE ON dns_validation_params
FOR EACH ROW EXECUTE FUNCTION validate_persona_ids_exist();

-- Add index for better performance on persona_ids lookups
CREATE INDEX IF NOT EXISTS idx_dns_validation_params_persona_ids 
ON dns_validation_params USING GIN (persona_ids);

-- Add composite index for campaign-related queries
CREATE INDEX IF NOT EXISTS idx_campaign_jobs_campaign_status
ON campaign_jobs(campaign_id, status);

-- Note: generated_domains doesn't have validation_status column
-- The validation status is tracked in dns_validation_results and http_keyword_results tables

-- Add comment to document the migration
COMMENT ON CONSTRAINT check_persona_ids_valid ON dns_validation_params IS 
'Ensures persona_ids array is non-null, non-empty, and contains no null values - Fix for CVSS 8.2';

COMMENT ON FUNCTION validate_persona_config() IS 
'Validates JSONB schema for persona configurations based on type (dns/http) - Fix for CVSS 7.1';

COMMENT ON TRIGGER validate_persona_config_trigger ON personas IS 
'Enforces JSONB schema validation for persona configurations - Fix for CVSS 7.1';