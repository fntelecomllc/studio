// src/lib/websocket/client.ts
// Session-based WebSocket Client - removes token authentication, uses cookies only
import { getApiBaseUrl } from '@/lib/config';
import { 
  getWebSocketSessionConfig, 
  webSocketAuthUtils,
  getWebSocketPerformanceConfig,
  webSocketReconnectionConfig 
} from '@/lib/config/websocket';
import { authService } from '@/lib/services/auth';

export interface WebSocketMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp?: string;
}

export interface WebSocketConfig {
  url?: string;
  protocols?: string[];
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  pingInterval?: number;
  enableAutoReconnect?: boolean;
  enableSessionValidation?: boolean;
  onSessionExpired?: () => void;
}

export type WebSocketEventType = 
  | 'open' 
  | 'close' 
  | 'error' 
  | 'message' 
  | 'sessionExpired'
  | 'reconnecting'
  | 'reconnected';

export type WebSocketEventHandler = (event?: unknown) => void;

class SessionWebSocketClient {
  private static instance: SessionWebSocketClient;
  private ws: WebSocket | null = null;
  private url: string = '';
  private config: WebSocketConfig;
  private sessionConfig = getWebSocketSessionConfig();
  private performanceConfig = getWebSocketPerformanceConfig();
  
  // Connection state
  private isConnecting = false;
  private isAuthenticated = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private sessionValidationTimer: NodeJS.Timeout | null = null;
  
  // Event handling
  private eventHandlers: Map<WebSocketEventType, Set<WebSocketEventHandler>> = new Map();
  private messageQueue: WebSocketMessage[] = [];
  
  // Session management
  private lastSessionValidation = 0;
  private sessionValidationInterval: number;

  static getInstance(): SessionWebSocketClient {
    if (!SessionWebSocketClient.instance) {
      SessionWebSocketClient.instance = new SessionWebSocketClient();
    }
    return SessionWebSocketClient.instance;
  }

  constructor(config: WebSocketConfig = {}) {
    this.config = {
      maxReconnectAttempts: webSocketReconnectionConfig.maxAttempts,
      reconnectDelay: webSocketReconnectionConfig.baseDelay,
      pingInterval: 30000, // 30 seconds
      enableAutoReconnect: true,
      enableSessionValidation: true,
      ...config
    };
    
    this.maxReconnectAttempts = this.config.maxReconnectAttempts || 10;
    this.sessionValidationInterval = this.sessionConfig.sessionValidationInterval;
    
    // Initialize event handler sets
    this.initializeEventHandlers();
    
    // Listen for auth state changes
    authService.on('logged_out', () => {
      this.handleSessionExpired();
    });
  }

  private initializeEventHandlers(): void {
    const eventTypes: WebSocketEventType[] = [
      'open', 'close', 'error', 'message', 'sessionExpired', 'reconnecting', 'reconnected'
    ];
    
    eventTypes.forEach(type => {
      this.eventHandlers.set(type, new Set());
    });
  }

