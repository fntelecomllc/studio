/**
 * Test file for DomainGenerationParams type alignment
 * Tests both totalPossibleCombinations and currentOffset fields
 */

import { ServicesDomainGenerationParams } from '../models/services-domain-generation-params';
import { ServicesDomainGenerationParamsAligned, transformToDomainGenerationParamsAligned, transformFromDomainGenerationParamsAligned } from '../models/services-domain-generation-params-aligned';
import { createSafeBigInt } from '../../types/branded';

describe('DomainGenerationParams int64 fields (totalPossibleCombinations and currentOffset)', () => {
  it('should have both totalPossibleCombinations and currentOffset fields in ServicesDomainGenerationParams', () => {
    const params: ServicesDomainGenerationParams = {
      characterSet: 'abcdefghijklmnopqrstuvwxyz',
      constantString: 'test',
      numDomainsToGenerate: 1000,
      patternType: 'prefix' as const,
      totalPossibleCombinations: 456976, // 26^4
      currentOffset: 12345,
      tld: 'com',
      variableLength: 4
    };
    
    expect(params.totalPossibleCombinations).toBeDefined();
    expect(params.totalPossibleCombinations).toBe(456976);
    expect(params.currentOffset).toBeDefined();
    expect(params.currentOffset).toBe(12345);
  });

  it('should transform both int64 fields to SafeBigInt in aligned version', () => {
    const rawParams: ServicesDomainGenerationParams & { totalPossibleCombinations?: number; currentOffset?: number } = {
      characterSet: 'abcdefghijklmnopqrstuvwxyz',
      constantString: 'test',
      numDomainsToGenerate: 1000,
      patternType: 'prefix' as const,
      totalPossibleCombinations: 456976,
      currentOffset: 12345,
      tld: 'com',
      variableLength: 4
    };

    const aligned = transformToDomainGenerationParamsAligned(rawParams);

    expect(aligned.totalPossibleCombinations).toBeDefined();
    expect(aligned.totalPossibleCombinations?.toString()).toBe('456976');
    
    expect(aligned.currentOffset).toBeDefined();
    expect(aligned.currentOffset?.toString()).toBe('12345');
    
    // Other fields should remain unchanged
    expect(aligned.characterSet).toBe('abcdefghijklmnopqrstuvwxyz');
    expect(aligned.variableLength).toBe(4);
  });

  it('should handle string values for both int64 fields', () => {
    const largeTotal = '9223372036854775807'; // Max int64
    const largeOffset = '1234567890123456789'; // Large int64
    const rawParams = {
      characterSet: 'abcdefghijklmnopqrstuvwxyz0123456789',
      constantString: 'test',
      numDomainsToGenerate: 1000,
      patternType: 'suffix' as const,
      totalPossibleCombinations: largeTotal,
      currentOffset: largeOffset,
      tld: 'org',
      variableLength: 10
    };

    const aligned = transformToDomainGenerationParamsAligned(rawParams as any);

    expect(aligned.totalPossibleCombinations).toBeDefined();
    expect(aligned.totalPossibleCombinations?.toString()).toBe(largeTotal);
    
    expect(aligned.currentOffset).toBeDefined();
    expect(aligned.currentOffset?.toString()).toBe(largeOffset);
  });

  it('should handle undefined int64 fields', () => {
    const rawParams: ServicesDomainGenerationParams = {
      characterSet: 'abc',
      constantString: 'test',
      patternType: 'both' as const,
      tld: 'net',
      variableLength: 2
      // both totalPossibleCombinations and currentOffset are optional
    };

    const aligned = transformToDomainGenerationParamsAligned(rawParams);

    expect(aligned.totalPossibleCombinations).toBeUndefined();
    expect(aligned.currentOffset).toBeUndefined();
  });

  it('should transform back from aligned to API format with string values', () => {
    const aligned: ServicesDomainGenerationParamsAligned = {
      characterSet: 'abcdefghijklmnopqrstuvwxyz',
      constantString: 'test',
      numDomainsToGenerate: 1000,
      patternType: 'prefix' as const,
      totalPossibleCombinations: createSafeBigInt('456976'),
      currentOffset: createSafeBigInt('12345'),
      tld: 'com',
      variableLength: 4
    };

    const apiFormat = transformFromDomainGenerationParamsAligned(aligned);

    expect(apiFormat.totalPossibleCombinations).toBe('456976');
    expect(apiFormat.currentOffset).toBe('12345');
    
    // Other fields should remain unchanged
    expect(apiFormat.characterSet).toBe('abcdefghijklmnopqrstuvwxyz');
    expect(apiFormat.variableLength).toBe(4);
  });

  it('should handle edge case: currentOffset at zero', () => {
    const rawParams: ServicesDomainGenerationParams & { currentOffset?: number } = {
      characterSet: 'abc',
      constantString: 'test',
      patternType: 'both' as const,
      currentOffset: 0,
      tld: 'net',
      variableLength: 2
    };

    const aligned = transformToDomainGenerationParamsAligned(rawParams);
    
    expect(aligned.currentOffset).toBeDefined();
    expect(aligned.currentOffset?.toString()).toBe('0');
    expect(aligned.currentOffset?.valueOf()).toBe(BigInt(0));
  });

  it('should handle both fields with mixed types', () => {
    const rawParams = {
      characterSet: 'abc',
      constantString: 'test',
      patternType: 'prefix' as const,
      totalPossibleCombinations: '1000000',
      currentOffset: 500,
      tld: 'com',
      variableLength: 3
    };

    const aligned = transformToDomainGenerationParamsAligned(rawParams as any);
    
    expect(aligned.totalPossibleCombinations?.valueOf()).toBe(BigInt(1000000));
    expect(aligned.currentOffset?.valueOf()).toBe(BigInt(500));
  });

  it('should correctly handle only currentOffset being present', () => {
    const rawParams: ServicesDomainGenerationParams & { currentOffset?: number } = {
      characterSet: 'xyz',
      constantString: 'prefix',
      patternType: 'prefix' as const,
      currentOffset: 999,
      tld: 'io',
      variableLength: 6
      // totalPossibleCombinations is not present
    };

    const aligned = transformToDomainGenerationParamsAligned(rawParams);
    
    expect(aligned.currentOffset).toBeDefined();
    expect(aligned.currentOffset?.toString()).toBe('999');
    expect(aligned.totalPossibleCombinations).toBeUndefined();
  });

  it('should correctly handle only totalPossibleCombinations being present', () => {
    const rawParams: ServicesDomainGenerationParams & { totalPossibleCombinations?: number } = {
      characterSet: 'xyz',
      constantString: 'prefix',
      patternType: 'suffix' as const,
      totalPossibleCombinations: 100000,
      tld: 'io',
      variableLength: 6
      // currentOffset is not present
    };

    const aligned = transformToDomainGenerationParamsAligned(rawParams);
    
    expect(aligned.totalPossibleCombinations).toBeDefined();
    expect(aligned.totalPossibleCombinations?.toString()).toBe('100000');
    expect(aligned.currentOffset).toBeUndefined();
  });
});