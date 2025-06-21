// src/lib/services/adminService.production.ts
// Admin User Management Service

import apiClient from './apiClient.production';
import type { ModelsUserAPI } from '@/lib/api-client/models/models-user-api';
import type { ApiResponse } from '@/lib/types';
import { logger } from '@/lib/utils/logger';

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
      logger.api('Fetching users list', { filters, endpoint: '/api/v2/admin/users' });
      const response = await apiClient.get<User[]>('/api/v2/admin/users', { params: filters });
      logger.api('Users list retrieved successfully', {
        userCount: response.data?.length || 0,
        status: response.status
      });
      return response;
    } catch (error) {
      logger.error('Failed to retrieve users list', error, { component: 'AdminService', operation: 'getUsers' });
      throw error;
    }
  }

  async getUserById(userId: string): Promise<UserDetailResponse> {
    try {
      logger.api('Fetching user by ID', { userId, endpoint: `/api/v2/admin/users/${userId}` });
      const response = await apiClient.get<User>(`/api/v2/admin/users/${userId}`);
      logger.api('User details retrieved successfully', {
        userId,
        status: response.status,
        userEmail: response.data?.email || 'unknown'
      });
      return response;
    } catch (error) {
      logger.error('Failed to retrieve user details', error, { component: 'AdminService', operation: 'getUserById', userId });
      throw error;
    }
  }

  async createUser(userData: CreateUserRequest): Promise<UserCreateResponse> {
    try {
      logger.api('Creating new user', { userEmail: userData.email, endpoint: '/api/v2/admin/users' });
      const response = await apiClient.post<User>('/api/v2/admin/users', userData);
      logger.api('User created successfully', {
        userId: response.data?.id,
        userEmail: response.data?.email,
        status: response.status
      });
      return response;
    } catch (error) {
      logger.error('Failed to create user', error, { component: 'AdminService', operation: 'createUser', userEmail: userData.email });
      throw error;
    }
  }

  async updateUser(userId: string, userData: UpdateUserRequest): Promise<UserUpdateResponse> {
    try {
      logger.api('Updating user', { userId, endpoint: `/api/v2/admin/users/${userId}` });
      const response = await apiClient.put<User>(`/api/v2/admin/users/${userId}`, userData);
      logger.api('User updated successfully', {
        userId,
        status: response.status,
        userEmail: response.data?.email || 'unknown'
      });
      return response;
    } catch (error) {
      logger.error('Failed to update user', error, { component: 'AdminService', operation: 'updateUser', userId });
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<UserDeleteResponse> {
    try {
      logger.api('Deleting user', { userId, endpoint: `/api/v2/admin/users/${userId}` });
      const response = await apiClient.delete<null>(`/api/v2/admin/users/${userId}`);
      logger.api('User deleted successfully', {
        userId,
        status: response.status
      });
      return response;
    } catch (error) {
      logger.error('Failed to delete user', error, { component: 'AdminService', operation: 'deleteUser', userId });
      throw error;
    }
  }

  // User Control Methods

  async activateUser(userId: string): Promise<UserUpdateResponse> {
    try {
      logger.api('Activating user', { userId, operation: 'activate' });
      return await this.updateUser(userId, { isActive: true });
    } catch (error) {
      logger.error('Failed to activate user', error, { component: 'AdminService', operation: 'activateUser', userId });
      throw error;
    }
  }

  async deactivateUser(userId: string): Promise<UserUpdateResponse> {
    try {
      logger.api('Deactivating user', { userId, operation: 'deactivate' });
      return await this.updateUser(userId, { isActive: false });
    } catch (error) {
      logger.error('Failed to deactivate user', error, { component: 'AdminService', operation: 'deactivateUser', userId });
      throw error;
    }
  }

  async lockUser(userId: string): Promise<UserUpdateResponse> {
    try {
      logger.api('Locking user', { userId, operation: 'lock' });
      return await this.updateUser(userId, { isLocked: true });
    } catch (error) {
      logger.error('Failed to lock user', error, { component: 'AdminService', operation: 'lockUser', userId });
      throw error;
    }
  }

  async unlockUser(userId: string): Promise<UserUpdateResponse> {
    try {
      logger.api('Unlocking user', { userId, operation: 'unlock' });
      return await this.updateUser(userId, { isLocked: false });
    } catch (error) {
      logger.error('Failed to unlock user', error, { component: 'AdminService', operation: 'unlockUser', userId });
      throw error;
    }
  }

  async updateUserRoles(userId: string, roles: string[]): Promise<UserUpdateResponse> {
    try {
      logger.api('Updating user roles', { userId, rolesCount: roles.length });
      return await this.updateUser(userId, { roles });
    } catch (error) {
      logger.error('Failed to update user roles', error, { component: 'AdminService', operation: 'updateUserRoles', userId });
      throw error;
    }
  }

  async updateUserPermissions(userId: string, permissions: string[]): Promise<UserUpdateResponse> {
    try {
      logger.api('Updating user permissions', { userId, permissionsCount: permissions.length });
      return await this.updateUser(userId, { permissions });
    } catch (error) {
      logger.error('Failed to update user permissions', error, { component: 'AdminService', operation: 'updateUserPermissions', userId });
      throw error;
    }
  }
}

// Export singleton instance
export const adminService = AdminService.getInstance();
export default adminService;
