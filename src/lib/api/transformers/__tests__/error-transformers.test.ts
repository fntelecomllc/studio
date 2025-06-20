import { describe, it, expect } from '@jest/globals';
import {
  transformErrorResponse,
  isValidationError,
  isAuthError,
  isPermissionError,
  getUserFriendlyErrorMessage,
  extractFormFieldErrors,
  ApiError,
  StandardizedErrorResponse,
  BackendErrorResponse
} from '../error-transformers';

describe('Error Transformers', () => {
  describe('transformErrorResponse', () => {
    it('should transform string error', () => {
      const result = transformErrorResponse('Simple error message', 500, '/api/test');

      expect(result).toEqual({
        code: 'ERROR',
        message: 'Simple error message',
        timestamp: expect.any(String),
        statusCode: 500,
        path: '/api/test'
      });
    });

    it('should transform backend error format', () => {
      const backendError: BackendErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'email', message: 'Invalid email format', code: 'INVALID_FORMAT' },
          { field: 'password', message: 'Too short', code: 'MIN_LENGTH' }
        ],
        timestamp: '2024-01-01T00:00:00Z',
        path: '/api/users',
        status: 422
      };

      const result = transformErrorResponse(backendError, 422, '/api/users');

      expect(result).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fieldErrors: {
          email: 'Invalid email format',
          password: 'Too short'
        },
        details: backendError.details,
        timestamp: '2024-01-01T00:00:00Z',
        statusCode: 422,
        path: '/api/users'
      });
    });

    it('should handle axios error response', () => {
      const axiosError = {
        response: {
          data: {
            message: 'Unauthorized',
            code: 'UNAUTHORIZED'
          },
          status: 401
        }
      };

      const result = transformErrorResponse(axiosError, 500);

      expect(result.statusCode).toBe(401);
      expect(result.message).toBe('Unauthorized');
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('should extract error code from message when code is not provided', () => {
      const error = {
        message: 'Validation error: Email is invalid'
      };

      const result = transformErrorResponse(error, 400);

      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should handle OpenAPI ErrorResponse format', () => {
      const openApiError = {
        status: 'NOT_FOUND',
        message: 'Resource not found',
        code: 404
      };

      const result = transformErrorResponse(openApiError, 404);

      expect(result).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        statusCode: 404
      });
    });

    it('should handle unknown error format', () => {
      const unknownError = { unknown: 'format' };

      const result = transformErrorResponse(unknownError, 500);

      expect(result).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        timestamp: expect.any(String),
        statusCode: 500,
        path: undefined
      });
    });

    it('should extract error codes from various message patterns', () => {
      const testCases = [
        { message: 'Invalid input data', expectedCode: 'VALIDATION_ERROR' },
        { message: 'Authentication required', expectedCode: 'UNAUTHORIZED' },
        { message: 'Access denied', expectedCode: 'FORBIDDEN' },
        { message: 'User not found', expectedCode: 'NOT_FOUND' },
        { message: 'Email already exists', expectedCode: 'CONFLICT' },
        { message: 'Too many requests', expectedCode: 'RATE_LIMIT' },
        { message: 'Request timed out', expectedCode: 'TIMEOUT' },
        { message: 'Network connection failed', expectedCode: 'NETWORK_ERROR' }
      ];

      testCases.forEach(({ message, expectedCode }) => {
        const result = transformErrorResponse({ message }, 500);
        expect(result.code).toBe(expectedCode);
      });
    });
  });

  describe('Error Type Guards', () => {
    it('should identify validation errors', () => {
      const validationError: StandardizedErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fieldErrors: { email: 'Invalid' },
        timestamp: new Date().toISOString(),
        statusCode: 422
      };

      const authError: StandardizedErrorResponse = {
        code: 'UNAUTHORIZED',
        message: 'Not authenticated',
        timestamp: new Date().toISOString(),
        statusCode: 401
      };

      expect(isValidationError(validationError)).toBe(true);
      expect(isValidationError(authError)).toBe(false);
    });

    it('should identify auth errors', () => {
      const authError: StandardizedErrorResponse = {
        code: 'UNAUTHORIZED',
        message: 'Please log in',
        timestamp: new Date().toISOString(),
        statusCode: 401
      };

      const otherError: StandardizedErrorResponse = {
        code: 'ERROR',
        message: 'Something went wrong',
        timestamp: new Date().toISOString(),
        statusCode: 500
      };

      expect(isAuthError(authError)).toBe(true);
      expect(isAuthError(otherError)).toBe(false);
    });

    it('should identify permission errors', () => {
      const permissionError: StandardizedErrorResponse = {
        code: 'FORBIDDEN',
        message: 'Access denied',
        timestamp: new Date().toISOString(),
        statusCode: 403
      };

      const otherError: StandardizedErrorResponse = {
        code: 'ERROR',
        message: 'Something went wrong',
        timestamp: new Date().toISOString(),
        statusCode: 500
      };

      expect(isPermissionError(permissionError)).toBe(true);
      expect(isPermissionError(otherError)).toBe(false);
    });
  });

  describe('getUserFriendlyErrorMessage', () => {
    it('should return friendly messages for known error codes', () => {
      const testCases = [
        { code: 'VALIDATION_ERROR', expected: 'Please check the form for errors and try again.' },
        { code: 'UNAUTHORIZED', expected: 'Please log in to continue.' },
        { code: 'FORBIDDEN', expected: 'You do not have permission to perform this action.' },
        { code: 'NOT_FOUND', expected: 'The requested resource was not found.' },
        { code: 'CONFLICT', expected: 'This action conflicts with existing data.' },
        { code: 'RATE_LIMIT', expected: 'Too many requests. Please wait a moment and try again.' },
        { code: 'TIMEOUT', expected: 'The request timed out. Please try again.' },
        { code: 'NETWORK_ERROR', expected: 'Network error. Please check your connection.' },
        { code: 'UNKNOWN_ERROR', expected: 'An unexpected error occurred. Please try again.' }
      ];

      testCases.forEach(({ code, expected }) => {
        const error: StandardizedErrorResponse = {
          code,
          message: 'Technical error message',
          timestamp: new Date().toISOString(),
          statusCode: 500
        };

        expect(getUserFriendlyErrorMessage(error)).toBe(expected);
      });
    });

    it('should return original message for unknown error codes', () => {
      const error: StandardizedErrorResponse = {
        code: 'CUSTOM_ERROR',
        message: 'Custom error occurred',
        timestamp: new Date().toISOString(),
        statusCode: 500
      };

      expect(getUserFriendlyErrorMessage(error)).toBe('Custom error occurred');
    });
  });

  describe('extractFormFieldErrors', () => {
    it('should extract field errors from fieldErrors property', () => {
      const error: StandardizedErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fieldErrors: {
          email: 'Invalid email',
          password: 'Too short'
        },
        timestamp: new Date().toISOString(),
        statusCode: 422
      };

      const fieldErrors = extractFormFieldErrors(error);

      expect(fieldErrors).toEqual({
        email: 'Invalid email',
        password: 'Too short'
      });
    });

    it('should extract field errors from details array', () => {
      const error: StandardizedErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'username', message: 'Username taken' },
          { field: 'age', message: 'Must be over 18' },
          { message: 'General error' } // No field
        ],
        timestamp: new Date().toISOString(),
        statusCode: 422
      };

      const fieldErrors = extractFormFieldErrors(error);

      expect(fieldErrors).toEqual({
        username: 'Username taken',
        age: 'Must be over 18'
      });
    });

    it('should return empty object when no field errors', () => {
      const error: StandardizedErrorResponse = {
        code: 'SERVER_ERROR',
        message: 'Internal server error',
        timestamp: new Date().toISOString(),
        statusCode: 500
      };

      const fieldErrors = extractFormFieldErrors(error);

      expect(fieldErrors).toEqual({});
    });
  });

  describe('ApiError Class', () => {
    it('should create ApiError from StandardizedErrorResponse', () => {
      const errorResponse: StandardizedErrorResponse = {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        fieldErrors: { email: 'Invalid' },
        details: [{ field: 'email', message: 'Invalid email' }],
        timestamp: '2024-01-01T00:00:00Z',
        statusCode: 422,
        path: '/api/users'
      };

      const error = new ApiError(errorResponse);

      expect(error.message).toBe('Validation failed');
      expect(error.name).toBe('ApiError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(422);
      expect(error.fieldErrors).toEqual({ email: 'Invalid' });
      expect(error.details).toEqual([{ field: 'email', message: 'Invalid email' }]);
      expect(error.timestamp).toBe('2024-01-01T00:00:00Z');
      expect(error.path).toBe('/api/users');
    });

    it('should serialize to JSON', () => {
      const errorResponse: StandardizedErrorResponse = {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        timestamp: '2024-01-01T00:00:00Z',
        statusCode: 404,
        path: '/api/resource/123'
      };

      const error = new ApiError(errorResponse);
      const json = error.toJSON();

      expect(json).toEqual(errorResponse);
    });

    it('should work with instanceof', () => {
      const errorResponse: StandardizedErrorResponse = {
        code: 'ERROR',
        message: 'Test error',
        timestamp: new Date().toISOString(),
        statusCode: 500
      };

      const error = new ApiError(errorResponse);

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined errors', () => {
      expect(transformErrorResponse(null, 500)).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        timestamp: expect.any(String),
        statusCode: 500,
        path: undefined
      });

      expect(transformErrorResponse(undefined, 500)).toEqual({
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        timestamp: expect.any(String),
        statusCode: 500,
        path: undefined
      });
    });

    it('should handle circular references', () => {
      const circularObj: any = { message: 'Error' };
      circularObj.self = circularObj;

      const result = transformErrorResponse(circularObj, 500);

      expect(result.message).toBe('Error');
      expect(() => JSON.stringify(result)).not.toThrow();
    });

    it('should handle errors with non-standard properties', () => {
      const customError = {
        message: 'Custom error',
        customProp: 'custom value',
        code: 123, // number instead of string
        status: '404' // string instead of number
      };

      const result = transformErrorResponse(customError, 500);

      expect(result.message).toBe('Custom error');
      expect(result.code).toBe('ERROR'); // No pattern match, defaults to ERROR
    });
  });
});