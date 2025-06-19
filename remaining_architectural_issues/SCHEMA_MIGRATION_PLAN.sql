-- SCHEMA MIGRATION PLAN
-- This script migrates the database schema to match the Unified Data Contracts.

-- -----------------------------------------------------------------------------
-- AUTH.USERS TABLE MIGRATION
-- -----------------------------------------------------------------------------

-- Rename columns to camelCase
ALTER TABLE auth.users RENAME COLUMN first_name TO "firstName";
ALTER TABLE auth.users RENAME COLUMN last_name TO "lastName";
ALTER TABLE auth.users RENAME COLUMN avatar_url TO "avatarUrl";
ALTER TABLE auth.users RENAME COLUMN is_active TO "isActive";
ALTER TABLE auth.users RENAME COLUMN is_locked TO "isLocked";
ALTER TABLE auth.users RENAME COLUMN last_login_at TO "lastLoginAt";
ALTER TABLE auth.users RENAME COLUMN last_login_ip TO "lastLoginIp";
ALTER TABLE auth.users RENAME COLUMN must_change_password TO "mustChangePassword";
ALTER TABLE auth.users RENAME COLUMN created_at TO "createdAt";
ALTER TABLE auth.users RENAME COLUMN updated_at TO "updatedAt";

-- Add missing columns
ALTER TABLE auth.users ADD COLUMN "mfaLastUsedAt" timestamp NULL;

-- Adjust constraints and defaults
ALTER TABLE auth.users ALTER COLUMN email_verified SET NOT NULL;
ALTER TABLE auth.users ALTER COLUMN "isActive" SET NOT NULL;
ALTER TABLE auth.users ALTER COLUMN "isLocked" SET NOT NULL;
ALTER TABLE auth.users ALTER COLUMN "mustChangePassword" SET NOT NULL;
ALTER TABLE auth.users ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE auth.users ALTER COLUMN "createdAt" SET DEFAULT NOW();
ALTER TABLE auth.users ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE auth.users ALTER COLUMN "updatedAt" SET DEFAULT NOW();

-- Drop obsolete columns
ALTER TABLE auth.users 
DROP COLUMN email_verification_token, 
DROP COLUMN email_verification_expires_at, 
DROP COLUMN password_hash, 
DROP COLUMN password_pepper_version, 
DROP COLUMN failed_login_attempts, 
DROP COLUMN locked_until, 
DROP COLUMN password_changed_at;

-- -----------------------------------------------------------------------------
-- PUBLIC.CAMPAIGNS TABLE MIGRATION
-- -----------------------------------------------------------------------------

-- Rename columns to camelCase
ALTER TABLE public.campaigns RENAME COLUMN campaign_type TO "campaignType";
ALTER TABLE public.campaigns RENAME COLUMN user_id TO "userId";
ALTER TABLE public.campaigns RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.campaigns RENAME COLUMN updated_at TO "updatedAt";
ALTER TABLE public.campaigns RENAME COLUMN started_at TO "startedAt";
ALTER TABLE public.campaigns RENAME COLUMN completed_at TO "completedAt";
ALTER TABLE public.campaigns RENAME COLUMN progress_percentage TO "progressPercentage";
ALTER TABLE public.campaigns RENAME COLUMN total_items TO "totalItems";
ALTER TABLE public.campaigns RENAME COLUMN processed_items TO "processedItems";
ALTER TABLE public.campaigns RENAME COLUMN error_message TO "errorMessage";
ALTER TABLE public.campaigns RENAME COLUMN successful_items TO "successfulItems";
ALTER TABLE public.campaigns RENAME COLUMN failed_items TO "failedItems";

-- Add missing columns
ALTER TABLE public.campaigns ADD COLUMN "estimatedCompletionAt" timestamptz NULL;
ALTER TABLE public.campaigns ADD COLUMN "avgProcessingRate" double precision NULL;
ALTER TABLE public.campaigns ADD COLUMN "lastHeartbeatAt" timestamptz NULL;

-- -----------------------------------------------------------------------------
-- PUBLIC.PERSONAS TABLE MIGRATION
-- -----------------------------------------------------------------------------

-- Rename columns to camelCase
ALTER TABLE public.personas RENAME COLUMN persona_type TO "personaType";
ALTER TABLE public.personas RENAME COLUMN config_details TO "configDetails";
ALTER TABLE public.personas RENAME COLUMN is_enabled TO "isEnabled";
ALTER TABLE public.personas RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.personas RENAME COLUMN updated_at TO "updatedAt";

-- Adjust constraints
ALTER TABLE public.personas DROP CONSTRAINT "personas_name_persona_type_key";
ALTER TABLE public.personas ADD CONSTRAINT "personas_name_key" UNIQUE (name);

-- -----------------------------------------------------------------------------
-- PUBLIC.PROXIES TABLE MIGRATION
-- -----------------------------------------------------------------------------

-- Rename columns to camelCase
ALTER TABLE public.proxies RENAME COLUMN password_hash TO "passwordHash";
ALTER TABLE public.proxies RENAME COLUMN is_enabled TO "isEnabled";
ALTER TABLE public.proxies RENAME COLUMN is_healthy TO "isHealthy";
ALTER TABLE public.proxies RENAME COLUMN last_status TO "lastStatus";
ALTER TABLE public.proxies RENAME COLUMN last_checked_at TO "lastCheckedAt";
ALTER TABLE public.proxies RENAME COLUMN latency_ms TO "latencyMs";
ALTER TABLE public.proxies RENAME COLUMN country_code TO "countryCode";
ALTER TABLE public.proxies RENAME COLUMN created_at TO "createdAt";
ALTER TABLE public.proxies RENAME COLUMN updated_at TO "updatedAt";