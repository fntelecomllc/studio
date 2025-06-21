// Unified type definitions for frontend/backend alignment
// Phase 4.1.2: Type System Alignment

// Campaign Status - Aligned with backend CampaignStatusEnum
export const CampaignStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSING: 'pausing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled'
} as const;

export type UnifiedCampaignStatus = typeof CampaignStatus[keyof typeof CampaignStatus];

// Campaign Type - Aligned with backend CampaignTypeEnum
export const CampaignType = {
  DOMAIN_GENERATION: 'domain_generation',
  DNS_VALIDATION: 'dns_validation',
  HTTP_KEYWORD_VALIDATION: 'http_keyword_validation'
} as const;

export type UnifiedCampaignType = typeof CampaignType[keyof typeof CampaignType];

// Persona Type - Aligned with backend PersonaTypeEnum
export const PersonaType = {
  DNS: 'dns',
  HTTP: 'http'
} as const;

export type UnifiedPersonaType = typeof PersonaType[keyof typeof PersonaType];

// Proxy Protocol - Aligned with backend ProxyProtocolEnum
export const ProxyProtocol = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS5: 'socks5',
  SOCKS4: 'socks4'
} as const;

export type UnifiedProxyProtocol = typeof ProxyProtocol[keyof typeof ProxyProtocol];

// Keyword Rule Type - Aligned with backend KeywordRuleTypeEnum
export const KeywordRuleType = {
  STRING: 'string',
  REGEX: 'regex'
} as const;

export type UnifiedKeywordRuleType = typeof KeywordRuleType[keyof typeof KeywordRuleType];

// Campaign Job Status - Aligned with backend CampaignJobStatusEnum
export const CampaignJobStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY: 'retry'
} as const;

export type UnifiedCampaignJobStatus = typeof CampaignJobStatus[keyof typeof CampaignJobStatus];

// Validation function to ensure type safety at runtime
export function isValidCampaignStatus(status: string): status is UnifiedCampaignStatus {
  return Object.values(CampaignStatus).includes(status as UnifiedCampaignStatus);
}

export function isValidCampaignType(type: string): type is UnifiedCampaignType {
  return Object.values(CampaignType).includes(type as UnifiedCampaignType);
}

export function isValidPersonaType(type: string): type is UnifiedPersonaType {
  return Object.values(PersonaType).includes(type as UnifiedPersonaType);
}

export function isValidProxyProtocol(protocol: string): protocol is UnifiedProxyProtocol {
  return Object.values(ProxyProtocol).includes(protocol as UnifiedProxyProtocol);
}

export function isValidKeywordRuleType(type: string): type is UnifiedKeywordRuleType {
  return Object.values(KeywordRuleType).includes(type as UnifiedKeywordRuleType);
}

export function isValidCampaignJobStatus(status: string): status is UnifiedCampaignJobStatus {
  return Object.values(CampaignJobStatus).includes(status as UnifiedCampaignJobStatus);
}

// Type guards for runtime validation
export const TypeValidators = {
  campaignStatus: isValidCampaignStatus,
  campaignType: isValidCampaignType,
  personaType: isValidPersonaType,
  proxyProtocol: isValidProxyProtocol,
  keywordRuleType: isValidKeywordRuleType,
  campaignJobStatus: isValidCampaignJobStatus
};

// Note: Import additional types from campaignApiTypes as needed
// Remove this comment when implementing full type consolidation