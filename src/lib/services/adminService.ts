/**
 * Admin Service - User Management and System Administration
 * 
 * Provides comprehensive admin functionality for user management,
 * role assignments, and system administration tasks.
 */

import apiClient from './apiClient.production';
import { transformUserResponse, type ModelsUserAPI } from '@/lib/types/models-aligned';
import { transformErrorResponse, ApiError } from '@/lib/api/transformers/error-transformers';
import { validateUserResponse, validateOrThrow } from '@/lib/validation/runtime-validators';
import type { UUID, SafeBigInt } from '@/lib/types/branded';

/**
 * User list response with pagination
 */
export interface UserListResponse {
  users: ModelsUserAPI[];
  pagination: {
    page: number;
    limit: number;
    total: SafeBigInt;
    totalPages: number;
  };
}

/**
 * Create user request
 */
export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  roleIds?: UUID[];
}

/**
 * Update user request
 */
export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  roleIds?: UUID[];
}

/**
 * Bulk operation request
 */
export interface BulkOperationRequest<T> {
  ids: UUID[];
  operation: 'activate' | 'deactivate' | 'delete' | 'assignRole' | 'removeRole';
  data?: T;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  successful: UUID[];
  failed: Array<{
    id: UUID;
    error: string;
  }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}

class AdminService {
  private static instance: AdminService;
  private readonly basePath = '/api/v2/admin';

  private constructor() {}

