/**
 * API client wrapper with runtime validation for all responses
 * Enhanced with SafeBigInt transformation support
 */

import { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { logger } from '@/lib/utils/logger';

// Extend axios config to include metadata
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}
import { 
  ValidationResult,
  ValidationError as ValidatorError,
  Validator,
  validateCampaignResponse,
  validateUserResponse,
  validateGeneratedDomainResponse,
  validateArray,
  RuntimeValidationError,
  validateOrThrow
} from '../validation/runtime-validators';
import {
  ModelsCampaignAPI,
  ModelsUserAPI,
  ModelsGeneratedDomainAPI
} from '../types/models-aligned';
import { performanceMonitor } from '../monitoring/performance-monitor';

/**
 * Custom error for API validation failures
 */
export class ApiValidationError extends Error {
  constructor(
    message: string,
    public originalResponse?: unknown,
    public validationErrors?: string[]
  ) {
    super(message);
    this.name = 'ApiValidationError';
  }
}

/**
 * Validates API response data using a validator
 */
export function validateApiResponse<T>(
  response: AxiosResponse<unknown>,
  validator: Validator<T>,
  errorContext?: string
): T {
  const startTime = performance.now();
  const { data } = response;
  
  try {
    const result = validator(data);
    
    if (!result.isValid) {
      const errors = result.errors.map(e => `${e.field}: ${e.message}`);
      throw new ApiValidationError(
        `API response validation failed${errorContext ? ` for ${errorContext}` : ''}`,
        data,
        errors
      );
    }
    
    // Record validation performance
    const duration = performance.now() - startTime;
    performanceMonitor.recordCustomMetric(
      'api_validation_duration',
      duration,
      'ms',
      { context: errorContext || 'unknown' }
    );
    
    return result.data as T;
  } catch (error: unknown) {
    // Record validation failure
    performanceMonitor.recordCustomMetric(
      'api_validation_failure',
      1,
      'count',
      { context: errorContext || 'unknown', error: error instanceof Error ? error.message : 'unknown' }
    );
    throw error;
  }
}

/**
 * Validates request data before sending
 */
export function validateApiRequest<T>(
  requestData: unknown,
  validator: Validator<T>,
  errorContext?: string
): T {
  const result = validator(requestData);
  
  if (!result.isValid) {
    const errors = result.errors.map(e => `${e.field}: ${e.message}`);
    throw new ApiValidationError(
      `API request validation failed${errorContext ? ` for ${errorContext}` : ''}`,
      requestData,
      errors
    );
  }
  
  return result.data as T;
}

/**
 * Wraps an API call with request and response validation
 */
export async function validateApiCall<TRequest, TResponse>(
  apiCall: (data: TRequest) => Promise<AxiosResponse<unknown>>,
  requestData: TRequest,
  requestValidator: Validator<TRequest>,
  responseValidator: Validator<TResponse>,
  context?: string
): Promise<TResponse> {
  // Validate request
  const validatedRequest = validateApiRequest(requestData, requestValidator, context);
  
  try {
    // Make API call
    const response = await apiCall(validatedRequest);
    
    // Validate response
    return validateApiResponse(response, responseValidator, context);
  } catch (error: unknown) {
    if (error instanceof ApiValidationError || error instanceof RuntimeValidationError) {
      throw error;
    }
    
    // Re-throw other errors with context
    throw new Error(`API call failed${context ? ` for ${context}` : ''}: ${error}`);
  }
}

/**
 * Creates a validated wrapper for an API service method
 */
export function createValidatedApiMethod<TRequest, TResponse>(
  apiMethod: (data: TRequest) => Promise<AxiosResponse<unknown>>,
  requestValidator: Validator<TRequest>,
  responseValidator: Validator<TResponse>,
  methodName?: string
) {
  return async (data: TRequest): Promise<TResponse> => {
    return validateApiCall(
      apiMethod,
      data,
      requestValidator,
      responseValidator,
      methodName
    );
  };
}

/**
 * Error handler for API validation errors
 */
export function handleApiValidationError(error: unknown): {
  isValidationError: boolean;
  message: string;
  details?: string[];
} {
  if (error instanceof ApiValidationError) {
    return {
      isValidationError: true,
      message: error.message,
      details: error.validationErrors
    };
  }
  
  if (error instanceof RuntimeValidationError) {
    return {
      isValidationError: true,
      message: error.message,
      details: error.errors.map(e => `${e.field}: ${e.message}`)
    };
  }
  
  return {
    isValidationError: false,
    message: error instanceof Error ? error.message : 'Unknown error'
  };
}

/**
 * Response transformation with validation
 */
export function transformAndValidate<TInput, TOutput>(
  input: TInput,
  transformer: (input: TInput) => TOutput,
  validator: Validator<TOutput>,
  context?: string
): TOutput {
  try {
    const transformed = transformer(input);
    const result = validator(transformed);
    
    if (!result.isValid) {
      const errors = result.errors.map(e => `${e.field}: ${e.message}`);
      throw new ApiValidationError(
        `Transformation validation failed${context ? ` for ${context}` : ''}`,
        input,
        errors
      );
    }
    
    return result.data as TOutput;
  } catch (error: unknown) {
    if (error instanceof ApiValidationError || error instanceof RuntimeValidationError) {
      throw error;
    }
    
    throw new ApiValidationError(
      `Transformation failed${context ? ` for ${context}` : ''}: ${error instanceof Error ? error.message : 'unknown'}`,
      input
    );
  }
}

