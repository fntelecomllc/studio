import { z } from 'zod';
import { uuidSchema, timestampSchema } from './commonSchemas';

/**
 * @description Zod schema for CampaignSelectedType enum.
 */
export const campaignSelectedTypeSchema = z.union([
  z.literal("domain_generation"),
  z.literal("dns_validation"),
  z.literal("http_keyword_validation"),
  z.literal("lead_generation"),
]);

/**
 * @description Zod schema for CampaignPhase enum.
 */
export const campaignPhaseSchema = z.union([
  z.literal("idle"),
  z.literal("domain_generation"),
  z.literal("dns_validation"),
  z.literal("http_validation"),
  z.literal("lead_generation"),
  z.literal("completed"),
  z.literal("failed"),
]);

/**
 * @description Zod schema for CampaignPhaseStatus enum.
 */
export const campaignPhaseStatusSchema = z.union([
  z.literal('pending'),
  z.literal('running'),
  z.literal('completed'),
  z.literal('failed'),
  z.literal('idle'),
  z.literal('paused'),
]);

/**
 * @description Zod schema for DomainGenerationPattern enum.
 */
export const domainGenerationPatternSchema = z.union([
  z.literal("prefix_variable"),
  z.literal("suffix_variable"),
  z.literal("both_variable"),
]);

/**
 * @description Zod schema for DomainGenerationConfig.
 */
export const domainGenerationConfigSchema = z.object({
  generationPattern: domainGenerationPatternSchema,
  constantPart: z.string().min(1, "Constant part cannot be empty"),
  allowedCharSet: z.string().min(1, "Allowed character set cannot be empty"),
  tlds: z.array(z.string().min(1, "TLD cannot be empty")).min(1, "At least one TLD is required"),
  prefixVariableLength: z.number().int().positive().optional(),
  suffixVariableLength: z.number().int().positive().optional(),
  maxDomainsToGenerate: z.number().int().positive().optional(),
});

/**
 * @description Zod schema for DomainSourceType enum.
 */
export const domainSourceTypeSchema = z.union([
  z.literal('upload'),
  z.literal('campaign_output'),
  z.literal('current_campaign_output'),
  z.literal('none'),
]);

/**
 * @description Zod schema for DomainSource.
 */
export const domainSourceSchema = z.object({
  type: domainSourceTypeSchema,
  fileName: z.string().optional(),
  uploadedDomains: z.array(z.string()).optional(),
  sourceCampaignId: uuidSchema.optional(),
  sourceCampaignName: z.string().optional(),
  sourcePhase: campaignPhaseSchema.optional(),
});

/**
 * @description Zod schema for LeadGenerationSpecificConfig.
 */
export const leadGenerationSpecificConfigSchema = z.object({
  scrapingRateLimit: z.object({
    requests: z.number().int().positive(),
    per: z.union([z.literal('second'), z.literal('minute')]),
  }).optional(),
  requiresJavaScriptRendering: z.boolean().optional(),
  targetKeywords: z.array(z.string()).optional(),
});

/**
 * @description Zod schema for ProxyAssignment.
 */
export const proxyAssignmentSchema = z.object({
  mode: z.union([z.literal('none'), z.literal('single'), z.literal('rotate_active')]),
  proxyId: uuidSchema.optional(),
});

/**
 * @description Zod schema for CampaignAuditEntry.
 */
export const campaignAuditEntrySchema = z.object({
  timestamp: timestampSchema,
  userId: uuidSchema.optional(),
  action: z.string(),
  description: z.string().optional(),
});

/**
 * @description Zod schema for UploadEvent.
 */
export const uploadEventSchema = z.object({
  filename: z.string(),
  fileId: uuidSchema.optional(),
  uploadedAt: timestampSchema,
  uploadedBy: z.string().optional(),
});

/**
 * @description Zod schema for ExtractedContentItem.
 */
