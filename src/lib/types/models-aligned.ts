/**
 * ALIGNED API MODELS - Corrected to match Go backend exactly
 * 
 * Migration Guide:
 * 1. Replace all imports from 'src/lib/api-client/models/*' with this file
 * 2. Update all usages of 'number' for int64 fields to use SafeBigInt
 * 3. Ensure all API responses are transformed using the provided transformers
 * 
 * CRITICAL CHANGES:
 * - All int64 fields now use SafeBigInt instead of number
 * - Field names match Go JSON tags exactly (no snake_case variants)
 * - Enums exclude 'archived' status to match backend
 */

import { 
  SafeBigInt, 
  UUID, 
  ISODateString,
  createSafeBigInt,
  createUUID,
  createISODateString 
} from './branded';

// ============================================================================
// ENUMS - Aligned with Go backend
// ============================================================================

export enum ModelsCampaignTypeEnum {
  DomainGeneration = 'domain_generation',
  DnsValidation = 'dns_validation',
  HttpKeywordValidation = 'http_keyword_validation'
}

export enum ModelsCampaignStatusEnum {
  Pending = 'pending',
  Queued = 'queued',
  Running = 'running',
  Pausing = 'pausing',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled'
  // REMOVED: Archived = 'archived' - not in backend
}

export enum ModelsPersonaTypeEnum {
  Dns = 'dns',
  Http = 'http'
}

export enum ModelsProxyProtocolEnum {
  Http = 'http',
  Https = 'https',
  Socks5 = 'socks5',
  Socks4 = 'socks4'
}

export enum ModelsKeywordRuleTypeEnum {
  String = 'string',
  Regex = 'regex'
}

// ============================================================================
// CORE MODELS - With correct types
// ============================================================================

/**
 * Campaign API model aligned with Go backend
 *
 * @description Represents a campaign entity with type-safe fields matching the Go backend exactly.
 * All int64 fields from Go are represented as SafeBigInt to prevent numeric overflow.
 *
 * @example
 * ```typescript
 * const campaign: ModelsCampaignAPI = {
 *   id: createUUID('550e8400-e29b-41d4-a716-446655440000'),
 *   name: 'DNS Validation Campaign',
 *   campaignType: ModelsCampaignTypeEnum.DnsValidation,
 *   status: ModelsCampaignStatusEnum.Running,
 *   totalItems: createSafeBigInt('1000000'),
 *   processedItems: createSafeBigInt('500000'),
 *   progressPercentage: 50.0
 * };
 * ```
 *
 * @see transformCampaignResponse - Use this to transform API responses
 * @see SafeBigInt - For handling int64 values
 */
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
  
  // Other fields
  errorMessage?: string;
  avgProcessingRate?: number; // float64 - safe as number
}

/**
 * User API model with correct field names
 *
 * @description Represents a user entity with authentication and authorization details.
 * Includes roles and permissions as full objects, not just strings.
 *
 * @example
 * ```typescript
 * const user: ModelsUserAPI = {
 *   id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
 *   email: 'user@example.com',
 *   emailVerified: true,
 *   roles: [{
 *     id: createUUID('...'),
 *     name: 'admin',
 *     displayName: 'Administrator',
 *     isSystemRole: true,
 *     createdAt: createISODateString('2024-01-01T00:00:00Z'),
 *     updatedAt: createISODateString('2024-01-01T00:00:00Z')
 *   }],
 *   mfaEnabled: true
 * };
 * ```
 *
 * @see transformUserResponse - Use this to transform API responses
 */
export interface ModelsUserAPI {
  id?: UUID;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  name?: string; // Computed field
  avatarUrl?: string;
  isActive?: boolean;
  isLocked?: boolean;
  lastLoginAt?: ISODateString;
  lastLoginIp?: string;
  mustChangePassword?: boolean;
  mfaEnabled?: boolean;
  mfaLastUsedAt?: ISODateString;
  createdAt?: ISODateString;
  updatedAt?: ISODateString;
  
  // These should be full objects, not strings
  roles?: ModelsRoleAPI[];
  permissions?: ModelsPermissionAPI[];
}

/**
 * Role API model
 */
