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
  Validator,
  ValidationResult
} from '../../validation/runtime-validators';

describe('API Client Wrapper Validation', () => {
  describe('validateApiResponse', () => {
    it('should validate successful API responses with UUID', () => {
      const mockResponse = {
        data: '123e4567-e89b-12d3-a456-426614174000',
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as never;

      // Create a proper validator that returns ValidationResult
      const uuidValidator: Validator<string> = (value: unknown): ValidationResult<string> => {
        const result = validateUUID(value);
        if (result.isValid && result.data) {
          return {
            isValid: true,
            data: result.data.toString(),
            errors: []
          };
        }
        return result as ValidationResult<string>;
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
      } as never;

      const uuidValidator: Validator<string> = (value: unknown): ValidationResult<string> => {
        const result = validateUUID(value);
        if (result.isValid && result.data) {
          return {
            isValid: true,
            data: result.data.toString(),
            errors: []
          };
        }
        return result as ValidationResult<string>;
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
      } as never;

      const emailValidator: Validator<string> = (value: unknown): ValidationResult<string> => {
        const result = validateEmail(value);
        if (result.isValid && result.data) {
          return {
            isValid: true,
            data: result.data.toString(),
            errors: []
          };
        }
        return result as ValidationResult<string>;
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
      } as never;

      const safeBigIntValidator: Validator<string> = (value: unknown): ValidationResult<string> => {
        const result = validateSafeBigInt(value);
        if (result.isValid && result.data) {
          return {
            isValid: true,
            data: result.data.toString(),
            errors: []
          };
        }
        return {
          isValid: false,
          errors: result.errors
        };
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

      const requestValidator: Validator<typeof requestData> = (value: unknown): ValidationResult<typeof requestData> => {
        if (typeof value !== 'object' || value === null) {
          return {
            isValid: false,
            errors: [{ field: 'root', message: 'Must be an object' }]
          };
        }
        const obj = value as Record<string, unknown>;
        
        const emailResult = validateEmail(obj.email);
        const uuidResult = validateUUID(obj.id);
        
        if (emailResult.isValid && uuidResult.isValid && emailResult.data && uuidResult.data) {
          return {
            isValid: true,
            data: {
              email: emailResult.data.toString(),
              id: uuidResult.data.toString()
            },
            errors: []
          };
        }
        
        return {
          isValid: false,
          errors: [
            ...emailResult.errors,
            ...uuidResult.errors
          ]
        };
      };

      const result = validateApiRequest(requestData, requestValidator, 'user data');
      expect(result).toEqual(requestData);
    });

    it('should reject invalid request data', () => {
      const invalidRequestData = {
        email: 'invalid-email',
        id: 'invalid-uuid'
      };

      const requestValidator: Validator<object> = (value: unknown): ValidationResult<object> => {
        if (typeof value !== 'object' || value === null) {
          return {
            isValid: false,
            errors: [{ field: 'root', message: 'Must be an object' }]
          };
        }
        const obj = value as Record<string, unknown>;
        
        const emailResult = validateEmail(obj.email);
        const uuidResult = validateUUID(obj.id);
        
        if (!emailResult.isValid || !uuidResult.isValid) {
          return {
            isValid: false,
            errors: [
              ...emailResult.errors,
              ...uuidResult.errors
            ]
          };
        }
        
        return {
          isValid: true,
          data: obj,
          errors: []
        };
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

      const requestValidator: Validator<object> = (): ValidationResult<object> => ({
        isValid: true,
        data: {},
        errors: []
      });
      
      const responseValidator: Validator<object> = (value: unknown): ValidationResult<object> => {
        if (typeof value !== 'object' || value === null) {
          return {
            isValid: false,
            errors: [{ field: 'root', message: 'Must be an object' }]
          };
        }
        const obj = value as Record<string, unknown>;
        
        const emailResult = validateEmail(obj.email);
        const uuidResult = validateUUID(obj.id);
        
        if (emailResult.isValid && uuidResult.isValid && emailResult.data && uuidResult.data) {
          return {
            isValid: true,
            data: {
              id: uuidResult.data.toString(),
              email: emailResult.data.toString()
            },
            errors: []
          };
        }
        
        return {
          isValid: false,
          errors: [
            ...emailResult.errors,
            ...uuidResult.errors
          ]
        };
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

      const requestValidator: Validator<object> = (): ValidationResult<object> => ({
        isValid: true,
        data: {},
        errors: []
      });
      
      const responseValidator: Validator<object> = (value: unknown): ValidationResult<object> => {
        if (typeof value !== 'object' || value === null) {
          return {
            isValid: false,
            errors: [{ field: 'root', message: 'Must be an object' }]
          };
        }
        const obj = value as Record<string, unknown>;
        
        const emailResult = validateEmail(obj.email);
        const uuidResult = validateUUID(obj.id);
        
        if (!emailResult.isValid || !uuidResult.isValid) {
          return {
            isValid: false,
            errors: [
              ...emailResult.errors,
              ...uuidResult.errors
            ]
          };
        }
        
        return {
          isValid: true,
          data: obj,
          errors: []
        };
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
      } as never;

      const campaignValidator: Validator<object> = (value: unknown): ValidationResult<object> => {
        if (typeof value !== 'object' || value === null) {
          return {
            isValid: false,
            errors: [{ field: 'root', message: 'Must be an object' }]
          };
        }
        const campaign = value as Record<string, unknown>;
        
        const uuidResult = validateUUID(campaign.id);
        const bigIntResult = validateSafeBigInt(campaign.maxResults);
        
        const isValid = (
          uuidResult.isValid &&
          typeof campaign.name === 'string' && campaign.name.length > 0 &&
          ['active', 'paused', 'completed', 'cancelled'].includes(campaign.status as string) &&
          bigIntResult.isValid &&
          typeof campaign.createdAt === 'string'
        );

        if (isValid && uuidResult.data && bigIntResult.data) {
          return {
            isValid: true,
            data: {
              ...campaign,
              id: uuidResult.data.toString(),
              maxResults: bigIntResult.data.toString()
            },
            errors: []
          };
        }

        return {
          isValid: false,
          errors: [
            ...uuidResult.errors,
            ...bigIntResult.errors
          ]
        };
      };

      const result = validateApiResponse(
        mockCampaignResponse, 
        campaignValidator, 
        'campaign data'
      );

      expect(result).toEqual(expect.objectContaining({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Campaign'
      }));
    });

    it('should handle null responses appropriately', () => {
      const mockNullResponse = {
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as never;

      const nullValidator: Validator<null> = (value: unknown): ValidationResult<null> => {
        if (value === null) {
          return {
            isValid: true,
            data: null,
            errors: []
          };
        }
        return {
          isValid: false,
          errors: [{ field: 'root', message: 'Expected null' }]
        };
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
      } as never;

      const emptyObjectValidator: Validator<Record<string, never>> = (value: unknown): ValidationResult<Record<string, never>> => {
        if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
          return {
            isValid: true,
            data: {} as Record<string, never>,
            errors: []
          };
        }
        return {
          isValid: false,
          errors: [{ field: 'root', message: 'Expected empty object' }]
        };
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
      } as never;

      const strictValidator: Validator<object> = (): ValidationResult<object> => ({
        isValid: false,
        errors: [{ field: 'test', message: 'Always fails' }]
      });

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
      } as never;

      const optimizedValidator: Validator<unknown[]> = (value: unknown): ValidationResult<unknown[]> => {
        if (!Array.isArray(value)) {
          return {
            isValid: false,
            errors: [{ field: 'root', message: 'Expected array' }]
          };
        }
        
        // For performance, only validate structure of first few items
        const sampleSize = Math.min(value.length, 10);
        const samples = value.slice(0, sampleSize);
        
        const isValid = samples.every((item: unknown) => 
          typeof item === 'object' && item !== null &&
          typeof (item as Record<string, unknown>).id === 'string' &&
          typeof (item as Record<string, unknown>).name === 'string' &&
          typeof (item as Record<string, unknown>).value === 'number'
        );

        return {
          isValid,
          data: isValid ? value : undefined,
          errors: isValid ? [] : [{ field: 'array', message: 'Invalid array structure' }]
        };
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
