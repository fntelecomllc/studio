# Complex Types Usage Guide

## Overview

This guide provides comprehensive examples for working with complex types in the DomainFlow application, including nested structures, union types, branded types, and type transformations.

## Table of Contents

1. [Branded Types](#branded-types)
2. [Nested Object Structures](#nested-object-structures)
3. [Union Types and Discriminated Unions](#union-types-and-discriminated-unions)
4. [Generic Types](#generic-types)
5. [Type Transformations](#type-transformations)
6. [Websocket Message Types](#websocket-message-types)
7. [API Response Types](#api-response-types)
8. [Form Data Types](#form-data-types)

## Branded Types

### SafeBigInt Usage

```typescript
import { SafeBigInt, createSafeBigInt, safeBigIntToString } from '@/lib/types/branded';
import type { Campaign } from '@/lib/types/models-aligned';

// Working with campaign statistics
interface CampaignStats {
  campaign: Campaign;
  totalDomains: SafeBigInt;
  uniqueVisitors: SafeBigInt;
  conversionCount: SafeBigInt;
}

function calculateCampaignMetrics(stats: CampaignStats): {
  conversionRate: number;
  averageDomainsPerVisitor: number;
  remainingItems: SafeBigInt;
} {
  const totalDomains = safeBigIntToBigInt(stats.totalDomains);
  const uniqueVisitors = safeBigIntToBigInt(stats.uniqueVisitors);
  const conversions = safeBigIntToBigInt(stats.conversionCount);
  
  return {
    conversionRate: uniqueVisitors > 0n 
      ? Number((conversions * 100n) / uniqueVisitors) 
      : 0,
    averageDomainsPerVisitor: uniqueVisitors > 0n
      ? Number(totalDomains / uniqueVisitors)
      : 0,
    remainingItems: safeBigIntSubtract(
      stats.campaign.totalItems,
      stats.campaign.processedItems
    )
  };
}
```

### Tagged Types

```typescript
// Email type with validation
type Email = string & { readonly __brand: 'Email' };

function createEmail(value: string): Email {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new Error('Invalid email format');
  }
  return value as Email;
}

// UUID type
type UUID = string & { readonly __brand: 'UUID' };

function createUUID(value: string): UUID {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new Error('Invalid UUID format');
  }
  return value as UUID;
}

// Usage in interfaces
interface User {
  id: UUID;
  email: Email;
  createdAt: Date;
}
```

## Nested Object Structures

### Campaign with Nested Domain Groups

```typescript
import type { Campaign, DomainGroup, DomainItem } from '@/lib/types/models-aligned';

interface CampaignWithGroups extends Campaign {
  domainGroups: DomainGroupWithItems[];
}

interface DomainGroupWithItems extends DomainGroup {
  items: DomainItem[];
  statistics: GroupStatistics;
}

interface GroupStatistics {
  totalDomains: SafeBigInt;
  activeDomains: SafeBigInt;
  lastUpdated: Date;
  performance: {
    clickThroughRate: number;
    conversionRate: number;
    bounceRate: number;
  };
}

// Working with nested structures
function processCampaignGroups(campaign: CampaignWithGroups): void {
  campaign.domainGroups.forEach(group => {
    // Process each group
    console.log(`Group ${group.name}: ${safeBigIntToString(group.statistics.totalDomains)} domains`);
    
    // Process items within group
    group.items.forEach(item => {
      if (item.status === 'active') {
        // Process active domain
      }
    });
    
    // Check group performance
    if (group.statistics.performance.conversionRate > 0.05) {
      // High performing group
    }
  });
}
```

### Recursive Types

```typescript
// Tree structure for domain hierarchy
interface DomainNode {
  id: string;
  domain: string;
  children: DomainNode[];
  metadata: {
    level: number;
    parentId: string | null;
    isExpanded: boolean;
  };
}

// Function to work with recursive types
function flattenDomainTree(node: DomainNode): string[] {
  const domains: string[] = [node.domain];
  
  node.children.forEach(child => {
    domains.push(...flattenDomainTree(child));
  });
  
  return domains;
}
```

## Union Types and Discriminated Unions

### Campaign Status Types

```typescript
// Discriminated union for campaign states
type CampaignState = 
  | { type: 'draft'; draftId: string; lastModified: Date }
  | { type: 'scheduled'; scheduledAt: Date; timezone: string }
  | { type: 'running'; startedAt: Date; progress: number }
  | { type: 'paused'; pausedAt: Date; reason: string }
  | { type: 'completed'; completedAt: Date; results: CampaignResults }
  | { type: 'failed'; failedAt: Date; error: ErrorDetails };

interface ErrorDetails {
  code: string;
  message: string;
  stack?: string;
  retryable: boolean;
}

interface CampaignResults {
  totalProcessed: SafeBigInt;
  successCount: SafeBigInt;
  failureCount: SafeBigInt;
  metrics: Record<string, number>;
}

// Type guard functions
function isRunningCampaign(state: CampaignState): state is Extract<CampaignState, { type: 'running' }> {
  return state.type === 'running';
}

// Usage with exhaustive checking
function getCampaignStatusMessage(state: CampaignState): string {
  switch (state.type) {
    case 'draft':
      return `Draft saved ${state.lastModified.toLocaleDateString()}`;
    case 'scheduled':
      return `Scheduled for ${state.scheduledAt.toLocaleDateString()}`;
    case 'running':
      return `Running - ${state.progress}% complete`;
    case 'paused':
      return `Paused: ${state.reason}`;
    case 'completed':
      return `Completed with ${safeBigIntToString(state.results.successCount)} successes`;
    case 'failed':
      return `Failed: ${state.error.message}`;
    default:
      // This ensures exhaustive checking
      const _exhaustive: never = state;
      return _exhaustive;
  }
}
```

### API Response Types

```typescript
// Generic API response wrapper
type ApiResponse<T> = 
  | { status: 'success'; data: T; timestamp: Date }
  | { status: 'error'; error: ApiError; timestamp: Date }
  | { status: 'loading' };

interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  field?: string;
}

// Usage in components
function useApiData<T>(fetcher: () => Promise<T>) {
  const [response, setResponse] = useState<ApiResponse<T>>({ status: 'loading' });
  
  useEffect(() => {
    fetcher()
      .then(data => setResponse({ 
        status: 'success', 
        data, 
        timestamp: new Date() 
      }))
      .catch(error => setResponse({ 
        status: 'error', 
        error: transformError(error),
        timestamp: new Date()
      }));
  }, []);
  
  return response;
}
```

## Generic Types

### Paginated Response

```typescript
interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    offset: SafeBigInt;
    limit: SafeBigInt;
    total: SafeBigInt;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  metadata: {
    timestamp: Date;
    version: string;
    cached: boolean;
  };
}

// Generic function to work with paginated data
function processPaginatedData<T extends { id: string }>(
  response: PaginatedResponse<T>,
  processor: (item: T) => void
): void {
  response.items.forEach(processor);
  
  console.log(`Processed ${response.items.length} of ${safeBigIntToString(response.pagination.total)} items`);
}
```

### Generic Form Types

```typescript
// Generic form field configuration
interface FormField<T> {
  name: keyof T;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'safebigint';
  validation?: ValidationRule<T[keyof T]>[];
  transform?: {
    input: (value: any) => T[keyof T];
    output: (value: T[keyof T]) => any;
  };
}

interface ValidationRule<T> {
  validate: (value: T) => boolean;
  message: string;
}

// Campaign form configuration
const campaignFormFields: FormField<Campaign>[] = [
  {
    name: 'name',
    label: 'Campaign Name',
    type: 'text',
    validation: [
      { validate: (v) => v.length > 0, message: 'Name is required' },
      { validate: (v) => v.length <= 100, message: 'Name too long' }
    ]
  },
  {
    name: 'totalItems',
    label: 'Total Items',
    type: 'safebigint',
    transform: {
      input: (v) => createSafeBigInt(v),
      output: (v) => safeBigIntToString(v)
    }
  }
];
```

## Type Transformations

### API to Frontend Transformation

```typescript
import type { ApiCampaign, Campaign } from '@/lib/types/models-aligned';

// Transform API response to frontend model
function transformApiCampaign(apiData: ApiCampaign): Campaign {
  return {
    ...apiData,
    // Transform int64 strings to SafeBigInt
    totalItems: createSafeBigInt(apiData.totalItems),
    processedItems: createSafeBigInt(apiData.processedItems),
    successfulItems: createSafeBigInt(apiData.successfulItems),
    failedItems: createSafeBigInt(apiData.failedItems),
    
    // Transform ISO strings to Date objects
    createdAt: new Date(apiData.createdAt),
    updatedAt: new Date(apiData.updatedAt),
    startedAt: apiData.startedAt ? new Date(apiData.startedAt) : null,
    completedAt: apiData.completedAt ? new Date(apiData.completedAt) : null,
    
    // Transform nested objects
    configuration: transformConfiguration(apiData.configuration),
    domainGroups: apiData.domainGroups.map(transformDomainGroup)
  };
}

// Type-safe transformation utilities
type Transformer<TIn, TOut> = (input: TIn) => TOut;

function createBatchTransformer<TIn, TOut>(
  transformer: Transformer<TIn, TOut>
): Transformer<TIn[], TOut[]> {
  return (items) => items.map(transformer);
}

// Usage
const transformCampaigns = createBatchTransformer(transformApiCampaign);
```

### Form Data Transformation

```typescript
// Transform form values for API submission
interface CampaignFormData {
  name: string;
  description: string;
  totalItems: string; // String from input
  scheduledDate: Date | null;
  domainGroupIds: string[];
}

function transformFormToApi(formData: CampaignFormData): ApiCampaignCreate {
  return {
    name: formData.name.trim(),
    description: formData.description.trim(),
    totalItems: formData.totalItems, // API expects string for int64
    scheduledAt: formData.scheduledDate?.toISOString() || null,
    domainGroupIds: formData.domainGroupIds,
    configuration: {
      autoRetry: true,
      maxRetries: 3,
      timeoutSeconds: 30
    }
  };
}
```

## WebSocket Message Types

```typescript
// WebSocket message types with discriminated unions
type WSMessage = 
  | CampaignUpdateMessage
  | ProgressUpdateMessage
  | ErrorMessage
  | SystemMessage;

interface CampaignUpdateMessage {
  type: 'campaign_update';
  campaignId: string;
  updates: Partial<Campaign>;
  timestamp: Date;
}

interface ProgressUpdateMessage {
  type: 'progress_update';
  campaignId: string;
  progress: {
    processed: SafeBigInt;
    total: SafeBigInt;
    percentage: number;
    estimatedTimeRemaining: number; // seconds
  };
}

interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
  context?: Record<string, any>;
}

interface SystemMessage {
  type: 'system';
  subtype: 'connected' | 'disconnected' | 'heartbeat';
  data?: any;
}

// Message handler with type guards
function handleWebSocketMessage(message: WSMessage): void {
  switch (message.type) {
    case 'campaign_update':
      updateCampaignInStore(message.campaignId, message.updates);
      break;
      
    case 'progress_update':
      updateProgressBar(
        message.campaignId,
        message.progress.percentage,
        message.progress.estimatedTimeRemaining
      );
      break;
      
    case 'error':
      showErrorNotification(message.message, message.code);
      break;
      
    case 'system':
      handleSystemMessage(message);
      break;
      
    default:
      const _exhaustive: never = message;
      console.error('Unknown message type', _exhaustive);
  }
}
```

## API Response Types

### Complex Nested Response

```typescript
interface DashboardData {
  user: {
    id: string;
    email: Email;
    role: UserRole;
    preferences: UserPreferences;
  };
  campaigns: {
    active: CampaignSummary[];
    scheduled: CampaignSummary[];
    completed: CampaignSummary[];
  };
  statistics: {
    total: {
      campaigns: SafeBigInt;
      domains: SafeBigInt;
      conversions: SafeBigInt;
    };
    period: 'day' | 'week' | 'month' | 'year';
    trends: TrendData[];
  };
  notifications: Notification[];
}

interface TrendData {
  date: Date;
  metric: string;
  value: number;
  change: number; // percentage
  direction: 'up' | 'down' | 'stable';
}

// Processing complex responses
async function loadDashboard(): Promise<DashboardData> {
  const response = await apiClient.get<ApiDashboardData>('/dashboard');
  
  return {
    user: transformUser(response.data.user),
    campaigns: {
      active: response.data.campaigns.active.map(transformCampaignSummary),
      scheduled: response.data.campaigns.scheduled.map(transformCampaignSummary),
      completed: response.data.campaigns.completed.map(transformCampaignSummary)
    },
    statistics: transformStatistics(response.data.statistics),
    notifications: response.data.notifications.map(transformNotification)
  };
}
```

## Form Data Types

### Multi-Step Form Types

```typescript
// Type for multi-step campaign creation
interface CampaignWizardState {
  currentStep: 1 | 2 | 3 | 4;
  steps: {
    basics: StepBasics;
    domains: StepDomains;
    configuration: StepConfiguration;
    review: StepReview;
  };
  validation: {
    [K in keyof CampaignWizardState['steps']]: ValidationState;
  };
}

interface StepBasics {
  name: string;
  description: string;
  category: CampaignCategory;
  tags: string[];
}

interface StepDomains {
  domainGroups: Array<{
    groupId: string;
    selected: boolean;
    customization?: DomainCustomization;
  }>;
  totalDomains: SafeBigInt;
}

interface ValidationState {
  isValid: boolean;
  errors: ValidationError[];
  touched: boolean;
}

// Type-safe step navigation
function canProceedToStep(
  state: CampaignWizardState,
  targetStep: CampaignWizardState['currentStep']
): boolean {
  // Check all previous steps are valid
  for (let step = 1; step < targetStep; step++) {
    const stepKey = getStepKey(step);
    if (!state.validation[stepKey].isValid) {
      return false;
    }
  }
  return true;
}

function getStepKey(step: number): keyof CampaignWizardState['steps'] {
  const stepMap: Record<number, keyof CampaignWizardState['steps']> = {
    1: 'basics',
    2: 'domains',
    3: 'configuration',
    4: 'review'
  };
  return stepMap[step];
}
```

## Best Practices

1. **Use Type Guards**: Always implement type guard functions for union types
2. **Leverage Branded Types**: Use branded types for domain-specific values
3. **Transform at Boundaries**: Transform data at API boundaries
4. **Exhaustive Checking**: Use never type for exhaustive switch statements
5. **Generic Constraints**: Use generic constraints to ensure type safety
6. **Avoid Type Assertions**: Prefer type guards over type assertions
7. **Document Complex Types**: Add JSDoc comments for complex type structures