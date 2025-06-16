-- DomainFlow Consolidated Database Schema v2.0 - Functions & Triggers
-- Advanced database functions for session management, performance optimization, and data integrity
-- Created: 2025-06-16

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to generate user agent hash for session security
CREATE OR REPLACE FUNCTION generate_user_agent_hash(user_agent_text TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Generate SHA-256 hash of user agent for faster comparison
    RETURN encode(digest(user_agent_text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update session fingerprints automatically
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

-- Enhanced session validation function with comprehensive security checks
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
    -- Get session record with user permissions and roles
    SELECT s.*, 
           array_agg(DISTINCT p.name) as user_permissions, 
           array_agg(DISTINCT r.name) as user_roles
    INTO session_record
    FROM auth.sessions s
    JOIN auth.users u ON s.user_id = u.id
    LEFT JOIN auth.user_roles ur ON u.id = ur.user_id AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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

-- Function to cleanup expired sessions with detailed logging
CREATE OR REPLACE FUNCTION auth.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    inactive_count INTEGER;
    total_before INTEGER;
BEGIN
    -- Get total count before cleanup
    SELECT COUNT(*) INTO total_before FROM auth.sessions;
    
    -- Delete expired sessions
    WITH deleted AS (
        DELETE FROM auth.sessions
        WHERE expires_at < NOW()
        OR (is_active = FALSE AND last_activity_at < (NOW() - INTERVAL '7 days'))
        RETURNING id, user_id, expires_at, is_active
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    -- Count inactive sessions
    SELECT COUNT(*) INTO inactive_count 
    FROM auth.sessions 
    WHERE is_active = FALSE;
    
    -- Log cleanup operation with detailed metrics
    INSERT INTO auth.auth_audit_log (event_type, event_status, details)
    VALUES ('session_cleanup', 'success',
            jsonb_build_object(
                'deleted_sessions', deleted_count,
                'inactive_sessions_remaining', inactive_count,
                'total_sessions_before', total_before,
                'cleanup_time', NOW(),
                'cleanup_criteria', 'expired OR (inactive AND older than 7 days)'
            ));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update 'updated_at' column automatically
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enhanced campaign statistics refresh function
CREATE OR REPLACE FUNCTION refresh_campaign_statistics(campaign_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
    refresh_count INTEGER := 0;
BEGIN
    IF campaign_id IS NOT NULL THEN
        -- Refresh specific campaign
        DELETE FROM campaign_statistics WHERE id = campaign_id;
        refresh_count := 1;
    ELSE
        -- Full refresh
        TRUNCATE campaign_statistics;
        refresh_count := (SELECT COUNT(*) FROM campaigns);
    END IF;
    
    -- Insert fresh data
    INSERT INTO campaign_statistics
    SELECT 
        c.id,
        c.user_id,
        c.campaign_type,
        c.status,
        c.created_at,
        c.started_at,
        c.completed_at,
        c.updated_at,
        COALESCE(c.total_items, 0) as total_items,
        COALESCE(c.processed_items, 0) as processed_items,
        COALESCE(c.progress_percentage, 0) as progress_percentage,
        
        -- Domain generation statistics
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.id IS NOT NULL) as total_domains,
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'valid') as valid_domains,
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'invalid') as invalid_domains,
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'pending') as pending_domains,
        COUNT(DISTINCT gd.id) FILTER (WHERE gd.validation_status = 'error') as error_domains,
        
        -- DNS validation statistics
        COUNT(DISTINCT dns.id) FILTER (WHERE dns.id IS NOT NULL) as total_dns_validations,
        COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'resolved') as dns_resolved,
        COUNT(DISTINCT dns.id) FILTER (WHERE dns.validation_status = 'unresolved') as dns_unresolved,
        AVG(dns.response_time_ms) FILTER (WHERE dns.response_time_ms IS NOT NULL) as avg_dns_response_time,
        
        -- HTTP validation statistics
        COUNT(DISTINCT http.id) FILTER (WHERE http.id IS NOT NULL) as total_http_validations,
        COUNT(DISTINCT http.id) FILTER (WHERE http.validation_status = 'success') as http_success,
        COUNT(DISTINCT http.id) FILTER (WHERE http.found_keywords_from_sets IS NOT NULL AND jsonb_array_length(http.found_keywords_from_sets) > 0) as http_keywords_found,
        AVG(http.response_time_ms) FILTER (WHERE http.response_time_ms IS NOT NULL) as avg_http_response_time,
        
        -- Performance metrics
        EXTRACT(EPOCH FROM (COALESCE(c.completed_at, NOW()) - c.created_at)) as duration_seconds,
        CASE 
            WHEN c.processed_items > 0 AND c.completed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (c.completed_at - COALESCE(c.started_at, c.created_at))) / c.processed_items
            ELSE NULL
        END as avg_processing_time_per_item,
        
        -- Resource utilization
        COUNT(DISTINCT cj.id) FILTER (WHERE cj.status IN ('running', 'pending')) as active_jobs,
        MAX(gd.offset_index) as max_domain_offset,
        MIN(gd.created_at) as first_domain_created_at,
        MAX(gd.created_at) as last_domain_created_at

    FROM campaigns c
    LEFT JOIN generated_domains gd ON gd.domain_generation_campaign_id = c.id
    LEFT JOIN dns_validation_results dns ON dns.dns_campaign_id = c.id
    LEFT JOIN http_keyword_results http ON http.http_keyword_campaign_id = c.id
    LEFT JOIN campaign_jobs cj ON cj.campaign_id = c.id
    WHERE (campaign_id IS NULL OR c.id = campaign_id)
    GROUP BY c.id, c.user_id, c.campaign_type, c.status, c.created_at, c.started_at, c.completed_at, 
             c.updated_at, c.total_items, c.processed_items, c.progress_percentage;
    
    RETURN refresh_count;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS JSONB AS $$
