# DomainFlow Type Alignment Migration Guide

## Overview

This guide helps developers migrate existing code to comply with the new type-aligned architecture, ensuring consistency between the TypeScript frontend and Go backend. Follow this guide to update your code for Phase 3 improvements.

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [SafeBigInt Migration](#safebigint-migration)
3. [Enum Migration](#enum-migration)
4. [Date/Time Migration](#datetime-migration)
5. [Array Operations Migration](#array-operations-migration)
6. [API Client Migration](#api-client-migration)
7. [Component Migration](#component-migration)
8. [Testing Migration](#testing-migration)
9. [Common Pitfalls](#common-pitfalls)
10. [Verification Steps](#verification-steps)

## Pre-Migration Checklist

Before starting migration:

- [ ] Review all int64 fields in Go backend
- [ ] Identify all API endpoints used
- [ ] List components using numeric fields
- [ ] Check for direct array mutations
- [ ] Identify string literal usage for enums
- [ ] Review date/time handling code
- [ ] Backup current codebase

## SafeBigInt Migration

### Step 1: Identify int64 Fields

Common int64 fields in DomainFlow:
- `totalItems`, `processedItems`, `successfulItems`, `failedItems`
- `offsetIndex`, `currentOffset`, `totalPossibleCombinations`
- `limit`, `offset` (pagination)
- Any count or total fields

### Step 2: Update Type Definitions

**Before:**
```typescript
interface Campaign {
  id: string;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
}
```

**After:**
```typescript
import { SafeBigInt } from '@/lib/types/branded';

interface Campaign {
  id: string;
  totalItems: SafeBigInt;
  processedItems: SafeBigInt;
  successfulItems: SafeBigInt;
  failedItems: SafeBigInt;
}
```

### Step 3: Update Component Usage

**Before:**
```typescript
function CampaignStats({ campaign }: { campaign: Campaign }) {
  const remaining = campaign.totalItems - campaign.processedItems;
  const percentage = (campaign.processedItems / campaign.totalItems) * 100;
  
  return (
    <div>
      <p>Total: {campaign.totalItems}</p>
      <p>Remaining: {remaining}</p>
      <p>Progress: {percentage.toFixed(2)}%</p>
    </div>
  );
}
```

**After:**
```typescript
import { 
  safeBigIntToString, 
  safeBigIntSubtract,
  safeBigIntToBigInt 
} from '@/lib/types/branded';

function CampaignStats({ campaign }: { campaign: Campaign }) {
  const remaining = safeBigIntSubtract(
    campaign.totalItems, 
    campaign.processedItems
  );
  
  const processed = safeBigIntToBigInt(campaign.processedItems);
  const total = safeBigIntToBigInt(campaign.totalItems);
  const percentage = total > 0n ? Number((processed * 100n) / total) : 0;
  
  return (
    <div>
      <p>Total: {safeBigIntToString(campaign.totalItems)}</p>
      <p>Remaining: {safeBigIntToString(remaining)}</p>
      <p>Progress: {percentage.toFixed(2)}%</p>
    </div>
  );
}
```

### Step 4: Update Form Handling

**Before:**
```typescript
function CampaignForm() {
  const [totalItems, setTotalItems] = useState(0);
  
  return (
    <input
      type="number"
      value={totalItems}
      onChange={(e) => setTotalItems(parseInt(e.target.value))}
    />
  );
}
```

**After:**
```typescript
import { createSafeBigInt, safeBigIntToString } from '@/lib/types/branded';

function CampaignForm() {
  const [totalItems, setTotalItems] = useState(createSafeBigInt(0));
  
  return (
    <input
      type="text"
      value={safeBigIntToString(totalItems)}
      onChange={(e) => {
        try {
          setTotalItems(createSafeBigInt(e.target.value));
        } catch (error) {
          console.error('Invalid number format');
        }
      }}
    />
  );
}
```

## Enum Migration

### Step 1: Replace String Literals

**Before:**
```typescript
const status = 'active';
const role = 'admin';

if (campaign.status === 'running') {
  // ...
}
```

**After:**
```typescript
import { CampaignStatus, UserRole } from '@/lib/types/models-aligned';

const status = CampaignStatus.ACTIVE;
const role = UserRole.ADMIN;

if (campaign.status === CampaignStatus.RUNNING) {
  // ...
}
```

### Step 2: Update Switch Statements

**Before:**
```typescript
switch (campaign.status) {
  case 'draft':
    return 'Draft';
  case 'running':
    return 'Running';
  default:
    return 'Unknown';
}
```

**After:**
```typescript
import { CampaignStatus } from '@/lib/types/models-aligned';
import { getEnumDisplayName, exhaustiveCheck } from '@/lib/utils/enum-helpers';

switch (campaign.status) {
  case CampaignStatus.DRAFT:
    return getEnumDisplayName(CampaignStatus, CampaignStatus.DRAFT);
  case CampaignStatus.RUNNING:
    return getEnumDisplayName(CampaignStatus, CampaignStatus.RUNNING);
  case CampaignStatus.PAUSED:
    return getEnumDisplayName(CampaignStatus, CampaignStatus.PAUSED);
  case CampaignStatus.COMPLETED:
    return getEnumDisplayName(CampaignStatus, CampaignStatus.COMPLETED);
  case CampaignStatus.FAILED:
    return getEnumDisplayName(CampaignStatus, CampaignStatus.FAILED);
  default:
    return exhaustiveCheck(campaign.status);
}
```

## Date/Time Migration

### Step 1: Update Date Handling

**Before:**
```typescript
const campaign = {
  createdAt: '2024-01-15T10:30:00Z',
  scheduledAt: new Date().toISOString()
};

// Display
<p>Created: {new Date(campaign.createdAt).toLocaleDateString()}</p>
```

**After:**
```typescript
import { 
  parseISOString, 
  toISOString,
  formatLocalDateTime 
} from '@/lib/utils/date-transformations';

const campaign = {
  createdAt: parseISOString('2024-01-15T10:30:00Z'),
  scheduledAt: new Date()
};

// Display
<p>Created: {formatLocalDateTime(campaign.createdAt)}</p>
```

### Step 2: Timezone-Aware Operations

**Before:**
```typescript
const scheduledTime = new Date();
scheduledTime.setHours(14, 0, 0, 0);
```

**After:**
```typescript
import { toUserTimezone, toUTC } from '@/lib/utils/date-transformations';

// Get user's timezone
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Create date in user's timezone
const scheduledTime = toUserTimezone(new Date(), userTimezone);
scheduledTime.setHours(14, 0, 0, 0);

// Convert back to UTC for API
const utcTime = toUTC(scheduledTime, userTimezone);
```

## Array Operations Migration

### Step 1: Replace Mutating Operations

**Before:**
```typescript
// Direct mutations
items.push(newItem);
items.splice(index, 1);
items.sort((a, b) => a.name.localeCompare(b.name));
items.reverse();
```

**After:**
```typescript
import { 
  arrayAdd, 
  arrayRemove, 
  arraySort,
  arrayReverse 
} from '@/lib/utils/array-operations';

// Immutable operations
items = arrayAdd(items, newItem);
items = arrayRemove(items, index);
items = arraySort(items, (a, b) => a.name.localeCompare(b.name));
items = arrayReverse(items);
```

### Step 2: Update Array Reordering

**Before:**
```typescript
function moveItem(arr: Item[], from: number, to: number) {
  const item = arr[from];
  arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr;
}
```

**After:**
```typescript
import { arrayMove } from '@/lib/utils/array-operations';

function moveItem(arr: Item[], from: number, to: number) {
  return arrayMove(arr, from, to);
}
```

## API Client Migration

### Step 1: Replace Direct API Calls

**Before:**
```typescript
import { apiClient } from '@/lib/api/client';

async function getCampaign(id: string) {
  const response = await apiClient.get(`/campaigns/${id}`);
  return response.data;
}
```

**After:**
```typescript
import { enhancedApiClient } from '@/lib/api/enhanced-api-client';
import { transformCampaignFromAPI } from '@/lib/api/transformers/campaign-transformers';

async function getCampaign(id: string) {
  const response = await enhancedApiClient.get<ApiCampaign>(`/campaigns/${id}`);
  
  if (response.status === 'success') {
    return transformCampaignFromAPI(response.data);
  }
  
  throw new Error(response.error?.message || 'Failed to fetch campaign');
}
```

### Step 2: Add Request/Response Interceptors

**Before:**
```typescript
// Manual error handling
try {
  const data = await apiCall();
  console.log('Success:', data);
  return data;
} catch (error) {
  console.error('Error:', error);
  throw error;
}
```

**After:**
```typescript
// Interceptors handle logging automatically
const response = await enhancedApiClient.get('/endpoint');
// Logging, transformation, and error handling are automatic
return response.data;
```

## Component Migration

### Step 1: Add Performance Monitoring

**Before:**
```typescript
function ExpensiveComponent({ data }: Props) {
  useEffect(() => {
    processData(data);
  }, [data]);
  
  return <div>{/* render */}</div>;
}
```

**After:**
```typescript
import { useRenderMonitor, useEffectMonitor } from '@/lib/hooks/usePerformanceMonitor';

function ExpensiveComponent({ data }: Props) {
  useRenderMonitor('ExpensiveComponent');
  
  useEffectMonitor('processData', [data], () => {
    processData(data);
  });
  
  return <div>{/* render */}</div>;
}
```

### Step 2: Add Memoization

**Before:**
```typescript
function DataTable({ items, filter }: Props) {
  const filteredItems = items.filter(item => 
    item.name.includes(filter)
  );
  
  return <Table data={filteredItems} />;
}
```

**After:**
```typescript
import { useDeepMemo } from '@/lib/utils/memoization';

function DataTable({ items, filter }: Props) {
  const filteredItems = useDeepMemo(() => 
    items.filter(item => item.name.includes(filter)),
    [items, filter]
  );
  
  return <Table data={filteredItems} />;
}
```

### Step 3: Implement Lazy Loading

**Before:**
```typescript
function ImageGallery({ images }: Props) {
  return (
    <div>
      {images.map(img => (
        <img key={img.id} src={img.url} alt={img.alt} />
      ))}
    </div>
  );
}
```

**After:**
```typescript
import { LazyLoadWrapper } from '@/lib/utils/lazy-loading';

function ImageGallery({ images }: Props) {
  return (
    <div>
      {images.map(img => (
        <LazyLoadWrapper
          key={img.id}
          placeholder={<div className="skeleton" />}
          onVisible={() => console.log(`Loading image ${img.id}`)}
        >
          <img src={img.url} alt={img.alt} />
        </LazyLoadWrapper>
      ))}
    </div>
  );
}
```

## Testing Migration

### Step 1: Update Test Data

**Before:**
```typescript
const mockCampaign = {
  id: '123',
  totalItems: 1000,
  processedItems: 500
};
```

**After:**
```typescript
import { createSafeBigInt } from '@/lib/types/branded';

const mockCampaign = {
  id: '123',
  totalItems: createSafeBigInt(1000),
  processedItems: createSafeBigInt(500)
};
```

### Step 2: Update Assertions

**Before:**
```typescript
expect(campaign.totalItems).toBe(1000);
expect(result.remaining).toBe(500);
```

**After:**
```typescript
import { safeBigIntToString } from '@/lib/types/branded';

expect(safeBigIntToString(campaign.totalItems)).toBe('1000');
expect(safeBigIntToString(result.remaining)).toBe('500');
```

## Common Pitfalls

### 1. Forgetting to Transform API Responses

```typescript
// ❌ Wrong - Raw API response
const campaign = response.data;

// ✅ Correct - Transformed response
const campaign = transformCampaignFromAPI(response.data);
```

### 2. Direct SafeBigInt Comparisons

```typescript
// ❌ Wrong
if (campaign.totalItems > campaign.processedItems) { }

// ✅ Correct
import { safeBigIntCompare } from '@/lib/types/branded';
if (safeBigIntCompare(campaign.totalItems, campaign.processedItems) > 0) { }
```

### 3. Missing Error Handling

```typescript
// ❌ Wrong
const value = createSafeBigInt(userInput);

// ✅ Correct
try {
  const value = createSafeBigInt(userInput);
} catch (error) {
  // Handle invalid input
  setError('Please enter a valid number');
}
```

### 4. Mutating Arrays

```typescript
// ❌ Wrong
items.sort();

// ✅ Correct
import { arraySort } from '@/lib/utils/array-operations';
items = arraySort(items);
```

## Verification Steps

### 1. Type Checking
```bash
npm run type-check
```

### 2. Run Tests
```bash
npm test
npm run test:integration
```

### 3. Check for Console Warnings
```javascript
// Add to app initialization
if (process.env.NODE_ENV === 'development') {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    console.error('Warning detected:', ...args);
    originalWarn(...args);
  };
}
```

### 4. Performance Verification
```javascript
// Check render performance
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';

// After migration
const metrics = performanceMonitor.getMetrics();
console.log('Performance metrics:', metrics);
```

### 5. Bundle Size Check
```bash
npm run build
npm run analyze
```

## Migration Timeline

1. **Week 1**: 
   - Update type definitions
   - Migrate API clients
   - Update transformers

2. **Week 2**:
   - Migrate components
   - Add performance monitoring
   - Update tests

3. **Verification**:
   - Run full test suite
   - Performance benchmarking
   - Code review

## Getting Help

- Review the [SafeBigInt Usage Guide](./safebigint-usage-guide.md)
- Check the [Complex Types Guide](./complex-types-guide.md)
- Ask in the #frontend-migration Slack channel
- Create a ticket for blocking issues

## Post-Migration

After completing migration:

1. Remove old type definitions
2. Delete deprecated utilities
3. Update CI/CD pipelines
4. Document any custom solutions
5. Share learnings with the team