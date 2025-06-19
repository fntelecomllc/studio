// src/components/providers/MonitoringProvider.tsx
// Provider Component for Performance Monitoring Initialization

'use client';

import React, { useEffect, createContext, useContext, ReactNode } from 'react';
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';
import { monitoringService, type MonitoringHooks } from '@/lib/monitoring/monitoring-service';
import { getMonitoringConfig, MONITORING_FEATURES } from '@/lib/monitoring/monitoring-config';

interface MonitoringContextValue {
  isEnabled: boolean;
  recordMetric: (name: string, value: number, unit: 'ms' | 'bytes' | 'count' | 'percent') => void;
  recordError: (error: Error, context?: string) => void;
  recordUserInteraction: (type: 'click' | 'input' | 'scroll' | 'navigation', element: string) => void;
}

const MonitoringContext = createContext<MonitoringContextValue | null>(null);

interface MonitoringProviderProps {
  children: ReactNode;
  customHooks?: MonitoringHooks;
  enableConsoleLogging?: boolean;
}

export function MonitoringProvider({ 
  children, 
  customHooks = {},
  enableConsoleLogging = false 
}: MonitoringProviderProps) {
  useEffect(() => {
    const config = getMonitoringConfig();
    
    if (!config.enabled) {
      return undefined;
    }

    // Initialize performance monitor with config
    const _monitor = performanceMonitor;
    
    // Set up monitoring hooks
    const hooks: MonitoringHooks = {
      onApiRequest: (url, method) => {
        if (enableConsoleLogging) {
          console.log(`[Monitoring] API Request: ${method} ${url}`);
        }
      },
      onApiResponse: (url, method, duration, status) => {
        if (enableConsoleLogging) {
          console.log(`[Monitoring] API Response: ${method} ${url} - ${duration}ms (${status})`);
        }
      },
      onApiError: (url, method, duration, error) => {
        if (enableConsoleLogging) {
          console.error(`[Monitoring] API Error: ${method} ${url} - ${duration}ms`, error);
        }
      },
      onPageLoad: (url, loadTime) => {
        if (enableConsoleLogging) {
          console.log(`[Monitoring] Page Load: ${url} - ${loadTime}ms`);
        }
      },
      onUserInteraction: (type, element) => {
        if (enableConsoleLogging) {
          console.log(`[Monitoring] User Interaction: ${type} on ${element}`);
        }
      },
      onError: (error, context) => {
        if (enableConsoleLogging) {
          console.error(`[Monitoring] Error in ${context}:`, error);
        }
      },
      ...customHooks,
    };
    
    monitoringService.setHooks(hooks);

    // Record initial page load
    if (MONITORING_FEATURES.API_TRACKING) {
      const loadTime = window.performance.timing?.loadEventEnd - window.performance.timing?.navigationStart;
      if (loadTime > 0) {
        monitoringService.recordPageLoad(window.location.href, loadTime);
      }
    }

    // Set up periodic memory monitoring
    if (MONITORING_FEATURES.MEMORY_TRACKING) {
      const memoryInterval = setInterval(() => {
        monitoringService.recordMemoryUsage();
      }, 30000); // Every 30 seconds

      return () => {
        clearInterval(memoryInterval);
      };
    }

    return undefined;
  }, [customHooks, enableConsoleLogging]);

  const contextValue: MonitoringContextValue = {
    isEnabled: getMonitoringConfig().enabled && MONITORING_FEATURES.COMPONENT_TRACKING,
    recordMetric: (name: string, value: number, unit: 'ms' | 'bytes' | 'count' | 'percent') => {
      performanceMonitor.recordCustomMetric(name, value, unit);
    },
    recordError: (error: Error, context?: string) => {
      monitoringService.recordError(error, context);
    },
    recordUserInteraction: (type: 'click' | 'input' | 'scroll' | 'navigation', element: string) => {
      monitoringService.recordUserInteraction(type, element);
    },
  };

  return (
    <MonitoringContext.Provider value={contextValue}>
      {children}
    </MonitoringContext.Provider>
  );
}

export function useMonitoringContext(): MonitoringContextValue {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error('useMonitoringContext must be used within a MonitoringProvider');
  }
  return context;
}

// HOC for automatic component monitoring
export function withMonitoring<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const name = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Unknown';
  
  const MonitoredComponent = (props: P) => {
    const { isEnabled, recordMetric } = useMonitoringContext();
    
    useEffect(() => {
      if (isEnabled) {
        const mountTime = Date.now();
        recordMetric(`component_mount_${name}`, mountTime, 'ms');
        
        return () => {
          const unmountTime = Date.now();
          recordMetric(`component_unmount_${name}`, unmountTime, 'ms');
        };
      }
      return undefined;
    }, [isEnabled, recordMetric]);

    return <WrappedComponent {...props} />;
  };
  
  MonitoredComponent.displayName = `withMonitoring(${name})`;
  return MonitoredComponent;
}

export default MonitoringProvider;
