/**
 * Frontend Rate Limiter
 * Implements client-side rate limiting to prevent abuse
 * 
 * Features:
 * - Token bucket algorithm
 * - Per-endpoint rate limiting
 * - User-specific limits
 * - Automatic retry with backoff
 * - Integration with monitoring
 * - Local storage persistence
 */

import { errorTracker } from '../monitoring/error-tracker';
import { featureFlags } from '../features/feature-flags';

export interface RateLimitConfig {
  endpoint: string;
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;
  retryAfterMs?: number;
  enableLogging?: boolean;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
  blockedUntil?: number;
  retryCount: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  resetTime: number;
  retryAfter?: number;
  reason?: string;
}

class RateLimiter {
  private limits: Map<string, RateLimitConfig> = new Map();
  private states: Map<string, RateLimitState> = new Map();
  private globalConfig: Partial<RateLimitConfig>;
  private storageKey = 'domainflow_rate_limits';
  private cleanupInterval?: NodeJS.Timeout;

  constructor(globalConfig: Partial<RateLimitConfig> = {}) {
    this.globalConfig = {
      maxRequests: 100,
      windowMs: 60000, // 1 minute
      blockDurationMs: 300000, // 5 minutes
      retryAfterMs: 1000, // 1 second
      enableLogging: process.env.NODE_ENV === 'development',
      ...globalConfig
    };

    this.initializeDefaultLimits();
    this.loadFromStorage();
    this.startCleanup();
  }

  /**
   * Initialize default rate limits for common endpoints
   */
  private initializeDefaultLimits(): void {
    // API endpoints
    this.addLimit({
      endpoint: '/api/auth/login',
      maxRequests: 5,
      windowMs: 300000, // 5 minutes
      blockDurationMs: 900000 // 15 minutes
    });

    this.addLimit({
      endpoint: '/api/auth/register',
      maxRequests: 3,
      windowMs: 3600000, // 1 hour
      blockDurationMs: 3600000 // 1 hour
    });

    this.addLimit({
      endpoint: '/api/campaigns',
      maxRequests: 50,
      windowMs: 60000 // 1 minute
    });

    this.addLimit({
      endpoint: '/api/domains/generate',
      maxRequests: 10,
      windowMs: 300000 // 5 minutes
    });

    this.addLimit({
      endpoint: '/api/proxies/test',
      maxRequests: 20,
      windowMs: 60000 // 1 minute
    });

    // WebSocket connections
    this.addLimit({
      endpoint: 'websocket:connect',
      maxRequests: 5,
      windowMs: 60000, // 1 minute
      blockDurationMs: 600000 // 10 minutes
    });

    // File uploads
    this.addLimit({
      endpoint: '/api/upload',
      maxRequests: 10,
      windowMs: 600000 // 10 minutes
    });
  }

  /**
   * Add or update a rate limit configuration
   */
  addLimit(config: RateLimitConfig): void {
    this.limits.set(config.endpoint, {
      ...this.globalConfig,
      ...config
    });
  }

