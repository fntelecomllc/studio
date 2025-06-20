/**
 * Permission validation utilities for granular access control
 * Provides centralized permission definitions and validation helpers
 */

// ============================================================================
// PERMISSION DEFINITIONS
// ============================================================================

/**
 * System-wide permission definitions
 */
export const PERMISSIONS = {
  // Campaign permissions
  CAMPAIGNS: {
    READ: 'campaigns:read',
    CREATE: 'campaigns:create',
    UPDATE: 'campaigns:update',
    DELETE: 'campaigns:delete',
    START: 'campaigns:start',
    PAUSE: 'campaigns:pause',
    STOP: 'campaigns:stop',
    RESUME: 'campaigns:resume',
    EXPORT: 'campaigns:export',
    MANAGE_ALL: 'campaigns:manage_all'
  },
  
  // User management permissions
  USERS: {
    READ: 'users:read',
    CREATE: 'users:create',
    UPDATE: 'users:update',
    DELETE: 'users:delete',
    MANAGE_ROLES: 'users:manage_roles',
    MANAGE_PERMISSIONS: 'users:manage_permissions',
    RESET_PASSWORD: 'users:reset_password',
    MANAGE_ALL: 'users:manage_all'
  },
  
  // Persona permissions
  PERSONAS: {
    READ: 'personas:read',
    CREATE: 'personas:create',
    UPDATE: 'personas:update',
    DELETE: 'personas:delete',
    MANAGE_ALL: 'personas:manage_all'
  },
  
  // Proxy permissions
  PROXIES: {
    READ: 'proxies:read',
    CREATE: 'proxies:create',
    UPDATE: 'proxies:update',
    DELETE: 'proxies:delete',
    TEST: 'proxies:test',
    MANAGE_ALL: 'proxies:manage_all'
  },
  
  // System permissions
  SYSTEM: {
    CONFIG: 'system:config',
    MONITORING: 'system:monitoring',
    LOGS: 'system:logs',
    BACKUP: 'system:backup',
    MAINTENANCE: 'system:maintenance',
    ADMIN_ALL: 'admin:all'
  },
  
  // Security permissions
  SECURITY: {
    READ: 'security:read',
    AUDIT_LOGS: 'security:audit_logs',
    MANAGE_API_KEYS: 'security:manage_api_keys',
    MANAGE_SESSIONS: 'security:manage_sessions',
    MANAGE_ALL: 'security:manage_all'
  }
} as const;

/**
 * Role definitions with associated permissions
 */
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  USER: 'user',
  VIEWER: 'viewer'
} as const;

/**
 * Default permissions for each role
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLES.ADMIN]: [
    // Full access to everything
    PERMISSIONS.SYSTEM.ADMIN_ALL
  ],
  
  [ROLES.MANAGER]: [
    // Campaign management
    PERMISSIONS.CAMPAIGNS.READ,
    PERMISSIONS.CAMPAIGNS.CREATE,
    PERMISSIONS.CAMPAIGNS.UPDATE,
    PERMISSIONS.CAMPAIGNS.DELETE,
    PERMISSIONS.CAMPAIGNS.START,
    PERMISSIONS.CAMPAIGNS.PAUSE,
    PERMISSIONS.CAMPAIGNS.STOP,
    PERMISSIONS.CAMPAIGNS.RESUME,
    PERMISSIONS.CAMPAIGNS.EXPORT,
    
    // User management (limited)
    PERMISSIONS.USERS.READ,
    PERMISSIONS.USERS.UPDATE,
    
    // Persona management
    PERMISSIONS.PERSONAS.READ,
    PERMISSIONS.PERSONAS.CREATE,
    PERMISSIONS.PERSONAS.UPDATE,
    
    // Proxy management
    PERMISSIONS.PROXIES.READ,
    PERMISSIONS.PROXIES.CREATE,
    PERMISSIONS.PROXIES.UPDATE,
    PERMISSIONS.PROXIES.TEST,
    
    // Security (read-only)
    PERMISSIONS.SECURITY.READ
  ],
  
  [ROLES.USER]: [
    // Campaign operations
    PERMISSIONS.CAMPAIGNS.READ,
    PERMISSIONS.CAMPAIGNS.CREATE,
    PERMISSIONS.CAMPAIGNS.UPDATE,
    PERMISSIONS.CAMPAIGNS.START,
    PERMISSIONS.CAMPAIGNS.PAUSE,
    PERMISSIONS.CAMPAIGNS.RESUME,
    
    // Persona operations
    PERMISSIONS.PERSONAS.READ,
    PERMISSIONS.PERSONAS.CREATE,
    
    // Proxy operations
    PERMISSIONS.PROXIES.READ,
    PERMISSIONS.PROXIES.TEST
  ],
  
  [ROLES.VIEWER]: [
    // Read-only access
    PERMISSIONS.CAMPAIGNS.READ,
    PERMISSIONS.PERSONAS.READ,
    PERMISSIONS.PROXIES.READ
  ]
};

// ============================================================================
// PERMISSION VALIDATION HELPERS
// ============================================================================

/**
 * Check if a permission implies another permission
 * Used for hierarchical permission checking
 */
