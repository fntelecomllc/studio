// Auto-generated TypeScript declarations from Go contracts
// Generated: 2025-06-21T03:26:16.131Z
// Go Version: go version go1.22.3 linux/amd64

// Import branded types for type safety
import type { SafeBigInt, UUID, ISODateString } from '../types/branded-types';

export enum CampaignType {
  DOMAIN_GENERATION = 'domain_generation',
  DNS_VALIDATION = 'dns_validation',
  HTTP_KEYWORD_VALIDATION = 'http_keyword_validation',
}

export enum CampaignStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSING = 'pausing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ARCHIVED = 'archived',
  CANCELLED = 'cancelled',
}

export enum PersonaType {
  DNS = 'dns',
  HTTP = 'http',
}

export enum ProxyProtocol {
  HTTP = 'http',
  HTTPS = 'https',
  SOCKS5 = 'socks5',
  SOCKS4 = 'socks4',
}

export interface UserAPI {
  id: UUID;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt?: ISODateString;
  lastLoginIp?: string;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  mfaLastUsedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  name: string;
  roles: string[];
  permissions: string[];
}

export interface LoginResponseAPI {
  success: boolean;
  user?: UserAPI;
  error: string;
  requires_captcha: boolean;
  sessionId: string;
  expiresAt: string;
}

/**
 * CampaignAPI - Auto-generated from Go struct
 * 
 * SafeBigInt fields (int64/uint64 from Go):
 * - totalItems: Requires SafeBigInt for overflow protection
 * - processedItems: Requires SafeBigInt for overflow protection
 * - successfulItems: Requires SafeBigInt for overflow protection
 * - failedItems: Requires SafeBigInt for overflow protection
 */
export interface CampaignAPI {
  id: UUID;
  name: string;
  campaignType: CampaignTypeEnum;
  status: CampaignStatusEnum;
  userId?: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  progressPercentage?: number;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  totalItems?: SafeBigInt;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  processedItems?: SafeBigInt;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  successfulItems?: SafeBigInt;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  failedItems?: SafeBigInt;
  errorMessage?: string;
  metadata: unknown;
}

export interface User {
  id: UUID;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt?: ISODateString;
  lastLoginIp?: string;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  mfaLastUsedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  name: string;
  roles: Role[];
  permissions: Permission[];
}

export interface Session {
  id: string;
  userId: UUID;
  ipAddress?: string;
  userAgent?: string;
  userAgentHash?: string;
  sessionFingerprint?: string;
  browserFingerprint?: string;
  screenResolution?: string;
  isActive: boolean;
  expiresAt: ISODateString;
  lastActivityAt: ISODateString;
  createdAt: ISODateString;
}

export interface Role {
  id: UUID;
  name: string;
  displayName: string;
  description?: string;
  isSystemRole: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  permissions: Permission[];
}

export interface Permission {
  id: UUID;
  name: string;
  displayName: string;
  description?: string;
  resource: string;
  action: string;
  createdAt: ISODateString;
}

export interface UserRole {
  userId: UUID;
  roleId: UUID;
  assignedBy?: UUID;
  assignedAt: ISODateString;
  expiresAt?: ISODateString;
}

export interface RolePermission {
  roleId: UUID;
  permissionId: UUID;
}

/**
 * AuthAuditLog - Auto-generated from Go struct
 * 
 * SafeBigInt fields (int64/uint64 from Go):
 * - id: Requires SafeBigInt for overflow protection
 */
export interface AuthAuditLog {
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  id: SafeBigInt;
  userId?: UUID;
  sessionId?: string;
  eventType: string;
  eventStatus: string;
  ipAddress?: string;
  userAgent?: string;
  sessionFingerprint?: string;
  securityFlags?: string;
  details?: string;
  riskScore: number;
  createdAt: ISODateString;
}

/**
 * RateLimit - Auto-generated from Go struct
 * 
 * SafeBigInt fields (int64/uint64 from Go):
 * - id: Requires SafeBigInt for overflow protection
 */
export interface RateLimit {
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  id: SafeBigInt;
  identifier: string;
  action: string;
  attempts: number;
  windowStart: ISODateString;
  blockedUntil?: ISODateString;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe: boolean;
  captchaToken: string;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  error: string;
  requires_captcha: boolean;
  sessionId: string;
  expiresAt: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  roleIds: UUID[];
}

