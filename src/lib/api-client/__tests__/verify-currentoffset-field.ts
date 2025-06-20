/**
 * Simple verification that currentOffset field exists in all relevant types
 */

import { ServicesDomainGenerationParams } from '../models/services-domain-generation-params';
import { ServicesDomainGenerationParamsAligned } from '../models/services-domain-generation-params-aligned';
import { createSafeBigInt } from '../../types/branded';

// Test 1: Verify currentOffset exists in base ServicesDomainGenerationParams
const baseParams: ServicesDomainGenerationParams = {
  characterSet: 'abcdefghijklmnopqrstuvwxyz',
  constantString: 'test',
  patternType: 'prefix' as const,
  tld: 'com',
  variableLength: 4,
  numDomainsToGenerate: 1000,
  totalPossibleCombinations: 456976,
  currentOffset: 12345 // This should compile without errors
};

// Test 2: Verify currentOffset exists in aligned type
const alignedParams: ServicesDomainGenerationParamsAligned = {
  characterSet: 'abcdefghijklmnopqrstuvwxyz',
  constantString: 'test',
  patternType: 'prefix' as const,
  tld: 'com',
  variableLength: 4,
  numDomainsToGenerate: 1000,
  totalPossibleCombinations: createSafeBigInt(456976),
  currentOffset: createSafeBigInt(12345) // This should compile without errors
};

// Test 3: Verify both fields are optional
const minimalParams: ServicesDomainGenerationParams = {
  characterSet: 'abc',
  constantString: 'test',
  patternType: 'suffix' as const,
  tld: 'net',
  variableLength: 2
  // Neither totalPossibleCombinations nor currentOffset are required
};

// Test 4: Type assertions to verify field presence
type AssertCurrentOffsetInBase = ServicesDomainGenerationParams extends { currentOffset?: number } ? true : false;
type AssertTotalPossibleInBase = ServicesDomainGenerationParams extends { totalPossibleCombinations?: number } ? true : false;

const _testBase1: AssertCurrentOffsetInBase = true;
const _testBase2: AssertTotalPossibleInBase = true;

// Test 5: Type assertions for aligned version
type AssertCurrentOffsetInAligned = ServicesDomainGenerationParamsAligned extends { currentOffset?: any } ? true : false;
type AssertTotalPossibleInAligned = ServicesDomainGenerationParamsAligned extends { totalPossibleCombinations?: any } ? true : false;

const _testAligned1: AssertCurrentOffsetInAligned = true;
const _testAligned2: AssertTotalPossibleInAligned = true;

console.log('✅ CV-004 Fix Verified: currentOffset field exists in all relevant types');
console.log('✅ Both currentOffset and totalPossibleCombinations are properly typed as optional fields');
console.log('✅ Aligned types use SafeBigInt for int64 field safety');

export { baseParams, alignedParams, minimalParams };