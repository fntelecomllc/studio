/**
 * Aligned Enums
 * 
 * Enum definitions that exactly match Go backend values
 * Case-sensitive and value-exact matching is critical
 * 
 * Generated: 2025-06-20
 * Source of Truth: Go Backend enums
 */

// ============================================
// CAMPAIGN ENUMS
// ============================================

/**
 * Campaign Status Enum
 * Go source: backend/internal/models/models.go
 * 
 * CRITICAL: 'archived' status does NOT exist in backend!
 */
export const CampaignStatusEnum = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSING: 'pausing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const;

export type CampaignStatus = typeof CampaignStatusEnum[keyof typeof CampaignStatusEnum];

/**
 * Campaign Type Enum
 * Go source: backend/internal/models/models.go
 * 
 * CRITICAL: 'keyword_validate' is deprecated and should NOT be used!
 */
export const CampaignTypeEnum = {
  DOMAIN_GENERATION: 'domain_generation',
  DNS_VALIDATION: 'dns_validation',
  HTTP_KEYWORD_VALIDATION: 'http_keyword_validation'
} as const;

export type CampaignType = typeof CampaignTypeEnum[keyof typeof CampaignTypeEnum];

/**
 * HTTP Source Type Enum
 * Go source: backend/internal/services/campaign_orchestrator_service.go
 *
 * CRITICAL: Values MUST be PascalCase, not snake_case!
 */
export const HTTPSourceTypeEnum = {
  DOMAIN_GENERATION: 'DomainGeneration',
  DNS_VALIDATION: 'DNSValidation'
} as const;

export type HTTPSourceType = typeof HTTPSourceTypeEnum[keyof typeof HTTPSourceTypeEnum];

// ============================================
// DOMAIN GENERATION ENUMS
// ============================================

/**
 * Domain Pattern Type Enum
 * Go source: backend/internal/services/domain_generation_service.go
 */
export const DomainPatternTypeEnum = {
  FIXED: 'fixed',
  VARIABLE: 'variable',
  HYBRID: 'hybrid'
} as const;

export type DomainPatternType = typeof DomainPatternTypeEnum[keyof typeof DomainPatternTypeEnum];

// ============================================
// JOB ENUMS
// ============================================

/**
 * Job Status Enum
 * Go source: backend/internal/models/models.go
 */
export const JobStatusEnum = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying'
} as const;

export type JobStatus = typeof JobStatusEnum[keyof typeof JobStatusEnum];

// ============================================
// PERSONA ENUMS
// ============================================

/**
 * Persona Type Enum
 * Go source: backend/internal/models/models.go
 */
export const PersonaTypeEnum = {
  DNS: 'dns',
  HTTP: 'http'
} as const;

export type PersonaType = typeof PersonaTypeEnum[keyof typeof PersonaTypeEnum];

// ============================================
// PROXY ENUMS
// ============================================

/**
 * Proxy Protocol Enum
 * Go source: backend/internal/models/models.go
 */
export const ProxyProtocolEnum = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS5: 'socks5',
  SOCKS4: 'socks4'
} as const;

export type ProxyProtocol = typeof ProxyProtocolEnum[keyof typeof ProxyProtocolEnum];

// ============================================
// DNS ENUMS
// ============================================

/**
 * DNS Record Type Enum
 * Go source: backend/internal/dnsvalidator/models.go
 */
export const DNSRecordTypeEnum = {
  A: 'A',
  AAAA: 'AAAA',
  CNAME: 'CNAME',
  MX: 'MX',
  TXT: 'TXT',
  NS: 'NS',
  SOA: 'SOA',
  PTR: 'PTR',
  SRV: 'SRV'
} as const;

export type DNSRecordType = typeof DNSRecordTypeEnum[keyof typeof DNSRecordTypeEnum];

// ============================================
// AUTH ENUMS
// ============================================

/**
 * User Role Enum
 * Common roles used in the system
 */
export const UserRoleEnum = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
} as const;

export type UserRole = typeof UserRoleEnum[keyof typeof UserRoleEnum];

/**
 * Permission Action Enum
 * Standard CRUD + custom actions
 */
export const PermissionActionEnum = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXECUTE: 'execute',
  APPROVE: 'approve',
  EXPORT: 'export'
} as const;

export type PermissionAction = typeof PermissionActionEnum[keyof typeof PermissionActionEnum];

/**
 * Permission Resource Enum
 * Resources that can be controlled
 */
