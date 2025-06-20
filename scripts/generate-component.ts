#!/usr/bin/env ts-node

/**
 * Component Code Generation Script
 * Generates boilerplate code for common patterns in DomainFlow
 * 
 * Features:
 * - React component generation with TypeScript
 * - Test file generation
 * - Storybook story generation
 * - API endpoint generation
 * - Service layer generation
 * - Custom hook generation
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { z } from 'zod';
// @ts-ignore - inquirer types not critical for script
import inquirer from 'inquirer';

// Template type definitions
type TemplateType = 'component' | 'page' | 'api' | 'service' | 'hook' | 'test';

interface GeneratorConfig {
  name: string;
  type: TemplateType;
  path?: string;
  features?: string[];
}

// Component feature flags
const ComponentFeatures = {
  STATE: 'state',
  PROPS: 'props',
  MEMO: 'memo',
  FORWARD_REF: 'forwardRef',
  ERROR_BOUNDARY: 'errorBoundary',
  SUSPENSE: 'suspense',
  MONITORING: 'monitoring',
  ACCESSIBILITY: 'accessibility',
  TESTS: 'tests',
  STORIES: 'stories'
} as const;

class CodeGenerator {
  private projectRoot: string;

  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
  }

  async generate(): Promise<void> {
    console.log(chalk.blue.bold('\n🎯 DomainFlow Code Generator\n'));

    try {
      const config = await this.promptForConfig();
      await this.validateConfig(config);
      await this.generateFiles(config);
      
      console.log(chalk.green.bold('\n✅ Code generation completed successfully!\n'));
      this.printNextSteps(config);
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Code generation failed:'), error);
      process.exit(1);
    }
  }

  private async promptForConfig(): Promise<GeneratorConfig> {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: 'What would you like to generate?',
        choices: [
          { name: 'React Component', value: 'component' },
          { name: 'Next.js Page', value: 'page' },
          { name: 'API Endpoint', value: 'api' },
          { name: 'Service Layer', value: 'service' },
          { name: 'Custom Hook', value: 'hook' },
          { name: 'Test Suite', value: 'test' }
        ]
      },
      {
        type: 'input',
        name: 'name',
        message: 'Enter the name (e.g., UserProfile, auth, useDebounce):',
        validate: (input: string) => {
          if (!input.trim()) return 'Name is required';
          if (!/^[A-Za-z][A-Za-z0-9]*$/.test(input)) {
            return 'Name must start with a letter and contain only alphanumeric characters';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'path',
        message: 'Enter the relative path (optional, press enter for default):',
        default: (answers: any) => this.getDefaultPath(answers.type, answers.name)
      },
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select features to include:',
        choices: (answers: any) => this.getFeatureChoices(answers.type),
        when: (answers: any) => ['component', 'page'].includes(answers.type)
      }
    ]);

    return answers as GeneratorConfig;
  }

  private async validateConfig(config: GeneratorConfig): Promise<void> {
    const targetPath = path.join(this.projectRoot, config.path || '');
    const fileName = this.getFileName(config);
    const filePath = path.join(targetPath, fileName);

    if (fs.existsSync(filePath)) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `File ${filePath} already exists. Overwrite?`,
          default: false
        }
      ]);

      if (!overwrite) {
        throw new Error('Generation cancelled by user');
      }
    }
  }

  private async generateFiles(config: GeneratorConfig): Promise<void> {
    const targetPath = path.join(this.projectRoot, config.path || '');
    
    // Ensure directory exists
    fs.mkdirSync(targetPath, { recursive: true });

    switch (config.type) {
      case 'component':
        await this.generateComponent(config, targetPath);
        break;
      case 'page':
        await this.generatePage(config, targetPath);
        break;
      case 'api':
        await this.generateApiEndpoint(config, targetPath);
        break;
      case 'service':
        await this.generateService(config, targetPath);
        break;
      case 'hook':
        await this.generateHook(config, targetPath);
        break;
      case 'test':
        await this.generateTest(config, targetPath);
        break;
    }
  }

  private async generateComponent(config: GeneratorConfig, targetPath: string): Promise<void> {
    const componentName = this.pascalCase(config.name);
    const fileName = `${componentName}.tsx`;
    const filePath = path.join(targetPath, fileName);

    const hasState = config.features?.includes(ComponentFeatures.STATE);
    const hasProps = config.features?.includes(ComponentFeatures.PROPS);
    const isMemo = config.features?.includes(ComponentFeatures.MEMO);
    const hasForwardRef = config.features?.includes(ComponentFeatures.FORWARD_REF);
    const hasMonitoring = config.features?.includes(ComponentFeatures.MONITORING);
    const hasAccessibility = config.features?.includes(ComponentFeatures.ACCESSIBILITY);

    let imports = [`import React${isMemo ? ', { memo' : ''}${hasState ? ', { useState, useEffect }' : ''}${hasForwardRef ? ', { forwardRef }' : ''} from 'react';`];
    
    if (hasMonitoring) {
      imports.push(`import { usePerformanceMonitor } from '@/lib/hooks/usePerformanceMonitor';`);
      imports.push(`import { errorTracker } from '@/lib/monitoring/error-tracker';`);
    }

    const propsInterface = hasProps ? `
export interface ${componentName}Props {
  /**
   * Component ID for accessibility
   */
  id?: string;
  
  /**
   * CSS class name
   */
  className?: string;
  
  /**
   * Children elements
   */
  children?: React.ReactNode;
  
  // TODO: Add specific props for ${componentName}
}` : '';

    const componentBody = `
