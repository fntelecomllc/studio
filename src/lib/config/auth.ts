// Session-Based Authentication Configuration
// Removes CSRF token dependency and focuses on cookie-only authentication

interface SessionAuthConfig {
  sessionPersistent: boolean;
  sessionTimeout: number;
  sessionCheckInterval: number;
  webSocketAuthPersistent: boolean;
  cookieSettings: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    path: string;
  };
  security: {
    requireOriginValidation: boolean;
    allowedOrigins: string[];
    customHeaders: {
      csrfProtection: string;
    };
  };
}

export const sessionAuthConfig: SessionAuthConfig = {
  // SESSION SETTINGS: Cookie-only authentication
  sessionPersistent: true,     // Keep sessions persistent across browser restarts
  sessionTimeout: 2 * 60 * 60 * 1000, // 2 hours default
  sessionCheckInterval: 5 * 60 * 1000, // Check every 5 minutes
  webSocketAuthPersistent: true, // Maintain WebSocket auth with session cookies
  
  // COOKIE CONFIGURATION: Secure session cookies
  cookieSettings: {
    httpOnly: true,  // Prevent XSS access to cookies
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict', // Strong CSRF protection
    path: '/', // Available to entire application
  },
  
  // SECURITY SETTINGS: CSRF protection without tokens
  security: {
    requireOriginValidation: true,
    allowedOrigins: [
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'http://localhost:3001', // Development backend
      'https://domainflow.local', // Production domain
    ],
    customHeaders: {
      csrfProtection: 'X-Requested-With', // Custom header for CSRF protection
    },
  },
};

// Export environment-aware settings
export const getSessionAuthSettings = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isEnterprise = process.env.DEPLOYMENT_ENVIRONMENT === 'production';
  
  return {
    ...sessionAuthConfig,
    // Environment-specific overrides
    enableDebugMode: !isProduction,
    sessionTimeout: isEnterprise ? 24 * 60 * 60 * 1000 : sessionAuthConfig.sessionTimeout, // 24h for enterprise, 2h for dev
    webSocketReconnectAuth: false, // Don't re-authenticate on WebSocket reconnect
    
    // Security overrides for production
    cookieSettings: {
      ...sessionAuthConfig.cookieSettings,
      secure: isProduction, // Force HTTPS in production
      sameSite: isProduction ? 'strict' : 'lax' as 'strict' | 'lax', // Relaxed for development
    },
    
    // API endpoints for session management
    endpoints: {
      login: '/api/v2/auth/login',
      logout: '/api/v2/auth/logout',
      me: '/api/v2/auth/me',
      refresh: '/api/v2/auth/refresh',
    },
  };
};

// Cookie management utilities
export const getCookieOptions = () => {
  const settings = getSessionAuthSettings();
  return {
    httpOnly: settings.cookieSettings.httpOnly,
    secure: settings.cookieSettings.secure,
    sameSite: settings.cookieSettings.sameSite,
    path: settings.cookieSettings.path,
    maxAge: settings.sessionTimeout / 1000, // Convert to seconds
  };
};

// CSRF protection headers
export const getSecurityHeaders = () => {
  const settings = getSessionAuthSettings();
  return {
    [settings.security.customHeaders.csrfProtection]: 'XMLHttpRequest',
    'Content-Type': 'application/json',
  };
};

export default sessionAuthConfig;