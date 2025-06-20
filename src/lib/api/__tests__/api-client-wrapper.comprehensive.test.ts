import { AxiosResponse } from 'axios';
import {
  ApiValidationError,
  validateApiResponse,
  validateApiRequest,
  validateApiCall,
  createValidatedApiMethod,
  handleApiValidationError,
  transformAndValidate,
  validateArrayResponse,
  transformCampaignApiResponse,
  transformCampaignArrayResponse,
  transformUserApiResponse,
  transformGeneratedDomainApiResponse,
  configureAxiosForSafeBigInt,
  RuntimeValidationError
} from '../api-client-wrapper';
import { Validator, ValidationResult } from '../../validation/runtime-validators';

// Mock the validation module
jest.mock('../../validation/runtime-validators', () => ({
  ...jest.requireActual('../../validation/runtime-validators'),
  validateCampaignResponse: jest.fn(),
  validateUserResponse: jest.fn(),
  validateGeneratedDomainResponse: jest.fn()
}));

// Helper function to create a mock validator
function createMockValidator<T>(returnValue: boolean): Validator<T> {
  return jest.fn((value: unknown): ValidationResult<T> => {
    if (returnValue) {
      return { isValid: true, data: value as T, errors: [] };
    }
    return { isValid: false, data: undefined, errors: [{ field: 'test', message: 'validation failed' }] };
  }) as Validator<T>;
}

