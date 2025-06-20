# M-003: Naming Convention Fix Summary

**Issue**: Systematic naming convention mismatches between backend (snake_case) and frontend (camelCase)  
**Severity**: MEDIUM  
**Status**: FIXED  
**Date**: 2025-06-20

## Overview

The DomainFlow system had 50+ fields with naming convention mismatches between the Go backend (using snake_case) and the TypeScript frontend (expecting camelCase). This caused:
- Data binding failures
- Missing fields in UI
- Manual transformation overhead
- Maintenance burden

## Root Cause

- Backend uses snake_case for JSON field names (Go convention)
- Frontend uses camelCase for property names (TypeScript/JavaScript convention)
- No automatic transformation layer existed between the two

## Solution Implemented

### 1. **Case Transformation Utilities** (`src/lib/utils/case-transformations.ts`)

Created comprehensive utilities for bidirectional case transformations:

```typescript
// Core transformation functions
snakeToCamel(str: string): string
camelToSnake(str: string): string

// Object transformation functions
snakeToCamelKeys<T>(obj: any): T
camelToSnakeKeys<T>(obj: any): T

// API-specific transformations with field overrides
transformApiResponse<T>(response: any): T
transformApiRequest<T>(request: any): T
```

### 2. **Field Mapping Overrides**

Created explicit mappings for all common fields to ensure consistent transformations:

```typescript
export const FIELD_MAPPING_OVERRIDES: Record<string, string> = {
  // IDs
  'user_id': 'userId',
  'campaign_id': 'campaignId',
  'persona_id': 'personaId',
  
  // Timestamps
  'created_at': 'createdAt',
  'updated_at': 'updatedAt',
  'last_login_at': 'lastLoginAt',
  
  // Boolean fields
  'is_active': 'isActive',
  'is_enabled': 'isEnabled',
  'email_verified': 'emailVerified',
  
  // Campaign fields
  'total_items': 'totalItems',
  'processed_items': 'processedItems',
  'campaign_type': 'campaignType',
  
  // ... 50+ more mappings
};
```

### 3. **Enhanced API Client** (`src/lib/services/apiClient.enhanced.ts`)

Updated the API client to automatically transform:
- Request bodies from camelCase to snake_case
- Response data from snake_case to camelCase
- Metadata fields in unified response format

```typescript
// Automatic transformation on requests
const transformedBody = skipTransform ? body : transformApiRequest(body);

// Automatic transformation on responses
const transformedData = skipTransform 
  ? unifiedResponse.data 
  : transformApiResponse<T>(unifiedResponse.data);
```

### 4. **Enhanced WebSocket Service** (`src/lib/services/websocketService.enhanced.ts`)

Updated WebSocket service to handle transformations:
- Incoming messages from snake_case to camelCase
- Outgoing messages from camelCase to snake_case
- Special handling for int64 fields in progress messages

### 5. **Comprehensive Test Coverage**

Created extensive tests covering:
- Basic case transformations
- Object key transformations
- Field mapping overrides
- Entity-specific transformations (Campaign, User, Persona, Proxy)
- Nested object handling
- Array transformations
- Edge cases (null, undefined, empty objects)

## Fields Fixed

### Campaign Entity
- `campaign_id` → `campaignId`
- `campaign_type` → `campaignType`
- `user_id` → `userId`
- `total_items` → `totalItems`
- `processed_items` → `processedItems`
- `successful_items` → `successfulItems`
- `failed_items` → `failedItems`
- `progress_percentage` → `progressPercentage`
- `created_at` → `createdAt`
- `updated_at` → `updatedAt`
- `started_at` → `startedAt`
- `completed_at` → `completedAt`
- `error_message` → `errorMessage`
- `domain_generation_params` → `domainGenerationParams`
- `dns_validation_params` → `dnsValidationParams`
- `http_keyword_params` → `httpKeywordParams`

