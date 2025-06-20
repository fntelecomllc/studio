# H-005: Campaign Status Enum - Remove 'archived' Status

## Issue Summary
**Priority**: HIGH  
**Component**: Frontend - Generated API Client  
**Contract Violation**: Frontend includes 'archived' status not in backend  

The frontend's `ModelsCampaignStatusEnum` included an 'archived' status value that doesn't exist in the backend's `CampaignStatusEnum`. This causes a contract mismatch where the frontend could potentially send or expect a status value that the backend doesn't recognize.

## Root Cause
The generated API client was including an extra enum value ('archived') that wasn't present in the backend Go model definition. This likely occurred due to:
1. Historical changes where 'archived' was removed from backend but not frontend
2. Manual additions to the generated file
3. Incorrect OpenAPI spec generation

## Fix Applied

### 1. Removed 'archived' from Campaign Status Enum
**File**: `src/lib/api-client/models/models-campaign-status-enum.ts`

Removed the line containing `CampaignStatusArchived: 'archived'` from the enum definition.

The enum now correctly contains only the 8 status values that exist in the backend:
- pending
- queued  
- running
- pausing
- paused
- completed
- failed
- cancelled

### 2. Created Comprehensive Tests
**File**: `src/lib/api-client/models/__tests__/campaign-status-enum-fix.test.ts`

Added tests to verify:
- 'archived' status is not present
- Exactly 8 status values exist (matching backend)
- All valid backend statuses are included
- TypeScript type checking works correctly

## Verification
All tests pass successfully:
```
✓ should not include archived status (not in backend)
✓ should have exactly 8 status values (matching backend)
✓ should not have CampaignStatusArchived key
✓ should match backend enum values exactly
✓ should be usable in TypeScript type checking
```

## Impact
- **Frontend → Backend**: Frontend will no longer send 'archived' status in API requests
- **Backend → Frontend**: No impact (backend never sent 'archived' anyway)
- **Type Safety**: TypeScript will now correctly flag 'archived' as an invalid status
- **UI Components**: Any UI components checking for 'archived' status will need updates

## Migration Notes
If any frontend code was using the 'archived' status, it should be migrated to use appropriate alternatives:
- For historical campaigns, use 'completed' status
- For soft-deleted campaigns, implement a separate `deletedAt` timestamp field
- Consider adding a separate `isArchived` boolean field if archival functionality is needed

## Related Issues
- The backend API documentation (swagger comments) still mentions 'archived' as a valid enum value
- This should be fixed in a separate backend PR to update the documentation

## Prevention
To prevent this issue in the future:
1. Ensure OpenAPI spec is always generated from backend source of truth
2. Never manually edit generated API client files
3. Add contract tests that validate frontend enums against backend enums
4. Set up CI checks to detect enum mismatches

## Status
✅ **FIXED** - The 'archived' status has been removed from the frontend enum, aligning it with the backend contract.