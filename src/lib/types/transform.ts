/**
 * Type transformation utilities for converting between raw API data and branded types
 * Part of Phase 2: Type Safety Enhancement
 */

import { UUID, SafeBigInt, ISODateString, isValidUUID, createSafeBigInt, createISODateString } from './branded';
import type { Campaign, User } from '../types';

// Raw API data types (before transformation)
export interface RawAPIData {
  [key: string]: unknown;
}

/**
 * Transform raw API response data to use branded types
 */
export class TypeTransformer {
  /**
   * Transform a raw ID string to branded UUID
   */
  static toUUID(value: string | undefined | null): UUID | undefined {
    if (!value) return undefined;
    if (!isValidUUID(value)) {
      console.warn(`Invalid UUID format: ${value}`);
      return undefined;
    }
    return value as UUID;
  }

  /**
   * Transform a raw number to SafeBigInt
   */
  static toSafeBigInt(value: number | string | undefined | null): SafeBigInt | undefined {
    if (value === undefined || value === null) return undefined;
    return createSafeBigInt(value);
  }

  /**
   * Transform a raw date string to ISODateString
   */
  static toISODateString(value: string | undefined | null): ISODateString | undefined {
    if (!value) return undefined;
    return createISODateString(value);
  }

  /**
   * Transform a user object from API response to use branded types
   */
  static transformUser(raw: RawAPIData): User {
    if (!raw) return raw as User;
    
    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      createdAt: this.toISODateString(raw.createdAt as string),
      updatedAt: this.toISODateString(raw.updatedAt as string),
      lastLoginAt: this.toISODateString(raw.lastLoginAt as string),
      mfaLastUsedAt: this.toISODateString(raw.mfaLastUsedAt as string),
    } as User;
  }

  /**
   * Transform a campaign object from API response to use branded types
   */
  static transformCampaign(raw: RawAPIData): Campaign {
    if (!raw) return raw as Campaign;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      userId: this.toUUID(raw.userId as string),
      createdAt: this.toISODateString(raw.createdAt as string),
      updatedAt: this.toISODateString(raw.updatedAt as string),
      startedAt: this.toISODateString(raw.startedAt as string),
      completedAt: this.toISODateString(raw.completedAt as string),
      estimatedCompletionAt: this.toISODateString(raw.estimatedCompletionAt as string),
      lastHeartbeatAt: this.toISODateString(raw.lastHeartbeatAt as string),
      totalItems: this.toSafeBigInt(raw.totalItems as number),
      processedItems: this.toSafeBigInt(raw.processedItems as number),
      successfulItems: this.toSafeBigInt(raw.successfulItems as number),
      failedItems: this.toSafeBigInt(raw.failedItems as number),
      progressPercentage: raw.progressPercentage !== undefined ? Number(raw.progressPercentage) : undefined,
      avgProcessingRate: raw.avgProcessingRate !== undefined ? Number(raw.avgProcessingRate) : undefined,
    } as Campaign;
  }

  /**
   * Transform a generated domain object from API response to use branded types
   */
  static transformGeneratedDomain(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      generationCampaignId: this.toUUID(raw.generationCampaignId as string),
      offsetIndex: this.toSafeBigInt(raw.offsetIndex as number),
      generatedAt: this.toISODateString(raw.generatedAt as string),
      createdAt: this.toISODateString(raw.createdAt as string),
    };
  }

  /**
   * Transform a DNS validation result object from API response to use branded types
   */
  static transformDNSValidationResult(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      dnsCampaignId: this.toUUID(raw.dnsCampaignId as string),
      generatedDomainId: this.toUUID(raw.generatedDomainId as string),
      validatedByPersonaId: this.toUUID(raw.validatedByPersonaId as string),
      attempts: this.toSafeBigInt(raw.attempts as number),
      lastCheckedAt: this.toISODateString(raw.lastCheckedAt as string),
      createdAt: this.toISODateString(raw.createdAt as string),
    };
  }

  /**
   * Transform an HTTP keyword result object from API response to use branded types
   */
  static transformHTTPKeywordResult(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      httpKeywordCampaignId: this.toUUID(raw.httpKeywordCampaignId as string),
      dnsResultId: this.toUUID(raw.dnsResultId as string),
      validatedByPersonaId: this.toUUID(raw.validatedByPersonaId as string),
      attempts: this.toSafeBigInt(raw.attempts as number),
      httpStatusCode: raw.httpStatusCode !== undefined ? Number(raw.httpStatusCode) : undefined,
      lastCheckedAt: this.toISODateString(raw.lastCheckedAt as string),
      createdAt: this.toISODateString(raw.createdAt as string),
    };
  }

  /**
   * Transform a campaign job object from API response to use branded types
   */
  static transformCampaignJob(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      campaignId: this.toUUID(raw.campaignId as string),
      batchSize: this.toSafeBigInt(raw.batchSize as number),
      processedCount: this.toSafeBigInt(raw.processedCount as number),
      scheduledAt: this.toISODateString(raw.scheduledAt as string),
      startedAt: this.toISODateString(raw.startedAt as string),
      completedAt: this.toISODateString(raw.completedAt as string),
      lastHeartbeatAt: this.toISODateString(raw.lastHeartbeatAt as string),
      createdAt: this.toISODateString(raw.createdAt as string),
      updatedAt: this.toISODateString(raw.updatedAt as string),
    };
  }

  /**
   * Transform an audit log object from API response to use branded types
   */
  static transformAuditLog(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      userId: this.toUUID(raw.userId as string),
      entityId: this.toUUID(raw.entityId as string),
      timestamp: this.toISODateString(raw.timestamp as string),
    };
  }

  /**
   * Transform a session object from API response to use branded types
   */
  static transformSession(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      userId: this.toUUID(raw.userId as string),
      expiresAt: this.toISODateString(raw.expiresAt as string),
      lastActivityAt: this.toISODateString(raw.lastActivityAt as string),
      createdAt: this.toISODateString(raw.createdAt as string),
      updatedAt: this.toISODateString(raw.updatedAt as string),
    };
  }

  /**
   * Transform a persona object from API response to use branded types
   */
  static transformToPersona(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      lastTested: this.toISODateString(raw.lastTested as string),
      createdAt: this.toISODateString(raw.createdAt as string),
      updatedAt: this.toISODateString(raw.updatedAt as string),
    };
  }

  /**
   * Transform a proxy object from API response to use branded types  
   */
  static transformToProxy(raw: RawAPIData): RawAPIData {
    if (!raw) return raw;

    return {
      ...raw,
      id: this.toUUID(raw.id as string),
      port: raw.port !== undefined ? Number(raw.port) : undefined,
      lastTested: this.toISODateString(raw.lastTested as string),
      createdAt: this.toISODateString(raw.createdAt as string),
      updatedAt: this.toISODateString(raw.updatedAt as string),
    };
  }

  /**
   * Transform arrays of objects
   */
  static transformArray<T>(items: unknown[] | undefined, transformer: (item: RawAPIData) => T): T[] {
    if (!Array.isArray(items)) return [];
    return items.map((item) => transformer(item as RawAPIData));
  }
}

/**
 * Helper functions for specific transformations
 */
export const transformUser = TypeTransformer.transformUser.bind(TypeTransformer);
export const transformCampaign = TypeTransformer.transformCampaign.bind(TypeTransformer);
export const transformGeneratedDomain = TypeTransformer.transformGeneratedDomain.bind(TypeTransformer);
export const transformDNSValidationResult = TypeTransformer.transformDNSValidationResult.bind(TypeTransformer);
export const transformHTTPKeywordResult = TypeTransformer.transformHTTPKeywordResult.bind(TypeTransformer);
export const transformCampaignJob = TypeTransformer.transformCampaignJob.bind(TypeTransformer);
export const transformAuditLog = TypeTransformer.transformAuditLog.bind(TypeTransformer);
export const transformSession = TypeTransformer.transformSession.bind(TypeTransformer);
export const transformToPersona = TypeTransformer.transformToPersona.bind(TypeTransformer);
export const transformToProxy = TypeTransformer.transformToProxy.bind(TypeTransformer);
