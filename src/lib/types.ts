// src/lib/types.ts - Complete Frontend Type Synchronization with Backend Go Structs
// Perfect alignment with backend/internal/models/models.go and auth_models.go

// ===== BACKEND ENUM SYNCHRONIZATION =====

// Campaign Type Enum - matches backend CampaignTypeEnum exactly
export type CampaignType = 
  | "domain_generation"
  | "dns_validation"
  | "http_keyword_validation";

// Campaign Status Enum - matches backend CampaignStatusEnum exactly
export type CampaignStatus = 
  | "pending"
  | "queued" 
  | "running"
  | "pausing"
  | "paused"
  | "completed"
  | "failed"
  | "archived"
  | "cancelled";

// Persona Type Enum - matches backend PersonaTypeEnum exactly (lowercase)
export type PersonaType = "dns" | "http";

// Proxy Protocol Enum - matches backend ProxyProtocolEnum exactly
export type ProxyProtocol = "http" | "https" | "socks5" | "socks4";

// Keyword Rule Type Enum - matches backend KeywordRuleTypeEnum exactly
export type KeywordRuleType = "string" | "regex";

// Campaign Job Status Enum - matches backend CampaignJobStatusEnum exactly
export type CampaignJobStatus = 
  | "pending"
  | "queued"
  | "running"
  | "processing"
  | "completed"
  | "failed"
  | "retry";

// Validation Status Enum - matches backend ValidationStatusEnum exactly
export type ValidationStatus = 
  | "pending"
  | "valid"
  | "invalid"
  | "error"
  | "skipped";

// DNS Validation Status Enum - matches backend DNSValidationStatusEnum exactly
export type DNSValidationStatus = 
  | "resolved"
  | "unresolved"
  | "timeout"
  | "error";

// HTTP Validation Status Enum - matches backend HTTPValidationStatusEnum exactly
export type HTTPValidationStatus = 
  | "success"
  | "failed"
  | "timeout"
  | "error";

// ===== CORE DOMAIN MODEL INTERFACES =====

// DNS Config Details - matches backend DNSConfigDetails exactly
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

// HTTP TLS Client Hello - matches backend HTTPTLSClientHello exactly
export interface HTTPTLSClientHello {
  minVersion?: string;
  maxVersion?: string;
  cipherSuites?: string[];
  curvePreferences?: string[];
}

// HTTP2 Settings - matches backend HTTP2Settings exactly
export interface HTTP2Settings {
  enabled: boolean;
}

// HTTP Cookie Handling - matches backend HTTPCookieHandling exactly
export interface HTTPCookieHandling {
  mode?: string;
}

// HTTP Config Details - matches backend HTTPConfigDetails exactly
export interface HTTPConfigDetails {
  userAgent: string;
  headers?: Record<string, string>;
  headerOrder?: string[];
  tlsClientHello?: HTTPTLSClientHello;
  http2Settings?: HTTP2Settings;
  cookieHandling?: HTTPCookieHandling;
  requestTimeoutSeconds?: number;
  requestTimeoutSec?: number; // Legacy alias
  followRedirects?: boolean;
  allowedStatusCodes?: number[];
  allowInsecureTls?: boolean;
  maxRedirects?: number;
  rateLimitDps?: number;
  rateLimitBurst?: number;
  notes?: string;
}