${hasMonitoring ? `  const perfMonitor = usePerformanceMonitor('${componentName}');` : ''}
${hasState ? `  const [state, setState] = useState<any>(null);` : ''}

${hasMonitoring ? `
  useEffect(() => {
    perfMonitor.markRender();
    return () => {
      perfMonitor.cleanup();
    };
  }, []);
` : ''}

  return (
    <div
      ${hasProps ? 'id={id}' : ''}
      ${hasProps ? 'className={className}' : ''}
      ${hasAccessibility ? `role="region"
      aria-label="${componentName}"` : ''}
    >
      ${hasProps ? '{children}' : `<h2>${componentName}</h2>`}
      {/* TODO: Implement ${componentName} content */}
    </div>
  );`;

    const componentDefinition = hasForwardRef
      ? `const ${componentName} = forwardRef<HTMLDivElement, ${componentName}Props>(
  ({ ${hasProps ? 'id, className, children' : ''} }, ref) => {
${componentBody}
  }
);

${componentName}.displayName = '${componentName}';`
      : `function ${componentName}(${hasProps ? `{ id, className, children }: ${componentName}Props` : ''}) {
${componentBody}
}`;

    const content = `/**
 * ${componentName} Component
 * 
 * ${this.generateDescription(componentName)}
 * 
 * @component
 * @example
 * \`\`\`tsx
 * <${componentName}${hasProps ? ' id="example" className="custom-class"' : ''}>
 *   Content goes here
 * </${componentName}>
 * \`\`\`
 */

${imports.join('\n')}
${propsInterface}

${isMemo ? 'export const ' : 'export '}${componentDefinition}${isMemo ? `

export default memo(${componentName});` : `

export default ${componentName};`}
`;

    fs.writeFileSync(filePath, content);
    console.log(chalk.green(`✓ Created component: ${filePath}`));

    // Generate test file if requested
    if (config.features?.includes(ComponentFeatures.TESTS)) {
      await this.generateComponentTest(componentName, targetPath);
    }

    // Generate Storybook story if requested
    if (config.features?.includes(ComponentFeatures.STORIES)) {
      await this.generateStorybook(componentName, targetPath);
    }
  }

  private async generatePage(config: GeneratorConfig, targetPath: string): Promise<void> {
    const pageName = this.pascalCase(config.name);
    const fileName = 'page.tsx';
    const filePath = path.join(targetPath, fileName);

    const content = `/**
 * ${pageName} Page
 * 
 * ${this.generateDescription(pageName)}
 */

import React from 'react';
import { Metadata } from 'next';
import { PageHeader } from '@/components/shared/PageHeader';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export const metadata: Metadata = {
  title: '${pageName} | DomainFlow',
  description: '${this.generateDescription(pageName)}',
};