export function permissionImplies(permission: string, requiredPermission: string): boolean {
  // Admin has all permissions
  if (permission === PERMISSIONS.SYSTEM.ADMIN_ALL) {
    return true;
  }
  
  // Check for manage_all permissions
  const [resource] = requiredPermission.split(':');
  const manageAllPermission = `${resource}:manage_all`;
  
  if (permission === manageAllPermission) {
    return true;
  }
  
  // Direct match
  return permission === requiredPermission;
}

/**
 * Check if a set of permissions satisfies a required permission
 */
export function hasRequiredPermission(
  userPermissions: string[],
  requiredPermission: string
): boolean {
  return userPermissions.some(permission => 
    permissionImplies(permission, requiredPermission)
  );
}

/**
 * Check if a set of permissions satisfies all required permissions
 */
export function hasAllRequiredPermissions(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.every(required =>
    hasRequiredPermission(userPermissions, required)
  );
}

/**
 * Check if a set of permissions satisfies any of the required permissions
 */
export function hasAnyRequiredPermission(
  userPermissions: string[],
  requiredPermissions: string[]
): boolean {
  return requiredPermissions.some(required =>
    hasRequiredPermission(userPermissions, required)
  );
}

/**
 * Get all permissions for a role (including implied permissions)
 */
export function getRolePermissions(role: string): string[] {
  const basePermissions = ROLE_PERMISSIONS[role] || [];
  
  // Admin role gets all permissions
  if (role === ROLES.ADMIN) {
    return [PERMISSIONS.SYSTEM.ADMIN_ALL];
  }
  
  return basePermissions;
}

/**
 * Check if a user with given roles can perform an action
 */
export function canPerformAction(
  userRoles: string[],
  requiredPermission: string
): boolean {
  const allPermissions = userRoles.flatMap(role => getRolePermissions(role));
  return hasRequiredPermission(allPermissions, requiredPermission);
}

// ============================================================================
// ACTION PERMISSION MAPPINGS
// ============================================================================

/**
 * Map UI actions to required permissions
 */
