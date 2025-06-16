// src/lib/services/campaignService.ts
// Production Campaign Service - Direct backend integration only
// Replaces campaignApi.ts, campaignService.ts, campaignServiceV2.ts

import apiClient from './apiClient.production';
import type {
  Campaign,
  CampaignSelectedType,
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

// Backend V2 API interfaces - Updated to match backend exactly
interface CreateDomainGenerationRequest {
  name: string;
  patternType: 'prefix' | 'suffix' | 'both';
  variableLength: number;
  characterSet: string;
  constantString: string;
  tld: string;
  numDomainsToGenerate?: number;
  userId?: string;
}

interface CreateDNSValidationRequest {
  name: string;
  sourceGenerationCampaignId: string; // FIXED: Backend expects sourceGenerationCampaignId per models.go:257
  personaIds: string[];
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  userId?: string;
}

interface CreateHTTPKeywordRequest {
  name: string;
  sourceCampaignId: string; // Backend expects sourceCampaignId per models.go:283
  keywordSetIds?: string[];
  adHocKeywords?: string[];
  personaIds: string[];
  proxyPoolId?: string;
  proxySelectionStrategy?: string;
  rotationIntervalSeconds?: number;
  processingSpeedPerMinute?: number;
  batchSize?: number;
  retryAttempts?: number;
  targetHttpPorts?: number[];
  sourceType: string; // FIXED: Required field per models.go:295
  proxyIds?: string[]; // FIXED: Added missing field per models.go:296
  userId?: string;
}

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
    type?: CampaignSelectedType;
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

  async createCampaign(payload: CreateCampaignPayload): Promise<CampaignCreationResponse> {
    try {
      console.log('[CampaignService] Creating campaign with payload:', payload);
      
      let response: CampaignCreationResponse;
      switch (payload.selectedType) {
        case 'domain_generation':
          response = await this.createDomainGenerationCampaign(this.mapToDomainGenRequest(payload));
          break;
        case 'dns_validation':
          response = await this.createDNSValidationCampaign(this.mapToDNSRequest(payload));
          break;
        case 'http_keyword_validation':
          response = await this.createHTTPKeywordCampaign(this.mapToHTTPRequest(payload));
          break;
        default:
          throw new Error(`Unsupported campaign type: ${payload.selectedType}`);
      }
      
      console.log('[CampaignService] Campaign created successfully:', response);
      return response;
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

  // Private campaign creation methods - FIXED ENDPOINTS to match backend /api/v2/campaigns
  private async createDomainGenerationCampaign(
    payload: CreateDomainGenerationRequest
  ): Promise<CampaignCreationResponse> {
    console.log('[CampaignService] Creating domain generation campaign with payload:', payload);
    return apiClient.post<Campaign>('/api/v2/campaigns/generate', payload as unknown as Record<string, unknown>);
  }

  private async createDNSValidationCampaign(
    payload: CreateDNSValidationRequest
  ): Promise<CampaignCreationResponse> {
    console.log('[CampaignService] Creating DNS validation campaign with payload:', payload);
    return apiClient.post<Campaign>('/api/v2/campaigns/dns-validate', payload as unknown as Record<string, unknown>);
  }

  private async createHTTPKeywordCampaign(
    payload: CreateHTTPKeywordRequest
  ): Promise<CampaignCreationResponse> {
    console.log('[CampaignService] Creating HTTP keyword campaign with payload:', payload);
    return apiClient.post<Campaign>('/api/v2/campaigns/keyword-validate', payload as unknown as Record<string, unknown>);
  }

  // Payload mapping - FIXED to match exact backend expectations
  private mapToDomainGenRequest(payload: CreateCampaignPayload): CreateDomainGenerationRequest {
    console.log('[CampaignService] mapToDomainGenRequest - payload:', JSON.stringify(payload, null, 2));
    
    if (!payload.domainGenerationConfig) {
      console.error('[CampaignService] No domainGenerationConfig in payload');
      throw new Error('Domain generation configuration is required for generation campaigns');
    }

    const config = payload.domainGenerationConfig;
    console.log('[CampaignService] Domain generation config:', JSON.stringify(config, null, 2));
    
    // Validate required fields
    if (!config.generationPattern) {
      console.error('[CampaignService] Missing generationPattern');
      throw new Error('Generation pattern is required');
    }
    if (!config.constantPart) {
      console.error('[CampaignService] Missing constantPart');
      throw new Error('Constant part is required');
    }
    
    // Map frontend pattern names to backend pattern names
    const patternTypeMapping = {
      'prefix_variable': 'prefix',
      'suffix_variable': 'suffix',
      'both_variable': 'both'
    } as const;
    
    const backendPatternType = patternTypeMapping[config.generationPattern as keyof typeof patternTypeMapping];
    if (!backendPatternType) {
      throw new Error(`Invalid generation pattern: ${config.generationPattern}`);
    }
    
    // Determine variable length based on pattern type
    let variableLength: number;
    if (config.generationPattern === 'prefix_variable') {
      variableLength = config.prefixVariableLength || 1;
    } else if (config.generationPattern === 'suffix_variable') {
      variableLength = config.suffixVariableLength || 1;
    } else {
      // For 'both', use the max of prefix or suffix, or default to 1
      variableLength = Math.max(config.prefixVariableLength || 1, config.suffixVariableLength || 1);
    }
    
    // Add validation logging for the campaign name
    if (!payload.campaignName && !payload.name) {
      console.error('[CampaignService] Missing campaign name in payload');
      throw new Error('Campaign name is required');
    }

    const request: CreateDomainGenerationRequest = {
      name: payload.campaignName || payload.name || '', // Fallback to 'name' if 'campaignName' is missing
      patternType: backendPatternType,
      variableLength: variableLength,
      characterSet: config.allowedCharSet || 'abcdefghijklmnopqrstuvwxyz',
      constantString: config.constantPart || '',
      tld: config.tlds?.[0] || '.com', // Backend expects single TLD, take first one
      numDomainsToGenerate: config.maxDomainsToGenerate || 1000,
      userId: this.userId,
    };
    
    console.log('[CampaignService] Mapped domain generation request:', JSON.stringify(request, null, 2));
    return request;
  }

  private mapToDNSRequest(payload: CreateCampaignPayload): CreateDNSValidationRequest {
    if (!payload.domainSourceConfig?.sourceCampaignId) {
      throw new Error('Source campaign ID is required for DNS validation campaigns');
    }
    if (!payload.assignedDnsPersonaId) {
      throw new Error('DNS persona is required for DNS validation campaigns');
    }

    const request: CreateDNSValidationRequest = {
      name: payload.campaignName,
      sourceGenerationCampaignId: payload.domainSourceConfig.sourceCampaignId, // FIXED: Backend expects sourceGenerationCampaignId
      personaIds: [payload.assignedDnsPersonaId], // Backend expects array of persona IDs
      userId: this.userId,
    };
    
    console.log('[CampaignService] Mapped DNS validation request:', request);
    return request;
  }

  private mapToHTTPRequest(payload: CreateCampaignPayload): CreateHTTPKeywordRequest {
    if (!payload.domainSourceConfig?.sourceCampaignId) {
      throw new Error('Source campaign ID is required for HTTP keyword validation campaigns');
    }
    if (!payload.assignedHttpPersonaId) {
      throw new Error('HTTP persona is required for HTTP keyword validation campaigns');
    }

    const request: CreateHTTPKeywordRequest = {
      name: payload.campaignName,
      sourceCampaignId: payload.domainSourceConfig.sourceCampaignId, // Backend expects this exact field name
      personaIds: [payload.assignedHttpPersonaId], // Backend expects array of persona IDs
      adHocKeywords: payload.leadGenerationSpecificConfig?.targetKeywords || [],
      proxyPoolId: payload.proxyAssignment?.proxyId,
      proxySelectionStrategy: payload.proxyAssignment?.mode === 'rotate_active' ? 'round_robin' : undefined,
      sourceType: 'dns_validation', // FIXED: Required field - source domains from DNS validation campaign
      proxyIds: payload.proxyAssignment?.proxyId ? [payload.proxyAssignment.proxyId] : undefined, // FIXED: Added missing proxyIds field
      userId: this.userId,
    };
    
    console.log('[CampaignService] Mapped HTTP keyword validation request:', request);
    return request;
  }
}

// Export singleton and functions for backward compatibility
export const campaignService = CampaignService.getInstance();

export const getCampaigns = (filters?: Parameters<typeof campaignService.getCampaigns>[0]) => 
  campaignService.getCampaigns(filters);

export const getCampaignById = (campaignId: string) => 
  campaignService.getCampaignById(campaignId);

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