  // Event subscription methods
  on(event: WebSocketEventType, handler: WebSocketEventHandler): () => void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }
    
    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  private emit(event: WebSocketEventType, data?: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in WebSocket event handler for ${event}:`, error);
        }
      });
    }
  }

  // Connection management
  async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      return;
    }

    try {
      // Check session validity before connecting
      if (!this.validateSessionForConnection()) {
        throw new Error('No valid session for WebSocket connection');
      }

      this.isConnecting = true;
      
      // Get WebSocket URL
      const wsUrl = await this.getWebSocketUrl();
      this.url = wsUrl;
      
      // Create WebSocket connection
      this.ws = new WebSocket(wsUrl, this.config.protocols);
      
      // Setup event handlers
      this.setupWebSocketHandlers();
      
    } catch (error) {
      this.isConnecting = false;
      console.error('WebSocket connection failed:', error);
      this.emit('error', error);
      
      if (this.config.enableAutoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private async getWebSocketUrl(): Promise<string> {
    if (this.config.url) {
      return this.config.url;
    }

    const baseUrl = await getApiBaseUrl();
    const wsProtocol = baseUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const host = baseUrl.replace(/^https?:\/\//, '');
    
    return `${wsProtocol}${host}/api/v2/ws`;
  }

  private validateSessionForConnection(): boolean {
    // Check if user is authenticated
    if (!authService.getAuthState().isAuthenticated) {
      return false;
    }
    
    // Check if session cookie exists
    return webSocketAuthUtils.isSessionValidForWebSocket();
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = (event) => {
      console.log('WebSocket connected');
      this.isConnecting = false;
      this.isAuthenticated = true;
      this.reconnectAttempts = 0;
      
      // Start session validation
      this.startSessionValidation();
      
      // Start ping/pong mechanism
      this.startPing();
      
      // Process queued messages
      this.processMessageQueue();
      
      this.emit('open', event);
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected', event.code, event.reason);
      this.isAuthenticated = false;
      this.stopTimers();
      
      this.emit('close', event);
      
      // Auto-reconnect if enabled and not a normal closure
      if (this.config.enableAutoReconnect && event.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      this.emit('error', event);
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        
        // Handle session expiration messages
        if (message.type === 'session_expired') {
          this.handleSessionExpired();
          return;
        }
        
        this.emit('message', message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  }

  private startSessionValidation(): void {
    if (!this.config.enableSessionValidation) return;
    
    this.sessionValidationTimer = setInterval(() => {
      this.validateSession();
    }, this.sessionValidationInterval);
  }

  private async validateSession(): Promise<void> {
    try {
      // Check if session is still valid
      const isValid = await authService.validateSession();
      
      if (!isValid) {
        this.handleSessionExpired();
      }
      
      this.lastSessionValidation = Date.now();
    } catch (error) {
      console.error('Session validation failed:', error);
      this.handleSessionExpired();
    }
  }

  private handleSessionExpired(): void {
    console.warn('WebSocket session expired');
    this.isAuthenticated = false;
    
    // Close connection
    if (this.ws) {
      this.ws.close(1000, 'Session expired');
    }
    
    // Clear timers
    this.stopTimers();
    
    // Emit session expired event
    this.emit('sessionExpired');
    
    // Redirect to login if handler provided
    if (this.config.onSessionExpired) {
      this.config.onSessionExpired();
    } else if (typeof window !== 'undefined') {
      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    }
  }

  private startPing(): void {
    if (!this.config.pingInterval) return;
    
    this.pingTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send({
          type: 'ping',
          payload: { timestamp: Date.now() }
        });
      }
    }, this.config.pingInterval);
  }

  private stopTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    
    if (this.sessionValidationTimer) {
      clearInterval(this.sessionValidationTimer);
      this.sessionValidationTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.calculateReconnectDelay();
    console.log(`Scheduling WebSocket reconnection in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
    
    this.emit('reconnecting', { 
      attempt: this.reconnectAttempts + 1, 
      maxAttempts: this.maxReconnectAttempts,
      delay 
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().then(() => {
        if (this.isConnected()) {
          this.emit('reconnected');
        }
      });
    }, delay);
  }

  private calculateReconnectDelay(): number {
    const baseDelay = this.config.reconnectDelay || webSocketReconnectionConfig.baseDelay;
    const maxDelay = webSocketReconnectionConfig.maxDelay;
    const jitterFactor = webSocketReconnectionConfig.jitterFactor;
    
    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, this.reconnectAttempts),
      maxDelay
    );
    
    const jitter = exponentialDelay * jitterFactor * Math.random();
    return exponentialDelay + jitter;
  }

  // Message handling
  send(message: WebSocketMessage): void {
    if (!this.isConnected() || !this.isAuthenticated) {
      console.warn('WebSocket not connected or not authenticated, queueing message');
      this.queueMessage(message);
      return;
    }

    try {
      const messageWithTimestamp = {
        ...message,
        timestamp: new Date().toISOString()
      };
      
      this.ws!.send(JSON.stringify(messageWithTimestamp));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
      this.queueMessage(message);
    }
  }

  private queueMessage(message: WebSocketMessage): void {
    // Limit queue size to prevent memory issues
    if (this.messageQueue.length >= this.performanceConfig.maxMessageBufferSize) {
      this.messageQueue.shift(); // Remove oldest message
    }
    
    this.messageQueue.push(message);
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected() && this.isAuthenticated) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  // Subscription management
  subscribe(topic: string): void {
    this.send({
      type: 'subscribe',
      payload: { topic }
    });
  }

  unsubscribe(topic: string): void {
    this.send({
      type: 'unsubscribe',
      payload: { topic }
    });
  }

  // Connection state
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionState(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'open';
      case WebSocket.CLOSING: return 'closing';
      case WebSocket.CLOSED: return 'closed';
      default: return 'closed';
    }
  }

  // Cleanup
  disconnect(): void {
    this.config.enableAutoReconnect = false;
    this.stopTimers();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isAuthenticated = false;
    this.messageQueue = [];
  }

  // Statistics
  getStats(): {
    isConnected: boolean;
    isAuthenticated: boolean;
    reconnectAttempts: number;
    queuedMessages: number;
    lastSessionValidation: number;
  } {
    return {
      isConnected: this.isConnected(),
      isAuthenticated: this.isAuthenticated,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      lastSessionValidation: this.lastSessionValidation,
    };
  }
}

// Export singleton instance
export const sessionWebSocketClient = SessionWebSocketClient.getInstance();

// Convenience methods
export function connectWebSocket(config?: WebSocketConfig): Promise<void> {
  const client = SessionWebSocketClient.getInstance();
  if (config) {
    Object.assign(client['config'], config);
  }
  return client.connect();
}

export function disconnectWebSocket(): void {
  sessionWebSocketClient.disconnect();
}

export function sendWebSocketMessage(message: WebSocketMessage): void {
  sessionWebSocketClient.send(message);
}

export function subscribeToWebSocketTopic(topic: string): void {
  sessionWebSocketClient.subscribe(topic);
}

export function unsubscribeFromWebSocketTopic(topic: string): void {
  sessionWebSocketClient.unsubscribe(topic);
}

export default sessionWebSocketClient;