# Database Setup and Deployment Guide

## Production Schema v3.0 - Ready for Deployment

This guide covers the clean, production-ready database schema for DomainFlow after completing all architectural remediation.

## Quick Setup (Recommended)

### Using the Production Schema (New Deployments)
For new deployments, use the complete production-ready schema:

```bash
# Create a new PostgreSQL database
createdb domainflow_production

# Deploy the complete schema with default data
psql "postgres://username:password@localhost:5432/domainflow_production" < backend/database/production_schema_v3.sql
```

### Using the Existing Schema (Development)
For development or when updating existing deployments:

```bash
# Use the current schema file
psql "postgres://username:password@localhost:5432/domainflow" < backend/database/schema.sql
```

## Schema Files Overview

### Current Active Files
- **`production_schema_v3.sql`** - Complete production-ready schema with default data
- **`schema.sql`** - Current development schema (identical to production but without extensive documentation)
- **`migration_template.sql`** - Template for future schema changes

### Removed Legacy Files
- ~~`migrations/`~~ - All migration files (consolidated into production schema)
- ~~`consolidation/`~~ - Migration tooling directory (no longer needed)
- ~~`consolidated_schema_v2.sql`~~ - Old consolidated schema
- ~~`schema_version_2_baseline.sql`~~ - Old baseline schema
- ~~`consolidated_schema_v2_functions.sql`~~ - Old functions file

## Default Users Created

The production schema creates three default users:

| Email | Password | Role | Purpose |
|-------|----------|------|---------|
| `admin@domainflow.local` | `TempPassword123!` | Super Admin | Primary admin account |
| `dbadmin@domainflow.local` | `dbpassword123!` | Super Admin | Database management |
| `user@domainflow.com` | `user123!` | Standard User | Example user account |

**⚠️ SECURITY WARNING: Change all default passwords immediately after deployment!**

## Schema Features

### Authentication System
- **Session-based authentication** (no CSRF tokens)
- **Role-based permissions** with fine-grained access control
- **Multi-factor authentication** support
- **Advanced session security** with fingerprinting
- **Rate limiting** and audit logging

### Core Application Tables
- **Campaigns** - Central campaign management
- **Domain Generation** - Algorithm-based domain creation
- **DNS Validation** - Domain resolution testing
- **HTTP Keyword Validation** - Content scanning
- **Personas** - Validation configuration profiles
- **Proxies** - HTTP proxy management
- **Audit Logs** - Complete action tracking

### Default Roles and Permissions
- **super_admin**: Full system access
- **admin**: Administrative access to most features
- **user**: Standard user permissions
- **viewer**: Read-only access

## Database Verification

After deployment, verify the schema:

```sql
-- Check table count
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE';

-- Verify default data
SELECT COUNT(*) as user_count FROM auth.users;
SELECT COUNT(*) as role_count FROM auth.roles;
SELECT COUNT(*) as permission_count FROM auth.permissions;

-- Test session functions
SELECT auth.cleanup_expired_sessions();
```

## Development Workflow

### Making Schema Changes
1. **Never edit the production schema directly**
2. Make changes to `schema.sql` during development
3. Test thoroughly in development environment
4. When ready for production, create a new production schema version

### Future Migration Process
1. Use `migration_template.sql` for new changes
2. Apply changes to `schema.sql`
3. Test with existing data
4. Create new production schema version when stable

## Connection Examples

### Local Development
```bash
psql "postgres://domainflow:password@localhost:5432/domainflow?sslmode=disable"
```

### Production
```bash
psql "postgres://username:password@production-host:5432/domainflow_production?sslmode=require"
```

## Backup and Recovery

### Creating Backups
```bash
# Full backup
pg_dump "connection_string" > domainflow_backup_$(date +%Y%m%d_%H%M%S).sql

# Schema only
pg_dump --schema-only "connection_string" > domainflow_schema_$(date +%Y%m%d_%H%M%S).sql

# Data only
pg_dump --data-only "connection_string" > domainflow_data_$(date +%Y%m%d_%H%M%S).sql
```

### Restoring from Backup
```bash
# From full backup
psql "connection_string" < domainflow_backup.sql

# From schema + data
psql "connection_string" < backend/database/production_schema_v3.sql
psql "connection_string" < domainflow_data.sql
```

## Security Considerations

### Post-Deployment Security Checklist
1. **Change all default passwords immediately**
2. **Review and adjust user permissions**
3. **Configure proper SSL/TLS certificates**
4. **Set up database connection pooling**
5. **Configure regular automated backups**
6. **Monitor authentication audit logs**
7. **Set up session cleanup automation**

### Recommended Security Settings
```sql
-- Enable row-level security for sensitive tables
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

-- Configure session cleanup (run every hour)
-- Add to cron: 0 * * * * psql "connection" -c "SELECT auth.cleanup_expired_sessions();"
```

## Performance Optimization

### Recommended Database Settings
```sql
-- For production workloads
SET shared_buffers = '256MB';
SET effective_cache_size = '1GB';
SET maintenance_work_mem = '64MB';
SET checkpoint_completion_target = 0.9;
SET wal_buffers = '16MB';
SET default_statistics_target = 100;
```

### Index Monitoring
All critical indexes are pre-created. Monitor query performance and add additional indexes as needed:

```sql
-- Monitor slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;
```

## Support and Troubleshooting

### Common Issues
1. **Connection refused**: Check PostgreSQL service status
2. **Permission denied**: Verify user credentials and database permissions
3. **Schema conflicts**: Ensure clean database or proper migration path
4. **Performance issues**: Check indexes and query plans

### Health Check Queries
```sql
-- Basic connectivity test
SELECT version();

-- Schema integrity check
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname IN ('public', 'auth') 
ORDER BY schemaname, tablename;

-- User authentication test
SELECT email, is_active, created_at 
FROM auth.users 
WHERE email = 'admin@domainflow.local';
```

---

**Status**: ✅ Production Ready  
**Last Updated**: 2024-12-19  
**Schema Version**: 3.0  
**Migration Status**: All legacy migrations consolidated
