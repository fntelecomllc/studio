# DomainFlow Database Dump - Consolidated Schema v2.0

## Overview

This document describes the consolidated database dump file created after successful database schema consolidation. The dump contains the complete DomainFlow database structure with all tables, functions, triggers, indexes, and default data.

## Database Dump File

**File**: `domainflow_consolidated_v2_dump.sql`  
**Size**: ~74KB  
**Format**: PostgreSQL SQL dump with `--clean --if-exists --create` flags  
**Schema Version**: v2.0 (Consolidated)  

## What's Included

### Database Structure
- **Extensions**: pgcrypto, uuid-ossp
- **Schemas**: auth, public, consolidation
- **Tables**: 19 tables across all schemas
- **Functions**: Session management, security, and utility functions
- **Triggers**: Automated fingerprinting and timestamp updates
- **Indexes**: Performance-optimized indexing strategy
- **Constraints**: Foreign keys, unique constraints, and check constraints

### Default Data
- **Roles**: Super Admin, Admin, User, Viewer with full permission mappings
- **Permissions**: 17 granular permissions covering all system operations  
- **Users**: Two default users for immediate deployment:
  - `admin@domainflow.local` / `TempPassword123!` (Admin user)
  - `dbadmin@domainflow.local` / `dbpassword123!` (Database admin user)

### Security Features
- Session fingerprinting with automatic user-agent hashing
- Rate limiting tables and indexes
- Audit logging infrastructure
- Password reset token management
- Role-based access control (RBAC)

## Using the Database Dump

### Fresh Installation

```bash
# Drop existing database (if any)
PGPASSWORD='your_password' dropdb -h localhost -U domainflow domainflow_production

# Restore from dump
PGPASSWORD='your_password' psql -h localhost -U domainflow < domainflow_consolidated_v2_dump.sql
```

### Production Deployment

```bash
# Set your production password
export PGPASSWORD='your_production_password'

# Restore database
psql -h your_host -U your_user < domainflow_consolidated_v2_dump.sql

# Update default credentials after restoration
psql -h your_host -U your_user -d domainflow_production -c "
UPDATE auth.users SET 
    email = 'your_admin@yourdomain.com',
    password_hash = crypt('YourSecurePassword!', gen_salt('bf', 12))
WHERE email = 'admin@domainflow.local';
"
```

### Development Setup

```bash
# Quick setup with default credentials
PGPASSWORD='pNpTHxEWr2SmY270p1IjGn3dP' psql -h localhost -U domainflow < domainflow_consolidated_v2_dump.sql

# Test login with default credentials
curl -X POST http://localhost:8080/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@domainflow.local", "password": "TempPassword123!"}'
```

## Database Verification

After restoring the dump, verify the installation:

```sql
-- Check schema version
SELECT version, applied_at FROM public.schema_version_info ORDER BY applied_at DESC LIMIT 1;

-- Verify user count
SELECT COUNT(*) as user_count FROM auth.users;

-- Check role permissions
SELECT r.name, COUNT(rp.permission_id) as permission_count 
FROM auth.roles r 
LEFT JOIN auth.role_permissions rp ON r.id = rp.role_id 
GROUP BY r.name;

-- Verify extensions
SELECT name, installed_version FROM pg_available_extensions WHERE name IN ('pgcrypto', 'uuid-ossp');
```

Expected results:
- Schema version: 2.0
- User count: 2 (admin and dbadmin users)
- Super Admin permissions: 17
- Extensions: pgcrypto 1.3, uuid-ossp 1.1

## Default Credentials

### Admin User
- **Email**: `admin@domainflow.local`
- **Password**: `TempPassword123!`
- **Role**: Super Administrator
- **Permissions**: All 17 system permissions

### Database Admin User
- **Email**: `dbadmin@domainflow.local`
- **Password**: `dbpassword123!`
- **Role**: Administrator
- **Purpose**: Database management and verification

## Database GUI Access

**Hidden Interface URL**: `http://localhost:3000/dbgui`

### Default GUI Credentials
- **Username**: `dbadmin@domainflow.local`
- **Password**: `dbpassword123!`

The database GUI provides:
- SQL query editor with syntax highlighting
- Predefined queries for common operations
- Database statistics and health monitoring
- Schema browser for consolidated v2.0 structure
- Real-time connection status monitoring

**⚠️ SECURITY WARNING**: Change default passwords immediately in production environments.

## Migration History

This dump represents the consolidation of 17 individual migration files into a single optimized schema:

- **Previous**: 17 sequential migration files (001-017)
- **Current**: Single consolidated schema file
- **Benefits**: Faster deployment, consistent state, reduced complexity
- **Compatibility**: Maintains all functionality from migration-based approach

## Backup and Recovery

### Creating New Dumps

```bash
# Full database dump
PGPASSWORD='password' pg_dump -h localhost -U domainflow -d domainflow_production \
  --clean --if-exists --create --verbose > new_dump.sql

# Data-only dump (for updates)
PGPASSWORD='password' pg_dump -h localhost -U domainflow -d domainflow_production \
  --data-only --verbose > data_only_dump.sql

# Schema-only dump
PGPASSWORD='password' pg_dump -h localhost -U domainflow -d domainflow_production \
  --schema-only --verbose > schema_only_dump.sql
```

### Recovery Procedures

```bash
# Full recovery
PGPASSWORD='password' psql -h localhost -U domainflow < domainflow_consolidated_v2_dump.sql

# Data recovery only
PGPASSWORD='password' psql -h localhost -U domainflow -d domainflow_production < data_only_dump.sql
```

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure PostgreSQL user has CREATE DATABASE privileges
2. **Extension Missing**: Install pgcrypto and uuid-ossp extensions on PostgreSQL server
3. **Connection Failed**: Verify PostgreSQL connection parameters and firewall settings
4. **Default User Login Fails**: Check if credentials were modified during setup

### Verification Commands

```sql
-- Check database connections
SELECT datname, numbackends FROM pg_stat_database WHERE datname = 'domainflow_production';

-- Verify table structure
SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('auth', 'public') ORDER BY schemaname, tablename;

-- Test session creation
INSERT INTO auth.sessions (id, user_id, ip_address, user_agent, is_active, expires_at, last_activity_at)
VALUES ('test-session', '00000000-0000-0000-0000-000000000001', '127.0.0.1'::inet, 'test-agent', true, NOW() + INTERVAL '1 hour', NOW());
```

## Support

For issues with database restoration or schema problems:

1. Check PostgreSQL logs for detailed error messages
2. Verify PostgreSQL version compatibility (recommended: 13+)
3. Ensure sufficient disk space for database creation
4. Review connection parameters and authentication settings

---

**Generated**: Schema v2.0 Consolidated  
**Last Updated**: Database consolidation completion  
**Compatibility**: PostgreSQL 13+, pgcrypto extension required