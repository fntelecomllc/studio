// Enhanced WebSocket Service - Real-time updates implementation
// Handles campaign progress, proxy status, and system notifications

import { UUID, ISODateString, SafeBigInt, createSafeBigInt, isSafeBigInt } from '@/lib/types/branded';

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
  
  // Real-time update specific fields
  proxyId?: UUID;
  proxyStatus?: string;
  personaId?: UUID;
  personaStatus?: string;
  validationsProcessed?: SafeBigInt;  // CRITICAL FIX: Use SafeBigInt for int64
  domainsGenerated?: SafeBigInt;      // CRITICAL FIX: Use SafeBigInt for int64
  estimatedTimeRemaining?: string;
  error?: string;
}

export interface CampaignProgressMessage extends WebSocketMessage {
  type: 'campaign_progress' | 'progress' | 'domain_generated' | 'domain_generation_progress' | 'validation_progress' | 'phase_complete' | 'error' | 'subscription_confirmed' | 'validation_complete' | 'system_notification';
  campaignId?: UUID;
  data: {
    campaignId?: UUID;
    progress?: number;
    phase?: string;
    status?: string;
    domains?: string[];
    validationResults?: Record<string, unknown>[];
    error?: string;
    domainsGenerated?: SafeBigInt;      // CRITICAL FIX: Use SafeBigInt for int64
    validationsProcessed?: SafeBigInt;   // CRITICAL FIX: Use SafeBigInt for int64
    totalItems?: SafeBigInt;             // CRITICAL FIX: Use SafeBigInt for int64
    processedItems?: SafeBigInt;         // CRITICAL FIX: Use SafeBigInt for int64
    successfulItems?: SafeBigInt;        // CRITICAL FIX: Use SafeBigInt for int64
    failedItems?: SafeBigInt;            // CRITICAL FIX: Use SafeBigInt for int64
    [key: string]: unknown;
  };
}

export interface ProxyStatusMessage extends WebSocketMessage {
  type: 'proxy_status_update';
  proxyId: UUID;
  proxyStatus: string;
  campaignId?: UUID;
}

export interface SystemNotificationMessage extends WebSocketMessage {
  type: 'system_notification';
  message: string;
  status: 'info' | 'warning' | 'error' | 'success';
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type ErrorHandler = (error: Error) => void;

export interface ConnectionStatus {
  campaignId: string;
  connected: boolean;
  lastMessageAt?: string;
  error?: string;
}

export class WebSocketService {
  private ws: WebSocket | null = null;
  private connected = false;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private campaignConnections: Map<string, boolean> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 3000;
  private url = '';

  constructor() {
    this.initializeUrl();
  }

  private initializeUrl(): void {
    // Initialize WebSocket URL based on environment
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = this.getWebSocketPort();
      this.url = `${protocol}//${host}:${port}/api/v2/ws`;
    }
  }

  private getWebSocketPort(): string {
    if (typeof window !== 'undefined') {
      // In development, use backend port 8080
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return '8080';
      }
      // In production, use same port as frontend
      return window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    }
    return '8080';
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[WebSocket] Connected to server');
          this.connected = true;
          this.reconnectAttempts = 0;
          
