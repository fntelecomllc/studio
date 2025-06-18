// src/lib/services/authService.ts
// Simple session-based authentication service
import { getApiBaseUrl } from '@/lib/config';
import { logAuth } from '@/lib/utils/logger';
import { apiClient } from '@/lib/api/client';
import type {
  User,
  LoginResponse,
  ChangePasswordRequest,
  PasswordValidationResult,
  PasswordRequirements,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  ApiResponse
} from '@/lib/types';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  avatarUrl?: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  failedLoginAttempts: number;
  lockedUntil?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  sessionExpiry: number | null;
  availablePermissions: string[];  // Add this field
}

class AuthService {
  private static instance: AuthService;
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    isLoading: false,
    sessionExpiry: null,
    availablePermissions: [] // Initialize the new field
  };
  
  private listeners: ((state: AuthState) => void)[] = [];
  private eventTarget: EventTarget = new EventTarget();

  /**
   * Subscribe to auth events. Returns an unsubscribe function.
   */
  public on(event: 'logged_out', listener: () => void): () => void {
    const handler = () => listener();
    this.eventTarget.addEventListener(event, handler);
    return () => this.eventTarget.removeEventListener(event, handler);
  }

  /** Emit internal lifecycle events */
  private emit(event: 'logged_out'): void {
    this.eventTarget.dispatchEvent(new Event(event));
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Initialize auth service - check for existing session
  async initialize(): Promise<void> {
    logAuth.init('Starting session initialization...');
    this.setLoading(true);

    try {
      // Check if we have an active session by calling the /me endpoint
      const response = await this.makeAuthenticatedRequest('/api/v2/me');
      
      if (response.ok) {
        const userData = await response.json();
        
        // Fetch available permissions from backend
        const availablePermissions = await this.fetchAvailablePermissions();
        
        // Convert User to AuthUser format
        const authUser: AuthUser = {
          id: userData.id,
          email: userData.email,
          name: userData.name || `${userData.firstName} ${userData.lastName}`,
          role: userData.roles?.[0]?.name || 'user',
          permissions: userData.permissions?.map((p: { name: string }) => p.name) || [],
          avatarUrl: userData.avatarUrl,
          isActive: userData.isActive,
          mustChangePassword: userData.mustChangePassword,
          lastLoginAt: userData.lastLoginAt,
          failedLoginAttempts: 0,
          lockedUntil: userData.isLocked ? 'locked' : undefined
        };
        
        this.updateAuthState(authUser, null, availablePermissions);
        logAuth.init('Session restored successfully', { userId: userData.id });
      } else {
        logAuth.init('No active session found');
        this.clearAuth();
      }
    } catch (error) {
      logAuth.error('Session initialization failed', error);
      this.clearAuth();
    } finally {
      this.setLoading(false);
      logAuth.init('Session initialization complete', {
        isAuthenticated: this.authState.isAuthenticated,
        hasUser: !!this.authState.user
      });
    }
  }

  // Login with credentials
  async login(credentials: LoginCredentials): Promise<{
    success: boolean;
    error?: string;
    fieldErrors?: { [key: string]: string };
  }> {
    logAuth.success('Login attempt starting', { email: credentials.email });
    this.setLoading(true);
    
    try {
      const loginResponse = await apiClient.post<LoginResponse>('/api/v2/auth/login', {
        email: credentials.email,
        password: credentials.password,
        rememberMe: credentials.rememberMe
      });

      if (loginResponse.status === 'success' && loginResponse.data?.success && loginResponse.data.user) {
        // Fetch available permissions from backend  
        const availablePermissions = await this.fetchAvailablePermissions();
        
        // Convert User to AuthUser format
        const authUser: AuthUser = {
          id: loginResponse.data.user.id,
          email: loginResponse.data.user.email,
          name: loginResponse.data.user.name || `${loginResponse.data.user.firstName} ${loginResponse.data.user.lastName}`,
          role: loginResponse.data.user.roles?.[0]?.name || 'user',
          permissions: loginResponse.data.user.permissions?.map((p: { name: string }) => p.name) || [],
          avatarUrl: loginResponse.data.user.avatarUrl,
          isActive: loginResponse.data.user.isActive,
          mustChangePassword: loginResponse.data.user.mustChangePassword,
          lastLoginAt: loginResponse.data.user.lastLoginAt,
          failedLoginAttempts: 0,
          lockedUntil: loginResponse.data.user.isLocked ? 'locked' : undefined
        };
        
        // Convert expiresAt to timestamp if provided
        const sessionExpiry = loginResponse.data.expiresAt ? new Date(loginResponse.data.expiresAt).getTime() : null;
        this.updateAuthState(authUser, sessionExpiry, availablePermissions);
        
        logAuth.success('Login successful', { userId: loginResponse.data.user.id });
        return { success: true };
      } else {
        // Handle API response errors with field details
        const errorMsg = loginResponse.message || loginResponse.data?.error || 'Login failed';
        const fieldErrors: { [key: string]: string } = {};
        
        // Extract field-specific errors if available
        if (loginResponse.errors) {
          loginResponse.errors.forEach(error => {
            if (error.field) {
              fieldErrors[error.field] = error.message;
            }
          });
        }
        
        logAuth.warn('Login failed', { error: errorMsg, fieldErrors });
        return { 
          success: false, 
          error: errorMsg,
          fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      logAuth.error('Login error', { error: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      this.setLoading(false);
    }
  }

  // Logout
  async logout(): Promise<void> {
    logAuth.success('Logout starting');
    this.setLoading(true);

    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v2/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        logAuth.success('Logout successful');
      } else {
        logAuth.warn('Logout request failed', { status: response.status });
      }
    } catch (error) {
      logAuth.error('Logout error', { error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      this.clearAuth();
      this.emit('logged_out');
      this.setLoading(false);
    }
  }

  // Fetch available permissions from backend
  private async fetchAvailablePermissions(): Promise<string[]> {
    try {
      const response = await this.makeAuthenticatedRequest('/api/v2/auth/permissions');
      
      if (response.ok) {
        const data = await response.json();
        return data.permissions || [];
      } else {
        logAuth.warn('Failed to fetch available permissions', { status: response.status });
        return [];
      }
    } catch (error) {
      logAuth.error('Error fetching available permissions', error);
      return [];
    }
  }

  // Check if user has specific permission using authoritative list
  hasPermission(permission: string): boolean {
    if (!this.authState.isAuthenticated || !this.authState.user) {
      return false;
    }
    
    // Ensure the permission string is valid by checking against available permissions
    if (!this.authState.availablePermissions.includes(permission)) {
      logAuth.warn(`Unknown permission string: ${permission}`, {
        availablePermissions: this.authState.availablePermissions
      });
      return false;
    }
    
    return this.authState.user.permissions.includes(permission);
  }

  // Check if user has specific role
  hasRole(role: string): boolean {
    return this.authState.user?.role === role;
  }

  // Subscribe to auth state changes
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Get current auth state
  getState(): AuthState {
    return { ...this.authState };
  }

  // Check if currently authenticated
  isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  // Get current user
  getCurrentUser(): AuthUser | null {
    return this.authState.user;
  }

  // Get available permissions list
  getAvailablePermissions(): string[] {
    return [...this.authState.availablePermissions];
  }

  // Update password
  async updatePassword(request: ChangePasswordRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.makeAuthenticatedRequest('/api/v2/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return { success: response.ok, error: data.message };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // Validate password
  async validatePassword(password: string): Promise<PasswordValidationResult> {
    try {
      const response = await this.makeAuthenticatedRequest('/api/v2/auth/validate-password', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      return await response.json();
    } catch (_error) {
      return {
        isValid: false,
        errors: ['Network error'],
        requirements: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: true,
          forbiddenPasswords: []
        },
        strength: 'weak',
        score: 0
      };
    }
  }

  // Get password requirements
  async getPasswordRequirements(): Promise<PasswordRequirements> {
    try {
      const response = await this.makeAuthenticatedRequest('/api/v2/auth/password-requirements');
      return await response.json();
    } catch (_error) {
      return {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        forbiddenPasswords: []
      };
    }
  }

  // User management methods (admin only)
  async createUser(request: CreateUserRequest): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await this.makeAuthenticatedRequest('/api/v2/admin/users', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return { success: response.ok, user: data.user, error: data.message };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async updateUser(userId: string, request: UpdateUserRequest): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const response = await this.makeAuthenticatedRequest(`/api/v2/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(request),
      });

      const data = await response.json();
      return { success: response.ok, user: data.user, error: data.message };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.makeAuthenticatedRequest(`/api/v2/admin/users/${userId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      return { success: response.ok, error: data.message };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async getUsers(page: number = 1, limit: number = 10): Promise<UserListResponse> {
    try {
      const response = await this.makeAuthenticatedRequest(`/api/v2/admin/users?page=${page}&limit=${limit}`);
      return await response.json();
    } catch (_error) {
      return {
        status: 'error',
        message: 'Failed to fetch users',
        data: [],
        errors: [{ message: 'Network error' }]
      };
    }
  }

  async getUser(userId: string): Promise<{ user?: User; error?: string }> {
    try {
      const response = await this.makeAuthenticatedRequest(`/api/v2/admin/users/${userId}`);
      const data = await response.json();
      return { user: data.user, error: data.message };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // Make authenticated request helper
  private async makeAuthenticatedRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const baseUrl = await getApiBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Always include session cookie
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // If we get a 401, clear auth state
    if (response.status === 401) {
      this.clearAuth();
    }

    return response;
  }

  // Private helper methods
  private updateAuthState(user: AuthUser, sessionExpiry: number | null, availablePermissions?: string[]): void {
    this.authState.isAuthenticated = true;
    this.authState.user = user;
    this.authState.sessionExpiry = sessionExpiry;
    this.authState.availablePermissions = availablePermissions || this.authState.availablePermissions;
    this.notifyListeners();
  }

  private clearAuth(): void {
    this.authState.isAuthenticated = false;
    this.authState.user = null;
    this.authState.sessionExpiry = null;
    this.authState.availablePermissions = []; // Clear availablePermissions
    this.notifyListeners();
  }

  private setLoading(loading: boolean): void {
    this.authState.isLoading = loading;
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const state = { ...this.authState };
    this.listeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        logAuth.error('Error in auth listener', error);
      }
    });
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
export default authService;
