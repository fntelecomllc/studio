--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (Ubuntu 17.5-1.pgdg25.04+1)
-- Dumped by pg_dump version 17.5 (Ubuntu 17.5-1.pgdg25.04+1)

-- Started on 2025-06-16 22:12:28 UTC

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP DATABASE IF EXISTS domainflow_production;
--
-- TOC entry 3860 (class 1262 OID 16389)
-- Name: domainflow_production; Type: DATABASE; Schema: -; Owner: domainflow
--

CREATE DATABASE domainflow_production WITH TEMPLATE = template0 ENCODING = 'UTF8' LOCALE_PROVIDER = libc LOCALE = 'en_US.UTF-8';


ALTER DATABASE domainflow_production OWNER TO domainflow;

\connect domainflow_production

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 9 (class 2615 OID 74283)
-- Name: auth; Type: SCHEMA; Schema: -; Owner: domainflow
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO domainflow;

--
-- TOC entry 7 (class 2615 OID 74281)
-- Name: consolidation; Type: SCHEMA; Schema: -; Owner: domainflow
--

CREATE SCHEMA consolidation;


ALTER SCHEMA consolidation OWNER TO domainflow;

--
-- TOC entry 8 (class 2615 OID 74282)
-- Name: public; Type: SCHEMA; Schema: -; Owner: domainflow
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO domainflow;

--
-- TOC entry 3861 (class 0 OID 0)
-- Dependencies: 8
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: domainflow
--

COMMENT ON SCHEMA public IS '';


--
-- TOC entry 3 (class 3079 OID 74744)
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- TOC entry 3863 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- TOC entry 2 (class 3079 OID 74285)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 3864 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- TOC entry 300 (class 1255 OID 74718)
-- Name: cleanup_expired_sessions(); Type: FUNCTION; Schema: auth; Owner: domainflow
--

CREATE FUNCTION auth.cleanup_expired_sessions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION auth.cleanup_expired_sessions() OWNER TO domainflow;

--
-- TOC entry 3865 (class 0 OID 0)
-- Dependencies: 300
-- Name: FUNCTION cleanup_expired_sessions(); Type: COMMENT; Schema: auth; Owner: domainflow
--

COMMENT ON FUNCTION auth.cleanup_expired_sessions() IS 'Removes expired and inactive sessions from the database';


--
-- TOC entry 271 (class 1255 OID 74716)
-- Name: update_session_fingerprint(); Type: FUNCTION; Schema: auth; Owner: domainflow
--

CREATE FUNCTION auth.update_session_fingerprint() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION auth.update_session_fingerprint() OWNER TO domainflow;

--
-- TOC entry 299 (class 1255 OID 74717)
-- Name: validate_session_security(character varying, inet, text, boolean, boolean); Type: FUNCTION; Schema: auth; Owner: domainflow
--

CREATE FUNCTION auth.validate_session_security(p_session_id character varying, p_client_ip inet, p_user_agent text, p_require_ip_match boolean DEFAULT false, p_require_ua_match boolean DEFAULT false) RETURNS TABLE(is_valid boolean, user_id uuid, security_flags jsonb, permissions text[], roles text[])
    LANGUAGE plpgsql
    AS $$
DECLARE
    session_record RECORD;
    current_fingerprint VARCHAR(255);
    security_issues JSONB := '{}'::jsonb;
BEGIN
    -- Get session record with user permissions and roles
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
$$;


ALTER FUNCTION auth.validate_session_security(p_session_id character varying, p_client_ip inet, p_user_agent text, p_require_ip_match boolean, p_require_ua_match boolean) OWNER TO domainflow;

--
-- TOC entry 3866 (class 0 OID 0)
-- Dependencies: 299
-- Name: FUNCTION validate_session_security(p_session_id character varying, p_client_ip inet, p_user_agent text, p_require_ip_match boolean, p_require_ua_match boolean); Type: COMMENT; Schema: auth; Owner: domainflow
--

COMMENT ON FUNCTION auth.validate_session_security(p_session_id character varying, p_client_ip inet, p_user_agent text, p_require_ip_match boolean, p_require_ua_match boolean) IS 'Validates session security with optional IP and user agent matching';


--
-- TOC entry 269 (class 1255 OID 74715)
-- Name: generate_user_agent_hash(text); Type: FUNCTION; Schema: public; Owner: domainflow
--

CREATE FUNCTION public.generate_user_agent_hash(user_agent_text text) RETURNS character varying
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    -- Generate SHA-256 hash of user agent for faster comparison
    RETURN encode(digest(user_agent_text, 'sha256'), 'hex');
END;
$$;


ALTER FUNCTION public.generate_user_agent_hash(user_agent_text text) OWNER TO domainflow;

--
-- TOC entry 3867 (class 0 OID 0)
-- Dependencies: 269
-- Name: FUNCTION generate_user_agent_hash(user_agent_text text); Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON FUNCTION public.generate_user_agent_hash(user_agent_text text) IS 'Generates SHA-256 hash of user agent string';


--
-- TOC entry 301 (class 1255 OID 74719)
-- Name: trigger_set_timestamp(); Type: FUNCTION; Schema: public; Owner: domainflow
--

