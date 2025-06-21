/**
 * Campaign API Response Transformers
 * Handles conversion of API responses to use branded types (SafeBigInt for int64 fields)
 */

import type { ModelsCampaignAPI } from '@/lib/api-client/models/models-campaign-api';
import { createSafeBigInt, createUUID, createISODateString, type SafeBigInt, type UUID, type ISODateString } from '@/lib/types/branded';

/**
 * Campaign API model with properly typed fields
 */
export interface CampaignAPIAligned {
    avgProcessingRate?: number;
    campaignType?: string;
    completedAt?: ISODateString;
    createdAt?: ISODateString;
    errorMessage?: string;
    estimatedCompletionAt?: ISODateString;
    failedItems?: SafeBigInt;
    id?: UUID;
    lastHeartbeatAt?: ISODateString;
    metadata?: Record<string, unknown>;
    name?: string;
    processedItems?: SafeBigInt;
    progressPercentage?: number;
    startedAt?: ISODateString;
    status?: string;
    successfulItems?: SafeBigInt;
    totalItems?: SafeBigInt;
    updatedAt?: ISODateString;
    userId?: UUID;
}

/**
 * Transform raw campaign API response to aligned model with SafeBigInt conversion
 */
export function transformCampaignResponse(raw: ModelsCampaignAPI | undefined | null): CampaignAPIAligned {
    if (!raw) {
        return {};
    }
    
    return {
        avgProcessingRate: raw.avgProcessingRate,
        campaignType: raw.campaignType,
        completedAt: raw.completedAt ? createISODateString(raw.completedAt) : undefined,
        createdAt: raw.createdAt ? createISODateString(raw.createdAt) : undefined,
        errorMessage: raw.errorMessage,
        estimatedCompletionAt: raw.estimatedCompletionAt ? createISODateString(raw.estimatedCompletionAt) : undefined,
        failedItems: raw.failedItems != null ? createSafeBigInt(raw.failedItems) : undefined,
        id: raw.id ? createUUID(raw.id) : undefined,
        lastHeartbeatAt: raw.lastHeartbeatAt ? createISODateString(raw.lastHeartbeatAt) : undefined,
        metadata: raw.metadata as Record<string, unknown>,
        name: raw.name,
        processedItems: raw.processedItems != null ? createSafeBigInt(raw.processedItems) : undefined,
        progressPercentage: raw.progressPercentage,
        startedAt: raw.startedAt ? createISODateString(raw.startedAt) : undefined,
        status: raw.status,
        successfulItems: raw.successfulItems != null ? createSafeBigInt(raw.successfulItems) : undefined,
        totalItems: raw.totalItems != null ? createSafeBigInt(raw.totalItems) : undefined,
        updatedAt: raw.updatedAt ? createISODateString(raw.updatedAt) : undefined,
        userId: raw.userId ? createUUID(raw.userId) : undefined,
    };
}

/**
 * Transform array of campaign responses
 */
export function transformCampaignArrayResponse(raw: ModelsCampaignAPI[] | undefined | null): CampaignAPIAligned[] {
    if (!raw || !Array.isArray(raw)) {
        return [];
    }
    
    return raw.map(transformCampaignResponse);
}

/**
 * Transform campaign request data (reverse transformation for API calls)
 */
export function transformCampaignRequestData(data: Partial<CampaignAPIAligned>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    // Copy basic fields
    if (data.avgProcessingRate !== undefined) result.avgProcessingRate = data.avgProcessingRate;
    if (data.campaignType !== undefined) result.campaignType = data.campaignType;
    if (data.errorMessage !== undefined) result.errorMessage = data.errorMessage;
    if (data.metadata !== undefined) result.metadata = data.metadata;
    if (data.name !== undefined) result.name = data.name;
    if (data.progressPercentage !== undefined) result.progressPercentage = data.progressPercentage;
    if (data.status !== undefined) result.status = data.status;
    
    // Convert branded types back to primitives
    if (data.completedAt !== undefined) result.completedAt = data.completedAt;
    if (data.createdAt !== undefined) result.createdAt = data.createdAt;
    if (data.estimatedCompletionAt !== undefined) result.estimatedCompletionAt = data.estimatedCompletionAt;
    if (data.failedItems !== undefined) result.failedItems = Number(data.failedItems);
    if (data.id !== undefined) result.id = data.id;
    if (data.lastHeartbeatAt !== undefined) result.lastHeartbeatAt = data.lastHeartbeatAt;
    if (data.processedItems !== undefined) result.processedItems = Number(data.processedItems);
    if (data.startedAt !== undefined) result.startedAt = data.startedAt;
    if (data.successfulItems !== undefined) result.successfulItems = Number(data.successfulItems);
    if (data.totalItems !== undefined) result.totalItems = Number(data.totalItems);
    if (data.updatedAt !== undefined) result.updatedAt = data.updatedAt;
    if (data.userId !== undefined) result.userId = data.userId;
    
    return result;
}