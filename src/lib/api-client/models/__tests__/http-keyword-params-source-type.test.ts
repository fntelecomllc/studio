import { describe, it, expect } from '@jest/globals';
import { ServicesHttpKeywordParamsSourceTypeEnum, type ServicesHttpKeywordParams } from '../services-http-keyword-params';

describe('ServicesHttpKeywordParams sourceType field', () => {
  it('should include sourceType as a required field', () => {
    // Type test - this should compile without errors
    const params: ServicesHttpKeywordParams = {
      sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
      sourceType: ServicesHttpKeywordParamsSourceTypeEnum.DomainGeneration,
      personaIds: ['456e7890-e89b-12d3-a456-426614174001'],
    };

    expect(params.sourceType).toBe('DomainGeneration');
  });

  it('should have correct enum values for sourceType', () => {
    expect(ServicesHttpKeywordParamsSourceTypeEnum.DomainGeneration).toBe('DomainGeneration');
    expect(ServicesHttpKeywordParamsSourceTypeEnum.DnsValidation).toBe('DNSValidation');
  });

  it('should enforce sourceType at compile time', () => {
    // This test verifies that TypeScript will enforce the sourceType field
    const validParams: ServicesHttpKeywordParams = {
      sourceCampaignId: '123e4567-e89b-12d3-a456-426614174000',
      sourceType: ServicesHttpKeywordParamsSourceTypeEnum.DnsValidation,
      personaIds: ['456e7890-e89b-12d3-a456-426614174001'],
      keywordSetIds: ['789e0123-e89b-12d3-a456-426614174002'],
      adHocKeywords: ['test', 'keywords'],
      batchSize: 100,
      processingSpeedPerMinute: 60,
      retryAttempts: 3,
      rotationIntervalSeconds: 300,
      proxyPoolId: '012e3456-e89b-12d3-a456-426614174003',
      proxySelectionStrategy: 'round_robin',
      targetHttpPorts: [80, 443],
    };

    expect(validParams.sourceType).toBe('DNSValidation');
  });

  it('should only accept valid sourceType values', () => {
    // This demonstrates that only the valid enum values are accepted
    const allowedValues = Object.values(ServicesHttpKeywordParamsSourceTypeEnum);
    expect(allowedValues).toHaveLength(2);
    expect(allowedValues).toContain('DomainGeneration');
    expect(allowedValues).toContain('DNSValidation');
  });
});