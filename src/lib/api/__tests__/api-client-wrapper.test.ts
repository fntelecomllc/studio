// src/lib/api/__tests__/api-client-wrapper.test.ts
// Tests for API client validation wrapper

import { 
  validateApiResponse, 
  validateApiRequest,
  ApiValidationError,
  createValidatedApiMethod 
} from '../api-client-wrapper';
import { 
  validateUUID, 
  validateEmail,
  validateSafeBigInt,
  Validator
} from '../../utils/runtime-validators';

describe('API Client Wrapper Validation', () => {
  describe('validateApiResponse', () => {
    it('should validate successful API responses with UUID', () => {
      const mockResponse = {
        data: '123e4567-e89b-12d3-a456-426614174000',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      // Create a proper type guard validator
      const uuidValidator: Validator<string> = (value: unknown): value is string => {
        return typeof value === 'string' && validateUUID(value);
      };

      const result = validateApiResponse(mockResponse, uuidValidator, 'UUID validation');
      expect(result).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should throw ApiValidationError for invalid UUIDs', () => {
      const mockResponse = {
        data: 'invalid-uuid',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const uuidValidator: Validator<string> = (value: unknown): value is string => {
        return typeof value === 'string' && validateUUID(value);
      };

      expect(() => {
        validateApiResponse(mockResponse, uuidValidator, 'UUID validation');
      }).toThrow(ApiValidationError);
    });

    it('should validate email responses', () => {
      const mockResponse = {
        data: 'test@example.com',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const emailValidator: Validator<string> = (value: unknown): value is string => {
        return typeof value === 'string' && validateEmail(value);
      };

      const result = validateApiResponse(mockResponse, emailValidator, 'email validation');
      expect(result).toBe('test@example.com');
    });

    it('should validate SafeBigInt responses', () => {
      const mockResponse = {
        data: '12345',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const safeBigIntValidator: Validator<string> = (value: unknown): value is string => {
        return validateSafeBigInt(value);
      };

      const result = validateApiResponse(mockResponse, safeBigIntValidator, 'SafeBigInt validation');
      expect(result).toBe('12345');
    });
  });

  describe('validateApiRequest', () => {
    it('should validate valid request data', () => {
      const requestData = {
        email: 'test@example.com',
        id: '123e4567-e89b-12d3-a456-426614174000'
      };

      const requestValidator: Validator<typeof requestData> = (value: unknown): value is typeof requestData => {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as any;
        return typeof obj.email === 'string' && validateEmail(obj.email) &&
               typeof obj.id === 'string' && validateUUID(obj.id);
      };

      const result = validateApiRequest(requestData, requestValidator, 'user data');
      expect(result).toEqual(requestData);
    });

    it('should reject invalid request data', () => {
      const invalidRequestData = {
        email: 'invalid-email',
        id: 'invalid-uuid'
      };

      const requestValidator: Validator<any> = (value: unknown): value is any => {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as any;
        return typeof obj.email === 'string' && validateEmail(obj.email) &&
               typeof obj.id === 'string' && validateUUID(obj.id);
      };

      expect(() => {
        validateApiRequest(invalidRequestData, requestValidator, 'user data');
      }).toThrow('API request validation failed for user data');
    });
  });

  describe('createValidatedApiMethod', () => {
    it('should create validated API method with proper validation', async () => {
      const mockApiMethod = jest.fn().mockResolvedValue({
        data: { 
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });

      const requestValidator: Validator<any> = (value: unknown): value is any => true; // Accept any request
      const responseValidator: Validator<any> = (value: unknown): value is any => {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as any;
        return typeof obj.id === 'string' && validateUUID(obj.id) &&
               typeof obj.email === 'string' && validateEmail(obj.email);
      };

      const validatedMethod = createValidatedApiMethod(
        mockApiMethod,
        requestValidator,
        responseValidator,
        'test API'
      );

      const result = await validatedMethod({ id: 'test' });

      expect(mockApiMethod).toHaveBeenCalledWith({ id: 'test' });
      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com'
      });
    });

    it('should reject invalid responses', async () => {
      const mockApiMethod = jest.fn().mockResolvedValue({
        data: { 
          id: 'invalid-uuid',
          email: 'invalid-email'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      });

      const requestValidator: Validator<any> = (value: unknown): value is any => true;
      const responseValidator: Validator<any> = (value: unknown): value is any => {
        if (typeof value !== 'object' || value === null) return false;
        const obj = value as any;
        return typeof obj.id === 'string' && validateUUID(obj.id) &&
               typeof obj.email === 'string' && validateEmail(obj.email);
      };

      const validatedMethod = createValidatedApiMethod(
        mockApiMethod,
        requestValidator,
        responseValidator,
        'test API'
      );

      await expect(validatedMethod({ id: 'test' })).rejects.toThrow(ApiValidationError);
    });
  });

  describe('Real-world Validation Scenarios', () => {
    it('should validate campaign data structure', () => {
      const mockCampaignResponse = {
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test Campaign',
          status: 'active',
          maxResults: '1000',
          createdAt: '2024-01-01T00:00:00Z'
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const campaignValidator: Validator<any> = (value: unknown): value is any => {
        if (typeof value !== 'object' || value === null) return false;
        const campaign = value as any;
        
        return (
          typeof campaign.id === 'string' && validateUUID(campaign.id) &&
          typeof campaign.name === 'string' && campaign.name.length > 0 &&
          ['active', 'paused', 'completed', 'cancelled'].includes(campaign.status) &&
          validateSafeBigInt(campaign.maxResults) &&
          typeof campaign.createdAt === 'string'
        );
      };

      const result = validateApiResponse(
        mockCampaignResponse, 
        campaignValidator, 
        'campaign data'
      );

      expect(result).toEqual(mockCampaignResponse.data);
    });

    it('should validate user management data', () => {
      const mockUserResponse = {
        data: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'admin@example.com',
          name: 'Admin User',
          roles: ['admin', 'user'],
          permissions: ['campaigns:read', 'campaigns:write'],
          isActive: true
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const userValidator: Validator<any> = (value: unknown): value is any => {
        if (typeof value !== 'object' || value === null) return false;
        const user = value as any;
        
        return (
          typeof user.id === 'string' && validateUUID(user.id) &&
          typeof user.email === 'string' && validateEmail(user.email) &&
          typeof user.name === 'string' && user.name.length > 0 &&
          Array.isArray(user.roles) &&
          Array.isArray(user.permissions) &&
          typeof user.isActive === 'boolean'
        );
      };

      const result = validateApiResponse(
        mockUserResponse, 
        userValidator, 
        'user data'
      );

      expect(result).toEqual(mockUserResponse.data);
    });

    it('should validate array responses', () => {
      const mockArrayResponse = {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Item 1',
            count: '100'
          },
          {
            id: '123e4567-e89b-12d3-a456-426614174001', 
            name: 'Item 2',
            count: '200'
          }
        ],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const arrayValidator: Validator<any[]> = (value: unknown): value is any[] => {
        if (!Array.isArray(value)) return false;
        
        return value.every((item: any) => 
          typeof item === 'object' && item !== null &&
          typeof item.id === 'string' && validateUUID(item.id) &&
          typeof item.name === 'string' && item.name.length > 0 &&
          validateSafeBigInt(item.count)
        );
      };

      const result = validateApiResponse(
        mockArrayResponse, 
        arrayValidator, 
        'array data'
      );

      expect(result).toEqual(mockArrayResponse.data);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null responses appropriately', () => {
      const mockNullResponse = {
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const nullValidator: Validator<null> = (value: unknown): value is null => {
        return value === null;
      };

      const result = validateApiResponse(mockNullResponse, nullValidator, 'null response');
      expect(result).toBeNull();
    });

    it('should handle empty object responses', () => {
      const mockEmptyResponse = {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const emptyObjectValidator: Validator<{}> = (value: unknown): value is {} => {
        return typeof value === 'object' && value !== null && Object.keys(value).length === 0;
      };

      const result = validateApiResponse(mockEmptyResponse, emptyObjectValidator, 'empty object');
      expect(result).toEqual({});
    });

    it('should handle validation errors with proper error messages', () => {
      const mockResponse = {
        data: { invalid: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const strictValidator: Validator<any> = (value: unknown): value is any => false;

      try {
        validateApiResponse(mockResponse, strictValidator, 'strict validation');
        fail('Should have thrown ApiValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiValidationError);
        expect((error as ApiValidationError).message).toContain('strict validation');
        expect((error as ApiValidationError).originalResponse).toEqual({ invalid: 'data' });
      }
    });
  });

  describe('Performance Tests', () => {
    it('should handle large response validation efficiently', () => {
      // Create large dataset
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${String(i).padStart(4, '0')}`,
        name: `Item ${i}`,
        value: i
      }));

      const mockLargeResponse = {
        data: largeData,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as any;

      const optimizedValidator: Validator<any[]> = (value: unknown): value is any[] => {
        if (!Array.isArray(value)) return false;
        
        // For performance, only validate structure of first few items
        const sampleSize = Math.min(value.length, 10);
        const samples = value.slice(0, sampleSize);
        
        return samples.every((item: any) => 
          typeof item === 'object' && item !== null &&
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.value === 'number'
        );
      };

      const startTime = Date.now();
      const result = validateApiResponse(
        mockLargeResponse, 
        optimizedValidator, 
        'large dataset'
      );
      const endTime = Date.now();

      expect(result).toEqual(largeData);
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast
    });
  });
});
