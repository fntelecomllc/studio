-- Migration Script: Phase 1 Critical Schema Fixes
-- Date: 2025-06-18
-- Purpose: Fix critical data contract mismatches identified in API audit

-- DR-03: Add missing mfa_enabled column to auth.users table
-- This column is required by the Go User model and frontend but was missing from DB schema
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;

-- DR-02: Fix user_id column types to use proper UUID with foreign key constraints
-- This ensures type safety and proper referential integrity

-- Fix campaigns table user_id
ALTER TABLE campaigns 
ALTER COLUMN user_id TYPE UUID USING 
    CASE 
        WHEN user_id IS NULL THEN NULL
        WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN user_id::uuid
        ELSE NULL
    END;

-- Add foreign key constraint for campaigns.user_id
ALTER TABLE campaigns 
ADD CONSTRAINT fk_campaigns_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix audit_logs table user_id  
ALTER TABLE audit_logs 
ALTER COLUMN user_id TYPE UUID USING 
    CASE 
        WHEN user_id IS NULL THEN NULL
        WHEN user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN user_id::uuid
        ELSE NULL
    END;

-- Add foreign key constraint for audit_logs.user_id
ALTER TABLE audit_logs 
ADD CONSTRAINT fk_audit_logs_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create indexes for better performance on foreign key lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

-- Verify the changes
SELECT 
    'auth.users' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'mfa_enabled'
UNION ALL
SELECT 
    'campaigns' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'user_id'
UNION ALL
SELECT 
    'audit_logs' as table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'user_id';
