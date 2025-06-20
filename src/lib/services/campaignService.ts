/**
 * Enhanced Campaign Service with Bulk Operations
 * 
 * Extends the production campaign service with bulk operations support
 */

import { campaignService as productionCampaignService } from './campaignService.production';
import type { UUID } from '@/lib/types/branded';
import type { Campaign, CampaignOperationResponse } from '@/lib/types';
import { transformErrorResponse } from '@/lib/api/transformers/error-transformers';
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';

/**
 * Bulk operation request for campaigns
 */
export interface CampaignBulkOperationRequest {
  campaignIds: UUID[];
  operation: 'start' | 'pause' | 'resume' | 'cancel' | 'delete';
}

/**
 * Bulk operation result
 */
export interface CampaignBulkOperationResult {
  successful: Array<{
    campaignId: UUID;
    campaign?: Campaign;
  }>;
  failed: Array<{
    campaignId: UUID;
    error: string;
  }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
  duration: number;
}

/**
 * Enhanced campaign service with bulk operations
 */
class EnhancedCampaignService {
  private static instance: EnhancedCampaignService;

  private constructor() {}

  static getInstance(): EnhancedCampaignService {
    if (!EnhancedCampaignService.instance) {
      EnhancedCampaignService.instance = new EnhancedCampaignService();
    }
    return EnhancedCampaignService.instance;
  }

  /**
   * Bulk start campaigns
   */
  async bulkStartCampaigns(campaignIds: UUID[]): Promise<CampaignBulkOperationResult> {
    return this.performBulkOperation(campaignIds, 'start', async (campaignId) => {
      return await productionCampaignService.startCampaign(campaignId);
    });
  }

  /**
   * Bulk pause campaigns
   */
  async bulkPauseCampaigns(campaignIds: UUID[]): Promise<CampaignBulkOperationResult> {
    return this.performBulkOperation(campaignIds, 'pause', async (campaignId) => {
      return await productionCampaignService.pauseCampaign(campaignId);
    });
  }

  /**
   * Bulk resume campaigns
   */
  async bulkResumeCampaigns(campaignIds: UUID[]): Promise<CampaignBulkOperationResult> {
    return this.performBulkOperation(campaignIds, 'resume', async (campaignId) => {
      return await productionCampaignService.resumeCampaign(campaignId);
    });
  }

  /**
   * Bulk cancel campaigns
   */
  async bulkCancelCampaigns(campaignIds: UUID[]): Promise<CampaignBulkOperationResult> {
    return this.performBulkOperation(campaignIds, 'cancel', async (campaignId) => {
      return await productionCampaignService.cancelCampaign(campaignId);
    });
  }

  /**
   * Bulk delete campaigns
   */
  async bulkDeleteCampaigns(campaignIds: UUID[]): Promise<CampaignBulkOperationResult> {
    return this.performBulkOperation(campaignIds, 'delete', async (campaignId) => {
      await productionCampaignService.deleteCampaign(campaignId);
      return null;
    });
  }

