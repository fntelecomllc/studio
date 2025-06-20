/**
 * Memoization utilities for performance optimization
 * 
 * Provides various memoization strategies to reduce expensive computations
 * and improve React component performance
 */

import React, { DependencyList, useRef, useCallback } from 'react';

/**
 * Deep comparison of two values
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Custom hook for deep memoization
 * Unlike useMemo, this performs deep comparison of dependencies
 */
export function useDeepMemo<T>(factory: () => T, deps: DependencyList): T {
  const ref = useRef<{
    deps: DependencyList;
    value: T;
  }>();
  
  if (!ref.current || !deepEqual(ref.current.deps, deps)) {
    ref.current = {
      deps,
      value: factory()
    };
  }
  
  return ref.current.value;
}

/**
 * Custom hook for deep callback memoization
 * Unlike useCallback, this performs deep comparison of dependencies
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDeepCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: DependencyList
): T {
  return useDeepMemo(() => callback, deps);
}

/**
 * Function memoization with configurable cache
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memoize<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult,
  options?: {
    maxCacheSize?: number;
    cacheKeyFn?: (...args: TArgs) => string;
    ttl?: number; // Time to live in milliseconds
  }
): (...args: TArgs) => TResult {
  const cache = new Map<string, { value: TResult; timestamp: number }>();
  const maxCacheSize = options?.maxCacheSize ?? 100;
  const ttl = options?.ttl;
  const cacheKeyFn = options?.cacheKeyFn ?? ((...args) => JSON.stringify(args));
  
  return (...args: TArgs): TResult => {
    const key = cacheKeyFn(...args);
    const cached = cache.get(key);
    const now = Date.now();
    
    if (cached) {
      if (!ttl || now - cached.timestamp < ttl) {
        return cached.value;
      }
    }
    
    const result = fn(...args);
    cache.set(key, { value: result, timestamp: now });
    
    // Limit cache size
    if (cache.size > maxCacheSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
    
    return result;
  };
}

/**
 * Memoize async functions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memoizeAsync<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: {
    maxCacheSize?: number;
    cacheKeyFn?: (...args: TArgs) => string;
    ttl?: number;
    onError?: (error: Error) => void;
  }
): (...args: TArgs) => Promise<TResult> {
  const cache = new Map<string, { promise: Promise<TResult>; timestamp: number }>();
  const maxCacheSize = options?.maxCacheSize ?? 100;
  const ttl = options?.ttl;
  const cacheKeyFn = options?.cacheKeyFn ?? ((...args) => JSON.stringify(args));
  
  return async (...args: TArgs): Promise<TResult> => {
    const key = cacheKeyFn(...args);
    const cached = cache.get(key);
    const now = Date.now();
    
    if (cached) {
      if (!ttl || now - cached.timestamp < ttl) {
        return cached.promise;
      }
    }
    
    const promise = fn(...args).catch(error => {
      // Remove from cache on error
      cache.delete(key);
      options?.onError?.(error);
      throw error;
    });
    
    cache.set(key, { promise, timestamp: now });
    
    // Limit cache size
    if (cache.size > maxCacheSize) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) {
        cache.delete(firstKey);
      }
    }
    
    return promise;
  };
}

/**
 * Debounce hook for expensive operations
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

/**
 * Throttle hook for rate-limiting operations
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastExecuted = useRef(Date.now());
  
  React.useEffect(() => {
    if (Date.now() >= lastExecuted.current + interval) {
      lastExecuted.current = Date.now();
      setThrottledValue(value);
      return; // Explicitly return undefined
    } else {
      const timer = setTimeout(() => {
        lastExecuted.current = Date.now();
        setThrottledValue(value);
      }, interval);
      
      return () => clearTimeout(timer);
    }
  }, [value, interval]);
  
  return throttledValue;
}

/**
 * Memoize component props to prevent unnecessary re-renders
 */
export function useMemoizedProps<T extends Record<string, unknown>>(
  props: T,
  compareFn?: (prev: T, next: T) => boolean
): T {
  const ref = useRef<T>(props);
  
  const isEqual = compareFn || deepEqual;
  
  if (!isEqual(ref.current, props)) {
    ref.current = props;
  }
  
  return ref.current;
}

/**
 * Memoize expensive computations with dependencies
 */
export function useComputedValue<T, TDeps extends DependencyList>(
  computeFn: (deps: TDeps) => T,
  deps: TDeps,
  compareFn?: (prev: TDeps, next: TDeps) => boolean
): T {
  const depsRef = useRef<TDeps>(deps);
  const valueRef = useRef<T>();
  const isEqual = compareFn || deepEqual;
  
  if (!isEqual(depsRef.current, deps) || valueRef.current === undefined) {
    depsRef.current = deps;
    valueRef.current = computeFn(deps);
  }
  
  return valueRef.current;
}

/**
 * Create a memoized selector for complex state derivations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSelector<TState, TResult, TDeps extends any[]>(
  selectFn: (state: TState, ...args: TDeps) => TResult,
  equalityFn?: (a: TResult, b: TResult) => boolean
): (state: TState, ...args: TDeps) => TResult {
  let lastState: TState;
  let lastArgs: TDeps;
  let lastResult: TResult;
  const isEqual = equalityFn || deepEqual;
  
  return (state: TState, ...args: TDeps): TResult => {
    if (
      lastState === state &&
      lastArgs &&
      args.length === lastArgs.length &&
      args.every((arg, i) => arg === lastArgs[i])
    ) {
      return lastResult;
    }
    
    const newResult = selectFn(state, ...args);
    
    if (!isEqual(newResult, lastResult)) {
      lastResult = newResult;
    }
    
    lastState = state;
    lastArgs = args;
    
    return lastResult;
  };
}

/**
 * Batch updates to reduce re-renders
 */
export function useBatchedState<T>(
  initialState: T
): [T, (updater: (prev: T) => T) => void, () => void] {
  const [state, setState] = React.useState(initialState);
  const pendingUpdates = useRef<Array<(prev: T) => T>>([]);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  const batchedSetState = useCallback((updater: (prev: T) => T) => {
    pendingUpdates.current.push(updater);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setState(prevState => {
        let newState = prevState;
        for (const update of pendingUpdates.current) {
          newState = update(newState);
        }
        pendingUpdates.current = [];
        return newState;
      });
    }, 0);
  }, []);
  
  const flush = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    if (pendingUpdates.current.length > 0) {
      setState(prevState => {
        let newState = prevState;
        for (const update of pendingUpdates.current) {
          newState = update(newState);
        }
        pendingUpdates.current = [];
        return newState;
      });
    }
  }, []);
  
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return [state, batchedSetState, flush];
}