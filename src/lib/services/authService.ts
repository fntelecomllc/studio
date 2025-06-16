// src/lib/services/authService.ts
// Enhanced authentication service with session management and security features
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
  RefreshSessionResponse,
  AuthResponse,
  PasswordValidationResult,
  PasswordRequirements,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  Permission
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
   * Subscribe to low-level auth events (e.g. token refresh, logout).
   * Returns an unsubscribe function.
   */
  public on(event: 'token_refreshed' | 'logged_out', listener: () => void): () => void {
    const handler = () => listener();
    this.eventTarget.addEventListener(event, handler);
    return () => this.eventTarget.removeEventListener(event, handler);
  }

  /** Emit internal lifecycle events */
  private emit(event: 'token_refreshed' | 'logged_out'): void {
    this.eventTarget.dispatchEvent(new Event(event));
  }
  private refreshTimer: NodeJS.Timeout | null = null;
  private sessionCheckTimer: NodeJS.Timeout | null = null;

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Initialize auth service - check for existing session
  async initialize(): Promise<void> {
    logAuth.init('Starting initialization...');
    this.setLoading(true);
    
    try {
      const tokens = this.getStoredTokens();
      logAuth.init('Stored session analysis', {
        hasSession: !!tokens,
        isValid: tokens ? this.isTokenValid(tokens) : false,
        expiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt).toISOString() : null,
        timeUntilExpiry: tokens?.expiresAt ? Math.round((tokens.expiresAt - Date.now()) / 1000) : null
      });
      
      if (tokens && this.isTokenValid(tokens)) {
        logAuth.success('Valid tokens found, setting authenticated state immediately...');
        
        // CRITICAL FIX: Set authenticated state FIRST with tokens, then try to load user data
        this.updateAuthState({
          isAuthenticated: true,
          user: null, // Will be populated by user validation
          tokens,
          isLoading: true, // Keep loading true while user data loads
          sessionExpiry: tokens.expiresAt
        });
        
        // Start session management immediately
        this.scheduleTokenRefresh(tokens);
        this.startSessionCheck();
        
        logAuth.init('Attempting user validation...');
        try {
          await this.validateAndSetUser(tokens);
          logAuth.success('User validation successful');
        } catch (error) {
          logAuth.warn('User validation failed, but keeping authenticated state', error);
          // Keep authenticated state but stop loading since we're done trying
          this.updateAuthState({
            isAuthenticated: true,
            user: null, // No user data available
            tokens,
            isLoading: false,
            sessionExpiry: tokens.expiresAt
          });
          
          // Schedule background retries for user data
          let retryCount = 0;
          const maxRetries = 3;
          const retryUserValidation = () => {
            retryCount++;
            logAuth.init(`Background user validation retry ${retryCount}/${maxRetries}...`);
            this.validateAndSetUser(tokens).then(() => {
              logAuth.success('Background user validation successful');
            }).catch(retryError => {
              logAuth.warn(`Background user validation retry ${retryCount} failed`, retryError);
              if (retryCount < maxRetries) {
                setTimeout(retryUserValidation, 5000 * retryCount); // Exponential backoff
              } else {
                logAuth.error('All background user validation retries failed');
              }
            });
          };
          
          setTimeout(retryUserValidation, 2000);
        }
      } else {
        logAuth.warn('No valid tokens found, clearing auth state');
        this.clearAuth();
      }
    } catch (error) {
      logAuth.error('Initialization failed', error);
      this.clearAuth();
    } finally {
      // Only set loading to false if we don't have tokens (since user validation handles loading state)
      if (!this.authState.isAuthenticated) {
        this.setLoading(false);
      }
      
      logAuth.init('Initialization complete. Final state', {
        isAuthenticated: this.authState.isAuthenticated,
        hasUser: !!this.authState.user,
        userId: this.authState.user?.id,
        hasTokens: !!this.authState.tokens,
        isLoading: this.authState.isLoading,
        sessionExpiry: this.authState.sessionExpiry ? new Date(this.authState.sessionExpiry).toISOString() : null
      });
    }
  }

  // Login with credentials
  async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    const startTime = performance.now();
    
    // Log login flow start
    logAuthFlow('login_start', 1, 7, true, 0, {
      email: credentials.email,
      remember_me: credentials.rememberMe,
    } as Record<string, unknown>);
    
    this.setLoading(true);
    
    try {
      // Step 1: Get API base URL
      const urlStart = performance.now();
      const baseUrl = await getApiBaseUrl();
      const urlDuration = performance.now() - urlStart;
      
      logAuthFlow('api_url_resolved', 2, 7, true, urlDuration, {
        base_url: baseUrl,
      });
      
      // Step 2: Prepare request
      const requestStart = performance.now();
      const requestBody = JSON.stringify({
        email: credentials.email,
        password: credentials.password,
        rememberMe: credentials.rememberMe
      } as LoginRequest);
      
      const requestSize = new Blob([requestBody]).size;
      
      // Step 3: Make API call
      const apiStart = performance.now();
      const response = await fetch(`${baseUrl}/api/v2/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include', // Include cookies for session
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
        const errorStart = performance.now();
        const errorData = await response.json().catch(() => ({ message: 'Login failed' }));
        const errorDuration = performance.now() - errorStart;
        
        // Log failed login
        logAuthOperation(
          'WARN',
          'login_failed',
          undefined,
          undefined,
          performance.now() - startTime,
          false,
          `HTTP_${response.status}`,
          errorData.message || 'Invalid credentials',
          {
            email: credentials.email,
            status_code: response.status,
            error_parse_duration: errorDuration,
          }
        );
        
        // Log security event for failed login
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
        
        logAuthFlow('login_failed', 7, 7, false, performance.now() - startTime, {
          error: errorData.message,
          status_code: response.status,
        });
        
        return { success: false, error: errorData.message || 'Invalid credentials' };
      }

      // Step 4: Parse response
      const parseStart = performance.now();
      const data: LoginResponse = await response.json();
      const parseDuration = performance.now() - parseStart;
      
      // Check if login was successful (session-based auth)
      if (!data.success || !data.user || !data.expiresAt) {
        logAuthFlow('login_failed', 7, 7, false, performance.now() - startTime, {
          error: data.error || 'Invalid response structure',
        } as Record<string, unknown>);
        
        return { success: false, error: data.error || 'Login failed' };
      }
      
      logAuthFlow('response_parsed', 3, 7, true, parseDuration, {
        user_id: data.user.id,
      });
      
      // Step 5: Process session info
      const sessionStart = performance.now();
      const tokens: AuthTokens = {
        sessionActive: true,
        expiresAt: new Date(data.expiresAt).getTime()
      };
      
      const sessionDuration = performance.now() - sessionStart;
      
      logAuthFlow('session_processed', 4, 7, true, sessionDuration, {
        expires_at: data.expiresAt,
      });

      // Step 6: Update auth state
      const stateStart = performance.now();
      const previousState = this.authState.isAuthenticated ? 'authenticated' : 'unauthenticated';
      
      this.updateAuthState({
        isAuthenticated: true,
        user: this.mapUserToAuthUser(data.user),
        tokens,
        isLoading: false,
        sessionExpiry: tokens.expiresAt
      });
      
      const stateDuration = performance.now() - stateStart;
      
      // Log session state change
      logSessionStateChange(
        previousState,
        'authenticated',
        data.user.id,
        'session_cookie', // Session ID is in HTTP-only cookie
        {
          state_update_duration: stateDuration,
        }
      );
      
      const primaryRole = data.user.roles && data.user.roles.length > 0 && data.user.roles[0] ? data.user.roles[0].name : 'user';
      
      logAuthFlow('auth_state_updated', 5, 7, true, stateDuration, {
        user_id: data.user.id,
        user_roles: primaryRole,
        user_permissions: data.user.permissions?.length || 0,
      });

      // Step 7: Setup session management
      const setupStart = performance.now();
      this.storeTokens(tokens);
      this.scheduleTokenRefresh(tokens);
      this.startSessionCheck();
      const setupDuration = performance.now() - setupStart;
      
      // Log session setup
      const sessionMetrics: SessionMetrics = {
        sessionId: 'session_cookie', // Session ID is in cookie only
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
          setup_duration: setupDuration,
          auto_refresh_enabled: true,
          session_check_enabled: true,
        }
      );
      
      logAuthFlow('session_setup_complete', 6, 7, true, setupDuration);
      
      // Log successful login with comprehensive metrics
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
      
      // Log security event for successful login
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
      
      logPerformanceMetrics(
        'login_performance',
        performanceMetrics,
        {
          url_resolution_time: urlDuration,
          request_preparation_time: performance.now() - requestStart - apiDuration,
          response_parsing_time: parseDuration,
          token_processing_time: sessionDuration,
          state_update_time: stateDuration,
          session_setup_time: setupDuration,
          request_size_bytes: requestSize,
          response_size_bytes: responseSize,
        }
      );
      
      logAuthFlow('login_complete', 7, 7, true, totalDuration, {
        user_id: data.user.id,
        total_duration: totalDuration,
      });
      
      return { success: true };
    } catch (error) {
      const totalDuration = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Network error during login';
      
      // Log login error
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
          stack_trace: error instanceof Error ? error.stack : undefined,
        }
      );
      
      // Log security event for login error
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
      
      logAuthFlow('login_error', 7, 7, false, totalDuration, {
        error: errorMessage,
        error_type: 'network_error',
      });
      
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
      // Attempt to notify server of logout (fire and forget)
      fetch(`${baseUrl}/api/v2/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
      }).catch(() => {
        // Ignore errors - we're logging out anyway
      });
      
      // Log security event
      if (this.authState.user) {
        this.logSecurityEvent('logout', { userId: this.authState.user.id });
      }
    } finally {
      this.clearAuth();
    }
  }

  // Refresh session - extends session without any tokens
  async refreshSession(): Promise<boolean> {
    const tokens = this.authState.tokens;
    if (!tokens?.sessionActive) {
      this.clearAuth();
      return false;
    }

    try {
      const baseUrl = await getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/v2/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
      });

      if (!response.ok) {
        // Only clear auth state for definitive authentication failures
        if (response.status === 401 || response.status === 403) {
          console.log('[AuthService] Session refresh failed - authentication invalid, clearing auth state');
          this.clearAuth();
          return false;
        } else {
          // For temporary failures (network, server errors), keep auth state but log warning
          console.warn('[AuthService] Session refresh failed with temporary error:', response.status, response.statusText);
          console.warn('[AuthService] Keeping auth state - will retry later');
          return false;
        }
      }

      const data: RefreshSessionResponse = await response.json();
      const newTokens: AuthTokens = {
        sessionActive: true,
        expiresAt: new Date(data.expiresAt).getTime()
      };
      
      this.updateTokens(newTokens);
      this.scheduleTokenRefresh(newTokens);
      
      console.log('[AuthService] Session refresh successful');
      return true;
    } catch (error) {
      // Don't clear auth state for network errors - they're likely temporary
      console.error('[AuthService] Session refresh failed with network error:', error);
      console.warn('[AuthService] Keeping auth state - network error is likely temporary');
      
      // Schedule a retry for network errors
      setTimeout(() => {
        if (this.authState.isAuthenticated && this.authState.tokens) {
          console.log('[AuthService] Retrying session refresh after network error...');
          this.refreshSession().catch(retryError => {
            console.error('[AuthService] Session refresh retry failed:', retryError);
          });
        }
      }, 5000); // Retry after 5 seconds
      
      return false;
    }
  }

  // Change password
  async changePassword(currentPassword: string, newPassword: string): Promise<AuthResponse<void>> {
    try {
      const baseUrl = await getApiBaseUrl();
      const tokens = this.authState.tokens;
      
      if (!tokens) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const response = await fetch(`${baseUrl}/api/v2/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword,
          newPassword
        } as ChangePasswordRequest),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || { code: 'CHANGE_PASSWORD_FAILED', message: 'Failed to change password' } };
      }

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
    if (requirements.forbiddenPasswords.some(forbidden => lowerPassword.includes(forbidden))) {
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
      requirements,
      strength,
      score
    };
  }

  // Check if session is active
  isSessionActive(): boolean {
    return this.authState.tokens?.sessionActive || false;
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
      const baseUrl = await getApiBaseUrl();
      const tokens = this.authState.tokens;
      
      if (!tokens) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const response = await fetch(`${baseUrl}/api/v2/users?page=${page}&limit=${limit}`, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || { code: 'FETCH_USERS_FAILED', message: 'Failed to fetch users' } };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Get users error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while fetching users' } };
    }
  }

  async createUser(userData: CreateUserRequest): Promise<AuthResponse<User>> {
    try {
      const baseUrl = await getApiBaseUrl();
      const tokens = this.authState.tokens;
      
      if (!tokens) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const response = await fetch(`${baseUrl}/api/v2/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || { code: 'CREATE_USER_FAILED', message: 'Failed to create user' } };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Create user error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while creating user' } };
    }
  }

  async updateUser(userId: string, userData: UpdateUserRequest): Promise<AuthResponse<User>> {
    try {
      const baseUrl = await getApiBaseUrl();
      const tokens = this.authState.tokens;
      
      if (!tokens) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const response = await fetch(`${baseUrl}/api/v2/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
        body: JSON.stringify(userData),
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || { code: 'UPDATE_USER_FAILED', message: 'Failed to update user' } };
      }

      return { success: true, data };
    } catch (error) {
      console.error('Update user error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while updating user' } };
    }
  }

  async deleteUser(userId: string): Promise<AuthResponse<void>> {
    try {
      const baseUrl = await getApiBaseUrl();
      const tokens = this.authState.tokens;
      
      if (!tokens) {
        return { success: false, error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' } };
      }

      const response = await fetch(`${baseUrl}/api/v2/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || { code: 'DELETE_USER_FAILED', message: 'Failed to delete user' } };
      }

      return { success: true };
    } catch (error) {
      console.error('Delete user error:', error);
      return { success: false, error: { code: 'NETWORK_ERROR', message: 'Network error while deleting user' } };
    }
  }

  // Private methods
  private async validateAndSetUser(tokens: AuthTokens, retryCount: number = 0): Promise<void> {
    const maxRetries = 2;
    
    try {
      console.log(`[AuthService] validateAndSetUser attempt ${retryCount + 1}/${maxRetries + 1}`);
      const baseUrl = await getApiBaseUrl();
      
      const response = await fetch(`${baseUrl}/api/v2/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest', // Session-based protection header
        },
        credentials: 'include',
      });

      console.log(`[AuthService] /me endpoint response:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication invalid - tokens expired or revoked');
        } else if (response.status >= 500 && retryCount < maxRetries) {
          console.warn(`[AuthService] Server error (${response.status}), retrying in ${(retryCount + 1) * 1000}ms...`);
          await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
          return this.validateAndSetUser(tokens, retryCount + 1);
        } else {
          throw new Error(`Failed to validate user: ${response.status} ${response.statusText}`);
        }
      }

      const userData: User | Record<string, unknown> = await response.json();
      console.log(`[AuthService] User data received:`, {
        hasUserId: 'user_id' in userData || 'id' in userData,
        hasPermissions: 'permissions' in userData,
        permissionsCount: 'permissions' in userData && Array.isArray(userData.permissions) ? userData.permissions.length : 0,
        hasRoles: 'roles' in userData,
        dataKeys: Object.keys(userData)
      });

      const mappedUser = this.mapUserToAuthUser(userData);
      console.log(`[AuthService] Mapped user:`, {
        id: mappedUser.id,
        email: mappedUser.email,
        role: mappedUser.role,
        permissionCount: mappedUser.permissions.length,
        permissions: mappedUser.permissions
      });

      this.updateAuthState({
        isAuthenticated: true,
        user: mappedUser,
        tokens,
        isLoading: false,
        sessionExpiry: tokens.expiresAt
      });
      
      
      console.log(`[AuthService] User validation successful - auth state updated`);
    } catch (error) {
      console.error(`[AuthService] User validation failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries && !(error instanceof Error && error.message.includes('Authentication invalid'))) {
        console.log(`[AuthService] Retrying user validation in ${(retryCount + 1) * 1000}ms...`);
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000));
        return this.validateAndSetUser(tokens, retryCount + 1);
      }
      
      throw error;
    }
  }

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

  private updateTokens(tokens: AuthTokens): void {
    this.authState.tokens = tokens;
    this.authState.sessionExpiry = tokens.expiresAt;
    // Keep internal reference in sync
    this.notifyListeners();
    // Broadcast that fresh authentication tokens are available
    this.emit('token_refreshed');
  }

  private setLoading(isLoading: boolean): void {
    this.authState.isLoading = isLoading;
    this.notifyListeners();
  }

  private clearAuth(): void {
    logAuth.warn('Clearing authentication state');
    this.clearRefreshTimer();
    this.clearSessionCheckTimer();
    this.clearStoredTokens();
    
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

  private storeTokens(tokens: AuthTokens): void {
    try {
      // Store only in localStorage for session state tracking
      // Note: Backend session cookie handles the actual authentication
      localStorage.setItem('session_state', JSON.stringify(tokens));
      
      console.log('[AuthService] Session state stored in localStorage');
    } catch (error) {
      console.warn('Failed to store session state:', error);
    }
  }

  private getStoredTokens(): AuthTokens | null {
    try {
      const stored = localStorage.getItem('session_state');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Failed to retrieve stored session state:', error);
      return null;
    }
  }

  private clearStoredTokens(): void {
    try {
      // Clear localStorage
      localStorage.removeItem('session_state');
      localStorage.removeItem('auth_tokens'); // Remove legacy storage
      
      // CRITICAL: Also clear legacy cookies
      if (typeof document !== 'undefined') {
        const isProduction = window.location.protocol === 'https:';
        const cookieOptions = `expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; ${isProduction ? 'secure; ' : ''}samesite=lax`;
        
        // Clear legacy cookies (backend session cookie is cleared by server)
        document.cookie = `auth_tokens=; ${cookieOptions}`;
        document.cookie = `session=; ${cookieOptions}`;
        console.log('[AuthService] Session state and legacy tokens cleared');
      }
    } catch (error) {
      console.warn('Failed to clear stored session state:', error);
    }
  }

  private isTokenValid(tokens: AuthTokens): boolean {
    // CRITICAL FIX: More conservative token expiration check
    // Only consider tokens invalid if they're actually expired or very close (1 minute)
    return tokens.expiresAt > Date.now() + (1 * 60 * 1000); // 1 minute buffer instead of 5
  }

  private scheduleTokenRefresh(tokens: AuthTokens): void {
    this.clearRefreshTimer();
    
    // CRITICAL FIX: More conservative refresh scheduling - only refresh 2 minutes before expiry
    // This prevents premature token invalidation while still maintaining security
    const refreshTime = tokens.expiresAt - Date.now() - (2 * 60 * 1000);
    
    if (refreshTime > 0) {
      console.log(`[AuthService] Scheduling token refresh in ${Math.round(refreshTime / 1000)} seconds`);
      this.refreshTimer = setTimeout(() => {
        console.log('[AuthService] Automatic token refresh triggered');
        this.refreshSession().then(success => {
          if (success) {
            console.log('[AuthService] Automatic token refresh successful');
          } else {
            console.warn('[AuthService] Automatic token refresh failed - will retry on next scheduled check');
          }
        }).catch(error => {
          console.error('[AuthService] Automatic token refresh error:', error);
        });
      }, refreshTime);
    } else {
      console.warn('[AuthService] Token already expired or expiring very soon, attempting immediate refresh');
      // If token is already expired or about to expire, try immediate refresh
      this.refreshSession().catch(error => {
        console.error('[AuthService] Immediate token refresh failed:', error);
      });
    }
  }

  private startSessionCheck(): void {
    this.clearSessionCheckTimer();
    
    // Check session every minute
    this.sessionCheckTimer = setInterval(() => {
      if (this.authState.tokens && !this.isTokenValid(this.authState.tokens)) {
        // CRITICAL FIX: Don't immediately clear auth - try to refresh first
        console.warn('[AuthService] Session tokens expiring, attempting refresh...');
        this.refreshSession().then(refreshed => {
          if (!refreshed && this.authState.tokens && !this.isTokenValid(this.authState.tokens)) {
            // Only clear if refresh failed AND tokens are still expired
            console.log('[AuthService] Session refresh failed and tokens expired, clearing auth state');
            this.clearAuth();
          }
        }).catch(error => {
          console.error('[AuthService] Session check refresh error:', error);
          // Don't clear auth state for network errors during session check
        });
      }
    }, 60 * 1000);
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
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