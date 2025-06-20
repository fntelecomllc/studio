/**
 * Alerting System
 * Monitors metrics and triggers alerts when thresholds are exceeded
 */

import { performanceMonitor, PerformanceMetric } from './performance-monitor';
import { errorTracker } from './error-tracker';

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'resolved' | 'acknowledged';

export interface AlertThreshold {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
  severity: AlertSeverity;
  duration?: number; // Duration in ms the condition must be true
  cooldown?: number; // Cooldown period in ms before re-alerting
  tags?: Record<string, string>; // Filter metrics by tags
}

export interface Alert {
  id: string;
  thresholdId: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  triggeredAt: number;
  resolvedAt?: number;
  acknowledgedAt?: number;
  value: number;
  threshold: number;
  metric: string;
  tags?: Record<string, string>;
}

export type AlertHandler = (alert: Alert) => void | Promise<void>;

class AlertingService {
  private thresholds: Map<string, AlertThreshold> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private handlers: Set<AlertHandler> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;
  private lastAlertTime: Map<string, number> = new Map();

  constructor() {
    this.setupDefaultThresholds();
  }

  /**
   * Set up default alerting thresholds for critical metrics
   */
  private setupDefaultThresholds() {
    // Performance thresholds
    this.addThreshold({
      id: 'high_api_response_time',
      name: 'High API Response Time',
      description: 'API response time exceeds 5 seconds',
      metric: 'api_call_duration',
      condition: 'gt',
      value: 5000,
      severity: 'critical',
      duration: 60000, // 1 minute
      cooldown: 300000 // 5 minutes
    });

    this.addThreshold({
      id: 'slow_page_load',
      name: 'Slow Page Load',
      description: 'Page load time exceeds 3 seconds',
      metric: 'navigation_load_time',
      condition: 'gt',
      value: 3000,
      severity: 'warning',
      duration: 30000,
      cooldown: 180000
    });

    // Web Vitals thresholds
    this.addThreshold({
      id: 'poor_lcp',
      name: 'Poor Largest Contentful Paint',
      description: 'LCP exceeds 4 seconds (poor user experience)',
      metric: 'web_vitals_lcp',
      condition: 'gt',
      value: 4000,
      severity: 'warning',
      cooldown: 600000
    });

    this.addThreshold({
      id: 'poor_fid',
      name: 'Poor First Input Delay',
      description: 'FID exceeds 300ms (poor interactivity)',
      metric: 'web_vitals_fid',
      condition: 'gt',
      value: 300,
      severity: 'warning',
      cooldown: 600000
    });

    this.addThreshold({
      id: 'poor_cls',
      name: 'Poor Cumulative Layout Shift',
      description: 'CLS exceeds 0.25 (poor visual stability)',
      metric: 'web_vitals_cls',
      condition: 'gt',
      value: 0.25,
      severity: 'warning',
      cooldown: 600000
    });

    // Error thresholds
    this.addThreshold({
      id: 'high_error_rate',
      name: 'High Error Rate',
      description: 'Error rate exceeds 10 errors per minute',
      metric: 'error_rate',
      condition: 'gt',
      value: 10,
      severity: 'critical',
      duration: 120000,
      cooldown: 600000
    });

    this.addThreshold({
      id: 'critical_errors',
      name: 'Critical Errors Detected',
      description: 'Critical errors detected in the application',
      metric: 'critical_error_count',
      condition: 'gt',
      value: 0,
      severity: 'critical',
      cooldown: 300000
    });

    // Resource thresholds
    this.addThreshold({
      id: 'slow_resource_load',
      name: 'Slow Resource Loading',
      description: 'Resource load time exceeds 2 seconds',
      metric: 'resource_load_time',
      condition: 'gt',
      value: 2000,
      severity: 'info',
      duration: 60000,
      cooldown: 300000
    });

    // Memory thresholds
    this.addThreshold({
      id: 'high_memory_usage',
      name: 'High Memory Usage',
      description: 'Memory usage exceeds 90% of limit',
      metric: 'memory_usage_percent',
      condition: 'gt',
      value: 90,
      severity: 'warning',
      duration: 300000,
      cooldown: 600000
    });
  }

  /**
   * Add or update an alert threshold
   */
  addThreshold(threshold: AlertThreshold): void {
    this.thresholds.set(threshold.id, threshold);
  }