export default function ${pageName}Page() {
  return (
    <ProtectedRoute requiredPermission="view_${this.camelCase(config.name)}">
      <div className="container mx-auto py-6">
        <PageHeader
          title="${this.titleCase(config.name)}"
          description="${this.generateDescription(pageName)}"
        />
        
        <div className="mt-6">
          {/* TODO: Implement ${pageName} page content */}
          <p>Welcome to the ${pageName} page!</p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
`;

    fs.writeFileSync(filePath, content);
    console.log(chalk.green(`✓ Created page: ${filePath}`));
  }

  private async generateApiEndpoint(config: GeneratorConfig, targetPath: string): Promise<void> {
    const routeName = this.kebabCase(config.name);
    const fileName = 'route.ts';
    const filePath = path.join(targetPath, fileName);

    const content = `/**
 * ${this.titleCase(config.name)} API Endpoint
 * 
 * ${this.generateDescription(config.name)}
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorTracker } from '@/lib/monitoring/error-tracker';
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';
import { rateLimiter } from '@/lib/security/rate-limiter';

// Request/Response schemas
const RequestSchema = z.object({
  // TODO: Define request schema
});

const ResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
});

type RequestBody = z.infer<typeof RequestSchema>;
type ResponseBody = z.infer<typeof ResponseSchema>;

/**
 * GET /api/${routeName}
 * Retrieve ${config.name} data
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check rate limit
    const rateLimitResult = await rateLimiter.checkLimit('/api/${routeName}');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: rateLimitResult.reason },
        { status: 429 }
      );
    }

    // TODO: Implement GET logic
    const data = {
      message: 'GET ${config.name} endpoint'
    };

    // Track performance
    performanceMonitor.measureApiCall('/api/${routeName}', Date.now() - startTime);

    return NextResponse.json({
      success: true,
      data
    } satisfies ResponseBody);
  } catch (error) {
    errorTracker.trackError(error as Error, {
      url: '/api/${routeName}',
      method: 'GET'
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/${routeName}
 * Create new ${config.name}
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check rate limit
    const rateLimitResult = await rateLimiter.checkLimit('/api/${routeName}');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: rateLimitResult.reason },
        { status: 429 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = RequestSchema.parse(body);

    // TODO: Implement POST logic
    const data = {
      message: 'POST ${config.name} endpoint',
      received: validatedData
    };

    // Track performance
    performanceMonitor.measureApiCall('/api/${routeName}', Date.now() - startTime);

    return NextResponse.json({
      success: true,
      data
    } satisfies ResponseBody);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    errorTracker.trackError(error as Error, {
      url: '/api/${routeName}',
      method: 'POST'
    });

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
`;

    fs.writeFileSync(filePath, content);
    console.log(chalk.green(`✓ Created API endpoint: ${filePath}`));
  }

  private async generateService(config: GeneratorConfig, targetPath: string): Promise<void> {
    const serviceName = this.pascalCase(config.name);
    const fileName = `${this.camelCase(config.name)}Service.ts`;
    const filePath = path.join(targetPath, fileName);

    const content = `/**
 * ${serviceName} Service
 * 
 * ${this.generateDescription(serviceName)}
 * 
 * Features:
 * - Singleton pattern
 * - Error handling and recovery
 * - Performance monitoring
 * - Caching support
 * - Type safety
 */

import { z } from 'zod';
import { errorTracker } from '@/lib/monitoring/error-tracker';
import { performanceMonitor } from '@/lib/monitoring/performance-monitor';
import { apiClient } from '@/lib/services/apiClient.production';

// Data schemas
export const ${serviceName}Schema = z.object({
  id: z.string(),
  // TODO: Define ${serviceName} schema
});

export type ${serviceName} = z.infer<typeof ${serviceName}Schema>;

class ${serviceName}Service {
  private static instance: ${serviceName}Service;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ${serviceName}Service {
    if (!${serviceName}Service.instance) {
      ${serviceName}Service.instance = new ${serviceName}Service();
    }
    return ${serviceName}Service.instance;
  }

  /**
   * Get all ${this.camelCase(config.name)}s
   */
  async getAll(): Promise<${serviceName}[]> {
    const cacheKey = 'all_${this.camelCase(config.name)}s';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startTime = Date.now();
      
      // TODO: Implement API call
      const response = await apiClient.get('/${this.kebabCase(config.name)}s');
      const data = z.array(${serviceName}Schema).parse(response.data);
      
      this.setCache(cacheKey, data);
      
      // Track performance
      performanceMonitor.measureApiCall('get_all_${this.camelCase(config.name)}s', Date.now() - startTime);
      
      return data;
    } catch (error) {
      errorTracker.trackError(error as Error, {
        component: '${serviceName}Service',
        method: 'getAll'
      });
      throw error;
    }
  }

  /**
   * Get ${this.camelCase(config.name)} by ID
   */
  async getById(id: string): Promise<${serviceName} | null> {
    const cacheKey = \`${this.camelCase(config.name)}_\${id}\`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startTime = Date.now();
      
      // TODO: Implement API call
      const response = await apiClient.get(\`/${this.kebabCase(config.name)}s/\${id}\`);
      const data = ${serviceName}Schema.parse(response.data);
      
      this.setCache(cacheKey, data);
      
      // Track performance
      performanceMonitor.measureApiCall('get_${this.camelCase(config.name)}_by_id', Date.now() - startTime);
      
      return data;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        return null;
      }
      
      errorTracker.trackError(error as Error, {
        component: '${serviceName}Service',
        method: 'getById',
        metadata: { id }
      });
      throw error;
    }
  }

  /**
   * Create new ${this.camelCase(config.name)}
   */
  async create(data: Omit<${serviceName}, 'id'>): Promise<${serviceName}> {
    try {
      const startTime = Date.now();
      
      // TODO: Implement API call
      const response = await apiClient.post('/${this.kebabCase(config.name)}s', data);
      const created = ${serviceName}Schema.parse(response.data);
      
      // Invalidate cache
      this.clearCache();
      
      // Track performance
      performanceMonitor.measureApiCall('create_${this.camelCase(config.name)}', Date.now() - startTime);
      
      return created;
    } catch (error) {
      errorTracker.trackError(error as Error, {
        component: '${serviceName}Service',
        method: 'create'
      });
      throw error;
    }
  }

  /**
   * Update ${this.camelCase(config.name)}
   */
  async update(id: string, data: Partial<${serviceName}>): Promise<${serviceName}> {
    try {
      const startTime = Date.now();
      
      // TODO: Implement API call
      const response = await apiClient.put(\`/${this.kebabCase(config.name)}s/\${id}\`, data);
      const updated = ${serviceName}Schema.parse(response.data);
      
      // Update cache
      this.setCache(\`${this.camelCase(config.name)}_\${id}\`, updated);
      this.cache.delete('all_${this.camelCase(config.name)}s');
      
      // Track performance
      performanceMonitor.measureApiCall('update_${this.camelCase(config.name)}', Date.now() - startTime);
      
      return updated;
    } catch (error) {
      errorTracker.trackError(error as Error, {
        component: '${serviceName}Service',
        method: 'update',
        metadata: { id }
      });
      throw error;
    }
  }

  /**
   * Delete ${this.camelCase(config.name)}
   */
  async delete(id: string): Promise<void> {
    try {
      const startTime = Date.now();
      
      // TODO: Implement API call
      await apiClient.delete(\`/${this.kebabCase(config.name)}s/\${id}\`);
      
      // Clear from cache
      this.cache.delete(\`${this.camelCase(config.name)}_\${id}\`);
      this.cache.delete('all_${this.camelCase(config.name)}s');
      
      // Track performance
      performanceMonitor.measureApiCall('delete_${this.camelCase(config.name)}', Date.now() - startTime);
    } catch (error) {
      errorTracker.trackError(error as Error, {
        component: '${serviceName}Service',
        method: 'delete',
        metadata: { id }
      });
      throw error;
    }
  }

  /**
   * Get from cache
   */
  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Set cache
   */
  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const ${this.camelCase(config.name)}Service = ${serviceName}Service.getInstance();
`;

    fs.writeFileSync(filePath, content);
    console.log(chalk.green(`✓ Created service: ${filePath}`));
  }

  private async generateHook(config: GeneratorConfig, targetPath: string): Promise<void> {
    const hookName = config.name.startsWith('use') ? config.name : `use${this.pascalCase(config.name)}`;
    const fileName = `${hookName}.ts`;
    const filePath = path.join(targetPath, fileName);

    const content = `/**
 * ${hookName} Hook
 * 
 * ${this.generateDescription(hookName)}
 * 
 * @example
 * \`\`\`tsx
 * const { data, loading, error } = ${hookName}();
 * \`\`\`
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { errorTracker } from '@/lib/monitoring/error-tracker';

export interface ${hookName}Options {
  /**
   * Initial value
   */
  initialValue?: any;
  
  /**
   * Debounce delay in milliseconds
   */
  debounceMs?: number;
  
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

export interface ${hookName}Result {
  /**
   * Current data
   */
  data: any;
  
  /**
   * Loading state
   */
  loading: boolean;
  
  /**
   * Error state
   */
  error: Error | null;
  
  /**
   * Refetch function
   */
  refetch: () => void;
}

export function ${hookName}(options: ${hookName}Options = {}): ${hookName}Result {
  const {
    initialValue = null,
    debounceMs = 0,
    debug = false
  } = options;

  const [data, setData] = useState<any>(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const mounted = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout>();

  /**
   * Main logic function
   */
  const execute = useCallback(async () => {
    if (!mounted.current) return;

    try {
      setLoading(true);
      setError(null);
      
      // TODO: Implement hook logic
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (mounted.current) {
        setData('Hook data');
      }
    } catch (err) {
      const error = err as Error;
      
      if (mounted.current) {
        setError(error);
      }
      
      errorTracker.trackError(error, {
        component: '${hookName}',
        metadata: options
      });
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [options]);

  /**
   * Debounced execute
   */
  const debouncedExecute = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (debounceMs > 0) {
      timeoutRef.current = setTimeout(execute, debounceMs);
    } else {
      execute();
    }
  }, [execute, debounceMs]);

  /**
   * Refetch function
   */
  const refetch = useCallback(() => {
    if (debug) {
      console.log('${hookName}: Refetching data');
    }
    debouncedExecute();
  }, [debouncedExecute, debug]);

  /**
   * Effect for initial load
   */
  useEffect(() => {
    debouncedExecute();
    
    return () => {
      mounted.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    refetch
  };
}
`;

    fs.writeFileSync(filePath, content);
    console.log(chalk.green(`✓ Created hook: ${filePath}`));
  }

  private async generateComponentTest(componentName: string, targetPath: string): Promise<void> {
    const testFileName = `${componentName}.test.tsx`;
    const testFilePath = path.join(targetPath, '__tests__', testFileName);
    
    // Create __tests__ directory if it doesn't exist
    const testDir = path.join(targetPath, '__tests__');
    fs.mkdirSync(testDir, { recursive: true });

    const content = `/**
 * ${componentName} Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ${componentName} } from '../${componentName}';

describe('${componentName}', () => {
  it('should render successfully', () => {
    const { container } = render(<${componentName} />);
    expect(container).toBeTruthy();
  });

  it('should have correct accessibility attributes', () => {
    render(<${componentName} id="test-id" />);
    const element = screen.getByRole('region');
    expect(element).toHaveAttribute('aria-label', '${componentName}');
  });

  it('should apply custom className', () => {
    const { container } = render(<${componentName} className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should render children', () => {
    render(
      <${componentName}>
        <span>Test Content</span>
      </${componentName}>
    );
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  // TODO: Add more specific tests for ${componentName}
});
`;

    fs.writeFileSync(testFilePath, content);
    console.log(chalk.green(`✓ Created test file: ${testFilePath}`));
  }

  private async generateStorybook(componentName: string, targetPath: string): Promise<void> {
    const storyFileName = `${componentName}.stories.tsx`;
    const storyFilePath = path.join(targetPath, storyFileName);

    const content = `/**
 * ${componentName} Storybook Stories
 */

import type { Meta, StoryObj } from '@storybook/react';
import { ${componentName} } from './${componentName}';

const meta = {
  title: 'Components/${componentName}',
  component: ${componentName},
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    className: { control: 'text' },
    id: { control: 'text' },
  },
} satisfies Meta<typeof ${componentName}>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Default ${componentName} content',
  },
};

export const WithCustomClass: Story = {
  args: {
    className: 'bg-blue-500 p-4 rounded',
    children: 'Styled ${componentName}',
  },
};

export const Empty: Story = {
  args: {},
};

// TODO: Add more story variants for ${componentName}
`;

    fs.writeFileSync(storyFilePath, content);
    console.log(chalk.green(`✓ Created Storybook story: ${storyFilePath}`));
  }

  private async generateTest(config: GeneratorConfig, targetPath: string): Promise<void> {
    const testName = config.name.endsWith('.test') ? config.name : `${config.name}.test`;
    const fileName = `${testName}.ts`;
    const filePath = path.join(targetPath, fileName);

    const content = `/**
 * ${this.titleCase(config.name)} Test Suite
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('${this.titleCase(config.name)}', () => {
  beforeEach(() => {
    // Setup before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup after each test
  });

  describe('Basic functionality', () => {
    it('should work correctly', () => {
      // TODO: Implement test
      expect(true).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle null input', () => {
      // TODO: Implement test
      expect(() => {
        // Test null handling
      }).not.toThrow();
    });

    it('should handle empty input', () => {
      // TODO: Implement test
      expect(() => {
        // Test empty input handling
      }).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should throw error for invalid input', () => {
      // TODO: Implement test
      expect(() => {
        // Test error case
      }).toThrow();
    });
  });
});
`;

    fs.writeFileSync(filePath, content);
    console.log(chalk.green(`✓ Created test file: ${filePath}`));
  }

  private getDefaultPath(type: TemplateType, name: string): string {
    switch (type) {
      case 'component':
        return `src/components/${this.kebabCase(name)}`;
      case 'page':
        return `app/${this.kebabCase(name)}`;
      case 'api':
        return `app/api/${this.kebabCase(name)}`;
      case 'service':
        return 'src/lib/services';
      case 'hook':
        return 'src/lib/hooks';
      case 'test':
        return 'src/__tests__';
      default:
        return 'src';
    }
  }

  private getFeatureChoices(type: TemplateType): any[] {
    if (type === 'component' || type === 'page') {
      return [
        { name: 'State management', value: ComponentFeatures.STATE, checked: true },
        { name: 'Props interface', value: ComponentFeatures.PROPS, checked: true },
        { name: 'React.memo optimization', value: ComponentFeatures.MEMO },
        { name: 'Forward ref support', value: ComponentFeatures.FORWARD_REF },
        { name: 'Error boundary', value: ComponentFeatures.ERROR_BOUNDARY },
        { name: 'Suspense support', value: ComponentFeatures.SUSPENSE },
        { name: 'Performance monitoring', value: ComponentFeatures.MONITORING },
        { name: 'Accessibility features', value: ComponentFeatures.ACCESSIBILITY, checked: true },
        { name: 'Test file', value: ComponentFeatures.TESTS, checked: true },
        { name: 'Storybook story', value: ComponentFeatures.STORIES }
      ];
    }
    return [];
  }

  private getFileName(config: GeneratorConfig): string {
    switch (config.type) {
      case 'component':
        return `${this.pascalCase(config.name)}.tsx`;
      case 'page':
        return 'page.tsx';
      case 'api':
        return 'route.ts';
      case 'service':
        return `${this.camelCase(config.name)}Service.ts`;
      case 'hook':
        return config.name.startsWith('use') ? `${config.name}.ts` : `use${this.pascalCase(config.name)}.ts`;
      case 'test':
        return config.name.endsWith('.test') ? `${config.name}.ts` : `${config.name}.test.ts`;
      default:
        return `${config.name}.ts`;
    }
  }

  private generateDescription(name: string): string {
    const words = name.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    return `Handles ${words} functionality in the DomainFlow application`;
  }

  private printNextSteps(config: GeneratorConfig): void {
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.gray('1. Review the generated code and customize as needed'));
    console.log(chalk.gray('2. Update TODO comments with actual implementation'));
    console.log(chalk.gray('3. Add proper TypeScript types and interfaces'));
    
    if (config.type === 'component' && config.features?.includes(ComponentFeatures.TESTS)) {
      console.log(chalk.gray('4. Run tests: npm test'));
    }
    
    if (config.type === 'api') {
      console.log(chalk.gray('4. Test the endpoint: curl http://localhost:3000/api/' + this.kebabCase(config.name)));
    }
    
    console.log(chalk.gray('\nGenerated files:'));
    console.log(chalk.gray(`  • ${config.path}/${this.getFileName(config)}`));
  }

  // Utility functions
  private pascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private camelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  private kebabCase(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  }

  private titleCase(str: string): string {
    return str.replace(/([A-Z])/g, ' $1').trim();
  }
}

// Run generator
if (require.main === module) {
  const generator = new CodeGenerator();
  generator.generate();
}

export { CodeGenerator };