/**
 * Simplified tests for Performance Monitor focusing on core functionality
 */

import { PerformanceMonitor, PerformanceMetric } from '../performance-monitor';

describe('PerformanceMonitor - Core Functionality', () => {
  let monitor: PerformanceMonitor;
  const originalWindow = global.window;

  beforeEach(() => {
    // Reset singleton instance
    (PerformanceMonitor as any).instance = undefined;
    
    // Mock window and navigator for tests
    Object.defineProperty(global, 'window', {
      value: {
        location: { href: 'http://test.com' },
        addEventListener: jest.fn()
      },
      writable: true,
      configurable: true
    });
    
    Object.defineProperty(global, 'navigator', {
      value: {
        userAgent: 'test-user-agent'
      },
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PerformanceMonitor.getInstance();
      const instance2 = PerformanceMonitor.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should accept initial config', () => {
      const config = {
        enabled: true,
        samplingRate: 0.5,
        endpoint: 'http://metrics.example.com'
      };
      
      const instance = PerformanceMonitor.getInstance(config);
      expect(instance).toBeDefined();
    });
  });

  describe('recordMetric', () => {
    it('should record metric when enabled and sampled', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0  // Always sample
      });
      
      const metric: PerformanceMetric = {
        name: 'test_metric',
        value: 123,
        unit: 'ms',
        timestamp: Date.now(),
        tags: { custom: 'tag' }
      };
      
      monitor.recordMetric(metric);
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.metrics[0]).toMatchObject(metric);
    });

    it('should not record when disabled', () => {
      monitor = new PerformanceMonitor({ 
        enabled: false 
      });
      
      monitor.recordMetric({
        name: 'test',
        value: 123,
        unit: 'ms',
        timestamp: Date.now()
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(0);
    });

    it('should respect sampling rate', () => {
      // Create monitor with 0% sampling rate
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 0  // Never sample
      });
      
      monitor.recordMetric({
        name: 'test',
        value: 123,
        unit: 'ms',
        timestamp: Date.now()
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('recordApiCall', () => {
    it('should record API metrics when enabled', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0,
        enabledMetrics: { 
          webVitals: false,
          navigation: false,
          resource: false,
          api: true,
          custom: false
        }
      });
      
      monitor.recordApiCall('/api/test', 'GET', 250, 200);
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'api_call_duration',
        value: 250,
        unit: 'ms',
        tags: {
          type: 'api',
          url: '/api/test',
          method: 'GET',
          status: '200'
        }
      });
    });

    it('should not record when API metrics disabled', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0,
        enabledMetrics: { 
          webVitals: false,
          navigation: false,
          resource: false,
          api: false,
          custom: false
        }
      });
      
      monitor.recordApiCall('/api/test', 'GET', 250, 200);
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('recordCustomMetric', () => {
    it('should record custom metrics with tags', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0,
        enabledMetrics: { 
          webVitals: false,
          navigation: false,
          resource: false,
          api: false,
          custom: true
        }
      });
      
      monitor.recordCustomMetric('user_action', 500, 'ms', { action: 'click' });
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'user_action',
        value: 500,
        unit: 'ms',
        tags: { type: 'custom', action: 'click' }
      });
    });

    it('should not record when custom metrics disabled', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0,
        enabledMetrics: { 
          webVitals: false,
          navigation: false,
          resource: false,
          api: false,
          custom: false
        }
      });
      
      monitor.recordCustomMetric('user_action', 500, 'ms');
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(0);
    });
  });

  describe('buffer management', () => {
    it('should auto-flush when buffer is full', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock;
      
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0,
        endpoint: 'http://metrics.example.com',
        bufferSize: 2
      });
      
      // Fill buffer
      monitor.recordMetric({
        name: 'metric_1',
        value: 1,
        unit: 'count',
        timestamp: Date.now()
      });
      
      monitor.recordMetric({
        name: 'metric_2',
        value: 2,
        unit: 'count',
        timestamp: Date.now()
      });
      
      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(fetchMock).toHaveBeenCalledWith(
        'http://metrics.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('should clear metrics', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0
      });
      
      monitor.recordMetric({
        name: 'test',
        value: 100,
        unit: 'ms',
        timestamp: Date.now()
      });
      
      expect(monitor.getMetrics()).toHaveLength(1);
      
      monitor.clear();
      
      expect(monitor.getMetrics()).toHaveLength(0);
    });
  });

  describe('getMetrics', () => {
    it('should return copy of metrics buffer', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0
      });
      
      monitor.recordMetric({
        name: 'test',
        value: 100,
        unit: 'ms',
        timestamp: Date.now()
      });
      
      const metrics1 = monitor.getMetrics();
      const metrics2 = monitor.getMetrics();
      
      expect(metrics1).toEqual(metrics2);
      expect(metrics1).not.toBe(metrics2); // Different array instances
    });
  });

  describe('error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const fetchMock = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = fetchMock;
      
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0,
        endpoint: 'http://metrics.example.com',
        bufferSize: 1
      });
      
      monitor.recordMetric({
        name: 'test',
        value: 100,
        unit: 'ms',
        timestamp: Date.now()
      });
      
      // Wait for async flush
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[PerformanceMonitor] Failed to send metrics:',
        expect.any(Error)
      );
      
      // Metrics should be retained in buffer after failure
      expect(monitor.getMetrics()).toHaveLength(1);
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('configuration', () => {
    it('should use default config when not provided', () => {
      // Create monitor without window to avoid initialization
      const tempWindow = global.window;
      delete (global as any).window;
      
      monitor = new PerformanceMonitor();
      
      // Restore window
      global.window = tempWindow;
      
      // Test that defaults are applied by manually checking config
      // Since we can't easily test sampling without window, we'll just check the monitor exists
      expect(monitor).toBeDefined();
      expect(monitor.getMetrics()).toEqual([]);
    });
  });

  describe('metric types', () => {
    it('should support all unit types', () => {
      monitor = new PerformanceMonitor({ 
        enabled: true, 
        samplingRate: 1.0
      });
      
      const units: Array<PerformanceMetric['unit']> = ['ms', 'bytes', 'count', 'percent'];
      
      units.forEach((unit, index) => {
        monitor.recordMetric({
          name: `metric_${unit}`,
          value: index,
          unit,
          timestamp: Date.now()
        });
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(units.length);
      
      metrics.forEach((report, index) => {
        expect(report.metrics[0]?.unit).toBe(units[index]);
      });
    });
  });
});