// src/lib/state/stateManager.ts
// Enhanced state management with optimistic updates, rollback, and cross-tab synchronization
'use client';

import { getFeatureFlags } from '@/lib/config/environment';

// State change types
export type StateChangeType = 'CREATE' | 'UPDATE' | 'DELETE' | 'BATCH';

// Optimistic update interface
export interface OptimisticUpdate<T = unknown> {
  id: string;
  type: StateChangeType;
  entityType: string;
  entityId: string;
  optimisticData: T;
  originalData?: T;
  timestamp: number;
  rollbackFn?: () => void;
  retryFn?: () => Promise<void>;
  maxRetries?: number;
  currentRetries?: number;
}

// State synchronization message
export interface StateSyncMessage {
  type: 'STATE_SYNC';
  action: 'UPDATE' | 'INVALIDATE' | 'ROLLBACK';
  entityType: string;
  entityId?: string;
  data?: unknown;
  timestamp: number;
  source: string;
}

// Loading state interface
export interface LoadingState {
  [key: string]: {
    isLoading: boolean;
    operation?: string;
    progress?: number;
    startTime?: number;
  };
}

// Cache entry interface
export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  version: number;
  dependencies?: string[];
}

class StateManager {
  private static instance: StateManager;
  private optimisticUpdates: Map<string, OptimisticUpdate> = new Map();
  private loadingStates: Map<string, LoadingState[string]> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private broadcastChannel: BroadcastChannel | null = null;
  private subscribers: Map<string, Set<(data: unknown) => void>> = new Map();
  private rollbackQueue: OptimisticUpdate[] = [];
  private syncQueue: StateSyncMessage[] = [];
  private isOnline = true;
  private tabId: string;

  constructor() {
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.initializeBroadcastChannel();
    this.initializeOnlineDetection();
    this.startCleanupInterval();
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  // Optimistic Updates
  async applyOptimisticUpdate<T>(update: Omit<OptimisticUpdate<T>, 'id' | 'timestamp'>): Promise<string> {
    const features = getFeatureFlags();
    const updateId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // INFINITE LOOP PREVENTION: Check for rapid successive updates to same entity
    const entityKey = `${update.entityType}:${update.entityId}`;
    const recentUpdates = Array.from(this.optimisticUpdates.values()).filter(
      u => `${u.entityType}:${u.entityId}` === entityKey &&
           Date.now() - u.timestamp < 1000 // Within last second
    );
    
    if (recentUpdates.length > 5) {
      console.warn(`[StateManager] INFINITE LOOP DETECTED: Too many rapid updates for ${entityKey}`, recentUpdates);
      return updateId; // Skip this update to prevent loop
    }
    
    const optimisticUpdate: OptimisticUpdate<T> = {
      ...update,
      id: updateId,
      timestamp: Date.now(),
      currentRetries: 0
    };

    this.optimisticUpdates.set(updateId, optimisticUpdate);

    if (features.enableDebugMode) {
      console.log(`[StateManager] Applied optimistic update for ${entityKey}:`, optimisticUpdate);
    }

    // Notify subscribers
    this.notifySubscribers(update.entityType, optimisticUpdate.optimisticData);

    // Broadcast to other tabs
    this.broadcastStateChange({
      type: 'STATE_SYNC',
      action: 'UPDATE',
      entityType: update.entityType,
      entityId: update.entityId,
      data: optimisticUpdate.optimisticData,
      timestamp: Date.now(),
      source: this.tabId
    });

    return updateId;
  }

  async confirmOptimisticUpdate(updateId: string, confirmedData?: unknown): Promise<void> {
    const update = this.optimisticUpdates.get(updateId);
    if (!update) return;

    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log(`[StateManager] Confirmed optimistic update:`, updateId);
    }

    // Update cache with confirmed data
    if (confirmedData) {
      this.updateCache(update.entityType, update.entityId, confirmedData);
      this.notifySubscribers(update.entityType, confirmedData);
    }

    // Remove from optimistic updates
    this.optimisticUpdates.delete(updateId);

    // Broadcast confirmation
    this.broadcastStateChange({
      type: 'STATE_SYNC',
      action: 'UPDATE',
      entityType: update.entityType,
      entityId: update.entityId,
      data: confirmedData || update.optimisticData,
      timestamp: Date.now(),
      source: this.tabId
    });
  }

