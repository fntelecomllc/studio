// src/lib/monitoring/monitoring-config.ts
// Configuration for Performance Monitoring System

import type { MonitoringConfig } from './performance-monitor';

// Development environment configuration
const developmentConfig: MonitoringConfig = {
  enabled: true,
  samplingRate: 1.0, // 100% sampling in development
  bufferSize: 10,
  flushInterval: 5000, // 5 seconds
  enabledMetrics: {
    webVitals: true,
    navigation: true,
    resource: true,
    api: true,
    custom: true,
  },
  // No endpoint in development - metrics will be logged to console
};

// Production environment configuration
const productionConfig: MonitoringConfig = {
  enabled: true,
  samplingRate: 0.1, // 10% sampling in production
  bufferSize: 50,
  flushInterval: 30000, // 30 seconds
  enabledMetrics: {
    webVitals: true,
    navigation: true,
    resource: false, // Disable detailed resource monitoring in production
    api: true,
    custom: true,
  },
  endpoint: '/api/v2/monitoring/metrics', // Backend endpoint for metrics collection
};

// Test environment configuration
const testConfig: MonitoringConfig = {
  enabled: false, // Disabled during tests
  samplingRate: 0,
  bufferSize: 0,
  flushInterval: 0,
  enabledMetrics: {
    webVitals: false,
    navigation: false,
    resource: false,
    api: false,
    custom: false,
  },
};

export function getMonitoringConfig(): MonitoringConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return productionConfig;
    case 'test':
      return testConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

// Monitoring feature flags
export const MONITORING_FEATURES = {
  COMPONENT_TRACKING: true,
  API_TRACKING: true,
  USER_INTERACTION_TRACKING: true,
  ERROR_TRACKING: true,
  MEMORY_TRACKING: true,
  CAMPAIGN_TRACKING: true,
} as const;

// Performance thresholds for alerting
export const PERFORMANCE_THRESHOLDS = {
  // Web Vitals thresholds (based on Google recommendations)
  FCP_GOOD: 1800, // First Contentful Paint - Good: <= 1.8s
  FCP_POOR: 3000, // First Contentful Paint - Poor: > 3s
  
  LCP_GOOD: 2500, // Largest Contentful Paint - Good: <= 2.5s
  LCP_POOR: 4000, // Largest Contentful Paint - Poor: > 4s
  
  FID_GOOD: 100, // First Input Delay - Good: <= 100ms
  FID_POOR: 300, // First Input Delay - Poor: > 300ms
  
  CLS_GOOD: 0.1, // Cumulative Layout Shift - Good: <= 0.1
  CLS_POOR: 0.25, // Cumulative Layout Shift - Poor: > 0.25
  
  // API thresholds
  API_RESPONSE_GOOD: 1000, // Good: <= 1s
  API_RESPONSE_POOR: 5000, // Poor: > 5s
  
  // Component thresholds
  COMPONENT_RENDER_GOOD: 16, // Good: <= 16ms (60fps)
  COMPONENT_RENDER_POOR: 100, // Poor: > 100ms
  
  COMPONENT_MOUNT_GOOD: 50, // Good: <= 50ms
  COMPONENT_MOUNT_POOR: 200, // Poor: > 200ms
  
  // Memory thresholds (in bytes)
  MEMORY_USAGE_WARNING: 100 * 1024 * 1024, // 100MB
  MEMORY_USAGE_CRITICAL: 200 * 1024 * 1024, // 200MB
} as const;

// Monitoring labels and tags
export const MONITORING_LABELS = {
  ENVIRONMENT: process.env.NODE_ENV || 'development',
  VERSION: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
  BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID || 'unknown',
} as const;

export default getMonitoringConfig;
