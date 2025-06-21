/**
 * Enhanced WebSocket Client - Unified implementation
 * 
 * Features:
 * - SafeBigInt support for int64 fields
 * - Exponential backoff reconnection
 * - Structured error propagation
 * - Message schema validation
 * - Automatic case transformations
 * - Backward compatibility with simple service
 */

import { getEnhancedWebSocketService } from '@/lib/services/websocketService.enhanced';
import type { WebSocketMessage as EnhancedMessage } from '@/lib/types/websocket-types-fixed';
import { 
  parseWebSocketMessage, 
  routeWebSocketMessage, 
  type WebSocketHandlers,
  // type TypedWebSocketMessage
} from '@/lib/types/websocket-types-fixed';
import { UUID, ISODateString, SafeBigInt } from '@/lib/types/branded';

// Re-export enhanced message types for compatibility
export { 
  WebSocketMessageTypes,
  type TypedWebSocketMessage,
  type WebSocketHandlers,
  parseWebSocketMessage,
  routeWebSocketMessage
} from '@/lib/types/websocket-types-fixed';

// Simple service compatibility types
export interface WebSocketMessage {
  id?: UUID;
  timestamp?: ISODateString;
  type: string;
  data: Record<string, unknown>;
  message?: string;
  campaignId?: UUID;
  phase?: string;
  status?: string;
  progress?: number;
  sequenceNumber?: number;
  proxyId?: UUID;
  proxyStatus?: string;
  personaId?: UUID;
  personaStatus?: string;
  validationsProcessed?: SafeBigInt;
  domainsGenerated?: SafeBigInt;
  estimatedTimeRemaining?: string;
  error?: string;
}

// Legacy CampaignProgressMessage type for backward compatibility
export interface CampaignProgressMessage extends WebSocketMessage {
  type: 'campaign_progress' | 'progress' | 'domain_generated' | 'domain_generation_progress' | 'validation_progress' | 'phase_complete' | 'error' | 'subscription_confirmed' | 'validation_complete' | 'system_notification';
  campaignId?: UUID;
  status?: string;
  data: Record<string, unknown>; // Required to match WebSocketMessage interface
  progress?: number;
  phase?: string;
  error?: string;
  domainsGenerated?: SafeBigInt; // Must use SafeBigInt to match WebSocketMessage
  newDomains?: Array<{ domain: string; registrationStatus: string }>;
  phaseStatus?: string;
  notificationLevel?: 'info' | 'warning' | 'error';
  actionable?: boolean;
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type ErrorHandler = (error: Error) => void;

export interface ConnectionStatus {
  campaignId: string;
  connected: boolean;
  lastMessageAt?: string;
  error?: string;
}

/**
 * Enhanced WebSocket Service with backward compatibility
 */
export class EnhancedWebSocketClient {
  private service = getEnhancedWebSocketService();
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private campaignHandlers: Map<string, MessageHandler[]> = new Map();
  private campaignConnections: Map<string, boolean> = new Map();
  private typedHandlers: Partial<WebSocketHandlers> = {};

  constructor() {
    // Setup the enhanced service with unified message handling
    this.setupEnhancedService();
  }

  private setupEnhancedService(): void {
    this.service = getEnhancedWebSocketService({
      onMessage: (message: EnhancedMessage) => {
        // Convert enhanced message to simple format for backward compatibility
        const simpleMessage = this.convertToSimpleMessage(message);
        
        // Call all registered simple handlers
        this.messageHandlers.forEach(handler => {
          try {
            handler(simpleMessage);
          } catch (error) {
            console.error('[EnhancedWebSocket] Error in message handler:', error);
          }
        });

        // Call campaign-specific handlers
        if (simpleMessage.campaignId !== undefined && simpleMessage.campaignId !== null && simpleMessage.campaignId !== '') {
          const handlers = this.campaignHandlers.get(simpleMessage.campaignId);
          if (handlers !== undefined && handlers !== null) {
            handlers.forEach(handler => {
              try {
                handler(simpleMessage);
              } catch (error) {
                console.error('[EnhancedWebSocket] Error in campaign handler:', error);
              }
            });
          }
        }

        // Route typed messages
        try {
          const typedMessage = parseWebSocketMessage(JSON.stringify(message));
          if (typedMessage !== undefined && typedMessage !== null) {
            routeWebSocketMessage(typedMessage, this.typedHandlers);
          }
        } catch (error) {
          console.error('[EnhancedWebSocket] Error parsing typed message:', error);
        }
      },
      onError: (error: Error) => {
        this.errorHandlers.forEach(handler => {
          try {
            handler(error);
          } catch (err) {
            console.error('[EnhancedWebSocket] Error in error handler:', err);
          }
        });
      },
      onConnectionChange: (state) => {
        if (state === 'connected') {
          // Re-subscribe to all campaigns
          this.campaignConnections.forEach((_, campaignId) => {
            this.service.subscribeToCampaign(campaignId);
          });
        }
      }
    });
  }

