/**
 * Tests for the Alerting System
 */

import { alertingService, AlertThreshold, Alert } from '../alerting';
import { performanceMonitor } from '../performance-monitor';
import { errorTracker } from '../error-tracker';

// Mock the performance monitor and error tracker
jest.mock('../performance-monitor');
jest.mock('../error-tracker');

describe('AlertingService', () => {
  // Store original console methods
  const originalWarn = console.warn;
  const originalInfo = console.info;

  beforeEach(() => {
    jest.clearAllMocks();
    alertingService.clearHistory();
    
    // Reset monitoring
    alertingService.stopMonitoring();
    
    // Clear all thresholds to prevent default thresholds from interfering
    const thresholds = alertingService.exportThresholds();
    thresholds.forEach(threshold => {
      alertingService.removeThreshold(threshold.id);
    });
    
    // Mock console methods to prevent default alert handler output
    console.warn = jest.fn();
    console.info = jest.fn();
    
    // Mock default metrics
    (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
      {
        id: 'metric_1',
        sessionId: 'test_session',
        timestamp: Date.now(),
        url: 'http://test.com',
        userAgent: 'test',
        metrics: []
      }
    ]);
    
    (errorTracker.getMetrics as jest.Mock).mockReturnValue({
      totalErrors: 0,
      errorRate: 0,
      criticalErrors: 0,
      errorsByType: {},
      topErrors: []
    });
  });

  afterEach(() => {
    alertingService.stopMonitoring();
    // Restore console methods
    console.warn = originalWarn;
    console.info = originalInfo;
  });

  describe('Threshold Management', () => {
    it('should add a new threshold', () => {
      const threshold: AlertThreshold = {
        id: 'test_threshold',
        name: 'Test Threshold',
        description: 'Test description',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning'
      };

      alertingService.addThreshold(threshold);
      const thresholds = alertingService.exportThresholds();
      
      expect(thresholds.find(t => t.id === 'test_threshold')).toEqual(threshold);
    });

    it('should remove a threshold', () => {
      const threshold: AlertThreshold = {
        id: 'test_threshold',
        name: 'Test Threshold',
        description: 'Test description',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning'
      };

      alertingService.addThreshold(threshold);
      alertingService.removeThreshold('test_threshold');
      
      const thresholds = alertingService.exportThresholds();
      expect(thresholds.find(t => t.id === 'test_threshold')).toBeUndefined();
    });

    it('should update an existing threshold', () => {
      const threshold: AlertThreshold = {
        id: 'test_threshold',
        name: 'Test Threshold',
        description: 'Test description',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning'
      };

      alertingService.addThreshold(threshold);
      
      const updatedThreshold = { ...threshold, value: 200 };
      alertingService.addThreshold(updatedThreshold);
      
      const thresholds = alertingService.exportThresholds();
      expect(thresholds.find(t => t.id === 'test_threshold')?.value).toBe(200);
    });
  });

  describe('Alert Triggering', () => {
    it('should trigger an alert when threshold is exceeded', (done) => {
      const threshold: AlertThreshold = {
        id: 'high_value',
        name: 'High Value Alert',
        description: 'Value exceeds threshold',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning'
      };

      alertingService.addThreshold(threshold);

      // Set up alert handler
      let handlerCalled = false;
      const handler = jest.fn((alert: Alert) => {
        if (!handlerCalled) {
          handlerCalled = true;
          expect(alert.thresholdId).toBe('high_value');
          expect(alert.status).toBe('active');
          expect(alert.value).toBe(150);
          expect(alert.threshold).toBe(100);
          done();
        }
      });

      alertingService.onAlert(handler);

      // Mock metrics that exceed threshold
      (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
        {
          id: 'metric_1',
          sessionId: 'test_session',
          timestamp: Date.now(),
          url: 'http://test.com',
          userAgent: 'test',
          metrics: [
            {
              name: 'test_metric',
              value: 150,
              unit: 'ms',
              timestamp: Date.now()
            }
          ]
        }
      ]);

      // Start monitoring to trigger check
      alertingService.startMonitoring(100);
    });

    it('should not trigger alert when threshold is not exceeded', (done) => {
      const threshold: AlertThreshold = {
        id: 'high_value',
        name: 'High Value Alert',
        description: 'Value exceeds threshold',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning'
      };

      alertingService.addThreshold(threshold);

      const handler = jest.fn();
      alertingService.onAlert(handler);

      // Mock metrics below threshold
      (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
        {
          id: 'metric_1',
          sessionId: 'test_session',
          timestamp: Date.now(),
          url: 'http://test.com',
          userAgent: 'test',
          metrics: [
            {
              name: 'test_metric',
              value: 50,
              unit: 'ms',
              timestamp: Date.now()
            }
          ]
        }
      ]);

      alertingService.startMonitoring(50);

      setTimeout(() => {
        expect(handler).not.toHaveBeenCalled();
        done();
      }, 200);
    });

    it('should resolve alert when metric returns to normal', (done) => {
      const threshold: AlertThreshold = {
        id: 'high_value',
        name: 'High Value Alert',
        description: 'Value exceeds threshold',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning'
      };

      alertingService.addThreshold(threshold);

      let alertCount = 0;
      const handler = jest.fn((alert: Alert) => {
        alertCount++;
        
        if (alertCount === 1) {
          // First alert should be active
          expect(alert.status).toBe('active');
          
          // Change metrics to normal
          (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
            {
              id: 'metric_1',
              sessionId: 'test_session',
              timestamp: Date.now(),
              url: 'http://test.com',
              userAgent: 'test',
              metrics: [
                {
                  name: 'test_metric',
                  value: 50,
                  unit: 'ms',
                  timestamp: Date.now()
                }
              ]
            }
          ]);
        } else if (alertCount === 2) {
          // Second alert should be resolved
          expect(alert.status).toBe('resolved');
          expect(alert.resolvedAt).toBeDefined();
          done();
        }
      });

      alertingService.onAlert(handler);

      // Initial metrics exceed threshold
      (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
        {
          id: 'metric_1',
          sessionId: 'test_session',
          timestamp: Date.now(),
          url: 'http://test.com',
          userAgent: 'test',
          metrics: [
            {
              name: 'test_metric',
              value: 150,
              unit: 'ms',
              timestamp: Date.now()
            }
          ]
        }
      ]);

      alertingService.startMonitoring(100);
    });
  });

  describe('Cooldown Period', () => {
    it('should respect cooldown period', (done) => {
      const threshold: AlertThreshold = {
        id: 'cooldown_test',
        name: 'Cooldown Test',
        description: 'Test cooldown',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning',
        cooldown: 500 // 500ms cooldown
      };

      alertingService.addThreshold(threshold);

      let alertCount = 0;
      const handler = jest.fn(() => {
        alertCount++;
      });

      alertingService.onAlert(handler);

      // Metrics exceed threshold
      (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
        {
          id: 'metric_1',
          sessionId: 'test_session',
          timestamp: Date.now(),
          url: 'http://test.com',
          userAgent: 'test',
          metrics: [
            {
              name: 'test_metric',
              value: 150,
              unit: 'ms',
              timestamp: Date.now()
            }
          ]
        }
      ]);

      alertingService.startMonitoring(100);

      // After 350ms, we should only have 1 alert due to cooldown
      setTimeout(() => {
        expect(alertCount).toBe(1);
        done();
      }, 350);
    });
  });

  describe('Alert Conditions', () => {
    const testCases = [
      { condition: 'gt' as const, value: 100, testValue: 150, shouldAlert: true },
      { condition: 'gt' as const, value: 100, testValue: 50, shouldAlert: false },
      { condition: 'lt' as const, value: 100, testValue: 50, shouldAlert: true },
      { condition: 'lt' as const, value: 100, testValue: 150, shouldAlert: false },
      { condition: 'gte' as const, value: 100, testValue: 100, shouldAlert: true },
      { condition: 'gte' as const, value: 100, testValue: 99, shouldAlert: false },
      { condition: 'lte' as const, value: 100, testValue: 100, shouldAlert: true },
      { condition: 'lte' as const, value: 100, testValue: 101, shouldAlert: false },
      { condition: 'eq' as const, value: 100, testValue: 100, shouldAlert: true },
      { condition: 'eq' as const, value: 100, testValue: 101, shouldAlert: false },
    ];

    testCases.forEach(({ condition, value, testValue, shouldAlert }) => {
      it(`should ${shouldAlert ? 'trigger' : 'not trigger'} alert for ${condition} condition when value is ${testValue}`, (done) => {
        const threshold: AlertThreshold = {
          id: 'condition_test',
          name: 'Condition Test',
          description: `Test ${condition} condition`,
          metric: 'test_metric',
          condition,
          value,
          severity: 'warning'
        };

        alertingService.addThreshold(threshold);

        const handler = jest.fn();
        alertingService.onAlert(handler);

        (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
          {
            id: 'metric_1',
            sessionId: 'test_session',
            timestamp: Date.now(),
            url: 'http://test.com',
            userAgent: 'test',
            metrics: [
              {
                name: 'test_metric',
                value: testValue,
                unit: 'ms',
                timestamp: Date.now()
              }
            ]
          }
        ]);

        alertingService.startMonitoring(50);

        setTimeout(() => {
          if (shouldAlert) {
            expect(handler).toHaveBeenCalled();
          } else {
            expect(handler).not.toHaveBeenCalled();
          }
          done();
        }, 200);
      });
    });
  });

  describe('Error Metrics Integration', () => {
    it('should trigger alert for high error rate', (done) => {
      // Add the high error rate threshold
      alertingService.addThreshold({
        id: 'high_error_rate',
        name: 'High Error Rate',
        description: 'Error rate exceeds 10 errors per minute',
        metric: 'error_rate',
        condition: 'gt',
        value: 10,
        severity: 'critical'
      });

      let handlerCalled = false;
      const handler = jest.fn((alert: Alert) => {
        // Only check the high_error_rate threshold alert
        if (alert.thresholdId === 'high_error_rate' && !handlerCalled) {
          handlerCalled = true;
          expect(alert.metric).toBe('error_rate');
          expect(alert.value).toBe(15);
          done();
        }
      });

      alertingService.onAlert(handler);

      // Mock high error rate
      (errorTracker.getMetrics as jest.Mock).mockReturnValue({
        totalErrors: 100,
        errorRate: 15, // 15 errors per minute
        criticalErrors: 0,
        errorsByType: {},
        topErrors: []
      });

      alertingService.startMonitoring(100);
    });

    it('should trigger alert for critical errors', (done) => {
      // Add the critical errors threshold
      alertingService.addThreshold({
        id: 'critical_errors',
        name: 'Critical Errors Detected',
        description: 'Critical errors detected in the application',
        metric: 'critical_error_count',
        condition: 'gt',
        value: 0,
        severity: 'critical'
      });

      let handlerCalled = false;
      const handler = jest.fn((alert: Alert) => {
        // Only check the critical_errors threshold alert
        if (alert.thresholdId === 'critical_errors' && !handlerCalled) {
          handlerCalled = true;
          expect(alert.metric).toBe('critical_error_count');
          expect(alert.value).toBe(5);
          done();
        }
      });

      alertingService.onAlert(handler);

      // Mock critical errors
      (errorTracker.getMetrics as jest.Mock).mockReturnValue({
        totalErrors: 10,
        errorRate: 2,
        criticalErrors: 5,
        errorsByType: {},
        topErrors: []
      });

      alertingService.startMonitoring(100);
    });
  });

  describe('Alert Management', () => {
    it('should acknowledge alert', () => {
      // Manually create an active alert
      const alert: Alert = {
        id: 'test-alert',
        thresholdId: 'test',
        name: 'Test Alert',
        description: 'Test',
        severity: 'warning',
        status: 'active',
        triggeredAt: Date.now(),
        value: 100,
        threshold: 50,
        metric: 'test_metric'
      };

      // Add to active alerts (using private method workaround)
      (alertingService as any).activeAlerts.set('test-key', alert);

      alertingService.acknowledgeAlert('test-alert');

      const activeAlerts = alertingService.getActiveAlerts();
      const acknowledgedAlert = activeAlerts.find(a => a.id === 'test-alert');
      
      expect(acknowledgedAlert?.status).toBe('acknowledged');
      expect(acknowledgedAlert?.acknowledgedAt).toBeDefined();
    });

    it('should get alert history', () => {
      // Add some alerts to history
      const alerts: Alert[] = [
        {
          id: 'alert-1',
          thresholdId: 'test',
          name: 'Alert 1',
          description: 'Test',
          severity: 'warning',
          status: 'resolved',
          triggeredAt: Date.now() - 1000,
          resolvedAt: Date.now(),
          value: 100,
          threshold: 50,
          metric: 'test_metric'
        },
        {
          id: 'alert-2',
          thresholdId: 'test',
          name: 'Alert 2',
          description: 'Test',
          severity: 'critical',
          status: 'resolved',
          triggeredAt: Date.now() - 2000,
          resolvedAt: Date.now() - 1000,
          value: 200,
          threshold: 100,
          metric: 'test_metric'
        }
      ];

      alerts.forEach(alert => (alertingService as any).alertHistory.push(alert));

      const history = alertingService.getAlertHistory();
      expect(history).toHaveLength(2);
      expect(history[0]?.id).toBe('alert-1'); // Most recent first
      expect(history[1]?.id).toBe('alert-2');
    });

    it('should limit alert history', () => {
      // Add 5 alerts to history
      for (let i = 0; i < 5; i++) {
        const alert: Alert = {
          id: `alert-${i}`,
          thresholdId: 'test',
          name: `Alert ${i}`,
          description: 'Test',
          severity: 'warning',
          status: 'resolved',
          triggeredAt: Date.now() - i * 1000,
          resolvedAt: Date.now(),
          value: 100,
          threshold: 50,
          metric: 'test_metric'
        };
        (alertingService as any).alertHistory.push(alert);
      }

      const history = alertingService.getAlertHistory(3);
      expect(history).toHaveLength(3);
      expect(history[0]?.id).toBe('alert-0'); // Most recent
    });
  });

  describe('Handler Management', () => {
    it('should register and unregister handlers', (done) => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      const unregister1 = alertingService.onAlert(handler1);
      alertingService.onAlert(handler2);

      const threshold: AlertThreshold = {
        id: 'handler_test',
        name: 'Handler Test',
        description: 'Test handlers',
        metric: 'test_metric',
        condition: 'gt',
        value: 100,
        severity: 'warning'
      };

      alertingService.addThreshold(threshold);

      (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
        {
          id: 'metric_1',
          sessionId: 'test_session',
          timestamp: Date.now(),
          url: 'http://test.com',
          userAgent: 'test',
          metrics: [
            {
              name: 'test_metric',
              value: 150,
              unit: 'ms',
              timestamp: Date.now()
            }
          ]
        }
      ]);

      alertingService.startMonitoring(100);

      setTimeout(() => {
        expect(handler1).toHaveBeenCalled();
        expect(handler2).toHaveBeenCalled();

        // Stop monitoring to prevent further alerts
        alertingService.stopMonitoring();

        // Unregister handler1
        unregister1();

        // Reset mocks
        handler1.mockClear();
        handler2.mockClear();

        // Update metrics to show a resolved alert
        (performanceMonitor.getMetrics as jest.Mock).mockReturnValue([
          {
            id: 'metric_1',
            sessionId: 'test_session',
            timestamp: Date.now(),
            url: 'http://test.com',
            userAgent: 'test',
            metrics: [
              {
                name: 'test_metric',
                value: 50,  // Below threshold
                unit: 'ms',
                timestamp: Date.now()
              }
            ]
          }
        ]);

        // Start monitoring again
        alertingService.startMonitoring(100);

        setTimeout(() => {
          // Handler2 should be called for the resolved alert
          expect(handler1).not.toHaveBeenCalled();
          expect(handler2).toHaveBeenCalled();
          done();
        }, 150);
      }, 150);
    });
  });
});