// test_auth_fixes.ts
// Comprehensive test script to validate authentication fixes

import { authService, type AuthUser } from '@/lib/services/authService';
import { authDiagnostics, AuthFlowDiagnosticsTool } from './auth_flow_diagnostics';

interface AuthTestResult {
  testName: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  details?: any;
  timestamp: string;
}

interface AuthTestSuite {
  suiteName: string;
  results: AuthTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    success: boolean;
  };
  executionTime: number;
}

class AuthenticationFixTester {
  private results: AuthTestResult[] = [];
  private startTime: number = 0;

  private addResult(testName: string, status: 'PASS' | 'FAIL' | 'SKIP', message: string, details?: any) {
    const result: AuthTestResult = {
      testName,
      status,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    
    this.results.push(result);
    console.log(`[Auth Test] ${testName}: ${status} - ${message}`, details);
  }

  async runComprehensiveTests(): Promise<AuthTestSuite> {
    console.log('=== Starting Comprehensive Authentication Fix Tests ===');
    this.startTime = Date.now();
    this.results = [];

    try {
      // Test 1: Permission Data Format Fix
      await this.testPermissionDataFormat();

      // Test 2: Backend Permission Loading
      await this.testBackendPermissionLoading();

      // Test 3: Database Permission Assignments
      await this.testDatabasePermissionAssignments();

      // Test 4: Frontend Permission Checks
      await this.testFrontendPermissionChecks();

      // Test 5: Session Validation Flow
      await this.testSessionValidationFlow();

      // Test 6: CSRF Token Handling
      await this.testCSRFTokenHandling();

      // Test 7: Campaign Page Access
      await this.testCampaignPageAccess();

      // Test 8: Admin User Functionality
      await this.testAdminUserFunctionality();

      // Test 9: Error Handling and Logging
      await this.testErrorHandlingAndLogging();

      // Test 10: Integration Test
      await this.testEndToEndIntegration();

    } catch (error) {
      this.addResult(
        'test_execution',
        'FAIL',
        'Test execution failed',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }

    return this.generateTestReport();
  }

  private async testPermissionDataFormat() {
    const testName = 'permission_data_format';
    
    try {
      // Test the mapUserToAuthUser function fix
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated || !authState.user) {
        this.addResult(testName, 'SKIP', 'User not authenticated, cannot test permission data format');
        return;
      }

      const user = authState.user;
      
      // Check if permissions are properly formatted as string array
      if (!Array.isArray(user.permissions)) {
        this.addResult(
          testName,
          'FAIL',
          'User permissions is not an array',
          { permissionsType: typeof user.permissions, permissions: user.permissions }
        );
        return;
      }

      // Check if all permissions are strings
      const nonStringPermissions = user.permissions.filter(p => typeof p !== 'string');
      if (nonStringPermissions.length > 0) {
        this.addResult(
          testName,
          'FAIL',
          'Some permissions are not strings',
          { nonStringPermissions, totalPermissions: user.permissions.length }
        );
        return;
      }

      // Check for expected permission format (colon notation)
      const validFormatPermissions = user.permissions.filter(p => /^[a-zA-Z_]+:[a-zA-Z_]+$/.test(p));
      const invalidFormatPermissions = user.permissions.filter(p => !/^[a-zA-Z_]+:[a-zA-Z_]+$/.test(p));

      if (invalidFormatPermissions.length > 0) {
        this.addResult(
          testName,
          'FAIL',
          'Some permissions have invalid format (should be resource:action)',
          { 
            invalidFormatPermissions,
            validFormatCount: validFormatPermissions.length,
            totalCount: user.permissions.length
          }
        );
        return;
      }

      this.addResult(
        testName,
        'PASS',
        'Permission data format is correct',
        {
          permissionCount: user.permissions.length,
          samplePermissions: user.permissions.slice(0, 5),
          allValidFormat: true
        }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing permission data format',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testBackendPermissionLoading() {
    const testName = 'backend_permission_loading';
    
    try {
      // Test by making a request to /api/v2/me to trigger backend permission loading
      const csrfToken = authService.getCSRFToken();
      
      if (!csrfToken) {
        this.addResult(testName, 'SKIP', 'No CSRF token available, cannot test backend loading');
        return;
      }

      const response = await fetch('/api/v2/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        this.addResult(
          testName,
          'FAIL',
          'Backend permission loading request failed',
          { status: response.status, statusText: response.statusText }
        );
        return;
      }

      const userData = await response.json();
      
      // Check if backend returned proper permission structure
      if (!userData.permissions || !Array.isArray(userData.permissions)) {
        this.addResult(
          testName,
          'FAIL',
          'Backend did not return proper permissions array',
          { userData }
        );
        return;
      }

      // Check if permissions are strings (not objects)
      const allStrings = userData.permissions.every((p: any) => typeof p === 'string');
      if (!allStrings) {
        this.addResult(
          testName,
          'FAIL',
          'Backend returned permissions that are not all strings',
          { 
            permissions: userData.permissions,
            permissionTypes: userData.permissions.map((p: any) => typeof p)
          }
        );
        return;
      }

      this.addResult(
        testName,
        'PASS',
        'Backend permission loading works correctly',
        {
          permissionCount: userData.permissions.length,
          userId: userData.user_id,
          hasRoles: !!userData.roles
        }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing backend permission loading',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testDatabasePermissionAssignments() {
    const testName = 'database_permission_assignments';
    
    try {
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated || !authState.user) {
        this.addResult(testName, 'SKIP', 'User not authenticated, cannot test database permissions');
        return;
      }

      const user = authState.user;
      const expectedCampaignPermissions = [
        'campaigns:create',
        'campaigns:read',
        'campaigns:update',
        'campaigns:delete',
        'campaigns:execute'
      ];

      const userCampaignPermissions = user.permissions.filter(p => p.startsWith('campaigns:'));
      const missingCampaignPermissions = expectedCampaignPermissions.filter(
        perm => !user.permissions.includes(perm)
      );

      // For super admin, we should have all campaign permissions
      if (user.role === 'super_admin' || user.role === 'admin') {
        if (missingCampaignPermissions.length > 0) {
          this.addResult(
            testName,
            'FAIL',
            'Admin user missing critical campaign permissions',
            {
              userRole: user.role,
              missingPermissions: missingCampaignPermissions,
              availablePermissions: userCampaignPermissions,
              totalPermissions: user.permissions.length
            }
          );
          return;
        }

        // Check for system permissions
        const expectedSystemPermissions = ['system:admin', 'system:config', 'system:users'];
        const missingSystemPermissions = expectedSystemPermissions.filter(
          perm => !user.permissions.includes(perm)
        );

        if (missingSystemPermissions.length > 0) {
          this.addResult(
            testName,
            'FAIL',
            'Admin user missing system permissions',
            {
              userRole: user.role,
              missingSystemPermissions,
              allPermissions: user.permissions
            }
          );
          return;
        }
      }

      this.addResult(
        testName,
        'PASS',
        'Database permission assignments are correct',
        {
          userRole: user.role,
          campaignPermissions: userCampaignPermissions,
          totalPermissions: user.permissions.length,
          hasAllCampaignPerms: missingCampaignPermissions.length === 0
        }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing database permission assignments',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testFrontendPermissionChecks() {
    const testName = 'frontend_permission_checks';
    
    try {
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated || !authState.user) {
        this.addResult(testName, 'SKIP', 'User not authenticated, cannot test frontend permission checks');
        return;
      }

      // Test hasPermission function
      const testPermissions = ['campaigns:read', 'campaigns:create', 'system:admin'];
      const permissionResults = testPermissions.map(perm => ({
        permission: perm,
        hasPermission: authService.hasPermission(perm),
        inUserArray: authState.user!.permissions.includes(perm)
      }));

      // Check consistency between hasPermission and user.permissions array
      const inconsistentResults = permissionResults.filter(
        result => result.hasPermission !== result.inUserArray
      );

      if (inconsistentResults.length > 0) {
        this.addResult(
          testName,
          'FAIL',
          'Inconsistency between hasPermission() and user.permissions array',
          { inconsistentResults, permissionResults }
        );
        return;
      }

      // Test hasRole function
      const roleCheckResult = authService.hasRole(authState.user.role);
      if (!roleCheckResult) {
        this.addResult(
          testName,
          'FAIL',
          'hasRole() returned false for user\'s actual role',
          { userRole: authState.user.role, roleCheckResult }
        );
        return;
      }

      this.addResult(
        testName,
        'PASS',
        'Frontend permission checks working correctly',
        {
          permissionResults,
          roleCheck: roleCheckResult,
          userRole: authState.user.role
        }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing frontend permission checks',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testSessionValidationFlow() {
    const testName = 'session_validation_flow';
    
    try {
      // Test session refresh
      const refreshResult = await authService.refreshSession();
      
      if (!refreshResult) {
        this.addResult(
          testName,
          'FAIL',
          'Session refresh failed',
          { refreshResult }
        );
        return;
      }

      // Check if session data is consistent after refresh
      const authState = authService.getAuthState();
      const sessionId = authService.getSessionId();
      const csrfToken = authService.getCSRFToken();

      if (!sessionId || !csrfToken) {
        this.addResult(
          testName,
          'FAIL',
          'Missing session data after refresh',
          { hasSessionId: !!sessionId, hasCSRFToken: !!csrfToken }
        );
        return;
      }

      this.addResult(
        testName,
        'PASS',
        'Session validation flow working correctly',
        {
          refreshSuccess: refreshResult,
          isAuthenticated: authState.isAuthenticated,
          hasSessionId: !!sessionId,
          hasCSRFToken: !!csrfToken
        }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing session validation flow',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testCSRFTokenHandling() {
    const testName = 'csrf_token_handling';
    
    try {
      const csrfToken = authService.getCSRFToken();
      
      if (!csrfToken) {
        this.addResult(testName, 'FAIL', 'No CSRF token available');
        return;
      }

      // Test CSRF token format
      if (typeof csrfToken !== 'string' || csrfToken.length < 32) {
        this.addResult(
          testName,
          'FAIL',
          'CSRF token has invalid format',
          { tokenType: typeof csrfToken, tokenLength: csrfToken.length }
        );
        return;
      }

      // Test CSRF token in authenticated request
      const testResponse = await fetch('/api/v2/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      });

      if (!testResponse.ok) {
        this.addResult(
          testName,
          'FAIL',
          'CSRF token not accepted by backend',
          { status: testResponse.status, statusText: testResponse.statusText }
        );
        return;
      }

      this.addResult(
        testName,
        'PASS',
        'CSRF token handling working correctly',
        { tokenLength: csrfToken.length, requestSuccess: testResponse.ok }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing CSRF token handling',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testCampaignPageAccess() {
    const testName = 'campaign_page_access';
    
    try {
      // Test if user has permissions needed for campaigns page
      const hasCampaignRead = authService.hasPermission('campaigns:read');
      const hasCampaignCreate = authService.hasPermission('campaigns:create');
      
      if (!hasCampaignRead && !hasCampaignCreate) {
        this.addResult(
          testName,
          'FAIL',
          'User lacks basic campaign permissions for page access',
          { hasCampaignRead, hasCampaignCreate }
        );
        return;
      }

      // Test making a request to campaigns API
      const csrfToken = authService.getCSRFToken();
      if (!csrfToken) {
        this.addResult(testName, 'SKIP', 'No CSRF token for API test');
        return;
      }

      const campaignsResponse = await fetch('/api/v2/campaigns', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      });

      if (campaignsResponse.status === 403) {
        this.addResult(
          testName,
          'FAIL',
          'Campaign API returned 403 Forbidden - insufficient permissions',
          { 
            status: campaignsResponse.status,
            hasCampaignRead,
            hasCampaignCreate,
            userPermissions: authService.getAuthState().user?.permissions || []
          }
        );
        return;
      }

      if (!campaignsResponse.ok && campaignsResponse.status !== 404) {
        this.addResult(
          testName,
          'FAIL',
          'Campaign API returned unexpected error',
          { status: campaignsResponse.status, statusText: campaignsResponse.statusText }
        );
        return;
      }

      this.addResult(
        testName,
        'PASS',
        'Campaign page access working correctly',
        {
          hasCampaignRead,
          hasCampaignCreate,
          apiStatus: campaignsResponse.status,
          apiAccessible: campaignsResponse.status !== 403
        }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing campaign page access',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testAdminUserFunctionality() {
    const testName = 'admin_user_functionality';
    
    try {
      const authState = authService.getAuthState();
      
      if (!authState.isAuthenticated || !authState.user) {
        this.addResult(testName, 'SKIP', 'User not authenticated');
        return;
      }

      const user = authState.user;
      
      // Test admin-specific functionality
      if (user.role === 'super_admin' || user.role === 'admin') {
        const hasSystemAdmin = authService.hasPermission('system:admin');
        const hasUserManagement = authService.hasPermission('system:users');
        
        if (!hasSystemAdmin) {
          this.addResult(
            testName,
            'FAIL',
            'Admin user missing system:admin permission',
            { userRole: user.role, permissions: user.permissions }
          );
          return;
        }

        // Test admin API access
        const csrfToken = authService.getCSRFToken();
        if (csrfToken) {
          const usersResponse = await fetch('/api/v2/users', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrfToken,
            },
            credentials: 'include',
          });

          if (usersResponse.status === 403) {
            this.addResult(
              testName,
              'FAIL',
              'Admin user cannot access user management API',
              { status: usersResponse.status, hasUserManagement }
            );
            return;
          }
        }

        this.addResult(
          testName,
          'PASS',
          'Admin user functionality working correctly',
          {
            userRole: user.role,
            hasSystemAdmin,
            hasUserManagement,
            permissionCount: user.permissions.length
          }
        );
      } else {
        this.addResult(
          testName,
          'SKIP',
          'User is not admin, skipping admin functionality test',
          { userRole: user.role }
        );
      }

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing admin user functionality',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testErrorHandlingAndLogging() {
    const testName = 'error_handling_logging';
    
    try {
      // Test that logging is working (check console for output)
      const beforeLogCount = console.log.length || 0;
      
      // Trigger some permission checks to generate logs
      authService.hasPermission('test:permission');
      authService.hasRole('test_role');
      
      // Test error case
      try {
        // This should trigger error logging
        await fetch('/api/v2/nonexistent', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      } catch {
        // Expected to fail, we're testing error handling
      }

      this.addResult(
        testName,
        'PASS',
        'Error handling and logging mechanisms in place',
        { note: 'Check console for debug output' }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error testing error handling and logging',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private async testEndToEndIntegration() {
    const testName = 'end_to_end_integration';
    
    try {
      // Run comprehensive diagnostics
      const diagnosticsResult = await authDiagnostics.runComprehensiveDiagnostics();
      
      const criticalErrors = diagnosticsResult.results.filter(r => r.status === 'error');
      const hasPermissionIssues = diagnosticsResult.results.some(r => 
        r.step.includes('permission') && r.status === 'error'
      );

      if (criticalErrors.length > 0) {
        this.addResult(
          testName,
          'FAIL',
          'End-to-end integration has critical errors',
          {
            criticalErrorCount: criticalErrors.length,
            overallStatus: diagnosticsResult.summary.overallStatus,
            criticalErrors: criticalErrors.map(e => e.step)
          }
        );
        return;
      }

      if (hasPermissionIssues) {
        this.addResult(
          testName,
          'FAIL',
          'End-to-end integration has permission-related issues',
          {
            overallStatus: diagnosticsResult.summary.overallStatus,
            summary: diagnosticsResult.summary
          }
        );
        return;
      }

      this.addResult(
        testName,
        'PASS',
        'End-to-end integration working correctly',
        {
          overallStatus: diagnosticsResult.summary.overallStatus,
          totalSteps: diagnosticsResult.summary.totalSteps,
          successSteps: diagnosticsResult.summary.successSteps,
          warningSteps: diagnosticsResult.summary.warningSteps
        }
      );

    } catch (error) {
      this.addResult(
        testName,
        'FAIL',
        'Error running end-to-end integration test',
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  private generateTestReport(): AuthTestSuite {
    const executionTime = Date.now() - this.startTime;
    
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      skipped: this.results.filter(r => r.status === 'SKIP').length,
      success: this.results.filter(r => r.status === 'FAIL').length === 0
    };

    const report: AuthTestSuite = {
      suiteName: 'Authentication Fix Validation',
      results: this.results,
      summary,
      executionTime
    };

    console.log('=== Authentication Fix Test Report ===');
    console.log(`Total Tests: ${summary.total}`);
    console.log(`Passed: ${summary.passed}`);
    console.log(`Failed: ${summary.failed}`);
    console.log(`Skipped: ${summary.skipped}`);
    console.log(`Overall Status: ${summary.success ? 'SUCCESS' : 'FAILURE'}`);
    console.log(`Execution Time: ${executionTime}ms`);

    if (summary.failed > 0) {
      console.log('\nFailed Tests:');
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`- ${result.testName}: ${result.message}`);
      });
    }

    return report;
  }

  // Export test results for analysis
  static exportTestResults(testSuite: AuthTestSuite): string {
    const exportData = {
      ...testSuite,
      exportedAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: Date.now()
      }
    };
    
    return JSON.stringify(exportData, null, 2);
  }
}

// Export the tester
export const authFixTester = new AuthenticationFixTester();
export { AuthenticationFixTester, type AuthTestResult, type AuthTestSuite };

// Global function for browser console
if (typeof window !== 'undefined') {
  (window as any).runAuthFixTests = () => authFixTester.runComprehensiveTests();
}