export interface UpdateUserRequest {
  firstName: string;
  lastName: string;
  isActive?: boolean;
  roleIds: UUID[];
}

export interface AuthResult {
  success: boolean;
  error: string;
  user?: User;
}

export interface SecurityContext {
  userId: UUID;
  sessionId: string;
  lastActivity: ISODateString;
  sessionExpiry: ISODateString;
  requiresPasswordChange: boolean;
  riskScore: number;
  permissions: string[];
  roles: string[];
}

export interface ErrorResponse {
  status: string;
  message: string;
  code: number;
}

export interface GeneralErrorResponse {
  error: string;
  details: string;
}

export interface DNSConfigDetails {
  resolvers: string[];
  useSystemResolvers: boolean;
  queryTimeoutSeconds: number;
  maxDomainsPerRequest: number;
  resolverStrategy: string;
  resolversWeighted: Record<string, number>;
  resolversPreferredOrder: string[];
  concurrentQueriesPerDomain: number;
  queryDelayMinMs: number;
  queryDelayMaxMs: number;
  maxConcurrentGoroutines: number;
  rateLimitDps: number;
  rateLimitBurst: number;
}

export interface HTTPTLSClientHello {
  minVersion: string;
  maxVersion: string;
  cipherSuites: string[];
  curvePreferences: string[];
}

export interface HTTP2Settings {
  enabled: boolean;
}

export interface HTTPCookieHandling {
  mode: string;
}

export interface HTTPConfigDetails {
  userAgent: string;
  headers: Record<string, string>;
  headerOrder: string[];
  tlsClientHello?: HTTPTLSClientHello;
  http2Settings?: HTTP2Settings;
  cookieHandling?: HTTPCookieHandling;
  requestTimeoutSeconds: number;
  followRedirects?: boolean;
  allowedStatusCodes: number[];
  rateLimitDps: number;
  rateLimitBurst: number;
  notes: string;
}

