// src/lib/services/authService.ts
// Simple session-based authentication service
import { getApiBaseUrl } from '@/lib/config';
import { logAuth } from '@/lib/utils/logger';
import { apiClient } from '@/lib/api/client';
import { ProductionApiClient } from '@/lib/services/apiClient.production';
import { useLoadingStore, LOADING_OPERATIONS } from '@/lib/stores/loadingStore';
import { TypeTransformer, type RawAPIData } from '@/lib/types/transform';
import type {
  User, // Use unified User interface from types.ts
  LoginResponse,
  ChangePasswordRequest,
  PasswordValidationResult,
  PasswordRequirements,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse
} from '@/lib/types';

// Remove duplicate AuthUser interface - use User from types.ts instead

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;  // Use unified User interface
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
        
        // Use the user data directly as it already matches the User interface
        this.updateAuthState(userData, null, availablePermissions);
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
    
    // Use centralized loading state
    const loadingStore = useLoadingStore.getState();
    loadingStore.startLoading(LOADING_OPERATIONS.LOGIN, 'Signing in...');
    
    try {
      const loginResponse = await apiClient.post<LoginResponse>('/api/v2/auth/login', {
        email: credentials.email,
        password: credentials.password,
        rememberMe: credentials.rememberMe
      });

      if (loginResponse.status === 'success' && loginResponse.data?.success && loginResponse.data.user) {
        // Fetch available permissions from backend  
        const availablePermissions = await this.fetchAvailablePermissions();
        
        // Convert expiresAt to timestamp if provided
        const sessionExpiry = loginResponse.data.expiresAt ? new Date(loginResponse.data.expiresAt).getTime() : null;
        
        // Set session expiry in API client for proactive refresh
        if (loginResponse.data.expiresAt) {
          const apiClient = ProductionApiClient.getInstance();
          apiClient.setSessionExpiry(loginResponse.data.expiresAt);
        }
        
        // Transform raw user data to use branded types  
        const transformedUser = TypeTransformer.transformUser(loginResponse.data.user as unknown as RawAPIData);
        
        // Use the transformed user data
        this.updateAuthState(transformedUser, sessionExpiry, availablePermissions);
        
        logAuth.success('Login successful', { userId: transformedUser.id });
        loadingStore.stopLoading(LOADING_OPERATIONS.LOGIN, 'succeeded');
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
        
        loadingStore.stopLoading(LOADING_OPERATIONS.LOGIN, 'failed', errorMsg);
        return { 
          success: false, 
          error: errorMsg,
          fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      logAuth.error('Login error', { error: errorMsg });
      loadingStore.stopLoading(LOADING_OPERATIONS.LOGIN, 'failed', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  // Logout
  async logout(): Promise<void> {
    logAuth.success('Logout starting');
    
    // Use centralized loading state
    const loadingStore = useLoadingStore.getState();
    loadingStore.startLoading(LOADING_OPERATIONS.LOGOUT, 'Signing out...');

    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v2/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        logAuth.success('Logout successful');
        loadingStore.stopLoading(LOADING_OPERATIONS.LOGOUT, 'succeeded');
      } else {
        logAuth.warn('Logout request failed', { status: response.status });
        loadingStore.stopLoading(LOADING_OPERATIONS.LOGOUT, 'failed', `Logout failed with status: ${response.status}`);
      }
    } catch (error) {
      logAuth.error('Logout error', { error: error instanceof Error ? error.message : 'Unknown error' });
      loadingStore.stopLoading(LOADING_OPERATIONS.LOGOUT, 'failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.clearAuth();
      this.emit('logged_out');
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
    
    return this.authState.user.permissions.some(p => p.name === permission);
  }

  // Check if user has specific role
  hasRole(role: string): boolean {
    return this.authState.user?.roles.some(r => r.name === role) ?? false;
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
  getCurrentUser(): User | null {
    return this.authState.user;
  }

  // Get available permissions list
  getAvailablePermissions(): string[] {
    return [...this.authState.availablePermissions];
  }

  // Update password
  async updatePassword(request: ChangePasswordRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.makeAuthenticatedRequest('/api/v2/change-password', {
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
      const transformedUser = data.user ? TypeTransformer.transformUser(data.user) : undefined;
      return { success: response.ok, user: transformedUser, error: data.message };
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
      const transformedUser = data.user ? TypeTransformer.transformUser(data.user) : undefined;
      return { success: response.ok, user: transformedUser, error: data.message };
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
      const data = await response.json();
      
      // Transform the users array if present
      if (data.data && Array.isArray(data.data)) {
        data.data = TypeTransformer.transformArray(data.data, TypeTransformer.transformUser);
      }
      
      return data;
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
      const transformedUser = data.user ? TypeTransformer.transformUser(data.user) : undefined;
      return { user: transformedUser, error: data.message };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // Refresh session
  async refreshSession(): Promise<{ success: boolean; error?: string }> {
    logAuth.success('Session refresh starting');
    
    // Use centralized loading state
    const loadingStore = useLoadingStore.getState();
    loadingStore.startLoading(LOADING_OPERATIONS.SESSION_REFRESH, 'Refreshing session...');

    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v2/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.expiresAt) {
          // Update session expiry
          const sessionExpiry = new Date(data.expiresAt).getTime();
          this.authState.sessionExpiry = sessionExpiry;
          
          // Set session expiry in API client for proactive refresh
          const apiClient = ProductionApiClient.getInstance();
          apiClient.setSessionExpiry(data.expiresAt);
          
          this.notifyListeners();
          
          logAuth.success('Session refreshed successfully');
          loadingStore.stopLoading(LOADING_OPERATIONS.SESSION_REFRESH, 'succeeded');
          return { success: true };
        } else {
          const errorMsg = data.message || 'Session refresh failed';
          logAuth.warn('Session refresh failed', { error: errorMsg });
          loadingStore.stopLoading(LOADING_OPERATIONS.SESSION_REFRESH, 'failed', errorMsg);
          return { success: false, error: errorMsg };
        }
      } else {
        const errorMsg = `Session refresh failed with status: ${response.status}`;
        logAuth.warn('Session refresh failed', { status: response.status });
        loadingStore.stopLoading(LOADING_OPERATIONS.SESSION_REFRESH, 'failed', errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      logAuth.error('Session refresh error', { error: errorMsg });
      loadingStore.stopLoading(LOADING_OPERATIONS.SESSION_REFRESH, 'failed', errorMsg);
      return { success: false, error: errorMsg };
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
  private updateAuthState(user: User, sessionExpiry: number | null, availablePermissions?: string[]): void {
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
