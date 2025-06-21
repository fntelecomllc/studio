/**
 * Aligned validation schemas matching backend validation rules exactly
 * Based on backend_contracts.json validation requirements
 */

import { z } from 'zod';
import { 
  uuidSchema, 
  safeBigIntSchema
} from './brandedValidationSchemas';

// ============================================================================
// AUTHENTICATION SCHEMAS - Aligned with backend validation
// ============================================================================

export const loginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  rememberMe: z.boolean().optional(),
  captchaToken: z.string().optional()
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(12, 'New password must be at least 12 characters')
});

// ============================================================================
// USER MANAGEMENT SCHEMAS - Aligned with backend validation
// ============================================================================

export const createUserRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  roleIds: z.array(uuidSchema).optional()
});

export const updateUserRequestSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  roleIds: z.array(uuidSchema).optional()
});

// ============================================================================
// PERSONA SCHEMAS - Aligned with backend validation
// ============================================================================

export const createPersonaRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  personaType: z.enum(['dns', 'http'], {
    errorMap: () => ({ message: 'Persona type must be dns or http' })
  }),
  description: z.string().optional(),
  configDetails: z.record(z.unknown()),
  isEnabled: z.boolean().optional()
});

export const updatePersonaRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  configDetails: z.record(z.unknown()).optional(),
  isEnabled: z.boolean().optional()
});

// ============================================================================
// PROXY SCHEMAS - Aligned with backend validation
// ============================================================================

const hostnamePortRegex = /^[a-zA-Z0-9.-]+:[0-9]+$/;

export const createProxyRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().optional(),
  protocol: z.enum(['http', 'https', 'socks5', 'socks4'], {
    errorMap: () => ({ message: 'Invalid proxy protocol' })
  }),
  address: z.string().regex(hostnamePortRegex, 'Invalid hostname:port format'),
  username: z.string().optional(),
  password: z.string().optional(),
  countryCode: z.string().optional(),
  isEnabled: z.boolean().optional()
});

export const updateProxyRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  protocol: z.enum(['http', 'https', 'socks5', 'socks4']).optional(),
  address: z.string().regex(hostnamePortRegex).optional(),
  username: z.string().optional().nullable(),
  password: z.string().optional().nullable(),
  countryCode: z.string().optional().nullable(),
  isEnabled: z.boolean().optional()
});

// ============================================================================
// KEYWORD SCHEMAS - Aligned with backend validation
// ============================================================================

export const keywordRuleRequestSchema = z.object({
  pattern: z.string().min(1, 'Pattern is required'),
  ruleType: z.enum(['string', 'regex'], {
    errorMap: () => ({ message: 'Rule type must be string or regex' })
  }),
  isCaseSensitive: z.boolean().default(false),
  category: z.string().optional(),
  contextChars: z.number().int().min(0).default(50)
});

export const createKeywordSetRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().optional(),
  isEnabled: z.boolean().optional(),
  rules: z.array(keywordRuleRequestSchema).optional()
});

export const updateKeywordSetRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
  isEnabled: z.boolean().optional(),
  rules: z.array(keywordRuleRequestSchema).optional()
});

// ============================================================================
// CAMPAIGN SCHEMAS - Aligned with backend validation
// ============================================================================

export const domainGenerationParamsSchema = z.object({
  patternType: z.enum(['prefix', 'suffix', 'both'], {
    errorMap: () => ({ message: 'Pattern type must be prefix, suffix, or both' })
  }),
  variableLength: z.number().int().positive().optional(),
  characterSet: z.string().optional(),
  constantString: z.string().optional(),
  tld: z.string().min(1, 'TLD is required'),
  numDomainsToGenerate: z.number().int().positive('Must be a positive number'),
  totalPossibleCombinations: safeBigIntSchema,
  currentOffset: safeBigIntSchema.optional()
});

export const dnsValidationParamsSchema = z.object({
  sourceGenerationCampaignId: uuidSchema.optional(),
  personaIds: z.array(uuidSchema).min(1, 'At least one persona required'),
  rotationIntervalSeconds: z.number().int().min(0).optional(),
  processingSpeedPerMinute: z.number().int().min(0).optional(),
  batchSize: z.number().int().min(1).max(10000).optional(), // Backend: min=1, max=10000
  retryAttempts: z.number().int().min(0).max(10).optional(), // Backend: min=0, max=10
  metadata: z.record(z.unknown()).optional()
});

