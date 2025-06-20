/**
 * Extended tests for Performance Monitor covering observers and advanced functionality
 */

import { PerformanceMonitor } from '../performance-monitor';

describe('PerformanceMonitor - Extended Coverage', () => {
  let monitor: PerformanceMonitor;
  let mockWindow: any;
  let mockPerformance: any;
  let mockPerformanceObserver: any;
  let observerInstances: any[] = [];
  let consoleLogSpy: jest.SpyInstance;
  let consoleGroupSpy: jest.SpyInstance;
  let consoleGroupEndSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset singleton
    (PerformanceMonitor as any).instance = undefined;
    observerInstances = [];
    
    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleGroupSpy = jest.spyOn(console, 'group').mockImplementation();
    consoleGroupEndSpy = jest.spyOn(console, 'groupEnd').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    
    // Mock performance entries
    mockPerformance = {
      getEntriesByType: jest.fn((type: string) => {
        if (type === 'paint') {
          return [
            { name: 'first-paint', startTime: 100 },
            { name: 'first-contentful-paint', startTime: 150 }
          ];
        }
        if (type === 'navigation') {
          return [{
            domContentLoadedEventEnd: 200,
            domContentLoadedEventStart: 150,
            loadEventEnd: 300,
            loadEventStart: 250,
            responseStart: 100,
            requestStart: 50,
            name: 'navigation',
            entryType: 'navigation',
            startTime: 0,
            duration: 300
          }];
        }
        return [];
      })
    };
    
    // Mock PerformanceObserver
    mockPerformanceObserver = jest.fn((callback) => {
      const observer = {
        observe: jest.fn(),
        disconnect: jest.fn(),
        callback
      };
      observerInstances.push(observer);
      return observer;
    });
    
    // Mock window
    mockWindow = {
      location: { href: 'http://test.com' },
      addEventListener: jest.fn(),
      PerformanceObserver: mockPerformanceObserver
    };
    
    // Set up globals
    Object.defineProperty(global, 'window', {
      value: mockWindow,
      writable: true,
      configurable: true
    });
    
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'test-browser' },
      writable: true,
      configurable: true
    });
    
    Object.defineProperty(global, 'performance', {
      value: mockPerformance,
      writable: true,
      configurable: true
    });
    
    Object.defineProperty(global, 'PerformanceObserver', {
      value: mockPerformanceObserver,
      writable: true,
      configurable: true
    });
    
    // Mock timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
    consoleLogSpy.mockRestore();
    consoleGroupSpy.mockRestore();
    consoleGroupEndSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Web Vitals Observers', () => {
    it('should set up LCP observer', () => {
      // Always sample
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      monitor = new PerformanceMonitor({
        enabled: true,
        samplingRate: 0.1,
        enabledMetrics: {
          webVitals: true,
          navigation: false,
          resource: false,
          api: false,
          custom: false
        }
      });
      
      // Check LCP observer was created
      const lcpObserver = observerInstances.find(obs => {
        const call = obs.observe.mock.calls[0];
        return call && call[0].entryTypes.includes('largest-contentful-paint');
      });
      
      expect(lcpObserver).toBeDefined();
      
      // Simulate LCP entry
      lcpObserver.callback({
        getEntries: () => [{
          renderTime: 1234,
          loadTime: 5678,
          name: 'largest-contentful-paint',
          entryType: 'largest-contentful-paint',
          startTime: 100,
          duration: 0
        }]
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'web_vitals_lcp',
        value: 1234,
        unit: 'ms',
        tags: { type: 'web_vitals' }
      });
    });
    
    it('should set up FID observer', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: true, navigation: false, resource: false, api: false, custom: false }
      });
      
      const fidObserver = observerInstances.find(obs => {
        const call = obs.observe.mock.calls[0];
        return call && call[0].entryTypes.includes('first-input');
      });
      
      expect(fidObserver).toBeDefined();
      
      fidObserver.callback({
        getEntries: () => [{
          processingStart: 150,
          startTime: 100,
          name: 'first-input',
          entryType: 'first-input',
          duration: 50
        }]
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'web_vitals_fid',
        value: 50,
        unit: 'ms',
        tags: { type: 'web_vitals' }
      });
    });
    
    it('should set up CLS observer', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: true, navigation: false, resource: false, api: false, custom: false }
      });
      
      const clsObserver = observerInstances.find(obs => {
        const call = obs.observe.mock.calls[0];
        return call && call[0].entryTypes.includes('layout-shift');
      });
      
      expect(clsObserver).toBeDefined();
      
      clsObserver.callback({
        getEntries: () => [
          { hadRecentInput: false, value: 0.1, name: 'layout-shift', entryType: 'layout-shift', startTime: 100, duration: 0 },
          { hadRecentInput: true, value: 0.2, name: 'layout-shift', entryType: 'layout-shift', startTime: 200, duration: 0 },
          { hadRecentInput: false, value: 0.05, name: 'layout-shift', entryType: 'layout-shift', startTime: 300, duration: 0 }
        ]
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'web_vitals_cls',
        value: expect.closeTo(0.15, 5), // 0.1 + 0.05 (0.2 ignored)
        unit: 'count',
        tags: { type: 'web_vitals' }
      });
    });
    
    it('should record FCP on window load', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      // Ensure global performance is available
      global.performance = mockPerformance;
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: true, navigation: false, resource: false, api: false, custom: false }
      });
      
      // Find and trigger load event handler
      const loadHandler = mockWindow.addEventListener.mock.calls.find(
        ([event]: [string]) => event === 'load'
      )?.[1];
      
      loadHandler();
      jest.advanceTimersByTime(100);
      
      const metrics = monitor.getMetrics();
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'web_vitals_fcp',
        value: 150,
        unit: 'ms',
        tags: { type: 'web_vitals' }
      });
    });
    
    it('should handle observer errors gracefully', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      // Make observer throw errors
      mockPerformanceObserver.mockImplementation((callback: any) => {
        const observer = {
          observe: jest.fn((options: any) => {
            if (options.entryTypes.includes('largest-contentful-paint')) {
              throw new Error('LCP not supported');
            }
            if (options.entryTypes.includes('first-input')) {
              throw new Error('FID not supported');
            }
            if (options.entryTypes.includes('layout-shift')) {
              throw new Error('CLS not supported');
            }
          }),
          disconnect: jest.fn(),
          callback
        };
        observerInstances.push(observer);
        return observer;
      });
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: true, navigation: false, resource: false, api: false, custom: false }
      });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[PerformanceMonitor] LCP observer not supported:',
        expect.any(Error)
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[PerformanceMonitor] FID observer not supported:',
        expect.any(Error)
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[PerformanceMonitor] CLS observer not supported:',
        expect.any(Error)
      );
    });
  });

  describe('Navigation Observer', () => {
    it('should record navigation metrics on load', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      // Ensure global performance is available
      global.performance = mockPerformance;
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: false, navigation: true, resource: false, api: false, custom: false }
      });
      
      const loadHandler = mockWindow.addEventListener.mock.calls.find(
        ([event]: [string]) => event === 'load'
      )?.[1];
      
      loadHandler();
      jest.advanceTimersByTime(100);
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(3);
      
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'navigation_dom_content_loaded',
        value: 50,
        unit: 'ms',
        tags: { type: 'navigation' }
      });
      
      expect(metrics[1]?.metrics[0]).toMatchObject({
        name: 'navigation_load_complete',
        value: 50,
        unit: 'ms',
        tags: { type: 'navigation' }
      });
      
      expect(metrics[2]?.metrics[0]).toMatchObject({
        name: 'navigation_ttfb',
        value: 50,
        unit: 'ms',
        tags: { type: 'navigation' }
      });
    });
  });

  describe('Resource Observer', () => {
    it('should track resource loading', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: false, navigation: false, resource: true, api: false, custom: false }
      });
      
      const resourceObserver = observerInstances.find(obs => {
        const call = obs.observe.mock.calls[0];
        return call && call[0].entryTypes.includes('resource');
      });
      
      expect(resourceObserver).toBeDefined();
      
      resourceObserver.callback({
        getEntries: () => [
          {
            name: 'https://api.example.com/data.json',
            initiatorType: 'fetch',
            startTime: 100,
            responseEnd: 250,
            entryType: 'resource',
            duration: 150
          },
          {
            name: 'https://cdn.example.com/image.png',
            initiatorType: 'img',
            startTime: 200,
            responseEnd: 400,
            entryType: 'resource',
            duration: 200
          }
        ]
      });
      
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(2);
      
      expect(metrics[0]?.metrics[0]).toMatchObject({
        name: 'resource_load_time',
        value: 150,
        unit: 'ms',
        tags: {
          type: 'resource',
          resource_type: 'fetch',
          url: 'https://api.example.com/data.json'
        }
      });
    });
    
    it('should handle resource observer errors', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      mockPerformanceObserver.mockImplementation((callback: any) => {
        const observer = {
          observe: jest.fn((options: any) => {
            if (options.entryTypes.includes('resource')) {
              throw new Error('Resource timing not supported');
            }
          }),
          disconnect: jest.fn(),
          callback
        };
        observerInstances.push(observer);
        return observer;
      });
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: false, navigation: false, resource: true, api: false, custom: false }
      });
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[PerformanceMonitor] Resource observer not supported:',
        expect.any(Error)
      );
    });
  });

  describe('Flush Timer and Lifecycle', () => {
    it('should set up flush timer', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock;
      
      monitor = new PerformanceMonitor({
        enabled: true,
        flushInterval: 5000,
        endpoint: 'https://metrics.example.com'
      });
      
      monitor.recordCustomMetric('test', 100, 'ms');
      
      jest.advanceTimersByTime(5000);
      
      expect(fetchMock).toHaveBeenCalledWith(
        'https://metrics.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });
    
    it('should flush on beforeunload', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock;
      
      monitor = new PerformanceMonitor({
        enabled: true,
        endpoint: 'https://metrics.example.com'
      });
      
      monitor.recordCustomMetric('test', 100, 'ms');
      
      const unloadHandler = mockWindow.addEventListener.mock.calls.find(
        ([event]: [string]) => event === 'beforeunload'
      )?.[1];
      
      unloadHandler();
      
      expect(fetchMock).toHaveBeenCalled();
    });
    
    it('should log to console when no endpoint configured', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      monitor = new PerformanceMonitor({
        enabled: true
        // No endpoint
      });
      
      monitor.recordCustomMetric('test1', 100, 'ms');
      monitor.recordCustomMetric('test2', 200, 'bytes');
      
      await (monitor as any).flush();
      
      expect(consoleGroupSpy).toHaveBeenCalledWith('[PerformanceMonitor] Metrics Flush');
      expect(consoleLogSpy).toHaveBeenCalledWith('Report:', expect.objectContaining({
        metrics: expect.arrayContaining([
          expect.objectContaining({ name: 'test1' })
        ])
      }));
      expect(consoleGroupEndSpy).toHaveBeenCalled();
    });
  });

  describe('Destroy Method', () => {
    it('should properly clean up resources', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock;
      
      monitor = new PerformanceMonitor({
        enabled: true,
        endpoint: 'https://metrics.example.com'
      });
      
      // Should have created observers
      expect(observerInstances.length).toBeGreaterThan(0);
      
      monitor.recordCustomMetric('test', 100, 'ms');
      
      monitor.destroy();
      
      // All observers should be disconnected
      observerInstances.forEach(observer => {
        expect(observer.disconnect).toHaveBeenCalled();
      });
      
      // Should have flushed metrics
      expect(fetchMock).toHaveBeenCalled();
      
      // Timer should be cleared
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing PerformanceObserver', () => {
      delete (global as any).PerformanceObserver;
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      
      monitor = new PerformanceMonitor({
        enabled: true,
        enabledMetrics: { webVitals: true, navigation: true, resource: true, api: true, custom: true }
      });
      
      // Should not throw
      monitor.recordCustomMetric('test', 100, 'ms');
      expect(monitor.getMetrics()).toHaveLength(1);
    });
    
    it('should handle server-side rendering (no window)', () => {
      delete (global as any).window;
      
      monitor = new PerformanceMonitor({
        enabled: true
      });
      
      // Should not throw
      expect(monitor).toBeDefined();
      expect(observerInstances).toHaveLength(0);
    });
    
    it('should not initialize when not sampled', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5); // Above 0.1 sampling rate
      
      monitor = new PerformanceMonitor({
        enabled: true,
        samplingRate: 0.1
      });
      
      // Should not create observers
      expect(observerInstances).toHaveLength(0);
    });
  });
});