import { AxiosResponse } from 'axios';
import {
  ApiValidationError,
  validateApiResponse,
  validateApiResponseDeep,
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
  configureAxiosForSafeBigInt
} from '../api-client-wrapper';
import { ValidationError, Validator } from '../../utils/runtime-validators';
import { 
  transformCampaignResponse,
  transformUserResponse,
  transformGeneratedDomainResponse
} from '../../types/models-aligned';

// Mock the models-aligned module
jest.mock('../../types/models-aligned', () => ({
  transformCampaignResponse: jest.fn(),
  transformUserResponse: jest.fn(),
  transformGeneratedDomainResponse: jest.fn()
}));

// Helper function to create a mock validator
function createMockValidator<T>(returnValue: boolean): Validator<T> {
  const validator = jest.fn((value: unknown): value is T => returnValue) as any;
  validator.mockReturnValue = jest.fn().mockReturnValue(returnValue);
  return validator;
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

  describe('validateApiResponseDeep', () => {
    it('should validate with deep validation', () => {
      const mockResponse: AxiosResponse = {
        data: { id: 1, name: 'Test' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const schema = {
        id: (v: unknown) => typeof v === 'number',
        name: (v: unknown) => typeof v === 'string'
      };
      
      const result = validateApiResponseDeep(mockResponse, schema);
      
      expect(result).toEqual({ id: 1, name: 'Test' });
    });

    it('should throw ApiValidationError with validation errors', () => {
      const mockResponse: AxiosResponse = {
        data: { id: 'invalid', name: 123 },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const schema = {
        id: (v: unknown) => typeof v === 'number',
        name: (v: unknown) => typeof v === 'string'
      };
      
      expect(() => validateApiResponseDeep(mockResponse, schema, 'test context'))
        .toThrow(ApiValidationError);
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
        .toThrow(ValidationError);
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
      )).rejects.toThrow(ValidationError);

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

    it('should handle ValidationError', () => {
      const error = new ValidationError('Field validation failed', 'username');

      const result = handleApiValidationError(error);

      expect(result).toEqual({
        isValidationError: true,
        message: 'Field validation failed',
        details: ['Field: username']
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
      )).toThrow('Transformation validation failed for test');
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
      )).toThrow('Transformation failed for test: Error: Transform failed');
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
      const itemValidator = ((value: unknown): value is any => {
        callCount++;
        return callCount !== 2; // Fail on second item
      }) as Validator<any>;

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

      const mockTransformed = { id: 123n, name: 'Campaign' };
      (transformCampaignResponse as jest.Mock).mockReturnValue(mockTransformed);

      const result = transformCampaignApiResponse(mockResponse);

      expect(transformCampaignResponse).toHaveBeenCalledWith({ id: '123', name: 'Campaign' });
      expect(result).toEqual(mockTransformed);
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

      (transformCampaignResponse as jest.Mock).mockImplementation((c: any) => ({
        ...c,
        id: BigInt(c.id)
      }));

      const result = transformCampaignArrayResponse(mockResponse);

      expect(result).toHaveLength(2);
      expect(transformCampaignResponse).toHaveBeenCalledTimes(2);
    });

    it('should transform user response', () => {
      const mockResponse: AxiosResponse = {
        data: { id: '1', email: 'test@example.com' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const mockTransformed = { id: 1n, email: 'test@example.com' };
      (transformUserResponse as jest.Mock).mockReturnValue(mockTransformed);

      const result = transformUserApiResponse(mockResponse);

      expect(transformUserResponse).toHaveBeenCalledWith({ id: '1', email: 'test@example.com' });
      expect(result).toEqual(mockTransformed);
    });

    it('should transform generated domain response', () => {
      const mockResponse: AxiosResponse = {
        data: { domain: 'example.com', offsetIndex: '100' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {}
      } as AxiosResponse;

      const mockTransformed = { domain: 'example.com', offsetIndex: 100n };
      (transformGeneratedDomainResponse as jest.Mock).mockReturnValue(mockTransformed);

      const result = transformGeneratedDomainApiResponse(mockResponse);

      expect(transformGeneratedDomainResponse).toHaveBeenCalledWith({
        domain: 'example.com',
        offsetIndex: '100'
      });
      expect(result).toEqual(mockTransformed);
    });
  });

  describe('configureAxiosForSafeBigInt', () => {
    it('should configure axios interceptor', () => {
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn()
          }
        }
      };

      configureAxiosForSafeBigInt(mockAxios);

      expect(mockAxios.interceptors.response.use).toHaveBeenCalled();
    });

    it('should transform campaign responses in interceptor', () => {
      let interceptorFn: (response: AxiosResponse) => AxiosResponse;
      const mockAxios = {
        interceptors: {
          response: {
            use: jest.fn((fn: (response: AxiosResponse) => AxiosResponse) => { 
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

      (transformCampaignResponse as jest.Mock).mockReturnValue({ id: 123n, campaignType: 'dns' });

      const result = interceptorFn!(mockResponse);

      expect(transformCampaignResponse).toHaveBeenCalled();
      expect(result.data.id).toBe(123n);
    });

    it('should handle errors in interceptor', () => {
      let errorHandler: (error: unknown) => Promise<never>;
      const mockAxios = {
        interceptors: {
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