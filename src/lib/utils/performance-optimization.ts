/**
 * Performance optimization utilities for React components
 * Provides consistent patterns for memoization and rendering optimizations
 */

import { useCallback, useMemo, useRef } from 'react';

/**
 * Creates a stable object reference that only updates when specific properties change
 * Useful for optimizing useEffect dependencies and preventing unnecessary re-renders
 */
export function useStableObject<T extends Record<string, unknown>>(obj: T): T {
  const objRef = useRef<T>();
  
  return useMemo(() => {
    if (!objRef.current) {
      objRef.current = obj;
      return obj;
    }
    
    // Check if any properties have changed
    const hasChanged = Object.keys(obj).some(key => obj[key] !== objRef.current![key]) ||
                      Object.keys(objRef.current).some(key => !(key in obj));
    
    if (hasChanged) {
      objRef.current = obj;
    }
    
    return objRef.current;
  }, [obj]);
}

/**
 * Debounced callback hook for performance optimization
 * Prevents excessive function calls during rapid state changes
 */
export function useDebouncedCallback<T extends unknown[]>(
  callback: (...args: T) => void,
  delay: number,
  deps: React.DependencyList
) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  return useCallback((...args: T) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback, delay, ...deps]);
}

/**
 * Memoized formatter functions for common display patterns
 */
export const formatters = {
  /**
   * Memoized date formatter with consistent locale settings
   */
  formatDate: (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Invalid Date';
    }
  },

  /**
   * Memoized time formatter
   */
  formatTime: (date: Date): string => {
    return date.toLocaleTimeString();
  },

  /**
   * Memoized percentage formatter
   */
  formatPercentage: (value: number): string => {
    return `${Math.round(value)}%`;
  },

  /**
   * Memoized number formatter with locale settings
   */
  formatNumber: (value: number): string => {
    return value.toLocaleString();
  }
};

/**
 * Performance monitoring hook for component render tracking
 * Useful for identifying performance bottlenecks in development
 */
export function useRenderTracking(componentName: string, props?: Record<string, unknown>) {
  const renderCountRef = useRef(0);
  const propsRef = useRef(props);
  
  if (process.env.NODE_ENV === 'development') {
    renderCountRef.current += 1;
    
    if (props && JSON.stringify(props) !== JSON.stringify(propsRef.current)) {
      console.log(`[Performance] ${componentName} re-rendered (${renderCountRef.current}) due to prop changes:`, {
        previous: propsRef.current,
        current: props
      });
      propsRef.current = props;
    }
  }
  
  return renderCountRef.current;
}

/**
 * Creates a memoized comparison function for React.memo
 * Useful for components with complex props
 */
export function createMemoComparison<T extends Record<string, unknown>>(
  keysToCompare?: (keyof T)[]
) {
  return (prevProps: T, nextProps: T): boolean => {
    if (keysToCompare) {
      // Only compare specified keys
      return keysToCompare.every(key => prevProps[key] === nextProps[key]);
    }
    
    // Shallow comparison of all keys
    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);
    
    if (prevKeys.length !== nextKeys.length) {
      return false;
    }
    
    return prevKeys.every(key => prevProps[key] === nextProps[key]);
  };
}

/**
 * Hook for optimizing list rendering with stable keys
 * Prevents unnecessary re-renders of list items
 */
export function useStableKeys<T>(items: T[], keyExtractor: (item: T, index: number) => string) {
  return useMemo(() => {
    return items.map((item, index) => ({
      key: keyExtractor(item, index),
      item,
      index
    }));
  }, [items, keyExtractor]);
}

/**
 * Performance budget constants for component optimization
 */
export const PERFORMANCE_BUDGETS = {
  // Maximum number of re-renders before warning
  MAX_RENDERS_PER_SECOND: 60,
  
  // Debounce delays for different scenarios
  DEBOUNCE_DELAYS: {
    SEARCH_INPUT: 300,
    FORM_VALIDATION: 150,
    API_CALLS: 500,
    UI_UPDATES: 100
  },
  
  // Thresholds for component complexity
  COMPLEXITY_THRESHOLDS: {
    MAX_PROPS: 20,
    MAX_CHILDREN: 100,
    MAX_EFFECT_DEPENDENCIES: 10
  }
} as const;

/**
 * Utility to check if a component should be memoized based on prop complexity
 */
export function shouldMemoizeComponent(propCount: number, hasExpensiveOperations: boolean): boolean {
  return propCount > 5 || hasExpensiveOperations;
}

/**
 * Hook for measuring component render performance
 */
export function usePerformanceMeasure(componentName: string) {
  const startTime = useRef<number>();
  
  // Always call hooks at the top level
  useMemo(() => {
    if (process.env.NODE_ENV !== 'development') {
      return null;
    }
    
    const endTime = performance.now();
    const renderTime = endTime - (startTime.current || 0);
    
    if (renderTime > 16) { // Longer than one frame at 60fps
      console.warn(`[Performance] ${componentName} took ${renderTime.toFixed(2)}ms to render`);
    }
    
    startTime.current = endTime;
    return renderTime;
  }, [componentName]);

  if (process.env.NODE_ENV === 'development') {
    if (!startTime.current) {
      startTime.current = performance.now();
    }
  }
}