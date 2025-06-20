/**
 * Auto-generated Enums from Go Backend
 * Generated: 2025-06-20T15:12:12.821Z
 * Source: Go Backend Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

export const CampaignTypeEnum = {
  DOMAIN_GENERATION: 'DomainGeneration',
  DNSVALIDATION: 'DNSValidation',
  HTTPKEYWORD_VALIDATION: 'HTTPKeywordValidation',
} as const;

export type CampaignTypeEnum = typeof CampaignTypeEnum[keyof typeof CampaignTypeEnum];

export function isValidCampaignType(value: unknown): value is CampaignTypeEnum {
  return Object.values(CampaignTypeEnum).includes(value as string);
}

export const CampaignStatusEnum = {
  PENDING: 'Pending',
  QUEUED: 'Queued',
  RUNNING: 'Running',
  PAUSING: 'Pausing',
  PAUSED: 'Paused',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  ARCHIVED: 'Archived',
  CANCELLED: 'Cancelled',
} as const;

export type CampaignStatusEnum = typeof CampaignStatusEnum[keyof typeof CampaignStatusEnum];

export function isValidCampaignStatus(value: unknown): value is CampaignStatusEnum {
  return Object.values(CampaignStatusEnum).includes(value as string);
}

export const PersonaTypeEnum = {
  DNS: 'DNS',
  HTTP: 'HTTP',
} as const;

export type PersonaTypeEnum = typeof PersonaTypeEnum[keyof typeof PersonaTypeEnum];

export function isValidPersonaType(value: unknown): value is PersonaTypeEnum {
  return Object.values(PersonaTypeEnum).includes(value as string);
}

export const ProxyProtocolEnum = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS5: 'socks5',
  SOCKS4: 'socks4',
} as const;

export type ProxyProtocolEnum = typeof ProxyProtocolEnum[keyof typeof ProxyProtocolEnum];

export function isValidProxyProtocol(value: unknown): value is ProxyProtocolEnum {
  return Object.values(ProxyProtocolEnum).includes(value as string);
}

// Enum value lists for validation
export const VALID_CAMPAIGN_TYPE_VALUES = Object.values(CampaignTypeEnum);
export const VALID_CAMPAIGN_STATUS_VALUES = Object.values(CampaignStatusEnum);
export const VALID_PERSONA_TYPE_VALUES = Object.values(PersonaTypeEnum);
export const VALID_PROXY_PROTOCOL_VALUES = Object.values(ProxyProtocolEnum);
