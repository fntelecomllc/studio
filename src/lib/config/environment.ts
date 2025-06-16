/**
 * @fileOverview Comprehensive environment configuration for DomainFlow
 * Handles API endpoints, security settings, and deplo    auth: {
      sessionCheckIntervalMinutes: 5,
      sessionTimeoutMinutes: 120, // 2 hours
    },-specific configurations
 */

export interface EnvironmentConfig {
  // API Configuration
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
  
  // Authentication Configuration
  auth: {
    sessionCheckIntervalMinutes: number;
    sessionTimeoutMinutes: number;
  };
  
  // WebSocket Configuration
  websocket: {
    url: string;
    reconnectAttempts: number;
    reconnectDelay: number;
    heartbeatInterval: number;
  };
  
  // Security Configuration
  security: {
    enableCSRF: boolean;
    corsOrigins: string[];
    enableSecureHeaders: boolean;
  };
  
  // Feature Flags
  features: {
    enableRealTimeUpdates: boolean;
    enableOfflineMode: boolean;
    enableAnalytics: boolean;
    enableDebugMode: boolean;
  };
  
  // Performance Configuration
  performance: {
    maxConcurrentRequests: number;
    cacheTimeout: number;
    enableRequestDeduplication: boolean;
  };
}

// Environment-specific configurations
const environments: Record<string, EnvironmentConfig> = {
  development: {
    api: {
      baseUrl: 'http://localhost:8080',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    auth: {
      sessionCheckIntervalMinutes: 5,
      sessionTimeoutMinutes: 120, // 2 hours
    },
    websocket: {
      url: 'ws://localhost:8080/api/v2/ws',
      reconnectAttempts: 5,
      reconnectDelay: 2000,
      heartbeatInterval: 30000,
    },
    security: {
      enableCSRF: false,
      corsOrigins: ['http://localhost:3000'],
      enableSecureHeaders: false,
    },
    features: {
      enableRealTimeUpdates: true,
      enableOfflineMode: false,
      enableAnalytics: false,
      enableDebugMode: true,
    },
    performance: {
      maxConcurrentRequests: 10,
      cacheTimeout: 300000, // 5 minutes
      enableRequestDeduplication: true,
    },
  },
  
  staging: {
    api: {
      baseUrl: '/api',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
    },
    auth: {
      sessionCheckIntervalMinutes: 5,
      sessionTimeoutMinutes: 120, // 2 hours
    },
    websocket: {
      url: '/api/v2/ws',
      reconnectAttempts: 10,
      reconnectDelay: 3000,
      heartbeatInterval: 30000,
    },
    security: {
      enableCSRF: true,
      corsOrigins: [],
      enableSecureHeaders: true,
    },
    features: {
      enableRealTimeUpdates: true,
      enableOfflineMode: true,
      enableAnalytics: true,
      enableDebugMode: false,
    },
    performance: {
      maxConcurrentRequests: 15,
      cacheTimeout: 600000, // 10 minutes
      enableRequestDeduplication: true,
    },
  },
  
  production: {
    api: {
      baseUrl: '/api',
      timeout: 30000,
      retryAttempts: 5,
      retryDelay: 2000,
    },
    auth: {
      sessionCheckIntervalMinutes: 10,
      sessionTimeoutMinutes: 120, // 2 hours
    },
    websocket: {
      url: '/api/v2/ws',
      reconnectAttempts: 15,
      reconnectDelay: 5000,
      heartbeatInterval: 30000,
    },
    security: {
      enableCSRF: true,
      corsOrigins: [],
      enableSecureHeaders: true,
    },
    features: {
      enableRealTimeUpdates: true,
      enableOfflineMode: true,
      enableAnalytics: true,
      enableDebugMode: false,
    },
    performance: {
      maxConcurrentRequests: 20,
      cacheTimeout: 900000, // 15 minutes
      enableRequestDeduplication: true,
    },
  },
};

// Detect current environment
function getCurrentEnvironment(): string {
  if (typeof window === 'undefined') {
    return 'production'; // SSR fallback - assume production for server-side rendering
  }
  
  const hostname = window.location.hostname;
  
  // Check for explicit environment override
  const envOverride = localStorage.getItem('environmentOverride');
  if (envOverride && ['development', 'staging', 'production'].includes(envOverride)) {
    return envOverride;
  }
  
  // Remove external domain detection for offline operation
  // All external domain checks disabled
  
  // Simplified localhost detection for offline operation
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const port = window.location.port;
    // If port 3000, assume development (Next.js dev server)
    if (port === '3000') {
      return 'development';
    }
    // If no port specified (port 80) or explicitly port 80, assume production
    if (!port || port === '80') {
      return 'production';
    }
    // For any other port on localhost, assume development
    return 'development';
  }
  
  // Default to production for offline deployments
  return 'production';
}

