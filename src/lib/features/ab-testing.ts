/**
 * A/B Testing Infrastructure
 * Provides experiment management and variant assignment
 *
 * Features:
 * - Experiment configuration and management
 * - Variant assignment with sticky sessions
 * - Conversion tracking and analytics
 * - Statistical significance calculation
 * - Integration with feature flags
 * - Real-time experiment updates
 */

import React from 'react';
import { z } from 'zod';
import { featureFlags, UserContext } from './feature-flags';
import { errorTracker } from '../monitoring/error-tracker';

// Experiment configuration schema
export const ExperimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['draft', 'running', 'paused', 'completed']),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    weight: z.number().min(0).max(100),
    config: z.record(z.unknown()).optional()
  })),
  goals: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['conversion', 'engagement', 'revenue', 'custom']),
    target: z.number().optional()
  })),
  targeting: z.object({
    segments: z.array(z.string()).optional(),
    percentage: z.number().min(0).max(100).default(100),
    filters: z.record(z.unknown()).optional()
  }).optional(),
  metadata: z.record(z.unknown()).optional()
});

export type Experiment = z.infer<typeof ExperimentSchema>;

// Variant assignment result
export interface VariantAssignment {
  experimentId: string;
  variantId: string;
  variantName: string;
  assignedAt: number;
  sticky: boolean;
}

// Conversion event
export interface ConversionEvent {
  experimentId: string;
  variantId: string;
  goalId: string;
  value?: number;
  metadata?: Record<string, unknown>;
  timestamp?: number;
}

// Experiment results
export interface ExperimentResults {
  experimentId: string;
  variants: {
    id: string;
    name: string;
    participants: number;
    conversions: Record<string, number>;
    conversionRate: Record<string, number>;
    revenue?: number;
  }[];
  winner?: string;
  confidence?: number;
  significanceLevel?: number;
}

class ABTestingService {
  private experiments: Map<string, Experiment> = new Map();
  private assignments: Map<string, VariantAssignment> = new Map();
  private conversions: Map<string, ConversionEvent[]> = new Map();
  private storageKey = 'domainflow_ab_tests';
  private analyticsQueue: ConversionEvent[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor() {
    this.loadFromStorage();
    this.startAnalyticsFlush();
    
    // Check if A/B testing is enabled
    if (featureFlags.isEnabled('ab_testing')) {
      this.fetchExperiments();
    }
  }

  /**
   * Get variant assignment for user
   */
  getVariant(experimentId: string, userId?: string): VariantAssignment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') {
      return null;
    }

    // Check if experiment is within date range
    if (experiment.startDate && new Date(experiment.startDate) > new Date()) {
      return null;
    }
    if (experiment.endDate && new Date(experiment.endDate) < new Date()) {
      return null;
    }

    // Check targeting
    if (!this.isUserEligible(experiment, userId)) {
      return null;
    }

    // Check for existing assignment
    const assignmentKey = this.getAssignmentKey(experimentId, userId);
    const existingAssignment = this.assignments.get(assignmentKey);
    
    if (existingAssignment) {
      return existingAssignment;
    }

    // Assign variant
    const variant = this.assignVariant(experiment, userId);
    if (!variant) {
      return null;
    }

    const assignment: VariantAssignment = {
      experimentId,
      variantId: variant.id,
      variantName: variant.name,
      assignedAt: Date.now(),
      sticky: true
    };

    this.assignments.set(assignmentKey, assignment);
    this.saveToStorage();

    // Track assignment
    this.trackEvent('experiment_assigned', {
      experimentId,
      variantId: variant.id,
      userId
    });

