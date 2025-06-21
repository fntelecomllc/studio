// src/lib/hooks/useProxyHealth.ts
// Advanced proxy health monitoring with branded types integration

import { useState, useEffect, useCallback } from 'react';
import { getProxies, testProxy, testAllProxies } from '@/lib/services/proxyService.production';
import type { Proxy, ProxiesListResponse, ProxyActionResponse } from '@/lib/types';
import { UUID, createUUID, safeBigIntToNumber } from '@/lib/types/branded';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/utils/logger';

export interface ProxyHealthMetrics {
  totalProxies: number;
  activeProxies: number;
  failedProxies: number;
  testingProxies: number;
  disabledProxies: number;
  averageResponseTime: number;
  successRate: number;
  lastUpdateTime: Date;
}

export interface ProxyHealthDetails {
  id: UUID;
  address: string;
  status: string;
  latencyMs: number | null;
  lastTested: Date | null;
  successCount: number;
  failureCount: number;
  lastError: string | null;
  isHealthy: boolean;
}

interface UseProxyHealthOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableHealthChecks?: boolean;
  healthCheckInterval?: number;
}

/**
 * Enhanced proxy health monitoring hook with advanced metrics
 */
export function useProxyHealth(options: UseProxyHealthOptions = {}) {
  const {
    autoRefresh = true,
    refreshInterval = 30000, // 30 seconds
    enableHealthChecks = false,
    healthCheckInterval = 300000 // 5 minutes
  } = options;

  const { toast } = useToast();
  
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<ProxyHealthMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [healthCheckInProgress, setHealthCheckInProgress] = useState(false);

  /**
   * Calculate health metrics from proxy data
   */
  const calculateHealthMetrics = useCallback((proxyData: Proxy[]): ProxyHealthMetrics => {
    const totalProxies = proxyData.length;
    const activeProxies = proxyData.filter(p => p.status === 'Active').length;
    const failedProxies = proxyData.filter(p => p.status === 'Failed').length;
    const testingProxies = proxyData.filter(p => p.status === 'Testing').length;
    const disabledProxies = proxyData.filter(p => p.status === 'Disabled').length;

    const proxiesWithLatency = proxyData.filter(p => p.latencyMs && p.latencyMs > 0);
    const averageResponseTime = proxiesWithLatency.length > 0
      ? proxiesWithLatency.reduce((sum, p) => sum + (p.latencyMs || 0), 0) / proxiesWithLatency.length
      : 0;

    const totalTests = proxyData.reduce((sum, p) => {
      const successCount = p.successCount ? safeBigIntToNumber(p.successCount) : 0;
      const failureCount = p.failureCount ? safeBigIntToNumber(p.failureCount) : 0;
      return sum + successCount + failureCount;
    }, 0);
    
    const totalSuccesses = proxyData.reduce((sum, p) => {
      const successCount = p.successCount ? safeBigIntToNumber(p.successCount) : 0;
      return sum + successCount;
    }, 0);
    
    const successRate = totalTests > 0 ? (totalSuccesses / totalTests) * 100 : 0;

    return {
      totalProxies,
      activeProxies,
      failedProxies,
      testingProxies,
      disabledProxies,
      averageResponseTime: Math.round(averageResponseTime),
      successRate: Math.round(successRate * 100) / 100,
      lastUpdateTime: new Date()
    };
  }, []);

  /**
   * Get detailed health information for proxies
   */
  const getProxyHealthDetails = useCallback((): ProxyHealthDetails[] => {
    return proxies.map(proxy => ({
      id: createUUID(proxy.id),
      address: proxy.address,
      status: proxy.status,
      latencyMs: proxy.latencyMs || null,
      lastTested: proxy.lastTested ? new Date(proxy.lastTested) : null,
      successCount: proxy.successCount ? safeBigIntToNumber(proxy.successCount) : 0,
      failureCount: proxy.failureCount ? safeBigIntToNumber(proxy.failureCount) : 0,
      lastError: proxy.lastError || null,
      isHealthy: proxy.status === 'Active' && proxy.isHealthy
    }));
  }, [proxies]);

  /**
   * Fetch proxy data and update metrics
   */
  const fetchProxyData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response: ProxiesListResponse = await getProxies();
      
      if (response.status === 'success' && response.data) {
        setProxies(response.data);
        const metrics = calculateHealthMetrics(response.data);
        setHealthMetrics(metrics);
        setLastRefresh(new Date());
      } else {
        toast({
          title: "Error Loading Proxy Data",
          description: response.message || "Failed to fetch proxy information",
          variant: "destructive"
        });
      }
    } catch (error: unknown) {
      logger.error('Error fetching proxy data', {
        component: 'useProxyHealth',
        error,
        action: 'fetchProxyData'
      });
      toast({
        title: "Network Error",
        description: "Failed to connect to proxy service",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [calculateHealthMetrics, toast]);

  /**
   * Run health checks on all proxies
   */
  const runHealthChecks = useCallback(async () => {
    if (healthCheckInProgress) return;
    
    setHealthCheckInProgress(true);
    
    try {
      const response: ProxyActionResponse = await testAllProxies();
      
      if (response.status === 'success') {
        toast({
          title: "Health Check Complete",
          description: "All proxies have been tested",
          variant: "default"
        });
        
        // Refresh data after health check
        await fetchProxyData(true);
      } else {
        toast({
          title: "Health Check Failed",
          description: response.message || "Failed to run health checks",
          variant: "destructive"
        });
      }
    } catch (error: unknown) {
      logger.error('Error running proxy health checks', {
        component: 'useProxyHealth',
        error,
        action: 'runHealthChecks'
      });
      toast({
        title: "Health Check Error",
        description: "Failed to complete health checks",
        variant: "destructive"
      });
    } finally {
      setHealthCheckInProgress(false);
    }
  }, [healthCheckInProgress, toast, fetchProxyData]);

  /**
   * Test a specific proxy
   */
  const testSpecificProxy = useCallback(async (proxyId: string) => {
    try {
      const response: ProxyActionResponse = await testProxy(proxyId);
      
      if (response.status === 'success' && response.data) {
        // Update the specific proxy in our state
        setProxies(prev => prev.map(p => 
          p.id === proxyId ? response.data! : p
        ));
        
        // Recalculate metrics
        const updatedProxies = proxies.map(p => 
          p.id === proxyId ? response.data! : p
        );
        const metrics = calculateHealthMetrics(updatedProxies);
        setHealthMetrics(metrics);
        
        return response.data;
      } else {
        throw new Error(response.message || 'Test failed');
      }
    } catch (error: unknown) {
      logger.error('Error testing specific proxy', {
        component: 'useProxyHealth',
        proxyId,
        error,
        action: 'testSpecificProxy'
      });
      throw error;
    }
  }, [proxies, calculateHealthMetrics]);

  /**
   * Get unhealthy proxies
   */
  const getUnhealthyProxies = useCallback((): ProxyHealthDetails[] => {
    return getProxyHealthDetails().filter(proxy => !proxy.isHealthy);
  }, [getProxyHealthDetails]);

  /**
   * Get proxy uptime percentage
   */
  const getProxyUptime = useCallback((proxyId: string): number => {
    const proxy = proxies.find(p => p.id === proxyId);
    if (!proxy) return 0;
    
    const successCount = proxy.successCount ? safeBigIntToNumber(proxy.successCount) : 0;
    const failureCount = proxy.failureCount ? safeBigIntToNumber(proxy.failureCount) : 0;
    const totalTests = successCount + failureCount;
    
    if (totalTests === 0) return 100; // Assume 100% if no tests
    
    return Math.round((successCount / totalTests) * 100);
  }, [proxies]);

  // Auto-refresh effect
  useEffect(() => {
    // Initial fetch
    fetchProxyData();

    if (autoRefresh) {
      const refreshTimer = setInterval(() => {
        fetchProxyData(true);
      }, refreshInterval);

      return () => clearInterval(refreshTimer);
    }
    
    return undefined;
  }, [fetchProxyData, autoRefresh, refreshInterval]);

  // Health check effect
  useEffect(() => {
    if (enableHealthChecks) {
      const healthCheckTimer = setInterval(runHealthChecks, healthCheckInterval);
      return () => clearInterval(healthCheckTimer);
    }
    
    return undefined;
  }, [enableHealthChecks, healthCheckInterval, runHealthChecks]);

  return {
    // Data
    proxies,
    healthMetrics,
    lastRefresh,
    
    // Loading states
    isLoading,
    isRefreshing,
    healthCheckInProgress,
    
    // Actions
    refreshData: () => fetchProxyData(true),
    runHealthChecks,
    testSpecificProxy,
    
    // Utilities
    getProxyHealthDetails,
    getUnhealthyProxies,
    getProxyUptime,
    
    // Computed values
    isHealthy: healthMetrics ? healthMetrics.successRate > 80 : true,
    criticalIssues: healthMetrics ? healthMetrics.failedProxies > healthMetrics.totalProxies * 0.5 : false
  };
}
