// src/lib/state/raceConditionPrevention.ts
// Race condition prevention between REST API and WebSocket updates
'use client';

import { getFeatureFlags } from '@/lib/config/environment';
import { logger } from '../utils/logger';

// Request tracking interface
export interface RequestTracker {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  timestamp: number;
  source: 'REST' | 'WEBSOCKET';
  version?: number;
  completed: boolean;
}

// Conflict resolution strategy
export type ConflictResolutionStrategy = 
  | 'LAST_WRITE_WINS' 
  | 'FIRST_WRITE_WINS' 
  | 'VERSION_BASED' 
  | 'MANUAL_RESOLUTION';

// Conflict resolution result
export interface ConflictResolution<T = unknown> {
  strategy: ConflictResolutionStrategy;
  resolvedData: T;
  conflictingRequests: RequestTracker[];
  timestamp: number;
}

class RaceConditionPrevention {
  private static instance: RaceConditionPrevention;
  private activeRequests: Map<string, RequestTracker> = new Map();
  private requestHistory: Map<string, RequestTracker[]> = new Map();
  private conflictResolvers: Map<string, (conflicts: RequestTracker[]) => ConflictResolution> = new Map();
  private pendingResolutions: Map<string, ConflictResolution> = new Map();
  private versionMap: Map<string, number> = new Map();

  static getInstance(): RaceConditionPrevention {
    if (!RaceConditionPrevention.instance) {
      RaceConditionPrevention.instance = new RaceConditionPrevention();
    }
    return RaceConditionPrevention.instance;
  }

  // Request tracking
  trackRequest(request: Omit<RequestTracker, 'id' | 'timestamp' | 'completed'>): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const entityKey = `${request.entityType}:${request.entityId}`;
    
    // INFINITE LOOP PREVENTION: Check for rapid successive requests
    const recentRequests = Array.from(this.activeRequests.values()).filter(
      r => `${r.entityType}:${r.entityId}` === entityKey &&
           Date.now() - r.timestamp < 2000 && // Within last 2 seconds
           !r.completed
    );
    
    if (recentRequests.length > 10) {
      logger.warn('INFINITE LOOP DETECTED: Too many rapid requests', {
        entityKey,
        recentRequestsCount: recentRequests.length,
        recentRequests,
        component: 'RaceConditionPrevention'
      });
      return requestId; // Skip tracking to prevent loop
    }
    
    const tracker: RequestTracker = {
      ...request,
      id: requestId,
      timestamp: Date.now(),
      completed: false
    };

    // Check for potential conflicts
    const conflicts = this.detectConflicts(tracker);
    if (conflicts.length > 0) {
      logger.info(`Conflict detected for ${entityKey}`, {
        conflicts,
        entityKey,
        component: 'RaceConditionPrevention'
      });
      this.handleConflict(tracker, conflicts);
    }

    this.activeRequests.set(requestId, tracker);
    
    // Add to history
    if (!this.requestHistory.has(entityKey)) {
      this.requestHistory.set(entityKey, []);
    }
    this.requestHistory.get(entityKey)!.push(tracker);

    const features = getFeatureFlags();
    if (features.enableDebugMode) {
      logger.debug(`Tracking request for ${entityKey}`, {
        tracker,
        entityKey,
        component: 'RaceConditionPrevention'
      });
    }

