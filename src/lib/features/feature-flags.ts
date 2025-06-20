/**
 * Feature Flags System
 * Enables runtime feature toggling and A/B testing
 *
 * Features:
 * - Environment-based configuration
 * - Runtime updates via API
 * - User segment targeting
 * - A/B testing support
 * - Local storage caching
 * - TypeScript type safety
 */

import { z } from 'zod';
import React from 'react';

// Feature flag value types
export type FeatureFlagValue = boolean | string | number | Record<string, unknown>;

// Feature flag schema
export const FeatureFlagSchema = z.object({
  key: z.string(),
  value: z.union([z.boolean(), z.string(), z.number(), z.record(z.unknown())]),
  enabled: z.boolean().default(true),
  description: z.string().optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  segments: z.array(z.string()).optional(),
  variants: z.array(z.object({
    key: z.string(),
    value: z.unknown(),
    weight: z.number().min(0).max(100)
  })).optional(),
  metadata: z.record(z.unknown()).optional()
});

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// User context for targeting
export interface UserContext {
  userId?: string;
  email?: string;
  segment?: string;
  attributes?: Record<string, unknown>;
}

// Feature flags configuration
export interface FeatureFlagsConfig {
  apiEndpoint?: string;
  cacheTimeout?: number;
  defaultFlags?: FeatureFlag[];
  enableLocalStorage?: boolean;
  enableDebugMode?: boolean;
}

class FeatureFlagsService {
  private flags: Map<string, FeatureFlag> = new Map();
  private config: Required<FeatureFlagsConfig>;
  private userContext: UserContext = {};
  private cacheTimestamp: number = 0;
  private abTestAssignments: Map<string, string> = new Map();

  constructor(config: FeatureFlagsConfig = {}) {
    this.config = {
      apiEndpoint: config.apiEndpoint || '',
      cacheTimeout: config.cacheTimeout || 300000, // 5 minutes
      defaultFlags: config.defaultFlags || [],
      enableLocalStorage: config.enableLocalStorage ?? true,
      enableDebugMode: config.enableDebugMode ?? process.env.NODE_ENV === 'development'
    };

    this.initializeDefaultFlags();
    this.loadFromLocalStorage();
    this.setupEnvironmentFlags();
  }

  /**
   * Initialize default feature flags
   */
  private initializeDefaultFlags(): void {
    // Core feature flags
    const defaultFlags: FeatureFlag[] = [
      {
        key: 'advanced_monitoring',
        value: true,
        enabled: true,
        description: 'Enable advanced performance and error monitoring'
      },
      {
        key: 'websocket_reconnect',
        value: true,
        enabled: true,
        description: 'Enable automatic WebSocket reconnection'
      },
      {
        key: 'rate_limiting',
        value: false,
        enabled: true,
        description: 'Enable frontend rate limiting',
        rolloutPercentage: 50
      },
      {
        key: 'ab_testing',
        value: false,
        enabled: true,
        description: 'Enable A/B testing framework'
      },
      {
        key: 'dark_mode',
        value: true,
        enabled: true,
        description: 'Enable dark mode theme'
      },
      {
        key: 'api_cache_timeout',
        value: 60000,
        enabled: true,
        description: 'API cache timeout in milliseconds'
      },
      {
        key: 'max_file_upload_size',
        value: 10485760, // 10MB
        enabled: true,
        description: 'Maximum file upload size in bytes'
      },
      {
        key: 'enable_analytics',
        value: false,
        enabled: true,
        description: 'Enable analytics tracking',
        segments: ['production']
      },
      ...this.config.defaultFlags
    ];

    defaultFlags.forEach(flag => {
      this.flags.set(flag.key, flag);
    });
  }

