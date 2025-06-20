# SafeBigInt Usage Guide

## Overview

`SafeBigInt` is a branded type that ensures type-safe handling of 64-bit integer values between the TypeScript frontend and Go backend. This guide provides comprehensive examples and best practices for working with SafeBigInt in the DomainFlow application.

## Why SafeBigInt?

JavaScript's `number` type can only safely represent integers up to 2^53-1 (Number.MAX_SAFE_INTEGER). Go's `int64` type can represent values up to 2^63-1. To prevent data loss and ensure type safety, we use SafeBigInt for all int64 fields.

## Creating SafeBigInt Values

```typescript
import { createSafeBigInt, isSafeBigInt } from '@/lib/types/branded';

// From string (recommended for API responses)
const count1 = createSafeBigInt("9223372036854775807"); // Max int64

// From number (only for values within safe range)
const count2 = createSafeBigInt(1000000);

// From BigInt
const count3 = createSafeBigInt(BigInt("123456789012345"));

// Validation
if (isSafeBigInt(count1)) {
  console.log("Valid SafeBigInt");
}
```

## Common int64 Fields in DomainFlow

The following fields are int64 in the Go backend and must use SafeBigInt:

### Campaign Fields
```typescript
interface Campaign {
  totalItems: SafeBigInt;
  processedItems: SafeBigInt;
  successfulItems: SafeBigInt;
  failedItems: SafeBigInt;
  offsetIndex: SafeBigInt;
}
```

### Progress Fields
```typescript
interface Progress {
  totalPossibleCombinations: SafeBigInt;
  currentOffset: SafeBigInt;
}
```

### Pagination Fields
```typescript
interface PaginationParams {
  limit: SafeBigInt;
  offset: SafeBigInt;
}
```

## Working with SafeBigInt in Components

### Form Fields

```typescript
import { Controller } from 'react-hook-form';
import { createSafeBigInt, safeBigIntToString } from '@/lib/types/branded';

function CampaignForm() {
  const { control } = useForm<CampaignFormData>();

  return (
    <Controller
      name="totalItems"
      control={control}
      render={({ field }) => (
        <input
          type="text"
          value={field.value ? safeBigIntToString(field.value) : ''}
          onChange={(e) => {
            try {
              field.onChange(createSafeBigInt(e.target.value));
            } catch (error) {
              // Handle invalid input
              console.error('Invalid number format');
            }
          }}
        />
      )}
    />
  );
}
```

### Display Components

```typescript
interface CampaignStatsProps {
  campaign: Campaign;
}

function CampaignStats({ campaign }: CampaignStatsProps) {
  return (
    <div>
      <p>Total Items: {safeBigIntToString(campaign.totalItems)}</p>
      <p>Processed: {safeBigIntToString(campaign.processedItems)}</p>
      <p>Success Rate: {calculateSuccessRate(campaign)}%</p>
    </div>
  );
}

function calculateSuccessRate(campaign: Campaign): string {
  const processed = safeBigIntToBigInt(campaign.processedItems);
  const successful = safeBigIntToBigInt(campaign.successfulItems);
  
  if (processed === 0n) return "0";
  
  const rate = (successful * 100n) / processed;
  return rate.toString();
}
```

## API Integration

### Request Transformation

```typescript
import { transformCampaignToAPI } from '@/lib/api/transformers/campaign-transformers';

async function updateCampaign(campaign: Campaign) {
  // Transform SafeBigInt to string for API
  const apiData = transformCampaignToAPI(campaign);
  
  const response = await apiClient.put(
    `/campaigns/${campaign.id}`,
    apiData
  );
  
  return response;
}
```

### Response Transformation

```typescript
import { transformCampaignFromAPI } from '@/lib/api/transformers/campaign-transformers';

async function getCampaign(id: string): Promise<Campaign> {
  const response = await apiClient.get(`/campaigns/${id}`);
  
  // Transform string int64 fields to SafeBigInt
  return transformCampaignFromAPI(response.data);
}
```

## Arithmetic Operations

```typescript
import { 
  safeBigIntAdd, 
  safeBigIntSubtract, 
  safeBigIntMultiply,
  safeBigIntDivide,
  safeBigIntCompare 
} from '@/lib/types/branded';

function calculateRemaining(campaign: Campaign): SafeBigInt {
  // Subtract processed from total
  return safeBigIntSubtract(
    campaign.totalItems,
    campaign.processedItems
  );
}

function calculateProgress(campaign: Campaign): number {
  // Convert to percentage
  if (safeBigIntCompare(campaign.totalItems, createSafeBigInt(0)) === 0) {
    return 0;
  }
  
  const processed = safeBigIntToBigInt(campaign.processedItems);
  const total = safeBigIntToBigInt(campaign.totalItems);
  
  return Number((processed * 100n) / total);
}
```

