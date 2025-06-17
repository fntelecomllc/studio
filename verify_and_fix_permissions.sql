-- Comprehensive Database Permission Verification and Fix Script
-- This script verifies and fixes super admin permissions for campaign access

BEGIN;

-- Enable detailed output
\set ECHO queries
\set VERBOSITY verbose

-- Create a function to log our actions
CREATE OR REPLACE FUNCTION log_action(action_desc TEXT) 
RETURNS VOID AS $$
BEGIN
    RAISE NOTICE '[%] %', NOW(), action_desc;
END;
$$ LANGUAGE plpgsql;

SELECT log_action('Starting comprehensive permission verification and fix');

-- STEP 1: Verify current database state
SELECT log_action('=== STEP 1: Current Database State Verification ===');

-- Check if admin user exists
SELECT log_action('Checking admin user existence...');
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM auth.users WHERE email = 'admin@domainflow.local';
    RAISE NOTICE 'Admin user count: %', user_count;
    
    IF user_count = 0 THEN
        RAISE NOTICE 'WARNING: Admin user does not exist!';
    ELSE
        RAISE NOTICE 'SUCCESS: Admin user exists';
    END IF;
END;
$$;

-- Check super_admin role existence
SELECT log_action('Checking super_admin role...');
DO $$
DECLARE
    role_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO role_count FROM auth.roles WHERE name = 'super_admin';
    RAISE NOTICE 'Super admin role count: %', role_count;
    
    IF role_count = 0 THEN
        RAISE NOTICE 'WARNING: Super admin role does not exist!';
    ELSE
        RAISE NOTICE 'SUCCESS: Super admin role exists';
    END IF;
END;
$$;

-- Check current admin user permissions
SELECT log_action('Current admin user permissions:');
SELECT 
    p.name as permission_name,
    p.resource,
    p.action,
    r.name as role_name
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.roles r ON ur.role_id = r.id
JOIN auth.role_permissions rp ON r.id = rp.role_id
JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local'
ORDER BY p.name;

-- Check specifically for campaign permissions
SELECT log_action('Campaign-specific permissions check:');
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'EXISTS'
        ELSE 'MISSING'
    END as status,
    'campaigns:create' as permission_name
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.roles r ON ur.role_id = r.id
JOIN auth.role_permissions rp ON r.id = rp.role_id
JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local' AND p.name = 'campaigns:create'

UNION ALL

SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'EXISTS'
        ELSE 'MISSING'
    END as status,
    'campaigns:read' as permission_name
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.roles r ON ur.role_id = r.id
JOIN auth.role_permissions rp ON r.id = rp.role_id
JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local' AND p.name = 'campaigns:read';

-- STEP 2: Apply comprehensive fixes
SELECT log_action('=== STEP 2: Applying Fixes ===');

