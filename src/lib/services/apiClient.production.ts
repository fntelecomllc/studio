// src/lib/services/apiClient.ts
// Production API Client - Consolidated, secure, production-ready
// Replaces apiClient.ts, secureApiClient.ts, enhancedApiClient.ts
// Phase 2.3: Updated to handle unified error response format

import type { ApiResponse } from '@/lib/types';
import { getApiConfig } from '@/lib/config/environment';

// Unified error response types matching backend
interface UnifiedErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      field?: string;
      code: string;
      message: string;
      context?: unknown;
    }>;
    timestamp: string;
    path?: string;
  };
  request_id: string;
}

interface UnifiedSuccessResponse<T = unknown> {
  success: true;
  data: T;
  metadata?: {
    page?: {
      current: number;
      total: number;
      page_size: number;
      count: number;
    };
    rate_limit?: {
      limit: number;
      remaining: number;
      reset: string;
    };
    processing?: {
      duration: string;
      version: string;
    };
    extra?: Record<string, unknown>;
  };
  request_id: string;
}

// Note: This type is used internally for type checking but not directly exported
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type UnifiedApiResponse<T = unknown> = UnifiedSuccessResponse<T> | UnifiedErrorResponse;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | null | undefined>;
  body?: Record<string, unknown> | FormData | string | null;
  timeout?: number;
  retries?: number;
  skipAuth?: boolean;
}

