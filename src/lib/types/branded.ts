/**
 * ENHANCED BRANDED TYPES FOR INT64 SAFETY
 * 
 * JavaScript's number type can only safely represent integers up to 2^53 - 1,
 * while Go's int64 can represent values up to 2^63 - 1. This mismatch causes
 * critical data corruption issues when handling large numeric values from the backend.
 * 
 * This module provides enhanced branded types with validation, serialization,
 * and conversion utilities to ensure type safety across the application.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

// Maximum safe integer in JavaScript (2^53 - 1)
export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER; // 9,007,199,254,740,991

// Minimum safe integer in JavaScript (-(2^53 - 1))
export const MIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER; // -9,007,199,254,740,991

// Go int64 max value (2^63 - 1)
export const GO_INT64_MAX = BigInt("9223372036854775807");

// Go int64 min value (-2^63)
export const GO_INT64_MIN = BigInt("-9223372036854775808");

// ============================================================================
// BRANDED TYPE DEFINITIONS
// ============================================================================

/**
 * Brand symbol for compile-time type safety
 */
declare const brand: unique symbol;

/**
 * Generic branded type pattern
 */
type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

/**
 * SafeBigInt - A branded type for int64 values
 * Ensures values from Go backend are properly handled
 */
export type SafeBigInt = Brand<bigint, 'SafeBigInt'>;

/**
 * UUID - Branded type for unique identifiers
 */
export type UUID = Brand<string, 'UUID'>;

/**
 * ISODateString - Branded type for ISO 8601 date strings
 */
export type ISODateString = Brand<string, 'ISODateString'>;

/**
 * Email - Branded type for validated email addresses
 */
export type Email = Brand<string, 'Email'>;

/**
 * URL - Branded type for validated URLs
 */
export type URL = Brand<string, 'URL'>;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Check if a value can be safely represented as a JavaScript number
 */
export function isSafeInteger(value: bigint): boolean {
  return value >= MIN_SAFE_INTEGER && value <= MAX_SAFE_INTEGER;
}

/**
 * Check if a value is within Go int64 range
 */
export function isValidInt64(value: bigint): boolean {
  return value >= GO_INT64_MIN && value <= GO_INT64_MAX;
}

/**
 * Validate UUID format (any version)
 */
export function isValidUUID(value: string): value is UUID {
  // Accepts any valid UUID format (v1, v3, v4, v5, etc.)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate ISO 8601 date string
 */
export function isValidISODate(value: string): boolean {
  // Check if it can be parsed as a valid date
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return false;
  }
  
  // Basic ISO 8601 format check (allows various valid formats)
  // Supports: YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ss.sssZ, etc.
  const isoRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;
  return isoRegex.test(value);
}

/**
 * Validate email format
 */
export function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validate URL format
 */
