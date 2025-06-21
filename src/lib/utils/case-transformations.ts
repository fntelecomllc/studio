/**
 * Case Transformation Utilities
 * 
 * Handles conversion between snake_case (backend) and camelCase (frontend)
 * Part of M-003: Fix Naming Convention Mismatches
 */

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Type for objects that can be transformed
 */
type TransformableObject = Record<string, unknown>;

/**
 * Transform object keys from snake_case to camelCase
 */
export function snakeToCamelKeys<T = TransformableObject>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => snakeToCamelKeys(item)) as T;
  }

  // Handle objects
  if (typeof obj === 'object' && obj !== null && obj.constructor === Object) {
    const transformed: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj as TransformableObject)) {
      const camelKey = snakeToCamel(key);
      
      // Recursively transform nested objects
      if (value !== null && typeof value === 'object') {
        transformed[camelKey] = snakeToCamelKeys(value);
      } else {
        transformed[camelKey] = value;
      }
    }
    
    return transformed as T;
  }

  // Return primitive values as-is
  return obj as T;
}

/**
 * Transform object keys from camelCase to snake_case
 */
export function camelToSnakeKeys<T = TransformableObject>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => camelToSnakeKeys(item)) as T;
  }

  // Handle objects
  if (typeof obj === 'object' && obj !== null && obj.constructor === Object) {
    const transformed: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj as TransformableObject)) {
      const snakeKey = camelToSnake(key);
      
      // Recursively transform nested objects
      if (value !== null && typeof value === 'object') {
        transformed[snakeKey] = camelToSnakeKeys(value);
      } else {
        transformed[snakeKey] = value;
      }
    }
    
    return transformed as T;
  }

  // Return primitive values as-is
  return obj as T;
}

/**
 * Field mapping overrides for special cases
 * Some fields don't follow standard snake_case/camelCase conversion rules
 */
export const FIELD_MAPPING_OVERRIDES: Record<string, string> = {
  // Backend to Frontend (snake_case to camelCase)
  'user_id': 'userId',
  'campaign_id': 'campaignId',
  'persona_id': 'personaId',
  'proxy_id': 'proxyId',
  'created_at': 'createdAt',
  'updated_at': 'updatedAt',
  'started_at': 'startedAt',
  'completed_at': 'completedAt',
  'last_login_at': 'lastLoginAt',
  'last_login_ip': 'lastLoginIp',
  'last_checked_at': 'lastCheckedAt',
  'validated_at': 'validatedAt',
  'generated_at': 'generatedAt',
  'is_active': 'isActive',
  'is_enabled': 'isEnabled',
  'is_healthy': 'isHealthy',
  'is_locked': 'isLocked',
  'is_valid': 'isValid',
  'total_items': 'totalItems',
  'processed_items': 'processedItems',
  'successful_items': 'successfulItems',
  'failed_items': 'failedItems',
  'failed_login_attempts': 'failedLoginAttempts',
  'locked_until': 'lockedUntil',
  'mfa_enabled': 'mfaEnabled',
  'must_change_password': 'mustChangePassword',
  'password_changed_at': 'passwordChangedAt',
  'email_verified': 'emailVerified',
  'avatar_url': 'avatarUrl',
  'first_name': 'firstName',
  'last_name': 'lastName',
  'config_details': 'configDetails',
  'last_status': 'lastStatus',
  'latency_ms': 'latencyMs',
  'country_code': 'countryCode',
  'campaign_type': 'campaignType',
  'persona_type': 'personaType',
  'progress_percentage': 'progressPercentage',
  'error_message': 'errorMessage',
  'estimated_completion_at': 'estimatedCompletionAt',
  'avg_processing_rate': 'avgProcessingRate',
  'last_heartbeat_at': 'lastHeartbeatAt',
  'domain_generation_params': 'domainGenerationParams',
  'dns_validation_params': 'dnsValidationParams',
  'http_keyword_params': 'httpKeywordParams',
  'pattern_type': 'patternType',
  'constant_string': 'constantString',
  'variable_length': 'variableLength',
  'character_set': 'characterSet',
  'num_domains_to_generate': 'numDomainsToGenerate',
  'total_possible_combinations': 'totalPossibleCombinations',
  'current_offset': 'currentOffset',
  'dns_servers': 'dnsServers',
  'record_types': 'recordTypes',
  'batch_size': 'batchSize',
  'source_campaign_id': 'sourceCampaignId',
  'source_type': 'sourceType',
  'target_url': 'targetUrl',
  'keyword_set_id': 'keywordSetId',
  'offset_index': 'offsetIndex',
  'validation_error': 'validationError',
  'last_tested': 'lastTested',
  'last_error': 'lastError',
  'http_status_code': 'httpStatusCode',
  'dns_result_id': 'dnsResultId',
  'http_keyword_campaign_id': 'httpKeywordCampaignId',
  'generation_campaign_id': 'generationCampaignId',
  'dns_campaign_id': 'dnsCampaignId',
  'generated_domain_id': 'generatedDomainId',
  'validated_by_persona_id': 'validatedByPersonaId',
  'mfa_last_used_at': 'mfaLastUsedAt',
  'request_id': 'requestId',
  'page_size': 'pageSize',
  'rate_limit': 'rateLimit',
};

