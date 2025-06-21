// src/lib/monitoring/performance-monitor.ts
// Performance Monitoring Framework for DomainFlow

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent';
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceReport {
  id: string;
  sessionId: string;
  timestamp: number;
  url: string;
  userAgent: string;
  metrics: PerformanceMetric[];
  vitals?: {
    fcp?: number; // First Contentful Paint
    lcp?: number; // Largest Contentful Paint
    fid?: number; // First Input Delay
    cls?: number; // Cumulative Layout Shift
    ttfb?: number; // Time to First Byte
  };
  customMetrics?: Record<string, number>;
}

export interface MonitoringConfig {
  enabled: boolean;
  samplingRate: number; // 0-1, percentage of events to capture
  endpoint?: string;
  bufferSize: number;
  flushInterval: number; // milliseconds
  enabledMetrics: {
    webVitals: boolean;
    navigation: boolean;
    resource: boolean;
    api: boolean;
    custom: boolean;
  };
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private config: MonitoringConfig;
  private buffer: PerformanceReport[] = [];
  private sessionId: string;
  private observers: PerformanceObserver[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<MonitoringConfig> = {}) {
    this.config = {
      enabled: true,
      samplingRate: 0.1, // 10% sampling
      bufferSize: 50,
      flushInterval: 30000, // 30 seconds
      enabledMetrics: {
        webVitals: true,
        navigation: true,
        resource: true,
        api: true,
        custom: true,
      },
      ...config,
    };
    
    this.sessionId = this.generateSessionId();
    
    if (this.config.enabled && typeof window !== 'undefined') {
      this.initialize();
    }
  }

  static getInstance(config?: Partial<MonitoringConfig>): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor(config);
    }
    return PerformanceMonitor.instance;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.samplingRate;
  }

  private initialize(): void {
    if (!this.shouldSample()) {
      return;
    }

    this.setupWebVitalsObserver();
    this.setupNavigationObserver();
    this.setupResourceObserver();
    this.startFlushTimer();
    this.setupUnloadHandler();
  }

  private setupWebVitalsObserver(): void {
    if (!this.config.enabledMetrics.webVitals) return;

    // Observe Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
          this.recordMetric({
            name: 'web_vitals_lcp',
            value: lastEntry.renderTime || lastEntry.loadTime || 0,
            unit: 'ms',
            timestamp: Date.now(),
            tags: { type: 'web_vitals' }
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch {
        console.warn('[PerformanceMonitor] LCP observer not supported:', error);
      }

      // Observe First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            this.recordMetric({
              name: 'web_vitals_fid',
              value: (entry as PerformanceEntry & { processingStart: number }).processingStart - entry.startTime,
              unit: 'ms',
              timestamp: Date.now(),
              tags: { type: 'web_vitals' }
            });
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch {
        console.warn('[PerformanceMonitor] FID observer not supported:', error);
      }

      // Observe Cumulative Layout Shift (CLS)
      try {
        const clsObserver = new PerformanceObserver((list) => {
          let clsScore = 0;
          const entries = list.getEntries();
          entries.forEach((entry) => {
            const layoutShiftEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value: number };
            if (!layoutShiftEntry.hadRecentInput) {
              clsScore += layoutShiftEntry.value;
            }
          });
          this.recordMetric({
            name: 'web_vitals_cls',
            value: clsScore,
            unit: 'count',
            timestamp: Date.now(),
            tags: { type: 'web_vitals' }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch {
        console.warn('[PerformanceMonitor] CLS observer not supported:', error);
      }
    }

    // First Contentful Paint (FCP) - available via PerformanceNavigationTiming
    window.addEventListener('load', () => {
      setTimeout(() => {
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        if (fcpEntry) {
          this.recordMetric({
            name: 'web_vitals_fcp',
            value: fcpEntry.startTime,
            unit: 'ms',
            timestamp: Date.now(),
            tags: { type: 'web_vitals' }
          });
        }
      }, 100);
    });
  }

  private setupNavigationObserver(): void {
    if (!this.config.enabledMetrics.navigation) return;

    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          this.recordMetric({
            name: 'navigation_dom_content_loaded',
            value: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
            unit: 'ms',
            timestamp: Date.now(),
            tags: { type: 'navigation' }
          });

          this.recordMetric({
            name: 'navigation_load_complete',
            value: navigation.loadEventEnd - navigation.loadEventStart,
            unit: 'ms',
            timestamp: Date.now(),
            tags: { type: 'navigation' }
          });

          this.recordMetric({
            name: 'navigation_ttfb',
            value: navigation.responseStart - navigation.requestStart,
            unit: 'ms',
            timestamp: Date.now(),
            tags: { type: 'navigation' }
          });
        }
      }, 100);
    });
  }

  private setupResourceObserver(): void {
    if (!this.config.enabledMetrics.resource) return;

    if ('PerformanceObserver' in window) {
      try {
        const resourceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            const resource = entry as PerformanceResourceTiming;
            this.recordMetric({
              name: 'resource_load_time',
              value: resource.responseEnd - resource.startTime,
              unit: 'ms',
              timestamp: Date.now(),
              tags: {
                type: 'resource',
                resource_type: resource.initiatorType,
                url: resource.name
              }
            });
          });
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.push(resourceObserver);
      } catch {
        console.warn('[PerformanceMonitor] Resource observer not supported:', error);
      }
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private setupUnloadHandler(): void {
    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  public recordMetric(metric: PerformanceMetric): void {
    if (!this.config.enabled || !this.shouldSample()) {
      return;
    }

    const report: PerformanceReport = {
      id: `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      metrics: [metric],
    };

    this.buffer.push(report);

    if (this.buffer.length >= this.config.bufferSize) {
      this.flush();
    }
  }

  public recordApiCall(url: string, method: string, duration: number, status: number): void {
    if (!this.config.enabledMetrics.api) return;

    this.recordMetric({
      name: 'api_call_duration',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      tags: {
        type: 'api',
        url,
        method,
        status: status.toString()
      }
    });
  }

  public recordCustomMetric(name: string, value: number, unit: PerformanceMetric['unit'], tags?: Record<string, string>): void {
    if (!this.config.enabledMetrics.custom) return;

    this.recordMetric({
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags: { type: 'custom', ...tags }
    });
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const reports = [...this.buffer];
    this.buffer = [];

    if (this.config.endpoint) {
      try {
        await fetch(this.config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reports,
            timestamp: Date.now(),
            sessionId: this.sessionId,
          }),
        });
      } catch {
        console.warn('[PerformanceMonitor] Failed to send metrics:', error);
        // Re-add reports to buffer on failure
        this.buffer.unshift(...reports);
      }
    } else {
      // Log to console in development
      console.group('[PerformanceMonitor] Metrics Flush');
      reports.forEach(report => {
        console.log('Report:', report);
      });
      console.groupEnd();
    }
  }

  public getMetrics(): PerformanceReport[] {
    return [...this.buffer];
  }

  public clear(): void {
    this.buffer = [];
  }

  public destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    this.flush();
  }
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();
export default performanceMonitor;
