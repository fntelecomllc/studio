-- Phase: Security Enhancement - Add encrypted fields for sensitive data
-- Implements field-level encryption requirements from DOMAINFLOW_TECHNICAL_AUDIT_REPORT.md

-- Add encrypted password column to proxies table
ALTER TABLE proxies 
ADD COLUMN IF NOT EXISTS password_encrypted BYTEA;

-- Create function to migrate existing passwords to encrypted format
-- This will be run manually after deployment with the encryption key
CREATE OR REPLACE FUNCTION migrate_proxy_passwords_to_encrypted()
RETURNS void AS $$
BEGIN
    -- This is a placeholder - actual encryption happens in the application layer
    -- The application will read unencrypted passwords and write them back encrypted
    RAISE NOTICE 'Proxy password migration must be performed by the application layer';
END;
$$ LANGUAGE plpgsql;

-- Add encrypted fields for any future sensitive data storage
-- Create a table for storing encrypted API keys
CREATE TABLE IF NOT EXISTS encrypted_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    key_name TEXT NOT NULL,
    encrypted_key BYTEA NOT NULL,
    key_hint TEXT, -- Last 4 characters of the key for identification
    permissions JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_user_key_name UNIQUE (user_id, key_name)
);

-- Add indexes for API key lookups
CREATE INDEX idx_encrypted_api_keys_user_id ON encrypted_api_keys(user_id);
CREATE INDEX idx_encrypted_api_keys_expires_at ON encrypted_api_keys(expires_at) 
WHERE expires_at IS NOT NULL;

-- Add encrypted configuration storage
CREATE TABLE IF NOT EXISTS encrypted_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key TEXT NOT NULL UNIQUE,
    encrypted_value BYTEA NOT NULL,
    config_type TEXT NOT NULL CHECK (config_type IN ('api_credential', 'webhook_secret', 'integration_token', 'other')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by TEXT,
    updated_by TEXT
);

-- Add audit trail for encrypted data access
CREATE TABLE IF NOT EXISTS encryption_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id TEXT,
    action TEXT NOT NULL CHECK (action IN ('encrypt', 'decrypt', 'rotate_key', 'access_denied')),
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    ip_address INET,
    user_agent TEXT
);

-- Create index for audit log queries
CREATE INDEX idx_encryption_audit_log_timestamp ON encryption_audit_log(timestamp DESC);
CREATE INDEX idx_encryption_audit_log_user_id ON encryption_audit_log(user_id, timestamp DESC);
CREATE INDEX idx_encryption_audit_log_resource ON encryption_audit_log(resource_type, resource_id, timestamp DESC);

-- Add trigger to update timestamps
CREATE OR REPLACE FUNCTION update_encrypted_configs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_encrypted_configs_timestamp_trigger
BEFORE UPDATE ON encrypted_configs
FOR EACH ROW
EXECUTE FUNCTION update_encrypted_configs_timestamp();

-- Add comments for documentation
COMMENT ON TABLE encrypted_api_keys IS 'Stores API keys with field-level encryption for enhanced security';
COMMENT ON TABLE encrypted_configs IS 'Stores sensitive configuration values with encryption';
COMMENT ON TABLE encryption_audit_log IS 'Audit trail for all encryption/decryption operations';
COMMENT ON COLUMN proxies.password_encrypted IS 'Encrypted version of proxy password - replaces plaintext password field';