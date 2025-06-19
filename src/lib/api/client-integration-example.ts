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
  type ModelsCampaignAPI
} from '@/lib/api-client';

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
    } catch (error) {
      console.error('Login failed:', error);
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
    } catch (error) {
      console.error('Failed to get current user:', error);
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
    } catch (error) {
      console.error('Failed to get campaigns:', error);
      throw error;
    }
  }

  /**
   * Create a new campaign
   */
  static async createCampaign(campaignData: any) {
    try {
      const response = await campaignsApi.campaignsPost(campaignData);
      return response.data;
    } catch (error) {
      console.error('Failed to create campaign:', error);
      throw error;
    }
  }
}

/**
 * Type-safe error handling helper
 */
export function isApiError(error: any): error is { response: { data: { message: string; code: number } } } {
  return error?.response?.data?.message !== undefined;
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
    } catch (error) {
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
    } catch (error) {
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
