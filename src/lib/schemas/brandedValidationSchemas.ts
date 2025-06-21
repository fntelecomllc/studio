// src/lib/schemas/brandedValidationSchemas.ts
// Enhanced validation schemas with branded type integration
import { z } from 'zod';
import { 
  UUID as _UUID, 
  createUUID, 
  isValidUUID, 
  SafeBigInt as _SafeBigInt,
  createSafeBigInt,
  ISODateString as _ISODateString,
  createISODateString
} from '@/lib/types/branded';

// Branded type validation schemas
export const uuidSchema = z.string().refine(isValidUUID, {
  message: "Invalid UUID format"
}).transform(createUUID);

export const safeBigIntSchema = z.union([
  z.number(),
  z.bigint(),
  z.string().transform(val => createSafeBigInt(val))
]).transform(createSafeBigInt);

export const isoDateStringSchema = z.union([
  z.string().datetime(),
  z.date().transform(date => date.toISOString())
]).transform(createISODateString);

// Enhanced validation schemas from generated schemas with branded types
export const keywordExtractionRequestItemSchemaWithBranded = z.object({
  url: z.string().url(),
  httpPersonaId: uuidSchema.optional(),
  dnsPersonaId: uuidSchema.optional(),
  keywordSetId: uuidSchema,
});

export type KeywordExtractionRequestItemBranded = z.infer<typeof keywordExtractionRequestItemSchemaWithBranded>;

export const createPersonaRequestSchemaWithBranded = z.object({
  name: z.string().min(1).max(255),
  personaType: z.enum(["dns", "http"]),
  configDetails: z.record(z.any()),
});

export type CreatePersonaRequestBranded = z.infer<typeof createPersonaRequestSchemaWithBranded>;

export const updatePersonaRequestSchemaWithBranded = z.object({
  name: z.string().min(1).max(255).optional(),
});

export type UpdatePersonaRequestBranded = z.infer<typeof updatePersonaRequestSchemaWithBranded>;

export const createProxyRequestSchemaWithBranded = z.object({
  name: z.string().min(1).max(255),
  protocol: z.enum(["http", "https", "socks5", "socks4"]),
  address: z.string().regex(/^[a-zA-Z0-9.-]+:[0-9]+$/, "Invalid hostname:port format"),
});

export type CreateProxyRequestBranded = z.infer<typeof createProxyRequestSchemaWithBranded>;

export const updateProxyRequestSchemaWithBranded = z.object({
  name: z.string().min(1).max(255).optional(),
  protocol: z.enum(["http", "https", "socks5", "socks4"]).optional(),
  address: z.string().regex(/^[a-zA-Z0-9.-]+:[0-9]+$/, "Invalid hostname:port format").optional(),
});

export type UpdateProxyRequestBranded = z.infer<typeof updateProxyRequestSchemaWithBranded>;

export const loginRequestSchemaWithBranded = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

export type LoginRequestBranded = z.infer<typeof loginRequestSchemaWithBranded>;

export const createUserRequestSchemaWithBranded = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  password: z.string().min(12),
});

export type CreateUserRequestBranded = z.infer<typeof createUserRequestSchemaWithBranded>;

// Campaign-specific schemas with branded types
export const campaignIdSchema = uuidSchema;
export const userIdSchema = uuidSchema;
export const personaIdSchema = uuidSchema;
export const proxyIdSchema = uuidSchema;
export const keywordSetIdSchema = uuidSchema;

// Enhanced campaign form schema with branded types for IDs
export const campaignFormSchemaWithBrandedIds = z.object({
  name: z.string().min(3, { message: "Campaign name must be at least 3 characters." }),
  description: z.string().optional(),
  selectedType: z.enum(['domain_generation', 'dns_validation', 'http_keyword_validation']),
  assignedHttpPersonaId: personaIdSchema.optional(),
  assignedDnsPersonaId: personaIdSchema.optional(),
  proxyAssignmentMode: z.enum(['none', 'single', 'rotate_active']).default('none'),
  assignedProxyId: proxyIdSchema.optional(),
  sourceCampaignId: campaignIdSchema.optional(),
  keywordSetId: keywordSetIdSchema.optional(),
  
  // Domain source configuration
  domainSourceSelectionMode: z.enum(['none','upload', 'campaign_output']).optional(),
  uploadedDomainsFile: z.custom<File>(val => val instanceof File, "Please select a file.").optional().nullable(),
  uploadedDomainsContentCache: z.array(z.string()).optional(),
  sourcePhase: z.enum(['domain_generation', 'dns_validation', 'http_validation']).optional(),
  initialDomainsToProcessCount: z.coerce.number().int().positive("Must be a positive number if set.").optional(),
  
  // Domain generation configuration
  generationPattern: z.enum(['prefix_variable', 'suffix_variable', 'both_variable', 'constant_only']).optional(),
  constantPart: z.string().optional(),
  allowedCharSet: z.string().optional(),
  tldsInput: z.string().optional(),
  tlds: z.array(z.string().min(1).refine(val => val.startsWith('.'), { 
    message: "Each TLD must start with a period."
  })).optional(),
  prefixVariableLength: z.coerce.number().int().min(0, "Must be 0 or positive.").optional(),
  suffixVariableLength: z.coerce.number().int().min(0, "Must be 0 or positive.").optional(),
  maxDomainsToGenerate: z.coerce.number().int().positive("Target domains must be positive.").optional(),
  
  // Keyword extraction configuration
  targetKeywordsInput: z.string().optional(),
  scrapingRateLimitRequests: z.coerce.number().int().positive("Requests must be positive.").optional(),
  scrapingRateLimitPer: z.enum(['second', 'minute']).optional(),
  requiresJavaScriptRendering: z.boolean().optional().default(false),
});

export type CampaignFormValuesWithBrandedIds = z.infer<typeof campaignFormSchemaWithBrandedIds>;

// User management schemas with branded types
export const adminUserManagementSchemaWithBranded = z.object({
  id: userIdSchema.optional(),
  email: z.string().email(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  isActive: z.boolean(),
  roleId: uuidSchema,
  password: z.string().min(12).optional(), // Optional for updates
});

export type AdminUserManagementFormBranded = z.infer<typeof adminUserManagementSchemaWithBranded>;

// Persona management schemas with branded types
export const personaManagementSchemaWithBranded = z.object({
  id: personaIdSchema.optional(),
  name: z.string().min(1).max(255),
  personaType: z.enum(["dns", "http"]),
  configDetails: z.record(z.any()),
});

export type PersonaManagementFormBranded = z.infer<typeof personaManagementSchemaWithBranded>;

// Proxy management schemas with branded types
export const proxyManagementSchemaWithBranded = z.object({
  id: proxyIdSchema.optional(),
  name: z.string().min(1).max(255),
  protocol: z.enum(["http", "https", "socks5", "socks4"]),
  address: z.string().regex(/^[a-zA-Z0-9.-]+:[0-9]+$/, "Invalid hostname:port format"),
  isActive: z.boolean(),
});

export type ProxyManagementFormBranded = z.infer<typeof proxyManagementSchemaWithBranded>;

// Form validation utilities for branded types
export const validateAndTransformFormData = <T extends Record<string, unknown>>(
  data: T,
  schema: z.ZodSchema<unknown>
): { success: true; data: unknown } | { success: false; errors: z.ZodError } => {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
};

// Type-safe form error extraction for branded types
export const extractBrandedTypeErrors = (error: z.ZodError): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    errors[path] = err.message;
  });
  
  return errors;
};
