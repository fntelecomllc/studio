// Unified Campaign Creation Schema - matches backend CreateCampaignRequest structure
// This extends the generated schemas with the complete unified campaign creation structure

import { z } from 'zod';
import { 
  createCampaignRequestSchema,
  domainGenerationParamsSchema,
  dnsValidationParamsSchema,
  httpKeywordParamsSchema,
  type CreateCampaignRequest as GeneratedCreateCampaignRequest,
  type DomainGenerationParams as GeneratedDomainGenerationParams,
  type DnsValidationParams as GeneratedDnsValidationParams,
  type HttpKeywordParams as GeneratedHttpKeywordParams
} from './generated/validationSchemas';

// Enhanced Domain Generation Parameters (missing fields from generator)
export const enhancedDomainGenerationParamsSchema = domainGenerationParamsSchema.extend({
  // All fields already included in generated schema
});

// Enhanced DNS Validation Parameters (missing personaIds from generator)
export const enhancedDnsValidationParamsSchema = dnsValidationParamsSchema.extend({
  personaIds: z.array(z.string().uuid()).min(1, "At least one persona is required"),
});

// Enhanced HTTP Keyword Parameters (missing fields from generator)
export const enhancedHttpKeywordParamsSchema = httpKeywordParamsSchema.extend({
  keywordSetIds: z.array(z.string().uuid()).optional(),
  adHocKeywords: z.array(z.string().min(1)).optional(),
  personaIds: z.array(z.string().uuid()).min(1, "At least one persona is required"),
  proxyPoolId: z.string().uuid().optional(),
  proxySelectionStrategy: z.string().optional(),
  targetHttpPorts: z.array(z.number().int().min(1).max(65535)).optional(),
});

// Complete Unified Campaign Creation Request Schema
export const unifiedCreateCampaignRequestSchema = z.object({
  campaignType: z.enum(["domain_generation", "dns_validation", "http_keyword_validation"]),
  name: z.string().min(1, "Campaign name is required"),
  description: z.string().optional(),
  userId: z.string().uuid().optional(),
  
  // Nested parameter objects
  domainGenerationParams: enhancedDomainGenerationParamsSchema.optional(),
  dnsValidationParams: enhancedDnsValidationParamsSchema.optional(), 
  httpKeywordParams: enhancedHttpKeywordParamsSchema.optional(),
})
.superRefine((data, ctx) => {
  // Validation to ensure appropriate params are provided for each campaign type
  switch (data.campaignType) {
    case "domain_generation":
      if (!data.domainGenerationParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Domain generation parameters are required for domain_generation campaigns",
          path: ["domainGenerationParams"],
        });
      }
      if (data.dnsValidationParams || data.httpKeywordParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only domainGenerationParams should be provided for domain_generation campaigns",
          path: ["campaignType"],
        });
      }
      break;
      
    case "dns_validation":
      if (!data.dnsValidationParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DNS validation parameters are required for dns_validation campaigns",
          path: ["dnsValidationParams"],
        });
      }
      if (data.domainGenerationParams || data.httpKeywordParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only dnsValidationParams should be provided for dns_validation campaigns",
          path: ["campaignType"],
        });
      }
      break;
      
    case "http_keyword_validation":
      if (!data.httpKeywordParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "HTTP keyword parameters are required for http_keyword_validation campaigns",
          path: ["httpKeywordParams"],
        });
      }
      if (data.domainGenerationParams || data.dnsValidationParams) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only httpKeywordParams should be provided for http_keyword_validation campaigns",
          path: ["campaignType"],
        });
      }
      break;
  }
  
  // Additional validation for HTTP keyword campaigns
  if (data.campaignType === "http_keyword_validation" && data.httpKeywordParams) {
    const { keywordSetIds, adHocKeywords } = data.httpKeywordParams;
    if ((!keywordSetIds || keywordSetIds.length === 0) && (!adHocKeywords || adHocKeywords.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either keywordSetIds or adHocKeywords must be provided",
        path: ["httpKeywordParams"],
      });
    }
  }
});

// Type exports
export type UnifiedCreateCampaignRequest = z.infer<typeof unifiedCreateCampaignRequestSchema>;
export type EnhancedDomainGenerationParams = z.infer<typeof enhancedDomainGenerationParamsSchema>;
export type EnhancedDnsValidationParams = z.infer<typeof enhancedDnsValidationParamsSchema>;
export type EnhancedHttpKeywordParams = z.infer<typeof enhancedHttpKeywordParamsSchema>;

// Utility functions for form handling
export const createUnifiedCampaignPayload = (
  formData: any, 
  campaignType: "domain_generation" | "dns_validation" | "http_keyword_validation"
): UnifiedCreateCampaignRequest => {
  const basePayload: UnifiedCreateCampaignRequest = {
    campaignType,
    name: formData.name,
    description: formData.description,
  };

  switch (campaignType) {
    case "domain_generation":
      basePayload.domainGenerationParams = {
        patternType: formData.patternType,
        variableLength: formData.variableLength,
        characterSet: formData.characterSet,
        constantString: formData.constantString,
        tld: formData.tld,
        numDomainsToGenerate: formData.numDomainsToGenerate,
      };
      break;
      
    case "dns_validation":
      basePayload.dnsValidationParams = {
        sourceCampaignId: formData.sourceCampaignId,
        personaIds: formData.personaIds,
        rotationIntervalSeconds: formData.rotationIntervalSeconds,
        processingSpeedPerMinute: formData.processingSpeedPerMinute,
        batchSize: formData.batchSize,
        retryAttempts: formData.retryAttempts,
      };
      break;
      
    case "http_keyword_validation":
      basePayload.httpKeywordParams = {
        sourceCampaignId: formData.sourceCampaignId,
        keywordSetIds: formData.keywordSetIds,
        adHocKeywords: formData.adHocKeywords,
        personaIds: formData.personaIds,
        proxyPoolId: formData.proxyPoolId,
        proxySelectionStrategy: formData.proxySelectionStrategy,
        rotationIntervalSeconds: formData.rotationIntervalSeconds,
        processingSpeedPerMinute: formData.processingSpeedPerMinute,
        batchSize: formData.batchSize,
        retryAttempts: formData.retryAttempts,
        targetHttpPorts: formData.targetHttpPorts,
      };
      break;
  }

  return basePayload;
};