  async rollbackOptimisticUpdate(updateId: string, reason?: string): Promise<void> {
    const update = this.optimisticUpdates.get(updateId);
    if (!update) return;

    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log(`[StateManager] Rolling back optimistic update:`, updateId, reason);
    }

    // Execute rollback function if provided
    if (update.rollbackFn) {
      update.rollbackFn();
    }

    // Restore original data if available
    if (update.originalData) {
      this.updateCache(update.entityType, update.entityId, update.originalData);
      this.notifySubscribers(update.entityType, update.originalData);
    }

    // Add to rollback queue for potential retry
    this.rollbackQueue.push(update);

    // Remove from optimistic updates
    this.optimisticUpdates.delete(updateId);

    // Broadcast rollback
    this.broadcastStateChange({
      type: 'STATE_SYNC',
      action: 'ROLLBACK',
      entityType: update.entityType,
      entityId: update.entityId,
      data: update.originalData,
      timestamp: Date.now(),
      source: this.tabId
    });
  }

  async retryFailedUpdate(updateId: string): Promise<boolean> {
    const update = this.rollbackQueue.find(u => u.id === updateId);
    if (!update || !update.retryFn) return false;

    const maxRetries = update.maxRetries || 3;
    const currentRetries = update.currentRetries || 0;

    if (currentRetries >= maxRetries) {
      return false;
    }

    try {
      update.currentRetries = currentRetries + 1;
      await update.retryFn();
      
      // Remove from rollback queue on success
      this.rollbackQueue = this.rollbackQueue.filter(u => u.id !== updateId);
      return true;
    } catch {
      console.error(`[StateManager] Retry failed for update ${updateId}:`, error);
      return false;
    }
  }

  // Loading State Management
  setLoadingState(key: string, isLoading: boolean, operation?: string, progress?: number): void {
    if (isLoading) {
      this.loadingStates.set(key, {
        isLoading: true,
        operation,
        progress,
        startTime: Date.now()
      });
    } else {
      this.loadingStates.delete(key);
    }

    this.notifySubscribers('loading', this.getAllLoadingStates());
  }

  getLoadingState(key: string): LoadingState[string] | null {
    return this.loadingStates.get(key) || null;
  }

  getAllLoadingStates(): LoadingState {
    const states: LoadingState = {};
    this.loadingStates.forEach((state, key) => {
      states[key] = state;
    });
    return states;
  }

  isLoading(key?: string): boolean {
    if (key) {
      return this.loadingStates.has(key);
    }
    return this.loadingStates.size > 0;
  }

  // Cache Management
  updateCache<T>(entityType: string, entityId: string, data: T, ttl = 300000): void {
    const cacheKey = `${entityType}:${entityId}`;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
      version: Date.now()
    };

    this.cache.set(cacheKey, entry);
  }

  getFromCache<T>(entityType: string, entityId: string): T | null {
    const cacheKey = `${entityType}:${entityId}`;
    const entry = this.cache.get(cacheKey);

    if (!entry) return null;

    // Check if cache entry is expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.data as T;
  }

  invalidateCache(entityType: string, entityId?: string): void {
    if (entityId) {
      const cacheKey = `${entityType}:${entityId}`;
      this.cache.delete(cacheKey);
    } else {
      // Invalidate all entries for entity type
      const keysToDelete = Array.from(this.cache.keys()).filter(key => 
        key.startsWith(`${entityType}:`)
      );
      keysToDelete.forEach(key => this.cache.delete(key));
    }

    // Broadcast cache invalidation
    this.broadcastStateChange({
      type: 'STATE_SYNC',
      action: 'INVALIDATE',
      entityType,
      entityId,
      timestamp: Date.now(),
      source: this.tabId
    });
  }

  // Cross-tab Synchronization
  private initializeBroadcastChannel(): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcastChannel = new BroadcastChannel('domainflow_state_sync');
      this.broadcastChannel.addEventListener('message', this.handleBroadcastMessage.bind(this));
    }
  }

  private handleBroadcastMessage(event: MessageEvent<StateSyncMessage>): void {
    const message = event.data;
    
    // Ignore messages from the same tab
    if (message.source === this.tabId) return;

    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log(`[StateManager] Received broadcast message:`, message);
    }

    switch (message.action) {
      case 'UPDATE':
        if (message.data) {
          this.updateCache(message.entityType, message.entityId!, message.data);
          this.notifySubscribers(message.entityType, message.data);
        }
        break;
      case 'INVALIDATE':
        this.invalidateCache(message.entityType, message.entityId);
        break;
      case 'ROLLBACK':
        if (message.data && message.entityId) {
          this.updateCache(message.entityType, message.entityId, message.data);
          this.notifySubscribers(message.entityType, message.data);
        }
        break;
    }
  }

  private broadcastStateChange(message: StateSyncMessage): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(message);
    }
  }

  // Subscription Management
  subscribe(entityType: string, callback: (data: unknown) => void): () => void {
    if (!this.subscribers.has(entityType)) {
      this.subscribers.set(entityType, new Set());
    }
    
    this.subscribers.get(entityType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(entityType);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(entityType);
        }
      }
    };
  }

  private notifySubscribers(entityType: string, data: unknown): void {
    const subscribers = this.subscribers.get(entityType);
    if (subscribers) {
      console.log(`[StateManager] Notifying ${subscribers.size} subscribers for ${entityType}`);
      subscribers.forEach(callback => {
        try {
          callback(data);
        } catch {
          console.error(`[StateManager] Error in subscriber callback for ${entityType}:`, error);
        }
      });
    }
  }

  // Online/Offline Detection
  private initializeOnlineDetection(): void {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine;
      
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.processSyncQueue();
      });
      
      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  private processSyncQueue(): void {
    if (!this.isOnline) return;

    while (this.syncQueue.length > 0) {
      const message = this.syncQueue.shift();
      if (message) {
        this.broadcastStateChange(message);
      }
    }
  }

  // Cleanup
  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredCache();
      this.cleanupOldOptimisticUpdates();
    }, 60000); // Run every minute
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach(key => this.cache.delete(key));
  }

  private cleanupOldOptimisticUpdates(): void {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    const expiredUpdates: string[] = [];
    this.optimisticUpdates.forEach((update, id) => {
      if (now - update.timestamp > maxAge) {
        expiredUpdates.push(id);
      }
    });

    expiredUpdates.forEach(id => {
      this.rollbackOptimisticUpdate(id, 'Expired');
    });
  }

  // Public utility methods
  getOptimisticUpdates(): OptimisticUpdate[] {
    return Array.from(this.optimisticUpdates.values());
  }

  getRollbackQueue(): OptimisticUpdate[] {
    return [...this.rollbackQueue];
  }

  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }

  isOnlineStatus(): boolean {
    return this.isOnline;
  }

  destroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
    this.optimisticUpdates.clear();
    this.loadingStates.clear();
    this.cache.clear();
    this.subscribers.clear();
  }
}

// Export singleton instance
export const stateManager = StateManager.getInstance();

// React hooks for state management
export function useOptimisticUpdate() {
  return {
    applyUpdate: stateManager.applyOptimisticUpdate.bind(stateManager),
    confirmUpdate: stateManager.confirmOptimisticUpdate.bind(stateManager),
    rollbackUpdate: stateManager.rollbackOptimisticUpdate.bind(stateManager),
    retryUpdate: stateManager.retryFailedUpdate.bind(stateManager)
  };
}

export function useLoadingState() {
  return {
    setLoading: stateManager.setLoadingState.bind(stateManager),
    getLoading: stateManager.getLoadingState.bind(stateManager),
    getAllLoading: stateManager.getAllLoadingStates.bind(stateManager),
    isLoading: stateManager.isLoading.bind(stateManager)
  };
}

export function useStateSubscription(entityType: string, callback: (data: unknown) => void) {
  return stateManager.subscribe(entityType, callback);
}

export default stateManager;