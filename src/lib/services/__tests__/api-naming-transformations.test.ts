/**
 * Integration tests for API naming convention transformations
 * Part of M-003: Fix Naming Convention Mismatches
 */

import { transformApiResponse, transformApiRequest } from '../../utils/case-transformations';

describe('API Naming Transformations', () => {
  describe('Campaign Entity Transformations', () => {
    it('should transform campaign response from snake_case to camelCase', () => {
      const backendResponse = {
        id: 'uuid-123',
        name: 'Test Campaign',
        campaign_type: 'domain_generation',
        status: 'running',
        user_id: 'user-uuid-456',
        total_items: 1000,
        processed_items: 500,
        successful_items: 450,
        failed_items: 50,
        progress_percentage: 50.0,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T12:00:00Z',
        started_at: '2025-01-01T01:00:00Z',
        completed_at: null,
        error_message: null,
        domain_generation_params: {
          pattern_type: 'alphanumeric',
          total_possible_combinations: 1000000,
          current_offset: 500,
          variable_length: 8,
          character_set: 'abcdefghijklmnopqrstuvwxyz0123456789'
        },
        metadata: {
          source: 'api',
          version: '2.0'
        }
      };

      const transformed = transformApiResponse(backendResponse);

      expect(transformed).toEqual({
        id: 'uuid-123',
        name: 'Test Campaign',
        campaignType: 'domain_generation',
        status: 'running',
        userId: 'user-uuid-456',
        totalItems: 1000,
        processedItems: 500,
        successfulItems: 450,
        failedItems: 50,
        progressPercentage: 50.0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T12:00:00Z',
        startedAt: '2025-01-01T01:00:00Z',
        completedAt: null,
        errorMessage: null,
        domainGenerationParams: {
          patternType: 'alphanumeric',
          totalPossibleCombinations: 1000000,
          currentOffset: 500,
          variableLength: 8,
          characterSet: 'abcdefghijklmnopqrstuvwxyz0123456789'
        },
        metadata: {
          source: 'api',
          version: '2.0'
        }
      });
    });

    it('should transform campaign request from camelCase to snake_case', () => {
      const frontendRequest = {
        name: 'New Campaign',
        campaignType: 'domain_generation',
        domainGenerationParams: {
          patternType: 'alphanumeric',
          variableLength: 8,
          characterSet: 'abcdefghijklmnopqrstuvwxyz0123456789',
          numDomainsToGenerate: 1000
        }
      };

      const transformed = transformApiRequest(frontendRequest);

      expect(transformed).toEqual({
        name: 'New Campaign',
        campaign_type: 'domain_generation',
        domain_generation_params: {
          pattern_type: 'alphanumeric',
          variable_length: 8,
          character_set: 'abcdefghijklmnopqrstuvwxyz0123456789',
          num_domains_to_generate: 1000
        }
      });
    });
  });

  describe('User Entity Transformations', () => {
    it('should transform user response from snake_case to camelCase', () => {
      const backendResponse = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        email_verified: true,
        first_name: 'John',
        last_name: 'Doe',
        avatar_url: 'https://example.com/avatar.jpg',
        is_active: true,
        is_locked: false,
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: '2025-01-01T10:00:00Z',
        last_login_ip: '192.168.1.100',
        mfa_enabled: false,
        must_change_password: false,
        password_changed_at: '2024-12-01T00:00:00Z',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const transformed = transformApiResponse(backendResponse);

      expect(transformed).toEqual({
        id: 'user-uuid-123',
        email: 'test@example.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
        avatarUrl: 'https://example.com/avatar.jpg',
        isActive: true,
        isLocked: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: '2025-01-01T10:00:00Z',
        lastLoginIp: '192.168.1.100',
        mfaEnabled: false,
        mustChangePassword: false,
        passwordChangedAt: '2024-12-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      });
    });
  });

  describe('Persona Entity Transformations', () => {
    it('should transform persona response from snake_case to camelCase', () => {
      const backendResponse = {
        id: 'persona-uuid-123',
        name: 'DNS Persona 1',
        description: 'Primary DNS validation persona',
        persona_type: 'dns',
        config_details: {
          dns_servers: ['8.8.8.8', '8.8.4.4'],
          timeout_seconds: 5
        },
        is_enabled: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const transformed = transformApiResponse(backendResponse);

      expect(transformed).toEqual({
        id: 'persona-uuid-123',
        name: 'DNS Persona 1',
        description: 'Primary DNS validation persona',
        personaType: 'dns',
        configDetails: {
          dnsServers: ['8.8.8.8', '8.8.4.4'],
          timeoutSeconds: 5
        },
        isEnabled: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      });
    });
  });

  describe('Proxy Entity Transformations', () => {
    it('should transform proxy response from snake_case to camelCase', () => {
      const backendResponse = {
        id: 'proxy-uuid-123',
        name: 'US Proxy 1',
        description: 'High-speed US proxy',
        address: 'proxy1.example.com:8080',
        protocol: 'http',
        username: 'user123',
        host: 'proxy1.example.com',
        port: 8080,
        is_enabled: true,
        is_healthy: true,
        last_status: 'OK',
        last_checked_at: '2025-01-01T12:00:00Z',
        latency_ms: 45,
        city: 'New York',
        country_code: 'US',
        provider: 'ProxyProvider Inc',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const transformed = transformApiResponse(backendResponse);

      expect(transformed).toEqual({
        id: 'proxy-uuid-123',
        name: 'US Proxy 1',
        description: 'High-speed US proxy',
        address: 'proxy1.example.com:8080',
        protocol: 'http',
        username: 'user123',
        host: 'proxy1.example.com',
        port: 8080,
        isEnabled: true,
        isHealthy: true,
        lastStatus: 'OK',
        lastCheckedAt: '2025-01-01T12:00:00Z',
        latencyMs: 45,
        city: 'New York',
        countryCode: 'US',
        provider: 'ProxyProvider Inc',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      });
    });
  });

  describe('Nested Parameter Transformations', () => {
    it('should handle DNS validation params transformation', () => {
      const backendResponse = {
        id: 'dns-params-uuid',
        campaign_id: 'campaign-uuid',
        dns_servers: ['8.8.8.8', '1.1.1.1'],
        record_types: ['A', 'AAAA'],
        timeout: 5,
        retries: 3,
        batch_size: 100,
        source_campaign_id: 'source-campaign-uuid',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const transformed = transformApiResponse(backendResponse);

      expect(transformed).toEqual({
        id: 'dns-params-uuid',
        campaignId: 'campaign-uuid',
        dnsServers: ['8.8.8.8', '1.1.1.1'],
        recordTypes: ['A', 'AAAA'],
        timeout: 5,
        retries: 3,
        batchSize: 100,
        sourceCampaignId: 'source-campaign-uuid',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      });
    });

    it('should handle HTTP keyword params transformation', () => {
      const backendResponse = {
        id: 'http-params-uuid',
        campaign_id: 'campaign-uuid',
        target_url: 'https://example.com',
        keyword_set_id: 'keywords-uuid',
        source_type: 'DomainGeneration',
        source_campaign_id: 'source-campaign-uuid',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      };

      const transformed = transformApiResponse(backendResponse);

      expect(transformed).toEqual({
        id: 'http-params-uuid',
        campaignId: 'campaign-uuid',
        targetUrl: 'https://example.com',
        keywordSetId: 'keywords-uuid',
        sourceType: 'DomainGeneration',
        sourceCampaignId: 'source-campaign-uuid',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      });
    });
  });

  describe('Array Transformations', () => {
    it('should transform arrays of entities', () => {
      const campaigns = [
        {
          id: 'campaign-1',
          campaign_type: 'domain_generation',
          total_items: 100,
          created_at: '2025-01-01T00:00:00Z'
        },
        {
          id: 'campaign-2',
          campaign_type: 'dns_validation',
          total_items: 200,
          created_at: '2025-01-02T00:00:00Z'
        }
      ];

      const transformed = transformApiResponse(campaigns);

      expect(transformed).toEqual([
        {
          id: 'campaign-1',
          campaignType: 'domain_generation',
          totalItems: 100,
          createdAt: '2025-01-01T00:00:00Z'
        },
        {
          id: 'campaign-2',
          campaignType: 'dns_validation',
          totalItems: 200,
          createdAt: '2025-01-02T00:00:00Z'
        }
      ]);
    });
  });

  describe('WebSocket Message Transformations', () => {
    it('should transform WebSocket campaign progress message', () => {
      const wsMessage = {
        type: 'campaign_progress',
        campaign_id: 'campaign-uuid',
        data: {
          total_items: 10000,
          processed_items: 5000,
          successful_items: 4800,
          failed_items: 200,
          progress_percentage: 50,
          estimated_time_remaining: 300
        }
      };

      const transformed = transformApiResponse(wsMessage);

      expect(transformed).toEqual({
        type: 'campaign_progress',
        campaignId: 'campaign-uuid',
        data: {
          totalItems: 10000,
          processedItems: 5000,
          successfulItems: 4800,
          failedItems: 200,
          progressPercentage: 50,
          estimatedTimeRemaining: 300
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values', () => {
      const data = {
        id: 'test-id',
        nullable_field: null,
        undefined_field: undefined,
        nested_object: {
          inner_null: null,
          inner_value: 'test'
        }
      };

      const transformed = transformApiResponse(data);

      expect(transformed).toEqual({
        id: 'test-id',
        nullableField: null,
        undefinedField: undefined,
        nestedObject: {
          innerNull: null,
          innerValue: 'test'
        }
      });
    });

    it('should handle empty objects and arrays', () => {
      const data = {
        empty_object: {},
        empty_array: [],
        nested_empty: {
          inner_empty_array: []
        }
      };

      const transformed = transformApiResponse(data);

      expect(transformed).toEqual({
        emptyObject: {},
        emptyArray: [],
        nestedEmpty: {
          innerEmptyArray: []
        }
      });
    });

    it('should preserve non-object values', () => {
      expect(transformApiResponse('string')).toBe('string');
      expect(transformApiResponse(123)).toBe(123);
      expect(transformApiResponse(true)).toBe(true);
      expect(transformApiResponse(null)).toBe(null);
    });
  });
});