export const extractedContentItemSchema = z.object({
  id: uuidSchema,
  sourceUrl: z.string().url(),
  text: z.string(),
  similarityScore: z.number().min(0).max(1),
  previousCampaignId: uuidSchema.optional(),
  advancedAnalysis: z.object({ // Assuming AnalyzeContentOutput structure
    advancedKeywords: z.array(z.string()),
    categories: z.array(z.string()).optional(),
    summary: z.string().optional(),
    sentiment: z.union([z.literal('Positive'), z.literal('Negative'), z.literal('Neutral'), z.literal('N/A')]).optional(),
  }).optional(),
});

/**
 * @description Zod schema for Lead.
 */
export const leadSchema = z.object({
  id: uuidSchema,
  name: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  similarityScore: z.number().min(0).max(1),
  sourceUrl: z.string().url(),
  extractedKeywords: z.array(z.string()).optional(),
  previousCampaignId: uuidSchema.optional(),
});

/**
 * @description Zod schema for BaseCampaign.
 * This schema defines the common fields for all campaign types.
 */
export const baseCampaignSchema = z.object({
  id: uuidSchema,
  campaignName: z.string().min(1, "Campaign name cannot be empty"),
  name: z.string().min(1, "Campaign name cannot be empty"), // Alias for campaignName
  description: z.string().optional(),
  status: campaignPhaseStatusSchema,
  phaseStatus: campaignPhaseStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  createdBy: z.string().optional(),
  ownerId: uuidSchema.optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  auditLog: z.array(campaignAuditEntrySchema).optional(),
  progress: z.number().min(0).max(100),
  resultFilePath: z.string().optional(),
  currentPhase: campaignPhaseSchema,
  lastErrorMessage: z.string().nullable().optional(), // Nullable field

  selectedType: campaignSelectedTypeSchema,
  domainGenerationConfig: domainGenerationConfigSchema.optional(),
  domainSourceConfig: domainSourceSchema.optional(),
  initialDomainsToProcessCount: z.number().int().nonnegative().optional(),
  leadGenerationSpecificConfig: leadGenerationSpecificConfigSchema.optional(),
  assignedHttpPersonaId: uuidSchema.optional(),
  assignedDnsPersonaId: uuidSchema.optional(),
  proxyAssignment: proxyAssignmentSchema.optional(),

  domains: z.array(z.string()).optional(),
  dnsValidatedDomains: z.array(z.string()).optional(),
  httpValidatedDomains: z.array(z.string()).optional(),
  extractedContent: z.array(extractedContentItemSchema).optional(),
  leads: z.array(leadSchema).optional(),
});

/**
 * @description Zod schema for GeneratedDomain.
 */
export const generatedDomainSchema = z.object({
  id: uuidSchema,
  domain: z.string().min(1, "Domain cannot be empty"),
  generatedAt: timestampSchema,
  campaignId: uuidSchema,
  index: z.number().int().nonnegative().optional(),
  status: z.union([z.literal('Generated'), z.literal('Validated'), z.literal('Failed')]),
  validationResults: z.record(z.string(), z.any()).optional(), // JSONB field
});

/**
 * @description Zod schema for DNSValidationCampaignItem.
 */
export const dnsValidationCampaignItemSchema = z.object({
  domain: z.string().min(1, "Domain cannot be empty"),
  validationStatus: campaignPhaseStatusSchema,
  lastCheckedAt: timestampSchema.optional(),
  errorDetails: z.string().optional(),
  resultsByPersona: z.record(z.string(), z.object({ // JSONB field
    domain: z.string(),
    status: z.string(),
    ips: z.array(z.string().ip()).optional(),
    resolver: z.string().optional(),
    error: z.string().optional(),
    timestamp: timestampSchema,
    durationMs: z.number().int().nonnegative(),
  })).optional(),
  mismatchDetected: z.boolean().optional(),
});

/**
 * @description Zod schema for HTTPValidationCampaignItem.
 */
export const httpValidationCampaignItemSchema = z.object({
  id: uuidSchema,
  domainOrUrl: z.string().url(),
  validationStatus: campaignPhaseStatusSchema,
  httpStatusCode: z.number().int().optional(),
  finalUrl: z.string().url().optional(),
  contentHash: z.string().optional(),
  extractedTitle: z.string().optional(),
  extractedMetaDescription: z.string().optional(),
  responseHeaders: z.record(z.string(), z.array(z.string())).optional(), // JSONB field
  lastCheckedAt: timestampSchema.optional(),
  errorDetails: z.string().optional(),
});

