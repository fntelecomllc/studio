// src/components/proxies/ProxyTesting.tsx
// Advanced proxy testing functionality with health monitoring

"use client";

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  TestTubeDiagonal, 
  PlayCircle, 
  StopCircle, 
  CheckCircle, 
  XCircle, 
  Clock,
  Wifi,
  TrendingUp,
  TrendingDown,
  Activity,
  Loader2
} from 'lucide-react';
import type { Proxy, ProxyActionResponse } from '@/lib/types';
import { testProxy } from '@/lib/services/proxyService.production';
import { useToast } from '@/hooks/use-toast';
import { useProxyHealth } from '@/lib/hooks/useProxyHealth';
import { safeBigIntToNumber } from '@/lib/types/branded';

export interface ProxyTestingProps {
  proxies: Proxy[];
  onProxiesUpdate: () => void;
  disabled?: boolean;
}

interface TestResult {
  proxyId: string;
  success: boolean;
  responseTime: number | null;
  error?: string;
  timestamp: Date;
}

interface TestSession {
  id: string;
  startTime: Date;
  endTime?: Date;
  totalProxies: number;
  completedTests: number;
  successfulTests: number;
  failedTests: number;
  results: TestResult[];
  isRunning: boolean;
}

export function ProxyTesting({ proxies, onProxiesUpdate, disabled = false }: ProxyTestingProps): React.ReactElement {
  const { toast } = useToast();
  const { 
    healthMetrics, 
    runHealthChecks,
    healthCheckInProgress 
  } = useProxyHealth({ 
    autoRefresh: true, 
    refreshInterval: 10000,
    enableHealthChecks: false 
  });

  const [currentSession, setCurrentSession] = useState<TestSession | null>(null);
  const [testUrl, setTestUrl] = useState('https://httpbin.org/ip');
  const [testTimeout, setTestTimeout] = useState(10);
  const [parallelTests, setParallelTests] = useState(3);
  const [continuousMode, setContinuousMode] = useState(false);
  const [testInterval, setTestInterval] = useState(60);
  const [selectedProxyIds, setSelectedProxyIds] = useState<Set<string>>(new Set());

  /**
   * Start testing selected proxies or all proxies
   */
  const handleStartTesting = useCallback(async (): Promise<void> => {
    const proxiesToTest = selectedProxyIds.size > 0 
      ? proxies.filter(p => selectedProxyIds.has(p.id))
      : proxies;

    if (proxiesToTest.length === 0) {
      toast({
        title: "No Proxies to Test",
        description: "Please ensure you have proxies configured.",
        variant: "destructive"
      });
      return;
    }

    const sessionId = `test-${Date.now()}`;
    const newSession: TestSession = {
      id: sessionId,
      startTime: new Date(),
      totalProxies: proxiesToTest.length,
      completedTests: 0,
      successfulTests: 0,
      failedTests: 0,
      results: [],
      isRunning: true
    };

    setCurrentSession(newSession);

    try {
      // Run tests in parallel batches
      const batches = [];
      for (let i = 0; i < proxiesToTest.length; i += parallelTests) {
        batches.push(proxiesToTest.slice(i, i + parallelTests));
      }

      for (const batch of batches) {
        const batchPromises = batch.map(proxy => testSingleProxy(proxy, sessionId));
        await Promise.allSettled(batchPromises);
        
        // Check if session was cancelled
        if (currentSession === null || currentSession === undefined || currentSession.isRunning === false) break;
      }

      // Complete session
      setCurrentSession(prev => prev !== null ? {
        ...prev,
        endTime: new Date(),
        isRunning: false
      } : null);

      toast({
        title: "Testing Complete",
        description: `Tested ${newSession.totalProxies} proxies. ${newSession.successfulTests} successful, ${newSession.failedTests} failed.`,
        variant: newSession.failedTests === 0 ? "default" : "destructive"
      });

      // Refresh proxy data
      onProxiesUpdate();

    } catch (error) {
      console.error('Testing session failed:', error);
      toast({
        title: "Testing Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
      
      setCurrentSession(prev => prev !== null ? {
        ...prev,
        endTime: new Date(),
        isRunning: false
      } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proxies, selectedProxyIds, parallelTests, currentSession?.isRunning, toast, onProxiesUpdate]);

  /**
   * Test a single proxy
   */
  const testSingleProxy = useCallback(async (proxy: Proxy, sessionId: string): Promise<void> => {
    const startTime = Date.now();
    
    try {
      const response: ProxyActionResponse = await testProxy(proxy.id);
      const responseTime = Date.now() - startTime;
      
      const result: TestResult = {
        proxyId: proxy.id,
        success: response.status === 'success',
        responseTime,
        error: response.status !== 'success' ? response.message : undefined,
        timestamp: new Date()
      };

      // Update session
      setCurrentSession(prev => {
        if (prev === null || prev.id !== sessionId) return prev;
        
        return {
          ...prev,
          completedTests: prev.completedTests + 1,
          successfulTests: prev.successfulTests + (result.success ? 1 : 0),
          failedTests: prev.failedTests + (result.success ? 0 : 1),
          results: [...prev.results, result]
        };
      });

    } catch (error) {
      const result: TestResult = {
        proxyId: proxy.id,
        success: false,
        responseTime: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };

      setCurrentSession(prev => {
        if (prev === null || prev.id !== sessionId) return prev;
        
        return {
          ...prev,
          completedTests: prev.completedTests + 1,
          failedTests: prev.failedTests + 1,
          results: [...prev.results, result]
        };
      });
    }
  }, []);

  /**
   * Stop current testing session
   */
  const handleStopTesting = useCallback((): void => {
    setCurrentSession(prev => prev !== null ? {
      ...prev,
      endTime: new Date(),
      isRunning: false
    } : null);
    
    toast({
      title: "Testing Stopped",
      description: "Current testing session has been cancelled.",
      variant: "default"
    });
  }, [toast]);

  /**
   * Toggle proxy selection
   */
  const toggleProxySelection = useCallback((proxyId: string): void => {
    setSelectedProxyIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(proxyId)) {
        newSet.delete(proxyId);
      } else {
        newSet.add(proxyId);
      }
      return newSet;
    });
  }, []);

  /**
   * Select all/none proxies
   */
  const toggleSelectAll = useCallback((): void => {
    if (selectedProxyIds.size === proxies.length) {
      setSelectedProxyIds(new Set());
    } else {
      setSelectedProxyIds(new Set(proxies.map(p => p.id)));
    }
  }, [selectedProxyIds.size, proxies]);

  const progressPercentage = currentSession !== null
    ? Math.round((currentSession.completedTests / currentSession.totalProxies) * 100)
    : 0;

  const averageResponseTime = currentSession?.results !== undefined && currentSession.results.length > 0
    ? currentSession.results
        .filter(r => r.responseTime !== null)
        .reduce((sum, r) => sum + (r.responseTime !== null ? r.responseTime : 0), 0) /
        Math.max(1, currentSession.results.filter(r => r.responseTime !== null).length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Testing Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTubeDiagonal className="h-5 w-5 text-primary" />
            Proxy Testing Configuration
          </CardTitle>
          <CardDescription>
            Configure and run comprehensive proxy tests with health monitoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="test-url">Test URL</Label>
              <Input
                id="test-url"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://httpbin.org/ip"
                disabled={disabled !== false || currentSession?.isRunning !== false}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="test-timeout">Timeout (seconds)</Label>
              <Input
                id="test-timeout"
                type="number"
                value={testTimeout}
                onChange={(e) => setTestTimeout(Number(e.target.value))}
                min={1}
                max={60}
                disabled={disabled !== false || currentSession?.isRunning !== false}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="parallel-tests">Parallel Tests</Label>
              <Select
                value={parallelTests.toString()}
                onValueChange={(value) => setParallelTests(Number(value))}
                disabled={disabled !== false || currentSession?.isRunning !== false}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 (Sequential)</SelectItem>
                  <SelectItem value="3">3 (Recommended)</SelectItem>
                  <SelectItem value="5">5 (Fast)</SelectItem>
                  <SelectItem value="10">10 (Very Fast)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="test-interval">Continuous Interval (seconds)</Label>
              <Input
                id="test-interval"
                type="number"
                value={testInterval}
                onChange={(e) => setTestInterval(Number(e.target.value))}
                min={30}
                max={3600}
                disabled={disabled !== false || continuousMode !== true}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              checked={continuousMode}
              onCheckedChange={setContinuousMode}
              disabled={disabled !== false || currentSession?.isRunning !== false}
            />
            <Label>Continuous Testing Mode</Label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => { void handleStartTesting(); }}
              disabled={disabled !== false || currentSession?.isRunning !== false}
              className="flex-1"
            >
              {currentSession?.isRunning !== false ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Start Testing
                </>
              )}
            </Button>
            
            {currentSession?.isRunning !== false && (
              <Button
                variant="destructive"
                onClick={handleStopTesting}
              >
                <StopCircle className="h-4 w-4 mr-2" />
                Stop
              </Button>
            )}
            
            <Button
              variant="outline"
              onClick={() => { void runHealthChecks(); }}
              disabled={disabled !== false || healthCheckInProgress !== false}
            >
              {healthCheckInProgress !== false ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Health Check
                </>
              ) : (
                <>
                  <Activity className="h-4 w-4 mr-2" />
                  Health Check
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Testing Progress */}
      {currentSession !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Testing Progress
              </span>
              <Badge variant={currentSession.isRunning !== false ? "default" : "secondary"}>
                {currentSession.isRunning !== false ? "Running" : "Completed"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progressPercentage} className="w-full" />
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{currentSession.completedTests}</div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{currentSession.successfulTests}</div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{currentSession.failedTests}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{Math.round(averageResponseTime)}ms</div>
                <div className="text-sm text-muted-foreground">Avg Response</div>
              </div>
            </div>
            
            {currentSession.results.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium">Recent Results</h4>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {currentSession.results
                    .slice(-10)
                    .reverse()
                    .map((result, index) => {
                      const proxy = proxies.find(p => p.id === result.proxyId);
                      return (
                        <div
                          key={`${result.proxyId}-${index}`}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                        >
                          <span className="flex items-center gap-2">
                            {result.success ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            {(proxy?.address !== undefined && proxy.address !== null) ? proxy.address : result.proxyId}
                          </span>
                          <span className="text-muted-foreground">
                            {(result.responseTime !== null && result.responseTime !== undefined) ? `${result.responseTime}ms` : 'Failed'}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Health Metrics */}
      {healthMetrics !== null && healthMetrics !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Health Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{healthMetrics.totalProxies}</div>
                <div className="text-sm text-muted-foreground">Total Proxies</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{healthMetrics.activeProxies}</div>
                <div className="text-sm text-muted-foreground">Active</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{healthMetrics.successRate}%</div>
                <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  {healthMetrics.successRate >= 80 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                  Success Rate
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{healthMetrics.averageResponseTime}ms</div>
                <div className="text-sm text-muted-foreground">Avg Response</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Proxy Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              Proxy Selection
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              disabled={disabled !== false || proxies.length === 0}
            >
              {selectedProxyIds.size === proxies.length ? 'Deselect All' : 'Select All'}
            </Button>
          </CardTitle>
          <CardDescription>
            Select specific proxies to test, or leave empty to test all proxies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {proxies.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No proxies configured</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {proxies.map(proxy => (
                <div
                  key={proxy.id}
                  className={`flex items-center space-x-2 p-2 rounded border cursor-pointer hover:bg-muted/50 ${
                    selectedProxyIds.has(proxy.id) !== false ? 'bg-primary/10 border-primary' : ''
                  }`}
                  onClick={() => toggleProxySelection(proxy.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{proxy.address}</p>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant={proxy.status === 'Active' ? 'default' : 
                                proxy.status === 'Failed' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {proxy.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {proxy.protocol}
                      </Badge>
                      {proxy.successCount !== undefined && proxy.successCount !== null && proxy.failureCount !== undefined && proxy.failureCount !== null && (
                        <span className="text-xs text-muted-foreground">
                          {safeBigIntToNumber(proxy.successCount)}/{safeBigIntToNumber(proxy.failureCount)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
