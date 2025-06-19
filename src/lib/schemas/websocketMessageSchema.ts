/**
 * WebSocket Message Schema Definitions
 * Aligned with backend message structure for type-safe real-time communication
 */

import { z } from 'zod';

// Base branded type schemas
export const uuidSchema = z.string().uuid();
export const safeBigIntSchema = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().nonnegative(),
  z.bigint()
]).transform((val) => {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'string') return BigInt(val);
  return BigInt(val);
});

// Campaign progress payload schema
export const campaignProgressPayloadSchema = z.object({
  campaignId: uuidSchema,
  totalItems: safeBigIntSchema,
  processedItems: safeBigIntSchema,
  successfulItems: safeBigIntSchema,
  failedItems: safeBigIntSchema,
  progressPercent: z.number().min(0).max(100),
  currentSpeed: z.number().optional(),
  estimatedTimeRemaining: z.number().optional(),
});

// Campaign status payload schema
export const campaignStatusPayloadSchema = z.object({
  campaignId: uuidSchema,
  status: z.enum(['draft', 'running', 'paused', 'completed', 'failed', 'cancelled']),
  message: z.string().optional(),
  timestamp: z.string().datetime(),
});

// Domain result payload schema
export const domainResultPayloadSchema = z.object({
  campaignId: uuidSchema,
  domain: z.string(),
  status: z.enum(['available', 'taken', 'error', 'timeout']),
  registrar: z.string().optional(),
  price: z.number().optional(),
  timestamp: z.string().datetime(),
});

// System status payload schema
export const systemStatusPayloadSchema = z.object({
  component: z.string(),
  status: z.enum(['healthy', 'degraded', 'down']),
  message: z.string().optional(),
  timestamp: z.string().datetime(),
});

// Error payload schema
export const errorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

// Base WebSocket message schema
export const webSocketMessageSchema = z.object({
  type: z.string(),
  timestamp: z.string().datetime(),
  data: z.unknown(),
});

// Typed message schemas
export const campaignProgressMessageSchema = webSocketMessageSchema.extend({
  type: z.literal('campaign.progress'),
  data: campaignProgressPayloadSchema,
});

export const campaignStatusMessageSchema = webSocketMessageSchema.extend({
  type: z.literal('campaign.status'),
  data: campaignStatusPayloadSchema,
});

export const domainResultMessageSchema = webSocketMessageSchema.extend({
  type: z.literal('domain.result'),
  data: domainResultPayloadSchema,
});

export const systemStatusMessageSchema = webSocketMessageSchema.extend({
  type: z.literal('system.status'),
  data: systemStatusPayloadSchema,
});

export const errorMessageSchema = webSocketMessageSchema.extend({
  type: z.literal('error'),
  data: errorPayloadSchema,
});

// Union of all possible message types
export const typedWebSocketMessageSchema = z.discriminatedUnion('type', [
  campaignProgressMessageSchema,
  campaignStatusMessageSchema,
  domainResultMessageSchema,
  systemStatusMessageSchema,
  errorMessageSchema,
]);

// Type exports
export type WebSocketMessage = z.infer<typeof webSocketMessageSchema>;
export type TypedWebSocketMessage = z.infer<typeof typedWebSocketMessageSchema>;
export type CampaignProgressPayload = z.infer<typeof campaignProgressPayloadSchema>;
export type CampaignStatusPayload = z.infer<typeof campaignStatusPayloadSchema>;
export type DomainResultPayload = z.infer<typeof domainResultPayloadSchema>;
export type SystemStatusPayload = z.infer<typeof systemStatusPayloadSchema>;
export type ErrorPayload = z.infer<typeof errorPayloadSchema>;

// Message type enum for type safety
export enum WebSocketMessageType {
  CAMPAIGN_PROGRESS = 'campaign.progress',
  CAMPAIGN_STATUS = 'campaign.status',
  DOMAIN_RESULT = 'domain.result',
  SYSTEM_STATUS = 'system.status',
  ERROR = 'error',
}

// Type-safe message handlers
export function parseWebSocketMessage(message: unknown): TypedWebSocketMessage {
  return typedWebSocketMessageSchema.parse(message);
}

export function validateWebSocketMessage(message: unknown): message is TypedWebSocketMessage {
  const result = typedWebSocketMessageSchema.safeParse(message);
  return result.success;
}

// Legacy compatibility - for gradual migration
export function parseWebSocketMessageLegacy(message: unknown): WebSocketMessage {
  return webSocketMessageSchema.parse(message);
}

// Message creation helpers
export function createCampaignProgressMessage(
  payload: CampaignProgressPayload
): z.infer<typeof campaignProgressMessageSchema> {
  return {
    type: WebSocketMessageType.CAMPAIGN_PROGRESS,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}

export function createCampaignStatusMessage(
  payload: CampaignStatusPayload
): z.infer<typeof campaignStatusMessageSchema> {
  return {
    type: WebSocketMessageType.CAMPAIGN_STATUS,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}

export function createDomainResultMessage(
  payload: DomainResultPayload
): z.infer<typeof domainResultMessageSchema> {
  return {
    type: WebSocketMessageType.DOMAIN_RESULT,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}

export function createSystemStatusMessage(
  payload: SystemStatusPayload
): z.infer<typeof systemStatusMessageSchema> {
  return {
    type: WebSocketMessageType.SYSTEM_STATUS,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}

export function createErrorMessage(
  payload: ErrorPayload
): z.infer<typeof errorMessageSchema> {
  return {
    type: WebSocketMessageType.ERROR,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}
