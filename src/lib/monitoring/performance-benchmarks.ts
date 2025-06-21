/**
 * Performance benchmarks for critical application paths
 * 
 * Comprehensive benchmarks to measure and optimize performance
 */

import { TransformationBenchmark, transformationMonitor } from './transformation-monitor';
import { performanceMonitor } from './performance-monitor';
import { SafeBigInt, UUID, Email } from '../types/branded';
import {
  validateCampaignResponse,
  validateUserResponse
} from '../validation/runtime-validators';
import { logger } from '../utils/logger';

// Type validators - these are simple validators for benchmarking
const isSafeBigInt = (value: unknown): value is SafeBigInt => {
  return typeof value === 'bigint' && value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER;
};

const isUUID = (value: unknown): value is UUID => {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

const isEmail = (value: unknown): value is Email => {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const validateStatisticsResponse = (data: unknown): { isValid: boolean; errors?: string[] } => {
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Data must be an object'] };
  }
  
  const errors: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = data as any;
  
  if (typeof obj.total_campaigns !== 'string') errors.push('total_campaigns must be a string');
  if (typeof obj.active_campaigns !== 'string') errors.push('active_campaigns must be a string');
  if (typeof obj.total_spend !== 'string') errors.push('total_spend must be a string');
  if (typeof obj.total_clicks !== 'string') errors.push('total_clicks must be a string');
  if (typeof obj.total_impressions !== 'string') errors.push('total_impressions must be a string');
  if (typeof obj.total_conversions !== 'string') errors.push('total_conversions must be a string');
  if (typeof obj.average_ctr !== 'number') errors.push('average_ctr must be a number');
  if (typeof obj.average_conversion_rate !== 'number') errors.push('average_conversion_rate must be a number');
  
  return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
};

// Sample data for benchmarks
const SAMPLE_DATA = {
  safeBigInt: '9007199254740992',
  uuid: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  campaign: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Campaign',
    budget: '1000000',
    spent: '500000',
    clicks: '10000',
    impressions: '100000',
    conversions: '1000',
    status: 'ACTIVE' as const,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    owner_id: '550e8400-e29b-41d4-a716-446655440001',
    organization_id: '550e8400-e29b-41d4-a716-446655440002'
  },
  user: {
    id: '550e8400-e29b-41d4-a716-446655440001',
    email: 'user@example.com',
    name: 'Test User',
    role: 'USER' as const,
    permissions: ['campaigns:read', 'campaigns:write'],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    last_login: '2024-01-01T00:00:00Z',
    organization_id: '550e8400-e29b-41d4-a716-446655440002'
  },
  statistics: {
    total_campaigns: '100',
    active_campaigns: '50',
    total_spend: '1000000000',
    total_clicks: '10000000',
    total_impressions: '100000000',
    total_conversions: '1000000',
    average_ctr: 0.1,
    average_conversion_rate: 0.01,
    top_performing_campaigns: []
  }
};

export interface BenchmarkResult {
  name: string;
  category: string;
  iterations: number;
  average: number;
  min: number;
  max: number;
  median: number;
  p95: number;
  p99: number;
  opsPerSecond: number;
}

export interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  totalDuration: number;
  timestamp: number;
}

/**
 * Performance benchmark runner
 */
export class PerformanceBenchmarkRunner {
  private benchmark = new TransformationBenchmark();
  private suites: BenchmarkSuite[] = [];

