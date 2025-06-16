/**
 * Campaign Subscription Lifecycle Diagnostic Tool
 * Debug tool to analyze disconnects between REST API campaign operations 
 * and WebSocket subscriptions
 */

import { apiClient } from '@/lib/services/apiClient.production';
import { websocketService } from '@/lib/services/websocketService.simple';

export interface CampaignOperationEvent {
  timestamp: string;
  operation: 'create' | 'update' | 'deleted' | 'list';
  campaignId: string;
  source: 'rest_api' | 'websocket';
  data: unknown; // Replaced 'any' with 'unknown'
  success: boolean;
  duration: number;
}

export interface CampaignSyncState {
  campaignId: string;
  restApiState: { id?: string; status?: string; progress?: number; created_at?: string } | null;
  websocketState: { data?: { id?: string; status?: string; progress?: number; type?: string; campaignId?: string }; status?: string; type?: string; campaignId?: string } | null;
  isSubscribed: boolean;
  lastRestUpdate: string;
  lastWebSocketUpdate: string;
  syncIssues: string[];
}

export interface CampaignLifecycleDiagnosticReport {
  campaignOperations: CampaignOperationEvent[];
  campaignStates: Record<string, CampaignSyncState>;
  subscriptionEvents: Array<{
    timestamp: string;
    campaignId: string;
    action: 'subscribe' | 'unsubscribe' | 'reconnect';
    success: boolean;
  }>;
  syncAnalysis: {
    totalCampaigns: number;
    campaignsWithSyncIssues: number;
    orphanedWebSocketSubscriptions: string[];
    orphanedRestCampaigns: string[];
    duplicateSubscriptions: string[];
  };
}

interface ApiClient {
  get(url: string, ...args: unknown[]): Promise<unknown>;
  post(url: string, ...args: unknown[]): Promise<unknown>;
  put(url: string, ...args: unknown[]): Promise<unknown>;
  delete(url: string, ...args: unknown[]): Promise<unknown>;
}

interface WebSocketService {
  connectToCampaign(
    campaignId: string,
    onMessage: (message: unknown) => void,
    onError?: (error: unknown) => void
  ): void;
  disconnect(campaignId: string): void;
}

interface ExtendedWebSocketService extends WebSocketService {
  logSubscriptionEvent(campaignId: string, eventType: string, success: boolean): void;
  updateCampaignWebSocketState(campaignId: string, state: string): void;
  originalWebSocketMethods: {
    connectToCampaign?: (
      campaignId: string,
      onMessage: (message: unknown) => void,
      onError?: (error: unknown) => void
    ) => void;
    disconnect?: (campaignId: string) => void;
  };
}

// Update type usage
const apiClientTyped: ApiClient = apiClient as ApiClient;
const websocketServiceTyped = websocketService as unknown as ExtendedWebSocketService;

class CampaignLifecycleDiagnostic {
  private operationLog: CampaignOperationEvent[] = [];
  private campaignStates: Record<string, CampaignSyncState> = {};
  private subscriptionEvents: Array<{
    timestamp: string;
    campaignId: string;
    action: 'subscribe' | 'unsubscribe' | 'reconnect';
    success: boolean;
  }> = [];

  // Refine type definitions for `originalApiMethods` and `originalWebSocketMethods`
  private originalApiMethods: Record<string, (url: string, ...args: unknown[]) => Promise<unknown>> = {};
  private originalWebSocketMethods: Record<string, ((campaignId: string, onMessage: (message: unknown) => void, onError?: (error: unknown) => void) => void) | ((campaignId: string) => void) | undefined> = {};

  startDiagnostic(): void {
    console.log('[Campaign Lifecycle Diagnostic] Starting campaign sync analysis...');
    
    // Hook into API client methods
    this.hookApiClientMethods();
    
    // Hook into WebSocket service methods
    this.hookWebSocketMethods();
    
    console.log('[Campaign Lifecycle Diagnostic] Campaign lifecycle hooks installed');
  }