  /**
   * Remove an alert threshold
   */
  removeThreshold(id: string): void {
    this.thresholds.delete(id);
    // Remove any active alerts for this threshold
    const alertsToRemove = Array.from(this.activeAlerts.entries())
      .filter(([_, alert]) => alert.thresholdId === id)
      .map(([key]) => key);
    
    alertsToRemove.forEach(key => {
      const alert = this.activeAlerts.get(key);
      if (alert) {
        alert.status = 'resolved';
        alert.resolvedAt = Date.now();
        this.alertHistory.push(alert);
        this.activeAlerts.delete(key);
      }
    });
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: AlertHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Start monitoring thresholds
   */
  startMonitoring(intervalMs: number = 10000): void {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    this.checkInterval = setInterval(() => {
      this.checkThresholds();
    }, intervalMs);

    // Initial check
    this.checkThresholds();
  }

  /**
   * Stop monitoring thresholds
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check all thresholds against current metrics
   */
  private async checkThresholds(): Promise<void> {
    const metrics = performanceMonitor.getMetrics();
    const errorMetrics = errorTracker.getMetrics();
    
    // Add error metrics to the metrics list
    const currentTime = Date.now();
    const syntheticMetrics: PerformanceMetric[] = [
      {
        name: 'error_rate',
        value: errorMetrics.errorRate,
        unit: 'count', // errors per minute
        timestamp: currentTime,
        tags: { category: 'errors', unit_type: 'errors/min' }
      },
      {
        name: 'critical_error_count',
        value: errorMetrics.criticalErrors,
        unit: 'count',
        timestamp: currentTime,
        tags: { category: 'errors' }
      }
    ];

    // Check memory usage if available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('memory' in performance && (performance as any).memory) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const memory = (performance as any).memory;
      const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      syntheticMetrics.push({
        name: 'memory_usage_percent',
        value: usagePercent,
        unit: 'percent',
        timestamp: currentTime,
        tags: { category: 'performance' }
      });
    }

    // Combine all metrics
    const allMetrics = [
      ...metrics.flatMap(report => report.metrics),
      ...syntheticMetrics
    ];

    // Check each threshold
    for (const threshold of this.thresholds.values()) {
      await this.checkThreshold(threshold, allMetrics);
    }
  }

  /**
   * Check a single threshold against metrics
   */
  private async checkThreshold(threshold: AlertThreshold, metrics: PerformanceMetric[]): Promise<void> {
    // Filter metrics by name and tags
    const relevantMetrics = metrics.filter(m => {
      if (m.name !== threshold.metric) return false;
      
      // Check tag filters if specified
      if (threshold.tags) {
        for (const [key, value] of Object.entries(threshold.tags)) {
          if (m.tags?.[key] !== value) return false;
        }
      }
      
      return true;
    });

    if (relevantMetrics.length === 0) return;

    // Get the most recent metric value
    const latestMetric = relevantMetrics.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );

    // Check if threshold is violated
    const isViolated = this.evaluateCondition(
      latestMetric.value,
      threshold.condition,
      threshold.value
    );

    const alertKey = `${threshold.id}-${JSON.stringify(threshold.tags || {})}`;
    const existingAlert = this.activeAlerts.get(alertKey);

    if (isViolated) {
      if (!existingAlert) {
        // Check cooldown
        const lastAlertTime = this.lastAlertTime.get(alertKey) || 0;
        const timeSinceLastAlert = Date.now() - lastAlertTime;
        
        if (threshold.cooldown && timeSinceLastAlert < threshold.cooldown) {
          return; // Still in cooldown period
        }

        // Create new alert
        const alert: Alert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          thresholdId: threshold.id,
          name: threshold.name,
          description: threshold.description,
          severity: threshold.severity,
          status: 'active',
          triggeredAt: Date.now(),
          value: latestMetric.value,
          threshold: threshold.value,
          metric: threshold.metric,
          tags: latestMetric.tags
        };

        this.activeAlerts.set(alertKey, alert);
        this.lastAlertTime.set(alertKey, alert.triggeredAt);
        await this.notifyHandlers(alert);
      }
    } else if (existingAlert && existingAlert.status === 'active') {
      // Threshold no longer violated, resolve alert
      existingAlert.status = 'resolved';
      existingAlert.resolvedAt = Date.now();
      this.alertHistory.push(existingAlert);
      this.activeAlerts.delete(alertKey);
      await this.notifyHandlers(existingAlert);
    }
  }

  /**
   * Evaluate a threshold condition
   */
  private evaluateCondition(value: number, condition: string, threshold: number): boolean {
    switch (condition) {
      case 'gt': return value > threshold;
      case 'lt': return value < threshold;
      case 'gte': return value >= threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  }

  /**
   * Notify all handlers of an alert
   */
  private async notifyHandlers(alert: Alert): Promise<void> {
    const promises = Array.from(this.handlers).map(handler => {
      try {
        return Promise.resolve(handler(alert));
      } catch (error) {
        console.error('Error in alert handler:', error);
        return Promise.resolve();
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): Alert[] {
    const history = [...this.alertHistory].sort((a, b) => b.triggeredAt - a.triggeredAt);
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    for (const alert of this.activeAlerts.values()) {
      if (alert.id === alertId) {
        alert.status = 'acknowledged';
        alert.acknowledgedAt = Date.now();
        break;
      }
    }
  }

  /**
   * Clear alert history
   */
  clearHistory(): void {
    this.alertHistory = [];
  }

  /**
   * Export alert configuration
   */
  exportThresholds(): AlertThreshold[] {
    return Array.from(this.thresholds.values());
  }

  /**
   * Import alert configuration
   */
  importThresholds(thresholds: AlertThreshold[]): void {
    thresholds.forEach(threshold => this.addThreshold(threshold));
  }
}

// Export singleton instance
export const alertingService = new AlertingService();

// Auto-start monitoring in production
if (process.env.NODE_ENV === 'production') {
  alertingService.startMonitoring();
}

// Example alert handler that logs to console
alertingService.onAlert((alert) => {
  const emoji = alert.severity === 'critical' ? '🚨' : 
                alert.severity === 'warning' ? '⚠️' : 'ℹ️';
  
  if (alert.status === 'active') {
    console.warn(`${emoji} ALERT: ${alert.name} - ${alert.description}. Current value: ${alert.value}, Threshold: ${alert.threshold}`);
  } else if (alert.status === 'resolved') {
    console.info(`✅ RESOLVED: ${alert.name} - Alert has been resolved.`);
  }
});