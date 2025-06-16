// src/lib/auth/authService.ts
import { getApiBaseUrl } from '@/lib/config';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  avatarUrl?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
}

class AuthService {
  private static instance: AuthService;
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    tokens: null,
    isLoading: false
  };
  
  private listeners: ((state: AuthState) => void)[] = [];
  private refreshTimer: NodeJS.Timeout | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Initialize auth service - check for existing session
  async initialize(): Promise<void> {
    this.setLoading(true);
    
    try {
      // Try to get current user info using the session cookie
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/v1/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // This sends the session cookie if it exists
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData.success && userData.user) {
          this.authState.user = userData.user;
          this.authState.isAuthenticated = true;
          this.authState.tokens = null; // We don't use tokens anymore
          this.notifyListeners();
        } else {
          this.clearAuth();
        }
      } else {
        this.clearAuth();
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
      this.clearAuth();
    } finally {
      this.setLoading(false);
    }
  }

  // Login with credentials
  async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    this.setLoading(true);
    
    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // This tells the browser to include cookies automatically
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
        return { success: false, error: errorData.message || 'Invalid credentials' };
      }

      const data = await response.json();
      
      // Since we're using session cookies now, we need to get user info
      // from the response or make a separate call to /me endpoint
      if (data.success && data.user) {
        this.authState.user = data.user;
        this.authState.isAuthenticated = true;
        this.authState.tokens = null; // We don't use tokens anymore
        this.notifyListeners();
      }
      
      return { success: data.success, error: data.error };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error during login' };
    } finally {
      this.setLoading(false);
    }
  }

  // Logout
  async logout(): Promise<void> {
    try {
      const baseUrl = await getApiBaseUrl();
      // Notify server of logout using session cookie
      fetch(`${baseUrl}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // This sends the session cookie
      }).catch(() => {
        // Ignore errors - we're logging out anyway
      });
    } finally {
      this.clearAuth();
    }
  }

  // Session cookies don't need manual refresh - the server handles session expiration
  async refreshToken(): Promise<boolean> {
    // With session cookies, we don't need to manually refresh tokens
    // The server handles session expiration automatically
    // We can check if the session is still valid by calling /me endpoint
    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/v1/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData.success && userData.user) {
          this.authState.user = userData.user;
          this.authState.isAuthenticated = true;
          this.notifyListeners();
          return true;
        }
      }
      
      this.clearAuth();
      return false;
    } catch (error) {
      console.error('Session validation failed:', error);
      this.clearAuth();
      return false;
    }
  }

  // Get current auth state
  getAuthState(): AuthState {
    return { ...this.authState };
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

  // Check if user has specific permission
  hasPermission(permission: string): boolean {
    return this.authState.user?.permissions.includes(permission) || false;
  }

  // Check if user has specific role
  hasRole(role: string): boolean {
    return this.authState.user?.role === role;
  }

  // Private methods
  private async validateAndSetUser(): Promise<void> {
    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/v1/me`, {
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Use session cookie instead of Authorization header
      });

      if (!response.ok) {
        throw new Error('Failed to validate user');
      }

      const userData = await response.json();
      if (userData.success && userData.user) {
        this.updateAuthState({
          isAuthenticated: true,
          user: userData.user,
          tokens: null, // No tokens with session-based auth
          isLoading: false
        });
      } else {
        throw new Error('Invalid user data received');
      }
    } catch (error) {
      console.error('User validation failed:', error);
      throw error;
    }
  }

  private updateAuthState(newState: Partial<AuthState>): void {
    this.authState = { ...this.authState, ...newState };
    this.notifyListeners();
  }

  private setLoading(isLoading: boolean): void {
    this.authState.isLoading = isLoading;
    this.notifyListeners();
  }

  private clearAuth(): void {
    this.updateAuthState({
      isAuthenticated: false,
      user: null,
      tokens: null,
      isLoading: false
    });
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.authState));
  }

  // Session cookies are managed by the browser automatically
  // No need for manual token storage/retrieval methods
}

// Export singleton instance
export const authService = AuthService.getInstance();

// Utility functions - updated for session-based auth
export function useAuth() {
  return authService.getAuthState();
}

// Remove token-related functions since we use session cookies
export function isAuthenticated(): boolean {
  return authService.getAuthState().isAuthenticated;
}

export function hasPermission(permission: string): boolean {
  return authService.hasPermission(permission);
}

export function hasRole(role: string): boolean {
  return authService.hasRole(role);
}