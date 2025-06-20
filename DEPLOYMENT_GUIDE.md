# DomainFlow Contract Alignment Deployment Guide

**Version**: 3.0.0  
**Date**: June 20, 2025  
**Criticality**: HIGH - Contains database migrations and API contract changes

## Overview

This guide provides step-by-step instructions for deploying the contract alignment fixes to production. The deployment includes database migrations, frontend updates, and backend verification steps.

## Pre-Deployment Checklist

### 1. Backup Requirements
- [ ] Full database backup completed
- [ ] Frontend code backed up
- [ ] Backend binary backed up
- [ ] Configuration files backed up

### 2. Environment Verification
- [ ] Database connection verified
- [ ] Backend API health check passing
- [ ] Frontend build successful
- [ ] All tests passing

### 3. Team Coordination
- [ ] Maintenance window scheduled
- [ ] Team notified of deployment
- [ ] Rollback plan reviewed
- [ ] On-call engineer assigned

---

## Database Migration Sequence

### Step 1: Verify Database Connection
```bash
cd backend
# Test database connection
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT version();"
```

### Step 2: Create Migration Backup Point
```bash
# Create pre-migration backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > backup_pre_migration_$(date +%Y%m%d_%H%M%S).sql
```

### Step 3: Apply Migrations in Order

**IMPORTANT**: Apply migrations in this exact sequence:

```bash
cd migrations/contract_alignment

# 1. Critical Int64 Fields
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f 001_critical_int64_fields.sql

# 2. Missing Required Columns
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f 002_missing_required_columns.sql

# 3. Enum Constraints Alignment
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f 003_enum_constraints_alignment.sql

# 4. Naming Convention Fixes
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f 004_naming_convention_fixes.sql
```

### Step 4: Verify Migration Success
```bash
# Check migration tracking
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT * FROM schema_migrations ORDER BY applied_at;"

# Verify critical tables
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\d campaigns"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "\d domain_generation_campaign_params"
```

---

## Frontend Deployment Steps

### Step 1: Build Frontend with Contract Fixes
```bash
# Install dependencies
npm install

# Run all tests
npm test

# Build production bundle
npm run build

# Verify build output
ls -la .next/
```

### Step 2: Deploy Frontend Code
```bash
# Deploy to production (adjust for your deployment method)
npm run deploy:production

# Or if using Docker:
docker build -t domainflow-frontend:3.0.0 .
docker push your-registry/domainflow-frontend:3.0.0
```

### Step 3: Verify Frontend Deployment
```bash
# Check application health
curl https://your-domain.com/api/health

# Verify enhanced API client is active
# Check browser console for transformation logs
```

---

## Backend Verification Steps

### Step 1: Health Check
```bash
# Verify backend is running
curl http://localhost:8080/health

# Check API version
curl http://localhost:8080/api/v2/version
```

### Step 2: Test Critical Endpoints
```bash
# Test user management endpoint (CV-010)
curl -X PUT http://localhost:8080/api/v2/admin/users/test-id \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"first_name": "Test", "last_name": "User"}'

# Test campaign creation with int64 fields
curl -X POST http://localhost:8080/api/v2/campaigns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign",
    "campaign_type": "domain_generation",
    "domain_generation_params": {
      "total_possible_combinations": "9223372036854775807"
    }
  }'
```

### Step 3: Verify WebSocket Functionality
```bash
# Connect to WebSocket and monitor messages
wscat -c ws://localhost:8080/ws -H "Authorization: Bearer $TOKEN"
```

---

## Post-Deployment Verification

### 1. Functional Tests
- [ ] Create a domain generation campaign with large numbers
- [ ] Verify campaign progress tracking works correctly
- [ ] Test user management functions
- [ ] Verify HTTP keyword campaigns include sourceType

