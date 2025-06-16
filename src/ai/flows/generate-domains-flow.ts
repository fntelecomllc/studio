// AI Flow Types and Schemas
// This file provides types and schemas for domain generation flows

import { z } from 'zod';

export interface GenerateDomainsInput {
  pattern: string;
  constantPart: string;
  allowedCharSet: string;
  tlds: string[];
  prefixVariableLength?: number;
  suffixVariableLength?: number;
  maxDomains?: number;
}

export const GenerateDomainsInputSchema = z.object({
  pattern: z.string(),
  constantPart: z.string(),
  allowedCharSet: z.string(),
  tlds: z.array(z.string()),
  prefixVariableLength: z.number().optional(),
  suffixVariableLength: z.number().optional(),
  maxDomains: z.number().optional(),
});

export interface GeneratedDomain {
  domain: string;
  sld: string;
  tld: string;
  index: number;
}

export type CampaignPhaseStatus = 'Pending' | 'InProgress' | 'Succeeded' | 'Failed' | 'Idle' | 'Paused';

// Additional domain generation types
export interface DomainGenerationResult {
  domains: GeneratedDomain[];
  totalGenerated: number;
  timeElapsed: number;
}