DECLARE
    refresh_results JSONB := '{}'::jsonb;
    start_time TIMESTAMP;
    end_time TIMESTAMP;
BEGIN
    start_time := NOW();
    
    -- Refresh campaign statistics
    REFRESH MATERIALIZED VIEW CONCURRENTLY campaign_statistics;
    refresh_results := refresh_results || jsonb_build_object('campaign_statistics', 'success');
    
    -- Refresh user activity summary
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_activity_summary;
    refresh_results := refresh_results || jsonb_build_object('user_activity_summary', 'success');
    
    -- Refresh system performance summary
    REFRESH MATERIALIZED VIEW CONCURRENTLY system_performance_summary;
    refresh_results := refresh_results || jsonb_build_object('system_performance_summary', 'success');
    
    end_time := NOW();
    refresh_results := refresh_results || jsonb_build_object(
        'total_duration_seconds', EXTRACT(EPOCH FROM (end_time - start_time)),
        'refreshed_at', end_time
    );
    
    -- Log the refresh operation
    INSERT INTO audit_logs (action, entity_type, details, user_id)
    VALUES ('materialized_view_refresh', 'system', refresh_results, NULL);
    
    RETURN refresh_results;
END;
$$ LANGUAGE plpgsql;

-- Function to analyze campaign performance and suggest optimizations
CREATE OR REPLACE FUNCTION analyze_campaign_performance(campaign_id UUID)
RETURNS JSONB AS $$
DECLARE
    campaign_stats RECORD;
    performance_analysis JSONB := '{}'::jsonb;
    recommendations TEXT[] := '{}';