// Persona - matches backend Persona struct exactly
export interface Persona {
  id: string;
  name: string;
  personaType: PersonaType;
  description?: string;
  tags?: string[];
  configDetails: DNSConfigDetails | HTTPConfigDetails; // Raw JSON config
  isEnabled: boolean;
  status: PersonaStatus;
  lastTested?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

// Proxy - matches backend Proxy struct exactly (without sensitive fields)
export interface Proxy {
  id: string;
  name: string;
  description?: string;
  address: string;
  protocol?: ProxyProtocol;
  username?: string;
  host?: string;
  port?: number;
  notes?: string;
  status: ProxyStatus;
  isEnabled: boolean;
  isHealthy: boolean;
  lastStatus?: string;
  lastCheckedAt?: string;
  lastTested?: string;
  lastError?: string;
  successCount?: number;
  failureCount?: number;
  latencyMs?: number;
  city?: string;
  countryCode?: string;
  provider?: string;
  createdAt: string;
  updatedAt: string;
}

// Keyword Set - matches backend KeywordSet exactly
export interface KeywordSet {
  id: string;
  name: string;
  description?: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  rules?: KeywordRule[];
}

// Keyword Rule - matches backend KeywordRule exactly
export interface KeywordRule {
  id: string;
  keywordSetId?: string;
  pattern: string;
  ruleType: KeywordRuleType;
  isCaseSensitive: boolean;
  category?: string;
  contextChars?: number;
  createdAt: string;
  updatedAt: string;
}

// Domain Generation Campaign Params - matches backend DomainGenerationCampaignParams exactly
export interface DomainGenerationCampaignParams {
  patternType: string;
  variableLength?: number;
  characterSet?: string;
  constantString?: string;
  tld: string;
  numDomainsToGenerate: number;
  totalPossibleCombinations: number;
  currentOffset: number;
}

// DNS Validation Campaign Params - matches backend DNSValidationCampaignParams exactly
export interface DNSValidationCampaignParams {
  sourceGenerationCampaignId?: string;
  personaIds: string[];
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  metadata?: Record<string, unknown>;
}

// HTTP Keyword Campaign Params - matches backend HTTPKeywordCampaignParams exactly
export interface HTTPKeywordCampaignParams {
  sourceCampaignId: string;
  keywordSetIds?: string[];
  adHocKeywords?: string[];
  personaIds: string[];
  proxyPoolId?: string;
  proxySelectionStrategy?: string;
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  targetHttpPorts?: number[];
  lastProcessedDomainName?: string;
  sourceType: string;
  proxyIds?: string[];
  metadata?: Record<string, unknown>;
}

// Campaign - matches backend Campaign struct exactly with frontend compatibility fields
export interface Campaign {
  id: string;
  name: string;
  campaignType: CampaignType;
  status: CampaignStatus;
  userId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  progressPercentage?: number;
  totalItems?: number;
  processedItems?: number;
  errorMessage?: string;
  successfulItems?: number;
  failedItems?: number;
  metadata?: Record<string, unknown>;
  domainGenerationParams?: DomainGenerationCampaignParams;
  dnsValidationParams?: DNSValidationCampaignParams;
  httpKeywordValidationParams?: HTTPKeywordCampaignParams;
  