/**
 * Batch validation for array responses
 */
export function validateArrayResponse<T>(
  response: AxiosResponse<unknown>,
  itemValidator: Validator<T>,
  errorContext?: string
): T[] {
  const { data } = response;
  
  if (!Array.isArray(data)) {
    throw new ApiValidationError(
      `Expected array response${errorContext ? ` for ${errorContext}` : ''}`,
      data
    );
  }
  
  const arrayResult = validateArray(data, itemValidator);
  
  if (!arrayResult.isValid) {
    const errors = arrayResult.errors.map(e => `${e.field}: ${e.message}`);
    throw new ApiValidationError(
      `Array response validation failed${errorContext ? ` for ${errorContext}` : ''}`,
      data,
      errors
    );
  }
  
  return arrayResult.data as T[];
}

// ============================================================================
// ENHANCED TRANSFORMATION METHODS FOR INT64 SAFETY WITH VALIDATION
// ============================================================================

/**
 * Transform and validate campaign response with SafeBigInt conversion
 */
export function transformCampaignApiResponse(
  response: AxiosResponse<unknown>
): ModelsCampaignAPI {
  const startTime = performance.now();
  
  try {
    const result = validateApiResponse(response, validateCampaignResponse, 'campaign');
    
    // Record transformation performance
    const duration = performance.now() - startTime;
    performanceMonitor.recordCustomMetric(
      'campaign_transform_duration',
      duration,
      'ms'
    );
    
    return result;
  } catch (error: unknown) {
    // Record transformation failure
    performanceMonitor.recordCustomMetric(
      'campaign_transform_failure',
      1,
      'count'
    );
    throw error;
  }
}

/**
 * Transform and validate campaign array response
 */
export function transformCampaignArrayResponse(
  response: AxiosResponse<unknown>
): ModelsCampaignAPI[] {
  return validateArrayResponse(response, validateCampaignResponse, 'campaigns');
}

/**
 * Transform and validate user response
 */
export function transformUserApiResponse(
  response: AxiosResponse<unknown>
): ModelsUserAPI {
  return validateApiResponse(response, validateUserResponse, 'user');
}

/**
 * Transform and validate user array response
 */
export function transformUserArrayResponse(
  response: AxiosResponse<unknown>
): ModelsUserAPI[] {
  return validateArrayResponse(response, validateUserResponse, 'users');
}

/**
 * Transform and validate generated domain response
 */
export function transformGeneratedDomainApiResponse(
  response: AxiosResponse<unknown>
): ModelsGeneratedDomainAPI {
  return validateApiResponse(response, validateGeneratedDomainResponse, 'generated domain');
}

/**
 * Transform and validate generated domain array response
 */
export function transformGeneratedDomainArrayResponse(
  response: AxiosResponse<unknown>
): ModelsGeneratedDomainAPI[] {
  return validateArrayResponse(response, validateGeneratedDomainResponse, 'generated domains');
}

// ============================================================================
// API RESPONSE WRAPPER WITH VALIDATION
// ============================================================================

/**
 * Wrapper for API responses with metadata
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
  timestamp: string;
  errors?: string[];
}

/**
 * Create a validated API response wrapper
 */
export function createApiResponse<T>(
  response: AxiosResponse<unknown>,
  dataValidator: Validator<T>
): ApiResponse<T> {
  const data = validateApiResponse(response, dataValidator);
  
  return {
    data,
    status: response.status,
    message: response.statusText,
    timestamp: new Date().toISOString(),
    errors: []
  };
}

// ============================================================================
// AXIOS INTERCEPTOR FOR AUTOMATIC TRANSFORMATION AND VALIDATION
// ============================================================================

/**
 * Configure axios instance with automatic response transformation and validation
 * This should be applied to your axios instance used by the API client
 */
