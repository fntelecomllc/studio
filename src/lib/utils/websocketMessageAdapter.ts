// src/lib/utils/websocketMessageAdapter.ts
// Simplified WebSocket Message Type Adaptation
// Handles conversion between simple WebSocket messages and legacy message formats

import type { WebSocketMessage, CampaignProgressMessage } from '@/lib/services/websocketService.simple';
import { createUUID, UUID } from '@/lib/types/branded';

/**
 * Converts WebSocket message to legacy format for backward compatibility
 */
export function adaptWebSocketMessageToLegacy(message: WebSocketMessage): CampaignProgressMessage {
  // Helper function to safely extract progress data
  const extractProgressData = (data: unknown) => {
    if (!data || typeof data !== 'object') return { progressPercentage: 0, phase: '', status: '' };
    const obj = data as Record<string, unknown>;
    return {
      progressPercentage: typeof obj.progressPercentage === 'number' ? obj.progressPercentage : 0,
      phase: typeof obj.phase === 'string' ? obj.phase : '',
      status: typeof obj.status === 'string' ? obj.status : '',
    };
  };

  // Handle different message types and convert to legacy format
  switch (message.type) {
    case 'campaign_progress':
      const progressData = extractProgressData(message.data);
      return {
        type: 'progress',
        campaignId: message.campaignId || createUUID('00000000-0000-0000-0000-000000000000'),
        data: {
          progress: progressData.progressPercentage,
          phase: progressData.phase,
          status: progressData.status,
        },
        message: `Campaign progress: ${progressData.progressPercentage}%`,
      };

    case 'domain_generated':
      const domain = message.data && typeof message.data === 'object' && 'domain' in message.data 
        ? String((message.data as Record<string, unknown>).domain) 
        : 'unknown';
      return {
        type: 'domain_generated',
        campaignId: message.campaignId || createUUID('00000000-0000-0000-0000-000000000000'),
        data: {
          domains: [domain],
        },
        message: `Domain generated: ${domain}`,
      };

    case 'dns_validation_result':
    case 'http_validation_result':
      const validationDomain = message.data && typeof message.data === 'object' && 'domain' in message.data 
        ? String((message.data as Record<string, unknown>).domain) 
        : 'unknown';
      return {
        type: 'validation_complete',
        campaignId: message.campaignId || createUUID('00000000-0000-0000-0000-000000000000'),
        data: {
          validationResults: [message.data],
        },
        message: `Validation complete for ${validationDomain}`,
      };

    case 'campaign_phase_complete':
      const phaseData = extractProgressData(message.data);
      return {
        type: 'phase_complete',
        campaignId: message.campaignId || createUUID('00000000-0000-0000-0000-000000000000'),
        data: {
          phase: phaseData.phase,
          status: 'completed',
        },
        message: `Phase ${phaseData.phase} completed`,
      };

    case 'campaign_complete':
      const finalStatus = message.data && typeof message.data === 'object' && 'finalStatus' in message.data 
        ? String((message.data as Record<string, unknown>).finalStatus)
        : 'completed';
      return {
        type: 'phase_complete',
        campaignId: message.campaignId || createUUID('00000000-0000-0000-0000-000000000000'),
        data: {
          status: finalStatus,
        },
        message: `Campaign completed with status: ${finalStatus}`,
      };

    case 'campaign_error':
      const errorMessage = message.data && typeof message.data === 'object' && 'errorMessage' in message.data 
        ? String((message.data as Record<string, unknown>).errorMessage)
        : 'Unknown error';
      return {
        type: 'error',
        campaignId: message.campaignId || createUUID('00000000-0000-0000-0000-000000000000'),
        data: {
          error: errorMessage,
        },
        message: errorMessage,
      };

    case 'connection_ack':
      return {
        type: 'subscription_confirmed',
        campaignId: createUUID('00000000-0000-0000-0000-000000000000'),
        data: {},
        message: 'Connection acknowledged',
      };

    case 'system_notification':
    case 'user_notification':
      const notificationMessage = message.data && typeof message.data === 'object' && 'message' in message.data 
        ? String((message.data as Record<string, unknown>).message)
        : 'System notification';
      return {
        type: 'system_notification',
        campaignId: createUUID('00000000-0000-0000-0000-000000000000'),
        data: {},
        message: notificationMessage,
      };

    default:
      console.warn('Unknown WebSocket message type:', message.type);
      return {
        type: 'subscription_confirmed',
        campaignId: createUUID('00000000-0000-0000-0000-000000000000'),
        data: {},
        message: 'Unknown message type',
      };
  }
}

/**
 * Simple adapter function (alias for backward compatibility)
 */
export function adaptWebSocketMessage(message: WebSocketMessage): CampaignProgressMessage {
  return adaptWebSocketMessageToLegacy(message);
}

/**
 * Type guard to check if a message has campaign-specific data
 */
export function isMessageForCampaign(message: WebSocketMessage, campaignId: UUID): boolean {
  if (message.campaignId) {
    return message.campaignId === campaignId;
  }
  
  // System-wide messages should be processed for all campaigns
  if (message.type === 'system_notification' || message.type === 'connection_ack') {
    return true;
  }
  
  return false;
}

/**
 * Extract campaign ID from various message formats
 */
export function extractCampaignId(message: WebSocketMessage): UUID | null {
  if (message.campaignId) {
    return message.campaignId;
  }
  
  return null;
}
