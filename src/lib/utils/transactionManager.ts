/**
 * Transaction Manager for Service Operations
 * Provides transaction-like behavior for complex multi-step operations
 * with rollback capabilities on failure
 */

import { ApiError } from '@/lib/api/transformers/error-transformers';

export interface TransactionStep<T = unknown> {
  name: string;
  execute: () => Promise<T>;
  rollback?: (result: T) => Promise<void>;
  retryable?: boolean;
  maxRetries?: number;
}

export interface TransactionOptions {
  isolationLevel?: 'read-uncommitted' | 'read-committed' | 'repeatable-read' | 'serializable';
  timeout?: number;
  retryDelayMs?: number;
}

export interface TransactionResult<T> {
  success: boolean;
  results: Map<string, T>;
  errors: Map<string, Error>;
  rolledBack: boolean;
}

export class TransactionManager {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second

  /**
   * Execute a series of steps as a transaction
   * If any step fails, all previous steps are rolled back
   */
  static async executeTransaction<T = unknown>(
    steps: TransactionStep<T>[],
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const results = new Map<string, T>();
    const errors = new Map<string, Error>();
    const completedSteps: Array<{ step: TransactionStep<T>; result: T }> = [];
    let rolledBack = false;

    const timeout = options.timeout || this.DEFAULT_TIMEOUT;
    const retryDelay = options.retryDelayMs || this.DEFAULT_RETRY_DELAY;

    try {
      // Execute each step with timeout
      for (const step of steps) {
        try {
          const result = await this.executeStepWithRetry(step, retryDelay, timeout);
          results.set(step.name, result);
          completedSteps.push({ step, result });
        } catch (error) {
          errors.set(step.name, error as Error);
          
          // Rollback all completed steps
          await this.rollbackSteps(completedSteps);
          rolledBack = true;
          
          return {
            success: false,
            results,
            errors,
            rolledBack
          };
        }
      }

      return {
        success: true,
        results,
        errors,
        rolledBack: false
      };
    } catch (error) {
      // Global error during transaction
      errors.set('transaction', error as Error);
      
      if (completedSteps.length > 0) {
        await this.rollbackSteps(completedSteps);
        rolledBack = true;
      }
      
      return {
        success: false,
        results,
        errors,
        rolledBack
      };
    }
  }

  /**
   * Execute a single step with retry logic
   */
  private static async executeStepWithRetry<T>(
    step: TransactionStep<T>,
    retryDelay: number,
    timeout: number
  ): Promise<T> {
    const maxRetries = step.retryable ? (step.maxRetries || 3) : 0;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Execute with timeout
        const result = await Promise.race([
          step.execute(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Step '${step.name}' timed out after ${timeout}ms`)), timeout)
          )
        ]);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry if it's an ApiError with specific status codes
        if (error instanceof ApiError) {
          const nonRetryableStatuses = [400, 401, 403, 404, 422];
          if (nonRetryableStatuses.includes(error.statusCode)) {
            throw error;
          }
        }
        
        // If we have retries left, wait and try again
        if (attempt < maxRetries) {
          console.warn(`Step '${step.name}' failed on attempt ${attempt + 1}, retrying...`, error);
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error(`Step '${step.name}' failed after ${maxRetries + 1} attempts`);
  }

  /**
   * Rollback completed steps in reverse order
   */
  private static async rollbackSteps<T>(
    completedSteps: Array<{ step: TransactionStep<T>; result: T }>
  ): Promise<void> {
    console.log('Rolling back transaction steps...');
    
    // Rollback in reverse order
    for (let i = completedSteps.length - 1; i >= 0; i--) {
      const item = completedSteps[i];
      if (!item) continue;
      
      const { step, result } = item;
      
      if (step.rollback) {
        try {
          console.log(`Rolling back step: ${step.name}`);
          await step.rollback(result);
        } catch (error) {
          console.error(`Failed to rollback step '${step.name}':`, error);
          // Continue with other rollbacks even if one fails
        }
      }
    }
  }

  /**
   * Create a transaction context for multiple related operations
   */
  static createContext(): TransactionContext {
    return new TransactionContext();
  }
}

/**
 * Transaction context for managing related operations
 */
export class TransactionContext {
  private steps: TransactionStep[] = [];
  private metadata = new Map<string, unknown>();

  /**
   * Add a step to the transaction
   */
  addStep<T>(step: TransactionStep<T>): this {
    this.steps.push(step as TransactionStep);
    return this;
  }

  /**
   * Set metadata for the transaction
   */
  setMetadata(key: string, value: unknown): this {
    this.metadata.set(key, value);
    return this;
  }

  /**
   * Get metadata
   */
  getMetadata(key: string): unknown {
    return this.metadata.get(key);
  }

  /**
   * Execute the transaction
   */
  async execute(options?: TransactionOptions): Promise<TransactionResult<unknown>> {
    return TransactionManager.executeTransaction(this.steps, options);
  }

  /**
   * Get the number of steps
   */
  getStepCount(): number {
    return this.steps.length;
  }

  /**
   * Clear the context
   */
  clear(): void {
    this.steps = [];
    this.metadata.clear();
  }
}

/**
 * Decorator for transactional methods
 */
export function Transactional(options?: TransactionOptions) {
  return function (target: object, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function (this: Record<string, unknown>, ...args: unknown[]) {
      const context = TransactionManager.createContext();
      
      // Store context in a way the method can access it
      this.__transactionContext = context;
      
      try {
        const result = await originalMethod.apply(this, args);
        
        // If the method added steps to the context, execute them
        if (context.getStepCount() > 0) {
          const txResult = await context.execute(options);
          if (!txResult.success) {
            throw new Error('Transaction failed');
          }
        }
        
        return result;
      } finally {
        delete this.__transactionContext;
      }
    };

    return descriptor;
  };
}

/**
 * Example usage:
 * 
 * const transaction = TransactionManager.createContext()
 *   .addStep({
 *     name: 'createCampaign',
 *     execute: async () => {
 *       const campaign = await campaignService.createCampaign(data);
 *       return campaign.id;
 *     },
 *     rollback: async (campaignId) => {
 *       await campaignService.deleteCampaign(campaignId);
 *     },
 *     retryable: true,
 *     maxRetries: 2
 *   })
 *   .addStep({
 *     name: 'createPersonas',
 *     execute: async () => {
 *       const personas = await personaService.createBatch(personaData);
 *       return personas.map(p => p.id);
 *     },
 *     rollback: async (personaIds) => {
 *       await personaService.deleteBatch(personaIds);
 *     }
 *   });
 * 
 * const result = await transaction.execute({ timeout: 60000 });
 * 
 * if (result.success) {
 *   console.log('Transaction completed successfully');
 * } else {
 *   console.error('Transaction failed and was rolled back');
 * }
 */