### User Entity
- `user_id` → `userId`
- `email_verified` → `emailVerified`
- `first_name` → `firstName`
- `last_name` → `lastName`
- `avatar_url` → `avatarUrl`
- `is_active` → `isActive`
- `is_locked` → `isLocked`
- `failed_login_attempts` → `failedLoginAttempts`
- `locked_until` → `lockedUntil`
- `last_login_at` → `lastLoginAt`
- `last_login_ip` → `lastLoginIp`
- `mfa_enabled` → `mfaEnabled`
- `must_change_password` → `mustChangePassword`
- `password_changed_at` → `passwordChangedAt`

### Persona Entity
- `persona_id` → `personaId`
- `persona_type` → `personaType`
- `config_details` → `configDetails`
- `is_enabled` → `isEnabled`
- `created_at` → `createdAt`
- `updated_at` → `updatedAt`

### Proxy Entity
- `proxy_id` → `proxyId`
- `is_enabled` → `isEnabled`
- `is_healthy` → `isHealthy`
- `last_status` → `lastStatus`
- `last_checked_at` → `lastCheckedAt`
- `latency_ms` → `latencyMs`
- `country_code` → `countryCode`

### Domain Generation Params
- `pattern_type` → `patternType`
- `constant_string` → `constantString`
- `variable_length` → `variableLength`
- `character_set` → `characterSet`
- `num_domains_to_generate` → `numDomainsToGenerate`
- `total_possible_combinations` → `totalPossibleCombinations`
- `current_offset` → `currentOffset`

### DNS Validation Params
- `dns_servers` → `dnsServers`
- `record_types` → `recordTypes`
- `batch_size` → `batchSize`
- `source_campaign_id` → `sourceCampaignId`

### HTTP Keyword Params
- `target_url` → `targetUrl`
- `keyword_set_id` → `keywordSetId`
- `source_type` → `sourceType`
- `source_campaign_id` → `sourceCampaignId`

## Impact

### Before Fix
- Frontend received snake_case fields from backend
- Manual transformations required in components
- Inconsistent field access patterns
- Type mismatches and runtime errors

### After Fix
- Automatic bidirectional transformations
- Consistent camelCase in frontend code
- Type-safe field access
- No manual transformation needed

## Usage

### API Client
```typescript
import { enhancedApiClient } from '@/lib/services/apiClient.enhanced';

// Automatic transformation - request sent as snake_case
const response = await enhancedApiClient.post('/api/v2/campaigns', {
  name: 'My Campaign',
  campaignType: 'domain_generation',
  domainGenerationParams: {
    patternType: 'alphanumeric',
    variableLength: 8
  }
});

// Response automatically transformed to camelCase
console.log(response.data.campaignId); // Not campaign_id
```

### WebSocket
```typescript
import { getEnhancedWebSocketService } from '@/lib/services/websocketService.enhanced';

const ws = getEnhancedWebSocketService({
  onMessage: (message) => {
    // Message automatically transformed to camelCase
    if (message.type === 'campaign_progress') {
      console.log(message.data.totalItems); // Not total_items
    }
  }
});
```

### Direct Transformation
```typescript
import { transformApiResponse, transformApiRequest } from '@/lib/utils/case-transformations';

// Transform response data
const frontendData = transformApiResponse(backendResponse);

// Transform request data
const backendData = transformApiRequest(frontendRequest);
```

## Testing

Run the test suites to verify transformations:

```bash
# Unit tests for transformation utilities
npm test src/lib/utils/__tests__/case-transformations.test.ts

# Integration tests for API transformations
npm test src/lib/services/__tests__/api-naming-transformations.test.ts
```

## Migration Notes

1. The enhanced API client is backward compatible
2. Use `skipTransform: true` option to disable automatic transformation if needed
3. Existing code using manual transformations can be simplified
4. WebSocket handlers should be updated to expect camelCase fields

## Conclusion

This fix provides a robust, automatic solution to the naming convention mismatch problem. It ensures consistent data handling across the frontend while maintaining compatibility with the snake_case backend API.