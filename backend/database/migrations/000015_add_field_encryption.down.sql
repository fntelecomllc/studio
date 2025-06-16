-- Rollback field-level encryption changes

-- Disable RLS
ALTER TABLE proxies DISABLE ROW LEVEL SECURITY;
ALTER TABLE encryption_key_rotations DISABLE ROW LEVEL SECURITY;

-- Drop policies
DROP POLICY IF EXISTS proxy_access_policy ON proxies;
DROP POLICY IF EXISTS encryption_audit_policy ON encryption_key_rotations;

-- Drop indexes
DROP INDEX IF EXISTS idx_proxies_encrypted;
DROP INDEX IF EXISTS idx_personas_encrypted;

-- Drop views
DROP VIEW IF EXISTS proxies_decrypted;

-- Drop functions
DROP FUNCTION IF EXISTS rotate_encryption_keys(text, text, integer);
DROP FUNCTION IF EXISTS decrypt_jsonb(bytea, text);
DROP FUNCTION IF EXISTS encrypt_jsonb(jsonb, text);

-- Drop encryption tracking columns
ALTER TABLE proxies DROP COLUMN IF EXISTS encryption_key_version;
ALTER TABLE personas DROP COLUMN IF EXISTS encryption_key_version;

-- Drop encrypted columns
ALTER TABLE proxies DROP COLUMN IF EXISTS password_encrypted;
ALTER TABLE personas DROP COLUMN IF EXISTS config_details_encrypted;

-- Drop audit table
DROP TABLE IF EXISTS encryption_key_rotations;

-- Note: pgcrypto extension is left installed as it may be used elsewhere