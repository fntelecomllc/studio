// Unified type definitions for frontend/backend alignment
import { UUID, SafeBigInt, ISODateString } from './types/branded';

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

// Persona Status Enum - frontend compatibility
export type PersonaStatus = 
  | "active" 
  | "inactive" 
  | "error"
  | "Active"    // Legacy support
  | "Disabled"  // Legacy support
  | "Testing"   // Legacy support
  | "Failed";   // Legacy support

// Campaign validation item interface for UI
export interface CampaignValidationItem {
  id: string;
  domain: string;
  domainName: string; // alias for domain
  status: ValidationStatus;
  validationStatus: ValidationStatus; // alias for status
  attempts?: number;
  lastChecked?: string;
  lastCheckedAt?: string; // alias for lastChecked
  errorMessage?: string;
  errorDetails?: string; // alias for errorMessage
  
  // Additional fields for validation results
  httpStatusCode?: number;
  finalUrl?: string;
  contentHash?: string;
  extractedTitle?: string;
  responseHeaders?: Record<string, unknown>;
}

// Proxy Protocol Enum - matches backend ProxyProtocolEnum exactly
export type ProxyProtocol = "http" | "https" | "socks5" | "socks4";

// Proxy Status Enum - frontend compatibility
export type ProxyStatus = 
  | "enabled" 
  | "disabled" 
  | "error"
  | "Active"    // Legacy support
  | "Disabled"  // Legacy support
  | "Testing"   // Legacy support
  | "Failed";   // Legacy support

// Campaign Selected Type - frontend compatibility alias for CampaignType
export type CampaignSelectedType = CampaignType;

// Campaign Phase - operational phase types for UI
export type CampaignPhase = 
  | "domain_generation"
  | "dns_validation" 
  | "http_keyword_validation"
  | "lead_generation"
  | "completed"
  | "idle"
  | "Idle"           // Legacy support  
  | "Completed"      // Legacy support
  | "LeadGeneration" // Legacy support
  | "DNSValidation"  // Legacy support
  | "HTTPValidation"; // Legacy support

// Campaign Phase Status - phase execution status for UI
export type CampaignPhaseStatus = 
  | "pending"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "paused"
  | "InProgress"  // Legacy support
  | "Succeeded"   // Legacy support
  | "Failed"      // Legacy support
  | "Paused"      // Legacy support
  | "Pending";    // Legacy support

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
  id: UUID;
  name: string;
  personaType: PersonaType;
  description?: string;
  tags?: string[];
  configDetails: DNSConfigDetails | HTTPConfigDetails; // Raw JSON config
  isEnabled: boolean;
  status: string;
  lastTested?: ISODateString;
  lastError?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// Proxy - matches backend Proxy struct exactly (without sensitive fields)
export interface Proxy {
  id: UUID;
  name: string;
  description?: string;
  address: string;
  protocol?: ProxyProtocol;
  username?: string;
  host?: string;
  port?: number;
  notes?: string;
  status: string;
  isEnabled: boolean;
  isHealthy: boolean;
  lastStatus?: string;
  lastCheckedAt?: ISODateString;
  lastTested?: ISODateString;
  lastError?: string;
  successCount?: SafeBigInt;
  failureCount?: SafeBigInt;
  latencyMs?: number;
  city?: string;
  countryCode?: string;
  provider?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// Keyword Set - matches backend KeywordSet exactly
export interface KeywordSet {
  id: UUID;
  name: string;
  description?: string;
  isEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  rules?: KeywordRule[];
}

// Keyword Rule - matches backend KeywordRule exactly
export interface KeywordRule {
  id: UUID;
  keywordSetId?: UUID;
  pattern: string;
  ruleType: KeywordRuleType;
  isCaseSensitive: boolean;
  category?: string;
  contextChars?: SafeBigInt;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// Domain Generation Campaign Params - matches backend DomainGenerationCampaignParams exactly
export interface DomainGenerationCampaignParams {
  patternType: string;
  variableLength?: SafeBigInt;
  characterSet?: string;
  constantString?: string;
  tld: string;
  numDomainsToGenerate: SafeBigInt;
  totalPossibleCombinations: SafeBigInt;
  currentOffset: SafeBigInt;
}

// DNS Validation Campaign Params - matches backend DNSValidationCampaignParams exactly
export interface DNSValidationCampaignParams {
  sourceGenerationCampaignId?: UUID;
  personaIds: UUID[];
  rotationIntervalSeconds?: SafeBigInt;
  processingSpeedPerMinute?: SafeBigInt;
  batchSize?: number;
  retryAttempts?: number;
  metadata?: Record<string, unknown>;
}

// HTTP Keyword Campaign Params - matches backend HTTPKeywordCampaignParams exactly
export interface HTTPKeywordCampaignParams {
  sourceCampaignId: UUID;
  keywordSetIds?: UUID[];
  adHocKeywords?: string[];
  personaIds: UUID[];
  proxyPoolId?: UUID;
  proxySelectionStrategy?: string;
  rotationIntervalSeconds?: SafeBigInt;
  processingSpeedPerMinute?: SafeBigInt;
  batchSize?: SafeBigInt;
  retryAttempts?: SafeBigInt;
  targetHttpPorts?: number[];
  lastProcessedDomainName?: string;
  sourceType: string;
  proxyIds?: UUID[];
  metadata?: Record<string, unknown>;
}

// Campaign - Core API interface matching backend Campaign struct exactly
export interface Campaign {
  id: UUID;
  name: string;
  campaignType: CampaignType;
  status: CampaignStatus;
  userId?: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  progressPercentage?: number;
  totalItems?: SafeBigInt;
  processedItems?: SafeBigInt;
  successfulItems?: SafeBigInt;
  failedItems?: SafeBigInt;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  
  // Additional tracking fields (from backend)
  estimatedCompletionAt?: ISODateString;
  avgProcessingRate?: number;
  lastHeartbeatAt?: ISODateString;
  
