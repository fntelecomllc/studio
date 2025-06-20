/**
 * Test for H-003: Domain Generation Parameters Int64 Field Fix
 * 
 * Ensures that totalPossibleCombinations and currentOffset fields
 * properly use SafeBigInt type to handle int64 values from backend
 */

import { describe, it, expect } from '@jest/globals';
import {
  ServicesDomainGenerationParams,
  ServicesDomainGenerationParamsPatternTypeEnum
} from '../services-domain-generation-params';
import { createSafeBigInt, isSafeBigInt } from '../../../types/branded';

describe('H-003: Domain Generation Params Int64 Fix', () => {
  it('should accept SafeBigInt for totalPossibleCombinations', () => {
    const params: ServicesDomainGenerationParams = {
      characterSet: 'abcdefghijklmnopqrstuvwxyz',
      constantString: 'test',
      patternType: ServicesDomainGenerationParamsPatternTypeEnum.Prefix,
      tld: '.com',
      variableLength: 3,
      totalPossibleCombinations: createSafeBigInt('9223372036854775807'), // Max int64
    };

    expect(params.totalPossibleCombinations).toBeDefined();
    expect(isSafeBigInt(params.totalPossibleCombinations)).toBe(true);
    expect(params.totalPossibleCombinations!.toString()).toBe('9223372036854775807');
  });

  it('should accept SafeBigInt for currentOffset', () => {
    const params: ServicesDomainGenerationParams = {
      characterSet: 'abcdefghijklmnopqrstuvwxyz',
      constantString: 'test',
      patternType: ServicesDomainGenerationParamsPatternTypeEnum.Suffix,
      tld: '.com',
      variableLength: 3,
      currentOffset: createSafeBigInt('1234567890123456789'), // Large int64
    };

    expect(params.currentOffset).toBeDefined();
    expect(isSafeBigInt(params.currentOffset)).toBe(true);
    expect(params.currentOffset!.toString()).toBe('1234567890123456789');
  });

  it('should handle values exceeding JavaScript safe integer limit', () => {
    // Use a value within int64 range but beyond JavaScript's safe integer
    const unsafeValue = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    const params: ServicesDomainGenerationParams = {
      characterSet: '0123456789',
      constantString: 'domain',
      patternType: ServicesDomainGenerationParamsPatternTypeEnum.Both,
      tld: '.com',
      variableLength: 10,
      totalPossibleCombinations: createSafeBigInt(unsafeValue),
      currentOffset: createSafeBigInt('0'),
    };

    // Verify the value would overflow with regular number
    expect(Number(unsafeValue)).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    
    // But SafeBigInt preserves the exact value
    expect(params.totalPossibleCombinations!.toString()).toBe(unsafeValue);
  });

  it('should handle optional fields correctly', () => {
    const minimalParams: ServicesDomainGenerationParams = {
      characterSet: 'abc',
      constantString: 'pre',
      patternType: ServicesDomainGenerationParamsPatternTypeEnum.Prefix,
      tld: '.com',
      variableLength: 2,
      // totalPossibleCombinations and currentOffset are optional
    };

    expect(minimalParams.totalPossibleCombinations).toBeUndefined();
    expect(minimalParams.currentOffset).toBeUndefined();
  });

  it('should work with type assertions for API responses', () => {
    // Simulate API response with string values
    const apiResponse = {
      characterSet: 'xyz',
      constantString: 'post',
      patternType: ServicesDomainGenerationParamsPatternTypeEnum.Suffix,
      tld: '.net',
      variableLength: 4,
      totalPossibleCombinations: '1000000000000000000', // String from JSON
      currentOffset: '500000000000000000',
    };

    // Transform to proper types
    const params: ServicesDomainGenerationParams = {
      ...apiResponse,
      patternType: apiResponse.patternType as ServicesDomainGenerationParamsPatternTypeEnum,
      totalPossibleCombinations: createSafeBigInt(apiResponse.totalPossibleCombinations),
      currentOffset: createSafeBigInt(apiResponse.currentOffset),
    };

    expect(isSafeBigInt(params.totalPossibleCombinations)).toBe(true);
    expect(isSafeBigInt(params.currentOffset)).toBe(true);
    expect(params.totalPossibleCombinations!.toString()).toBe('1000000000000000000');
    expect(params.currentOffset!.toString()).toBe('500000000000000000');
  });

  it('should prevent numeric overflow that would occur with regular numbers', () => {
    const largeOffset = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    
    // With regular number, precision is lost
    const unsafeNumber = Number(largeOffset);
    expect(unsafeNumber).toBe(9007199254740992); // Lost precision!
    
    // With SafeBigInt, precision is preserved
    const params: ServicesDomainGenerationParams = {
      characterSet: '0123456789',
      constantString: 'test',
      patternType: ServicesDomainGenerationParamsPatternTypeEnum.Prefix,
      tld: '.com',
      variableLength: 5,
      currentOffset: createSafeBigInt(largeOffset),
    };
    
    expect(params.currentOffset!.toString()).toBe(largeOffset); // Exact value preserved
  });
});