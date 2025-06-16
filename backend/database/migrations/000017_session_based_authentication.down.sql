-- Rollback Session-Based Authentication Migration
-- Restores CSRF token dependencies and removes session-based security enhancements

BEGIN;

-- Drop session security validation function
DROP FUNCTION IF EXISTS auth.validate_session_security(VARCHAR(128), INET, TEXT, BOOLEAN, BOOLEAN);

-- Drop session cleanup function
DROP FUNCTION IF EXISTS auth.cleanup_expired_sessions();

-- Drop session fingerprint trigger
DROP TRIGGER IF EXISTS trigger_session_fingerprint ON auth.sessions;

-- Drop session fingerprint function
DROP FUNCTION IF EXISTS auth.update_session_fingerprint();

-- Drop user agent hash function
DROP FUNCTION IF EXISTS generate_user_agent_hash(TEXT);

-- Drop session performance indexes
DROP INDEX IF EXISTS idx_sessions_validation;
DROP INDEX IF EXISTS idx_sessions_cleanup;
DROP INDEX IF EXISTS idx_sessions_fingerprint;
DROP INDEX IF EXISTS idx_sessions_user_agent_hash;
DROP INDEX IF EXISTS idx_sessions_ip_address;
DROP INDEX IF EXISTS idx_sessions_last_activity;

-- Drop auth audit log indexes
DROP INDEX IF EXISTS idx_auth_audit_session_fingerprint;

-- Remove new columns from auth_audit_log
ALTER TABLE auth.auth_audit_log DROP COLUMN IF EXISTS session_fingerprint;
ALTER TABLE auth.auth_audit_log DROP COLUMN IF EXISTS security_flags;

-- Remove session fingerprinting columns
ALTER TABLE auth.sessions DROP COLUMN IF EXISTS session_fingerprint;
ALTER TABLE auth.sessions DROP COLUMN IF EXISTS browser_fingerprint;
ALTER TABLE auth.sessions DROP COLUMN IF EXISTS screen_resolution;
ALTER TABLE auth.sessions DROP COLUMN IF EXISTS user_agent_hash;

-- Restore CSRF token column to sessions table
ALTER TABLE auth.sessions ADD COLUMN csrf_token VARCHAR(64);

-- Update existing sessions with temporary CSRF tokens
UPDATE auth.sessions 
SET csrf_token = encode(gen_random_bytes(32), 'hex')
WHERE csrf_token IS NULL;

-- Make CSRF token NOT NULL after updating existing records
ALTER TABLE auth.sessions ALTER COLUMN csrf_token SET NOT NULL;

-- Recreate original session indexes
DROP INDEX IF EXISTS idx_sessions_user_id;
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_active;

CREATE INDEX idx_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON auth.sessions(expires_at);
CREATE INDEX idx_sessions_active ON auth.sessions(is_active, expires_at);

-- Remove comments added for session-based authentication
COMMENT ON COLUMN auth.sessions.session_fingerprint IS NULL;
COMMENT ON COLUMN auth.sessions.browser_fingerprint IS NULL;
COMMENT ON COLUMN auth.sessions.user_agent_hash IS NULL;
COMMENT ON COLUMN auth.sessions.screen_resolution IS NULL;

COMMENT ON FUNCTION auth.validate_session_security IS NULL;
COMMENT ON FUNCTION auth.cleanup_expired_sessions IS NULL;
COMMENT ON FUNCTION generate_user_agent_hash IS NULL;

COMMIT;