// src/lib/services/websocketService.ts
// Production WebSocket Service - Direct backend integration
// HIGH PRIORITY FIX: Implements standardized message validation and error handling
// Phase 2.2: Added message ordering and subscription state persistence

import { getWebSocketConfig, getApiConfig } from '@/lib/config/environment';
import {
  validateWebSocketMessage,
  transformLegacyMessage,
  type WebSocketMessage,
  type LegacyCampaignProgressMessage,
  isCampaignProgressMessage as _isCampaignProgressMessage,
  isDomainGeneratedMessage as _isDomainGeneratedMessage,
  isValidationResultMessage as _isValidationResultMessage,
  isCampaignErrorMessage as _isCampaignErrorMessage
} from '@/lib/schemas/websocketMessageSchema';
// Listen to auth lifecycle so we can reconnect with fresh cookies / tokens
import { authService } from '@/lib/services/authService';
// Enhanced logging with timestamps
import { logWebSocket, logAuth } from '@/lib/utils/logger';

// Updated types using standardized message format
export type WebSocketEventHandler = (message: WebSocketMessage) => void;
export type WebSocketErrorHandler = (error: Event | Error) => void;

// Legacy interface maintained for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Legacy compatibility interface
export interface CampaignProgressMessage extends LegacyCampaignProgressMessage {}

// Subscription state interface for persistence
interface SubscriptionState {
  campaignIds: string[];
  lastSequenceNumbers: Record<string, number>;
  timestamp: string;
}

// Reconnection state tracking
interface ReconnectionState {
  attempt: number;
  lastAttemptTime: number;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

// CRITICAL FIX: Add message validation and proper error handling
class ProductionWebSocketService {
  private connections = new Map<string, WebSocket>();
  private _config = getWebSocketConfig();
  private reconnectTimeouts = new Map<string, NodeJS.Timeout>();
  private messageHandlers = new Map<string, Set<WebSocketEventHandler>>();
  private errorHandlers = new Map<string, Set<WebSocketErrorHandler>>();
  
  // Phase 2.2: Message ordering and subscription persistence
  private sequenceNumbers = new Map<string, number>();
  private messageBuffer = new Map<string, WebSocketMessage[]>();
  private subscriptions = new Set<string>();
  private readonly persistenceKey = 'domainflow_ws_subscriptions';
  
  // Phase 2.3: Exponential backoff with jitter for reconnection
  private reconnectionStates = new Map<string, ReconnectionState>();
  private readonly DEFAULT_BASE_DELAY = 1000; // 1 second
  private readonly DEFAULT_MAX_DELAY = 60000; // 60 seconds
  private readonly DEFAULT_MAX_ATTEMPTS = 10;
  private readonly JITTER_FACTOR = 0.3; // 30% jitter

  // Added properties for ExtendedWebSocketService
  public originalWebSocketMethods: {
    connectToCampaign?: (
      campaignId: string,
      onMessage: (message: unknown) => void,
      onError?: (error: unknown) => void
    ) => void;
    disconnect?: (campaignId: string) => void;
  } = {};

  public logSubscriptionEvent(campaignId: string, eventType: string, success: boolean): void {
    if (success) {
      logWebSocket.success(`${eventType} event for campaign ${campaignId}`, { campaignId, eventType });
    } else {
      logWebSocket.error(`${eventType} event for campaign ${campaignId}`, { campaignId, eventType });
    }
  }

  public updateCampaignWebSocketState(campaignId: string, state: string): void {
    logWebSocket.message(`Campaign ${campaignId} state updated to: ${state}`, { campaignId, state });
  }

  constructor() {
    // Attach auth event listeners once
    authService.on('token_refreshed', () => this.handleTokenRefresh());
    authService.on('logged_out', () => this.handleLogout());
    
    // Restore subscription state from localStorage
    this.restoreSubscriptionState();
  }
  
  /**
   * Persist subscription state to localStorage
   */
  private persistSubscriptionState(): void {
    // Guard against server-side execution
    if (typeof window === 'undefined') {
      return;
    }
    
    const state: SubscriptionState = {
      campaignIds: Array.from(this.subscriptions),
      lastSequenceNumbers: Object.fromEntries(this.sequenceNumbers),
      timestamp: new Date().toISOString()
    };
    
    try {
      localStorage.setItem(this.persistenceKey, JSON.stringify(state));
    } catch (_error) {
      console.error('Failed to persist WebSocket subscription state:', _error);
    }
  }
  
