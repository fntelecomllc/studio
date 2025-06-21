// src/lib/api/monitored-api-client.ts
// API Client with Integrated Performance Monitoring

import { apiClient, type RequestOptions } from './client';
import { monitoringService } from '@/lib/monitoring/monitoring-service';
import type { ApiResponse } from '@/lib/types';

class MonitoredApiClient {
  private static instance: MonitoredApiClient;

  static getInstance(): MonitoredApiClient {
    if (!MonitoredApiClient.instance) {
      MonitoredApiClient.instance = new MonitoredApiClient();
    }
    return MonitoredApiClient.instance;
  }

  private async executeWithMonitoring<T>(
    operation: () => Promise<ApiResponse<T>>,
    url: string,
    method: string
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const requestId = monitoringService.startApiRequest(url, method);

    try {
      const response = await operation();
      
      // Determine status from response
      const status = response.status === 'success' ? 200 : 
                    response.status === 'error' ? 500 : 400;
      
      monitoringService.endApiRequest(requestId, url, method, startTime, status);
      
      return response;
    } catch {
      monitoringService.recordApiError(url, method, startTime, error as Error);
      throw error;
    }
  }

  async get<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.executeWithMonitoring(
      () => apiClient.get<T>(endpoint, options),
      endpoint,
      'GET'
    );
  }

  async post<T>(
    endpoint: string, 
    body?: RequestOptions['body'], 
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.executeWithMonitoring(
      () => apiClient.post<T>(endpoint, body, options),
      endpoint,
      'POST'
    );
  }

  async put<T>(
    endpoint: string, 
    body?: RequestOptions['body'], 
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.executeWithMonitoring(
      () => apiClient.put<T>(endpoint, body, options),
      endpoint,
      'PUT'
    );
  }

  async patch<T>(
    endpoint: string, 
    body?: RequestOptions['body'], 
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ): Promise<ApiResponse<T>> {
    return this.executeWithMonitoring(
      () => apiClient.patch<T>(endpoint, body, options),
      endpoint,
      'PATCH'
    );
  }

  async delete<T>(endpoint: string, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.executeWithMonitoring(
      () => apiClient.delete<T>(endpoint, options),
      endpoint,
      'DELETE'
    );
  }
}

// Export singleton instance
export const monitoredApiClient = MonitoredApiClient.getInstance();
export default monitoredApiClient;
