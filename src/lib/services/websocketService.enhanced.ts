// src/lib/services/websocketService.enhanced.ts
// Enhanced WebSocket Service with automatic case transformations
// Part of M-003: Fix Naming Convention Mismatches

import type { WebSocketMessage } from '@/lib/types/websocket-types-fixed';
import { transformApiResponse, transformApiRequest } from '@/lib/utils/case-transformations';
import { transformInt64Fields } from '@/lib/types/branded';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface EnhancedWebSocketServiceOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onConnectionChange?: (state: ConnectionState) => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  skipTransform?: boolean; // Option to skip automatic transformation
}

class EnhancedWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private options: EnhancedWebSocketServiceOptions;
  private connectionState: ConnectionState = 'disconnected';
  private pingInterval: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private isReconnecting = false;

  constructor(options: EnhancedWebSocketServiceOptions = {}) {
    this.options = {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      skipTransform: false,
      ...options
    };
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.updateConnectionState('connecting');
    
    try {
      // Use environment-based WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch {
      console.error('Failed to create WebSocket connection:', error);
      this.handleError(new Event('error'));
    }
  }

  private handleOpen(): void {
    console.log('WebSocket connected');
    this.updateConnectionState('connected');
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    
    // Process queued messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
    
    // Start ping interval
    this.startPingInterval();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const rawMessage = JSON.parse(event.data);
      
      // Transform message from snake_case to camelCase
      const transformedMessage = this.options.skipTransform 
        ? rawMessage 
        : transformApiResponse<WebSocketMessage>(rawMessage);
      
      // Handle int64 fields for specific message types
      if (transformedMessage.type === 'campaign_progress' && transformedMessage.data) {
        const int64Fields = ['totalItems', 'processedItems', 'successfulItems', 'failedItems'];
        transformedMessage.data = transformInt64Fields(transformedMessage.data, int64Fields);
      }
      
      this.options.onMessage?.(transformedMessage);
    } catch {
      console.error('Failed to parse WebSocket message:', error);
      this.options.onError?.(new Error('Failed to parse WebSocket message'));
    }
  }

  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.updateConnectionState('error');
    this.options.onError?.(new Error('WebSocket connection error'));
  }

  private handleClose(event: CloseEvent): void {
    console.log('WebSocket closed:', event.code, event.reason);
    this.updateConnectionState('disconnected');
    this.stopPingInterval();
    
    // Attempt reconnection if not a normal closure
    if (event.code !== 1000 && event.code !== 1001) {
      this.scheduleReconnect();
    }
  }

  private updateConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.options.onConnectionChange?.(state);
    }
  }

  private scheduleReconnect(): void {
    if (this.isReconnecting || 
        this.reconnectAttempts >= (this.options.maxReconnectAttempts || 10)) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.options.reconnectInterval! * Math.pow(1.5, this.reconnectAttempts - 1),
      30000
    );
    
    console.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    
    // Default ping interval of 30 seconds
    const pingInterval = 30000;
    
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, pingInterval);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  send(message: WebSocketMessage | any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, queueing message');
      this.messageQueue.push(message);
      return;
    }

    try {
      // Transform message from camelCase to snake_case before sending
      const transformedMessage = this.options.skipTransform 
        ? message 
        : transformApiRequest(message);
      
      this.ws.send(JSON.stringify(transformedMessage));
    } catch {
      console.error('Failed to send WebSocket message:', error);
      this.options.onError?.(new Error('Failed to send message'));
    }
  }

  // Type-safe message sending methods
  sendCampaignCommand(campaignId: string, command: string): void {
    this.send({
      type: 'campaign_command',
      data: {
        campaignId,
        command
      }
    });
  }

  subscribeToCampaign(campaignId: string): void {
    this.send({
      type: 'subscribe',
      data: {
        entity: 'campaign',
        id: campaignId
      }
    });
  }

  unsubscribeFromCampaign(campaignId: string): void {
    this.send({
      type: 'unsubscribe',
      data: {
        entity: 'campaign',
        id: campaignId
      }
    });
  }

  disconnect(): void {
    console.log('Disconnecting WebSocket');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.stopPingInterval();
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.messageQueue = [];
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.updateConnectionState('disconnected');
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && 
           this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
let enhancedWebSocketService: EnhancedWebSocketService | null = null;

export function getEnhancedWebSocketService(
  options?: EnhancedWebSocketServiceOptions
): EnhancedWebSocketService {
  if (!enhancedWebSocketService) {
    enhancedWebSocketService = new EnhancedWebSocketService(options);
  }
  return enhancedWebSocketService;
}

export function resetEnhancedWebSocketService(): void {
  if (enhancedWebSocketService) {
    enhancedWebSocketService.disconnect();
    enhancedWebSocketService = null;
  }
}

export default EnhancedWebSocketService;