/**
 * Example integration of the generated API client
 * This file demonstrates how to use the auto-generated TypeScript API client
 */

import {
  AuthenticationApi,
  CampaignsApi,
  Configuration,
  type ModelsLoginRequest,
  type ModelsUserAPI,
  type ServicesCreateCampaignRequest,
} from '@/lib/api-client';
import { logger } from '@/lib/utils/logger';

// Configure the API client
const configuration = new Configuration({
  basePath: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080',
  // Add any default headers or authentication here
});

// Create API instances
export const authApi = new AuthenticationApi(configuration);
export const campaignsApi = new CampaignsApi(configuration);

/**
 * Authentication Service using generated client
 */
export class AuthService {
  /**
   * Login user with email and password
   */
  static async login(email: string, password: string) {
    const loginRequest: ModelsLoginRequest = {
      email,
      password
    };

    try {
      const response = await authApi.authLoginPost(loginRequest);
      return response.data;
    } catch (error: unknown) {
      logger.error('Login failed', {
        component: 'AuthService',
        method: 'login',
        email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get current user information
   */
  static async getCurrentUser(): Promise<ModelsUserAPI> {
    try {
      const response = await authApi.authMeGet();
      return response.data;
    } catch (error: unknown) {
      logger.error('Failed to get current user', {
        component: 'AuthService',
        method: 'getCurrentUser',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

/**
 * Campaign Service using generated client
 */
export class CampaignService {
  /**
   * Get list of campaigns with filtering
   */
  static async getCampaigns(params?: {
    limit?: number;
    offset?: number;
    type?: 'domain_generation' | 'dns_validation' | 'http_keyword_validation';
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  }) {
    try {
      const response = await campaignsApi.campaignsGet(
        params?.limit,
        params?.offset,
        params?.type,
        params?.status
      );
      return response.data;
    } catch (error: unknown) {
      logger.error('Failed to get campaigns', {
        component: 'CampaignService',
        method: 'getCampaigns',
        params,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create a new campaign
   */
  static async createCampaign(campaignData: unknown) {
    try {
      // Type assertion for API compatibility - validation should be done before this call
      const response = await campaignsApi.campaignsPost(campaignData as ServicesCreateCampaignRequest);
      return response.data;
    } catch (error: unknown) {
      logger.error('Failed to create campaign', {
        component: 'CampaignService',
        method: 'createCampaign',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

/**
 * Type-safe error handling helper
 */
export function isApiError(error: unknown): error is { response: { data: { message: string; code: number } } } {
  return typeof error === 'object' && 
         error !== null && 
         'response' in error && 
         typeof (error as Record<string, unknown>).response === 'object' &&
         (error as Record<string, unknown>).response !== null &&
         'data' in ((error as Record<string, unknown>).response as Record<string, unknown>) &&
         typeof ((error as Record<string, unknown>).response as Record<string, unknown>).data === 'object' &&
         ((error as Record<string, unknown>).response as Record<string, unknown>).data !== null &&
         'message' in (((error as Record<string, unknown>).response as Record<string, unknown>).data as Record<string, unknown>);
}

/**
 * Example React Hook using the API client
 */
export function useAuth() {
  const [user, setUser] = React.useState<ModelsUserAPI | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await AuthService.login(email, password);
      const userData = await AuthService.getCurrentUser();
      setUser(userData);
    } catch (error: unknown) {
      if (isApiError(error)) {
        throw new Error(error.response.data.message);
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCurrentUser = async () => {
    setIsLoading(true);
    try {
      const userData = await AuthService.getCurrentUser();
      setUser(userData);
    } catch (_error: unknown) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    user,
    isLoading,
    login,
    fetchCurrentUser
  };
}

// Add React import for the hook
import React from 'react';
