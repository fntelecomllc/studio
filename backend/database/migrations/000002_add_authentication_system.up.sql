-- Authentication System Migration for DomainFlow
-- This migration adds comprehensive authentication tables with RBAC support

-- Create auth schema for better organization
CREATE SCHEMA IF NOT EXISTS auth;

-- Users table
CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    email_verification_expires_at TIMESTAMP,
    password_hash VARCHAR(255) NOT NULL,
    password_pepper_version INTEGER DEFAULT 1,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_locked BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    last_login_at TIMESTAMP,
    last_login_ip INET,
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    must_change_password BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE auth.sessions (
    id VARCHAR(128) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    csrf_token VARCHAR(64) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NOT NULL,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON auth.sessions(expires_at);
CREATE INDEX idx_sessions_active ON auth.sessions(is_active, expires_at);

-- Roles table
CREATE TABLE auth.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE auth.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    resource VARCHAR(50) NOT NULL, -- campaigns, personas, proxies, etc.
    action VARCHAR(20) NOT NULL,   -- create, read, update, delete, execute
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(resource, action)
);

-- User roles junction table
CREATE TABLE auth.user_roles (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON auth.user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON auth.user_roles(role_id);

-- Role permissions junction table
CREATE TABLE auth.role_permissions (
    role_id UUID NOT NULL REFERENCES auth.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES auth.permissions(id) ON DELETE CASCADE,
    
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role_id ON auth.role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON auth.role_permissions(permission_id);

-- Password reset tokens
CREATE TABLE auth.password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_password_reset_user_id ON auth.password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_expires ON auth.password_reset_tokens(expires_at);

-- Authentication audit log
CREATE TABLE auth.auth_audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    session_id VARCHAR(128),
    event_type VARCHAR(50) NOT NULL, -- login, logout, password_change, etc.
    event_status VARCHAR(20) NOT NULL, -- success, failure, blocked
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    risk_score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_auth_audit_user_id ON auth.auth_audit_log(user_id);
CREATE INDEX idx_auth_audit_event_type ON auth.auth_audit_log(event_type);
CREATE INDEX idx_auth_audit_created_at ON auth.auth_audit_log(created_at);
CREATE INDEX idx_auth_audit_risk_score ON auth.auth_audit_log(risk_score);

-- Rate limiting table
CREATE TABLE auth.rate_limits (
    id BIGSERIAL PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL, -- IP address or user ID
    action VARCHAR(50) NOT NULL,      -- login, password_reset, etc.
    attempts INTEGER DEFAULT 1,
    window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blocked_until TIMESTAMP,
    
    UNIQUE(identifier, action)
);

CREATE INDEX idx_rate_limits_identifier ON auth.rate_limits(identifier);
CREATE INDEX idx_rate_limits_blocked_until ON auth.rate_limits(blocked_until);

-- Add triggers for updated_at columns
CREATE TRIGGER set_timestamp_auth_users
    BEFORE UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_auth_roles
    BEFORE UPDATE ON auth.roles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Default roles
INSERT INTO auth.roles (name, display_name, description, is_system_role) VALUES
('super_admin', 'Super Administrator', 'Full system access with all permissions', true),
('admin', 'Administrator', 'Administrative access to most system functions', true),
('campaign_manager', 'Campaign Manager', 'Can create and manage campaigns', false),
('analyst', 'Analyst', 'Read-only access to campaigns and reports', false),
('user', 'User', 'Basic user access', false);

-- Default permissions
INSERT INTO auth.permissions (name, display_name, description, resource, action) VALUES
-- Campaign permissions
('campaigns:create', 'Create Campaigns', 'Create new campaigns', 'campaigns', 'create'),
('campaigns:read', 'View Campaigns', 'View campaign details and results', 'campaigns', 'read'),
('campaigns:update', 'Edit Campaigns', 'Modify existing campaigns', 'campaigns', 'update'),
('campaigns:delete', 'Delete Campaigns', 'Remove campaigns from system', 'campaigns', 'delete'),
('campaigns:execute', 'Execute Campaigns', 'Start and stop campaign execution', 'campaigns', 'execute'),

-- Persona permissions
('personas:create', 'Create Personas', 'Create new personas', 'personas', 'create'),
('personas:read', 'View Personas', 'View persona configurations', 'personas', 'read'),
('personas:update', 'Edit Personas', 'Modify existing personas', 'personas', 'update'),
('personas:delete', 'Delete Personas', 'Remove personas from system', 'personas', 'delete'),

-- Proxy permissions
('proxies:create', 'Create Proxies', 'Add new proxy configurations', 'proxies', 'create'),
('proxies:read', 'View Proxies', 'View proxy configurations and status', 'proxies', 'read'),
('proxies:update', 'Edit Proxies', 'Modify existing proxy configurations', 'proxies', 'update'),
('proxies:delete', 'Delete Proxies', 'Remove proxy configurations', 'proxies', 'delete'),

-- System permissions
('system:admin', 'System Administration', 'Full system administration access', 'system', 'admin'),
('system:config', 'System Configuration', 'Modify system configuration', 'system', 'config'),
('system:users', 'User Management', 'Manage user accounts and permissions', 'system', 'users'),
('system:audit', 'Audit Logs', 'View system audit logs', 'system', 'audit');

-- Assign all permissions to super_admin role
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'super_admin';

-- Assign most permissions to admin role (excluding system:admin)
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM auth.roles r, auth.permissions p
WHERE r.name = 'admin' AND p.name != 'system:admin';

-- Assign campaign and basic permissions to campaign_manager
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'campaign_manager' 
AND p.resource IN ('campaigns', 'personas', 'proxies')
AND p.action IN ('create', 'read', 'update', 'execute');

-- Assign read-only permissions to analyst
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'analyst' 
AND p.action = 'read';

-- Assign basic read permissions to user
INSERT INTO auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM auth.roles r, auth.permissions p 
WHERE r.name = 'user' 
AND p.resource IN ('campaigns', 'personas')
AND p.action = 'read';

-- Default admin user (password: TempPassword123!)
-- Password hash generated with bcrypt cost 12
INSERT INTO auth.users (id, email, password_hash, first_name, last_name, is_active, must_change_password) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@domainflow.local', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3bp.Gm.QBG', 'System', 'Administrator', true, true);

-- Assign super_admin role to default admin
INSERT INTO auth.user_roles (user_id, role_id) 
SELECT '00000000-0000-0000-0000-000000000001', id FROM auth.roles WHERE name = 'super_admin';