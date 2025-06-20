/**
 * Auto-generated Transformers from Go Backend
 * Generated: 2025-06-20T15:12:12.830Z
 * Source: Go Backend Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import {
  SafeBigInt,
  createSafeBigInt,
  transformInt64Fields,
  prepareForSerialization
} from '../branded';

import * as Models from './generated-models';

// Fields that contain int64 values from Go backend
export const INT64_FIELDS = {
  campaignAPI: ['totalItems', 'processedItems', 'successfulItems', 'failedItems'],
  authAuditLog: ['id'],
  rateLimit: ['id'],
  campaign: ['totalItems', 'processedItems', 'successfulItems', 'failedItems'],
  domainGenerationCampaignParams: ['totalPossibleCombinations', 'currentOffset'],
  domainGenerationConfigState: ['lastOffset'],
  generatedDomain: ['offsetIndex'],
} as const;

/**
 * Transform raw CampaignAPI response
 */
export function transformCampaignAPI(raw: Record<string, unknown>): Models.CampaignAPI {
  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.campaignAPI]);
  
  return {
    ...raw,
    totalItems: int64Transformed.totalItems as SafeBigInt,
    processedItems: int64Transformed.processedItems as SafeBigInt,
    successfulItems: int64Transformed.successfulItems as SafeBigInt,
    failedItems: int64Transformed.failedItems as SafeBigInt,
  } as Models.CampaignAPI;
}

/**
 * Transform raw AuthAuditLog response
 */
export function transformAuthAuditLog(raw: Record<string, unknown>): Models.AuthAuditLog {
  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.authAuditLog]);
  
  return {
    ...raw,
    id: int64Transformed.id as SafeBigInt,
  } as Models.AuthAuditLog;
}

/**
 * Transform raw RateLimit response
 */
export function transformRateLimit(raw: Record<string, unknown>): Models.RateLimit {
  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.rateLimit]);
  
  return {
    ...raw,
    id: int64Transformed.id as SafeBigInt,
  } as Models.RateLimit;
}

/**
 * Transform raw Campaign response
 */
export function transformCampaign(raw: Record<string, unknown>): Models.Campaign {
  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.campaign]);
  
  return {
    ...raw,
    totalItems: int64Transformed.totalItems as SafeBigInt,
    processedItems: int64Transformed.processedItems as SafeBigInt,
    successfulItems: int64Transformed.successfulItems as SafeBigInt,
    failedItems: int64Transformed.failedItems as SafeBigInt,
  } as Models.Campaign;
}

/**
 * Transform raw DomainGenerationCampaignParams response
 */
export function transformDomainGenerationCampaignParams(raw: Record<string, unknown>): Models.DomainGenerationCampaignParams {
  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.domainGenerationCampaignParams]);
  
  return {
    ...raw,
    totalPossibleCombinations: int64Transformed.totalPossibleCombinations as SafeBigInt,
    currentOffset: int64Transformed.currentOffset as SafeBigInt,
  } as Models.DomainGenerationCampaignParams;
}

/**
 * Transform raw DomainGenerationConfigState response
 */
export function transformDomainGenerationConfigState(raw: Record<string, unknown>): Models.DomainGenerationConfigState {
  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.domainGenerationConfigState]);
  
  return {
    ...raw,
    lastOffset: int64Transformed.lastOffset as SafeBigInt,
  } as Models.DomainGenerationConfigState;
}

/**
 * Transform raw GeneratedDomain response
 */
export function transformGeneratedDomain(raw: Record<string, unknown>): Models.GeneratedDomain {
  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.generatedDomain]);
  
  return {
    ...raw,
    offsetIndex: int64Transformed.offsetIndex as SafeBigInt,
  } as Models.GeneratedDomain;
}

/**
 * Prepare CampaignAPI for API request
 */
export function serializeCampaignAPI(data: Partial<Models.CampaignAPI>): Record<string, unknown> {
  return prepareForSerialization(data, INT64_FIELDS.campaignAPI);
}

/**
 * Prepare AuthAuditLog for API request
 */
export function serializeAuthAuditLog(data: Partial<Models.AuthAuditLog>): Record<string, unknown> {
  return prepareForSerialization(data, INT64_FIELDS.authAuditLog);
}

/**
 * Prepare RateLimit for API request
 */
export function serializeRateLimit(data: Partial<Models.RateLimit>): Record<string, unknown> {
  return prepareForSerialization(data, INT64_FIELDS.rateLimit);
}

/**
 * Prepare Campaign for API request
 */
export function serializeCampaign(data: Partial<Models.Campaign>): Record<string, unknown> {
  return prepareForSerialization(data, INT64_FIELDS.campaign);
}

/**
 * Prepare DomainGenerationCampaignParams for API request
 */
export function serializeDomainGenerationCampaignParams(data: Partial<Models.DomainGenerationCampaignParams>): Record<string, unknown> {
  return prepareForSerialization(data, INT64_FIELDS.domainGenerationCampaignParams);
}

/**
 * Prepare DomainGenerationConfigState for API request
 */
export function serializeDomainGenerationConfigState(data: Partial<Models.DomainGenerationConfigState>): Record<string, unknown> {
  return prepareForSerialization(data, INT64_FIELDS.domainGenerationConfigState);
}

/**
 * Prepare GeneratedDomain for API request
 */
export function serializeGeneratedDomain(data: Partial<Models.GeneratedDomain>): Record<string, unknown> {
  return prepareForSerialization(data, INT64_FIELDS.generatedDomain);
}