  private hookApiClientMethods(): void {
    // Hook common HTTP methods that might be used for campaign operations
    ['get', 'post', 'put', 'delete'].forEach(method => {
      const apiMethod = apiClientTyped[method as keyof ApiClient];
      if (typeof apiMethod === 'function') {
        this.originalApiMethods[method] = apiMethod.bind(apiClientTyped);
        
        apiClientTyped[method as keyof ApiClient] = async (url: string, ...args: unknown[]) => {
          const startTime = performance.now();
          
          // Check if this is a campaign-related API call
          const campaignOperation = this.identifyCampaignOperation(method, url, args);
          
          try {
            const originalMethod = this.originalApiMethods[method];
            if (!originalMethod) {
              throw new Error(`Original method ${method} not found`);
            }
            const result = await originalMethod(url, ...args);
            const duration = performance.now() - startTime;
            
            if (campaignOperation) {
              this.logCampaignOperation({
                timestamp: campaignOperation.timestamp!,
                operation: campaignOperation.operation!,
                campaignId: campaignOperation.campaignId!,
                source: campaignOperation.source!,
                success: true,
                duration,
                data: result,
              });
            }
            
            return result;
          } catch (_error) {
            const duration = performance.now() - startTime;
            
            if (campaignOperation) {
              this.logCampaignOperation({
                timestamp: campaignOperation.timestamp!,
                operation: campaignOperation.operation!,
                campaignId: campaignOperation.campaignId!,
                source: campaignOperation.source!,
                success: false,
                duration,
                data: _error,
              });
            }
            
            throw _error;
          }
        };
      }
    });
  }

  private hookWebSocketMethods(): void {
    // Hook connectToCampaign
    this.originalWebSocketMethods.connectToCampaign = websocketServiceTyped.connectToCampaign.bind(websocketServiceTyped);
    websocketServiceTyped.connectToCampaign = function(
      campaignId: string,
      onMessage: (message: unknown) => void,
      onError?: (error: unknown) => void
    ) {
      console.log(`[Campaign Lifecycle Diagnostic] WebSocket subscription: ${campaignId}`);

      this.logSubscriptionEvent(campaignId, 'subscribe', true);
      this.updateCampaignWebSocketState(campaignId, 'subscribed');

      if (this.originalWebSocketMethods.connectToCampaign) {
        return this.originalWebSocketMethods.connectToCampaign(campaignId, onMessage, onError);
      } else {
        throw new Error('connectToCampaign method is undefined');
      }
    };
  }

  private identifyCampaignOperation(method: string, url: string, _args: unknown[]): Partial<CampaignOperationEvent> | null {
    // Check if URL relates to campaigns
    if (!url.includes('/campaigns') && !url.includes('/campaign')) {
      return null;
    }
    
    const timestamp = new Date().toISOString();
    let operation: CampaignOperationEvent['operation'];
    let campaignId = 'unknown';
    
    // Extract campaign ID from URL
    const campaignIdMatch = url.match(/\/campaigns?\/([^\/\?]+)/);
    if (campaignIdMatch && campaignIdMatch[1]) {
      campaignId = campaignIdMatch[1];
    }
    
    // Determine operation type
    if (method === 'post' && url.includes('/campaigns') && !campaignIdMatch) {
      operation = 'create';
      campaignId = 'pending'; // Will be updated when we get the response
    } else if (method === 'get' && url.includes('/campaigns') && !campaignIdMatch) {
      operation = 'list';
      campaignId = 'all';
    } else if (method === 'get' && campaignIdMatch) {
      operation = 'update'; // Treating GET as state sync
    } else if (method === 'put' || method === 'patch') {
      operation = 'update';
    } else if (method === 'delete') {
      operation = 'deleted';
    } else {
      return null;
    }
    
    return {
      timestamp,
      operation,
      campaignId,
      source: 'rest_api',
    };
  }

  private logCampaignOperation(event: CampaignOperationEvent): void {
    this.operationLog.push(event);
    
    // Update campaign state tracking
    if (event.campaignId !== 'all' && event.campaignId !== 'pending') {
      this.updateCampaignRestState(event.campaignId, event.data as { id?: string; status?: string; progress?: number; created_at?: string } | null);
    }
    
    console.log(`[Campaign Lifecycle Diagnostic] Campaign operation logged:`, event);
  }