export const PermissionResourceEnum = {
  CAMPAIGN: 'campaign',
  USER: 'user',
  PERSONA: 'persona',
  PROXY: 'proxy',
  SYSTEM: 'system',
  REPORT: 'report'
} as const;

export type PermissionResource = typeof PermissionResourceEnum[keyof typeof PermissionResourceEnum];

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Check if a value is a valid enum value
 */
export function isValidEnumValue<T extends Record<string, string>>(
  enumObj: T,
  value: unknown
): value is T[keyof T] {
  return Object.values(enumObj).includes(value as string);
}

/**
 * Get enum key from value
 */
export function getEnumKey<T extends Record<string, string>>(
  enumObj: T,
  value: T[keyof T]
): keyof T | undefined {
  return (Object.keys(enumObj) as Array<keyof T>).find(key => enumObj[key] === value);
}

/**
 * Validate campaign status
 */
export function isValidCampaignStatus(value: unknown): value is CampaignStatus {
  return isValidEnumValue(CampaignStatusEnum, value);
}

/**
 * Validate campaign type
 */
export function isValidCampaignType(value: unknown): value is CampaignType {
  return isValidEnumValue(CampaignTypeEnum, value);
}

/**
 * Validate HTTP source type
 */
export function isValidHTTPSourceType(value: unknown): value is HTTPSourceType {
  return isValidEnumValue(HTTPSourceTypeEnum, value);
}

/**
 * Validate persona type
 */
export function isValidPersonaType(value: unknown): value is PersonaType {
  return isValidEnumValue(PersonaTypeEnum, value);
}

/**
 * Validate proxy protocol
 */
export function isValidProxyProtocol(value: unknown): value is ProxyProtocol {
  return isValidEnumValue(ProxyProtocolEnum, value);
}

// ============================================
// ENUM CONVERSION HELPERS
// ============================================

/**
 * Convert legacy campaign type values
 */
export function normalizeCampaignType(value: string): CampaignType | null {
  switch (value.toLowerCase()) {
    case 'domain_generation':
    case 'domaingeneration':
      return CampaignTypeEnum.DOMAIN_GENERATION;
    
    case 'dns_validation':
    case 'dnsvalidation':
      return CampaignTypeEnum.DNS_VALIDATION;
    
    case 'http_keyword_validation':
    case 'httpkeywordvalidation':
    case 'keyword_validate': // Legacy value
      return CampaignTypeEnum.HTTP_KEYWORD_VALIDATION;
    
    default:
      return null;
  }
}

/**
 * Convert snake_case HTTP source type to PascalCase
 */
export function normalizeHTTPSourceType(value: string): HTTPSourceType | null {
  switch (value.toLowerCase()) {
    case 'domain_generation':
    case 'domaingeneration':
      return HTTPSourceTypeEnum.DOMAIN_GENERATION;
    
    case 'dns_validation':
    case 'dnsvalidation':
      return HTTPSourceTypeEnum.DNS_VALIDATION;
    
    default:
      return null;
  }
}

/**
 * Safely get enum value with fallback
 */
export function getEnumValueSafe<T extends Record<string, string>>(
  enumObj: T,
  value: unknown,
  fallback: T[keyof T]
): T[keyof T] {
  return isValidEnumValue(enumObj, value) ? value as T[keyof T] : fallback;
}

// ============================================
// ENUM LISTS FOR VALIDATION
// ============================================

export const VALID_CAMPAIGN_STATUSES = Object.values(CampaignStatusEnum);
export const VALID_CAMPAIGN_TYPES = Object.values(CampaignTypeEnum);
export const VALID_HTTP_SOURCE_TYPES = Object.values(HTTPSourceTypeEnum);
export const VALID_PERSONA_TYPES = Object.values(PersonaTypeEnum);
export const VALID_PROXY_PROTOCOLS = Object.values(ProxyProtocolEnum);
export const VALID_DNS_RECORD_TYPES = Object.values(DNSRecordTypeEnum);
export const VALID_JOB_STATUSES = Object.values(JobStatusEnum);

// ============================================
// DEPRECATED VALUES
// ============================================

/**
 * List of deprecated enum values that should be migrated
 */
export const DEPRECATED_ENUM_VALUES = {
  campaignStatus: ['archived'],
  campaignType: ['keyword_validate'],
  httpSourceType: ['domain_generation', 'dns_validation'] // snake_case versions
};

/**
 * Check if enum value is deprecated
 */
export function isDeprecatedEnumValue(enumType: keyof typeof DEPRECATED_ENUM_VALUES, value: string): boolean {
  return DEPRECATED_ENUM_VALUES[enumType]?.includes(value) ?? false;
}