  static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService();
    }
    return AdminService.instance;
  }

  /**
   * List all users with pagination
   */
  async listUsers(params?: {
    page?: number;
    limit?: number;
  }): Promise<UserListResponse> {
    try {
      const response = await apiClient.get<{
        users: unknown[];
        pagination: {
          page: number;
          limit: number;
          total: SafeBigInt;
          totalPages: number;
        };
      }>(
        `${this.basePath}/users`,
        { params: params || { page: 1, limit: 10 } }
      );

      // Validate and transform users
      const users = response.data?.users.map((user: unknown) => {
        const transformed = transformUserResponse(user);
        const validation = validateUserResponse(transformed);
        if (!validation.isValid) {
          console.error('Invalid user data:', validation.errors);
        }
        return transformed;
      }) || [];

      return {
        users,
        pagination: response.data?.pagination || {
          page: 1,
          limit: 10,
          total: 0n as SafeBigInt,
          totalPages: 0
        }
      };
    } catch (error) {
      console.error('[AdminService] Failed to list users:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users`);
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: UUID): Promise<ModelsUserAPI> {
    try {
      const response = await apiClient.get<unknown>(
        `${this.basePath}/users/${userId}`
      );

      const transformed = transformUserResponse(response.data);
      validateOrThrow(transformed, validateUserResponse, 'User response validation failed');
      
      return transformed;
    } catch (error) {
      console.error('[AdminService] Failed to get user:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/${userId}`);
    }
  }

  /**
   * Create a new user
   */
  async createUser(request: CreateUserRequest): Promise<ModelsUserAPI> {
    try {
      const response = await apiClient.post<unknown>(
        `${this.basePath}/users`,
        request as unknown as Record<string, unknown>
      );

      const transformed = transformUserResponse(response.data);
      validateOrThrow(transformed, validateUserResponse, 'User response validation failed');
      
      return transformed;
    } catch (error) {
      console.error('[AdminService] Failed to create user:', error);
      if (error instanceof ApiError && error.statusCode === 409) {
        throw new ApiError({
          code: 'USER_EXISTS',
          message: 'A user with this email already exists',
          details: [{ message: 'User already exists' }],
          statusCode: 409,
          timestamp: new Date().toISOString(),
          path: `${this.basePath}/users`
        });
      }
      throw transformErrorResponse(error, 500, `${this.basePath}/users`);
    }
  }

  /**
   * Update user
   */
  async updateUser(userId: UUID, request: UpdateUserRequest): Promise<ModelsUserAPI> {
    try {
      const response = await apiClient.put<unknown>(
        `${this.basePath}/users/${userId}`,
        request as unknown as Record<string, unknown>
      );

      const transformed = transformUserResponse(response.data);
      validateOrThrow(transformed, validateUserResponse, 'User response validation failed');
      
      return transformed;
    } catch (error) {
      console.error('[AdminService] Failed to update user:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/${userId}`);
    }
  }

  /**
   * Delete user
   */
  async deleteUser(userId: UUID): Promise<void> {
    try {
      await apiClient.delete(`${this.basePath}/users/${userId}`);
    } catch (error) {
      console.error('[AdminService] Failed to delete user:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/${userId}`);
    }
  }

  /**
   * Bulk activate users
   */
  async bulkActivateUsers(userIds: UUID[]): Promise<BulkOperationResult> {
    return this.performBulkOperation(userIds, async (userId) => {
      await this.updateUser(userId, { isActive: true });
    });
  }

  /**
   * Bulk deactivate users
   */
  async bulkDeactivateUsers(userIds: UUID[]): Promise<BulkOperationResult> {
    return this.performBulkOperation(userIds, async (userId) => {
      await this.updateUser(userId, { isActive: false });
    });
  }

  /**
   * Bulk delete users
   */
  async bulkDeleteUsers(userIds: UUID[]): Promise<BulkOperationResult> {
    return this.performBulkOperation(userIds, async (userId) => {
      await this.deleteUser(userId);
    });
  }

  /**
   * Bulk assign role to users
   */
  async bulkAssignRole(userIds: UUID[], roleId: UUID): Promise<BulkOperationResult> {
    return this.performBulkOperation(userIds, async (userId) => {
      const user = await this.getUserById(userId);
      const currentRoleIds = user.roles?.map(r => r.id) || [];
      if (!currentRoleIds.includes(roleId)) {
        await this.updateUser(userId, {
          roleIds: [...currentRoleIds, roleId]
        });
      }
    });
  }

  /**
   * Bulk remove role from users
   */
  async bulkRemoveRole(userIds: UUID[], roleId: UUID): Promise<BulkOperationResult> {
    return this.performBulkOperation(userIds, async (userId) => {
      const user = await this.getUserById(userId);
      const currentRoleIds = user.roles?.map(r => r.id) || [];
      const newRoleIds = currentRoleIds.filter(id => id !== roleId);
      if (newRoleIds.length !== currentRoleIds.length) {
        await this.updateUser(userId, { roleIds: newRoleIds });
      }
    });
  }

  /**
   * Generic bulk operation handler
   */
  private async performBulkOperation(
    ids: UUID[],
    operation: (id: UUID) => Promise<void>
  ): Promise<BulkOperationResult> {
    const successful: UUID[] = [];
    const failed: Array<{ id: UUID; error: string }> = [];

    // Process in parallel with concurrency limit
    const concurrencyLimit = 5;
    const chunks = this.chunkArray(ids, concurrencyLimit);

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (id) => {
          try {
            await operation(id);
            successful.push(id);
          } catch (error) {
            failed.push({
              id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        })
      );
    }

    return {
      successful,
      failed,
      totalProcessed: ids.length,
      successCount: successful.length,
      failureCount: failed.length
    };
  }

  /**
   * Utility to chunk array
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Search users
   */
  async searchUsers(query: string, filters?: {
    role?: string;
    isActive?: boolean;
    limit?: number;
  }): Promise<ModelsUserAPI[]> {
    try {
      const response = await apiClient.get<unknown[]>(
        `${this.basePath}/users/search`,
        {
          params: {
            q: query,
            ...filters
          }
        }
      );

      return response.data?.map((user: unknown) => {
        const transformed = transformUserResponse(user);
        validateOrThrow(transformed, validateUserResponse, 'User response validation failed');
        return transformed;
      }) || [];
    } catch (error) {
      console.error('[AdminService] Failed to search users:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/search`);
    }
  }

  /**
   * Get user activity logs
   */
  async getUserActivityLogs(userId: UUID, params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    try {
      const response = await apiClient.get<Array<Record<string, unknown>>>(
        `${this.basePath}/users/${userId}/activity`,
        { params }
      );

      return response.data || [];
    } catch (error) {
      console.error('[AdminService] Failed to get user activity:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/${userId}/activity`);
    }
  }

  /**
   * Reset user password (admin action)
   */
  async resetUserPassword(userId: UUID, temporaryPassword: string): Promise<void> {
    try {
      await apiClient.post(
        `${this.basePath}/users/${userId}/reset-password`,
        { temporaryPassword }
      );
    } catch (error) {
      console.error('[AdminService] Failed to reset user password:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/${userId}/reset-password`);
    }
  }

  /**
   * Unlock user account
   */
  async unlockUserAccount(userId: UUID): Promise<void> {
    try {
      await apiClient.post(`${this.basePath}/users/${userId}/unlock`);
    } catch (error) {
      console.error('[AdminService] Failed to unlock user account:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/${userId}/unlock`);
    }
  }

  /**
   * Export users to CSV
   */
  async exportUsers(filters?: {
    role?: string;
    isActive?: boolean;
  }): Promise<Blob> {
    try {
      // Production API client doesn't support responseType, so we need to use fetch directly
      const params = new URLSearchParams();
      if (filters?.role) params.append('role', filters.role);
      if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
      
      const response = await fetch(`${this.basePath}/users/export?${params}`, {
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
      console.error('[AdminService] Failed to export users:', error);
      throw transformErrorResponse(error, 500, `${this.basePath}/users/export`);
    }
  }
}

// Export singleton instance
export const adminService = AdminService.getInstance();

// Export convenience functions
export const listUsers = (params?: Parameters<typeof adminService.listUsers>[0]) =>
  adminService.listUsers(params);

export const getUserById = (userId: UUID) =>
  adminService.getUserById(userId);

export const createUser = (request: CreateUserRequest) =>
  adminService.createUser(request);

export const updateUser = (userId: UUID, request: UpdateUserRequest) =>
  adminService.updateUser(userId, request);

export const deleteUser = (userId: UUID) =>
  adminService.deleteUser(userId);

export const bulkActivateUsers = (userIds: UUID[]) =>
  adminService.bulkActivateUsers(userIds);

export const bulkDeactivateUsers = (userIds: UUID[]) =>
  adminService.bulkDeactivateUsers(userIds);

export const bulkDeleteUsers = (userIds: UUID[]) =>
  adminService.bulkDeleteUsers(userIds);

export const bulkAssignRole = (userIds: UUID[], roleId: UUID) =>
  adminService.bulkAssignRole(userIds, roleId);

export const bulkRemoveRole = (userIds: UUID[], roleId: UUID) =>
  adminService.bulkRemoveRole(userIds, roleId);

export const searchUsers = (query: string, filters?: Parameters<typeof adminService.searchUsers>[1]) =>
  adminService.searchUsers(query, filters);

export const getUserActivityLogs = (userId: UUID, params?: Parameters<typeof adminService.getUserActivityLogs>[1]) =>
  adminService.getUserActivityLogs(userId, params);

export const resetUserPassword = (userId: UUID, temporaryPassword: string) =>
  adminService.resetUserPassword(userId, temporaryPassword);

export const unlockUserAccount = (userId: UUID) =>
  adminService.unlockUserAccount(userId);

export const exportUsers = (filters?: Parameters<typeof adminService.exportUsers>[0]) =>
  adminService.exportUsers(filters);