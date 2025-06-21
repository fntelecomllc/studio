# DomainFlow Database Setup Guide

## Overview

DomainFlow uses PostgreSQL as its primary database with a comprehensive schema designed for high-performance domain operations, user management, and audit logging.

**Database Version**: PostgreSQL 13+  
**Schema Version**: Production v3.0  
**Status**: Production Ready

## Quick Setup

### New Installation

```bash
# Create database
createdb domainflow_production

# Deploy schema
psql domainflow_production < backend/database/schema.sql

# Verify installation
psql domainflow_production -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
```

### Development Setup

```bash
# Create development database
createdb domainflow_dev

# Deploy schema
psql domainflow_dev < backend/database/schema.sql

# Create test user
psql domainflow_dev -c "
INSERT INTO users (id, username, email, password_hash, role, is_active) 
VALUES (
  gen_random_uuid(), 
  'admin', 
  'admin@domainflow.local', 
  '\$2a\$12\$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYb0sUXM1p8z1pe', 
  'admin', 
  true
);
"
```

## Database Schema

### Core Tables

#### Users (`users`)
Stores user accounts and authentication information.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);
```

**Indexes**:
- Primary key on `id`
- Unique indexes on `username`, `email`
- Index on `role` for permission queries

#### Campaigns (`campaigns`)
Campaign definitions and metadata.

```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    campaign_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parameters JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

**Indexes**:
- Primary key on `id`
- Index on `user_id` for user campaigns
- Index on `status` for filtering
- Index on `campaign_type` for type filtering
- GIN index on `parameters` for JSON queries

#### Generated Domains (`generated_domains`)
Results from domain generation campaigns.

```sql
CREATE TABLE generated_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) NOT NULL,
    is_available BOOLEAN,
    checked_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### DNS Validation Results (`dns_validation_results`)
Results from DNS validation campaigns.

```sql
CREATE TABLE dns_validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) NOT NULL,
    record_type VARCHAR(10) NOT NULL,
    record_value TEXT,
    is_valid BOOLEAN NOT NULL,
    response_time_ms INTEGER,
    error_message TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',         -- System-level status
    business_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- Business-level status
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Status Field Architecture:**
- `status`: System-level processing states (pending, running, completed, failed, cancelled)
- `business_status`: Domain-specific validation states (valid_dns, lead_valid, invalid_dns, etc.)

#### HTTP Keyword Results (`http_keyword_results`)
Results from HTTP keyword analysis campaigns.

```sql
CREATE TABLE http_keyword_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    keyword VARCHAR(255) NOT NULL,
    found BOOLEAN NOT NULL,
    occurrences INTEGER DEFAULT 0,
    context TEXT,
    response_code INTEGER,
    response_time_ms INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',         -- System-level status
    business_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- Business-level status
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Status Field Architecture:**
- `status`: System-level processing states (pending, running, completed, failed, cancelled)
- `business_status`: Domain-specific validation states (lead_valid, http_valid_no_keywords, http_invalid, etc.)

#### Audit Logs (`audit_logs`)
Comprehensive operation tracking.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Supporting Tables

#### Keyword Sets (`keyword_sets`)
Reusable keyword collections.

```sql
CREATE TABLE keyword_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Keyword Rules (`keyword_rules`)
Individual keywords within sets.

```sql
CREATE TABLE keyword_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword_set_id UUID NOT NULL REFERENCES keyword_sets(id) ON DELETE CASCADE,
    keyword VARCHAR(255) NOT NULL,
    weight DECIMAL(5,2) DEFAULT 1.0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Personas (`personas`)
HTTP request personas for campaigns.

```sql
CREATE TABLE personas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_agent TEXT,
    accept_language VARCHAR(255),
    accept_encoding VARCHAR(255),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Proxies (`proxies`)
Proxy configurations for campaigns.

```sql
CREATE TABLE proxies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    address VARCHAR(255) NOT NULL,
    protocol VARCHAR(20),
    username VARCHAR(255),
    password_hash VARCHAR(255),
    host VARCHAR(255),
    port INTEGER,
    is_enabled BOOLEAN DEFAULT true,
    is_healthy BOOLEAN DEFAULT false,
    last_status VARCHAR(100),
    last_checked_at TIMESTAMP WITH TIME ZONE,
    latency_ms INTEGER,
    city VARCHAR(100),
    country_code VARCHAR(10),
    provider VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## Indexes and Performance

### Primary Indexes
All tables have UUID primary keys with btree indexes for optimal performance.

### Foreign Key Indexes
All foreign key columns have indexes to speed up joins and cascade operations.

### Specialized Indexes

#### Campaign Performance
```sql
-- Campaign queries by user and status
CREATE INDEX idx_campaigns_user_status ON campaigns(user_id, status);

-- Campaign queries by type and date
CREATE INDEX idx_campaigns_type_created ON campaigns(campaign_type, created_at);
```

#### Result Performance
```sql
-- Domain results by campaign
CREATE INDEX idx_generated_domains_campaign ON generated_domains(campaign_id);

-- DNS results by domain and type
CREATE INDEX idx_dns_results_domain_type ON dns_validation_results(domain_name, record_type);

-- HTTP results by URL and keyword
CREATE INDEX idx_http_results_url_keyword ON http_keyword_results(url, keyword);
```

#### Audit Performance
```sql
-- Audit logs by user and action
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);

-- Audit logs by date for cleanup
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

## Data Types and Constraints

### UUID Usage
All primary keys use UUID (gen_random_uuid()) for distributed scalability and security.

### JSON Columns
- `campaigns.parameters`: Campaign-specific configuration
- `generated_domains.metadata`: Additional domain information
- `audit_logs.details`: Structured audit information

