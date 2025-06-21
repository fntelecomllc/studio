/**
 * Async Operation Hooks
 * 
 * Provides convenient hooks for managing async operations
 * with automatic loading state integration.
 */

import { useCallback } from 'react';
import { useLoadingStore } from '@/lib/stores/loadingStore';

/**
 * Hook for managing a single async operation with loading state
 */
export function useAsyncOperation(operationId: string) {
  const { startLoading, stopLoading, setError, isLoading, getOperation } = useLoadingStore();
  
  const execute = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    loadingMessage?: string
  ): Promise<T> => {
    try {
      startLoading(operationId, loadingMessage);
      const result = await asyncFn();
      stopLoading(operationId, 'succeeded');
      return result;
    } catch {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(operationId, errorMessage);
      throw error;
    }
  }, [operationId, startLoading, stopLoading, setError]);

  return {
    execute,
    isLoading: isLoading(operationId),
    operation: getOperation(operationId),
  };
}

/**
 * Hook for managing multiple related async operations
 */
export function useAsyncOperations(baseOperationId: string) {
  const { startLoading, stopLoading, setError, isLoading: storeIsLoading, getLoadingOperations } = useLoadingStore();
  
  const execute = useCallback(async <T>(
    subOperationId: string,
    asyncFn: () => Promise<T>,
    loadingMessage?: string
  ): Promise<T> => {
    const fullOperationId = `${baseOperationId}.${subOperationId}`;
    
    try {
      startLoading(fullOperationId, loadingMessage);
      const result = await asyncFn();
      stopLoading(fullOperationId, 'succeeded');
      return result;
    } catch {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(fullOperationId, errorMessage);
      throw error;
    }
  }, [baseOperationId, startLoading, stopLoading, setError]);

  const isLoading = useCallback((subOperationId: string) => {
    const fullOperationId = `${baseOperationId}.${subOperationId}`;
    return storeIsLoading(fullOperationId);
  }, [baseOperationId, storeIsLoading]);

  const hasAnyLoading = useCallback(() => {
    const loadingOperations = getLoadingOperations();
    return loadingOperations.some((operationId: string) => 
      operationId.startsWith(`${baseOperationId}.`)
    );
  }, [baseOperationId, getLoadingOperations]);

  return {
    execute,
    isLoading,
    hasAnyLoading,
  };
}

/**
 * Hook for API calls with automatic loading state management
 */
export function useApiCall<T = unknown>(operationId: string) {
  const asyncOp = useAsyncOperation(operationId);

  const call = useCallback(async (
    apiFunction: () => Promise<T>,
    options?: {
      loadingMessage?: string;
      onSuccess?: (result: T) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<T | undefined> => {
    try {
      const result = await asyncOp.execute(apiFunction, options?.loadingMessage);
      options?.onSuccess?.(result);
      return result;
    } catch {
      const err = error instanceof Error ? error : new Error('Unknown error');
      options?.onError?.(err);
      return undefined;
    }
  }, [asyncOp]);

  return {
    call,
    isLoading: asyncOp.isLoading,
    operation: asyncOp.operation,
  };
}

/**
 * Hook for form submissions with loading state
 */
export function useFormSubmission(operationId: string) {
  const asyncOp = useAsyncOperation(operationId);

  const submit = useCallback(async <TData, TResult>(
    submitFunction: (data: TData) => Promise<TResult>,
    data: TData,
    options?: {
      loadingMessage?: string;
      onSuccess?: (result: TResult) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<boolean> => {
    try {
      const result = await asyncOp.execute(
        () => submitFunction(data),
        options?.loadingMessage || 'Submitting...'
      );
      options?.onSuccess?.(result);
      return true;
    } catch {
      const err = error instanceof Error ? error : new Error('Submission failed');
      options?.onError?.(err);
      return false;
    }
  }, [asyncOp]);

  return {
    submit,
    isSubmitting: asyncOp.isLoading,
    operation: asyncOp.operation,
  };
}

/**
 * Hook for data fetching with loading state
 */
export function useDataFetch<T>(operationId: string) {
  const asyncOp = useAsyncOperation(operationId);

  const fetch = useCallback(async (
    fetchFunction: () => Promise<T>,
    options?: {
      loadingMessage?: string;
      onSuccess?: (data: T) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<T | undefined> => {
    try {
      const data = await asyncOp.execute(
        fetchFunction,
        options?.loadingMessage || 'Loading...'
      );
      options?.onSuccess?.(data);
      return data;
    } catch {
      const err = error instanceof Error ? error : new Error('Failed to load data');
      options?.onError?.(err);
      return undefined;
    }
  }, [asyncOp]);

  return {
    fetch,
    isLoading: asyncOp.isLoading,
    operation: asyncOp.operation,
  };
}
