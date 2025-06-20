-- Migration: 004_naming_convention_fixes.sql
-- Purpose: Standardize column naming conventions to snake_case, fix JSON tag vs DB column mismatches
-- Author: Contract Alignment Team
-- Date: 2025-06-20
-- Severity: MEDIUM - Naming inconsistencies cause maintenance burden

BEGIN;

-- Check if migration already applied
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '004_naming_convention_fixes') THEN
        RAISE EXCEPTION 'Migration 004_naming_convention_fixes already applied';
    END IF;
END $$;

-- 1. Fix Persona table column names (isEnabled -> is_enabled)
-- Note: These may already be correct in DB but JSON tags use camelCase
DO $$
BEGIN
    -- Check if columns need renaming
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'personas' 
        AND column_name = 'isEnabled'
    ) THEN
        ALTER TABLE public.personas RENAME COLUMN "isEnabled" TO is_enabled;
    END IF;
END $$;

-- 2. Fix Proxy table column names
DO $$
BEGIN
    -- is_enabled
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'proxies' 
        AND column_name = 'isEnabled'
    ) THEN
        ALTER TABLE public.proxies RENAME COLUMN "isEnabled" TO is_enabled;
    END IF;

    -- is_healthy
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'proxies' 
        AND column_name = 'isHealthy'
    ) THEN
        ALTER TABLE public.proxies RENAME COLUMN "isHealthy" TO is_healthy;
    END IF;

    -- last_status
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'proxies' 
        AND column_name = 'lastStatus'
    ) THEN
        ALTER TABLE public.proxies RENAME COLUMN "lastStatus" TO last_status;
    END IF;

    -- last_checked_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'proxies' 
        AND column_name = 'lastCheckedAt'
    ) THEN
        ALTER TABLE public.proxies RENAME COLUMN "lastCheckedAt" TO last_checked_at;
    END IF;

    -- latency_ms
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'proxies' 
        AND column_name = 'latencyMs'
    ) THEN
        ALTER TABLE public.proxies RENAME COLUMN "latencyMs" TO latency_ms;
    END IF;

    -- country_code
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'proxies' 
        AND column_name = 'countryCode'
    ) THEN
        ALTER TABLE public.proxies RENAME COLUMN "countryCode" TO country_code;
    END IF;
END $$;

-- 3. Fix User table column names
DO $$
BEGIN
    -- email_verified
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'emailVerified'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "emailVerified" TO email_verified;
    END IF;

    -- first_name
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'firstName'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "firstName" TO first_name;
    END IF;

    -- last_name
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'lastName'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "lastName" TO last_name;
    END IF;

    -- avatar_url
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'avatarUrl'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "avatarUrl" TO avatar_url;
    END IF;

    -- is_active
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'isActive'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "isActive" TO is_active;
    END IF;

    -- is_locked
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'isLocked'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "isLocked" TO is_locked;
    END IF;

    -- failed_login_attempts
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'failedLoginAttempts'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "failedLoginAttempts" TO failed_login_attempts;
    END IF;

    -- locked_until
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'lockedUntil'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "lockedUntil" TO locked_until;
    END IF;

    -- last_login_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'lastLoginAt'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "lastLoginAt" TO last_login_at;
    END IF;

    -- last_login_ip
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'lastLoginIp'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "lastLoginIp" TO last_login_ip;
    END IF;

    -- mfa_enabled
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'mfaEnabled'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "mfaEnabled" TO mfa_enabled;
    END IF;

    -- must_change_password
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'mustChangePassword'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "mustChangePassword" TO must_change_password;
    END IF;

    -- password_changed_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' 
        AND table_name = 'users' 
        AND column_name = 'passwordChangedAt'
    ) THEN
        ALTER TABLE auth.users RENAME COLUMN "passwordChangedAt" TO password_changed_at;
    END IF;
END $$;

-- 4. Fix Campaign table column names
DO $$
BEGIN
    -- campaign_type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'campaignType'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "campaignType" TO campaign_type;
    END IF;

    -- user_id
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'userId'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "userId" TO user_id;
    END IF;

    -- total_items
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'totalItems'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "totalItems" TO total_items;
    END IF;

    -- processed_items
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'processedItems'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "processedItems" TO processed_items;
    END IF;

    -- successful_items
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'successfulItems'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "successfulItems" TO successful_items;
    END IF;

    -- failed_items
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'failedItems'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "failedItems" TO failed_items;
    END IF;

    -- progress_percentage
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'progressPercentage'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "progressPercentage" TO progress_percentage;
    END IF;

    -- created_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'createdAt'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "createdAt" TO created_at;
    END IF;

    -- updated_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'updatedAt'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "updatedAt" TO updated_at;
    END IF;

    -- started_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'startedAt'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "startedAt" TO started_at;
    END IF;

    -- completed_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'completedAt'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "completedAt" TO completed_at;
    END IF;

    -- error_message
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'campaigns' 
        AND column_name = 'errorMessage'
    ) THEN
        ALTER TABLE public.campaigns RENAME COLUMN "errorMessage" TO error_message;
    END IF;
