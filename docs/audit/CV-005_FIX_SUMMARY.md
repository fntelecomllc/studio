# CV-005 Fix Summary: HTTP Keyword Campaign sourceType Field

**Issue**: The `sourceType` field exists in Go backend's HTTPKeywordCampaignParams but was incorrectly typed in TypeScript, causing validation failures.

**Root Cause**: Initial understanding was that sourceType should use values like 'file_upload', 'user_provided', 'ai_generated'. However, the system follows a closed sequential pipeline where campaigns feed into each other, so sourceType actually indicates which type of campaign the data is sourced from.

## System Architecture - Sequential Pipeline

The DomainFlow system implements a closed, sequential pipeline:

1. **Domain Generation Campaign** → Generates domains
2. **DNS Validation Campaign** → Sources domains from Domain Generation output
3. **HTTP Keyword Campaign** → Sources domains from DNS Validation output

There is **NO support** for external inputs like file uploads or manual entries at the campaign level.

## Changes Made

### 1. Type Definition Update (`src/lib/types.ts`)
```typescript
// HTTP Keyword Source Type Enum - matches backend validation exactly
// Uses the sequential pipeline: DomainGeneration -> DNSValidation -> HTTPKeyword
export type HTTPKeywordSourceType = 
  | "DomainGeneration"
  | "DNSValidation";
```

### 2. HTTPKeywordCampaignParams Interface (`src/lib/types.ts`)
```typescript
export interface HTTPKeywordCampaignParams {
  // ... other fields ...
  sourceType: HTTPKeywordSourceType;  // Now correctly typed
  // ... other fields ...
}
```

### 3. Zod Schema Updates

#### `src/lib/schemas/generated/validationSchemas.ts`
```typescript
export const hTTPKeywordCampaignParamsSchema = z.object({
  sourceCampaignId: z.string().uuid(),
  sourceType: z.enum(['DomainGeneration', 'DNSValidation']),
  // ... other fields ...
});
```

#### `src/lib/schemas/alignedValidationSchemas.ts`
```typescript
sourceType: z.enum(['DomainGeneration', 'DNSValidation'], {
  errorMap: () => ({ message: 'Source type must be one of: DomainGeneration, DNSValidation' })
}),
```

### 4. Aligned Models Update (`src/lib/types/aligned/aligned-models.ts`)
Updated HTTPKeywordParams interface to use the existing HTTPSourceType enum which already has the correct values.

### 5. Transformation Layer Update (`src/lib/types/aligned/transformation-layer.ts`)
Reverted to use the existing `normalizeHTTPSourceType` function which handles case conversion properly.

### 6. Test Coverage (`src/lib/schemas/__tests__/http-keyword-source-type-validation.test.ts`)
Created comprehensive tests that:
- Validate correct sourceType values (DomainGeneration, DNSValidation)
- Reject invalid values (file_upload, user_provided, ai_generated, etc.)
- Document the sequential pipeline architecture

## Validation

The fix ensures:
1. TypeScript types now match the Go backend's expected values
2. Zod schemas validate only 'DomainGeneration' and 'DNSValidation' values
3. The transformation layer properly handles case conversion
4. The sequential pipeline architecture is respected

## Impact

This fix resolves CV-005 by:
- Eliminating type mismatches between frontend and backend
- Preventing validation failures for valid sourceType values
- Enforcing the closed pipeline architecture at the type level
- Providing clear documentation of the system's design constraints

## Testing

Run the test to verify the fix:
```bash
npm test src/lib/schemas/__tests__/http-keyword-source-type-validation.test.ts
```

The test validates:
- ✅ Accepts 'DomainGeneration' and 'DNSValidation'
- ❌ Rejects 'file_upload', 'user_provided', 'ai_generated'
- ❌ Rejects snake_case versions
- ❌ Rejects arbitrary strings
- ❌ Rejects missing sourceType

## Notes

The initial confusion arose from misunderstanding the system architecture. The sourceType field does NOT indicate how data enters the system (file upload, user input, etc.), but rather which type of campaign in the sequential pipeline is providing the data source.

This aligns with the database schema which shows:
```sql
source_type TEXT NOT NULL CHECK (source_type IN ('DomainGeneration', 'DNSValidation'))
```

**Resolution Status**: ✅ COMPLETE