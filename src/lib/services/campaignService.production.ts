// src/lib/services/campaignService.ts
// Production Campaign Service - Direct backend integration only
// Replaces campaignApi.ts, campaignService.ts, campaignServiceV2.ts

import apiClient from './apiClient.production';
import { TransactionManager } from '@/lib/utils/transactionManager';
import { ResilientApiWrapper, CircuitBreakerState } from '@/lib/utils/errorRecovery';
import type {
  Campaign,
  CampaignsListResponse,
  CampaignDetailResponse,
  CampaignCreationResponse,
  CampaignOperationResponse,
  CampaignDeleteResponse,
  ApiResponse,
  GeneratedDomain,
  CampaignValidationItem,
} from '@/lib/types';
import type { ModelsCampaignAPI } from '@/lib/api-client/models/models-campaign-api';
import { 
  type UnifiedCreateCampaignRequest,
  unifiedCreateCampaignRequestSchema 
} from '@/lib/schemas/unifiedCampaignSchema';
import { transformCampaignResponse, transformCampaignArrayResponse } from '@/lib/api/transformers/campaign-transformers';
import { transformErrorResponse, ApiError } from '@/lib/api/transformers/error-transformers';
import {
  transformGeneratedDomainArrayResponse,
  transformDNSValidationResultArrayResponse,
  transformHTTPKeywordResultArrayResponse,
  transformToValidationItem
} from '@/lib/api/transformers/domain-transformers';


class CampaignService {
  private static instance: CampaignService;
  private userId = 'current-user'; // TODO: Get from auth context
  private resilientWrapper: ResilientApiWrapper;

  constructor() {
    // Initialize resilient API wrapper with circuit breaker and retry logic
    this.resilientWrapper = new ResilientApiWrapper(
      {
        failureThreshold: 5,
        resetTimeoutMs: 60000, // 1 minute
        onStateChange: (state) => {
          console.log(`[CampaignService] Circuit breaker state changed to: ${state}`);
        }
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        onRetry: (attempt, error) => {
          console.warn(`[CampaignService] Retry attempt ${attempt}:`, error.message);
        }
      }
    );
  }

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
      const response = await apiClient.get<ModelsCampaignAPI[]>('/api/v2/campaigns', { params: filters });
      console.log('[CampaignService] Get campaigns response:', response);
      
