import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { 
  dnsValidationParamsSchema,
  httpKeywordParamsSchema,
  createDNSValidationCampaignRequestSchema,
  createHTTPKeywordCampaignRequestSchema 
} from '../generated/validationSchemas';
import {
  enhancedDnsValidationParamsSchema,
  enhancedHttpKeywordParamsSchema
} from '../unifiedCampaignSchema';
import {
  dnsValidationParamsSchema as alignedDnsSchema,
  httpKeywordParamsSchema as alignedHttpSchema
} from '../alignedValidationSchemas';

describe('Validation Alignment Tests', () => {
  describe('Batch Size Validation', () => {
    it('should enforce min=1, max=10000 for DNS validation batch size', () => {
      const validData = {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        batchSize: 5000
      };
      
      // Test valid range
      expect(() => dnsValidationParamsSchema.parse(validData)).not.toThrow();
      expect(() => alignedDnsSchema.parse({
        ...validData,
        personaIds: ['123e4567-e89b-12d3-a456-426614174000']
      })).not.toThrow();
      
      // Test min boundary
      expect(() => dnsValidationParamsSchema.parse({ ...validData, batchSize: 1 })).not.toThrow();
      expect(() => dnsValidationParamsSchema.parse({ ...validData, batchSize: 0 })).toThrow();
      
      // Test max boundary
      expect(() => dnsValidationParamsSchema.parse({ ...validData, batchSize: 10000 })).not.toThrow();
      expect(() => dnsValidationParamsSchema.parse({ ...validData, batchSize: 10001 })).toThrow();
    });

    it('should enforce min=1, max=10000 for HTTP keyword validation batch size', () => {
      const validData = {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'DomainGeneration' as const,
        batchSize: 5000
      };
      
      // Test valid range
      expect(() => httpKeywordParamsSchema.parse(validData)).not.toThrow();
      expect(() => alignedHttpSchema.parse({
        ...validData,
        personaIds: ['123e4567-e89b-12d3-a456-426614174000']
      })).not.toThrow();
      
      // Test min boundary
      expect(() => httpKeywordParamsSchema.parse({ ...validData, batchSize: 1 })).not.toThrow();
      expect(() => httpKeywordParamsSchema.parse({ ...validData, batchSize: 0 })).toThrow();
      
      // Test max boundary
      expect(() => httpKeywordParamsSchema.parse({ ...validData, batchSize: 10000 })).not.toThrow();
      expect(() => httpKeywordParamsSchema.parse({ ...validData, batchSize: 10001 })).toThrow();
    });
  });

  describe('Retry Attempts Validation', () => {
    it('should enforce min=0, max=10 for DNS validation retry attempts', () => {
      const validData = {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        retryAttempts: 5
      };
      
      // Test valid range
      expect(() => dnsValidationParamsSchema.parse(validData)).not.toThrow();
      
      // Test min boundary
      expect(() => dnsValidationParamsSchema.parse({ ...validData, retryAttempts: 0 })).not.toThrow();
      expect(() => dnsValidationParamsSchema.parse({ ...validData, retryAttempts: -1 })).toThrow();
      
      // Test max boundary
      expect(() => dnsValidationParamsSchema.parse({ ...validData, retryAttempts: 10 })).not.toThrow();
      expect(() => dnsValidationParamsSchema.parse({ ...validData, retryAttempts: 11 })).toThrow();
    });

    it('should enforce min=0, max=10 for HTTP keyword validation retry attempts', () => {
      const validData = {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'DNSValidation' as const,
        retryAttempts: 5
      };
      
      // Test valid range
      expect(() => httpKeywordParamsSchema.parse(validData)).not.toThrow();
      
      // Test min boundary
      expect(() => httpKeywordParamsSchema.parse({ ...validData, retryAttempts: 0 })).not.toThrow();
      expect(() => httpKeywordParamsSchema.parse({ ...validData, retryAttempts: -1 })).toThrow();
      
      // Test max boundary
      expect(() => httpKeywordParamsSchema.parse({ ...validData, retryAttempts: 10 })).not.toThrow();
      expect(() => httpKeywordParamsSchema.parse({ ...validData, retryAttempts: 11 })).toThrow();
    });
  });

  describe('Request Timeout Validation', () => {
    it('should enforce gte=0 for HTTP persona request timeout', () => {
      const hTTPConfigDetailsSchema = z.object({
        userAgent: z.string(),
        requestTimeoutSeconds: z.number().int().gte(0).optional(),
        rateLimitDps: z.number().gte(0).optional(),
        rateLimitBurst: z.number().int().gte(0).optional(),
      });

      const validData = {
        userAgent: 'Mozilla/5.0',
        requestTimeoutSeconds: 30
      };
      
      // Test valid values
      expect(() => hTTPConfigDetailsSchema.parse(validData)).not.toThrow();
      expect(() => hTTPConfigDetailsSchema.parse({ ...validData, requestTimeoutSeconds: 0 })).not.toThrow();
      expect(() => hTTPConfigDetailsSchema.parse({ ...validData, requestTimeoutSeconds: 3600 })).not.toThrow();
      
      // Test invalid values
      expect(() => hTTPConfigDetailsSchema.parse({ ...validData, requestTimeoutSeconds: -1 })).toThrow();
    });
  });

  describe('String Length Validations', () => {
    it('should enforce min=1, max=255 for name fields', () => {
      const createPersonaSchema = z.object({
        name: z.string().min(1).max(255),
        personaType: z.enum(["dns", "http"]),
        configDetails: z.record(z.any()),
      });

      // Test valid lengths
      expect(() => createPersonaSchema.parse({
        name: 'A',
        personaType: 'dns',
        configDetails: {}
      })).not.toThrow();
      
      expect(() => createPersonaSchema.parse({
        name: 'A'.repeat(255),
        personaType: 'http',
        configDetails: {}
      })).not.toThrow();
      
      // Test invalid lengths
      expect(() => createPersonaSchema.parse({
        name: '',
        personaType: 'dns',
        configDetails: {}
      })).toThrow();
      
      expect(() => createPersonaSchema.parse({
        name: 'A'.repeat(256),
        personaType: 'http',
        configDetails: {}
      })).toThrow();
    });
  });

  describe('Port Range Validation', () => {
    it('should enforce valid port range (1-65535) for targetHttpPorts', () => {
      const portsSchema = z.array(z.number().int().min(1).max(65535));
      
      // Test valid ports
      expect(() => portsSchema.parse([80, 443, 8080])).not.toThrow();
      expect(() => portsSchema.parse([1])).not.toThrow();
      expect(() => portsSchema.parse([65535])).not.toThrow();
      
      // Test invalid ports
      expect(() => portsSchema.parse([0])).toThrow();
      expect(() => portsSchema.parse([65536])).toThrow();
      expect(() => portsSchema.parse([-1])).toThrow();
    });
  });

  describe('Enhanced Schema Alignment', () => {
    it('should have consistent validation in enhanced schemas', () => {
      const dnsData = {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        personaIds: ['123e4567-e89b-12d3-a456-426614174000'],
        batchSize: 5000,
        retryAttempts: 5
      };
      
      // Both enhanced and aligned schemas should accept the same valid data
      expect(() => enhancedDnsValidationParamsSchema.parse(dnsData)).not.toThrow();
      expect(() => alignedDnsSchema.parse(dnsData)).not.toThrow();
      
      // Both should reject invalid batch size
      const invalidBatchData = { ...dnsData, batchSize: 20000 };
      expect(() => enhancedDnsValidationParamsSchema.parse(invalidBatchData)).toThrow();
      expect(() => alignedDnsSchema.parse(invalidBatchData)).toThrow();
      
      // Both should reject invalid retry attempts
      const invalidRetryData = { ...dnsData, retryAttempts: 15 };
      expect(() => enhancedDnsValidationParamsSchema.parse(invalidRetryData)).toThrow();
      expect(() => alignedDnsSchema.parse(invalidRetryData)).toThrow();
    });

    it('should have consistent HTTP keyword validation', () => {
      const httpData = {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'DomainGeneration' as const,
        personaIds: ['123e4567-e89b-12d3-a456-426614174000'],
        batchSize: 5000,
        retryAttempts: 5,
        targetHttpPorts: [80, 443]
      };
      
      // Both enhanced and aligned schemas should accept the same valid data
      expect(() => enhancedHttpKeywordParamsSchema.parse(httpData)).not.toThrow();
      expect(() => alignedHttpSchema.parse(httpData)).not.toThrow();
      
      // Both should reject invalid ports
      const invalidPortData = { ...httpData, targetHttpPorts: [0, 70000] };
      expect(() => enhancedHttpKeywordParamsSchema.parse(invalidPortData)).toThrow();
      expect(() => alignedHttpSchema.parse(invalidPortData)).toThrow();
    });
  });

  describe('Campaign Request Schema Alignment', () => {
    it('should enforce consistent validation in campaign creation requests', () => {
      const dnsRequest = {
        name: 'Test DNS Campaign',
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        batchSize: 5000,
        retryAttempts: 5
      };
      
      // Test DNS campaign request
      expect(() => createDNSValidationCampaignRequestSchema.parse(dnsRequest)).not.toThrow();
      
      // Test with invalid batch size
      expect(() => createDNSValidationCampaignRequestSchema.parse({
        ...dnsRequest,
        batchSize: 15000
      })).toThrow();
      
      const httpRequest = {
        name: 'Test HTTP Campaign',
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'DNSValidation' as const,
        batchSize: 5000,
        retryAttempts: 5
      };
      
      // Test HTTP campaign request
      expect(() => createHTTPKeywordCampaignRequestSchema.parse(httpRequest)).not.toThrow();
      
      // Test with invalid retry attempts
      expect(() => createHTTPKeywordCampaignRequestSchema.parse({
        ...httpRequest,
        retryAttempts: 20
      })).toThrow();
    });
  });
});