-- Phase 4.1.3: Database Schema Validation - JSONB validation functions

-- Create function to validate DNS persona configuration
CREATE OR REPLACE FUNCTION validate_dns_persona_config()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.persona_type = 'dns' THEN
        -- Validate required fields for DNS personas
        IF NOT (NEW.config_details ? 'resolvers' 
            AND NEW.config_details ? 'useSystemResolvers'
            AND NEW.config_details ? 'queryTimeoutSeconds'
            AND NEW.config_details ? 'maxDomainsPerRequest') THEN
            RAISE EXCEPTION 'Invalid DNS persona configuration: missing required fields';
        END IF;
        
        -- Validate data types
        IF NOT (jsonb_typeof(NEW.config_details->'resolvers') = 'array'
            AND jsonb_typeof(NEW.config_details->'useSystemResolvers') = 'boolean'
            AND jsonb_typeof(NEW.config_details->'queryTimeoutSeconds') = 'number'
            AND jsonb_typeof(NEW.config_details->'maxDomainsPerRequest') = 'number') THEN
            RAISE EXCEPTION 'Invalid DNS persona configuration: incorrect field types';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate HTTP persona configuration
CREATE OR REPLACE FUNCTION validate_http_persona_config()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.persona_type = 'http' THEN
        -- Validate required fields for HTTP personas
        IF NOT (NEW.config_details ? 'userAgent' 
            AND NEW.config_details ? 'headers') THEN
            RAISE EXCEPTION 'Invalid HTTP persona configuration: missing required fields';
        END IF;
        
        -- Validate data types
        IF NOT (jsonb_typeof(NEW.config_details->'userAgent') = 'string'
            AND jsonb_typeof(NEW.config_details->'headers') = 'object') THEN
            RAISE EXCEPTION 'Invalid HTTP persona configuration: incorrect field types';
        END IF;
        
        -- Validate userAgent is not empty
        IF length(NEW.config_details->>'userAgent') = 0 THEN
            RAISE EXCEPTION 'Invalid HTTP persona configuration: userAgent cannot be empty';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create combined validation trigger for personas
CREATE OR REPLACE FUNCTION validate_persona_config()
RETURNS TRIGGER AS $$
BEGIN
    -- Call appropriate validation based on persona type
    IF NEW.persona_type = 'dns' THEN
        PERFORM validate_dns_persona_config();
    ELSIF NEW.persona_type = 'http' THEN
        PERFORM validate_http_persona_config();
    ELSE
        RAISE EXCEPTION 'Invalid persona type: %', NEW.persona_type;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS validate_persona_config_trigger ON personas;

-- Create trigger to validate persona configurations
CREATE TRIGGER validate_persona_config_trigger
BEFORE INSERT OR UPDATE ON personas
FOR EACH ROW EXECUTE FUNCTION validate_persona_config();

-- Create function to validate campaign metadata
CREATE OR REPLACE FUNCTION validate_campaign_metadata()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.metadata IS NOT NULL THEN
        -- Ensure metadata is a valid JSON object
        IF jsonb_typeof(NEW.metadata) != 'object' THEN
            RAISE EXCEPTION 'Campaign metadata must be a JSON object';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for campaign metadata validation
DROP TRIGGER IF EXISTS validate_campaign_metadata_trigger ON campaigns;

CREATE TRIGGER validate_campaign_metadata_trigger
BEFORE INSERT OR UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION validate_campaign_metadata();

-- Add constraint to ensure campaign status transitions are valid
CREATE OR REPLACE FUNCTION validate_campaign_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Skip validation for new records
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;
    
    -- Define valid status transitions
    IF OLD.status = 'pending' AND NEW.status NOT IN ('queued', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from pending to %', NEW.status;
    ELSIF OLD.status = 'queued' AND NEW.status NOT IN ('running', 'paused', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from queued to %', NEW.status;
    ELSIF OLD.status = 'running' AND NEW.status NOT IN ('paused', 'completed', 'failed') THEN
        RAISE EXCEPTION 'Invalid status transition from running to %', NEW.status;
    ELSIF OLD.status = 'paused' AND NEW.status NOT IN ('running', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition from paused to %', NEW.status;
    ELSIF OLD.status = 'completed' AND NEW.status NOT IN ('archived') THEN
        RAISE EXCEPTION 'Invalid status transition from completed to %', NEW.status;
    ELSIF OLD.status = 'failed' AND NEW.status NOT IN ('queued', 'archived') THEN
        RAISE EXCEPTION 'Invalid status transition from failed to %', NEW.status;
    ELSIF OLD.status IN ('archived', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition from terminal status %', OLD.status;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for campaign status validation
DROP TRIGGER IF EXISTS validate_campaign_status_transition_trigger ON campaigns;

CREATE TRIGGER validate_campaign_status_transition_trigger
BEFORE UPDATE ON campaigns
FOR EACH ROW EXECUTE FUNCTION validate_campaign_status_transition();

-- Add check constraints for numeric ranges
ALTER TABLE campaigns
ADD CONSTRAINT check_progress_percentage_range 
CHECK (progress_percentage IS NULL OR (progress_percentage >= 0 AND progress_percentage <= 100));

ALTER TABLE campaigns
ADD CONSTRAINT check_items_counts_valid
CHECK (
    (total_items IS NULL OR total_items >= 0) AND
    (processed_items IS NULL OR processed_items >= 0) AND
    (successful_items IS NULL OR successful_items >= 0) AND
    (failed_items IS NULL OR failed_items >= 0)
);

-- Add constraint to ensure processed items don't exceed total items
ALTER TABLE campaigns
ADD CONSTRAINT check_processed_items_not_exceed_total
CHECK (
    total_items IS NULL OR 
    processed_items IS NULL OR 
    processed_items <= total_items
);