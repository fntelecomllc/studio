/**
 * Tests for Enhanced WebSocket Client
 * Validates SafeBigInt support, reconnection logic, and message routing
 */

import { enhancedWebSocketClient, websocketService, type WebSocketMessage, type CampaignProgressMessage } from '../enhancedWebSocketClient';
import { getEnhancedWebSocketService } from '@/lib/services/websocketService.enhanced';
import { createSafeBigInt, isSafeBigInt } from '@/lib/types/branded';
import { createUUID } from '@/lib/types/branded';

// Mock the enhanced service
jest.mock('@/lib/services/websocketService.enhanced', () => ({
  getEnhancedWebSocketService: jest.fn(),
  resetEnhancedWebSocketService: jest.fn()
}));

describe('Enhanced WebSocket Client', () => {
  let mockService: any;
  let onMessageCallback: any;
  let onErrorCallback: any;
  let onConnectionChangeCallback: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock service
    mockService = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn().mockReturnValue(false),
      subscribeToCampaign: jest.fn(),
      unsubscribeFromCampaign: jest.fn(),
      send: jest.fn(),
      sendCampaignCommand: jest.fn()
    };

    // Capture callbacks
    (getEnhancedWebSocketService as jest.Mock).mockImplementation((options) => {
      if (options) {
        onMessageCallback = options.onMessage;
        onErrorCallback = options.onError;
        onConnectionChangeCallback = options.onConnectionChange;
      }
      return mockService;
    });

    // Reset client state
    (enhancedWebSocketClient as any).messageHandlers = [];
    (enhancedWebSocketClient as any).errorHandlers = [];
    (enhancedWebSocketClient as any).campaignHandlers = new Map();
    (enhancedWebSocketClient as any).campaignConnections = new Map();
    (enhancedWebSocketClient as any).typedHandlers = {};
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(enhancedWebSocketClient).toBeDefined();
      expect(websocketService).toBe(enhancedWebSocketClient);
    });
  });

  describe('Connection Management', () => {
    it('should connect to service', async () => {
      mockService.isConnected.mockReturnValueOnce(false).mockReturnValueOnce(true);
      
      await enhancedWebSocketClient.connect();
      
      expect(mockService.connect).toHaveBeenCalled();
    });

    it('should handle connection timeout', async () => {
      mockService.isConnected.mockReturnValue(false);
      
      const start = Date.now();
      await enhancedWebSocketClient.connect();
      const duration = Date.now() - start;
      
      // Should timeout after ~5 seconds
      expect(duration).toBeLessThan(6000);
    }, 10000);

    it('should disconnect from service', () => {
      enhancedWebSocketClient.disconnect();
      
      expect(mockService.disconnect).toHaveBeenCalled();
    });

    it('should check connection status', () => {
      mockService.isConnected.mockReturnValue(true);
      
      expect(enhancedWebSocketClient.isConnected()).toBe(true);
    });

    it('should check campaign-specific connection', () => {
      const campaignId = 'test-campaign';
      (enhancedWebSocketClient as any).campaignConnections.set(campaignId, true);
      
      expect(enhancedWebSocketClient.isConnected(campaignId)).toBe(true);
      expect(enhancedWebSocketClient.isConnected('other-campaign')).toBe(false);
    });
  });

  describe('Campaign Subscriptions', () => {
    it('should connect to campaign', () => {
      const campaignId = 'test-campaign';
      const messageHandler = jest.fn();
      const errorHandler = jest.fn();
      
      mockService.isConnected.mockReturnValue(true);
      
      const cleanup = enhancedWebSocketClient.connectToCampaign(
        campaignId,
        messageHandler,
        errorHandler
      );
      
      expect(mockService.subscribeToCampaign).toHaveBeenCalledWith(campaignId);
      expect((enhancedWebSocketClient as any).campaignConnections.get(campaignId)).toBe(true);
      
      // Test cleanup
      cleanup();
      expect(mockService.unsubscribeFromCampaign).toHaveBeenCalledWith(campaignId);
      expect((enhancedWebSocketClient as any).campaignConnections.has(campaignId)).toBe(false);
    });

    it('should auto-connect if not connected', () => {
      const campaignId = 'test-campaign';
      mockService.isConnected.mockReturnValue(false);
      
      enhancedWebSocketClient.connectToCampaign(campaignId);
      
      expect(mockService.connect).toHaveBeenCalled();
    });

    it('should re-subscribe on reconnection', () => {
      const campaignId = 'test-campaign';
      (enhancedWebSocketClient as any).campaignConnections.set(campaignId, true);
      
      // Trigger connection change
      onConnectionChangeCallback?.('connected');
      
      expect(mockService.subscribeToCampaign).toHaveBeenCalledWith(campaignId);
    });
  });

  describe('Message Handling', () => {
    it('should handle SafeBigInt fields in messages', () => {
      const handler = jest.fn();
      enhancedWebSocketClient.subscribe(handler);
      
      const message = {
        type: 'campaign_progress',
        data: {
          campaignId: createUUID('123e4567-e89b-12d3-a456-426614174000'),
          domainsGenerated: createSafeBigInt('1234567890123456789'),
          progress: 50
        }
      };
      
      onMessageCallback?.(message);
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'campaign_progress',
        data: expect.any(Object)
      }));
      
      const receivedMessage = handler.mock.calls[0][0];
      expect(isSafeBigInt(receivedMessage.domainsGenerated)).toBe(true);
    });

    it('should route messages to campaign-specific handlers', () => {
      const campaignId = createUUID('123e4567-e89b-12d3-a456-426614174000');
      const handler = jest.fn();
      
      enhancedWebSocketClient.connectToCampaign(campaignId, handler);
      
      const message = {
        type: 'campaign_progress',
        data: { progress: 75 },
        campaignId
      };
      
      onMessageCallback?.(message);
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        campaignId,
        type: 'campaign_progress'
      }));
    });

    it('should handle all message types', () => {
      const handler = jest.fn();
      enhancedWebSocketClient.connectToAllCampaigns(handler);
      
      const messageTypes = [
        'campaign_progress',
        'progress',
        'domain_generated',
        'validation_progress',
        'phase_complete',
        'error',
        'system_notification'
      ];
      
      messageTypes.forEach(type => {
        const message = {
          type,
          data: { test: true }
        };
        
        onMessageCallback?.(message);
      });
      
      expect(handler).toHaveBeenCalledTimes(messageTypes.length);
    });

    it('should convert enhanced messages to simple format', () => {
      const handler = jest.fn();
      enhancedWebSocketClient.subscribe(handler);
      
      const enhancedMessage = {
        type: 'campaign.progress',
        timestamp: '2024-01-01T00:00:00Z',
        data: {
          campaignId: createUUID('123e4567-e89b-12d3-a456-426614174000'),
          progress: 50,
          phase: 'domain_generation'
        }
      };
      
      onMessageCallback?.(enhancedMessage);
      
      const simpleMessage = handler.mock.calls[0][0];
      expect(simpleMessage).toMatchObject({
        type: 'campaign.progress',
        data: enhancedMessage.data,
        campaignId: enhancedMessage.data.campaignId,
        progress: enhancedMessage.data.progress,
        phase: enhancedMessage.data.phase
      });
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors to handlers', () => {
      const errorHandler = jest.fn();
      enhancedWebSocketClient.onError(errorHandler);
      
      const error = new Error('Connection failed');
      onErrorCallback?.(error);
      
      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should handle errors in message handlers gracefully', () => {
      const handler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      
      enhancedWebSocketClient.subscribe(handler);
      
      // Should not throw
      expect(() => {
        onMessageCallback?.({ type: 'test', data: {} });
      }).not.toThrow();
      
      expect(handler).toHaveBeenCalled();
    });

    it('should handle errors in error handlers gracefully', () => {
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Error handler error');
      });
      
      enhancedWebSocketClient.onError(errorHandler);
      
      // Should not throw
      expect(() => {
        onErrorCallback?.(new Error('Test error'));
      }).not.toThrow();
      
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Message Sending', () => {
    it('should send messages through service', () => {
      const message: WebSocketMessage = {
        type: 'test',
        data: { test: true }
      };
      
      enhancedWebSocketClient.send(message);
      
      expect(mockService.send).toHaveBeenCalledWith(message);
    });

    it('should send campaign-specific messages', () => {
      const campaignId = 'test-campaign';
      const message: WebSocketMessage = {
        type: 'test',
        data: { test: true }
      };
      
      enhancedWebSocketClient.sendMessage(campaignId, message);
      
      expect(mockService.send).toHaveBeenCalledWith({
        ...message,
        campaignId
      });
    });

    it('should send campaign commands', () => {
      const campaignId = 'test-campaign';
      const command = 'start';
      
      enhancedWebSocketClient.sendCampaignCommand(campaignId, command);
      
      expect(mockService.sendCampaignCommand).toHaveBeenCalledWith(campaignId, command);
    });
  });

  describe('Connection Status', () => {
    it('should return connection status for all campaigns', () => {
      const campaign1 = 'campaign-1';
      const campaign2 = 'campaign-2';
      
      (enhancedWebSocketClient as any).campaignConnections.set(campaign1, true);
      (enhancedWebSocketClient as any).campaignConnections.set(campaign2, false);
      mockService.isConnected.mockReturnValue(true);
      
      const statuses = enhancedWebSocketClient.getConnectionStatus();
      
      expect(statuses).toHaveLength(2);
      expect(statuses).toContainEqual(expect.objectContaining({
        campaignId: campaign1,
        connected: true
      }));
      expect(statuses).toContainEqual(expect.objectContaining({
        campaignId: campaign2,
        connected: false
      }));
    });
  });

  describe('Testing Utilities', () => {
    it('should simulate messages for testing', () => {
      const handler = jest.fn();
      enhancedWebSocketClient.subscribe(handler);
      
      const message: WebSocketMessage = {
        type: 'test',
        data: { test: true }
      };
      
      enhancedWebSocketClient.simulateMessage(message);
      
      expect(handler).toHaveBeenCalledWith(message);
    });
  });

  describe('Typed Message Handlers', () => {
    it('should set typed handlers', () => {
      const handlers = {
        onCampaignProgress: jest.fn(),
        onError: jest.fn()
      };
      
      enhancedWebSocketClient.setTypedHandlers(handlers);
      
      expect((enhancedWebSocketClient as any).typedHandlers).toMatchObject(handlers);
    });

    it('should route typed messages correctly', () => {
      const progressHandler = jest.fn();
      enhancedWebSocketClient.setTypedHandlers({
        onCampaignProgress: progressHandler
      });
      
      const message = {
        type: 'campaign.progress',
        timestamp: '2024-01-01T00:00:00Z',
        data: {
          campaignId: createUUID('123e4567-e89b-12d3-a456-426614174000'),
          progress: 50
        }
      };
      
      onMessageCallback?.(message);
      
      // The typed handler should be called through the routing mechanism
      expect(progressHandler).toHaveBeenCalled();
    });
  });

  describe('Cleanup and Memory Management', () => {
    it('should clean up handlers on unsubscribe', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      const cleanup1 = enhancedWebSocketClient.subscribe(handler1);
      enhancedWebSocketClient.subscribe(handler2);
      
      cleanup1();
      
      onMessageCallback?.({ type: 'test', data: {} });
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should disconnect when no handlers remain', () => {
      const cleanup = enhancedWebSocketClient.connectToAllCampaigns(jest.fn());
      
      cleanup();
      
      expect(mockService.disconnect).toHaveBeenCalled();
    });

    it('should maintain connection with active campaigns', () => {
      const cleanup1 = enhancedWebSocketClient.connectToCampaign('campaign-1', jest.fn());
      const cleanup2 = enhancedWebSocketClient.connectToAllCampaigns(jest.fn());
      
      cleanup2(); // Remove global handler
      
      expect(mockService.disconnect).not.toHaveBeenCalled();
      
      cleanup1(); // Remove last handler
      
      expect(mockService.disconnect).toHaveBeenCalled();
    });
  });

  describe('Legacy CampaignProgressMessage Compatibility', () => {
    it('should handle legacy CampaignProgressMessage format', () => {
      const handler = jest.fn();
      enhancedWebSocketClient.subscribe(handler);
      
      const legacyMessage: CampaignProgressMessage = {
        type: 'campaign_progress',
        campaignId: createUUID('123e4567-e89b-12d3-a456-426614174000'),
        data: {},
        progress: 75,
        phase: 'validation',
        domainsGenerated: createSafeBigInt('1000'),
        status: 'active'
      };
      
      enhancedWebSocketClient.simulateMessage(legacyMessage);
      
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'campaign_progress',
        campaignId: legacyMessage.campaignId,
        progress: legacyMessage.progress,
        phase: legacyMessage.phase,
        domainsGenerated: legacyMessage.domainsGenerated,
        status: legacyMessage.status
      }));
    });
  });
});