CREATE FUNCTION public.trigger_set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.trigger_set_timestamp() OWNER TO domainflow;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 74421)
-- Name: auth_audit_log; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.auth_audit_log (
    id bigint NOT NULL,
    user_id uuid,
    session_id character varying(128),
    event_type character varying(50) NOT NULL,
    event_status character varying(20) NOT NULL,
    ip_address inet,
    user_agent text,
    session_fingerprint character varying(255),
    security_flags jsonb DEFAULT '{}'::jsonb,
    details jsonb,
    risk_score integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE auth.auth_audit_log OWNER TO domainflow;

--
-- TOC entry 227 (class 1259 OID 74420)
-- Name: auth_audit_log_id_seq; Type: SEQUENCE; Schema: auth; Owner: domainflow
--

CREATE SEQUENCE auth.auth_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.auth_audit_log_id_seq OWNER TO domainflow;

--
-- TOC entry 3868 (class 0 OID 0)
-- Dependencies: 227
-- Name: auth_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: domainflow
--

ALTER SEQUENCE auth.auth_audit_log_id_seq OWNED BY auth.auth_audit_log.id;


--
-- TOC entry 224 (class 1259 OID 74351)
-- Name: permissions; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.permissions (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    display_name character varying(150) NOT NULL,
    description text,
    resource character varying(50) NOT NULL,
    action character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE auth.permissions OWNER TO domainflow;

--
-- TOC entry 230 (class 1259 OID 74443)
-- Name: rate_limits; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.rate_limits (
    id bigint NOT NULL,
    identifier character varying(255) NOT NULL,
    action character varying(50) NOT NULL,
    attempts integer DEFAULT 1,
    window_start timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    blocked_until timestamp without time zone
);


ALTER TABLE auth.rate_limits OWNER TO domainflow;

--
-- TOC entry 229 (class 1259 OID 74442)
-- Name: rate_limits_id_seq; Type: SEQUENCE; Schema: auth; Owner: domainflow
--

CREATE SEQUENCE auth.rate_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE auth.rate_limits_id_seq OWNER TO domainflow;

--
-- TOC entry 3869 (class 0 OID 0)
-- Dependencies: 229
-- Name: rate_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: domainflow
--

ALTER SEQUENCE auth.rate_limits_id_seq OWNED BY auth.rate_limits.id;


--
-- TOC entry 226 (class 1259 OID 74387)
-- Name: role_permissions; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


ALTER TABLE auth.role_permissions OWNER TO domainflow;

--
-- TOC entry 223 (class 1259 OID 74338)
-- Name: roles; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.roles (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    display_name character varying(100) NOT NULL,
    description text,
    is_system_role boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE auth.roles OWNER TO domainflow;

--
-- TOC entry 222 (class 1259 OID 74315)
-- Name: sessions; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.sessions (
    id character varying(128) NOT NULL,
    user_id uuid NOT NULL,
    ip_address inet,
    user_agent text,
    user_agent_hash character varying(64),
    session_fingerprint character varying(255),
    browser_fingerprint text,
    screen_resolution character varying(20),
    is_active boolean DEFAULT true,
    expires_at timestamp without time zone NOT NULL,
    last_activity_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE auth.sessions OWNER TO domainflow;

--
-- TOC entry 3870 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN sessions.user_agent_hash; Type: COMMENT; Schema: auth; Owner: domainflow
--

COMMENT ON COLUMN auth.sessions.user_agent_hash IS 'SHA-256 hash of user agent for fast comparison';


--
-- TOC entry 3871 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN sessions.session_fingerprint; Type: COMMENT; Schema: auth; Owner: domainflow
--

COMMENT ON COLUMN auth.sessions.session_fingerprint IS 'SHA-256 hash of IP address, user agent, and screen resolution for session security';


--
-- TOC entry 3872 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN sessions.browser_fingerprint; Type: COMMENT; Schema: auth; Owner: domainflow
--

COMMENT ON COLUMN auth.sessions.browser_fingerprint IS 'SHA-256 hash of user agent and screen resolution for browser identification';


--
-- TOC entry 3873 (class 0 OID 0)
-- Dependencies: 222
-- Name: COLUMN sessions.screen_resolution; Type: COMMENT; Schema: auth; Owner: domainflow
--

COMMENT ON COLUMN auth.sessions.screen_resolution IS 'Screen resolution for enhanced browser fingerprinting';


--
-- TOC entry 225 (class 1259 OID 74364)
-- Name: user_roles; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone
);


ALTER TABLE auth.user_roles OWNER TO domainflow;

--
-- TOC entry 221 (class 1259 OID 74296)
-- Name: users; Type: TABLE; Schema: auth; Owner: domainflow
--

CREATE TABLE auth.users (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    email_verified boolean DEFAULT false,
    email_verification_token character varying(255),
    email_verification_expires_at timestamp without time zone,
    password_hash character varying(255) NOT NULL,
    password_pepper_version integer DEFAULT 1,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    avatar_url text,
    is_active boolean DEFAULT true,
    is_locked boolean DEFAULT false,
    failed_login_attempts integer DEFAULT 0,
    locked_until timestamp without time zone,
    last_login_at timestamp without time zone,
    last_login_ip inet,
    password_changed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    must_change_password boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE auth.users OWNER TO domainflow;

--
-- TOC entry 242 (class 1259 OID 74679)
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    user_id text,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    details jsonb,
    client_ip text,
    user_agent text
);


ALTER TABLE public.audit_logs OWNER TO domainflow;

--
-- TOC entry 3874 (class 0 OID 0)
-- Dependencies: 242
-- Name: COLUMN audit_logs.action; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.audit_logs.action IS 'e.g., CampaignCreated, PersonaUpdated, ProxyTested';


--
-- TOC entry 3875 (class 0 OID 0)
-- Dependencies: 242
-- Name: COLUMN audit_logs.entity_type; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.audit_logs.entity_type IS 'e.g., Campaign, Persona, Proxy';


--
-- TOC entry 243 (class 1259 OID 74691)
-- Name: campaign_jobs; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.campaign_jobs (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    job_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    last_attempted_at timestamp with time zone,
    last_error text,
    processing_server_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    job_payload jsonb,
    next_execution_at timestamp with time zone,
    locked_at timestamp with time zone,
    locked_by text,
    CONSTRAINT campaign_jobs_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT campaign_jobs_max_attempts_check CHECK ((max_attempts > 0))
);


ALTER TABLE public.campaign_jobs OWNER TO domainflow;

--
-- TOC entry 3876 (class 0 OID 0)
-- Dependencies: 243
-- Name: COLUMN campaign_jobs.job_type; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.campaign_jobs.job_type IS 'e.g., DomainGeneration, DNSValidation, HTTPKeywordScan (matches campaign_type usually)';


--
-- TOC entry 3877 (class 0 OID 0)
-- Dependencies: 243
-- Name: COLUMN campaign_jobs.status; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.campaign_jobs.status IS 'e.g., Pending, Queued, Running, Completed, Failed, Retry';


--
-- TOC entry 231 (class 1259 OID 74455)
-- Name: campaigns; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name text NOT NULL,
    campaign_type text DEFAULT 'domain_generation'::text NOT NULL,
    status text NOT NULL,
    user_id text,
    total_items bigint DEFAULT 0,
    processed_items bigint DEFAULT 0,
    successful_items bigint DEFAULT 0,
    failed_items bigint DEFAULT 0,
    progress_percentage double precision DEFAULT 0.0,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    CONSTRAINT campaigns_campaign_type_check CHECK ((campaign_type = ANY (ARRAY['domain_generation'::text, 'dns_validation'::text, 'http_keyword_validation'::text])))
);


ALTER TABLE public.campaigns OWNER TO domainflow;

--
-- TOC entry 3878 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN campaigns.campaign_type; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.campaigns.campaign_type IS 'e.g., DomainGeneration, DNSValidation, HTTPKeywordScan';


--
-- TOC entry 3879 (class 0 OID 0)
-- Dependencies: 231
-- Name: COLUMN campaigns.status; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.campaigns.status IS 'e.g., Pending, Queued, Running, Paused, Completed, Failed, Archived';


--
-- TOC entry 237 (class 1259 OID 74548)
-- Name: dns_validation_params; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.dns_validation_params (
    campaign_id uuid NOT NULL,
    source_generation_campaign_id uuid,
    persona_ids uuid[] NOT NULL,
    rotation_interval_seconds integer DEFAULT 0,
    processing_speed_per_minute integer DEFAULT 0,
    batch_size integer DEFAULT 50,
    retry_attempts integer DEFAULT 1,
    metadata jsonb,
    CONSTRAINT dns_validation_params_batch_size_check CHECK ((batch_size > 0)),
    CONSTRAINT dns_validation_params_retry_attempts_check CHECK ((retry_attempts >= 0))
);


ALTER TABLE public.dns_validation_params OWNER TO domainflow;

--
-- TOC entry 238 (class 1259 OID 74571)
-- Name: dns_validation_results; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.dns_validation_results (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    dns_campaign_id uuid NOT NULL,
    generated_domain_id uuid,
    domain_name text NOT NULL,
    validation_status text NOT NULL,
    dns_records jsonb,
    validated_by_persona_id uuid,
    attempts integer DEFAULT 0,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dns_validation_results_attempts_check CHECK ((attempts >= 0))
);


ALTER TABLE public.dns_validation_results OWNER TO domainflow;

--
-- TOC entry 3880 (class 0 OID 0)
-- Dependencies: 238
-- Name: COLUMN dns_validation_results.validation_status; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.dns_validation_results.validation_status IS 'e.g., Resolved, Unresolved, Error, Pending, Skipped';


--
-- TOC entry 232 (class 1259 OID 74476)
-- Name: domain_generation_campaign_params; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.domain_generation_campaign_params (
    campaign_id uuid NOT NULL,
    pattern_type text NOT NULL,
    variable_length integer,
    character_set text,
    constant_string text,
    tld text NOT NULL,
    num_domains_to_generate integer NOT NULL,
    total_possible_combinations bigint NOT NULL,
    current_offset bigint DEFAULT 0 NOT NULL
);


ALTER TABLE public.domain_generation_campaign_params OWNER TO domainflow;

--
-- TOC entry 234 (class 1259 OID 74510)
-- Name: domain_generation_config_states; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.domain_generation_config_states (
    config_hash text NOT NULL,
    last_offset bigint NOT NULL,
    config_details jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.domain_generation_config_states OWNER TO domainflow;

--
-- TOC entry 233 (class 1259 OID 74489)
-- Name: generated_domains; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.generated_domains (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    domain_generation_campaign_id uuid NOT NULL,
    domain_name text NOT NULL,
    source_keyword text,
    source_pattern text,
    tld text,
    offset_index bigint DEFAULT 0 NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.generated_domains OWNER TO domainflow;

--
-- TOC entry 239 (class 1259 OID 74602)
-- Name: http_keyword_campaign_params; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.http_keyword_campaign_params (
    campaign_id uuid NOT NULL,
    source_campaign_id uuid NOT NULL,
    source_type text NOT NULL,
    persona_ids uuid[] NOT NULL,
    keyword_set_ids uuid[],
    ad_hoc_keywords text[],
    proxy_ids uuid[],
    proxy_pool_id uuid,
    proxy_selection_strategy text,
    rotation_interval_seconds integer DEFAULT 0,
    processing_speed_per_minute integer DEFAULT 0,
    batch_size integer DEFAULT 10,
    retry_attempts integer DEFAULT 1,
    target_http_ports integer[],
    last_processed_domain_name text,
    metadata jsonb,
    CONSTRAINT http_keyword_campaign_params_batch_size_check CHECK ((batch_size > 0)),
    CONSTRAINT http_keyword_campaign_params_retry_attempts_check CHECK ((retry_attempts >= 0)),
    CONSTRAINT http_keyword_campaign_params_source_type_check CHECK ((source_type = ANY (ARRAY['DomainGeneration'::text, 'DNSValidation'::text])))
);


ALTER TABLE public.http_keyword_campaign_params OWNER TO domainflow;

--
-- TOC entry 3881 (class 0 OID 0)
-- Dependencies: 239
-- Name: COLUMN http_keyword_campaign_params.source_type; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.http_keyword_campaign_params.source_type IS 'DomainGeneration or DNSValidation to indicate which type source_campaign_id refers to';


--
-- TOC entry 241 (class 1259 OID 74643)
-- Name: http_keyword_results; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.http_keyword_results (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    http_keyword_campaign_id uuid NOT NULL,
    dns_result_id uuid,
    domain_name text NOT NULL,
    validation_status text NOT NULL,
    http_status_code integer,
    response_headers jsonb,
    page_title text,
    extracted_content_snippet text,
    found_keywords_from_sets jsonb,
    found_ad_hoc_keywords jsonb,
    content_hash text,
    validated_by_persona_id uuid,
    used_proxy_id uuid,
    attempts integer DEFAULT 0,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.http_keyword_results OWNER TO domainflow;

--
-- TOC entry 3882 (class 0 OID 0)
-- Dependencies: 241
-- Name: COLUMN http_keyword_results.validation_status; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.http_keyword_results.validation_status IS 'e.g., Success, ContentMismatch, KeywordsNotFound, Unreachable, AccessDenied, ProxyError, DNSError, Timeout, Error, Pending, Skipped';


--
-- TOC entry 236 (class 1259 OID 74534)
-- Name: keyword_sets; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.keyword_sets (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    keywords jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.keyword_sets OWNER TO domainflow;

--
-- TOC entry 3883 (class 0 OID 0)
-- Dependencies: 236
-- Name: COLUMN keyword_sets.keywords; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.keyword_sets.keywords IS 'Array of KeywordRule objects: [{"pattern": "findme", "ruleType": "string", ...}]';


--
-- TOC entry 235 (class 1259 OID 74518)
-- Name: personas; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.personas (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    persona_type text NOT NULL,
    config_details jsonb NOT NULL,
    is_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT personas_persona_type_check CHECK ((persona_type = ANY (ARRAY['dns'::text, 'http'::text])))
);


ALTER TABLE public.personas OWNER TO domainflow;

--
-- TOC entry 3884 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN personas.persona_type; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.personas.persona_type IS 'DNS or HTTP';


--
-- TOC entry 3885 (class 0 OID 0)
-- Dependencies: 235
-- Name: COLUMN personas.config_details; Type: COMMENT; Schema: public; Owner: domainflow
--

COMMENT ON COLUMN public.personas.config_details IS 'Stores DNSValidatorConfigJSON or HTTPValidatorConfigJSON';


--
-- TOC entry 240 (class 1259 OID 74626)
-- Name: proxies; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.proxies (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    address text NOT NULL,
    protocol text,
    username text,
    password_hash text,
    host text,
    port integer,
    is_enabled boolean DEFAULT true NOT NULL,
    is_healthy boolean DEFAULT true NOT NULL,
    last_status text,
    last_checked_at timestamp with time zone,
    latency_ms integer,
    city text,
    country_code text,
    provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.proxies OWNER TO domainflow;

--
-- TOC entry 244 (class 1259 OID 74728)
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    dirty boolean NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO domainflow;

--
-- TOC entry 245 (class 1259 OID 74733)
-- Name: schema_version_info; Type: TABLE; Schema: public; Owner: domainflow
--

CREATE TABLE public.schema_version_info (
    version_number integer NOT NULL,
    version_name text NOT NULL,
    consolidation_completed boolean DEFAULT false,
    baseline_date timestamp without time zone DEFAULT now(),
    performance_improvement_percentage numeric DEFAULT 0
);


ALTER TABLE public.schema_version_info OWNER TO domainflow;

--
-- TOC entry 3472 (class 2604 OID 74424)
-- Name: auth_audit_log id; Type: DEFAULT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.auth_audit_log ALTER COLUMN id SET DEFAULT nextval('auth.auth_audit_log_id_seq'::regclass);


--
-- TOC entry 3476 (class 2604 OID 74446)
-- Name: rate_limits id; Type: DEFAULT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.rate_limits ALTER COLUMN id SET DEFAULT nextval('auth.rate_limits_id_seq'::regclass);


--
-- TOC entry 3837 (class 0 OID 74421)
-- Dependencies: 228
-- Data for Name: auth_audit_log; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (1, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T16:39:36Z"}', 1, '2025-06-16 16:39:36.456213');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (2, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T16:41:51Z"}', 1, '2025-06-16 16:41:51.088367');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (3, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T16:42:03Z"}', 1, '2025-06-16 16:42:03.21391');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (4, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T16:49:18Z"}', 1, '2025-06-16 16:49:18.580892');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (5, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T16:52:38Z"}', 1, '2025-06-16 16:52:38.037445');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (6, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T16:58:35Z"}', 1, '2025-06-16 16:58:35.94675');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (7, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T17:08:05Z"}', 1, '2025-06-16 17:08:05.201525');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (8, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T17:46:44Z"}', 1, '2025-06-16 17:46:44.815944');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (9, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T17:47:08Z"}', 1, '2025-06-16 17:47:08.580497');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (10, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T17:51:19Z"}', 1, '2025-06-16 17:51:19.924157');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (11, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T17:57:43Z"}', 1, '2025-06-16 17:57:43.556105');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (12, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T17:59:37Z"}', 1, '2025-06-16 17:59:37.310955');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (13, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:06:33Z"}', 1, '2025-06-16 18:06:33.137399');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (14, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:07:26Z"}', 1, '2025-06-16 18:07:26.208047');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (15, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:12:30Z"}', 1, '2025-06-16 18:12:30.412522');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (16, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:20:58Z"}', 1, '2025-06-16 18:20:58.668091');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (17, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:21:11Z"}', 1, '2025-06-16 18:21:11.432777');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (18, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:25:03Z"}', 1, '2025-06-16 18:25:03.522699');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (19, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:32:53Z"}', 1, '2025-06-16 18:32:53.891038');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (20, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:36:54Z"}', 1, '2025-06-16 18:36:54.689309');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (21, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T18:43:39Z"}', 1, '2025-06-16 18:43:39.461884');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (22, NULL, NULL, 'login', 'failure', '::1', NULL, NULL, '{}', '{"reason": "user not found", "timestamp": "2025-06-16T20:47:33Z"}', 3, '2025-06-16 20:47:33.484474');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (23, NULL, NULL, 'login', 'failure', '::1', NULL, NULL, '{}', '{"reason": "user not found", "timestamp": "2025-06-16T20:48:48Z"}', 3, '2025-06-16 20:48:48.417688');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (24, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T20:49:44Z"}', 1, '2025-06-16 20:49:44.884334');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (25, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '127.0.0.1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T21:33:47Z"}', 1, '2025-06-16 21:33:47.172079');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (26, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'failure', '::1', NULL, NULL, '{}', '{"reason": "invalid password", "timestamp": "2025-06-16T21:46:03Z"}', 3, '2025-06-16 21:46:03.476473');
INSERT INTO auth.auth_audit_log (id, user_id, session_id, event_type, event_status, ip_address, user_agent, session_fingerprint, security_flags, details, risk_score, created_at) VALUES (27, '00000000-0000-0000-0000-000000000001', NULL, 'login', 'success', '::1', NULL, NULL, '{}', '{"timestamp": "2025-06-16T21:47:15Z"}', 1, '2025-06-16 21:47:15.43226');


