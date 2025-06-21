// Phase 5.3: Frontend Performance Improvements Configuration

import dynamic from 'next/dynamic';
import React, { ComponentType, lazy, ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';

// Extend Window interface for gtag
declare global {
  interface Window {
    gtag?: (
      command: 'event',
      eventName: string,
      eventParameters?: Record<string, unknown>
    ) => void;
  }
}

/**
 * Route-based code splitting configuration
 */
export const lazyRoutes = {
  // Campaign pages
  CampaignDetails: () => lazy(() => import('@/app/campaigns/[id]/page')),
  CampaignEdit: () => lazy(() => import('@/app/campaigns/[id]/edit/page')),
  CampaignNew: () => lazy(() => import('@/app/campaigns/new/page')),
  
  // Persona pages
  PersonaEdit: () => lazy(() => import('@/app/personas/[id]/edit/page')),
  PersonaNew: () => lazy(() => import('@/app/personas/new/page')),
  
  // Heavy components
  CampaignProgressMonitor: () => lazy(() => import('@/components/campaigns/CampaignProgressMonitor')),
  ContentSimilarityView: () => lazy(() => import('@/components/campaigns/ContentSimilarityView')),
};

/**
 * Dynamic imports with loading states
 */
export function createDynamicComponent<P extends Record<string, unknown> = Record<string, never>>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options?: {
    loading?: () => ReactNode;
    ssr?: boolean;
  }
): ComponentType<P> {
  return dynamic(importFn, {
    loading: options?.loading || (() => React.createElement('div', {
      className: "animate-pulse h-32 bg-gray-100 rounded"
    })),
    ssr: options?.ssr ?? true,
  }) as ComponentType<P>;
}

/**
 * Virtual scrolling configuration for large lists
 */
export const virtualScrollConfig = {
  itemHeight: 80, // Default item height in pixels
  overscan: 5, // Number of items to render outside visible area
  scrollDebounceMs: 150, // Debounce scroll events
  initialItemCount: 20, // Initial items to render
};

/**
 * Image optimization settings
 */
export const imageOptimization = {
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  formats: ['image/webp', 'image/avif'],
  minimumCacheTTL: 60,
  dangerouslyAllowSVG: false,
  contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
};

/**
 * Performance monitoring thresholds
 */
export const performanceThresholds = {
  // Core Web Vitals targets
  LCP: 2500, // Largest Contentful Paint (ms)
  FID: 100,  // First Input Delay (ms)
  CLS: 0.1,  // Cumulative Layout Shift
  
  // Custom metrics
  apiResponseTime: 500, // Target API response time (ms)
  bundleSize: 200, // Target bundle size (KB)
  initialLoadTime: 3000, // Target initial load time (ms)
};

/**
 * Prefetch configuration for React Query
 */
export const prefetchConfig = {
  // Prefetch on hover with delay
  hoverDelay: 200,
  
  // Prefetch visible links in viewport
  viewportPrefetch: true,
  
  // Maximum concurrent prefetch requests
  maxConcurrentPrefetch: 3,
  
  // Prefetch priority routes
  priorityRoutes: [
    '/campaigns',
    '/dashboard',
    '/personas',
  ],
};

/**
 * Bundle optimization settings
 */
export const bundleOptimization = {
  // Split chunks configuration
  splitChunks: {
    chunks: 'all',
    cacheGroups: {
      default: false,
      vendors: false,
      
      // Vendor chunks
      framework: {
        name: 'framework',
        chunks: 'all',
        test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
        priority: 40,
        enforce: true,
      },
      
      lib: {
        test: /[\\/]node_modules[\\/]/,
        name(module: { context: string }) {
          const match = module.context.match(
            /[\\/]node_modules[\\/](.*?)([\\/]|$)/
          );
          const packageName = match?.[1] || 'unknown';
          return `lib.${packageName.replace('@', '')}`;
        },
        priority: 30,
        minChunks: 1,
        reuseExistingChunk: true,
      },
      
      commons: {
        name: 'commons',
        chunks: 'all',
        minChunks: 2,
        priority: 20,
      },
      
      shared: {
        name: 'shared',
        priority: 10,
        test: /components|hooks|lib|utils/,
        minChunks: 2,
        reuseExistingChunk: true,
      },
    },
  },
  
  // Minimize configuration
  minimize: true,
  minimizer: {
    terserOptions: {
      parse: {
        ecma: 8,
      },
      compress: {
        ecma: 5,
        warnings: false,
        comparisons: false,
        inline: 2,
      },
      mangle: {
        safari10: true,
      },
      output: {
        ecma: 5,
        comments: false,
        ascii_only: true,
      },
    },
  },
};

/**
 * Service Worker configuration for offline support
 */
export const serviceWorkerConfig = {
  // Cache strategies
  cacheStrategies: {
    // Static assets - cache first
    static: {
      cacheName: 'static-v1',
      expiration: {
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      },
    },
    
    // API responses - network first
    api: {
      cacheName: 'api-v1',
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 minutes
      },
      networkTimeoutSeconds: 3,
    },
    
    // Images - cache first
    images: {
      cacheName: 'images-v1',
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      },
    },
  },
  
  // Offline fallback pages
  offlineFallbacks: {
    page: '/offline',
    image: '/images/offline-placeholder.png',
  },
  
  // Skip waiting and claim clients
  skipWaiting: true,
  clientsClaim: true,
};

/**
 * Performance optimization hooks
 */
export const performanceHooks = {
  // Report Web Vitals
  reportWebVitals: (metric: { name: string; value: number; id: string }) => {
    // Send to analytics
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', metric.name, {
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        event_category: 'Web Vitals',
        event_label: metric.id,
        non_interaction: true,
      });
    }
    
    // Log to structured logger in development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Web Vitals metric reported', {
        metric,
        component: 'PerformanceHooks'
      });
    }
  },
  
  // Custom performance marks
  markPerformance: (name: string) => {
    if (typeof window !== 'undefined' && window.performance) {
      window.performance.mark(name);
    }
  },
  
  // Measure between marks
  measurePerformance: (name: string, startMark: string, endMark: string) => {
    if (typeof window !== 'undefined' && window.performance) {
      window.performance.measure(name, startMark, endMark);
    }
  },
};

// Export performance utilities
export { performanceHooks as hooks };