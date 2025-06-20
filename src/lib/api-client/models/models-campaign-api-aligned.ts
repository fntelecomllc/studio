/* tslint:disable */
/* eslint-disable */
/**
 * DomainFlow API - ALIGNED VERSION
 * This file contains properly aligned types with SafeBigInt for int64 fields
 */

import type { ModelsCampaignStatusEnum } from './models-campaign-status-enum';
import type { ModelsCampaignTypeEnum } from './models-campaign-type-enum';
import type { SafeBigInt } from '../../types/branded';
import { createSafeBigInt } from '../../types/branded';

/**
 * Aligned Campaign API model with SafeBigInt for int64 fields
 * @export
 * @interface ModelsCampaignAPIAligned
 */
export interface ModelsCampaignAPIAligned {
    'avgProcessingRate'?: number;
    'campaignType'?: ModelsCampaignTypeEnum;
    'completedAt'?: string;
    'createdAt'?: string;
    'errorMessage'?: string;
    'estimatedCompletionAt'?: string;
    'failedItems'?: SafeBigInt; // Changed from number to SafeBigInt
    'id'?: string;
    'lastHeartbeatAt'?: string;
    'metadata'?: object;
    'name'?: string;
    'processedItems'?: SafeBigInt; // Changed from number to SafeBigInt
    'progressPercentage'?: number;
    'startedAt'?: string;
    'status'?: ModelsCampaignStatusEnum;
    'successfulItems'?: SafeBigInt; // Changed from number to SafeBigInt
    'totalItems'?: SafeBigInt; // Changed from number to SafeBigInt
    'updatedAt'?: string;
    'userId'?: string;
}

/**
 * Transform raw API response to aligned model with SafeBigInt conversion
 */
export function transformToCampaignAPIAligned(raw: any): ModelsCampaignAPIAligned {
    return {
        ...raw,
        failedItems: raw.failedItems != null ? createSafeBigInt(raw.failedItems) : undefined,
        processedItems: raw.processedItems != null ? createSafeBigInt(raw.processedItems) : undefined,
        successfulItems: raw.successfulItems != null ? createSafeBigInt(raw.successfulItems) : undefined,
        totalItems: raw.totalItems != null ? createSafeBigInt(raw.totalItems) : undefined,
    };
}