/**
 * Comprehensive runtime validation middleware for API responses
 * Prevents data corruption and ensures type safety at runtime
 */

import { 
  UUID, 
  SafeBigInt, 
  Email, 
  URL as BrandedURL,
  createSafeBigInt,
  createUUID,
  createEmail,
  createURL,
  isValidUUID,
  isValidEmail,
  isValidURL
} from '../types/branded';
import { 
  ModelsCampaignAPI, 
  ModelsUserAPI, 
  ModelsGeneratedDomainAPI,
  transformCampaignResponse,
  transformUserResponse,
  transformGeneratedDomainResponse
} from '../types/models-aligned';

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors: ValidationError[];
}

/**
 * Validation error with context
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
  code?: string;
}

/**
 * Type predicate for safe validation
 */
export type TypePredicate<T> = (value: unknown) => value is T;

/**
 * Validator function type
 */
export type Validator<T> = (value: unknown) => ValidationResult<T>;

// ============================================================================
// BASE TYPE VALIDATORS
// ============================================================================

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

// ============================================================================
// BRANDED TYPE VALIDATORS
// ============================================================================

export function validateUUID(value: unknown): ValidationResult<UUID> {
  if (!isString(value)) {
    return {
      isValid: false,
      errors: [{ field: 'uuid', message: 'Value must be a string', value }]
    };
  }

  if (!isValidUUID(value)) {
    return {
      isValid: false,
      errors: [{ field: 'uuid', message: 'Invalid UUID format', value }]
    };
  }

  return {
    isValid: true,
    data: createUUID(value),
    errors: []
  };
}

export function validateSafeBigInt(value: unknown): ValidationResult<SafeBigInt> {
  try {
    const safeBigInt = createSafeBigInt(value as string | number | bigint);
    return {
      isValid: true,
      data: safeBigInt,
      errors: []
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [{
        field: 'bigint',
        message: error instanceof Error ? error.message : 'Invalid BigInt value',
        value
      }]
    };
  }
}

export function validateEmail(value: unknown): ValidationResult<Email> {
  if (!isString(value)) {
    return {
      isValid: false,
      errors: [{ field: 'email', message: 'Value must be a string', value }]
    };
  }

  if (!isValidEmail(value)) {
    return {
      isValid: false,
      errors: [{ field: 'email', message: 'Invalid email format', value }]
    };
  }

  return {
    isValid: true,
    data: createEmail(value),
    errors: []
  };
}

export function validateURL(value: unknown): ValidationResult<BrandedURL> {
  if (!isString(value)) {
    return {
      isValid: false,
      errors: [{ field: 'url', message: 'Value must be a string', value }]
    };
  }

  if (!isValidURL(value)) {
    return {
      isValid: false,
      errors: [{ field: 'url', message: 'Invalid URL format', value }]
    };
  }

  return {
    isValid: true,
    data: createURL(value),
    errors: []
  };
}

// ============================================================================
// ENUM VALIDATORS
// ============================================================================

export const CampaignStatusEnum = {
  DRAFT: 'draft',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
} as const;

export type CampaignStatus = typeof CampaignStatusEnum[keyof typeof CampaignStatusEnum];

export function validateCampaignStatus(value: unknown): ValidationResult<CampaignStatus> {
  if (!isString(value)) {
    return {
      isValid: false,
      errors: [{ field: 'status', message: 'Status must be a string', value }]
    };
  }

  const validStatuses = Object.values(CampaignStatusEnum);
  if (!validStatuses.includes(value as CampaignStatus)) {
    return {
      isValid: false,
      errors: [{ 
        field: 'status', 
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        value 
      }]
    };
  }

  return {
    isValid: true,
    data: value as CampaignStatus,
    errors: []
  };
}

export const UserRoleEnum = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer'
} as const;

export type UserRole = typeof UserRoleEnum[keyof typeof UserRoleEnum];

export function validateUserRole(value: unknown): ValidationResult<UserRole> {
  if (!isString(value)) {
    return {
      isValid: false,
      errors: [{ field: 'role', message: 'Role must be a string', value }]
    };
  }

  const validRoles = Object.values(UserRoleEnum);
  if (!validRoles.includes(value as UserRole)) {
    return {
      isValid: false,
      errors: [{ 
        field: 'role', 
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
        value 
      }]
    };
  }

  return {
    isValid: true,
    data: value as UserRole,
    errors: []
  };
}