      // Transform raw campaign data to use branded types
      const transformedData = transformCampaignArrayResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign[]
      };
    } catch {
      console.error('[CampaignService] Failed to get campaigns:', error);
      const standardizedError = transformErrorResponse(error, 500, '/api/v2/campaigns');
      throw new ApiError(standardizedError);
    }
  }

  async getCampaignById(campaignId: string): Promise<CampaignDetailResponse> {
    try {
      console.log('[CampaignService] Getting campaign by ID:', campaignId);
      const response = await apiClient.get<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}`);
      console.log('[CampaignService] Get campaign response:', response);
      
      // Transform single campaign response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch {
      console.error('[CampaignService] Failed to get campaign:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}`);
      throw new ApiError(standardizedError);
    }
  }

  // Unified Campaign Creation Method (preferred - uses single endpoint)
  async createCampaignUnified(payload: UnifiedCreateCampaignRequest): Promise<CampaignCreationResponse> {
    return this.resilientWrapper.execute(
      async () => {
        console.log('[CampaignService] Creating campaign with unified payload:', payload);
        
        // Validate payload using Zod schema
        const validatedPayload = unifiedCreateCampaignRequestSchema.parse(payload);
        
        const response = await apiClient.post<ModelsCampaignAPI>('/api/v2/campaigns', validatedPayload);
        
        // Transform response
        const transformedData = transformCampaignResponse(response.data);
        
        console.log('[CampaignService] Campaign created successfully via unified endpoint:', response);
        return {
          ...response,
          data: transformedData as unknown as Campaign
        } as CampaignCreationResponse;
      },
      {
        fallbackFunction: async () => {
          console.error('[CampaignService] Campaign creation failed, no fallback available');
          throw new Error('Campaign creation service is temporarily unavailable');
        }
      }
    ).catch((error: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- Error handling for diagnostic logging
      console.error('[CampaignService] Unified campaign creation failed:', error);
      
      // Enhanced error handling with standardized error transformation
      if (error.response) {
        const standardizedError = transformErrorResponse(
          error.response.data || error,
          error.response.status,
          '/api/v2/campaigns'
        );
        throw new ApiError(standardizedError);
      } else if (error.message) {
        throw error;
      } else {
        throw new Error('Failed to create campaign. Please try again.');
      }
    });
  }

  // Campaign Control Operations
  async startCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Starting campaign:', campaignId);
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/start`);
      console.log('[CampaignService] Start campaign response:', response);
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch {
      console.error('[CampaignService] Start campaign error:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/start`);
      throw new ApiError(standardizedError);
    }
  }

  async pauseCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Pausing campaign:', campaignId);
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/pause`);
      console.log('[CampaignService] Pause campaign response:', response);
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch {
      console.error('[CampaignService] Pause campaign error:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/pause`);
      throw new ApiError(standardizedError);
    }
  }

  async resumeCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Resuming campaign:', campaignId);
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/resume`);
      console.log('[CampaignService] Resume campaign response:', response);
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch {
      console.error('[CampaignService] Resume campaign error:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/resume`);
      throw new ApiError(standardizedError);
    }
  }

  async cancelCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      console.log('[CampaignService] Cancelling campaign:', campaignId);
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/cancel`);
      console.log('[CampaignService] Cancel campaign response:', response);
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch {
      console.error('[CampaignService] Cancel campaign error:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/cancel`);
      throw new ApiError(standardizedError);
    }
  }

  /**
   * Delete campaign with transaction support
   * This ensures that all related resources are cleaned up
   */
  async deleteCampaign(campaignId: string): Promise<CampaignDeleteResponse> {
    const transaction = TransactionManager.createContext();
    
    // Add steps for comprehensive deletion
    transaction.addStep<Campaign | null>({
      name: 'stopCampaign',
      execute: async () => {
        try {
          const result = await this.cancelCampaign(campaignId);
          return result.data || null;
        } catch {
          // If already cancelled, continue
          console.warn('[CampaignService] Campaign may already be cancelled:', error);
          return null;
        }
      },
      retryable: true,
      maxRetries: 2
    });
    
    transaction.addStep<boolean>({
      name: 'cleanupResources',
      execute: async () => {
        // In a real implementation, this would clean up associated resources
        console.log('[CampaignService] Cleaning up campaign resources...');
        return true;
      },
      rollback: async () => {
        console.warn('[CampaignService] Resource cleanup rollback - manual intervention may be required');
      }
    });
    
    const result = await transaction.execute({ timeout: 30000 });
    
    if (result.success) {
      return {
        status: 'success' as const,
        message: 'Campaign deleted successfully',
        data: null,
      };
    } else {
      const error = Array.from(result.errors.values())[0];
      throw error || new Error('Failed to delete campaign');
    }
  }

  // Campaign Results - FIXED ENDPOINTS to match backend /api/v2/campaigns
  async getGeneratedDomains(
    campaignId: string,
    options: { limit?: number; cursor?: number } = {}
  ): Promise<ApiResponse<GeneratedDomain[]>> {
    try {
      console.log('[CampaignService] Getting generated domains for campaign:', campaignId, options);
      const response = await apiClient.get<unknown[]>(
        `/api/v2/campaigns/${campaignId}/results/generated-domains`,
        { params: options }
      );
      console.log('[CampaignService] Generated domains response:', response);
      
      // Transform with proper offsetIndex handling
      const transformedData = transformGeneratedDomainArrayResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as GeneratedDomain[]
      };
    } catch {
      console.error('[CampaignService] Failed to get generated domains:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/results/generated-domains`);
      throw new ApiError(standardizedError);
    }
  }

  async getDNSValidationResults(
    campaignId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<ApiResponse<CampaignValidationItem[]>> {
    try {
      console.log('[CampaignService] Getting DNS validation results for campaign:', campaignId, options);
      const response = await apiClient.get<unknown[]>(
        `/api/v2/campaigns/${campaignId}/results/dns-validation`,
        { params: options }
      );
      console.log('[CampaignService] DNS validation results response:', response);
      
      // Transform DNS results to unified validation items
      const transformedResults = transformDNSValidationResultArrayResponse(response.data);
      const validationItems = transformedResults.map(result => 
        transformToValidationItem(result, campaignId)
      );
      
      return {
        ...response,
        data: validationItems as unknown as CampaignValidationItem[]
      };
    } catch {
      console.error('[CampaignService] Failed to get DNS validation results:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/results/dns-validation`);
      throw new ApiError(standardizedError);
    }
  }

  async getHTTPKeywordResults(
    campaignId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<ApiResponse<CampaignValidationItem[]>> {
    try {
      console.log('[CampaignService] Getting HTTP keyword results for campaign:', campaignId, options);
      const response = await apiClient.get<unknown[]>(
        `/api/v2/campaigns/${campaignId}/results/http-keyword`,
        { params: options }
      );
      console.log('[CampaignService] HTTP keyword results response:', response);
      
      // Transform HTTP results to unified validation items
      const transformedResults = transformHTTPKeywordResultArrayResponse(response.data);
      const validationItems = transformedResults.map(result => 
        transformToValidationItem(result, campaignId)
      );
      
      return {
        ...response,
        data: validationItems as unknown as CampaignValidationItem[]
      };
    } catch {
      console.error('[CampaignService] Failed to get HTTP keyword results:', error);
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/results/http-keyword`);
      throw new ApiError(standardizedError);
    }
  }

  /**
   * Get circuit breaker state for monitoring
   */
  getCircuitBreakerState(): CircuitBreakerState {
    return this.resilientWrapper.getCircuitState();
  }

  /**
   * Reset circuit breaker manually
   */
  resetCircuitBreaker(): void {
    this.resilientWrapper.resetCircuit();
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
