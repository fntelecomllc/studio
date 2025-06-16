-- Migration: Add Multi-Factor Authentication Support
-- Phase 3.1: Authentication Flow Improvements
-- This migration adds tables and columns to support MFA (TOTP and backup codes)

-- Add MFA-related columns to users table
ALTER TABLE auth.users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT,
ADD COLUMN IF NOT EXISTS mfa_recovery_codes_encrypted TEXT,
ADD COLUMN IF NOT EXISTS mfa_enforced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS mfa_setup_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS mfa_last_used_at TIMESTAMPTZ;

-- Create index for MFA status queries
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON auth.users(mfa_enabled);

-- Table for MFA backup codes (normalized for better security and tracking)
CREATE TABLE IF NOT EXISTS mfa_backup_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL, -- bcrypt hash of the backup code
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at TIMESTAMPTZ,
    used_ip_address INET,
    is_active BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for backup codes
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user_id ON mfa_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_active ON mfa_backup_codes(user_id, is_active) WHERE is_active = true;

-- Table for MFA devices (for future support of multiple MFA methods)
CREATE TABLE IF NOT EXISTS mfa_devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK (device_type IN ('totp', 'webauthn', 'sms', 'email')),
    device_identifier TEXT, -- For SMS: phone number, Email: email address, etc.
    secret_encrypted TEXT, -- Encrypted secret for TOTP
    public_key_credential TEXT, -- For WebAuthn
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    verified_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT unique_primary_per_user UNIQUE (user_id, is_primary) WHERE is_primary = true
);

-- Indexes for MFA devices
CREATE INDEX IF NOT EXISTS idx_mfa_devices_user_id ON mfa_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_devices_active ON mfa_devices(user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mfa_devices_type ON mfa_devices(device_type);

-- Table for MFA verification attempts (for rate limiting and audit)
CREATE TABLE IF NOT EXISTS mfa_verification_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES mfa_devices(id) ON DELETE SET NULL,
    attempt_type TEXT NOT NULL CHECK (attempt_type IN ('totp', 'backup_code', 'webauthn', 'sms', 'email')),
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Indexes for verification attempts
CREATE INDEX IF NOT EXISTS idx_mfa_verification_attempts_user_id ON mfa_verification_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_verification_attempts_timestamp ON mfa_verification_attempts(attempted_at);
CREATE INDEX IF NOT EXISTS idx_mfa_verification_attempts_success ON mfa_verification_attempts(user_id, success, attempted_at);

-- Table for MFA configuration rules (for organizational policies)
CREATE TABLE IF NOT EXISTS mfa_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_name TEXT NOT NULL UNIQUE,
    description TEXT,
    require_mfa_for_admins BOOLEAN DEFAULT TRUE,
    require_mfa_for_all_users BOOLEAN DEFAULT FALSE,
    allowed_mfa_types TEXT[] DEFAULT ARRAY['totp', 'backup_code'],
    grace_period_days INTEGER DEFAULT 7, -- Days before MFA is enforced after notification
    min_backup_codes INTEGER DEFAULT 8,
    backup_code_regeneration_days INTEGER DEFAULT 365, -- Force regeneration after this many days
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Insert default MFA policy
INSERT INTO mfa_policies (
    policy_name,
    description,
    require_mfa_for_admins,
    require_mfa_for_all_users,
    allowed_mfa_types,
    grace_period_days,
    min_backup_codes,
    backup_code_regeneration_days
) VALUES (
    'default',
    'Default MFA policy for DomainFlow',
    TRUE,  -- Require MFA for admins
    FALSE, -- Don't require for all users yet
    ARRAY['totp', 'backup_code'],
    7,     -- 7 day grace period
    8,     -- 8 backup codes minimum
    365    -- Regenerate backup codes yearly
) ON CONFLICT (policy_name) DO NOTHING;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION update_mfa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_mfa_devices_updated_at
    BEFORE UPDATE ON mfa_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_mfa_updated_at();

CREATE TRIGGER update_mfa_policies_updated_at
    BEFORE UPDATE ON mfa_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_mfa_updated_at();

-- Add comments for documentation
COMMENT ON TABLE mfa_backup_codes IS 'Stores hashed backup codes for MFA recovery';
COMMENT ON TABLE mfa_devices IS 'Stores MFA device configurations (TOTP, WebAuthn, etc.)';
COMMENT ON TABLE mfa_verification_attempts IS 'Logs MFA verification attempts for security audit and rate limiting';
COMMENT ON TABLE mfa_policies IS 'Organizational MFA policies and requirements';

COMMENT ON COLUMN auth.users.mfa_enabled IS 'Whether MFA is enabled for this user';
COMMENT ON COLUMN auth.users.mfa_secret_encrypted IS 'Encrypted TOTP secret (legacy, use mfa_devices for new implementations)';
COMMENT ON COLUMN auth.users.mfa_recovery_codes_encrypted IS 'Encrypted recovery codes (legacy, use mfa_backup_codes for new implementations)';
COMMENT ON COLUMN auth.users.mfa_enforced_at IS 'When MFA will be enforced for this user (grace period)';
COMMENT ON COLUMN auth.users.mfa_setup_completed_at IS 'When the user completed MFA setup';
COMMENT ON COLUMN auth.users.mfa_last_used_at IS 'Last time MFA was used for authentication';

-- Create role if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'domainflow') THEN
        CREATE ROLE domainflow;
    END IF;
END $$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_backup_codes TO domainflow;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_devices TO domainflow;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_verification_attempts TO domainflow;
GRANT SELECT, INSERT, UPDATE, DELETE ON mfa_policies TO domainflow;