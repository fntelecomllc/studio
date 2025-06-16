-- Phase 6.3: Data Protection Enhancements - Field-level encryption

-- Enable pgcrypto extension for encryption functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add encrypted columns to sensitive tables

-- Proxies table: encrypt passwords
ALTER TABLE proxies
ADD COLUMN IF NOT EXISTS password_encrypted bytea;

-- Migrate existing passwords to encrypted column
UPDATE proxies 
SET password_encrypted = pgp_sym_encrypt(
    COALESCE(password_hash, ''), 
    current_setting('app.encryption_key')::text
)
WHERE password_hash IS NOT NULL 
  AND password_encrypted IS NULL;

-- Add encrypted fields for sensitive persona configuration
ALTER TABLE personas
ADD COLUMN IF NOT EXISTS config_details_encrypted bytea;

-- Function to encrypt JSONB data
CREATE OR REPLACE FUNCTION encrypt_jsonb(data jsonb, key text)
RETURNS bytea AS $$
BEGIN
    RETURN pgp_sym_encrypt(data::text, key);
END;
$$ LANGUAGE plpgsql;

-- Function to decrypt JSONB data
CREATE OR REPLACE FUNCTION decrypt_jsonb(data bytea, key text)
RETURNS jsonb AS $$
BEGIN
    RETURN pgp_sym_decrypt(data, key)::jsonb;
END;
$$ LANGUAGE plpgsql;

-- Create view for decrypted proxy data (for authorized access only)
CREATE OR REPLACE VIEW proxies_decrypted AS
SELECT 
    id,
    name,
    description,
    address,
    protocol,
    username,
    pgp_sym_decrypt(password_encrypted, current_setting('app.encryption_key')::text) as password,
    host,
    port,
    is_enabled,
    is_healthy,
    last_status,
    last_checked_at,
    latency_ms,
    city,
    country_code,
    provider,
    created_at,
    updated_at
FROM proxies
WHERE password_encrypted IS NOT NULL;

-- Create audit table for encryption key rotation
CREATE TABLE IF NOT EXISTS encryption_key_rotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rotated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rotated_by TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    tables_affected TEXT[] NOT NULL,
    records_updated INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    error_message TEXT
);

-- Add column for tracking encryption key version
ALTER TABLE proxies
ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER DEFAULT 1;

ALTER TABLE personas
ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER DEFAULT 1;

-- Function to rotate encryption keys
CREATE OR REPLACE FUNCTION rotate_encryption_keys(
    old_key text,
    new_key text,
    key_version integer
) RETURNS void AS $$
DECLARE
    rotation_id UUID;
    updated_count INTEGER := 0;
BEGIN
    -- Create rotation record
    INSERT INTO encryption_key_rotations (rotated_by, key_version, tables_affected, records_updated, status)
    VALUES (current_user, key_version, ARRAY['proxies', 'personas'], 0, 'started')
    RETURNING id INTO rotation_id;
    
    -- Rotate proxy passwords
    UPDATE proxies
    SET password_encrypted = pgp_sym_encrypt(
            pgp_sym_decrypt(password_encrypted, old_key),
            new_key
        ),
        encryption_key_version = key_version
    WHERE password_encrypted IS NOT NULL;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Update rotation record
    UPDATE encryption_key_rotations
    SET records_updated = updated_count,
        status = 'completed'
    WHERE id = rotation_id;
    
EXCEPTION
    WHEN OTHERS THEN
        UPDATE encryption_key_rotations
        SET status = 'failed',
            error_message = SQLERRM
        WHERE id = rotation_id;
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- Add RLS (Row Level Security) for sensitive tables
ALTER TABLE proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_key_rotations ENABLE ROW LEVEL SECURITY;

-- Create policies for proxy access
CREATE POLICY proxy_access_policy ON proxies
    FOR ALL
    USING (
        -- Only authenticated users can access proxies
        current_setting('app.current_user_id', true) IS NOT NULL
    );

-- Create policy for encryption key rotation audit
CREATE POLICY encryption_audit_policy ON encryption_key_rotations
    FOR SELECT
    USING (
        -- Only admins can view encryption key rotation history
        current_setting('app.current_user_role', true) = 'admin'
    );

-- Index for encrypted fields (for performance)
CREATE INDEX IF NOT EXISTS idx_proxies_encrypted ON proxies(id) WHERE password_encrypted IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personas_encrypted ON personas(id) WHERE config_details_encrypted IS NOT NULL;