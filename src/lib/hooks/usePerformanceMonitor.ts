/**
 * Performance monitoring hooks
 * 
 * React hooks for monitoring component performance and identifying optimization opportunities
 */

import { useRef, useEffect, useCallback, DependencyList } from 'react';
import { monitoringService } from '@/lib/monitoring/monitoring-service';

/**
 * Hook to monitor component render performance
 */
export function useRenderMonitor(componentName: string) {
  const renderCount = useRef(0);
  const renderTimer = useRef<ReturnType<typeof monitoringService.createTimer>>();

  useEffect(() => {
    // Component mounted
    const mountTimer = monitoringService.createTimer();
    
    return () => {
      // Component unmounted
      const totalMountTime = mountTimer.end();
      monitoringService.recordComponentMount(componentName, totalMountTime);
      
      // Record total render count
      monitoringService.recordCustomMetric(
        'component_render_count',
        renderCount.current,
        'count',
        { component: componentName }
      );
    };
  }, [componentName]);

  // Track each render
  renderCount.current += 1;
  
  if (renderTimer.current) {
    const renderTime = renderTimer.current.end();
    monitoringService.recordComponentRender(componentName, renderTime);
  }
  
  renderTimer.current = monitoringService.createTimer();
  
  return {
    renderCount: renderCount.current,
    componentName
  };
}

/**
 * Hook to monitor effect performance
 */
export function useEffectMonitor(
  effectName: string,
  deps: DependencyList,
  effect: () => void | (() => void)
) {
  const previousDeps = useRef<DependencyList>();
  const effectCount = useRef(0);

  useEffect(() => {
    effectCount.current += 1;
    const timer = monitoringService.createTimer();
    
    // Track which dependencies changed
    const changedDeps: number[] = [];
    if (previousDeps.current) {
      deps.forEach((dep, index) => {
        if (dep !== previousDeps.current![index]) {
          changedDeps.push(index);
        }
      });
    }
    
    previousDeps.current = [...deps];
    
    // Run the effect
    const cleanup = effect();
    
    const effectTime = timer.end();
    monitoringService.recordCustomMetric(
      'effect_execution_time',
      effectTime,
      'ms',
      {
        effect: effectName,
        execution_count: effectCount.current.toString(),
        changed_deps: changedDeps.join(',')
      }
    );
    
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectName, effect, ...deps]);
}

/**
 * Hook to monitor callback performance
 */
export function useCallbackMonitor<T extends (...args: unknown[]) => unknown>(
  callbackName: string,
  callback: T,
  deps: DependencyList
): T {
  const callCount = useRef(0);
  const recreateCount = useRef(0);
  const previousDeps = useRef<DependencyList>();

  // Check if dependencies changed
  if (!previousDeps.current || 
      deps.length !== previousDeps.current.length ||
      deps.some((dep, i) => dep !== previousDeps.current![i])) {
    recreateCount.current += 1;
    previousDeps.current = [...deps];
  }

  return useCallback(
    ((...args: Parameters<T>) => {
      callCount.current += 1;
      const timer = monitoringService.createTimer();
      
      try {
        const result = callback(...args);
        
        const executionTime = timer.end();
        monitoringService.recordCustomMetric(
          'callback_execution_time',
          executionTime,
          'ms',
          {
            callback: callbackName,
            call_count: callCount.current.toString(),
            recreate_count: recreateCount.current.toString()
          }
        );
        
        return result;
      } catch (error) {
        monitoringService.recordError(
          error as Error,
          `callback_error_${callbackName}`
        );
        throw error;
      }
    }) as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callbackName, callback, ...deps]
  );
}

/**
 * Hook to monitor memo performance
 */
export function useMemoMonitor<T>(
  memoName: string,
  factory: () => T,
  deps: DependencyList
): T {
  const computeCount = useRef(0);
  const previousDeps = useRef<DependencyList>();
  const previousValue = useRef<T>();

  // Check if dependencies changed
  const depsChanged = !previousDeps.current || 
    deps.length !== previousDeps.current.length ||
    deps.some((dep, i) => dep !== previousDeps.current![i]);

  if (depsChanged) {
    computeCount.current += 1;
    previousDeps.current = [...deps];
    
    const timer = monitoringService.createTimer();
    const value = factory();
    const computeTime = timer.end();
    
    monitoringService.recordCustomMetric(
      'memo_compute_time',
      computeTime,
      'ms',
      {
        memo: memoName,
        compute_count: computeCount.current.toString()
      }
    );
    
    previousValue.current = value;
  }

  return previousValue.current!;
}

/**
 * Hook to monitor state updates
 */
