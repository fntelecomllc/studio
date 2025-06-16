-- Comprehensive fix for campaign creation authorization issues
-- This script ensures super_admin role has all necessary permissions for campaign operations

BEGIN;

-- Ensure auth schema exists
CREATE SCHEMA IF NOT EXISTS auth;

-- Ensure the super_admin role exists
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

-- Ensure all campaign permissions exist with correct names (colon notation)
INSERT INTO auth.permissions (id, name, display_name, description, resource, action, created_at) VALUES
    (uuid_generate_v4(), 'campaigns:create', 'Create Campaigns', 'Permission to create new campaigns', 'campaigns', 'create', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'campaigns:read', 'Read Campaigns', 'Permission to view campaigns', 'campaigns', 'read', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'campaigns:update', 'Update Campaigns', 'Permission to modify campaigns', 'campaigns', 'update', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'campaigns:delete', 'Delete Campaigns', 'Permission to delete campaigns', 'campaigns', 'delete', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'campaigns:execute', 'Execute Campaigns', 'Permission to start/stop campaigns', 'campaigns', 'execute', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'personas:create', 'Create Personas', 'Permission to create personas', 'personas', 'create', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'personas:read', 'Read Personas', 'Permission to view personas', 'personas', 'read', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'personas:update', 'Update Personas', 'Permission to modify personas', 'personas', 'update', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'personas:delete', 'Delete Personas', 'Permission to delete personas', 'personas', 'delete', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'proxies:create', 'Create Proxies', 'Permission to create proxies', 'proxies', 'create', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'proxies:read', 'Read Proxies', 'Permission to view proxies', 'proxies', 'read', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'proxies:update', 'Update Proxies', 'Permission to modify proxies', 'proxies', 'update', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'proxies:delete', 'Delete Proxies', 'Permission to delete proxies', 'proxies', 'delete', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'system:admin', 'System Administration', 'Full system administration access', 'system', 'admin', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'system:config', 'System Configuration', 'Permission to modify system configuration', 'system', 'config', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'system:users', 'User Management', 'Permission to manage users', 'system', 'users', CURRENT_TIMESTAMP),
    (uuid_generate_v4(), 'system:audit', 'Audit Access', 'Permission to view audit logs', 'system', 'audit', CURRENT_TIMESTAMP)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    resource = EXCLUDED.resource,
    action = EXCLUDED.action;

-- Assign ALL permissions to super_admin role
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Ensure admin user exists with correct credentials
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
INSERT INTO auth.user_roles (user_id, role_id, assigned_at)
SELECT u.id, r.id, CURRENT_TIMESTAMP
FROM auth.users u, auth.roles r
WHERE u.email = 'admin@domainflow.local' AND r.name = 'super_admin'
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Verify the fix - show admin user permissions
SELECT 
    'Admin User Status' as check_type,
    u.email,
    u.is_active,
    u.is_locked,
    r.name as role_name,
    COUNT(p.name) as permission_count
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.roles r ON ur.role_id = r.id
LEFT JOIN auth.role_permissions rp ON r.id = rp.role_id
LEFT JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local'
GROUP BY u.email, u.is_active, u.is_locked, r.name;

-- Show specific campaign permissions
SELECT 
    'Campaign Permissions' as check_type,
    p.name as permission_name,
    p.display_name,
    r.name as assigned_to_role
FROM auth.permissions p
JOIN auth.role_permissions rp ON p.id = rp.permission_id
JOIN auth.roles r ON rp.role_id = r.id
WHERE p.name LIKE 'campaigns:%'
AND r.name = 'super_admin'
ORDER BY p.name;

COMMIT;