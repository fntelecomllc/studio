/**
 * Transformation Performance Monitor
 * Tracks and optimizes type transformation performance
 */

import { performanceMonitor } from './performance-monitor';
import { SafeBigInt } from '../types/branded';

interface TransformationMetrics {
  totalTransformations: number;
  averageTime: number;
  slowestTransformation: {
    type: string;
    duration: number;
    timestamp: number;
  };
  transformationsByType: Map<string, {
    count: number;
    totalTime: number;
    averageTime: number;
  }>;
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
}

class TransformationMonitor {
  private metrics: TransformationMetrics = {
    totalTransformations: 0,
    averageTime: 0,
    slowestTransformation: {
      type: '',
      duration: 0,
      timestamp: 0
    },
    transformationsByType: new Map(),
    cacheHitRate: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  private readonly SLOW_TRANSFORMATION_THRESHOLD = 5; // ms
  private transformationCache = new Map<string, unknown>();
  private cacheExpirationMap = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Record a transformation execution
   */
  recordTransformation(
    type: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    this.metrics.totalTransformations++;
    
    // Update average time
    const totalTime = this.metrics.averageTime * (this.metrics.totalTransformations - 1) + duration;
    this.metrics.averageTime = totalTime / this.metrics.totalTransformations;

    // Update slowest transformation
    if (duration > this.metrics.slowestTransformation.duration) {
      this.metrics.slowestTransformation = {
        type,
        duration,
        timestamp: Date.now()
      };
    }

    // Update type-specific metrics
    const typeMetrics = this.metrics.transformationsByType.get(type) || {
      count: 0,
      totalTime: 0,
      averageTime: 0
    };
    
    typeMetrics.count++;
    typeMetrics.totalTime += duration;
    typeMetrics.averageTime = typeMetrics.totalTime / typeMetrics.count;
    
    this.metrics.transformationsByType.set(type, typeMetrics);

    // Record to performance monitor if slow
    if (duration > this.SLOW_TRANSFORMATION_THRESHOLD) {
      performanceMonitor.recordCustomMetric(
        'slow_transformation',
        duration,
        'ms',
        {
          transformation_type: type,
          ...metadata
        }
      );
    }

    // Update cache hit rate
    this.updateCacheHitRate();
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(_key: string): void {
    this.metrics.cacheHits++;
    this.updateCacheHitRate();
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(_key: string): void {
    this.metrics.cacheMisses++;
    this.updateCacheHitRate();
  }

  /**
   * Update cache hit rate
   */
  private updateCacheHitRate(): void {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    this.metrics.cacheHitRate = total > 0 
      ? (this.metrics.cacheHits / total) * 100 
      : 0;
  }

  /**
   * Get transformation metrics
   */
  getMetrics(): TransformationMetrics {
    return {
      ...this.metrics,
      transformationsByType: new Map(this.metrics.transformationsByType)
    };
  }

  /**
   * Clear metrics
   */
  clearMetrics(): void {
    this.metrics = {
      totalTransformations: 0,
      averageTime: 0,
      slowestTransformation: {
        type: '',
        duration: 0,
        timestamp: 0
      },
      transformationsByType: new Map(),
      cacheHitRate: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    hits: number;
    misses: number;
    expirations: number;
  } {
    // Clean expired entries
    this.cleanExpiredCache();
    
    return {
      size: this.transformationCache.size,
      hitRate: this.metrics.cacheHitRate,
      hits: this.metrics.cacheHits,
      misses: this.metrics.cacheMisses,
      expirations: this.cacheExpirationMap.size
    };
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    this.cacheExpirationMap.forEach((expirationTime, key) => {
      if (expirationTime < now) {
        expiredKeys.push(key);
      }
    });
    
    expiredKeys.forEach(key => {
      this.transformationCache.delete(key);
      this.cacheExpirationMap.delete(key);
    });
  }

  /**
   * Cache a transformation result
   */
  cacheTransformation(key: string, value: unknown, ttl: number = this.CACHE_TTL): void {
    this.transformationCache.set(key, value);
    this.cacheExpirationMap.set(key, Date.now() + ttl);
  }

  /**
   * Get cached transformation result
   */
  getCachedTransformation(key: string): unknown | null {
    this.cleanExpiredCache();
    
    if (this.transformationCache.has(key)) {
      this.recordCacheHit(key);
      return this.transformationCache.get(key);
    }
    
    this.recordCacheMiss(key);
    return null;
  }
}

// Export singleton instance
export const transformationMonitor = new TransformationMonitor();

/**
 * Decorator to monitor transformation performance
 */
export function monitorTransformation(transformationType: string) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function (...args: unknown[]) {
      const startTime = performance.now();
      
      try {
        const result = originalMethod.apply(this, args);
        const duration = performance.now() - startTime;
        
        transformationMonitor.recordTransformation(
          transformationType,
          duration,
          { method: propertyKey }
        );
        
        return result;
      } catch {
        const duration = performance.now() - startTime;
        
        transformationMonitor.recordTransformation(
          `${transformationType}_error`,
          duration,
          { 
            method: propertyKey,
            error: error instanceof Error ? error.message : 'unknown'
          }
        );
        
        throw error;
      }
    };
    
    return descriptor;
  };
}

/**
 * Create a memoized transformation function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memoizeTransformation<T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  ttl?: number
): T {
  const generateKey = keyGenerator || ((...args) => JSON.stringify(args));
  
  return ((...args: Parameters<T>) => {
    const key = generateKey(...args);
    
    // Check cache
    const cached = transformationMonitor.getCachedTransformation(key);
    if (cached !== null) {
      return cached;
    }
    
    // Execute transformation
    const startTime = performance.now();
    const result = fn(...args);
    const duration = performance.now() - startTime;
    
    // Cache result
    transformationMonitor.cacheTransformation(key, result, ttl);
    
    // Record metrics
    transformationMonitor.recordTransformation(
      fn.name || 'anonymous',
      duration,
      { cached: false }
    );
    
    return result;
  }) as T;
}

/**
 * Batch transformation processor with performance monitoring
 */
export class BatchTransformationProcessor<T, R> {
  private batchSize: number;
  private transformFn: (item: T) => R;
  private batchTimeout: number;
  private pendingItems: T[] = [];
  private pendingResolvers: Array<{
    resolve: (value: R) => void;
    reject: (error: unknown) => void;
    item: T;
  }> = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(
    transformFn: (item: T) => R,
    batchSize = 100,
    batchTimeout = 10
  ) {
    this.transformFn = transformFn;
    this.batchSize = batchSize;
    this.batchTimeout = batchTimeout;
  }

  async transform(item: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.pendingItems.push(item);
      this.pendingResolvers.push({ resolve, reject, item });
      
      if (this.pendingItems.length >= this.batchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.processBatch(), this.batchTimeout);
      }
    });
  }

  private processBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    const items = [...this.pendingItems];
    const resolvers = [...this.pendingResolvers];
    
    this.pendingItems = [];
    this.pendingResolvers = [];
    
    const startTime = performance.now();
    
    try {
      // Process all items
      const results = items.map(item => this.transformFn(item));
      
      const duration = performance.now() - startTime;
      const avgDuration = duration / items.length;
      
      transformationMonitor.recordTransformation(
        'batch_transformation',
        avgDuration,
        {
          batch_size: items.length.toString(),
          total_duration: duration.toString()
        }
      );
      
      // Resolve promises
      resolvers.forEach((resolver, index) => {
        const result = results[index];
        if (result !== undefined) {
          resolver.resolve(result);
        }
      });
    } catch {
      // Reject all promises
      resolvers.forEach(resolver => {
        resolver.reject(error);
      });
      
      transformationMonitor.recordTransformation(
        'batch_transformation_error',
        performance.now() - startTime,
        {
          batch_size: items.length.toString(),
          error: error instanceof Error ? error.message : 'unknown'
        }
      );
    }
  }
}

