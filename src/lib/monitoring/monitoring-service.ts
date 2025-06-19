// src/lib/monitoring/monitoring-service.ts
// Integrated Monitoring Service for DomainFlow Application

import React from 'react';
import { performanceMonitor, type PerformanceMetric } from './performance-monitor';

export interface MonitoringHooks {
  onApiRequest?: (url: string, method: string) => void;
  onApiResponse?: (url: string, method: string, duration: number, status: number) => void;
  onApiError?: (url: string, method: string, duration: number, error: Error) => void;
  onPageLoad?: (url: string, loadTime: number) => void;
  onUserInteraction?: (type: string, element: string) => void;
  onError?: (error: Error, context?: string) => void;
}

export interface ErrorReport {
  id: string;
  timestamp: number;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
  context?: string;
  url: string;
  userAgent: string;
  sessionId: string;
}

class MonitoringService {
  private static instance: MonitoringService;
  private hooks: MonitoringHooks = {};
  private errorBuffer: ErrorReport[] = [];
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeErrorHandling();
  }

  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  private generateSessionId(): string {
    return `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeErrorHandling(): void {
    if (typeof window === 'undefined') return;

    // Global error handler
    window.addEventListener('error', (event) => {
      this.recordError(new Error(event.message), 'global_error');
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError(new Error(event.reason), 'unhandled_promise_rejection');
    });
  }

  public setHooks(hooks: MonitoringHooks): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  // API Monitoring Methods
  public startApiRequest(url: string, method: string): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.hooks.onApiRequest?.(url, method);
    
    // Record API request start
    performanceMonitor.recordCustomMetric(
      'api_request_start',
      Date.now(),
      'ms',
      { url, method, requestId }
    );
    
    return requestId;
  }

  public endApiRequest(requestId: string, url: string, method: string, startTime: number, status: number): void {
    const duration = Date.now() - startTime;
    
    this.hooks.onApiResponse?.(url, method, duration, status);
    performanceMonitor.recordApiCall(url, method, duration, status);
    
    // Record API request end
    performanceMonitor.recordCustomMetric(
      'api_request_end',
      Date.now(),
      'ms',
      { url, method, requestId, duration: duration.toString(), status: status.toString() }
    );
  }

  public recordApiError(url: string, method: string, startTime: number, error: Error): void {
    const duration = Date.now() - startTime;
    
    this.hooks.onApiError?.(url, method, duration, error);
    this.recordError(error, `api_error_${method}_${url}`);
    
    // Record API error
    performanceMonitor.recordCustomMetric(
      'api_error',
      duration,
      'ms',
      { 
        url, 
        method, 
        error_name: error.name,
        error_message: error.message.substring(0, 100) // Truncate for storage
      }
    );
  }

  // Component Performance Monitoring
  public recordComponentRender(componentName: string, renderTime: number): void {
    performanceMonitor.recordCustomMetric(
      'component_render_time',
      renderTime,
      'ms',
      { component: componentName }
    );
  }

  public recordComponentMount(componentName: string, mountTime: number): void {
    performanceMonitor.recordCustomMetric(
      'component_mount_time',
      mountTime,
      'ms',
      { component: componentName }
    );
  }

  // User Interaction Monitoring
  public recordUserInteraction(type: 'click' | 'input' | 'scroll' | 'navigation', element: string, metadata?: Record<string, string>): void {
    this.hooks.onUserInteraction?.(type, element);
    
    performanceMonitor.recordCustomMetric(
      'user_interaction',
      Date.now(),
      'ms',
      { 
        interaction_type: type, 
        element,
        ...metadata
      }
    );
  }

  // Campaign Performance Monitoring
  public recordCampaignOperation(operation: 'create' | 'start' | 'pause' | 'resume' | 'cancel', campaignId: string, duration: number): void {
    performanceMonitor.recordCustomMetric(
      'campaign_operation_time',
      duration,
      'ms',
      { 
        operation,
        campaign_id: campaignId
      }
    );
  }

  public recordCampaignMetric(campaignId: string, metric: string, value: number, unit: PerformanceMetric['unit']): void {
    performanceMonitor.recordCustomMetric(
      `campaign_${metric}`,
      value,
      unit,
      { campaign_id: campaignId }
    );
  }

  // Memory and Performance Monitoring
  public recordMemoryUsage(): void {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const performance = window.performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
      if (performance.memory) {
        const memory = performance.memory;
      
      performanceMonitor.recordCustomMetric('memory_used', memory.usedJSHeapSize, 'bytes');
      performanceMonitor.recordCustomMetric('memory_total', memory.totalJSHeapSize, 'bytes');
      performanceMonitor.recordCustomMetric('memory_limit', memory.jsHeapSizeLimit, 'bytes');
      }
    }
  }

  // Error Monitoring
  public recordError(error: Error, context?: string): void {
    this.hooks.onError?.(error, context);
    
    const errorReport: ErrorReport = {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      sessionId: this.sessionId,
    };
    
    this.errorBuffer.push(errorReport);
    
    // Also record as performance metric
    performanceMonitor.recordCustomMetric(
      'error_occurred',
      1,
      'count',
      { 
        error_name: error.name,
        error_context: context || 'unknown'
      }
    );
  }

  // Page Load Monitoring
  public recordPageLoad(url: string, loadTime: number): void {
    this.hooks.onPageLoad?.(url, loadTime);
    
    performanceMonitor.recordCustomMetric(
      'page_load_time',
      loadTime,
      'ms',
      { url }
    );
  }

  // Utility Methods
  public getErrors(): ErrorReport[] {
    return [...this.errorBuffer];
  }

  public clearErrors(): void {
    this.errorBuffer = [];
  }

  public createTimer(): { end: () => number } {
    const startTime = Date.now();
    return {
      end: () => Date.now() - startTime
    };
  }

  // React Component Wrapper for Performance Monitoring
  public wrapComponent<T extends React.ComponentType<Record<string, unknown>>>(
    Component: T,
    componentName?: string
  ): T {
    const name = componentName || Component.displayName || Component.name || 'Unknown';
    
    const WrappedComponent = (props: Record<string, unknown>) => {
      const mountTimer = this.createTimer();
      
      React.useEffect(() => {
        const mountTime = mountTimer.end();
        this.recordComponentMount(name, mountTime);
      }, [mountTimer]); // Include mountTimer dependency
      
      const renderTimer = this.createTimer();
      const result = React.createElement(Component, props);
      const renderTime = renderTimer.end();
      
      React.useEffect(() => {
        this.recordComponentRender(name, renderTime);
      });
      
      return result;
    };
    
    WrappedComponent.displayName = `Monitored(${name})`;
    return WrappedComponent as T;
  }
}

// Export singleton instance
export const monitoringService = MonitoringService.getInstance();
export default monitoringService;
