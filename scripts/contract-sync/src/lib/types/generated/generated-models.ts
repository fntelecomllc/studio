/**
 * Auto-generated Models from Go Backend
 * Generated: 2025-06-20T15:22:19.234Z
 * Source: Go Backend Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import { 
  SafeBigInt, 
  UUID, 
  ISODateString, 
  Email,
  createSafeBigInt,
  createUUID,
  createISODateString,
  createEmail
} from '../branded';

import {
  CampaignTypeEnum,
  CampaignStatusEnum,
  PersonaTypeEnum,
  ProxyProtocolEnum,
} from './generated-enums';

// Custom branded types
export type IPAddress = string & { readonly __brand: 'IPAddress' };

export interface UserAPI {
  id: UUID;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
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
  error?: string;
  requires_captcha?: boolean;
  sessionId?: string;
  expiresAt?: string;
}

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
  /** @int64 */
  totalItems?: SafeBigInt;
  /** @int64 */
  processedItems?: SafeBigInt;
  /** @int64 */
  successfulItems?: SafeBigInt;
  /** @int64 */
  failedItems?: SafeBigInt;
  errorMessage?: string;
  metadata: Record<string, unknown>;
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
  lastLoginIp?: IPAddress;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  mfaLastUsedAt?: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  name?: string;
  roles?: Role[];
  permissions?: Permission[];
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
  permissions?: Permission[];
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

export interface AuthAuditLog {
  /** @int64 */
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

export interface RateLimit {
  /** @int64 */
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
  error?: string;
  requires_captcha?: boolean;
  sessionId?: string;
  expiresAt?: string;
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
  error?: string;
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
  code?: number;
}

export interface GeneralErrorResponse {
  error: string;
  details?: string;
}

export interface DNSConfigDetails {
  resolvers: string[];
  useSystemResolvers: boolean;
  queryTimeoutSeconds: number;
  maxDomainsPerRequest: number;
  resolverStrategy: string;
  resolversWeighted?: Record<string, number>;
  resolversPreferredOrder?: string[];
  concurrentQueriesPerDomain: number;
  queryDelayMinMs: number;
  queryDelayMaxMs: number;
  maxConcurrentGoroutines: number;
  rateLimitDps: number;
  rateLimitBurst: number;
}

export interface HTTPTLSClientHello {
  minVersion?: string;
  maxVersion?: string;
  cipherSuites?: string[];
  curvePreferences?: string[];
}

export interface HTTP2Settings {
  enabled: boolean;
}

export interface HTTPCookieHandling {
  mode?: string;
}

export interface HTTPConfigDetails {
  userAgent: string;
  headers?: Record<string, string>;
  headerOrder?: string[];
  tlsClientHello?: HTTPTLSClientHello;
  http2Settings?: HTTP2Settings;
  cookieHandling?: HTTPCookieHandling;
  requestTimeoutSeconds?: number;
  followRedirects?: boolean;
  allowedStatusCodes?: number[];
  rateLimitDps?: number;
  rateLimitBurst?: number;
  notes?: string;
}

export interface Persona {
  id: UUID;
  name: string;
  personaType: PersonaTypeEnum;
  description?: string;
  configDetails: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Proxy {
  id: UUID;
  name: string;
  description?: string;
  address: string;
  protocol?: ProxyProtocolEnum;
  username?: string;
  host?: string;
  port?: number;
  isEnabled: boolean;
  isHealthy: boolean;
  lastStatus?: string;
  lastCheckedAt?: ISODateString;
  latencyMs?: number;
  city?: string;
  countryCode?: string;
  provider?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  inputUsername?: string;
  inputPassword?: string;
}

export interface KeywordSet {
  id: UUID;
  name: string;
  description?: string;
  isEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  rules?: KeywordRule[];
}

export interface KeywordRule {
  id: UUID;
  keywordSetId?: UUID;
  pattern: string;
  ruleType: KeywordRuleTypeEnum;
  isCaseSensitive: boolean;
  category?: string;
  contextChars?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

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
  /** @int64 */
  totalItems?: SafeBigInt;
  /** @int64 */
  processedItems?: SafeBigInt;
  errorMessage?: string;
  /** @int64 */
  successfulItems?: SafeBigInt;
  /** @int64 */
  failedItems?: SafeBigInt;
  metadata?: Record<string, unknown>;
  estimatedCompletionAt?: ISODateString;
  avgProcessingRate?: number;
  lastHeartbeatAt?: ISODateString;
  domainGenerationParams?: DomainGenerationCampaignParams;
  dnsValidationParams?: DNSValidationCampaignParams;
  httpKeywordValidationParams?: HTTPKeywordCampaignParams;
}

export interface DomainGenerationCampaignParams {
  patternType: string;
  variableLength?: number;
  characterSet?: string;
  constantString?: string;
  tld: string;
  numDomainsToGenerate: number;
  /** @int64 */
  totalPossibleCombinations: SafeBigInt;
  /** @int64 */
  currentOffset: SafeBigInt;
}

export interface NormalizedDomainGenerationParams {
  patternType: string;
  variableLength: number;
  characterSet: string;
  constantString: string;
  tld: string;
}

export interface DomainGenerationConfigState {
  configHash: string;
  /** @int64 */
  lastOffset: SafeBigInt;
  configDetails: Record<string, unknown>;
  updatedAt: ISODateString;
}

export interface GeneratedDomain {
  id: UUID;
  generationCampaignId: UUID;
  domainName: string;
  /** @int64 */
  offsetIndex: SafeBigInt;
  generatedAt: ISODateString;
  sourceKeyword?: string;
  sourcePattern?: string;
  tld?: string;
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
  generatedDomainId?: UUID;
  domainName: string;
  validationStatus: string;
  dnsRecords?: Record<string, unknown>;
  validatedByPersonaId?: UUID;
  attempts?: number;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

export interface HTTPKeywordCampaignParams {
  sourceCampaignId: UUID;
  sourceType: string;
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

export interface HTTPKeywordResult {
  id: UUID;
  httpKeywordCampaignId: UUID;
  dnsResultId?: UUID;
  domainName: string;
  validationStatus: string;
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

export interface AuditLog {
  id: UUID;
  timestamp: ISODateString;
  userId?: UUID;
  action: string;
  entityType?: string;
  entityId?: UUID;
  details?: Record<string, unknown>;
  clientIp?: string;
  userAgent?: string;
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
  lastError?: string;
  lastAttemptedAt?: ISODateString;
  processingServerId?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  nextExecutionAt?: ISODateString;
  lockedAt?: ISODateString;
  lockedBy?: string;
}

export interface ProxyPool {
  id: UUID;
  name: string;
  description?: string;
  isEnabled: boolean;
  poolStrategy?: string;
  healthCheckEnabled: boolean;
  healthCheckIntervalSeconds?: number;
  maxRetries?: number;
  timeoutSeconds?: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  proxies?: Proxy[];
}

export interface ProxyPoolMembership {
  poolId: UUID;
  proxyId: UUID;
  weight?: number;
  isActive: boolean;
  addedAt: ISODateString;
}