--
-- TOC entry 3833 (class 0 OID 74351)
-- Dependencies: 224
-- Data for Name: permissions; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('50be04fd-60f4-46f0-acdb-3f90b500bc58', 'campaigns:create', 'Create Campaigns', 'Permission to create new campaigns', 'campaigns', 'create', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('dffe32c0-b20e-4212-9bab-8347fe900464', 'campaigns:read', 'Read Campaigns', 'Permission to view campaigns', 'campaigns', 'read', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('5a775305-c5e0-44e1-82f2-170237389110', 'campaigns:update', 'Update Campaigns', 'Permission to modify campaigns', 'campaigns', 'update', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('13b85224-619e-49f0-83de-a90e8c544b31', 'campaigns:delete', 'Delete Campaigns', 'Permission to delete campaigns', 'campaigns', 'delete', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('fe5979fe-0c9f-4cc9-9456-43f7b9967b0c', 'campaigns:execute', 'Execute Campaigns', 'Permission to start/stop campaigns', 'campaigns', 'execute', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('05bfb9e2-7fc4-4c3d-98cc-a2bf93efcf3e', 'personas:create', 'Create Personas', 'Permission to create personas', 'personas', 'create', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('15381dab-d4e7-4cd4-a762-39a059829736', 'personas:read', 'Read Personas', 'Permission to view personas', 'personas', 'read', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('27541fc6-db3f-4a22-bf2f-579716e78610', 'personas:update', 'Update Personas', 'Permission to modify personas', 'personas', 'update', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('613d4ca6-b9cf-4140-9282-1bd27dab449f', 'personas:delete', 'Delete Personas', 'Permission to delete personas', 'personas', 'delete', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('c89818e0-a1df-464f-ac66-7d00dab62cc6', 'proxies:create', 'Create Proxies', 'Permission to create proxies', 'proxies', 'create', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('0feac4ef-b8ef-458d-a7d0-846513f3e79c', 'proxies:read', 'Read Proxies', 'Permission to view proxies', 'proxies', 'read', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('3ed049a8-734e-4238-828b-2ee35840d970', 'proxies:update', 'Update Proxies', 'Permission to modify proxies', 'proxies', 'update', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('55394351-e82f-40e8-b248-4ba7cf7bb0a6', 'proxies:delete', 'Delete Proxies', 'Permission to delete proxies', 'proxies', 'delete', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('2ae6ed1f-5a22-4702-8494-4fe9a0c866ee', 'system:admin', 'System Administration', 'Full system administration access', 'system', 'admin', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('f4ff9b00-a043-47dc-882d-782e0bffe57f', 'system:config', 'System Configuration', 'Permission to modify system configuration', 'system', 'config', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('46ae7e8b-b83a-4bb5-bd02-1b48505c0116', 'system:users', 'User Management', 'Permission to manage users', 'system', 'users', '2025-06-16 10:44:37.86295');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES ('69ec1b68-ac9a-44a4-bacb-64cf89f8b55a', 'system:audit', 'Audit Access', 'Permission to view audit logs', 'system', 'audit', '2025-06-16 10:44:37.86295');


--
-- TOC entry 3839 (class 0 OID 74443)
-- Dependencies: 230
-- Data for Name: rate_limits; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.rate_limits (id, identifier, action, attempts, window_start, blocked_until) VALUES (1, '::1', 'login', 0, '2025-06-16 14:17:38.85738', NULL);


--
-- TOC entry 3835 (class 0 OID 74387)
-- Dependencies: 226
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '50be04fd-60f4-46f0-acdb-3f90b500bc58');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', 'dffe32c0-b20e-4212-9bab-8347fe900464');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '5a775305-c5e0-44e1-82f2-170237389110');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '13b85224-619e-49f0-83de-a90e8c544b31');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', 'fe5979fe-0c9f-4cc9-9456-43f7b9967b0c');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '05bfb9e2-7fc4-4c3d-98cc-a2bf93efcf3e');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '15381dab-d4e7-4cd4-a762-39a059829736');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '27541fc6-db3f-4a22-bf2f-579716e78610');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '613d4ca6-b9cf-4140-9282-1bd27dab449f');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', 'c89818e0-a1df-464f-ac66-7d00dab62cc6');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '0feac4ef-b8ef-458d-a7d0-846513f3e79c');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '3ed049a8-734e-4238-828b-2ee35840d970');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '55394351-e82f-40e8-b248-4ba7cf7bb0a6');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '2ae6ed1f-5a22-4702-8494-4fe9a0c866ee');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', 'f4ff9b00-a043-47dc-882d-782e0bffe57f');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '46ae7e8b-b83a-4bb5-bd02-1b48505c0116');
INSERT INTO auth.role_permissions (role_id, permission_id) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', '69ec1b68-ac9a-44a4-bacb-64cf89f8b55a');


--
-- TOC entry 3832 (class 0 OID 74338)
-- Dependencies: 223
-- Data for Name: roles; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.roles (id, name, display_name, description, is_system_role, created_at, updated_at) VALUES ('2c96b871-0879-44c5-9ce2-78fe786ba23d', 'super_admin', 'Super Administrator', 'System super administrator with full access', true, '2025-06-16 10:32:26.412644', '2025-06-16 10:32:26.412644');
INSERT INTO auth.roles (id, name, display_name, description, is_system_role, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000002', 'admin', 'Administrator', 'Administrative access to most system features', true, '2025-06-16 11:36:48.598617', '2025-06-16 11:36:48.598617');
INSERT INTO auth.roles (id, name, display_name, description, is_system_role, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000003', 'user', 'Standard User', 'Standard user with basic access permissions', true, '2025-06-16 11:36:48.598617', '2025-06-16 11:36:48.598617');
INSERT INTO auth.roles (id, name, display_name, description, is_system_role, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000004', 'viewer', 'Viewer', 'Read-only access to system resources', true, '2025-06-16 11:36:48.598617', '2025-06-16 11:36:48.598617');


--
-- TOC entry 3831 (class 0 OID 74315)
-- Dependencies: 222
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('497c8cd327d74f7ec1abed8fb753eaffb117a0c459d66e28d910b7ef993ad5edcf69f267eba524cdc6f5e3c1ae1c7c12200aa59e9b234fc94fbb323feb08b205', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, true, '2025-06-16 23:47:15.423429', '2025-06-16 21:47:15.423428', '2025-06-16 21:47:15.423428');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('1344619bd1cca6de6a80431938512407589cd8cdbcc4a752653eac7cdd8c8b8298bd6092acdcb1f6843060040ec40f95a48ec9493732fc39042d1062d6c34cf6', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 16:21:46.052606', '2025-06-16 14:28:36.146876', '2025-06-16 14:21:46.052606');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('6f55c79796214f135632700fecf44c371285d3d813c81c0a68cc3407934b6bbbf01fe2dba41259da1bb1ca63f75388b264ab55865d874e47a14f17747137baad', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 13:13:40.4109', '2025-06-16 11:13:40.4109', '2025-06-16 11:13:40.4109');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('1c043c82b358605cfb04be2067472bd4e3a6d961d832b1fec700cfe269fc02666b57ec0fafe4ccdc11a9db50c5e03e6a2c72c082fec717ecf2458b0a6ac9b592', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 13:20:59.129601', '2025-06-16 11:20:59.129601', '2025-06-16 11:20:59.129601');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('831ca0b3568c324ec940faf5ee089b2434fd509d511b5a7edc3d8b70d9e1838b0523a1eb2a32b066f18dba3734f22ebdaaf77cfe2bea4ad8245a1fa2f831d920', '00000000-0000-0000-0000-000000000002', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 13:40:46.037303', '2025-06-16 11:40:46.037303', '2025-06-16 11:40:46.037303');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('bf26039497c1166ee527c5050448357fc5ea1af16a518a524b9f6a93b84225dfff111aa9c8ee47101cec280d09a8892ed1aee4e7b2f098f2afc0c00a22bb12fe', '00000000-0000-0000-0000-000000000002', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 13:42:27.3653', '2025-06-16 11:42:27.3653', '2025-06-16 11:42:27.3653');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('f8fc9b1f66575d2f2772ef3d42d8f54ce0ba924cb19e3b12777f31d1d0a534b3720d56ea8dd64bac648e647c9b48121a7fc61e5489b956a187396b86858d87d6', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 19:08:05.078349', '2025-06-16 17:09:22.98131', '2025-06-16 17:08:05.078349');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('3418c07fa552cd1dbd95ba3a0364a47cb57b832c6bce6481b0ff486a29829b49de87d313aeb2e53c7a44e8b1e86633cdd4a983aadd7be4db2ea1d9aec75a6f27', '00000000-0000-0000-0000-000000000002', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 14:15:37.191645', '2025-06-16 12:15:37.191645', '2025-06-16 12:15:37.191645');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('c0d1756b105865f54a1e81bfa8a8069f62921c9e02b0e422121a76420b9f16876ddbceeac503c4145da4d2b3c24751ab46935fb00a8af31d9abf1467b07c7032', '00000000-0000-0000-0000-000000000002', '::1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'c2110c1484d9e6eb869097bbab546efcbd369ddd292ebbeeff3dc8e6c92e134a', 'db78339cb355c93b3da10ed9df5b1ebb4c71f47c367deb4cea87cf5f7742c92b', '30ed33a233b3d0f5e59d42a977a396ae0f4d051c621aec349543da4bdada9b73', NULL, false, '2025-06-16 14:17:10.963846', '2025-06-16 12:17:10.963846', '2025-06-16 12:17:10.963846');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('45ede4c4aa36a6ca4b05c1bbc1c42a659cec9ed275a9287d8553ffae18061c34e77a6fb891a93477bd68c072b25b04e50aad691ebe1f18d82b880ce3290650ff', '00000000-0000-0000-0000-000000000002', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 14:19:20.893597', '2025-06-16 12:19:20.893597', '2025-06-16 12:19:20.893596');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('5114c2a01fbb4e8d26bba96d39b6638cc293e83815f6544c2a596df899d39b154a84e46923a5fc9ec8ca6153fffdec5deba3d8d8712d35002adf5192468ceb50', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 14:23:12.594495', '2025-06-16 12:23:12.594495', '2025-06-16 12:23:12.594495');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('1127bb100fffd95411cfaa2c14663127752a0079c7cd02b6605932fc582ff1bb5ba8dd05a3a7961c3db123e311dfd8894511e43d11db4f401d7372baae48c4b4', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 14:35:33.754259', '2025-06-16 12:35:33.754259', '2025-06-16 12:35:33.754259');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('f4983f091a9b729f11150b8ea5dec25b0c0825168414d2145d6e32dbf4b7c1f400ecd315d54e6b4f5d37679812b4c0f3a651011904ae7a7f207578438ca9af6f', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 14:42:59.495158', '2025-06-16 12:42:59.495158', '2025-06-16 12:42:59.495158');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('91da8317bf73e2037c4e9bc006d2bb49dd5dd0f9e42b7ae2c7d997b94635a2a7d25d60c9adfa6f9c4541486a7d4105b86de94cf8dec0601ba1ac81efc5300844', '00000000-0000-0000-0000-000000000002', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 14:43:53.927326', '2025-06-16 12:43:53.927326', '2025-06-16 12:43:53.927326');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('5cfd0c8b9451fdddbb14914c1232c7d4ddd3300566580dc3efe9450c7f549e357a02af8b6f3b898df32a0ae86bbbd72200dd5537d09e9b35be697fbe20e3ba7c', '00000000-0000-0000-0000-000000000002', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 14:49:27.814451', '2025-06-16 12:49:27.814451', '2025-06-16 12:49:27.814451');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('ebe33b406568f41bdad3b309921761467b86288a43ccb595942909ecdac63f25992898d2860c9d56a1d4637de40565a7d193c8293097851e75e4944467093b48', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 15:03:26.509771', '2025-06-16 13:03:26.509771', '2025-06-16 13:03:26.509771');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('0b01bfe411d0ea20143a53da13070bb7dabbf5ea5e783cc041bd3786e9d0eef21f764af739fb40a123ecafea3579a86a1b951841745660716aa8257fb86523dc', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 15:10:39.416661', '2025-06-16 13:10:39.416661', '2025-06-16 13:10:39.416661');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('a4d44cc63116eb249a23f928836d411784bcffd8ace15a10cbdba18ff342cb006757fd6a0a353ddb24e3b94b043ecb8ca51085b2d10bc55f690baa78cf6e8131', '00000000-0000-0000-0000-000000000002', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 14:45:24.644796', '2025-06-16 12:45:24.644796', '2025-06-16 12:45:24.644796');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('b86d48d5b9a4837167c8460871281a10edac5327f6308e05a90705389c6af14bf11800a497e89207af862bb494385e031d9848a5f32b12d9ecafa19aa92b333b', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 15:44:13.378547', '2025-06-16 14:10:34.754524', '2025-06-16 13:44:13.378547');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('63f4df2730590a2ade0bec83ecc7754319d3ae9cabd56ca979c81d936e10624a4caa6c1ca3d79c696520b7d275dc0e67f9a7376eeca8ef8570a3e398a5d7b04c', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 20:32:53.847237', '2025-06-16 18:32:53.847237', '2025-06-16 18:32:53.847237');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('d0ad2c0492f89ba570b7ff84ed95d6fd6c7f6f6c950c40cfb7962528bdc415eb6c754eae4b0eae5cae814ca01806a0460727b18c733abd94300bf36990d83d44', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 20:25:03.513937', '2025-06-16 18:43:24.482281', '2025-06-16 18:25:03.513937');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('f687918eb70b57e51a4463cb8e54bdec607e273ec0b34878534d23581a5430c08ce2b46b44da7d2dfe2d012b6220f4aaba84c12b9f816e19d5e1fccd6fd5d486', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 22:49:44.829919', '2025-06-16 20:49:52.349043', '2025-06-16 20:49:44.829919');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('6061a33de280fc246cfb5666eaa29ea17e914efcffbce4a6c014f2dd27faf126c2df25efc0b328359e341c9ede011184a337d340aaa09a815c84c6848b6afe09', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 19:46:44.759862', '2025-06-16 17:46:44.759862', '2025-06-16 17:46:44.759862');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('730e2ae216a39fbc1a0595c22185a5d0f426db553e9df1417262749f8df185fa216f23b3fcb211549895836ba856df3bcf64449ca48d644520415edc6b21465e', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 15:21:58.018744', '2025-06-16 13:21:58.018744', '2025-06-16 13:21:58.018744');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('bcb4a004b399427869dcb0fd66beeed61ee50e73001e4097a8b32a06ed7434d949c348d4e15006905a35d2ba4f56d9f93e947746e99aad276abb9b36371ff135', '00000000-0000-0000-0000-000000000001', '::1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'c2110c1484d9e6eb869097bbab546efcbd369ddd292ebbeeff3dc8e6c92e134a', 'db78339cb355c93b3da10ed9df5b1ebb4c71f47c367deb4cea87cf5f7742c92b', '30ed33a233b3d0f5e59d42a977a396ae0f4d051c621aec349543da4bdada9b73', NULL, false, '2025-06-16 15:24:40.17223', '2025-06-16 13:24:40.17223', '2025-06-16 13:24:40.17223');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('a19045bf4eaa35247f6f62aae12499be242c9f3cb077485d775b38e65e37f0b3bab455851d5fd943ea0a7b67b713325db351ab349364f9438d7a92040a01e8b2', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 19:51:19.888575', '2025-06-16 17:57:32.723805', '2025-06-16 17:51:19.888575');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('f98ef31776506df23b8ef8e06c9f03a302a8f898a9351096967b1a2aed901a55a8c500295c5c45f072f58cb6fd032a45d12df1f3738014c71c47e0c773fb9d73', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 20:07:26.155738', '2025-06-16 18:07:26.155738', '2025-06-16 18:07:26.155738');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('f4efd9f31b9e01e3cd7856f8f52f7f1c3e9ee105794ea013b2b1016467ffe891273d48f54f9334d9acde1fbd0b61977e7d43e4cc8e28f393b75050a0d78c33e2', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 20:06:33.123852', '2025-06-16 18:20:41.34637', '2025-06-16 18:06:33.123852');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('89bcdc1e926b2e1ac42a9222eb973a0b732a6e4414e3d1a673226ab9dfc74f7c6a088d7fe03477b393797807ef4d4fe6406b2e09372ff4bf97f61032c131d87a', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 19:59:37.300153', '2025-06-16 17:59:52.769328', '2025-06-16 17:59:37.300153');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('551672e1ea51ece58bb9ba84a32e0778029f64a4fa4aa73ad81df1434a95d85627867413a1a6174e7f65fb4708f8423f2e135cc8bda2dd110fb98921b31f370a', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 15:28:36.944726', '2025-06-16 13:28:36.944726', '2025-06-16 13:28:36.944726');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('8e2fead9d414a881f728df530715e60b29d6430c464a27115cbb4d0c71c75cc45e084f2c2368f0441546bb8bf2dfb395563f43c236e0361869cdd0d676cdec50', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 15:29:48.461209', '2025-06-16 13:29:48.461209', '2025-06-16 13:29:48.461209');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('55f9df035578100560c30b877483eeb652efac8371bc316757eca999ec498fce2b485e1de4b6308f6c0e92ff802e1389b207e814fdda68a7126b18bd161bbefc', '00000000-0000-0000-0000-000000000001', '::1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 'c2110c1484d9e6eb869097bbab546efcbd369ddd292ebbeeff3dc8e6c92e134a', 'db78339cb355c93b3da10ed9df5b1ebb4c71f47c367deb4cea87cf5f7742c92b', '30ed33a233b3d0f5e59d42a977a396ae0f4d051c621aec349543da4bdada9b73', NULL, false, '2025-06-16 16:17:39.479423', '2025-06-16 14:28:41.782626', '2025-06-16 14:17:39.479423');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('8040b99f0a592629b762169b9de364eedc02d783a9890704124a49ebe937f829bb2850ee4ec44a23c46528d9ba86cf250c7b0fc9e567760bab963e89c200b877', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 16:10:48.713134', '2025-06-16 14:21:30.850683', '2025-06-16 14:10:48.713134');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('c241f7113a1ca493ec2a96d6f3d0339de2f5ee640918cf7bdbed5672fc97efaf2cdb0c9f59a0129311f2ee876845b7e62ae97ad58af44af9ba032fae4ec16aca', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 20:20:58.634514', '2025-06-16 18:20:59.400222', '2025-06-16 18:20:58.634514');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('0f01ef59d71d3ef85c076e7a9c87e0fb9b8d0589eebdea618b0454466d9c007f20a64330f257166d93f974586437cf13da157d2bf28a2c798cb33aeeb95edb75', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 20:12:30.357561', '2025-06-16 18:32:13.652495', '2025-06-16 18:12:30.357561');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('d877a0fb5f0d8cc4394ab35267d92956e6f4c21895bedd9ddadbed1d02a5f71c08139027856ff4840c941eaceb65cb29ff9461572195950b0a414555dfe55e7f', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 20:36:54.652941', '2025-06-16 18:37:06.514077', '2025-06-16 18:36:54.652941');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('0121ebe0ce03bf5fd35b90c8cd0d27117a1406e91d6d43b68f76034ef99cf24cd3e4bfc3629e89e70c9ed649816e33d3d9c631afad2c2f03e7e5e30e67df9ebc', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 20:43:39.452441', '2025-06-16 18:48:02.181079', '2025-06-16 18:43:39.452441');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('d779f79797fe7578a09d18009624bab0931831e511621b4d2701facc86121319ecac58424b4f3d1239310ef20b21ee47ae22503a2057d79eda9771561863f0fa', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 20:21:11.426607', '2025-06-16 18:24:55.568376', '2025-06-16 18:21:11.426607');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('0b1621dea831f46d0c6dbbe57ce477c85203397deeedc4fe9647b53fbbeb61f69f68e4d10d73b4bef5049521663b221c2830138207386b59869091b87f4eaf26', '00000000-0000-0000-0000-000000000001', '::1', 'curl/8.12.1', '6244b0b0f8bc783ee513d6e0f7de72eb0824fc62071ea908a925772caffdee3f', '3db99287df9af8089aa93c0ffaa0740c4394c80ea0d353b2d778ad02477ff814', '47423b4e7cac9ff4da16b3447963343d3f8e4ae00b0f385ed73ea109c1608e97', NULL, false, '2025-06-16 19:47:08.560341', '2025-06-16 17:47:47.97029', '2025-06-16 17:47:08.56034');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('466006f43144f3dbf0a9746a14efa25683488fa85d427b5b951224a9f84d5e6e919cbc71dcfc7d4bf1f2ad2ae46cf7679fcc9783d2b6622e0360836588ec2f0b', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 19:57:43.548638', '2025-06-16 17:59:30.15721', '2025-06-16 17:57:43.548638');
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, user_agent_hash, session_fingerprint, browser_fingerprint, screen_resolution, is_active, expires_at, last_activity_at, created_at) VALUES ('87ff6d30de3a354126b420093b421d87bba8b64976862ffabec6490d2d68d2316d97245bf4e132b5fa33992019b0d9eac71d6fbf5796a2a4051e546761aeb338', '00000000-0000-0000-0000-000000000001', '127.0.0.1', 'Mozilla/5.0 (X11; Linux x86_64; rv:139.0) Gecko/20100101 Firefox/139.0', '355df2cde389cda2575e8b08779ebb40f69d4643e4695ca41e0611496a542e54', '4aa4d02b2a664cee060801915e0aa1038ab5ef947631db2d1b27a3b53b9fcc9f', '01e30c1f6714c9ad853daf8f5a2ae56f067d6748e3fad1488a22008d343cc45a', NULL, false, '2025-06-16 23:33:47.157105', '2025-06-16 21:36:30.607476', '2025-06-16 21:33:47.157105');


--
-- TOC entry 3834 (class 0 OID 74364)
-- Dependencies: 225
-- Data for Name: user_roles; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.user_roles (user_id, role_id, assigned_by, assigned_at, expires_at) VALUES ('00000000-0000-0000-0000-000000000001', '2c96b871-0879-44c5-9ce2-78fe786ba23d', NULL, '2025-06-16 10:39:57.112865', NULL);
INSERT INTO auth.user_roles (user_id, role_id, assigned_by, assigned_at, expires_at) VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '2025-06-16 11:37:06.6737', NULL);


--
-- TOC entry 3830 (class 0 OID 74296)
-- Dependencies: 221
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: domainflow
--

INSERT INTO auth.users (id, email, email_verified, email_verification_token, email_verification_expires_at, password_hash, password_pepper_version, first_name, last_name, avatar_url, is_active, is_locked, failed_login_attempts, locked_until, last_login_at, last_login_ip, password_changed_at, must_change_password, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000002', 'dbadmin@domainflow.local', true, NULL, NULL, '$2a$12$jrxW9zEbrM73JlDsh0gyveyQcei8BDfeZADuDimXYM62lf/pWRJXi', 1, 'Database', 'Administrator', NULL, true, false, 0, NULL, '2025-06-16 12:49:27.799319', '127.0.0.1', '2025-06-16 11:34:22.675438', false, '2025-06-16 11:34:22.675438', '2025-06-16 12:49:27.799907');
INSERT INTO auth.users (id, email, email_verified, email_verification_token, email_verification_expires_at, password_hash, password_pepper_version, first_name, last_name, avatar_url, is_active, is_locked, failed_login_attempts, locked_until, last_login_at, last_login_ip, password_changed_at, must_change_password, created_at, updated_at) VALUES ('00000000-0000-0000-0000-000000000001', 'admin@domainflow.local', true, NULL, NULL, '$2a$12$UWIIxAckehKAU/l591d/gOCZSASW.PofRw5NXoJQWmKD31FRWK60.', 0, 'System', 'Administrator', NULL, true, false, 0, NULL, '2025-06-16 21:47:15.430408', '::1', '2025-06-16 10:38:34.340152', false, '2025-06-16 10:38:34.340152', '2025-06-16 21:47:15.430408');


--
-- TOC entry 3851 (class 0 OID 74679)
-- Dependencies: 242
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: domainflow
--

INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('6ac597a2-60b9-4938-ba6f-16d2cf9a74ca', '2025-06-16 15:55:22.019646+00', '00000000-0000-0000-0000-000000000001', 'session_expired', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "55f9df035578100560c30b877483eeb652efac8371bc316757eca999ec498fce2b485e1de4b6308f6c0e92ff802e1389b207e814fdda68a7126b18bd161bbefc", "description": "Session expired due to idle timeout"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('2163d9a8-90ef-47a2-b908-a588221b5066', '2025-06-16 15:56:06.124999+00', '00000000-0000-0000-0000-000000000001', 'session_expired', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "1344619bd1cca6de6a80431938512407589cd8cdbcc4a752653eac7cdd8c8b8298bd6092acdcb1f6843060040ec40f95a48ec9493732fc39042d1062d6c34cf6", "description": "Session expired due to idle timeout"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('9dd752eb-5aa9-4fb7-9e8b-2ef086bef9e5', '2025-06-16 17:08:05.166065+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "f8fc9b1f66575d2f2772ef3d42d8f54ce0ba924cb19e3b12777f31d1d0a534b3720d56ea8dd64bac648e647c9b48121a7fc61e5489b956a187396b86858d87d6", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('675818ff-005c-43e3-9daf-5242f1b77ff0', '2025-06-16 17:46:44.790708+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "6061a33de280fc246cfb5666eaa29ea17e914efcffbce4a6c014f2dd27faf126c2df25efc0b328359e341c9ede011184a337d340aaa09a815c84c6848b6afe09", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('9658fd31-48f3-4274-9b05-042ac73b9f23', '2025-06-16 17:47:08.564024+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "0b1621dea831f46d0c6dbbe57ce477c85203397deeedc4fe9647b53fbbeb61f69f68e4d10d73b4bef5049521663b221c2830138207386b59869091b87f4eaf26", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('f0aed0a5-3220-4c05-9ede-a092fdaa8478', '2025-06-16 17:51:19.908325+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "a19045bf4eaa35247f6f62aae12499be242c9f3cb077485d775b38e65e37f0b3bab455851d5fd943ea0a7b67b713325db351ab349364f9438d7a92040a01e8b2", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('8ae28f0c-1548-47fb-b4c9-ec03841c5c31', '2025-06-16 17:57:43.551353+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "466006f43144f3dbf0a9746a14efa25683488fa85d427b5b951224a9f84d5e6e919cbc71dcfc7d4bf1f2ad2ae46cf7679fcc9783d2b6622e0360836588ec2f0b", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('7d162a36-60fa-4eb4-a3ce-467b4edae259', '2025-06-16 17:59:37.306142+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "89bcdc1e926b2e1ac42a9222eb973a0b732a6e4414e3d1a673226ab9dfc74f7c6a088d7fe03477b393797807ef4d4fe6406b2e09372ff4bf97f61032c131d87a", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('3ef5b01e-4f84-40c6-825b-9c36aad29d2f', '2025-06-16 18:06:33.13202+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "f4efd9f31b9e01e3cd7856f8f52f7f1c3e9ee105794ea013b2b1016467ffe891273d48f54f9334d9acde1fbd0b61977e7d43e4cc8e28f393b75050a0d78c33e2", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('695c2110-f5e3-4d16-8606-99b9a59040cf', '2025-06-16 18:07:26.159538+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "f98ef31776506df23b8ef8e06c9f03a302a8f898a9351096967b1a2aed901a55a8c500295c5c45f072f58cb6fd032a45d12df1f3738014c71c47e0c773fb9d73", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('5403e92f-1a61-4961-86ab-2a245888ab4a', '2025-06-16 18:12:30.380836+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "0f01ef59d71d3ef85c076e7a9c87e0fb9b8d0589eebdea618b0454466d9c007f20a64330f257166d93f974586437cf13da157d2bf28a2c798cb33aeeb95edb75", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('ba33581c-ff9c-4282-8b4a-54e6601622ab', '2025-06-16 18:20:58.662549+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "c241f7113a1ca493ec2a96d6f3d0339de2f5ee640918cf7bdbed5672fc97efaf2cdb0c9f59a0129311f2ee876845b7e62ae97ad58af44af9ba032fae4ec16aca", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('f0d1b3a2-cabc-401d-86da-b01aa2e9ece1', '2025-06-16 18:21:11.429136+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "d779f79797fe7578a09d18009624bab0931831e511621b4d2701facc86121319ecac58424b4f3d1239310ef20b21ee47ae22503a2057d79eda9771561863f0fa", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('29ff5009-7ef6-4546-9f69-55bf49e58820', '2025-06-16 18:25:03.517927+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "d0ad2c0492f89ba570b7ff84ed95d6fd6c7f6f6c950c40cfb7962528bdc415eb6c754eae4b0eae5cae814ca01806a0460727b18c733abd94300bf36990d83d44", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('3cd53404-4e05-4364-8ad1-c510e069e6d5', '2025-06-16 18:32:53.873049+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "63f4df2730590a2ade0bec83ecc7754319d3ae9cabd56ca979c81d936e10624a4caa6c1ca3d79c696520b7d275dc0e67f9a7376eeca8ef8570a3e398a5d7b04c", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('db5280eb-3206-44c0-be03-c0b41e9696f1', '2025-06-16 18:36:54.660358+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "d877a0fb5f0d8cc4394ab35267d92956e6f4c21895bedd9ddadbed1d02a5f71c08139027856ff4840c941eaceb65cb29ff9461572195950b0a414555dfe55e7f", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('5d4d3e64-b0fd-4364-b5aa-0359ec927481', '2025-06-16 18:43:39.455496+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "0121ebe0ce03bf5fd35b90c8cd0d27117a1406e91d6d43b68f76034ef99cf24cd3e4bfc3629e89e70c9ed649816e33d3d9c631afad2c2f03e7e5e30e67df9ebc", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('4a5d8ecf-2920-446b-b1c1-1d485861398d', '2025-06-16 20:49:44.839397+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "f687918eb70b57e51a4463cb8e54bdec607e273ec0b34878534d23581a5430c08ce2b46b44da7d2dfe2d012b6220f4aaba84c12b9f816e19d5e1fccd6fd5d486", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('d941c07b-9a2f-42ef-a93d-c48a2d2f9f78', '2025-06-16 21:33:47.165256+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "87ff6d30de3a354126b420093b421d87bba8b64976862ffabec6490d2d68d2316d97245bf4e132b5fa33992019b0d9eac71d6fbf5796a2a4051e546761aeb338", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);
INSERT INTO public.audit_logs (id, "timestamp", user_id, action, entity_type, entity_id, details, client_ip, user_agent) VALUES ('c9e26444-6e5f-42e8-be88-768c0ece075d', '2025-06-16 21:47:15.427593+00', '00000000-0000-0000-0000-000000000001', 'session_created', 'session', '00000000-0000-0000-0000-000000000001', '{"session_id": "497c8cd327d74f7ec1abed8fb753eaffb117a0c459d66e28d910b7ef993ad5edcf69f267eba524cdc6f5e3c1ae1c7c12200aa59e9b234fc94fbb323feb08b205", "description": "Session created for user 00000000-0000-0000-0000-000000000001"}', NULL, NULL);


--
-- TOC entry 3852 (class 0 OID 74691)
-- Dependencies: 243
-- Data for Name: campaign_jobs; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3840 (class 0 OID 74455)
-- Dependencies: 231
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3846 (class 0 OID 74548)
-- Dependencies: 237
-- Data for Name: dns_validation_params; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3847 (class 0 OID 74571)
-- Dependencies: 238
-- Data for Name: dns_validation_results; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3841 (class 0 OID 74476)
-- Dependencies: 232
-- Data for Name: domain_generation_campaign_params; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3843 (class 0 OID 74510)
-- Dependencies: 234
-- Data for Name: domain_generation_config_states; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3842 (class 0 OID 74489)
-- Dependencies: 233
-- Data for Name: generated_domains; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3848 (class 0 OID 74602)
-- Dependencies: 239
-- Data for Name: http_keyword_campaign_params; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3850 (class 0 OID 74643)
-- Dependencies: 241
-- Data for Name: http_keyword_results; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3845 (class 0 OID 74534)
-- Dependencies: 236
-- Data for Name: keyword_sets; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3844 (class 0 OID 74518)
-- Dependencies: 235
-- Data for Name: personas; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3849 (class 0 OID 74626)
-- Dependencies: 240
-- Data for Name: proxies; Type: TABLE DATA; Schema: public; Owner: domainflow
--



--
-- TOC entry 3853 (class 0 OID 74728)
-- Dependencies: 244
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: domainflow
--

INSERT INTO public.schema_migrations (version, dirty) VALUES (17, false);


--
-- TOC entry 3854 (class 0 OID 74733)
-- Dependencies: 245
-- Data for Name: schema_version_info; Type: TABLE DATA; Schema: public; Owner: domainflow
--

INSERT INTO public.schema_version_info (version_number, version_name, consolidation_completed, baseline_date, performance_improvement_percentage) VALUES (2, 'consolidated_v2', true, '2025-06-16 10:26:26.826617', 65.0);


--
-- TOC entry 3886 (class 0 OID 0)
-- Dependencies: 227
-- Name: auth_audit_log_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: domainflow
--

SELECT pg_catalog.setval('auth.auth_audit_log_id_seq', 27, true);


--
-- TOC entry 3887 (class 0 OID 0)
-- Dependencies: 229
-- Name: rate_limits_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: domainflow
--

SELECT pg_catalog.setval('auth.rate_limits_id_seq', 3, true);


--
-- TOC entry 3577 (class 2606 OID 74431)
-- Name: auth_audit_log auth_audit_log_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.auth_audit_log
    ADD CONSTRAINT auth_audit_log_pkey PRIMARY KEY (id);


--
-- TOC entry 3563 (class 2606 OID 74361)
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- TOC entry 3565 (class 2606 OID 74359)
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- TOC entry 3567 (class 2606 OID 74363)
-- Name: permissions permissions_resource_action_key; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT permissions_resource_action_key UNIQUE (resource, action);


--
-- TOC entry 3586 (class 2606 OID 74452)
-- Name: rate_limits rate_limits_identifier_action_key; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.rate_limits
    ADD CONSTRAINT rate_limits_identifier_action_key UNIQUE (identifier, action);


--
-- TOC entry 3588 (class 2606 OID 74450)
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- TOC entry 3575 (class 2606 OID 74391)
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- TOC entry 3559 (class 2606 OID 74350)
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- TOC entry 3561 (class 2606 OID 74348)
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- TOC entry 3557 (class 2606 OID 74324)
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- TOC entry 3571 (class 2606 OID 74369)
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- TOC entry 3545 (class 2606 OID 74314)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 3547 (class 2606 OID 74312)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3643 (class 2606 OID 74687)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 3648 (class 2606 OID 74706)
-- Name: campaign_jobs campaign_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_pkey PRIMARY KEY (id);


--
-- TOC entry 3590 (class 2606 OID 74471)
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- TOC entry 3617 (class 2606 OID 74560)
-- Name: dns_validation_params dns_validation_params_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_params
    ADD CONSTRAINT dns_validation_params_pkey PRIMARY KEY (campaign_id);


--
-- TOC entry 3619 (class 2606 OID 74581)
-- Name: dns_validation_results dns_validation_results_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_pkey PRIMARY KEY (id);


--
-- TOC entry 3596 (class 2606 OID 74483)
-- Name: domain_generation_campaign_params domain_generation_campaign_params_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.domain_generation_campaign_params
    ADD CONSTRAINT domain_generation_campaign_params_pkey PRIMARY KEY (campaign_id);


--
-- TOC entry 3605 (class 2606 OID 74517)
-- Name: domain_generation_config_states domain_generation_config_states_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.domain_generation_config_states
    ADD CONSTRAINT domain_generation_config_states_pkey PRIMARY KEY (config_hash);


--
-- TOC entry 3598 (class 2606 OID 74499)
-- Name: generated_domains generated_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.generated_domains
    ADD CONSTRAINT generated_domains_pkey PRIMARY KEY (id);


--
-- TOC entry 3626 (class 2606 OID 74615)
-- Name: http_keyword_campaign_params http_keyword_campaign_params_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_campaign_params
    ADD CONSTRAINT http_keyword_campaign_params_pkey PRIMARY KEY (campaign_id);


--
-- TOC entry 3635 (class 2606 OID 74652)
-- Name: http_keyword_results http_keyword_results_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_pkey PRIMARY KEY (id);


--
-- TOC entry 3613 (class 2606 OID 74547)
-- Name: keyword_sets keyword_sets_name_key; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.keyword_sets
    ADD CONSTRAINT keyword_sets_name_key UNIQUE (name);


--
-- TOC entry 3615 (class 2606 OID 74545)
-- Name: keyword_sets keyword_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.keyword_sets
    ADD CONSTRAINT keyword_sets_pkey PRIMARY KEY (id);


--
-- TOC entry 3609 (class 2606 OID 74529)
-- Name: personas personas_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT personas_pkey PRIMARY KEY (id);


--
-- TOC entry 3629 (class 2606 OID 74641)
-- Name: proxies proxies_address_key; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.proxies
    ADD CONSTRAINT proxies_address_key UNIQUE (address);


--
-- TOC entry 3631 (class 2606 OID 74639)
-- Name: proxies proxies_name_key; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.proxies
    ADD CONSTRAINT proxies_name_key UNIQUE (name);


--
-- TOC entry 3633 (class 2606 OID 74637)
-- Name: proxies proxies_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.proxies
    ADD CONSTRAINT proxies_pkey PRIMARY KEY (id);


--
-- TOC entry 3653 (class 2606 OID 74732)
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- TOC entry 3655 (class 2606 OID 74742)
-- Name: schema_version_info schema_version_info_pkey; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.schema_version_info
    ADD CONSTRAINT schema_version_info_pkey PRIMARY KEY (version_number);


--
-- TOC entry 3624 (class 2606 OID 74583)
-- Name: dns_validation_results uq_dns_results_campaign_domain; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT uq_dns_results_campaign_domain UNIQUE (dns_campaign_id, domain_name);


--
-- TOC entry 3603 (class 2606 OID 74501)
-- Name: generated_domains uq_generated_domains_campaign_name; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.generated_domains
    ADD CONSTRAINT uq_generated_domains_campaign_name UNIQUE (domain_generation_campaign_id, domain_name);


--
-- TOC entry 3641 (class 2606 OID 74654)
-- Name: http_keyword_results uq_http_results_campaign_domain; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT uq_http_results_campaign_domain UNIQUE (http_keyword_campaign_id, domain_name);


--
-- TOC entry 3611 (class 2606 OID 74531)
-- Name: personas uq_personas_name_type; Type: CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT uq_personas_name_type UNIQUE (name, persona_type);


--
-- TOC entry 3578 (class 1259 OID 74439)
-- Name: idx_auth_audit_created_at; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_auth_audit_created_at ON auth.auth_audit_log USING btree (created_at);


--
-- TOC entry 3579 (class 1259 OID 74438)
-- Name: idx_auth_audit_event_type; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_auth_audit_event_type ON auth.auth_audit_log USING btree (event_type);


--
-- TOC entry 3580 (class 1259 OID 74440)
-- Name: idx_auth_audit_risk_score; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_auth_audit_risk_score ON auth.auth_audit_log USING btree (risk_score);


--
-- TOC entry 3581 (class 1259 OID 74441)
-- Name: idx_auth_audit_session_fingerprint; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_auth_audit_session_fingerprint ON auth.auth_audit_log USING btree (session_fingerprint) WHERE (session_fingerprint IS NOT NULL);


--
-- TOC entry 3582 (class 1259 OID 74437)
-- Name: idx_auth_audit_user_id; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_auth_audit_user_id ON auth.auth_audit_log USING btree (user_id);


--
-- TOC entry 3583 (class 1259 OID 74454)
-- Name: idx_rate_limits_blocked_until; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_rate_limits_blocked_until ON auth.rate_limits USING btree (blocked_until);


--
-- TOC entry 3584 (class 1259 OID 74453)
-- Name: idx_rate_limits_identifier; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_rate_limits_identifier ON auth.rate_limits USING btree (identifier);


--
-- TOC entry 3572 (class 1259 OID 74403)
-- Name: idx_role_permissions_permission_id; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_role_permissions_permission_id ON auth.role_permissions USING btree (permission_id);


--
-- TOC entry 3573 (class 1259 OID 74402)
-- Name: idx_role_permissions_role_id; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_role_permissions_role_id ON auth.role_permissions USING btree (role_id);


--
-- TOC entry 3548 (class 1259 OID 74332)
-- Name: idx_sessions_active; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_active ON auth.sessions USING btree (is_active, expires_at);


--
-- TOC entry 3549 (class 1259 OID 74331)
-- Name: idx_sessions_expires_at; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_expires_at ON auth.sessions USING btree (expires_at);


--
-- TOC entry 3550 (class 1259 OID 74334)
-- Name: idx_sessions_fingerprint; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_fingerprint ON auth.sessions USING btree (session_fingerprint) WHERE (session_fingerprint IS NOT NULL);


--
-- TOC entry 3551 (class 1259 OID 74336)
-- Name: idx_sessions_ip_address; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_ip_address ON auth.sessions USING btree (ip_address) WHERE (ip_address IS NOT NULL);


--
-- TOC entry 3552 (class 1259 OID 74333)
-- Name: idx_sessions_last_activity; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_last_activity ON auth.sessions USING btree (last_activity_at);


--
-- TOC entry 3553 (class 1259 OID 74335)
-- Name: idx_sessions_user_agent_hash; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_user_agent_hash ON auth.sessions USING btree (user_agent_hash) WHERE (user_agent_hash IS NOT NULL);


--
-- TOC entry 3554 (class 1259 OID 74330)
-- Name: idx_sessions_user_id; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_user_id ON auth.sessions USING btree (user_id);


--
-- TOC entry 3555 (class 1259 OID 74337)
-- Name: idx_sessions_validation; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_sessions_validation ON auth.sessions USING btree (id, is_active, expires_at, user_id);


--
-- TOC entry 3568 (class 1259 OID 74386)
-- Name: idx_user_roles_role_id; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_user_roles_role_id ON auth.user_roles USING btree (role_id);


--
-- TOC entry 3569 (class 1259 OID 74385)
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: auth; Owner: domainflow
--

CREATE INDEX idx_user_roles_user_id ON auth.user_roles USING btree (user_id);


--
-- TOC entry 3644 (class 1259 OID 74690)
-- Name: idx_audit_logs_entity_type_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_audit_logs_entity_type_id ON public.audit_logs USING btree (entity_type, entity_id);


--
-- TOC entry 3645 (class 1259 OID 74688)
-- Name: idx_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp" DESC);


--
-- TOC entry 3646 (class 1259 OID 74689)
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- TOC entry 3649 (class 1259 OID 74712)
-- Name: idx_campaign_jobs_campaign_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_campaign_jobs_campaign_id ON public.campaign_jobs USING btree (campaign_id);


--
-- TOC entry 3650 (class 1259 OID 74713)
-- Name: idx_campaign_jobs_status_scheduled_at; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_campaign_jobs_status_scheduled_at ON public.campaign_jobs USING btree (status, scheduled_at);


--
-- TOC entry 3651 (class 1259 OID 74714)
-- Name: idx_campaign_jobs_type; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_campaign_jobs_type ON public.campaign_jobs USING btree (job_type);


--
-- TOC entry 3591 (class 1259 OID 74475)
-- Name: idx_campaigns_created_at; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_campaigns_created_at ON public.campaigns USING btree (created_at DESC);


--
-- TOC entry 3592 (class 1259 OID 74472)
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);


--
-- TOC entry 3593 (class 1259 OID 74473)
-- Name: idx_campaigns_type; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_campaigns_type ON public.campaigns USING btree (campaign_type);


--
-- TOC entry 3594 (class 1259 OID 74474)
-- Name: idx_campaigns_user_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_campaigns_user_id ON public.campaigns USING btree (user_id);


--
-- TOC entry 3620 (class 1259 OID 74599)
-- Name: idx_dns_results_campaign_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_dns_results_campaign_id ON public.dns_validation_results USING btree (dns_campaign_id);


--
-- TOC entry 3621 (class 1259 OID 74600)
-- Name: idx_dns_results_domain_name; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_dns_results_domain_name ON public.dns_validation_results USING btree (domain_name);


--
-- TOC entry 3622 (class 1259 OID 74601)
-- Name: idx_dns_results_status; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_dns_results_status ON public.dns_validation_results USING btree (validation_status);


--
-- TOC entry 3599 (class 1259 OID 74508)
-- Name: idx_generated_domains_campaign_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_generated_domains_campaign_id ON public.generated_domains USING btree (domain_generation_campaign_id);


--
-- TOC entry 3600 (class 1259 OID 74509)
-- Name: idx_generated_domains_name; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_generated_domains_name ON public.generated_domains USING btree (domain_name);


--
-- TOC entry 3601 (class 1259 OID 74507)
-- Name: idx_generated_domains_offset; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_generated_domains_offset ON public.generated_domains USING btree (domain_generation_campaign_id, offset_index);


--
-- TOC entry 3636 (class 1259 OID 74678)
-- Name: idx_http_keyword_results_dns_result_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_http_keyword_results_dns_result_id ON public.http_keyword_results USING btree (dns_result_id);


--
-- TOC entry 3637 (class 1259 OID 74675)
-- Name: idx_http_results_campaign_id; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_http_results_campaign_id ON public.http_keyword_results USING btree (http_keyword_campaign_id);


--
-- TOC entry 3638 (class 1259 OID 74676)
-- Name: idx_http_results_domain_name; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_http_results_domain_name ON public.http_keyword_results USING btree (domain_name);


--
-- TOC entry 3639 (class 1259 OID 74677)
-- Name: idx_http_results_status; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_http_results_status ON public.http_keyword_results USING btree (validation_status);


--
-- TOC entry 3606 (class 1259 OID 74533)
-- Name: idx_personas_is_enabled; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_personas_is_enabled ON public.personas USING btree (is_enabled);


--
-- TOC entry 3607 (class 1259 OID 74532)
-- Name: idx_personas_type; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_personas_type ON public.personas USING btree (persona_type);


--
-- TOC entry 3627 (class 1259 OID 74642)
-- Name: idx_proxies_is_enabled; Type: INDEX; Schema: public; Owner: domainflow
--

CREATE INDEX idx_proxies_is_enabled ON public.proxies USING btree (is_enabled);


--
-- TOC entry 3679 (class 2620 OID 74722)
-- Name: roles set_timestamp_auth_roles; Type: TRIGGER; Schema: auth; Owner: domainflow
--

CREATE TRIGGER set_timestamp_auth_roles BEFORE UPDATE ON auth.roles FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 3677 (class 2620 OID 74721)
-- Name: users set_timestamp_auth_users; Type: TRIGGER; Schema: auth; Owner: domainflow
--

CREATE TRIGGER set_timestamp_auth_users BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 3678 (class 2620 OID 74720)
-- Name: sessions trigger_session_fingerprint; Type: TRIGGER; Schema: auth; Owner: domainflow
--

CREATE TRIGGER trigger_session_fingerprint BEFORE INSERT OR UPDATE ON auth.sessions FOR EACH ROW EXECUTE FUNCTION auth.update_session_fingerprint();


--
-- TOC entry 3684 (class 2620 OID 74727)
-- Name: campaign_jobs set_timestamp_campaign_jobs; Type: TRIGGER; Schema: public; Owner: domainflow
--

CREATE TRIGGER set_timestamp_campaign_jobs BEFORE UPDATE ON public.campaign_jobs FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 3680 (class 2620 OID 74723)
-- Name: campaigns set_timestamp_campaigns; Type: TRIGGER; Schema: public; Owner: domainflow
--

CREATE TRIGGER set_timestamp_campaigns BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 3682 (class 2620 OID 74725)
-- Name: keyword_sets set_timestamp_keyword_sets; Type: TRIGGER; Schema: public; Owner: domainflow
--

CREATE TRIGGER set_timestamp_keyword_sets BEFORE UPDATE ON public.keyword_sets FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 3681 (class 2620 OID 74724)
-- Name: personas set_timestamp_personas; Type: TRIGGER; Schema: public; Owner: domainflow
--

CREATE TRIGGER set_timestamp_personas BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 3683 (class 2620 OID 74726)
-- Name: proxies set_timestamp_proxies; Type: TRIGGER; Schema: public; Owner: domainflow
--

CREATE TRIGGER set_timestamp_proxies BEFORE UPDATE ON public.proxies FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- TOC entry 3662 (class 2606 OID 74432)
-- Name: auth_audit_log auth_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.auth_audit_log
    ADD CONSTRAINT auth_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- TOC entry 3660 (class 2606 OID 74397)
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES auth.permissions(id) ON DELETE CASCADE;


--
-- TOC entry 3661 (class 2606 OID 74392)
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE CASCADE;


--
-- TOC entry 3656 (class 2606 OID 74325)
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 3657 (class 2606 OID 74380)
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);


--
-- TOC entry 3658 (class 2606 OID 74375)
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE CASCADE;


--
-- TOC entry 3659 (class 2606 OID 74370)
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: domainflow
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 3676 (class 2606 OID 74707)
-- Name: campaign_jobs campaign_jobs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3665 (class 2606 OID 74561)
-- Name: dns_validation_params dns_validation_params_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_params
    ADD CONSTRAINT dns_validation_params_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3666 (class 2606 OID 74566)
-- Name: dns_validation_params dns_validation_params_source_generation_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_params
    ADD CONSTRAINT dns_validation_params_source_generation_campaign_id_fkey FOREIGN KEY (source_generation_campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- TOC entry 3667 (class 2606 OID 74584)
-- Name: dns_validation_results dns_validation_results_dns_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_dns_campaign_id_fkey FOREIGN KEY (dns_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3668 (class 2606 OID 74589)
-- Name: dns_validation_results dns_validation_results_generated_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_generated_domain_id_fkey FOREIGN KEY (generated_domain_id) REFERENCES public.generated_domains(id) ON DELETE SET NULL;


--
-- TOC entry 3669 (class 2606 OID 74594)
-- Name: dns_validation_results dns_validation_results_validated_by_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_validated_by_persona_id_fkey FOREIGN KEY (validated_by_persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;


--
-- TOC entry 3663 (class 2606 OID 74484)
-- Name: domain_generation_campaign_params domain_generation_campaign_params_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.domain_generation_campaign_params
    ADD CONSTRAINT domain_generation_campaign_params_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3664 (class 2606 OID 74502)
-- Name: generated_domains generated_domains_domain_generation_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.generated_domains
    ADD CONSTRAINT generated_domains_domain_generation_campaign_id_fkey FOREIGN KEY (domain_generation_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3670 (class 2606 OID 74616)
-- Name: http_keyword_campaign_params http_keyword_campaign_params_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_campaign_params
    ADD CONSTRAINT http_keyword_campaign_params_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3671 (class 2606 OID 74621)
-- Name: http_keyword_campaign_params http_keyword_campaign_params_source_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_campaign_params
    ADD CONSTRAINT http_keyword_campaign_params_source_campaign_id_fkey FOREIGN KEY (source_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3672 (class 2606 OID 74660)
-- Name: http_keyword_results http_keyword_results_dns_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_dns_result_id_fkey FOREIGN KEY (dns_result_id) REFERENCES public.dns_validation_results(id) ON DELETE SET NULL;


--
-- TOC entry 3673 (class 2606 OID 74655)
-- Name: http_keyword_results http_keyword_results_http_keyword_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_http_keyword_campaign_id_fkey FOREIGN KEY (http_keyword_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- TOC entry 3674 (class 2606 OID 74670)
-- Name: http_keyword_results http_keyword_results_used_proxy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_used_proxy_id_fkey FOREIGN KEY (used_proxy_id) REFERENCES public.proxies(id) ON DELETE SET NULL;


--
-- TOC entry 3675 (class 2606 OID 74665)
-- Name: http_keyword_results http_keyword_results_validated_by_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: domainflow
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_validated_by_persona_id_fkey FOREIGN KEY (validated_by_persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;


--
-- TOC entry 3862 (class 0 OID 0)
-- Dependencies: 8
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: domainflow
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


-- Completed on 2025-06-16 22:12:28 UTC

--
-- PostgreSQL database dump complete
--