export const httpKeywordParamsSchema = z.object({
  sourceCampaignId: uuidSchema,
  sourceType: z.enum(['DomainGeneration', 'DNSValidation'], {
    errorMap: () => ({ message: 'Source type must be one of: DomainGeneration, DNSValidation' })
  }),
  keywordSetIds: z.array(uuidSchema).optional(),
  adHocKeywords: z.array(z.string()).optional(),
  personaIds: z.array(uuidSchema).min(1, 'At least one persona required'),
  proxyIds: z.array(uuidSchema).optional(),
  proxyPoolId: uuidSchema.optional().nullable(),
  proxySelectionStrategy: z.string().optional(),
  rotationIntervalSeconds: z.number().int().min(0).optional(),
  processingSpeedPerMinute: z.number().int().min(0).optional(),
  batchSize: z.number().int().min(1).max(10000).optional(), // Backend: min=1, max=10000
  retryAttempts: z.number().int().min(0).max(10).optional(), // Backend: min=0, max=10
  targetHttpPorts: z.array(z.number().int().min(1).max(65535)).optional(), // Backend: valid port range
  lastProcessedDomainName: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const createCampaignRequestSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  campaignType: z.enum(['domain_generation', 'dns_validation', 'http_keyword_validation'], {
    errorMap: () => ({ message: 'Invalid campaign type' })
  }),
  domainGenerationParams: domainGenerationParamsSchema.optional(),
  dnsValidationParams: dnsValidationParamsSchema.optional(),
  httpKeywordParams: httpKeywordParamsSchema.optional()
}).superRefine((data, ctx) => {
  // Conditional validation based on campaign type
  if (data.campaignType === 'domain_generation' && !data.domainGenerationParams) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Domain generation parameters required for domain_generation campaign',
      path: ['domainGenerationParams']
    });
  }
  if (data.campaignType === 'dns_validation' && !data.dnsValidationParams) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DNS validation parameters required for dns_validation campaign',
      path: ['dnsValidationParams']
    });
  }
  if (data.campaignType === 'http_keyword_validation' && !data.httpKeywordParams) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'HTTP keyword parameters required for http_keyword_validation campaign',
      path: ['httpKeywordParams']
    });
  }
});

// ============================================================================
// EXTRACTION SCHEMAS - Aligned with backend validation
// ============================================================================

export const keywordExtractionRequestItemSchema = z.object({
  url: z.string().url('Invalid URL format'),
  httpPersonaId: uuidSchema.optional(),
  dnsPersonaId: uuidSchema.optional(),
  keywordSetId: uuidSchema
});

export const batchKeywordExtractionRequestSchema = z.object({
  items: z.array(keywordExtractionRequestItemSchema)
    .min(1, 'At least one item required')
});

// ============================================================================
// RESPONSE VALIDATION SCHEMAS
// ============================================================================

export const paginationResponseSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0)
});

export const errorResponseSchema = z.object({
  code: z.number().optional(),
  message: z.string(),
  status: z.string().optional(),
  details: z.array(z.object({
    field: z.string().optional(),
    message: z.string(),
    code: z.string().optional()
  })).optional()
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach(err => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    throw error;
  }
}

export function validateResponse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  return schema.parse(data);
}

// Export all schemas for easy access
export const validationSchemas = {
  // Auth
  loginRequest: loginRequestSchema,
  changePasswordRequest: changePasswordRequestSchema,
  
  // Users
  createUserRequest: createUserRequestSchema,
  updateUserRequest: updateUserRequestSchema,
  
  // Personas
  createPersonaRequest: createPersonaRequestSchema,
  updatePersonaRequest: updatePersonaRequestSchema,
  
  // Proxies
  createProxyRequest: createProxyRequestSchema,
  updateProxyRequest: updateProxyRequestSchema,
  
  // Keywords
  createKeywordSetRequest: createKeywordSetRequestSchema,
  updateKeywordSetRequest: updateKeywordSetRequestSchema,
  
  // Campaigns
  createCampaignRequest: createCampaignRequestSchema,
  domainGenerationParams: domainGenerationParamsSchema,
  dnsValidationParams: dnsValidationParamsSchema,
  httpKeywordParams: httpKeywordParamsSchema,
  
  // Extraction
  batchKeywordExtractionRequest: batchKeywordExtractionRequestSchema,
  
  // Responses
  paginationResponse: paginationResponseSchema,
  errorResponse: errorResponseSchema
};