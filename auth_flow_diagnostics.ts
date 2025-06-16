// auth_flow_diagnostics.ts
// Comprehensive diagnostic tools for authentication flow debugging

import { authService } from '@/lib/services/authService';

interface DiagnosticResult {
  step: string;
  status: 'success' | 'warning' | 'error';
  message: string;
  data?: any;
  timestamp: string;
}

interface AuthFlowDiagnostics {
  sessionId: string;
  userId?: string;
  results: DiagnosticResult[];
  summary: {
    totalSteps: number;
    successSteps: number;
    warningSteps: number;
    errorSteps: number;
    overallStatus: 'healthy' | 'degraded' | 'critical';
  };
}

class AuthFlowDiagnosticsTool {
  private results: DiagnosticResult[] = [];
  private sessionId: string;

  constructor() {
    this.sessionId = `diag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private addResult(step: string, status: 'success' | 'warning' | 'error', message: string, data?: any) {
    const result: DiagnosticResult = {
      step,
      status,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    
    this.results.push(result);
    
    // Console logging for immediate feedback
    const logLevel = status === 'error' ? 'error' : status === 'warning' ? 'warn' : 'log';
    console[logLevel](`[Auth Diagnostics] ${step}: ${message}`, data);
  }

  async runComprehensiveDiagnostics(): Promise<AuthFlowDiagnostics> {
    console.log('[Auth Diagnostics] Starting comprehensive authentication flow diagnostics...');
    this.results = [];

    try {
      // Step 1: Check AuthService initialization
      await this.checkAuthServiceInitialization();

      // Step 2: Check stored tokens
      await this.checkStoredTokens();

      // Step 3: Check current auth state
      await this.checkCurrentAuthState();

      // Step 4: Check user permissions (if authenticated)
      await this.checkUserPermissions();

      // Step 5: Check session validation
      await this.checkSessionValidation();

      // Step 6: Check session-based authentication
      await this.checkSessionBasedAuth();

      // Step 7: Check API connectivity
      await this.checkAPIConnectivity();

      // Step 8: Check campaign-specific permissions
      await this.checkCampaignPermissions();

      // Step 9: Check browser storage
      await this.checkBrowserStorage();

      // Step 10: Check middleware integration
      await this.checkMiddlewareIntegration();

    } catch (error) {
      this.addResult(
        'diagnostic_execution',
        'error',
        'Failed to complete diagnostics',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    return this.generateReport();
  }

  private async checkAuthServiceInitialization() {
    try {
      // Check if authService is available
      if (!authService) {
        this.addResult('auth_service_init', 'error', 'AuthService not available');
        return;
      }

      // Check if authService methods exist
      const requiredMethods = ['getAuthState', 'hasPermission', 'hasRole'];
      const missingMethods = requiredMethods.filter(method => typeof (authService as any)[method] !== 'function');
      
      if (missingMethods.length > 0) {
        this.addResult(
          'auth_service_init',
          'error',
          'AuthService missing required methods',
          { missingMethods }
        );
        return;
      }

      this.addResult('auth_service_init', 'success', 'AuthService properly initialized');
    } catch (error) {
      this.addResult(
        'auth_service_init',
        'error',
        'Error checking AuthService initialization',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkStoredTokens() {
    try {
      // Check localStorage tokens
      const storedTokens = localStorage.getItem('auth_tokens');
      if (!storedTokens) {
        this.addResult('stored_tokens', 'warning', 'No tokens found in localStorage');
        return;
      }

      let parsedTokens;
      try {
        parsedTokens = JSON.parse(storedTokens);
      } catch (parseError) {
        this.addResult('stored_tokens', 'error', 'Invalid JSON in stored tokens');
        return;
      }

      // Check token structure
      const requiredFields = ['sessionId', 'expiresAt'];
      const missingFields = requiredFields.filter(field => !parsedTokens[field]);
      
      if (missingFields.length > 0) {
        this.addResult(
          'stored_tokens',
          'error',
          'Stored tokens missing required fields',
          { missingFields, tokens: parsedTokens }
        );
        return;
      }

      // Check expiration
      const expiresAt = new Date(parsedTokens.expiresAt).getTime();
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;
      
      if (timeUntilExpiry <= 0) {
        this.addResult(
          'stored_tokens',
          'error',
          'Stored tokens have expired',
          { 
            expiresAt: new Date(expiresAt).toISOString(),
            expiredSince: Math.abs(timeUntilExpiry),
            tokens: parsedTokens
          }
        );
        return;
      }

      if (timeUntilExpiry < 5 * 60 * 1000) { // Less than 5 minutes
        this.addResult(
          'stored_tokens',
          'warning',
          'Stored tokens expire soon',
          { 
            expiresAt: new Date(expiresAt).toISOString(),
            timeUntilExpiryMs: timeUntilExpiry,
            tokens: parsedTokens
          }
        );
      } else {
        this.addResult(
          'stored_tokens',
          'success',
          'Stored tokens are valid',
          { 
            expiresAt: new Date(expiresAt).toISOString(),
            timeUntilExpiryMs: timeUntilExpiry,
            sessionId: parsedTokens.sessionId
          }
        );
      }

    } catch (error) {
      this.addResult(
        'stored_tokens',
        'error',
        'Error checking stored tokens',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkCurrentAuthState() {
    try {
      const authState = authService.getAuthState();
      
      this.addResult(
        'auth_state',
        'success',
        'Auth state retrieved',
        {
          isAuthenticated: authState.isAuthenticated,
          isLoading: authState.isLoading,
          hasUser: !!authState.user,
          hasTokens: !!authState.tokens,
          sessionExpiry: authState.sessionExpiry ? new Date(authState.sessionExpiry).toISOString() : null,
          user: authState.user ? {
            id: authState.user.id,
            email: authState.user.email,
            role: authState.user.role,
            permissionCount: authState.user.permissions.length,
            isActive: authState.user.isActive
          } : null
        }
      );

      // Check for inconsistencies
      if (authState.isAuthenticated && !authState.user) {
        this.addResult(
          'auth_state',
          'error',
          'Authenticated but no user data',
          { authState }
        );
      }

      if (authState.isAuthenticated && !authState.tokens) {
        this.addResult(
          'auth_state',
          'error',
          'Authenticated but no tokens',
          { authState }
        );
      }

    } catch (error) {
      this.addResult(
        'auth_state',
        'error',
        'Error checking auth state',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkUserPermissions() {
    try {
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated || !authState.user) {
        this.addResult('user_permissions', 'warning', 'Not authenticated, skipping permission check');
        return;
      }

      const user = authState.user;
      const permissionAnalysis = {
        totalPermissions: user.permissions.length,
        permissions: user.permissions,
        role: user.role,
        hasCampaignPermissions: {
          create: user.permissions.includes('campaigns:create'),
          read: user.permissions.includes('campaigns:read'),
          update: user.permissions.includes('campaigns:update'),
          delete: user.permissions.includes('campaigns:delete'),
          execute: user.permissions.includes('campaigns:execute')
        },
        hasSystemPermissions: {
          admin: user.permissions.includes('system:admin'),
          config: user.permissions.includes('system:config'),
          users: user.permissions.includes('system:users'),
          audit: user.permissions.includes('system:audit')
        }
      };

      const campaignPermCount = Object.values(permissionAnalysis.hasCampaignPermissions).filter(Boolean).length;
      const systemPermCount = Object.values(permissionAnalysis.hasSystemPermissions).filter(Boolean).length;

      if (user.role === 'super_admin' || user.role === 'admin') {
        if (campaignPermCount < 3) {
          this.addResult(
            'user_permissions',
            'error',
            'Admin user missing critical campaign permissions',
            permissionAnalysis
          );
        } else if (campaignPermCount < 5) {
          this.addResult(
            'user_permissions',
            'warning',
            'Admin user missing some campaign permissions',
            permissionAnalysis
          );
        } else {
          this.addResult(
            'user_permissions',
            'success',
            'Admin user has comprehensive campaign permissions',
            permissionAnalysis
          );
        }
      } else {
        this.addResult(
          'user_permissions',
          'success',
          'User permissions loaded',
          permissionAnalysis
        );
      }

    } catch (error) {
      this.addResult(
        'user_permissions',
        'error',
        'Error checking user permissions',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkSessionValidation() {
    try {
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated) {
        this.addResult('session_validation', 'warning', 'User not authenticated');
        return;
      }

      // Try to refresh session to validate it
      const isValid = await authService.refreshSession();
      
      this.addResult(
        'session_validation',
        isValid ? 'success' : 'error',
        isValid ? 'Session validation successful' : 'Session validation failed',
        { isValid }
      );

    } catch (error) {
      this.addResult(
        'session_validation',
        'error',
        'Error validating session',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkSessionBasedAuth() {
    try {
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated) {
        this.addResult('session_auth', 'warning', 'User not authenticated');
        return;
      }

      // Test session-based authenticated request
      const testResponse = await fetch('/api/v2/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (testResponse.ok) {
        this.addResult(
          'session_auth',
          'success',
          'Session-based authentication working correctly',
          { status: testResponse.status }
        );
      } else {
        this.addResult(
          'session_auth',
          'error',
          'Session-based authentication failed',
          { status: testResponse.status, statusText: testResponse.statusText }
        );
      }

    } catch (error) {
      this.addResult(
        'session_auth',
        'error',
        'Error checking session-based authentication',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkAPIConnectivity() {
    try {
      // Try to make a simple API call to check connectivity
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        this.addResult(
          'api_connectivity',
          'success',
          'API connectivity confirmed',
          { status: response.status, statusText: response.statusText }
        );
      } else {
        this.addResult(
          'api_connectivity',
          'warning',
          'API responded with non-OK status',
          { status: response.status, statusText: response.statusText }
        );
      }

    } catch (error) {
      this.addResult(
        'api_connectivity',
        'error',
        'API connectivity failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkCampaignPermissions() {
    try {
      const campaignPermissions = [
        'campaigns:create',
        'campaigns:read',
        'campaigns:update',
        'campaigns:delete',
        'campaigns:execute'
      ];

      const permissionResults = campaignPermissions.map(permission => ({
        permission,
        hasPermission: authService.hasPermission(permission)
      }));

      const hasAllCampaignPerms = permissionResults.every(result => result.hasPermission);
      const hasSomeCampaignPerms = permissionResults.some(result => result.hasPermission);

      if (hasAllCampaignPerms) {
        this.addResult(
          'campaign_permissions',
          'success',
          'User has all campaign permissions',
          { permissionResults }
        );
      } else if (hasSomeCampaignPerms) {
        this.addResult(
          'campaign_permissions',
          'warning',
          'User has partial campaign permissions',
          { 
            permissionResults,
            missingPermissions: permissionResults.filter(r => !r.hasPermission).map(r => r.permission)
          }
        );
      } else {
        this.addResult(
          'campaign_permissions',
          'error',
          'User has no campaign permissions',
          { permissionResults }
        );
      }

    } catch (error) {
      this.addResult(
        'campaign_permissions',
        'error',
        'Error checking campaign permissions',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkBrowserStorage() {
    try {
      const storageChecks = {
        localStorage: {
          available: typeof localStorage !== 'undefined',
          authTokens: localStorage.getItem('auth_tokens') !== null,
          tokenContent: null as any
        },
        sessionStorage: {
          available: typeof sessionStorage !== 'undefined',
          hasData: sessionStorage.length > 0
        },
        cookies: {
          available: typeof document !== 'undefined',
          sessionId: null as string | null
        }
      };

      // Check localStorage tokens in detail
      if (storageChecks.localStorage.authTokens) {
        try {
          storageChecks.localStorage.tokenContent = JSON.parse(localStorage.getItem('auth_tokens')!);
        } catch (e) {
          storageChecks.localStorage.tokenContent = 'INVALID_JSON';
        }
      }

      // Check cookies
      if (storageChecks.cookies.available) {
        const cookies = document.cookie.split(';').reduce((acc, cookie) => {
          const parts = cookie.trim().split('=');
          const name = parts[0];
          const value = parts[1];
          if (name && value) {
            acc[name] = value;
          }
          return acc;
        }, {} as Record<string, string>);

        storageChecks.cookies.sessionId = cookies.session_id || null;
      }

      this.addResult(
        'browser_storage',
        'success',
        'Browser storage analysis complete',
        storageChecks
      );

    } catch (error) {
      this.addResult(
        'browser_storage',
        'error',
        'Error checking browser storage',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async checkMiddlewareIntegration() {
    try {
      // This would check if middleware is properly handling auth headers
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated) {
        this.addResult('middleware_integration', 'warning', 'Not authenticated, skipping middleware check');
        return;
      }

      // Check if we can make an authenticated request
      const testResponse = await fetch('/api/v2/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (testResponse.ok) {
        const userData = await testResponse.json();
        this.addResult(
          'middleware_integration',
          'success',
          'Middleware authentication working',
          { 
            status: testResponse.status,
            hasUserData: !!userData,
            userInfo: userData ? {
              user_id: userData.user_id,
              permissions: userData.permissions?.length || 0
            } : null
          }
        );
      } else if (testResponse.status === 401) {
        this.addResult(
          'middleware_integration',
          'error',
          'Middleware rejecting authenticated requests',
          { status: testResponse.status, statusText: testResponse.statusText }
        );
      } else {
        this.addResult(
          'middleware_integration',
          'warning',
          'Middleware responded with unexpected status',
          { status: testResponse.status, statusText: testResponse.statusText }
        );
      }

    } catch (error) {
      this.addResult(
        'middleware_integration',
        'error',
        'Error checking middleware integration',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private generateReport(): AuthFlowDiagnostics {
    const summary = {
      totalSteps: this.results.length,
      successSteps: this.results.filter(r => r.status === 'success').length,
      warningSteps: this.results.filter(r => r.status === 'warning').length,
      errorSteps: this.results.filter(r => r.status === 'error').length,
      overallStatus: 'healthy' as 'healthy' | 'degraded' | 'critical'
    };

    // Determine overall status
    if (summary.errorSteps > 0) {
      summary.overallStatus = 'critical';
    } else if (summary.warningSteps > 0) {
      summary.overallStatus = 'degraded';
    }

    const report: AuthFlowDiagnostics = {
      sessionId: this.sessionId,
      userId: authService.getAuthState().user?.id,
      results: this.results,
      summary
    };

    console.log('[Auth Diagnostics] Comprehensive diagnostics complete:', report);
    return report;
  }

  // Utility method to export diagnostics for support
  static exportDiagnostics(diagnostics: AuthFlowDiagnostics): string {
    const exportData = {
      ...diagnostics,
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  // Utility method to run quick health check
  static async quickHealthCheck(): Promise<{ status: string; message: string; details?: any }> {
    try {
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated) {
        return { status: 'unauthenticated', message: 'User not authenticated' };
      }

      if (!authState.user) {
        return { status: 'error', message: 'Authenticated but no user data' };
      }

      const hasCampaignRead = authService.hasPermission('campaigns:read');
      const hasCampaignCreate = authService.hasPermission('campaigns:create');

      if (!hasCampaignRead && !hasCampaignCreate) {
        return { 
          status: 'error', 
          message: 'User lacks campaign permissions',
          details: {
            userRole: authState.user.role,
            permissions: authState.user.permissions
          }
        };
      }

      return { 
        status: 'healthy', 
        message: 'Authentication system functioning normally',
        details: {
          userRole: authState.user.role,
          permissionCount: authState.user.permissions.length,
          hasCampaignAccess: hasCampaignRead || hasCampaignCreate
        }
      };

    } catch (error) {
      return { 
        status: 'error', 
        message: 'Health check failed',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }
}

// Export the diagnostic tool
export const authDiagnostics = new AuthFlowDiagnosticsTool();
export { AuthFlowDiagnosticsTool, type AuthFlowDiagnostics, type DiagnosticResult };

// Global diagnostic function for browser console
if (typeof window !== 'undefined') {
  (window as any).runAuthDiagnostics = () => authDiagnostics.runComprehensiveDiagnostics();
  (window as any).authHealthCheck = () => AuthFlowDiagnosticsTool.quickHealthCheck();
}