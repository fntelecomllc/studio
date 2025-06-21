/**
 * Metrics Dashboard Component
 * Displays real-time performance and error metrics with alerting integration
 *
 * Features:
 * - Real-time performance metrics (Web Vitals, API response times, resource loading)
 * - Error tracking and critical error detection
 * - Active alerts with severity indicators
 * - Alert history and acknowledgment
 * - Automatic threshold monitoring
 * - Visual indicators for metric health status
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { performanceMonitor, PerformanceReport } from '@/lib/monitoring/performance-monitor';
import { errorTracker, ErrorReport, ErrorMetrics } from '@/lib/monitoring/error-tracker';
import { alertingService, Alert as SystemAlert, AlertSeverity } from '@/lib/monitoring/alerting';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, AlertCircle, Clock, Cpu, Globe, RefreshCw, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

interface MetricsChartData {
  timestamp: string;
  value: number;
  label: string;
}

export function MetricsDashboard(): React.ReactElement {
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceReport[]>([]);
  const [errorMetrics, setErrorMetrics] = useState<ErrorMetrics | null>(null);
  const [recentErrors, setRecentErrors] = useState<ErrorReport[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<SystemAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<SystemAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showAlertBanner, setShowAlertBanner] = useState(true);
  const [webVitals, setWebVitals] = useState({
    fcp: 0,
    lcp: 0,
    fid: 0,
    cls: 0,
    ttfb: 0
  });

  const refreshMetrics = useCallback((): void => {
    setIsLoading(true);
    
    // Get performance metrics
    const perfReports = performanceMonitor.getMetrics();
    setPerformanceMetrics(perfReports);
    
    // Calculate web vitals
    const vitals = {
      fcp: 0,
      lcp: 0,
      fid: 0,
      cls: 0,
      ttfb: 0
    };
    
    perfReports.forEach(report => {
      report.metrics.forEach(metric => {
        if (metric.name === 'web_vitals_fcp') vitals.fcp = metric.value;
        if (metric.name === 'web_vitals_lcp') vitals.lcp = metric.value;
        if (metric.name === 'web_vitals_fid') vitals.fid = metric.value;
        if (metric.name === 'web_vitals_cls') vitals.cls = metric.value;
        if (metric.name === 'navigation_ttfb') vitals.ttfb = metric.value;
      });
    });
    
    setWebVitals(vitals);
    
    // Get error metrics
    const errMetrics = errorTracker.getMetrics();
    setErrorMetrics(errMetrics);
    
    const errors = errorTracker.getRecentErrors(10);
    setRecentErrors(errors);
    
    // Get alerting data
    const alerts = alertingService.getActiveAlerts();
    setActiveAlerts(alerts);
    
    const history = alertingService.getAlertHistory(20);
    setAlertHistory(history);
    
    setLastUpdate(new Date());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshMetrics();
    
    // Start alerting service if not already running
    alertingService.startMonitoring(10000); // Check every 10 seconds
    
    // Subscribe to alerts
    const unsubscribe = alertingService.onAlert((alert) => {
      // Refresh metrics when new alert is triggered
      refreshMetrics();
      
      // Show notification for critical alerts
      if (alert.severity === 'critical' && alert.status === 'active') {
        // In a real app, this could trigger a browser notification
        console.error(`Critical Alert: ${alert.name}`, alert.description);
      }
    });
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshMetrics, 30000);
    
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refreshMetrics]);

  // Prepare chart data for API calls
  const apiMetricsData: MetricsChartData[] = performanceMetrics
    .flatMap(report => 
      report.metrics
        .filter(m => m.tags?.type === 'api')
        .map(m => ({
          timestamp: new Date(m.timestamp).toLocaleTimeString(),
          value: m.value,
          label: (m.tags?.url !== null && m.tags?.url !== undefined && m.tags.url !== '') ? m.tags.url : 'Unknown'
        }))
    )
    .slice(-20); // Last 20 API calls

  // Prepare chart data for resource loading
  const resourceMetricsData: MetricsChartData[] = performanceMetrics
    .flatMap(report => 
      report.metrics
        .filter(m => m.name === 'resource_load_time')
        .map(m => ({
          timestamp: new Date(m.timestamp).toLocaleTimeString(),
          value: m.value,
          label: (m.tags?.resource_type !== null && m.tags?.resource_type !== undefined && m.tags.resource_type !== '') ? m.tags.resource_type : 'Unknown'
        }))
    )
    .slice(-20);

  const getVitalStatus = (metric: string, value: number): 'good' | 'warning' | 'poor' => {
    const thresholds: Record<string, { good: number; poor: number }> = {
      fcp: { good: 1800, poor: 3000 },
      lcp: { good: 2500, poor: 4000 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 },
      ttfb: { good: 800, poor: 1800 }
    };
    
    const threshold = thresholds[metric];
    if (threshold === undefined) return 'good';
    
    if (value <= threshold.good) return 'good';
    if (value >= threshold.poor) return 'poor';
    return 'warning';
  };

  const getStatusColor = (status: 'good' | 'warning' | 'poor'): string => {
    switch (status) {
      case 'good': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
    }
  };

  const getSeverityIcon = (severity: AlertSeverity): React.ReactElement => {
    switch (severity) {
      case 'critical':
        return <XCircle className="h-4 w-4" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4" />;
      case 'info':
        return <Info className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: AlertSeverity): 'default' | 'destructive' => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'warning':
        return 'default';
      case 'info':
        return 'default'; // Use 'default' instead of 'secondary' for info
    }
  };

  const acknowledgeAlert = (alertId: string): void => {
    alertingService.acknowledgeAlert(alertId);
    refreshMetrics();
  };

  // Check for critical alerts
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical' && a.status === 'active');

  return (
    <div className="space-y-4">
      {/* Critical Alert Banner */}
      {(criticalAlerts.length > 0 && showAlertBanner === true) && (
        <Alert variant="destructive" className="mb-4">
          <XCircle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            <span>{criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''} Active</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAlertBanner(false)}
              className="h-6 px-2"
            >
              Dismiss
            </Button>
          </AlertTitle>
          <AlertDescription>
            {criticalAlerts.map(alert => (
              <div key={alert.id} className="mt-1">
                • {alert.name}: {alert.description}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Performance & Error Monitoring</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </Badge>
          <Button
            size="sm"
            onClick={refreshMetrics}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading === true ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="api">API Metrics</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-2">
            Alerts
            {activeAlerts.length > 0 && (
              <Badge variant={criticalAlerts.length > 0 ? "destructive" : "default"} className="ml-1">
                {activeAlerts.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  First Contentful Paint (FCP)
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getStatusColor(getVitalStatus('fcp', webVitals.fcp))}>
                    {webVitals.fcp.toFixed(0)}ms
                  </span>
                </div>
                <Progress 
                  value={Math.min((webVitals.fcp / 3000) * 100, 100)} 
                  className="h-2 mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Largest Contentful Paint (LCP)
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getStatusColor(getVitalStatus('lcp', webVitals.lcp))}>
                    {webVitals.lcp.toFixed(0)}ms
                  </span>
                </div>
                <Progress 
                  value={Math.min((webVitals.lcp / 4000) * 100, 100)} 
                  className="h-2 mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  First Input Delay (FID)
                </CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getStatusColor(getVitalStatus('fid', webVitals.fid))}>
                    {webVitals.fid.toFixed(0)}ms
                  </span>
                </div>
                <Progress 
                  value={Math.min((webVitals.fid / 300) * 100, 100)} 
                  className="h-2 mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Cumulative Layout Shift (CLS)
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getStatusColor(getVitalStatus('cls', webVitals.cls))}>
                    {webVitals.cls.toFixed(3)}
                  </span>
                </div>
                <Progress 
                  value={Math.min((webVitals.cls / 0.25) * 100, 100)} 
                  className="h-2 mt-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Time to First Byte (TTFB)
                </CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getStatusColor(getVitalStatus('ttfb', webVitals.ttfb))}>
                    {webVitals.ttfb.toFixed(0)}ms
                  </span>
                </div>
                <Progress 
                  value={Math.min((webVitals.ttfb / 1800) * 100, 100)} 
                  className="h-2 mt-2"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          {errorMetrics !== null && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Errors</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{errorMetrics.totalErrors}</div>
                  <p className="text-xs text-muted-foreground">
                    {errorMetrics.errorRate} errors/min
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Critical Errors</CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {errorMetrics.criticalErrors}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {((errorMetrics.criticalErrors / Math.max(errorMetrics.totalErrors, 1)) * 100).toFixed(0)}% of total
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
              <CardDescription>Last 10 errors tracked</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentErrors.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No errors</AlertTitle>
                    <AlertDescription>
                      No errors have been tracked recently.
                    </AlertDescription>
                  </Alert>
                ) : (
                  recentErrors.map((error, index) => (
                    <Alert key={index} variant={error.errorType === 'ApiError' ? 'destructive' : 'default'}>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="flex items-center justify-between">
                        <span>{error.errorType}</span>
                        <Badge variant="outline">
                          {error.count} occurrence{error.count > 1 ? 's' : ''}
                        </Badge>
                      </AlertTitle>
                      <AlertDescription>
                        <p className="font-mono text-sm">{error.message}</p>
                        {error.context.url !== undefined && (
                          <p className="text-xs text-muted-foreground mt-1">
                            URL: {error.context.url}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Last seen: {new Date(error.lastSeen).toLocaleTimeString()}
                        </p>
                      </AlertDescription>
                    </Alert>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Call Performance</CardTitle>
              <CardDescription>Response times for recent API calls</CardDescription>
            </CardHeader>
            <CardContent>
              {apiMetricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={apiMetricsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#8884d8" 
                      name="Response Time (ms)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No API metrics</AlertTitle>
                  <AlertDescription>
                    No API call metrics have been recorded yet.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resource Loading Times</CardTitle>
              <CardDescription>Load times for different resource types</CardDescription>
            </CardHeader>
            <CardContent>
              {resourceMetricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={resourceMetricsData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#82ca9d" name="Load Time (ms)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No resource metrics</AlertTitle>
                  <AlertDescription>
                    No resource loading metrics have been recorded yet.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          {/* Active Alerts */}
          <Card>
            <CardHeader>
              <CardTitle>Active Alerts</CardTitle>
              <CardDescription>Currently triggered alerts requiring attention</CardDescription>
            </CardHeader>
            <CardContent>
              {activeAlerts.length === 0 ? (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle>All Clear</AlertTitle>
                  <AlertDescription>
                    No active alerts. All metrics are within defined thresholds.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {activeAlerts.map((alert) => (
                    <Alert key={alert.id} variant={getSeverityColor(alert.severity)}>
                      {getSeverityIcon(alert.severity)}
                      <AlertTitle className="flex items-center justify-between">
                        <span>{alert.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {alert.metric}: {alert.value.toFixed(2)} {alert.value > alert.threshold ? '>' : '<'} {alert.threshold}
                          </Badge>
                          {alert.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acknowledgeAlert(alert.id)}
                            >
                              Acknowledge
                            </Button>
                          )}
                          {alert.status === 'acknowledged' && (
                            <Badge variant="secondary">Acknowledged</Badge>
                          )}
                        </div>
                      </AlertTitle>
                      <AlertDescription>
                        <p>{alert.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Triggered: {new Date(alert.triggeredAt).toLocaleString()}
                        </p>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alert History */}
          <Card>
            <CardHeader>
              <CardTitle>Alert History</CardTitle>
              <CardDescription>Recent alert activity</CardDescription>
            </CardHeader>
            <CardContent>
              {alertHistory.length === 0 ? (
                <p className="text-muted-foreground">No alert history available.</p>
              ) : (
                <div className="space-y-2">
                  {alertHistory.map((alert) => (
                    <div key={alert.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(alert.severity)}
                        <div>
                          <p className="font-medium">{alert.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(alert.triggeredAt).toLocaleString()}
                            {alert.resolvedAt !== undefined && (
                              <span> - Resolved: {new Date(alert.resolvedAt).toLocaleString()}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Badge variant={alert.status === 'resolved' ? 'secondary' : getSeverityColor(alert.severity)}>
                        {alert.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Alert Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Alert Thresholds</CardTitle>
              <CardDescription>Configured monitoring thresholds</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {alertingService.exportThresholds().map((threshold) => (
                  <div key={threshold.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="font-medium">{threshold.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {threshold.metric} {threshold.condition} {threshold.value}
                      </p>
                    </div>
                    <Badge variant={getSeverityColor(threshold.severity)}>
                      {threshold.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}