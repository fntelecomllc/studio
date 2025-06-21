// src/contexts/AuthContext.tsx
// Enhanced React context for authentication state management with RBAC and security features
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { authService, type AuthState, type LoginCredentials } from '@/lib/services/authService';
import { logger } from '@/lib/utils/logger';
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
  login: (credentials: LoginCredentials) => Promise<{ 
    success: boolean; 
    error?: string; 
    fieldErrors?: { [key: string]: string }; 
  }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthResponse<void>>;
  validatePassword: (password: string) => Promise<PasswordValidationResult>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  isSessionExpiringSoon: () => boolean;
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
    isLoading: true,
    sessionExpiry: null,
    availablePermissions: []
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
        logger.info('Auth service already initializing, waiting for completion', {
          component: 'AuthContext',
          operation: 'auth_service_initialization'
        });
        await initializationRef.current;
        if (mountedRef.current) {
          setIsInitialized(true);
        }
        return;
      }

      try {
        logger.info('Starting auth service initialization', {
          component: 'AuthContext',
          operation: 'auth_service_initialization'
        });
        initializationRef.current = authService.initialize();
        await initializationRef.current;
        
        if (mountedRef.current) {
          logger.info('Auth service initialized successfully', {
            component: 'AuthContext',
            operation: 'auth_service_initialization'
          });
          
          // Get current state after initialization
          const state = authService.getState();
          logger.info('Post-initialization auth state', {
            component: 'AuthContext',
            operation: 'auth_service_initialization',
            isAuthenticated: state.isAuthenticated,
            hasUser: !!state.user,
            userPermissions: state.user?.permissions?.length || 0
          });
          
          // In session-based auth, the initialize() method already checks for active session
          // No need for additional session validation since it's handled by cookies
          
          setIsInitialized(true);
        }
      } catch (error: unknown) {
        logger.error('Failed to initialize auth service', {
          component: 'AuthContext',
          operation: 'auth_service_initialization',
          error: error instanceof Error ? error.message : String(error)
        });
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
        setAuthState(authService.getState());
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
      logger.info('Attempting login', {
        component: 'AuthContext',
        operation: 'user_login',
        email: credentials.email
      });
    }
    
    const result = await authService.login(credentials);
    
    if (features.enableDebugMode) {
      logger.info('Login result', {
        component: 'AuthContext',
        operation: 'user_login',
        success: result.success,
        status: result.success ? 'success' : 'failed'
      });
    }
    
    return result;
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      logger.info('Logging out user', {
        component: 'AuthContext',
        operation: 'user_logout'
      });
    }
    
    await authService.logout();
  }, []);

  // In session-based auth, sessions are automatically managed by cookies
  // No manual refresh needed
  const refreshSession = useCallback(async () => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      logger.info('Session refresh not needed in cookie-based auth', {
        component: 'AuthContext',
        operation: 'session_refresh'
      });
    }
    
    return true; // Sessions are handled automatically
  }, []);

  // Change password function
  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<AuthResponse<void>> => {
    const features = getFeatureFlags();
    
    if (features.enableDebugMode) {
      logger.info('Changing password', {
        component: 'AuthContext',
        operation: 'password_change'
      });
    }
    
    const result = await authService.updatePassword({
      currentPassword,
      newPassword
    });

    return {
      success: result.success,
      error: result.error ? { code: 'PASSWORD_CHANGE_ERROR', message: result.error } : undefined
    };
  }, []);

  // Validate password function
  const validatePassword = useCallback(async (password: string) => {
    return await authService.validatePassword(password);
  }, []);

  // Simplified permission checking - wait for auth state to be ready
  const hasPermission = useCallback((permission: string): boolean => {
    const authState = authService.getState();
    
    // ENTERPRISE AUTH FIX: Don't check permissions until user data is fully loaded
    // This prevents race conditions where sidebar renders before permissions load
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false; // Fail safely until auth state is ready
    }
    
    // SIMPLIFIED ENTERPRISE AUTH: Basic permission check without excessive validation
    const result = authService.hasPermission(permission);
    
    // Minimal debug logging for enterprise use
    if (!result) {
      logger.warn('Permission denied', {
        component: 'AuthContext',
        operation: 'permission_check',
        permission,
        userRoles: authState.user.roles.map(r => r.name),
        hasPermissions: authState.user.permissions.length > 0
      });
    }
    
    return result;
  }, []);

  const hasRole = useCallback((role: string): boolean => {
    const authState = authService.getState();
    
    // ENTERPRISE AUTH FIX: Wait for auth state to be ready
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false;
    }
    
    return authService.hasRole(role);
  }, []);

  const hasAnyRole = useCallback((roles: string[]): boolean => {
    const authState = authService.getState();
    
    // ENTERPRISE AUTH FIX: Wait for auth state to be ready
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false;
    }
    
    return roles.some(role => authService.hasRole(role));
  }, []);

  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    const authState = authService.getState();
    
    // ENTERPRISE AUTH FIX: Wait for auth state to be ready
    if (!authState.isAuthenticated || !authState.user || authState.isLoading) {
      return false;
    }
    
    return permissions.every(permission => authService.hasPermission(permission));
  }, []);

  // In session-based auth, sessions are managed by server cookies
  // No need to check expiration client-side
  const isSessionExpiringSoon = useCallback((): boolean => {
    return false; // Sessions are managed automatically
  }, []);



  // User management functions (admin only)
  const getUsers = useCallback(async (page?: number, limit?: number): Promise<AuthResponse<UserListResponse>> => {
    const result = await authService.getUsers(page, limit);
    
    return {
      success: result.status === 'success',
      data: result,
      error: result.status === 'error' ? { code: 'GET_USERS_ERROR', message: result.message || 'Failed to get users' } : undefined
    };
  }, []);

  const createUser = useCallback(async (userData: CreateUserRequest): Promise<AuthResponse<User>> => {
    const result = await authService.createUser(userData);
    
    return {
      success: result.success,
      data: result.user,
      error: result.error ? { code: 'CREATE_USER_ERROR', message: result.error } : undefined
    };
  }, []);

  const updateUser = useCallback(async (userId: string, userData: UpdateUserRequest): Promise<AuthResponse<User>> => {
    const result = await authService.updateUser(userId, userData);
    
    return {
      success: result.success,
      data: result.user,
      error: result.error ? { code: 'UPDATE_USER_ERROR', message: result.error } : undefined
    };
  }, []);

  const deleteUser = useCallback(async (userId: string): Promise<AuthResponse<void>> => {
    const result = await authService.deleteUser(userId);
    
    return {
      success: result.success,
      error: result.error ? { code: 'DELETE_USER_ERROR', message: result.error } : undefined
    };
  }, []);

  // PERFORMANCE OPTIMIZATION: Memoize context value to prevent cascade re-renders
  // This is critical for app-wide performance as AuthContext is consumed by many components
  const contextValue: AuthContextType = useMemo(() => ({
    ...authState,
    login,
    logout,
    refreshSession,
    changePassword,
    validatePassword,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    isSessionExpiringSoon,
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
    validatePassword,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    isSessionExpiringSoon,
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

export default AuthContext;