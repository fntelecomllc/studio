# Database Schema Management

**⚠️ IMPORTANT: Migration System Deprecated**

DomainFlow has **migrated from a migration-based system to a consolidated schema approach**. This document is maintained for historical reference and explains the transition.

## Schema v3.0 - Production Ready (Current)

### Overview

DomainFlow now uses a **complete production-ready database schema** with all legacy migrations consolidated:

- **Production Schema**: [`database/production_schema_v3.sql`](database/production_schema_v3.sql) - Complete production deployment
- **Development Schema**: [`database/schema.sql`](database/schema.sql) - Development and updates
- **Benefits**: Zero migration complexity, optimized performance, production-ready defaults

### Current Deployment Process

**New Production Deployment (Recommended):**
```bash
# Deploy complete production schema with default users and data
psql "postgres://username:password@host:5432/domainflow_production" < backend/database/production_schema_v3.sql
```

**Development Environment:**
```bash
# Use development schema for local work
psql "postgres://domainflow:password@localhost:5432/domainflow?sslmode=disable" < backend/database/schema.sql
```

**Existing Production Update:**
```bash
# Update existing deployment with schema changes
psql "postgres://username:password@host:5432/domainflow_production" < backend/database/schema.sql
```

### Schema Features

**Production Ready v3.0:**
- **Complete Consolidation**: All legacy migrations consolidated into production-ready schema
- **Performance**: Optimized indexes, triggers, and constraints
- **Type Safety**: Perfect alignment between PostgreSQL, Go, and TypeScript
- **Default Data**: Pre-configured roles, permissions, and admin users
- **Security**: Session-based authentication with comprehensive audit logging

**Authentication System:**
- **Default Admin Users**: `admin@domainflow.local`, `dbadmin@domainflow.local`
- **Role-Based Access Control**: 4 default roles with granular permissions
- **Session Security**: Advanced fingerprinting and validation
- **Multi-Factor Authentication**: Built-in MFA support

**⚠️ Security Warning**: Change all default passwords after deployment!
- **Production**: Change default credentials immediately

## Legacy Migration System (Deprecated)

### Historical Context

The previous system used 17 individual migrations (000001 through 000017) managed by [golang-migrate](https://github.com/golang-migrate/migrate). This approach has been **deprecated** in favor of the consolidated schema.

### Migration History

**Key Migrations (Archived):**
1. `000001_initial_schema` - Basic table structure
2. `000002_add_personas` - Persona management
3. `000003_add_proxies` - Proxy configuration
4. ...
5. `000017_session_based_authentication` - Complete auth system

**Why Consolidation Was Needed:**
- Migration conflicts and dependency issues
- Performance degradation from incremental changes
- Complex rollback procedures
- Cross-migration consistency problems

### Legacy Tools (Removed)

```bash
# These tools and files have been removed
backend/database/migrations/     # All migration files removed
backend/database/consolidation/  # Migration tooling removed
make migrate-*                   # Migration commands deprecated
```

## Development Workflow (Current)

### Schema Changes

1. **For New Features**: Edit [`database/schema.sql`](database/schema.sql) directly
2. **Test Changes**: Apply to development database and verify
3. **Production**: Create new production schema version when stable

### Database Deployment

```bash
# New production deployment (recommended)
psql "connection_string" < backend/database/production_schema_v3.sql

# Development environment
psql "connection_string" < backend/database/schema.sql

# Update existing production (schema only)
psql "connection_string" < backend/database/schema.sql
```

### Schema Validation

```bash
# Validate schema consistency
cd backend && go run ./cmd/schema_validator

# Test database connectivity
psql "connection_string" -c "SELECT 1;"

# Verify authentication system
psql "connection_string" -c "SELECT COUNT(*) FROM auth.users;"
```

## Production Deployment

### Recommended Process

```bash
# 1. Backup existing database (if any)
pg_dump "connection_string" > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Deploy production schema (new deployments)
psql "connection_string" < backend/database/production_schema_v3.sql

# OR apply schema updates (existing deployments)
psql "connection_string" < backend/database/schema.sql

# 3. Verify deployment
psql "connection_string" -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('auth', 'public') ORDER BY schemaname, tablename;"
```

### Production Security

**Essential Steps:**
1. **Change Default Passwords**: Update all default user passwords immediately
   - `admin@domainflow.local` (TempPassword123!)
   - `dbadmin@domainflow.local` (dbpassword123!)
   - `user@domainflow.com` (user123!)
2. **Enable SSL**: Use `sslmode=require` for connections
3. **Firewall Rules**: Restrict database access to application servers only
4. **Audit Logging**: Monitor authentication and database access

## Database Backup and Recovery

### Creating Backups

```bash
# Full database backup
pg_dump "connection_string" > domainflow_backup_$(date +%Y%m%d_%H%M%S).sql

# Schema-only backup
pg_dump --schema-only "connection_string" > domainflow_schema_$(date +%Y%m%d_%H%M%S).sql

# Data-only backup
pg_dump --data-only "connection_string" > domainflow_data_$(date +%Y%m%d_%H%M%S).sql
```

### Recovery Process

```bash
# Restore from backup
psql "connection_string" < domainflow_backup.sql

# Or use the production schema + data restore
psql "connection_string" < backend/database/production_schema_v3.sql
psql "connection_string" < domainflow_data.sql
```

---

**Note**: The migration system has been completely removed. All future database changes should be made to [`database/schema.sql`](database/schema.sql), and new production schema versions should be created when ready for deployment. See [`DATABASE_SETUP_GUIDE.md`](../DATABASE_SETUP_GUIDE.md) for detailed setup instructions.