/**
 * Reverse mapping for Frontend to Backend (camelCase to snake_case)
 */
export const REVERSE_FIELD_MAPPING_OVERRIDES: Record<string, string> = Object.entries(FIELD_MAPPING_OVERRIDES)
  .reduce((acc, [snake, camel]) => {
    acc[camel] = snake;
    return acc;
  }, {} as Record<string, string>);

/**
 * Transform object keys with special field mapping overrides
 */
export function transformKeysWithOverrides<T = TransformableObject>(
  obj: unknown,
  overrides: Record<string, string>,
  defaultTransform: (key: string) => string
): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeysWithOverrides(item, overrides, defaultTransform)) as T;
  }

  // Handle objects
  if (typeof obj === 'object' && obj !== null && obj.constructor === Object) {
    const transformed: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj as TransformableObject)) {
      // Use override if available, otherwise use default transform
      const transformedKey = overrides[key] || defaultTransform(key);
      
      // Recursively transform nested objects
      if (value !== null && typeof value === 'object') {
        transformed[transformedKey] = transformKeysWithOverrides(value, overrides, defaultTransform);
      } else {
        transformed[transformedKey] = value;
      }
    }
    
    return transformed as T;
  }

  // Return primitive values as-is
  return obj as T;
}

/**
 * Transform API response from snake_case to camelCase
 * Uses field mapping overrides for special cases
 */
export function transformApiResponse<T = TransformableObject>(response: unknown): T {
  return transformKeysWithOverrides(response, FIELD_MAPPING_OVERRIDES, snakeToCamel);
}

/**
 * Transform API request from camelCase to snake_case
 * Uses reverse field mapping overrides for special cases
 */
export function transformApiRequest<T = TransformableObject>(request: unknown): T {
  return transformKeysWithOverrides(request, REVERSE_FIELD_MAPPING_OVERRIDES, camelToSnake);
}

/**
 * Transform specific fields in an object
 * Useful for partial transformations or when only certain fields need conversion
 */
export function transformSpecificFields<T extends TransformableObject>(
  obj: T,
  fields: string[],
  transform: (value: unknown) => unknown
): T {
  const result: TransformableObject = { ...obj };
  
  for (const field of fields) {
    if (field in result && result[field] !== undefined) {
      result[field] = transform(result[field]);
    }
  }
  
  return result as T;
}

/**
 * Create a bidirectional transformer for a specific entity type
 */
export function createEntityTransformer<TBackend, TFrontend>(
  toFrontend: (backend: TBackend) => TFrontend,
  toBackend: (frontend: TFrontend) => TBackend
) {
  return {
    toFrontend,
    toBackend,
    transformArray: {
      toFrontend: (items: TBackend[]): TFrontend[] => items.map(toFrontend),
      toBackend: (items: TFrontend[]): TBackend[] => items.map(toBackend),
    }
  };
}