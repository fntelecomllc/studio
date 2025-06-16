// src/lib/schemas/websocketMessageSchema.ts
// HIGH PRIORITY FIX: WebSocket Message Schema Validation
// Addresses audit issue: "Real-time Data Synchronization"
// Phase 2.2: Added id and sequenceNumber for message ordering

import { z } from 'zod';

// Base message schema with required fields for all messages
const baseMessageSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  sequenceNumber: z.number().int().min(0),
});

// Standardized WebSocket message format that matches backend expectations
export const websocketMessageSchema = z.discriminatedUnion('type', [
  // Campaign progress updates
  baseMessageSchema.extend({
    type: z.literal('campaign_progress'),
    campaignId: z.string().uuid(),
    data: z.object({
      progressPercentage: z.number().min(0).max(100),
      processedItems: z.number().min(0),
      totalItems: z.number().min(0),
      phase: z.enum(['domain_generation', 'dns_validation', 'http_validation']),
      status: z.enum(['pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'archived', 'cancelled']),
    }),
  }),
  
  // Domain generation events
  baseMessageSchema.extend({
    type: z.literal('domain_generated'),
    campaignId: z.string().uuid(),
    data: z.object({
      domainId: z.string().uuid(),
      domain: z.string(),
      offset: z.number().min(0),
      batchSize: z.number().min(1),
    }),
  }),
  
  // DNS validation results
  baseMessageSchema.extend({
    type: z.literal('dns_validation_result'),
    campaignId: z.string().uuid(),
    data: z.object({
      domainId: z.string().uuid(),
      domain: z.string(),
      validationStatus: z.enum(['resolved', 'unresolved', 'error', 'timeout']),
      dnsRecords: z.record(z.unknown()).optional(),
      attempts: z.number().min(0),
    }),
  }),
  
  // HTTP validation results
  baseMessageSchema.extend({
    type: z.literal('http_validation_result'),
    campaignId: z.string().uuid(),
    data: z.object({
      domainId: z.string().uuid(),
      domain: z.string(),
      validationStatus: z.enum(['success', 'failed', 'timeout', 'error']),
      statusCode: z.number().min(100).max(599).optional(),
      keywordsFound: z.array(z.string()).optional(),
      responseTime: z.number().min(0).optional(),
    }),
  }),
  
  // Campaign phase completion
  baseMessageSchema.extend({
    type: z.literal('campaign_phase_complete'),
    campaignId: z.string().uuid(),
    data: z.object({
      phase: z.enum(['domain_generation', 'dns_validation', 'http_validation']),
      completedItems: z.number().min(0),
      failedItems: z.number().min(0),
      nextPhase: z.enum(['domain_generation', 'dns_validation', 'http_validation', 'completed']).optional(),
    }),
  }),
  
  // Campaign completion
  baseMessageSchema.extend({
    type: z.literal('campaign_complete'),
    campaignId: z.string().uuid(),
    data: z.object({
      finalStatus: z.enum(['completed', 'failed', 'cancelled']),
      totalProcessed: z.number().min(0),
      totalSuccessful: z.number().min(0),
      totalFailed: z.number().min(0),
      duration: z.number().min(0), // in seconds
    }),
  }),
  
  // Error notifications
  baseMessageSchema.extend({
    type: z.literal('campaign_error'),
    campaignId: z.string().uuid(),
    data: z.object({
      errorCode: z.string(),
      errorMessage: z.string(),
      phase: z.enum(['domain_generation', 'dns_validation', 'http_validation']).optional(),
      retryable: z.boolean(),
    }),
  }),
  
  // System-wide notifications
  baseMessageSchema.extend({
    type: z.literal('system_notification'),
    data: z.object({
      level: z.enum(['info', 'warning', 'error']),
      message: z.string(),
      action: z.string().optional(),
    }),
  }),
  
  // User-specific notifications
  baseMessageSchema.extend({
    type: z.literal('user_notification'),
    userId: z.string().uuid(),
    data: z.object({
      level: z.enum(['info', 'warning', 'error']),
      title: z.string(),
      message: z.string(),
      actionUrl: z.string().optional(),
    }),
  }),
  
  // Connection lifecycle events
  baseMessageSchema.extend({
    type: z.literal('connection_ack'),
    data: z.object({
      connectionId: z.string(),
      userId: z.string().uuid(),
      // Include last sequence number for recovery
      lastSequenceNumber: z.number().int().min(0).optional(),
    }),
  }),
]);

export type WebSocketMessage = z.infer<typeof websocketMessageSchema>;

// Required WebSocket message interface matching audit requirements
export interface WebSocketMessageInterface {
  id: string;
  timestamp: string;
  type: string;
  payload: unknown;
  sequenceNumber: number;
}

// Legacy message format for backward compatibility during transition
export interface LegacyCampaignProgressMessage {
  type: 'progress' | 'domain_generated' | 'validation_complete' | 'error' | 'phase_complete' | 'subscription_confirmed';
  campaignId: string;
  data: {
    progress?: number;
    domains?: string[];
    validationResults?: unknown[];
    error?: string;
    phase?: string;
    status?: string;
  };
  message?: string;
}

// Helper to generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Validates incoming WebSocket message against the standardized schema
 */
export function validateWebSocketMessage(message: unknown): WebSocketMessage {
  try {
    return websocketMessageSchema.parse(message);
  } catch (error) {
    console.error('WebSocket message validation failed:', error);
    throw new Error(`Invalid WebSocket message format: ${error instanceof z.ZodError ? error.message : 'Unknown validation error'}`);
  }
}

/**
 * Transforms legacy message format to standardized format
 */
export function transformLegacyMessage(legacyMessage: LegacyCampaignProgressMessage, sequenceNumber: number = 0): WebSocketMessage {
  const timestamp = new Date().toISOString();
  const id = generateUUID();
  
  switch (legacyMessage.type) {
    case 'progress':
      return {
        id,
        type: 'campaign_progress',
        campaignId: legacyMessage.campaignId,
        timestamp,
        sequenceNumber,
        data: {
          progressPercentage: legacyMessage.data.progress ?? 0,
          processedItems: 0, // Default values - should be provided by backend
          totalItems: 100, // Default values - should be provided by backend
          phase: 'domain_generation', // Default - should be provided by backend
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: (legacyMessage.data.status as any) ?? 'running',
        },
      };
      
    case 'domain_generated':
      return {
        id,
        type: 'domain_generated',
        campaignId: legacyMessage.campaignId,
        timestamp,
        sequenceNumber,
        data: {
          domainId: generateUUID(), // Generate if not provided
          domain: legacyMessage.data.domains?.[0] ?? '',
          offset: 0,
          batchSize: legacyMessage.data.domains?.length ?? 1,
        },
      };
      
    case 'validation_complete':
      return {
        id,
        type: 'dns_validation_result',
        campaignId: legacyMessage.campaignId,
        timestamp,
        sequenceNumber,
        data: {
          domainId: generateUUID(),
          domain: '',
          validationStatus: 'resolved',
          attempts: 1,
        },
      };
      
    case 'error':
      return {
        id,
        type: 'campaign_error',
        campaignId: legacyMessage.campaignId,
        timestamp,
        sequenceNumber,
        data: {
          errorCode: 'UNKNOWN_ERROR',
          errorMessage: legacyMessage.data.error ?? 'Unknown error occurred',
          retryable: false,
        },
      };
      
    case 'phase_complete':
      return {
        id,
        type: 'campaign_phase_complete',
        campaignId: legacyMessage.campaignId,
        timestamp,
        sequenceNumber,
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          phase: (legacyMessage.data.phase as any) ?? 'domain_generation',
          completedItems: 0,
          failedItems: 0,
        },
      };
      
    default:
      throw new Error(`Unknown legacy message type: ${legacyMessage.type}`);
  }
}

/**
 * Type guards for specific message types
 */
export function isCampaignProgressMessage(message: WebSocketMessage): message is Extract<WebSocketMessage, { type: 'campaign_progress' }> {
  return message.type === 'campaign_progress';
}

export function isDomainGeneratedMessage(message: WebSocketMessage): message is Extract<WebSocketMessage, { type: 'domain_generated' }> {
  return message.type === 'domain_generated';
}

export function isValidationResultMessage(message: WebSocketMessage): message is Extract<WebSocketMessage, { type: 'dns_validation_result' | 'http_validation_result' }> {
  return message.type === 'dns_validation_result' || message.type === 'http_validation_result';
}

export function isCampaignErrorMessage(message: WebSocketMessage): message is Extract<WebSocketMessage, { type: 'campaign_error' }> {
  return message.type === 'campaign_error';
}

// Phase 4.2.2: Enhanced message types as per audit requirements
// Standardized payload structure for better type safety

export interface StandardizedWebSocketMessage {
  id: string;
  timestamp: string;
  type: 'progress' | 'status' | 'error' | 'complete';
  sequenceNumber: number;
  payload: {
    type: 'progress' | 'status' | 'error' | 'complete';
    campaignId?: string;
    progress?: number;
    currentPhase?: string;
    estimatedTimeRemaining?: number;
    processedItems?: number;
    totalItems?: number;
    status?: string;
    previousStatus?: string;
    reason?: string;
    code?: string;
    message?: string;
    severity?: 'warning' | 'error' | 'critical';
    retryable?: boolean;
    details?: Record<string, unknown>;
    summary?: {
      totalProcessed: number;
      successful: number;
      failed: number;
      duration: number;
      averageProcessingTime?: number;
    };
    metadata?: Record<string, unknown>;
  };
}

// Connection management message types
export const connectionMessageSchema = z.discriminatedUnion('type', [
  baseMessageSchema.extend({
    type: z.literal('connection_init'),
    lastSequenceNumber: z.number().int().nonnegative().optional(),
    clientVersion: z.string().optional(),
  }),
  
  baseMessageSchema.extend({
    type: z.literal('subscribe'),
    subscriptions: z.array(z.object({
      type: z.enum(['campaign', 'user', 'system']),
      id: z.string().uuid(),
      lastSequenceNumber: z.number().int().nonnegative().optional(),
    })),
  }),
  
  baseMessageSchema.extend({
    type: z.literal('unsubscribe'),
    subscriptions: z.array(z.object({
      type: z.enum(['campaign', 'user', 'system']),
      id: z.string().uuid(),
    })),
  }),
  
  baseMessageSchema.extend({
    type: z.literal('subscription_confirmed'),
    subscriptions: z.array(z.object({
      type: z.enum(['campaign', 'user', 'system']),
      id: z.string().uuid(),
      status: z.enum(['active', 'failed']),
      reason: z.string().optional(),
    })),
  }),
  
  baseMessageSchema.extend({
    type: z.literal('ping'),
    clientTime: z.number().optional(),
  }),
  
  baseMessageSchema.extend({
    type: z.literal('pong'),
    serverTime: z.number().optional(),
  }),
]);

export type ConnectionMessage = z.infer<typeof connectionMessageSchema>;

// Combine all message schemas
export const allWebSocketMessageSchema = z.union([
  websocketMessageSchema,
  connectionMessageSchema,
]);

export type AllWebSocketMessage = z.infer<typeof allWebSocketMessageSchema>;
