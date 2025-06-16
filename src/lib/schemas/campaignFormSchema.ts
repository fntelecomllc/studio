import * as z from "zod";
import { CampaignSelectedType, DomainGenerationPattern, CampaignPhase } from "@/lib/types";
import { CAMPAIGN_SELECTED_TYPES, DOMAIN_GENERATION_PATTERNS } from "@/lib/constants";

export const CampaignFormConstants = {
  NONE_VALUE_PLACEHOLDER: "_NONE_"
} as const;

// Base schema for common campaign fields
const baseCampaignSchema = z.object({
  name: z.string().min(3, { message: "Campaign name must be at least 3 characters." }),
  description: z.string().optional(),
  selectedType: z.enum(CAMPAIGN_SELECTED_TYPES as [CampaignSelectedType, ...CampaignSelectedType[]], { 
    required_error: "You need to select a campaign type." 
  }),
  assignedHttpPersonaId: z.string().optional(),
  assignedDnsPersonaId: z.string().optional(),
  proxyAssignmentMode: z.enum(['none', 'single', 'rotate_active']).default('none'),
  assignedProxyId: z.string().optional(),
});

// Domain source schema
const domainSourceSchema = z.object({
  domainSourceSelectionMode: z.enum(['none','upload', 'campaign_output']).optional(),
  uploadedDomainsFile: z.custom<File>(val => val instanceof File, "Please select a file.").optional().nullable(),
  uploadedDomainsContentCache: z.array(z.string()).optional(),
  sourceCampaignId: z.string().optional(),
  sourcePhase: z.custom<CampaignPhase>().optional(),
  initialDomainsToProcessCount: z.coerce.number().int().positive("Must be a positive number if set.").optional(),
});

// Domain generation schema
const domainGenerationSchema = z.object({
  generationPattern: z.enum(DOMAIN_GENERATION_PATTERNS as [DomainGenerationPattern, ...DomainGenerationPattern[]]).optional(),
  constantPart: z.string().optional(),
  allowedCharSet: z.string().optional(),
  tldsInput: z.string().optional(),
  tlds: z.array(z.string().min(1).refine(val => val.startsWith('.'), { 
    message: "Each TLD must start with a period."
  })).optional(),
  prefixVariableLength: z.coerce.number().int().min(0, "Must be 0 or positive.").optional(),
  suffixVariableLength: z.coerce.number().int().min(0, "Must be 0 or positive.").optional(),
  maxDomainsToGenerate: z.coerce.number().int().positive("Target domains must be positive.").optional(),
});

// Lead generation schema
const leadGenerationSchema = z.object({
  targetKeywordsInput: z.string().optional(),
  scrapingRateLimitRequests: z.coerce.number().int().positive("Requests must be positive.").optional(),
  scrapingRateLimitPer: z.enum(['second', 'minute']).optional(),
  requiresJavaScriptRendering: z.boolean().optional().default(false),
});