  /**
   * Run all benchmarks
   */
  async runAllBenchmarks(iterations = 1000): Promise<BenchmarkSuite> {
    const startTime = Date.now();
    const results: BenchmarkResult[] = [];

    logger.info('Starting performance benchmark suite', { iterations, timestamp: new Date().toISOString() }, { component: 'PerformanceBenchmarks' });

    // Type validation benchmarks
    results.push(...await this.runValidationBenchmarks(iterations));

    // Transformation benchmarks
    results.push(...await this.runTransformationBenchmarks(iterations));

    // API validation benchmarks
    results.push(...await this.runApiValidationBenchmarks(iterations));

    // Array processing benchmarks
    results.push(...await this.runArrayProcessingBenchmarks(iterations));

    // Cache performance benchmarks
    results.push(...await this.runCacheBenchmarks(iterations));

    const suite: BenchmarkSuite = {
      name: `Full Benchmark Suite - ${new Date().toISOString()}`,
      results: results.flat(),
      totalDuration: Date.now() - startTime,
      timestamp: Date.now()
    };

    this.suites.push(suite);
    this.reportResults(suite);

    return suite;
  }

  /**
   * Run validation benchmarks
   */
  private async runValidationBenchmarks(iterations: number): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // SafeBigInt validation
    const safeBigIntResult = await this.benchmark.benchmark(
      'SafeBigInt Validation',
      () => isSafeBigInt(BigInt(SAMPLE_DATA.safeBigInt)),
      iterations
    );
    results.push(this.formatResult(safeBigIntResult, 'Validation'));

    // UUID validation
    const uuidResult = await this.benchmark.benchmark(
      'UUID Validation',
      () => isUUID(SAMPLE_DATA.uuid),
      iterations
    );
    results.push(this.formatResult(uuidResult, 'Validation'));

    // Email validation
    const emailResult = await this.benchmark.benchmark(
      'Email Validation',
      () => isEmail(SAMPLE_DATA.email),
      iterations
    );
    results.push(this.formatResult(emailResult, 'Validation'));

