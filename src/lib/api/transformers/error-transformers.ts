/**
 * Error Response Transformers
 * Ensures consistent error handling across all API services
 */

/**
 * Backend error response format (from Go backend)
 */
export interface BackendErrorResponse {
    code?: string;
    message: string;
    details?: Array<{
        field?: string;
        code?: string;
        message: string;
        context?: unknown;
    }>;
    timestamp?: string;
    path?: string;
    status?: number;
}

/**
 * Standardized error response for frontend consumption
 */
export interface StandardizedErrorResponse {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
    details?: Array<{
        field?: string;
        message: string;
        code?: string;
    }>;
    timestamp: string;
    path?: string;
    statusCode: number;
}

/**
 * Transform backend error response to standardized format
 */
export function transformErrorResponse(
    error: unknown,
    statusCode = 500,
    path?: string
): StandardizedErrorResponse {
    const timestamp = new Date().toISOString();
    
    // Handle different error formats
    if (typeof error === 'string') {
        return {
            code: 'ERROR',
            message: error,
            timestamp,
            statusCode,
            path
        };
    }
    
    if (error && typeof error === 'object') {
        const err = error as Record<string, unknown>;
        
        // Handle axios error response
        if (err.response && typeof err.response === 'object') {
            const response = err.response as Record<string, unknown>;
            return transformErrorResponse(response.data, response.status as number, path);
        }
        
        // Handle backend error format
        if ('message' in err && typeof err.message === 'string') {
            const fieldErrors: Record<string, string> = {};
            
            // Extract field-specific errors
            if (err.details && Array.isArray(err.details)) {
                err.details.forEach((detail: unknown) => {
                    if (detail && typeof detail === 'object' && 'field' in detail && 'message' in detail) {
                        const d = detail as { field?: string; message: string };
                        if (d.field) {
                            fieldErrors[d.field] = d.message;
                        }
                    }
                });
            }
            
            return {
                code: (typeof err.code === 'string' ? err.code : extractErrorCode(err.message)) || 'ERROR',
                message: err.message,
                fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
                details: Array.isArray(err.details) ? err.details as Array<{ field?: string; message: string; code?: string }> : undefined,
                timestamp: typeof err.timestamp === 'string' ? err.timestamp : timestamp,
                statusCode: typeof err.status === 'number' ? err.status : statusCode,
                path: typeof err.path === 'string' ? err.path : path
            };
        }
        
        // Handle OpenAPI generated ErrorResponse
        if ('status' in err && 'message' in err) {
            return {
                code: (typeof err.code === 'string' ? err.code : typeof err.status === 'string' ? err.status : undefined) || 'ERROR',
                message: typeof err.message === 'string' ? err.message : 'An error occurred',
                timestamp,
                statusCode: typeof err.code === 'number' ? err.code : statusCode,
                path
            };
        }
    }
    
    // Fallback
    return {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred',
        timestamp,
        statusCode,
        path
    };
}

/**
 * Extract error code from message patterns
 */
function extractErrorCode(message: string): string | null {
    const patterns: Record<string, RegExp> = {
        'VALIDATION_ERROR': /validation|invalid/i,
        'UNAUTHORIZED': /unauthorized|authentication/i,
        'FORBIDDEN': /forbidden|permission|access denied/i,
        'NOT_FOUND': /not found|404/i,
        'CONFLICT': /conflict|already exists/i,
        'RATE_LIMIT': /rate limit|too many requests/i,
        'TIMEOUT': /timeout|timed out/i,
        'NETWORK_ERROR': /network|connection/i
    };
    
    for (const [code, pattern] of Object.entries(patterns)) {
        if (pattern.test(message)) {
            return code;
        }
    }
    
    return null;
}

/**
 * Check if an error is a validation error
 */
export function isValidationError(error: StandardizedErrorResponse): boolean {
    return error.code === 'VALIDATION_ERROR' || 
           (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) ||
           error.statusCode === 422;
}

/**
 * Check if an error is an authentication error
 */
export function isAuthError(error: StandardizedErrorResponse): boolean {
    return error.code === 'UNAUTHORIZED' || 
           error.statusCode === 401;
}

/**
 * Check if an error is a permission error
 */
export function isPermissionError(error: StandardizedErrorResponse): boolean {
    return error.code === 'FORBIDDEN' || 
           error.statusCode === 403;
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: StandardizedErrorResponse): string {
    // Check for specific error codes
    const friendlyMessages: Record<string, string> = {
        'VALIDATION_ERROR': 'Please check the form for errors and try again.',
        'UNAUTHORIZED': 'Please log in to continue.',
        'FORBIDDEN': 'You do not have permission to perform this action.',
        'NOT_FOUND': 'The requested resource was not found.',
        'CONFLICT': 'This action conflicts with existing data.',
        'RATE_LIMIT': 'Too many requests. Please wait a moment and try again.',
        'TIMEOUT': 'The request timed out. Please try again.',
        'NETWORK_ERROR': 'Network error. Please check your connection.',
        'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again.'
    };
    
    return friendlyMessages[error.code] || error.message;
}

/**
 * Extract field errors for form display
 */
export function extractFormFieldErrors(error: StandardizedErrorResponse): Record<string, string> {
    if (error.fieldErrors) {
        return error.fieldErrors;
    }
    
    const fieldErrors: Record<string, string> = {};
    
    if (error.details && Array.isArray(error.details)) {
        error.details.forEach(detail => {
            if (detail.field) {
                fieldErrors[detail.field] = detail.message;
            }
        });
    }
    
    return fieldErrors;
}

/**
 * Create a standardized API error class
 */
export class ApiError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly fieldErrors?: Record<string, string>;
    public readonly details?: Array<{ field?: string; message: string; code?: string }>;
    public readonly timestamp: string;
    public readonly path?: string;
    
    constructor(error: StandardizedErrorResponse) {
        super(error.message);
        this.name = 'ApiError';
        this.code = error.code;
        this.statusCode = error.statusCode;
        this.fieldErrors = error.fieldErrors;
        this.details = error.details;
        this.timestamp = error.timestamp;
        this.path = error.path;
    }
    
    toJSON(): StandardizedErrorResponse {
        return {
            code: this.code,
            message: this.message,
            fieldErrors: this.fieldErrors,
            details: this.details,
            timestamp: this.timestamp,
            statusCode: this.statusCode,
            path: this.path
        };
    }
}