BEGIN
    -- Get campaign statistics
    SELECT * INTO campaign_stats
    FROM campaign_statistics
    WHERE id = campaign_id;
    
    IF NOT FOUND THEN
        RETURN '{"error": "Campaign not found"}'::jsonb;
    END IF;
    
    -- Analyze processing speed
    IF campaign_stats.avg_processing_time_per_item IS NOT NULL THEN
        performance_analysis := performance_analysis || jsonb_build_object(
            'avg_processing_time_per_item', campaign_stats.avg_processing_time_per_item,
            'processing_rate_per_hour', 3600.0 / campaign_stats.avg_processing_time_per_item
        );
        
        -- Performance recommendations
        IF campaign_stats.avg_processing_time_per_item > 10 THEN
            recommendations := recommendations || 'Consider increasing parallel workers for better performance';
        END IF;
        
        IF campaign_stats.avg_processing_time_per_item > 30 THEN
            recommendations := recommendations || 'Review network timeouts and proxy health';
        END IF;
    END IF;
    
    -- Analyze success rates
    IF campaign_stats.total_dns_validations > 0 THEN
        performance_analysis := performance_analysis || jsonb_build_object(
            'dns_success_rate', 
            ROUND((campaign_stats.dns_resolved::numeric / campaign_stats.total_dns_validations * 100), 2)
        );
    END IF;
    
    IF campaign_stats.total_http_validations > 0 THEN
        performance_analysis := performance_analysis || jsonb_build_object(
            'http_success_rate',
            ROUND((campaign_stats.http_success::numeric / campaign_stats.total_http_validations * 100), 2),
            'keyword_match_rate',
            ROUND((campaign_stats.http_keywords_found::numeric / campaign_stats.total_http_validations * 100), 2)
        );
    END IF;
    
    -- Resource utilization analysis
    performance_analysis := performance_analysis || jsonb_build_object(
        'active_jobs', campaign_stats.active_jobs,
        'total_domains', campaign_stats.total_domains,
        'valid_domains', campaign_stats.valid_domains,
        'recommendations', recommendations
    );
    
    RETURN performance_analysis;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old audit logs with retention policy
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMP;
BEGIN
    cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
    
    -- Delete old audit logs
    WITH deleted AS (
        DELETE FROM audit_logs
        WHERE timestamp < cutoff_date
        AND action NOT IN ('user_created', 'user_deleted', 'role_assigned', 'permission_granted')
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    -- Delete old auth audit logs (keep security events longer)
    DELETE FROM auth.auth_audit_log
    WHERE created_at < (NOW() - INTERVAL '180 days')
    AND risk_score < 5;
    
    -- Log cleanup operation
    INSERT INTO audit_logs (action, entity_type, details)
    VALUES ('audit_log_cleanup', 'system',
            jsonb_build_object(
                'deleted_count', deleted_count,
                'retention_days', retention_days,
                'cutoff_date', cutoff_date
            ));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user permissions efficiently
CREATE OR REPLACE FUNCTION auth.get_user_permissions(p_user_id UUID)
RETURNS TEXT[] AS $$
DECLARE
    user_permissions TEXT[];
BEGIN
    SELECT array_agg(DISTINCT p.name)
    INTO user_permissions
    FROM auth.users u
    JOIN auth.user_roles ur ON u.id = ur.user_id
    JOIN auth.roles r ON ur.role_id = r.id
    JOIN auth.role_permissions rp ON r.id = rp.role_id
    JOIN auth.permissions p ON rp.permission_id = p.id
    WHERE u.id = p_user_id
    AND u.is_active = TRUE
    AND u.is_locked = FALSE
    AND (ur.expires_at IS NULL OR ur.expires_at > NOW());
    
    RETURN COALESCE(user_permissions, '{}');
END;
$$ LANGUAGE plpgsql;

-- Function to validate JSONB structures
CREATE OR REPLACE FUNCTION validate_jsonb_structure(
    p_jsonb JSONB,
    p_required_keys TEXT[],
    p_optional_keys TEXT[] DEFAULT '{}'
) RETURNS BOOLEAN AS $$
DECLARE
    key TEXT;
    all_keys TEXT[];
BEGIN
    -- Check if all required keys exist
    FOREACH key IN ARRAY p_required_keys LOOP
        IF NOT (p_jsonb ? key) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    -- Check if all keys in JSONB are either required or optional
    all_keys := p_required_keys || p_optional_keys;
    FOR key IN SELECT jsonb_object_keys(p_jsonb) LOOP
        IF NOT (key = ANY(all_keys)) THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Apply triggers for session fingerprinting
DROP TRIGGER IF EXISTS trigger_session_fingerprint ON auth.sessions;
CREATE TRIGGER trigger_session_fingerprint
    BEFORE INSERT OR UPDATE ON auth.sessions
    FOR EACH ROW
    EXECUTE FUNCTION auth.update_session_fingerprint();

-- Apply the timestamp triggers to tables with updated_at columns
DROP TRIGGER IF EXISTS set_timestamp_auth_users ON auth.users;
CREATE TRIGGER set_timestamp_auth_users
    BEFORE UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_auth_roles ON auth.roles;
CREATE TRIGGER set_timestamp_auth_roles
    BEFORE UPDATE ON auth.roles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_campaigns ON campaigns;
CREATE TRIGGER set_timestamp_campaigns
    BEFORE UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_personas ON personas;
CREATE TRIGGER set_timestamp_personas
    BEFORE UPDATE ON personas
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_keyword_sets ON keyword_sets;
CREATE TRIGGER set_timestamp_keyword_sets
    BEFORE UPDATE ON keyword_sets
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_proxies ON proxies;
CREATE TRIGGER set_timestamp_proxies
    BEFORE UPDATE ON proxies
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_campaign_jobs ON campaign_jobs;
CREATE TRIGGER set_timestamp_campaign_jobs
    BEFORE UPDATE ON campaign_jobs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Trigger to automatically refresh campaign statistics on significant changes
CREATE OR REPLACE FUNCTION trigger_refresh_campaign_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- Only refresh if status or progress changed significantly
    IF NEW.status != OLD.status OR 
       ABS(NEW.progress_percentage - OLD.progress_percentage) > 5 OR
       NEW.processed_items != OLD.processed_items OR
       NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
        PERFORM refresh_campaign_statistics(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS refresh_campaign_statistics_on_update ON campaigns;
CREATE TRIGGER refresh_campaign_statistics_on_update
    AFTER UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION trigger_refresh_campaign_statistics();

-- Trigger to log campaign status changes
CREATE OR REPLACE FUNCTION trigger_log_campaign_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
        INSERT INTO audit_logs (action, entity_type, entity_id, details, user_id)
        VALUES (
            'campaign_status_change',
            'Campaign',
            NEW.id,
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'progress_percentage', NEW.progress_percentage,
                'processed_items', NEW.processed_items
            ),
            NEW.user_id
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_campaign_status_change ON campaigns;
CREATE TRIGGER log_campaign_status_change
    AFTER UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION trigger_log_campaign_status_change();

-- Trigger to update persona usage statistics
CREATE OR REPLACE FUNCTION trigger_update_persona_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE personas 
        SET usage_count = COALESCE(usage_count, 0) + 1,
            last_used_at = NOW()
        WHERE id = NEW.validated_by_persona_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply persona usage triggers to validation result tables
DROP TRIGGER IF EXISTS update_persona_usage_dns ON dns_validation_results;
CREATE TRIGGER update_persona_usage_dns
    AFTER INSERT ON dns_validation_results
    FOR EACH ROW
    WHEN (NEW.validated_by_persona_id IS NOT NULL)
    EXECUTE FUNCTION trigger_update_persona_usage();

DROP TRIGGER IF EXISTS update_persona_usage_http ON http_keyword_results;
CREATE TRIGGER update_persona_usage_http
    AFTER INSERT ON http_keyword_results
    FOR EACH ROW
    WHEN (NEW.validated_by_persona_id IS NOT NULL)
    EXECUTE FUNCTION trigger_update_persona_usage();

-- Trigger to update proxy usage statistics
CREATE OR REPLACE FUNCTION trigger_update_proxy_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE proxies 
        SET total_requests = COALESCE(total_requests, 0) + 1,
            failed_requests = CASE 
                WHEN NEW.validation_status NOT IN ('success', 'keywords_found') 
                THEN COALESCE(failed_requests, 0) + 1
                ELSE COALESCE(failed_requests, 0)
            END,
            success_rate = CASE
                WHEN COALESCE(total_requests, 0) + 1 > 0
                THEN (COALESCE(total_requests, 0) + 1 - COALESCE(failed_requests, 0))::DOUBLE PRECISION / (COALESCE(total_requests, 0) + 1) * 100
                ELSE 0
            END,
            consecutive_failures = CASE
                WHEN NEW.validation_status NOT IN ('success', 'keywords_found')
                THEN COALESCE(consecutive_failures, 0) + 1
                ELSE 0
            END
        WHERE id = NEW.used_proxy_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_proxy_usage ON http_keyword_results;
CREATE TRIGGER update_proxy_usage
    AFTER INSERT ON http_keyword_results
    FOR EACH ROW
    WHEN (NEW.used_proxy_id IS NOT NULL)
    EXECUTE FUNCTION trigger_update_proxy_usage();

-- =====================================================
-- SCHEMA COMMENTS FOR DOCUMENTATION
-- =====================================================

-- Session-based authentication comments
COMMENT ON COLUMN auth.sessions.session_fingerprint IS 'SHA-256 hash of IP address, user agent, and screen resolution for session security';
COMMENT ON COLUMN auth.sessions.browser_fingerprint IS 'SHA-256 hash of user agent and screen resolution for browser identification';
COMMENT ON COLUMN auth.sessions.user_agent_hash IS 'SHA-256 hash of user agent for fast comparison';
COMMENT ON COLUMN auth.sessions.screen_resolution IS 'Screen resolution for enhanced browser fingerprinting';
COMMENT ON FUNCTION auth.validate_session_security IS 'Validates session security with optional IP and user agent matching';
COMMENT ON FUNCTION auth.cleanup_expired_sessions IS 'Removes expired and inactive sessions from the database';
COMMENT ON FUNCTION generate_user_agent_hash IS 'Generates SHA-256 hash of user agent string';

-- Application schema comments
COMMENT ON COLUMN campaigns.campaign_type IS 'e.g., domain_generation, dns_validation, http_keyword_validation';
COMMENT ON COLUMN campaigns.status IS 'e.g., pending, queued, running, paused, completed, failed, archived';
COMMENT ON COLUMN personas.persona_type IS 'dns or http';
COMMENT ON COLUMN personas.config_details IS 'Stores DNSValidatorConfigJSON or HTTPValidatorConfigJSON';
COMMENT ON COLUMN keyword_sets.keywords IS 'Array of KeywordRule objects: [{"pattern": "findme", "ruleType": "string", ...}]';
COMMENT ON COLUMN dns_validation_results.validation_status IS 'e.g., resolved, unresolved, error, pending, skipped';
COMMENT ON COLUMN http_keyword_campaign_params.source_type IS 'DomainGeneration or DNSValidation to indicate which type source_campaign_id refers to';
COMMENT ON COLUMN http_keyword_results.validation_status IS 'e.g., success, content_mismatch, keywords_not_found, unreachable, access_denied, proxy_error, dns_error, timeout, error, pending, skipped';
COMMENT ON COLUMN audit_logs.action IS 'e.g., campaign_created, persona_updated, proxy_tested';
COMMENT ON COLUMN audit_logs.entity_type IS 'e.g., Campaign, Persona, Proxy';
COMMENT ON COLUMN campaign_jobs.job_type IS 'e.g., domain_generation, dns_validation, http_keyword_validation (matches campaign_type usually)';
COMMENT ON COLUMN campaign_jobs.status IS 'e.g., pending, queued, running, completed, failed, retry';

-- Materialized view comments
COMMENT ON MATERIALIZED VIEW campaign_statistics IS 'Pre-computed campaign statistics for performance optimization. Refresh regularly via scheduled job.';
COMMENT ON MATERIALIZED VIEW user_activity_summary IS 'User activity metrics for dashboard and reporting. Refresh hourly.';
COMMENT ON MATERIALIZED VIEW system_performance_summary IS 'System-wide performance metrics. Refresh every 15 minutes.';

-- Function comments
COMMENT ON FUNCTION refresh_campaign_statistics IS 'Refreshes campaign statistics materialized view for specific campaign or all campaigns';
COMMENT ON FUNCTION refresh_all_materialized_views IS 'Refreshes all materialized views and returns performance metrics';
COMMENT ON FUNCTION analyze_campaign_performance IS 'Analyzes campaign performance and provides optimization recommendations';
COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Removes old audit logs based on retention policy';
COMMENT ON FUNCTION auth.get_user_permissions IS 'Efficiently retrieves all permissions for a user';
COMMENT ON FUNCTION validate_jsonb_structure IS 'Validates JSONB data against required and optional key schemas';