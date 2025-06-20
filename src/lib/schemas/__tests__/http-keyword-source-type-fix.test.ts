import { describe, it, expect } from '@jest/globals';
import { unifiedCreateCampaignRequestSchema } from '../unifiedCampaignSchema';

describe('HTTP Keyword Campaign sourceType Field', () => {
  it('should require sourceType field in HTTP keyword campaigns', () => {
    const validPayload = {
      campaignType: 'http_keyword_validation',
      name: 'Test HTTP Campaign',
      httpKeywordParams: {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'DomainGeneration', // PascalCase as required by backend
        keywordSetIds: ['123e4567-e89b-12d3-a456-426614174001'],
        personaIds: ['123e4567-e89b-12d3-a456-426614174002']
      }
    };

    const result = unifiedCreateCampaignRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should reject HTTP keyword campaigns without sourceType', () => {
    const invalidPayload = {
      campaignType: 'http_keyword_validation',
      name: 'Test HTTP Campaign',
      httpKeywordParams: {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        // sourceType missing
        keywordSetIds: ['123e4567-e89b-12d3-a456-426614174001'],
        personaIds: ['123e4567-e89b-12d3-a456-426614174002']
      }
    };

    const result = unifiedCreateCampaignRequestSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain('sourceType');
    }
  });

  it('should only accept PascalCase sourceType values', () => {
    const invalidSnakeCasePayload = {
      campaignType: 'http_keyword_validation',
      name: 'Test HTTP Campaign',
      httpKeywordParams: {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'domain_generation', // snake_case - should be rejected
        keywordSetIds: ['123e4567-e89b-12d3-a456-426614174001'],
        personaIds: ['123e4567-e89b-12d3-a456-426614174002']
      }
    };

    const result = unifiedCreateCampaignRequestSchema.safeParse(invalidSnakeCasePayload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('invalid_enum_value');
    }
  });

  it('should accept both valid PascalCase sourceType values', () => {
    const domainGenerationPayload = {
      campaignType: 'http_keyword_validation',
      name: 'Test HTTP Campaign - Domain Generation',
      httpKeywordParams: {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'DomainGeneration',
        keywordSetIds: ['123e4567-e89b-12d3-a456-426614174001'],
        personaIds: ['123e4567-e89b-12d3-a456-426614174002']
      }
    };

    const dnsValidationPayload = {
      campaignType: 'http_keyword_validation',
      name: 'Test HTTP Campaign - DNS Validation',
      httpKeywordParams: {
        sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
        sourceType: 'DNSValidation',
        keywordSetIds: ['123e4567-e89b-12d3-a456-426614174001'],
        personaIds: ['123e4567-e89b-12d3-a456-426614174002']
      }
    };

    const result1 = unifiedCreateCampaignRequestSchema.safeParse(domainGenerationPayload);
    const result2 = unifiedCreateCampaignRequestSchema.safeParse(dnsValidationPayload);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    
    if (result1.success) {
      expect(result1.data.httpKeywordParams?.sourceType).toBe('DomainGeneration');
    }
    if (result2.success) {
      expect(result2.data.httpKeywordParams?.sourceType).toBe('DNSValidation');
    }
  });
});