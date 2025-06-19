// src/lib/utils/campaignTransforms.ts
// Campaign data transformation utilities for UI compatibility

import type { Campaign, CampaignViewModel, CampaignType, CampaignStatus, CampaignPhase, CampaignPhaseStatus } from '@/lib/types';

/**
 * Transform raw Campaign API data to CampaignViewModel for UI consumption
 * Adds UI-specific computed properties and backwards compatibility fields
 */
export function transformCampaignToViewModel(campaign: Campaign): CampaignViewModel {
  // Map current backend status to UI phase and status concepts
  const currentPhase = mapStatusToPhase(campaign.status, campaign.campaignType);
  const phaseStatus = mapStatusToPhaseStatus(campaign.status);
  
  return {
    ...campaign,
    // UI compatibility fields
    selectedType: campaign.campaignType,
    currentPhase,
    phaseStatus,
    progress: campaign.progressPercentage,
    
    // Initialize empty arrays for UI state (will be populated as needed)
    domains: [],
    dnsValidatedDomains: [],
    httpValidatedDomains: [],
    extractedContent: [],
    leads: [],
    
    // Default UI configuration
    domainSourceConfig: {
      type: 'manual',
      uploadedDomains: []
    }
  };
}

/**
 * Transform array of Campaign objects to CampaignViewModel array
 */
export function transformCampaignsToViewModels(campaigns: Campaign[]): CampaignViewModel[] {
  return campaigns.map(transformCampaignToViewModel);
}

/**
 * Map backend CampaignStatus to UI phase concept
 */
function mapStatusToPhase(status: CampaignStatus, campaignType: CampaignType): CampaignPhase {
  switch (status) {
    case 'pending':
      return 'idle';
    case 'queued':
      return 'idle';
    case 'running':
      // Map to appropriate phase based on campaign type
      switch (campaignType) {
        case 'domain_generation':
          return 'domain_generation';
        case 'dns_validation':
          return 'dns_validation';
        case 'http_keyword_validation':
          return 'http_keyword_validation';
        default:
          return 'domain_generation';
      }
    case 'pausing':
      return mapStatusToPhase('running', campaignType); // Same phase as running
    case 'paused':
      return mapStatusToPhase('running', campaignType); // Same phase as running
    case 'completed':
      return 'completed';
    case 'failed':
      return mapStatusToPhase('running', campaignType); // Show which phase failed
    case 'archived':
      return 'completed';
    case 'cancelled':
      return 'completed';
    default:
      return 'idle';
  }
}

/**
 * Map backend CampaignStatus to UI phase status concept
 */
function mapStatusToPhaseStatus(status: CampaignStatus): CampaignPhaseStatus {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'queued':
      return 'Pending';
    case 'running':
      return 'InProgress';
    case 'pausing':
      return 'InProgress';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'archived':
      return 'Succeeded';
    case 'cancelled':
      return 'Failed';
    default:
      return 'Pending';
  }
}

/**
 * Extract UI-specific fields from CampaignViewModel back to Campaign
 * Useful when sending data back to the API
 */
export function extractCampaignFromViewModel(viewModel: CampaignViewModel): Campaign {
  const {
    // Remove UI-specific fields
    selectedType: _selectedType,
    currentPhase: _currentPhase,
    phaseStatus: _phaseStatus,
    progress: _progress,
    domains: _domains,
    dnsValidatedDomains: _dnsValidatedDomains,
    httpValidatedDomains: _httpValidatedDomains,
    extractedContent: _extractedContent,
    leads: _leads,
    domainSourceConfig: _domainSourceConfig,
    description: _description,
    ...coreFields
  } = viewModel;
  
  return coreFields;
}

/**
 * Safely merge Campaign API updates into CampaignViewModel without overriding UI-specific fields
 * This preserves UI state while updating API data
 */
export function mergeCampaignApiUpdate(viewModel: CampaignViewModel, apiUpdate: Partial<Campaign>): CampaignViewModel {
  // Update the ViewModel with new API data while preserving UI-specific fields
  const updatedViewModel = {
    ...viewModel,
    ...apiUpdate
  };
  
  // Re-derive UI fields from updated API data if status changed
  if (apiUpdate.status || apiUpdate.campaignType) {
    const newStatus = apiUpdate.status || viewModel.status;
    const newType = apiUpdate.campaignType || viewModel.campaignType;
    
    updatedViewModel.currentPhase = mapStatusToPhase(newStatus, newType);
    updatedViewModel.phaseStatus = mapStatusToPhaseStatus(newStatus);
    updatedViewModel.selectedType = newType;
  }
  
  // Update progress alias
  if (apiUpdate.progressPercentage !== undefined) {
    updatedViewModel.progress = apiUpdate.progressPercentage;
  }
  
  return updatedViewModel;
}