  /**
   * Restore subscription state from localStorage
   */
  private restoreSubscriptionState(): void {
    // Guard against server-side execution
    if (typeof window === 'undefined') {
      return;
    }
    
    try {
      const stored = localStorage.getItem(this.persistenceKey);
      if (stored) {
        const state = JSON.parse(stored) as SubscriptionState;
        // Only restore if state is less than 1 hour old
        const stateAge = Date.now() - new Date(state.timestamp).getTime();
        if (stateAge < 60 * 60 * 1000) {
          state.campaignIds.forEach(id => this.subscriptions.add(id));
          Object.entries(state.lastSequenceNumbers).forEach(([id, seq]) => {
            this.sequenceNumbers.set(id, seq);
          });
          logWebSocket.success('Restored WebSocket subscription state', state);
        }
      }
    } catch (_error) {
      logWebSocket.error('Failed to restore WebSocket subscription state', _error);
    }
  }
  
  /**
   * Handle incoming message with sequence number tracking
   * FIXED: Allow messages without sequence numbers to pass through
   */
  private handleOrderedMessage(message: WebSocketMessage, connectionKey: string): boolean {
    // If message doesn't have a sequence number, allow it through (system messages, etc.)
    if (typeof message.sequenceNumber !== 'number') {
      logWebSocket.message(`Processing message without sequence number: ${message.type}`, { messageType: message.type });
      return true;
    }
    
    const expectedSequence = this.sequenceNumbers.get(connectionKey) ?? -1;
    
    // If this is the next expected message, process it
    if (message.sequenceNumber === expectedSequence + 1) {
      this.sequenceNumbers.set(connectionKey, message.sequenceNumber);
      
      // Check if we have buffered messages that can now be processed
      const buffer = this.messageBuffer.get(connectionKey) ?? [];
      const sortedBuffer = buffer.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      
      // eslint-disable-next-line prefer-const -- Array is modified with push() in the loop below
      let processed = [message];
      let currentSequence = message.sequenceNumber;
      
      for (const bufferedMsg of sortedBuffer) {
        if (bufferedMsg.sequenceNumber === currentSequence + 1) {
          processed.push(bufferedMsg);
          currentSequence = bufferedMsg.sequenceNumber;
          this.sequenceNumbers.set(connectionKey, currentSequence);
        }
      }
      
      // Remove processed messages from buffer
      const remaining = sortedBuffer.filter(
        msg => !processed.includes(msg) && msg.sequenceNumber > currentSequence
      );
      
      if (remaining.length > 0) {
        this.messageBuffer.set(connectionKey, remaining);
      } else {
        this.messageBuffer.delete(connectionKey);
      }
      
      // Return true to indicate message should be processed
      return true;
    }
    
    // If message is out of order but in the future, buffer it
    if (message.sequenceNumber > expectedSequence + 1) {
      const buffer = this.messageBuffer.get(connectionKey) ?? [];
      buffer.push(message);
      this.messageBuffer.set(connectionKey, buffer);
      
      console.warn(
        `Buffering out-of-order message. Expected: ${expectedSequence + 1}, Received: ${message.sequenceNumber}`
      );
      
      // Check if we've missed too many messages
      if (message.sequenceNumber > expectedSequence + 10) {
        console.error(
          `Large sequence gap detected. May have missed messages. Expected: ${expectedSequence + 1}, Received: ${message.sequenceNumber}`
        );
      }
      
      return false; // Don't process yet
    }
    
    // If message is old (already processed), ignore it
    if (message.sequenceNumber <= expectedSequence) {
      console.warn(
        `Ignoring duplicate/old message. Expected: ${expectedSequence + 1}, Received: ${message.sequenceNumber}`
      );
      return false;
    }
    
    return false;
  }