/**
 * Optimized SafeBigInt transformation with caching
 */
export const memoizedSafeBigIntTransform = memoizeTransformation(
  (value: string | number | bigint): SafeBigInt => {
    // This would use the actual SafeBigInt creation logic
    return BigInt(value) as SafeBigInt;
  },
  (value) => `safebigint_${value}`,
  10 * 60 * 1000 // 10 minutes TTL
);

/**
 * Performance benchmarking utility
 */
export class TransformationBenchmark {
  private results: Map<string, number[]> = new Map();

  async benchmark<T>(
    name: string,
    fn: () => T | Promise<T>,
    iterations = 100
  ): Promise<{
    name: string;
    iterations: number;
    average: number;
    min: number;
    max: number;
    median: number;
    p95: number;
    p99: number;
  }> {
    if (iterations < 1) {
      throw new Error('Iterations must be at least 1');
    }

    const times: number[] = [];
    
    // Warm up
    for (let i = 0; i < 10; i++) {
      await fn();
    }
    
    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const duration = performance.now() - start;
      times.push(duration);
    }
    
    // Sort for percentile calculations
    times.sort((a, b) => a - b);
    
    const result = {
      name,
      iterations,
      average: times.reduce((sum, t) => sum + t, 0) / times.length,
      min: times[0] || 0,
      max: times[times.length - 1] || 0,
      median: times[Math.floor(times.length / 2)] || 0,
      p95: times[Math.floor(times.length * 0.95)] || 0,
      p99: times[Math.floor(times.length * 0.99)] || 0
    };
    
    // Store results
    this.results.set(name, times);
    
    // Record to performance monitor
    performanceMonitor.recordCustomMetric(
      'transformation_benchmark',
      result.average,
      'ms',
      {
        benchmark: name,
        iterations: iterations.toString(),
        p95: result.p95.toString(),
        p99: result.p99.toString()
      }
    );
    
    return result;
  }

  getResults(): Map<string, number[]> {
    return new Map(this.results);
  }

  compareResults(name1: string, name2: string): {
    speedup: number;
    name1Average: number;
    name2Average: number;
  } | null {
    const times1 = this.results.get(name1);
    const times2 = this.results.get(name2);
    
    if (!times1 || !times2) {
      return null;
    }
    
    const avg1 = times1.reduce((sum, t) => sum + t, 0) / times1.length;
    const avg2 = times2.reduce((sum, t) => sum + t, 0) / times2.length;
    
    return {
      speedup: avg1 / avg2,
      name1Average: avg1,
      name2Average: avg2
    };
  }
}