export interface Persona {
  id: UUID;
  name: string;
  personaType: PersonaTypeEnum;
  description: string | null;
  configDetails: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Proxy {
  id: UUID;
  name: string;
  description: string | null;
  address: string;
  protocol?: ProxyProtocolEnum;
  username: string | null;
  host: string | null;
  port: unknown;
  isEnabled: boolean;
  isHealthy: boolean;
  lastStatus: string | null;
  lastCheckedAt: ISODateString | null;
  latencyMs: unknown;
  city: string | null;
  countryCode: string | null;
  provider: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  inputUsername: string | null;
  inputPassword: string | null;
}

export interface KeywordSet {
  id: UUID;
  name: string;
  description: string | null;
  isEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  rules?: KeywordRule[];
}

export interface KeywordRule {
  id: UUID;
  keywordSetId: UUID;
  pattern: string;
  ruleType: KeywordRuleTypeEnum;
  isCaseSensitive: boolean;
  category: string | null;
  contextChars: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Campaign - Auto-generated from Go struct
 * 
 * SafeBigInt fields (int64/uint64 from Go):
 * - totalItems: Requires SafeBigInt for overflow protection
 * - processedItems: Requires SafeBigInt for overflow protection
 * - successfulItems: Requires SafeBigInt for overflow protection
 * - failedItems: Requires SafeBigInt for overflow protection
 */
export interface Campaign {
  id: UUID;
  name: string;
  campaignType: CampaignTypeEnum;
  status: CampaignStatusEnum;
  userId?: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  progressPercentage?: number;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  totalItems?: SafeBigInt;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  processedItems?: SafeBigInt;
  errorMessage?: string;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  successfulItems?: SafeBigInt;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  failedItems?: SafeBigInt;
  metadata?: Record<string, unknown>;
  estimatedCompletionAt?: ISODateString;
  avgProcessingRate?: number;
  lastHeartbeatAt?: ISODateString;
  domainGenerationParams?: DomainGenerationCampaignParams;
  dnsValidationParams?: DNSValidationCampaignParams;
  httpKeywordValidationParams?: HTTPKeywordCampaignParams;
}

/**
 * DomainGenerationCampaignParams - Auto-generated from Go struct
 * 
 * SafeBigInt fields (int64/uint64 from Go):
 * - totalPossibleCombinations: Requires SafeBigInt for overflow protection
 * - currentOffset: Requires SafeBigInt for overflow protection
 */
export interface DomainGenerationCampaignParams {
  patternType: string;
  variableLength?: number;
  characterSet?: string;
  constantString?: string;
  tld: string;
  numDomainsToGenerate: number;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  totalPossibleCombinations: SafeBigInt;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  currentOffset: SafeBigInt;
}

export interface NormalizedDomainGenerationParams {
  patternType: string;
  variableLength: number;
  characterSet: string;
  constantString: string;
  tld: string;
}

/**
 * DomainGenerationConfigState - Auto-generated from Go struct
 * 
 * SafeBigInt fields (int64/uint64 from Go):
 * - lastOffset: Requires SafeBigInt for overflow protection
 */
export interface DomainGenerationConfigState {
  configHash: string;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  lastOffset: SafeBigInt;
  configDetails: Record<string, unknown>;
  updatedAt: ISODateString;
}

/**
 * GeneratedDomain - Auto-generated from Go struct
 * 
 * SafeBigInt fields (int64/uint64 from Go):
 * - offsetIndex: Requires SafeBigInt for overflow protection
 */
export interface GeneratedDomain {
  id: UUID;
  generationCampaignId: UUID;
  domainName: string;
  /** @description int64 field from Go - use createSafeBigInt() for construction */
  offsetIndex: SafeBigInt;
  generatedAt: ISODateString;
  sourceKeyword: string | null;
  sourcePattern: string | null;
  tld: string | null;
  createdAt: ISODateString;
}

export interface DNSValidationCampaignParams {
  sourceGenerationCampaignId?: UUID;
  personaIds: UUID[];
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  metadata?: Record<string, unknown>;
}

export interface DNSValidationResult {
  id: UUID;
  dnsCampaignId: UUID;
  generatedDomainId: UUID | null;
  domainName: string;
  validationStatus: string;
  dnsRecords?: Record<string, unknown>;
  validatedByPersonaId: UUID | null;
  attempts?: number;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

export interface HTTPKeywordCampaignParams {
  sourceCampaignId: UUID;
  sourceType: string;
  keywordSetIds: UUID[];
  adHocKeywords?: string[];
  personaIds: UUID[];
  proxyIds?: UUID[];
  proxyPoolId: UUID | null;
  proxySelectionStrategy?: string;
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  targetHttpPorts?: number[];
  lastProcessedDomainName?: string;
  metadata?: Record<string, unknown>;
}

export interface HTTPKeywordResult {
  id: UUID;
  httpKeywordCampaignId: UUID;
  dnsResultId: UUID | null;
  domainName: string;
  validationStatus: string;
  httpStatusCode?: number;
  responseHeaders?: Record<string, unknown>;
  pageTitle?: string;
  extractedContentSnippet?: string;
  foundKeywordsFromSets?: Record<string, unknown>;
  foundAdHocKeywords?: string[];
  contentHash?: string;
  validatedByPersonaId: UUID | null;
  usedProxyId: UUID | null;
  attempts?: number;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

export interface AuditLog {
  id: UUID;
  timestamp: ISODateString;
  userId: UUID | null;
  action: string;
  entityType: string | null;
  entityId: UUID | null;
  details?: Record<string, unknown>;
  clientIp: string | null;
  userAgent: string | null;
}

export interface CampaignJob {
  id: UUID;
  campaignId: UUID;
  jobType: CampaignTypeEnum;
  status: CampaignJobStatusEnum;
  scheduledAt: ISODateString;
  jobPayload?: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  lastAttemptedAt: ISODateString | null;
  processingServerId: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  nextExecutionAt: ISODateString | null;
  lockedAt: ISODateString | null;
  lockedBy: string | null;
}

export interface ProxyPool {
  id: UUID;
  name: string;
  description: string | null;
  isEnabled: boolean;
  poolStrategy: string | null;
  healthCheckEnabled: boolean;
  healthCheckIntervalSeconds?: number;
  maxRetries?: number;
  timeoutSeconds?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  proxies: Proxy[];
}

export interface ProxyPoolMembership {
  poolId: UUID;
  proxyId: UUID;
  weight?: number;
  isActive: boolean;
  addedAt: ISODateString;
}

// Utility types for API integration
export type ApiResponse<T> = {
  data: T;
  status: number;
  message?: string;
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: SafeBigInt;
    totalPages: number;
  };
};

