// src/components/auth/StrictProtectedRoute.tsx
// Strict route protection component with complete isolation enforcement
'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock, AlertTriangle, Shield, Clock } from 'lucide-react';

interface StrictProtectedRouteProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
  requireAnyRole?: boolean;
  requireAllPermissions?: boolean;
  allowUnauthenticated?: boolean;
  redirectTo?: string;
}

interface AccessDeniedProps {
  reason: 'unauthenticated' | 'insufficient_permissions' | 'insufficient_roles' | 'session_expired';
  requiredPermissions?: string[];
  requiredRoles?: string[];
  onRetry?: () => void;
}

function AccessDenied({
  reason,
  requiredPermissions = [],
  requiredRoles = [],
  onRetry
}: AccessDeniedProps): React.ReactElement {
  const handleLogin = (): void => {
    // Force redirect to login
    window.location.href = '/login';
  };

  const getReasonMessage = (): { title: string; description: string; icon: React.ReactNode; action: string } => {
    switch (reason) {
      case 'unauthenticated':
        return {
          title: 'Authentication Required',
          description: 'You must be signed in to access this page. Please log in to continue.',
          icon: <Lock className="h-6 w-6" />,
          action: 'Sign In'
        };
      case 'session_expired':
        return {
          title: 'Session Expired',
          description: 'Your session has expired for security reasons. Please sign in again.',
          icon: <Clock className="h-6 w-6" />,
          action: 'Sign In Again'
        };
      case 'insufficient_permissions':
        return {
          title: 'Insufficient Permissions',
          description: `You don't have the required permissions to access this page. Required: ${requiredPermissions.join(', ')}`,
          icon: <AlertTriangle className="h-6 w-6" />,
          action: 'Contact Administrator'
        };
      case 'insufficient_roles':
        return {
          title: 'Access Restricted',
          description: `Your role doesn't allow access to this page. Required roles: ${requiredRoles.join(', ')}`,
          icon: <AlertTriangle className="h-6 w-6" />,
          action: 'Contact Administrator'
        };
      default:
        return {
          title: 'Access Denied',
          description: 'You don\'t have permission to access this page.',
          icon: <AlertTriangle className="h-6 w-6" />,
          action: 'Sign In'
        };
    }
  };

  const { title, description, icon, action } = getReasonMessage();

  return (
    <div className="flex items-center justify-center min-h-screen p-4 bg-background">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            {icon}
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription className="text-center">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(reason === 'unauthenticated' || reason === 'session_expired') && (
            <Button onClick={handleLogin} className="w-full" size="lg">
              <Shield className="mr-2 h-4 w-4" />
              {action}
            </Button>
          )}
          {onRetry !== undefined && (
            <Button variant="outline" onClick={onRetry} className="w-full">
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LoadingScreen({ message = 'Verifying access...' }: { message?: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function StrictProtectedRoute({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  requireAnyRole = false,
  requireAllPermissions = true,
  allowUnauthenticated = false
}: StrictProtectedRouteProps): React.ReactElement {
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
  
  const pathname = usePathname();
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [accessCheckComplete, setAccessCheckComplete] = useState(false);

  // Handle session refresh if expiring soon
  useEffect(() => {
    if (isAuthenticated === true && isSessionExpiringSoon() && isRefreshingSession === false) {
      setIsRefreshingSession(true);
      refreshSession()
        .then(() => {
          setIsRefreshingSession(false);
        })
        .catch(() => {
          setIsRefreshingSession(false);
          // Session refresh failed, redirect to login
          window.location.href = '/login';
        });
    }
  }, [isAuthenticated, isSessionExpiringSoon, isRefreshingSession, refreshSession]);

  // Strict authentication check
  useEffect(() => {
    if (isInitialized === true && isLoading === false && allowUnauthenticated === false) {
      if (isAuthenticated === false) {
        // Immediate redirect for unauthenticated users
        const loginUrl = new URL('/login', window.location.origin);
        if (pathname !== '/') {
          loginUrl.searchParams.set('redirect', pathname);
        }
        window.location.href = loginUrl.toString();
        return;
      }
      setAccessCheckComplete(true);
    } else if (allowUnauthenticated === true) {
      setAccessCheckComplete(true);
    }
  }, [isInitialized, isLoading, isAuthenticated, allowUnauthenticated, pathname]);

  // Show loading while auth is initializing or session is refreshing
  if (!isInitialized || isLoading || isRefreshingSession || !accessCheckComplete) {
    return <LoadingScreen message={
      isRefreshingSession === true ? 'Refreshing session...' :
      isInitialized === false ? 'Initializing security...' :
      'Verifying access...'
    } />;
  }

  // Allow unauthenticated access if specified
  if (allowUnauthenticated === true) {
    return <>{children}</>;
  }

  // Final authentication check
  if (isAuthenticated === false) {
    return (
      <AccessDenied
        reason="unauthenticated"
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Check if user object exists
  if (user === null) {
    return (
      <AccessDenied
        reason="session_expired"
        onRetry={() => window.location.reload()}
      />
    );
  }

  // Check if account is active
  if (user.isActive === false) {
    return (
      <AccessDenied
        reason="insufficient_permissions"
        requiredPermissions={['Account must be active']}
      />
    );
  }

  // Check permissions
  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requireAllPermissions === true
      ? hasAllPermissions(requiredPermissions)
      : requiredPermissions.some(permission => hasPermission(permission));

  if (hasRequiredPermissions === false) {
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
    const hasRequiredRoles = requireAnyRole === true
      ? hasAnyRole(requiredRoles)
      : requiredRoles.every(role => hasRole(role));

    if (hasRequiredRoles === false) {
      return (
        <AccessDenied 
          reason="insufficient_roles" 
          requiredRoles={requiredRoles}
        />
      );
    }
  }

  // All checks passed, render children
  return <>{children}</>;
}

// Higher-order component for protecting pages
export function withStrictProtection<T extends object>(
  Component: React.ComponentType<T>,
  options: Omit<StrictProtectedRouteProps, 'children'>
) {
  return function StrictProtectedComponent(props: T): React.ReactElement {
    return (
      <StrictProtectedRoute {...options}>
        <Component {...props} />
      </StrictProtectedRoute>
    );
  };
}

export default StrictProtectedRoute;