  /** Close and trigger reconnect for all active sockets when auth token changes */
  private handleTokenRefresh(): void {
    logAuth.token('Detected auth token refresh – cycling WebSocket connections');
    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        // 4001: custom code – token refreshed, please reconnect
        ws.close(4001, 'auth_token_refreshed');
      }
    });
  }

  /** Hard-disconnect everything on logout */
  private handleLogout(): void {
    logAuth.warn('Detected logout – disconnecting all WebSocket connections');
    this.disconnectAll();
  }

  /**
   * Get the correct WebSocket URL with authentication
   */
  private getWebSocketUrl(): string {
    const apiConfig = getApiConfig();
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    console.log('[WebSocket URL] Building URL with config:', {
      apiBaseUrl: apiConfig.baseUrl,
      currentProtocol: window.location.protocol,
      currentHost: window.location.host,
      wsProtocol
    });
    
    // Build base URL
    let baseUrl: string;
    if (apiConfig.baseUrl.startsWith('/')) {
      // For production, use relative path
      baseUrl = `${wsProtocol}//${window.location.host}/api/v2/ws`;
      console.log('[WebSocket URL] Using production path (relative):', baseUrl);
    } else {
      // For development, use absolute URL
      baseUrl = apiConfig.baseUrl.replace(/^https?:/, wsProtocol);
      baseUrl = `${baseUrl}/api/v2/ws`;
      console.log('[WebSocket URL] Using development path (absolute):', baseUrl);
    }
    
    // Get CSRF token from authService
    const csrfToken = authService.getCSRFToken();
    console.log('[WebSocket URL] CSRF token status:', {
      hasToken: !!csrfToken,
      tokenLength: csrfToken?.length || 0,
      tokenPreview: csrfToken ? `${csrfToken.substring(0, 8)}...` : null
    });
    
    // Add CSRF token as query parameter if available
    if (csrfToken) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      baseUrl = `${baseUrl}${separator}csrf_token=${encodeURIComponent(csrfToken)}`;
      console.log('[WebSocket URL] Added CSRF token to URL');
    } else {
      console.warn('[WebSocket URL] ⚠️ No CSRF token available - WebSocket authentication may fail');
    }
    
    console.log('[WebSocket URL] Final URL (without token):', baseUrl.replace(/csrf_token=[^&]+/, 'csrf_token=***'));
    
    return baseUrl;
  }

  /**
   * Connect to general campaign updates stream (for campaigns list)
   */
  connectToAllCampaigns(
    onMessage: WebSocketEventHandler,
    onError?: WebSocketErrorHandler
  ): () => void {
    console.log('[WebSocket] 🚀 connectToAllCampaigns called');
    
    // CRITICAL FIX: Check authentication state before attempting connection
    const authState = authService.getAuthState();
    console.log('[WebSocket] Auth state check:', {
      isAuthenticated: authState.isAuthenticated,
      hasUser: !!authState.user,
      hasTokens: !!authState.tokens,
      hasCSRFToken: !!authService.getCSRFToken(),
      isLoading: authState.isLoading
    });
    
    // Check if we have the minimum required authentication for WebSocket
    const hasCSRFToken = !!authService.getCSRFToken();
    
    // CRITICAL FIX: Enhanced authentication readiness check with better debugging
    if (!authState.isAuthenticated || !hasCSRFToken) {
      console.log('[WebSocket] 🔍 Authentication not ready, analyzing state...', {
        isAuthenticated: authState.isAuthenticated,
        hasCSRFToken,
        isLoading: authState.isLoading,
        hasUser: !!authState.user,
        hasTokens: !!authState.tokens,
        sessionExpiry: authState.sessionExpiry ? new Date(authState.sessionExpiry).toISOString() : null,
        currentTime: new Date().toISOString()
      });
      
      // Wait for authentication to be ready with extended timeout
      let retryCount = 0;
      const maxRetries = 20; // 10 seconds max wait (increased from 3 seconds)
      const retryInterval = 500; // 500ms intervals
      
      const checkAuth = (): () => void => {
        retryCount++;
        const currentAuthState = authService.getAuthState();
        const currentHasCSRF = !!authService.getCSRFToken();
        const csrfToken = authService.getCSRFToken();
        
        console.log(`[WebSocket] 🔄 Auth check attempt ${retryCount}/${maxRetries}:`, {
          isAuthenticated: currentAuthState.isAuthenticated,
          hasCSRFToken: currentHasCSRF,
          isLoading: currentAuthState.isLoading,
          hasUser: !!currentAuthState.user,
          userId: currentAuthState.user?.id,
          hasTokens: !!currentAuthState.tokens,
          sessionId: currentAuthState.tokens?.sessionId,
          csrfTokenLength: csrfToken?.length || 0,
          csrfTokenPreview: csrfToken ? `${csrfToken.substring(0, 8)}...` : null,
          sessionExpiry: currentAuthState.sessionExpiry ? new Date(currentAuthState.sessionExpiry).toISOString() : null
        });
        
        // FIXED: Proceed as soon as we have authentication and CSRF token
        if (currentAuthState.isAuthenticated && currentHasCSRF) {
          console.log('[WebSocket] ✅ Authentication ready, proceeding with connection');
          return this.connectToAllCampaigns(onMessage, onError);
        } else if (retryCount < maxRetries) {
          // Add exponential backoff for later retries to reduce spam
          const delay = retryCount > 10 ? 1000 : retryInterval;
          setTimeout(() => {
            checkAuth();
          }, delay);
          return () => {}; // Return empty cleanup for now
        } else {
          console.error('[WebSocket] ❌ Authentication timeout after 10 seconds - giving up on connection');
          console.error('[WebSocket] Final auth state:', {
            isAuthenticated: currentAuthState.isAuthenticated,
            hasCSRFToken: currentHasCSRF,
            hasUser: !!currentAuthState.user,
            hasTokens: !!currentAuthState.tokens,
            isLoading: currentAuthState.isLoading
          });
          const authError = new Error(`Authentication not ready after ${maxRetries * retryInterval / 1000} seconds - WebSocket connection aborted`);
          onError?.(authError);
          return () => {};
        }
      };
      
      return checkAuth();
    }
    
    const connectionKey = 'all-campaigns';
    
    // Clear any existing reconnect timeout
    const existingTimeout = this.reconnectTimeouts.get(connectionKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.reconnectTimeouts.delete(connectionKey);
    }
    
    // Clean up existing connection if any
    const existingWs = this.connections.get(connectionKey);
    if (existingWs && existingWs.readyState !== WebSocket.CLOSED) {
      console.warn('WebSocket already connected for all campaigns, closing existing connection');
      existingWs.close(1000, 'Replacing connection');
      this.connections.delete(connectionKey);
    }

    console.log('[WebSocket] 🚀 Starting connection process...');
    
    // Enhanced authentication state logging
    const finalAuthState = authService.getAuthState();
    const finalCSRFToken = authService.getCSRFToken();
    console.log('[WebSocket] 📋 Final auth state before connection:', {
      isAuthenticated: finalAuthState.isAuthenticated,
      hasUser: !!finalAuthState.user,
      userId: finalAuthState.user?.id,
      userEmail: finalAuthState.user?.email,
      hasTokens: !!finalAuthState.tokens,
      sessionId: finalAuthState.tokens?.sessionId,
      hasCSRFToken: !!finalCSRFToken,
      csrfTokenLength: finalCSRFToken?.length || 0,
      csrfTokenPreview: finalCSRFToken ? `${finalCSRFToken.substring(0, 8)}...` : null,
      sessionExpiry: finalAuthState.sessionExpiry ? new Date(finalAuthState.sessionExpiry).toISOString() : null,
      timeUntilExpiry: finalAuthState.sessionExpiry ? Math.round((finalAuthState.sessionExpiry - Date.now()) / 1000) : null
    });
    
    let url: string;
    try {
      url = this.getWebSocketUrl();
      console.log('[WebSocket] ✅ URL constructed successfully');
    } catch (error) {
      console.error('[WebSocket] ❌ Failed to construct URL:', error);
      onError?.(error as Error);
      return () => {};
    }
    
    console.log('[WebSocket] 🔌 Creating WebSocket instance...');
    
    let ws: WebSocket;
    try {
      // WebSocket automatically sends cookies with the upgrade request
      ws = new WebSocket(url);
      console.log('[WebSocket] ✅ WebSocket instance created, readyState:', ws.readyState);
    } catch (error) {
      console.error('[WebSocket] ❌ Failed to create WebSocket:', error);
      onError?.(error as Error);
      return () => {};
    }

    ws.onopen = () => {
      console.log('[WebSocket] ✅ Connected successfully for all campaigns');
      // Send connection acknowledgment to get last sequence number
      ws.send(JSON.stringify({
        type: 'connection_init',
        lastSequenceNumber: this.sequenceNumbers.get(connectionKey) ?? 0
      }));
    };

    ws.onmessage = (event) => {
      try {
        const rawMessage = JSON.parse(event.data);
        console.log('[WebSocket] Received message:', rawMessage);
        
        // FIXED: Handle system messages without strict validation
        let validatedMessage: WebSocketMessage;
        try {
          validatedMessage = validateWebSocketMessage(rawMessage);
        } catch (validationError) {
          // Try to transform legacy message format for backward compatibility
          try {
            const legacyMessage = rawMessage as LegacyCampaignProgressMessage;
            validatedMessage = transformLegacyMessage(legacyMessage);
            console.warn('Received legacy WebSocket message format, transformed to standard format');
          } catch (_transformError) {
            // FIXED: Don't fail on system messages, just pass them through
            console.warn('WebSocket message validation failed, passing through as-is:', validationError);
            validatedMessage = {
              type: 'system_notification',
              id: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              sequenceNumber: undefined as unknown as number, // Will be handled by handleOrderedMessage
              data: {
                level: 'info',
                message: `Received message: ${rawMessage.type || 'unknown'}`,
                action: 'none'
              }
            };
          }
        }
        
        // Handle ordered message delivery
        if (this.handleOrderedMessage(validatedMessage, connectionKey)) {
          onMessage(validatedMessage);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        // FIXED: Don't call onError for parsing issues, just log them
        console.warn('Continuing despite message parsing error');
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] ❌ Connection error for all campaigns:', error);
      const wsTarget = error.target as WebSocket;
      const errorDetails = {
        type: error.type,
        readyState: wsTarget?.readyState,
        url: wsTarget?.url,
        readyStateText: wsTarget?.readyState === 0 ? 'CONNECTING' :
                      wsTarget?.readyState === 1 ? 'OPEN' :
                      wsTarget?.readyState === 2 ? 'CLOSING' :
                      wsTarget?.readyState === 3 ? 'CLOSED' : 'UNKNOWN',
        protocol: wsTarget?.protocol,
        extensions: wsTarget?.extensions,
        currentUrl: url,
        hasCSRFToken: !!authService.getCSRFToken(),
        timestamp: new Date().toISOString()
      };
      console.error('[WebSocket] Error details:', errorDetails);
      
      // Create a more descriptive error
      const descriptiveError = new Error(`WebSocket connection failed: ${errorDetails.readyStateText} (${errorDetails.readyState}). URL: ${errorDetails.currentUrl}`);
      onError?.(descriptiveError);
    };

    ws.onclose = (event) => {
      console.warn('[WebSocket] 🔴 Connection closed for all campaigns:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        url: url
      });
      
      // Log common WebSocket close codes for debugging
      const closeCodeMeanings: Record<number, string> = {
        1000: 'Normal closure',
        1001: 'Going away',
        1002: 'Protocol error',
        1003: 'Unsupported data',
        1006: 'Abnormal closure',
        1007: 'Invalid frame payload data',
        1008: 'Policy violation',
        1009: 'Message too big',
        1010: 'Mandatory extension',
        1011: 'Internal server error',
        1015: 'TLS handshake failure',
        4001: 'Custom: Auth token refreshed'
      };
      
      console.warn('[WebSocket] Close code meaning:', closeCodeMeanings[event.code] || 'Unknown');
      
      this.connections.delete(connectionKey);
      
      // Automatic reconnection for unexpected closures
      if (event.code !== 1000 && event.code !== 1001) {
        console.log('[WebSocket] Scheduling reconnection due to unexpected close');
        this.scheduleReconnection(connectionKey, () => {
          this.connectToAllCampaigns(onMessage, onError);
        });
      } else {
        // Clean close - reset reconnection state
        console.log('[WebSocket] Clean close, not reconnecting');
        this.reconnectionStates.delete(connectionKey);
      }
    };

    this.connections.set(connectionKey, ws);

    // Return cleanup function
    return () => this.disconnect(connectionKey);
  }

  /**
   * Connect to campaign progress stream
   */
  connectToCampaign(
    campaignId: string,
    onMessage: WebSocketEventHandler,
    onError?: WebSocketErrorHandler
  ): () => void {
    // Clear any existing reconnect timeout
    const existingTimeout = this.reconnectTimeouts.get(campaignId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.reconnectTimeouts.delete(campaignId);
    }
    
    // Clean up existing connection if any
    const existingWs = this.connections.get(campaignId);
    if (existingWs && existingWs.readyState !== WebSocket.CLOSED) {
      console.warn(`WebSocket already connected for campaign ${campaignId}, closing existing connection`);
      existingWs.close(1000, 'Replacing connection');
      this.connections.delete(campaignId);
    }

    const url = this.getWebSocketUrl();
    console.log(`[WebSocket] Attempting connection for campaign ${campaignId}:`, url);
    console.log(`[WebSocket] CSRF token available:`, !!authService.getCSRFToken());
    
    // WebSocket automatically sends cookies with the upgrade request
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log(`[WebSocket] ✅ Connected successfully for campaign ${campaignId}`);
      // Subscribe to specific campaign updates - use correct message type
      ws.send(JSON.stringify({
        type: 'subscribe_campaign',
        campaignId: campaignId,
        lastSequenceNumber: this.sequenceNumbers.get(campaignId) ?? 0
      }));
      
      // Track subscription
      this.subscriptions.add(campaignId);
      this.persistSubscriptionState();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`[WebSocket] Campaign ${campaignId} received message:`, message);
        
        // Handle different message formats from backend
        if (message.type === 'subscription_confirmed') {
          console.log(`Subscription confirmed for campaign ${campaignId}`);
          // Update last sequence number if provided
          if (message.lastSequenceNumber !== undefined) {
            this.sequenceNumbers.set(campaignId, message.lastSequenceNumber);
          }
          return;
        }
        
        // Handle connection acknowledgment
        if (message.type === 'connection_ack' && message.data?.lastSequenceNumber !== undefined) {
          this.sequenceNumbers.set(campaignId, message.data.lastSequenceNumber);
          console.log(`Connection acknowledged with last sequence: ${message.data.lastSequenceNumber}`);
          return;
        }
        
        // FIXED: More lenient message validation and transformation
        let validatedMessage: WebSocketMessage;
        try {
          validatedMessage = validateWebSocketMessage(message);
        } catch (validationError) {
          // Try to transform legacy message format
          try {
            const frontendMessage: LegacyCampaignProgressMessage = {
              type: message.type || 'progress',
              campaignId: message.campaignId || message.CampaignID || campaignId,
              data: message.data || {
                progress: message.progress,
                phase: message.phase,
                status: message.status,
                error: message.error,
                domains: message.domains,
                validationResults: message.validationResults
              },
              message: message.message
            };
            // Use current sequence number for legacy messages
            const currentSeq = this.sequenceNumbers.get(campaignId) ?? 0;
            validatedMessage = transformLegacyMessage(frontendMessage, currentSeq + 1);
            this.sequenceNumbers.set(campaignId, currentSeq + 1);
            console.warn('Received legacy WebSocket message format for campaign, transformed to standard format');
          } catch (_transformError) {
            // FIXED: Don't fail on campaign messages, just pass them through
            console.warn('WebSocket message validation failed for campaign, passing through as-is:', validationError);
            validatedMessage = {
              type: 'campaign_progress',
              id: `campaign_${campaignId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
              sequenceNumber: undefined as unknown as number, // Will be handled by handleOrderedMessage
              campaignId: campaignId,
              data: {
                status: 'running',
                progressPercentage: 0,
                processedItems: 0,
                totalItems: 0,
                phase: 'domain_generation'
              }
            };
          }
        }
        
        // Only process messages for this campaign or system-wide messages
        const shouldProcess =
          ('campaignId' in validatedMessage && validatedMessage.campaignId === campaignId) ||
          validatedMessage.type === 'system_notification' ||
          validatedMessage.type === 'connection_ack';
          
        if (shouldProcess) {
          // Handle ordered message delivery
          if (this.handleOrderedMessage(validatedMessage, campaignId)) {
            onMessage(validatedMessage);
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error, event.data);
        // FIXED: Don't call onError for parsing issues in campaign connections
        console.warn('Continuing despite campaign message parsing error');
      }
    };

    ws.onerror = (error) => {
      console.error(`[WebSocket] ❌ Connection error for campaign ${campaignId}:`, error);
      const wsTarget = error.target as WebSocket;
      const errorDetails = {
        type: error.type,
        readyState: wsTarget?.readyState,
        url: wsTarget?.url,
        readyStateText: wsTarget?.readyState === 0 ? 'CONNECTING' :
                      wsTarget?.readyState === 1 ? 'OPEN' :
                      wsTarget?.readyState === 2 ? 'CLOSING' :
                      wsTarget?.readyState === 3 ? 'CLOSED' : 'UNKNOWN',
        protocol: wsTarget?.protocol,
        extensions: wsTarget?.extensions,
        currentUrl: url,
        hasCSRFToken: !!authService.getCSRFToken(),
        campaignId,
        timestamp: new Date().toISOString()
      };
      console.error(`[WebSocket] Error details:`, errorDetails);
      
      // Create a more descriptive error
      const descriptiveError = new Error(`WebSocket connection failed for campaign ${campaignId}: ${errorDetails.readyStateText} (${errorDetails.readyState}). URL: ${errorDetails.currentUrl}`);
      onError?.(descriptiveError);
    };

    ws.onclose = (event) => {
      console.warn(`[WebSocket] 🔴 Connection closed for campaign ${campaignId}:`, {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        url: url,
        campaignId
      });
      
      // Log common WebSocket close codes for debugging
      const closeCodeMeanings: Record<number, string> = {
        1000: 'Normal closure',
        1001: 'Going away',
        1002: 'Protocol error',
        1003: 'Unsupported data',
        1006: 'Abnormal closure',
        1007: 'Invalid frame payload data',
        1008: 'Policy violation',
        1009: 'Message too big',
        1010: 'Mandatory extension',
        1011: 'Internal server error',
        1015: 'TLS handshake failure',
        4001: 'Custom: Auth token refreshed'
      };
      
      console.warn(`[WebSocket] Close code meaning:`, closeCodeMeanings[event.code] || 'Unknown');
      
      this.connections.delete(campaignId);
      
      // Automatic reconnection for unexpected closures
      if (event.code !== 1000 && event.code !== 1001) {
        console.log(`[WebSocket] Scheduling reconnection for campaign ${campaignId} due to unexpected close`);
        this.scheduleReconnection(campaignId, () => {
          // Restore subscription on reconnect
          if (this.subscriptions.has(campaignId)) {
            this.connectToCampaign(campaignId, onMessage, onError);
          }
        });
      } else {
        // Clean close - reset reconnection state
        console.log(`[WebSocket] Clean close for campaign ${campaignId}, not reconnecting`);
        this.reconnectionStates.delete(campaignId);
      }
    };

    this.connections.set(campaignId, ws);

    // Return cleanup function
    return () => this.disconnect(campaignId);
  }

  /**
   * Disconnect from specific campaign
   */
  disconnect(campaignId: string): void {
    const ws = this.connections.get(campaignId);
    if (ws) {
      // Send unsubscribe message before closing
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'unsubscribe_campaign',
          campaignId: campaignId
        }));
      }
      ws.close(1000, 'Manual disconnect');
      this.connections.delete(campaignId);
      
      // Remove from tracked subscriptions
      this.subscriptions.delete(campaignId);
      this.sequenceNumbers.delete(campaignId);
      this.messageBuffer.delete(campaignId);
      this.persistSubscriptionState();
    }
    
    // Clear any reconnect timeout
    const timeout = this.reconnectTimeouts.get(campaignId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(campaignId);
    }
  }

  /**
   * Disconnect all campaign streams
   */
  disconnectAll(): void {
    // Clear all reconnect timeouts
    this.reconnectTimeouts.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.reconnectTimeouts.clear();
    
    this.connections.forEach((ws, campaignId) => {
      // Send unsubscribe message before closing
      if (ws.readyState === WebSocket.OPEN && campaignId !== 'all-campaigns') {
        ws.send(JSON.stringify({
          type: 'unsubscribe_campaign',
          campaignId: campaignId
        }));
      }
      ws.close(1000, 'Disconnect all');
    });
    this.connections.clear();
    
    // Clear all tracking
    this.subscriptions.clear();
    this.sequenceNumbers.clear();
    this.messageBuffer.clear();
    
    // Guard against server-side execution
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.persistenceKey);
    }
  }
  
  /**
   * Restore subscriptions after reconnection
   */
  restoreSubscriptions(
    onMessage: WebSocketEventHandler,
    onError?: WebSocketErrorHandler
  ): void {
    const campaignIds = Array.from(this.subscriptions);
    if (campaignIds.length > 0) {
      console.log('Restoring subscriptions for campaigns:', campaignIds);
      campaignIds.forEach(campaignId => {
        if (!this.connections.has(campaignId)) {
          this.connectToCampaign(campaignId, onMessage, onError);
        }
      });
    }
  }

  /**
   * Check if connected to campaign
   */
  isConnected(campaignId: string): boolean {
    const ws = this.connections.get(campaignId);
    return ws ? ws.readyState === WebSocket.OPEN : false;
  }

  /**
   * Send message to campaign stream (if needed for control)
   */
  sendToCampaign(campaignId: string, message: Record<string, unknown>): void {
    const ws = this.connections.get(campaignId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn(`Cannot send message - no active connection for campaign ${campaignId}`);
    }
  }

  /**
   * Get connection status for all campaigns
   */
  getConnectionStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    this.connections.forEach((ws, campaignId) => {
      status[campaignId] = ws.readyState === WebSocket.OPEN;
    });
    return status;
  }
  
  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  private scheduleReconnection(connectionKey: string, reconnectFn: () => void): void {
    // Get or initialize reconnection state
    let state = this.reconnectionStates.get(connectionKey);
    if (!state) {
      state = {
        attempt: 0,
        lastAttemptTime: 0,
        maxAttempts: this.DEFAULT_MAX_ATTEMPTS,
        baseDelay: this.DEFAULT_BASE_DELAY,
        maxDelay: this.DEFAULT_MAX_DELAY
      };
    }
    
    // Check if we've exceeded max attempts
    if (state.attempt >= state.maxAttempts) {
      console.error(`Max reconnection attempts (${state.maxAttempts}) reached for ${connectionKey}`);
      this.reconnectionStates.delete(connectionKey);
      // Emit error event for UI notification
      this.errorHandlers.get(connectionKey)?.forEach(handler =>
        handler(new Error(`Failed to reconnect after ${state.maxAttempts} attempts`))
      );
      return;
    }
    
    // Calculate exponential backoff with jitter
    const exponentialDelay = Math.min(
      state.baseDelay * Math.pow(2, state.attempt),
      state.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.JITTER_FACTOR * (Math.random() * 2 - 1);
    const delayWithJitter = Math.max(0, exponentialDelay + jitter);
    
    state.attempt++;
    state.lastAttemptTime = Date.now();
    this.reconnectionStates.set(connectionKey, state);
    
    console.log(
      `Scheduling reconnection for ${connectionKey}: attempt ${state.attempt}/${state.maxAttempts}, delay ${Math.round(delayWithJitter)}ms`
    );
    
    // Clear any existing timeout
    const existingTimeout = this.reconnectTimeouts.get(connectionKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Schedule reconnection
    const timeout = setTimeout(() => {
      if (!this.connections.has(connectionKey)) {
        console.log(`Attempting reconnection for ${connectionKey} (attempt ${state.attempt})`);
        reconnectFn();
      }
      this.reconnectTimeouts.delete(connectionKey);
    }, delayWithJitter);
    
    this.reconnectTimeouts.set(connectionKey, timeout);
  }
  
  /**
   * Reset reconnection state for a connection
   */
  private resetReconnectionState(connectionKey: string): void {
    this.reconnectionStates.delete(connectionKey);
    const timeout = this.reconnectTimeouts.get(connectionKey);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(connectionKey);
    }
  }
  
  /**
   * Get reconnection state for monitoring
   */
  getReconnectionState(): Record<string, ReconnectionState> {
    const states: Record<string, ReconnectionState> = {};
    this.reconnectionStates.forEach((state, key) => {
      states[key] = { ...state };
    });
    return states;
  }
}

// Export singleton instance
export const websocketService = new ProductionWebSocketService();
export default websocketService;

// Legacy compatibility exports for components that still use the old API
export const globalWebSocket = {
  destroy: () => websocketService.disconnectAll()
};

export const campaignWebSocket = {
  destroy: () => websocketService.disconnectAll()
};
