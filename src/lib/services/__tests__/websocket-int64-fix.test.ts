/**
 * Test for CV-009: WebSocket Int64 Field Handling
 * Verifies that WebSocket messages properly handle int64 fields using SafeBigInt
 */

import { WebSocketService } from '../websocketService.simple';
import { createSafeBigInt, isSafeBigInt } from '@/lib/types/branded';

describe('CV-009: WebSocket Int64 Field Handling', () => {
  let service: WebSocketService;

  beforeEach(() => {
    // Create service instance with access to private methods for testing
    service = new WebSocketService();
  });

  describe('parseAndTransformMessage', () => {
    it('should transform int64 fields to SafeBigInt', () => {
      const rawData = JSON.stringify({
        type: 'campaign_progress',
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        validationsProcessed: '9007199254740993', // > MAX_SAFE_INTEGER
        domainsGenerated: 1234567890,
        data: {
          totalItems: '9223372036854775807', // Max int64
          processedItems: 999999999999,
          successfulItems: '888888888888888888',
          failedItems: 0
        }
      });

      // Access private method via prototype
      const parseMethod = (service as any).parseAndTransformMessage.bind(service);
      const result = parseMethod(rawData);

      // Check top-level fields
      expect(isSafeBigInt(result.validationsProcessed)).toBe(true);
      expect(isSafeBigInt(result.domainsGenerated)).toBe(true);
      expect(result.validationsProcessed?.toString()).toBe('9007199254740993');
      expect(result.domainsGenerated?.toString()).toBe('1234567890');

      // Check data fields
      const data = result.data as any;
      expect(isSafeBigInt(data.totalItems)).toBe(true);
      expect(isSafeBigInt(data.processedItems)).toBe(true);
      expect(isSafeBigInt(data.successfulItems)).toBe(true);
      expect(isSafeBigInt(data.failedItems)).toBe(true);
      
      expect(data.totalItems.toString()).toBe('9223372036854775807');
      expect(data.processedItems.toString()).toBe('999999999999');
      expect(data.successfulItems.toString()).toBe('888888888888888888');
      expect(data.failedItems.toString()).toBe('0');
    });

    it('should handle undefined int64 fields gracefully', () => {
      const rawData = JSON.stringify({
        type: 'campaign_progress',
        campaignId: '123e4567-e89b-12d3-a456-426614174000',
        data: {
          phase: 'domain_generation',
          status: 'running'
        }
      });

      const parseMethod = (service as any).parseAndTransformMessage.bind(service);
      const result = parseMethod(rawData);

      expect(result.validationsProcessed).toBeUndefined();
      expect(result.domainsGenerated).toBeUndefined();
      expect(result.data.totalItems).toBeUndefined();
      expect(result.data.processedItems).toBeUndefined();
    });

    it('should handle edge cases around MAX_SAFE_INTEGER', () => {
      const maxSafeInt = Number.MAX_SAFE_INTEGER; // 9007199254740991
      const beyondSafeInt = '9007199254740992';
      
      const rawData = JSON.stringify({
        type: 'test',
        data: {
          // Use known int64 fields for testing
          totalItems: maxSafeInt,
          processedItems: beyondSafeInt,
          successfulItems: 0,
          failedItems: '-9223372036854775808', // Min int64
          domainsGenerated: -123
        }
      });

      const parseMethod = (service as any).parseAndTransformMessage.bind(service);
      const result = parseMethod(rawData);
      const data = result.data as any;

      // All int64 fields should be SafeBigInt
      expect(isSafeBigInt(data.totalItems)).toBe(true);
      expect(isSafeBigInt(data.processedItems)).toBe(true);
      expect(isSafeBigInt(data.successfulItems)).toBe(true);
      expect(isSafeBigInt(data.failedItems)).toBe(true);
      expect(isSafeBigInt(data.domainsGenerated)).toBe(true);

      // Values should be preserved
      expect(data.totalItems.toString()).toBe(maxSafeInt.toString());
      expect(data.processedItems.toString()).toBe(beyondSafeInt);
      expect(data.successfulItems.toString()).toBe('0');
      expect(data.failedItems.toString()).toBe('-9223372036854775808');
      expect(data.domainsGenerated.toString()).toBe('-123');
    });
  });

  describe('serializeMessage', () => {
    it('should serialize SafeBigInt fields to strings', () => {
      const message = {
        type: 'test_message',
        data: {
          campaignId: '123e4567-e89b-12d3-a456-426614174000'
        },
        validationsProcessed: createSafeBigInt('9007199254740993'),
        domainsGenerated: createSafeBigInt(1234567890)
      };

      const serializeMethod = (service as any).serializeMessage.bind(service);
      const serialized = serializeMethod(message);
      const parsed = JSON.parse(serialized);

      // Verify SafeBigInt fields were converted to strings
      expect(typeof parsed.validationsProcessed).toBe('string');
      expect(parsed.validationsProcessed).toBe('9007199254740993');
      expect(typeof parsed.domainsGenerated).toBe('string');
      expect(parsed.domainsGenerated).toBe('1234567890');
    });

    it('should serialize nested SafeBigInt fields in data object', () => {
      const message = {
        type: 'campaign_progress',
        data: {
          totalItems: createSafeBigInt('9223372036854775807'),
          processedItems: createSafeBigInt(999999999999),
          successfulItems: createSafeBigInt('888888888888888888'),
          failedItems: createSafeBigInt(0),
          progress: 50,
          phase: 'validation',
          status: 'running'
        }
      };

      const serializeMethod = (service as any).serializeMessage.bind(service);
      const serialized = serializeMethod(message);
      const parsed = JSON.parse(serialized);
      const data = parsed.data;

      // Verify all SafeBigInt fields in data were converted to strings
      expect(typeof data.totalItems).toBe('string');
      expect(data.totalItems).toBe('9223372036854775807');
      expect(typeof data.processedItems).toBe('string');
      expect(data.processedItems).toBe('999999999999');
      expect(typeof data.successfulItems).toBe('string');
      expect(data.successfulItems).toBe('888888888888888888');
      expect(typeof data.failedItems).toBe('string');
      expect(data.failedItems).toBe('0');

      // Non-SafeBigInt fields should remain unchanged
      expect(data.progress).toBe(50);
      expect(data.phase).toBe('validation');
      expect(data.status).toBe('running');
    });

    it('should handle undefined SafeBigInt fields', () => {
      const message = {
        type: 'test_message',
        data: {
          campaignId: '123e4567-e89b-12d3-a456-426614174000',
          someField: 'value'
        }
      };

      const serializeMethod = (service as any).serializeMessage.bind(service);
      const serialized = serializeMethod(message);
      const parsed = JSON.parse(serialized);

      // Should not have undefined fields
      expect(parsed.validationsProcessed).toBeUndefined();
      expect(parsed.domainsGenerated).toBeUndefined();
      expect(parsed.data.campaignId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(parsed.data.someField).toBe('value');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle campaign progress messages with trillion-scale numbers', () => {
      const rawData = JSON.stringify({
        type: 'campaign_progress',
        timestamp: '2025-06-20T12:00:00.000Z',
        data: {
          campaignId: '550e8400-e29b-41d4-a716-446655440000',
          totalItems: '1000000000000', // 1 trillion
          processedItems: '500000000000', // 500 billion
          successfulItems: '499999999999', // 499.9 billion
          failedItems: '1',
          progressPercent: 50.0,
          phase: 'domain_validation',
          status: 'running'
        }
      });

      const parseMethod = (service as any).parseAndTransformMessage.bind(service);
      const result = parseMethod(rawData);
      const data = result.data as any;

      expect(result.type).toBe('campaign_progress');
      
      // All int64 fields should be SafeBigInt
      expect(isSafeBigInt(data.totalItems)).toBe(true);
      expect(isSafeBigInt(data.processedItems)).toBe(true);
      expect(isSafeBigInt(data.successfulItems)).toBe(true);
      expect(isSafeBigInt(data.failedItems)).toBe(true);

      // Verify values
      expect(data.totalItems.toString()).toBe('1000000000000');
      expect(data.processedItems.toString()).toBe('500000000000');
      expect(data.successfulItems.toString()).toBe('499999999999');
      expect(data.failedItems.toString()).toBe('1');

      // Progress percentage should remain a regular number
      expect(typeof data.progressPercent).toBe('number');
      expect(data.progressPercent).toBe(50.0);
    });

    it('should round-trip serialize and parse correctly', () => {
      const originalMessage = {
        type: 'domain_generated',
        validationsProcessed: createSafeBigInt('9007199254740993'),
        domainsGenerated: createSafeBigInt('1000000000000'),
        data: {
          campaignId: '123e4567-e89b-12d3-a456-426614174000',
          totalGenerated: createSafeBigInt('5000000000000'),
          offset: createSafeBigInt('1234567890123456789')
        }
      };

      // Serialize
      const serializeMethod = (service as any).serializeMessage.bind(service);
      const serialized = serializeMethod(originalMessage);

      // Parse back
      const parseMethod = (service as any).parseAndTransformMessage.bind(service);
      const parsed = parseMethod(serialized);

      // Verify round-trip maintains values
      expect(parsed.validationsProcessed?.toString()).toBe('9007199254740993');
      expect(parsed.domainsGenerated?.toString()).toBe('1000000000000');
      expect((parsed.data as any).totalGenerated?.toString()).toBe('5000000000000');
      expect((parsed.data as any).offset?.toString()).toBe('1234567890123456789');
    });
  });
});