END $$;

-- 5. Create views with camelCase aliases for backward compatibility
CREATE OR REPLACE VIEW public.campaigns_camel_view AS
SELECT 
    id,
    name,
    campaign_type as "campaignType",
    status,
    user_id as "userId",
    total_items as "totalItems",
    processed_items as "processedItems",
    successful_items as "successfulItems",
    failed_items as "failedItems",
    progress_percentage as "progressPercentage",
    metadata,
    created_at as "createdAt",
    updated_at as "updatedAt",
    started_at as "startedAt",
    completed_at as "completedAt",
    error_message as "errorMessage",
    estimated_completion_at as "estimatedCompletionAt",
    avg_processing_rate as "avgProcessingRate",
    last_heartbeat_at as "lastHeartbeatAt"
FROM public.campaigns;

CREATE OR REPLACE VIEW public.personas_camel_view AS
SELECT 
    id,
    name,
    description,
    persona_type as "personaType",
    config_details as "configDetails",
    is_enabled as "isEnabled",
    created_at as "createdAt",
    updated_at as "updatedAt"
FROM public.personas;

CREATE OR REPLACE VIEW public.proxies_camel_view AS
SELECT 
    id,
    name,
    description,
    address,
    protocol,
    username,
    host,
    port,
    is_enabled as "isEnabled",
    is_healthy as "isHealthy",
    last_status as "lastStatus",
    last_checked_at as "lastCheckedAt",
    latency_ms as "latencyMs",
    city,
    country_code as "countryCode",
    provider,
    created_at as "createdAt",
    updated_at as "updatedAt"
FROM public.proxies;

-- 6. Add column comments documenting the naming convention
COMMENT ON TABLE public.campaigns IS 'Campaign records - all columns use snake_case convention';
COMMENT ON TABLE public.personas IS 'Persona records - all columns use snake_case convention';
COMMENT ON TABLE public.proxies IS 'Proxy records - all columns use snake_case convention';
COMMENT ON TABLE auth.users IS 'User records - all columns use snake_case convention';

-- 7. Create a naming convention validation function
CREATE OR REPLACE FUNCTION public.validate_column_naming() RETURNS TABLE(
    table_schema TEXT,
    table_name TEXT,
    column_name TEXT,
    naming_issue TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.table_schema::TEXT,
        c.table_name::TEXT,
        c.column_name::TEXT,
        CASE 
            WHEN c.column_name ~ '[A-Z]' THEN 'Contains uppercase letters - should be snake_case'
            WHEN c.column_name ~ '^[0-9]' THEN 'Starts with number'
            WHEN c.column_name ~ '[^a-z0-9_]' THEN 'Contains invalid characters'
            ELSE 'Unknown issue'
        END as naming_issue
    FROM information_schema.columns c
    WHERE c.table_schema IN ('public', 'auth')
    AND (
        c.column_name ~ '[A-Z]' OR 
        c.column_name ~ '^[0-9]' OR 
        c.column_name ~ '[^a-z0-9_]'
    )
    ORDER BY c.table_schema, c.table_name, c.column_name;
END;
$$ LANGUAGE plpgsql;

-- Record migration
INSERT INTO public.schema_migrations (version, description) 
VALUES ('004_naming_convention_fixes', 'Standardize all column names to snake_case convention');

COMMIT;

-- Rollback procedure
-- To rollback this migration, run:
/*
BEGIN;

-- Drop views
DROP VIEW IF EXISTS public.campaigns_camel_view;
DROP VIEW IF EXISTS public.personas_camel_view;
DROP VIEW IF EXISTS public.proxies_camel_view;

-- Drop validation function
DROP FUNCTION IF EXISTS public.validate_column_naming();

-- Remove comments
COMMENT ON TABLE public.campaigns IS NULL;
COMMENT ON TABLE public.personas IS NULL;
COMMENT ON TABLE public.proxies IS NULL;
COMMENT ON TABLE auth.users IS NULL;

-- Note: Column renames are NOT reversed to avoid breaking existing code
-- If you need to revert column names, manually rename them back

-- Mark as rolled back
UPDATE public.schema_migrations 
SET rolled_back_at = NOW() 
WHERE version = '004_naming_convention_fixes';

COMMIT;
*/