    return assignment;
  }

  /**
   * Track conversion event
   */
  trackConversion(event: ConversionEvent): void {
    const experiment = this.experiments.get(event.experimentId);
    if (!experiment) {
      console.warn(`Experiment ${event.experimentId} not found`);
      return;
    }

    // Validate goal exists
    const goal = experiment.goals.find(g => g.id === event.goalId);
    if (!goal) {
      console.warn(`Goal ${event.goalId} not found in experiment ${event.experimentId}`);
      return;
    }

    // Store conversion
    const conversions = this.conversions.get(event.experimentId) || [];
    conversions.push({
      ...event,
      timestamp: Date.now()
    });
    this.conversions.set(event.experimentId, conversions);

    // Queue for analytics
    this.analyticsQueue.push(event);

    // Track event
    this.trackEvent('conversion_tracked', {
      experimentId: event.experimentId,
      variantId: event.variantId,
      goalId: event.goalId,
      value: event.value
    });
  }

  /**
   * Get experiment results
   */
  getResults(experimentId: string): ExperimentResults | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      return null;
    }

    const conversions = this.conversions.get(experimentId) || [];
    const results: ExperimentResults = {
      experimentId,
      variants: []
    };

    // Calculate results for each variant
    experiment.variants.forEach(variant => {
      const variantAssignments = Array.from(this.assignments.values())
        .filter(a => a.experimentId === experimentId && a.variantId === variant.id);
      
      const variantConversions = conversions.filter(c => c.variantId === variant.id);
      
      const conversionsByGoal: Record<string, number> = {};
      const conversionRateByGoal: Record<string, number> = {};
      let totalRevenue = 0;

      experiment.goals.forEach(goal => {
        const goalConversions = variantConversions.filter(c => c.goalId === goal.id);
        conversionsByGoal[goal.id] = goalConversions.length;
        conversionRateByGoal[goal.id] = variantAssignments.length > 0
          ? (goalConversions.length / variantAssignments.length) * 100
          : 0;
        
        if (goal.type === 'revenue') {
          totalRevenue += goalConversions.reduce((sum, c) => sum + (c.value || 0), 0);
        }
      });

      results.variants.push({
        id: variant.id,
        name: variant.name,
        participants: variantAssignments.length,
        conversions: conversionsByGoal,
        conversionRate: conversionRateByGoal,
        revenue: totalRevenue > 0 ? totalRevenue : undefined
      });
    });

    // Calculate statistical significance if enough data
    if (results.variants.length === 2) {
      const variantA = results.variants[0];
      const variantB = results.variants[1];
      if (variantA && variantB && variantA.participants >= 100 && variantB.participants >= 100) {
        const significance = this.calculateSignificance(variantA, variantB);
        if (significance) {
          results.winner = significance.winner;
          results.confidence = significance.confidence;
          results.significanceLevel = significance.pValue;
        }
      }
    }

    return results;
  }

  /**
   * Add or update experiment
   */
  addExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.id, experiment);
    this.saveToStorage();
    
    // Create feature flag for experiment
    featureFlags.override(`experiment_${experiment.id}`, {
      enabled: experiment.status === 'running',
      variants: experiment.variants.map(v => ({
        key: v.id,
        value: v.config || {},
        weight: v.weight
      }))
    });
  }

  /**
   * Stop experiment
   */
  stopExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.status = 'completed';
      experiment.endDate = new Date().toISOString();
      this.saveToStorage();
      
      // Disable feature flag
      featureFlags.override(`experiment_${experimentId}`, false);
    }
  }

  /**
   * Check if user is eligible for experiment
   */
  private isUserEligible(experiment: Experiment, userId?: string): boolean {
    if (!experiment.targeting) {
      return true;
    }

    // Check percentage rollout
    if (experiment.targeting.percentage < 100) {
      const hash = this.hashString(experiment.id + ':' + (userId || 'anonymous'));
      if ((hash % 100) >= experiment.targeting.percentage) {
        return false;
      }
    }

    // Check segments
    if (experiment.targeting.segments && experiment.targeting.segments.length > 0) {
      const userContext = this.getUserContext();
      if (!userContext.segment || !experiment.targeting.segments.includes(userContext.segment)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Assign variant to user
   */
  private assignVariant(experiment: Experiment, userId?: string): Experiment['variants'][0] | null {
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight === 0) return null;

    const hash = this.hashString(experiment.id + ':' + (userId || 'anonymous'));
    const roll = hash % totalWeight;

    let cumulativeWeight = 0;
    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (roll < cumulativeWeight) {
        return variant;
      }
    }

    return experiment.variants[0] || null;
  }

  /**
   * Calculate statistical significance
   */
  private calculateSignificance(
    variantA: ExperimentResults['variants'][0],
    variantB: ExperimentResults['variants'][0]
  ): { winner: string; confidence: number; pValue: number } | null {
    // Use the first goal for significance calculation
    const goalId = Object.keys(variantA.conversions)[0];
    if (!goalId) return null;

    const conversionsA = variantA.conversions[goalId] || 0;
    const conversionsB = variantB.conversions[goalId] || 0;
    const visitorsA = variantA.participants;
    const visitorsB = variantB.participants;

    if (visitorsA < 30 || visitorsB < 30) return null;

    // Calculate conversion rates
    const rateA = conversionsA / visitorsA;
    const rateB = conversionsB / visitorsB;

    // Calculate pooled probability
    const pooledProbability = (conversionsA + conversionsB) / (visitorsA + visitorsB);

    // Calculate standard error
    const standardError = Math.sqrt(
      pooledProbability * (1 - pooledProbability) * (1 / visitorsA + 1 / visitorsB)
    );

    // Calculate z-score
    const zScore = Math.abs(rateA - rateB) / standardError;

    // Calculate p-value (two-tailed test)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    // Determine winner
    const winner = rateA > rateB ? variantA.id : variantB.id;
    const confidence = (1 - pValue) * 100;

    return {
      winner,
      confidence,
      pValue
    };
  }

  /**
   * Normal cumulative distribution function
   */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2.0);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Hash string to number
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get assignment key
   */
  private getAssignmentKey(experimentId: string, userId?: string): string {
    return `${experimentId}:${userId || 'anonymous'}`;
  }

  /**
   * Get user context from feature flags
   */
  private getUserContext(): UserContext {
    // This would be implemented to get user context from feature flags service
    return {};
  }

  /**
   * Track analytics event
   */
  private trackEvent(eventName: string, _data: Record<string, unknown>): void {
    if (typeof window !== 'undefined' && 'performance' in window) {
      performance.mark(`ab_test_${eventName}`);
    }
  }

  /**
   * Fetch experiments from API
   */
  private async fetchExperiments(): Promise<void> {
    try {
      // This would fetch from your API
      // For now, we'll use local experiments
    } catch (error) {
      errorTracker.trackError(error as Error, {
        component: 'ABTestingService',
        url: '/api/experiments',
        metadata: { operation: 'fetchExperiments' }
      });
    }
  }

  /**
   * Start analytics flush interval
   */
  private startAnalyticsFlush(): void {
    this.flushInterval = setInterval(() => {
      if (this.analyticsQueue.length > 0) {
        this.flushAnalytics();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Flush analytics to backend
   */
  private async flushAnalytics(): Promise<void> {
    if (this.analyticsQueue.length === 0) return;

    const events = [...this.analyticsQueue];
    this.analyticsQueue = [];

    try {
      // Send to analytics endpoint
      // await fetch('/api/analytics/ab-tests', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ events })
      // });
    } catch (error) {
      // Re-queue events on failure
      this.analyticsQueue.unshift(...events);
      errorTracker.trackError(error as Error, {
        component: 'ABTestingService',
        url: '/api/analytics/ab-tests',
        metadata: { operation: 'flushAnalytics' }
      });
    }
  }

  /**
   * Save to local storage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const data = {
        experiments: Array.from(this.experiments.entries()),
        assignments: Array.from(this.assignments.entries()),
        conversions: Array.from(this.conversions.entries()),
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save A/B test data:', error);
    }
  }

  /**
   * Load from local storage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return;

      const data = JSON.parse(stored);
      
      // Restore data
      data.experiments?.forEach(([id, exp]: [string, Experiment]) => {
        this.experiments.set(id, exp);
      });
      
      data.assignments?.forEach(([key, assignment]: [string, VariantAssignment]) => {
        this.assignments.set(key, assignment);
      });
      
      data.conversions?.forEach(([id, events]: [string, ConversionEvent[]]) => {
        this.conversions.set(id, events);
      });
    } catch (error) {
      console.error('Failed to load A/B test data:', error);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined;
    }
    
    // Flush remaining analytics
    this.flushAnalytics();
  }
}

// Export singleton instance
export const abTesting = new ABTestingService();

// React hook for A/B testing
export function useABTest(experimentId: string): {
  variant: string | null;
  trackConversion: (goalId: string, value?: number) => void;
} {
  const assignment = abTesting.getVariant(experimentId);
  
  const trackConversion = (goalId: string, value?: number) => {
    if (assignment) {
      abTesting.trackConversion({
        experimentId,
        variantId: assignment.variantId,
        goalId,
        value
      });
    }
  };

  return {
    variant: assignment?.variantId || null,
    trackConversion
  };
}

// Component wrapper for A/B tests
export function ABTest({
  experimentId,
  children
}: {
  experimentId: string;
  children: (variant: string | null) => React.ReactNode;
}) {
  const { variant } = useABTest(experimentId);
  return React.createElement(React.Fragment, null, children(variant));
}