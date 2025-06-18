// Simple WebSocket Service - stub implementation for frontend compatibility
// This replaces the complex websocket infrastructure with a simple implementation

export interface WebSocketMessage {
  id?: string;
  timestamp?: string;
  type: string;
  data: any;
  payload?: any;
  message?: string;
  campaignId?: string;
  phase?: string;
  status?: string;
  progress?: number;
  sequenceNumber?: number;
}

export interface CampaignProgressMessage extends WebSocketMessage {
  type: 'campaign_progress' | 'progress' | 'domain_generated' | 'phase_complete' | 'error' | 'subscription_confirmed' | 'validation_complete' | 'system_notification';
  campaignId?: string;
  data: {
    campaignId?: string;
    progress?: number;
    phase?: string;
    status?: string;
    domains?: string[];
    validationResults?: any[];
    error?: string;
    [key: string]: any;
  };
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
  private connected = false;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private campaignConnections: Map<string, boolean> = new Map();

  connect(): Promise<void> {
    // Stub implementation - always resolve immediately
    this.connected = true;
    return Promise.resolve();
  }

  disconnect(): void {
    this.connected = false;
    this.campaignConnections.clear();
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
    this.campaignConnections.set(campaignId, true);
    
    if (onMessage) {
      this.subscribe(onMessage);
    }
    
    if (onError) {
      this.onError(onError);
    }

    // Return cleanup function
    return () => {
      this.campaignConnections.delete(campaignId);
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

  send(message: WebSocketMessage): void {
    // Stub implementation - no-op
    console.log('WebSocket send (stub):', message);
  }

  // Send message to specific campaign
  sendMessage(campaignId: string, message: WebSocketMessage): void {
    console.log(`WebSocket send to campaign ${campaignId} (stub):`, message);
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
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
