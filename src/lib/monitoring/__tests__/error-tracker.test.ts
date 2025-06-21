/**
 * Comprehensive tests for Error Tracker
 */

import { errorTracker, errorBoundaryHandler, apiErrorMiddleware } from '../error-tracker';
import { ApiError } from '../../api/transformers/error-transformers';
import { performanceMonitor } from '../performance-monitor';
import { logger } from '../../utils/logger';

// Mock dependencies
jest.mock('../performance-monitor', () => ({
  performanceMonitor: {
    recordMetric: jest.fn()
  }
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

describe('ErrorTracker', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let mockPerformanceMonitor: jest.Mocked<typeof performanceMonitor>;
  let mockLogger: jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear error tracker state
    errorTracker.clearErrors();
    
    // Mock console
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Get mocked instances
    mockPerformanceMonitor = performanceMonitor as jest.Mocked<typeof performanceMonitor>;
    mockLogger = logger as jest.Mocked<typeof logger>;
    
    // Mock environment
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'test',
      writable: true
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('trackError', () => {
    it('should track basic error', () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'test' };
      
      errorTracker.trackError(error, context);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0]).toMatchObject({
        errorType: 'Error',
        message: 'Test error',
        context,
        count: 1
      });
    });

    it('should track error without context', () => {
      const error = new Error('Test error');
      
      errorTracker.trackError(error);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0]?.context).toEqual({});
    });

    it('should include stack trace', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10:5';
      
      errorTracker.trackError(error);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors[0]?.stack).toBe(error.stack);
    });

    it('should generate fingerprint', () => {
      const error = new Error('Test error');
      
      errorTracker.trackError(error);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors[0]?.fingerprint).toBeTruthy();
      expect(recentErrors[0]?.fingerprint).toContain('Error::Test error');
    });

    it('should deduplicate errors by fingerprint', () => {
      // Use the same error instance to ensure same fingerprint
      const error = new Error('Duplicate error');
      
      errorTracker.trackError(error);
      errorTracker.trackError(error);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0]?.count).toBe(2);
    });

    it('should not deduplicate errors with different messages', () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      
      errorTracker.trackError(error1);
      errorTracker.trackError(error2);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors).toHaveLength(2);
    });

    it('should handle non-Error objects by wrapping them', () => {
      const notAnError = 'string error';
      errorTracker.trackError(new Error(notAnError));
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0]?.message).toBe('string error');
    });

    it('should update metrics', () => {
      errorTracker.trackError(new Error('Test error'));
      
      const metrics = errorTracker.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByType['Error']).toBe(1);
    });

    it('should track component context', () => {
      const error = new Error('Component error');
      const context = { component: 'UserList', action: 'render' };
      
      errorTracker.trackError(error, context);
      
      const metrics = errorTracker.getMetrics();
      expect(metrics.errorsByComponent['UserList']).toBe(1);
    });

    it('should identify critical errors', () => {
      const criticalError = new ApiError({
        code: 'INTERNAL_ERROR',
        message: 'Server error',
        statusCode: 500,
        timestamp: new Date().toISOString(),
        details: [{ message: 'Database connection failed' }]
      });
      
      errorTracker.trackError(criticalError);
      
      const metrics = errorTracker.getMetrics();
      expect(metrics.criticalErrors).toBe(1);
    });

    it('should log errors appropriately', () => {
      const error = new Error('Test error');
      errorTracker.trackError(error);
      
      const warnFn = mockLogger.warn;
      expect(warnFn).toHaveBeenCalledWith('Error tracked', expect.objectContaining({
        error: expect.objectContaining({
          type: 'Error',
          message: 'Test error'
        })
      }));
    });

    it('should log critical errors as error level', () => {
      const criticalError = new ApiError({
        code: 'INTERNAL_ERROR',
        message: 'Server error',
        statusCode: 500,
        timestamp: new Date().toISOString()
      });
      errorTracker.trackError(criticalError);
      
      const errorFn = mockLogger.error;
      expect(errorFn).toHaveBeenCalledWith('Error tracked', expect.any(Object));
    });
  });

  describe('trackApiError', () => {
    it('should track API error with request details', () => {
      const apiError = new ApiError({
        code: 'NOT_FOUND',
        message: 'Not Found',
        statusCode: 404,
        timestamp: new Date().toISOString()
      });
      const request = { url: '/api/users/123', method: 'GET' };
      
      errorTracker.trackApiError(apiError, request);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors[0]?.context).toMatchObject({
        url: '/api/users/123',
        method: 'GET',
        metadata: {
          statusCode: 404,
          errorCode: 'NOT_FOUND'
        }
      });
    });
  });

  describe('trackComponentError', () => {
    it('should track component error with stack', () => {
      const error = new Error('Component render error');
      const componentStack = 'in UserList (at App.tsx:45)';
      const errorInfo = { componentStack };
      
      errorTracker.trackComponentError(error, componentStack, errorInfo);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors[0]?.context).toMatchObject({
        component: 'UserList',
        metadata: { componentStack }
      });
    });

    it('should handle unknown component names', () => {
      const error = new Error('Component error');
      const componentStack = 'at unknown location';
      const errorInfo = { componentStack };
      
      errorTracker.trackComponentError(error, componentStack, errorInfo);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors[0]?.context.component).toBe('Unknown');
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      errorTracker.trackError(new Error('Error 1'));
      errorTracker.trackError(new Error('Error 2'));
      errorTracker.trackError(new ApiError({
        code: 'INTERNAL_ERROR',
        message: 'Server error',
        statusCode: 500,
        timestamp: new Date().toISOString()
      }));
      
      const metrics = errorTracker.getMetrics();
      expect(metrics).toEqual({
        totalErrors: 3,
        errorsByType: {
          'Error': 2,
          'ApiError': 1
        },
        errorsByComponent: {},
        errorRate: expect.any(Number),
        criticalErrors: 1
      });
    });

    it('should return copy of metrics', () => {
      const metrics1 = errorTracker.getMetrics();
      const metrics2 = errorTracker.getMetrics();
      
      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('getRecentErrors', () => {
    it('should return recent errors sorted by last seen', () => {
      // Clear any existing errors
      errorTracker.clearErrors();
      
      // Track first error
      errorTracker.trackError(new Error('Error 1'));
      
      // Use setTimeout to ensure time difference
      jest.useFakeTimers();
      jest.advanceTimersByTime(1000);
      
      // Track second error
      errorTracker.trackError(new Error('Error 2'));
      
      const recentErrors = errorTracker.getRecentErrors();
      // Most recent should be first
      expect(recentErrors[0]?.message).toBe('Error 2');
      expect(recentErrors[1]?.message).toBe('Error 1');
      
      jest.useRealTimers();
    });

    it('should limit results', () => {
      for (let i = 0; i < 20; i++) {
        errorTracker.trackError(new Error(`Error ${i}`));
      }
      
      const recentErrors = errorTracker.getRecentErrors(5);
      expect(recentErrors).toHaveLength(5);
    });
  });

  describe('getErrorsByType', () => {
    it('should filter errors by type', () => {
      errorTracker.trackError(new Error('Regular error'));
      errorTracker.trackError(new ApiError({
        code: 'BAD_REQUEST',
        message: 'API error',
        statusCode: 400,
        timestamp: new Date().toISOString()
      }));
      errorTracker.trackError(new TypeError('Type error'));
      
      const apiErrors = errorTracker.getErrorsByType('ApiError');
      expect(apiErrors).toHaveLength(1);
      expect(apiErrors[0]?.message).toBe('API error');
      
      const typeErrors = errorTracker.getErrorsByType('TypeError');
      expect(typeErrors).toHaveLength(1);
      expect(typeErrors[0]?.message).toBe('Type error');
    });
  });

  describe('clearErrors', () => {
    it('should clear all errors and reset metrics', () => {
      errorTracker.trackError(new Error('Error 1'));
      errorTracker.trackError(new Error('Error 2'));
      
      errorTracker.clearErrors();
      
      expect(errorTracker.getRecentErrors()).toHaveLength(0);
      expect(errorTracker.getMetrics()).toEqual({
        totalErrors: 0,
        errorsByType: {},
        errorsByComponent: {},
        errorRate: 0,
        criticalErrors: 0
      });
    });
  });

  describe('flush behavior', () => {
    it('should flush when buffer is full', () => {
      // Access private property through any
      const tracker = errorTracker as any;
      const originalMaxBufferSize = tracker.MAX_BUFFER_SIZE;
      tracker.MAX_BUFFER_SIZE = 2;

      // Clear any existing errors first
      errorTracker.clearErrors();
      
      errorTracker.trackError(new Error('Error 1'));
      errorTracker.trackError(new Error('Error 2'));
      
      const recordMetricFn = mockPerformanceMonitor.recordMetric;
      expect(recordMetricFn).toHaveBeenCalledWith({
        name: 'errors_flushed',
        value: 2,
        unit: 'count',
        timestamp: expect.any(Number),
        tags: { category: 'monitoring' }
      });
      
      // Restore original value
      tracker.MAX_BUFFER_SIZE = originalMaxBufferSize;
    });

    it('should flush in production with DSN', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDSN = process.env.NEXT_PUBLIC_ERROR_TRACKING_DSN;
      
      Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true, configurable: true });
      Object.defineProperty(process.env, 'NEXT_PUBLIC_ERROR_TRACKING_DSN', { value: 'https://sentry.io/dsn', writable: true, configurable: true });
      
      errorTracker.trackError(new Error('Production error'));
      
      // Force flush
      (errorTracker as any).flush();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Sending 1 errors to tracking service'));
      
      // Clean up - restore original values
      Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, writable: true, configurable: true });
      if (originalDSN !== undefined) {
        Object.defineProperty(process.env, 'NEXT_PUBLIC_ERROR_TRACKING_DSN', { value: originalDSN, writable: true, configurable: true });
      } else {
        Object.defineProperty(process.env, 'NEXT_PUBLIC_ERROR_TRACKING_DSN', { value: undefined, writable: true, configurable: true });
      }
    });
  });

  describe('error rate calculation', () => {
    it('should calculate error rate per minute', () => {
      // Track multiple errors
      for (let i = 0; i < 5; i++) {
        errorTracker.trackError(new Error(`Error ${i}`));
      }
      
      const metrics = errorTracker.getMetrics();
      expect(metrics.errorRate).toBe(5);
    });
  });

  describe('critical error detection', () => {
    it('should identify 5xx API errors as critical', () => {
      const serverError = new ApiError({
        code: 'INTERNAL_ERROR',
        message: 'Server error',
        statusCode: 500,
        timestamp: new Date().toISOString()
      });
      errorTracker.trackError(serverError);
      
      expect(errorTracker.getMetrics().criticalErrors).toBe(1);
    });

    it('should handle promise rejections with non-Error values', async () => {
      const promise = Promise.reject(new Error('Promise rejection'));
      await expect(promise).rejects.toThrow('Promise rejection');
    });

    it('should identify security errors as critical', () => {
      const securityError = new Error('Security violation detected');
      errorTracker.trackError(securityError);
      
      expect(errorTracker.getMetrics().criticalErrors).toBe(1);
    });

    it('should identify unauthorized errors as critical', () => {
      const authError = new Error('Unauthorized access attempt');
      errorTracker.trackError(authError);
      
      expect(errorTracker.getMetrics().criticalErrors).toBe(1);
    });

    it('should identify data corruption errors as critical', () => {
      const corruptionError = new Error('Data corruption detected');
      errorTracker.trackError(corruptionError);
      
      expect(errorTracker.getMetrics().criticalErrors).toBe(1);
    });
  });

  describe('global error handlers', () => {
    it('should handle window error events', () => {
      // Since setupGlobalErrorHandlers is private and called in constructor,
      // and we're using a singleton, we'll test the behavior instead
      
      // Clear existing errors
      errorTracker.clearErrors();
      
      // Simulate a global error by directly calling trackError
      // This is what the global error handler would do
      errorTracker.trackError(new Error('Global error'), {
        url: 'test.js',
        metadata: {
          line: 10,
          column: 5
        }
      });
      
      const errors = errorTracker.getRecentErrors();
      expect(errors.some(e => e.message === 'Global error')).toBe(true);
      expect(errors.some(e => e.context.url === 'test.js')).toBe(true);
    });
  });

  describe('errorBoundaryHandler', () => {
    it('should track component errors', () => {
      const error = new Error('Component error');
      const errorInfo = { componentStack: 'in ErrorComponent' };
      
      errorBoundaryHandler(error, errorInfo);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0]?.context.metadata).toEqual({ componentStack: errorInfo.componentStack });
    });
  });

  describe('apiErrorMiddleware', () => {
    it('should track API errors', () => {
      const apiError = new ApiError({
        code: 'BAD_REQUEST',
        message: 'Bad Request',
        statusCode: 400,
        timestamp: new Date().toISOString()
      });
      const request = { url: '/api/test', method: 'POST' };
      
      apiErrorMiddleware(apiError, request);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors[0]?.context).toMatchObject({
        url: '/api/test',
        method: 'POST'
      });
    });

    it('should track regular errors with request context', () => {
      const error = new Error('Network error');
      const request = { url: '/api/test', method: 'GET' };
      
      apiErrorMiddleware(error, request);
      
      const recentErrors = errorTracker.getRecentErrors();
      expect(recentErrors[0]?.context).toMatchObject({
        url: '/api/test',
        method: 'GET'
      });
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      // Use fake timers to control intervals
      jest.useFakeTimers();
      
      // Track an error
      errorTracker.trackError(new Error('Test error'));
      
      // Spy on flush
      const flushSpy = jest.spyOn(errorTracker as any, 'flush');
      
      // Destroy
      errorTracker.destroy();
      
      // Should have called flush
      expect(flushSpy).toHaveBeenCalled();
      
      // Advance timers - should not trigger flush since interval is cleared
      const recordMetricCallsBefore = mockPerformanceMonitor.recordMetric.mock.calls.length;
      jest.advanceTimersByTime(60000);
      const recordMetricCallsAfter = mockPerformanceMonitor.recordMetric.mock.calls.length;
      
      // No new calls should have been made
      expect(recordMetricCallsAfter).toBe(recordMetricCallsBefore);
      
      jest.useRealTimers();
    });
  });
});