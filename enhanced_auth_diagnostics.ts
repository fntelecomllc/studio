// enhanced_auth_diagnostics.ts
// Enhanced diagnostics specifically for authentication state synchronization issues

import { authService } from '@/lib/services/authService';
import { getApiBaseUrl } from '@/lib/config';

interface AuthStateTrace {
  timestamp: string;
  step: string;
  authState: {
    isAuthenticated: boolean;
    hasUser: boolean;
    hasTokens: boolean;
    userPermissions: string[];
    userRole: string | null;
  };
  additionalData?: any;
}

class EnhancedAuthDiagnostics {
  private traces: AuthStateTrace[] = [];

  private addTrace(step: string, additionalData?: any) {
    const authState = authService.getAuthState();
    const trace: AuthStateTrace = {
      timestamp: new Date().toISOString(),
      step,
      authState: {
        isAuthenticated: authState.isAuthenticated,
        hasUser: !!authState.user,
        hasTokens: !!authState.tokens,
        userPermissions: authState.user?.permissions || [],
        userRole: authState.user?.role || null,
      },
      additionalData
    };
    
    this.traces.push(trace);
    console.log(`[Enhanced Auth Diagnostics] ${step}:`, trace);
  }

  async diagnoseMeEndpointIssue(): Promise<{
    success: boolean;
    issue: string;
    details: any;
    traces: AuthStateTrace[];
  }> {
    console.log('[Enhanced Auth Diagnostics] Starting /me endpoint issue diagnosis...');
    this.traces = [];

    try {
      this.addTrace('diagnostic_start');
      
      // Step 1: Check stored tokens directly
      const storedTokens = localStorage.getItem('auth_tokens');
      let parsedTokens = null;
      
      if (storedTokens) {
        try {
          parsedTokens = JSON.parse(storedTokens);
          this.addTrace('stored_tokens_found', {
            hasSessionId: !!parsedTokens.sessionId,
            expiresAt: parsedTokens.expiresAt,
            isExpired: new Date(parsedTokens.expiresAt).getTime() <= Date.now()
          });
        } catch (e) {
          this.addTrace('stored_tokens_parse_error', { error: e instanceof Error ? e.message : String(e) });
          return {
            success: false,
            issue: 'STORED_TOKENS_INVALID',
            details: { error: 'Cannot parse stored tokens' },
            traces: this.traces
          };
        }
      } else {
        this.addTrace('no_stored_tokens');
        return {
          success: false,
          issue: 'NO_STORED_TOKENS',
          details: {},
          traces: this.traces
        };
      }

      // Step 2: Test /me endpoint directly with stored tokens
      const baseUrl = await getApiBaseUrl();
      this.addTrace('api_base_url_resolved', { baseUrl });

      const meResponse = await fetch(`${baseUrl}/api/v2/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      this.addTrace('me_endpoint_response', {
        status: meResponse.status,
        statusText: meResponse.statusText,
        ok: meResponse.ok,
        headers: Object.fromEntries(meResponse.headers.entries())
      });

      if (!meResponse.ok) {
        const errorText = await meResponse.text();
        this.addTrace('me_endpoint_error', { errorText });
        
        return {
          success: false,
          issue: 'ME_ENDPOINT_FAILED',
          details: {
            status: meResponse.status,
            statusText: meResponse.statusText,
            errorText
          },
          traces: this.traces
        };
      }

      // Step 3: Parse /me response
      const meData = await meResponse.json();
      this.addTrace('me_endpoint_data_parsed', {
        hasUserId: !!meData.user_id,
        hasPermissions: !!meData.permissions,
        permissionsCount: Array.isArray(meData.permissions) ? meData.permissions.length : 0,
        permissions: Array.isArray(meData.permissions) ? meData.permissions : null,
        hasRoles: !!meData.roles,
        rolesCount: Array.isArray(meData.roles) ? meData.roles.length : 0,
        fullData: meData
      });

      // Step 4: Test session refresh endpoint
      const refreshResponse = await fetch(`${baseUrl}/api/v2/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ sessionId: parsedTokens.sessionId }),
      });

      this.addTrace('refresh_endpoint_response', {
        status: refreshResponse.status,
        statusText: refreshResponse.statusText,
        ok: refreshResponse.ok
      });

      if (!refreshResponse.ok) {
        const refreshErrorText = await refreshResponse.text();
        this.addTrace('refresh_endpoint_error', { errorText: refreshErrorText });
        
        return {
          success: false,
          issue: 'REFRESH_ENDPOINT_FAILED',
          details: {
            meEndpointWorking: true,
            refreshFailed: true,
            refreshStatus: refreshResponse.status,
            refreshError: refreshErrorText
          },
          traces: this.traces
        };
      }

      const refreshData = await refreshResponse.json();
      this.addTrace('refresh_endpoint_data_parsed', refreshData);

      // If we get here, both endpoints work - the issue is likely in the frontend logic
      return {
        success: true,
        issue: 'FRONTEND_STATE_SYNC_ISSUE',
        details: {
          meEndpointWorking: true,
          refreshEndpointWorking: true,
          meData,
          refreshData,
          conclusion: 'Both backend endpoints work. Issue is in frontend auth state synchronization.'
        },
        traces: this.traces
      };

    } catch (error) {
      this.addTrace('diagnostic_error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return {
        success: false,
        issue: 'DIAGNOSTIC_ERROR',
        details: { error: error instanceof Error ? error.message : String(error) },
        traces: this.traces
      };
    }
  }

  async traceAuthInitialization(): Promise<{
    initializationTraces: AuthStateTrace[];
    finalState: any;
    issue?: string;
  }> {
    console.log('[Enhanced Auth Diagnostics] Tracing auth initialization...');
    this.traces = [];

    // Subscribe to auth state changes during initialization
    let stateChangeCount = 0;
    const unsubscribe = authService.subscribe((state) => {
      stateChangeCount++;
      this.addTrace(`auth_state_change_${stateChangeCount}`, {
        changeNumber: stateChangeCount,
        newState: {
          isAuthenticated: state.isAuthenticated,
          hasUser: !!state.user,
          hasTokens: !!state.tokens,
          isLoading: state.isLoading,
          userPermissions: state.user?.permissions || [],
          userRole: state.user?.role || null
        }
      });
    });

    try {
      this.addTrace('initialization_trace_start');

      // Force re-initialization
      await authService.initialize();
      
      this.addTrace('initialization_complete');

      // Wait a bit for any async state updates
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.addTrace('final_state_check');

      const finalAuthState = authService.getAuthState();
      let issue = undefined;

      // Analyze the issue
      if (!finalAuthState.isAuthenticated && this.traces.some(t => t.step.includes('me_endpoint_response') && t.additionalData?.ok)) {
        issue = 'ME_ENDPOINT_WORKS_BUT_NOT_AUTHENTICATED';
      } else if (finalAuthState.isAuthenticated && (!finalAuthState.user || finalAuthState.user.permissions.length === 0)) {
        issue = 'AUTHENTICATED_BUT_NO_USER_DATA';
      } else if (!finalAuthState.isAuthenticated && !this.traces.some(t => t.step.includes('stored_tokens_found'))) {
        issue = 'NO_STORED_TOKENS';
      }

      return {
        initializationTraces: this.traces,
        finalState: finalAuthState,
        issue
      };

    } finally {
      unsubscribe();
    }
  }

  async testAuthContextFlow(): Promise<{
    success: boolean;
    issue?: string;
    traces: AuthStateTrace[];
  }> {
    console.log('[Enhanced Auth Diagnostics] Testing AuthContext flow...');
    this.traces = [];

    this.addTrace('auth_context_test_start');

    // Test the specific AuthContext initialization logic
    try {
      // Step 1: Test authService.initialize()
      this.addTrace('before_auth_service_initialize');
      await authService.initialize();
      this.addTrace('after_auth_service_initialize');

      const stateAfterInit = authService.getAuthState();
      
      // Step 2: Test the session verification that happens in AuthContext
      if (stateAfterInit.isAuthenticated) {
        this.addTrace('testing_session_verification');
        
        try {
          const isValid = await authService.refreshSession();
          this.addTrace('session_verification_result', { isValid });
          
          if (!isValid) {
            // This mimics what AuthContext does - clears auth if verification fails
            this.addTrace('session_verification_failed_would_clear_auth');
            return {
              success: false,
              issue: 'SESSION_VERIFICATION_CLEARING_VALID_AUTH',
              traces: this.traces
            };
          }
        } catch (error) {
          this.addTrace('session_verification_error', { 
            error: error instanceof Error ? error.message : String(error) 
          });
          return {
            success: false,
            issue: 'SESSION_VERIFICATION_ERROR_CLEARING_AUTH',
            traces: this.traces
          };
        }
      }

      this.addTrace('auth_context_flow_complete');
      
      return {
        success: true,
        traces: this.traces
      };

    } catch (error) {
      this.addTrace('auth_context_flow_error', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        issue: 'AUTH_CONTEXT_FLOW_ERROR',
        traces: this.traces
      };
    }
  }
}

// Export for global usage
export const enhancedAuthDiagnostics = new EnhancedAuthDiagnostics();

// Global functions for browser console debugging
if (typeof window !== 'undefined') {
  (window as any).diagnoseMeEndpoint = () => enhancedAuthDiagnostics.diagnoseMeEndpointIssue();
  (window as any).traceAuthInit = () => enhancedAuthDiagnostics.traceAuthInitialization();
  (window as any).testAuthContextFlow = () => enhancedAuthDiagnostics.testAuthContextFlow();
}

export default EnhancedAuthDiagnostics;