export function useStateMonitor<T>(
  stateName: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setStateOriginal] = React.useState(initialValue);
  const updateCount = useRef(0);
  const previousValue = useRef<T>(initialValue);

  const setState = useCallback(
    (value: T | ((prev: T) => T)) => {
      updateCount.current += 1;
      const timer = monitoringService.createTimer();
      
      setStateOriginal((prev) => {
        const newValue = typeof value === 'function' 
          ? (value as (prev: T) => T)(prev) 
          : value;
        
        const updateTime = timer.end();
        const valueChanged = newValue !== prev;
        
        monitoringService.recordCustomMetric(
          'state_update_time',
          updateTime,
          'ms',
          {
            state: stateName,
            update_count: updateCount.current.toString(),
            value_changed: valueChanged.toString()
          }
        );
        
        previousValue.current = newValue;
        return newValue;
      });
    },
    [stateName]
  );

  return [state, setState];
}

/**
 * Hook to detect unnecessary re-renders
 */
export function useRenderReason(
  componentName: string,
  props: Record<string, unknown>
) {
  const previousProps = useRef<Record<string, unknown>>();
  const renderReasons = useRef<string[]>([]);

  useEffect(() => {
    if (previousProps.current) {
      const reasons: string[] = [];
      
      // Check which props changed
      Object.keys(props).forEach(key => {
        if (props[key] !== previousProps.current![key]) {
          reasons.push(`prop.${key}`);
        }
      });
      
      // Check for removed props
      Object.keys(previousProps.current).forEach(key => {
        if (!(key in props)) {
          reasons.push(`prop.${key} (removed)`);
        }
      });
      
      if (reasons.length > 0) {
        renderReasons.current = reasons;
        monitoringService.recordCustomMetric(
          'render_reason',
          reasons.length,
          'count',
          {
            component: componentName,
            reasons: reasons.join(', ')
          }
        );
      }
    }
    
    previousProps.current = { ...props };
  });

  return renderReasons.current;
}

/**
 * Hook to monitor API call performance
 */
export function useApiCallMonitor<T extends (...args: unknown[]) => Promise<unknown>>(
  apiName: string,
  apiCall: T
): T {
  const callCount = useRef(0);
  const errorCount = useRef(0);

  return useCallback(
    (async (...args: Parameters<T>) => {
      callCount.current += 1;
      const requestId = monitoringService.startApiRequest(apiName, 'CUSTOM');
      const startTime = Date.now();
      
      try {
        const result = await apiCall(...args);
        
        monitoringService.endApiRequest(
          requestId,
          apiName,
          'CUSTOM',
          startTime,
          200
        );
        
        return result;
      } catch (error) {
        errorCount.current += 1;
        monitoringService.recordApiError(
          apiName,
          'CUSTOM',
          startTime,
          error as Error
        );
        
        monitoringService.recordCustomMetric(
          'api_error_rate',
          (errorCount.current / callCount.current) * 100,
          'percent',
          { api: apiName }
        );
        
        throw error;
      }
    }) as T,
    [apiName, apiCall]
  );
}

/**
 * Hook to monitor memory usage
 */
export function useMemoryMonitor(interval: number = 5000) {
  useEffect(() => {
    const checkMemory = () => {
      monitoringService.recordMemoryUsage();
    };
    
    // Initial check
    checkMemory();
    
    // Set up interval
    const intervalId = setInterval(checkMemory, interval);
    
    return () => clearInterval(intervalId);
  }, [interval]);
}

/**
 * Hook to create performance marks
 */
export function usePerformanceMark(markName: string) {
  const markRef = useRef<string>();

  const startMark = useCallback(() => {
    const uniqueMark = `${markName}_${Date.now()}`;
    performance.mark(uniqueMark);
    markRef.current = uniqueMark;
    return uniqueMark;
  }, [markName]);

  const endMark = useCallback((metadata?: Record<string, string>) => {
    if (!markRef.current) return;
    
    const endMarkName = `${markRef.current}_end`;
    performance.mark(endMarkName);
    
    try {
      performance.measure(markName, markRef.current, endMarkName);
      const measure = performance.getEntriesByName(markName).pop() as PerformanceMeasure;
      
      if (measure) {
        monitoringService.recordCustomMetric(
          'performance_mark',
          measure.duration,
          'ms',
          {
            mark: markName,
            ...metadata
          }
        );
      }
    } finally {
      // Clean up marks
      performance.clearMarks(markRef.current);
      performance.clearMarks(endMarkName);
      performance.clearMeasures(markName);
      markRef.current = undefined;
    }
  }, [markName]);

  return { startMark, endMark };
}

/**
 * Hook to monitor long tasks
 */
export function useLongTaskMonitor(threshold: number = 50) {
  useEffect(() => {
    if (!('PerformanceObserver' in window)) return;
    
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > threshold) {
          monitoringService.recordCustomMetric(
            'long_task',
            entry.duration,
            'ms',
            {
              task_name: entry.name,
              start_time: entry.startTime.toString()
            }
          );
        }
      }
    });
    
    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch (_e) {
      // Long task monitoring not supported
      console.debug('Long task monitoring not supported');
    }
    
    return () => observer.disconnect();
  }, [threshold]);
}

// Import React for hooks
import * as React from 'react';