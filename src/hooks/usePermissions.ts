/**
 * Enhanced permission management hook with caching, validation, and advanced features
 */

import { useCallback, useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface PermissionCache {
  [permission: string]: {
    result: boolean;
    timestamp: number;
  };
}

interface UsePermissionsOptions {
  enableCaching?: boolean;
  cacheTimeout?: number; // in milliseconds
  onPermissionDenied?: (permission: string) => void;
  onRoleRequired?: (role: string) => void;
}

export interface PermissionResult {
  hasAccess: boolean;
  reason?: 'unauthenticated' | 'loading' | 'insufficient_permission' | 'insufficient_role';
  missingPermissions?: string[];
  missingRoles?: string[];
}

export function usePermissions(options: UsePermissionsOptions = {}) {
  const {
    enableCaching = true,
    cacheTimeout = 5 * 60 * 1000, // 5 minutes
    onPermissionDenied,
    onRoleRequired
  } = options;

  const { 
    user, 
    isAuthenticated, 
    isLoading,
    hasPermission: authHasPermission,
    hasRole: authHasRole,
    hasAnyRole,
    hasAllPermissions
  } = useAuth();

  const [permissionCache, setPermissionCache] = useState<PermissionCache>({});

  // Clear cache when user changes
  useEffect(() => {
    setPermissionCache({});
  }, [user?.id]);

  // Enhanced permission checking with caching
  const hasPermission = useCallback((permission: string): boolean => {
    if (!isAuthenticated || isLoading || !user) {
      return false;
    }

    // Check cache first
    if (enableCaching) {
      const cached = permissionCache[permission];
      if (cached && Date.now() - cached.timestamp < cacheTimeout) {
        return cached.result;
      }
    }

    // Get fresh result
    const result = authHasPermission(permission);

    // Update cache
    if (enableCaching) {
      setPermissionCache(prev => ({
        ...prev,
        [permission]: {
          result,
          timestamp: Date.now()
        }
      }));
    }

    // Call callback if permission denied
    if (!result && onPermissionDenied) {
      onPermissionDenied(permission);
    }

    return result;
  }, [
    isAuthenticated, 
    isLoading, 
    user, 
    authHasPermission, 
    enableCaching, 
    permissionCache, 
    cacheTimeout, 
    onPermissionDenied
  ]);

  // Enhanced role checking
  const hasRole = useCallback((role: string): boolean => {
    if (!isAuthenticated || isLoading || !user) {
      return false;
    }

    const result = authHasRole(role);

    // Call callback if role required but not present
    if (!result && onRoleRequired) {
      onRoleRequired(role);
    }

    return result;
  }, [isAuthenticated, isLoading, user, authHasRole, onRoleRequired]);

  // Advanced permission checking with detailed results
  const checkPermissions = useCallback((permissions: string[]): PermissionResult => {
    if (!isAuthenticated) {
      return {
        hasAccess: false,
        reason: 'unauthenticated'
      };
    }

    if (isLoading || !user) {
      return {
        hasAccess: false,
        reason: 'loading'
      };
    }

    const missingPermissions = permissions.filter(p => !hasPermission(p));

    if (missingPermissions.length > 0) {
      return {
        hasAccess: false,
        reason: 'insufficient_permission',
        missingPermissions
      };
    }

    return { hasAccess: true };
  }, [isAuthenticated, isLoading, user, hasPermission]);

  // Advanced role checking with detailed results
  const checkRoles = useCallback((roles: string[]): PermissionResult => {
    if (!isAuthenticated) {
      return {
        hasAccess: false,
        reason: 'unauthenticated'
      };
    }

    if (isLoading || !user) {
      return {
        hasAccess: false,
        reason: 'loading'
      };
    }

    const missingRoles = roles.filter(r => !hasRole(r));

    if (missingRoles.length > 0) {
      return {
        hasAccess: false,
        reason: 'insufficient_role',
        missingRoles
      };
    }

    return { hasAccess: true };
  }, [isAuthenticated, isLoading, user, hasRole]);

  // Combined permission and role checking
  const checkAccess = useCallback((
    permissions: string[] = [],
    roles: string[] = [],
    _requireAll: boolean = false
  ): PermissionResult => {
    if (!isAuthenticated) {
      return {
        hasAccess: false,
        reason: 'unauthenticated'
      };
    }

    if (isLoading || !user) {
      return {
        hasAccess: false,
        reason: 'loading'
      };
    }

    // Check permissions
    if (permissions.length > 0) {
      const permissionResult = checkPermissions(permissions);
      if (!permissionResult.hasAccess) {
        return permissionResult;
      }
    }

    // Check roles
    if (roles.length > 0) {
      const roleResult = checkRoles(roles);
      if (!roleResult.hasAccess) {
        return roleResult;
      }
    }

    return { hasAccess: true };
  }, [isAuthenticated, isLoading, user, checkPermissions, checkRoles]);

  // Get user's current permissions as array
  const currentPermissions = useMemo(() => {
    if (!user || !user.permissions) {
      return [];
    }
    return user.permissions.map(p => p.name || p);
  }, [user]);

  // Get user's current roles as array
  const currentRoles = useMemo(() => {
    if (!user || !user.roles) {
      return [];
    }
    return user.roles.map(r => r.name || r);
  }, [user]);

  // Check if user is admin
  const isAdmin = useMemo(() => {
    return hasRole('admin');
  }, [hasRole]);

  // Check if user can manage users
  const canManageUsers = useMemo(() => {
    return hasPermission('users:create') && hasPermission('users:update') && hasPermission('users:delete');
  }, [hasPermission]);

  // Check if user can manage campaigns
  const canManageCampaigns = useMemo(() => {
    return hasPermission('campaigns:create') && hasPermission('campaigns:update');
  }, [hasPermission]);

  // Clear permission cache manually
  const clearCache = useCallback(() => {
    setPermissionCache({});
  }, []);

  // Get cache stats for debugging
  const getCacheStats = useCallback(() => {
    const entries = Object.entries(permissionCache);
    const now = Date.now();
    const valid = entries.filter(([, data]) => now - data.timestamp < cacheTimeout);
    const expired = entries.filter(([, data]) => now - data.timestamp >= cacheTimeout);

    return {
      total: entries.length,
      valid: valid.length,
      expired: expired.length,
      hitRate: valid.length / Math.max(entries.length, 1)
    };
  }, [permissionCache, cacheTimeout]);

  return {
    // Basic permission functions
    hasPermission,
    hasRole,
    hasAnyRole,
    hasAllPermissions,

    // Advanced checking functions
    checkPermissions,
    checkRoles,
    checkAccess,

    // User information
    currentPermissions,
    currentRoles,
    isAdmin,
    canManageUsers,
    canManageCampaigns,

    // State
    isAuthenticated,
    isLoading,
    user,

    // Cache management
    clearCache,
    getCacheStats
  };
}

// Permission requirement types for type safety
export interface PermissionRequirement {
  permissions?: string[];
  roles?: string[];
  requireAll?: boolean;
}

// Hook for checking specific permission requirements
export function usePermissionCheck(requirement: PermissionRequirement) {
  const { checkAccess } = usePermissions();

  return useMemo(() => {
    return checkAccess(
      requirement.permissions || [],
      requirement.roles || [],
      requirement.requireAll || false
    );
  }, [checkAccess, requirement]);
}
