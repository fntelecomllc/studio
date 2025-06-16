-- Fix admin user permissions by adding the missing 'account:active' permission
-- This script addresses the issue where the frontend expects an 'account:active' permission
-- that doesn't exist in the database

-- First, let's add the missing 'account:active' permission
INSERT INTO auth.permissions (name, display_name, description, resource, action) 
VALUES ('account:active', 'Active Account', 'Permission indicating an active user account', 'account', 'active')
ON CONFLICT (name) DO NOTHING;

-- Get the permission ID for the newly created permission
-- and assign it to the super_admin role (which the admin user has)
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'super_admin' AND p.name = 'account:active'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Also assign it to the admin role for good measure
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'admin' AND p.name = 'account:active'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verify the admin user's account status and permissions
SELECT 
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

-- Show all permissions for the admin user after the fix
SELECT DISTINCT p.name as permission_name
FROM auth.users u
JOIN auth.user_roles ur ON u.id = ur.user_id
JOIN auth.role_permissions rp ON ur.role_id = rp.role_id
JOIN auth.permissions p ON rp.permission_id = p.id
WHERE u.email = 'admin@domainflow.local'
ORDER BY p.name;