  // Campaign parameter details
  domainGenerationParams?: DomainGenerationCampaignParams;
  dnsValidationParams?: DNSValidationCampaignParams;
  httpKeywordValidationParams?: HTTPKeywordCampaignParams;
}

// CampaignViewModel - Extended interface for UI-specific state and computed properties
export interface CampaignViewModel extends Campaign {
  // Frontend compatibility fields
  description?: string;
  selectedType?: CampaignSelectedType;
  currentPhase?: CampaignPhase;
  phaseStatus?: CampaignPhaseStatus;
  progress?: number; // alias for progressPercentage
  
  // Domain and validation result caches for UI
  domains?: string[];
  dnsValidatedDomains?: string[];
  httpValidatedDomains?: string[];
  extractedContent?: ExtractedContentItem[];
  leads?: Lead[];
  
  // UI configuration fields
  domainSourceConfig?: {
    type: string;
    sourceCampaignId?: string;
    sourcePhase?: string;
    uploadedDomains?: string[];
  };
  domainGenerationConfig?: {
    generationPattern?: string;
    constantPart?: string;
    allowedCharSet?: string;
    tlds?: string[];
    prefixVariableLength?: number;
    suffixVariableLength?: number;
    maxDomainsToGenerate?: number;
  };
  leadGenerationSpecificConfig?: {
    targetKeywords?: string[];
    scrapingRateLimit?: {
      requests: number;
      per: string;
    };
    requiresJavaScriptRendering?: boolean;
  };
  initialDomainsToProcessCount?: number;
  assignedHttpPersonaId?: string;
  assignedDnsPersonaId?: string;
  proxyAssignment?: {
    mode: string;
    proxyId?: string;
  };
}

// Generated Domain - matches backend GeneratedDomain exactly
export interface GeneratedDomainBackend {
  id: UUID;
  generationCampaignId: UUID;
  domainName: string;
  offsetIndex: SafeBigInt;
  generatedAt: ISODateString;
  sourceKeyword?: string;
  sourcePattern?: string;
  tld?: string;
  createdAt: ISODateString;
}

export type GeneratedDomain = GeneratedDomainBackend;

// DNS Validation Result - matches backend DNSValidationResult exactly
export interface DNSValidationResult {
  id: UUID;
  dnsCampaignId: UUID;
  generatedDomainId?: UUID;
  domainName: string;
  validationStatus: string;
  dnsRecords?: Record<string, unknown>;
  validatedByPersonaId?: UUID;
  attempts: SafeBigInt | null;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

// HTTP Keyword Result - matches backend HTTPKeywordResult exactly
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
  attempts: SafeBigInt | null;
  lastCheckedAt?: ISODateString;
  createdAt: ISODateString;
}

// Campaign Job - matches backend CampaignJob exactly
export interface CampaignJob {
  id: UUID;
  campaignId: UUID;
  jobType: CampaignType;
  status: CampaignJobStatus;
  scheduledAt: ISODateString;
  jobPayload?: Record<string, unknown>;
  attempts: SafeBigInt;
  maxAttempts: SafeBigInt;
  lastError?: string;
  lastAttemptedAt?: ISODateString;
  processingServerId?: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  nextExecutionAt?: ISODateString;
  lockedAt?: ISODateString;
  lockedBy?: UUID;
}

// Audit Log - matches backend AuditLog exactly
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

// ===== SESSION-BASED AUTHENTICATION TYPES =====

// User - matches backend User struct exactly (PublicUser fields)
export interface User {
  id: UUID;
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  name?: string;
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
  roles: Role[];
  permissions: Permission[];
}

// Session - matches backend Session struct exactly
export interface Session {
  id: UUID;
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

// Role - matches backend Role struct exactly
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

// Permission - matches backend Permission struct exactly
export interface Permission {
  id: UUID;
  name: string;
  displayName: string;
  description?: string;
  resource: string;
  action: string;
  createdAt: ISODateString;
}

// User Role - matches backend UserRole exactly
export interface UserRole {
  userId: UUID;
  roleId: UUID;
  assignedBy?: UUID;
  assignedAt: ISODateString;
  expiresAt?: ISODateString;
}

// Auth Audit Log - matches backend AuthAuditLog exactly
export interface AuthAuditLog {
  id: SafeBigInt;
  userId?: UUID;
  sessionId?: UUID;
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

// Rate Limit - matches backend RateLimit exactly
export interface RateLimit {
  id: SafeBigInt;
  identifier: string;
  action: string;
  attempts: SafeBigInt;
  windowStart: ISODateString;
  blockedUntil?: ISODateString;
}

// Security Context - matches backend SecurityContext exactly
export interface SecurityContext {
  userId: UUID;
  sessionId: UUID;
  lastActivity: ISODateString;
  sessionExpiry: ISODateString;
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
  phase: CampaignPhase; // Use CampaignPhase for workflow phase, not CampaignStatus
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

// Domain Activity Status for dashboard
export type DomainActivityStatus = 
  | "validated"
  | "not_validated"  
  | "pending"
  | "in_progress"
  | "failed"
  | "generating"
  | "scanned"
  | "no_leads"
  | "n_a"
  | "error"
  | "skipped";

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


// ===== FORM PAYLOAD TYPES =====

// Create Campaign Payload
export interface CreateCampaignPayload {
  name: string;
  campaignType: CampaignType;
  domainGenerationParams?: DomainGenerationCampaignParams;
  dnsValidationParams?: DNSValidationCampaignParams;
  httpKeywordValidationParams?: HTTPKeywordCampaignParams;
  
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
export type UpdateHttpPersonaPayload = Partial<CreatePersonaPayload> & { status?: string };
export type UpdateDnsPersonaPayload = Partial<CreatePersonaPayload> & { status?: string };
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

// Lead interface for campaign results
export interface Lead {
  id: string;
  name?: string;
  sourceUrl?: string;
  email?: string;
  phone?: string;
  company?: string;
  extractedAt: string;
  metadata?: Record<string, unknown>;
  similarityScore?: number; // For content similarity matching
}

// Start Campaign Phase Payload
export interface StartCampaignPhasePayload {
  campaignId: UUID;
  phaseToStart: CampaignType; // Use CampaignType since this represents workflow phases
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
  status: ValidationStatus;
  attempts?: number;
  lastChecked?: string;
  errorMessage?: string;
}

// Domain Source Types - frontend domain input sources
export type DomainSource = "manual" | "upload" | "campaign_output" | "generation";

// Domain Source Selection Mode - for campaign form domain source configuration
export type DomainSourceSelectionMode = "none" | "upload" | "campaign_output";

// Domain Generation Pattern - matches backend DomainGenerationPattern
export type DomainGenerationPattern = 
  | "prefix_variable"
  | "suffix_variable" 
  | "both_variable"
  | "constant_only";

// Missing types for frontend compatibility

// Domain Generation Config interface
export interface DomainGenerationConfig {
  generationPattern?: DomainGenerationPattern;
  constantPart?: string;
  allowedCharSet?: string;
  tlds?: string[];
  prefixVariableLength?: number;
  suffixVariableLength?: number;
  maxDomainsToGenerate?: number;
}

// Extracted Content Item interface
export interface ExtractedContentItem {
  id: string;
  text: string;
  sourceUrl?: string;
  extractedAt: string;
  similarityScore?: number;
  previousCampaignId?: string;
  advancedAnalysis?: {
    summary?: string;
    advancedKeywords?: string[];
    categories?: string[];
    sentiment?: string;
  };
  metadata?: Record<string, unknown>;
}

// Lead interface for campaign results
export interface Lead {
  id: string;
  name?: string;
  email?: string;
  company?: string;
  sourceUrl?: string;
  similarityScore?: number;
  previousCampaignId?: string;
  extractedAt: string;
  metadata?: Record<string, unknown>;
}

// Analyze Content Input interface
export interface AnalyzeContentInput {
  content: string;
  keywords?: string[];
}