## Validation

```typescript
import { z } from 'zod';
import { createSafeBigInt } from '@/lib/types/branded';

// Zod schema for SafeBigInt
const safeBigIntSchema = z.custom<SafeBigInt>(
  (value) => {
    try {
      createSafeBigInt(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid SafeBigInt value" }
);

// Campaign validation schema
const campaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  totalItems: safeBigIntSchema,
  processedItems: safeBigIntSchema,
  successfulItems: safeBigIntSchema,
  failedItems: safeBigIntSchema
});
```

## Error Handling

```typescript
function handleSafeBigIntError(value: unknown, fieldName: string): SafeBigInt {
  try {
    return createSafeBigInt(value);
  } catch (error) {
    console.error(`Invalid ${fieldName}:`, error);
    
    // Return appropriate default
    return createSafeBigInt(0);
  }
}

// Usage in API response handling
function processCampaignResponse(data: any): Campaign {
  return {
    ...data,
    totalItems: handleSafeBigIntError(data.totalItems, 'totalItems'),
    processedItems: handleSafeBigIntError(data.processedItems, 'processedItems'),
    successfulItems: handleSafeBigIntError(data.successfulItems, 'successfulItems'),
    failedItems: handleSafeBigIntError(data.failedItems, 'failedItems')
  };
}
```

## Testing

```typescript
import { createSafeBigInt, isSafeBigInt } from '@/lib/types/branded';

describe('Campaign calculations', () => {
  it('should handle large int64 values', () => {
    const campaign: Campaign = {
      totalItems: createSafeBigInt("9223372036854775807"),
      processedItems: createSafeBigInt("4611686018427387903"),
      successfulItems: createSafeBigInt("4611686018427387900"),
      failedItems: createSafeBigInt("3")
    };
    
    const remaining = calculateRemaining(campaign);
    expect(safeBigIntToString(remaining)).toBe("4611686018427387904");
  });
  
  it('should validate SafeBigInt values', () => {
    expect(isSafeBigInt(createSafeBigInt(123))).toBe(true);
    expect(isSafeBigInt("123")).toBe(false);
    expect(isSafeBigInt(123)).toBe(false);
  });
});
```

## Common Pitfalls and Solutions

### 1. Direct Number Assignment
```typescript
// ❌ Wrong - TypeScript error
campaign.totalItems = 1000;

// ✅ Correct
campaign.totalItems = createSafeBigInt(1000);
```

### 2. String Concatenation
```typescript
// ❌ Wrong - treats as object
const message = "Total: " + campaign.totalItems;

// ✅ Correct
const message = "Total: " + safeBigIntToString(campaign.totalItems);
```

### 3. JSON Serialization
```typescript
// ❌ Wrong - loses type information
JSON.stringify({ total: campaign.totalItems });

// ✅ Correct - use transformer
const serialized = JSON.stringify(
  transformCampaignToAPI(campaign)
);
```

### 4. Comparison Operations
```typescript
// ❌ Wrong - can't use > directly
if (campaign.processedItems > campaign.totalItems) { }

// ✅ Correct
if (safeBigIntCompare(campaign.processedItems, campaign.totalItems) > 0) { }
```

## Migration Checklist

When migrating existing code to use SafeBigInt:

1. **Identify all int64 fields** in your Go backend
2. **Update TypeScript interfaces** to use SafeBigInt
3. **Update API transformers** to handle conversion
4. **Update form components** to handle string input/output
5. **Update display components** to use safeBigIntToString
6. **Add validation** for user inputs
7. **Update tests** to use SafeBigInt values
8. **Handle edge cases** like null/undefined values

## Performance Considerations

- SafeBigInt operations are slightly slower than native numbers
- Use memoization for expensive calculations
- Batch operations when possible
- Consider using regular numbers for values guaranteed to be < 2^53-1

## Best Practices

1. **Always validate** user input before creating SafeBigInt
2. **Use transformers** for API communication
3. **Handle errors gracefully** with appropriate defaults
4. **Document** which fields use SafeBigInt in interfaces
5. **Test edge cases** including max int64 values
6. **Use type guards** to ensure type safety
7. **Prefer string representation** for API communication