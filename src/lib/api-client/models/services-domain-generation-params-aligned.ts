/* tslint:disable */
/* eslint-disable */
/**
 * DomainFlow API - ALIGNED VERSION
 * This file contains properly aligned types with SafeBigInt for int64 fields
 */

import type { ServicesDomainGenerationParams, ServicesDomainGenerationParamsPatternTypeEnum } from './services-domain-generation-params';
import type { SafeBigInt } from '../../types/branded';
import { createSafeBigInt } from '../../types/branded';

/**
 * Aligned Domain Generation Params with SafeBigInt for int64 fields
 * @export
 * @interface ServicesDomainGenerationParamsAligned
 */
export interface ServicesDomainGenerationParamsAligned {
    'characterSet': string;
    'constantString': string;
    'numDomainsToGenerate'?: number;
    'patternType': ServicesDomainGenerationParamsPatternTypeEnum;
    'tld': string;
    'variableLength': number;
    'totalPossibleCombinations'?: SafeBigInt; // int64 field from Go backend
    'currentOffset'?: SafeBigInt; // int64 field from Go backend (may be added later)
}

/**
 * Transform raw API response to aligned model with SafeBigInt conversion
 */
export function transformToDomainGenerationParamsAligned(raw: ServicesDomainGenerationParams & { totalPossibleCombinations?: number | string; currentOffset?: number | string }): ServicesDomainGenerationParamsAligned {
    return {
        ...raw,
        totalPossibleCombinations: raw.totalPossibleCombinations != null ? createSafeBigInt(raw.totalPossibleCombinations) : undefined,
        currentOffset: raw.currentOffset != null ? createSafeBigInt(raw.currentOffset) : undefined,
    };
}

/**
 * Transform aligned model back to raw API format for requests
 */
export function transformFromDomainGenerationParamsAligned(aligned: ServicesDomainGenerationParamsAligned): ServicesDomainGenerationParams & { totalPossibleCombinations?: string; currentOffset?: string } {
    const result: any = {
        ...aligned,
    };
    
    if (aligned.totalPossibleCombinations !== undefined) {
        result.totalPossibleCombinations = aligned.totalPossibleCombinations.toString();
    }
    
    if (aligned.currentOffset !== undefined) {
        result.currentOffset = aligned.currentOffset.toString();
    }
    
    return result;
}