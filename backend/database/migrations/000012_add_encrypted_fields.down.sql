-- Rollback encrypted fields migration

-- Drop triggers first
DROP TRIGGER IF EXISTS update_encrypted_configs_timestamp_trigger ON encrypted_configs;

-- Drop functions
DROP FUNCTION IF EXISTS update_encrypted_configs_timestamp();
DROP FUNCTION IF EXISTS migrate_proxy_passwords_to_encrypted();

-- Drop tables
DROP TABLE IF EXISTS encryption_audit_log;
DROP TABLE IF EXISTS encrypted_configs;
DROP TABLE IF EXISTS encrypted_api_keys;

-- Remove encrypted column from proxies table
ALTER TABLE proxies 
DROP COLUMN IF EXISTS password_encrypted;