/**
 * Tests for Case Transformation Utilities
 */

import {
  snakeToCamel,
  camelToSnake,
  snakeToCamelKeys,
  camelToSnakeKeys,
  transformApiResponse,
  transformApiRequest,
  transformSpecificFields,
  createEntityTransformer,
  FIELD_MAPPING_OVERRIDES,
  REVERSE_FIELD_MAPPING_OVERRIDES
} from '../case-transformations';

describe('Case Transformation Utilities', () => {
  describe('snakeToCamel', () => {
    it('should convert snake_case to camelCase', () => {
      expect(snakeToCamel('user_id')).toBe('userId');
      expect(snakeToCamel('created_at')).toBe('createdAt');
      expect(snakeToCamel('is_active')).toBe('isActive');
      expect(snakeToCamel('failed_login_attempts')).toBe('failedLoginAttempts');
    });

    it('should handle strings without underscores', () => {
      expect(snakeToCamel('userid')).toBe('userid');
      expect(snakeToCamel('name')).toBe('name');
    });

    it('should handle empty strings', () => {
      expect(snakeToCamel('')).toBe('');
    });
  });

  describe('camelToSnake', () => {
    it('should convert camelCase to snake_case', () => {
      expect(camelToSnake('userId')).toBe('user_id');
      expect(camelToSnake('createdAt')).toBe('created_at');
      expect(camelToSnake('isActive')).toBe('is_active');
      expect(camelToSnake('failedLoginAttempts')).toBe('failed_login_attempts');
    });

    it('should handle strings without capital letters', () => {
      expect(camelToSnake('userid')).toBe('userid');
      expect(camelToSnake('name')).toBe('name');
    });

    it('should handle empty strings', () => {
      expect(camelToSnake('')).toBe('');
    });
  });

  describe('snakeToCamelKeys', () => {
    it('should transform object keys from snake_case to camelCase', () => {
      const input = {
        user_id: '123',
        created_at: '2025-01-01',
        is_active: true,
        profile_data: {
          first_name: 'John',
          last_name: 'Doe'
        }
      };

      const expected = {
        userId: '123',
        createdAt: '2025-01-01',
        isActive: true,
        profileData: {
          firstName: 'John',
          lastName: 'Doe'
        }
      };

      expect(snakeToCamelKeys(input)).toEqual(expected);
    });

    it('should handle arrays', () => {
      const input = [
        { user_id: '1', is_active: true },
        { user_id: '2', is_active: false }
      ];

      const expected = [
        { userId: '1', isActive: true },
        { userId: '2', isActive: false }
      ];

      expect(snakeToCamelKeys(input)).toEqual(expected);
    });

    it('should handle null and undefined', () => {
      expect(snakeToCamelKeys(null)).toBeNull();
      expect(snakeToCamelKeys(undefined)).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(snakeToCamelKeys('string')).toBe('string');
      expect(snakeToCamelKeys(123)).toBe(123);
      expect(snakeToCamelKeys(true)).toBe(true);
    });
  });

  describe('camelToSnakeKeys', () => {
    it('should transform object keys from camelCase to snake_case', () => {
      const input = {
        userId: '123',
        createdAt: '2025-01-01',
        isActive: true,
        profileData: {
          firstName: 'John',
          lastName: 'Doe'
        }
      };

      const expected = {
        user_id: '123',
        created_at: '2025-01-01',
        is_active: true,
        profile_data: {
          first_name: 'John',
          last_name: 'Doe'
        }
      };

      expect(camelToSnakeKeys(input)).toEqual(expected);
    });

    it('should handle arrays', () => {
      const input = [
        { userId: '1', isActive: true },
        { userId: '2', isActive: false }
      ];

      const expected = [
        { user_id: '1', is_active: true },
        { user_id: '2', is_active: false }
      ];

      expect(camelToSnakeKeys(input)).toEqual(expected);
    });
  });

  describe('transformApiResponse', () => {
    it('should use field mapping overrides for special cases', () => {
      const apiResponse = {
        user_id: '123',
        campaign_id: '456',
        created_at: '2025-01-01',
        is_enabled: true,
        total_items: 100,
        last_login_ip: '192.168.1.1',
        mfa_enabled: false,
        config_details: {
          persona_type: 'dns',
          last_checked_at: '2025-01-01'
        }
      };

      const transformed = transformApiResponse(apiResponse);

      expect(transformed).toEqual({
        userId: '123',
        campaignId: '456',
        createdAt: '2025-01-01',
        isEnabled: true,
        totalItems: 100,
        lastLoginIp: '192.168.1.1',
        mfaEnabled: false,
        configDetails: {
          personaType: 'dns',
          lastCheckedAt: '2025-01-01'
        }
      });
    });

    it('should handle campaign with nested params', () => {
      const campaign = {
        id: 'uuid-123',
        campaign_type: 'domain_generation',
        total_items: 1000,
        processed_items: 500,
        successful_items: 450,
        failed_items: 50,
        domain_generation_params: {
          pattern_type: 'alphanumeric',
          total_possible_combinations: 1000000,
          current_offset: 500
        }
      };

      const transformed = transformApiResponse(campaign);

      expect(transformed).toEqual({
        id: 'uuid-123',
        campaignType: 'domain_generation',
        totalItems: 1000,
        processedItems: 500,
        successfulItems: 450,
        failedItems: 50,
        domainGenerationParams: {
          patternType: 'alphanumeric',
          totalPossibleCombinations: 1000000,
          currentOffset: 500
        }
      });
    });
  });

  describe('transformApiRequest', () => {
    it('should use reverse field mapping for request transformation', () => {
      const frontendData = {
        userId: '123',
        campaignId: '456',
        createdAt: '2025-01-01',
        isEnabled: true,
        totalItems: 100,
        lastLoginIp: '192.168.1.1',
        mfaEnabled: false,
        configDetails: {
          personaType: 'dns',
          lastCheckedAt: '2025-01-01'
        }
      };

      const transformed = transformApiRequest(frontendData);

      expect(transformed).toEqual({
        user_id: '123',
        campaign_id: '456',
        created_at: '2025-01-01',
        is_enabled: true,
        total_items: 100,
        last_login_ip: '192.168.1.1',
        mfa_enabled: false,
        config_details: {
          persona_type: 'dns',
          last_checked_at: '2025-01-01'
        }
      });
    });
  });

  describe('transformSpecificFields', () => {
    it('should transform only specified fields', () => {
      const obj = {
        name: 'John Doe',
        age: 30,
        score: 95.5,
        isActive: true
      };

      const result = transformSpecificFields(
        obj,
        ['age', 'score'],
        (value: unknown) => (value as number) * 2
      );

      expect(result).toEqual({
        name: 'John Doe',
        age: 60,
        score: 191,
        isActive: true
      });
    });

    it('should skip undefined fields', () => {
      const obj = {
        name: 'John Doe',
        age: undefined,
        score: 95.5
      };

      const result = transformSpecificFields(
        obj,
        ['age', 'score'],
        (value: unknown) => (value as number) * 2
      );

      expect(result).toEqual({
        name: 'John Doe',
        age: undefined,
        score: 191
      });
    });
  });

  describe('createEntityTransformer', () => {
    it('should create bidirectional transformers', () => {
      interface BackendUser {
        user_id: string;
        first_name: string;
        is_active: boolean;
      }

      interface FrontendUser {
        userId: string;
        firstName: string;
        isActive: boolean;
      }

      const userTransformer = createEntityTransformer<BackendUser, FrontendUser>(
        (backend) => ({
          userId: backend.user_id,
          firstName: backend.first_name,
          isActive: backend.is_active
        }),
        (frontend) => ({
          user_id: frontend.userId,
          first_name: frontend.firstName,
          is_active: frontend.isActive
        })
      );

      const backendUser: BackendUser = {
        user_id: '123',
        first_name: 'John',
        is_active: true
      };

      const frontendUser = userTransformer.toFrontend(backendUser);
      expect(frontendUser).toEqual({
        userId: '123',
        firstName: 'John',
        isActive: true
      });

      const backAgain = userTransformer.toBackend(frontendUser);
      expect(backAgain).toEqual(backendUser);
    });

    it('should transform arrays', () => {
      const transformer = createEntityTransformer<{ id: number }, { id: string }>(
        (backend) => ({ id: String(backend.id) }),
        (frontend) => ({ id: Number(frontend.id) })
      );

      const backendArray = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const frontendArray = transformer.transformArray.toFrontend(backendArray);
      
      expect(frontendArray).toEqual([
        { id: '1' },
        { id: '2' },
        { id: '3' }
      ]);
    });
  });

  describe('Field Mapping Overrides', () => {
    it('should have complete bidirectional mappings', () => {
      // Every field in FIELD_MAPPING_OVERRIDES should have a reverse mapping
      for (const [snake, camel] of Object.entries(FIELD_MAPPING_OVERRIDES)) {
        expect(REVERSE_FIELD_MAPPING_OVERRIDES[camel]).toBe(snake);
      }

      // Every field in REVERSE_FIELD_MAPPING_OVERRIDES should have a forward mapping
      for (const [camel, snake] of Object.entries(REVERSE_FIELD_MAPPING_OVERRIDES)) {
        expect(FIELD_MAPPING_OVERRIDES[snake]).toBe(camel);
      }
    });

    it('should include all common timestamp fields', () => {
      const timestampFields = [
        'created_at',
        'updated_at',
        'started_at',
        'completed_at',
        'last_login_at',
        'last_checked_at',
        'validated_at',
        'generated_at',
        'password_changed_at',
        'locked_until',
        'estimated_completion_at',
        'last_heartbeat_at',
        'mfa_last_used_at'
      ];

      for (const field of timestampFields) {
        expect(FIELD_MAPPING_OVERRIDES[field]).toBeDefined();
        expect(FIELD_MAPPING_OVERRIDES[field]).toBe(snakeToCamel(field));
      }
    });

    it('should include all common boolean fields', () => {
      const booleanFields = [
        'is_active',
        'is_enabled',
        'is_healthy',
        'is_locked',
        'is_valid',
        'email_verified',
        'mfa_enabled',
        'must_change_password'
      ];

      for (const field of booleanFields) {
        expect(FIELD_MAPPING_OVERRIDES[field]).toBeDefined();
        expect(FIELD_MAPPING_OVERRIDES[field]).toBe(snakeToCamel(field));
      }
    });

    it('should include all ID fields', () => {
      const idFields = [
        'user_id',
        'campaign_id',
        'persona_id',
        'proxy_id',
        'source_campaign_id',
        'keyword_set_id',
        'dns_result_id',
        'http_keyword_campaign_id',
        'generation_campaign_id',
        'dns_campaign_id',
        'generated_domain_id',
        'validated_by_persona_id',
        'request_id'
      ];

      for (const field of idFields) {
        expect(FIELD_MAPPING_OVERRIDES[field]).toBeDefined();
        expect(FIELD_MAPPING_OVERRIDES[field]).toBe(snakeToCamel(field));
      }
    });
  });
});