    return results;
  }

  /**
   * Run transformation benchmarks
   */
  private async runTransformationBenchmarks(iterations: number): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // BigInt transformation
    const bigIntResult = await this.benchmark.benchmark(
      'BigInt Transformation',
      () => BigInt(SAMPLE_DATA.safeBigInt),
      iterations
    );
    results.push(this.formatResult(bigIntResult, 'Transformation'));

    // String to SafeBigInt with validation
    const safeBigIntTransformResult = await this.benchmark.benchmark(
      'String to SafeBigInt with Validation',
      () => {
        const value = BigInt(SAMPLE_DATA.safeBigInt);
        if (!isSafeBigInt(value)) {
          throw new Error('Invalid SafeBigInt');
        }
        return value as SafeBigInt;
      },
      iterations
    );
    results.push(this.formatResult(safeBigIntTransformResult, 'Transformation'));

    // Object cloning
    const objectCloneResult = await this.benchmark.benchmark(
      'Object Deep Clone',
      () => JSON.parse(JSON.stringify(SAMPLE_DATA.campaign)),
      iterations
    );
    results.push(this.formatResult(objectCloneResult, 'Transformation'));

    // Object spread
    const objectSpreadResult = await this.benchmark.benchmark(
      'Object Spread Clone',
      () => ({ ...SAMPLE_DATA.campaign }),
      iterations
    );
    results.push(this.formatResult(objectSpreadResult, 'Transformation'));

    return results;
  }

  /**
   * Run API validation benchmarks
   */
  private async runApiValidationBenchmarks(iterations: number): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Campaign validation
    const campaignResult = await this.benchmark.benchmark(
      'Campaign Response Validation',
      () => validateCampaignResponse(SAMPLE_DATA.campaign),
      iterations
    );
    results.push(this.formatResult(campaignResult, 'API Validation'));

    // User validation
    const userResult = await this.benchmark.benchmark(
      'User Response Validation',
      () => validateUserResponse(SAMPLE_DATA.user),
      iterations
    );
    results.push(this.formatResult(userResult, 'API Validation'));

    // Statistics validation
    const statsResult = await this.benchmark.benchmark(
      'Statistics Response Validation',
      () => validateStatisticsResponse(SAMPLE_DATA.statistics),
      iterations
    );
    results.push(this.formatResult(statsResult, 'API Validation'));

    return results;
  }

  /**
   * Run array processing benchmarks
   */
  private async runArrayProcessingBenchmarks(iterations: number): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    
    // Create test arrays
    const smallArray = Array.from({ length: 100 }, (_, i) => ({
      ...SAMPLE_DATA.campaign,
      id: `${SAMPLE_DATA.uuid}-${i}`
    }));
    
    const mediumArray = Array.from({ length: 1000 }, (_, i) => ({
      ...SAMPLE_DATA.campaign,
      id: `${SAMPLE_DATA.uuid}-${i}`
    }));

    // Small array validation
    const smallArrayResult = await this.benchmark.benchmark(
      'Small Array (100) Validation',
      () => smallArray.every(item => validateCampaignResponse(item).isValid),
      Math.floor(iterations / 10)
    );
    results.push(this.formatResult(smallArrayResult, 'Array Processing'));

    // Medium array validation
    const mediumArrayResult = await this.benchmark.benchmark(
      'Medium Array (1000) Validation',
      () => mediumArray.every(item => validateCampaignResponse(item).isValid),
      Math.floor(iterations / 100)
    );
    results.push(this.formatResult(mediumArrayResult, 'Array Processing'));

    // Array map transformation
    const mapResult = await this.benchmark.benchmark(
      'Array Map Transformation',
      () => smallArray.map(item => ({
        ...item,
        budget: BigInt(item.budget) as SafeBigInt
      })),
      Math.floor(iterations / 10)
    );
    results.push(this.formatResult(mapResult, 'Array Processing'));

    // Array filter
    const filterResult = await this.benchmark.benchmark(
      'Array Filter Operation',
      () => smallArray.filter(item => item.status === 'ACTIVE'),
      Math.floor(iterations / 10)
    );
    results.push(this.formatResult(filterResult, 'Array Processing'));

    return results;
  }

  /**
   * Run cache benchmarks
   */
  private async runCacheBenchmarks(iterations: number): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    // Prime cache
    for (let i = 0; i < 100; i++) {
      transformationMonitor.cacheTransformation(`test-${i}`, { value: i });
    }

    // Cache hit
    const cacheHitResult = await this.benchmark.benchmark(
      'Cache Hit Performance',
      () => transformationMonitor.getCachedTransformation('test-50'),
      iterations
    );
    results.push(this.formatResult(cacheHitResult, 'Cache'));

    // Cache miss
    const cacheMissResult = await this.benchmark.benchmark(
      'Cache Miss Performance',
      () => transformationMonitor.getCachedTransformation('non-existent'),
      iterations
    );
    results.push(this.formatResult(cacheMissResult, 'Cache'));

    // Cache write
    let writeCounter = 0;
    const cacheWriteResult = await this.benchmark.benchmark(
      'Cache Write Performance',
      () => {
        transformationMonitor.cacheTransformation(`write-test-${writeCounter++}`, { value: writeCounter });
      },
      iterations
    );
    results.push(this.formatResult(cacheWriteResult, 'Cache'));

    return results;
  }

  /**
   * Format benchmark result
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatResult(result: any, category: string): BenchmarkResult {
    const opsPerSecond = 1000 / result.average; // Operations per second
    
    return {
      ...result,
      category,
      opsPerSecond
    };
  }

  /**
   * Report benchmark results
   */
  private reportResults(suite: BenchmarkSuite): void {
    logger.info('Performance benchmark suite completed', {
      suiteName: suite.name,
      totalDuration: suite.totalDuration,
      totalBenchmarks: suite.results.length,
      timestamp: new Date(suite.timestamp).toLocaleString()
    }, { component: 'PerformanceBenchmarks' });

    // Group by category
    const categories = new Map<string, BenchmarkResult[]>();
    suite.results.forEach(result => {
      const categoryResults = categories.get(result.category) || [];
      categoryResults.push(result);
      categories.set(result.category, categoryResults);
    });

    // Log results by category
    categories.forEach((results, category) => {
      logger.info(`Benchmark category results: ${category}`, {
        category,
        benchmarkCount: results.length,
        results: results.map(result => ({
          name: result.name,
          averageMs: Number(result.average.toFixed(3)),
          minMs: Number(result.min.toFixed(3)),
          maxMs: Number(result.max.toFixed(3)),
          opsPerSecond: Number(result.opsPerSecond.toFixed(0))
        }))
      }, { component: 'PerformanceBenchmarks' });
    });

    // Record to monitoring service
    performanceMonitor.recordCustomMetric(
      'benchmark_suite_completed',
      suite.totalDuration,
      'ms',
      {
        suite_name: suite.name,
        total_benchmarks: suite.results.length.toString()
      }
    );
  }

  /**
   * Compare two benchmark suites
   */
  compareSuites(suite1: BenchmarkSuite, suite2: BenchmarkSuite): void {
    logger.info('Starting benchmark suite comparison', {
      suite1Name: suite1.name,
      suite2Name: suite2.name,
      suite1Results: suite1.results.length,
      suite2Results: suite2.results.length
    }, { component: 'PerformanceBenchmarks' });

    const results1Map = new Map(suite1.results.map(r => [r.name, r]));
    const results2Map = new Map(suite2.results.map(r => [r.name, r]));

    const comparisons: Array<{
      name: string;
      suite1Average: number;
      suite2Average: number;
      changePercent: number;
      status: string;
    }> = [];

    results1Map.forEach((result1, name) => {
      const result2 = results2Map.get(name);
      if (!result2) return;

      const change = ((result2.average - result1.average) / result1.average) * 100;
      const status = change < 0 ? 'Faster' : change > 5 ? 'Slower' : 'Same';

      comparisons.push({
        name,
        suite1Average: Number(result1.average.toFixed(3)),
        suite2Average: Number(result2.average.toFixed(3)),
        changePercent: Number(change.toFixed(1)),
        status
      });
    });

    logger.info('Benchmark suite comparison completed', {
      comparisons,
      totalComparisons: comparisons.length,
      fasterCount: comparisons.filter(c => c.status === 'Faster').length,
      slowerCount: comparisons.filter(c => c.status === 'Slower').length,
      sameCount: comparisons.filter(c => c.status === 'Same').length
    }, { component: 'PerformanceBenchmarks' });
  }

  /**
   * Get all benchmark suites
   */
  getSuites(): BenchmarkSuite[] {
    return [...this.suites];
  }

  /**
   * Export results to JSON
   */
  exportResults(): string {
    return JSON.stringify(this.suites, null, 2);
  }
}