// Get current environment configuration
export function getEnvironmentConfig(): EnvironmentConfig {
  const env = getCurrentEnvironment();
  const config = environments[env];
  
  if (!config) {
    console.warn(`Unknown environment: ${env}, falling back to development`);
    return environments.development as EnvironmentConfig;
  }
  
  // Apply runtime overrides from localStorage or URL params
  return applyRuntimeOverrides(config);
}

// Apply runtime configuration overrides
function applyRuntimeOverrides(config: EnvironmentConfig): EnvironmentConfig {
  if (typeof window === 'undefined') {
    return config;
  }
  
  const overriddenConfig = { ...config };
  
  try {
    // URL parameter overrides
    const urlParams = new URLSearchParams(window.location.search);
    
    // API base URL override
    const apiOverride = urlParams.get('api');
    if (apiOverride) {
      overriddenConfig.api.baseUrl = apiOverride;
      console.info(`API base URL overridden via URL param: ${apiOverride}`);
    }
    
    // Debug mode override
    const debugOverride = urlParams.get('debug');
    if (debugOverride === 'true' || debugOverride === '1') {
      overriddenConfig.features.enableDebugMode = true;
      console.info('Debug mode enabled via URL param');
    }
    
    // localStorage overrides
    const storedApiUrl = localStorage.getItem('apiBaseUrlOverride');
    if (storedApiUrl && !apiOverride) {
      overriddenConfig.api.baseUrl = storedApiUrl;
      console.info(`API base URL overridden via localStorage: ${storedApiUrl}`);
    }
    
    const storedDebugMode = localStorage.getItem('debugModeOverride');
    if (storedDebugMode === 'true' && !debugOverride) {
      overriddenConfig.features.enableDebugMode = true;
      console.info('Debug mode enabled via localStorage');
    }
    
  } catch (error) {
    console.warn('Failed to apply runtime overrides:', error);
  }
  
  return overriddenConfig;
}

// Utility functions for specific configuration access
export function getApiConfig() {
  return getEnvironmentConfig().api;
}

export function getAuthConfig() {
  return getEnvironmentConfig().auth;
}

export function getWebSocketConfig() {
  return getEnvironmentConfig().websocket;
}

export function getSecurityConfig() {
  return getEnvironmentConfig().security;
}

export function getFeatureFlags() {
  return getEnvironmentConfig().features;
}

export function getPerformanceConfig() {
  return getEnvironmentConfig().performance;
}

// Development utilities
export function setApiBaseUrlOverride(url: string | null): void {
  if (typeof window !== 'undefined') {
    try {
      if (url) {
        localStorage.setItem('apiBaseUrlOverride', url);
        console.info(`API base URL override set: ${url}`);
      } else {
        localStorage.removeItem('apiBaseUrlOverride');
        console.info('API base URL override removed');
      }
    } catch (error) {
      console.error('Failed to set API base URL override:', error);
    }
  }
}

export function setDebugModeOverride(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      if (enabled) {
        localStorage.setItem('debugModeOverride', 'true');
        console.info('Debug mode override enabled');
      } else {
        localStorage.removeItem('debugModeOverride');
        console.info('Debug mode override disabled');
      }
    } catch (error) {
      console.error('Failed to set debug mode override:', error);
    }
  }
}

// Export current environment for debugging
export function getCurrentEnvironmentName(): string {
  return getCurrentEnvironment();
}

// Validate configuration on load
export function validateConfiguration(): boolean {
  try {
    const config = getEnvironmentConfig();
    
    // Validate required fields
    if (!config.api.baseUrl) {
      console.error('Invalid configuration: API base URL is required');
      return false;
    }
    
    if (config.auth.sessionTimeoutMinutes <= 0) {
      console.error('Invalid configuration: Session timeout must be positive');
      return false;
    }
    
    if (config.features.enableDebugMode) {
      console.info('Configuration validation passed', config);
    }
    
    return true;
  } catch (error) {
    console.error('Configuration validation failed:', error);
    return false;
  }
}