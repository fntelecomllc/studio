import { z } from 'zod';

/**
 * @description Zod schema for UUID strings.
 * Matches the format of a standard UUID (e.g., "123e4567-e89b-12d3-a456-426614174000").
 */
export const uuidSchema = z.string().uuid({ message: "Invalid UUID format" });

/**
 * @description Zod schema for ISO 8601 timestamp strings.
 * Validates that the string is a valid ISO 8601 date-time format.
 */
export const timestampSchema = z.string().datetime({ message: "Invalid ISO 8601 timestamp format" });

/**
 * @description Zod schema for a generic API success response.
 * @template T - The type of the data payload.
 */
export const apiSuccessResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.any(), // Data type will be refined by .merge or .extend
});

/**
 * @description Zod schema for a generic API error response.
 * Includes a message and an optional array of errors.
 */
export const apiErrorResponseSchema = z.object({
  status: z.literal('error'),
  message: z.string(),
  errors: z.array(z.object({
    field: z.string().optional(),
    message: z.string(),
  })).optional(),
});

/**
 * @description Zod schema for a generic API response that can be either success or error.
 * @template T - The type of the data payload for a success response.
 */
export const apiResponseSchema = z.union([apiSuccessResponseSchema, apiErrorResponseSchema]);

/**
 * @description Zod schema for a generic API response that can be either success or error.
 * @template T - The type of the data payload for a success response.
 */

/**
 * @description Zod schema for pagination metadata.
 */
export const paginationSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

/**
 * @description Zod schema for an API list response with pagination.
 * @template T - The type of the items in the list.
 */
export const apiListResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string().optional(),
  data: z.array(z.any()), // Array of items, type will be refined
  pagination: paginationSchema.optional(),
});

/**
 * @description Type guard for API success response.
 * @template T - The expected data type.
 * @param {ApiResponse<T>} response - The API response to check.
 * @returns {response is z.infer<typeof apiSuccessResponseSchema> & { data: T }} True if the response is a success response with the expected data type.
 */
export function isApiSuccessResponse<T>(response: unknown): response is z.infer<typeof apiSuccessResponseSchema> & { data: T } {
  return typeof response === 'object' && response !== null && 'status' in response && (response as { status: unknown }).status === 'success';
}

/**
 * @description Type guard for API error response.
 * @param {ApiResponse<unknown>} response - The API response to check.
 * @returns {response is z.infer<typeof apiErrorResponseSchema>} True if the response is an error response.
 */
export function isApiErrorResponse(response: unknown): response is z.infer<typeof apiErrorResponseSchema> {
  return typeof response === 'object' && response !== null && 'status' in response && (response as { status: unknown }).status === 'error';
}