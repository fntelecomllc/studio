/**
 * Test for H-005: Campaign Status Enum - Remove 'archived' status
 * 
 * Backend doesn't include 'archived' in CampaignStatusEnum,
 * but frontend was including it, causing contract violation.
 */

import { ModelsCampaignStatusEnum } from '../models-campaign-status-enum';

describe('H-005: Campaign Status Enum Contract Alignment', () => {
  it('should not include archived status (not in backend)', () => {
    // Verify that 'archived' is NOT in the enum
    const statusValues = Object.values(ModelsCampaignStatusEnum);
    expect(statusValues).not.toContain('archived');
    
    // Verify all valid statuses are present
    expect(statusValues).toContain('pending');
    expect(statusValues).toContain('queued');
    expect(statusValues).toContain('running');
    expect(statusValues).toContain('pausing');
    expect(statusValues).toContain('paused');
    expect(statusValues).toContain('completed');
    expect(statusValues).toContain('failed');
    expect(statusValues).toContain('cancelled');
  });

  it('should have exactly 8 status values (matching backend)', () => {
    const statusValues = Object.values(ModelsCampaignStatusEnum);
    expect(statusValues).toHaveLength(8);
  });

  it('should not have CampaignStatusArchived key', () => {
    expect('CampaignStatusArchived' in ModelsCampaignStatusEnum).toBe(false);
  });

  it('should match backend enum values exactly', () => {
    // These are the exact values from backend models.go
    const backendStatuses = [
      'pending',
      'queued',
      'running',
      'pausing',
      'paused',
      'completed',
      'failed',
      'cancelled'
    ];

    const frontendStatuses = Object.values(ModelsCampaignStatusEnum);
    
    // Should have same values
    expect(frontendStatuses.sort()).toEqual(backendStatuses.sort());
  });

  it('should be usable in TypeScript type checking', () => {
    // Type test - this should compile without errors
    type StatusType = typeof ModelsCampaignStatusEnum[keyof typeof ModelsCampaignStatusEnum];
    
    const validStatus: StatusType = ModelsCampaignStatusEnum.CampaignStatusRunning;
    expect(validStatus).toBe('running');

    // This would cause a TypeScript error if 'archived' was a valid value
    // @ts-expect-error - 'archived' is not a valid status
    const invalidStatus: StatusType = 'archived';
  });
});