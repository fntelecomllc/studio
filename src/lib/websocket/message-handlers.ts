/**
 * WebSocket message handlers with proper typing and validation
 * Ensures type safety for all real-time updates
 */

import {
  TypedWebSocketMessage,
  WebSocketHandlers,
  parseWebSocketMessage,
  routeWebSocketMessage,
  CampaignProgressMessage,
  CampaignStatusMessage,
  SystemNotificationMessage,
  ErrorMessage,
  WebSocketMessageTypes
} from '../types/websocket-types-fixed';
import { performanceMonitor } from '../monitoring/performance-monitor';
import { errorTracker } from '../monitoring/error-tracker';
import { UUID } from '../types/branded';

/**
 * Message handler registry
 */
interface MessageHandlerRegistry {
  campaignHandlers: Map<UUID, WebSocketHandlers>;
  globalHandlers: WebSocketHandlers;
}

/**
 * Create a message handler registry
 */
export function createMessageHandlerRegistry(): MessageHandlerRegistry {
  return {
    campaignHandlers: new Map(),
    globalHandlers: {}
  };
}

/**
 * Register handlers for a specific campaign
 */
export function registerCampaignHandlers(
  registry: MessageHandlerRegistry,
  campaignId: UUID,
  handlers: Partial<WebSocketHandlers>
): () => void {
  registry.campaignHandlers.set(campaignId, {
    ...registry.campaignHandlers.get(campaignId),
    ...handlers
  });

  // Return cleanup function
  return () => {
    registry.campaignHandlers.delete(campaignId);
  };
}

/**
 * Register global handlers
 */
export function registerGlobalHandlers(
  registry: MessageHandlerRegistry,
  handlers: Partial<WebSocketHandlers>
): void {
  registry.globalHandlers = {
    ...registry.globalHandlers,
    ...handlers
  };
}

/**
 * Process raw WebSocket message with validation and routing
 */
export function processWebSocketMessage(
  registry: MessageHandlerRegistry,
  rawMessage: string
): void {
  const startTime = performance.now();
  
  try {
    // Parse and validate message
    const message = parseWebSocketMessage(rawMessage);
    
    if (!message) {
      errorTracker.trackError(new Error('Invalid WebSocket message format'), {
        component: 'WebSocketMessageHandler',
        action: 'parse',
        metadata: { rawMessage }
      });
      return;
    }

    // Record message processing metrics
    performanceMonitor.recordCustomMetric(
      'websocket_message_received',
      1,
      'count',
      { messageType: message.type }
    );

    // Route to appropriate handlers
    handleTypedMessage(registry, message);

    // Record processing time
    const duration = performance.now() - startTime;
    performanceMonitor.recordCustomMetric(
      'websocket_message_processing_time',
      duration,
      'ms',
      { messageType: message.type }
    );

  } catch (error) {
    errorTracker.trackError(error as Error, {
      component: 'WebSocketMessageHandler',
      action: 'process',
      metadata: { rawMessage }
    });
  }
}

/**
 * Handle typed WebSocket message
 */
function handleTypedMessage(
  registry: MessageHandlerRegistry,
  message: TypedWebSocketMessage
): void {
  // Route to global handlers
  if (registry.globalHandlers) {
    routeWebSocketMessage(message, registry.globalHandlers);
  }

  // Route to campaign-specific handlers if applicable
  const campaignId = extractCampaignId(message);
  if (campaignId) {
    const campaignHandlers = registry.campaignHandlers.get(campaignId);
    if (campaignHandlers) {
      routeWebSocketMessage(message, campaignHandlers);
    }
  }
}

/**
 * Extract campaign ID from message
 */
function extractCampaignId(message: TypedWebSocketMessage): UUID | null {
  switch (message.type) {
    case WebSocketMessageTypes.CAMPAIGN_PROGRESS:
    case WebSocketMessageTypes.CAMPAIGN_STATUS:
      return (message.data as { campaignId: string }).campaignId as UUID;
    
    case WebSocketMessageTypes.DOMAIN_GENERATED:
    case WebSocketMessageTypes.DNS_VALIDATION_RESULT:
    case WebSocketMessageTypes.HTTP_VALIDATION_RESULT:
      return (message.data as { campaignId: string }).campaignId as UUID;
    
    case WebSocketMessageTypes.PROXY_STATUS:
      const proxyData = message.data as { campaignId?: string };
      return proxyData.campaignId ? proxyData.campaignId as UUID : null;
    
    default:
      return null;
  }
}

/**
 * Create default campaign progress handler
 */
export function createCampaignProgressHandler(
  onUpdate: (campaignId: UUID, progress: number, phase: string, status: string) => void
): WebSocketHandlers['onCampaignProgress'] {
  return (message: CampaignProgressMessage) => {
    const { campaignId, progressPercent, phase, status } = message.data;
    onUpdate(campaignId as UUID, progressPercent, phase, status);
  };
}

/**
 * Create default campaign status handler
 */
export function createCampaignStatusHandler(
  onStatusChange: (campaignId: UUID, status: string, phase?: string, error?: string) => void
): WebSocketHandlers['onCampaignStatus'] {
  return (message: CampaignStatusMessage) => {
    const { campaignId, status, phase, errorCode } = message.data;
    onStatusChange(campaignId as UUID, status, phase, errorCode);
  };
}

