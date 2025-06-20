# CV-007: Database Column total_items Type Mismatch - Fix Summary

## Issue Description
The `total_items` column (and related counter columns) in the campaigns table was using INTEGER type instead of BIGINT, limiting values to ~2.1 billion while the Go backend uses int64 which supports much larger values (up to 9.2 quintillion).

## Impact
- **Data Loss Risk**: Campaign counters exceeding 2,147,483,647 would overflow
- **Contract Violation**: Database schema doesn't match Go backend expectations
- **Production Risk**: Large-scale campaigns could fail unexpectedly

## Fix Implementation

### Migration Script: `cv007_campaign_bigint_fix.sql`

The migration script performs the following operations:

1. **Idempotency Check**: Verifies if columns are already BIGINT before attempting conversion
2. **Column Type Conversion**: Converts the following columns from INTEGER to BIGINT:
   - `campaigns.total_items`
   - `campaigns.processed_items`
   - `campaigns.successful_items`
   - `campaigns.failed_items`
   - `campaign_jobs.items_in_batch` (if table exists)
   - `campaign_jobs.successful_items` (if table exists)
   - `campaign_jobs.failed_items` (if table exists)

3. **Constraint Management**: 
   - Drops and recreates `chk_campaign_items_non_negative` constraint
   - Ensures all values remain non-negative

4. **Performance Optimization**:
   - Creates indexes on `total_items` and `processed_items` for large value queries

5. **Migration Tracking**: Records migration in `schema_migrations` table

### Key Features

- **Idempotent**: Can be run multiple times safely
- **Zero Downtime**: Uses `ALTER COLUMN TYPE` with USING clause
- **Data Preservation**: All existing data is preserved during conversion
- **Conditional Logic**: Only alters columns that need conversion
- **Comprehensive Logging**: Provides detailed progress messages

### Rollback Procedure

The migration includes a rollback script with important safeguards:
- Checks if any values exceed INTEGER range before attempting rollback
- Prevents data loss by failing rollback if values are too large
- Marks migration as rolled back in tracking table

## Testing

### Test Script: `cv007_test_migration.sql`

The test script validates:
1. Column types before and after migration
2. Ability to insert values > 2.1 billion
3. Constraint enforcement (non-negative values)
4. Index creation
5. Migration idempotency
6. Proper data type conversion

### Test Scenarios Covered
- Large value insertion (3 billion items)
- Multiple migration runs (idempotency)
- Constraint validation
- Type verification using `pg_typeof()`

## Verification Queries

```sql
-- Check column data types
SELECT 
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'campaigns'
AND column_name IN ('total_items', 'processed_items', 'successful_items', 'failed_items');

-- Verify constraints
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.campaigns'::regclass
AND conname = 'chk_campaign_items_non_negative';

-- Check migration status
SELECT * FROM public.schema_migrations WHERE version = 'cv007_campaign_bigint_fix';
```

## Deployment Instructions

1. **Backup Database**: Always backup before running migrations
2. **Test in Staging**: Run migration in staging environment first
3. **Execute Migration**:
   ```bash
   psql -d domainflow_db -f migrations/contract_alignment/cv007_campaign_bigint_fix.sql
   ```
4. **Verify Success**: Run verification queries
5. **Monitor Performance**: Check query performance with new BIGINT columns

## Performance Considerations

- BIGINT uses 8 bytes vs INTEGER's 4 bytes
- Minimal storage impact for existing data
- Indexes optimized for values > 0
- No significant performance degradation expected

## Related Issues
- Similar to CV-001 but specifically for campaign counter columns
- Complements migration `001_critical_int64_fields.sql`

## Resolution Status
✅ **RESOLVED** - Migration script created and tested
- Idempotent migration handles all scenarios
- Comprehensive test coverage included
- Production-ready with rollback procedure