  // Frontend compatibility fields (legacy)
  selectedType?: CampaignType; // Alias for campaignType
  currentPhase?: CampaignPhase;
  phaseStatus?: CampaignPhaseStatus;
  progress?: number; // Alias for progressPercentage
  lastErrorMessage?: string; // Alias for errorMessage
  description?: string;
  domainGenerationConfig?: DomainGenerationConfig;
  domainSourceConfig?: DomainSource;
  initialDomainsToProcessCount?: number;
  leadGenerationSpecificConfig?: LeadGenerationSpecificConfig;
  assignedHttpPersonaId?: string;
  assignedDnsPersonaId?: string;
  httpPersonaId?: string;
  dnsPersonaIds?: string[];
  proxyAssignment?: ProxyAssignment;
  domains?: string[];
  dnsValidatedDomains?: string[];
  httpValidatedDomains?: string[];
  extractedContent?: ExtractedContentItem[];
  leads?: Lead[];
  generatedDomains?: GeneratedDomain[];
  uploadHistory?: UploadEvent[];
}

// Generated Domain - matches backend GeneratedDomain exactly
export interface GeneratedDomainBackend {
  id: string;
  generationCampaignId: string;
  domainName: string;
  offsetIndex: number;
  generatedAt: string;
  sourceKeyword?: string;
  sourcePattern?: string;
  tld?: string;
  createdAt: string;
}

// Generated Domain with frontend compatibility - unified interface
export interface GeneratedDomain extends GeneratedDomainBackend {
  // Frontend compatibility fields (computed/mapped)
  domain: string; // Maps to domainName
  campaignId: string; // Maps to generationCampaignId
  index: number; // Maps to offsetIndex
  status: 'Generated' | 'Validated' | 'Failed';
  validationResults?: {
    dns?: DNSValidationResult;
    http?: HTTPKeywordResult;
  };
}

// Helper function to create GeneratedDomain from backend data
export function createGeneratedDomain(backend: GeneratedDomainBackend, overrides?: Partial<Pick<GeneratedDomain, 'status' | 'validationResults'>>): GeneratedDomain {
  return {
    ...backend,
    domain: backend.domainName,
    campaignId: backend.generationCampaignId,
    index: backend.offsetIndex,
    status: overrides?.status || 'Generated',
    validationResults: overrides?.validationResults,
  };
}

// Helper function to create GeneratedDomain from frontend data
export function createGeneratedDomainFromLegacy(legacy: {
  id: string;
  domain: string;
  campaignId: string;
  index: number;
  generatedAt: string;
  status: 'Generated' | 'Validated' | 'Failed';
  validationResults?: {
    dns?: DNSValidationResult;
    http?: HTTPKeywordResult;
  };
}): GeneratedDomain {
  return {
    id: legacy.id,
    generationCampaignId: legacy.campaignId,
    domainName: legacy.domain,
    offsetIndex: legacy.index,
    generatedAt: legacy.generatedAt,
    createdAt: legacy.generatedAt, // Use generatedAt as fallback for createdAt
    domain: legacy.domain,
    campaignId: legacy.campaignId,
    index: legacy.index,
    status: legacy.status,
    validationResults: legacy.validationResults,
  };
}

// DNS Validation Result - matches backend DNSValidationResult exactly
export interface DNSValidationResult {
  id: string;
  dnsCampaignId: string;
  generatedDomainId?: string;
  domainName: string;
  validationStatus: string;
  dnsRecords?: Record<string, unknown>;
  validatedByPersonaId?: string;
  attempts?: number;
  lastCheckedAt?: string;
  createdAt: string;
}

// HTTP Keyword Result - matches backend HTTPKeywordResult exactly
export interface HTTPKeywordResult {
  id: string;
  httpKeywordCampaignId: string;
  dnsResultId?: string;
  domainName: string;
  validationStatus: string;
  httpStatusCode?: number;
  responseHeaders?: Record<string, unknown>;
  pageTitle?: string;
  extractedContentSnippet?: string;
  foundKeywordsFromSets?: Record<string, unknown>;
  foundAdHocKeywords?: string[];
  contentHash?: string;
  validatedByPersonaId?: string;
  usedProxyId?: string;
  attempts: number;
  lastCheckedAt?: string;
  createdAt: string;
}

// Campaign Job - matches backend CampaignJob exactly
export interface CampaignJob {
  id: string;
  campaignId: string;
  jobType: CampaignType;
  status: CampaignJobStatus;
  scheduledAt: string;
  jobPayload?: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  lastAttemptedAt?: string;
  processingServerId?: string;
  createdAt: string;
  updatedAt: string;
  nextExecutionAt?: string;
  lockedAt?: string;
  lockedBy?: string;
}

// Audit Log - matches backend AuditLog exactly
export interface AuditLog {
  id: string;
  timestamp: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  clientIp?: string;
  userAgent?: string;
}

// ===== SESSION-BASED AUTHENTICATION TYPES =====

// User - matches backend User struct exactly (PublicUser fields)
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  name?: string;
  avatarUrl?: string;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt?: string;
  lastLoginIp?: string;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  mfaLastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  roles: Role[];
  permissions: Permission[];
}

// Session - matches backend Session struct exactly
export interface Session {
  id: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  userAgentHash?: string;
  sessionFingerprint?: string;
  browserFingerprint?: string;
  screenResolution?: string;
  isActive: boolean;
  expiresAt: string;
  lastActivityAt: string;
  createdAt: string;
}

// Role - matches backend Role struct exactly
export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isSystemRole: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: Permission[];
}

// Permission - matches backend Permission struct exactly
export interface Permission {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  resource: string;
  action: string;
  createdAt: string;
}

// User Role - matches backend UserRole exactly
export interface UserRole {
  userId: string;
  roleId: string;
  assignedBy?: string;
  assignedAt: string;
  expiresAt?: string;
}

