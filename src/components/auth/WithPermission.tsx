/**
 * Enhanced permission-based component wrapper for fine-grained access control
 */

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface WithPermissionProps {
  children: React.ReactNode;
  required: string | string[];
  mode?: 'any' | 'all'; // 'any' means user needs at least one permission, 'all' means user needs all permissions
  fallback?: React.ReactNode;
  showFallback?: boolean;
  onPermissionDenied?: () => void;
}

/**
 * Permission-based component wrapper that conditionally renders children based on user permissions
 */
export function WithPermission({ 
  children, 
  required,
  mode = 'any',
  fallback = null,
  showFallback = true,
  onPermissionDenied
}: WithPermissionProps) {
  const { hasPermission, hasAllPermissions, isAuthenticated, isLoading } = useAuth();

  // Wait for auth to be ready
  if (isLoading || !isAuthenticated) {
    return showFallback ? fallback : null;
  }

  // Normalize required permissions to array
  const permissions = Array.isArray(required) ? required : [required];
  
  // Check permissions based on mode
  const hasRequiredPermissions = mode === 'all' 
    ? hasAllPermissions(permissions)
    : permissions.some(permission => hasPermission(permission));

  if (!hasRequiredPermissions) {
    // Call callback if provided
    if (onPermissionDenied) {
      onPermissionDenied();
    }
    
    return showFallback ? fallback : null;
  }

  return <>{children}</>;
}

interface WithRoleProps {
  children: React.ReactNode;
  required: string | string[];
  mode?: 'any' | 'all';
  fallback?: React.ReactNode;
  showFallback?: boolean;
  onRoleDenied?: () => void;
}

/**
 * Role-based component wrapper that conditionally renders children based on user roles
 */
export function WithRole({ 
  children, 
  required,
  mode = 'any',
  fallback = null,
  showFallback = true,
  onRoleDenied
}: WithRoleProps) {
  const { hasRole, hasAnyRole, isAuthenticated, isLoading } = useAuth();

  // Wait for auth to be ready
  if (isLoading || !isAuthenticated) {
    return showFallback ? fallback : null;
  }

  // Normalize required roles to array
  const roles = Array.isArray(required) ? required : [required];
  
  // Check roles based on mode
  const hasRequiredRoles = mode === 'all' 
    ? roles.every(role => hasRole(role))
    : hasAnyRole(roles);

  if (!hasRequiredRoles) {
    // Call callback if provided
    if (onRoleDenied) {
      onRoleDenied();
    }
    
    return showFallback ? fallback : null;
  }

  return <>{children}</>;
}

interface ConditionalPermissionProps {
  children: React.ReactNode;
  condition: (permissions: { hasPermission: (p: string) => boolean; hasRole: (r: string) => boolean }) => boolean;
  fallback?: React.ReactNode;
  showFallback?: boolean;
}

/**
 * Advanced conditional permission wrapper with custom logic
 */
export function ConditionalPermission({
  children,
  condition,
  fallback = null,
  showFallback = true
}: ConditionalPermissionProps) {
  const { hasPermission, hasRole, isAuthenticated, isLoading } = useAuth();

  // Wait for auth to be ready
  if (isLoading || !isAuthenticated) {
    return showFallback ? fallback : null;
  }

  const hasAccess = condition({ hasPermission, hasRole });

  if (!hasAccess) {
    return showFallback ? fallback : null;
  }

  return <>{children}</>;
}

interface PermissionGuardProps {
  children: React.ReactNode;
  permissions?: string[];
  roles?: string[];
  requireAll?: boolean; // If true, user must have ALL permissions/roles
  fallback?: React.ReactNode;
  redirectTo?: string;
  showUnauthorized?: boolean;
}

/**
 * Advanced permission guard with multiple authorization strategies
 */
export function PermissionGuard({
  children,
  permissions = [],
  roles = [],
  requireAll = false,
  fallback,
  redirectTo,
  showUnauthorized = false
}: PermissionGuardProps) {
  const { hasPermission, hasRole, isAuthenticated, isLoading } = useAuth();

  // Wait for auth to be ready
  if (isLoading) {
    return <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
    </div>;
  }

  if (!isAuthenticated) {
    if (redirectTo) {
      // In a real app, you might use Next.js router here
      window.location.href = redirectTo;
      return null;
    }
    return fallback || (showUnauthorized ? <UnauthorizedMessage /> : null);
  }

  // Check permissions
  const permissionCheck = permissions.length === 0 || (
    requireAll 
      ? permissions.every(p => hasPermission(p))
      : permissions.some(p => hasPermission(p))
  );

  // Check roles
  const roleCheck = roles.length === 0 || (
    requireAll 
      ? roles.every(r => hasRole(r))
      : roles.some(r => hasRole(r))
  );

  // Both checks must pass
  const hasAccess = permissionCheck && roleCheck;

  if (!hasAccess) {
    if (redirectTo) {
      window.location.href = redirectTo;
      return null;
    }
    return fallback || (showUnauthorized ? <UnauthorizedMessage /> : null);
  }

  return <>{children}</>;
}

/**
 * Default unauthorized message component
 */
function UnauthorizedMessage() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600">You don&apos;t have permission to view this content.</p>
      </div>
    </div>
  );
}

// Export types for use in other components
export type { WithPermissionProps, WithRoleProps, ConditionalPermissionProps, PermissionGuardProps };
