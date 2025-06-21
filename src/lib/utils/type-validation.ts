// src/lib/utils/type-validation.ts
// Type validation utilities for backend-frontend alignment
import type {
  Campaign,
  CampaignType,
  CampaignStatus,
  PersonaType,
  ProxyProtocol,
  User,
  Session,
  Role,
  Permission,
  GeneratedDomain,
  DNSValidationResult,
  HTTPKeywordResult,
  CampaignJob,
} from '@/lib/types';

// Runtime type validation functions
export function validateCampaignType(value: unknown): value is CampaignType {
  return typeof value === 'string' && 
    ['domain_generation', 'dns_validation', 'http_keyword_validation'].includes(value);
}

export function validateCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === 'string' && 
    ['pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'archived', 'cancelled'].includes(value);
}

export function validatePersonaType(value: unknown): value is PersonaType {
  return typeof value === 'string' && ['dns', 'http'].includes(value);
}

export function validateProxyProtocol(value: unknown): value is ProxyProtocol {
  return typeof value === 'string' && ['http', 'https', 'socks5', 'socks4'].includes(value);
}

export function validateUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

export function validateISODateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString() === value;
}

// Campaign validation
export function validateCampaign(data: unknown): data is Campaign {
  if (!data || typeof data !== 'object') return false;
  
  const campaign = data as Record<string, unknown>;
  
  return (
    validateUUID(campaign.id) &&
    typeof campaign.name === 'string' &&
    validateCampaignType(campaign.campaignType) &&
    validateCampaignStatus(campaign.status) &&
    validateISODateTime(campaign.createdAt) &&
    validateISODateTime(campaign.updatedAt) &&
    (campaign.userId === undefined || campaign.userId === null || validateUUID(campaign.userId)) &&
    (campaign.startedAt === undefined || campaign.startedAt === null || validateISODateTime(campaign.startedAt)) &&
    (campaign.completedAt === undefined || campaign.completedAt === null || validateISODateTime(campaign.completedAt))
  );
}

// User validation  
export function validateUser(data: unknown): data is User {
  if (!data || typeof data !== 'object') return false;
  
  const user = data as Record<string, unknown>;
  
  return (
    validateUUID(user.id) &&
    typeof user.email === 'string' &&
    typeof user.emailVerified === 'boolean' &&
    typeof user.firstName === 'string' &&
    typeof user.lastName === 'string' &&
    typeof user.isActive === 'boolean' &&
    typeof user.isLocked === 'boolean' &&
    typeof user.mustChangePassword === 'boolean' &&
    typeof user.mfaEnabled === 'boolean' &&
    validateISODateTime(user.createdAt) &&
    validateISODateTime(user.updatedAt) &&
    Array.isArray(user.roles) &&
    Array.isArray(user.permissions)
  );
}

// Session validation
export function validateSession(data: unknown): data is Session {
  if (!data || typeof data !== 'object') return false;
  
  const session = data as Record<string, unknown>;
  
  return (
    typeof session.id === 'string' &&
    validateUUID(session.userId) &&
    typeof session.isActive === 'boolean' &&
    validateISODateTime(session.expiresAt) &&
    validateISODateTime(session.lastActivityAt) &&
    validateISODateTime(session.createdAt)
  );
}

// Generated Domain validation
export function validateGeneratedDomain(data: unknown): data is GeneratedDomain {
  if (!data || typeof data !== 'object') return false;
  
  const domain = data as Record<string, unknown>;
  
  return (
    validateUUID(domain.id) &&
    validateUUID(domain.generationCampaignId) &&
    typeof domain.domainName === 'string' &&
    typeof domain.offsetIndex === 'number' &&
    validateISODateTime(domain.generatedAt) &&
    validateISODateTime(domain.createdAt) &&
    // Legacy compatibility fields
    typeof domain.domain === 'string' &&
    typeof domain.campaignId === 'string' &&
    typeof domain.index === 'number' &&
    typeof domain.status === 'string' &&
    ['Generated', 'Validated', 'Failed'].includes(domain.status as string)
  );
}

// DNS Validation Result validation
export function validateDNSValidationResult(data: unknown): data is DNSValidationResult {
  if (!data || typeof data !== 'object') return false;
  
  const result = data as Record<string, unknown>;
  
  return (
    validateUUID(result.id) &&
    validateUUID(result.dnsCampaignId) &&
    typeof result.domainName === 'string' &&
    typeof result.validationStatus === 'string' &&
    validateISODateTime(result.createdAt)
  );
}