  private logSubscriptionEvent(campaignId: string, action: 'subscribe' | 'unsubscribe' | 'reconnect', success: boolean): void {
    this.subscriptionEvents.push({
      timestamp: new Date().toISOString(),
      campaignId,
      action,
      success,
    });
  }

  private updateCampaignRestState(campaignId: string, data: { id?: string; status?: string; progress?: number; created_at?: string } | null): void {
    if (!this.campaignStates[campaignId]) {
      this.campaignStates[campaignId] = {
        campaignId,
        restApiState: null,
        websocketState: null,
        isSubscribed: false,
        lastRestUpdate: new Date().toISOString(),
        lastWebSocketUpdate: '',
        syncIssues: [],
      };
    }

    this.campaignStates[campaignId].restApiState = data;
    this.campaignStates[campaignId].lastRestUpdate = new Date().toISOString();

    // Check for sync issues
    this.analyzeCampaignSync(campaignId);
  }

  private updateCampaignWebSocketState(campaignId: string, data: { data?: { id?: string; status?: string; progress?: number; type?: string; campaignId?: string }; status?: string; type?: string; campaignId?: string } | 'subscribed' | 'unsubscribed' | null): void {
    if (!this.campaignStates[campaignId]) {
      this.campaignStates[campaignId] = {
        campaignId,
        restApiState: null,
        websocketState: null,
        isSubscribed: true,
        lastRestUpdate: '',
        lastWebSocketUpdate: new Date().toISOString(),
        syncIssues: [],
      };
    }

    if (data === 'subscribed') {
      this.campaignStates[campaignId].isSubscribed = true;
    } else if (data === 'unsubscribed') {
      this.campaignStates[campaignId].isSubscribed = false;
    } else {
      this.campaignStates[campaignId].websocketState = data;
      this.campaignStates[campaignId].lastWebSocketUpdate = new Date().toISOString();
    }

    // Check for sync issues
    this.analyzeCampaignSync(campaignId);
  }

  private analyzeCampaignSync(campaignId: string): void {
    const state = this.campaignStates[campaignId];
    if (!state) return;

    const issues: string[] = [];

    // Check if subscribed but no REST API state
    if (state.isSubscribed && !state.restApiState && state.lastRestUpdate === '') {
      issues.push('WebSocket subscribed but no REST API data available');
    }

    // Check if REST API has data but not subscribed
    if (state.restApiState && !state.isSubscribed) {
      issues.push('REST API has campaign data but no WebSocket subscription');
    }

    // Check for stale data
    if (state.lastRestUpdate && state.lastWebSocketUpdate) {
      const restTime = new Date(state.lastRestUpdate).getTime();
      const wsTime = new Date(state.lastWebSocketUpdate).getTime();
      const timeDiff = Math.abs(restTime - wsTime);

      // If more than 5 minutes difference, flag as potential sync issue
      if (timeDiff > 5 * 60 * 1000) {
        issues.push(`Large time gap between REST (${state.lastRestUpdate}) and WebSocket (${state.lastWebSocketUpdate}) updates`);
      }
    }

    // Check for data consistency if we have both states
    if (state.restApiState && state.websocketState) {
      const restStatus = state.restApiState.status;
      const wsStatus = state.websocketState.data?.status || state.websocketState.status;

      if (restStatus && wsStatus && restStatus !== wsStatus) {
        issues.push(`Status mismatch: REST API reports ${restStatus}, WebSocket reports ${wsStatus}`);
      }
    }

    state.syncIssues = issues;

    if (issues.length > 0) {
      console.warn(`[Campaign Lifecycle Diagnostic] Sync issues detected for campaign ${campaignId}:`, issues);
    }
  }