export const ACTION_PERMISSIONS = {
  // Campaign actions
  CREATE_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.CREATE],
  EDIT_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.UPDATE],
  DELETE_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.DELETE],
  START_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.START],
  PAUSE_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.PAUSE],
  STOP_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.STOP],
  RESUME_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.RESUME],
  EXPORT_CAMPAIGN: [PERMISSIONS.CAMPAIGNS.EXPORT],
  VIEW_CAMPAIGN_DETAILS: [PERMISSIONS.CAMPAIGNS.READ],
  
  // User actions
  CREATE_USER: [PERMISSIONS.USERS.CREATE],
  EDIT_USER: [PERMISSIONS.USERS.UPDATE],
  DELETE_USER: [PERMISSIONS.USERS.DELETE],
  RESET_USER_PASSWORD: [PERMISSIONS.USERS.RESET_PASSWORD],
  MANAGE_USER_ROLES: [PERMISSIONS.USERS.MANAGE_ROLES],
  VIEW_USER_LIST: [PERMISSIONS.USERS.READ],
  
  // Persona actions
  CREATE_PERSONA: [PERMISSIONS.PERSONAS.CREATE],
  EDIT_PERSONA: [PERMISSIONS.PERSONAS.UPDATE],
  DELETE_PERSONA: [PERMISSIONS.PERSONAS.DELETE],
  VIEW_PERSONA_LIST: [PERMISSIONS.PERSONAS.READ],
  
  // Proxy actions
  CREATE_PROXY: [PERMISSIONS.PROXIES.CREATE],
  EDIT_PROXY: [PERMISSIONS.PROXIES.UPDATE],
  DELETE_PROXY: [PERMISSIONS.PROXIES.DELETE],
  TEST_PROXY: [PERMISSIONS.PROXIES.TEST],
  VIEW_PROXY_LIST: [PERMISSIONS.PROXIES.READ],
  
  // System actions
  ACCESS_ADMIN_PANEL: [PERMISSIONS.USERS.READ],
  VIEW_AUDIT_LOGS: [PERMISSIONS.SECURITY.AUDIT_LOGS],
  MANAGE_SYSTEM_SETTINGS: [PERMISSIONS.SYSTEM.CONFIG],
  VIEW_SYSTEM_MONITORING: [PERMISSIONS.SYSTEM.MONITORING]
} as const;

// ============================================================================
// ROUTE PERMISSION MAPPINGS
// ============================================================================

/**
 * Map routes to required permissions
 */
export const ROUTE_PERMISSIONS: Record<string, {
  permissions?: string[];
  roles?: string[];
  requireAll?: boolean;
}> = {
  '/admin': {
    permissions: [PERMISSIONS.USERS.READ],
    requireAll: false
  },
  '/admin/users': {
    permissions: [PERMISSIONS.USERS.READ]
  },
  '/admin/users/new': {
    permissions: [PERMISSIONS.USERS.CREATE]
  },
  '/admin/users/[id]/edit': {
    permissions: [PERMISSIONS.USERS.UPDATE]
  },
  '/campaigns': {
    permissions: [PERMISSIONS.CAMPAIGNS.READ]
  },
  '/campaigns/new': {
    permissions: [PERMISSIONS.CAMPAIGNS.CREATE]
  },
  '/campaigns/[id]/edit': {
    permissions: [PERMISSIONS.CAMPAIGNS.UPDATE]
  },
  '/personas': {
    permissions: [PERMISSIONS.PERSONAS.READ]
  },
  '/personas/new': {
    permissions: [PERMISSIONS.PERSONAS.CREATE]
  },
  '/personas/[id]/edit': {
    permissions: [PERMISSIONS.PERSONAS.UPDATE]
  },
  '/proxies': {
    permissions: [PERMISSIONS.PROXIES.READ]
  }
};

// ============================================================================
// PERMISSION VALIDATION UTILITIES
// ============================================================================

/**
 * Validate if a user can access a route
 */
