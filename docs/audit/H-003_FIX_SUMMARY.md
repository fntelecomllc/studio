# H-003 Fix Summary: Domain Generation Parameters Int64 Fields

## Issue
**HIGH Priority Contract Violation**

The `ServicesDomainGenerationParams` interface in the generated API client was using unsafe `number` type for int64 fields, causing potential data loss for values exceeding JavaScript's MAX_SAFE_INTEGER (2^53).

### Affected Fields
- `totalPossibleCombinations`: Backend uses uint64, frontend used `number`
- `currentOffset`: Backend uses int64, frontend used `number`

## Root Cause
The OpenAPI generator was creating TypeScript interfaces with `number` type for all numeric fields, not accounting for Go's int64/uint64 types that can exceed JavaScript's safe integer range.

## Fix Applied

### 1. Updated Type Definitions
Modified `src/lib/api-client/models/services-domain-generation-params.ts`:
```typescript
// Before
'totalPossibleCombinations'?: number;
'currentOffset'?: number;

// After
'totalPossibleCombinations'?: SafeBigInt;
'currentOffset'?: SafeBigInt;
```

### 2. Added SafeBigInt Import
```typescript
import { SafeBigInt } from '../../types/branded';
```

## Test Coverage
Created comprehensive tests in `src/lib/api-client/models/__tests__/domain-generation-params-int64.test.ts`:
- ✅ Accepts SafeBigInt for totalPossibleCombinations
- ✅ Accepts SafeBigInt for currentOffset
- ✅ Handles values exceeding JavaScript safe integer limit
- ✅ Preserves precision for large int64 values
- ✅ Works with API response transformations
- ✅ Prevents numeric overflow

## Impact
This fix ensures that domain generation campaigns can handle:
- Large domain spaces (billions of combinations)
- Accurate offset tracking for campaign resumption
- Proper progress calculation without precision loss

## Related Contract Violations
This is part of the systematic int64 handling issues across the codebase. Similar fixes have been applied to:
- Campaign statistics fields (CV-009)
- WebSocket message fields
- Generated domain offset indices

## Verification
Run tests with:
```bash
npm test -- src/lib/api-client/models/__tests__/domain-generation-params-int64.test.ts
```

All tests pass successfully, confirming the fix resolves the contract violation.