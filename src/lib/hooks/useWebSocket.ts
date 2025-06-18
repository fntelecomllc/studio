/**
 * React Hook for Simple WebSocket Integration
 * 
 * Provides easy-to-use React hooks for WebSocket connections
 * that work directly with the simplified WebSocket service.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { websocketService, type WebSocketMessage, type MessageHandler, type ErrorHandler } from '@/lib/services/websocketService.simple';

// Hook state type
interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  lastMessage: WebSocketMessage | null;
}

/**
 * Hook for connecting to a specific campaign
 */
export function useCampaignWebSocket(
  campaignId: string | null,
  options: {
    onMessage?: MessageHandler;
    onError?: ErrorHandler;
    enabled?: boolean;
  } = {}
) {
  const { onMessage, onError, enabled = true } = options;
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessage: null
  });

  const cleanupRef = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);
  const campaignIdRef = useRef(campaignId);

  // Update refs
  enabledRef.current = enabled;
  campaignIdRef.current = campaignId;

  // Message handler that updates state
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setState(prev => ({ ...prev, lastMessage: message, error: null }));
    onMessage?.(message);
  }, [onMessage]);

  // Error handler that updates state
  const handleError = useCallback((error: Event | Error) => {
    const errorObj = error instanceof Error ? error : new Error('WebSocket error');
    setState(prev => ({ ...prev, error: errorObj }));
    onError?.(errorObj);
  }, [onError]);

  // Connect/disconnect effect
  useEffect(() => {
    if (!enabled || !campaignId) {
      // Cleanup existing connection
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true }));

    // Connect to campaign
    const cleanup = websocketService.connectToCampaign(
      campaignId,
      handleMessage,
      handleError
    );

    cleanupRef.current = cleanup;

    // Check connection status
    const checkConnection = () => {
      const isConnected = websocketService.isConnected(campaignId);
      setState(prev => ({ 
        ...prev, 
        isConnected, 
        isConnecting: !isConnected && prev.isConnecting 
      }));
    };

    // Initial check
    checkConnection();

    // Periodic check (simple approach)
    const interval = setInterval(checkConnection, 1000);

    return () => {
      clearInterval(interval);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [campaignId, enabled, handleMessage, handleError]);

  // Send message function
  const sendMessage = useCallback((message: object) => {
    if (campaignId) {
      websocketService.sendMessage(campaignId, message as any);
    }
  }, [campaignId]);

  return {
    ...state,
    sendMessage,
    isEnabled: enabled && !!campaignId
  };
}

/**
 * Hook for connecting to all campaigns
 */
export function useGlobalWebSocket(
  options: {
    onMessage?: MessageHandler;
    onError?: ErrorHandler;
    enabled?: boolean;
  } = {}
) {
  const { onMessage, onError, enabled = true } = options;
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    lastMessage: null
  });

  const cleanupRef = useRef<(() => void) | null>(null);

  // Message handler that updates state
  const handleMessage = useCallback((message: WebSocketMessage) => {
    setState(prev => ({ ...prev, lastMessage: message, error: null }));
    onMessage?.(message);
  }, [onMessage]);

  // Error handler that updates state
  const handleError = useCallback((error: Event | Error) => {
    const errorObj = error instanceof Error ? error : new Error('WebSocket error');
    setState(prev => ({ ...prev, error: errorObj }));
    onError?.(errorObj);
  }, [onError]);

  // Connect/disconnect effect
  useEffect(() => {
    if (!enabled) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true }));

    // Connect to all campaigns
    const cleanup = websocketService.connectToAllCampaigns(
      handleMessage,
      handleError
    );

    cleanupRef.current = cleanup;

    // Check connection status
    const checkConnection = () => {
      const status = websocketService.getConnectionStatus();
      const isConnected = Object.keys(status).length > 0 && Object.values(status).some(Boolean);
      setState(prev => ({ 
        ...prev, 
        isConnected, 
        isConnecting: !isConnected && prev.isConnecting 
      }));
    };

    // Initial check
    checkConnection();

    // Periodic check
    const interval = setInterval(checkConnection, 1000);

    return () => {
      clearInterval(interval);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [enabled, handleMessage, handleError]);

  return {
    ...state,
    isEnabled: enabled
  };
}

/**
 * Hook for getting WebSocket connection status
 */
export function useWebSocketStatus() {
  const [status, setStatus] = useState<Record<string, boolean>>({});
  const [isAnyConnected, setIsAnyConnected] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      const statusArray = websocketService.getConnectionStatus();
      const newStatus = statusArray.reduce((acc, status) => {
        acc[status.campaignId] = status.connected;
        return acc;
      }, {} as Record<string, boolean>);
      setStatus(newStatus);
      setIsAnyConnected(Object.values(newStatus).some(Boolean));
    };

    // Initial update
    updateStatus();

    // Periodic updates
    const interval = setInterval(updateStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    status,
    isAnyConnected,
    getStatus: (campaignId: string) => status[campaignId] || false
  };
}

/**
 * Hook for campaign-specific message filtering
 */
export function useCampaignMessages(
  campaignId: string | null,
  messageTypes?: string[]
) {
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [latestMessage, setLatestMessage] = useState<WebSocketMessage | null>(null);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    // Filter by campaign ID
    if (message.campaignId !== campaignId) return;
    
    // Filter by message type if specified
    if (messageTypes && !messageTypes.includes(message.type)) return;

    setLatestMessage(message);
    setMessages(prev => [...prev.slice(-99), message]); // Keep last 100 messages
  }, [campaignId, messageTypes]);

  const { isConnected, error } = useCampaignWebSocket(campaignId, {
    onMessage: handleMessage,
    enabled: !!campaignId
  });

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLatestMessage(null);
  }, []);

  return {
    messages,
    latestMessage,
    isConnected,
    error,
    clearMessages,
    messageCount: messages.length
  };
}
