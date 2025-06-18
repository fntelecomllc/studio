// src/lib/services/campaignService.ts
// Production Campaign Service - Direct backend integration only
// Replaces campaignApi.ts, campaignService.ts, campaignServiceV2.ts

import apiClient from './apiClient.production';
import type {
  Campaign,
  CreateCampaignPayload,
  CampaignsListResponse,
  CampaignDetailResponse,
  CampaignCreationResponse,
  CampaignOperationResponse,
  CampaignDeleteResponse,
  ApiResponse,
  GeneratedDomain,
  CampaignValidationItem,
} from '@/lib/types';
import { 
  type UnifiedCreateCampaignRequest,
  unifiedCreateCampaignRequestSchema 
} from '@/lib/schemas/unifiedCampaignSchema';


class CampaignService {
  private static instance: CampaignService;
  private userId = 'current-user'; // TODO: Get from auth context

  static getInstance(): CampaignService {
    if (!CampaignService.instance) {
      CampaignService.instance = new CampaignService();
    }
    return CampaignService.instance;
  }

  // Campaign Management - FIXED ENDPOINTS to match backend /api/v2/campaigns
  async getCampaigns(filters?: {
    type?: string;
    status?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<CampaignsListResponse> {
    try {
      console.log('[CampaignService] Getting campaigns with filters:', filters);
      const response = await apiClient.get<Campaign[]>('/api/v2/campaigns', { params: filters });
      console.log('[CampaignService] Get campaigns response:', response);
      return response;
    } catch (error) {
      console.error('[CampaignService] Failed to get campaigns:', error);
      throw error;
    }
  }

  async getCampaignById(campaignId: string): Promise<CampaignDetailResponse> {
    try {
      console.log('[CampaignService] Getting campaign by ID:', campaignId);
      const response = await apiClient.get<Campaign>(`/api/v2/campaigns/${campaignId}`);
      console.log('[CampaignService] Get campaign response:', response);
      return response;
    } catch (error) {
      console.error('[CampaignService] Failed to get campaign:', error);
      throw error;
    }
  }

  // Unified Campaign Creation Method (preferred - uses single endpoint)
  async createCampaignUnified(payload: UnifiedCreateCampaignRequest): Promise<CampaignCreationResponse> {
    try {
      console.log('[CampaignService] Creating campaign with unified payload:', payload);
      
      // Validate payload using Zod schema
      const validatedPayload = unifiedCreateCampaignRequestSchema.parse(payload);
      
      const response = await apiClient.post<Campaign>('/api/v2/campaigns', validatedPayload);
      
      console.log('[CampaignService] Campaign created successfully via unified endpoint:', response);
      return response as CampaignCreationResponse;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- Error handling for diagnostic logging
      console.error('[CampaignService] Unified campaign creation failed:', error);
      
      // Enhanced error handling with specific messages
      if (error.response?.status === 403) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (error.response?.status === 400) {
        const message = error.response?.data?.message || 'Invalid campaign data provided.';
        throw new Error(message);
      } else if (error.response?.status === 422) {
        const details = error.response?.data?.details || 'Validation failed.';
        throw new Error(`Validation error: ${details}`);
      } else if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else if (error.message) {
        throw error;
      } else {
        throw new Error('Failed to create campaign. Please try again.');
      }
    }
  }

  // Legacy Campaign Creation Method (deprecated - kept for backward compatibility)
  async createCampaign(payload: CreateCampaignPayload): Promise<CampaignCreationResponse> {
    try {
      console.log('[CampaignService] Creating campaign with payload:', payload);
      
      let endpoint = '';
      switch (payload.campaignType) {
        case 'domain_generation':
          endpoint = '/api/v2/campaigns/generate';
          break;
        case 'dns_validation':
          endpoint = '/api/v2/campaigns/dns-validate';
          break;
        case 'http_keyword_validation':
          endpoint = '/api/v2/campaigns/keyword-validate';
          break;
        default:
          throw new Error(`Unsupported campaign type: ${payload.campaignType}`);
      }

      const response = await apiClient.post<Campaign>(endpoint, payload as unknown as Record<string, unknown>);
      
      console.log('[CampaignService] Campaign created successfully:', response);
      return response as CampaignCreationResponse;
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- Error handling for diagnostic logging
      console.error('[CampaignService] Campaign creation failed:', error);
      
      // Enhanced error handling with specific messages
      if (error.response?.status === 403) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (error.response?.status === 400) {
        const message = error.response?.data?.message || 'Invalid campaign data provided.';
        throw new Error(message);
      } else if (error.response?.status === 422) {
        const details = error.response?.data?.details || 'Validation failed.';
        throw new Error(`Validation error: ${details}`);
      } else if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else if (error.message) {
        throw error;
      } else {
        throw new Error('Failed to create campaign. Please try again.');
      }
    }
  }

  // Campaign Lifecycle - FIXED ENDPOINTS to match backend /api/v2/campaigns
  async startCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Starting campaign:', campaignId);
      const response = await apiClient.post<Partial<Campaign>>(`/api/v2/campaigns/${campaignId}/start`);
      console.log('[CampaignService] Start campaign response:', response);
      return response as CampaignOperationResponse;
    } catch (error) {
      console.error('[CampaignService] Failed to start campaign:', error);
      throw error;
    }
  }