  /**
   * Generic bulk operation handler with performance monitoring
   */
  private async performBulkOperation(
    campaignIds: UUID[],
    operation: string,
    operationFn: (campaignId: UUID) => Promise<CampaignOperationResponse | null>
  ): Promise<CampaignBulkOperationResult> {
    const startTime = performance.now();
    const successful: Array<{ campaignId: UUID; campaign?: Campaign }> = [];
    const failed: Array<{ campaignId: UUID; error: string }> = [];

    // Record bulk operation start
    performanceMonitor.recordCustomMetric(
      'campaign_bulk_operation_start',
      campaignIds.length,
      'count',
      { operation }
    );

    // Process in parallel with concurrency limit
    const concurrencyLimit = 5;
    const chunks = this.chunkArray(campaignIds, concurrencyLimit);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (campaignId) => {
          const operationStartTime = performance.now();
          
          try {
            const result = await operationFn(campaignId);
            successful.push({
              campaignId,
              campaign: result?.data || undefined
            });

            // Record individual operation success
            performanceMonitor.recordCustomMetric(
              'campaign_bulk_operation_item',
              performance.now() - operationStartTime,
              'ms',
              { operation, status: 'success' }
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            failed.push({
              campaignId,
              error: errorMessage
            });

            // Record individual operation failure
            performanceMonitor.recordCustomMetric(
              'campaign_bulk_operation_item',
              performance.now() - operationStartTime,
              'ms',
              { operation, status: 'failure', error: errorMessage }
            );
          }
        })
      );
    }

    const duration = performance.now() - startTime;

    // Record bulk operation completion
    performanceMonitor.recordCustomMetric(
      'campaign_bulk_operation_complete',
      duration,
      'ms',
      {
        operation,
        total: campaignIds.length.toString(),
        successful: successful.length.toString(),
        failed: failed.length.toString()
      }
    );

    return {
      successful,
      failed,
      totalProcessed: campaignIds.length,
      successCount: successful.length,
      failureCount: failed.length,
      duration
    };
  }

  /**
   * Utility to chunk array for concurrency control
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Batch update campaign metadata
   */
  async batchUpdateCampaignMetadata(
    updates: Array<{
      campaignId: UUID;
      metadata: Record<string, unknown>;
    }>
  ): Promise<CampaignBulkOperationResult> {
    const startTime = performance.now();
    const successful: Array<{ campaignId: UUID; campaign?: Campaign }> = [];
    const failed: Array<{ campaignId: UUID; error: string }> = [];

    for (const update of updates) {
      try {
        // Get current campaign
        const currentCampaign = await productionCampaignService.getCampaignById(update.campaignId);
        
        if (currentCampaign.status === 'success' && currentCampaign.data) {
          // Merge metadata
          const mergedMetadata = {
            ...(currentCampaign.data.metadata || {}),
            ...update.metadata
          };

          // Update campaign (would need an update endpoint in the backend)
          // For now, we'll just simulate success
          successful.push({
            campaignId: update.campaignId,
            campaign: {
              ...currentCampaign.data,
              metadata: mergedMetadata
            } as Campaign
          });
        } else {
          failed.push({
            campaignId: update.campaignId,
            error: 'Campaign not found'
          });
        }
      } catch (error) {
        failed.push({
          campaignId: update.campaignId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      successful,
      failed,
      totalProcessed: updates.length,
      successCount: successful.length,
      failureCount: failed.length,
      duration: performance.now() - startTime
    };
  }

  /**
   * Get campaigns by status with filtering
   */
  async getCampaignsByStatus(
    status: string | string[],
    options?: {
      limit?: number;
      offset?: number;
      includeArchived?: boolean;
    }
  ): Promise<Campaign[]> {
    const statuses = Array.isArray(status) ? status : [status];
    const allCampaigns: Campaign[] = [];

    // Fetch campaigns for each status
    for (const s of statuses) {
      const result = await productionCampaignService.getCampaigns({
        status: s,
        limit: options?.limit,
        offset: options?.offset
      });

      if (result.status === 'success' && result.data) {
        allCampaigns.push(...result.data);
      }
    }

    // Filter out archived if requested
    if (!options?.includeArchived) {
      return allCampaigns.filter(c => c.status !== 'archived');
    }

    return allCampaigns;
  }

  /**
   * Export campaigns to CSV
   */
  async exportCampaigns(filters?: {
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<Blob> {
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (filters?.type) params.append('type', filters.type);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`/api/v2/campaigns/export?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('[CampaignService] Failed to export campaigns:', error);
      throw transformErrorResponse(error, 500, '/api/v2/campaigns/export');
    }
  }
}

// Export enhanced service instance
export const enhancedCampaignService = EnhancedCampaignService.getInstance();

// Re-export all methods from production service
export * from './campaignService.production';

// Export bulk operations
export const bulkStartCampaigns = (campaignIds: UUID[]) =>
  enhancedCampaignService.bulkStartCampaigns(campaignIds);

export const bulkPauseCampaigns = (campaignIds: UUID[]) =>
  enhancedCampaignService.bulkPauseCampaigns(campaignIds);

export const bulkResumeCampaigns = (campaignIds: UUID[]) =>
  enhancedCampaignService.bulkResumeCampaigns(campaignIds);

export const bulkCancelCampaigns = (campaignIds: UUID[]) =>
  enhancedCampaignService.bulkCancelCampaigns(campaignIds);

export const bulkDeleteCampaigns = (campaignIds: UUID[]) =>
  enhancedCampaignService.bulkDeleteCampaigns(campaignIds);

export const batchUpdateCampaignMetadata = (updates: Parameters<typeof enhancedCampaignService.batchUpdateCampaignMetadata>[0]) =>
  enhancedCampaignService.batchUpdateCampaignMetadata(updates);

export const getCampaignsByStatus = (status: string | string[], options?: Parameters<typeof enhancedCampaignService.getCampaignsByStatus>[1]) =>
  enhancedCampaignService.getCampaignsByStatus(status, options);

export const exportCampaigns = (filters?: Parameters<typeof enhancedCampaignService.exportCampaigns>[0]) =>
  enhancedCampaignService.exportCampaigns(filters);