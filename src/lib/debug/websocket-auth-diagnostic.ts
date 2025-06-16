/**
 * WebSocket Authentication Diagnostic Tool
 * Debug tool to analyze authentication token synchronization issues
 * between authService and WebSocket connections
 */

import { authService } from '@/lib/services/authService';
import { websocketService } from '@/lib/services/websocketService.simple';
import { apiClient as _apiClient } from '@/lib/services/apiClient.production';

export interface AuthTokenSyncDiagnostic {
  timestamp: string;
  authServiceToken: string | null;
  apiClientToken: string | null;
  localStorageToken: string | null;
  cookieTokens: Record<string, string>;
  sessionState: {
    isAuthenticated: boolean;
    sessionExpiry: number | null;
    sessionId: string | null;
  };
  websocketConnections: Record<string, boolean>;
}

export interface TokenRefreshCoordinationDiagnostic {
  tokenRefreshEvent: string;
  beforeState: AuthTokenSyncDiagnostic;
  afterState: AuthTokenSyncDiagnostic;
  websocketReconnectionTriggered: boolean;
  duration: number;
}

class WebSocketAuthDiagnostic {
  private diagnosticLog: AuthTokenSyncDiagnostic[] = [];
  private tokenRefreshLog: TokenRefreshCoordinationDiagnostic[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalRefreshSession: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private originalConnectToCampaign: any;

  startDiagnostic(): void {
    console.log('[WebSocket Auth Diagnostic] Starting comprehensive auth diagnostic...');
    
    // Initial state capture
    this.captureCurrentState('diagnostic_start');
    
    // Hook into authService token refresh
    this.hookTokenRefresh();
    
    // Hook into WebSocket connection attempts
    this.hookWebSocketConnections();
    
    // Set up periodic monitoring
    this.startPeriodicMonitoring();
    
    console.log('[WebSocket Auth Diagnostic] Diagnostic hooks installed');
  }

  private captureCurrentState(event: string): AuthTokenSyncDiagnostic {
    const state: AuthTokenSyncDiagnostic = {
      timestamp: new Date().toISOString(),
      authServiceToken: authService.getCSRFToken(),
      apiClientToken: this.getApiClientToken(),
      localStorageToken: this.getLocalStorageToken(),
      cookieTokens: this.getAllCookieTokens(),
      sessionState: {
        isAuthenticated: authService.getAuthState().isAuthenticated,
        sessionExpiry: authService.getAuthState().sessionExpiry,
        sessionId: authService.getSessionId(),
      },
      websocketConnections: websocketService.getConnectionStatus(),
    };
    
    this.diagnosticLog.push(state);
    
    console.log(`[WebSocket Auth Diagnostic] State captured for event: ${event}`, state);
    return state;
  }

  private hookTokenRefresh(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.originalRefreshSession = authService.refreshSession.bind(authService);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (authService as any).refreshSession = async function(...args: any[]) {
      const startTime = performance.now();
      const beforeState = self.captureCurrentState('before_token_refresh');
      
      console.log('[WebSocket Auth Diagnostic] Token refresh initiated');
      
      // Call original method
      const result = await self.originalRefreshSession.apply(this, args);
      
      const afterState = self.captureCurrentState('after_token_refresh');
      const duration = performance.now() - startTime;
      
      // Check if WebSocket reconnection was triggered
      const websocketReconnectionTriggered = self.checkWebSocketReconnection(beforeState, afterState);
      
      const refreshDiagnostic: TokenRefreshCoordinationDiagnostic = {
        tokenRefreshEvent: 'session_refresh',
        beforeState,
        afterState,
        websocketReconnectionTriggered,
        duration,
      };
      
      self.tokenRefreshLog.push(refreshDiagnostic);
      
      console.log('[WebSocket Auth Diagnostic] Token refresh completed', refreshDiagnostic);
      
      // Analyze synchronization issues
      self.analyzeTokenSynchronization(refreshDiagnostic);
      
      return result;
    };
  }

  private hookWebSocketConnections(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.originalConnectToCampaign = websocketService.connectToCampaign.bind(websocketService);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (websocketService as any).connectToCampaign = function(campaignId: string, onMessage: any, onError?: any) {
      console.log(`[WebSocket Auth Diagnostic] WebSocket connection attempt for campaign: ${campaignId}`);
      
      const currentState = self.captureCurrentState(`websocket_connect_${campaignId}`);
      
      // Check token synchronization at connection time
      const syncIssues = self.identifyTokenSyncIssues(currentState);
      if (syncIssues.length > 0) {
        console.warn('[WebSocket Auth Diagnostic] Token sync issues detected at WebSocket connection:', syncIssues);
      }
      
      // Call original method
      return self.originalConnectToCampaign.call(this, campaignId, onMessage, onError);
    };
  }

  private startPeriodicMonitoring(): void {
    // Monitor every 30 seconds
    setInterval(() => {
      this.captureCurrentState('periodic_monitor');
      this.analyzeCurrentSyncState();
    }, 30000);
  }

  private getApiClientToken(): string | null {
    try {
      // Access private CSRF token from apiClient
      return localStorage.getItem('csrf_token');
    } catch (error) {
      console.warn('[WebSocket Auth Diagnostic] Failed to get API client token:', error);
      return null;
    }
  }

  private getLocalStorageToken(): string | null {
    try {
      const tokens = localStorage.getItem('auth_tokens');
      if (tokens) {
        const parsed = JSON.parse(tokens);
        return parsed.csrfToken || null;
      }
      return null;
    } catch (error) {
      console.warn('[WebSocket Auth Diagnostic] Failed to get localStorage token:', error);
      return null;
    }
  }

  private getAllCookieTokens(): Record<string, string> {
    const tokens: Record<string, string> = {};
    
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name && (name.includes('token') || name.includes('session') || name.includes('csrf'))) {
          tokens[name] = value || '';
        }
      }
    } catch (error) {
      console.warn('[WebSocket Auth Diagnostic] Failed to get cookie tokens:', error);
    }
    
    return tokens;
  }

  private checkWebSocketReconnection(beforeState: AuthTokenSyncDiagnostic, afterState: AuthTokenSyncDiagnostic): boolean {
    // Compare connection states to see if any reconnection occurred
    const beforeConnections = Object.keys(beforeState.websocketConnections);
    const afterConnections = Object.keys(afterState.websocketConnections);
    
    // Check if connection count changed or any connection state changed
    if (beforeConnections.length !== afterConnections.length) {
      return true;
    }
    
    for (const connectionId of beforeConnections) {
      if (beforeState.websocketConnections[connectionId] !== afterState.websocketConnections[connectionId]) {
        return true;
      }
    }
    
    return false;
  }

  private identifyTokenSyncIssues(state: AuthTokenSyncDiagnostic): string[] {
    const issues: string[] = [];
    
    // Check if all token sources are synchronized
    const authToken = state.authServiceToken;
    const apiToken = state.apiClientToken;
    const localToken = state.localStorageToken;
    
    if (authToken !== apiToken) {
      issues.push(`authService token (${authToken}) != apiClient token (${apiToken})`);
    }
    
    if (authToken !== localToken) {
      issues.push(`authService token (${authToken}) != localStorage token (${localToken})`);
    }
    
    if (apiToken !== localToken) {
      issues.push(`apiClient token (${apiToken}) != localStorage token (${localToken})`);
    }
    
    // Check if authenticated but no tokens
    if (state.sessionState.isAuthenticated && !authToken) {
      issues.push('Authenticated state but no CSRF token in authService');
    }
    
    // Check if session expired but still connected
    if (state.sessionState.sessionExpiry && state.sessionState.sessionExpiry < Date.now()) {
      if (Object.values(state.websocketConnections).some(connected => connected)) {
        issues.push('Session expired but WebSocket connections still active');
      }
    }
    
    return issues;
  }

  private analyzeTokenSynchronization(diagnostic: TokenRefreshCoordinationDiagnostic): void {
    const issues: string[] = [];
    
    // Check if token refresh actually updated all sources
    const beforeToken = diagnostic.beforeState.authServiceToken;
    const afterToken = diagnostic.afterState.authServiceToken;
    
    if (beforeToken === afterToken) {
      issues.push('Token refresh did not change authService token');
    }
    
    // Check if apiClient was updated
    if (diagnostic.afterState.apiClientToken !== afterToken) {
      issues.push('Token refresh did not update apiClient token');
    }
    
    // Check if localStorage was updated
    if (diagnostic.afterState.localStorageToken !== afterToken) {
      issues.push('Token refresh did not update localStorage token');
    }
    
    // Check if WebSocket connections should have been reset but weren't
    const hasActiveConnections = Object.values(diagnostic.afterState.websocketConnections).some(connected => connected);
    if (hasActiveConnections && !diagnostic.websocketReconnectionTriggered) {
      issues.push('WebSocket connections active after token refresh but no reconnection detected');
    }
    
    if (issues.length > 0) {
      console.error('[WebSocket Auth Diagnostic] Token synchronization issues detected:', issues);
    } else {
      console.log('[WebSocket Auth Diagnostic] Token synchronization appears healthy');
    }
  }

  private analyzeCurrentSyncState(): void {
    if (this.diagnosticLog.length < 2) return;
    
    const currentState = this.diagnosticLog[this.diagnosticLog.length - 1];
    if (!currentState) return;
    
    const issues = this.identifyTokenSyncIssues(currentState);
    
    if (issues.length > 0) {
      console.warn('[WebSocket Auth Diagnostic] Current sync issues:', issues);
    }
  }

  getDiagnosticReport(): {
    syncStates: AuthTokenSyncDiagnostic[];
    tokenRefreshEvents: TokenRefreshCoordinationDiagnostic[];
    summary: {
      totalSyncIssues: number;
      tokenRefreshCount: number;
      websocketReconnectionCount: number;
      commonIssues: string[];
    };
  } {
    const totalSyncIssues = this.diagnosticLog.reduce((count, state) => {
      return count + this.identifyTokenSyncIssues(state).length;
    }, 0);
    
    const websocketReconnectionCount = this.tokenRefreshLog.filter(
      event => event.websocketReconnectionTriggered
    ).length;
    
    const allIssues = this.diagnosticLog.flatMap(state => this.identifyTokenSyncIssues(state));
    const commonIssues = [...new Set(allIssues)];
    
    return {
      syncStates: this.diagnosticLog,
      tokenRefreshEvents: this.tokenRefreshLog,
      summary: {
        totalSyncIssues,
        tokenRefreshCount: this.tokenRefreshLog.length,
        websocketReconnectionCount,
        commonIssues,
      },
    };
  }

  stopDiagnostic(): void {
    // Restore original methods
    if (this.originalRefreshSession) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (authService as any).refreshSession = this.originalRefreshSession;
    }
    
    if (this.originalConnectToCampaign) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (websocketService as any).connectToCampaign = this.originalConnectToCampaign;
    }
    
    console.log('[WebSocket Auth Diagnostic] Diagnostic stopped');
  }
}

// Export singleton instance
export const websocketAuthDiagnostic = new WebSocketAuthDiagnostic();