          // Send connection initialization
          this.sendConnectionInit();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = this.parseAndTransformMessage(event.data);
            this.handleMessage(message);
          } catch {
            console.error('[WebSocket] Failed to parse message:', error);
            this.errorHandlers.forEach(handler => {
              try {
                handler(error instanceof Error ? error : new Error('Failed to parse WebSocket message'));
              } catch (err) {
                console.error('[WebSocket] Error in error handler:', err);
              }
            });
          }
        };

        this.ws.onclose = (event) => {
          console.log('[WebSocket] Connection closed');
          this.connected = false;
          
          // Only attempt reconnect on unexpected closure
          if (event.code !== 1000 && event.code !== 1001) {
            this.attemptReconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WebSocket] Connection error:', error);
          this.connected = false;
          this.errorHandlers.forEach(handler => {
            try {
              handler(error instanceof Error ? error : new Error('WebSocket connection error'));
            } catch (err) {
              console.error('[WebSocket] Error in error handler:', err);
            }
          });
          reject(error);
        };

      } catch {
        reject(error);
      }
    });
  }

  /**
   * CRITICAL FIX CV-009: Parse and transform WebSocket messages to handle int64 fields
   * Converts numeric fields that represent int64 values to SafeBigInt
   */
  private parseAndTransformMessage(rawData: string): WebSocketMessage {
    const parsed = JSON.parse(rawData);
    
    // Transform int64 fields to SafeBigInt
    if (parsed.validationsProcessed !== undefined) {
      parsed.validationsProcessed = createSafeBigInt(parsed.validationsProcessed);
    }
    if (parsed.domainsGenerated !== undefined) {
      parsed.domainsGenerated = createSafeBigInt(parsed.domainsGenerated);
    }
    
    // Transform data object fields if present
    if (parsed.data && typeof parsed.data === 'object') {
      const data = parsed.data as Record<string, unknown>;
      
      // Transform all int64 fields in data
      const int64Fields = [
        'domainsGenerated',
        'validationsProcessed',
        'totalItems',
        'processedItems',
        'successfulItems',
        'failedItems'
      ];
      
      int64Fields.forEach(field => {
        if (data[field] !== undefined) {
          data[field] = createSafeBigInt(data[field] as string | number);
        }
      });
    }
    
    return parsed as WebSocketMessage;
  }

  private sendConnectionInit(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const initMessage = {
        type: 'connection_init',
        lastSequenceNumber: 0
      };
      this.ws.send(JSON.stringify(initMessage));
    }
  }

  private handleMessage(message: WebSocketMessage): void {
    console.log('[WebSocket] Received message:', message);
    
    // Call all registered message handlers
    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch {
        console.error('[WebSocket] Error in message handler:', error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WebSocket] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch(error => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, this.reconnectInterval);
  }

  disconnect(): void {
    this.connected = false;
    this.campaignConnections.clear();
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
  }

  disconnectAll(): void {
    this.disconnect();
  }

  isConnected(campaignId?: string): boolean {
    if (campaignId) {
      return this.campaignConnections.get(campaignId) || false;
    }
    return this.connected;
  }

  // Connect to a specific campaign
  connectToCampaign(
    campaignId: string,
    onMessage?: MessageHandler,
    onError?: ErrorHandler
  ): () => void {
    // First ensure WebSocket connection is established
    this.connect().then(() => {
      // Send campaign subscription message
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const subscribeMessage = {
          type: 'subscribe_campaign',
          campaignId,
          lastSequenceNumber: 0
        };
        this.ws.send(JSON.stringify(subscribeMessage));
        
        this.campaignConnections.set(campaignId, true);
        console.log(`[WebSocket] Subscribed to campaign: ${campaignId}`);
      }
    }).catch(error => {
      console.error('[WebSocket] Failed to connect for campaign subscription:', error);
      if (onError) {
        onError(error);
      }
    });
    
    if (onMessage) {
      this.subscribe(onMessage);
    }
    
    if (onError) {
      this.onError(onError);
    }

    // Return cleanup function
    return () => {
      // Send unsubscribe message if connected
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const unsubscribeMessage = {
          type: 'unsubscribe_campaign',
          campaignId
        };
        this.ws.send(JSON.stringify(unsubscribeMessage));
      }
      
      this.campaignConnections.delete(campaignId);
      console.log(`[WebSocket] Unsubscribed from campaign: ${campaignId}`);
      
      // Clean disconnect if this was the last campaign
      if (this.campaignConnections.size === 0) {
        this.disconnect();
      }
    };
  }

  // Connect to all campaigns
  connectToAllCampaigns(
    onMessage?: MessageHandler,
    onError?: ErrorHandler
  ): () => void {
    this.connected = true;
    
    if (onMessage) {
      this.subscribe(onMessage);
    }
    
    if (onError) {
      this.onError(onError);
    }

    // Return cleanup function
    return () => {
      this.disconnect();
    };
  }

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

  /**
   * CRITICAL FIX CV-009: Serialize SafeBigInt fields before sending
   */
  private serializeMessage(message: WebSocketMessage): string {
    const serializable = { ...message };
    
    // Convert SafeBigInt fields to strings for transmission
    if (serializable.validationsProcessed !== undefined && isSafeBigInt(serializable.validationsProcessed)) {
      (serializable as any).validationsProcessed = serializable.validationsProcessed.toString();
    }
    if (serializable.domainsGenerated !== undefined && isSafeBigInt(serializable.domainsGenerated)) {
      (serializable as any).domainsGenerated = serializable.domainsGenerated.toString();
    }
    
    // Handle data object
    if (serializable.data && typeof serializable.data === 'object') {
      const data = { ...serializable.data };
      
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && isSafeBigInt(data[key])) {
          data[key] = (data[key] as SafeBigInt).toString();
        }
      });
      
      serializable.data = data;
    }
    
    return JSON.stringify(serializable);
  }

  send(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const serialized = this.serializeMessage(message);
        this.ws.send(serialized);
        console.log('[WebSocket] Sent message:', message);
      } catch {
        console.error('[WebSocket] Failed to send message:', error);
      }
    } else {
      console.warn('[WebSocket] Cannot send message - not connected');
    }
  }

  // Send message to specific campaign
  sendMessage(campaignId: string, message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const messageWithCampaign = {
          ...message,
          campaignId: campaignId as UUID
        };
        const serialized = this.serializeMessage(messageWithCampaign);
        this.ws.send(serialized);
        console.log(`[WebSocket] Sent message to campaign ${campaignId}:`, messageWithCampaign);
      } catch {
        console.error('[WebSocket] Failed to send message to campaign:', error);
      }
    } else {
      console.warn('[WebSocket] Cannot send message - not connected');
    }
  }

  // Get connection status for all campaigns
  getConnectionStatus(): ConnectionStatus[] {
    const statuses: ConnectionStatus[] = [];
    
    this.campaignConnections.forEach((connected, campaignId) => {
      statuses.push({
        campaignId,
        connected,
        lastMessageAt: new Date().toISOString()
      });
    });
    
    return statuses;
  }

  // Simulate a message for testing
  simulateMessage(message: WebSocketMessage): void {
    this.messageHandlers.forEach(handler => {
      try {
        handler(message);
      } catch {
        console.error('Error in message handler:', error);
      }
    });
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
