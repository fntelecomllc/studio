-- Rollback migration for persona_type case fix
-- Reverts lowercase persona_type values back to uppercase

-- Update existing persona records back to uppercase
UPDATE personas 
SET persona_type = UPPER(persona_type) 
WHERE persona_type IN ('dns', 'http');

-- Revert the check constraint to use uppercase values
ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_persona_type_check;
ALTER TABLE personas ADD CONSTRAINT personas_persona_type_check 
    CHECK (persona_type IN ('DNS', 'HTTP'));