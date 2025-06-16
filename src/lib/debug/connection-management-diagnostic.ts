/**
 * Connection Management and Recovery Diagnostic Tool
 * Debug tool to analyze WebSocket reconnection scenarios and API client coordination
 */

import { authService } from '@/lib/services/authService';
import { websocketService } from '@/lib/services/websocketService.simple';
import { apiClient, diagnosticApiClient } from '@/lib/services/apiClient.production';
import type { RequestOptions } from '@/lib/services/apiClient.production';
import type { ApiResponse } from '@/lib/types';

export interface ConnectionEvent {
  timestamp: string;
  type: 'websocket_connect' | 'websocket_disconnect' | 'websocket_reconnect' | 'api_request' | 'token_refresh';
  source: 'websocket' | 'api_client' | 'auth_service';
  details: {
    campaignId?: string;
    url?: string;
    closeCode?: number;
    closeReason?: string;
    reconnectAttempt?: number;
    tokenRefreshTriggered?: boolean;
    success?: boolean;
    duration?: number;
    error?: unknown;
  };
}

export interface ConnectionState {
  websocketConnections: Record<string, {
    connected: boolean;
    lastConnected: string;
    lastDisconnected: string;
    reconnectAttempts: number;
    currentCloseCode?: number;
  }>;
  apiClientState: {
    activeRequests: number;
    lastTokenRefresh: string;
    consecutiveFailures: number;
    isRetryingRequests: boolean;
  };
  authServiceState: {
    isAuthenticated: boolean;
    tokenExpiry: string;
    refreshInProgress: boolean;
    lastRefreshAttempt: string;
  };
}

export interface ConnectionDiagnosticReport {
  connectionEvents: ConnectionEvent[];
  currentState: ConnectionState;
  coordinationIssues: {
    orphanedReconnectionAttempts: ConnectionEvent[];
    tokenRefreshWithoutReconnection: ConnectionEvent[];
    reconnectionWithoutTokenRefresh: ConnectionEvent[];
    concurrentConnectionAttempts: string[];
    staleConnections: string[];
  };
  analysis: {
    totalReconnectionAttempts: number;
    successfulReconnections: number;
    tokenRefreshCoordinationRate: number;
    averageReconnectionTime: number;
    connectionStabilityScore: number;
  };
}

