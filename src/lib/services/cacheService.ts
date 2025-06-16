// Phase 5.2: Multi-Layer Caching Strategy Implementation

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  defaultTTL?: number;
  maxSize?: number;
  onEvict?: (key: string, value: unknown) => void;
}

/**
 * Layer 1: In-Memory Application Cache
 * LRU (Least Recently Used) cache implementation
 */
export class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private accessOrder: string[] = [];
  private maxSize: number;
  private defaultTTL: number;
  private onEvict?: (key: string, value: unknown) => void;

  constructor(config: CacheConfig = {}) {
    this.maxSize = config.maxSize || 1000;
    this.defaultTTL = config.defaultTTL || 300000; // 5 minutes
    this.onEvict = config.onEvict;
  }

  async get<T>(key: string, fetcher?: () => Promise<T>, ttl?: number): Promise<T | undefined> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (entry && !this.isExpired(entry)) {
      // Move to end of access order (most recently used)
      this.updateAccessOrder(key);
      return entry.value;
    }

    // If no fetcher provided, return undefined for cache miss
    if (!fetcher) {
      return undefined;
    }

    // Fetch and cache the value
    try {
      const value = await fetcher();
      this.set(key, value, ttl);
      return value;
    } catch (error) {
      // Remove stale entry if fetch fails
      this.delete(key);
      throw error;
    }
  }

  set<T>(key: string, value: T, ttl?: number): void {
    // Evict LRU entries if at capacity
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });

    this.updateAccessOrder(key);
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    const deleted = this.cache.delete(key);
    
    if (deleted) {
      this.removeFromAccessOrder(key);
      if (this.onEvict && entry) {
        this.onEvict(key, entry.value);
      }
    }
    
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const lruKey = this.accessOrder[0];
    if (lruKey) {
      this.delete(lruKey);
    }
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.delete(key));
  }
}

/**
 * Layer 2: Browser Storage Cache (for persistent caching)
 */
export class StorageCache {
  private storageKey = 'domainflow_cache';
  
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const data = localStorage.getItem(`${this.storageKey}_${key}`);
      if (!data) return undefined;

      const entry: CacheEntry<T> = JSON.parse(data);
      
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.delete(key);
        return undefined;
      }

      return entry.value;
    } catch (error) {
      console.error('Storage cache get error:', error);
      return undefined;
    }
  }

  set<T>(key: string, value: T, ttl: number = 3600000): void { // 1 hour default
    try {
      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        ttl
      };
      
      localStorage.setItem(`${this.storageKey}_${key}`, JSON.stringify(entry));
    } catch (error) {
      console.error('Storage cache set error:', error);
      // Handle quota exceeded error
      if (error instanceof DOMException && error.code === 22) {
        this.cleanup();
        // Retry once after cleanup
        try {
          localStorage.setItem(`${this.storageKey}_${key}`, JSON.stringify({
            value,
            timestamp: Date.now(),
            ttl
          }));
        } catch (retryError) {
          console.error('Storage cache retry failed:', retryError);
        }
      }
    }
  }

  delete(key: string): void {
    localStorage.removeItem(`${this.storageKey}_${key}`);
  }

  clear(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.storageKey)) {
        localStorage.removeItem(key);
      }
    });
  }

  cleanup(): void {
    const keys = Object.keys(localStorage);
    const now = Date.now();

    keys.forEach(key => {
      if (key.startsWith(this.storageKey)) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const entry: CacheEntry<unknown> = JSON.parse(data);
            if (now - entry.timestamp > entry.ttl) {
              localStorage.removeItem(key);
            }
          }
        } catch (_error) {
          // Remove corrupted entries
          localStorage.removeItem(key);
        }
      }
    });
  }
}

/**
 * Layer 3: HTTP Cache Headers utility
 */
export type CachePolicy = 'public' | 'private' | 'no-cache' | 'immutable';

