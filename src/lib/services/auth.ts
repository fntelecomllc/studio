// src/lib/services/auth.ts
// Session-based authentication service - removes all CSRF token handling
import { getApiBaseUrl } from '@/lib/config';
import {
  logAuthOperation,
  logApiCall,
  logSessionEvent,
  logSecurityEvent,
  logPerformanceMetrics,
  logAuthFlow,
  logSessionStateChange,
  type ApiCallMetrics,
  type SessionMetrics,
  type PerformanceMetrics
} from '@/lib/logging/authLogger';
import { logAuth } from '@/lib/utils/logger';
import type {
  User,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  Permission
} from '@/lib/types';

// Additional auth types that aren't in the main types file
export interface AuthResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PasswordRequirements {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  forbiddenPasswords: string[];
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'fair' | 'good' | 'strong';
  score: number;
}

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

// Simplified auth tokens - only session tracking
export interface AuthTokens {
  sessionActive: boolean;  // Simple flag indicating session exists
  expiresAt: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isLoading: boolean;
  sessionExpiry: number | null;
}

class AuthService {
  private static instance: AuthService;
  private authState: AuthState = {
    isAuthenticated: false,
    user: null,
    tokens: null,
    isLoading: false,
    sessionExpiry: null
  };
  
  private listeners: ((state: AuthState) => void)[] = [];
  // Fine-grained event emitter to coordinate with other runtime services
  private eventTarget: EventTarget = new EventTarget();

  /**
   * Subscribe to low-level auth events (e.g. session refresh, logout).
   * Returns an unsubscribe function.
   */
  public on(event: 'session_refreshed' | 'logged_out', listener: () => void): () => void {
    const handler = () => listener();
    this.eventTarget.addEventListener(event, handler);
    return () => this.eventTarget.removeEventListener(event, handler);
  }

  /** Emit internal lifecycle events */
  private emit(event: 'session_refreshed' | 'logged_out'): void {
    this.eventTarget.dispatchEvent(new Event(event));
  }

  private sessionCheckTimer: NodeJS.Timeout | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Initialize auth service - check for existing session
  async initialize(): Promise<void> {
    logAuth.init('Starting session-based authentication initialization...');
    this.setLoading(true);
    
    try {
      // Try to validate existing session cookie
      const isValid = await this.validateSession();
      logAuth.init('Session validation result:', isValid ? 'Valid session found' : 'No valid session');
    } catch (error) {
      logAuth.warn('Session validation failed:', error);
      this.clearAuth();
    } finally {
      this.setLoading(false);
      
      logAuth.init('Session-based authentication initialization complete. Final state:', {
        isAuthenticated: this.authState.isAuthenticated,
        hasUser: !!this.authState.user,
        userId: this.authState.user?.id,
        hasTokens: !!this.authState.tokens,
        isLoading: this.authState.isLoading,
        sessionExpiry: this.authState.sessionExpiry ? new Date(this.authState.sessionExpiry).toISOString() : null
      });
    }
  }

  // Login with credentials - session cookie only
  async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    const startTime = performance.now();
    
    logAuthFlow('login_start', 1, 5, true, 0, {
      email: credentials.email,
      remember_me: credentials.rememberMe,
    } as Record<string, unknown>);
    
    this.setLoading(true);
    
