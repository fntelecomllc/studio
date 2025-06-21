/**
 * Enhanced API Client
 * Provides request/response interceptors, request deduplication, and caching
 */

import { apiClient, type RequestOptions } from './client';
import type { ApiResponse } from '@/lib/types';
import { monitoringService } from '@/lib/monitoring/monitoring-service';
import { createSafeBigInt } from '@/lib/types/branded';
import { logger } from '@/lib/utils/logger';

/**
 * Request deduplication cache
 */
interface PendingRequest {
  promise: Promise<ApiResponse<unknown>>;
  timestamp: number;
}

class EnhancedApiClient {
  private static instance: EnhancedApiClient;
  private pendingRequests = new Map<string, PendingRequest>();
  private responseCache = new Map<string, { data: unknown; timestamp: number }>();
  private requestInterceptors: Array<(config: RequestOptions) => RequestOptions | Promise<RequestOptions>> = [];
  private responseInterceptors: Array<<T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>> = [];
  
  // Configuration
  private readonly DEDUP_TIMEOUT = 5000; // 5 seconds
  private readonly CACHE_TTL = 60000; // 1 minute for GET requests
  private readonly MAX_CACHE_SIZE = 100;

  static getInstance(): EnhancedApiClient {
    if (!EnhancedApiClient.instance) {
      EnhancedApiClient.instance = new EnhancedApiClient();
    }
    return EnhancedApiClient.instance;
  }

  constructor() {
    // Add default interceptors
    this.setupDefaultInterceptors();
    
    // Cleanup old cache entries periodically
    setInterval(() => this.cleanupCache(), 30000);
  }

  /**
   * Setup default interceptors
   */
  private setupDefaultInterceptors(): void {
    // Request logging interceptor
    this.addRequestInterceptor((config) => {
      logger.debug('API request initiated', {
        component: 'EnhancedApiClient',
        method: config.method,
        params: config.params,
        timestamp: new Date().toISOString()
      });
      return config;
    });

    // Response logging interceptor
    this.addResponseInterceptor((response) => {
      logger.debug('API response received', {
        component: 'EnhancedApiClient',
        status: response.status,
        timestamp: new Date().toISOString()
      });
      return response;
    });

    // Int64 transformation interceptor
    this.addResponseInterceptor((response) => {
      if (response.status === 'success' && response.data) {
        response.data = this.transformInt64Fields(response.data) as typeof response.data;
      }
      return response;
    });
  }

  /**
   * Transform int64 fields in response data
   */
  private transformInt64Fields(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;

    const int64Fields = [
      'totalItems', 'processedItems', 'successfulItems', 'failedItems',
      'offsetIndex', 'totalPossibleCombinations', 'currentOffset'
    ];

    const transform = (obj: unknown): unknown => {
      if (Array.isArray(obj)) {
        return obj.map(transform);
      }
      
      if (obj && typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        
        for (const [key, value] of Object.entries(obj)) {
          if (int64Fields.includes(key) && (typeof value === 'string' || typeof value === 'number')) {
            try {
              result[key] = createSafeBigInt(value);
            } catch {
              result[key] = value; // Keep original if conversion fails
            }
          } else if (value && typeof value === 'object') {
            result[key] = transform(value);
          } else {
            result[key] = value;
          }
        }
        
        return result;
      }
      
      return obj;
    };

    return transform(data);
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(
    interceptor: (config: RequestOptions) => RequestOptions | Promise<RequestOptions>
  ): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(
    interceptor: <T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>
  ): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(endpoint: string, options?: RequestOptions): string {
    const params = options?.params ? JSON.stringify(options.params) : '';
    return `${options?.method || 'GET'}:${endpoint}:${params}`;
  }

  /**
   * Check if request can be cached
   */
  private isCacheable(method?: string): boolean {
    return method === 'GET' || !method;
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    
    // Clean pending requests
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.DEDUP_TIMEOUT) {
        this.pendingRequests.delete(key);
      }
    }
    
