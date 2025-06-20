import { describe, it, expect } from '@jest/globals';
import {
  ModelsGeneratedDomain,
  transformToModelsGeneratedDomain,
  transformFromModelsGeneratedDomain,
  isModelsGeneratedDomain
} from '../models/models-generated-domain';
import { createSafeBigInt, toString } from '../../types/branded';

describe('CV-008: GeneratedDomain offsetIndex SafeBigInt Fix', () => {
  describe('Type Safety', () => {
    it('should enforce SafeBigInt type for offsetIndex', () => {
      const domain: ModelsGeneratedDomain = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
        domain: 'test12345.com',
        offsetIndex: createSafeBigInt('9007199254740993'),
        generatedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      };

      // TypeScript should enforce that offsetIndex is SafeBigInt (bigint)
      expect(typeof domain.offsetIndex).toBe('bigint');
      expect(domain.offsetIndex).toBeInstanceOf(BigInt);
    });

    it('should handle large offsetIndex values beyond Number.MAX_SAFE_INTEGER', () => {
      const largeOffset = '18446744073709551615'; // Max uint64
      const domain: ModelsGeneratedDomain = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
        domain: 'test-large.com',
        offsetIndex: createSafeBigInt(largeOffset),
        generatedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      };

      expect(toString(domain.offsetIndex)).toBe(largeOffset);
      expect(domain.offsetIndex > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    });
  });

  describe('API Response Transformation', () => {
    it('should transform raw API response with number offsetIndex to SafeBigInt', () => {
      const rawResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
        domain: 'test123.com',
        offsetIndex: 12345,
        generatedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      };

      const transformed = transformToModelsGeneratedDomain(rawResponse);

      expect(typeof transformed.offsetIndex).toBe('bigint');
      expect(transformed.offsetIndex).toBe(BigInt(12345));
    });

    it('should transform raw API response with string offsetIndex to SafeBigInt', () => {
      const rawResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
        domain: 'test456.com',
        offsetIndex: '9007199254740993',
        generatedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      };

      const transformed = transformToModelsGeneratedDomain(rawResponse);

      expect(typeof transformed.offsetIndex).toBe('bigint');
      expect(toString(transformed.offsetIndex)).toBe('9007199254740993');
    });

    it('should handle snake_case field names in raw response', () => {
      const rawResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generation_campaign_id: '223e4567-e89b-12d3-a456-426614174000',
        domain_name: 'test789.com',
        offset_index: '42',
        generated_at: '2024-01-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z'
      };

      const transformed = transformToModelsGeneratedDomain(rawResponse);

      expect(transformed.generationCampaignId).toBe('223e4567-e89b-12d3-a456-426614174000');
      expect(transformed.domain).toBe('test789.com');
      expect(transformed.offsetIndex).toBe(BigInt(42));
    });
  });

  describe('API Request Transformation', () => {
    it('should transform SafeBigInt offsetIndex to string for API request', () => {
      const domain: ModelsGeneratedDomain = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
        domain: 'test999.com',
        offsetIndex: createSafeBigInt('9007199254740993'),
        generatedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      };

      const transformed = transformFromModelsGeneratedDomain(domain);

      expect(transformed.offsetIndex).toBe('9007199254740993');
      expect(typeof transformed.offsetIndex).toBe('string');
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify valid ModelsGeneratedDomain objects', () => {
      const validDomain = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
        domain: 'valid.com',
        offsetIndex: BigInt(123),
        generatedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      };

      expect(isModelsGeneratedDomain(validDomain)).toBe(true);
    });

    it('should reject objects with number offsetIndex', () => {
      const invalidDomain = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
        domain: 'invalid.com',
        offsetIndex: 123, // Should be bigint, not number
        generatedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      };

      expect(isModelsGeneratedDomain(invalidDomain)).toBe(false);
    });

    it('should reject objects with missing required fields', () => {
      const invalidDomain = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        domain: 'incomplete.com',
        // Missing other required fields
      };

      expect(isModelsGeneratedDomain(invalidDomain)).toBe(false);
    });
  });

  describe('Integration with existing transformations', () => {
    it('should work with array of generated domains', () => {
      const rawDomains = [
        {
          id: '111e4567-e89b-12d3-a456-426614174000',
          generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
          domain: 'test1.com',
          offsetIndex: '1',
          generatedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: '222e4567-e89b-12d3-a456-426614174000',
          generationCampaignId: '223e4567-e89b-12d3-a456-426614174000',
          domain: 'test2.com',
          offsetIndex: '9007199254740993',
          generatedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z'
        }
      ];

      const transformed = rawDomains.map(transformToModelsGeneratedDomain);

      expect(transformed[0].offsetIndex).toBe(BigInt(1));
      expect(transformed[1].offsetIndex).toBe(BigInt('9007199254740993'));
      expect(transformed.every(d => typeof d.offsetIndex === 'bigint')).toBe(true);
    });
  });
});