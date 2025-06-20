/**
 * Error Recovery Mechanisms
 * Provides retry logic, circuit breakers, and fallback strategies
 * for resilient API operations
 */

import { ApiError } from '@/lib/api/transformers/error-transformers';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  monitoringPeriodMs?: number;
  onStateChange?: (state: CircuitBreakerState) => void;
}

export interface FallbackOptions<T> {
  fallbackValue?: T;
  fallbackFunction?: () => T | Promise<T>;
  cacheDuration?: number;
  onFallback?: (error: Error) => void;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Retry mechanism with exponential backoff
 */
export class RetryManager {
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly DEFAULT_INITIAL_DELAY = 1000;
  private static readonly DEFAULT_MAX_DELAY = 30000;
  private static readonly DEFAULT_BACKOFF_MULTIPLIER = 2;
  private static readonly DEFAULT_RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

  /**
   * Execute a function with retry logic
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = this.DEFAULT_MAX_RETRIES,
      initialDelayMs = this.DEFAULT_INITIAL_DELAY,
      maxDelayMs = this.DEFAULT_MAX_DELAY,
      backoffMultiplier = this.DEFAULT_BACKOFF_MULTIPLIER,
      retryableStatuses = this.DEFAULT_RETRYABLE_STATUSES,
      onRetry
    } = options;

    let lastError: Error | null = null;
    let delayMs = initialDelayMs;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryableError(error, retryableStatuses)) {
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }

        // Call retry callback if provided
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }

        // Wait before retrying with exponential backoff
        await this.delay(delayMs);
        delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
    if (error instanceof ApiError) {
      return retryableStatuses.includes(error.statusCode);
    }

    // Network errors are generally retryable
    if (error instanceof Error) {
      const networkErrorPatterns = [
        'ECONNREFUSED',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ECONNRESET',
        'NetworkError',
        'Failed to fetch'
      ];

      return networkErrorPatterns.some(pattern => 
        error.message.includes(pattern) || error.name.includes(pattern)
      );
    }

    return false;
  }

  /**
   * Delay helper
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker pattern implementation
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly monitoringPeriodMs: number;
  private readonly onStateChange?: (state: CircuitBreakerState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeoutMs = options.resetTimeoutMs || 60000; // 1 minute
    this.monitoringPeriodMs = options.monitoringPeriodMs || 10000; // 10 seconds
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.setState(CircuitBreakerState.HALF_OPEN);
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failures = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++;
      // Require multiple successes before fully closing
      if (this.successCount >= 3) {
        this.setState(CircuitBreakerState.CLOSED);
        this.successCount = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;

    if (this.failures >= this.failureThreshold) {
      this.setState(CircuitBreakerState.OPEN);
    }
  }

  /**
   * Set circuit breaker state
   */
  private setState(newState: CircuitBreakerState): void {
    if (this.state !== newState) {
      this.state = newState;
      if (this.onStateChange) {
        this.onStateChange(newState);
      }
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.failures = 0;
    this.successCount = 0;
    this.setState(CircuitBreakerState.CLOSED);
  }
}

/**
 * Fallback mechanism with caching
 */
export class FallbackManager {
  private static cache = new Map<string, { value: unknown; expiry: number }>();

  /**
   * Execute with fallback
   */
  static async withFallback<T>(
    fn: () => Promise<T>,
    options: FallbackOptions<T> = {}
  ): Promise<T> {
    const {
      fallbackValue,
      fallbackFunction,
      cacheDuration = 300000, // 5 minutes default
      onFallback
    } = options;

    try {
      const result = await fn();
      
      // Cache successful result
      if (cacheDuration > 0) {
        const cacheKey = this.generateCacheKey(fn);
        this.cache.set(cacheKey, {
          value: result,
          expiry: Date.now() + cacheDuration
        });
      }
      
      return result;
    } catch (error) {
      // Try to get from cache first
      const cacheKey = this.generateCacheKey(fn);
      const cached = this.cache.get(cacheKey);
      
      if (cached && cached.expiry > Date.now()) {
        console.warn('Using cached value due to error:', error);
        return cached.value as T;
      }

      // Call fallback callback
      if (onFallback) {
        onFallback(error as Error);
      }

      // Use fallback function if provided
      if (fallbackFunction) {
        return await fallbackFunction();
      }

      // Use fallback value if provided
      if (fallbackValue !== undefined) {
        return fallbackValue;
      }

      // No fallback available, rethrow
      throw error;
    }
  }

  /**
   * Generate cache key for a function
   */
  private static generateCacheKey(fn: (...args: unknown[]) => unknown): string {
    return fn.toString().substring(0, 100); // Simple key based on function signature
  }

  /**
   * Clear expired cache entries
   */
  static clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry <= now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  static clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Resilient API wrapper combining all recovery mechanisms
 */
export class ResilientApiWrapper {
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;
  private fallbackOptions: FallbackOptions<unknown>;

  constructor(
    circuitBreakerOptions?: CircuitBreakerOptions,
    retryOptions?: RetryOptions,
    fallbackOptions?: FallbackOptions<unknown>
  ) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerOptions);
    this.retryOptions = retryOptions || {};
    this.fallbackOptions = fallbackOptions || {};
  }

  /**
   * Execute an API call with full resilience
   */
  async execute<T>(
    apiCall: () => Promise<T>,
    specificFallback?: FallbackOptions<T>
  ): Promise<T> {
    const fallbackOpts = { ...this.fallbackOptions, ...specificFallback } as FallbackOptions<T>;

    return FallbackManager.withFallback<T>(
      () => this.circuitBreaker.execute(
        () => RetryManager.withRetry(apiCall, this.retryOptions)
      ),
      fallbackOpts
    );
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreaker.reset();
  }
}

/**
 * Decorator for resilient methods
 */
export function Resilient(
  options: {
    retry?: RetryOptions;
    circuitBreaker?: CircuitBreakerOptions;
    fallback?: FallbackOptions<unknown>;
  } = {}
) {
  return function (target: object, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const wrapper = new ResilientApiWrapper(
      options.circuitBreaker,
      options.retry,
      options.fallback
    );

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      return wrapper.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

/**
 * Example usage:
 * 
 * // Basic retry
 * const result = await RetryManager.withRetry(
 *   () => apiClient.get('/api/data'),
 *   { maxRetries: 5, onRetry: (attempt) => console.log(`Retry attempt ${attempt}`) }
 * );
 * 
 * // Circuit breaker
 * const breaker = new CircuitBreaker({ failureThreshold: 3 });
 * const data = await breaker.execute(() => apiClient.get('/api/data'));
 * 
 * // Fallback with cache
 * const data = await FallbackManager.withFallback(
 *   () => apiClient.get('/api/data'),
 *   { 
 *     fallbackValue: [],
 *     cacheDuration: 600000 // 10 minutes
 *   }
 * );
 * 
 * // Full resilience
 * const resilientApi = new ResilientApiWrapper();
 * const data = await resilientApi.execute(
 *   () => apiClient.get('/api/data'),
 *   { fallbackValue: [] }
 * );
 * 
 * // Using decorator
 * class MyService {
 *   @Resilient({ 
 *     retry: { maxRetries: 3 },
 *     fallback: { fallbackValue: [] }
 *   })
 *   async getData() {
 *     return apiClient.get('/api/data');
 *   }
 * }
 */