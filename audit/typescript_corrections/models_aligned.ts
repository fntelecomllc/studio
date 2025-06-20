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
} from '../../src/lib/types/branded';

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
 * CRITICAL: All numeric counters use SafeBigInt for int64 compatibility
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
 * Use this for all campaign responses from the API
 */
export function transformCampaignResponse(raw: any): ModelsCampaignAPI {
  return {
    ...raw,
    id: raw.id ? createUUID(raw.id) : undefined,
    userId: raw.userId ? createUUID(raw.userId) : undefined,
    
    // Transform int64 fields
    totalItems: raw.totalItems != null ? createSafeBigInt(raw.totalItems) : undefined,
    processedItems: raw.processedItems != null ? createSafeBigInt(raw.processedItems) : undefined,
    successfulItems: raw.successfulItems != null ? createSafeBigInt(raw.successfulItems) : undefined,
    failedItems: raw.failedItems != null ? createSafeBigInt(raw.failedItems) : undefined,
    
    // Transform timestamps
    createdAt: raw.createdAt ? createISODateString(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? createISODateString(raw.updatedAt) : undefined,
    startedAt: raw.startedAt ? createISODateString(raw.startedAt) : undefined,
    completedAt: raw.completedAt ? createISODateString(raw.completedAt) : undefined,
    estimatedCompletionAt: raw.estimatedCompletionAt ? createISODateString(raw.estimatedCompletionAt) : undefined,
    lastHeartbeatAt: raw.lastHeartbeatAt ? createISODateString(raw.lastHeartbeatAt) : undefined,
    
    // Validate enums
    campaignType: raw.campaignType as ModelsCampaignTypeEnum,
    status: raw.status as ModelsCampaignStatusEnum
  };
}

/**
 * Transform user response with proper role/permission objects
 */
export function transformUserResponse(raw: any): ModelsUserAPI {
  return {
    ...raw,
    id: raw.id ? createUUID(raw.id) : undefined,
    
    // Transform timestamps
    createdAt: raw.createdAt ? createISODateString(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? createISODateString(raw.updatedAt) : undefined,
    lastLoginAt: raw.lastLoginAt ? createISODateString(raw.lastLoginAt) : undefined,
    mfaLastUsedAt: raw.mfaLastUsedAt ? createISODateString(raw.mfaLastUsedAt) : undefined,
    
    // Transform roles and permissions if they're strings
    roles: Array.isArray(raw.roles) && raw.roles.length > 0 && typeof raw.roles[0] === 'string'
      ? raw.roles.map((name: string) => ({ name } as ModelsRoleAPI)) // Temporary - backend should send full objects
      : raw.roles,
    permissions: Array.isArray(raw.permissions) && raw.permissions.length > 0 && typeof raw.permissions[0] === 'string'
      ? raw.permissions.map((name: string) => ({ name } as ModelsPermissionAPI)) // Temporary - backend should send full objects
      : raw.permissions
  };
}

/**
 * Transform generated domain with SafeBigInt
 */
export function transformGeneratedDomainResponse(raw: any): ModelsGeneratedDomainAPI {
  return {
    ...raw,
    id: createUUID(raw.id),
    generationCampaignId: createUUID(raw.generationCampaignId || raw.domain_generation_campaign_id),
    offsetIndex: createSafeBigInt(raw.offsetIndex || raw.offset_index),
    generatedAt: createISODateString(raw.generatedAt || raw.generated_at),
    createdAt: createISODateString(raw.createdAt || raw.created_at)
  };
}

// ============================================================================
// MIGRATION CHECKLIST
// ============================================================================

/**
 * Migration Steps:
 * 
 * 1. Replace imports:
 *    - FROM: import { ModelsCampaignAPI } from '@/lib/api-client/models/models-campaign-api';
 *    - TO: import { ModelsCampaignAPI } from '@/lib/typescript_corrections/models_aligned';
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