/**
 * Create default system notification handler
 */
export function createSystemNotificationHandler(
  onNotification: (level: string, message: string, actionable: boolean) => void
): WebSocketHandlers['onSystemNotification'] {
  return (message: SystemNotificationMessage) => {
    const { level, message: text, actionable = false } = message.data;
    onNotification(level, text, actionable);
  };
}

/**
 * Create error handler with automatic error tracking
 */
export function createErrorHandler(
  onError?: (error: ErrorMessage) => void
): WebSocketHandlers['onError'] {
  return (message: ErrorMessage) => {
    const { code, message: errorMessage, details, campaignId } = message.data;
    
    // Track error
    errorTracker.trackError(new Error(errorMessage), {
      component: 'WebSocketHandler',
      action: 'error',
      metadata: { code, details, campaignId }
    });

    // Call custom handler if provided
    onError?.(message);
  };
}

/**
 * Create comprehensive WebSocket handlers with validation
 */
export function createValidatedWebSocketHandlers(
  customHandlers: Partial<WebSocketHandlers> = {}
): WebSocketHandlers {
  return {
    // Campaign handlers
    onCampaignProgress: customHandlers.onCampaignProgress || ((message) => {
      console.log('[WebSocket] Campaign progress:', message.data);
    }),
    
    onCampaignStatus: customHandlers.onCampaignStatus || ((message) => {
      console.log('[WebSocket] Campaign status:', message.data);
    }),
    
    // Domain handlers
    onDomainGenerated: customHandlers.onDomainGenerated || ((message) => {
      console.log('[WebSocket] Domain generated:', message.data);
    }),
    
    // Validation handlers
    onDNSValidationResult: customHandlers.onDNSValidationResult || ((message) => {
      console.log('[WebSocket] DNS validation:', message.data);
    }),
    
    onHTTPValidationResult: customHandlers.onHTTPValidationResult || ((message) => {
      console.log('[WebSocket] HTTP validation:', message.data);
    }),
    
    // System handlers
    onSystemNotification: customHandlers.onSystemNotification || ((message) => {
      console.log('[WebSocket] System notification:', message.data);
    }),
    
    onProxyStatus: customHandlers.onProxyStatus || ((message) => {
      console.log('[WebSocket] Proxy status:', message.data);
    }),
    
    // Error handler with automatic tracking
    onError: createErrorHandler(customHandlers.onError),
    
    // Unknown message handler
    onUnknownMessage: customHandlers.onUnknownMessage || ((message) => {
      console.warn('[WebSocket] Unknown message type:', message.type, message);
    })
  };
}

/**
 * WebSocket connection state manager
 */
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export class WebSocketStateManager {
  private connectionState: ConnectionState = 'disconnected';
  private lastError: Error | null = null;
  private reconnectAttempts = 0;
  private listeners: Set<(state: ConnectionState) => void> = new Set();

  setConnectionState(state: ConnectionState, error?: Error): void {
    this.connectionState = state;
    if (error) {
      this.lastError = error;
      errorTracker.trackError(error, {
        component: 'WebSocketStateManager',
        action: 'connection',
        metadata: {
          state,
          reconnectAttempts: this.reconnectAttempts
        }
      });
    }
    
    // Notify listeners
    this.listeners.forEach(listener => listener(state));
    
    // Record metrics
    performanceMonitor.recordCustomMetric(
      'websocket_connection_state',
      1,
      'count',
      { state, hasError: error ? 'true' : 'false' }
    );
  }

  incrementReconnectAttempts(): void {
    this.reconnectAttempts++;
  }

  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
  }

  getState(): {
    connectionState: ConnectionState;
    lastError: Error | null;
    reconnectAttempts: number;
  } {
    return {
      connectionState: this.connectionState,
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  subscribe(listener: (state: typeof this.connectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * Message validation statistics
 */
export class MessageValidationStats {
  private stats = {
    totalMessages: 0,
    validMessages: 0,
    invalidMessages: 0,
    messageTypes: new Map<string, number>(),
    lastReset: Date.now()
  };

  recordMessage(messageType: string, isValid: boolean): void {
    this.stats.totalMessages++;
    if (isValid) {
      this.stats.validMessages++;
      const count = this.stats.messageTypes.get(messageType) || 0;
      this.stats.messageTypes.set(messageType, count + 1);
    } else {
      this.stats.invalidMessages++;
    }
  }

  getStats(): {
    totalMessages: number;
    validMessages: number;
    invalidMessages: number;
    validationRate: number;
    messageTypeDistribution: Record<string, number>;
    uptime: number;
  } {
    const validationRate = this.stats.totalMessages > 0
      ? (this.stats.validMessages / this.stats.totalMessages) * 100
      : 100;

    const messageTypeDistribution: Record<string, number> = {};
    this.stats.messageTypes.forEach((count, type) => {
      messageTypeDistribution[type] = count;
    });

    return {
      totalMessages: this.stats.totalMessages,
      validMessages: this.stats.validMessages,
      invalidMessages: this.stats.invalidMessages,
      validationRate,
      messageTypeDistribution,
      uptime: Date.now() - this.stats.lastReset
    };
  }

  reset(): void {
    this.stats = {
      totalMessages: 0,
      validMessages: 0,
      invalidMessages: 0,
      messageTypes: new Map(),
      lastReset: Date.now()
    };
  }
}