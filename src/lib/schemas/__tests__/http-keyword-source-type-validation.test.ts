import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { hTTPKeywordCampaignParamsSchema } from '../generated/validationSchemas';
import { HTTPKeywordSourceType } from '../../types';

describe('HTTPKeywordCampaignParams sourceType validation - Sequential Pipeline', () => {
  const validBaseParams = {
    sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
    rotationIntervalSeconds: 60,
    processingSpeedPerMinute: 100,
    batchSize: 10,
    retryAttempts: 3
  };

  describe('Valid sourceType values - Sequential Pipeline', () => {
    it('should accept DomainGeneration (from domain generation campaign)', () => {
      const params = {
        ...validBaseParams,
        sourceType: 'DomainGeneration'
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params)).not.toThrow();
    });

    it('should accept DNSValidation (from DNS validation campaign)', () => {
      const params = {
        ...validBaseParams,
        sourceType: 'DNSValidation'
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params)).not.toThrow();
    });
  });

  describe('Invalid sourceType values - Not part of sequential pipeline', () => {
    it('should reject file_upload (external input not supported)', () => {
      const params = {
        ...validBaseParams,
        sourceType: 'file_upload'
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params)).toThrow(z.ZodError);
    });

    it('should reject user_provided (external input not supported)', () => {
      const params = {
        ...validBaseParams,
        sourceType: 'user_provided'
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params)).toThrow(z.ZodError);
    });

    it('should reject ai_generated (external input not supported)', () => {
      const params = {
        ...validBaseParams,
        sourceType: 'ai_generated'
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params)).toThrow(z.ZodError);
    });

    it('should reject arbitrary string values', () => {
      const params = {
        ...validBaseParams,
        sourceType: 'invalid_source_type'
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params)).toThrow(z.ZodError);
    });

    it('should reject missing sourceType', () => {
      const params = {
        ...validBaseParams
        // sourceType is missing
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params)).toThrow(z.ZodError);
    });

    it('should reject snake_case versions', () => {
      const params1 = {
        ...validBaseParams,
        sourceType: 'domain_generation' // Should be PascalCase
      };

      const params2 = {
        ...validBaseParams,
        sourceType: 'dns_validation' // Should be PascalCase
      };

      expect(() => hTTPKeywordCampaignParamsSchema.parse(params1)).toThrow(z.ZodError);
      expect(() => hTTPKeywordCampaignParamsSchema.parse(params2)).toThrow(z.ZodError);
    });
  });

  describe('TypeScript type checking - Sequential Pipeline', () => {
    it('should enforce HTTPKeywordSourceType enum at compile time', () => {
      // This test demonstrates TypeScript compile-time checking
      const validValues: HTTPKeywordSourceType[] = [
        'DomainGeneration',
        'DNSValidation'
      ];

      // TypeScript will prevent invalid values at compile time
      // const invalidValue: HTTPKeywordSourceType = 'file_upload'; // This would cause a TypeScript error

      expect(validValues).toHaveLength(2);
    });
  });

  describe('Sequential Pipeline Documentation', () => {
    it('should document the sequential pipeline flow', () => {
      // This test serves as documentation for the sequential pipeline
      const pipelineFlow = {
        step1: 'Domain Generation Campaign',
        step2: 'DNS Validation Campaign (sources from Domain Generation)',
        step3: 'HTTP Keyword Campaign (sources from DNS Validation)',
        
        httpSourceTypes: {
          DomainGeneration: 'HTTP campaign sources directly from domain generation output',
          DNSValidation: 'HTTP campaign sources from DNS validation results'
        },
        
        notSupported: [
          'file_upload - No external file inputs allowed',
          'user_provided - No manual domain entry allowed', 
          'ai_generated - No AI-generated inputs allowed'
        ]
      };

      expect(pipelineFlow.httpSourceTypes).toHaveProperty('DomainGeneration');
      expect(pipelineFlow.httpSourceTypes).toHaveProperty('DNSValidation');
      expect(pipelineFlow.notSupported).toHaveLength(3);
    });
  });
});