export function configureAxiosForSafeBigInt(axiosInstance: { 
  interceptors: { 
    response: { 
      use: (
        onSuccess: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>, 
        onError: (error: unknown) => Promise<never>
      ) => void 
    },
    request: {
      use: (
        onSuccess: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>,
        onError: (error: unknown) => Promise<never>
      ) => void
    }
  } 
}): void {
  // Request interceptor to track API calls
  axiosInstance.interceptors.request.use(
    (config) => {
      // Record API call start
      const startTime = performance.now();
      config.metadata = { startTime };
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor to handle int64 transformations and validation
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      const url = response.config.url || '';
      const method = response.config.method || 'unknown';
      const startTime = response.config.metadata?.startTime || performance.now();
      const duration = performance.now() - startTime;
      
      // Record API call metrics
      performanceMonitor.recordApiCall(url, method.toUpperCase(), duration, response.status);
      
      try {
        // Campaign endpoints
        if (url.includes('/campaigns')) {
          if (Array.isArray(response.data)) {
            response.data = response.data.map(item => {
              const result = validateCampaignResponse(item);
              if (!result.isValid) {
                throw new ApiValidationError('Invalid campaign data in array', item, 
                  result.errors.map(e => `${e.field}: ${e.message}`)
                );
              }
              return result.data;
            });
          } else if (response.data && typeof response.data === 'object' && 'campaignType' in response.data) {
            const result = validateCampaignResponse(response.data);
            if (!result.isValid) {
              throw new ApiValidationError('Invalid campaign data', response.data,
                result.errors.map(e => `${e.field}: ${e.message}`)
              );
            }
            response.data = result.data;
          }
        }
        
        // User endpoints
        else if (url.includes('/users') || url.includes('/auth')) {
          if (response.data && typeof response.data === 'object') {
            if ('user' in response.data && response.data.user) {
              // Login response
              const result = validateUserResponse(response.data.user);
              if (!result.isValid) {
                throw new ApiValidationError('Invalid user data in auth response', response.data.user,
                  result.errors.map(e => `${e.field}: ${e.message}`)
                );
              }
              response.data.user = result.data;
            } else if ('email' in response.data) {
              // Direct user response
              const result = validateUserResponse(response.data);
              if (!result.isValid) {
                throw new ApiValidationError('Invalid user data', response.data,
                  result.errors.map(e => `${e.field}: ${e.message}`)
                );
              }
              response.data = result.data;
            }
          }
        }
        
        // Generated domains endpoints
        else if (url.includes('/domains/generated')) {
          if (Array.isArray(response.data)) {
            response.data = response.data.map(item => {
              const result = validateGeneratedDomainResponse(item);
              if (!result.isValid) {
                throw new ApiValidationError('Invalid generated domain data in array', item,
                  result.errors.map(e => `${e.field}: ${e.message}`)
                );
              }
              return result.data;
            });
          } else if (response.data && typeof response.data === 'object' && 'offsetIndex' in response.data) {
            const result = validateGeneratedDomainResponse(response.data);
            if (!result.isValid) {
              throw new ApiValidationError('Invalid generated domain data', response.data,
                result.errors.map(e => `${e.field}: ${e.message}`)
              );
            }
            response.data = result.data;
          }
        }
        
        return response;
      } catch (error: unknown) {
        // Log validation errors but don't break the response
        logger.error('Response validation error occurred', {
          component: 'ApiClientWrapper',
          method: 'configureAxiosForSafeBigInt',
          error: error instanceof Error ? error.message : 'Unknown error',
          url: response.config.url
        });
        if (error instanceof ApiValidationError) {
          // Add validation errors to response for debugging
          response.data = {
            ...response.data,
            _validationErrors: error.validationErrors
          };
        }
        return response;
      }
    },
    (error: unknown) => {
      if (error instanceof AxiosError) {
        const url = error.config?.url || '';
        const method = error.config?.method || 'unknown';
        const startTime = error.config?.metadata?.startTime || performance.now();
        const duration = performance.now() - startTime;
        const status = error.response?.status || 0;
        
        // Record failed API call metrics
        performanceMonitor.recordApiCall(url, method.toUpperCase(), duration, status);
      }
      
      return Promise.reject(error);
    }
  );
}

// ============================================================================
// VALIDATION MIDDLEWARE FOR API CLIENT
// ============================================================================

/**
 * Create validation middleware for API client methods
 */
export function createValidationMiddleware<T extends Record<string, (...args: unknown[]) => unknown>>(
  apiClient: T,
  validators: Partial<Record<keyof T, { request?: Validator<unknown>, response?: Validator<unknown> }>>
): T {
  const validatedClient = {} as T;
  
  for (const [methodName, method] of Object.entries(apiClient)) {
    if (typeof method === 'function') {
      const methodValidators = validators[methodName as keyof T];
      
      if (methodValidators) {
        const wrappedMethod = async (...args: unknown[]) => {
          // Validate request if validator provided
          if (methodValidators.request && args.length > 0) {
            const validatedRequest = validateOrThrow(
              args[0],
              methodValidators.request,
              `Invalid request for ${methodName}`
            );
            args[0] = validatedRequest;
          }
          
          // Call original method
          const response = await method.apply(apiClient, args) as AxiosResponse<unknown> | unknown;
          
          // Validate response if validator provided and response has data
          if (methodValidators.response && response && typeof response === 'object' && 'data' in response) {
            const axiosResponse = response as AxiosResponse<unknown>;
            const validatedResponse = validateOrThrow(
              axiosResponse.data,
              methodValidators.response,
              `Invalid response from ${methodName}`
            );
            axiosResponse.data = validatedResponse;
          }
          
          return response;
        };
        (validatedClient as Record<string, unknown>)[methodName] = wrappedMethod;
      } else {
        // Keep original method if no validators
        validatedClient[methodName as keyof T] = method as T[keyof T];
      }
    }
  }
  
  return validatedClient;
}

export type { Validator, ValidationResult, ValidatorError };
export { RuntimeValidationError };
