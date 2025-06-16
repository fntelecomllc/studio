/**
 * Simple WebSocket Service for DomainFlow
 * 
 * Focused, lightweight implementation that works directly with the Go backend.
 * Eliminates complexity while maintaining all necessary functionality.
 */

// Simple message types that match backend expectations
export interface WebSocketMessage {
  type: string;
  campaignId?: string;
  data?: unknown;
  timestamp?: string;
}

export interface CampaignMessage extends WebSocketMessage {
  campaignId: string;
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

// Event handler types
export type MessageHandler = (message: WebSocketMessage) => void;
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

class SimpleWebSocketService {
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
        const message: WebSocketMessage = JSON.parse(event.data);
        
        // Add timestamp if not present
        if (!message.timestamp) {
          message.timestamp = new Date().toISOString();
        }
        
        console.log(`[WebSocket] Message received:`, message);
        
        // Call all message handlers
        state.messageHandlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error('[WebSocket] Error in message handler:', error);
          }
        });
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error, event.data);
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
        type: 'subscribe_campaign',
        campaignId: campaignId
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
        type: 'unsubscribe_campaign',
        campaignId: campaignId
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
   * Connect to a specific campaign
   */
  connectToCampaign(
    campaignId: string, 
    onMessage: MessageHandler, 
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

    // Add handlers
    state.messageHandlers.push(onMessage);
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
   * Connect to all campaigns (global connection)
   */
  connectToAllCampaigns(onMessage: MessageHandler, onError?: ErrorHandler): () => void {
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

    // Add handlers
    this.globalConnection.messageHandlers.push(onMessage);
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
   * Send a message (if needed for control messages)
   */
  sendMessage(campaignId: string, message: object): void {
    const connectionId = `campaign_${campaignId}`;
    const state = this.connections.get(connectionId);
    
    if (state?.ws?.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(message));
      console.log(`[WebSocket] Sent message to ${campaignId}:`, message);
    } else {
      console.warn(`[WebSocket] Cannot send message - not connected to ${campaignId}`);
    }
  }
}

// Export singleton instance
export const websocketService = new SimpleWebSocketService();

// Legacy compatibility type for backward compatibility
export interface CampaignProgressMessage {
  type: string;
  campaignId: string;
  data: {
    progress?: number;
    status?: string;
    phase?: string;
    [key: string]: unknown;
  };
  message?: string;
  timestamp?: string;
}

// Default export
export default websocketService;
