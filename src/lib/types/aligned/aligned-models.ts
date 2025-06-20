/**
 * Aligned TypeScript Models
 * 
 * These interfaces are strictly aligned with Go backend contracts
 * All int64 fields use SafeBigInt to prevent numeric overflow
 * All enums match Go values exactly (case-sensitive)
 * 
 * Generated: 2025-06-20
 * Source of Truth: Go Backend (backend/internal/models/)
 */

import { 
  SafeBigInt, 
  createSafeBigInt,
  UUID,
  ISODateString,
  Email as EmailString,
  createUUID,
  createISODateString,
  createEmail,
  isValidUUID,
  isValidISODate,
  isValidEmail
} from '../branded';

// Re-export IP Address type
export type IPAddress = string & { readonly __brand: 'IPAddress' };

// ============================================
// ENUMS - Exact match with Go backend
// ============================================

export enum CampaignStatus {
  PENDING = 'Pending',
  QUEUED = 'Queued',
  RUNNING = 'Running',
  PAUSING = 'Pausing',
  PAUSED = 'Paused',
  COMPLETED = 'Completed',
  FAILED = 'Failed',
  ARCHIVED = 'Archived',
  CANCELLED = 'Cancelled'
  // NOTE: 'archived' was added to match backend
}

export enum CampaignType {
  DOMAIN_GENERATION = 'DomainGeneration',
  DNS_VALIDATION = 'DNSValidation',
  HTTP_KEYWORD_VALIDATION = 'HTTPKeywordValidation'
  // NOTE: 'keyword_validate' is deprecated and should not be used
}

export enum HTTPSourceType {
  DOMAIN_GENERATION = 'DomainGeneration',  // PascalCase required!
  DNS_VALIDATION = 'DNSValidation'         // PascalCase required!
}

export enum PersonaType {
  DNS = 'DNS',
  HTTP = 'HTTP'
}

export enum ProxyProtocol {
  HTTP = 'http',
  HTTPS = 'https',
  SOCKS5 = 'socks5',
  SOCKS4 = 'socks4'
}

export enum DomainPatternType {
  FIXED = 'fixed',
  VARIABLE = 'variable',
  HYBRID = 'hybrid'
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying'
}

// ============================================
// CORE MODELS
// ============================================

export interface Campaign {
  id: UUID;
  name: string;
  campaignType: CampaignType;
  status: CampaignStatus;
  userId?: UUID;
  
  // Int64 fields - use SafeBigInt
  totalItems: SafeBigInt;
  processedItems: SafeBigInt;
  successfulItems: SafeBigInt;
  failedItems: SafeBigInt;
  
  progressPercentage?: number;
  metadata?: Record<string, unknown>;
  
  // Timestamps
  createdAt: ISODateString;
  updatedAt: ISODateString;
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  
  // Additional fields from DB
  estimatedCompletionAt?: ISODateString;
  avgProcessingRate?: number;
  lastHeartbeatAt?: ISODateString;
  
  errorMessage?: string;
  
  // Related params (populated via joins)
  domainGenerationParams?: DomainGenerationParams;
  dnsValidationParams?: DNSValidationParams;
  httpKeywordParams?: HTTPKeywordParams;
}

export interface DomainGenerationParams {
  id: UUID;
  campaignId: UUID;
  patternType: DomainPatternType;
  tld: string;
  constantString?: string;
  variableLength: number;
  characterSet: string;
  numDomainsToGenerate: number;
  
  // CRITICAL: These fields were missing in generated types
  totalPossibleCombinations: SafeBigInt;
  currentOffset: SafeBigInt;
  
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DNSValidationParams {
  id: UUID;
  campaignId: UUID;
  dnsServers: string[];
  recordTypes: string[];
  timeout: number;
  retries: number;
  batchSize: number;
  sourceCampaignId?: UUID;
  
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface HTTPKeywordParams {
  id: UUID;
  campaignId: UUID;
  targetUrl: string;
  keywordSetId?: UUID;
  
  // CRITICAL: These fields were missing in generated types
  sourceType: HTTPSourceType;  // Required field! Uses HTTPSourceType enum (DomainGeneration or DNSValidation)
  sourceCampaignId?: UUID;
  
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface User {
  id: UUID;
  email: EmailString;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  lockedUntil?: ISODateString;
  lastLoginAt?: ISODateString;
  lastLoginIp?: IPAddress;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: ISODateString;
  
  // Computed fields
  name?: string;  // firstName + " " + lastName
  
  // Relations
  roles?: Role[];
  permissions?: Permission[];
}

export interface PublicUser {
  id: UUID;
  email: EmailString;
  firstName: string;
  lastName: string;
  name: string;  // Computed: firstName + " " + lastName
  avatarUrl?: string;
  isActive: boolean;
  roles?: Role[];
  permissions?: Permission[];
}

export interface Role {
  id: UUID;
  name: string;
  description?: string;
  permissions?: Permission[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Permission {
  id: UUID;
  resource: string;
  action: string;
  description?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Persona {
  id: UUID;
  name: string;
  description?: string;
  personaType: PersonaType;
  configDetails: Record<string, unknown>;
  isEnabled: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  
  // NOTE: These fields exist in frontend but NOT in backend:
  // status?: string;
  // lastTested?: ISODateString;
  // lastError?: string;
  // tags?: string[];
}

export interface Proxy {
  id: UUID;
  name: string;
  description?: string;
  address: string;
  protocol: ProxyProtocol;
  username?: string;
  // password is never exposed to frontend
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
}

export interface GeneratedDomain {
  id: UUID;
  campaignId: UUID;
  domain: string;
  offsetIndex: SafeBigInt;  // Int64 field
  generatedAt: ISODateString;
  validatedAt?: ISODateString;
  isValid?: boolean;
  validationError?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignJob {
  id: UUID;
  campaignId: UUID;
  jobType: string;
  status: JobStatus;
  startOffset: SafeBigInt;  // Int64
  endOffset: SafeBigInt;    // Int64
  itemsInBatch: SafeBigInt; // Int64
  successfulItems: SafeBigInt; // Int64
  failedItems: SafeBigInt;   // Int64
  startedAt?: ISODateString;
  completedAt?: ISODateString;
  errorMessage?: string;
  retryCount: number;
  metadata?: Record<string, unknown>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function isValidIPAddress(value: string): value is IPAddress {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  return ipv4Regex.test(value) || ipv6Regex.test(value);
}

export function createIPAddress(value: string): IPAddress {
  if (!isValidIPAddress(value)) {
    throw new Error(`Invalid IP address format: ${value}`);
  }
  return value as IPAddress;
}

// Re-export branded type functions for convenience
export {
  createSafeBigInt,
  createUUID,
  createISODateString,
  createEmail as createEmailString,
  isValidUUID,
  isValidISODate,
  isValidEmail
};