// ============================================================================
// OBJECT VALIDATORS
// ============================================================================

export function validateObject<T>(
  value: unknown,
  fieldValidators: Record<string, Validator<unknown>>
): ValidationResult<T> {
  if (!isObject(value)) {
    return {
      isValid: false,
      errors: [{ field: 'root', message: 'Value must be an object', value }]
    };
  }

  const errors: ValidationError[] = [];
  const result: Record<string, unknown> = {};

  for (const [field, validator] of Object.entries(fieldValidators)) {
    const fieldValue = value[field];
    const validation = validator(fieldValue);

    if (!validation.isValid) {
      errors.push(...validation.errors.map(error => ({
        ...error,
        field: `${field}.${error.field}`
      })));
    } else {
      result[field] = validation.data;
    }
  }

  return {
    isValid: errors.length === 0,
    data: errors.length === 0 ? result as T : undefined,
    errors
  };
}

export function validateArray<T>(
  value: unknown,
  itemValidator: Validator<T>
): ValidationResult<T[]> {
  if (!isArray(value)) {
    return {
      isValid: false,
      errors: [{ field: 'root', message: 'Value must be an array', value }]
    };
  }

  const errors: ValidationError[] = [];
  const result: T[] = [];

  value.forEach((item, index) => {
    const validation = itemValidator(item);
    
    if (!validation.isValid) {
      errors.push(...validation.errors.map(error => ({
        ...error,
        field: `[${index}].${error.field}`
      })));
    } else if (validation.data !== undefined) {
      result.push(validation.data);
    }
  });

  return {
    isValid: errors.length === 0,
    data: errors.length === 0 ? result : undefined,
    errors
  };
}

// ============================================================================
// API RESPONSE VALIDATORS
// ============================================================================

/**
 * Validate campaign API response
 */
export function validateCampaignResponse(value: unknown): ValidationResult<ModelsCampaignAPI> {
  try {
    if (!isObject(value)) {
      return {
        isValid: false,
        errors: [{ field: 'campaign', message: 'Campaign must be an object', value }]
      };
    }

    // Use the transformation function which includes validation
    const transformed = transformCampaignResponse(value);
    
    return {
      isValid: true,
      data: transformed,
      errors: []
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [{
        field: 'campaign',
        message: error instanceof Error ? error.message : 'Invalid campaign data',
        value
      }]
    };
  }
}

/**
 * Validate user API response
 */
export function validateUserResponse(value: unknown): ValidationResult<ModelsUserAPI> {
  try {
    if (!isObject(value)) {
      return {
        isValid: false,
        errors: [{ field: 'user', message: 'User must be an object', value }]
      };
    }

    // Use the transformation function which includes validation
    const transformed = transformUserResponse(value);
    
    return {
      isValid: true,
      data: transformed,
      errors: []
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [{
        field: 'user',
        message: error instanceof Error ? error.message : 'Invalid user data',
        value
      }]
    };
  }
}

/**
 * Validate generated domain API response
 */
export function validateGeneratedDomainResponse(value: unknown): ValidationResult<ModelsGeneratedDomainAPI> {
  try {
    if (!isObject(value)) {
      return {
        isValid: false,
        errors: [{ field: 'domain', message: 'Domain must be an object', value }]
      };
    }

    // Use the transformation function which includes validation
    const transformed = transformGeneratedDomainResponse(value);
    
    return {
      isValid: true,
      data: transformed,
      errors: []
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [{
        field: 'domain',
        message: error instanceof Error ? error.message : 'Invalid domain data',
        value
      }]
    };
  }
}

