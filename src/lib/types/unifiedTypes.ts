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

export type CampaignStatus = typeof CampaignStatus[keyof typeof CampaignStatus];

// Campaign Type - Aligned with backend CampaignTypeEnum
export const CampaignType = {
  DOMAIN_GENERATION: 'domain_generation',
  DNS_VALIDATION: 'dns_validation',
  HTTP_KEYWORD_VALIDATION: 'http_keyword_validation'
} as const;

export type CampaignType = typeof CampaignType[keyof typeof CampaignType];

// Persona Type - Aligned with backend PersonaTypeEnum
export const PersonaType = {
  DNS: 'dns',
  HTTP: 'http'
} as const;

export type PersonaType = typeof PersonaType[keyof typeof PersonaType];

// Proxy Protocol - Aligned with backend ProxyProtocolEnum
export const ProxyProtocol = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS5: 'socks5',
  SOCKS4: 'socks4'
} as const;

export type ProxyProtocol = typeof ProxyProtocol[keyof typeof ProxyProtocol];

// Keyword Rule Type - Aligned with backend KeywordRuleTypeEnum
export const KeywordRuleType = {
  STRING: 'string',
  REGEX: 'regex'
} as const;

export type KeywordRuleType = typeof KeywordRuleType[keyof typeof KeywordRuleType];

// Campaign Job Status - Aligned with backend CampaignJobStatusEnum
export const CampaignJobStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY: 'retry'
} as const;

export type CampaignJobStatus = typeof CampaignJobStatus[keyof typeof CampaignJobStatus];

// Validation function to ensure type safety at runtime
export function isValidCampaignStatus(status: string): status is CampaignStatus {
  return Object.values(CampaignStatus).includes(status as CampaignStatus);
}

export function isValidCampaignType(type: string): type is CampaignType {
  return Object.values(CampaignType).includes(type as CampaignType);
}

export function isValidPersonaType(type: string): type is PersonaType {
  return Object.values(PersonaType).includes(type as PersonaType);
}

export function isValidProxyProtocol(protocol: string): protocol is ProxyProtocol {
  return Object.values(ProxyProtocol).includes(protocol as ProxyProtocol);
}

export function isValidKeywordRuleType(type: string): type is KeywordRuleType {
  return Object.values(KeywordRuleType).includes(type as KeywordRuleType);
}

export function isValidCampaignJobStatus(status: string): status is CampaignJobStatus {
  return Object.values(CampaignJobStatus).includes(status as CampaignJobStatus);
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