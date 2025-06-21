// src/components/auth/ProtectedRoute.tsx
// Enhanced protected route component with role-based access control, session management, and security features
'use client';

import React, { ReactNode, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock, AlertTriangle, Home, Shield, Clock, RefreshCw } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireAnyRole?: boolean;
  requireAllPermissions?: boolean;
  fallbackComponent?: ReactNode;
  redirectTo?: string;
  showLoginPrompt?: boolean;
  allowUnauthenticated?: boolean;
  showSessionWarning?: boolean;
  autoRefreshSession?: boolean;
  requireActiveAccount?: boolean;
}

interface AccessDeniedProps {
  reason: 'unauthenticated' | 'insufficient_permissions' | 'insufficient_roles';
  requiredPermissions?: string[];
  requiredRoles?: string[];
  onLogin?: () => void;
  redirectTo?: string;
}

function AccessDenied({ 
  reason, 
  requiredPermissions = [], 
  requiredRoles = [], 
  onLogin,
  redirectTo 
}: AccessDeniedProps) {
  const router = useRouter();

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
    } else if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.push('/login');
    }
  };

  const handleGoHome = () => {
    router.push('/');
  };

  const getReasonMessage = () => {
    switch (reason) {
      case 'unauthenticated':
        return {
          title: 'Authentication Required',
          description: 'You need to sign in to access this page.',
          icon: <Lock className="h-6 w-6" />
        };
      case 'insufficient_permissions':
        return {
          title: 'Insufficient Permissions',
          description: `You don't have the required permissions to access this page. Required: ${requiredPermissions.join(', ')}`,
          icon: <AlertTriangle className="h-6 w-6" />
        };
      case 'insufficient_roles':
        return {
          title: 'Access Restricted',
          description: `Your role doesn't allow access to this page. Required roles: ${requiredRoles.join(', ')}`,
          icon: <AlertTriangle className="h-6 w-6" />
        };
      default:
        return {
          title: 'Access Denied',
          description: 'You don\'t have permission to access this page.',
          icon: <AlertTriangle className="h-6 w-6" />
        };
    }
  };

  const { title, description, icon } = getReasonMessage();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            {icon}
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-center">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {reason === 'unauthenticated' && (
            <Button onClick={handleLogin} className="w-full">
              Sign In
            </Button>
          )}
          <Button variant="outline" onClick={handleGoHome} className="w-full">
            <Home className="mr-2 h-4 w-4" />
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto" />
        <p className="text-muted-foreground">Checking permissions...</p>
      </div>
    </div>
  );
}