    try {
      const baseUrl = await getApiBaseUrl();
      const requestBody = JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        rememberMe: credentials.rememberMe
      } as LoginRequest);
      
      const requestSize = new Blob([requestBody]).size;
      const apiStart = performance.now();
      
      const response = await fetch(`${baseUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // CSRF protection header
        },
        credentials: 'include', // Include session cookie
        body: requestBody,
      });
      
      const apiDuration = performance.now() - apiStart;
      const responseSize = response.headers.get('content-length') ?
        parseInt(response.headers.get('content-length')!) : 0;
      
      // Log API call metrics
      const apiMetrics: ApiCallMetrics = {
        url: `${baseUrl}/api/v2/auth/login`,
        method: 'POST',
        requestSize,
        responseSize,
        statusCode: response.status,
        duration: apiDuration,
        retryCount: 0,
        cacheHit: false,
      };
      
      logApiCall('login_request', apiMetrics, response.ok);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Login failed' }));
        
        logAuthOperation(
          'WARN',
          'login_failed',
          undefined,
          undefined,
          performance.now() - startTime,
          false,
          `HTTP_${response.status}`,
          errorData.error || 'Invalid credentials',
          {
            email: credentials.email,
            status_code: response.status,
          }
        );
        
        logSecurityEvent(
          'login_attempt_failed',
          {
            riskScore: 4,
            threatLevel: 'medium',
            suspiciousActivity: false,
          },
          undefined,
          undefined,
          {
            email: credentials.email,
            status_code: response.status,
            user_agent: navigator.userAgent,
          }
        );
        
        logAuthFlow('login_failed', 5, 5, false, performance.now() - startTime, {
          error: errorData.error,
          status_code: response.status,
        });
        
        return { success: false, error: errorData.error || 'Invalid credentials' };
      }

      const data: LoginResponse = await response.json();
      
      // Check if login was successful
      if (!data.success || !data.user || !data.expiresAt) {
        logAuthFlow('login_failed', 5, 5, false, performance.now() - startTime, {
          error: data.error || 'Invalid response structure',
        } as Record<string, unknown>);
        
        return { success: false, error: data.error || 'Login failed' };
      }
      
      // Process session data - no tokens to store
      const tokens: AuthTokens = {
        sessionActive: true,
        expiresAt: new Date(data.expiresAt).getTime()
      };
      
      logAuthFlow('response_parsed', 2, 5, true, performance.now() - apiStart, {
        user_id: data.user.id,
        expires_at: data.expiresAt,
      });

      // Update auth state
      const previousState = this.authState.isAuthenticated ? 'authenticated' : 'unauthenticated';
      
      this.updateAuthState({
        isAuthenticated: true,
        user: this.mapUserToAuthUser(data.user),
        tokens,
        isLoading: false,
        sessionExpiry: tokens.expiresAt
      });
      
      // Log session state change
      logSessionStateChange(
        previousState,
        'authenticated',
        data.user.id,
        'session_cookie', // Session is managed via cookie
        {}
      );
      
      logAuthFlow('auth_state_updated', 3, 5, true, performance.now() - startTime, {
        user_id: data.user.id,
        user_roles: data.user.roles?.[0]?.name || 'user',
        user_permissions: data.user.permissions?.length || 0,
      });

      // Setup session management
      this.startSessionCheck();
      
      // Log session setup
      const sessionMetrics: SessionMetrics = {
        sessionId: 'session_cookie',
        expiresAt: data.expiresAt,
        lastActivity: new Date().toISOString(),
        renewalCount: 0,
        timeToExpiry: tokens.expiresAt - Date.now(),
      };
      
      logSessionEvent(
        'session_established',
        sessionMetrics,
        true,
        {
          session_check_enabled: true,
        }
      );
      
      logAuthFlow('session_setup_complete', 4, 5, true, performance.now() - startTime);
      
      // Log successful login
      const totalDuration = performance.now() - startTime;
      
      logAuthOperation(
        'INFO',
        'login_success',
        data.user.id,
        'session_cookie',
        totalDuration,
        true,
        undefined,
        undefined,
        {
          email: credentials.email,
          user_roles: data.user.roles?.[0]?.name || 'user',
          user_permissions: data.user.permissions?.length || 0,
          remember_me: credentials.rememberMe,
          session_expires_at: data.expiresAt,
        }
      );
      
      logSecurityEvent(
        'login_success',
        {
          riskScore: 0,
          threatLevel: 'low',
          suspiciousActivity: false,
          sessionHijackingAttempt: false,
        },
        data.user.id,
        'session_cookie',
        {
          email: credentials.email,
          user_agent: navigator.userAgent,
          login_duration: totalDuration,
        }
      );
      
      // Log performance metrics
      const performanceMetrics: PerformanceMetrics = {
        apiCallTime: apiDuration,
        totalTime: totalDuration,
        networkLatency: apiDuration,
      };
      
      logPerformanceMetrics('login_performance', performanceMetrics, {
        request_size_bytes: requestSize,
        response_size_bytes: responseSize,
      });
      
      logAuthFlow('login_complete', 5, 5, true, totalDuration, {
        user_id: data.user.id,
        total_duration: totalDuration,
      });
      
      return { success: true };
    } catch (error) {
      const totalDuration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Network error during login';
      
      logAuthOperation(
        'ERROR',
        'login_error',
        undefined,
        undefined,
        totalDuration,
        false,
        'NETWORK_ERROR',
        errorMessage,
        {
          email: credentials.email,
          error_type: error instanceof Error ? error.constructor.name : 'Unknown',
        }
      );
      
      logSecurityEvent(
        'login_network_error',
        {
          riskScore: 3,
          threatLevel: 'low',
          suspiciousActivity: false,
        },
        undefined,
        undefined,
        {
          email: credentials.email,
          error_message: errorMessage,
          user_agent: navigator.userAgent,
        }
      );
      
      logAuthFlow('login_error', 5, 5, false, totalDuration, {
        error: errorMessage,
        error_type: 'network_error',
      });
      
      console.error('Login error:', error);
      return { success: false, error: 'Network error during login' };
    } finally {
      this.setLoading(false);
    }
  }

  // Logout - just clear cookies
  async logout(): Promise<void> {
    try {
      if (this.authState.isAuthenticated) {
        const baseUrl = await getApiBaseUrl();
        // Attempt to notify server of logout (fire and forget)
        fetch(`${baseUrl}/api/v2/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          credentials: 'include',
        }).catch(() => {
          // Ignore errors - we're logging out anyway
        });
      }
      
      // Log security event
      if (this.authState.user) {
        this.logSecurityEvent('logout', { userId: this.authState.user.id });
      }
    } finally {
      this.clearAuth();
    }
  }

  // Session validation without tokens
  async validateSession(): Promise<boolean> {
    try {
      const userData = await this.apiCall<Record<string, unknown>>('/api/v2/auth/me');
      
      // Update auth state with fresh data
      this.updateAuthState({
        isAuthenticated: true,
        user: this.mapUserToAuthUser(userData),
        tokens: {
          sessionActive: true,
          expiresAt: new Date(userData.session_expires_at as string).getTime()
        },
        isLoading: false,
        sessionExpiry: new Date(userData.session_expires_at as string).getTime()
      });
      
      return true;
    } catch (_error) {
      this.clearAuth();
      return false;
    }
  }

  // All API calls use only cookies - no authentication headers
  async apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = await getApiBaseUrl();
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      credentials: 'include', // Always include session cookie
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // CSRF protection
        ...options.headers,
        // NO authentication headers needed
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Session expired - clear auth state and redirect
        this.clearAuth();
        throw new Error('Session expired');
      }
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse<void>> {
    try {
      if (!this.authState.isAuthenticated) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      await this.apiCall('/api/v2/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword
        } as ChangePasswordRequest),
      });

      // Log security event
      if (this.authState.user) {
        this.logSecurityEvent('password_change', { userId: this.authState.user.id });
      }

      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error during password change' } };
    }
  }

  // Forgot password
  async forgotPassword(email: string): Promise<AuthResponse<void>> {
    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v2/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email } as ForgotPasswordRequest),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || { code: 'FORGOT_PASSWORD_FAILED', message: 'Failed to send reset email' } };
      }

      return { success: true };
    } catch (error) {
      console.error('Forgot password error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error during password reset request' } };
    }
  }

  // Reset password
  async resetPassword(token: string, newPassword: string): Promise<AuthResponse<void>> {
    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v2/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password: newPassword
        } as ResetPasswordRequest),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || { code: 'RESET_PASSWORD_FAILED', message: 'Failed to reset password' } };
      }

      return { success: true };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error during password reset' } };
    }
  }

  // Validate password strength
  async validatePassword(password: string): Promise<PasswordValidationResult> {
    const requirements: PasswordRequirements = {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      forbiddenPasswords: ['password', '123456', 'admin', 'domainflow']
    };

    const errors: string[] = [];
    let score = 0;

    // Length check
    if (password.length < requirements.minLength) {
      errors.push(`Password must be at least ${requirements.minLength} characters long`);
    } else {
      score += 20;
    }

    // Character type checks
    if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else if (requirements.requireUppercase) {
      score += 20;
    }

    if (requirements.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else if (requirements.requireLowercase) {
      score += 20;
    }

    if (requirements.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    } else if (requirements.requireNumbers) {
      score += 20;
    }

    if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    } else if (requirements.requireSpecialChars) {
      score += 20;
    }

    // Forbidden passwords check
    const lowerPassword = password.toLowerCase();
    if (requirements.forbiddenPasswords.some((forbidden: string) => lowerPassword.includes(forbidden))) {
      errors.push('Password contains forbidden words');
      score = Math.max(0, score - 40);
    }

    // Determine strength
    let strength: 'weak' | 'fair' | 'good' | 'strong';
    if (score < 40) strength = 'weak';
    else if (score < 60) strength = 'fair';
    else if (score < 80) strength = 'good';
    else strength = 'strong';

    return {
      isValid: errors.length === 0,
      errors,
      strength,
      score
    };
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

  // Check if session is about to expire (within 5 minutes)
  isSessionExpiringSoon(): boolean {
    if (!this.authState.sessionExpiry) return false;
    return this.authState.sessionExpiry - Date.now() < 5 * 60 * 1000;
  }

  // User Management Methods (Admin only)
  async getUsers(page: number = 1, limit: number = 20): Promise<AuthResponse<UserListResponse>> {
    try {
      if (!this.authState.isAuthenticated) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const data = await this.apiCall<UserListResponse>(`/api/v2/users?page=${page}&limit=${limit}`);
      return { success: true, data };
    } catch (error) {
      console.error('Get users error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while fetching users' } };
    }
  }

  async createUser(userData: CreateUserRequest): Promise<AuthResponse<User>> {
    try {
      if (!this.authState.isAuthenticated) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const data = await this.apiCall<User>('/api/v2/users', {
        method: 'POST',
        body: JSON.stringify(userData),
      });

      return { success: true, data };
    } catch (error) {
      console.error('Create user error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while creating user' } };
    }
  }

  async updateUser(userId: string, userData: UpdateUserRequest): Promise<AuthResponse<User>> {
    try {
      if (!this.authState.isAuthenticated) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const data = await this.apiCall<User>(`/api/v2/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(userData),
      });

      return { success: true, data };
    } catch (error) {
      console.error('Update user error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while updating user' } };
    }
  }

  async deleteUser(userId: string): Promise<AuthResponse<void>> {
    try {
      if (!this.authState.isAuthenticated) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      await this.apiCall(`/api/v2/users/${userId}`, {
        method: 'DELETE',
      });

      return { success: true };
    } catch (error) {
      console.error('Delete user error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while deleting user' } };
    }
  }

  // Private methods
  private mapUserToAuthUser(user: User | Record<string, unknown>): AuthUser {
    console.log('[AuthService] mapUserToAuthUser called with user data:', {
      hasUserId: 'user_id' in user,
      hasPermissions: 'permissions' in user,
      permissionsType: 'permissions' in user ? typeof user.permissions : 'undefined',
      permissionsIsArray: 'permissions' in user ? Array.isArray(user.permissions) : false,
      permissionsLength: 'permissions' in user && Array.isArray(user.permissions) ? user.permissions.length : 0,
      samplePermissions: 'permissions' in user && Array.isArray(user.permissions) ? user.permissions.slice(0, 3) : []
    });

    // Handle both login response format and /me endpoint format
    if ('user_id' in user && user.user_id && 'permissions' in user && Array.isArray(user.permissions)) {
      // This is the /me endpoint format - permissions are already strings
      const permissions = user.permissions as string[];
      console.log('[AuthService] Processing /me endpoint format with permissions:', permissions);
      
      return {
        id: user.user_id as string,
        email: 'admin@domainflow.local', // Fallback since /me doesn't return email
        name: 'System Administrator', // Fallback since /me doesn't return name
        role: ((user.roles as Array<{ name?: string }>)?.[0]?.name) || 'admin',
        permissions: permissions,
        avatarUrl: undefined,
        isActive: true, // If user can call /me, they're active
        mustChangePassword: (user.requires_password_change as boolean) || false,
        lastLoginAt: undefined,
        failedLoginAttempts: 0,
        lockedUntil: undefined
      };
    } else {
      // This is the login response format - backend returns Permission objects
      const typedUser = user as User;
      let permissions: string[] = [];
      
      try {
        if (Array.isArray(typedUser.permissions)) {
          // Handle both Permission objects and string arrays
          permissions = typedUser.permissions.map((p: Permission | string) => {
            if (typeof p === 'string') {
              return p;
            } else if (p && typeof p === 'object' && 'name' in p) {
              return p.name;
            } else {
              console.warn('[AuthService] Invalid permission format:', p);
              return String(p);
            }
          });
        } else if (typedUser.permissions) {
          console.warn('[AuthService] Permissions is not an array:', typedUser.permissions);
          permissions = [];
        }
      } catch (error) {
        console.error('[AuthService] Error processing permissions:', error);
        permissions = [];
      }
      
      console.log('[AuthService] Processing login response format with permissions:', permissions);
      
      const fullName = `${typedUser.firstName || ''} ${typedUser.lastName || ''}`.trim();
      const primaryRole = typedUser.roles && typedUser.roles.length > 0 && typedUser.roles[0] ? typedUser.roles[0].name : 'user';
      
      const authUser: AuthUser = {
        id: typedUser.id,
        email: typedUser.email,
        name: fullName || typedUser.email,
        role: primaryRole,
        permissions: permissions,
        avatarUrl: typedUser.avatarUrl,
        isActive: typedUser.isActive,
        mustChangePassword: typedUser.mustChangePassword,
        lastLoginAt: typedUser.lastLoginAt,
        failedLoginAttempts: 0, // Not exposed in login response
        lockedUntil: undefined // Not exposed in login response
      };
      
      console.log('[AuthService] Final AuthUser created:', {
        id: authUser.id,
        email: authUser.email,
        role: authUser.role,
        permissionCount: authUser.permissions.length,
        permissions: authUser.permissions
      });
      
      return authUser;
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
    logAuth.warn('Clearing authentication state');
    this.clearSessionCheckTimer();
    
    // CRITICAL: Ensure state is completely cleared and synchronized
    this.authState = {
      isAuthenticated: false,
      user: null,
      tokens: null,
      isLoading: false,
      sessionExpiry: null
    };
    
    // Notify all listeners immediately
    this.notifyListeners();
    // Broadcast logout so dependent services can clean up
    this.emit('logged_out');
    
    logAuth.warn('Authentication state cleared');
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.authState));
  }

  private startSessionCheck(): void {
    this.clearSessionCheckTimer();
    
    // Check session every 5 minutes
    this.sessionCheckTimer = setInterval(() => {
      if (this.authState.isAuthenticated && this.authState.sessionExpiry) {
        // Check if session is expired
        if (Date.now() > this.authState.sessionExpiry) {
          console.warn('[AuthService] Session expired, clearing auth state');
          this.clearAuth();
        } else if (this.isSessionExpiringSoon()) {
          console.log('[AuthService] Session expiring soon, validating...');
          this.validateSession().catch(error => {
            console.error('[AuthService] Session validation failed:', error);
            this.clearAuth();
          });
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  private clearSessionCheckTimer(): void {
    if (this.sessionCheckTimer) {
      clearInterval(this.sessionCheckTimer);
      this.sessionCheckTimer = null;
    }
  }

  private async logSecurityEvent(eventType: string, details: Record<string, unknown>): Promise<void> {
    try {
      // This would typically send to a security logging endpoint
      console.log(`Security Event: ${eventType}`, details);
    } catch (error) {
      console.warn('Failed to log security event:', error);
    }
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();

// Utility functions
export function useAuth() {
  return authService.getAuthState();
}

export function isAuthenticated(): boolean {
  return authService.getAuthState().isAuthenticated;
}

export function hasPermission(permission: string): boolean {
  return authService.hasPermission(permission);
}

export function hasRole(role: string): boolean {
  return authService.hasRole(role);
}

export function isSessionExpiringSoon(): boolean {
  return authService.isSessionExpiringSoon();
}