// Auth Audit Log - matches backend AuthAuditLog exactly
export interface AuthAuditLog {
  id: number;
  userId?: string;
  sessionId?: string;
  eventType: string;
  eventStatus: string;
  ipAddress?: string;
  userAgent?: string;
  sessionFingerprint?: string;
  securityFlags?: string;
  details?: string;
  riskScore: number;
  createdAt: string;
}

// Rate Limit - matches backend RateLimit exactly
export interface RateLimit {
  id: number;
  identifier: string;
  action: string;
  attempts: number;
  windowStart: string;
  blockedUntil?: string;
}

// Security Context - matches backend SecurityContext exactly
export interface SecurityContext {
  userId: string;
  sessionId: string;
  lastActivity: string;
  sessionExpiry: string;
  requiresPasswordChange: boolean;
  riskScore: number;
  permissions: string[];
  roles: string[];
}

// ===== SESSION-BASED AUTHENTICATION REQUEST/RESPONSE TYPES =====

// Login Request - matches backend LoginRequest exactly
export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  captchaToken?: string;
}

// Login Response - matches backend LoginResponse exactly
export interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
  requires_captcha?: boolean;
  sessionId?: string;
  expiresAt?: string;
}

// Refresh Session Response - matches backend RefreshSessionResponse exactly
export interface RefreshSessionResponse {
  expiresAt: string;
}

// Change Password Request - matches backend ChangePasswordRequest exactly
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Create User Request - matches backend CreateUserRequest exactly
export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  roleIds?: string[];
}

// Update User Request - matches backend UpdateUserRequest exactly
export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  roleIds?: string[];
}

// Auth Result - matches backend AuthResult exactly
export interface AuthResult {
  success: boolean;
  error?: string;
  user?: User;
}

// Password Validation Result
export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  requirements: PasswordRequirements;
  strength: 'weak' | 'fair' | 'good' | 'strong';
  score: number;
}

// Password Requirements
export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  forbiddenPasswords: string[];
}

// Security Event
export interface SecurityEvent {
  id: string;
  timestamp: string;
  eventType: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  description?: string;
  riskScore?: number;
  details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// Audit Log Entry
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  changes?: Record<string, unknown>;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// Latest Domain Activity
export interface LatestDomainActivity {
  id: string;
  domain: string;
  domainName: string;
  campaignId: string;
  campaignName: string;
  phase: CampaignPhase;
  status: DomainActivityStatus;
  timestamp: string;
  activity: string;
  generatedDate: string;
  dnsStatus: DomainActivityStatus;
  httpStatus: DomainActivityStatus;
  leadScanStatus: DomainActivityStatus;
  leadScore?: number;
  sourceUrl: string;
}

// DNS Persona Config (legacy alias)
export type DnsPersonaConfig = DNSConfigDetails;

// HTTP Persona Config (legacy alias)
export type HttpPersonaConfig = HTTPConfigDetails;

// DNS Resolver Strategy
export type DnsResolverStrategy = 'random_rotation' | 'weighted_rotation' | 'sequential_failover';

// ===== API RESPONSE TYPES =====

export type ApiStatus = 'success' | 'error';

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiResponse<T = null> {
  status: ApiStatus;
  message?: string;
  data?: T;
  errors?: ApiErrorDetail[];
  metadata?: {
    page?: {
      current: number;
      total: number;
      page_size: number;
      count: number;
    };
    rate_limit?: {
      limit: number;
      remaining: number;
      reset: string;
    };
    processing?: {
      duration: string;
      version: string;
    };
    extra?: Record<string, unknown>;
  };
  request_id?: string;
}

// ===== LEGACY COMPATIBILITY TYPES (DEPRECATED) =====

// Legacy campaign type aliases - use CampaignType instead
export type CampaignSelectedType = CampaignType;

// Legacy campaign phase - use CampaignStatus instead
export type CampaignPhase = 
  | "Idle"
  | "DomainGeneration"
  | "DNSValidation"
  | "HTTPValidation"
  | "LeadGeneration"
  | "Completed"
  | "Failed";

// Legacy phase status - use CampaignStatus instead
export type CampaignPhaseStatus = 'Pending' | 'InProgress' | 'Succeeded' | 'Failed' | 'Idle' | 'Paused';

// Legacy persona types - use PersonaType instead
export type PersonaStatus = 'Active' | 'Disabled' | 'Testing' | 'Failed';

// Legacy proxy status - use boolean isEnabled instead
export type ProxyStatus = 'Active' | 'Disabled' | 'Testing' | 'Failed';

// ===== FORM PAYLOAD TYPES =====

// Create Campaign Payload
export interface CreateCampaignPayload {
  name: string;
  campaignType: CampaignType;
  domainGenerationParams?: DomainGenerationCampaignParams;
  dnsValidationParams?: DNSValidationCampaignParams;
  httpKeywordValidationParams?: HTTPKeywordCampaignParams;
  
