// src/lib/hooks/usePermissions.ts
// Hook for checking user permissions in React components

import { useState, useEffect } from 'react';
import { authService } from '@/lib/services/authService';
import type { User } from '@/lib/types';

export interface PermissionState {
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  isAuthenticated: boolean;
  user: User | null;
}

/**
 * Hook for checking user permissions in React components
 * Automatically updates when auth state changes
 */
export function usePermissions(): PermissionState {
  const [permissionState, setPermissionState] = useState<PermissionState>(() => {
    const authState = authService.getState();
    return {
      hasPermission: (permission: string) => authService.hasPermission(permission),
      hasRole: (role: string) => authService.hasRole(role),
      isAuthenticated: authState.isAuthenticated,
      user: authState.user,
    };
  });

  useEffect(() => {
    const unsubscribe = authService.subscribe((authState) => {
      setPermissionState({
        hasPermission: (permission: string) => authService.hasPermission(permission),
        hasRole: (role: string) => authService.hasRole(role),
        isAuthenticated: authState.isAuthenticated,
        user: authState.user,
      });
    });

    return unsubscribe;
  }, []);

  return permissionState;
}

/**
 * Hook for checking a specific permission
 * Returns true/false and updates when auth state changes
 */
export function useHasPermission(permission: string): boolean {
  const [hasPermission, setHasPermission] = useState(() => 
    authService.hasPermission(permission)
  );

  useEffect(() => {
    const unsubscribe = authService.subscribe(() => {
      setHasPermission(authService.hasPermission(permission));
    });

    return unsubscribe;
  }, [permission]);

  return hasPermission;
}

/**
 * Hook for checking a specific role
 * Returns true/false and updates when auth state changes
 */
export function useHasRole(role: string): boolean {
  const [hasRole, setHasRole] = useState(() => 
    authService.hasRole(role)
  );

  useEffect(() => {
    const unsubscribe = authService.subscribe(() => {
      setHasRole(authService.hasRole(role));
    });

    return unsubscribe;
  }, [role]);

  return hasRole;
}