// ============================================================================
// PAGINATION VALIDATORS
// ============================================================================

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function validatePaginationParams(value: unknown): ValidationResult<PaginationParams> {
  if (!isObject(value)) {
    return {
      isValid: false,
      errors: [{ field: 'pagination', message: 'Pagination must be an object', value }]
    };
  }

  const errors: ValidationError[] = [];
  const result: Partial<PaginationParams> = {};

  // Validate page
  if (!isNumber(value.page) || value.page < 1) {
    errors.push({ field: 'page', message: 'Page must be a positive number', value: value.page });
  } else {
    result.page = value.page;
  }

  // Validate pageSize
  if (!isNumber(value.pageSize) || value.pageSize < 1 || value.pageSize > 100) {
    errors.push({ field: 'pageSize', message: 'Page size must be between 1 and 100', value: value.pageSize });
  } else {
    result.pageSize = value.pageSize;
  }

  // Validate optional sortBy
  if (value.sortBy !== undefined) {
    if (!isString(value.sortBy)) {
      errors.push({ field: 'sortBy', message: 'Sort by must be a string', value: value.sortBy });
    } else {
      result.sortBy = value.sortBy;
    }
  }

  // Validate optional sortOrder
  if (value.sortOrder !== undefined) {
    if (!isString(value.sortOrder) || !['asc', 'desc'].includes(value.sortOrder)) {
      errors.push({ field: 'sortOrder', message: 'Sort order must be "asc" or "desc"', value: value.sortOrder });
    } else {
      result.sortOrder = value.sortOrder as 'asc' | 'desc';
    }
  }

  return {
    isValid: errors.length === 0,
    data: errors.length === 0 ? result as PaginationParams : undefined,
    errors
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a required field validator
 */
export function required<T>(validator: Validator<T>): Validator<T> {
  return (value: unknown): ValidationResult<T> => {
    if (!isDefined(value)) {
      return {
        isValid: false,
        errors: [{ field: 'value', message: 'Field is required', value }]
      };
    }
    return validator(value);
  };
}

/**
 * Create an optional field validator
 */
export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value: unknown): ValidationResult<T | undefined> => {
    if (!isDefined(value)) {
      return {
        isValid: true,
        data: undefined,
        errors: []
      };
    }
    return validator(value);
  };
}

/**
 * Combine multiple validators
 */
export function combine<T>(...validators: Validator<T>[]): Validator<T> {
  return (value: unknown): ValidationResult<T> => {
    const errors: ValidationError[] = [];
    let result: T | undefined;

    for (const validator of validators) {
      const validation = validator(value);
      if (!validation.isValid) {
        errors.push(...validation.errors);
      } else {
        result = validation.data;
      }
    }

    return {
      isValid: errors.length === 0,
      data: result,
      errors
    };
  };
}

/**
 * Create a string length validator
 */
export function stringLength(min: number, max: number): Validator<string> {
  return (value: unknown): ValidationResult<string> => {
    if (!isString(value)) {
      return {
        isValid: false,
        errors: [{ field: 'value', message: 'Value must be a string', value }]
      };
    }

    if (value.length < min || value.length > max) {
      return {
        isValid: false,
        errors: [{ 
          field: 'value', 
          message: `String length must be between ${min} and ${max} characters`,
          value 
        }]
      };
    }

    return {
      isValid: true,
      data: value,
      errors: []
    };
  };
}

/**
 * Create a number range validator
 */
export function numberRange(min: number, max: number): Validator<number> {
  return (value: unknown): ValidationResult<number> => {
    if (!isNumber(value)) {
      return {
        isValid: false,
        errors: [{ field: 'value', message: 'Value must be a number', value }]
      };
    }

    if (value < min || value > max) {
      return {
        isValid: false,
        errors: [{ 
          field: 'value', 
          message: `Number must be between ${min} and ${max}`,
          value 
        }]
      };
    }

    return {
      isValid: true,
      data: value,
      errors: []
    };
  };
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class RuntimeValidationError extends Error {
  constructor(
    message: string,
    public errors: ValidationError[],
    public value?: unknown
  ) {
    super(message);
    this.name = 'RuntimeValidationError';
  }
}

/**
 * Assert validation result or throw
 */
export function assertValid<T>(
  result: ValidationResult<T>,
  errorMessage?: string
): asserts result is ValidationResult<T> & { isValid: true; data: T } {
  if (!result.isValid) {
    throw new RuntimeValidationError(
      errorMessage || 'Validation failed',
      result.errors
    );
  }
}

/**
 * Validate and return data or throw
 */
export function validateOrThrow<T>(
  value: unknown,
  validator: Validator<T>,
  errorMessage?: string
): T {
  const result = validator(value);
  assertValid(result, errorMessage);
  return result.data;
}