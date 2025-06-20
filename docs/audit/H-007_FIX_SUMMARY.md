# H-007: HTTP Source Type Case Sensitivity - FIX SUMMARY

**Issue ID**: H-007  
**Severity**: HIGH  
**Category**: API Contract Violation  
**Status**: RESOLVED ✅

## Issue Description

The backend expects HTTP keyword campaign `sourceType` field to use PascalCase values:
- `'DomainGeneration'`  
- `'DNSValidation'`

However, the frontend was missing this required field entirely in the unified campaign creation schema.

## Root Cause

The `unifiedCampaignSchema.ts` was using the wrong base schema (`httpKeywordParamsSchema`) which didn't include the `sourceType` field. The correct schema with `sourceType` exists in the generated schemas as `hTTPKeywordCampaignParamsSchema`.

## Fix Implementation

### 1. Schema Update
**File**: [`src/lib/schemas/unifiedCampaignSchema.ts`](src/lib/schemas/unifiedCampaignSchema.ts)

Added the required `sourceType` field to the enhanced HTTP keyword parameters schema:

```typescript
export const enhancedHttpKeywordParamsSchema = httpKeywordParamsSchema.extend({
  sourceType: z.enum(['DomainGeneration', 'DNSValidation']),  // Required field with PascalCase values
  // ... other fields
});
```

Also updated the `createUnifiedCampaignPayload` utility function to include `sourceType`:

```typescript
case "http_keyword_validation":
  basePayload.httpKeywordParams = {
    sourceCampaignId: formData.sourceCampaignId as string,
    sourceType: formData.sourceType as 'DomainGeneration' | 'DNSValidation',  // Required field
    // ... other fields
  };
```

### 2. Test Coverage
**File**: [`src/lib/schemas/__tests__/http-keyword-source-type-fix.test.ts`](src/lib/schemas/__tests__/http-keyword-source-type-fix.test.ts)

Created comprehensive tests that verify:
- ✅ `sourceType` field is required for HTTP keyword campaigns
- ✅ Campaigns without `sourceType` are rejected
- ✅ Only PascalCase values are accepted (snake_case is rejected)
- ✅ Both valid values ('DomainGeneration' and 'DNSValidation') work correctly

## Test Results

```
 PASS  src/lib/schemas/__tests__/http-keyword-source-type-fix.test.ts
  HTTP Keyword Campaign sourceType Field
    ✓ should require sourceType field in HTTP keyword campaigns (12 ms)
    ✓ should reject HTTP keyword campaigns without sourceType (3 ms)
    ✓ should only accept PascalCase sourceType values (3 ms)
    ✓ should accept both valid PascalCase sourceType values (4 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

## Impact Assessment

- **Data Flow**: HTTP keyword validation campaigns will now correctly include the required `sourceType` field
- **Backward Compatibility**: This is a BREAKING change - existing forms/components that create HTTP keyword campaigns must be updated to provide the `sourceType` field
- **Security**: No security impact
- **Performance**: No performance impact

## Verification Steps

1. When creating an HTTP keyword validation campaign, ensure the form includes a selection for source type
2. The sourceType value must be either 'DomainGeneration' or 'DNSValidation' (PascalCase)
3. The API will reject requests without this field or with incorrect casing

## Related Issues

This fix respects the closed-loop campaign orchestration architecture where HTTP campaigns must specify their source (either from Domain Generation or DNS Validation campaigns).

## Next Steps

UI components that create HTTP keyword campaigns need to be updated to:
1. Include a source type selector
2. Map the selected value to the correct PascalCase format
3. Pass the `sourceType` field in the form data

---

**Fixed By**: DomainFlow Development Team  
**Date**: 2025-06-20  
**Review Status**: Tests Passing ✅