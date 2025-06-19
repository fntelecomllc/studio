// src/lib/utils/errorHandling.ts
// Enhanced error handling utilities for form validation and API responses

export interface FieldError {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: FieldError[];
  timestamp?: string;
  path?: string;
}

export interface FormErrorState {
  [fieldName: string]: string;
}

/**
 * Extracts field-specific errors from an API response
 * @param apiResponse - API response from our SessionApiClient
 * @returns Object mapping field names to error messages
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractFieldErrors(apiResponse: any): FormErrorState {
  const fieldErrors: FormErrorState = {};
  
  // Check if the response has detailed field errors
  if (apiResponse?.errors && Array.isArray(apiResponse.errors)) {
    apiResponse.errors.forEach((error: FieldError) => {
      if (error.field && error.message) {
        fieldErrors[error.field] = error.message;
      }
    });
  }
  
  return fieldErrors;
}

/**
 * Gets the main error message from an API response
 * @param apiResponse - API response from our SessionApiClient
 * @returns Main error message string
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractMainError(apiResponse: any): string {
  if (apiResponse?.message) {
    return apiResponse.message;
  }
  
  if (apiResponse?.error) {
    return typeof apiResponse.error === 'string' ? apiResponse.error : apiResponse.error.message || 'An error occurred';
  }
  
  return 'An unexpected error occurred';
}

/**
 * Checks if an API response has field-specific validation errors
 * @param apiResponse - API response from our SessionApiClient
 * @returns True if the response contains field errors
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasFieldErrors(apiResponse: any): boolean {
  return apiResponse?.errors && Array.isArray(apiResponse.errors) && apiResponse.errors.length > 0;
}

/**
 * Combines Zod validation errors with API field errors
 * @param zodError - Zod validation error
 * @param apiFieldErrors - Field errors from API response
 * @returns Combined error state
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function combineValidationErrors(zodError?: unknown, apiFieldErrors?: FormErrorState): FormErrorState {
  const combined: FormErrorState = {};
  
  // Add Zod validation errors
  if (zodError && typeof zodError === 'object' && 'errors' in zodError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (zodError as any).errors.forEach((error: unknown) => {
      if (error && typeof error === 'object' && 'path' in error && 'message' in error) {
        const errorObj = error as { path: unknown[]; message: string };
        if (errorObj.path && errorObj.path.length > 0) {
          const fieldName = errorObj.path[0];
          combined[fieldName as string] = errorObj.message;
        }
      }
    });
  }
  
  // Add API field errors (these take precedence)
  if (apiFieldErrors) {
    Object.assign(combined, apiFieldErrors);
  }
  
  return combined;
}

/**
 * Creates user-friendly error messages for common API scenarios
 * @param apiResponse - API response from our SessionApiClient
 * @returns User-friendly error message
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createUserFriendlyError(apiResponse: any): string {
  const mainError = extractMainError(apiResponse);
  
  // Handle common error patterns
  if (mainError.toLowerCase().includes('validation')) {
    return 'Please check the highlighted fields and correct any errors.';
  }
  
  if (mainError.toLowerCase().includes('unauthorized') || mainError.toLowerCase().includes('403')) {
    return 'You do not have permission to perform this action.';
  }
  
  if (mainError.toLowerCase().includes('not found') || mainError.toLowerCase().includes('404')) {
    return 'The requested resource could not be found.';
  }
  
  if (mainError.toLowerCase().includes('network') || mainError.toLowerCase().includes('fetch')) {
    return 'Network error. Please check your connection and try again.';
  }
  
  if (mainError.toLowerCase().includes('rate limit')) {
    return 'Too many requests. Please wait a moment before trying again.';
  }
  
  // Return the original message if no specific pattern matches
  return mainError;
}

/**
 * Hook for managing form error state with enhanced API error handling
 */
export class FormErrorManager {
  private fieldErrors: FormErrorState = {};
  private mainError: string | null = null;
  private setFieldErrors: (errors: FormErrorState | ((prev: FormErrorState) => FormErrorState)) => void;
  private setMainError: (error: string | null) => void;
  
  constructor(
    setFieldErrors: (errors: FormErrorState | ((prev: FormErrorState) => FormErrorState)) => void,
    setMainError: (error: string | null) => void
  ) {
    this.setFieldErrors = setFieldErrors;
    this.setMainError = setMainError;
  }
  
  /**
   * Processes an API response and updates error state
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleApiResponse(apiResponse: any): void {
    if (apiResponse.status === 'error') {
      const fieldErrors = extractFieldErrors(apiResponse);
      const mainError = hasFieldErrors(apiResponse) ? 
        createUserFriendlyError(apiResponse) : 
        extractMainError(apiResponse);
      
      this.setFieldErrors(fieldErrors);
      this.setMainError(mainError);
    } else {
      this.clearErrors();
    }
  }
  
  /**
   * Processes Zod validation errors
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleValidationError(zodError: any): void {
    const fieldErrors = combineValidationErrors(zodError);
    this.setFieldErrors(fieldErrors);
    this.setMainError('Please correct the highlighted fields.');
  }
  
  /**
   * Clears a specific field error when user starts typing
   */
  clearFieldError(fieldName: string): void {
    this.setFieldErrors((prev: FormErrorState) => {
      const updated = { ...prev };
      delete updated[fieldName];
      return updated;
    });
    
    // Clear main error if no field errors remain
    if (Object.keys(this.fieldErrors).length === 1 && this.fieldErrors[fieldName]) {
      this.setMainError(null);
    }
  }
  
  /**
   * Clears all errors
   */
  clearErrors(): void {
    this.setFieldErrors({});
    this.setMainError(null);
  }
}

/**
 * React hook for enhanced form error handling
 */
export function useFormErrorHandler() {
  return {
    extractFieldErrors,
    extractMainError,
    hasFieldErrors,
    combineValidationErrors,
    createUserFriendlyError,
    FormErrorManager
  };
}