export interface ModelsRoleAPI {
  id: UUID;
  name: string;
  displayName: string;
  description?: string;
  isSystemRole: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Permission API model
 */
export interface ModelsPermissionAPI {
  id: UUID;
  name: string;
  displayName: string;
  description?: string;
  resource: string;
  action: string;
  createdAt: ISODateString;
}

/**
 * Login Response - Fixed field naming
 */
export interface ModelsLoginResponseAPI {
  success?: boolean;
  user?: ModelsUserAPI;
  error?: string;
  requiresCaptcha?: boolean; // NOT requires_captcha
  sessionId?: string;
  expiresAt?: ISODateString;
}

/**
 * Login Request
 */
export interface ModelsLoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  captchaToken?: string;
}

// ============================================================================
// CAMPAIGN CREATION MODELS
// ============================================================================

/**
 * Domain Generation Parameters with correct int64 types
 *
 * @description Parameters for configuring domain generation campaigns.
 * totalPossibleCombinations and currentOffset use SafeBigInt for int64 compatibility.
 *
 * @example
 * ```typescript
 * const params: ServicesDomainGenerationParams = {
 *   patternType: 'prefix',
 *   variableLength: 5,
 *   characterSet: 'abcdefghijklmnopqrstuvwxyz',
 *   constantString: 'test',
 *   tld: 'com',
 *   numDomainsToGenerate: 1000,
 *   totalPossibleCombinations: createSafeBigInt('11881376'), // 26^5
 *   currentOffset: createSafeBigInt('0')
 * };
 * ```
 *
 * @property {SafeBigInt} totalPossibleCombinations - Total number of possible domain combinations (int64)
 * @property {SafeBigInt} currentOffset - Current position in generation sequence (int64)
 */
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

/**
 * DNS Validation Parameters
 */
export interface ServicesDnsValidationParams {
  sourceGenerationCampaignId?: UUID;
  personaIds: UUID[];
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  metadata?: Record<string, unknown>;
}

/**
 * HTTP Keyword Parameters with correct sourceType values
 */
