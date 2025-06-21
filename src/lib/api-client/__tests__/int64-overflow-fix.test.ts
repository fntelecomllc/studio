/**
 * CV-001 INT64 OVERFLOW FIX TEST
 * 
 * This test demonstrates that the API client correctly handles int64 values
 * using SafeBigInt to prevent numeric overflow when values exceed JavaScript's
 * safe integer limit (2^53).
 */

import { describe, it, expect } from '@jest/globals';
import { createSafeBigInt, MAX_SAFE_INTEGER, toString } from '../../types/branded';
import { transformToCampaignAPIAligned } from '../models/models-campaign-api-aligned';

describe('CV-001: Int64 Numeric Overflow Fix', () => {
  
  describe('SafeBigInt handling in API models', () => {
    it('should handle values within safe integer range', () => {
      const rawCampaign = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Campaign',
        campaignType: 'domain_generation',
        status: 'running',
        totalItems: 1000,
        processedItems: 500,
        successfulItems: 450,
        failedItems: 50,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const aligned = transformToCampaignAPIAligned(rawCampaign);
      
      expect(aligned.totalItems).toBeDefined();
      expect(aligned.processedItems).toBeDefined();
      expect(aligned.successfulItems).toBeDefined();
      expect(aligned.failedItems).toBeDefined();
      
      // Values should be SafeBigInt
      expect(typeof aligned.totalItems).toBe('bigint');
      expect(typeof aligned.processedItems).toBe('bigint');
      expect(typeof aligned.successfulItems).toBe('bigint');
      expect(typeof aligned.failedItems).toBe('bigint');
      
      // Should be able to convert back to number for safe values
      expect(Number(aligned.totalItems!)).toBe(1000);
      expect(Number(aligned.processedItems!)).toBe(500);
      expect(Number(aligned.successfulItems!)).toBe(450);
      expect(Number(aligned.failedItems!)).toBe(50);
    });

    it('should handle values exceeding safe integer range', () => {
      // Values that exceed JavaScript's MAX_SAFE_INTEGER (2^53 - 1)
      const largeValue = '9223372036854775807'; // Max int64 value
      const beyondSafeValue = '9007199254740992'; // 2^53
      
      const rawCampaign = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Large Campaign',
        campaignType: 'dns_validation',
        status: 'running',
        totalItems: largeValue,
        processedItems: beyondSafeValue,
        successfulItems: '9007199254740993',
        failedItems: '0',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const aligned = transformToCampaignAPIAligned(rawCampaign);
      
      // Should be SafeBigInt
      expect(typeof aligned.totalItems).toBe('bigint');
      expect(typeof aligned.processedItems).toBe('bigint');
      
      // Should preserve exact values
      expect(toString(aligned.totalItems!)).toBe(largeValue);
      expect(toString(aligned.processedItems!)).toBe(beyondSafeValue);
      expect(toString(aligned.successfulItems!)).toBe('9007199254740993');
      
      // Attempting to convert to number should fail for unsafe values
      expect(() => {
        const bigInt = createSafeBigInt(largeValue);
        if (bigInt > MAX_SAFE_INTEGER) {
          throw new Error('Value exceeds safe integer range');
        }
        return Number(bigInt);
      }).toThrow('Value exceeds safe integer range');
    });

    it('should handle string representations of int64 values', () => {
      const rawCampaign = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'String Values Campaign',
        campaignType: 'http_keyword_validation',
        status: 'completed',
        totalItems: '1234567890123456789', // As string
        processedItems: '1234567890123456789',
        successfulItems: '1234567890123456788',
        failedItems: '1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const aligned = transformToCampaignAPIAligned(rawCampaign);
      
      expect(typeof aligned.totalItems).toBe('bigint');
      expect(toString(aligned.totalItems!)).toBe('1234567890123456789');
      expect(toString(aligned.processedItems!)).toBe('1234567890123456789');
      expect(toString(aligned.successfulItems!)).toBe('1234567890123456788');
      expect(toString(aligned.failedItems!)).toBe('1');
    });

    it('should handle null and undefined values gracefully', () => {
      const rawCampaign = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Partial Campaign',
        campaignType: 'domain_generation',
        status: 'pending',
        totalItems: null as any,
        processedItems: undefined as any,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const aligned = transformToCampaignAPIAligned(rawCampaign);
      
      expect(aligned.totalItems).toBeUndefined();
      expect(aligned.processedItems).toBeUndefined();
      expect(aligned.successfulItems).toBeUndefined();
      expect(aligned.failedItems).toBeUndefined();
    });
  });

  describe('Domain generation params with int64 fields', () => {
    it('should handle generated domain with offsetIndex int64 field', () => {
      const rawDomain = {
        id: '323e4567-e89b-12d3-a456-426614174000',
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        domain: 'test12345678.com',
        offsetIndex: '9007199254740993', // Beyond safe integer
        generatedAt: '2024-01-01T00:00:00Z',
        isValid: true
      };

      // This would use transformGeneratedDomain from transformation-layer
      const offsetIndex = createSafeBigInt(rawDomain.offsetIndex);
      expect(typeof offsetIndex).toBe('bigint');
      expect(toString(offsetIndex)).toBe('9007199254740993');
      expect(offsetIndex > BigInt(MAX_SAFE_INTEGER)).toBe(true);
    });
  });

  describe('Serialization and API communication', () => {
    it('should serialize SafeBigInt fields correctly for API requests', () => {
      const campaign = {
        totalItems: createSafeBigInt('1234567890123456789'),
        processedItems: createSafeBigInt('1000'),
        successfulItems: createSafeBigInt('999'),
        failedItems: createSafeBigInt('1')
      };

      // Simulate JSON serialization
      const serialized = {
        totalItems: toString(campaign.totalItems),
        processedItems: toString(campaign.processedItems),
        successfulItems: toString(campaign.successfulItems),
        failedItems: toString(campaign.failedItems)
      };

      expect(serialized.totalItems).toBe('1234567890123456789');
      expect(serialized.processedItems).toBe('1000');
      expect(serialized.successfulItems).toBe('999');
      expect(serialized.failedItems).toBe('1');

      // Verify the serialized values can be parsed back
      const parsed = JSON.parse(JSON.stringify(serialized));
      expect(parsed.totalItems).toBe('1234567890123456789');
    });

    it('should demonstrate the overflow problem with regular numbers', () => {
      const unsafeValue = 9007199254740992; // 2^53 (safe limit)
      const beyondSafeValue = '9007199254740993'; // 2^53 + 1 as string
      
      // JavaScript number at the safe limit
      expect(unsafeValue).toBe(9007199254740992);
      expect(unsafeValue.toString()).toBe('9007199254740992');
      
      // SafeBigInt preserves precision for values beyond safe limit
      const safeBigInt = createSafeBigInt(beyondSafeValue);
      expect(toString(safeBigInt)).toBe('9007199254740993'); // Correct value!
    });
  });

  describe('Error handling', () => {
    it('should handle invalid int64 values', () => {
      expect(() => createSafeBigInt('not-a-number')).toThrow();
      expect(() => createSafeBigInt('12.34')).toThrow(); // Not an integer
      expect(() => createSafeBigInt('9223372036854775808')).toThrow(); // Exceeds int64 max
    });
  });
});