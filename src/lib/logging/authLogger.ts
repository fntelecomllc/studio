// Frontend authentication logging utility
// Provides structured logging for client-side authentication events

import { logger } from '@/lib/utils/logger';

// Specific detail interfaces for different logging contexts
export interface AuthOperationDetails {
  authMethod?: string;
  provider?: string;
  twoFactorUsed?: boolean;
  deviceTrusted?: boolean;
  ipAddress?: string;
  browserInfo?: string;
  redirectUrl?: string;
  step?: string;
  email?: string;
  status_code?: number;
  user_roles?: string;
  error_type?: string;
  error_parse_duration?: number;
  user_permissions?: number;
  stack_trace?: string;
  remember_me?: boolean;
  session_expires_at?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ApiCallDetails {
  endpoint?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  payload?: Record<string, string | number | boolean>;
  api_metrics?: ApiCallMetrics;
  metadata?: Record<string, string | number | boolean>;
}

export interface SessionEventDetails {
  previousSessionId?: string;
  renewalReason?: string;
  expirationReason?: string;
  deviceInfo?: string;
  session_metrics?: SessionMetrics;
  setup_duration?: number;
  auto_refresh_enabled?: boolean;
  session_check_enabled?: boolean;
  session_valid?: boolean;
  tokenSource?: string;
  expectedToken?: string;
  actualToken?: string;
  token_length?: number;
  processing_duration?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface PasswordEventDetails {
  password_strength?: string;
  strengthScore?: number;
  hashedPassword?: boolean;
  changeReason?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface SecurityEventDetails {
  security_metrics?: SecurityMetrics;
  threatType?: string;
  blockReason?: string;
  allowReason?: string;
  email?: string;
  status_code?: number;
  user_agent?: string;
  error_message?: string;
  login_duration?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface PerformanceEventDetails {
  performance_metrics?: PerformanceMetrics;
  slowComponents?: string[];
  optimizationSuggestions?: string[];
  url_resolution_time?: number;
  request_preparation_time?: number;
  response_parsing_time?: number;
  token_processing_time?: number;
  state_update_time?: number;
  session_setup_time?: number;
  request_size_bytes?: number;
  response_size_bytes?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface AuthFlowDetails {
  step?: string;
  step_number?: number;
  total_steps?: number;
  progress_percentage?: number;
  flowType?: string;
  base_url?: string;
  user_id?: string;
  session_id?: string;
  error?: string;
  status_code?: number;
  session_token_length?: number;
  user_roles?: string;
  total_duration?: number;
  error_type?: string;
  expires_at?: string;
  user_permissions?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SessionStateChangeDetails {
  from_state?: string;
  to_state?: string;
  changeReason?: string;
  transitionTime?: number;
  state_update_duration?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface AuthLogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  category: 'AUTH' | 'SESSION' | 'PASSWORD' | 'API' | 'SECURITY' | 'PERFORMANCE';
  operation: string;
  userId?: string;
  sessionId?: string;
  duration?: number;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  details?: AuthOperationDetails | ApiCallDetails | SessionEventDetails | PasswordEventDetails | SecurityEventDetails | PerformanceEventDetails | AuthFlowDetails | SessionStateChangeDetails;
  userAgent: string;
  url: string;
  requestId?: string;
}

export interface ApiCallMetrics {
  url: string;
  method: string;
  requestSize?: number;
  responseSize?: number;
  statusCode?: number;
  duration: number;
  retryCount?: number;
  cacheHit?: boolean;
}

export interface SessionMetrics {
  sessionId: string;
  expiresAt?: string;
  lastActivity?: string;
  renewalCount?: number;
  timeToExpiry?: number;
}

export interface SecurityMetrics {
  riskScore: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  suspiciousActivity: boolean;
  sessionHijackingAttempt?: boolean;
  deviceFingerprint?: string;
}

export interface PerformanceMetrics {
  renderTime?: number;
  apiCallTime: number;
  totalTime: number;
  memoryUsage?: number;
  networkLatency?: number;
}

class AuthLogger {
  private static instance: AuthLogger;
  private logBuffer: AuthLogEntry[] = [];
  private maxBufferSize = 100;
  private flushInterval = 30000; // 30 seconds
  private flushTimer: NodeJS.Timeout | null = null;
  private isEnabled = true;

  static getInstance(): AuthLogger {
    if (!AuthLogger.instance) {
      AuthLogger.instance = new AuthLogger();
    }
    return AuthLogger.instance;
  }

  constructor() {
    this.startFlushTimer();
    
    // Listen for page unload to flush logs
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flush();
      });
    }
  }

  // Enable/disable logging
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  // Set buffer size and flush interval
  configure(maxBufferSize: number, flushInterval: number): void {
    this.maxBufferSize = maxBufferSize;
    this.flushInterval = flushInterval;
    this.restartFlushTimer();
  }

  // Log authentication operation
  logAuthOperation(
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
    operation: string,
    userId?: string,
    sessionId?: string,
    duration?: number,
    success?: boolean,
    errorCode?: string,
    errorMessage?: string,
    details?: AuthOperationDetails
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level,
      category: 'AUTH',
      operation,
      userId,
      sessionId,
      duration,
      success,
      errorCode,
      errorMessage,
      details,
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  // Log API call with metrics
  logApiCall(
    operation: string,
    metrics: ApiCallMetrics,
    success: boolean,
    errorCode?: string,
    errorMessage?: string,
    details?: ApiCallDetails
  ): void {
    const level = success ? 'INFO' : 'ERROR';
    
    this.log({
      timestamp: new Date().toISOString(),
      level,
      category: 'API',
      operation,
      duration: metrics.duration,
      success,
      errorCode,
      errorMessage,
      details: {
        ...details,
        api_metrics: metrics,
      },
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  // Log session management events
  logSessionEvent(
    operation: string,
    sessionMetrics: SessionMetrics,
    success: boolean,
    details?: SessionEventDetails
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'SESSION',
      operation,
      sessionId: sessionMetrics.sessionId,
      success,
      details: {
        ...details,
        session_metrics: sessionMetrics,
      },
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  

  // Log password operations
  logPasswordEvent(
    operation: string,
    success: boolean,
    passwordStrength?: string,
    details?: PasswordEventDetails
  ): void {
    const level = success ? 'INFO' : 'WARN';
    
    this.log({
      timestamp: new Date().toISOString(),
      level,
      category: 'PASSWORD',
      operation,
      success,
      details: {
        ...details,
        password_strength: passwordStrength,
      },
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  // Log security events
  logSecurityEvent(
    operation: string,
    securityMetrics: SecurityMetrics,
    userId?: string,
    sessionId?: string,
    details?: SecurityEventDetails
  ): void {
    const level = securityMetrics.riskScore > 7 ? 'ERROR' : 
                  securityMetrics.riskScore > 4 ? 'WARN' : 'INFO';
    
    this.log({
      timestamp: new Date().toISOString(),
      level,
      category: 'SECURITY',
      operation,
      userId,
      sessionId,
      success: !securityMetrics.suspiciousActivity,
      details: {
        ...details,
        security_metrics: securityMetrics,
      },
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  // Log performance metrics
  logPerformanceMetrics(
    operation: string,
    performanceMetrics: PerformanceMetrics,
    details?: PerformanceEventDetails
  ): void {
    const level = performanceMetrics.totalTime > 5000 ? 'WARN' : 'INFO';
    
    this.log({
      timestamp: new Date().toISOString(),
      level,
      category: 'PERFORMANCE',
      operation,
      duration: performanceMetrics.totalTime,
      success: true,
      details: {
        ...details,
        performance_metrics: performanceMetrics,
      },
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  // Log authentication flow progression
  logAuthFlow(
    step: string,
    stepNumber: number,
    totalSteps: number,
    success: boolean,
    duration?: number,
    details?: AuthFlowDetails
  ): void {
    const level = success ? 'INFO' : 'ERROR';
    
    this.log({
      timestamp: new Date().toISOString(),
      level,
      category: 'AUTH',
      operation: 'auth_flow_step',
      duration,
      success,
      details: {
        ...details,
        step,
        step_number: stepNumber,
        total_steps: totalSteps,
        progress_percentage: Math.round((stepNumber / totalSteps) * 100),
      },
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  // Log user session state changes
  logSessionStateChange(
    fromState: string,
    toState: string,
    userId?: string,
    sessionId?: string,
    details?: SessionStateChangeDetails
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'SESSION',
      operation: 'session_state_change',
      userId,
      sessionId,
      success: true,
      details: {
        ...details,
        from_state: fromState,
        to_state: toState,
      },
      userAgent: this.getUserAgent(),
      url: this.getCurrentUrl(),
      requestId: this.generateRequestId(),
    });
  }

  // Private methods
  private log(entry: AuthLogEntry): void {
    if (!this.isEnabled) return;

    // Add to buffer
    this.logBuffer.push(entry);

    // Console log for development
    if (process.env.NODE_ENV === 'development') {
      const logMethod = entry.level === 'ERROR' ? logger.error :
                       entry.level === 'WARN' ? logger.warn :
                       logger.info;
      
      logMethod(`Authentication event: ${entry.category}:${entry.operation}`, {
        component: 'AuthLogger',
        level: entry.level,
        operation: entry.operation,
        category: entry.category,
        userId: entry.userId,
        sessionId: entry.sessionId,
        success: entry.success,
        duration: entry.duration,
        url: entry.url,
        userAgent: entry.userAgent,
        details: entry.details
      });
    }

    // Flush if buffer is full
    if (this.logBuffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.logBuffer.length === 0) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    // Send logs to server (fire and forget)
    this.sendLogsToServer(logsToSend).catch(error => {
      logger.warn('Failed to send authentication logs to server', {
        component: 'AuthLogger',
        method: 'flush',
        error: error instanceof Error ? error.message : 'Unknown error',
        logCount: logsToSend.length
      });
      // Could implement retry logic here
    });
  }

  private async sendLogsToServer(logs: AuthLogEntry[]): Promise<void> {
    try {
      // Only send in production or when explicitly enabled
      if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_ENABLE_LOG_SHIPPING) {
        return;
      }

      const response = await fetch('/api/v2/logs/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ logs }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send logs: ${response.status}`);
      }
    } catch (error) {
      // Silently fail - logging shouldn't break the app
      logger.warn('Authentication log shipping failed', {
        component: 'AuthLogger',
        method: 'sendLogsToServer',
        error: error instanceof Error ? error.message : 'Unknown error',
        logCount: logs.length
      });
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  private restartFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.startFlushTimer();
  }

  private getUserAgent(): string {
    return typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  }

  private getCurrentUrl(): string {
    return typeof window !== 'undefined' ? window.location.href : 'Unknown';
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public method to get current logs (for debugging)
  getCurrentLogs(): AuthLogEntry[] {
    return [...this.logBuffer];
  }

  // Public method to clear logs
  clearLogs(): void {
    this.logBuffer = [];
  }
}

// Export singleton instance
export const authLogger = AuthLogger.getInstance();

// Convenience functions
export function logAuthOperation(
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
  operation: string,
  userId?: string,
  sessionId?: string,
  duration?: number,
  success?: boolean,
  errorCode?: string,
  errorMessage?: string,
  details?: AuthOperationDetails
): void {
  authLogger.logAuthOperation(level, operation, userId, sessionId, duration, success, errorCode, errorMessage, details);
}

export function logApiCall(
  operation: string,
  metrics: ApiCallMetrics,
  success: boolean,
  errorCode?: string,
  errorMessage?: string,
  details?: ApiCallDetails
): void {
  authLogger.logApiCall(operation, metrics, success, errorCode, errorMessage, details);
}

export function logSessionEvent(
  operation: string,
  sessionMetrics: SessionMetrics,
  success: boolean,
  details?: SessionEventDetails
): void {
  authLogger.logSessionEvent(operation, sessionMetrics, success, details);
}


export function logPasswordEvent(
  operation: string,
  success: boolean,
  passwordStrength?: string,
  details?: PasswordEventDetails
): void {
  authLogger.logPasswordEvent(operation, success, passwordStrength, details);
}

export function logSecurityEvent(
  operation: string,
  securityMetrics: SecurityMetrics,
  userId?: string,
  sessionId?: string,
  details?: SecurityEventDetails
): void {
  authLogger.logSecurityEvent(operation, securityMetrics, userId, sessionId, details);
}

export function logPerformanceMetrics(
  operation: string,
  performanceMetrics: PerformanceMetrics,
  details?: PerformanceEventDetails
): void {
  authLogger.logPerformanceMetrics(operation, performanceMetrics, details);
}

export function logAuthFlow(
  step: string,
  stepNumber: number,
  totalSteps: number,
  success: boolean,
  duration?: number,
  details?: AuthFlowDetails
): void {
  authLogger.logAuthFlow(step, stepNumber, totalSteps, success, duration, details);
}

export function logSessionStateChange(
  fromState: string,
  toState: string,
  userId?: string,
  sessionId?: string,
  details?: SessionStateChangeDetails
): void {
  authLogger.logSessionStateChange(fromState, toState, userId, sessionId, details);
}