describe('API Client Wrapper - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ApiValidationError', () => {
    it('should create error with message only', () => {
      const error = new ApiValidationError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ApiValidationError');
      expect(error.originalResponse).toBeUndefined();
      expect(error.validationErrors).toBeUndefined();
    });

    it('should create error with all parameters', () => {
      const originalResponse = { data: 'test' };
      const validationErrors = ['Field 1 invalid', 'Field 2 missing'];
      const error = new ApiValidationError('Test error', originalResponse, validationErrors);
      
      expect(error.message).toBe('Test error');
      expect(error.originalResponse).toEqual(originalResponse);
      expect(error.validationErrors).toEqual(validationErrors);
    });
  });

  describe('validateApiResponse', () => {
    it('should validate successful response', () => {
      const mockResponse: AxiosResponse = {
        data: { id: 1, name: 'Test' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const validator = createMockValidator<{ id: number; name: string }>(true);
      
      const result = validateApiResponse(mockResponse, validator);
      
      expect(validator).toHaveBeenCalledWith({ id: 1, name: 'Test' });
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should throw ApiValidationError on validation failure', () => {
      const mockResponse: AxiosResponse = {
        data: { invalid: 'data' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const validator = createMockValidator(false);
      
      expect(() => validateApiResponse(mockResponse, validator, 'test context'))
        .toThrow('API response validation failed for test context');
    });
  });


  describe('validateApiRequest', () => {
    it('should validate request data', () => {
      const requestData = { username: 'test', password: 'pass' };
      const validator = createMockValidator<typeof requestData>(true);
      
      const result = validateApiRequest(requestData, validator);
      
      expect(validator).toHaveBeenCalledWith(requestData);
      expect(result).toEqual(requestData);
    });

    it('should throw ValidationError on invalid request', () => {
      const requestData = { invalid: 'data' };
      const validator = createMockValidator(false);
      
      expect(() => validateApiRequest(requestData, validator, 'login'))
        .toThrow(ApiValidationError);
    });
  });

  describe('validateApiCall', () => {
    it('should validate request and response', async () => {
      const requestData = { id: 1 };
      const responseData = { success: true };
      const mockApiCall = jest.fn().mockResolvedValue({
        data: responseData,
        status: 200
      } as AxiosResponse);

      const requestValidator = createMockValidator<typeof requestData>(true);
      const responseValidator = createMockValidator<typeof responseData>(true);

      const result = await validateApiCall(
        mockApiCall,
        requestData,
        requestValidator,
        responseValidator,
        'test'
      );

      expect(requestValidator).toHaveBeenCalledWith(requestData);
      expect(mockApiCall).toHaveBeenCalledWith(requestData);
      expect(responseValidator).toHaveBeenCalledWith(responseData);
      expect(result).toEqual(responseData);
    });

    it('should propagate validation errors', async () => {
      const mockApiCall = jest.fn();
      const requestValidator = createMockValidator(false);
      const responseValidator = createMockValidator(true);

      await expect(validateApiCall(
        mockApiCall,
        { invalid: 'request' },
        requestValidator,
        responseValidator,
        'test'
      )).rejects.toThrow(ApiValidationError);

      expect(mockApiCall).not.toHaveBeenCalled();
    });

    it('should wrap other errors with context', async () => {
      const mockApiCall = jest.fn().mockRejectedValue(new Error('Network error'));
      const requestValidator = createMockValidator(true);
      const responseValidator = createMockValidator(true);

      await expect(validateApiCall(
        mockApiCall,
        { id: 1 },
        requestValidator,
        responseValidator,
        'test'
      )).rejects.toThrow('API call failed for test: Error: Network error');
    });
  });

  describe('createValidatedApiMethod', () => {
    it('should create a validated wrapper function', async () => {
      const mockApiMethod = jest.fn().mockResolvedValue({
        data: { result: 'success' },
        status: 200
      } as AxiosResponse);

      const requestValidator = createMockValidator(true);
      const responseValidator = createMockValidator(true);

      const wrappedMethod = createValidatedApiMethod(
        mockApiMethod,
        requestValidator,
        responseValidator,
        'testMethod'
      );

      const result = await wrappedMethod({ input: 'data' });

      expect(result).toEqual({ result: 'success' });
      expect(requestValidator).toHaveBeenCalled();
      expect(responseValidator).toHaveBeenCalled();
    });
  });

  describe('handleApiValidationError', () => {
    it('should handle ApiValidationError', () => {
      const error = new ApiValidationError(
        'Validation failed',
        { data: 'test' },
        ['Field 1 invalid']
      );

      const result = handleApiValidationError(error);

      expect(result).toEqual({
        isValidationError: true,
        message: 'Validation failed',
        details: ['Field 1 invalid']
      });
    });

    it('should handle RuntimeValidationError', () => {
      const error = new RuntimeValidationError('Field validation failed', [{ field: 'username', message: 'invalid' }]);

      const result = handleApiValidationError(error);

      expect(result).toEqual({
        isValidationError: true,
        message: 'Field validation failed',
        details: ['username: invalid']
      });
    });

    it('should handle generic errors', () => {
      const error = new Error('Generic error');

      const result = handleApiValidationError(error);

      expect(result).toEqual({
        isValidationError: false,
        message: 'Generic error'
      });
    });

    it('should handle non-Error objects', () => {
      const result = handleApiValidationError('String error');

      expect(result).toEqual({
        isValidationError: false,
        message: 'Unknown error'
      });
    });
  });

  describe('transformAndValidate', () => {
    it('should transform and validate successfully', () => {
      const input = { id: '123', name: 'Test' };
      const transformer = jest.fn().mockReturnValue({ id: 123, name: 'Test' });
      const validator = createMockValidator(true);

      const result = transformAndValidate(input, transformer, validator, 'test');

      expect(transformer).toHaveBeenCalledWith(input);
      expect(validator).toHaveBeenCalledWith({ id: 123, name: 'Test' });
      expect(result).toEqual({ id: 123, name: 'Test' });
    });

    it('should throw ValidationError on validation failure', () => {
      const transformer = jest.fn().mockReturnValue({ invalid: 'output' });
      const validator = createMockValidator(false);

      expect(() => transformAndValidate(
        { input: 'data' },
        transformer,
        validator,
        'test'
      )).toThrow(ApiValidationError);
    });

    it('should wrap transformation errors', () => {
      const transformer = jest.fn().mockImplementation(() => {
        throw new Error('Transform failed');
      });
      const validator = createMockValidator(true);

      expect(() => transformAndValidate(
        { input: 'data' },
        transformer,
        validator,
        'test'
      )).toThrow(ApiValidationError);
    });
  });

  describe('validateArrayResponse', () => {
    it('should validate array responses', () => {
      const mockResponse: AxiosResponse = {
        data: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' }
        ],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const itemValidator = createMockValidator(true);

      const result = validateArrayResponse(mockResponse, itemValidator);

      expect(itemValidator).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: 1, name: 'Item 1' });
    });

    it('should throw error for non-array response', () => {
      const mockResponse: AxiosResponse = {
        data: { not: 'an array' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const itemValidator = createMockValidator(true);

      expect(() => validateArrayResponse(mockResponse, itemValidator, 'items'))
        .toThrow('Expected array response for items');
    });

    it('should throw error with invalid items', () => {
      const mockResponse: AxiosResponse = {
        data: [
          { id: 1, name: 'Valid' },
          { invalid: 'item' },
          { id: 3, name: 'Valid' }
        ],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      let callCount = 0;
      const itemValidator: Validator<any> = jest.fn((value: unknown): ValidationResult<any> => {
        callCount++;
        if (callCount !== 2) {
          return { isValid: true, data: value, errors: [] };
        }
        return { isValid: false, data: undefined, errors: [{ field: 'item', message: 'invalid' }] };
      });

      expect(() => validateArrayResponse(mockResponse, itemValidator))
        .toThrow(ApiValidationError);
    });
  });

  describe('Transform Response Methods', () => {
    it('should transform campaign response', () => {
      const mockResponse: AxiosResponse = {
        data: { id: '123', name: 'Campaign' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      // Mock the validateCampaignResponse function
      const { validateCampaignResponse } = require('../../validation/runtime-validators');
      validateCampaignResponse.mockReturnValue({
        isValid: true,
        data: { id: '123', name: 'Campaign' },
        errors: []
      });

      const result = transformCampaignApiResponse(mockResponse);

      expect(validateCampaignResponse).toHaveBeenCalledWith({ id: '123', name: 'Campaign' });
      expect(result).toEqual({ id: '123', name: 'Campaign' });
    });

    it('should handle invalid campaign response', () => {
      const mockResponse: AxiosResponse = {
        data: null,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      expect(() => transformCampaignApiResponse(mockResponse))
        .toThrow('Invalid campaign response format');
    });

    it('should transform campaign array response', () => {
      const mockResponse: AxiosResponse = {
        data: [
          { id: '1', name: 'Campaign 1' },
          { id: '2', name: 'Campaign 2' }
        ],
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      // Mock the validateCampaignResponse function
      const { validateCampaignResponse } = require('../../validation/runtime-validators');
      validateCampaignResponse.mockReturnValue({
        isValid: true,
        data: { id: '1', name: 'Campaign 1' },
        errors: []
      });

      const result = transformCampaignArrayResponse(mockResponse);

      expect(result).toHaveLength(2);
      expect(validateCampaignResponse).toHaveBeenCalledTimes(2);
    });

    it('should transform user response', () => {
      const mockResponse: AxiosResponse = {
        data: { id: '1', email: 'test@example.com' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      // Mock the validateUserResponse function
      const { validateUserResponse } = require('../../validation/runtime-validators');
      validateUserResponse.mockReturnValue({
        isValid: true,
        data: { id: '1', email: 'test@example.com' },
        errors: []
      });

      const result = transformUserApiResponse(mockResponse);

      expect(validateUserResponse).toHaveBeenCalledWith({ id: '1', email: 'test@example.com' });
      expect(result).toEqual({ id: '1', email: 'test@example.com' });
    });

    it('should transform generated domain response', () => {
      const mockResponse: AxiosResponse = {
        data: { domain: 'example.com', offsetIndex: '100' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      // Mock the validateGeneratedDomainResponse function
      const { validateGeneratedDomainResponse } = require('../../validation/runtime-validators');
      validateGeneratedDomainResponse.mockReturnValue({
        isValid: true,
        data: { domain: 'example.com', offsetIndex: '100' },
        errors: []
      });

      const result = transformGeneratedDomainApiResponse(mockResponse);

      expect(validateGeneratedDomainResponse).toHaveBeenCalledWith({
        domain: 'example.com',
        offsetIndex: '100'
      });
      expect(result).toEqual({ domain: 'example.com', offsetIndex: '100' });
    });
  });

  describe('configureAxiosForSafeBigInt', () => {
    it('should configure axios interceptor', () => {
      const mockAxios = {
        interceptors: {
          request: {
            use: jest.fn()
          },
          response: {
            use: jest.fn()
          }
        }
      };

      configureAxiosForSafeBigInt(mockAxios);

      expect(mockAxios.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxios.interceptors.response.use).toHaveBeenCalled();
    });

    it('should transform campaign responses in interceptor', () => {
      let interceptorFn: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
      const mockAxios = {
        interceptors: {
          request: {
            use: jest.fn()
          },
          response: {
            use: jest.fn((fn: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>, onError: (error: unknown) => Promise<never>) => {
              interceptorFn = fn;
            })
          }
        }
      };

      configureAxiosForSafeBigInt(mockAxios);

      const mockResponse: AxiosResponse = {
        config: { url: '/api/campaigns' },
        data: { id: '123', campaignType: 'dns' },
        status: 200,
        statusText: 'OK',
        headers: {}
      } as AxiosResponse;

      // Mock the validateCampaignResponse function
      const { validateCampaignResponse } = require('../../validation/runtime-validators');
      validateCampaignResponse.mockReturnValue({
        isValid: true,
        data: { id: 123n, campaignType: 'dns' },
        errors: []
      });

      const result = interceptorFn!(mockResponse) as AxiosResponse;

      expect(validateCampaignResponse).toHaveBeenCalled();
      expect(result.data.id).toBe(123n);
    });

    it('should handle errors in interceptor', () => {
      let errorHandler: (error: unknown) => Promise<never>;
      const mockAxios = {
        interceptors: {
          request: {
            use: jest.fn()
          },
          response: {
            use: jest.fn((_: any, onError: (error: unknown) => Promise<never>) => {
              errorHandler = onError;
            })
          }
        }
      };

      configureAxiosForSafeBigInt(mockAxios);

      const error = new Error('Test error');
      
      expect(errorHandler!(error)).rejects.toThrow('Test error');
    });
  });
});