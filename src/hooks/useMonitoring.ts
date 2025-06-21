// src/hooks/useMonitoring.ts
// React Hook for Performance Monitoring

import { useEffect, useRef, useCallback } from 'react';
import { monitoringService } from '@/lib/monitoring/monitoring-service';
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';

export interface UseMonitoringOptions {
  componentName?: string;
  trackRenders?: boolean;
  trackMounts?: boolean;
  trackInteractions?: boolean;
}

export function useMonitoring(options: UseMonitoringOptions = {}) {
  const {
    componentName = 'UnknownComponent',
    trackRenders = true,
    trackMounts = true,
    trackInteractions = true,
  } = options;

  const renderCountRef = useRef(0);
  const mountTimeRef = useRef<number>();

  // Track component mount
  useEffect(() => {
    if (trackMounts) {
      const mountTime = Date.now();
      mountTimeRef.current = mountTime;
      
      return () => {
        if (mountTimeRef.current) {
          const unmountTime = Date.now() - mountTimeRef.current;
          monitoringService.recordComponentMount(componentName, unmountTime);
        }
      };
    }
    // Return undefined when trackMounts is false
    return undefined;
  }, [componentName, trackMounts]);

  // Track component renders
  useEffect(() => {
    if (trackRenders) {
      renderCountRef.current += 1;
      const renderTime = Date.now();
      monitoringService.recordComponentRender(componentName, renderTime);
    }
  });

  // Interaction tracking helpers
  const trackClick = useCallback((element: string, metadata?: Record<string, string>) => {
    if (trackInteractions) {
      monitoringService.recordUserInteraction('click', element, metadata);
    }
  }, [trackInteractions]);

  const trackInput = useCallback((element: string, metadata?: Record<string, string>) => {
    if (trackInteractions) {
      monitoringService.recordUserInteraction('input', element, metadata);
    }
  }, [trackInteractions]);

  const trackNavigation = useCallback((element: string, metadata?: Record<string, string>) => {
    if (trackInteractions) {
      monitoringService.recordUserInteraction('navigation', element, metadata);
    }
  }, [trackInteractions]);

  // Generic metric recording
  const recordMetric = useCallback((metric: string, value: number, unit: 'ms' | 'bytes' | 'count' | 'percent', metadata?: Record<string, string>) => {
    performanceMonitor.recordCustomMetric(`component_${metric}`, value, unit, {
      component: componentName,
      ...metadata
    });
  }, [componentName]);

  // Error tracking
  const recordError = useCallback((error: Error, context?: string) => {
    monitoringService.recordError(error, `${componentName}:${context || 'unknown'}`);
  }, [componentName]);

  // Timer utility
  const createTimer = useCallback(() => {
    return monitoringService.createTimer();
  }, []);

  return {
    trackClick,
    trackInput,
    trackNavigation,
    recordMetric,
    recordError,
    createTimer,
    renderCount: renderCountRef.current,
  };
}

// Specialized hooks for specific use cases

export function useCampaignMonitoring(campaignId: string) {
  const recordCampaignOperation = useCallback((operation: 'create' | 'start' | 'pause' | 'resume' | 'cancel', duration: number) => {
    monitoringService.recordCampaignOperation(operation, campaignId, duration);
  }, [campaignId]);

  const recordCampaignMetric = useCallback((metric: string, value: number, unit: 'ms' | 'bytes' | 'count' | 'percent') => {
    monitoringService.recordCampaignMetric(campaignId, metric, value, unit);
  }, [campaignId]);

  return {
    recordCampaignOperation,
    recordCampaignMetric,
  };
}

export function useApiMonitoring() {
  const trackApiCall = useCallback(async <T>(
    apiCall: () => Promise<T>,
    url: string,
    method: string
  ): Promise<T> => {
    const startTime = Date.now();
    const requestId = monitoringService.startApiRequest(url, method);
    
    try {
      const result = await apiCall();
      monitoringService.endApiRequest(requestId, url, method, startTime, 200);
      return result;
    } catch (error) {
      monitoringService.recordApiError(url, method, startTime, error as Error);
      throw error;
    }
  }, []);

  return {
    trackApiCall,
  };
}

export function usePerformanceTracking() {
  const recordMemoryUsage = useCallback(() => {
    monitoringService.recordMemoryUsage();
  }, []);

  const recordPageLoad = useCallback((url: string, loadTime: number) => {
    monitoringService.recordPageLoad(url, loadTime);
  }, []);

  return {
    recordMemoryUsage,
    recordPageLoad,
  };
}
