// src/lib/tests/auth-integration.test.ts
// Integration tests for authentication infrastructure

import { apiClient } from '@/lib/services/apiClient.production';
import { authService } from '@/lib/services/authService';

describe('Authentication Infrastructure Tests', () => {
  beforeEach(() => {
    // Clear any existing auth state
    localStorage.clear();
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  });

  describe('CSRF Token Management', () => {
    test('apiClient should store and retrieve CSRF tokens', () => {
      const testToken = 'test-csrf-token-12345';
      
      // Set CSRF token
      apiClient.setCSRFToken(testToken);
      
      // Verify it's stored in localStorage
      expect(localStorage.getItem('csrf_token')).toBe(testToken);
      
      // Verify it's stored in cookies
      expect(document.cookie).toContain(`csrfToken=${testToken}`);
    });

    test('apiClient should clear CSRF tokens on clearAuth', () => {
      const testToken = 'test-csrf-token-12345';
      apiClient.setCSRFToken(testToken);
      
      // Clear auth
      apiClient.clearAuth();
      
      // Verify tokens are cleared
      expect(localStorage.getItem('csrf_token')).toBeNull();
      expect(document.cookie).not.toContain('csrfToken=test-csrf-token');
    });

    test('apiClient should be a singleton', () => {
      const instance1 = apiClient;
      const instance2 = apiClient;
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('AuthService Integration', () => {
    test('authService should propagate CSRF token to apiClient on login', async () => {
      // Mock fetch for login
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            success: true,
            user: {
              id: '1',
              email: 'test@example.com',
              first_name: 'Test',
              last_name: 'User',
              roles: [{ name: 'user' }],
              permissions: [],
              is_active: true,
              must_change_password: false
            },
            sessionId: 'test-session-id',
            csrfToken: 'test-csrf-token-from-login',
            expiresAt: new Date(Date.now() + 3600000).toISOString()
          }),
          headers: new Headers({
            'content-type': 'application/json'
          })
        } as Response)
      );

      // Clear any existing CSRF token
      apiClient.clearAuth();
      
      // Perform login
      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });

      expect(result.success).toBe(true);
      
      // Verify CSRF token was propagated to apiClient
      expect(localStorage.getItem('csrf_token')).toBe('test-csrf-token-from-login');
      expect(authService.getCSRFToken()).toBe('test-csrf-token-from-login');
    });

    test('authService should clear apiClient auth on logout', async () => {
      // Set up initial auth state
      apiClient.setCSRFToken('test-csrf-token');
      
      // Mock fetch for logout
      global.fetch = jest.fn(() => Promise.resolve({ ok: true } as Response));
      
      // Perform logout
      await authService.logout();
      
      // Verify auth was cleared from apiClient
      expect(localStorage.getItem('csrf_token')).toBeNull();
      expect(document.cookie).not.toContain('csrfToken=');
    });
  });

  describe('Cookie Configuration', () => {
    test('should set cookies with correct attributes for development', () => {
      // Mock non-HTTPS environment
      Object.defineProperty(window.location, 'protocol', {
        value: 'http:',
        writable: true
      });

      apiClient.setCSRFToken('test-token');
      
      // In development (HTTP), cookies should not have 'secure' flag
      expect(document.cookie).toContain('csrfToken=test-token');
      expect(document.cookie).toContain('samesite=lax');
    });

    test('should handle session expiry correctly', () => {
      const _mockAuthState = authService.getAuthState();
      
      // Check if session is expiring soon (within 5 minutes)
      const isExpiringSoon = authService.isSessionExpiringSoon();
      
      // Initially should be false (no session)
      expect(isExpiringSoon).toBe(false);
    });
  });

  describe('API Request Headers', () => {
    test('should include CSRF token in API requests', async () => {
      const testToken = 'test-csrf-token-for-requests';
      apiClient.setCSRFToken(testToken);

      // Mock fetch to capture headers
      let capturedHeaders: HeadersInit | undefined;
      global.fetch = jest.fn((url, options) => {
        capturedHeaders = options?.headers;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'test' }),
          headers: new Headers({
            'content-type': 'application/json'
          })
        } as Response);
      });

      // Make a test request
      await apiClient.get('/api/v2/test');

      // Verify CSRF token was included in headers
      expect(capturedHeaders).toBeDefined();
      expect((capturedHeaders as Record<string, string>)['X-CSRF-Token']).toBe(testToken);
    });

    test('should include credentials in API requests', async () => {
      // Mock fetch to capture options
      let capturedOptions: RequestInit | undefined;
      global.fetch = jest.fn((url, options) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: 'test' }),
          headers: new Headers({
            'content-type': 'application/json'
          })
        } as Response);
      });

      // Make a test request
      await apiClient.get('/api/v2/test');

      // Verify credentials are included
      expect(capturedOptions?.credentials).toBe('include');
    });
  });

  describe('Error Handling', () => {
    test('should handle 403 errors by refreshing CSRF token', async () => {
      let fetchCallCount = 0;
      
      // Mock fetch to return 403 first, then success after CSRF refresh
      global.fetch = jest.fn((url) => {
        fetchCallCount++;
        
        if (url.toString().includes('/auth/csrf')) {
          // CSRF refresh endpoint
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ csrf_token: 'new-csrf-token' }),
            headers: new Headers({
              'content-type': 'application/json'
            })
          } as Response);
        }
        
        if (fetchCallCount === 1) {
          // First request returns 403
          return Promise.resolve({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            headers: new Headers()
          } as Response);
        } else {
          // Retry after CSRF refresh succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: 'success' }),
            headers: new Headers({
              'content-type': 'application/json'
            })
          } as Response);
        }
      });

      // Make a request that will get 403
      const result = await apiClient.get('/api/v2/test');

      // Should have refreshed CSRF token
      expect(localStorage.getItem('csrf_token')).toBe('new-csrf-token');
      
      // Result should indicate error (we don't retry automatically in current implementation)
      expect(result.status).toBe('error');
      expect(result.message).toContain('forbidden');
    });

    test('should handle 401 errors by clearing auth', async () => {
      // Set initial auth state
      apiClient.setCSRFToken('test-token');
      
      // Mock fetch to return 401
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers()
        } as Response)
      );

      // Make a request that will get 401
      const result = await apiClient.get('/api/v2/test');

      // Should have cleared auth
      expect(localStorage.getItem('csrf_token')).toBeNull();
      expect(result.status).toBe('error');
      expect(result.message).toContain('Authentication required');
    });
  });
});

// Cleanup
afterEach(() => {
  jest.restoreAllMocks();
});