  async pauseCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Pausing campaign:', campaignId);
      const response = await apiClient.post<Partial<Campaign>>(`/api/v2/campaigns/${campaignId}/pause`);
      console.log('[CampaignService] Pause campaign response:', response);
      return response as CampaignOperationResponse;
    } catch (error) {
      console.error('[CampaignService] Failed to pause campaign:', error);
      throw error;
    }
  }

  async resumeCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Resuming campaign:', campaignId);
      const response = await apiClient.post<Partial<Campaign>>(`/api/v2/campaigns/${campaignId}/resume`);
      console.log('[CampaignService] Resume campaign response:', response);
      return response as CampaignOperationResponse;
    } catch (error) {
      console.error('[CampaignService] Failed to resume campaign:', error);
      throw error;
    }
  }

  async cancelCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Cancelling campaign:', campaignId);
      const response = await apiClient.post<Partial<Campaign>>(`/api/v2/campaigns/${campaignId}/cancel`);
      console.log('[CampaignService] Cancel campaign response:', response);
      return response as CampaignOperationResponse;
    } catch (error) {
      console.error('[CampaignService] Failed to cancel campaign:', error);
      throw error;
    }
  }

  async deleteCampaign(campaignId: string): Promise<CampaignDeleteResponse> {
    const result = await this.cancelCampaign(campaignId);
    return {
      status: result.status,
      message: result.message,
      data: null,
    };
  }

  // Campaign Results - FIXED ENDPOINTS to match backend /api/v2/campaigns
  async getGeneratedDomains(
    campaignId: string,
    options: { limit?: number; cursor?: number } = {}
  ): Promise<ApiResponse<GeneratedDomain[]>> {
    try {
      console.log('[CampaignService] Getting generated domains for campaign:', campaignId, options);
      const response = await apiClient.get<GeneratedDomain[]>(
        `/api/v2/campaigns/${campaignId}/results/generated-domains`,
        { params: options }
      );
      console.log('[CampaignService] Generated domains response:', response);
      return response;
    } catch (error) {
      console.error('[CampaignService] Failed to get generated domains:', error);
      throw error;
    }
  }

  async getDNSValidationResults(
    campaignId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<ApiResponse<CampaignValidationItem[]>> {
    try {
      console.log('[CampaignService] Getting DNS validation results for campaign:', campaignId, options);
      const response = await apiClient.get<CampaignValidationItem[]>(
        `/api/v2/campaigns/${campaignId}/results/dns-validation`,
        { params: options }
      );
      console.log('[CampaignService] DNS validation results response:', response);
      return response;
    } catch (error) {
      console.error('[CampaignService] Failed to get DNS validation results:', error);
      throw error;
    }
  }

  async getHTTPKeywordResults(
    campaignId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<ApiResponse<CampaignValidationItem[]>> {
    try {
      console.log('[CampaignService] Getting HTTP keyword results for campaign:', campaignId, options);
      const response = await apiClient.get<CampaignValidationItem[]>(
        `/api/v2/campaigns/${campaignId}/results/http-keyword`,
        { params: options }
      );
      console.log('[CampaignService] HTTP keyword results response:', response);
      return response;
    } catch (error) {
      console.error('[CampaignService] Failed to get HTTP keyword results:', error);
      throw error;
    }
  }

}

// Export singleton and functions for backward compatibility
export const campaignService = CampaignService.getInstance();

export const getCampaigns = (filters?: Parameters<typeof campaignService.getCampaigns>[0]) => 
  campaignService.getCampaigns(filters);

export const getCampaignById = (campaignId: string) => 
  campaignService.getCampaignById(campaignId);

// Unified campaign creation (preferred)
export const createCampaignUnified = (payload: UnifiedCreateCampaignRequest) => 
  campaignService.createCampaignUnified(payload);

// Legacy campaign creation (deprecated)
export const createCampaign = (payload: CreateCampaignPayload) => 
  campaignService.createCampaign(payload);

export const startCampaign = (campaignId: string) => 
  campaignService.startCampaign(campaignId);

export const pauseCampaign = (campaignId: string) => 
  campaignService.pauseCampaign(campaignId);

export const resumeCampaign = (campaignId: string) => 
  campaignService.resumeCampaign(campaignId);

export const cancelCampaign = (campaignId: string) => 
  campaignService.cancelCampaign(campaignId);

export const deleteCampaign = (campaignId: string) => 
  campaignService.deleteCampaign(campaignId);

export const getGeneratedDomains = (campaignId: string, options?: Parameters<typeof campaignService.getGeneratedDomains>[1]) => 
  campaignService.getGeneratedDomains(campaignId, options);

export const getDNSValidationResults = (campaignId: string, options?: Parameters<typeof campaignService.getDNSValidationResults>[1]) => 
  campaignService.getDNSValidationResults(campaignId, options);

export const getHTTPKeywordResults = (campaignId: string, options?: Parameters<typeof campaignService.getHTTPKeywordResults>[1]) => 
  campaignService.getHTTPKeywordResults(campaignId, options);

// AI Content Analysis (Future Feature)
export const analyzeContent = async (
  _input: unknown,
  _campaignId?: string,
  _contentId?: string
): Promise<{ status: string; message: string }> => {
  console.warn('AI Content Analysis is not yet implemented in V2 API');
  return {
    status: 'error',
    message: 'AI Content Analysis feature is not yet available in the production API'
  };
};

// Legacy aliases for compatibility
export const startCampaignPhase = startCampaign;
export const stopCampaign = cancelCampaign;
export const listCampaigns = getCampaigns;

export default campaignService;
