// src/contexts/AuthContext.tsx
// Enhanced React context for authentication state management with RBAC and security features
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { authService, type AuthState, type LoginCredentials } from '@/lib/services/authService';
// HMR SAFE: Local feature flags implementation to avoid environment.ts import chain
const getFeatureFlags = () => ({
  enableDebugMode: process.env.NODE_ENV === 'development',
  enableSessionValidation: true,
  enablePermissionCaching: true
});
import type {
  AuthResponse,
  CreateUserRequest,
  UpdateUserRequest,
  UserListResponse,
  PasswordValidationResult,
  User
} from '@/lib/types';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResponse<void>>;
  forgotPassword: (email: string) => Promise<AuthResponse<void>>;
  resetPassword: (token: string, newPassword: string) => Promise<AuthResponse<void>>;
  validatePassword: (password: string) => Promise<PasswordValidationResult>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  isSessionExpiringSoon: () => boolean;
  getCSRFToken: () => string | null;
  getSessionId: () => string | null;
  isInitialized: boolean;
  // User management (admin only)
  getUsers: (page?: number, limit?: number) => Promise<AuthResponse<UserListResponse>>;
  createUser: (userData: CreateUserRequest) => Promise<AuthResponse<User>>;
  updateUser: (userId: string, userData: UpdateUserRequest) => Promise<AuthResponse<User>>;
  deleteUser: (userId: string) => Promise<AuthResponse<void>>;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    tokens: null,
    isLoading: true,
    sessionExpiry: null
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // MEMORY LEAK FIX: Track initialization status globally to prevent multiple initializations
  const mountedRef = React.useRef(true);
  const initializationRef = React.useRef<Promise<void> | null>(null);

  // Initialize auth service on mount
  useEffect(() => {
    mountedRef.current = true;

    const initializeAuth = async () => {
      // MEMORY LEAK FIX: Prevent multiple concurrent initializations
      if (initializationRef.current) {
        console.log('[AuthContext] Auth service already initializing, waiting for completion');
        await initializationRef.current;
        if (mountedRef.current) {
          setIsInitialized(true);
        }
        return;
      }

      try {
        console.log('[AuthContext] Starting auth service initialization');
        initializationRef.current = authService.initialize();
        await initializationRef.current;
        
        if (mountedRef.current) {
          console.log('[AuthContext] Auth service initialized successfully');
          
          // Get current state after initialization
          const state = authService.getAuthState();
          console.log('[AuthContext] Post-initialization auth state:', {
            isAuthenticated: state.isAuthenticated,
            hasUser: !!state.user,
            hasTokens: !!state.tokens,
            userPermissions: state.user?.permissions?.length || 0
          });
          
          // Only perform aggressive session validation if we have tokens but no user data
          // This prevents clearing valid authentication state due to temporary network issues
          if (state.isAuthenticated && state.tokens && !state.user) {
            console.log('[AuthContext] Authenticated with tokens but no user data, attempting recovery...');
            try {
              // Try to load user data without clearing auth state on failure
              const isValid = await authService.refreshSession();
              if (!isValid) {
                console.warn('[AuthContext] Session refresh failed but maintaining auth state - user data may load later');
              }
            } catch (error) {
              console.error('[AuthContext] Session recovery error (maintaining auth state):', error);
              // Don't clear auth state - let the user try to use the app and handle auth errors gracefully
            }
          } else if (state.isAuthenticated && state.user && state.user.permissions.length === 0) {
            console.warn('[AuthContext] User authenticated but has no permissions - this may indicate a backend sync issue');
          }
          
          setIsInitialized(true);
        }
      } catch (error) {
        console.error('[AuthContext] Failed to initialize auth service:', error);
        if (mountedRef.current) {
          setIsInitialized(true);
        }
      } finally {
        initializationRef.current = null;
      }
    };

    initializeAuth();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribe to auth state changes
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupSubscription = () => {
      unsubscribe = authService.subscribe((newState) => {
        if (mountedRef.current) {
          setAuthState(newState);
        }
      });

      // Get initial state
      if (mountedRef.current) {
        setAuthState(authService.getAuthState());
      }
    };

    setupSubscription();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // MEMORY LEAK FIX: Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      // Note: We don't destroy the auth service itself as it may be used by other components
      // The auth service should have its own cleanup mechanisms
    };
  }, []);

  // Login function
  const login = useCallback(async (credentials: LoginCredentials) => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log('[Auth] Attempting login for:', credentials.email);
    }
    
    const result = await authService.login(credentials);
    
    if (features.enableDebugMode) {
      console.log('[Auth] Login result:', result.success ? 'success' : 'failed');
    }
    
    return result;
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log('[Auth] Logging out user');
    }
    
    await authService.logout();
  }, []);

  // Refresh session function
  const refreshSession = useCallback(async () => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log('[Auth] Refreshing session');
    }
    
    return await authService.refreshSession();
  }, []);

  // Change password function
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log('[Auth] Changing password');
    }
    
    return await authService.changePassword(currentPassword, newPassword);
  }, []);

  // Forgot password function
  const forgotPassword = useCallback(async (email: string) => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log('[Auth] Requesting password reset for:', email);
    }
    
    return await authService.forgotPassword(email);
  }, []);

  // Reset password function
  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      console.log('[Auth] Resetting password');
    }
    
    return await authService.resetPassword(token, newPassword);
  }, []);

  // Validate password function
  const validatePassword = useCallback(async (password: string) => {
    return await authService.validatePassword(password);
  }, []);

  // Simplified permission checking - wait for auth state to be ready
  const hasPermission = useCallback((permission: string): boolean => {
    const authState = authService.getAuthState();
    
    // ENTERPRISE AUTH FIX: Don't check permissions until user data is fully loaded
    // This prevents race conditions where sidebar renders before permissions load
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false; // Fail safely until auth state is ready
    }
    
    // SIMPLIFIED ENTERPRISE AUTH: Basic permission check without excessive validation
    const result = authService.hasPermission(permission);
    
    // Minimal debug logging for enterprise use
    if (!result) {
      console.log('[Auth] Permission denied:', {
        permission,
        userRole: authState.user.role,
        hasPermissions: authState.user.permissions.length > 0
      });
    }
    
    return result;
  }, []);

  const hasRole = useCallback((role: string): boolean => {
    const authState = authService.getAuthState();
    
    // ENTERPRISE AUTH FIX: Wait for auth state to be ready
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false;
    }
    
    return authService.hasRole(role);
  }, []);

  const hasAnyRole = useCallback((roles: string[]): boolean => {
    const authState = authService.getAuthState();
    
    // ENTERPRISE AUTH FIX: Wait for auth state to be ready
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false;
    }
    
    return roles.some(role => authService.hasRole(role));
  }, []);

  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    const authState = authService.getAuthState();
    
    // ENTERPRISE AUTH FIX: Wait for auth state to be ready
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false;
    }
    
    return permissions.every(permission => authService.hasPermission(permission));
  }, []);

  // Session and security functions
  const isSessionExpiringSoon = useCallback((): boolean => {
    return authService.isSessionExpiringSoon();
  }, []);

  const getCSRFToken = useCallback((): string | null => {
    return authService.getCSRFToken();
  }, []);

  const getSessionId = useCallback((): string | null => {
    return authService.getSessionId();
  }, []);

  // User management functions (admin only)
  const getUsers = useCallback(async (page?: number, limit?: number) => {
    return await authService.getUsers(page, limit);
  }, []);

  const createUser = useCallback(async (userData: CreateUserRequest) => {
    return await authService.createUser(userData);
  }, []);

  const updateUser = useCallback(async (userId: string, userData: UpdateUserRequest) => {
    return await authService.updateUser(userId, userData);
  }, []);

  const deleteUser = useCallback(async (userId: string) => {
    return await authService.deleteUser(userId);
  }, []);

  // PERFORMANCE OPTIMIZATION: Memoize context value to prevent cascade re-renders
  // This is critical for app-wide performance as AuthContext is consumed by many components
  const contextValue: AuthContextType = useMemo(() => ({
    ...authState,
    login,
    logout,
    refreshSession,
    changePassword,
    forgotPassword,
    resetPassword,
    validatePassword,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    isSessionExpiringSoon,
    getCSRFToken,
    getSessionId,
    isInitialized,
    getUsers,
    createUser,
    updateUser,
    deleteUser
  }), [
    // AuthState dependencies - these are the core state values that should trigger re-renders
    authState,
    isInitialized,
    // All handler functions are already memoized with useCallback, so they're stable references
    login,
    logout,
    refreshSession,
    changePassword,
    forgotPassword,
    resetPassword,
    validatePassword,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    isSessionExpiringSoon,
    getCSRFToken,
    getSessionId,
    getUsers,
    createUser,
    updateUser,
    deleteUser
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Higher-order component for protected routes
interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireAnyRole?: boolean; // If true, user needs ANY of the required roles, otherwise ALL
  fallback?: ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAnyRole = false,
  fallback = <div>Access denied. You don&apos;t have permission to view this content.</div>,
  redirectTo
}: ProtectedRouteProps) {
  const { isAuthenticated, hasRole, hasAnyRole, hasAllPermissions, isLoading, isInitialized } = useAuth();

  // Show loading while auth is initializing
  if (!isInitialized || isLoading) {
    return <div>Loading...</div>;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    if (redirectTo && typeof window !== 'undefined') {
      window.location.href = redirectTo;
      return null;
    }
    return <div>Please log in to access this content.</div>;
  }

  // Check permissions
  if (requiredPermissions.length > 0 && !hasAllPermissions(requiredPermissions)) {
    return <>{fallback}</>;
  }

  // Check roles
  if (requiredRoles.length > 0) {
    const hasRequiredRoles = requireAnyRole 
      ? hasAnyRole(requiredRoles)
      : requiredRoles.every(role => hasRole(role));
    
    if (!hasRequiredRoles) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

// Hook for conditional rendering based on permissions
export function usePermissions() {
  const { hasPermission, hasRole, hasAnyRole, hasAllPermissions } = useAuth();

  const canAccess = useCallback((config: {
    permissions?: string[];
    roles?: string[];
    requireAnyRole?: boolean;
  }) => {
    const { permissions = [], roles = [], requireAnyRole = false } = config;

    // Check permissions
    if (permissions.length > 0 && !hasAllPermissions(permissions)) {
      return false;
    }

    // Check roles
    if (roles.length > 0) {
      const hasRequiredRoles = requireAnyRole 
        ? hasAnyRole(roles)
        : roles.every(role => hasRole(role));
      
      if (!hasRequiredRoles) {
        return false;
      }
    }

    return true;
  }, [hasRole, hasAnyRole, hasAllPermissions]);

  return {
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    canAccess
  };
}

// Component for conditional rendering
interface ConditionalRenderProps {
  children: ReactNode;
  permissions?: string[];
  roles?: string[];
  requireAnyRole?: boolean;
  fallback?: ReactNode;
}

export function ConditionalRender({
  children,
  permissions = [],
  roles = [],
  requireAnyRole = false,
  fallback = null
}: ConditionalRenderProps) {
  const { canAccess } = usePermissions();

  const hasAccess = canAccess({
    permissions,
    roles,
    requireAnyRole
  });

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

// Auth status component for debugging
export function AuthStatus() {
  const { isAuthenticated, user, isLoading, isInitialized } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Only check feature flags after mount to prevent hydration issues
    const features = getFeatureFlags();
    setShowDebug(features.enableDebugMode);
  }, []);

  // Prevent hydration mismatch by only rendering after mount
  if (!mounted || !showDebug) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 10,
      right: 10,
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '8px',
      borderRadius: '4px',
      fontSize: '12px',
      zIndex: 9999
    }}>
      <div>Auth Status:</div>
      <div>Initialized: {isInitialized ? 'Yes' : 'No'}</div>
      <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
      <div>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</div>
      {user && (
        <>
          <div>User: {user.email}</div>
          <div>Role: {user.role}</div>
          <div>Permissions: {user.permissions.length}</div>
        </>
      )}
    </div>
  );
}

export default AuthContext;