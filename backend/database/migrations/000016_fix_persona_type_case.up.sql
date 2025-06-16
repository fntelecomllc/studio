-- Migration to fix persona_type case from uppercase to lowercase
-- This ensures consistency between backend models and database

-- Update existing persona records
UPDATE personas 
SET persona_type = LOWER(persona_type) 
WHERE persona_type IN ('DNS', 'HTTP');

-- Update the check constraint to use lowercase values
ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_persona_type_check;
ALTER TABLE personas ADD CONSTRAINT personas_persona_type_check 
    CHECK (persona_type IN ('dns', 'http'));