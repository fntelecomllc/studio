# Contract Alignment Validation Report

**Generated:** 2025-06-20T18:55:58.044Z  
**Status:** ❌ FAILED

## Summary

- **Critical Issues:** 4
- **High Issues:** 12
- **Medium Issues:** 0
- **Low Issues:** 0

## Issues

### CRITICAL Issues

- **[backend]** Missing required endpoint: List users
  - Type: missing_endpoint
  - Expected: GET /api/v2/admin/users
  - Actual: missing

- **[backend]** Missing required endpoint: Create user
  - Type: missing_endpoint
  - Expected: POST /api/v2/admin/users
  - Actual: missing

- **[backend]** Missing required endpoint: Update user
  - Type: missing_endpoint
  - Expected: PUT /api/v2/admin/users/:id
  - Actual: missing

- **[backend]** Missing required endpoint: Delete user
  - Type: missing_endpoint
  - Expected: DELETE /api/v2/admin/users/:id
  - Actual: missing

### HIGH Issues

- **[database]** Database constraint missing enum value 'Pending'
  - Type: enum_constraint_missing
  - Expected: Pending
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Queued'
  - Type: enum_constraint_missing
  - Expected: Queued
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Running'
  - Type: enum_constraint_missing
  - Expected: Running
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Pausing'
  - Type: enum_constraint_missing
  - Expected: Pausing
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Paused'
  - Type: enum_constraint_missing
  - Expected: Paused
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Completed'
  - Type: enum_constraint_missing
  - Expected: Completed
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Failed'
  - Type: enum_constraint_missing
  - Expected: Failed
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Archived'
  - Type: enum_constraint_missing
  - Expected: Archived
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'Cancelled'
  - Type: enum_constraint_missing
  - Expected: Cancelled
  - Actual: missing
  - Field: campaigns.status

- **[database]** Database constraint missing enum value 'DomainGeneration'
  - Type: enum_constraint_missing
  - Expected: DomainGeneration
  - Actual: missing
  - Field: campaigns.campaign_type

- **[database]** Database constraint missing enum value 'DNSValidation'
  - Type: enum_constraint_missing
  - Expected: DNSValidation
  - Actual: missing
  - Field: campaigns.campaign_type

- **[database]** Database constraint missing enum value 'HTTPKeywordValidation'
  - Type: enum_constraint_missing
  - Expected: HTTPKeywordValidation
  - Actual: missing
  - Field: campaigns.campaign_type

## Recommendations

- Implement missing user management endpoints in backend
- Set up automated contract validation in CI/CD pipeline
- Use backend as single source of truth for type generation