    // Clean response cache
    for (const [key, cached] of this.responseCache.entries()) {
      if (now - cached.timestamp > this.CACHE_TTL) {
        this.responseCache.delete(key);
      }
    }
    
    // Limit cache size
    if (this.responseCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.responseCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => this.responseCache.delete(key));
    }
  }

  /**
   * Execute request with interceptors
   */
  private async executeWithInterceptors<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    // Apply request interceptors
    let config = { ...options };
    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config);
    }

    // Make the actual request
    let response = await this.makeRequest<T>(endpoint, config);

    // Apply response interceptors
    for (const interceptor of this.responseInterceptors) {
      response = await interceptor(response);
    }

    return response;
  }

  /**
   * Make the actual request
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestOptions
  ): Promise<ApiResponse<T>> {
    const method = options.method || 'GET';
    
    switch (method) {
      case 'GET':
        return apiClient.get<T>(endpoint, options);
      case 'POST':
        return apiClient.post<T>(endpoint, options.body, options);
      case 'PUT':
        return apiClient.put<T>(endpoint, options.body, options);
      case 'PATCH':
        return apiClient.patch<T>(endpoint, options.body, options);
      case 'DELETE':
        return apiClient.delete<T>(endpoint, options);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  /**
   * Execute request with deduplication and caching
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const cacheKey = this.getCacheKey(endpoint, options);
    const now = Date.now();

    // Check cache for GET requests
    if (this.isCacheable(options.method)) {
      const cached = this.responseCache.get(cacheKey);
      if (cached && now - cached.timestamp < this.CACHE_TTL) {
        monitoringService.recordCustomMetric(
          'cache_hit',
          1,
          'count',
          { cache_type: 'api-response' }
        );
        return { status: 'success', data: cached.data as T };
      }
    }

    // Check for pending request (deduplication)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending && now - pending.timestamp < this.DEDUP_TIMEOUT) {
      monitoringService.recordCustomMetric(
        'cache_hit',
        1,
        'count',
        { cache_type: 'request-dedup' }
      );
      return pending.promise as Promise<ApiResponse<T>>;
    }

    // Create new request
    const requestPromise = this.executeWithInterceptors<T>(endpoint, options)
      .then(response => {
        // Cache successful GET responses
        if (this.isCacheable(options.method) && response.status === 'success') {
          this.responseCache.set(cacheKey, {
            data: response.data,
            timestamp: now
          });
        }
        
        // Remove from pending
        this.pendingRequests.delete(cacheKey);
        
        return response;
      })
      .catch(error => {
        // Remove from pending on error
        this.pendingRequests.delete(cacheKey);
        throw error;
      });

    // Store as pending request
    this.pendingRequests.set(cacheKey, {
      promise: requestPromise,
      timestamp: now
    });

    return requestPromise;
  }

  // Convenience methods
  async get<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string, 
    body?: RequestOptions['body'], 
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  async put<T>(
    endpoint: string, 
    body?: RequestOptions['body'], 
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  async patch<T>(
    endpoint: string, 
    body?: RequestOptions['body'], 
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  async delete<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Clear cache for specific endpoint or all
   */
  clearCache(endpoint?: string): void {
    if (endpoint) {
      // Clear specific endpoint
      const keysToDelete: string[] = [];
      for (const key of this.responseCache.keys()) {
        if (key.includes(endpoint)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.responseCache.delete(key));
    } else {
      // Clear all cache
      this.responseCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    pendingRequests: number;
    oldestEntry?: number;
  } {
    const now = Date.now();
    let oldestTimestamp: number | undefined;
    
    for (const cached of this.responseCache.values()) {
      if (!oldestTimestamp || cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
      }
    }
    
    return {
      cacheSize: this.responseCache.size,
      pendingRequests: this.pendingRequests.size,
      oldestEntry: oldestTimestamp ? now - oldestTimestamp : undefined
    };
  }
}

// Export singleton instance
export const enhancedApiClient = EnhancedApiClient.getInstance();

// Export for testing
export { EnhancedApiClient };