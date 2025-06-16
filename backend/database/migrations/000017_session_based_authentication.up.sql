-- Session-Based Authentication Migration
-- Removes CSRF token dependencies and implements pure session-based security
-- Based on SESSION_BASED_AUTHENTICATION_ARCHITECTURE.md

BEGIN;

-- Remove CSRF token column from sessions table
ALTER TABLE auth.sessions DROP COLUMN IF EXISTS csrf_token;

-- Add session fingerprinting columns for enhanced security
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS session_fingerprint VARCHAR(255);
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS browser_fingerprint TEXT;
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS screen_resolution VARCHAR(20);

-- Add user agent hash for faster lookups and validation
ALTER TABLE auth.sessions ADD COLUMN IF NOT EXISTS user_agent_hash VARCHAR(64);

-- Create function to generate user agent hash
CREATE OR REPLACE FUNCTION generate_user_agent_hash(user_agent_text TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Generate SHA-256 hash of user agent for faster comparison
    RETURN encode(digest(user_agent_text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing sessions with user agent hashes
UPDATE auth.sessions 
SET user_agent_hash = generate_user_agent_hash(user_agent) 
WHERE user_agent IS NOT NULL AND user_agent_hash IS NULL;

-- Drop existing session indexes to recreate with optimizations
DROP INDEX IF EXISTS idx_sessions_user_id;
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_active;

-- Create optimized indexes for session-based authentication performance
CREATE INDEX idx_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON auth.sessions(expires_at);
CREATE INDEX idx_sessions_active ON auth.sessions(is_active, expires_at);
CREATE INDEX idx_sessions_last_activity ON auth.sessions(last_activity_at);
CREATE INDEX idx_sessions_fingerprint ON auth.sessions(session_fingerprint) WHERE session_fingerprint IS NOT NULL;
CREATE INDEX idx_sessions_user_agent_hash ON auth.sessions(user_agent_hash) WHERE user_agent_hash IS NOT NULL;
CREATE INDEX idx_sessions_ip_address ON auth.sessions(ip_address) WHERE ip_address IS NOT NULL;

-- Composite index for session validation performance
CREATE INDEX idx_sessions_validation ON auth.sessions(id, is_active, expires_at, user_id);

-- Index for session cleanup operations
CREATE INDEX idx_sessions_cleanup ON auth.sessions(is_active, expires_at) WHERE is_active = false OR expires_at < NOW();

-- Add trigger to automatically generate session fingerprint and user agent hash
CREATE OR REPLACE FUNCTION auth.update_session_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate session fingerprint from IP and user agent
    IF NEW.ip_address IS NOT NULL AND NEW.user_agent IS NOT NULL THEN
        NEW.session_fingerprint := encode(
            digest(
                COALESCE(host(NEW.ip_address), '') || '|' || 
                COALESCE(NEW.user_agent, '') || '|' || 
                COALESCE(NEW.screen_resolution, ''),
                'sha256'
            ),
            'hex'
        );
    END IF;
    
    -- Generate user agent hash
    IF NEW.user_agent IS NOT NULL THEN
        NEW.user_agent_hash := generate_user_agent_hash(NEW.user_agent);
    END IF;
    
    -- Generate browser fingerprint (simplified version)
    IF NEW.user_agent IS NOT NULL THEN
        NEW.browser_fingerprint := encode(
            digest(
                COALESCE(NEW.user_agent, '') || '|' || 
                COALESCE(NEW.screen_resolution, ''),
                'sha256'
            ),
            'hex'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for session fingerprinting
DROP TRIGGER IF EXISTS trigger_session_fingerprint ON auth.sessions;
CREATE TRIGGER trigger_session_fingerprint
    BEFORE INSERT OR UPDATE ON auth.sessions
    FOR EACH ROW
    EXECUTE FUNCTION auth.update_session_fingerprint();

-- Update auth_audit_log to remove CSRF-related events and add session security events
ALTER TABLE auth.auth_audit_log 
ADD COLUMN IF NOT EXISTS session_fingerprint VARCHAR(255),
ADD COLUMN IF NOT EXISTS security_flags JSONB DEFAULT '{}'::jsonb;

-- Create index for audit log session fingerprint
CREATE INDEX IF NOT EXISTS idx_auth_audit_session_fingerprint 
ON auth.auth_audit_log(session_fingerprint) 
WHERE session_fingerprint IS NOT NULL;

-- Add session security validation function
CREATE OR REPLACE FUNCTION auth.validate_session_security(
    p_session_id VARCHAR(128),
    p_client_ip INET,
    p_user_agent TEXT,
    p_require_ip_match BOOLEAN DEFAULT FALSE,
    p_require_ua_match BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
    is_valid BOOLEAN,
    user_id UUID,
    security_flags JSONB,
    permissions TEXT[],
    roles TEXT[]
) AS $$
DECLARE
    session_record RECORD;
    current_fingerprint VARCHAR(255);
    security_issues JSONB := '{}'::jsonb;
BEGIN
    -- Get session record
    SELECT s.*, array_agg(DISTINCT p.name) as user_permissions, array_agg(DISTINCT r.name) as user_roles
    INTO session_record
    FROM auth.sessions s
    JOIN auth.users u ON s.user_id = u.id
    LEFT JOIN auth.user_roles ur ON u.id = ur.user_id
    LEFT JOIN auth.roles r ON ur.role_id = r.id
    LEFT JOIN auth.role_permissions rp ON r.id = rp.role_id
    LEFT JOIN auth.permissions p ON rp.permission_id = p.id
    WHERE s.id = p_session_id
    AND s.is_active = TRUE
    AND s.expires_at > NOW()
    AND u.is_active = TRUE
    AND u.is_locked = FALSE
    GROUP BY s.id, s.user_id, s.ip_address, s.user_agent, s.session_fingerprint, 
             s.browser_fingerprint, s.user_agent_hash, s.is_active, s.expires_at, 
             s.last_activity_at, s.created_at, s.screen_resolution;
    
    -- Check if session exists and is valid
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, '{"error": "session_not_found"}'::jsonb, NULL::TEXT[], NULL::TEXT[];
        RETURN;
    END IF;
    
    -- Generate current fingerprint for comparison
    IF p_client_ip IS NOT NULL AND p_user_agent IS NOT NULL THEN
        current_fingerprint := encode(
            digest(
                COALESCE(host(p_client_ip), '') || '|' || 
                COALESCE(p_user_agent, ''),
                'sha256'
            ),
            'hex'
        );
    END IF;
    
    -- Security validations
    IF p_require_ip_match AND session_record.ip_address != p_client_ip THEN
        security_issues := security_issues || '{"ip_mismatch": true}'::jsonb;
    END IF;
    
    IF p_require_ua_match AND session_record.user_agent_hash != generate_user_agent_hash(p_user_agent) THEN
        security_issues := security_issues || '{"user_agent_mismatch": true}'::jsonb;
    END IF;
    
    -- Check for session fingerprint changes
    IF session_record.session_fingerprint IS NOT NULL AND current_fingerprint IS NOT NULL 
       AND session_record.session_fingerprint != current_fingerprint THEN
        security_issues := security_issues || '{"fingerprint_mismatch": true}'::jsonb;
    END IF;
    
    -- Check for idle timeout (30 minutes default)
    IF session_record.last_activity_at < (NOW() - INTERVAL '30 minutes') THEN
        security_issues := security_issues || '{"idle_timeout": true}'::jsonb;
    END IF;
    
    -- Return validation result
    IF jsonb_object_keys(security_issues) IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, session_record.user_id, security_issues, NULL::TEXT[], NULL::TEXT[];
    ELSE
        RETURN QUERY SELECT TRUE, session_record.user_id, '{}'::jsonb, 
                           session_record.user_permissions, session_record.user_roles;
    END IF;
    
    -- Update last activity
    UPDATE auth.sessions 
    SET last_activity_at = NOW() 
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Create session cleanup function for expired/inactive sessions
CREATE OR REPLACE FUNCTION auth.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired sessions
    WITH deleted AS (
        DELETE FROM auth.sessions 
        WHERE expires_at < NOW() 
        OR (is_active = FALSE AND last_activity_at < (NOW() - INTERVAL '7 days'))
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    -- Log cleanup operation
    INSERT INTO auth.auth_audit_log (event_type, event_status, details)
    VALUES ('session_cleanup', 'success', 
            jsonb_build_object('deleted_sessions', deleted_count, 'cleanup_time', NOW()));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN auth.sessions.session_fingerprint IS 'SHA-256 hash of IP address, user agent, and screen resolution for session security';
COMMENT ON COLUMN auth.sessions.browser_fingerprint IS 'SHA-256 hash of user agent and screen resolution for browser identification';
COMMENT ON COLUMN auth.sessions.user_agent_hash IS 'SHA-256 hash of user agent for fast comparison';
COMMENT ON COLUMN auth.sessions.screen_resolution IS 'Screen resolution for enhanced browser fingerprinting';

COMMENT ON FUNCTION auth.validate_session_security IS 'Validates session security with optional IP and user agent matching';
COMMENT ON FUNCTION auth.cleanup_expired_sessions IS 'Removes expired and inactive sessions from the database';
COMMENT ON FUNCTION generate_user_agent_hash IS 'Generates SHA-256 hash of user agent string';

COMMIT;