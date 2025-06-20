/**
 * Aligned API Types
 * 
 * Request and response types that exactly match Go backend API contracts
 * All types use aligned models to ensure consistency
 * 
 * Generated: 2025-06-20
 * Source of Truth: Go Backend API handlers
 */

import {
  Campaign,
  CampaignType,
  CampaignStatus,
  DomainGenerationParams,
  DNSValidationParams,
  HTTPKeywordParams,
  User,
  PublicUser,
  Role,
  Permission,
  Persona,
  PersonaType,
  Proxy,
  GeneratedDomain,
  createSafeBigInt
} from './aligned-models';

import {
  UUID,
  SafeBigInt,
  ISODateString,
  Email as EmailString
} from '../branded';

// ============================================
// AUTHENTICATION API TYPES
// ============================================

export interface LoginRequest {
  email: string;
  password: string;
  captchaToken?: string;
}

export interface LoginResponse {
  user: PublicUser;
  sessionId: string;
  expiresAt: ISODateString;
  requiresCaptcha: boolean;  // NOT 'requires_captcha'!
  mfaRequired?: boolean;
}

export interface RefreshRequest {
  sessionId: string;
}

export interface RefreshResponse {
  sessionId: string;
  expiresAt: ISODateString;
}

export interface LogoutRequest {
  sessionId: string;
}

