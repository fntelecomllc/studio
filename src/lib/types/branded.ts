// src/lib/types/branded.ts
// Branded types for improved type safety

/**
 * Branded UUID type for better type safety
 * Prevents accidental string/UUID mismatches
 */
export type UUID = string & { readonly __brand: unique symbol };

/**
 * Branded BigInt type for large numbers
 * Prevents precision loss with large integers
 */
export type SafeBigInt = bigint & { readonly __brand: unique symbol };

/**
 * Type guard to check if a string is a valid UUID
 */
export function isValidUUID(value: string): value is UUID {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Create a branded UUID from a string (with validation)
 */
export function createUUID(value: string): UUID {
  if (!isValidUUID(value)) {
    throw new Error(`Invalid UUID format: ${value}`);
  }
  return value as UUID;
}

/**
 * Create a branded UUID from a string (unsafe - no validation)
 * Use only when you're certain the string is a valid UUID
 */
export function unsafeCreateUUID(value: string): UUID {
  return value as UUID;
}

/**
 * Create a branded SafeBigInt from a number or bigint
 */
export function createSafeBigInt(value: number | bigint | string): SafeBigInt {
  return BigInt(value) as SafeBigInt;
}

/**
 * Convert SafeBigInt to regular number (with overflow check)
 */
export function safeBigIntToNumber(value: SafeBigInt): number {
  const num = Number(value);
  if (num > Number.MAX_SAFE_INTEGER) {
    console.warn(`BigInt value ${value} exceeds MAX_SAFE_INTEGER, precision may be lost`);
  }
  return num;
}

/**
 * Branded Date type for consistent date handling
 */
export type ISODateString = string & { readonly __brand: unique symbol };

/**
 * Create a branded ISO date string
 */
export function createISODateString(date: Date | string): ISODateString {
  if (typeof date === 'string') {
    // Validate ISO date format
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid date string: ${date}`);
    }
    return date as ISODateString;
  }
  return date.toISOString() as ISODateString;
}

/**
 * Convert ISO date string to Date object
 */
export function parseISODateString(dateString: ISODateString): Date {
  return new Date(dateString);
}
