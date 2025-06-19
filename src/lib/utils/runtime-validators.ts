/**
 * Runtime validators for critical types to prevent data corruption
 */

import { UUID, SafeBigInt } from '../types/branded';

/**
 * Validates that a string is a properly formatted UUID
 */
export function validateUUID(value: string): value is UUID {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates that a value can be safely used as SafeBigInt
 */
export function validateSafeBigInt(value: unknown): value is SafeBigInt {
  if (typeof value === 'bigint') {
    return true;
  }
  
  if (typeof value === 'string') {
    // Check if it's a valid numeric string
    return /^\d+$/.test(value) && !isNaN(Number(value));
  }
  
  if (typeof value === 'number') {
    // Check if it's a safe integer
    return Number.isSafeInteger(value) && value >= 0;
  }
  
  return false;
}

/**
 * Validates email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Validates that a string is not empty and meets minimum length requirements
 */
export function validateNonEmptyString(value: string, minLength: number = 1): boolean {
  return typeof value === 'string' && value.trim().length >= minLength;
}

/**
 * Validates URL format
 */
export function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that a number is within specified bounds
 */
export function validateNumberRange(value: number, min?: number, max?: number): boolean {
  if (typeof value !== 'number' || !isFinite(value)) {
    return false;
  }
  
  if (min !== undefined && value < min) {
    return false;
  }
  
  if (max !== undefined && value > max) {
    return false;
  }
  
  return true;
}

/**
 * Validates campaign status enum
 */
export function validateCampaignStatus(status: string): boolean {
  const validStatuses = ['draft', 'running', 'paused', 'completed', 'failed', 'cancelled'];
  return validStatuses.includes(status.toLowerCase());
}

/**
 * Validates user role enum
 */
export function validateUserRole(role: string): boolean {
  const validRoles = ['admin', 'user', 'viewer'];
  return validRoles.includes(role.toLowerCase());
}

/**
 * Custom error for validation failures
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: unknown
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Generic validator function type
 */
export type Validator<T> = (value: unknown) => value is T;

/**
 * Creates a validator for objects with specific shape
 */
export function createObjectValidator<T>(
  validators: Record<string, (value: unknown) => boolean>
): Validator<T> {
  return (value: unknown): value is T => {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    
    const obj = value as Record<string, unknown>;
    
    for (const [key, validator] of Object.entries(validators)) {
      if (!validator(obj[key])) {
        return false;
      }
    }
    
    return true;
  };
}

/**
 * Creates a validator for arrays of specific type
 */
export function createArrayValidator<T>(
  itemValidator: Validator<T>
): Validator<T[]> {
  return (value: unknown): value is T[] => {
    if (!Array.isArray(value)) {
      return false;
    }
    
    return value.every(itemValidator);
  };
}

/**
 * Validates a partial object (useful for updates)
 */
export function validatePartial<T>(
  value: unknown,
  validators: Partial<Record<keyof T, (value: unknown) => boolean>>
): value is Partial<T> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  
  const obj = value as Record<string, unknown>;
  
  for (const [key, validator] of Object.entries(validators) as [keyof T, (value: unknown) => boolean][]) {
    if (key in obj && !validator(obj[key as string])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Sanitizes string input by trimming and removing dangerous characters
 */
export function sanitizeString(input: string): string {
  return input
    .trim()
    .replace(/[<>\"']/g, '') // Remove basic XSS vectors
    .replace(/\0/g, ''); // Remove null bytes
}

/**
 * Deep validates an object structure
 */
export function deepValidate(
  value: unknown,
  schema: Record<string, unknown>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  function validate(obj: unknown, schemaObj: unknown, path = ''): void {
    if (typeof schemaObj !== 'object' || schemaObj === null) {
      return;
    }
    
    for (const [key, validator] of Object.entries(schemaObj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const value = (obj as Record<string, unknown>)?.[key];
      
      if (typeof validator === 'function') {
        if (!validator(value)) {
          errors.push(`Validation failed for field: ${currentPath}`);
        }
      } else if (typeof validator === 'object') {
        validate(value, validator, currentPath);
      }
    }
  }
  
  validate(value, schema);
  
  return {
    isValid: errors.length === 0,
    errors
  };
}