    return requestId;
  }

  completeRequest(requestId: string, success = true): void {
    const request = this.activeRequests.get(requestId);
    if (!request) return;

    request.completed = true;
    
    if (success) {
      // Update version for successful operations
      const entityKey = `${request.entityType}:${request.entityId}`;
      const currentVersion = this.versionMap.get(entityKey) || 0;
      this.versionMap.set(entityKey, currentVersion + 1);
    }

    this.activeRequests.delete(requestId);

    const features = getFeatureFlags();
    if (features.enableDebugMode) {
      logger.debug('Completed request', {
        requestId,
        success,
        status: success ? 'success' : 'failed',
        component: 'RaceConditionPrevention'
      });
    }
  }

  // Conflict detection
  private detectConflicts(newRequest: RequestTracker): RequestTracker[] {
    const entityKey = `${newRequest.entityType}:${newRequest.entityId}`;
    const conflicts: RequestTracker[] = [];

    // Check active requests for the same entity
    this.activeRequests.forEach(activeRequest => {
      const activeEntityKey = `${activeRequest.entityType}:${activeRequest.entityId}`;
      
      if (activeEntityKey === entityKey && !activeRequest.completed) {
        // Potential conflict detected
        if (this.isConflictingOperation(newRequest, activeRequest)) {
          conflicts.push(activeRequest);
        }
      }
    });

    return conflicts;
  }

  private isConflictingOperation(req1: RequestTracker, req2: RequestTracker): boolean {
    // Same entity, different sources
    if (req1.source !== req2.source) {
      // UPDATE operations always conflict
      if (req1.operation === 'UPDATE' || req2.operation === 'UPDATE') {
        return true;
      }
      
      // DELETE conflicts with CREATE/UPDATE
      if (req1.operation === 'DELETE' || req2.operation === 'DELETE') {
        return true;
      }
    }

    // Same source, overlapping operations
    if (req1.source === req2.source) {
      const timeDiff = Math.abs(req1.timestamp - req2.timestamp);
      // Consider operations within 1 second as potentially conflicting
      return timeDiff < 1000;
    }

    return false;
  }

  // Conflict resolution
  private handleConflict(newRequest: RequestTracker, conflicts: RequestTracker[]): void {
    const entityKey = `${newRequest.entityType}:${newRequest.entityId}`;
    const resolver = this.conflictResolvers.get(newRequest.entityType);

    if (resolver) {
      const resolution = resolver([...conflicts, newRequest]);
      this.pendingResolutions.set(entityKey, resolution);
    } else {
      // Use default resolution strategy
      const resolution = this.defaultConflictResolution([...conflicts, newRequest]);
      this.pendingResolutions.set(entityKey, resolution);
    }

    const features = getFeatureFlags();
    if (features.enableDebugMode) {
      logger.debug('Conflict detected and resolved', {
        entityKey,
        component: 'RaceConditionPrevention'
      });
    }
  }

  private defaultConflictResolution(conflictingRequests: RequestTracker[]): ConflictResolution {
    // Sort by timestamp (newest first)
    const sorted = conflictingRequests.sort((a, b) => b.timestamp - a.timestamp);
    const latest = sorted[0];

    return {
      strategy: 'LAST_WRITE_WINS',
      resolvedData: latest,
      conflictingRequests,
      timestamp: Date.now()
    };
  }

  // Version-based conflict resolution
  resolveVersionConflict<T>(
    entityType: string, 
    entityId: string, 
    incomingData: T & { version?: number },
    currentData: T & { version?: number }
  ): { resolved: T; strategy: ConflictResolutionStrategy } {
    const entityKey = `${entityType}:${entityId}`;
    const currentVersion = this.versionMap.get(entityKey) || 0;

    // If incoming data has a version
    if (incomingData.version !== undefined) {
      if (incomingData.version > currentVersion) {
        // Incoming data is newer
        this.versionMap.set(entityKey, incomingData.version);
        return { resolved: incomingData, strategy: 'VERSION_BASED' };
      } else if (incomingData.version < currentVersion) {
        // Current data is newer, reject incoming
        return { resolved: currentData, strategy: 'VERSION_BASED' };
      }
    }

    // Fall back to timestamp-based resolution
    return { resolved: incomingData, strategy: 'LAST_WRITE_WINS' };
  }

  // WebSocket vs REST API coordination
  shouldProcessWebSocketUpdate(
    entityType: string, 
    entityId: string, 
    updateTimestamp: number
  ): boolean {
    // Check if there are active REST requests for this entity
    const activeRestRequests = Array.from(this.activeRequests.values()).filter(req => 
      req.entityType === entityType && 
      req.entityId === entityId && 
      req.source === 'REST' && 
      !req.completed
    );

    if (activeRestRequests.length === 0) {
      return true; // No conflicting REST requests
    }

    // Check if WebSocket update is newer than the latest REST request
    const latestRestRequest = activeRestRequests.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );

    return updateTimestamp > latestRestRequest.timestamp;
  }

  shouldProcessRestResponse(
    entityType: string, 
    entityId: string, 
    requestTimestamp: number
  ): boolean {
    const entityKey = `${entityType}:${entityId}`;
    
    // Check recent WebSocket updates
    const recentHistory = this.requestHistory.get(entityKey) || [];
    const recentWebSocketUpdates = recentHistory.filter(req => 
      req.source === 'WEBSOCKET' && 
      req.timestamp > requestTimestamp - 5000 // Within 5 seconds
    );

    if (recentWebSocketUpdates.length === 0) {
      return true; // No recent WebSocket updates
    }

    // Check if REST response is newer than the latest WebSocket update
    const latestWebSocketUpdate = recentWebSocketUpdates.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );

    return requestTimestamp > latestWebSocketUpdate.timestamp;
  }

  // Custom conflict resolver registration
  registerConflictResolver(
    entityType: string, 
    resolver: (conflicts: RequestTracker[]) => ConflictResolution
  ): void {
    this.conflictResolvers.set(entityType, resolver);
  }

  // Debouncing for rapid updates
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  debounceUpdate(
    entityKey: string, 
    updateFn: () => void, 
    delay = 300
  ): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(entityKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      updateFn();
      this.debounceTimers.delete(entityKey);
    }, delay);

    this.debounceTimers.set(entityKey, timer);
  }

  // Request deduplication
  private requestSignatures: Map<string, { timestamp: number; promise: Promise<unknown> }> = new Map();

  async deduplicateRequest<T>(
    signature: string,
    requestFn: () => Promise<T>,
    ttl = 5000
  ): Promise<T> {
    const existing = this.requestSignatures.get(signature);
    
    if (existing && Date.now() - existing.timestamp < ttl) {
      const features = getFeatureFlags();
      if (features.enableDebugMode) {
        logger.debug('Deduplicating request', {
          signature,
          component: 'RaceConditionPrevention'
        });
      }
      return existing.promise as T;
    }

    logger.debug('Executing new request', {
      signature,
      component: 'RaceConditionPrevention'
    });
    const promise = requestFn();
    this.requestSignatures.set(signature, {
      timestamp: Date.now(),
      promise
    });

    // Clean up after completion
    promise.finally(() => {
      setTimeout(() => {
        logger.debug('Cleaning up request signature', {
          signature,
          component: 'RaceConditionPrevention'
        });
        this.requestSignatures.delete(signature);
      }, ttl);
    });

    return promise;
  }

  // Utility methods
  getActiveRequests(entityType?: string): RequestTracker[] {
    const requests = Array.from(this.activeRequests.values());
    return entityType 
      ? requests.filter(req => req.entityType === entityType)
      : requests;
  }

  getRequestHistory(entityType: string, entityId: string): RequestTracker[] {
    const entityKey = `${entityType}:${entityId}`;
    return this.requestHistory.get(entityKey) || [];
  }

  getPendingResolutions(): Map<string, ConflictResolution> {
    return new Map(this.pendingResolutions);
  }

  clearHistory(entityType?: string, entityId?: string): void {
    if (entityType && entityId) {
      const entityKey = `${entityType}:${entityId}`;
      this.requestHistory.delete(entityKey);
      this.pendingResolutions.delete(entityKey);
    } else if (entityType) {
      // Clear all history for entity type
      const keysToDelete = Array.from(this.requestHistory.keys()).filter(key => 
        key.startsWith(`${entityType}:`)
      );
      keysToDelete.forEach(key => {
        this.requestHistory.delete(key);
        this.pendingResolutions.delete(key);
      });
    } else {
      // Clear all history
      this.requestHistory.clear();
      this.pendingResolutions.clear();
    }
  }

  getEntityVersion(entityType: string, entityId: string): number {
    const entityKey = `${entityType}:${entityId}`;
    return this.versionMap.get(entityKey) || 0;
  }

  setEntityVersion(entityType: string, entityId: string, version: number): void {
    const entityKey = `${entityType}:${entityId}`;
    this.versionMap.set(entityKey, version);
  }
}

// Export singleton instance
export const raceConditionPrevention = RaceConditionPrevention.getInstance();

// Utility functions for common patterns
export function createRequestSignature(method: string, url: string, body?: unknown): string {
  const bodyStr = body ? JSON.stringify(body) : '';
  return `${method}:${url}:${bodyStr}`;
}

export function withRaceConditionPrevention(
  entityType: string,
  entityId: string,
  operation: 'CREATE' | 'UPDATE' | 'DELETE',
  source: 'REST' | 'WEBSOCKET' = 'REST'
) {
  return function(target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: unknown[]) {
      const requestId = raceConditionPrevention.trackRequest({
        entityType,
        entityId,
        operation,
        source
      });

      try {
        const result = await originalMethod.apply(this, args);
        raceConditionPrevention.completeRequest(requestId, true);
        return result;
      } catch (error) {
        raceConditionPrevention.completeRequest(requestId, false);
        throw error;
      }
    };

    return descriptor;
  };
}

export default raceConditionPrevention;