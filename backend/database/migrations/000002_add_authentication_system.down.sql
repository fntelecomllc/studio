-- Rollback authentication system migration

-- Drop auth schema tables in reverse order to handle dependencies
DROP TABLE IF EXISTS auth.rate_limits;
DROP TABLE IF EXISTS auth.auth_audit_log;
DROP TABLE IF EXISTS auth.password_reset_tokens;
DROP TABLE IF EXISTS auth.role_permissions;
DROP TABLE IF EXISTS auth.user_roles;
DROP TABLE IF EXISTS auth.permissions;
DROP TABLE IF EXISTS auth.roles;
DROP TABLE IF EXISTS auth.sessions;
DROP TABLE IF EXISTS auth.users;

-- Drop the auth schema
DROP SCHEMA IF EXISTS auth;