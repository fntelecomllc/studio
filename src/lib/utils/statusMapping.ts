/**
 * Status Mapping Utilities
 * Maps between frontend and backend campaign status representations
 */

import { CampaignStatus } from '@/lib/types';
import { logger } from '@/lib/utils/logger';

// Define the actual status values used by the system
export const CAMPAIGN_STATUSES = {
  PENDING: 'pending',
  QUEUED: 'queued', 
  RUNNING: 'running',
  PAUSING: 'pausing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled'
} as const;

export type ValidCampaignStatus = typeof CAMPAIGN_STATUSES[keyof typeof CAMPAIGN_STATUSES];

// All valid status values as array
export const ALL_CAMPAIGN_STATUSES: CampaignStatus[] = [
  'pending',
  'queued',
  'running', 
  'pausing',
  'paused',
  'completed',
  'failed',
  'archived',
  'cancelled'
];

/**
 * Check if a string is a valid campaign status
 */
export function isValidCampaignStatus(status: string): status is CampaignStatus {
  return ALL_CAMPAIGN_STATUSES.includes(status as CampaignStatus);
}

/**
 * Normalize status from unknown source to valid campaign status
 */
export function normalizeStatus(status: unknown): CampaignStatus {
  if (typeof status !== 'string') {
    return 'pending';
  }

  const lowercaseStatus = status.toLowerCase();
  
  // Direct match
  if (isValidCampaignStatus(lowercaseStatus)) {
    return lowercaseStatus;
  }

  // Handle common variations and legacy statuses
  switch (lowercaseStatus) {
    case 'draft':
    case 'created':
    case 'new':
      return 'pending';
    
    case 'scheduled':
    case 'ready':
      return 'queued';
    
    case 'active':
    case 'in_progress':
    case 'inprogress':
      return 'running';
    
    case 'stopping':
    case 'stop':
      return 'pausing';
    
    case 'stopped':
    case 'halted':
      return 'paused';
    
    case 'done':
    case 'finished':
    case 'success':
    case 'succeeded':
      return 'completed';
    
    case 'error':
    case 'errored':
    case 'failure':
      return 'failed';
    
    case 'deleted':
    case 'removed':
      return 'archived';
    
    case 'aborted':
    case 'terminated':
      return 'cancelled';
    
    default:
      logger.warn('Unknown status value encountered, defaulting to pending', {
        component: 'StatusMapping',
        status,
        action: 'normalizeStatus'
      });
      return 'pending';
  }
}

/**
 * Get status display name for UI
 */
export function getStatusDisplayName(status: CampaignStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'pausing':
      return 'Pausing';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'archived':
      return 'Archived';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
}

/**
 * Get status color for UI (Tailwind classes)
 */
export function getStatusColor(status: CampaignStatus): string {
  switch (status) {
    case 'pending':
      return 'text-yellow-600 bg-yellow-50';
    case 'queued':
      return 'text-blue-600 bg-blue-50';
    case 'running':
      return 'text-green-600 bg-green-50';
    case 'pausing':
      return 'text-orange-600 bg-orange-50';
    case 'paused':
      return 'text-gray-600 bg-gray-50';
    case 'completed':
      return 'text-green-700 bg-green-100';
    case 'failed':
      return 'text-red-600 bg-red-50';
    case 'archived':
      return 'text-gray-500 bg-gray-100';
    case 'cancelled':
      return 'text-red-500 bg-red-100';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

/**
 * Check if a status represents an active/running state
 */
export function isActiveStatus(status: CampaignStatus): boolean {
  return ['running', 'pausing'].includes(status);
}

/**
 * Check if a status represents a terminal/final state
 */
export function isTerminalStatus(status: CampaignStatus): boolean {
  return ['completed', 'failed', 'archived', 'cancelled'].includes(status);
}

/**
 * Check if a status can be transitioned to running
 */
export function canStart(status: CampaignStatus): boolean {
  return ['pending', 'queued', 'paused'].includes(status);
}

/**
 * Check if a status can be paused
 */
export function canPause(status: CampaignStatus): boolean {
  return ['running'].includes(status);
}

/**
 * Check if a status can be cancelled
 */
export function canCancel(status: CampaignStatus): boolean {
  return !isTerminalStatus(status);
}