/**
 * @description Zod schema for a generic Campaign, extending BaseCampaign.
 */
export const campaignSchema = baseCampaignSchema.extend({
  campaignType: campaignSelectedTypeSchema.optional(),
});

/**
 * @description Zod schema for CreateCampaignPayload.
 */
export const createCampaignPayloadSchema = z.object({
  campaignName: z.string().min(1, "Campaign name cannot be empty"),
  name: z.string().min(1, "Campaign name cannot be empty"), // Alias for campaignName
  description: z.string().optional(),
  selectedType: campaignSelectedTypeSchema,
  domainGenerationConfig: domainGenerationConfigSchema.optional(),
  domainSourceConfig: domainSourceSchema.optional(),
  initialDomainsToProcessCount: z.number().int().nonnegative().optional(),
  leadGenerationSpecificConfig: leadGenerationSpecificConfigSchema.optional(),
  assignedHttpPersonaId: uuidSchema.optional(),
  assignedDnsPersonaId: uuidSchema.optional(),
  proxyAssignment: proxyAssignmentSchema.optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * @description Zod schema for UpdateCampaignPayload.
 */
export const updateCampaignPayloadSchema = createCampaignPayloadSchema.partial().extend({
  status: campaignPhaseStatusSchema.optional(),
  currentPhase: campaignPhaseSchema.optional(),
  progress: z.number().min(0).max(100).optional(),
  lastErrorMessage: z.string().nullable().optional(),
});

/**
 * @description Zod schema for StartCampaignPhasePayload.
 */
export const startCampaignPhasePayloadSchema = z.object({
  phaseToStart: campaignPhaseSchema,
  domainSource: domainSourceSchema.optional(),
  numberOfDomainsToProcess: z.number().int().nonnegative().optional(),
});

// --- Specific Campaign Type Schemas ---

/**
 * @description Zod schema for CreateDNSCampaignRequest.
 */
export const createDnsCampaignRequestSchema = z.object({
  campaignName: z.string().min(1, "Campaign name cannot be empty"),
  description: z.string().optional(),
  dnsPersonaIds: z.array(uuidSchema).min(1, "At least one DNS Persona ID is required"),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * @description Zod schema for UpdateDNSCampaignRequest.
 */
export const updateDnsCampaignRequestSchema = z.object({
  campaignName: z.string().optional(),
  description: z.string().optional(),
  dnsPersonaIds: z.array(uuidSchema).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: campaignPhaseStatusSchema.optional(),
});

/**
 * @description Zod schema for DNSValidationCampaign.
 */
export const dnsValidationCampaignSchema = baseCampaignSchema.extend({
  campaignType: z.literal("DNS Validation"),
  dnsPersonaIds: z.array(uuidSchema),
  initialNumberOfDomains: z.number().int().nonnegative(),
  processedDomainsCount: z.number().int().nonnegative(),
  uploadHistory: z.array(uploadEventSchema).optional(),
});

/**
 * @description Zod schema for CreateHTTPValidationCampaignRequest.
 */
export const createHttpValidationCampaignRequestSchema = z.object({
  campaignName: z.string().min(1, "Campaign name cannot be empty"),
  description: z.string().optional(),
  httpPersonaId: uuidSchema.optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * @description Zod schema for UpdateHTTPValidationCampaignRequest.
 */
export const updateHttpValidationCampaignRequestSchema = z.object({
  campaignName: z.string().optional(),
  description: z.string().optional(),
  httpPersonaId: uuidSchema.optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: campaignPhaseStatusSchema.optional(),
});

/**
 * @description Zod schema for HTTPValidationCampaign.
 */
export const httpValidationCampaignSchema = baseCampaignSchema.extend({
  campaignType: z.literal("HTTP Validation"),
  httpPersonaId: uuidSchema.optional(),
  initialNumberOfDomains: z.number().int().nonnegative(),
  processedDomainsCount: z.number().int().nonnegative(),
  uploadHistory: z.array(uploadEventSchema).optional(),
});

/**
 * @description Zod schema for CreateDomainGenerationCampaignRequest.
 */
export const createDomainGenerationCampaignRequestSchema = z.object({
  campaignName: z.string().min(1, "Campaign name cannot be empty"),
  description: z.string().optional(),
  domainGenerationConfig: domainGenerationConfigSchema,
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * @description Zod schema for DomainGenerationCampaign.
 */
export const domainGenerationCampaignSchema = baseCampaignSchema.extend({
  campaignType: z.literal("Domain Generation"),
  domainGenerationConfig: domainGenerationConfigSchema,
  initialNumberOfDomains: z.number().int().nonnegative(),
  processedDomainsCount: z.number().int().nonnegative(),
  generatedDomains: z.array(generatedDomainSchema).optional(),
});

// --- API Response Schemas for Campaigns ---

/**
 * @description Zod schema for CampaignsListResponse.
 */
export const campaignsListResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.array(campaignSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }).optional(),
});

/**
 * @description Zod schema for CampaignDetailResponse.
 */
export const campaignDetailResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: campaignSchema.nullable(),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for CampaignCreationResponse.
 */
export const campaignCreationResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: campaignSchema,
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for CampaignUpdateResponse.
 */
export const campaignUpdateResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: campaignSchema,
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for CampaignDeleteResponse.
 */
export const campaignDeleteResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: z.null(),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for CampaignOperationResponse.
 */
export const campaignOperationResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: campaignSchema.partial(),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for DNSValidationCampaignListResponse.
 */
export const dnsValidationCampaignListResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.array(dnsValidationCampaignSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }).optional(),
});

/**
 * @description Zod schema for DNSValidationCampaignDetailResponse.
 */
export const dnsValidationCampaignDetailResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: dnsValidationCampaignSchema.nullable(),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for DNSValidationCampaignCreationResponse.
 */
export const dnsValidationCampaignCreationResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: dnsValidationCampaignSchema,
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for DNSValidationCampaignUpdateResponse.
 */
export const dnsValidationCampaignUpdateResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: dnsValidationCampaignSchema,
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for DNSValidationCampaignItemsResponse.
 */
export const dnsValidationCampaignItemsResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.array(dnsValidationCampaignItemSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }).optional(),
});