// Export singleton instance
export const benchmarkRunner = new PerformanceBenchmarkRunner();

/**
 * Run benchmarks on demand
 */
export async function runPerformanceBenchmarks(iterations?: number): Promise<BenchmarkSuite> {
  return benchmarkRunner.runAllBenchmarks(iterations);
}

/**
 * Critical path monitoring decorator
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function criticalPath(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  descriptor.value = async function (...args: any[]) {
    const startTime = performance.now();
    const startMark = `${propertyKey}_start_${Date.now()}`;
    const endMark = `${propertyKey}_end_${Date.now()}`;
    
    performance.mark(startMark);
    
    try {
      const result = await originalMethod.apply(this, args);
      
      performance.mark(endMark);
      performance.measure(propertyKey, startMark, endMark);
      
      const duration = performance.now() - startTime;
      
      performanceMonitor.recordCustomMetric(
        'critical_path_execution',
        duration,
        'ms',
        {
          method: propertyKey,
          class: target.constructor.name
        }
      );
      
      return result;
    } catch (error) {
      performance.mark(endMark);
      
      const duration = performance.now() - startTime;
      
      performanceMonitor.recordCustomMetric(
        'critical_path_error',
        duration,
        'ms',
        {
          method: propertyKey,
          class: target.constructor.name,
          error: error instanceof Error ? error.message : 'unknown'
        }
      );
      
      throw error;
    } finally {
      // Clean up marks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(propertyKey);
    }
  };
  
  return descriptor;
}