class ProductionApiClient {
  private baseUrl: string;
  private static instance: ProductionApiClient;

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl;
  }

  static getInstance(baseUrl: string = ''): ProductionApiClient {
    if (!ProductionApiClient.instance) {
      ProductionApiClient.instance = new ProductionApiClient(baseUrl);
    }
    return ProductionApiClient.instance;
  }


  /**
   * Generic request method with retry logic and security
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const {
      params,
      body,
      timeout = 30000,
      retries = 2,
      headers = {},
      ...fetchOptions
    } = options;

    // Build URL
    const url = new URL(endpoint, this.baseUrl || window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }

    // Prepare headers
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
      ...(typeof headers === 'object' && headers !== null ? headers as Record<string, string> : {}),
    };

    // Prepare request config with credentials for cookie-based auth
    const config: RequestInit = {
      ...fetchOptions,
      headers: requestHeaders,
      credentials: 'include', // Include cookies in the request
    };

    // Handle body
    if (body !== undefined) {
      if (body instanceof FormData) {
        delete requestHeaders['Content-Type']; // Let browser set with boundary
        config.body = body;
      } else if (typeof body === 'string') {
        config.body = body;
      } else {
        config.body = JSON.stringify(body);
      }
    }

    // Add timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    config.signal = controller.signal;

    let lastError: Error | null = null;

    // Retry logic with exponential backoff
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url.toString(), config);
        clearTimeout(timeoutId);

        // Handle authentication errors
        if (response.status === 401) {
          return {
            status: 'error',
            message: 'Authentication required',
          };
        }

        // Handle session-based access errors
        if (response.status === 403) {
          return {
            status: 'error',
            message: 'Access forbidden. Please try logging in again.',
          };
        }

        if (!response.ok) {
          let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          let errorDetails: Array<{ field?: string; message: string }> = [];
          
          // Try to get error details from response
          try {
            const errorBody = await response.text();
            if (errorBody) {
              const errorData = JSON.parse(errorBody);
              
              // Handle unified error format
              if (errorData.success === false && errorData.error) {
                const unifiedError = errorData as UnifiedErrorResponse;
                errorMessage = unifiedError.error.message;
                
                // Extract field-specific errors
                if (unifiedError.error.details) {
                  errorDetails = unifiedError.error.details.map(detail => ({
                    field: detail.field,
                    message: detail.message
                  }));
                }
                
                // Log error with request ID for debugging
                console.error(`API Error [${unifiedError.request_id}]:`, unifiedError.error);
              }
              // Handle legacy error formats
              else if (errorData.error) {
                errorMessage = errorData.error;
              } else if (errorData.message) {
                errorMessage = errorData.message;
              } else if (errorData.errors && Array.isArray(errorData.errors)) {
                // Legacy array format
                errorMessage = errorData.errors[0]?.message || errorData.errors[0]?.error || errorMessage;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                errorDetails = errorData.errors.map((e: any) => ({
                  field: e.field,
                  message: e.message || e.error
                }));
              }
            }
          } catch {
            // Ignore parsing errors, use default message
          }

          const apiResponse: ApiResponse<T> = {
            status: 'error',
            message: errorMessage,
          };
          
          // Add error details if available
          if (errorDetails.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (apiResponse as any).errors = errorDetails;
          }
          
          return apiResponse;
        }

        // Parse successful response
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
          const responseData = await response.json();
          
          // Handle unified success format
          if (responseData.success === true && 'data' in responseData) {
            const unifiedResponse = responseData as UnifiedSuccessResponse<T>;
            
            // Extract metadata if available
            const apiResponse: ApiResponse<T> = {
              status: 'success',
              data: unifiedResponse.data,
              message: 'Request successful',
            };
            
            // Add metadata if present
            if (unifiedResponse.metadata) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (apiResponse as any).metadata = unifiedResponse.metadata;
            }
            
            return apiResponse;
          }
          
          // Handle legacy format - assume direct data response
          return {
            status: 'success',
            data: responseData as T,
            message: 'Request successful',
          };
        } else {
          const data = await response.text();
          return {
            status: 'success',
            data: data as T,
            message: 'Request successful',
          };
        }
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on abort or certain errors
        if (attempt < retries && 
            error instanceof Error && 
            error.name !== 'AbortError' &&
            !error.message.includes('Failed to fetch')) {
          // Exponential backoff
          await new Promise(resolve => 
            setTimeout(resolve, Math.pow(2, attempt) * 1000 + Math.random() * 1000)
          );
          continue;
        }
        
        clearTimeout(timeoutId);
        break;
      }
    }

    return {
      status: 'error',
      message: lastError?.message || 'Network request failed',
    };
  }


  // Convenience methods
  get<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  post<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  put<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  patch<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  delete<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// Export singleton instance with lazy environment-based base URL
// This avoids HMR issues by not importing environment config at module load time
let _apiClient: ProductionApiClient | null = null;

export const apiClient = {
  get<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    if (!_apiClient) {
      const apiConfig = getApiConfig();
      _apiClient = ProductionApiClient.getInstance(apiConfig.baseUrl);
    }
    return _apiClient.get<T>(endpoint, options);
  },
  
  post<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    if (!_apiClient) {
      const apiConfig = getApiConfig();
      _apiClient = ProductionApiClient.getInstance(apiConfig.baseUrl);
    }
    return _apiClient.post<T>(endpoint, body, options);
  },
  
  put<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    if (!_apiClient) {
      const apiConfig = getApiConfig();
      _apiClient = ProductionApiClient.getInstance(apiConfig.baseUrl);
    }
    return _apiClient.put<T>(endpoint, body, options);
  },
  
  patch<T>(endpoint: string, body?: RequestOptions['body'], options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    if (!_apiClient) {
      const apiConfig = getApiConfig();
      _apiClient = ProductionApiClient.getInstance(apiConfig.baseUrl);
    }
    return _apiClient.patch<T>(endpoint, body, options);
  },
  
  delete<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    if (!_apiClient) {
      const apiConfig = getApiConfig();
      _apiClient = ProductionApiClient.getInstance(apiConfig.baseUrl);
    }
    return _apiClient.delete<T>(endpoint, options);
  },
  
};

export default apiClient;

export type DiagnosticApiClientMethods = {
  get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>>;
  post<T>(endpoint: string, body?: RequestOptions['body'], options?: RequestOptions): Promise<ApiResponse<T>>;
  put<T>(endpoint: string, body?: RequestOptions['body'], options?: RequestOptions): Promise<ApiResponse<T>>;
  delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>>;
};

export const diagnosticApiClient: DiagnosticApiClientMethods = {
  async get<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const apiConfig = getApiConfig();
    return ProductionApiClient.getInstance(apiConfig.baseUrl).request<T>(endpoint, { ...options, method: 'GET' });
  },
  async post<T>(endpoint: string, body?: RequestOptions['body'], options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const apiConfig = getApiConfig();
    return ProductionApiClient.getInstance(apiConfig.baseUrl).request<T>(endpoint, { ...options, body, method: 'POST' });
  },
  async put<T>(endpoint: string, body?: RequestOptions['body'], options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const apiConfig = getApiConfig();
    return ProductionApiClient.getInstance(apiConfig.baseUrl).request<T>(endpoint, { ...options, body, method: 'PUT' });
  },
  async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const apiConfig = getApiConfig();
    return ProductionApiClient.getInstance(apiConfig.baseUrl).request<T>(endpoint, { ...options, method: 'DELETE' });
  },
};
