/**
 * API client wrapper with runtime validation for all responses
 */

import { AxiosResponse } from 'axios';
import { ValidationError, Validator, deepValidate } from '../utils/runtime-validators';

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
 * Validates API response data against a validator
 */
export function validateApiResponse<T>(
  response: AxiosResponse<unknown>,
  validator: Validator<T>,
  errorContext?: string
): T {
  const { data } = response;
  
  if (!validator(data)) {
    throw new ApiValidationError(
      `API response validation failed${errorContext ? ` for ${errorContext}` : ''}`,
      data
    );
  }
  
  return data;
}

/**
 * Validates API response using deep validation schema
 */
export function validateApiResponseDeep<T>(
  response: AxiosResponse<unknown>,
  schema: Record<string, unknown>,
  errorContext?: string
): T {
  const { data } = response;
  const validation = deepValidate(data, schema);
  
  if (!validation.isValid) {
    throw new ApiValidationError(
      `API response validation failed${errorContext ? ` for ${errorContext}` : ''}`,
      data,
      validation.errors
    );
  }
  
  return data as T;
}

/**
 * Validates request data before sending
 */
export function validateApiRequest<T>(
  requestData: unknown,
  validator: Validator<T>,
  errorContext?: string
): T {
  if (!validator(requestData)) {
    throw new ValidationError(
      `API request validation failed${errorContext ? ` for ${errorContext}` : ''}`,
      undefined,
      requestData
    );
  }
  
  return requestData;
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
  } catch (error) {
    if (error instanceof ApiValidationError || error instanceof ValidationError) {
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
  
  if (error instanceof ValidationError) {
    return {
      isValidationError: true,
      message: error.message,
      details: error.field ? [`Field: ${error.field}`] : undefined
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
    
    if (!validator(transformed)) {
      throw new ValidationError(
        `Transformation validation failed${context ? ` for ${context}` : ''}`,
        undefined,
        transformed
      );
    }
    
    return transformed;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    
    throw new ValidationError(
      `Transformation failed${context ? ` for ${context}` : ''}: ${error}`,
      undefined,
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
  
  const errors: string[] = [];
  const validatedItems: T[] = [];
  
  data.forEach((item, index) => {
    if (itemValidator(item)) {
      validatedItems.push(item);
    } else {
      errors.push(`Item at index ${index} failed validation`);
    }
  });
  
  if (errors.length > 0) {
    throw new ApiValidationError(
      `Array response validation failed${errorContext ? ` for ${errorContext}` : ''}`,
      data,
      errors
    );
  }
  
  return validatedItems;
}
