// src/lib/services/adminService.production.ts
// Admin User Management Service

import apiClient from './apiClient.production';
import type { ModelsUserAPI } from '@/lib/api-client/models/models-user-api';
import type { ApiResponse } from '@/lib/types';

// Type aliases for better API clarity
export type User = ModelsUserAPI;

export interface CreateUserRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
  isActive?: boolean;
  mustChangePassword?: boolean;
  [key: string]: unknown; // Index signature for API compatibility
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  name?: string;
  avatarUrl?: string;
  roles?: string[];
  permissions?: string[];
  isActive?: boolean;
  isLocked?: boolean;
  mustChangePassword?: boolean;
  mfaEnabled?: boolean;
  [key: string]: unknown; // Index signature for API compatibility
}

// Response types
export type UserListResponse = ApiResponse<User[]>;
export type UserDetailResponse = ApiResponse<User>;
export type UserCreateResponse = ApiResponse<User>;
export type UserUpdateResponse = ApiResponse<User>;
export type UserDeleteResponse = ApiResponse<null>;

class AdminService {
  private static instance: AdminService;

  static getInstance(): AdminService {
    if (!AdminService.instance) {
      AdminService.instance = new AdminService();
    }
    return AdminService.instance;
  }

  // User Management Methods

  async getUsers(filters?: {
    isActive?: boolean;
    isLocked?: boolean;
    role?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<UserListResponse> {
    try {
      console.log('[AdminService] Getting users with filters:', filters);
      const response = await apiClient.get<User[]>('/api/v2/admin/users', { params: filters });
      console.log('[AdminService] Get users response:', response);
      return response;
    } catch (error) {
      console.error('[AdminService] Failed to get users:', error);
      throw error;
    }
  }

  async getUserById(userId: string): Promise<UserDetailResponse> {
    try {
      console.log('[AdminService] Getting user by ID:', userId);
      const response = await apiClient.get<User>(`/api/v2/admin/users/${userId}`);
      console.log('[AdminService] Get user response:', response);
      return response;
    } catch (error) {
      console.error('[AdminService] Failed to get user:', error);
      throw error;
    }
  }

  async createUser(userData: CreateUserRequest): Promise<UserCreateResponse> {
    try {
      console.log('[AdminService] Creating user:', userData);
      const response = await apiClient.post<User>('/api/v2/admin/users', userData);
      console.log('[AdminService] Create user response:', response);
      return response;
    } catch (error) {
      console.error('[AdminService] Failed to create user:', error);
      throw error;
    }
  }

  async updateUser(userId: string, userData: UpdateUserRequest): Promise<UserUpdateResponse> {
    try {
      console.log('[AdminService] Updating user:', userId, userData);
      const response = await apiClient.put<User>(`/api/v2/admin/users/${userId}`, userData);
      console.log('[AdminService] Update user response:', response);
      return response;
    } catch (error) {
      console.error('[AdminService] Failed to update user:', error);
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<UserDeleteResponse> {
    try {
      console.log('[AdminService] Deleting user:', userId);
      const response = await apiClient.delete<null>(`/api/v2/admin/users/${userId}`);
      console.log('[AdminService] Delete user response:', response);
      return response;
    } catch (error) {
      console.error('[AdminService] Failed to delete user:', error);
      throw error;
    }
  }

  // User Control Methods

  async activateUser(userId: string): Promise<UserUpdateResponse> {
    try {
      console.log('[AdminService] Activating user:', userId);
      return await this.updateUser(userId, { isActive: true });
    } catch (error) {
      console.error('[AdminService] Failed to activate user:', error);
      throw error;
    }
  }

  async deactivateUser(userId: string): Promise<UserUpdateResponse> {
    try {
      console.log('[AdminService] Deactivating user:', userId);
      return await this.updateUser(userId, { isActive: false });
    } catch (error) {
      console.error('[AdminService] Failed to deactivate user:', error);
      throw error;
    }
  }

  async lockUser(userId: string): Promise<UserUpdateResponse> {
    try {
      console.log('[AdminService] Locking user:', userId);
      return await this.updateUser(userId, { isLocked: true });
    } catch (error) {
      console.error('[AdminService] Failed to lock user:', error);
      throw error;
    }
  }

  async unlockUser(userId: string): Promise<UserUpdateResponse> {
    try {
      console.log('[AdminService] Unlocking user:', userId);
      return await this.updateUser(userId, { isLocked: false });
    } catch (error) {
      console.error('[AdminService] Failed to unlock user:', error);
      throw error;
    }
  }

  async updateUserRoles(userId: string, roles: string[]): Promise<UserUpdateResponse> {
    try {
      console.log('[AdminService] Updating user roles:', userId, roles);
      return await this.updateUser(userId, { roles });
    } catch (error) {
      console.error('[AdminService] Failed to update user roles:', error);
      throw error;
    }
  }

  async updateUserPermissions(userId: string, permissions: string[]): Promise<UserUpdateResponse> {
    try {
      console.log('[AdminService] Updating user permissions:', userId, permissions);
      return await this.updateUser(userId, { permissions });
    } catch (error) {
      console.error('[AdminService] Failed to update user permissions:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const adminService = AdminService.getInstance();
export default adminService;