### 2. Data Integrity Checks
```sql
-- Check for any null values in critical fields
SELECT COUNT(*) FROM campaigns WHERE total_items IS NULL;
SELECT COUNT(*) FROM campaigns WHERE status NOT IN ('pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled');

-- Verify bigint columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
AND column_name IN ('total_items', 'processed_items', 'successful_items', 'failed_items');
```

### 3. Performance Verification
- [ ] API response times within SLA
- [ ] Database query performance normal
- [ ] No increase in error rates

---

## Rollback Procedures

### If Issues Detected During Deployment

#### 1. Frontend Rollback
```bash
# Revert to previous version
npm run deploy:rollback

# Or with Docker:
docker pull your-registry/domainflow-frontend:2.9.0
docker service update --image your-registry/domainflow-frontend:2.9.0 domainflow-frontend
```

#### 2. Database Rollback
```bash
# IMPORTANT: Only if migrations need reverting
# Restore from backup
psql -h $DB_HOST -U $DB_USER -d $DB_NAME < backup_pre_migration_[timestamp].sql

# If partial rollback needed, use reverse migrations:
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f rollback/004_naming_convention_rollback.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f rollback/003_enum_constraints_rollback.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f rollback/002_missing_columns_rollback.sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f rollback/001_int64_fields_rollback.sql
```

#### 3. Backend Rollback
```bash
# Backend should not need changes, but if issues:
systemctl stop domainflow-api
cp /backup/domainflow-api-2.9.0 /usr/local/bin/domainflow-api
systemctl start domainflow-api
```

---

## Monitoring Post-Deployment

### 1. Log Monitoring
```bash
# Frontend logs
tail -f /var/log/domainflow/frontend.log | grep -E "(ERROR|WARN|transform)"

# Backend logs
tail -f /var/log/domainflow/api.log | grep -E "(ERROR|WARN|migration)"

# Database logs
tail -f /var/log/postgresql/postgresql.log | grep -E "(ERROR|FATAL)"
```

### 2. Key Metrics to Watch
- API error rates
- Response time percentiles (p50, p95, p99)
- Database connection pool usage
- Memory usage (watch for leaks)
- CPU utilization

### 3. Alert Thresholds
- Error rate > 1% - Investigate
- Error rate > 5% - Consider rollback
- Response time p95 > 2x baseline - Investigate
- Database connections > 80% - Scale or optimize

---

## Success Criteria

Deployment is considered successful when:
- [ ] All database migrations applied successfully
- [ ] Frontend deployed and health checks passing
- [ ] Backend API responding normally
- [ ] No increase in error rates after 1 hour
- [ ] All functional tests passing
- [ ] No critical alerts triggered

---

## Post-Deployment Tasks

### 1. Documentation Updates
- [ ] Update API documentation with new contracts
- [ ] Update internal wiki with deployment notes
- [ ] Log any issues encountered

### 2. Communication
- [ ] Notify team of successful deployment
- [ ] Update status page
- [ ] Send deployment summary to stakeholders

### 3. Cleanup
- [ ] Remove old backup files (keep last 3)
- [ ] Clean up deployment artifacts
- [ ] Archive deployment logs

---

## Emergency Contacts

- **On-Call Engineer**: [Phone/Slack]
- **Database Admin**: [Phone/Slack]
- **DevOps Lead**: [Phone/Slack]
- **Product Manager**: [Phone/Slack]

---

## Appendix: Common Issues

### Issue: Migration Fails with "relation does not exist"
**Solution**: Ensure migrations are applied in order. Check if previous migrations completed.

### Issue: Frontend shows type errors
**Solution**: Clear browser cache and ensure latest bundle is deployed.

### Issue: API returns snake_case instead of camelCase
**Solution**: Verify enhancedApiClient is being used and transformation is not skipped.

### Issue: Large numbers showing as scientific notation
**Solution**: Ensure SafeBigInt transformations are applied in API responses.

---

**Document Version**: 1.0  
**Last Updated**: June 20, 2025  
**Next Review**: After first production deployment