  /**
   * Check if a request is allowed
   */
  async checkLimit(endpoint: string, userId?: string): Promise<RateLimitResult> {
    // Check if rate limiting is enabled
    if (!featureFlags.isEnabled('rate_limiting')) {
      return {
        allowed: true,
        remainingTokens: Infinity,
        resetTime: 0
      };
    }

    const key = this.getKey(endpoint, userId);
    const config = this.getLimitConfig(endpoint);
    const state = this.getOrCreateState(key, config);
    
    // Check if currently blocked
    if (state.blockedUntil && Date.now() < state.blockedUntil) {
      const retryAfter = state.blockedUntil - Date.now();
      
      this.logRateLimit(endpoint, false, 'blocked', state);
      
      return {
        allowed: false,
        remainingTokens: 0,
        resetTime: state.blockedUntil,
        retryAfter,
        reason: `Rate limit exceeded. Retry after ${Math.ceil(retryAfter / 1000)} seconds`
      };
    }

    // Refill tokens based on time elapsed
    this.refillTokens(state, config);

    // Check if request can be allowed
    if (state.tokens > 0) {
      state.tokens--;
      state.retryCount = 0;
      this.updateState(key, state);
      
      this.logRateLimit(endpoint, true, 'allowed', state);
      
      return {
        allowed: true,
        remainingTokens: state.tokens,
        resetTime: state.lastRefill + config.windowMs
      };
    }

    // Request denied - implement blocking
    state.retryCount++;
    
    if (state.retryCount >= 3 && config.blockDurationMs) {
      state.blockedUntil = Date.now() + config.blockDurationMs;
      
      // Report to error tracking
      errorTracker.trackError(new Error('Rate limit block triggered'), {
        url: endpoint,
        userId: userId || 'anonymous',
        component: 'RateLimiter',
        metadata: {
          retryCount: state.retryCount,
          endpoint
        }
      });
    }

    this.updateState(key, state);
    
    const retryAfter = config.retryAfterMs || 1000;
    this.logRateLimit(endpoint, false, 'denied', state);
    
    return {
      allowed: false,
      remainingTokens: 0,
      resetTime: state.lastRefill + config.windowMs,
      retryAfter,
      reason: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowMs / 1000} seconds`
    };
  }

  /**
   * Reset rate limit for a specific endpoint/user
   */
  reset(endpoint: string, userId?: string): void {
    const key = this.getKey(endpoint, userId);
    this.states.delete(key);
    this.saveToStorage();
  }

  /**
   * Clear all rate limit states
   */
  clearAll(): void {
    this.states.clear();
    this.saveToStorage();
  }

  /**
   * Get current state for endpoint/user
   */
  getState(endpoint: string, userId?: string): RateLimitState | undefined {
    const key = this.getKey(endpoint, userId);
    return this.states.get(key);
  }

  /**
   * Create key for state storage
   */
  private getKey(endpoint: string, userId?: string): string {
    return userId ? `${endpoint}:${userId}` : endpoint;
  }

  /**
   * Get limit configuration for endpoint
   */
  private getLimitConfig(endpoint: string): RateLimitConfig {
    // Check for exact match
    let config = this.limits.get(endpoint);
    
    if (!config) {
      // Check for pattern match (e.g., /api/* matches /api/users)
      for (const [pattern, limitConfig] of this.limits.entries()) {
        if (pattern.includes('*')) {
          const regex = new RegExp(pattern.replace('*', '.*'));
          if (regex.test(endpoint)) {
            config = limitConfig;
            break;
          }
        }
      }
    }

    // Fallback to global config
    return config || {
      endpoint,
      maxRequests: this.globalConfig.maxRequests!,
      windowMs: this.globalConfig.windowMs!,
      ...this.globalConfig
    };
  }

  /**
   * Get or create state for key
   */
  private getOrCreateState(key: string, config: RateLimitConfig): RateLimitState {
    let state = this.states.get(key);
    
    if (!state) {
      state = {
        tokens: config.maxRequests,
        lastRefill: Date.now(),
        retryCount: 0
      };
      this.states.set(key, state);
    }
    
    return state;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(state: RateLimitState, config: RateLimitConfig): void {
    const now = Date.now();
    const timePassed = now - state.lastRefill;
    const windowsPassed = Math.floor(timePassed / config.windowMs);
    
    if (windowsPassed > 0) {
      state.tokens = config.maxRequests;
      state.lastRefill = now;
      state.blockedUntil = undefined;
      state.retryCount = 0;
    }
  }

  /**
   * Update state and save to storage
   */
  private updateState(key: string, state: RateLimitState): void {
    this.states.set(key, state);
    this.saveToStorage();
  }

  /**
   * Log rate limit events
   */
  private logRateLimit(endpoint: string, allowed: boolean, reason: string, state: RateLimitState): void {
    if (!this.globalConfig.enableLogging) return;

    const logData = {
      endpoint,
      allowed,
      reason,
      remainingTokens: state.tokens,
      retryCount: state.retryCount,
      blockedUntil: state.blockedUntil
    };

    if (allowed) {
      console.log('Rate limit check:', logData);
    } else {
      console.warn('Rate limit exceeded:', logData);
    }

    // Track metrics - use custom metric tracking
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark(`rate_limit_${allowed ? 'allowed' : 'denied'}_${endpoint}`);
    }
  }

  /**
   * Save states to local storage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const data = {
        states: Array.from(this.states.entries()),
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save rate limit states:', error);
    }
  }

  /**
   * Load states from local storage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      
      // Restore states
      data.states.forEach(([key, state]: [string, RateLimitState]) => {
        this.states.set(key, state);
      });
    } catch (error) {
      console.error('Failed to load rate limit states:', error);
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    // Clean up expired states every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toDelete: string[] = [];

      this.states.forEach((state, key) => {
        // Remove states that haven't been used for over an hour
        if (now - state.lastRefill > 3600000) {
          toDelete.push(key);
        }
      });

      toDelete.forEach(key => this.states.delete(key));
      
      if (toDelete.length > 0) {
        this.saveToStorage();
      }
    }, 60000); // Every minute
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();

// Middleware for fetch interception
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withRateLimit<T extends (...args: any[]) => Promise<any>>(
  fetchFn: T,
  endpoint: string
): T {
  return (async (...args: Parameters<T>) => {
    const result = await rateLimiter.checkLimit(endpoint);
    
    if (!result.allowed) {
      throw new Error(result.reason || 'Rate limit exceeded');
    }
    
    try {
      return await fetchFn(...args);
    } catch (error) {
      // If request fails, refund the token
      const state = rateLimiter.getState(endpoint);
      if (state) {
        state.tokens = Math.min(state.tokens + 1, 100);
      }
      throw error;
    }
  }) as T;
}

// React hook for rate limiting
export function useRateLimit(endpoint: string): {
  checkLimit: () => Promise<boolean>;
  getRemainingRequests: () => number;
  isBlocked: () => boolean;
} {
  const checkLimit = async (): Promise<boolean> => {
    const result = await rateLimiter.checkLimit(endpoint);
    return result.allowed;
  };

  const getRemainingRequests = (): number => {
    const state = rateLimiter.getState(endpoint);
    return state?.tokens || 0;
  };

  const isBlocked = (): boolean => {
    const state = rateLimiter.getState(endpoint);
    return state?.blockedUntil ? Date.now() < state.blockedUntil : false;
  };

  return {
    checkLimit,
    getRemainingRequests,
    isBlocked
  };
}