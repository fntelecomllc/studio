// src/lib/hooks/useMemoryMonitoring.tsx
// Development memory monitoring hook to track memory leaks

import React, { useEffect, useRef, useState } from 'react';

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface MemoryMonitoringState {
  currentMemory: MemoryInfo | null;
  memoryHistory: Array<{ timestamp: number; memory: MemoryInfo }>;
  warnings: string[];
  isMonitoring: boolean;
}

export function useMemoryMonitoring(options: {
  enabled?: boolean;
  interval?: number;
  warningThreshold?: number;
  maxHistoryLength?: number;
} = {}) {
  const {
    enabled = process.env.NODE_ENV === 'development',
    interval = 5000,
    warningThreshold = 50 * 1024 * 1024, // 50MB
    maxHistoryLength = 100
  } = options;

  const [state, setState] = useState<MemoryMonitoringState>({
    currentMemory: null,
    memoryHistory: [],
    warnings: [],
    isMonitoring: false
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMemoryRef = useRef<MemoryInfo | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    // Check if performance.memory is available (Chrome-based browsers)
    if (!('performance' in window) || !('memory' in performance)) {
      console.warn('[MemoryMonitoring] performance.memory is not available in this browser');
      return;
    }

    const checkMemory = () => {
      try {
        const performance = window.performance as Performance & {
          memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
          }
        };
        const memory = performance.memory;
        if (!memory) return;
        
        const memoryInfo: MemoryInfo = {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit
        };

        const timestamp = Date.now();
        
        setState(prevState => {
          const newHistory = [
            ...prevState.memoryHistory,
            { timestamp, memory: memoryInfo }
          ].slice(-maxHistoryLength);

          const warnings = [...prevState.warnings];

          // Check for memory growth warning
          if (lastMemoryRef.current) {
            const growth = memoryInfo.usedJSHeapSize - lastMemoryRef.current.usedJSHeapSize;
            if (growth > warningThreshold) {
              const warningMsg = `Memory increased by ${(growth / 1024 / 1024).toFixed(2)}MB in ${interval / 1000}s`;
              warnings.push(`${new Date().toISOString()}: ${warningMsg}`);
              console.warn('[MemoryMonitoring]', warningMsg);
            }
          }

          // Check for high memory usage
          const usagePercent = (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100;
          if (usagePercent > 80) {
            const warningMsg = `High memory usage: ${usagePercent.toFixed(1)}%`;
            if (!warnings.some(w => w.includes('High memory usage'))) {
              warnings.push(`${new Date().toISOString()}: ${warningMsg}`);
              console.warn('[MemoryMonitoring]', warningMsg);
            }
          }

          lastMemoryRef.current = memoryInfo;

          return {
            currentMemory: memoryInfo,
            memoryHistory: newHistory,
            warnings: warnings.slice(-50), // Keep last 50 warnings
            isMonitoring: true
          };
        });
      } catch {
        console.error('[MemoryMonitoring] Error checking memory:', error);
      }
    };

    // Initial check
    checkMemory();

    // Set up interval
    intervalRef.current = setInterval(checkMemory, interval);

    setState(prev => ({ ...prev, isMonitoring: true }));

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setState(prev => ({ ...prev, isMonitoring: false }));
    };
  }, [enabled, interval, warningThreshold, maxHistoryLength]);

  const clearWarnings = () => {
    setState(prev => ({ ...prev, warnings: [] }));
  };

  const getMemoryStats = () => {
    if (!state.currentMemory) return null;

    const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = state.currentMemory;
    
    return {
      used: usedJSHeapSize,
      total: totalJSHeapSize,
      limit: jsHeapSizeLimit,
      usedMB: (usedJSHeapSize / 1024 / 1024).toFixed(2),
      totalMB: (totalJSHeapSize / 1024 / 1024).toFixed(2),
      limitMB: (jsHeapSizeLimit / 1024 / 1024).toFixed(2),
      usagePercent: ((usedJSHeapSize / jsHeapSizeLimit) * 100).toFixed(1)
    };
  };

  const getMemoryTrend = () => {
    if (state.memoryHistory.length < 2) return null;

    const recent = state.memoryHistory.slice(-10);
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    if (!first || !last) return null;
    
    const timeDiff = (last.timestamp - first.timestamp) / 1000; // seconds
    const memoryDiff = last.memory.usedJSHeapSize - first.memory.usedJSHeapSize;
    const trendMBPerSecond = (memoryDiff / 1024 / 1024) / timeDiff;

    return {
      mbPerSecond: trendMBPerSecond.toFixed(3),
      direction: memoryDiff > 0 ? 'increasing' : memoryDiff < 0 ? 'decreasing' : 'stable',
      totalGrowthMB: (memoryDiff / 1024 / 1024).toFixed(2)
    };
  };

  return {
    ...state,
    stats: getMemoryStats(),
    trend: getMemoryTrend(),
    clearWarnings
  };
}

// Memory monitoring component for development
export function MemoryMonitor({
  position = 'top-right',
  style = {}
}: {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  style?: React.CSSProperties;
}): JSX.Element | null {
  const monitoring = useMemoryMonitoring();
  
  if (!monitoring.isMonitoring || process.env.NODE_ENV !== 'development') {
    return null;
  }

  const positionStyles = {
    'top-left': { top: 10, left: 10 },
    'top-right': { top: 10, right: 10 },
    'bottom-left': { bottom: 10, left: 10 },
    'bottom-right': { bottom: 10, right: 10 }
  };

  return (
    <div style={{
      position: 'fixed',
      ...positionStyles[position],
      background: 'rgba(0,0,0,0.9)',
      color: '#00ff00',
      padding: '8px',
      borderRadius: '4px',
      fontSize: '11px',
      fontFamily: 'monospace',
      zIndex: 9999,
      minWidth: '200px',
      ...style
    }}>
      <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>Memory Monitor</div>
      {monitoring.stats && (
        <>
          <div>Used: {monitoring.stats.usedMB}MB ({monitoring.stats.usagePercent}%)</div>
          <div>Total: {monitoring.stats.totalMB}MB</div>
          <div>Limit: {monitoring.stats.limitMB}MB</div>
        </>
      )}
      {monitoring.trend && (
        <div style={{ color: monitoring.trend.direction === 'increasing' ? '#ff6b6b' : '#4ecdc4' }}>
          Trend: {monitoring.trend.direction} ({monitoring.trend.mbPerSecond}MB/s)
        </div>
      )}
      {monitoring.warnings.length > 0 && (
        <div style={{ marginTop: '4px', color: '#ff6b6b' }}>
          Warnings: {monitoring.warnings.length}
          <button 
            onClick={monitoring.clearWarnings}
            style={{ 
              marginLeft: '8px', 
              background: 'transparent', 
              border: '1px solid #ff6b6b', 
              color: '#ff6b6b',
              fontSize: '10px',
              padding: '2px 4px',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}