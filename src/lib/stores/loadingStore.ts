/**
 * Centralized Loading State Management
 * 
 * Provides global state management for tracking async operations
 * across the entire application. Supports multiple concurrent
 * loading states with automatic cleanup.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type LoadingStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface LoadingState {
  status: LoadingStatus;
  message?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface LoadingStore {
  // State
  operations: Map<string, LoadingState>;
  globalLoading: boolean;
  
  // Actions
  startLoading: (operationId: string, message?: string) => void;
  stopLoading: (operationId: string, status?: 'succeeded' | 'failed', error?: string) => void;
  setError: (operationId: string, error: string) => void;
  clearOperation: (operationId: string) => void;
  clearAllOperations: () => void;
  
  // Selectors
  isLoading: (operationId: string) => boolean;
  getOperation: (operationId: string) => LoadingState | undefined;
  hasAnyLoading: () => boolean;
  getLoadingOperations: () => string[];
}

export const useLoadingStore = create<LoadingStore>()(
  devtools(
    (set, get) => ({
      operations: new Map(),
      globalLoading: false,

      startLoading: (operationId: string, message?: string) => {
        set((state) => {
          const newOperations = new Map(state.operations);
          newOperations.set(operationId, {
            status: 'loading',
            message,
            startedAt: Date.now(),
          });
          
          return {
            operations: newOperations,
            globalLoading: newOperations.size > 0,
          };
        });
      },

      stopLoading: (operationId: string, status: 'succeeded' | 'failed' = 'succeeded', error?: string) => {
        set((state) => {
          const newOperations = new Map(state.operations);
          const existingOperation = newOperations.get(operationId);
          
          if (existingOperation) {
            newOperations.set(operationId, {
              ...existingOperation,
              status,
              error,
              finishedAt: Date.now(),
            });
          }
          
          // Auto-cleanup successful operations after a short delay
          if (status === 'succeeded') {
            setTimeout(() => {
              get().clearOperation(operationId);
            }, 1000);
          }
          
          return {
            operations: newOperations,
            globalLoading: Array.from(newOperations.values()).some(op => op.status === 'loading'),
          };
        });
      },

      setError: (operationId: string, error: string) => {
        get().stopLoading(operationId, 'failed', error);
      },

      clearOperation: (operationId: string) => {
        set((state) => {
          const newOperations = new Map(state.operations);
          newOperations.delete(operationId);
          
          return {
            operations: newOperations,
            globalLoading: Array.from(newOperations.values()).some(op => op.status === 'loading'),
          };
        });
      },

      clearAllOperations: () => {
        set({
          operations: new Map(),
          globalLoading: false,
        });
      },

      // Selectors
      isLoading: (operationId: string) => {
        const operation = get().operations.get(operationId);
        return operation?.status === 'loading';
      },

      getOperation: (operationId: string) => {
        return get().operations.get(operationId);
      },

      hasAnyLoading: () => {
        return Array.from(get().operations.values()).some(op => op.status === 'loading');
      },

      getLoadingOperations: () => {
        return Array.from(get().operations.entries())
          .filter(([_, operation]) => operation.status === 'loading')
          .map(([id, _]) => id);
      },
    }),
    {
      name: 'loading-store',
    }
  )
);

// Predefined operation IDs for common operations
export const LOADING_OPERATIONS = {
  // Authentication
  LOGIN: 'auth.login',
  LOGOUT: 'auth.logout',
  SESSION_REFRESH: 'auth.session_refresh',
  
  // Campaigns
  FETCH_CAMPAIGNS: 'campaigns.fetch',
  CREATE_CAMPAIGN: 'campaigns.create',
  UPDATE_CAMPAIGN: 'campaigns.update',
  DELETE_CAMPAIGN: 'campaigns.delete',
  FETCH_CAMPAIGN_DETAILS: 'campaigns.fetch_details',
  
  // Personas
  FETCH_PERSONAS: 'personas.fetch',
  FETCH_HTTP_PERSONAS: 'personas.fetch_http',
  FETCH_DNS_PERSONAS: 'personas.fetch_dns',
  CREATE_PERSONA: 'personas.create',
  UPDATE_PERSONA: 'personas.update',
  DELETE_PERSONA: 'personas.delete',
  
  // Proxies
  FETCH_PROXIES: 'proxies.fetch',
  CREATE_PROXY: 'proxies.create',
  UPDATE_PROXY: 'proxies.update',
  DELETE_PROXY: 'proxies.delete',
  TEST_PROXY: 'proxies.test',
  
  // Keywords
  FETCH_KEYWORD_SETS: 'keywords.fetch_sets',
  CREATE_KEYWORD_SET: 'keywords.create_set',
  UPDATE_KEYWORD_SET: 'keywords.update_set',
  DELETE_KEYWORD_SET: 'keywords.delete_set',
  
  // Dashboard
  FETCH_DASHBOARD_DATA: 'dashboard.fetch_data',
  
  // File uploads
  UPLOAD_FILE: 'files.upload',
} as const;

// Convenience hooks for common operations
export const useAuthLoading = () => {
  const isLoginLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.LOGIN));
  const isLogoutLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.LOGOUT));
  const isSessionRefreshLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.SESSION_REFRESH));
  
  return {
    isLoginLoading,
    isLogoutLoading,
    isSessionRefreshLoading,
    isAnyAuthLoading: isLoginLoading || isLogoutLoading || isSessionRefreshLoading,
  };
};

export const useCampaignLoading = () => {
  const isFetchLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.FETCH_CAMPAIGNS));
  const isCreateLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.CREATE_CAMPAIGN));
  const isUpdateLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.UPDATE_CAMPAIGN));
  const isDeleteLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.DELETE_CAMPAIGN));
  const isFetchDetailsLoading = useLoadingStore(state => state.isLoading(LOADING_OPERATIONS.FETCH_CAMPAIGN_DETAILS));
  
  return {
    isFetchLoading,
    isCreateLoading,
    isUpdateLoading,
    isDeleteLoading,
    isFetchDetailsLoading,
    isAnyCampaignLoading: isFetchLoading || isCreateLoading || isUpdateLoading || isDeleteLoading || isFetchDetailsLoading,
  };
};

export const useGlobalLoading = () => {
  return useLoadingStore(state => state.globalLoading);
};