/**
 * @description Zod schema for DNSCampaignOperationResponse.
 */
export const dnsCampaignOperationResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: z.object({
      message: z.string(),
      domainsAdded: z.number().int().nonnegative().optional(),
      retriedCount: z.number().int().nonnegative().optional(),
      campaignId: uuidSchema,
    }),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for HTTPValidationCampaignListResponse.
 */
export const httpValidationCampaignListResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.array(httpValidationCampaignSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }).optional(),
});

/**
 * @description Zod schema for HTTPValidationCampaignDetailResponse.
 */
export const httpValidationCampaignDetailResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: httpValidationCampaignSchema.nullable(),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for HTTPValidationCampaignCreationResponse.
 */
export const httpValidationCampaignCreationResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: httpValidationCampaignSchema,
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for HTTPValidationCampaignUpdateResponse.
 */
export const httpValidationCampaignUpdateResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: httpValidationCampaignSchema,
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for HTTPValidationCampaignItemsResponse.
 */
export const httpValidationCampaignItemsResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.array(httpValidationCampaignItemSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }).optional(),
});

/**
 * @description Zod schema for HTTPCampaignOperationResponse.
 */
export const httpCampaignOperationResponseSchema = z.union([
  z.object({
    status: z.literal('success'),
    message: z.string().optional(),
    data: z.object({
      message: z.string(),
      itemsAdded: z.number().int().nonnegative().optional(),
      retriedCount: z.number().int().nonnegative().optional(),
      campaignId: uuidSchema,
    }),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
    errors: z.array(z.object({
      field: z.string().optional(),
      message: z.string(),
    })).optional(),
  }),
]);

/**
 * @description Zod schema for GeneratedDomainsForCampaignResponse.
 */
export const generatedDomainsForCampaignResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.array(generatedDomainSchema),
  pagination: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }).optional(),
});