  /**
   * Setup feature flags from environment variables
   */
  private setupEnvironmentFlags(): void {
    // Check for environment-based feature flags
    if (typeof window !== 'undefined') {
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('NEXT_PUBLIC_FEATURE_')) {
          const flagKey = key.replace('NEXT_PUBLIC_FEATURE_', '').toLowerCase();
          const value = process.env[key];
          
          if (value !== undefined) {
            const flag: FeatureFlag = {
              key: flagKey,
              value: this.parseValue(value),
              enabled: true,
              description: `Environment flag: ${key}`
            };
            
            this.flags.set(flagKey, flag);
          }
        }
      });
    }
  }

  /**
   * Parse environment variable value
   */
  private parseValue(value: string): FeatureFlagValue {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, check for boolean
      if (value === 'true') return true;
      if (value === 'false') return false;
      
      // Check for number
      const num = Number(value);
      if (!isNaN(num)) return num;
      
      // Return as string
      return value;
    }
  }

  /**
   * Set user context for targeting
   */
  setUserContext(context: UserContext): void {
    this.userContext = context;
    
    // Clear A/B test assignments on user change
    if (context.userId !== this.userContext.userId) {
      this.abTestAssignments.clear();
    }
  }

  /**
   * Get feature flag value
   */
  getFlag<T extends FeatureFlagValue>(key: string, defaultValue?: T): T {
    const flag = this.flags.get(key);
    
    if (!flag || !flag.enabled) {
      return (defaultValue ?? false) as T;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      const isRolledOut = this.isUserInRollout(key, flag.rolloutPercentage);
      if (!isRolledOut) {
        return (defaultValue ?? false) as T;
      }
    }

    // Check user segments
    if (flag.segments && flag.segments.length > 0) {
      if (!this.userContext.segment || !flag.segments.includes(this.userContext.segment)) {
        return (defaultValue ?? false) as T;
      }
    }

    // Handle A/B test variants
    if (flag.variants && flag.variants.length > 0) {
      const variant = this.getVariant(key, flag.variants);
      return variant.value as T;
    }

    return flag.value as T;
  }

  /**
   * Check if feature is enabled
   */
  isEnabled(key: string): boolean {
    return this.getFlag(key, false) as boolean;
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): Record<string, FeatureFlagValue> {
    const result: Record<string, FeatureFlagValue> = {};
    
    this.flags.forEach((flag, key) => {
      if (flag.enabled) {
        result[key] = this.getFlag(key);
      }
    });
    
    return result;
  }

  /**
   * Update feature flags from API
   */
  async fetchFlags(): Promise<void> {
    if (!this.config.apiEndpoint) return;

    try {
      const response = await fetch(this.config.apiEndpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': this.userContext.userId || '',
          'X-User-Segment': this.userContext.segment || ''
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch feature flags: ${response.statusText}`);
      }

      const data = await response.json();
      const flags = z.array(FeatureFlagSchema).parse(data);

      // Update flags
      flags.forEach(flag => {
        this.flags.set(flag.key, flag);
      });

      this.cacheTimestamp = Date.now();
      this.saveToLocalStorage();

      if (this.config.enableDebugMode) {
        console.log('Feature flags updated:', flags);
      }
    } catch (error) {
      console.error('Error fetching feature flags:', error);
    }
  }

  /**
   * Check if user is in rollout percentage
   */
  private isUserInRollout(flagKey: string, percentage: number): boolean {
    const userId = this.userContext.userId || 'anonymous';
    const hash = this.hashString(`${flagKey}:${userId}`);
    return (hash % 100) < percentage;
  }

  /**
   * Get variant for A/B testing
   */
  private getVariant(flagKey: string, variants: FeatureFlag['variants']): { key: string; value: unknown } {
    if (!variants || variants.length === 0) {
      return { key: 'control', value: false };
    }

    // Check if user already has an assignment
    const assignmentKey = `${flagKey}:${this.userContext.userId || 'anonymous'}`;
    const existingAssignment = this.abTestAssignments.get(assignmentKey);
    
    if (existingAssignment) {
      const variant = variants.find(v => v.key === existingAssignment);
      if (variant) {
        return { key: variant.key, value: variant.value ?? false };
      }
    }

    // Assign variant based on weights
    const userId = this.userContext.userId || 'anonymous';
    const hash = this.hashString(`${flagKey}:${userId}`) % 100;
    
    let cumulativeWeight = 0;
    for (const variant of variants) {
      cumulativeWeight += variant.weight;
      if (hash < cumulativeWeight) {
        this.abTestAssignments.set(assignmentKey, variant.key);
        return { key: variant.key, value: variant.value ?? false };
      }
    }

    // Fallback to first variant or control
    const firstVariant = variants[0];
    return firstVariant
      ? { key: firstVariant.key, value: firstVariant.value ?? false }
      : { key: 'control', value: false };
  }

  /**
   * Simple hash function for consistent assignment
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Save flags to local storage
   */
  private saveToLocalStorage(): void {
    if (!this.config.enableLocalStorage || typeof window === 'undefined') return;

    try {
      const data = {
        flags: Array.from(this.flags.entries()),
        timestamp: this.cacheTimestamp,
        assignments: Array.from(this.abTestAssignments.entries())
      };
      
      localStorage.setItem('domainflow_feature_flags', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving feature flags to localStorage:', error);
    }
  }

  /**
   * Load flags from local storage
   */
  private loadFromLocalStorage(): void {
    if (!this.config.enableLocalStorage || typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('domainflow_feature_flags');
      if (!stored) return;

      const data = JSON.parse(stored);
      
      // Check cache expiry
      if (Date.now() - data.timestamp > this.config.cacheTimeout) {
        localStorage.removeItem('domainflow_feature_flags');
        return;
      }

      // Restore flags
      data.flags.forEach(([key, flag]: [string, FeatureFlag]) => {
        this.flags.set(key, flag);
      });

      // Restore A/B test assignments
      if (data.assignments) {
        data.assignments.forEach(([key, value]: [string, string]) => {
          this.abTestAssignments.set(key, value);
        });
      }

      this.cacheTimestamp = data.timestamp;
    } catch (error) {
      console.error('Error loading feature flags from localStorage:', error);
    }
  }

  /**
   * Clear all feature flags
   */
  clear(): void {
    this.flags.clear();
    this.abTestAssignments.clear();
    this.cacheTimestamp = 0;
    
    if (this.config.enableLocalStorage && typeof window !== 'undefined') {
      localStorage.removeItem('domainflow_feature_flags');
    }
  }

  /**
   * Override a feature flag (useful for testing)
   */
  override(key: string, value: FeatureFlagValue): void {
    const flag = this.flags.get(key) || {
      key,
      value,
      enabled: true,
      description: 'Overridden flag'
    };
    
    this.flags.set(key, { ...flag, value });
    this.saveToLocalStorage();
  }
}

// Export singleton instance
export const featureFlags = new FeatureFlagsService({
  apiEndpoint: process.env.NEXT_PUBLIC_FEATURE_FLAGS_API || '',
  enableDebugMode: process.env.NODE_ENV === 'development'
});

// React hook for feature flags
export function useFeatureFlag<T extends FeatureFlagValue>(key: string, defaultValue?: T): T {
  return featureFlags.getFlag(key, defaultValue);
}

// Higher-order component for feature flags
export function withFeatureFlag<P extends object>(
  flagKey: string,
  Component: React.ComponentType<P>,
  FallbackComponent?: React.ComponentType<P>
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => {
    const isEnabled = featureFlags.isEnabled(flagKey);
    
    if (isEnabled) {
      return React.createElement(Component, props);
    }
    
    if (FallbackComponent) {
      return React.createElement(FallbackComponent, props);
    }
    
    return null;
  };
  
  WrappedComponent.displayName = `withFeatureFlag(${Component.displayName || Component.name || 'Component'})`;
  
  return WrappedComponent;
}