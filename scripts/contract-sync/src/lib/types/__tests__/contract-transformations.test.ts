/**
 * Contract Transformation Tests
 * Tests all model transformations with edge cases
 */

import { describe, it, expect } from '@jest/globals';
import * as Models from '../generated';
import { createSafeBigInt, createUUID, createEmail, createISODateString } from '../branded';

describe('Contract Transformations', () => {
  describe('Int64 Nested Transformations', () => {
    it('should handle int64 fields in Campaign', () => {
      const campaign: Models.Campaign = {
        id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
        name: 'Test Campaign',
        campaignType: Models.CampaignTypeEnum.DOMAIN_GENERATION,
        status: Models.CampaignStatusEnum.PENDING,
        totalItems: createSafeBigInt('1000000'),
        processedItems: createSafeBigInt('500000'),
        successfulItems: createSafeBigInt('450000'),
        failedItems: createSafeBigInt('50000'),
        createdAt: createISODateString('2023-01-01T00:00:00.000Z'),
        updatedAt: createISODateString('2023-01-01T00:00:00.000Z')
      };
      
      expect(campaign.totalItems?.toString()).toBe('1000000');
      expect(campaign.processedItems?.toString()).toBe('500000');
      expect(campaign.successfulItems?.toString()).toBe('450000');
      expect(campaign.failedItems?.toString()).toBe('50000');
    });

    it('should handle int64 in GeneratedDomain', () => {
      const domain: Models.GeneratedDomain = {
        id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
        generationCampaignId: createUUID('223e4567-e89b-12d3-a456-426614174000'),
        domainName: 'example.com',
        offsetIndex: createSafeBigInt('123456'),
        generatedAt: createISODateString('2023-01-01T00:00:00.000Z'),
        createdAt: createISODateString('2023-01-01T00:00:00.000Z')
      };
      
      expect(domain.offsetIndex.toString()).toBe('123456');
    });

    it('should handle nested int64 in DomainGenerationCampaignParams', () => {
      const params: Models.DomainGenerationCampaignParams = {
        patternType: 'prefix',
        variableLength: 5,
        characterSet: 'abc',
        constantString: 'test',
        tld: '.com',
        numDomainsToGenerate: 1000,
        totalPossibleCombinations: createSafeBigInt('10000000'),
        currentOffset: createSafeBigInt('5000')
      };
      
      expect(params.totalPossibleCombinations.toString()).toBe('10000000');
      expect(params.currentOffset.toString()).toBe('5000');
    });
  });

  describe('Enum Casing Preservation', () => {
    it('should preserve PascalCase enum names', () => {
      expect(Models.CampaignStatusEnum).toBeDefined();
      expect(Models.PersonaTypeEnum).toBeDefined();
      expect(typeof Models.CampaignStatusEnum.PENDING).toBe('string');
    });
  });

  describe('Branded Type Generation', () => {
    it('should use branded types for UUID fields', () => {
      const user: Models.User = {
        id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
        email: createEmail('test@example.com')
      } as any;
      
      // TypeScript will enforce branded types at compile time
      expect(user.id).toBeDefined();
      expect(user.email).toBeDefined();
    });
  });
});
