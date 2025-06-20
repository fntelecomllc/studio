# Frontend TypeScript/React Contracts Extraction Report

**Phase 1, Part 3: TypeScript/React Frontend Contract Analysis**
**Generated:** 2025-01-20 10:20 UTC

This report catalogs ALL TypeScript interfaces, types, and API client implementations from the frontend to enable comparison against the Go backend contracts (source of truth).

## Table of Contents

1. [Core Type System](#1-core-type-system)
2. [API Client Implementations](#2-api-client-implementations)
3. [Validation Schemas](#3-validation-schemas)
4. [WebSocket Contracts](#4-websocket-contracts)
5. [Generated API Client Types](#5-generated-api-client-types)
6. [Type Transformations](#6-type-transformations)
7. [State Management Types](#7-state-management-types)
8. [Form Contracts](#8-form-contracts)

---

## 1. Core Type System

### 1.1 Branded Types (`src/lib/types/branded.ts`)

**Purpose:** Ensures type safety for int64 values and other critical data types to prevent JavaScript numeric overflow issues.

```typescript
// Core branded types
export type SafeBigInt = Brand<bigint, 'SafeBigInt'>;
export type UUID = Brand<string, 'UUID'>;
export type ISODateString = Brand<string, 'ISODateString'>;
export type Email = Brand<string, 'Email'>;
export type URL = Brand<string, 'URL'>;

// Constants for int64 safety
export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991
export const MIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER; // -9,007,199,254,740,991
export const GO_INT64_MAX = BigInt("9223372036854775807");
export const GO_INT64_MIN = BigInt("-9223372036854775808");
```

**Key Functions:**
- `createSafeBigInt(value: string | number | bigint): SafeBigInt`
- `createUUID(value: string): UUID`
- `createISODateString(value: string | Date): ISODateString`
- `toNumber(value: SafeBigInt): number` (throws if unsafe)
- `tryToNumber(value: SafeBigInt): number | null`

### 1.2 Cross-Stack Sync Types (`src/lib/types/cross-stack-sync.ts`)

**Purpose:** Maintains perfect alignment between database schema, backend Go structs, and frontend TypeScript types.

```typescript
// Validation Status Enums
export const ValidationStatus = {
  PENDING: 'pending',
  VALID: 'valid',
  INVALID: 'invalid',
  ERROR: 'error',
  SKIPPED: 'skipped',
} as const;

export const CampaignStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSING: 'pausing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled',
} as const;

export const CampaignType = {
  DOMAIN_GENERATION: 'domain_generation',
  DNS_VALIDATION: 'dns_validation',
  HTTP_KEYWORD_VALIDATION: 'http_keyword_validation',
} as const;

export const PersonaType = {
  DNS: 'dns',
  HTTP: 'http',
} as const;

export const ProxyProtocol = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS4: 'socks4',
  SOCKS5: 'socks5',
} as const;
```

**Key Interfaces:**

```typescript
// Session Security
export interface SessionSecurity {
  id: string;                      // VARCHAR(128) PRIMARY KEY
  userId: string;                  // UUID REFERENCES auth.users(id)
  ipAddress?: string;              // INET
  userAgent?: string;              // TEXT
  userAgentHash?: string;          // VARCHAR(64) - SHA-256 hash
  sessionFingerprint?: string;     // VARCHAR(255) - SHA-256 hash
  browserFingerprint?: string;     // TEXT - Enhanced fingerprinting
  screenResolution?: string;       // VARCHAR(20)
  isActive: boolean;               // BOOLEAN DEFAULT TRUE
  expiresAt: string;              // TIMESTAMP NOT NULL
  lastActivityAt: string;         // TIMESTAMP
  createdAt: string;              // TIMESTAMP
}

// User Security
export interface UserSecurity {
  id: string;                      // UUID PRIMARY KEY
  email: string;                   // VARCHAR(255) UNIQUE NOT NULL
  emailVerified: boolean;          // BOOLEAN DEFAULT FALSE
  firstName: string;               // VARCHAR(100) NOT NULL
  lastName: string;                // VARCHAR(100) NOT NULL
  avatarUrl?: string;              // TEXT
  isActive: boolean;               // BOOLEAN DEFAULT TRUE
  isLocked: boolean;               // BOOLEAN DEFAULT FALSE
  failedLoginAttempts: number;     // INTEGER DEFAULT 0
  lockedUntil?: string;            // TIMESTAMP
  lastLoginAt?: string;            // TIMESTAMP
  lastLoginIp?: string;            // INET
  passwordChangedAt: string;       // TIMESTAMP
  mustChangePassword: boolean;     // BOOLEAN DEFAULT FALSE
  mfaEnabled: boolean;             // BOOLEAN DEFAULT FALSE
  mfaLastUsedAt?: string;          // TIMESTAMP
  createdAt: string;               // TIMESTAMP
  updatedAt: string;               // TIMESTAMP
  roles: RoleSecurity[];
  permissions: PermissionSecurity[];
}

// Campaign Synced
export interface CampaignSynced {
  id: string;                      // UUID PRIMARY KEY
  name: string;                    // TEXT NOT NULL
  campaignType: CampaignTypeType;  // TEXT NOT NULL CHECK
  status: CampaignStatusType;      // TEXT NOT NULL
  userId?: string;                 // UUID REFERENCES auth.users(id)
  totalItems?: number;             // BIGINT DEFAULT 0
  processedItems?: number;         // BIGINT DEFAULT 0
  successfulItems?: number;        // BIGINT DEFAULT 0
  failedItems?: number;            // BIGINT DEFAULT 0
  progressPercentage?: number;     // DOUBLE PRECISION DEFAULT 0.0
  metadata?: Record<string, unknown>; // JSONB
  createdAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updatedAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  startedAt?: string;              // TIMESTAMPTZ
  completedAt?: string;            // TIMESTAMPTZ
  errorMessage?: string;           // TEXT
  estimatedCompletionAt?: string;  // TIMESTAMPTZ
  avgProcessingRate?: number;      // DOUBLE PRECISION
  lastHeartbeatAt?: string;        // TIMESTAMPTZ
}
```

### 1.3 Aligned Models (`src/lib/types/models-aligned.ts`)

**Purpose:** Corrected API models that match Go backend exactly, handling int64 fields with SafeBigInt.

```typescript
// Campaign API model with SafeBigInt for int64 fields
export interface ModelsCampaignAPI {
  id?: UUID;
  name?: string;
  campaignType?: ModelsCampaignTypeEnum;
  status?: ModelsCampaignStatusEnum;
  userId?: UUID;
  
  // CRITICAL: These MUST be SafeBigInt, not number
  totalItems?: SafeBigInt;
  processedItems?: SafeBigInt;
  successfulItems?: SafeBigInt;
  failedItems?: SafeBigInt;
  
  progressPercentage?: number; // float64 - safe as number
  metadata?: Record<string, unknown>;
  
  // Timestamps
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  estimatedCompletionAt?: ISODateString;
  lastHeartbeatAt?: ISODateString;
  
  errorMessage?: string;
  avgProcessingRate?: number; // float64 - safe as number
}

// Domain Generation Parameters
export interface ServicesDomainGenerationParams {
  patternType: 'prefix' | 'suffix' | 'both';
  variableLength?: number; // int32 - safe
  characterSet?: string;
  constantString?: string;
  tld: string;
  numDomainsToGenerate?: number; // int32 - safe
  
  // CRITICAL: These are int64 in backend
  totalPossibleCombinations: SafeBigInt;
  currentOffset: SafeBigInt;
}

// Generated Domain with int64
export interface ModelsGeneratedDomainAPI {
  id: UUID;
  generationCampaignId: UUID;
  domainName: string;
  offsetIndex: SafeBigInt; // CRITICAL: int64 field
  generatedAt: ISODateString;
  sourceKeyword?: string;
  sourcePattern?: string;
  tld?: string;
  createdAt: ISODateString;
}
```

**Critical Enum Corrections:**
- `ModelsCampaignStatusEnum` excludes 'archived' (not in backend)
- HTTP source types use exact casing: 'DomainGeneration', 'DNSValidation' (not snake_case)

### 1.4 Unified Types (`src/lib/types/unifiedTypes.ts`)

Simple constant definitions for enums used across the application.

---

## 2. API Client Implementations

### 2.1 Base Session API Client (`src/lib/api/client.ts`)

**Features:**
- Session-based authentication with cookies
- Automatic retry with exponential backoff
- Unified error response handling
- Request timeout support

```typescript
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown> | FormData | string | null;
  timeout?: number;
  retries?: number;
  skipAuth?: boolean;
}

// Unified error response format
interface UnifiedErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      field?: string;
      code: string;
      message: string;
      context?: unknown;
    }>;
    timestamp: string;
    path?: string;
  };
  request_id: string;
}

// Key configuration
const config: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest', // Session-based protection
  },
  credentials: 'include', // Include cookies for session auth
};
```

### 2.2 API Client Wrapper (`src/lib/api/api-client-wrapper.ts`)

**Features:**
- Runtime validation for all responses
- SafeBigInt transformation support
- Axios interceptor configuration
- Performance monitoring integration

```typescript
// Transform functions with validation
export function transformCampaignApiResponse(
  response: AxiosResponse<unknown>
): ModelsCampaignAPI {
  const startTime = performance.now();
  
  try {
    const result = validateApiResponse(response, validateCampaignResponse, 'campaign');
    
    // Record transformation performance
    const duration = performance.now() - startTime;
    performanceMonitor.recordCustomMetric(
      'campaign_transform_duration',
      duration,
      'ms'
    );
    
    return result;
  } catch (error) {
    performanceMonitor.recordCustomMetric(
      'campaign_transform_failure',
      1,
      'count'
    );
    throw error;
  }
}

// Axios interceptor for automatic int64 transformation
export function configureAxiosForSafeBigInt(axiosInstance): void {
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      // Transform based on endpoint
      if (url.includes('/campaigns')) {
        // Transform int64 fields to SafeBigInt
      }
    }
  );
}
```

### 2.3 Enhanced API Client (`src/lib/api/enhanced-api-client.ts`)

**Features:**
- Request deduplication
- Response caching (TTL: 60s for GET)
- Request/response interceptors
- Automatic int64 transformation

```typescript
class EnhancedApiClient {
  private pendingRequests = new Map<string, PendingRequest>();
  private responseCache = new Map<string, { data: unknown; timestamp: number }>();
  
  // Configuration
  private readonly DEDUP_TIMEOUT = 5000; // 5 seconds
  private readonly CACHE_TTL = 60000; // 1 minute for GET requests
  private readonly MAX_CACHE_SIZE = 100;
  
  // Int64 transformation interceptor
  private transformInt64Fields(data: unknown): unknown {
    const int64Fields = [
      'totalItems', 'processedItems', 'successfulItems', 'failedItems',
      'offsetIndex', 'totalPossibleCombinations', 'currentOffset'
    ];
    // Transform fields to SafeBigInt
  }
}
```

### 2.4 Monitored API Client (`src/lib/api/monitored-api-client.ts`)

**Features:**
- Integrated performance monitoring
- Request timing and error tracking
- Wraps base API client with monitoring

```typescript
class MonitoredApiClient {
  private async executeWithMonitoring<T>(
    operation: () => Promise<ApiResponse<T>>,
    url: string,
    method: string
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const requestId = monitoringService.startApiRequest(url, method);

    try {
      const response = await operation();
      const status = response.status === 'success' ? 200 : 500;
      monitoringService.endApiRequest(requestId, url, method, startTime, status);
      return response;
    } catch (error) {
      monitoringService.recordApiError(url, method, startTime, error as Error);
      throw error;
    }
  }
}
```

---

## 3. Validation Schemas

### 3.1 Aligned Validation Schemas (`src/lib/schemas/alignedValidationSchemas.ts`)

**Purpose:** Zod schemas matching backend validation rules exactly.

```typescript
// Authentication
export const loginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  rememberMe: z.boolean().optional(),
  captchaToken: z.string().optional()
});

// Campaign Creation
export const createCampaignRequestSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  campaignType: z.enum(['domain_generation', 'dns_validation', 'http_keyword_validation']),
  domainGenerationParams: domainGenerationParamsSchema.optional(),
  dnsValidationParams: dnsValidationParamsSchema.optional(),
  httpKeywordParams: httpKeywordParamsSchema.optional()
}).superRefine((data, ctx) => {
  // Conditional validation based on campaign type
});

// Domain Generation with SafeBigInt
export const domainGenerationParamsSchema = z.object({
  patternType: z.enum(['prefix', 'suffix', 'both']),
  variableLength: z.number().int().positive().optional(),
  characterSet: z.string().optional(),
  constantString: z.string().optional(),
  tld: z.string().min(1, 'TLD is required'),
  numDomainsToGenerate: z.number().int().positive('Must be a positive number'),
  totalPossibleCombinations: safeBigIntSchema,
  currentOffset: safeBigIntSchema.optional()
});
```

### 3.2 Campaign Form Schema (`src/lib/schemas/campaignFormSchema.ts`)

```typescript
export const campaignFormSchema = baseCampaignSchema
  .merge(domainSourceSchema)
  .merge(domainGenerationSchema)
  .merge(leadGenerationSchema)
  .transform(data => {
    // Transform TLDs input to array
    if (data.tldsInput) {
      data.tlds = data.tldsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 1 && t.startsWith('.'));
    }
    return data;
  })
  .superRefine((data, ctx) => {
    // Complex validation logic
  });
```

### 3.3 WebSocket Message Schema (`src/lib/schemas/websocketMessageSchema.ts`)

```typescript
// Base WebSocket message schema
export const webSocketMessageSchema = z.object({
  type: z.string(),
  timestamp: z.string().datetime(),
  data: z.unknown(),
});

// Campaign progress with SafeBigInt
export const campaignProgressPayloadSchema = z.object({
  campaignId: uuidSchema,
  totalItems: safeBigIntSchema,
  processedItems: safeBigIntSchema,
  successfulItems: safeBigIntSchema,
  failedItems: safeBigIntSchema,
  progressPercent: z.number().min(0).max(100),
  currentSpeed: z.number().optional(),
  estimatedTimeRemaining: z.number().optional(),
});

// Typed message union
export const typedWebSocketMessageSchema = z.discriminatedUnion('type', [
  campaignProgressMessageSchema,
  campaignStatusMessageSchema,
  domainResultMessageSchema,
  systemStatusMessageSchema,
  errorMessageSchema,
]);
```

---

## 4. WebSocket Contracts

### 4.1 Fixed WebSocket Types (`src/lib/types/websocket-types-fixed.ts`)

**Critical Fix:** Frontend WebSocket message structure was misaligned with backend.

```typescript
// Correct message structure (matches Go backend)
export interface WebSocketMessage {
  type: string;       // Message type identifier
  timestamp: string;  // ISO 8601 timestamp string
  data: unknown;      // Payload specific to message type
}

// Message types
export const WebSocketMessageTypes = {
  CAMPAIGN_PROGRESS: 'campaign.progress',
  CAMPAIGN_STATUS: 'campaign.status',
  DOMAIN_GENERATED: 'domain.generated',
  DNS_VALIDATION_RESULT: 'dns.validation.result',
  HTTP_VALIDATION_RESULT: 'http.validation.result',
  SYSTEM_NOTIFICATION: 'system.notification',
  PROXY_STATUS: 'proxy.status',
  ERROR: 'error'
} as const;

// Payload interfaces with SafeBigInt
export interface CampaignProgressPayload {
  campaignId: string;
  totalItems: SafeBigInt;        // int64 from backend
  processedItems: SafeBigInt;    // int64 from backend
  successfulItems: SafeBigInt;   // int64 from backend
  failedItems: SafeBigInt;       // int64 from backend
  progressPercent: number;       // float64 - safe as number
  phase: string;
  status: string;
}

// Message parser with int64 handling
export function parseWebSocketMessage(raw: string): TypedWebSocketMessage | null {
  try {
    const parsed = JSON.parse(raw);
    
    if (!isWebSocketMessage(parsed)) {
      console.error('Invalid WebSocket message format:', parsed);
      return null;
    }
    
    // Transform based on message type
    switch (parsed.type) {
      case WebSocketMessageTypes.CAMPAIGN_PROGRESS: {
        const data = parsed.data as Record<string, unknown>;
        return {
          ...parsed,
          type: WebSocketMessageTypes.CAMPAIGN_PROGRESS,
          data: {
            campaignId: data.campaignId,
            totalItems: createSafeBigInt(data.totalItems as string | number),
            processedItems: createSafeBigInt(data.processedItems as string | number),
            successfulItems: createSafeBigInt(data.successfulItems as string | number),
            failedItems: createSafeBigInt(data.failedItems as string | number),
            progressPercent: data.progressPercent,
            phase: data.phase,
            status: data.status
          }
        } as CampaignProgressMessage;
      }
      // ... other message types
    }
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
    return null;
  }
}
```

---

## 5. Generated API Client Types

### 5.1 Campaign API Model (Generated)

**File:** `src/lib/api-client/models/models-campaign-api.ts`

```typescript
export interface ModelsCampaignAPI {
    'avgProcessingRate'?: number;
    'campaignType'?: ModelsCampaignTypeEnum;
    'completedAt'?: string;
    'createdAt'?: string;
    'errorMessage'?: string;
    'estimatedCompletionAt'?: string;
    'failedItems'?: number;        // WARNING: Should be SafeBigInt
    'id'?: string;
    'lastHeartbeatAt'?: string;
    'metadata'?: object;
    'name'?: string;
    'processedItems'?: number;     // WARNING: Should be SafeBigInt
    'progressPercentage'?: number;
    'startedAt'?: string;
    'status'?: ModelsCampaignStatusEnum;
    'successfulItems'?: number;    // WARNING: Should be SafeBigInt
    'totalItems'?: number;         // WARNING: Should be SafeBigInt
    'updatedAt'?: string;
    'userId'?: string;
}
```

**Issue:** Generated types use `number` for int64 fields, requiring transformation.

### 5.2 Service Request Types (Generated)

```typescript
// Campaign creation request
export interface ServicesCreateCampaignRequest {
    'campaignType': ServicesCreateCampaignRequestCampaignTypeEnum;
    'description'?: string;
    'dnsValidationParams'?: ServicesDnsValidationParams;
    'domainGenerationParams'?: ServicesDomainGenerationParams;
    'httpKeywordParams'?: ServicesHttpKeywordParams;
    'name': string;
    'userId'?: string;
}

// Domain generation parameters
export interface ServicesDomainGenerationParams {
    'characterSet': string;
    'constantString': string;
    'numDomainsToGenerate'?: number;
    'patternType': ServicesDomainGenerationParamsPatternTypeEnum;
    'tld': string;
    'variableLength': number;
    // WARNING: Missing totalPossibleCombinations and currentOffset
}

// DNS validation parameters
export interface ServicesDnsValidationParams {
    'batchSize'?: number;
    'personaIds': Array<string>;
    'processingSpeedPerMinute'?: number;
    'retryAttempts'?: number;
    'rotationIntervalSeconds'?: number;
    'sourceCampaignId': string;
}

// HTTP keyword parameters
export interface ServicesHttpKeywordParams {
    'adHocKeywords'?: Array<string>;
    'batchSize'?: number;
    'keywordSetIds'?: Array<string>;
    'personaIds': Array<string>;
    'processingSpeedPerMinute'?: number;
    'proxyPoolId'?: string;
    'proxySelectionStrategy'?: string;
    'retryAttempts'?: number;
    'rotationIntervalSeconds'?: number;
    'sourceCampaignId': string;
    'targetHttpPorts'?: Array<number>;
    // WARNING: Missing sourceType field
}
```

---

## 6. Type Transformations

### 6.1 Transform Utilities (`src/lib/types/transform.ts`)

```typescript
export class TypeTransformer {
  // Transform raw ID to branded UUID
  static toUUID(value: string | undefined | null): UUID | undefined {
    if (!value) return undefined;
    if (!isValidUUID(value)) {
      console.warn(`Invalid UUID format: ${value}`);
      return undefined;
    }
    return value as UUID;
  }

  // Transform raw number to SafeBigInt
  static toSafeBigInt(value: number | string | undefined | null): SafeBigInt | undefined {
    if (value === undefined || value === null) return undefined;
    return createSafeBigInt(value);
  }

  // Transform campaign object
  static transformCampaign(raw: RawAPIData): Campaign {
    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      userId: this.toUUID(raw.userId as string),
      totalItems: this.toSafeBigInt(raw.totalItems as number),
      processedItems: this.toSafeBigInt(raw.processedItems as number),
      successfulItems: this.toSafeBigInt(raw.successfulItems as number),
      failedItems: this.toSafeBigInt(raw.failedItems as number),
      // ... timestamps
    } as Campaign;
  }
}
```

### 6.2 API Response Transformers

```typescript
// Auth transformer (src/lib/api/transformers/auth-transformers.ts)
export function transformLoginResponse(raw: ModelsLoginResponseAPI): LoginResponseAPIAligned {
  const rawWithCaptcha = raw as ModelsLoginResponseAPI & {
    requiresCaptcha?: boolean;
    requires_captcha?: boolean
  };
  
  return {
    error: raw.error,
    expiresAt: raw.expiresAt ? createISODateString(raw.expiresAt) : undefined,
    // Fix field name mismatch
    requiresCaptcha: rawWithCaptcha.requiresCaptcha ?? rawWithCaptcha.requires_captcha,
    sessionId: raw.sessionId,
    success: raw.success,
    user: raw.user ? transformUserResponse(raw.user) : undefined,
  };
}

// Campaign transformer (src/lib/api/transformers/campaign-transformers.ts)
export function transformCampaignResponse(raw: ModelsCampaignAPI | undefined | null): CampaignAPIAligned {
  if (!raw) return {};
  
  return {
    // ... other fields
    failedItems: raw.failedItems != null ? createSafeBigInt(raw.failedItems) : undefined,
    processedItems: raw.processedItems != null ? createSafeBigInt(raw.processedItems) : undefined,
    successfulItems: raw.successfulItems != null ? createSafeBigInt(raw.successfulItems) : undefined,
    totalItems: raw.totalItems != null ? createSafeBigInt(raw.totalItems) : undefined,
    // ... timestamps
  };
}
```

---

## 7. State Management Types

### 7.1 Auth Store (`src/lib/stores/auth.ts`)

Uses cross-stack synced types for user and session management.

### 7.2 Loading Store (`src/lib/stores/loadingStore.ts`)

Manages global loading states across the application.

---

## 8. Form Contracts

### 8.1 Campaign Form Values

```typescript
export type CampaignFormValues = z.infer<typeof campaignFormSchema>;

// Form includes:
// - Base campaign info (name, description, type)
// - Domain source configuration
// - Domain generation configuration
// - Lead generation configuration (deprecated)
// - Persona assignments
// - Proxy assignments
```

### 8.2 Form Helpers

```typescript
export const getDefaultSourceMode = (type: CampaignSelectedType | undefined | null): 'none' | 'upload' | 'campaign_output' => {
  if (type === "dns_validation" || type === "http_keyword_validation") return "upload";
  return "none";
};

export const needsHttpPersona = (selectedType?: CampaignSelectedType) => 
  selectedType === "http_keyword_validation";

export const needsDnsPersona = (selectedType?: CampaignSelectedType) => 
  selectedType === "dns_validation";
```

---

## Key Findings and Discrepancies

### 1. Int64 Handling
- Frontend correctly uses `SafeBigInt` for int64 values
- Generated API client incorrectly uses `number` - requires transformation
- WebSocket messages need explicit int64 field transformation

### 2. Field Name Mismatches
- Login response: `requiresCaptcha` vs `requires_captcha`
- HTTP source type: Must use exact casing ('DomainGeneration' not 'domain_generation')
- Some snake_case vs camelCase inconsistencies

### 3. Missing Fields in Generated Types
- `ServicesDomainGenerationParams` missing `totalPossibleCombinations` and `currentOffset`
- `ServicesHttpKeywordParams` missing `sourceType` field

### 4. Enum Discrepancies
- Frontend includes 'archived' status, backend does not
- Case sensitivity in enum values

### 5. WebSocket Contract Issues
- Frontend had incorrect message structure (fixed in websocket-types-fixed.ts)
- Message payloads need int64 transformation

### 6. Type Safety Enhancements
- Extensive use of branded types for compile-time safety
- Zod schemas for runtime validation
- Multiple layers of transformation and validation

### 7. API Client Architecture
- Multiple client implementations with different features
- Session-based authentication with cookie handling
- Comprehensive error handling and monitoring

This comprehensive extraction provides the foundation for comparing frontend contracts against the Go backend to ensure complete alignment.