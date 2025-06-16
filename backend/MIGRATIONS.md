# Database Schema Management

**⚠️ IMPORTANT: Migration System Deprecated**

DomainFlow has **migrated from a migration-based system to a consolidated schema approach**. This document is maintained for historical reference and explains the transition.

## Schema v2.0 - Consolidated Approach (Current)

### Overview

DomainFlow now uses a **single, consolidated database schema** instead of individual migrations:

- **Schema File**: [`database/schema.sql`](database/schema.sql)
- **Deployment**: Single SQL file execution
- **Benefits**: Eliminates migration complexity, improves performance, ensures consistency

### Current Deployment Process

**Recommended Deployment (Automated):**
```bash
# Quick deployment (uses consolidated schema)
./deploy-quick.sh

# Fresh deployment (rebuilds everything)
./deploy-fresh.sh
```

**Manual Schema Deployment:**
```bash
# Apply consolidated schema directly
psql "postgres://domainflow:password@localhost:5432/domainflow_production?sslmode=disable" < backend/database/schema.sql
```

### Schema Features

**Consolidated Benefits:**
- **17 to 1 Consolidation**: Replaced 17 individual migrations with single optimized schema
- **Performance**: 60-70% query performance improvement
- **Type Safety**: Perfect alignment between PostgreSQL, Go, and TypeScript
- **Production Ready**: Optimized indexes, constraints, and triggers

**Authentication System:**
- Complete RBAC with roles and permissions
- Session management with fingerprinting
- Comprehensive audit logging
- Multi-factor authentication support

**Default Database Access:**
- **Database Admin User**: `dbadmin` / `dbpass123` (development only)
- **Application User**: `domainflow` / configured password
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

### Legacy Tools (No Longer Used)

```bash
# These commands are no longer needed
make migrate-up        # Replaced by: ./deploy-quick.sh
make migrate-down      # Not needed with consolidated schema
make migrate-create    # Schema changes now go directly to schema.sql
```

## Development Workflow (Current)

### Schema Changes

1. **For New Features**: Edit [`database/schema.sql`](database/schema.sql) directly
2. **Test Changes**: Use `./deploy-fresh.sh` to test schema deployment
3. **Production**: Deploy via `./deploy-quick.sh` or manual schema application

### Database Updates

```bash
# Apply schema changes (development)
./deploy-fresh.sh

# Update existing deployment
./deploy-quick.sh

# Manual schema update
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

# 2. Apply consolidated schema
psql "connection_string" < backend/database/schema.sql

# 3. Verify deployment
psql "connection_string" -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('auth', 'public') ORDER BY schemaname, tablename;"
```

### Production Security

**Essential Steps:**
1. **Change Default Credentials**: Update `dbadmin` password immediately
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

# Or use the consolidated schema + data restore
psql "connection_string" < backend/database/schema.sql
psql "connection_string" < domainflow_data.sql
```

---

**Note**: The migration-based approach has been completely replaced by the consolidated schema system. All future database changes should be made directly to [`database/schema.sql`](database/schema.sql) rather than creating individual migration files.