export interface ServicesHttpKeywordParams {
  sourceCampaignId: UUID;
  sourceType: 'DomainGeneration' | 'DNSValidation'; // EXACT casing required
  keywordSetIds?: UUID[];
  adHocKeywords?: string[];
  personaIds: UUID[];
  proxyIds?: UUID[];
  proxyPoolId?: UUID;
  proxySelectionStrategy?: string;
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  targetHttpPorts?: number[];
  lastProcessedDomainName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Unified campaign creation request with type safety
 */
export type ServicesCreateCampaignRequest = 
  | {
      name: string;
      campaignType: ModelsCampaignTypeEnum.DomainGeneration;
      domainGenerationParams: ServicesDomainGenerationParams;
      dnsValidationParams?: never;
      httpKeywordParams?: never;
      description?: string;
      userId?: UUID;
    }
  | {
      name: string;
      campaignType: ModelsCampaignTypeEnum.DnsValidation;
      domainGenerationParams?: never;
      dnsValidationParams: ServicesDnsValidationParams;
      httpKeywordParams?: never;
      description?: string;
      userId?: UUID;
    }
  | {
      name: string;
      campaignType: ModelsCampaignTypeEnum.HttpKeywordValidation;
      domainGenerationParams?: never;
      dnsValidationParams?: never;
      httpKeywordParams: ServicesHttpKeywordParams;
      description?: string;
      userId?: UUID;
    };

// ============================================================================
// RESULT MODELS
// ============================================================================

/**
 * Generated Domain with correct int64 type
 *
 * @description Represents a domain generated by a domain generation campaign.
 * The offsetIndex field uses SafeBigInt as it represents an int64 value in the backend.
 *
 * @example
 * ```typescript
 * const domain: ModelsGeneratedDomainAPI = {
 *   id: createUUID('...'),
 *   generationCampaignId: createUUID('...'),
 *   domainName: 'test12345.com',
 *   offsetIndex: createSafeBigInt('12345'), // Position in generation sequence
 *   generatedAt: createISODateString('2024-01-15T10:30:00Z'),
 *   sourcePattern: 'test{5}',
 *   tld: 'com',
 *   createdAt: createISODateString('2024-01-15T10:30:00Z')
 * };
 * ```
 *
 * @property {SafeBigInt} offsetIndex - Position in the generation sequence (int64)
 */
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

/**
 * DNS Validation Result
 */
export interface ModelsDNSValidationResultAPI {
  id: UUID;
  dnsCampaignId: UUID;
  generatedDomainId?: UUID;
  domainName: string;
  validationStatus: 'pending' | 'resolved' | 'unresolved' | 'timeout' | 'error';
  dnsRecords?: Record<string, unknown>;
  validatedByPersonaId?: UUID;
  attempts?: number;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

/**
 * HTTP Keyword Result
 */
export interface ModelsHTTPKeywordResultAPI {
  id: UUID;
  httpKeywordCampaignId: UUID;
  dnsResultId?: UUID;
  domainName: string;
  validationStatus: 'pending' | 'success' | 'failed' | 'timeout' | 'error';
  httpStatusCode?: number;
  responseHeaders?: Record<string, unknown>;
  pageTitle?: string;
  extractedContentSnippet?: string;
  foundKeywordsFromSets?: Record<string, unknown>;
  foundAdHocKeywords?: string[];
  contentHash?: string;
  validatedByPersonaId?: UUID;
  usedProxyId?: UUID;
  attempts?: number;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

// ============================================================================
// TRANSFORMATION HELPERS
// ============================================================================

/**
 * Transform raw API response to type-safe model
 *
 * @description Converts raw API response data into a properly typed ModelsCampaignAPI object.
 * Handles conversion of string representations of int64 values to SafeBigInt and
 * ensures all timestamps are properly typed as ISODateString.
 *
 * @param raw - Raw response data from the API
 * @returns Type-safe campaign model
 *
 * @example
 * ```typescript
 * // API returns strings for int64 fields
 * const apiResponse = {
 *   id: '550e8400-e29b-41d4-a716-446655440000',
 *   totalItems: '1000000', // String representation of int64
 *   processedItems: '500000',
 *   createdAt: '2024-01-15T10:30:00Z'
 * };
 *
 * const campaign = transformCampaignResponse(apiResponse);
 * // campaign.totalItems is now SafeBigInt
 * // campaign.createdAt is now ISODateString
 * ```
 *
 * @throws {Error} If required fields are invalid or cannot be transformed
 */
export function transformCampaignResponse(raw: unknown): ModelsCampaignAPI {
  const data = raw as Record<string, unknown>;
  return {
    ...data,
    id: data.id ? createUUID(data.id as string) : undefined,
    userId: data.userId ? createUUID(data.userId as string) : undefined,
    
    // Transform int64 fields
    totalItems: data.totalItems != null ? createSafeBigInt(data.totalItems as string | number) : undefined,
    processedItems: data.processedItems != null ? createSafeBigInt(data.processedItems as string | number) : undefined,
    successfulItems: data.successfulItems != null ? createSafeBigInt(data.successfulItems as string | number) : undefined,
    failedItems: data.failedItems != null ? createSafeBigInt(data.failedItems as string | number) : undefined,
    
    // Transform timestamps
    createdAt: data.createdAt ? createISODateString(data.createdAt as string) : undefined,
    updatedAt: data.updatedAt ? createISODateString(data.updatedAt as string) : undefined,
    startedAt: data.startedAt ? createISODateString(data.startedAt as string) : undefined,
    completedAt: data.completedAt ? createISODateString(data.completedAt as string) : undefined,
    estimatedCompletionAt: data.estimatedCompletionAt ? createISODateString(data.estimatedCompletionAt as string) : undefined,
    lastHeartbeatAt: data.lastHeartbeatAt ? createISODateString(data.lastHeartbeatAt as string) : undefined,
    
    // Validate enums
    campaignType: data.campaignType as ModelsCampaignTypeEnum,
    status: data.status as ModelsCampaignStatusEnum
  };
}

/**
 * Transform user response with proper role/permission objects
 *
 * @description Converts raw API response data into a properly typed ModelsUserAPI object.
 * Handles legacy string arrays for roles/permissions and converts them to proper objects.
 *
 * @param raw - Raw response data from the API
 * @returns Type-safe user model
 *
 * @example
 * ```typescript
 * const apiResponse = {
 *   id: '123e4567-e89b-12d3-a456-426614174000',
 *   email: 'user@example.com',
 *   roles: ['admin', 'user'], // Legacy string array
 *   createdAt: '2024-01-15T10:30:00Z'
 * };
 *
 * const user = transformUserResponse(apiResponse);
 * // user.roles is now ModelsRoleAPI[]
 * ```
 */
export function transformUserResponse(raw: unknown): ModelsUserAPI {
  const data = raw as Record<string, unknown>;
  return {
    ...data,
    id: data.id ? createUUID(data.id as string) : undefined,
    
    // Transform timestamps
    createdAt: data.createdAt ? createISODateString(data.createdAt as string) : undefined,
    updatedAt: data.updatedAt ? createISODateString(data.updatedAt as string) : undefined,
    lastLoginAt: data.lastLoginAt ? createISODateString(data.lastLoginAt as string) : undefined,
    mfaLastUsedAt: data.mfaLastUsedAt ? createISODateString(data.mfaLastUsedAt as string) : undefined,
    
    // Transform roles and permissions if they're strings
    roles: Array.isArray(data.roles) && data.roles.length > 0 && typeof data.roles[0] === 'string'
      ? (data.roles as string[]).map((name: string) => ({ name } as ModelsRoleAPI)) // Temporary - backend should send full objects
      : data.roles as ModelsRoleAPI[],
    permissions: Array.isArray(data.permissions) && data.permissions.length > 0 && typeof data.permissions[0] === 'string'
      ? (data.permissions as string[]).map((name: string) => ({ name } as ModelsPermissionAPI)) // Temporary - backend should send full objects
      : data.permissions as ModelsPermissionAPI[]
  };
}

/**
 * Transform generated domain with SafeBigInt
 *
 * @description Converts raw API response for generated domains into type-safe model.
 * Handles both camelCase and snake_case field names for backward compatibility.
 *
 * @param raw - Raw response data from the API
 * @returns Type-safe generated domain model
 *
 * @example
 * ```typescript
 * const apiResponse = {
 *   id: '...',
 *   domain_name: 'test12345.com', // May be snake_case
 *   offset_index: '12345', // String representation of int64
 *   generated_at: '2024-01-15T10:30:00Z'
 * };
 *
 * const domain = transformGeneratedDomainResponse(apiResponse);
 * // domain.offsetIndex is now SafeBigInt
 * // domain.domainName uses correct camelCase
 * ```
 */
export function transformGeneratedDomainResponse(raw: unknown): ModelsGeneratedDomainAPI {
  const data = raw as Record<string, unknown>;
  return {
    ...data,
    id: createUUID(data.id as string),
    generationCampaignId: createUUID((data.generationCampaignId || data.domain_generation_campaign_id) as string),
    domainName: data.domainName as string || data.domain_name as string,
    offsetIndex: createSafeBigInt((data.offsetIndex || data.offset_index) as string | number),
    generatedAt: createISODateString((data.generatedAt || data.generated_at) as string),
    createdAt: createISODateString((data.createdAt || data.created_at) as string),
    sourceKeyword: data.sourceKeyword as string,
    sourcePattern: data.sourcePattern as string,
    tld: data.tld as string
  };
}

// ============================================================================
// ERROR RESPONSE
// ============================================================================

export interface ErrorResponse {
  error?: string;
  message?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

// ============================================================================
// MIGRATION CHECKLIST
// ============================================================================

/**
 * Migration Steps:
 * 
 * 1. Replace imports:
 *    - FROM: import { ModelsCampaignAPI } from '@/lib/api-client/models/models-campaign-api';
 *    - TO: import { ModelsCampaignAPI } from '@/lib/types/models-aligned';
 * 
 * 2. Update API client to use transformers:
 *    ```typescript
 *    const response = await apiClient.get('/campaigns');
 *    const campaigns = response.data.map(transformCampaignResponse);
 *    ```
 * 
 * 3. Update all numeric comparisons to handle SafeBigInt:
 *    ```typescript
 *    // WRONG: if (campaign.totalItems > 1000)
 *    // RIGHT: if (campaign.totalItems && campaign.totalItems > createSafeBigInt(1000))
 *    ```
 * 
 * 4. Remove all references to 'archived' status
 * 
 * 5. Fix login response handling:
 *    - Change `response.requires_captcha` to `response.requiresCaptcha`
 * 
 * 6. Ensure HTTP source types use exact casing:
 *    - 'DomainGeneration' not 'domain_generation'
 *    - 'DNSValidation' not 'dns_validation'
 */