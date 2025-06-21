/**
 * Error Tracking and Monitoring Service
 * Provides comprehensive error tracking with context and performance metrics
 */

import { ApiError } from '../api/transformers/error-transformers';
import { performanceMonitor } from './performance-monitor';
import { logger } from '../utils/logger';

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  url?: string;
  method?: string;
  component?: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorReport {
  timestamp: Date;
  errorType: string;
  message: string;
  stack?: string;
  context: ErrorContext;
  fingerprint: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByComponent: Record<string, number>;
  errorRate: number;
  criticalErrors: number;
}

class ErrorTracker {
  private errors: Map<string, ErrorReport> = new Map();
  private errorBuffer: ErrorReport[] = [];
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByType: {},
    errorsByComponent: {},
    errorRate: 0,
    criticalErrors: 0
  };
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly MAX_BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 30000; // 30 seconds

  constructor() {
    this.startFlushInterval();
    this.setupGlobalErrorHandlers();
  }

  /**
   * Track an error with context
   */
  trackError(error: Error | ApiError, context: ErrorContext = {}): void {
    const fingerprint = this.generateFingerprint(error, context);
    const existingReport = this.errors.get(fingerprint);

    if (existingReport) {
      existingReport.count++;
      existingReport.lastSeen = new Date();
    } else {
      const report: ErrorReport = {
        timestamp: new Date(),
        errorType: error.constructor.name,
        message: error.message,
        stack: error.stack,
        context,
        fingerprint,
        count: 1,
        firstSeen: new Date(),
        lastSeen: new Date()
      };

      this.errors.set(fingerprint, report);
      this.errorBuffer.push(report);
    }

    this.updateMetrics(error, context);
    this.logError(error, context);

    // Flush if buffer is full
    if (this.errorBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  /**
   * Track API errors specifically
   */
  trackApiError(error: ApiError, request?: { url: string; method: string }): void {
    this.trackError(error, {
      url: request?.url,
      method: request?.method,
      metadata: {
        statusCode: error.statusCode,
        errorCode: error.code
      }
    });
  }

  /**
   * Track React component errors
   */
  trackComponentError(
    error: Error,
    componentStack: string,
    errorInfo: { componentStack: string }
  ): void {
    this.trackError(error, {
      component: this.extractComponentName(componentStack),
      metadata: {
        componentStack: errorInfo.componentStack
      }
    });
  }

  /**
   * Get current error metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10): ErrorReport[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, limit);
  }

  /**
   * Get errors by type
   */
  getErrorsByType(errorType: string): ErrorReport[] {
    return Array.from(this.errors.values())
      .filter(report => report.errorType === errorType);
  }

  /**
   * Clear error history
   */
  clearErrors(): void {
    this.errors.clear();
    this.errorBuffer = [];
    this.metrics = {
      totalErrors: 0,
      errorsByType: {},
      errorsByComponent: {},
      errorRate: 0,
      criticalErrors: 0
    };
  }

  /**
   * Generate a unique fingerprint for error deduplication
   */
  private generateFingerprint(error: Error, context: ErrorContext): string {
    const parts = [
      error.constructor.name,
      error.message,
      context.component || '',
      context.action || '',
      this.extractStackTrace(error)
    ];

    return parts.join('::');
  }

  /**
   * Extract meaningful stack trace for fingerprinting
   */
  private extractStackTrace(error: Error): string {
    if (!error.stack) return '';

    const lines = error.stack.split('\n');
    const meaningfulLines = lines
      .slice(1, 4) // Take first 3 stack frames
      .map(line => line.trim())
      .filter(line => !line.includes('node_modules')); // Exclude dependencies

    return meaningfulLines.join('|');
  }

  /**
   * Extract component name from stack
   */
  private extractComponentName(componentStack: string): string {
    const match = componentStack.match(/in (\w+)/);
    return match?.[1] || 'Unknown';
  }

  /**
   * Update error metrics
   */
  private updateMetrics(error: Error, context: ErrorContext): void {
    this.metrics.totalErrors++;

    // Track by type
    const errorType = error.constructor.name;
    this.metrics.errorsByType[errorType] = (this.metrics.errorsByType[errorType] || 0) + 1;

    // Track by component
    if (context.component) {
      this.metrics.errorsByComponent[context.component] = 
        (this.metrics.errorsByComponent[context.component] || 0) + 1;
    }

    // Track critical errors
    if (this.isCriticalError(error)) {
      this.metrics.criticalErrors++;
    }

    // Calculate error rate (errors per minute)
    this.calculateErrorRate();
  }

  /**
   * Determine if an error is critical
   */
  private isCriticalError(error: Error): boolean {
    // API errors with 5xx status codes
    if (error instanceof ApiError && error.statusCode >= 500) {
      return true;
    }

    // Security-related errors
    if (error.message.toLowerCase().includes('security') ||
        error.message.toLowerCase().includes('unauthorized')) {
      return true;
    }

    // Data corruption errors
    if (error.message.toLowerCase().includes('corrupt') ||
        error.message.toLowerCase().includes('invalid data')) {
      return true;
    }

    return false;
  }

  /**
   * Calculate error rate
   */
  private calculateErrorRate(): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentErrors = this.errorBuffer.filter(
      report => report.timestamp.getTime() > oneMinuteAgo
    );

    this.metrics.errorRate = recentErrors.length;
  }

  /**
   * Log error with appropriate severity
   */
  private logError(error: Error, context: ErrorContext): void {
    const severity = this.isCriticalError(error) ? 'error' : 'warn';
    
    logger[severity]('Error tracked', {
      error: {
        type: error.constructor.name,
        message: error.message,
        stack: error.stack
      },
      context
    });
  }

  /**
   * Start flush interval
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Flush error buffer to external service
   */
  private flush(): void {
    if (this.errorBuffer.length === 0) return;

    // In production, send to error tracking service (e.g., Sentry, Rollbar)
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ERROR_TRACKING_DSN) {
      this.sendToErrorService(this.errorBuffer);
    }

    // Record performance metric
    performanceMonitor.recordMetric({
      name: 'errors_flushed',
      value: this.errorBuffer.length,
      unit: 'count',
      timestamp: Date.now(),
      tags: { category: 'monitoring' }
    });

    // Clear buffer
    this.errorBuffer = [];
  }

  /**
   * Send errors to external tracking service
   */
  private sendToErrorService(errors: ErrorReport[]): void {
    // Implementation would depend on the service being used
    // Example: Sentry, Rollbar, Bugsnag, etc.
    try {
      // Placeholder for actual implementation
      logger.info('Sending errors to tracking service', {
        errorCount: errors.length,
        component: 'ErrorTracker'
      });
    } catch (error: unknown) {
      logger.error('Failed to send errors to tracking service', {
        error: error instanceof Error ? error.message : String(error),
        errorCount: errors.length,
        component: 'ErrorTracker'
      });
    }
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    if (typeof window !== 'undefined') {
      // Browser environment
      window.addEventListener('error', (event) => {
        this.trackError(new Error(event.message), {
          url: event.filename,
          metadata: {
            line: event.lineno,
            column: event.colno
          }
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.trackError(new Error(`Unhandled Promise Rejection: ${event.reason}`), {
          metadata: {
            promise: event.promise
          }
        });
      });
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

// Export singleton instance
export const errorTracker = new ErrorTracker();

// Export React Error Boundary handler
export function errorBoundaryHandler(
  error: Error,
  errorInfo: { componentStack: string }
): void {
  errorTracker.trackComponentError(error, error.stack || '', errorInfo);
}

// Export middleware for API error tracking
export function apiErrorMiddleware(error: unknown, request?: { url: string; method: string }): void {
  if (error instanceof ApiError) {
    errorTracker.trackApiError(error, request);
  } else if (error instanceof Error) {
    errorTracker.trackError(error, {
      url: request?.url,
      method: request?.method
    });
  }
}