-- Ensure uuid extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure auth schema exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Ensure the super_admin role exists
SELECT log_action('Ensuring super_admin role exists...');
INSERT INTO auth.roles (id, name, display_name, description, is_system_role, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'super_admin',
    'Super Administrator', 
    'Full system access with all permissions',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_system_role = EXCLUDED.is_system_role,
    updated_at = CURRENT_TIMESTAMP;

-- Ensure all essential permissions exist
SELECT log_action('Creating essential permissions...');
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES
    (gen_random_uuid(), 'campaigns:create', 'Create Campaigns', 'Permission to create new campaigns', 'campaigns', 'create', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'campaigns:read', 'Read Campaigns', 'Permission to view campaigns', 'campaigns', 'read', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'campaigns:update', 'Update Campaigns', 'Permission to modify campaigns', 'campaigns', 'update', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'campaigns:delete', 'Delete Campaigns', 'Permission to delete campaigns', 'campaigns', 'delete', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'campaigns:execute', 'Execute Campaigns', 'Permission to start/stop campaigns', 'campaigns', 'execute', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'personas:create', 'Create Personas', 'Permission to create personas', 'personas', 'create', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'personas:read', 'Read Personas', 'Permission to view personas', 'personas', 'read', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'personas:update', 'Update Personas', 'Permission to modify personas', 'personas', 'update', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'personas:delete', 'Delete Personas', 'Permission to delete personas', 'personas', 'delete', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'proxies:create', 'Create Proxies', 'Permission to create proxies', 'proxies', 'create', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'proxies:read', 'Read Proxies', 'Permission to view proxies', 'proxies', 'read', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'proxies:update', 'Update Proxies', 'Permission to modify proxies', 'proxies', 'update', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'proxies:delete', 'Delete Proxies', 'Permission to delete proxies', 'proxies', 'delete', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'system:admin', 'System Administration', 'Full system administration access', 'system', 'admin', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'system:config', 'System Configuration', 'Permission to modify system configuration', 'system', 'config', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'system:users', 'User Management', 'Permission to manage users', 'system', 'users', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'system:audit', 'Audit Access', 'Permission to view audit logs', 'system', 'audit', CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'account:active', 'Active Account', 'Permission indicating an active user account', 'account', 'active', CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action;

-- Assign ALL permissions to super_admin role
SELECT log_action('Assigning all permissions to super_admin role...');
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Ensure admin user exists with correct credentials
SELECT log_action('Ensuring admin user exists...');
INSERT INTO auth.users (id, email, email_verified, password_hash, password_pepper_version,
                       first_name, last_name, is_active, is_locked, failed_login_attempts,
                       must_change_password, created_at, updated_at)
VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'admin@domainflow.local',
    true,
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3bp.Gm.QBG', -- TempPassword123!
    0, -- No pepper for legacy compatibility
    'System',
    'Administrator',
    true,
    false,
    0,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    password_pepper_version = EXCLUDED.password_pepper_version,
    is_active = true,
    is_locked = false,
    failed_login_attempts = 0,
    updated_at = CURRENT_TIMESTAMP;

-- Ensure admin user has super_admin role
SELECT log_action('Assigning super_admin role to admin user...');
INSERT INTO auth.user_roles (user_id, role_id, assigned_at)
SELECT u.id, r.id, CURRENT_TIMESTAMP
FROM auth.users u, auth.roles r
WHERE u.email = 'admin@domainflow.local' AND r.name = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- STEP 3: Verification of fixes
SELECT log_action('=== STEP 3: Post-Fix Verification ===');

-- Verify admin user status
SELECT log_action('Admin user verification:');
SELECT 
    u.email,
    u.is_active,
    u.is_locked,
    u.failed_login_attempts,
    r.name as role_name,
    COUNT(p.name) as permission_count
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.roles r ON ur.role_id = r.id
LEFT JOIN auth.role_permissions rp ON r.id = rp.role_id
LEFT JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local'
GROUP BY u.email, u.is_active, u.is_locked, u.failed_login_attempts, r.name;

-- Verify campaign permissions specifically
SELECT log_action('Campaign permissions verification:');
SELECT 
    p.name as permission_name,
    p.display_name,
    p.resource,
    p.action,
    r.name as assigned_to_role
FROM auth.permissions p
JOIN auth.role_permissions rp ON p.id = rp.permission_id
JOIN auth.roles r ON rp.role_id = r.id
JOIN auth.user_roles ur ON r.id = ur.role_id
JOIN auth.users u ON ur.user_id = u.id
WHERE p.name LIKE 'campaigns:%' 
AND u.email = 'admin@domainflow.local'
ORDER BY p.name;

-- Verify all admin permissions
SELECT log_action('All admin permissions:');
SELECT DISTINCT 
    p.name as permission_name,
    p.resource,
    p.action
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.role_permissions rp ON ur.role_id = rp.role_id
JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local'
ORDER BY p.name;

-- Count verification
SELECT log_action('Permission count verification:');
SELECT 
    'Total permissions in system' as description,
    COUNT(*) as count
FROM auth.permissions
UNION ALL
SELECT 
    'Admin user permissions' as description,
    COUNT(DISTINCT p.name) as count
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.role_permissions rp ON ur.role_id = rp.role_id
JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local'
UNION ALL
SELECT 
    'Campaign permissions for admin' as description,
    COUNT(*) as count
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.role_permissions rp ON ur.role_id = rp.role_id
JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local' AND p.name LIKE 'campaigns:%';

-- Final status check
SELECT log_action('Final status check:');
DO $$
DECLARE
    campaign_perms INTEGER;
    total_perms INTEGER;
BEGIN
    -- Count campaign permissions for admin
    SELECT COUNT(*) INTO campaign_perms
    FROM auth.users u
    JOIN auth.user_roles ur ON u.id = ur.user_id
    JOIN auth.role_permissions rp ON ur.role_id = rp.role_id
    JOIN auth.permissions p ON rp.permission_id = p.id
    WHERE u.email = 'admin@domainflow.local' AND p.name LIKE 'campaigns:%';
    
    -- Count total permissions for admin
    SELECT COUNT(DISTINCT p.name) INTO total_perms
    FROM auth.users u
    JOIN auth.user_roles ur ON u.id = ur.user_id
    JOIN auth.role_permissions rp ON ur.role_id = rp.role_id
    JOIN auth.permissions p ON rp.permission_id = p.id
    WHERE u.email = 'admin@domainflow.local';
    
    RAISE NOTICE 'SUMMARY:';
    RAISE NOTICE '  - Campaign permissions for admin: %', campaign_perms;
    RAISE NOTICE '  - Total permissions for admin: %', total_perms;
    
    IF campaign_perms >= 5 THEN -- Should have create, read, update, delete, execute
        RAISE NOTICE '  - STATUS: SUCCESS - Admin has sufficient campaign permissions';
    ELSE
        RAISE NOTICE '  - STATUS: WARNING - Admin may be missing campaign permissions';
    END IF;
    
    IF total_perms >= 15 THEN -- Should have comprehensive permissions
        RAISE NOTICE '  - STATUS: SUCCESS - Admin has comprehensive permissions';
    ELSE
        RAISE NOTICE '  - STATUS: WARNING - Admin may be missing system permissions';
    END IF;
END;
$$;

-- Drop the log function
DROP FUNCTION log_action(TEXT);

SELECT '=== VERIFICATION AND FIX SCRIPT COMPLETED ===' as final_message;

COMMIT;