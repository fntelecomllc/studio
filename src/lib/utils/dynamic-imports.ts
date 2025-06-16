/**
 * Dynamic Import Utilities for Bundle Optimization
 * Provides lazy loading and code splitting utilities for the DomainFlow application
 */

import { ComponentType, lazy, LazyExoticComponent } from 'react';

// Generic dynamic import with error boundary
export function createLazyComponent<T extends ComponentType<Record<string, unknown>>>(
  importFn: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const importedModule = await importFn();
      return importedModule;
    } catch (error) {
      console.error('Failed to load component:', error);
      // Return a simple error component
      const ErrorComponent = () => {
        return null; // Return null for failed components
      };
      return { default: ErrorComponent as unknown as T };
    }
  });
}

// Preload utilities for critical components
export const preloadComponent = (importFn: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
  // Start loading the component but don't wait for it
  importFn().catch(error => {
    console.warn('Failed to preload component:', error);
  });
};

// Dynamic imports for existing components
export const DynamicComponents = {
  // Existing complex forms
  CampaignFormV2: createLazyComponent(
    () => import('@/components/campaigns/CampaignFormV2')
  ),
};

// Utility for preloading critical routes
export const preloadCriticalRoutes = () => {
  // Preload components that are likely to be accessed first
  preloadComponent(() => import('@/components/campaigns/CampaignFormV2'));
};

// Bundle size utilities
export const getBundleMetrics = () => {
  if (typeof window !== 'undefined' && 'performance' in window) {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    
    const jsResources = resources.filter(r => r.name.includes('.js'));
    const cssResources = resources.filter(r => r.name.includes('.css'));
    
    return {
      loadTime: navigation.loadEventEnd - navigation.loadEventStart,
      domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
      jsResourceCount: jsResources.length,
      cssResourceCount: cssResources.length,
      totalTransferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      jsTransferSize: jsResources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      cssTransferSize: cssResources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
    };
  }
  return null;
};

// Resource hints for better loading performance
export const addResourceHints = () => {
  if (typeof document !== 'undefined') {
    // Preconnect to external domains
    const preconnectDomains = [
      'https://placehold.co',
      // Add other external domains used by the app
    ];
    
    preconnectDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = domain;
      document.head.appendChild(link);
    });
    
    // DNS prefetch for likely external resources
    const dnsPrefetchDomains = [
      '//fonts.googleapis.com',
      '//fonts.gstatic.com',
    ];
    
    dnsPrefetchDomains.forEach(domain => {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = domain;
      document.head.appendChild(link);
    });
  }
};

// Performance monitoring for dynamic imports
export const trackDynamicImportPerformance = (componentName: string) => {
  const startTime = performance.now();
  
  return {
    end: () => {
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      // Log performance metrics (can be sent to analytics)
      console.debug(`Dynamic import ${componentName}: ${loadTime.toFixed(2)}ms`);
      
      // Track in performance observer if available
      if ('PerformanceObserver' in window) {
        try {
          performance.mark(`dynamic-import-${componentName}-end`);
          performance.measure(
            `dynamic-import-${componentName}`,
            `dynamic-import-${componentName}-start`,
            `dynamic-import-${componentName}-end`
          );
        } catch (_e) {
          // Ignore performance API errors
        }
      }
      
      return loadTime;
    },
  };
};

// Tree-shaking optimization utilities
export const optimizeImports = {
  // Optimized date-fns imports
  dateUtils: {
    format: () => import('date-fns/format'),
    isValid: () => import('date-fns/isValid'),
    parseISO: () => import('date-fns/parseISO'),
    addDays: () => import('date-fns/addDays'),
    subDays: () => import('date-fns/subDays'),
    startOfDay: () => import('date-fns/startOfDay'),
    endOfDay: () => import('date-fns/endOfDay'),
  },
  
  // Optimized Radix UI imports (already optimized by Next.js config)
  radixComponents: {
    Dialog: () => import('@radix-ui/react-dialog'),
    Popover: () => import('@radix-ui/react-popover'),
    Select: () => import('@radix-ui/react-select'),
    Tabs: () => import('@radix-ui/react-tabs'),
  },
};

// Bundle chunk analysis utilities
export const analyzeBundleChunks = async () => {
  if (typeof window === 'undefined') return null;
  
  const chunks = [];
  const scripts = document.querySelectorAll('script[src]');
  
  for (const script of scripts) {
    const src = script.getAttribute('src');
    if (src && src.includes('_next/static')) {
      try {
        const response = await fetch(src, { method: 'HEAD' });
        chunks.push({
          url: src,
          size: parseInt(response.headers.get('content-length') || '0'),
          type: getChunkType(src),
        });
      } catch (error) {
        console.warn('Failed to analyze chunk:', src, error);
      }
    }
  }
  
  return chunks;
};

function getChunkType(url: string): string {
  if (url.includes('_app')) return 'main';
  if (url.includes('pages')) return 'page';
  if (url.includes('vendors') || url.includes('node_modules')) return 'vendor';
  if (url.includes('runtime')) return 'runtime';
  if (url.includes('webpack')) return 'webpack';
  return 'other';
}

// Performance budget checker
export const checkPerformanceBudget = (metrics: ReturnType<typeof getBundleMetrics>) => {
  if (!metrics) return null;
  
  const budgets = {
    jsResourceCount: 10,
    cssResourceCount: 5,
    totalTransferSize: 500 * 1024, // 500KB
    jsTransferSize: 300 * 1024, // 300KB
    cssTransferSize: 50 * 1024, // 50KB
    loadTime: 3000, // 3s
    domContentLoaded: 1500, // 1.5s
  };
  
  const results = Object.entries(budgets).map(([key, budget]) => {
    const value = metrics[key as keyof typeof metrics] as number;
    return {
      metric: key,
      value,
      budget,
      passed: value <= budget,
      percentage: (value / budget) * 100,
    };
  });
  
  return {
    passed: results.every(r => r.passed),
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    },
  };
};