  private convertToSimpleMessage(enhancedMessage: EnhancedMessage): WebSocketMessage {
    const simpleMessage: WebSocketMessage = {
      type: enhancedMessage.type,
      data: (enhancedMessage.data ?? {}) as Record<string, unknown>
    };

    // Add optional fields if they exist
    if ('id' in enhancedMessage) {
      simpleMessage.id = enhancedMessage.id as UUID;
    }
    if ('timestamp' in enhancedMessage) {
      simpleMessage.timestamp = enhancedMessage.timestamp as ISODateString;
    }
    
    // Type-safe access to additional properties
    const extendedMessage = enhancedMessage as unknown as Record<string, unknown>;
    if ('message' in extendedMessage && typeof extendedMessage.message === 'string') {
      simpleMessage.message = extendedMessage.message;
    }
    if ('campaignId' in extendedMessage && typeof extendedMessage.campaignId === 'string') {
      simpleMessage.campaignId = extendedMessage.campaignId as UUID;
    }
    if ('phase' in extendedMessage && typeof extendedMessage.phase === 'string') {
      simpleMessage.phase = extendedMessage.phase;
    }
    if ('status' in extendedMessage && typeof extendedMessage.status === 'string') {
      simpleMessage.status = extendedMessage.status;
    }
    if ('progress' in extendedMessage && typeof extendedMessage.progress === 'number') {
      simpleMessage.progress = extendedMessage.progress;
    }

    return simpleMessage;
  }

  // Connection management
  async connect(): Promise<void> {
    return new Promise((resolve) => {
      this.service.connect();
      // Check connection state
      const checkConnection = setInterval(() => {
        if (this.service.isConnected()) {
          clearInterval(checkConnection);
          resolve();
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkConnection);
        resolve();
      }, 5000);
    });
  }

  disconnect(): void {
    this.service.disconnect();
    this.campaignConnections.clear();
  }

  disconnectAll(): void {
    this.disconnect();
  }

  isConnected(campaignId?: string): boolean {
    if (campaignId !== undefined && campaignId !== '') {
      return this.campaignConnections.get(campaignId) === true && this.service.isConnected();
    }
    return this.service.isConnected();
  }

  // Campaign connections
  connectToCampaign(
    campaignId: string,
    onMessage?: MessageHandler,
    onError?: ErrorHandler
  ): () => void {
    // Connect if not already connected
    if (!this.service.isConnected()) {
      void this.connect();
    }

    // Subscribe to campaign
    this.service.subscribeToCampaign(campaignId);
    this.campaignConnections.set(campaignId, true);

    // Add handlers
    if (onMessage !== undefined) {
      const handlers = this.campaignHandlers.get(campaignId) ?? [];
      handlers.push(onMessage);
      this.campaignHandlers.set(campaignId, handlers);
    }

    if (onError !== undefined) {
      this.errorHandlers.push(onError);
    }

    // Return cleanup function
    return () => {
      this.service.unsubscribeFromCampaign(campaignId);
      this.campaignConnections.delete(campaignId);
      
      // Remove handlers
      if (onMessage !== undefined) {
        const handlers = this.campaignHandlers.get(campaignId) ?? [];
        const filtered = handlers.filter(h => h !== onMessage);
        if (filtered.length > 0) {
          this.campaignHandlers.set(campaignId, filtered);
        } else {
          this.campaignHandlers.delete(campaignId);
        }
      }

      if (onError !== undefined) {
        this.errorHandlers = this.errorHandlers.filter(h => h !== onError);
      }

      // Disconnect if no more campaigns
      if (this.campaignConnections.size === 0 && this.messageHandlers.length === 0) {
        this.disconnect();
      }
    };
  }

  connectToAllCampaigns(
    onMessage?: MessageHandler,
    onError?: ErrorHandler
  ): () => void {
    // Connect if not already connected
    if (!this.service.isConnected()) {
      void this.connect();
    }

    if (onMessage !== undefined) {
      this.messageHandlers.push(onMessage);
    }

    if (onError !== undefined) {
      this.errorHandlers.push(onError);
    }

    // Return cleanup function
    return () => {
      if (onMessage !== undefined) {
        this.messageHandlers = this.messageHandlers.filter(h => h !== onMessage);
      }
      if (onError !== undefined) {
        this.errorHandlers = this.errorHandlers.filter(h => h !== onError);
      }

      // Disconnect if no handlers left
      if (this.messageHandlers.length === 0 && this.campaignConnections.size === 0) {
        this.disconnect();
      }
    };
  }

  // Message handling
  subscribe(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
    };
  }

  // Typed handlers
  setTypedHandlers(handlers: Partial<WebSocketHandlers>): void {
    this.typedHandlers = { ...this.typedHandlers, ...handlers };
  }

  // Message sending
  send(message: WebSocketMessage): void {
    this.service.send(message);
  }

  sendMessage(campaignId: string, message: WebSocketMessage): void {
    this.service.send({
      ...message,
      campaignId: campaignId as UUID
    });
  }

  sendCampaignCommand(campaignId: string, command: string): void {
    this.service.sendCampaignCommand(campaignId, command);
  }

  // Status
  getConnectionStatus(): ConnectionStatus[] {
    const statuses: ConnectionStatus[] = [];
    
    this.campaignConnections.forEach((connected, campaignId) => {
      statuses.push({
        campaignId,
        connected: connected && this.service.isConnected(),
        lastMessageAt: new Date().toISOString()
      });
    });
    
    return statuses;
  }

  // Testing
  simulateMessage(message: WebSocketMessage): void {
    const simpleMessage = this.convertToSimpleMessage(message as EnhancedMessage);
    this.messageHandlers.forEach(handler => {
      try {
        handler(simpleMessage);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }
}

// Export singleton instance
export const enhancedWebSocketClient = new EnhancedWebSocketClient();

// Export as websocketService for backward compatibility
export const websocketService = enhancedWebSocketClient;