// Combined form schema
export const campaignFormSchema = baseCampaignSchema
  .merge(domainSourceSchema)
  .merge(domainGenerationSchema)
  .merge(leadGenerationSchema)
  .transform(data => {
    // Transform TLDs input to array
    if (data.tldsInput) {
      data.tlds = data.tldsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 1 && t.startsWith('.'));
    } else {
      data.tlds = data.tlds ?? [];
    }
    return data;
  })
  .superRefine((data, ctx) => {
    const isDomainGenCampaignType = data.selectedType === "domain_generation";
    const isDnsValCampaignType = data.selectedType === "dns_validation";
    const isHttpValCampaignType = data.selectedType === "http_keyword_validation";

    const needsInternalGenerationConfig = isDomainGenCampaignType;
    const needsExternalSourceConfig = isDnsValCampaignType || isHttpValCampaignType;

    // Validate internal generation config
    if (needsInternalGenerationConfig) {
      if (!data.generationPattern) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Generation pattern is required.", path: ["generationPattern"] });
      }
      if (data.constantPart === undefined || data.constantPart.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Constant part cannot be empty.", path: ["constantPart"] });
      }
      if (!data.tlds || data.tlds.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one valid TLD (e.g., .com) is required.", path: ["tldsInput"] });
      }

      // Validate variable lengths based on pattern
      const needsCharsForVariableParts = 
        (data.generationPattern === "prefix_variable" && (data.prefixVariableLength || 0) > 0) ||
        (data.generationPattern === "suffix_variable" && (data.suffixVariableLength || 0) > 0) ||
        (data.generationPattern === "both_variable" && ((data.prefixVariableLength || 0) > 0 || (data.suffixVariableLength || 0) > 0));

      if (needsCharsForVariableParts && (data.allowedCharSet === undefined || data.allowedCharSet.trim() === "")) {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: "Allowed character set cannot be empty if variable parts are used.", 
          path: ["allowedCharSet"] 
        });
      }

      // Pattern-specific validations
      if (data.generationPattern === "prefix_variable") {
        if (data.prefixVariableLength === undefined || data.prefixVariableLength <= 0) {
          ctx.addIssue({ 
            code: z.ZodIssueCode.custom, 
            message: "Prefix variable length must be > 0.", 
            path: ["prefixVariableLength"] 
          });
        }
      } else if (data.generationPattern === "suffix_variable") {
        if (data.suffixVariableLength === undefined || data.suffixVariableLength <= 0) {
          ctx.addIssue({ 
            code: z.ZodIssueCode.custom, 
            message: "Suffix variable length must be > 0.", 
            path: ["suffixVariableLength"] 
          });
        }
      } else if (data.generationPattern === "both_variable") {
        const prefixIsPositive = data.prefixVariableLength !== undefined && data.prefixVariableLength > 0;
        const suffixIsPositive = data.suffixVariableLength !== undefined && data.suffixVariableLength > 0;
        if (!prefixIsPositive && !suffixIsPositive) {
          ctx.addIssue({ 
            code: z.ZodIssueCode.custom, 
            message: "For 'both_variable' pattern, at least one variable length (prefix or suffix) must be > 0.", 
            path: ["prefixVariableLength"] 
          });
        }
      }

      if (data.maxDomainsToGenerate !== undefined && data.maxDomainsToGenerate <= 0) {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: "Target domains to generate must be a positive number.", 
          path: ["maxDomainsToGenerate"] 
        });
      }
    }

    // Validate external source config
    if (needsExternalSourceConfig) {
      if (!data.domainSourceSelectionMode || data.domainSourceSelectionMode === 'none') {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: "A domain source (upload or campaign output) must be selected for this campaign type.", 
          path: ["domainSourceSelectionMode"] 
        });
      } else if (data.domainSourceSelectionMode === 'upload' && !data.uploadedDomainsFile && 
                 !(data.uploadedDomainsContentCache && data.uploadedDomainsContentCache.length > 0)) {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: "A .txt file must be uploaded or previously processed domains must exist.", 
          path: ["uploadedDomainsFile"] 
        });
      } else if (data.domainSourceSelectionMode === 'campaign_output' && 
                 (!data.sourceCampaignId || data.sourceCampaignId === CampaignFormConstants.NONE_VALUE_PLACEHOLDER)) {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: "A source campaign must be selected.", 
          path: ["sourceCampaignId"] 
        });
      }

      if (data.initialDomainsToProcessCount !== undefined && data.initialDomainsToProcessCount <= 0) {
        ctx.addIssue({ 
          code: z.ZodIssueCode.custom, 
          message: "Number of domains to process must be a positive number.", 
          path: ["initialDomainsToProcessCount"] 
        });
      }
    }

    // Validate proxy assignment
    if (data.proxyAssignmentMode === 'single' && 
        (!data.assignedProxyId || data.assignedProxyId === CampaignFormConstants.NONE_VALUE_PLACEHOLDER)) {
      ctx.addIssue({ 
        code: z.ZodIssueCode.custom, 
        message: "A proxy must be selected for 'Single Proxy' mode.", 
        path: ["assignedProxyId"] 
      });
    }

    // Note: Lead generation validation removed as it's no longer a supported campaign type
  });

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;

// Helper functions for form logic
export const getDefaultSourceMode = (type: CampaignSelectedType | undefined | null): 'none' | 'upload' | 'campaign_output' => {
  if (type === "dns_validation" || type === "http_keyword_validation") return "upload";
  return "none";
};

export const needsHttpPersona = (selectedType?: CampaignSelectedType) => 
  selectedType === "http_keyword_validation";

export const needsDnsPersona = (selectedType?: CampaignSelectedType) => 
  selectedType === "dns_validation";