export function canAccessRoute(
  pathname: string,
  userPermissions: string[],
  userRoles: string[]
): boolean {
  const routeConfig = ROUTE_PERMISSIONS[pathname];
  
  if (!routeConfig) {
    // No restrictions for this route
    return true;
  }
  
  // Check permissions
  if (routeConfig.permissions && routeConfig.permissions.length > 0) {
    const hasPermissions = routeConfig.requireAll
      ? hasAllRequiredPermissions(userPermissions, routeConfig.permissions)
      : hasAnyRequiredPermission(userPermissions, routeConfig.permissions);
      
    if (!hasPermissions) {
      return false;
    }
  }
  
  // Check roles
  if (routeConfig.roles && routeConfig.roles.length > 0) {
    const hasRole = userRoles.some(role => routeConfig.roles?.includes(role));
    if (!hasRole) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get missing permissions for an action
 */
export function getMissingPermissions(
  userPermissions: string[],
  requiredPermissions: string[]
): string[] {
  return requiredPermissions.filter(required =>
    !hasRequiredPermission(userPermissions, required)
  );
}

/**
 * Format permission name for display
 */
export function formatPermissionName(permission: string): string {
  const parts = permission.split(':');
  const resource = parts[0] || '';
  const action = parts[1] || '';
  
  if (!action || !resource) {
    return permission;
  }
  
  return `${action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ')} ${resource}`;
}

/**
 * Get permission description
 */
export function getPermissionDescription(permission: string): string {
  const descriptions: Record<string, string> = {
    [PERMISSIONS.CAMPAIGNS.READ]: 'View campaign details and statistics',
    [PERMISSIONS.CAMPAIGNS.CREATE]: 'Create new campaigns',
    [PERMISSIONS.CAMPAIGNS.UPDATE]: 'Edit existing campaigns',
    [PERMISSIONS.CAMPAIGNS.DELETE]: 'Delete campaigns',
    [PERMISSIONS.CAMPAIGNS.START]: 'Start campaign execution',
    [PERMISSIONS.CAMPAIGNS.PAUSE]: 'Pause running campaigns',
    [PERMISSIONS.CAMPAIGNS.STOP]: 'Stop and cancel campaigns',
    [PERMISSIONS.CAMPAIGNS.RESUME]: 'Resume paused campaigns',
    [PERMISSIONS.CAMPAIGNS.EXPORT]: 'Export campaign data',
    [PERMISSIONS.USERS.READ]: 'View user profiles and lists',
    [PERMISSIONS.USERS.CREATE]: 'Create new user accounts',
    [PERMISSIONS.USERS.UPDATE]: 'Edit user profiles',
    [PERMISSIONS.USERS.DELETE]: 'Delete user accounts',
    [PERMISSIONS.USERS.MANAGE_ROLES]: 'Assign and remove user roles',
    [PERMISSIONS.USERS.MANAGE_PERMISSIONS]: 'Grant and revoke permissions',
    [PERMISSIONS.USERS.RESET_PASSWORD]: 'Reset user passwords',
    [PERMISSIONS.SYSTEM.ADMIN_ALL]: 'Full administrative access to all features'
  };
  
  return descriptions[permission] || 'No description available';
}

// ============================================================================
// PERMISSION GROUPS
// ============================================================================

/**
 * Group permissions by resource for UI display
 */
export function groupPermissionsByResource(permissions: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  
  permissions.forEach(permission => {
    const parts = permission.split(':');
    const resource = parts[0];
    
    if (resource) {
      if (!grouped[resource]) {
        grouped[resource] = [];
      }
      grouped[resource].push(permission);
    }
  });
  
  return grouped;
}

/**
 * Get all available permissions
 */
export function getAllPermissions(): string[] {
  const permissions: string[] = [];
  
  Object.values(PERMISSIONS).forEach(category => {
    Object.values(category).forEach(permission => {
      permissions.push(permission);
    });
  });
  
  return permissions;
}

/**
 * Check if a permission is valid
 */
export function isValidPermission(permission: string): boolean {
  return getAllPermissions().includes(permission);
}

/**
 * Validate a list of permissions
 */
export function validatePermissions(permissions: string[]): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  
  permissions.forEach(permission => {
    if (isValidPermission(permission)) {
      valid.push(permission);
    } else {
      invalid.push(permission);
    }
  });
  
  return { valid, invalid };
}