class ConnectionManagementDiagnostic {
  private connectionEvents: ConnectionEvent[] = [];
  private connectionState: ConnectionState = {
    websocketConnections: {},
    apiClientState: {
      activeRequests: 0,
      lastTokenRefresh: '',
      consecutiveFailures: 0,
      isRetryingRequests: false,
    },
    authServiceState: {
      isAuthenticated: false,
      tokenExpiry: '',
      refreshInProgress: false,
      lastRefreshAttempt: '',
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalMethods: Record<string, any> = {};
  private monitoringInterval?: NodeJS.Timeout;

  startDiagnostic(): void {
    console.log('[Connection Management Diagnostic] Starting connection management analysis...');
    
    // Hook into WebSocket methods
    this.hookWebSocketMethods();
    
    // Hook into API client methods
    this.hookApiClientMethods();
    
    // Hook into auth service methods
    this.hookAuthServiceMethods();
    
    // Start periodic monitoring
    this.startPeriodicMonitoring();
    
    console.log('[Connection Management Diagnostic] Connection management hooks installed');
  }

  private hookWebSocketMethods(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const originalWebSocket = window.WebSocket;
    let connectionId = 0;

    window.WebSocket = class extends originalWebSocket {
      private _connectionId: string;

      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        this._connectionId = `ws-${++connectionId}`;

        self.logConnectionEvent('websocket_connect', 'websocket', {
          url: url.toString(),
        });

        this.addEventListener('open', () => {
          self.updateWebSocketState(this._connectionId, 'connected');
        });

        this.addEventListener('close', (event) => {
          self.logConnectionEvent('websocket_disconnect', 'websocket', {
            closeCode: event.code,
            closeReason: event.reason,
          });
          self.updateWebSocketState(this._connectionId, 'disconnected', event.code);
        });

        this.addEventListener('error', (_error) => {
          self.logConnectionEvent('websocket_disconnect', 'websocket', {
            error: _error,
            success: false,
          });
        });
      }
    };

    this.originalMethods.wsConnect = websocketService.connectToCampaign.bind(websocketService);
    websocketService.connectToCampaign = function(campaignId: string, onMessage: unknown, onError?: unknown) {
      self.logConnectionEvent('websocket_connect', 'websocket', {
        campaignId,
      });

      return self.originalMethods.wsConnect.call(this, campaignId, onMessage, onError);
    };

    this.originalMethods.wsDisconnect = websocketService.disconnect.bind(websocketService);
    websocketService.disconnect = function(campaignId: string) {
      self.logConnectionEvent('websocket_disconnect', 'websocket', {
        campaignId,
      });

      return self.originalMethods.wsDisconnect.call(this, campaignId);
    };
  }

  private normalizeBodyOrOptions(
    bodyOrOptions: RequestOptions['body'] | RequestOptions | undefined
  ): RequestOptions['body'] | undefined {
    if (
      bodyOrOptions instanceof FormData ||
      typeof bodyOrOptions === 'string' ||
      bodyOrOptions === undefined
    ) {
      return bodyOrOptions;
    }
    if (typeof bodyOrOptions === 'object' && !Array.isArray(bodyOrOptions)) {
      return bodyOrOptions as RequestOptions['body'];
    }
    return undefined;
  }

  private hookApiClientMethods(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    ['get', 'post', 'put', 'delete'].forEach(method => {
      const apiMethod = diagnosticApiClient[method as 'get' | 'post' | 'put' | 'delete'];
      if (typeof apiMethod === 'function') {
        this.originalMethods[`api_${method}`] = apiMethod.bind(diagnosticApiClient);

        this.originalMethods[`api_${method}`] = async function<T>(
          endpoint: string,
          bodyOrOptions?: RequestOptions['body'] | RequestOptions,
          options?: RequestOptions
        ): Promise<ApiResponse<T>> {
          const startTime = performance.now();
          self.connectionState.apiClientState.activeRequests++;

          self.logConnectionEvent('api_request', 'api_client', {
            url: endpoint,
          });

          try {
            const normalizedBodyOrOptions = bodyOrOptions === null ? undefined : self.normalizeBodyOrOptions(bodyOrOptions);
            const requestOptions: Partial<RequestOptions> = {
              ...options,
              body: normalizedBodyOrOptions,
            };
            const result = method === 'get' || method === 'delete'
              ? await apiMethod(endpoint, requestOptions as Omit<RequestOptions, 'method'>)
              : await apiMethod(
                  endpoint,
                  requestOptions.body !== null ? requestOptions.body : undefined,
                  requestOptions as Omit<RequestOptions, 'method' | 'body'>
                );
            const duration = performance.now() - startTime;

            self.connectionState.apiClientState.activeRequests--;
            self.connectionState.apiClientState.consecutiveFailures = 0;

            self.logConnectionEvent('api_request', 'api_client', {
              url: endpoint,
              success: true,
              duration,
            });

            return result as ApiResponse<T>;
          } catch (_error) {
            const duration = performance.now() - startTime;

            self.connectionState.apiClientState.activeRequests--;
            self.connectionState.apiClientState.consecutiveFailures++;

            self.logConnectionEvent('api_request', 'api_client', {
              url: endpoint,
              success: false,
              duration,
              error: _error,
            });

            throw _error;
          }
        };
      }
    });
  }

  private hookAuthServiceMethods(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    
    // Hook token refresh
    this.originalMethods.refreshSession = authService.refreshSession.bind(authService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (authService as any).refreshSession = async function(...args: any[]) {
      const startTime = performance.now();
      self.connectionState.authServiceState.refreshInProgress = true;
      self.connectionState.authServiceState.lastRefreshAttempt = new Date().toISOString();
      
      self.logConnectionEvent('token_refresh', 'auth_service', {
        tokenRefreshTriggered: true,
      });
      
      try {
        const result = await self.originalMethods.refreshSession.apply(this, args);
        const duration = performance.now() - startTime;
        
        self.connectionState.authServiceState.refreshInProgress = false;
        self.connectionState.apiClientState.lastTokenRefresh = new Date().toISOString();
        
        self.logConnectionEvent('token_refresh', 'auth_service', {
          success: true,
          duration,
        });
        
        // Check if WebSocket reconnection should be triggered
        self.analyzeTokenRefreshCoordination();
        
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        self.connectionState.authServiceState.refreshInProgress = false;
        
        self.logConnectionEvent('token_refresh', 'auth_service', {
          success: false,
          duration,
          error,
        });
        
        throw error;
      }
    };
  }

  private startPeriodicMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateAuthState();
      this.detectStaleConnections();
      this.analyzeConnectionHealth();
    }, 10000); // Every 10 seconds
  }

  private logConnectionEvent(
    type: ConnectionEvent['type'], 
    source: ConnectionEvent['source'], 
    details: ConnectionEvent['details']
  ): void {
    const event: ConnectionEvent = {
      timestamp: new Date().toISOString(),
      type,
      source,
      details,
    };
    
    this.connectionEvents.push(event);
    console.log(`[Connection Management Diagnostic] ${type} event:`, event);
  }

  private updateWebSocketState(connectionId: string, status: 'connected' | 'disconnected', closeCode?: number): void {
    if (!this.connectionState.websocketConnections[connectionId]) {
      this.connectionState.websocketConnections[connectionId] = {
        connected: false,
        lastConnected: '',
        lastDisconnected: '',
        reconnectAttempts: 0,
      };
    }
    
    const connection = this.connectionState.websocketConnections[connectionId];
    
    if (status === 'connected') {
      connection.connected = true;
      connection.lastConnected = new Date().toISOString();
    } else {
      connection.connected = false;
      connection.lastDisconnected = new Date().toISOString();
      connection.currentCloseCode = closeCode;
      
      // Detect if this might trigger a reconnection
      if (closeCode && closeCode !== 1000 && closeCode !== 1001) {
        connection.reconnectAttempts++;
        this.logConnectionEvent('websocket_reconnect', 'websocket', {
          reconnectAttempt: connection.reconnectAttempts,
        });
      }
    }
  }

  private updateAuthState(): void {
    const authState = authService.getAuthState();
    this.connectionState.authServiceState.isAuthenticated = authState.isAuthenticated;
    this.connectionState.authServiceState.tokenExpiry = authState.sessionExpiry ? new Date(authState.sessionExpiry).toISOString() : '';
  }

  private detectStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    Object.keys(this.connectionState.websocketConnections).forEach(connectionId => {
      const connection = this.connectionState.websocketConnections[connectionId];
      
      if (connection && connection.connected && connection.lastConnected) {
        const lastConnectedTime = new Date(connection.lastConnected).getTime();
        if (now - lastConnectedTime > staleThreshold) {
          console.warn(`[Connection Management Diagnostic] Potentially stale connection detected: ${connectionId}`);
        }
      }
    });
  }

  private analyzeTokenRefreshCoordination(): void {
    // Look for recent token refresh events and check if WebSocket reconnection followed
    const recentTokenRefresh = this.connectionEvents
      .filter(event => event.type === 'token_refresh' && event.details.success)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    
    if (!recentTokenRefresh) return;
    
    const refreshTime = new Date(recentTokenRefresh.timestamp).getTime();
    const subsequentReconnections = this.connectionEvents
      .filter(event => 
        event.type === 'websocket_reconnect' && 
        new Date(event.timestamp).getTime() > refreshTime &&
        new Date(event.timestamp).getTime() < refreshTime + (30 * 1000) // Within 30 seconds
      );
      
    if (subsequentReconnections.length === 0) {
      console.warn('[Connection Management Diagnostic] Token refresh occurred but no WebSocket reconnections detected');
    }
  }

  private analyzeConnectionHealth(): void {
    const recentEvents = this.connectionEvents.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
      return eventTime > tenMinutesAgo;
    });
    
    const disconnections = recentEvents.filter(event => event.type === 'websocket_disconnect');
    const reconnections = recentEvents.filter(event => event.type === 'websocket_reconnect');
    
    if (disconnections.length > 3) {
      console.warn(`[Connection Management Diagnostic] High disconnection rate: ${disconnections.length} disconnections in last 10 minutes`);
    }
    
    if (reconnections.length > disconnections.length) {
      console.warn('[Connection Management Diagnostic] More reconnection attempts than disconnections - possible connection instability');
    }
  }

  getDiagnosticReport(): ConnectionDiagnosticReport {
    const reconnectionEvents = this.connectionEvents.filter(event => event.type === 'websocket_reconnect');
    const tokenRefreshEvents = this.connectionEvents.filter(event => event.type === 'token_refresh');
    
    // Find coordination issues
    const tokenRefreshWithoutReconnection = tokenRefreshEvents.filter(refreshEvent => {
      const refreshTime = new Date(refreshEvent.timestamp).getTime();
      const subsequentReconnection = reconnectionEvents.find(reconnectEvent => {
        const reconnectTime = new Date(reconnectEvent.timestamp).getTime();
        return reconnectTime > refreshTime && reconnectTime < refreshTime + (60 * 1000); // Within 1 minute
      });
      return !subsequentReconnection;
    });
    
    const reconnectionWithoutTokenRefresh = reconnectionEvents.filter(reconnectEvent => {
      const reconnectTime = new Date(reconnectEvent.timestamp).getTime();
      const precedingTokenRefresh = tokenRefreshEvents.find(refreshEvent => {
        const refreshTime = new Date(refreshEvent.timestamp).getTime();
        return refreshTime < reconnectTime && refreshTime > reconnectTime - (60 * 1000); // Within 1 minute before
      });
      return !precedingTokenRefresh;
    });
    
    // Calculate metrics
    const successfulReconnections = reconnectionEvents.filter(event => event.details.success !== false).length;
    const totalReconnectionAttempts = reconnectionEvents.length;
    const coordinatedRefreshes = tokenRefreshEvents.length - tokenRefreshWithoutReconnection.length;
    const tokenRefreshCoordinationRate = tokenRefreshEvents.length > 0 ? coordinatedRefreshes / tokenRefreshEvents.length : 0;
    
    const reconnectionTimes = reconnectionEvents
      .filter(event => event.details.duration)
      .map(event => event.details.duration!);
    const averageReconnectionTime = reconnectionTimes.length > 0 
      ? reconnectionTimes.reduce((sum, time) => sum + time, 0) / reconnectionTimes.length 
      : 0;
    
    const connectionStabilityScore = Math.max(0, 1 - (totalReconnectionAttempts / Math.max(1, this.connectionEvents.length)));
    
    return {
      connectionEvents: this.connectionEvents,
      currentState: this.connectionState,
      coordinationIssues: {
        orphanedReconnectionAttempts: reconnectionWithoutTokenRefresh,
        tokenRefreshWithoutReconnection,
        reconnectionWithoutTokenRefresh,
        concurrentConnectionAttempts: [], // Would need more complex logic to detect
        staleConnections: Object.keys(this.connectionState.websocketConnections).filter(id => {
          const conn = this.connectionState.websocketConnections[id];
          return conn && conn.connected && conn.lastConnected &&
            (Date.now() - new Date(conn.lastConnected).getTime()) > (5 * 60 * 1000);
        }),
      },
      analysis: {
        totalReconnectionAttempts,
        successfulReconnections,
        tokenRefreshCoordinationRate,
        averageReconnectionTime,
        connectionStabilityScore,
      },
    };
  }

  stopDiagnostic(): void {
    // Restore original methods
    Object.keys(this.originalMethods).forEach(key => {
      if (key.startsWith('api_')) {
        const method = key.replace('api_', '');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (apiClient as any)[method] = this.originalMethods[key];
      } else if (key === 'refreshSession') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (authService as any).refreshSession = this.originalMethods[key];
      } else if (key.startsWith('ws')) {
        const method = key.replace('ws', '').toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (websocketService as any)[method] = this.originalMethods[key];
      }
    });
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    console.log('[Connection Management Diagnostic] Diagnostic stopped');
  }
}

// Export singleton instance
export const connectionManagementDiagnostic = new ConnectionManagementDiagnostic();