export function setCacheHeaders(headers: Headers, policy: CachePolicy, maxAge?: number): void {
  switch (policy) {
    case 'public':
      headers.set('Cache-Control', `public, max-age=${maxAge || 3600}, s-maxage=${maxAge || 86400}`);
      break;
    case 'private':
      headers.set('Cache-Control', `private, max-age=${maxAge || 300}`);
      break;
    case 'no-cache':
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      break;
    case 'immutable':
      headers.set('Cache-Control', `public, max-age=${maxAge || 31536000}, immutable`);
      break;
  }
}

/**
 * Unified Cache Manager combining all layers
 */
export class CacheManager {
  private memoryCache: MemoryCache;
  private storageCache: StorageCache;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: CacheConfig) {
    this.memoryCache = new MemoryCache(config);
    this.storageCache = new StorageCache();
    
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 300000);
  }

  async get<T>(
    key: string, 
    fetcher?: () => Promise<T>, 
    options?: { 
      ttl?: number; 
      useStorage?: boolean;
      cachePolicy?: CachePolicy;
    }
  ): Promise<T | undefined> {
    // Try memory cache first
    let value = await this.memoryCache.get<T>(key);
    if (value !== undefined) {
      return value;
    }

    // Try storage cache if enabled
    if (options?.useStorage) {
      value = await this.storageCache.get<T>(key);
      if (value !== undefined) {
        // Populate memory cache
        this.memoryCache.set(key, value, options.ttl);
        return value;
      }
    }

    // Fetch if fetcher provided
    if (fetcher) {
      value = await fetcher();
      this.set(key, value, options);
      return value;
    }

    return undefined;
  }

  set<T>(
    key: string, 
    value: T, 
    options?: { 
      ttl?: number; 
      useStorage?: boolean; 
    }
  ): void {
    this.memoryCache.set(key, value, options?.ttl);
    
    if (options?.useStorage) {
      this.storageCache.set(key, value, options.ttl);
    }
  }

  delete(key: string, fromStorage = true): void {
    this.memoryCache.delete(key);
    if (fromStorage) {
      this.storageCache.delete(key);
    }
  }

  clear(includeStorage = true): void {
    this.memoryCache.clear();
    if (includeStorage) {
      this.storageCache.clear();
    }
  }

  cleanup(): void {
    this.memoryCache.cleanup();
    this.storageCache.cleanup();
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Singleton instance
let cacheManagerInstance: CacheManager | null = null;

export function getCacheManager(config?: CacheConfig): CacheManager {
  if (!cacheManagerInstance) {
    cacheManagerInstance = new CacheManager(config);
  }
  return cacheManagerInstance;
}

// Cache key generators for consistency
export const CacheKeys = {
  campaign: (id: string) => `campaign:${id}`,
  campaignList: (userId: string, status?: string) => `campaigns:${userId}${status ? `:${status}` : ''}`,
  persona: (id: string) => `persona:${id}`,
  personaList: (type?: string) => `personas${type ? `:${type}` : ''}`,
  proxy: (id: string) => `proxy:${id}`,
  proxyList: (healthy?: boolean) => `proxies${healthy !== undefined ? `:${healthy}` : ''}`,
  user: (id: string) => `user:${id}`,
  permissions: (userId: string) => `permissions:${userId}`,
  domainBatch: (campaignId: string, offset: number) => `domains:${campaignId}:${offset}`,
  validationResults: (campaignId: string, type: string) => `validation:${campaignId}:${type}`,
};

// React Query integration helpers
export function getCacheTime(type: 'short' | 'medium' | 'long' | 'infinite'): number {
  switch (type) {
    case 'short':
      return 60 * 1000; // 1 minute
    case 'medium':
      return 5 * 60 * 1000; // 5 minutes
    case 'long':
      return 30 * 60 * 1000; // 30 minutes
    case 'infinite':
      return Infinity;
    default:
      return 5 * 60 * 1000; // 5 minutes default
  }
}

export function getStaleTime(type: 'immediate' | 'short' | 'medium' | 'long'): number {
  switch (type) {
    case 'immediate':
      return 0;
    case 'short':
      return 30 * 1000; // 30 seconds
    case 'medium':
      return 2 * 60 * 1000; // 2 minutes
    case 'long':
      return 10 * 60 * 1000; // 10 minutes
    default:
      return 60 * 1000; // 1 minute default
  }
}