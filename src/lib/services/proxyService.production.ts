// src/lib/services/proxyService.ts
// Production Proxy Service - Clean backend integration
// Replaces proxy logic scattered across multiple files

import apiClient from './apiClient.production';
import { TypeTransformer } from '@/lib/types/transform';
import type {
  Proxy,
  CreateProxyPayload,
  UpdateProxyPayload,
  ProxiesListResponse,
  ProxyCreationResponse,
  ProxyUpdateResponse,
  ProxyDeleteResponse,
  ProxyActionResponse,
} from '@/lib/types';

// Helper functions for type-safe proxy transformations
const transformProxy = (rawData: Record<string, unknown>): Proxy => {
  const transformed = TypeTransformer.transformToProxy(rawData);
  return transformed as unknown as Proxy;
};

const transformProxyArray = (rawArray: Record<string, unknown>[]): Proxy[] => {
  return rawArray.map(transformProxy);
};

class ProxyService {
  private static instance: ProxyService;

  static getInstance(): ProxyService {
    if (!ProxyService.instance) {
      ProxyService.instance = new ProxyService();
    }
    return ProxyService.instance;
  }

  async getProxies(): Promise<ProxiesListResponse> {
    const response = await apiClient.get<Proxy[]>('/api/v2/proxies');
    if (response.data && Array.isArray(response.data)) {
      response.data = transformProxyArray(response.data as unknown as Record<string, unknown>[]);
    }
    return response;
  }

  async getProxyById(proxyId: string): Promise<ProxyCreationResponse> {
    // Backend doesn't have individual GET endpoint, fetch from list
    const response = await this.getProxies();
    const proxy = response.data?.find(p => p.id === proxyId);
    
    if (!proxy) {
      throw new Error(`Proxy with ID ${proxyId} not found`);
    }
    
    return {
      status: 'success',
      data: transformProxy(proxy as unknown as Record<string, unknown>),
      message: 'Proxy retrieved successfully'
    };
  }

  async createProxy(payload: CreateProxyPayload): Promise<ProxyCreationResponse> {
    const response = await apiClient.post<Proxy>('/api/v2/proxies', payload as unknown as Record<string, unknown>);
    if (response.data) {
      response.data = transformProxy(response.data as unknown as Record<string, unknown>);
    }
    return response;
  }

  async updateProxy(proxyId: string, payload: UpdateProxyPayload): Promise<ProxyUpdateResponse> {
    const response = await apiClient.put<Proxy>(`/api/v2/proxies/${proxyId}`, payload as unknown as Record<string, unknown>);
    if (response.data) {
      response.data = transformProxy(response.data as unknown as Record<string, unknown>);
    }
    return response;
  }

  async deleteProxy(proxyId: string): Promise<ProxyDeleteResponse> {
    return apiClient.delete(`/api/v2/proxies/${proxyId}`);
  }

  async testProxy(proxyId: string): Promise<ProxyActionResponse> {
    return apiClient.post(`/api/v2/proxies/${proxyId}/test`);
  }

  // NOTE: Backend does not have enable/disable proxy endpoints
  // Proxy status should be managed through the update endpoint
  async enableProxy(_proxyId: string): Promise<ProxyActionResponse> {
    console.warn('Proxy enable/disable not available - use updateProxy with isEnabled: true instead');
    return {
      status: 'error',
      message: 'Proxy enable endpoint is not implemented in the backend. Use updateProxy instead.'
    };
  }

  async disableProxy(_proxyId: string): Promise<ProxyActionResponse> {
    console.warn('Proxy enable/disable not available - use updateProxy with isEnabled: false instead');
    return {
      status: 'error',
      message: 'Proxy disable endpoint is not implemented in the backend. Use updateProxy instead.'
    };
  }
}

// Export singleton and functions
export const proxyService = ProxyService.getInstance();

export const getProxies = () => proxyService.getProxies();
export const getProxyById = (proxyId: string) => proxyService.getProxyById(proxyId);
export const createProxy = (payload: CreateProxyPayload) => proxyService.createProxy(payload);
export const updateProxy = (proxyId: string, payload: UpdateProxyPayload) => proxyService.updateProxy(proxyId, payload);
export const deleteProxy = (proxyId: string) => proxyService.deleteProxy(proxyId);
export const testProxy = (proxyId: string) => proxyService.testProxy(proxyId);
export const enableProxy = (proxyId: string) => proxyService.enableProxy(proxyId);
export const disableProxy = (proxyId: string) => proxyService.disableProxy(proxyId);

// Bulk operations
export const testAllProxies = async (): Promise<{ status: 'error'; message: string }> => {
  console.warn('testAllProxies bulk operation not yet implemented in V2 API');
  return { status: 'error' as const, message: 'Bulk proxy testing not yet available' };
};

export const cleanProxies = async (): Promise<{ status: 'error'; message: string }> => {
  console.warn('cleanProxies bulk operation not yet implemented in V2 API');
  return { status: 'error' as const, message: 'Bulk proxy cleanup not yet available' };
};

export default proxyService;
