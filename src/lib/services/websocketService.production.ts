/**
 * Production WebSocket Service for DomainFlow
 * 
 * Updated to use correct message structure that matches Go backend exactly.
 * Eliminates parsing failures by aligning with actual backend format.
 */

import { UUID, ISODateString } from '@/lib/types/branded';
import {
  WebSocketMessage,
  WebSocketMessageTypes,
  parseWebSocketMessage,
  routeWebSocketMessage,
  WebSocketHandlers,
  TypedWebSocketMessage,
  CampaignProgressMessage,
  CampaignStatusMessage,
  DomainGeneratedMessage
} from '@/lib/types/websocket-types-fixed';

// Event handler types
export type MessageHandler = (message: TypedWebSocketMessage) => void;
export type ErrorHandler = (error: Event | Error) => void;

interface ConnectionState {
  ws: WebSocket | null;
  subscriptions: Set<string>;
  messageHandlers: MessageHandler[];
  errorHandlers: ErrorHandler[];
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  isIntentionalClose: boolean;
}

class ProductionWebSocketService {
  private connections: Map<string, ConnectionState> = new Map();
  private globalConnection: ConnectionState | null = null;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000;

  /**
   * Get WebSocket URL based on current environment
   */
  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') return '';
    
    const { protocol, hostname, port } = window.location;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Development: Backend typically runs on port 8080
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${wsProtocol}//${hostname}:8080/api/v2/ws`;
    }
    
    // Production: Same domain
    return `${wsProtocol}//${hostname}${port ? `:${port}` : ''}/api/v2/ws`;
  }

  /**
   * Create WebSocket connection with authentication
   */
  private createConnection(): WebSocket {
    const url = this.getWebSocketUrl();
    console.log(`[WebSocket] Connecting to: ${url}`);
    console.log(`[WebSocket] Current origin: ${window.location.origin}`);
    console.log(`[WebSocket] Current protocol: ${window.location.protocol}`);
    
    const ws = new WebSocket(url);
    
    // Backend uses session cookies for authentication - no additional headers needed
    // The browser automatically sends cookies with WebSocket requests
    
    return ws;
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(connectionId: string, state: ConnectionState): void {
    if (!state.ws) return;

    state.ws.onopen = () => {
      console.log(`[WebSocket] Connected: ${connectionId}`);
      state.reconnectAttempts = 0;
      
      // Subscribe to campaigns
      state.subscriptions.forEach(campaignId => {
        this.sendSubscribeMessage(state.ws!, campaignId);
      });
    };

    state.ws.onmessage = (event) => {
      try {
        // Parse message using the corrected parser
        const message = parseWebSocketMessage(event.data);
        
        if (!message) {
          console.error('[WebSocket] Failed to parse message:', event.data);
          return;
        }
        
        console.log(`[WebSocket] Message received:`, message);
        
        // Call all message handlers with the typed message
        state.messageHandlers.forEach(handler => {
          try {
            handler(message);
          } catch {
            console.error('[WebSocket] Error in message handler:', error);
          }
        });
      } catch {
        console.error('[WebSocket] Error processing message:', error, event.data);
      }
    };

    state.ws.onerror = (error) => {
      console.error(`[WebSocket] Error: ${connectionId}`, error);
      state.errorHandlers.forEach(handler => {
        try {
          handler(error);
        } catch (err) {
          console.error('[WebSocket] Error in error handler:', err);
        }
      });
    };

    state.ws.onclose = (event) => {
      console.log(`[WebSocket] Closed: ${connectionId}`, { 
        code: event.code, 
        reason: event.reason, 
        wasClean: event.wasClean 
      });
      
      state.ws = null;
      
      // Attempt reconnection if not intentional
      if (!state.isIntentionalClose && state.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect(connectionId, state);
      }
    };
  }

  /**
   * Send subscribe message to backend
   */
  private sendSubscribeMessage(ws: WebSocket, campaignId: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      const message = {
        type: 'subscribe',
        data: {
          campaignId
        },
        timestamp: new Date().toISOString()
      };
      ws.send(JSON.stringify(message));
      console.log(`[WebSocket] Subscribed to campaign: ${campaignId}`);
    }
  }

  /**
   * Send unsubscribe message to backend
   */
  private sendUnsubscribeMessage(ws: WebSocket, campaignId: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      const message = {
        type: 'unsubscribe',
        data: {
          campaignId
        },
        timestamp: new Date().toISOString()
      };
      ws.send(JSON.stringify(message));
      console.log(`[WebSocket] Unsubscribed from campaign: ${campaignId}`);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(connectionId: string, state: ConnectionState): void {
    const delay = this.baseReconnectDelay * Math.pow(2, state.reconnectAttempts);
    state.reconnectAttempts++;
    
    console.log(`[WebSocket] Scheduling reconnect ${state.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms for: ${connectionId}`);
    
    state.reconnectTimer = setTimeout(() => {
      if (this.connections.get(connectionId) === state) {
        this.reconnect(connectionId, state);
      }
    }, delay);
  }

  /**
   * Reconnect WebSocket
   */
  private reconnect(connectionId: string, state: ConnectionState): void {
    console.log(`[WebSocket] Reconnecting: ${connectionId}`);
    
    state.ws = this.createConnection();
    state.isIntentionalClose = false;
    this.setupWebSocketHandlers(connectionId, state);
  }

  /**
   * Connect to a specific campaign with typed handlers
   */
  connectToCampaign(
    campaignId: string, 
    handlers: Partial<WebSocketHandlers>,
    onError?: ErrorHandler
  ): () => void {
    const connectionId = `campaign_${campaignId}`;
    
    // Check if connection already exists
    let state = this.connections.get(connectionId);
    if (!state) {
      state = {
        ws: null,
        subscriptions: new Set([campaignId]),
        messageHandlers: [],
        errorHandlers: [],
        reconnectAttempts: 0,
        reconnectTimer: null,
        isIntentionalClose: false
      };
      this.connections.set(connectionId, state);
    } else {
      state.subscriptions.add(campaignId);
    }

    // Create a message handler that routes to typed handlers
    const messageHandler: MessageHandler = (message) => {
      // Filter messages for this specific campaign
      if ('data' in message && message.data && typeof message.data === 'object' && 'campaignId' in message.data) {
        const data = message.data as { campaignId: string };
        if (data.campaignId !== campaignId) {
          return; // Skip messages for other campaigns
        }
      }
      
      // Route message to appropriate handler
      routeWebSocketMessage(message, handlers);
    };
    
    state.messageHandlers.push(messageHandler);
    if (onError) {
      state.errorHandlers.push(onError);
    }

    // Create connection if needed
    if (!state.ws || state.ws.readyState === WebSocket.CLOSED) {
      state.ws = this.createConnection();
      state.isIntentionalClose = false;
      this.setupWebSocketHandlers(connectionId, state);
    } else if (state.ws.readyState === WebSocket.OPEN) {
      // Connection exists, just subscribe
      this.sendSubscribeMessage(state.ws, campaignId);
    }

    // Return cleanup function
    return () => {
      this.disconnect(campaignId);
    };
  }

  /**
   * Connect to all campaigns with typed handlers
   */
  connectToAllCampaigns(handlers: Partial<WebSocketHandlers>, onError?: ErrorHandler): () => void {
    if (!this.globalConnection) {
      this.globalConnection = {
        ws: null,
        subscriptions: new Set(),
        messageHandlers: [],
        errorHandlers: [],
        reconnectAttempts: 0,
        reconnectTimer: null,
        isIntentionalClose: false
      };
    }

    // Create a message handler that routes to typed handlers
    const messageHandler: MessageHandler = (message) => {
      routeWebSocketMessage(message, handlers);
    };
    
    this.globalConnection.messageHandlers.push(messageHandler);
    if (onError) {
      this.globalConnection.errorHandlers.push(onError);
    }

    // Create connection if needed
    if (!this.globalConnection.ws || this.globalConnection.ws.readyState === WebSocket.CLOSED) {
      this.globalConnection.ws = this.createConnection();
      this.globalConnection.isIntentionalClose = false;
      this.setupWebSocketHandlers('global', this.globalConnection);
    }

    // Return cleanup function
    return () => {
      this.disconnectAll();
    };
  }

  /**
   * Legacy connect method for backward compatibility
   */
  connectToCampaignLegacy(
    campaignId: string,
    onMessage: (message: WebSocketMessage) => void,
    onError?: ErrorHandler
  ): () => void {
    // Convert legacy handler to new format
    const handlers: Partial<WebSocketHandlers> = {
      onCampaignProgress: (msg) => onMessage(msg),
      onCampaignStatus: (msg) => onMessage(msg),
      onDomainGenerated: (msg) => onMessage(msg),
      onUnknownMessage: (msg) => onMessage(msg)
    };
    
    return this.connectToCampaign(campaignId, handlers, onError);
  }

  /**
   * Disconnect from specific campaign
   */
  disconnect(campaignId: string): void {
    const connectionId = `campaign_${campaignId}`;
    const state = this.connections.get(connectionId);
    
    if (state) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        this.sendUnsubscribeMessage(state.ws, campaignId);
        state.isIntentionalClose = true;
        state.ws.close(1000, 'Client disconnect');
      }
      
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
      }
      
      this.connections.delete(connectionId);
      console.log(`[WebSocket] Disconnected from campaign: ${campaignId}`);
    }
  }

  /**
   * Disconnect all connections
   */
  disconnectAll(): void {
    // Close all campaign connections
    this.connections.forEach((state, _connectionId) => {
      if (state.ws) {
        state.isIntentionalClose = true;
        state.ws.close(1000, 'Client disconnect all');
      }
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
      }
    });
    this.connections.clear();

    // Close global connection
    if (this.globalConnection) {
      if (this.globalConnection.ws) {
        this.globalConnection.isIntentionalClose = true;
        this.globalConnection.ws.close(1000, 'Client disconnect all');
      }
      if (this.globalConnection.reconnectTimer) {
        clearTimeout(this.globalConnection.reconnectTimer);
      }
      this.globalConnection = null;
    }

    console.log('[WebSocket] All connections closed');
  }

  /**
   * Check if connected to campaign
   */
  isConnected(campaignId: string): boolean {
    const connectionId = `campaign_${campaignId}`;
    const state = this.connections.get(connectionId);
    return state ? (state.ws?.readyState === WebSocket.OPEN) : false;
  }

  /**
   * Get connection status for all campaigns
   */
  getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    
    this.connections.forEach((state, connectionId) => {
      const campaignId = connectionId.replace('campaign_', '');
      status[campaignId] = state.ws?.readyState === WebSocket.OPEN;
    });
    
    return status;
  }

  /**
   * Send a raw message (advanced use)
   */
  sendMessage(campaignId: string, message: object): void {
    const connectionId = `campaign_${campaignId}`;
    const state = this.connections.get(connectionId);
    
    if (state?.ws?.readyState === WebSocket.OPEN) {
      // Ensure message has correct structure
      const formattedMessage = {
        ...message,
        timestamp: new Date().toISOString()
      };
      state.ws.send(JSON.stringify(formattedMessage));
      console.log(`[WebSocket] Sent message to ${campaignId}:`, formattedMessage);
    } else {
      console.warn(`[WebSocket] Cannot send message - not connected to ${campaignId}`);
    }
  }
}

// Export singleton instance
export const websocketService = new ProductionWebSocketService();

// Re-export types for convenience
export { WebSocketMessageTypes };
export type {
  WebSocketMessage,
  TypedWebSocketMessage,
  CampaignProgressMessage,
  CampaignStatusMessage,
  DomainGeneratedMessage,
  WebSocketHandlers
};

// Legacy export for backward compatibility
export interface CampaignMessage extends WebSocketMessage {
  campaignId?: UUID;
  type: 'campaign_progress' | 'domain_generated' | 'campaign_complete' | 'campaign_error';
  data: {
    progress?: number;
    status?: string;
    phase?: string;
    domain?: string;
    error?: string;
    [key: string]: unknown;
  };
}

// Legacy compatibility for progress messages
export interface CampaignProgressMessageLegacy {
  type: string;
  campaignId: UUID;
  data: {
    progress?: number;
    status?: string;
    phase?: string;
    [key: string]: unknown;
  };
  message?: string;
  timestamp?: ISODateString;
}

// Default export
export default websocketService;