### Time Zones
All timestamp columns use `TIMESTAMP WITH TIME ZONE` for global deployment support.

### Validation Constraints
- Email format validation
- Status enum constraints
- Positive number constraints for ports, timeouts, etc.

## Security Considerations

### Password Storage
Passwords are stored as bcrypt hashes with cost factor 12.

### SQL Injection Prevention
All queries use parameterized statements to prevent SQL injection.

### Data Encryption
Sensitive data can be encrypted at rest using PostgreSQL's built-in encryption features.

### Access Control
Database access should be restricted to application users only.

## Backup and Maintenance

### Backup Strategy
```bash
# Full database backup
pg_dump domainflow_production > backup_$(date +%Y%m%d_%H%M%S).sql

# Schema-only backup
pg_dump --schema-only domainflow_production > schema_backup.sql

# Data-only backup
pg_dump --data-only domainflow_production > data_backup.sql
```

### Maintenance Tasks
```sql
-- Update table statistics
ANALYZE;

-- Reindex for performance
REINDEX DATABASE domainflow_production;

-- Clean old audit logs (older than 90 days)
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';
```

## Migration Guide

### From Development to Production
1. Export data from development database
2. Create production database with schema
3. Import data with proper user mapping
4. Verify all constraints and indexes
5. Run performance tests

### Schema Updates
For future schema changes:
1. Create migration script
2. Test on development database
3. Backup production database
4. Apply migration during maintenance window
5. Verify data integrity

## Troubleshooting

### Common Issues

#### Connection Problems
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql -h localhost -U domainflow -d domainflow_production -c "SELECT 1;"
```

#### Performance Issues
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE tablename = 'campaigns';
```

#### Storage Issues
```sql
-- Check table sizes
SELECT 
    schemaname, 
    tablename, 
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Schema Architecture & Constraint Management

### Status Field Separation Architecture

DomainFlow implements a critical architectural pattern for status field separation to prevent database constraint violations:

#### System vs Business Status Fields

**System Status Fields (`status`)**
- **Purpose**: Track technical processing states
- **Values**: `pending`, `running`, `completed`, `failed`, `cancelled`
- **Scope**: Universal across all campaign types
- **Usage**: Job processing, workflow management, system operations

**Business Status Fields (`business_status`)**
- **Purpose**: Track domain-specific validation results
- **Values**: Domain-specific (e.g., `valid_dns`, `lead_valid`, `http_valid_no_keywords`)
- **Scope**: Specific to campaign/validation type
- **Usage**: Business logic, result interpretation, user-facing status

#### Implementation Guidelines

**✅ CORRECT Implementation:**
```sql
-- DNS Validation Results - Both status fields included
INSERT INTO dns_validation_results (
    id, campaign_id, domain_name, record_type, record_value,
    is_valid, response_time_ms, error_message,
    status, business_status, checked_at           -- Both fields present
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);

-- HTTP Keyword Results - Both status fields included
INSERT INTO http_keyword_results (
    id, campaign_id, url, keyword, found, occurrences,
    context, response_code, response_time_ms,
    status, business_status, checked_at           -- Both fields present
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
```

**❌ INCORRECT Implementation:**
```sql
-- Missing business_status field - WILL CAUSE CONSTRAINT VIOLATIONS
INSERT INTO dns_validation_results (
    id, campaign_id, domain_name, record_type, record_value,
    is_valid, response_time_ms, error_message,
    status, checked_at                           -- Missing business_status!
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
```

### Constraint Violation Prevention

#### Common Violation Scenarios
1. **Missing business_status in INSERT queries** - Most common cause
2. **Status value type mismatch** - System status in business field or vice versa
3. **Enum constraint violations** - Invalid status values for field type

#### Verification Checklist
```bash
# 1. Verify both status fields in all result INSERT queries
cd backend
grep -r "INSERT INTO.*_results" internal/store/postgres/ | \
  grep -E "(status.*business_status|business_status.*status)"

# 2. Run comprehensive tests
go test -race -v ./internal/services -run "Campaign.*Service"

# 3. Check for constraint violations in logs
docker-compose logs backend 2>&1 | grep -i "constraint\|violation"

# 4. Validate database schema compliance
psql -d domainflow_dev -c "
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name LIKE '%_results' AND column_name LIKE '%status%'
ORDER BY table_name, column_name;
"
```

#### Monitoring & Alerting
```sql
-- Query to identify potential constraint issues
SELECT
    table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN status IS NULL THEN 1 END) as null_status,
    COUNT(CASE WHEN business_status IS NULL THEN 1 END) as null_business_status
FROM (
    SELECT 'dns_validation_results' as table_name, status, business_status FROM dns_validation_results
    UNION ALL
    SELECT 'http_keyword_results' as table_name, status, business_status FROM http_keyword_results
) combined
GROUP BY table_name;
```

## Default Data

### Admin User
```sql
-- Default admin user (change password in production)
INSERT INTO users (id, username, email, password_hash, role, is_active)
VALUES (
    gen_random_uuid(),
    'admin',
    'admin@domainflow.local',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYb0sUXM1p8z1pe',
    'admin',
    true
);
```

**Note**: Default password is `TempPassword123!` - **CHANGE IMMEDIATELY** in production.

## References

- PostgreSQL Documentation: https://www.postgresql.org/docs/
- UUID Best Practices: https://www.postgresql.org/docs/current/uuid-ossp.html
- JSON/JSONB Usage: https://www.postgresql.org/docs/current/datatype-json.html
- Performance Tuning: https://wiki.postgresql.org/wiki/Performance_Optimization

---

For database-related questions or issues, refer to the PostgreSQL documentation or contact the development team.