// HTTP Keyword Result validation
export function validateHTTPKeywordResult(data: unknown): data is HTTPKeywordResult {
  if (!data || typeof data !== 'object') return false;
  
  const result = data as Record<string, unknown>;
  
  return (
    validateUUID(result.id) &&
    validateUUID(result.httpKeywordCampaignId) &&
    typeof result.domainName === 'string' &&
    typeof result.validationStatus === 'string' &&
    typeof result.attempts === 'number' &&
    validateISODateTime(result.createdAt)
  );
}

// Permission validation
export function validatePermission(data: unknown): data is Permission {
  if (!data || typeof data !== 'object') return false;
  
  const permission = data as Record<string, unknown>;
  
  return (
    validateUUID(permission.id) &&
    typeof permission.name === 'string' &&
    typeof permission.displayName === 'string' &&
    typeof permission.resource === 'string' &&
    typeof permission.action === 'string' &&
    validateISODateTime(permission.createdAt)
  );
}

// Role validation
export function validateRole(data: unknown): data is Role {
  if (!data || typeof data !== 'object') return false;
  
  const role = data as Record<string, unknown>;
  
  return (
    validateUUID(role.id) &&
    typeof role.name === 'string' &&
    typeof role.displayName === 'string' &&
    typeof role.isSystemRole === 'boolean' &&
    validateISODateTime(role.createdAt) &&
    validateISODateTime(role.updatedAt)
  );
}

// Campaign Job validation
export function validateCampaignJob(data: unknown): data is CampaignJob {
  if (!data || typeof data !== 'object') return false;
  
  const job = data as Record<string, unknown>;
  
  return (
    validateUUID(job.id) &&
    validateUUID(job.campaignId) &&
    validateCampaignType(job.jobType) &&
    typeof job.status === 'string' &&
    ['pending', 'queued', 'running', 'processing', 'completed', 'failed', 'retry'].includes(job.status as string) &&
    validateISODateTime(job.scheduledAt) &&
    typeof job.attempts === 'number' &&
    typeof job.maxAttempts === 'number' &&
    validateISODateTime(job.createdAt) &&
    validateISODateTime(job.updatedAt)
  );
}

// Comprehensive API response validation
export function validateApiResponse<T>(
  data: unknown,
  validator: (data: unknown) => data is T
): { valid: boolean; data?: T; errors: string[] } {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Response data is not an object');
    return { valid: false, errors };
  }
  
  try {
    if (validator(data)) {
      return { valid: true, data: data as T, errors: [] };
    } else {
      errors.push('Data does not match expected type structure');
      return { valid: false, errors };
    }
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { valid: false, errors };
  }
}

// Helper function to validate arrays
export function validateArray<T>(
  data: unknown,
  validator: (item: unknown) => item is T
): { valid: boolean; data?: T[]; errors: string[] } {
  if (!Array.isArray(data)) {
    return { valid: false, errors: ['Data is not an array'] };
  }
  
  const errors: string[] = [];
  const validItems: T[] = [];
  
  data.forEach((item, index) => {
    if (validator(item)) {
      validItems.push(item);
    } else {
      errors.push(`Item at index ${index} is invalid`);
    }
  });
  
  return {
    valid: errors.length === 0,
    data: errors.length === 0 ? validItems : undefined,
    errors
  };
}

// Export validation utilities
export const TypeValidators = {
  campaign: validateCampaign,
  user: validateUser,
  session: validateSession,
  generatedDomain: validateGeneratedDomain,
  dnsValidationResult: validateDNSValidationResult,
  httpKeywordResult: validateHTTPKeywordResult,
  permission: validatePermission,
  role: validateRole,
  campaignJob: validateCampaignJob,
} as const;

// Type safety checker for API responses
export function createTypeSafeApiValidator<T>(
  validator: (data: unknown) => data is T
) {
  return (data: unknown) => validateApiResponse(data, validator);
}

// Pre-built validators for common API responses
export const ApiValidators = {
  campaign: createTypeSafeApiValidator(validateCampaign),
  campaigns: (data: unknown) => validateArray(data, validateCampaign),
  user: createTypeSafeApiValidator(validateUser),
  users: (data: unknown) => validateArray(data, validateUser),
  session: createTypeSafeApiValidator(validateSession),
  sessions: (data: unknown) => validateArray(data, validateSession),
} as const;