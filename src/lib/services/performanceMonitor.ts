/**
 * Runtime Performance Monitor for DomainFlow
 * Provides real-time performance monitoring and Core Web Vitals tracking
 */

export interface PerformanceMetrics {
  // Core Web Vitals
  fcp?: number; // First Contentful Paint
  lcp?: number; // Largest Contentful Paint
  cls?: number; // Cumulative Layout Shift
  fid?: number; // First Input Delay
  ttfb?: number; // Time to First Byte
  inp?: number; // Interaction to Next Paint
  
  // Bundle and Resource Metrics
  bundleSize?: number;
  resourceCount?: number;
  jsSize?: number;
  cssSize?: number;
  imageSize?: number;
  
  // Navigation Timing
  domContentLoaded?: number;
  loadComplete?: number;
  
  // Custom Metrics
  routeChangeTime?: number;
  componentLoadTime?: number;
  apiResponseTime?: number;
}

export interface PerformanceReport {
  url: string;
  timestamp: number;
  metrics: PerformanceMetrics;
  userAgent: string;
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};
  private observers: PerformanceObserver[] = [];
  private reportCallback?: (report: PerformanceReport) => void;

  constructor() {
    this.initializeObservers();
    this.monitorRouteChanges();
  }

  private initializeObservers() {
    if (typeof window === 'undefined') return;

    // Core Web Vitals Observer
    if ('PerformanceObserver' in window) {
      try {
        // FCP, LCP Observer
        const paintObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              this.metrics.fcp = entry.startTime;
            }
            if (entry.entryType === 'largest-contentful-paint') {
              this.metrics.lcp = (entry as PerformanceEntry & { startTime: number }).startTime;
            }
          }
        });
        paintObserver.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });
        this.observers.push(paintObserver);

        // Layout Shift Observer
        const layoutShiftObserver = new PerformanceObserver((list) => {
          let clsValue = 0;
          for (const entry of list.getEntries()) {
            if (!(entry as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput) {
              clsValue += (entry as PerformanceEntry & { value: number }).value;
            }
          }
          this.metrics.cls = clsValue;
        });
        layoutShiftObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(layoutShiftObserver);

        // First Input Delay Observer
        const fidObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.metrics.fid = (entry as PerformanceEntry & { processingStart: number }).processingStart - entry.startTime;
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);

        // Navigation Timing
        const navigationObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const navEntry = entry as PerformanceNavigationTiming;
            this.metrics.ttfb = navEntry.responseStart - navEntry.requestStart;
            this.metrics.domContentLoaded = navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart;
            this.metrics.loadComplete = navEntry.loadEventEnd - navEntry.loadEventStart;
          }
        });
        navigationObserver.observe({ entryTypes: ['navigation'] });
        this.observers.push(navigationObserver);

        // Resource Timing
        const resourceObserver = new PerformanceObserver((list) => {
          this.analyzeResources(list.getEntries() as PerformanceResourceTiming[]);
        });
        resourceObserver.observe({ entryTypes: ['resource'] });
        this.observers.push(resourceObserver);

      } catch {
        console.warn('Performance Observer not fully supported:', error);
      }
    }
  }

  private analyzeResources(entries: PerformanceResourceTiming[]) {
    let jsSize = 0;
    let cssSize = 0;
    let imageSize = 0;
    let resourceCount = 0;

    entries.forEach(entry => {
      resourceCount++;
      const size = entry.transferSize || entry.encodedBodySize || 0;

      if (entry.name.includes('.js')) {
        jsSize += size;
      } else if (entry.name.includes('.css')) {
        cssSize += size;
      } else if (entry.name.match(/\.(jpg|jpeg|png|gif|svg|webp|avif)$/)) {
        imageSize += size;
      }
    });

    this.metrics.jsSize = jsSize;
    this.metrics.cssSize = cssSize;
    this.metrics.imageSize = imageSize;
    this.metrics.resourceCount = resourceCount;
    this.metrics.bundleSize = jsSize + cssSize;
  }

  private monitorRouteChanges() {
    if (typeof window === 'undefined') return;

    let routeStartTime = performance.now();

    // Monitor Next.js route changes
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function(...args) {
      routeStartTime = performance.now();
      return originalPushState.apply(this, args);
    };

    window.history.replaceState = function(...args) {
      routeStartTime = performance.now();
      return originalReplaceState.apply(this, args);
    };

    // Monitor when route change completes
    window.addEventListener('load', () => {
      const routeChangeTime = performance.now() - routeStartTime;
      this.metrics.routeChangeTime = routeChangeTime;
    });
  }

  public measureComponentLoad(componentName: string, startTime: number) {
    const loadTime = performance.now() - startTime;
    this.metrics.componentLoadTime = loadTime;
    
    // Log for debugging
    console.debug(`Component ${componentName} loaded in ${loadTime.toFixed(2)}ms`);
    
    return loadTime;
  }

  public measureApiCall(endpoint: string, startTime: number) {
    const responseTime = performance.now() - startTime;
    this.metrics.apiResponseTime = responseTime;
    
    // Log slow API calls
    if (responseTime > 1000) {
      console.warn(`Slow API call to ${endpoint}: ${responseTime.toFixed(2)}ms`);
    }
    
    return responseTime;
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public generateReport(): PerformanceReport {
    const navigatorWithConnection = navigator as Navigator & {
      connection?: { effectiveType: string; downlink: number; rtt: number };
      mozConnection?: { effectiveType: string; downlink: number; rtt: number };
      webkitConnection?: { effectiveType: string; downlink: number; rtt: number };
    };
    const connection = navigatorWithConnection.connection || navigatorWithConnection.mozConnection || navigatorWithConnection.webkitConnection;
    
    const report: PerformanceReport = {
      url: window.location.href,
      timestamp: Date.now(),
      metrics: this.getMetrics(),
      userAgent: navigator.userAgent,
      connection: connection ? {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
      } : undefined,
      score: this.calculateScore(),
      grade: this.calculateGrade(),
    };

    return report;
  }

  private calculateScore(): number {
    const metrics = this.metrics;
    let score = 100;

    // FCP scoring
    if (metrics.fcp) {
      if (metrics.fcp > 3000) score -= 20;
      else if (metrics.fcp > 1800) score -= 10;
    }

    // LCP scoring
    if (metrics.lcp) {
      if (metrics.lcp > 4000) score -= 25;
      else if (metrics.lcp > 2500) score -= 15;
    }

    // CLS scoring
    if (metrics.cls) {
      if (metrics.cls > 0.25) score -= 20;
      else if (metrics.cls > 0.1) score -= 10;
    }

    // FID scoring
    if (metrics.fid) {
      if (metrics.fid > 300) score -= 20;
      else if (metrics.fid > 100) score -= 10;
    }

    // Bundle size scoring
    if (metrics.bundleSize) {
      const bundleSizeKB = metrics.bundleSize / 1024;
      if (bundleSizeKB > 500) score -= 15;
      else if (bundleSizeKB > 300) score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private calculateGrade(): 'A' | 'B' | 'C' | 'D' | 'F' {
    const score = this.calculateScore();
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  public onReport(callback: (report: PerformanceReport) => void) {
    this.reportCallback = callback;
  }

  public sendReport() {
    if (this.reportCallback) {
      const report = this.generateReport();
      this.reportCallback(report);
    }
  }

  public destroy() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Utility functions
export const measureAsync = async <T>(
  asyncFn: () => Promise<T>,
  label: string
): Promise<{ result: T; duration: number }> => {
  const startTime = performance.now();
  const result = await asyncFn();
  const duration = performance.now() - startTime;
  
  console.debug(`${label}: ${duration.toFixed(2)}ms`);
  return { result, duration };
};

export const withPerformanceTracking = <T extends (...args: unknown[]) => unknown>(
  fn: T,
  label: string
): T => {
  return ((...args: Parameters<T>) => {
    const startTime = performance.now();
    const result = fn(...args);
    const duration = performance.now() - startTime;
    
    console.debug(`${label}: ${duration.toFixed(2)}ms`);
    return result;
  }) as T;
};

// Initialize performance monitoring on page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    // Send initial report after page load
    setTimeout(() => {
      performanceMonitor.sendReport();
    }, 2000);
  });

  // Send report on page unload
  window.addEventListener('beforeunload', () => {
    performanceMonitor.sendReport();
  });
}