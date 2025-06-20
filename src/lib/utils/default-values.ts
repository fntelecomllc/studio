/**
 * Default Values Utility
 * Provides consistent default value handling across the application
 * Ensures alignment with backend initialization patterns
 */

import { createSafeBigInt } from '@/lib/types/branded';
import type { SafeBigInt, UUID, ISODateString } from '@/lib/types/branded';

/**
 * Default value constants aligned with backend
 */
export const DEFAULT_VALUES = {
  // Numeric defaults
  ZERO: createSafeBigInt(0),
  ONE: createSafeBigInt(1),
  ZERO_NUMBER: 0,
  
  // String defaults
  EMPTY_STRING: '',
  DEFAULT_CHARSET: 'abcdefghijklmnopqrstuvwxyz0123456789',
  DEFAULT_TLD: '.com',
  
  // Boolean defaults
  FALSE: false,
  TRUE: true,
  
  // Object defaults
  EMPTY_OBJECT: {} as const,
  EMPTY_ARRAY: [] as const,
  
  // Null handling - prefer undefined over null for optional fields
  OPTIONAL_STRING: undefined as string | undefined,
  OPTIONAL_NUMBER: undefined as number | undefined,
  OPTIONAL_BIGINT: undefined as SafeBigInt | undefined,
  OPTIONAL_BOOLEAN: undefined as boolean | undefined,
  OPTIONAL_UUID: undefined as UUID | undefined,
  OPTIONAL_DATE: undefined as ISODateString | undefined,
} as const;

/**
 * Handle null vs undefined consistently
 * Backend uses null for SQL nullable fields, frontend prefers undefined
 */
export function normalizeOptionalValue<T>(
  value: T | null | undefined,
  defaultValue?: T
): T | undefined {
  if (value === null || value === undefined) {
    return defaultValue ?? undefined;
  }
  return value;
}

/**
 * Normalize array handling - empty array vs null/undefined
 */
export function normalizeArray<T>(
  value: T[] | null | undefined,
  defaultToEmpty: boolean = true
): T[] | undefined {
  if (value === null || value === undefined) {
    return defaultToEmpty ? [] : undefined;
  }
  return value;
}

/**
 * Normalize boolean with proper default
 */
export function normalizeBoolean(
  value: boolean | null | undefined,
  defaultValue: boolean = false
): boolean {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
}

/**
 * Normalize numeric values with SafeBigInt handling
 */
export function normalizeNumeric(
  value: number | string | bigint | null | undefined,
  defaultValue: number = 0,
  useSafeBigInt: boolean = false
): number | SafeBigInt | undefined {
  if (value === null || value === undefined) {
    return useSafeBigInt ? createSafeBigInt(defaultValue) : defaultValue;
  }
  
  if (useSafeBigInt) {
    return createSafeBigInt(value);
  }
  
  return typeof value === 'number' ? value : Number(value);
}

/**
 * Form field default values aligned with backend
 */
export const FORM_DEFAULTS = {
  // Campaign form defaults
  campaign: {
    name: '',
    description: undefined as string | undefined,
    campaignType: undefined as string | undefined,
    
    // Domain generation defaults
    generationPattern: 'prefix_variable' as const,
    constantPart: 'business',
    allowedCharSet: DEFAULT_VALUES.DEFAULT_CHARSET,
    tldsInput: DEFAULT_VALUES.DEFAULT_TLD,
    prefixVariableLength: 3,
    suffixVariableLength: 0,
    maxDomainsToGenerate: 1000,
    
    // Validation defaults
    rotationIntervalSeconds: 300,
    processingSpeedPerMinute: 60,
    batchSize: 10,
    retryAttempts: 3,
    
    // HTTP defaults
    targetHttpPorts: [80, 443],
    
    // Assignment defaults
    proxyAssignmentMode: 'none' as const,
  },
  
  // User form defaults
  user: {
    email: '',
    firstName: '',
    lastName: '',
    isActive: true,
    isLocked: false,
    mustChangePassword: false,
    mfaEnabled: false,
    emailVerified: false,
  },
  
  // Persona form defaults
  persona: {
    name: '',
    description: undefined as string | undefined,
    isEnabled: true,
    personaType: undefined as string | undefined,
  },
  
  // Proxy form defaults
  proxy: {
    name: '',
    description: undefined as string | undefined,
    protocol: 'http' as const,
    address: '',
    port: undefined as number | undefined,
    username: undefined as string | undefined,
    password: undefined as string | undefined,
    isEnabled: true,
    isHealthy: false,
  },
} as const;

/**
 * API response default transformations
 */
export function applyResponseDefaults<T extends Record<string, unknown>>(
  data: Partial<T>,
  defaults: Partial<T>
): T {
  const result = { ...defaults } as T;
  
  for (const key in data) {
    const value = data[key];
    if (value !== null && value !== undefined) {
      result[key] = value as T[typeof key];
    }
  }
  
  return result;
}