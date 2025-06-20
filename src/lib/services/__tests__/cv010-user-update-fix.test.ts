/**
 * CV-010 Fix Verification Test
 *
 * This test verifies that the PUT /api/v2/admin/users/{id} endpoint
 * is properly integrated in the frontend service, resolving CV-010
 * from CONTRACT_VIOLATIONS_MATRIX.
 */

import { adminService, updateUser } from '@/lib/services/adminService';
import apiClient from '@/lib/services/apiClient.production';
import type { UUID } from '@/lib/types/branded';
import type { UpdateUserRequest } from '@/lib/services/adminService';

// Mock the API client
jest.mock('@/lib/services/apiClient.production', () => ({
  default: {
    put: jest.fn(),
  },
}));

describe('CV-010: User Update Endpoint Integration', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000' as UUID;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call PUT /api/v2/admin/users/{id} endpoint', async () => {
    // Arrange
    const updateRequest: UpdateUserRequest = {
      firstName: 'Updated',
      lastName: 'User',
      isActive: true,
      roleIds: ['456e7890-e89b-12d3-a456-426614174001' as UUID],
    };

    const mockResponse = {
      data: {
        id: mockUserId,
        email: 'test@example.com',
        emailVerified: true,
        firstName: 'Updated',
        lastName: 'User',
        isActive: true,
        isLocked: false,
        failedLoginAttempts: 0,
        mfaEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        roles: [{ id: '456e7890-e89b-12d3-a456-426614174001', name: 'admin' }],
      },
    };

    (apiClient.put as jest.Mock).mockResolvedValueOnce(mockResponse);

    // Act
    const result = await updateUser(mockUserId, updateRequest);

    // Assert
    expect(apiClient.put).toHaveBeenCalledWith(
      `/api/v2/admin/users/${mockUserId}`,
      updateRequest
    );
    expect(result).toBeDefined();
    expect(result.id).toBe(mockUserId);
    expect(result.firstName).toBe('Updated');
    expect(result.lastName).toBe('User');
  });

  it('should handle partial updates correctly', async () => {
    // Arrange
    const partialUpdate: UpdateUserRequest = {
      isActive: false,
    };

    const mockResponse = {
      data: {
        id: mockUserId,
        email: 'test@example.com',
        emailVerified: true,
        firstName: 'Original',
        lastName: 'Name',
        isActive: false,
        isLocked: false,
        failedLoginAttempts: 0,
        mfaEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    (apiClient.put as jest.Mock).mockResolvedValueOnce(mockResponse);

    // Act
    const result = await adminService.updateUser(mockUserId, partialUpdate);

    // Assert
    expect(apiClient.put).toHaveBeenCalledWith(
      `/api/v2/admin/users/${mockUserId}`,
      partialUpdate
    );
    expect(result.isActive).toBe(false);
  });

  it('should handle role updates correctly', async () => {
    // Arrange
    const roleUpdate: UpdateUserRequest = {
      roleIds: [
        '111e4567-e89b-12d3-a456-426614174001' as UUID,
        '222e4567-e89b-12d3-a456-426614174002' as UUID,
      ],
    };

    const mockResponse = {
      data: {
        id: mockUserId,
        email: 'test@example.com',
        emailVerified: true,
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        isLocked: false,
        failedLoginAttempts: 0,
        mfaEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        roles: [
          { id: '111e4567-e89b-12d3-a456-426614174001', name: 'admin' },
          { id: '222e4567-e89b-12d3-a456-426614174002', name: 'editor' },
        ],
      },
    };

    (apiClient.put as jest.Mock).mockResolvedValueOnce(mockResponse);

    // Act
    const result = await adminService.updateUser(mockUserId, roleUpdate);

    // Assert
    expect(apiClient.put).toHaveBeenCalledWith(
      `/api/v2/admin/users/${mockUserId}`,
      roleUpdate
    );
    expect(result.roles).toHaveLength(2);
    if (result.roles) {
      expect(result.roles[0]!.name).toBe('admin');
      expect(result.roles[1]!.name).toBe('editor');
    }
  });

  it('should handle 404 errors when user not found', async () => {
    // Arrange
    const updateRequest: UpdateUserRequest = {
      firstName: 'Should',
      lastName: 'Fail',
    };

    (apiClient.put as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 404,
        data: {
          error: 'User not found',
        },
      },
    });

    // Act & Assert
    await expect(
      adminService.updateUser('999e4567-e89b-12d3-a456-426614174999' as UUID, updateRequest)
    ).rejects.toThrow();
  });

  it('should handle validation errors correctly', async () => {
    // Arrange
    const invalidUpdate: UpdateUserRequest = {
      firstName: '', // Empty name should fail validation
    };

    (apiClient.put as jest.Mock).mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: 'Validation failed: firstName cannot be empty',
        },
      },
    });

    // Act & Assert
    await expect(
      adminService.updateUser(mockUserId, invalidUpdate)
    ).rejects.toThrow();
  });

  it('should verify the endpoint path matches backend registration', () => {
    // This test verifies that the frontend is using the correct endpoint path
    // that matches what's registered in the backend (main.go line 324)
    const expectedPath = `/api/v2/admin/users/${mockUserId}`;
    
    // Call the service
    adminService.updateUser(mockUserId, { firstName: 'Test' }).catch(() => {});
    
    // Verify the correct path was used
    expect(apiClient.put).toHaveBeenCalledWith(
      expectedPath,
      expect.any(Object)
    );
  });
});

describe('CV-010: Endpoint Contract Alignment', () => {
  const mockUserId = '123e4567-e89b-12d3-a456-426614174000' as UUID;
  it('should send request in the format expected by backend', async () => {
    // The backend expects UpdateUserRequest format
    const request: UpdateUserRequest = {
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
      roleIds: ['123e4567-e89b-12d3-a456-426614174001' as UUID],
    };

    (apiClient.put as jest.Mock).mockResolvedValueOnce({ data: {} });

    await adminService.updateUser(mockUserId, request).catch(() => {});

    // Verify the request body matches backend expectations
    expect(apiClient.put).toHaveBeenCalledWith(
      expect.any(String),
      {
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        roleIds: ['123e4567-e89b-12d3-a456-426614174001'],
      }
    );
  });

  it('should receive response in the format provided by backend', async () => {
    // The backend returns UserResponse format (from user_handlers.go)
    const backendResponse = {
      id: mockUserId,
      email: 'user@example.com',
      emailVerified: true,
      firstName: 'John',
      lastName: 'Doe',
      avatarUrl: null,
      isActive: true,
      isLocked: false,
      failedLoginAttempts: 0,
      lastLoginAt: '2025-06-20T12:00:00Z',
      mfaEnabled: false,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-06-20T12:00:00Z',
      roles: ['admin', 'user'],
    };

    (apiClient.put as jest.Mock).mockResolvedValueOnce({ data: backendResponse });

    const result = await adminService.updateUser(mockUserId, { firstName: 'John' });

    // Verify the response is properly transformed
    expect(result.id).toBe(mockUserId);
    expect(result.email).toBe('user@example.com');
    expect(result.firstName).toBe('John');
    expect(result.roles).toBeDefined();
  });
});