export interface LogoutResponse {
  success: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

// ============================================
// USER MANAGEMENT API TYPES (Currently Missing!)
// ============================================

export interface ListUsersRequest {
  page?: number;
  pageSize?: number;
  search?: string;
  roleId?: UUID;
  isActive?: boolean;
}

export interface ListUsersResponse {
  users: User[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roleIds?: UUID[];
  mustChangePassword?: boolean;
}

export interface CreateUserResponse {
  user: User;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  isActive?: boolean;
  roleIds?: UUID[];
  mustChangePassword?: boolean;
}

export interface UpdateUserResponse {
  user: User;
}

export interface DeleteUserRequest {
  userId: UUID;
}

export interface DeleteUserResponse {
  success: boolean;
}

// ============================================
// CAMPAIGN API TYPES
// ============================================

export interface CreateCampaignRequest {
  name: string;
  campaignType: CampaignType;
  domainGenerationParams?: Omit<DomainGenerationParams, 'id' | 'campaignId' | 'createdAt' | 'updatedAt'>;
  dnsValidationParams?: Omit<DNSValidationParams, 'id' | 'campaignId' | 'createdAt' | 'updatedAt'>;
  httpKeywordParams?: Omit<HTTPKeywordParams, 'id' | 'campaignId' | 'createdAt' | 'updatedAt'>;
  metadata?: Record<string, unknown>;
}

export interface CreateCampaignResponse {
  campaign: Campaign;
}

export interface ListCampaignsRequest {
  page?: number;
  pageSize?: number;
  status?: CampaignStatus;
  campaignType?: CampaignType;
  userId?: UUID;
  search?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface ListCampaignsResponse {
  campaigns: Campaign[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
}

export interface GetCampaignRequest {
  campaignId: UUID;
}

export interface GetCampaignResponse {
  campaign: Campaign;
}

export interface UpdateCampaignRequest {
  campaignId: UUID;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateCampaignResponse {
  campaign: Campaign;
}

export interface UpdateCampaignStatusRequest {
  campaignId: UUID;
  status: CampaignStatus;
  reason?: string;
}

export interface UpdateCampaignStatusResponse {
  campaign: Campaign;
}

export interface DeleteCampaignRequest {
  campaignId: UUID;
}

export interface DeleteCampaignResponse {
  success: boolean;
}

// ============================================
// PERSONA API TYPES
// ============================================

// NOTE: Backend requires type-specific endpoints!
export interface ListPersonasRequest {
  personaType: PersonaType;  // 'dns' or 'http'
  page?: number;
  pageSize?: number;
  isEnabled?: boolean;
  search?: string;
}

export interface ListPersonasResponse {
  personas: Persona[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
}

export interface CreatePersonaRequest {
  personaType: PersonaType;
  name: string;
  description?: string;
  configDetails: Record<string, unknown>;
  isEnabled?: boolean;
}

export interface CreatePersonaResponse {
  persona: Persona;
}

export interface UpdatePersonaRequest {
  personaId: UUID;
  personaType: PersonaType;  // Required for type-specific endpoint
  name?: string;
  description?: string;
  configDetails?: Record<string, unknown>;
  isEnabled?: boolean;
}

export interface UpdatePersonaResponse {
  persona: Persona;
}

export interface DeletePersonaRequest {
  personaId: UUID;
  personaType: PersonaType;  // Required for type-specific endpoint
}

export interface DeletePersonaResponse {
  success: boolean;
}

// ============================================
// PROXY API TYPES
// ============================================

export interface ListProxiesRequest {
  page?: number;
  pageSize?: number;
  isEnabled?: boolean;
  isHealthy?: boolean;
  protocol?: string;
  search?: string;
}

export interface ListProxiesResponse {
  proxies: Proxy[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
}

export interface CreateProxyRequest {
  name: string;
  description?: string;
  address: string;
  protocol: string;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  isEnabled?: boolean;
}

export interface CreateProxyResponse {
  proxy: Proxy;
}

export interface UpdateProxyRequest {
  proxyId: UUID;
  name?: string;
  description?: string;
  address?: string;
  protocol?: string;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  isEnabled?: boolean;
}

export interface UpdateProxyResponse {
  proxy: Proxy;
}

export interface DeleteProxyRequest {
  proxyId: UUID;
}

export interface DeleteProxyResponse {
  success: boolean;
}

export interface TestProxyRequest {
  proxyId: UUID;
  targetUrl?: string;
}

export interface TestProxyResponse {
  success: boolean;
  latencyMs?: number;
  error?: string;
  statusCode?: number;
  headers?: Record<string, string>;
}

export interface ProxyHealthCheckRequest {
  proxyIds?: UUID[];  // If empty, check all proxies
}

export interface ProxyHealthCheckResponse {
  results: Array<{
    proxyId: UUID;
    isHealthy: boolean;
    latencyMs?: number;
    error?: string;
    checkedAt: ISODateString;
  }>;
}

// ============================================
// KEYWORD EXTRACTION API TYPES
// ============================================

export interface ExtractKeywordsRequest {
  url: string;
  maxKeywords?: number;
  minLength?: number;
  includeMetaTags?: boolean;
}

export interface ExtractKeywordsResponse {
  keywords: Array<{
    keyword: string;
    frequency: number;
    relevance: number;
  }>;
  metadata?: {
    title?: string;
    description?: string;
    pageSize: SafeBigInt;
    extractionTime: number;
  };
}

export interface StreamKeywordsRequest {
  urls: string[];
  maxKeywordsPerUrl?: number;
  minLength?: number;
  includeMetaTags?: boolean;
}

// Stream response is handled via WebSocket or SSE

// ============================================
// DOMAIN GENERATION API TYPES
// ============================================

export interface ListGeneratedDomainsRequest {
  campaignId: UUID;
  page?: number;
  pageSize?: number;
  isValid?: boolean;
  search?: string;
}

export interface ListGeneratedDomainsResponse {
  domains: GeneratedDomain[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
}

export interface ExportDomainsRequest {
  campaignId: UUID;
  format: 'csv' | 'json' | 'txt';
  isValid?: boolean;
  limit?: SafeBigInt;
  offset?: SafeBigInt;
}

export interface ExportDomainsResponse {
  downloadUrl: string;
  expiresAt: ISODateString;
  totalDomains: SafeBigInt;
  fileSize: SafeBigInt;
}

// ============================================
// SYSTEM API TYPES
// ============================================

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: SafeBigInt;  // milliseconds
  timestamp: ISODateString;
  checks: {
    database: boolean;
    redis?: boolean;
    storage?: boolean;
  };
}

export interface SystemStatsResponse {
  campaigns: {
    total: SafeBigInt;
    active: SafeBigInt;
    completed: SafeBigInt;
    failed: SafeBigInt;
  };
  domains: {
    total: SafeBigInt;
    validated: SafeBigInt;
    invalid: SafeBigInt;
  };
  users: {
    total: SafeBigInt;
    active: SafeBigInt;
    locked: SafeBigInt;
  };
  system: {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    goroutines: number;
  };
}

// ============================================
// ERROR RESPONSE TYPE
// ============================================

export interface APIError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  requestId?: string;
  timestamp: ISODateString;
}

// ============================================
// PAGINATION TYPES
// ============================================

export interface PaginationRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  data: T[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

// ============================================
// WEBSOCKET MESSAGE TYPES
// ============================================

export enum WebSocketMessageType {
  // Campaign events
  CAMPAIGN_CREATED = 'campaign_created',
  CAMPAIGN_STARTED = 'campaign_started',
  CAMPAIGN_PROGRESS = 'campaign_progress',
  CAMPAIGN_COMPLETED = 'campaign_completed',
  CAMPAIGN_FAILED = 'campaign_failed',
  CAMPAIGN_PAUSED = 'campaign_paused',
  CAMPAIGN_RESUMED = 'campaign_resumed',
  
  // System events
  SYSTEM_NOTIFICATION = 'system_notification',
  SYSTEM_ERROR = 'system_error',
  
  // Proxy events
  PROXY_STATUS_CHANGED = 'proxy_status_changed',
  PROXY_HEALTH_CHECK = 'proxy_health_check',
  
  // Persona events
  PERSONA_STATUS_CHANGED = 'persona_status_changed',
}

export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  timestamp: ISODateString;
  data: T;
  correlationId?: string;
}

export interface CampaignProgressData {
  campaignId: UUID;
  totalItems: SafeBigInt;
  processedItems: SafeBigInt;
  successfulItems: SafeBigInt;
  failedItems: SafeBigInt;
  progressPercentage: number;
  estimatedTimeRemaining?: number;  // seconds
  currentRate?: number;  // items per second
}

export interface SystemNotificationData {
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
}

export interface ProxyStatusData {
  proxyId: UUID;
  isHealthy: boolean;
  latencyMs?: number;
  lastCheckedAt: ISODateString;
  error?: string;
}