export function ProtectedRoute({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAnyRole = false,
  requireAllPermissions = true,
  fallbackComponent,
  redirectTo,
  showLoginPrompt = true,
  allowUnauthenticated = false,
  showSessionWarning = true,
  autoRefreshSession = true,
  requireActiveAccount = true
}: ProtectedRouteProps) {
  const {
    isAuthenticated,
    user,
    isLoading,
    isInitialized,
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,
    isSessionExpiringSoon,
    refreshSession
  } = useAuth();
  
  const router = useRouter();
  const pathname = usePathname();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [sessionWarningDismissed, setSessionWarningDismissed] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);

  // Handle session refresh
  const handleSessionRefresh = useCallback(async () => {
    if (!autoRefreshSession || isRefreshingSession) return;
    
    setIsRefreshingSession(true);
    try {
      const success = await refreshSession();
      if (success) {
        setSessionWarningDismissed(false);
      }
    } catch (error) {
      console.error('Session refresh failed:', error);
    } finally {
      setIsRefreshingSession(false);
    }
  }, [autoRefreshSession, isRefreshingSession, refreshSession]);

  // Auto-refresh session when expiring soon
  useEffect(() => {
    if (isAuthenticated && isSessionExpiringSoon() && autoRefreshSession && !isRefreshingSession) {
      handleSessionRefresh();
    }
  }, [isAuthenticated, isSessionExpiringSoon, autoRefreshSession, isRefreshingSession, handleSessionRefresh]);

  // Handle redirect after authentication check
  useEffect(() => {
    if (!isLoading && isInitialized && shouldRedirect && redirectTo) {
      const currentPath = encodeURIComponent(pathname);
      router.push(`${redirectTo}?redirect=${currentPath}`);
    }
  }, [isLoading, isInitialized, shouldRedirect, redirectTo, router, pathname]);

  // Show loading while auth is initializing
  if (!isInitialized || isLoading) {
    return <LoadingScreen />;
  }

  // Allow unauthenticated access if specified
  if (allowUnauthenticated) {
    return <>{children}</>;
  }

  // Check authentication
  if (!isAuthenticated) {
    if (redirectTo && showLoginPrompt) {
      setShouldRedirect(true);
      return <LoadingScreen />;
    }
    
    if (fallbackComponent) {
      return <>{fallbackComponent}</>;
    }
    
    return (
      <AccessDenied
        reason="unauthenticated"
        redirectTo={redirectTo}
      />
    );
  }

  // Check if account is active (if required)
  if (requireActiveAccount && user && !user.isActive) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <Lock className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">Account Inactive</CardTitle>
            <CardDescription className="text-center">
              Your account has been deactivated. Please contact an administrator for assistance.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => router.push('/')} className="w-full">
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check if password change is required
  if (user && user.mustChangePassword) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
              <Shield className="h-6 w-6 text-yellow-600" />
            </div>
            <CardTitle className="text-xl">Password Change Required</CardTitle>
            <CardDescription className="text-center">
              You must change your password before continuing to use the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => router.push('/profile')} className="w-full">
              <Shield className="mr-2 h-4 w-4" />
              Change Password
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Check permissions
  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requireAllPermissions
      ? hasAllPermissions(requiredPermissions)
      : requiredPermissions.some(permission => hasPermission(permission));

    if (!hasRequiredPermissions) {
      if (fallbackComponent) {
        return <>{fallbackComponent}</>;
      }
      
      return (
        <AccessDenied 
          reason="insufficient_permissions" 
          requiredPermissions={requiredPermissions}
        />
      );
    }
  }

  // Check roles
  if (requiredRoles.length > 0) {
    const hasRequiredRoles = requireAnyRole
      ? hasAnyRole(requiredRoles)
      : requiredRoles.every(role => hasRole(role));

    if (!hasRequiredRoles) {
      if (fallbackComponent) {
        return <>{fallbackComponent}</>;
      }
      
      return (
        <AccessDenied 
          reason="insufficient_roles" 
          requiredRoles={requiredRoles}
        />
      );
    }
  }

  // All checks passed, render children with session warning if needed
  return (
    <>
      {/* Session Expiry Warning */}
      {showSessionWarning &&
       isAuthenticated &&
       isSessionExpiringSoon() &&
       !sessionWarningDismissed && (
        <Alert className="mb-4">
          <Clock className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">Session Expiring Soon</p>
                <p className="text-sm text-muted-foreground">
                  Your session will expire soon. Click refresh to extend your session.
                </p>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <Button
                  size="sm"
                  onClick={handleSessionRefresh}
                  disabled={isRefreshingSession}
                >
                  {isRefreshingSession ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Refresh
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSessionWarningDismissed(true)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}
      
      {children}
    </>
  );
}

// Higher-order component for protecting pages
export function withProtectedRoute<T extends object>(
  Component: React.ComponentType<T>,
  options: Omit<ProtectedRouteProps, 'children'>
) {
  return function ProtectedComponent(props: T) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

// Hook for checking access within components
export function useRouteAccess(
  requiredPermissions: string[] = [],
  requiredRoles: string[] = [],
  requireAnyRole = false
) {
  const { 
    isAuthenticated, 
    hasPermission, 
    hasRole, 
    hasAnyRole, 
    hasAllPermissions 
  } = useAuth();

  const hasAccess = () => {
    if (!isAuthenticated) return false;

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasRequiredPermissions = hasAllPermissions(requiredPermissions);
      if (!hasRequiredPermissions) return false;
    }

    // Check roles
    if (requiredRoles.length > 0) {
      const hasRequiredRoles = requireAnyRole
        ? hasAnyRole(requiredRoles)
        : requiredRoles.every(role => hasRole(role));
      if (!hasRequiredRoles) return false;
    }

    return true;
  };

  const getAccessReason = () => {
    if (!isAuthenticated) return 'unauthenticated';
    
    if (requiredPermissions.length > 0 && !hasAllPermissions(requiredPermissions)) {
      return 'insufficient_permissions';
    }
    
    if (requiredRoles.length > 0) {
      const hasRequiredRoles = requireAnyRole
        ? hasAnyRole(requiredRoles)
        : requiredRoles.every(role => hasRole(role));
      if (!hasRequiredRoles) return 'insufficient_roles';
    }
    
    return null;
  };

  return {
    hasAccess: hasAccess(),
    accessReason: getAccessReason(),
    isAuthenticated,
    checkPermission: hasPermission,
    checkRole: hasRole
  };
}

// Component for conditional rendering based on access
interface ConditionalAccessProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireAnyRole?: boolean;
  fallback?: ReactNode;
  showAccessDenied?: boolean;
}

export function ConditionalAccess({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAnyRole = false,
  fallback = null,
  showAccessDenied = false
}: ConditionalAccessProps) {
  const { hasAccess, accessReason } = useRouteAccess(
    requiredPermissions,
    requiredRoles,
    requireAnyRole
  );

  if (hasAccess) {
    return <>{children}</>;
  }

  if (showAccessDenied && accessReason) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {accessReason === 'unauthenticated' && 'You must be signed in to view this content.'}
          {accessReason === 'insufficient_permissions' && `Required permissions: ${requiredPermissions.join(', ')}`}
          {accessReason === 'insufficient_roles' && `Required roles: ${requiredRoles.join(', ')}`}
        </AlertDescription>
      </Alert>
    );
  }

  return <>{fallback}</>;
}

export default ProtectedRoute;