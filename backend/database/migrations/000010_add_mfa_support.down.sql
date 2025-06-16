-- Rollback Migration: Remove Multi-Factor Authentication Support

-- Drop triggers
DROP TRIGGER IF EXISTS update_mfa_devices_updated_at ON mfa_devices;
DROP TRIGGER IF EXISTS update_mfa_policies_updated_at ON mfa_policies;

-- Drop function
DROP FUNCTION IF EXISTS update_mfa_updated_at();

-- Drop tables in reverse order of creation
DROP TABLE IF EXISTS mfa_policies CASCADE;
DROP TABLE IF EXISTS mfa_verification_attempts CASCADE;
DROP TABLE IF EXISTS mfa_devices CASCADE;
DROP TABLE IF EXISTS mfa_backup_codes CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_users_mfa_enabled;

-- Remove MFA-related columns from users table
ALTER TABLE users
DROP COLUMN IF EXISTS mfa_enabled,
DROP COLUMN IF EXISTS mfa_secret_encrypted,
DROP COLUMN IF EXISTS mfa_recovery_codes_encrypted,
DROP COLUMN IF EXISTS mfa_enforced_at,
DROP COLUMN IF EXISTS mfa_setup_completed_at,
DROP COLUMN IF EXISTS mfa_last_used_at;