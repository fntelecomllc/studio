/**
 * React hooks for monitoring type transformation performance
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { transformationMonitor, memoizeTransformation } from '../monitoring/transformation-monitor';
import { monitoringService } from '../monitoring/monitoring-service';

/**
 * Hook to monitor transformation performance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useTransformationMonitor<T extends (...args: any[]) => any>(
  transformationName: string,
  transformFn: T,
  deps: React.DependencyList = []
): T {
  const executionCount = useRef(0);
  const totalTime = useRef(0);

  const monitoredTransform = useCallback(
    ((...args: Parameters<T>) => {
      executionCount.current++;
      const startTime = performance.now();
      
      try {
        const result = transformFn(...args);
        const duration = performance.now() - startTime;
        
        totalTime.current += duration;
        transformationMonitor.recordTransformation(
          transformationName,
          duration,
          {
            execution_count: executionCount.current.toString(),
            average_time: (totalTime.current / executionCount.current).toFixed(2)
          }
        );
        
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        transformationMonitor.recordTransformation(
          `${transformationName}_error`,
          duration,
          {
            error: error instanceof Error ? error.message : 'unknown',
            execution_count: executionCount.current.toString()
          }
        );
        
        throw error;
      }
    }) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transformationName, ...deps]
  );

  return monitoredTransform;
}

/**
 * Hook to create memoized transformations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useMemoizedTransformation<T extends (...args: any[]) => any>(
  transformationName: string,
  transformFn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  ttl?: number
): T {
  const memoizedFn = useRef<T>();

  if (!memoizedFn.current) {
    memoizedFn.current = memoizeTransformation(
      transformFn,
      keyGenerator,
      ttl
    );
  }

  return memoizedFn.current;
}

/**
 * Hook to monitor transformation metrics
 */
export function useTransformationMetrics() {
  const [metrics, setMetrics] = useState(transformationMonitor.getMetrics());
  const [cacheStats, setCacheStats] = useState(transformationMonitor.getCacheStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(transformationMonitor.getMetrics());
      setCacheStats(transformationMonitor.getCacheStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const clearMetrics = useCallback(() => {
    transformationMonitor.clearMetrics();
    setMetrics(transformationMonitor.getMetrics());
  }, []);

  return {
    metrics,
    cacheStats,
    clearMetrics
  };
}

/**
 * Hook for lazy loading with transformation monitoring
 */
export function useLazyComponent<T = unknown>(
  componentLoader: () => Promise<{ default: React.ComponentType<T> }>,
  componentName: string
): {
  Component: React.ComponentType<T> | null;
  isLoading: boolean;
  error: Error | null;
  loadTime: number | null;
} {
  const [Component, setComponent] = useState<React.ComponentType<T> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const loadAttempted = useRef(false);

  useEffect(() => {
    if (!loadAttempted.current) {
      loadAttempted.current = true;
      setIsLoading(true);
      
      const startTime = performance.now();
      
      componentLoader()
        .then((module) => {
          const duration = performance.now() - startTime;
          setLoadTime(duration);
          setComponent(() => module.default);
          
          monitoringService.recordCustomMetric(
            'component_lazy_load',
            duration,
            'ms',
            { component: componentName }
          );
        })
        .catch((err) => {
          const duration = performance.now() - startTime;
          setError(err);
          
          monitoringService.recordError(
            err,
            `Failed to lazy load component: ${componentName}`
          );
          
          monitoringService.recordCustomMetric(
            'component_lazy_load_error',
            duration,
            'ms',
            { 
              component: componentName,
              error: err.message
            }
          );
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [componentLoader, componentName]);

  return { Component, isLoading, error, loadTime };
}

/**
 * Hook to monitor SafeBigInt transformations
 */
export function useSafeBigIntTransform() {
  const transform = useTransformationMonitor(
    'safebigint_transform',
    (value: string | number | bigint): bigint => {
      return BigInt(value);
    }
  );

  const batchTransform = useTransformationMonitor(
    'safebigint_batch_transform',
    (values: Array<string | number | bigint>): bigint[] => {
      return values.map(v => BigInt(v));
    }
  );

  return {
    transform,
    batchTransform
  };
}

interface BenchmarkResult {
  average: number;
  min: number;
  max: number;
  iterations: number;
}

/**
 * Hook to benchmark transformations
 */
export function useTransformationBenchmark() {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<Map<string, BenchmarkResult>>(new Map());

  const runBenchmark = useCallback(async (
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fn: () => any | Promise<any>,
    iterations = 100
  ) => {
    setIsRunning(true);
    
    try {
      const { TransformationBenchmark } = await import('../monitoring/transformation-monitor');
      const benchmark = new TransformationBenchmark();
      const result = await benchmark.benchmark(name, fn, iterations);
      
      setResults(prev => new Map(prev).set(name, result));
      
      return result;
    } catch (error) {
      monitoringService.recordError(
        error as Error,
        `Benchmark failed: ${name}`
      );
      throw error;
    } finally {
      setIsRunning(false);
    }
  }, []);

  const compareBenchmarks = useCallback((name1: string, name2: string) => {
    const result1 = results.get(name1);
    const result2 = results.get(name2);
    
    if (!result1 || !result2) {
      return null;
    }
    
    return {
      speedup: result1.average / result2.average,
      name1Average: result1.average,
      name2Average: result2.average
    };
  }, [results]);

  return {
    runBenchmark,
    compareBenchmarks,
    results,
    isRunning
  };
}

/**
 * Hook to monitor API response transformations
 */
export function useApiTransformationMonitor() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monitor = useCallback((endpoint: string, transform: (data: any) => any) => {
    return (data: unknown) => {
      const startTime = performance.now();
      
      try {
        const result = transform(data);
        const duration = performance.now() - startTime;
        
        transformationMonitor.recordTransformation(
          `api_transform_${endpoint}`,
          duration,
          {}
        );
        
        return result;
      } catch (error) {
        const duration = performance.now() - startTime;
        
        transformationMonitor.recordTransformation(
          `api_transform_${endpoint}_error`,
          duration,
          {
            error: error instanceof Error ? error.message : 'unknown'
          }
        );
        
        throw error;
      }
    };
  }, []);

  return monitor;
}