  getDiagnosticReport(): CampaignLifecycleDiagnosticReport {
    const campaignIds = Object.keys(this.campaignStates);
    const campaignsWithSyncIssues = campaignIds.filter(id => {
      const state = this.campaignStates[id];
      return state && state.syncIssues && state.syncIssues.length > 0;
    });
    
    // Find orphaned subscriptions (WebSocket subscribed but no REST API data)
    const orphanedWebSocketSubscriptions = campaignIds.filter(id => {
      const state = this.campaignStates[id];
      return state?.isSubscribed && !state?.restApiState;
    });
    
    // Find orphaned REST campaigns (have REST data but not subscribed)
    const orphanedRestCampaigns = campaignIds.filter(id => {
      const state = this.campaignStates[id];
      return state?.restApiState && !state?.isSubscribed;
    });
    
    // Check for duplicate subscriptions (simplified - would need more complex logic)
    const duplicateSubscriptions = this.findDuplicateSubscriptions();
    
    return {
      campaignOperations: this.operationLog,
      campaignStates: this.campaignStates,
      subscriptionEvents: this.subscriptionEvents,
      syncAnalysis: {
        totalCampaigns: campaignIds.length,
        campaignsWithSyncIssues: campaignsWithSyncIssues.length,
        orphanedWebSocketSubscriptions,
        orphanedRestCampaigns,
        duplicateSubscriptions,
      },
    };
  }

  private findDuplicateSubscriptions(): string[] {
    // Group subscription events by campaign ID and look for multiple subscribes without unsubscribes
    const subscriptionMap: Record<string, Array<{action: string; timestamp: string}>> = {};
    
    this.subscriptionEvents.forEach(event => {
      if (!subscriptionMap[event.campaignId]) {
        subscriptionMap[event.campaignId] = [];
      }
      subscriptionMap[event.campaignId]?.push({
        action: event.action,
        timestamp: event.timestamp,
      });
    });
    
    const duplicates: string[] = [];
    
    Object.keys(subscriptionMap).forEach(campaignId => {
      const events = subscriptionMap[campaignId];
      if (!events) return;
      
      let subscribed = false;
      
      for (const event of events) {
        if (event.action === 'subscribe') {
          if (subscribed) {
            duplicates.push(campaignId);
            break;
          }
          subscribed = true;
        } else if (event.action === 'unsubscribe') {
          subscribed = false;
        }
      }
    });
    
    return duplicates;
  }

  // Simulate different lifecycle scenarios for testing
  simulateLifecycleScenarios(): void {
    console.log('[Campaign Lifecycle Diagnostic] Simulating campaign lifecycle scenarios...');
    
    // Scenario 1: Campaign created via REST but WebSocket not notified
    this.updateCampaignRestState('test-campaign-1', {
      id: 'test-campaign-1',
      status: 'Created',
      progress: 0,
      created_at: new Date().toISOString(),
    });
    
    // Scenario 2: WebSocket receives updates for unknown campaign
    this.updateCampaignWebSocketState('test-campaign-2', {
      data: { id: 'test-campaign-2', status: 'InProgress', progress: 50, type: 'progress', campaignId: 'test-campaign-2' },
      status: 'InProgress',
      type: 'progress',
      campaignId: 'test-campaign-2',
    });

    // Scenario 3: State divergence
    this.updateCampaignRestState('test-campaign-3', {
      id: 'test-campaign-3',
      status: 'Completed',
      progress: 100,
      created_at: new Date().toISOString(),
    });
    this.updateCampaignWebSocketState('test-campaign-3', {
      data: { id: 'test-campaign-3', status: 'InProgress', progress: 75, type: 'progress', campaignId: 'test-campaign-3' },
      status: 'InProgress',
      type: 'progress',
      campaignId: 'test-campaign-3',
    });
    
    console.log('[Campaign Lifecycle Diagnostic] Simulation complete. Check diagnostic report for results.');
  }

  stopDiagnostic(): void {
    // Restore original methods with proper type handling
    ['get', 'post', 'put', 'delete'].forEach(method => {
      const originalMethod = this.originalApiMethods[method];
      if (originalMethod && method in apiClient) {
        Object.assign(apiClient, { [method]: originalMethod });
      }
    });

    ['connectToCampaign', 'disconnect'].forEach(method => {
      const originalMethod = this.originalWebSocketMethods[method];
      if (originalMethod && method in websocketService) {
        Object.assign(websocketService, { [method]: originalMethod });
      }
    });

    console.log('[Campaign Lifecycle Diagnostic] Diagnostic stopped');
  }
}

// Export singleton instance
export const campaignLifecycleDiagnostic = new CampaignLifecycleDiagnostic();