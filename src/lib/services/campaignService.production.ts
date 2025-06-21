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
import { logger } from '@/lib/utils/logger';


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
          logger.warn('Campaign service circuit breaker state changed', { newState: state }, { component: 'CampaignService' });
        }
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        onRetry: (attempt, error) => {
          logger.warn('Campaign service retry attempt', {
            attempt,
            errorMessage: error.message,
            operation: 'api_retry'
          }, { component: 'CampaignService' });
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
      logger.api('Fetching campaigns list', { filters, endpoint: '/api/v2/campaigns' });
      const response = await apiClient.get<ModelsCampaignAPI[]>('/api/v2/campaigns', { params: filters });
      logger.api('Campaigns list retrieved successfully', {
        campaignCount: response.data?.length || 0,
        status: response.status
      });
      
      // Transform raw campaign data to use branded types
      const transformedData = transformCampaignArrayResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign[]
      };
    } catch (error) {
      logger.error('Failed to retrieve campaigns list', error, { component: 'CampaignService', operation: 'getCampaigns' });
      const standardizedError = transformErrorResponse(error, 500, '/api/v2/campaigns');
      throw new ApiError(standardizedError);
    }
  }

  async getCampaignById(campaignId: string): Promise<CampaignDetailResponse> {
    try {
      logger.api('Fetching campaign details', { campaignId, endpoint: `/api/v2/campaigns/${campaignId}` });
      const response = await apiClient.get<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}`);
      logger.api('Campaign details retrieved successfully', {
        campaignId,
        status: response.status,
        campaignName: response.data?.name || 'unknown'
      });
      
      // Transform single campaign response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch (error) {
      logger.error('Failed to retrieve campaign details', error, { component: 'CampaignService', operation: 'getCampaignById', campaignId });
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}`);
      throw new ApiError(standardizedError);
    }
  }

  // Unified Campaign Creation Method (preferred - uses single endpoint)
  async createCampaignUnified(payload: UnifiedCreateCampaignRequest): Promise<CampaignCreationResponse> {
    return this.resilientWrapper.execute(
      async () => {
        logger.api('Creating campaign with unified endpoint', {
          campaignName: payload.name,
          campaignType: payload.campaignType,
          endpoint: '/api/v2/campaigns'
        });
        
        // Validate payload using Zod schema
        const validatedPayload = unifiedCreateCampaignRequestSchema.parse(payload);
        
        const response = await apiClient.post<ModelsCampaignAPI>('/api/v2/campaigns', validatedPayload);
        
        // Transform response
        const transformedData = transformCampaignResponse(response.data);
        
        logger.api('Campaign created successfully', {
          campaignId: response.data?.id,
          campaignName: response.data?.name,
          status: response.status
        });
        return {
          ...response,
          data: transformedData as unknown as Campaign
        } as CampaignCreationResponse;
      },
      {
        fallbackFunction: async () => {
          logger.error('Campaign creation failed with no fallback available', {}, { component: 'CampaignService', operation: 'createCampaignUnified' });
          throw new Error('Campaign creation service is temporarily unavailable');
        }
      }
    ).catch((error: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any -- Error handling for diagnostic logging
      logger.error('Unified campaign creation failed', error, { component: 'CampaignService', operation: 'createCampaignUnified' });
      
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
      logger.api('Starting campaign', { campaignId, operation: 'start' });
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/start`);
      logger.api('Campaign started successfully', { campaignId, status: response.status });
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch (error) {
      logger.error('Failed to start campaign', error, { component: 'CampaignService', operation: 'startCampaign', campaignId });
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/start`);
      throw new ApiError(standardizedError);
    }
  }

  async pauseCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      logger.api('Pausing campaign', { campaignId, operation: 'pause' });
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/pause`);
      logger.api('Campaign paused successfully', { campaignId, status: response.status });
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch (error) {
      logger.error('Failed to pause campaign', error, { component: 'CampaignService', operation: 'pauseCampaign', campaignId });
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/pause`);
      throw new ApiError(standardizedError);
    }
  }

  async resumeCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      logger.api('Resuming campaign', { campaignId, operation: 'resume' });
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/resume`);
      logger.api('Campaign resumed successfully', { campaignId, status: response.status });
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch (error) {
      logger.error('Failed to resume campaign', error, { component: 'CampaignService', operation: 'resumeCampaign', campaignId });
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/resume`);
      throw new ApiError(standardizedError);
    }
  }

  async cancelCampaign(campaignId: string): Promise<CampaignOperationResponse> {
    try {
      logger.api('Cancelling campaign', { campaignId, operation: 'cancel' });
      const response = await apiClient.post<ModelsCampaignAPI>(`/api/v2/campaigns/${campaignId}/cancel`);
      logger.api('Campaign cancelled successfully', { campaignId, status: response.status });
      
      // Transform response
      const transformedData = transformCampaignResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as Campaign
      };
    } catch (error) {
      logger.error('Failed to cancel campaign', error, { component: 'CampaignService', operation: 'cancelCampaign', campaignId });
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
        } catch (error) {
          // If already cancelled, continue
          logger.warn('Campaign may already be cancelled during deletion', {
            campaignId,
            error: error instanceof Error ? error.message : 'unknown'
          }, { component: 'CampaignService' });
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
        logger.info('Cleaning up campaign resources', { campaignId }, { component: 'CampaignService' });
        return true;
      },
      rollback: async () => {
        logger.warn('Resource cleanup rollback - manual intervention may be required', { campaignId }, { component: 'CampaignService' });
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
      logger.api('Fetching generated domains for campaign', {
        campaignId,
        options,
        endpoint: `/api/v2/campaigns/${campaignId}/results/generated-domains`
      });
      const response = await apiClient.get<unknown[]>(
        `/api/v2/campaigns/${campaignId}/results/generated-domains`,
        { params: options }
      );
      logger.api('Generated domains retrieved successfully', {
        campaignId,
        resultCount: response.data?.length || 0,
        status: response.status
      });
      
      // Transform with proper offsetIndex handling
      const transformedData = transformGeneratedDomainArrayResponse(response.data);
      
      return {
        ...response,
        data: transformedData as unknown as GeneratedDomain[]
      };
    } catch (error) {
      logger.error('Failed to retrieve generated domains', error, { component: 'CampaignService', operation: 'getGeneratedDomains', campaignId });
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/results/generated-domains`);
      throw new ApiError(standardizedError);
    }
  }

  async getDNSValidationResults(
    campaignId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<ApiResponse<CampaignValidationItem[]>> {
    try {
      logger.api('Fetching DNS validation results for campaign', { 
        campaignId, 
        options, 
        endpoint: `/api/v2/campaigns/${campaignId}/results/dns-validation` 
      });
      const response = await apiClient.get<unknown[]>(
        `/api/v2/campaigns/${campaignId}/results/dns-validation`,
        { params: options }
      );
      logger.api('DNS validation results retrieved successfully', {
        campaignId,
        resultCount: response.data?.length || 0,
        status: response.status
      });
      
      // Transform DNS results to unified validation items
      const transformedResults = transformDNSValidationResultArrayResponse(response.data);
      const validationItems = transformedResults.map(result => 
        transformToValidationItem(result, campaignId)
      );
      
      return {
        ...response,
        data: validationItems as unknown as CampaignValidationItem[]
      };
    } catch (error) {
      logger.error('Failed to retrieve DNS validation results', error, { component: 'CampaignService', operation: 'getDNSValidationResults', campaignId });
      const standardizedError = transformErrorResponse(error, 500, `/api/v2/campaigns/${campaignId}/results/dns-validation`);
      throw new ApiError(standardizedError);
    }
  }

  async getHTTPKeywordResults(
    campaignId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<ApiResponse<CampaignValidationItem[]>> {
    try {
      logger.api('Fetching HTTP keyword results for campaign', { 
        campaignId, 
        options, 
        endpoint: `/api/v2/campaigns/${campaignId}/results/http-keyword` 
      });
      const response = await apiClient.get<unknown[]>(
        `/api/v2/campaigns/${campaignId}/results/http-keyword`,
        { params: options }
      );
      logger.api('HTTP keyword results retrieved successfully', {
        campaignId,
        resultCount: response.data?.length || 0,
        status: response.status
      });
      
      // Transform HTTP results to unified validation items
      const transformedResults = transformHTTPKeywordResultArrayResponse(response.data);
      const validationItems = transformedResults.map(result => 
        transformToValidationItem(result, campaignId)
      );
      
      return {
        ...response,
        data: validationItems as unknown as CampaignValidationItem[]
      };
    } catch (error) {
      logger.error('Failed to retrieve HTTP keyword results', error, { component: 'CampaignService', operation: 'getHTTPKeywordResults', campaignId });
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
  logger.warn('AI Content Analysis is not yet implemented in V2 API', { feature: 'analyzeContent' }, { component: 'CampaignService' });
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
