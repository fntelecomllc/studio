import { describe, it, expect } from '@jest/globals';
import {
  transformCampaignResponse,
  transformCampaignArrayResponse,
  transformCampaignRequestData,
  CampaignAPIAligned
} from '../campaign-transformers';
import { ModelsCampaignAPI } from '../../../api-client/models/models-campaign-api';

// Mock the branded types module
jest.mock('../../../types/branded', () => ({
  createSafeBigInt: (value: string | number) => BigInt(value),
  createUUID: (id: string) => id,
  createISODateString: (date: string) => date,
  SafeBigInt: BigInt,
  UUID: String,
  ISODateString: String
}));

describe('Campaign Transformers', () => {
  describe('transformCampaignResponse', () => {
    it('should transform raw campaign API response to aligned model', () => {
      const rawCampaign: ModelsCampaignAPI = {
        id: '12345',
        name: 'Test Campaign',
        campaignType: 'dns_validation' as any,
        status: 'running' as any,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-02T10:00:00Z',
        totalItems: 1000,
        processedItems: 500,
        successfulItems: 450,
        failedItems: 50,
        progressPercentage: 50.0,
        avgProcessingRate: 10.5,
        errorMessage: undefined,
        estimatedCompletionAt: '2024-01-02T15:00:00Z',
        lastHeartbeatAt: '2024-01-02T09:00:00Z',
        metadata: { source: 'test' },
        userId: '67890'
      };

      const result = transformCampaignResponse(rawCampaign);

      expect(result).toEqual({
        id: '12345',
        name: 'Test Campaign',
        campaignType: 'dns_validation',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: '2024-01-02T10:00:00Z',
        totalItems: BigInt(1000),
        processedItems: BigInt(500),
        successfulItems: BigInt(450),
        failedItems: BigInt(50),
        progressPercentage: 50.0,
        avgProcessingRate: 10.5,
        errorMessage: undefined,
        estimatedCompletionAt: '2024-01-02T15:00:00Z',
        lastHeartbeatAt: '2024-01-02T09:00:00Z',
        metadata: { source: 'test' },
        userId: '67890'
      });
    });

    it('should handle null and undefined input', () => {
      expect(transformCampaignResponse(null)).toEqual({});
      expect(transformCampaignResponse(undefined)).toEqual({});
    });

    it('should handle optional fields', () => {
      const minimalCampaign: ModelsCampaignAPI = {
        id: '67890',
        name: 'Minimal Campaign',
        campaignType: 'http_keyword' as any,
        status: 'draft' as any
      };

      const result = transformCampaignResponse(minimalCampaign);

      expect(result.id).toBe('67890');
      expect(result.name).toBe('Minimal Campaign');
      expect(result.totalItems).toBeUndefined();
      expect(result.processedItems).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('should handle numeric fields as numbers', () => {
      const campaignWithNumbers: ModelsCampaignAPI = {
        id: '123',
        name: 'Count Campaign',
        totalItems: 999999,
        processedItems: 888888,
        successfulItems: 777777,
        failedItems: 111111
      };

      const result = transformCampaignResponse(campaignWithNumbers);

      expect(result.totalItems).toBe(BigInt(999999));
      expect(result.processedItems).toBe(BigInt(888888));
      expect(result.successfulItems).toBe(BigInt(777777));
      expect(result.failedItems).toBe(BigInt(111111));
    });

    it('should handle zero values for numeric fields', () => {
      const campaignWithZeros: ModelsCampaignAPI = {
        id: '123',
        totalItems: 0,
        processedItems: 0,
        failedItems: 0
      };

      const result = transformCampaignResponse(campaignWithZeros);

      expect(result.totalItems).toBe(BigInt(0));
      expect(result.processedItems).toBe(BigInt(0));
      expect(result.failedItems).toBe(BigInt(0));
    });

    it('should preserve metadata as-is', () => {
      const campaignWithMetadata: ModelsCampaignAPI = {
        id: '123',
        metadata: {
          complex: {
            nested: {
              value: 'test'
            }
          },
          array: [1, 2, 3],
          boolean: true,
          null: null
        }
      };

      const result = transformCampaignResponse(campaignWithMetadata);

      expect(result.metadata).toEqual({
        complex: {
          nested: {
            value: 'test'
          }
        },
        array: [1, 2, 3],
        boolean: true,
        null: null
      });
    });
  });

  describe('transformCampaignArrayResponse', () => {
    it('should transform array of campaigns', () => {
      const rawCampaigns: ModelsCampaignAPI[] = [
        {
          id: '1',
          name: 'Campaign 1',
          campaignType: 'dns_validation',
          status: 'running'
        },
        {
          id: '2',
          name: 'Campaign 2',
          campaignType: 'http_keyword' as any,
          status: 'completed' as any
        }
      ];

      const result = transformCampaignArrayResponse(rawCampaigns);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('1');
      expect(result[0]?.campaignType).toBe('dns_validation');
      expect(result[1]?.id).toBe('2');
      expect(result[1]?.status).toBe('completed');
    });

    it('should handle empty array', () => {
      const result = transformCampaignArrayResponse([]);
      expect(result).toEqual([]);
    });

    it('should handle null and undefined', () => {
      expect(transformCampaignArrayResponse(null)).toEqual([]);
      expect(transformCampaignArrayResponse(undefined)).toEqual([]);
    });

    it('should handle non-array input', () => {
      const result = transformCampaignArrayResponse('not an array' as any);
      expect(result).toEqual([]);
    });
  });

  describe('transformCampaignRequestData', () => {
    it('should transform campaign data for API requests', () => {
      const campaignData: Partial<CampaignAPIAligned> = {
        name: 'New Campaign',
        campaignType: 'dns_validation',
        status: 'draft',
        metadata: { source: 'api' },
        progressPercentage: 0,
        avgProcessingRate: 0
      };

      const result = transformCampaignRequestData(campaignData);

      expect(result).toEqual({
        name: 'New Campaign',
        campaignType: 'dns_validation',
        status: 'draft',
        metadata: { source: 'api' },
        progressPercentage: 0,
        avgProcessingRate: 0
      });
    });

    it('should convert SafeBigInt values to numbers', () => {
      const campaignData: Partial<CampaignAPIAligned> = {
        id: '12345' as any,
        totalItems: BigInt(1000) as any,
        processedItems: BigInt(500) as any,
        successfulItems: BigInt(450) as any,
        failedItems: BigInt(50) as any,
        userId: '67890' as any
      };

      const result = transformCampaignRequestData(campaignData);

      expect(result.id).toBe('12345');
      expect(result.totalItems).toBe(1000);
      expect(result.processedItems).toBe(500);
      expect(result.successfulItems).toBe(450);
      expect(result.failedItems).toBe(50);
      expect(result.userId).toBe('67890');
    });

    it('should only include defined fields', () => {
      const campaignData: Partial<CampaignAPIAligned> = {
        name: 'Sparse Campaign',
        status: undefined,
        metadata: undefined
      };

      const result = transformCampaignRequestData(campaignData);

      expect(result).toEqual({
        name: 'Sparse Campaign'
      });
      expect(result.status).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('should handle date fields', () => {
      const campaignData: Partial<CampaignAPIAligned> = {
        createdAt: '2024-01-01T00:00:00Z' as any,
        updatedAt: '2024-01-02T00:00:00Z' as any,
        startedAt: '2024-01-01T10:00:00Z' as any,
        completedAt: '2024-01-02T10:00:00Z' as any,
        estimatedCompletionAt: '2024-01-02T15:00:00Z' as any,
        lastHeartbeatAt: '2024-01-02T09:00:00Z' as any
      };

      const result = transformCampaignRequestData(campaignData);

      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(result.updatedAt).toBe('2024-01-02T00:00:00Z');
      expect(result.startedAt).toBe('2024-01-01T10:00:00Z');
      expect(result.completedAt).toBe('2024-01-02T10:00:00Z');
      expect(result.estimatedCompletionAt).toBe('2024-01-02T15:00:00Z');
      expect(result.lastHeartbeatAt).toBe('2024-01-02T09:00:00Z');
    });

    it('should handle all fields', () => {
      const fullCampaignData: CampaignAPIAligned = {
        avgProcessingRate: 10.5,
        campaignType: 'dns_validation',
        completedAt: '2024-01-02T10:00:00Z' as any,
        createdAt: '2024-01-01T00:00:00Z' as any,
        errorMessage: 'Some error',
        estimatedCompletionAt: '2024-01-02T15:00:00Z' as any,
        failedItems: BigInt(50) as any,
        id: '12345' as any,
        lastHeartbeatAt: '2024-01-02T09:00:00Z' as any,
        metadata: { test: true },
        name: 'Full Campaign',
        processedItems: BigInt(500) as any,
        progressPercentage: 50,
        startedAt: '2024-01-01T10:00:00Z' as any,
        status: 'running',
        successfulItems: BigInt(450) as any,
        totalItems: BigInt(1000) as any,
        updatedAt: '2024-01-02T00:00:00Z' as any,
        userId: '67890' as any
      };

      const result = transformCampaignRequestData(fullCampaignData);

      expect(Object.keys(result)).toHaveLength(19);
      expect(result.name).toBe('Full Campaign');
      expect(result.totalItems).toBe(1000);
      expect(result.errorMessage).toBe('Some error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large BigInt values', () => {
      const campaign: any = {
        id: '9223372036854775807',
        name: 'Big Campaign',
        totalItems: 99999999999,
        processedItems: 88888888888
      };

      const result = transformCampaignResponse(campaign);

      expect(result.id).toBe('9223372036854775807');
      expect(result.totalItems).toBe(BigInt(99999999999));
      expect(result.processedItems).toBe(BigInt(88888888888));
    });

    it('should handle invalid date strings', () => {
      const campaignWithBadDates: ModelsCampaignAPI = {
        id: '123',
        createdAt: 'not-a-date',
        updatedAt: ''
      };

      const result = transformCampaignResponse(campaignWithBadDates);

      // Dates are passed through to branded type creator
      expect(result.createdAt).toBe('not-a-date');
      expect(result.updatedAt).toBeUndefined(); // Empty string becomes undefined
    });

    it('should handle negative numbers', () => {
      const campaign: any = {
        id: '123',
        totalItems: -100,
        processedItems: -50,
        progressPercentage: -10.5
      };

      const result = transformCampaignResponse(campaign);

      expect(result.totalItems).toBe(BigInt(-100));
      expect(result.processedItems).toBe(BigInt(-50));
      expect(result.progressPercentage).toBe(-10.5);
    });

    it('should handle null values for numeric fields', () => {
      const campaign: any = {
        id: '123',
        totalItems: null,
        processedItems: null,
        successfulItems: null,
        failedItems: null
      };

      const result = transformCampaignResponse(campaign);

      // null values are handled by the != null check
      expect(result.totalItems).toBeUndefined();
      expect(result.processedItems).toBeUndefined();
      expect(result.successfulItems).toBeUndefined();
      expect(result.failedItems).toBeUndefined();
    });
  });
});