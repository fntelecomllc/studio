--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (Ubuntu 17.5-1.pgdg25.04+1)
-- Dumped by pg_dump version 17.5 (Ubuntu 17.5-1.pgdg25.04+1)

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
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: consolidation; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA consolidation;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: cleanup_expired_sessions(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: FUNCTION cleanup_expired_sessions(); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.cleanup_expired_sessions() IS 'Removes expired and inactive sessions from the database';


--
-- Name: update_session_fingerprint(); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: validate_session_security(character varying, inet, text, boolean, boolean); Type: FUNCTION; Schema: auth; Owner: -
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


--
-- Name: FUNCTION validate_session_security(p_session_id character varying, p_client_ip inet, p_user_agent text, p_require_ip_match boolean, p_require_ua_match boolean); Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON FUNCTION auth.validate_session_security(p_session_id character varying, p_client_ip inet, p_user_agent text, p_require_ip_match boolean, p_require_ua_match boolean) IS 'Validates session security with optional IP and user agent matching';


--
-- Name: generate_user_agent_hash(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_user_agent_hash(user_agent_text text) RETURNS character varying
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
    -- Generate SHA-256 hash of user agent for faster comparison
    RETURN encode(digest(user_agent_text, 'sha256'), 'hex');
END;
$$;


--
-- Name: FUNCTION generate_user_agent_hash(user_agent_text text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_user_agent_hash(user_agent_text text) IS 'Generates SHA-256 hash of user agent string';


--
-- Name: trigger_set_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_audit_log; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: auth_audit_log_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.auth_audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.auth_audit_log_id_seq OWNED BY auth.auth_audit_log.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.password_reset_tokens (
    id uuid DEFAULT public.gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    ip_address inet,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: permissions; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: rate_limits; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.rate_limits (
    id bigint NOT NULL,
    identifier character varying(255) NOT NULL,
    action character varying(50) NOT NULL,
    attempts integer DEFAULT 1,
    window_start timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    blocked_until timestamp without time zone
);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE; Schema: auth; Owner: -
--

CREATE SEQUENCE auth.rate_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rate_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: -
--

ALTER SEQUENCE auth.rate_limits_id_seq OWNED BY auth.rate_limits.id;


--
-- Name: role_permissions; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: sessions; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: COLUMN sessions.user_agent_hash; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.user_agent_hash IS 'SHA-256 hash of user agent for fast comparison';


--
-- Name: COLUMN sessions.session_fingerprint; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.session_fingerprint IS 'SHA-256 hash of IP address, user agent, and screen resolution for session security';


--
-- Name: COLUMN sessions.browser_fingerprint; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.browser_fingerprint IS 'SHA-256 hash of user agent and screen resolution for browser identification';


--
-- Name: COLUMN sessions.screen_resolution; Type: COMMENT; Schema: auth; Owner: -
--

COMMENT ON COLUMN auth.sessions.screen_resolution IS 'Screen resolution for enhanced browser fingerprinting';


--
-- Name: user_roles; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone
);


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
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


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN audit_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.action IS 'e.g., CampaignCreated, PersonaUpdated, ProxyTested';


--
-- Name: COLUMN audit_logs.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.entity_type IS 'e.g., Campaign, Persona, Proxy';


--
-- Name: campaign_jobs; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN campaign_jobs.job_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_jobs.job_type IS 'e.g., DomainGeneration, DNSValidation, HTTPKeywordScan (matches campaign_type usually)';


--
-- Name: COLUMN campaign_jobs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_jobs.status IS 'e.g., Pending, Queued, Running, Completed, Failed, Retry';


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN campaigns.campaign_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.campaign_type IS 'e.g., DomainGeneration, DNSValidation, HTTPKeywordScan';


--
-- Name: COLUMN campaigns.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.status IS 'e.g., Pending, Queued, Running, Paused, Completed, Failed, Archived';


--
-- Name: dns_validation_params; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: dns_validation_results; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN dns_validation_results.validation_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dns_validation_results.validation_status IS 'e.g., Resolved, Unresolved, Error, Pending, Skipped';


--
-- Name: domain_generation_campaign_params; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: domain_generation_config_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.domain_generation_config_states (
    config_hash text NOT NULL,
    last_offset bigint NOT NULL,
    config_details jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: generated_domains; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: http_keyword_campaign_params; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN http_keyword_campaign_params.source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.http_keyword_campaign_params.source_type IS 'DomainGeneration or DNSValidation to indicate which type source_campaign_id refers to';


--
-- Name: http_keyword_results; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN http_keyword_results.validation_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.http_keyword_results.validation_status IS 'e.g., Success, ContentMismatch, KeywordsNotFound, Unreachable, AccessDenied, ProxyError, DNSError, Timeout, Error, Pending, Skipped';


--
-- Name: keyword_sets; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN keyword_sets.keywords; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.keyword_sets.keywords IS 'Array of KeywordRule objects: [{"pattern": "findme", "ruleType": "string", ...}]';


--
-- Name: personas; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: COLUMN personas.persona_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personas.persona_type IS 'DNS or HTTP';


--
-- Name: COLUMN personas.config_details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.personas.config_details IS 'Stores DNSValidatorConfigJSON or HTTPValidatorConfigJSON';


--
-- Name: proxies; Type: TABLE; Schema: public; Owner: -
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


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version bigint NOT NULL,
    dirty boolean NOT NULL
);


--
-- Name: schema_version_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_version_info (
    version_number integer NOT NULL,
    version_name text NOT NULL,
    consolidation_completed boolean DEFAULT false,
    baseline_date timestamp without time zone DEFAULT now(),
    performance_improvement_percentage numeric DEFAULT 0
);


--
-- Name: auth_audit_log id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.auth_audit_log ALTER COLUMN id SET DEFAULT nextval('auth.auth_audit_log_id_seq'::regclass);


--
-- Name: rate_limits id; Type: DEFAULT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.rate_limits ALTER COLUMN id SET DEFAULT nextval('auth.rate_limits_id_seq'::regclass);


--
-- Name: auth_audit_log auth_audit_log_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.auth_audit_log
    ADD CONSTRAINT auth_audit_log_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_name_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT permissions_name_key UNIQUE (name);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_resource_action_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.permissions
    ADD CONSTRAINT permissions_resource_action_key UNIQUE (resource, action);


--
-- Name: rate_limits rate_limits_identifier_action_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.rate_limits
    ADD CONSTRAINT rate_limits_identifier_action_key UNIQUE (identifier, action);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: campaign_jobs campaign_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: dns_validation_params dns_validation_params_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_params
    ADD CONSTRAINT dns_validation_params_pkey PRIMARY KEY (campaign_id);


--
-- Name: dns_validation_results dns_validation_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_pkey PRIMARY KEY (id);


--
-- Name: domain_generation_campaign_params domain_generation_campaign_params_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_generation_campaign_params
    ADD CONSTRAINT domain_generation_campaign_params_pkey PRIMARY KEY (campaign_id);


--
-- Name: domain_generation_config_states domain_generation_config_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_generation_config_states
    ADD CONSTRAINT domain_generation_config_states_pkey PRIMARY KEY (config_hash);


--
-- Name: generated_domains generated_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_domains
    ADD CONSTRAINT generated_domains_pkey PRIMARY KEY (id);


--
-- Name: http_keyword_campaign_params http_keyword_campaign_params_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_campaign_params
    ADD CONSTRAINT http_keyword_campaign_params_pkey PRIMARY KEY (campaign_id);


--
-- Name: http_keyword_results http_keyword_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_pkey PRIMARY KEY (id);


--
-- Name: keyword_sets keyword_sets_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_sets
    ADD CONSTRAINT keyword_sets_name_key UNIQUE (name);


--
-- Name: keyword_sets keyword_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.keyword_sets
    ADD CONSTRAINT keyword_sets_pkey PRIMARY KEY (id);


--
-- Name: personas personas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT personas_pkey PRIMARY KEY (id);


--
-- Name: proxies proxies_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proxies
    ADD CONSTRAINT proxies_address_key UNIQUE (address);


--
-- Name: proxies proxies_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proxies
    ADD CONSTRAINT proxies_name_key UNIQUE (name);


--
-- Name: proxies proxies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proxies
    ADD CONSTRAINT proxies_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: schema_version_info schema_version_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_version_info
    ADD CONSTRAINT schema_version_info_pkey PRIMARY KEY (version_number);


--
-- Name: dns_validation_results uq_dns_results_campaign_domain; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT uq_dns_results_campaign_domain UNIQUE (dns_campaign_id, domain_name);


--
-- Name: generated_domains uq_generated_domains_campaign_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_domains
    ADD CONSTRAINT uq_generated_domains_campaign_name UNIQUE (domain_generation_campaign_id, domain_name);


--
-- Name: http_keyword_results uq_http_results_campaign_domain; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT uq_http_results_campaign_domain UNIQUE (http_keyword_campaign_id, domain_name);


--
-- Name: personas uq_personas_name_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.personas
    ADD CONSTRAINT uq_personas_name_type UNIQUE (name, persona_type);


--
-- Name: idx_auth_audit_created_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_audit_created_at ON auth.auth_audit_log USING btree (created_at);


--
-- Name: idx_auth_audit_event_type; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_audit_event_type ON auth.auth_audit_log USING btree (event_type);


--
-- Name: idx_auth_audit_risk_score; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_audit_risk_score ON auth.auth_audit_log USING btree (risk_score);


--
-- Name: idx_auth_audit_session_fingerprint; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_audit_session_fingerprint ON auth.auth_audit_log USING btree (session_fingerprint) WHERE (session_fingerprint IS NOT NULL);


--
-- Name: idx_auth_audit_user_id; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_auth_audit_user_id ON auth.auth_audit_log USING btree (user_id);


--
-- Name: idx_password_reset_expires; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_password_reset_expires ON auth.password_reset_tokens USING btree (expires_at);


--
-- Name: idx_password_reset_user_id; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_password_reset_user_id ON auth.password_reset_tokens USING btree (user_id);


--
-- Name: idx_rate_limits_blocked_until; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_rate_limits_blocked_until ON auth.rate_limits USING btree (blocked_until);


--
-- Name: idx_rate_limits_identifier; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_rate_limits_identifier ON auth.rate_limits USING btree (identifier);


--
-- Name: idx_role_permissions_permission_id; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_role_permissions_permission_id ON auth.role_permissions USING btree (permission_id);


--
-- Name: idx_role_permissions_role_id; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_role_permissions_role_id ON auth.role_permissions USING btree (role_id);


--
-- Name: idx_sessions_active; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_active ON auth.sessions USING btree (is_active, expires_at);


--
-- Name: idx_sessions_expires_at; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_expires_at ON auth.sessions USING btree (expires_at);


--
-- Name: idx_sessions_fingerprint; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_fingerprint ON auth.sessions USING btree (session_fingerprint) WHERE (session_fingerprint IS NOT NULL);


--
-- Name: idx_sessions_ip_address; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_ip_address ON auth.sessions USING btree (ip_address) WHERE (ip_address IS NOT NULL);


--
-- Name: idx_sessions_last_activity; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_last_activity ON auth.sessions USING btree (last_activity_at);


--
-- Name: idx_sessions_user_agent_hash; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_user_agent_hash ON auth.sessions USING btree (user_agent_hash) WHERE (user_agent_hash IS NOT NULL);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_user_id ON auth.sessions USING btree (user_id);


--
-- Name: idx_sessions_validation; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_sessions_validation ON auth.sessions USING btree (id, is_active, expires_at, user_id);


--
-- Name: idx_user_roles_role_id; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_roles_role_id ON auth.user_roles USING btree (role_id);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: auth; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON auth.user_roles USING btree (user_id);


--
-- Name: idx_audit_logs_entity_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity_type_id ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_campaign_jobs_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_jobs_campaign_id ON public.campaign_jobs USING btree (campaign_id);


--
-- Name: idx_campaign_jobs_status_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_jobs_status_scheduled_at ON public.campaign_jobs USING btree (status, scheduled_at);


--
-- Name: idx_campaign_jobs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_jobs_type ON public.campaign_jobs USING btree (job_type);


--
-- Name: idx_campaigns_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_created_at ON public.campaigns USING btree (created_at DESC);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);


--
-- Name: idx_campaigns_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_type ON public.campaigns USING btree (campaign_type);


--
-- Name: idx_campaigns_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_user_id ON public.campaigns USING btree (user_id);


--
-- Name: idx_dns_results_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dns_results_campaign_id ON public.dns_validation_results USING btree (dns_campaign_id);


--
-- Name: idx_dns_results_domain_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dns_results_domain_name ON public.dns_validation_results USING btree (domain_name);


--
-- Name: idx_dns_results_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dns_results_status ON public.dns_validation_results USING btree (validation_status);


--
-- Name: idx_generated_domains_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_domains_campaign_id ON public.generated_domains USING btree (domain_generation_campaign_id);


--
-- Name: idx_generated_domains_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_domains_name ON public.generated_domains USING btree (domain_name);


--
-- Name: idx_generated_domains_offset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_generated_domains_offset ON public.generated_domains USING btree (domain_generation_campaign_id, offset_index);


--
-- Name: idx_http_keyword_results_dns_result_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_http_keyword_results_dns_result_id ON public.http_keyword_results USING btree (dns_result_id);


--
-- Name: idx_http_results_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_http_results_campaign_id ON public.http_keyword_results USING btree (http_keyword_campaign_id);


--
-- Name: idx_http_results_domain_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_http_results_domain_name ON public.http_keyword_results USING btree (domain_name);


--
-- Name: idx_http_results_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_http_results_status ON public.http_keyword_results USING btree (validation_status);


--
-- Name: idx_personas_is_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personas_is_enabled ON public.personas USING btree (is_enabled);


--
-- Name: idx_personas_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_personas_type ON public.personas USING btree (persona_type);


--
-- Name: idx_proxies_is_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proxies_is_enabled ON public.proxies USING btree (is_enabled);


--
-- Name: roles set_timestamp_auth_roles; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER set_timestamp_auth_roles BEFORE UPDATE ON auth.roles FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: users set_timestamp_auth_users; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER set_timestamp_auth_users BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: sessions trigger_session_fingerprint; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER trigger_session_fingerprint BEFORE INSERT OR UPDATE ON auth.sessions FOR EACH ROW EXECUTE FUNCTION auth.update_session_fingerprint();


--
-- Name: campaign_jobs set_timestamp_campaign_jobs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp_campaign_jobs BEFORE UPDATE ON public.campaign_jobs FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: campaigns set_timestamp_campaigns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp_campaigns BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: keyword_sets set_timestamp_keyword_sets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp_keyword_sets BEFORE UPDATE ON public.keyword_sets FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: personas set_timestamp_personas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp_personas BEFORE UPDATE ON public.personas FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: proxies set_timestamp_proxies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp_proxies BEFORE UPDATE ON public.proxies FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: auth_audit_log auth_audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.auth_audit_log
    ADD CONSTRAINT auth_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES auth.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_assigned_by_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES auth.users(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES auth.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: campaign_jobs campaign_jobs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_jobs
    ADD CONSTRAINT campaign_jobs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: dns_validation_params dns_validation_params_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_params
    ADD CONSTRAINT dns_validation_params_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: dns_validation_params dns_validation_params_source_generation_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_params
    ADD CONSTRAINT dns_validation_params_source_generation_campaign_id_fkey FOREIGN KEY (source_generation_campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;


--
-- Name: dns_validation_results dns_validation_results_dns_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_dns_campaign_id_fkey FOREIGN KEY (dns_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: dns_validation_results dns_validation_results_generated_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_generated_domain_id_fkey FOREIGN KEY (generated_domain_id) REFERENCES public.generated_domains(id) ON DELETE SET NULL;


--
-- Name: dns_validation_results dns_validation_results_validated_by_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dns_validation_results
    ADD CONSTRAINT dns_validation_results_validated_by_persona_id_fkey FOREIGN KEY (validated_by_persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;


--
-- Name: domain_generation_campaign_params domain_generation_campaign_params_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.domain_generation_campaign_params
    ADD CONSTRAINT domain_generation_campaign_params_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: generated_domains generated_domains_domain_generation_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.generated_domains
    ADD CONSTRAINT generated_domains_domain_generation_campaign_id_fkey FOREIGN KEY (domain_generation_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: http_keyword_campaign_params http_keyword_campaign_params_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_campaign_params
    ADD CONSTRAINT http_keyword_campaign_params_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: http_keyword_campaign_params http_keyword_campaign_params_source_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_campaign_params
    ADD CONSTRAINT http_keyword_campaign_params_source_campaign_id_fkey FOREIGN KEY (source_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: http_keyword_results http_keyword_results_dns_result_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_dns_result_id_fkey FOREIGN KEY (dns_result_id) REFERENCES public.dns_validation_results(id) ON DELETE SET NULL;


--
-- Name: http_keyword_results http_keyword_results_http_keyword_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_http_keyword_campaign_id_fkey FOREIGN KEY (http_keyword_campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: http_keyword_results http_keyword_results_used_proxy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_used_proxy_id_fkey FOREIGN KEY (used_proxy_id) REFERENCES public.proxies(id) ON DELETE SET NULL;


--
-- Name: http_keyword_results http_keyword_results_validated_by_persona_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.http_keyword_results
    ADD CONSTRAINT http_keyword_results_validated_by_persona_id_fkey FOREIGN KEY (validated_by_persona_id) REFERENCES public.personas(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