export function isValidURL(value: string): boolean {
  try {
    new globalThis.URL(value);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// CREATION FUNCTIONS WITH VALIDATION
// ============================================================================

/**
 * Create a SafeBigInt from various input types
 * Throws if the value is invalid or out of range
 */
export function createSafeBigInt(value: string | number | bigint): SafeBigInt {
  let bigIntValue: bigint;
  
  try {
    if (typeof value === 'string') {
      // Handle string representation (from JSON)
      bigIntValue = BigInt(value);
    } else if (typeof value === 'number') {
      // Ensure number is an integer
      if (!Number.isInteger(value)) {
        throw new Error(`Value must be an integer, got: ${value}`);
      }
      bigIntValue = BigInt(value);
    } else {
      bigIntValue = value;
    }
    
    // Validate it's within Go int64 range
    if (!isValidInt64(bigIntValue)) {
      throw new Error(`Value ${bigIntValue} exceeds Go int64 range`);
    }
    
    return bigIntValue as SafeBigInt;
  } catch {
    throw new Error(`Failed to create SafeBigInt: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a SafeBigInt, returning null on failure
 */
export function tryCreateSafeBigInt(value: unknown): SafeBigInt | null {
  try {
    if (value === null || value === undefined) {
      return null;
    }
    return createSafeBigInt(value as string | number | bigint);
  } catch {
    return null;
  }
}

/**
 * Create a UUID with validation
 */
export function createUUID(value: string): UUID {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid UUID format: ${value}`);
  }
  return value as UUID;
}

/**
 * Create an ISODateString with validation
 */
export function createISODateString(value: string | Date): ISODateString {
  const dateString = value instanceof Date ? value.toISOString() : value;
  if (!isValidISODate(dateString)) {
    throw new Error(`Invalid ISO date format: ${dateString}`);
  }
  return dateString as ISODateString;
}

/**
 * Create an Email with validation
 */
export function createEmail(value: string): Email {
  if (!isValidEmail(value)) {
    throw new Error(`Invalid email format: ${value}`);
  }
  return value.toLowerCase() as Email;
}

/**
 * Create a URL with validation
 */
export function createURL(value: string): URL {
  if (!isValidURL(value)) {
    throw new Error(`Invalid URL format: ${value}`);
  }
  return value as URL;
}

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

/**
 * Convert SafeBigInt to number if safe, otherwise throw
 */
export function toNumber(value: SafeBigInt): number {
  if (!isSafeInteger(value)) {
    throw new Error(
      `Cannot convert SafeBigInt to number: ${value} exceeds safe integer range. ` +
      `Use toString() or keep as BigInt for values larger than ${MAX_SAFE_INTEGER}`
    );
  }
  return Number(value);
}

/**
 * Convert SafeBigInt to number if safe, otherwise return null
 */
export function tryToNumber(value: SafeBigInt): number | null {
  return isSafeInteger(value) ? Number(value) : null;
}

/**
 * Convert SafeBigInt to string for serialization
 */
export function toString(value: SafeBigInt): string {
  return value.toString();
}

// ============================================================================
// JSON SERIALIZATION HELPERS
// ============================================================================

/**
 * Custom JSON replacer that handles SafeBigInt serialization
 */
export function safeBigIntReplacer(key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    // For values that fit in safe integer range, serialize as number
    // Otherwise, serialize as string to prevent precision loss
    if (value >= MIN_SAFE_INTEGER && value <= MAX_SAFE_INTEGER) {
      return Number(value);
    }
    return value.toString();
  }
  return value;
}

/**
 * Parse JSON with SafeBigInt support
 */
export function parseJSONWithBigInt(text: string, int64Fields: Set<string>): unknown {
  return JSON.parse(text, (key, value) => {
    // If this field is known to be int64 and value is numeric
    if (int64Fields.has(key) && (typeof value === 'number' || typeof value === 'string')) {
      return createSafeBigInt(value);
    }
    return value;
  });
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isSafeBigInt(value: unknown): value is SafeBigInt {
  return typeof value === 'bigint';
}

export function isUUID(value: unknown): value is UUID {
  return typeof value === 'string' && isValidUUID(value);
}

export function isISODateString(value: unknown): value is ISODateString {
  return typeof value === 'string' && isValidISODate(value);
}

export function isEmail(value: unknown): value is Email {
  return typeof value === 'string' && isValidEmail(value);
}

export function isURL(value: unknown): value is URL {
  return typeof value === 'string' && isValidURL(value);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Transform an object's int64 fields to SafeBigInt
 */
export function transformInt64Fields<T extends Record<string, unknown>>(
  obj: T,
  int64Fields: (keyof T)[]
): T {
  const result = { ...obj };
  
  for (const field of int64Fields) {
    const value = obj[field];
    if (value !== null && value !== undefined) {
      result[field] = createSafeBigInt(value as string | number | bigint) as unknown as T[keyof T];
    }
  }
  
  return result;
}

/**
 * Prepare object for JSON serialization by converting SafeBigInt fields
 */
export function prepareForSerialization<T extends Record<string, unknown>>(
  obj: T,
  bigIntFields: (keyof T)[]
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...obj };
  
  for (const field of bigIntFields) {
    const value = obj[field];
    if (isSafeBigInt(value)) {
      // Use string for values outside safe range
      result[field as string] = isSafeInteger(value) ? Number(value) : value.toString();
    }
  }
  
  return result;
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class SafeBigIntError extends Error {
  constructor(message: string, public readonly value?: unknown) {
    super(message);
    this.name = 'SafeBigIntError';
  }
}

export class BrandedTypeError extends Error {
  constructor(public readonly type: string, message: string, public readonly value?: unknown) {
    super(message);
    this.name = 'BrandedTypeError';
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

/**
 * @deprecated Use createUUID instead
 */
export const unsafeCreateUUID = createUUID;

/**
 * @deprecated Use toNumber or tryToNumber instead
 */
export const safeBigIntToNumber = toNumber;

/**
 * @deprecated Use createISODateString(dateString) instead
 */
export function parseISODateString(dateString: ISODateString): Date {
  return new Date(dateString);
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Handling API response with int64 fields
 * 
 * ```typescript
 * interface CampaignStats {
 *   campaignId: UUID;
 *   totalDomains: SafeBigInt;
 *   processedDomains: SafeBigInt;
 *   createdAt: ISODateString;
 * }
 * 
 * // Parse API response
 * const response = await fetch('/api/campaign/stats');
 * const data = await response.json();
 * 
 * const stats: CampaignStats = {
 *   campaignId: createUUID(data.campaignId),
 *   totalDomains: createSafeBigInt(data.totalDomains),
 *   processedDomains: createSafeBigInt(data.processedDomains),
 *   createdAt: createISODateString(data.createdAt)
 * };
 * 
 * // Safe display - handles large numbers correctly
 * console.log(`Total domains: ${stats.totalDomains.toString()}`);
 * 
 * // Calculate percentage if safe
 * const processed = tryToNumber(stats.processedDomains);
 * const total = tryToNumber(stats.totalDomains);
 * if (processed !== null && total !== null && total > 0) {
 *   const percentage = (processed / total) * 100;
 *   console.log(`Progress: ${percentage.toFixed(2)}%`);
 * }
 * ```
 */

/**
 * Example: Sending data to API
 * 
 * ```typescript
 * const request = {
 *   campaignId: campaign.id,
 *   limit: createSafeBigInt(1000),
 *   offset: createSafeBigInt(0)
 * };
 * 
 * // Serialize for API
 * const body = JSON.stringify(request, safeBigIntReplacer);
 * 
 * await fetch('/api/domains', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body
 * });
 * ```
 */