  // Legacy/compatibility properties for existing campaign service
  campaignName?: string; // Alias for name
  domainGenerationConfig?: DomainGenerationConfig;
  domainSourceConfig?: DomainSource;
  assignedDnsPersonaId?: string;
  assignedHttpPersonaId?: string;
  leadGenerationSpecificConfig?: LeadGenerationSpecificConfig;
  proxyAssignment?: ProxyAssignment;
}

// Update Campaign Payload
export interface UpdateCampaignPayload {
  name?: string;
  status?: CampaignStatus;
  domainGenerationParams?: Partial<DomainGenerationCampaignParams>;
  dnsValidationParams?: Partial<DNSValidationCampaignParams>;
  httpKeywordValidationParams?: Partial<HTTPKeywordCampaignParams>;
}

// Create Persona Payload
export interface CreatePersonaPayload {
  name: string;
  personaType: PersonaType;
  description?: string;
  tags?: string[];
  configDetails: DNSConfigDetails | HTTPConfigDetails;
  isEnabled?: boolean;
}

// Update Persona Payload
export interface UpdatePersonaPayload {
  name?: string;
  description?: string;
  tags?: string[];
  configDetails?: Partial<DNSConfigDetails | HTTPConfigDetails>;
  isEnabled?: boolean;
}

// Create Proxy Payload
export interface CreateProxyPayload {
  name?: string;
  description?: string;
  address: string;
  protocol?: ProxyProtocol;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  notes?: string;
  initialStatus?: string;
  isEnabled?: boolean;
}

// Update Proxy Payload
export interface UpdateProxyPayload {
  name?: string;
  description?: string;
  address?: string;
  protocol?: ProxyProtocol;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  notes?: string;
  isEnabled?: boolean;
}

// ===== RESPONSE TYPE ALIASES =====

// Campaign Service Responses
export type CampaignsListResponse = ApiResponse<Campaign[]>;
export type CampaignDetailResponse = ApiResponse<Campaign>;
export type CampaignCreationResponse = ApiResponse<Campaign>;
export type CampaignUpdateResponse = ApiResponse<Campaign>;
export type CampaignDeleteResponse = ApiResponse<null>;
export type CampaignOperationResponse = ApiResponse<Campaign>;

// Legacy persona types for backward compatibility
export type HttpPersona = Persona & { personaType: 'http' };
export type DnsPersona = Persona & { personaType: 'dns' };
export type CreateHttpPersonaPayload = CreatePersonaPayload & { personaType: 'http' };
export type CreateDnsPersonaPayload = CreatePersonaPayload & { personaType: 'dns' };
export type UpdateHttpPersonaPayload = Partial<CreatePersonaPayload> & { status?: PersonaStatus };
export type UpdateDnsPersonaPayload = Partial<CreatePersonaPayload> & { status?: PersonaStatus };
export type PersonaActionResponse = ApiResponse<Persona>;

// Persona Service Responses
export type PersonasListResponse = ApiResponse<Persona[]>;
export type PersonaDetailResponse = ApiResponse<Persona>;
export type PersonaCreationResponse = ApiResponse<Persona>;
export type PersonaUpdateResponse = ApiResponse<Persona>;
export type PersonaDeleteResponse = ApiResponse<null>;

// Proxy Service Responses
export type ProxiesListResponse = ApiResponse<Proxy[]>;
export type ProxyDetailResponse = ApiResponse<Proxy>;
export type ProxyCreationResponse = ApiResponse<Proxy>;
export type ProxyUpdateResponse = ApiResponse<Proxy>;
export type ProxyDeleteResponse = ApiResponse<null>;
export type ProxyActionResponse = ApiResponse<Proxy>;

// Auth Service Responses
export type UserListResponse = ApiResponse<User[]>;
export type UserDetailResponse = ApiResponse<User>;
export type SessionListResponse = ApiResponse<Session[]>;
export type SessionDetailResponse = ApiResponse<Session>;
export type AuthenticationResponse = ApiResponse<LoginResponse>;
export interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ===== MISSING COMPATIBILITY TYPES =====

// Start Campaign Phase Payload
export interface StartCampaignPhasePayload {
  phaseToStart: CampaignPhase;
  domainSource?: DomainSource;
  numberOfDomainsToProcess?: number;
}

// Campaign Domain Detail
export interface CampaignDomainDetail {
  id: string;
  domainName: string;
  generatedDate?: string;
  dnsStatus: DomainActivityStatus;
  dnsError?: string;
  dnsResultsByPersona?: Record<string, DNSValidationResult>;
  httpStatus: DomainActivityStatus;
  httpError?: string;
  httpStatusCode?: number;
  httpFinalUrl?: string;
  httpContentHash?: string;
  httpTitle?: string;
  httpResponseHeaders?: Record<string, string[]>;
  leadScanStatus: DomainActivityStatus;
  leadDetails?: Lead;
}

// Campaign Validation Item
export interface CampaignValidationItem {
  id: string;
  domain: string;
  domainOrUrl?: string;
  validationStatus: CampaignPhaseStatus;
  lastCheckedAt?: string;
  errorDetails?: string;
  resultsByPersona?: Record<string, DNSValidationResult>;
  mismatchDetected?: boolean;
  httpStatusCode?: number;
  finalUrl?: string;
  contentHash?: string;
  extractedTitle?: string;
  extractedMetaDescription?: string;
  responseHeaders?: Record<string, string[]>;
}

// Domain Source Types
export type DomainSourceType = 'upload' | 'campaign_output' | 'current_campaign_output' | 'none';

export interface DomainSource {
  type: DomainSourceType;
  fileName?: string;
  uploadedDomains?: string[];
  sourceCampaignId?: string;
  sourceCampaignName?: string;
  sourcePhase?: CampaignPhase;
}

// Domain Generation Configuration
export type DomainGenerationPattern = "prefix_variable" | "suffix_variable" | "both_variable";

export interface DomainGenerationConfig {
  generationPattern: DomainGenerationPattern;
  constantPart: string;
  allowedCharSet: string;
  tlds: string[];
  prefixVariableLength?: number;
  suffixVariableLength?: number;
  maxDomainsToGenerate?: number;
}

// Lead Generation Configuration
export interface LeadGenerationSpecificConfig {
  scrapingRateLimit?: { requests: number; per: 'second' | 'minute' };
  requiresJavaScriptRendering?: boolean;
  targetKeywords?: string[];
}

// Extracted Content Item
export interface ExtractedContentItem {
  id: string;
  sourceUrl: string;
  text: string;
  similarityScore: number;
  previousCampaignId?: string;
  advancedAnalysis?: AnalyzeContentOutput;
}

// Lead interface
export interface Lead {
  id: string;
  name?: string;
  email?: string;
  company?: string;
  similarityScore: number;
  sourceUrl: string;
  extractedKeywords?: string[];
  previousCampaignId?: string;
}

// Analyze Content Types
export interface AnalyzeContentInput {
  textContent: string;
  existingKeywords?: string[];
  campaignContext?: string;
}

export interface AnalyzeContentOutput {
  advancedKeywords: string[];
  categories?: string[];
  summary?: string;
  sentiment?: 'Positive' | 'Negative' | 'Neutral' | 'N/A';
}

// Proxy Assignment
export interface ProxyAssignment {
  mode: 'none' | 'single' | 'rotate_active';
  proxyId?: string;
}

// Upload Event
export interface UploadEvent {
  filename: string;
  fileId?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

// ===== UTILITY TYPES =====

// Optional select value for forms
export type OptionalSelectValue = string | undefined;

// Domain activity status for UI
export type DomainActivityStatus = 'Validated' | 'Not Validated' | 'Pending' | 'N/A' | 'Scanned' | 'No Leads' | 'Generating' | 'Failed';
