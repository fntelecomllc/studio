#!/usr/bin/env ts-node

/**
 * Phase 3 Validation Script
 * 
 * Validates all medium priority improvements implemented in Phase 3
 * Run with: npx ts-node scripts/validate-phase3.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

interface ValidationResult {
  category: string;
  test: string;
  passed: boolean;
  message?: string;
  details?: any;
}

const results: ValidationResult[] = [];

/**
 * Log validation result
 */
function logResult(result: ValidationResult) {
  results.push(result);
  const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
  const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
  console.log(`${icon} [${status}] ${result.category}: ${result.test}`);
  if (result.message) {
    console.log(`  ${chalk.gray(result.message)}`);
  }
}

/**
 * Check if file exists
 */
function checkFileExists(filePath: string): boolean {
  return fs.existsSync(path.join(process.cwd(), filePath));
}

/**
 * Run TypeScript compiler check
 */
function runTypeCheck(): boolean {
  try {
    console.log(chalk.blue('\n🔍 Running TypeScript type check...\n'));
    execSync('npx tsc --noEmit', { stdio: 'inherit' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check for console warnings in source files
 */
function checkForConsoleWarnings(): { hasWarnings: boolean; files: string[] } {
  const srcDir = path.join(process.cwd(), 'src');
  const files: string[] = [];
  
  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        scanDirectory(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.includes('console.warn') || content.includes('console.error')) {
          files.push(path.relative(process.cwd(), fullPath));
        }
      }
    }
  }
  
  scanDirectory(srcDir);
  return { hasWarnings: files.length > 0, files };
}

/**
 * Validate default value utilities
 */
function validateDefaultValues() {
  console.log(chalk.blue('\n📋 Validating Default Value Utilities\n'));
  
  logResult({
    category: 'Default Values',
    test: 'default-values.ts exists',
    passed: checkFileExists('src/lib/utils/default-values.ts')
  });
  
  // Check if the file exports required functions
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/utils/default-values.ts'), 'utf-8');
    const requiredExports = ['getDefaultValue', 'normalizeValue', 'getFormDefaults'];
    
    requiredExports.forEach(exportName => {
      logResult({
        category: 'Default Values',
        test: `exports ${exportName}`,
        passed: content.includes(`export function ${exportName}`) || content.includes(`export const ${exportName}`)
      });
    });
  } catch (error) {
    logResult({
      category: 'Default Values',
      test: 'read default-values.ts',
      passed: false,
      message: 'Could not read file'
    });
  }
}

/**
 * Validate date transformation utilities
 */
function validateDateTransformations() {
  console.log(chalk.blue('\n📅 Validating Date Transformation Utilities\n'));
  
  logResult({
    category: 'Date Transformations',
    test: 'date-transformations.ts exists',
    passed: checkFileExists('src/lib/utils/date-transformations.ts')
  });
  
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/utils/date-transformations.ts'), 'utf-8');
    const requiredExports = [
      'toISOString', 'parseISOString', 'toUserTimezone', 
      'toUTC', 'formatLocalDateTime', 'isValidISOString'
    ];
    
    requiredExports.forEach(exportName => {
      logResult({
        category: 'Date Transformations',
        test: `exports ${exportName}`,
        passed: content.includes(`export function ${exportName}`)
      });
    });
  } catch (error) {
    logResult({
      category: 'Date Transformations',
      test: 'read date-transformations.ts',
      passed: false,
      message: 'Could not read file'
    });
  }
}

/**
 * Validate enum helpers
 */
function validateEnumHelpers() {
  console.log(chalk.blue('\n🔢 Validating Enum Helpers\n'));
  
  logResult({
    category: 'Enum Helpers',
    test: 'enum-helpers.ts exists',
    passed: checkFileExists('src/lib/utils/enum-helpers.ts')
  });
  
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/utils/enum-helpers.ts'), 'utf-8');
    const requiredExports = [
      'getEnumValues', 'getEnumKeys', 'isValidEnumValue',
      'getEnumDisplayName', 'exhaustiveCheck'
    ];
    
    requiredExports.forEach(exportName => {
      logResult({
        category: 'Enum Helpers',
        test: `exports ${exportName}`,
        passed: content.includes(`export function ${exportName}`)
      });
    });
  } catch (error) {
    logResult({
      category: 'Enum Helpers',
      test: 'read enum-helpers.ts',
      passed: false,
      message: 'Could not read file'
    });
  }
}

/**
 * Validate array operations
 */
function validateArrayOperations() {
  console.log(chalk.blue('\n🔧 Validating Array Operations\n'));
  
  logResult({
    category: 'Array Operations',
    test: 'array-operations.ts exists',
    passed: checkFileExists('src/lib/utils/array-operations.ts')
  });
  
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/utils/array-operations.ts'), 'utf-8');
    const requiredExports = [
      'arrayAdd', 'arrayRemove', 'arrayUpdate', 'arrayMove',
      'arraySort', 'arrayFilter', 'arrayUnique', 'arrayDeepEquals'
    ];
    
    requiredExports.forEach(exportName => {
      logResult({
        category: 'Array Operations',
        test: `exports ${exportName}`,
        passed: content.includes(`export function ${exportName}`)
      });
    });
  } catch (error) {
    logResult({
      category: 'Array Operations',
      test: 'read array-operations.ts',
      passed: false,
      message: 'Could not read file'
    });
  }
}

/**
 * Validate enhanced API client
 */
function validateEnhancedApiClient() {
  console.log(chalk.blue('\n🌐 Validating Enhanced API Client\n'));
  
  logResult({
    category: 'Enhanced API Client',
    test: 'enhanced-api-client.ts exists',
    passed: checkFileExists('src/lib/api/enhanced-api-client.ts')
  });
  
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/api/enhanced-api-client.ts'), 'utf-8');
    
    // Check for key features
    const features = [
      { name: 'Request deduplication', pattern: /pendingRequests|dedup/i },
      { name: 'Response caching', pattern: /responseCache|cache/i },
      { name: 'Request interceptors', pattern: /requestInterceptors/i },
      { name: 'Response interceptors', pattern: /responseInterceptors/i },
      { name: 'Int64 transformation', pattern: /transformInt64Fields|SafeBigInt/i }
    ];
    
    features.forEach(feature => {
      logResult({
        category: 'Enhanced API Client',
        test: feature.name,
        passed: feature.pattern.test(content)
      });
    });
  } catch (error) {
    logResult({
      category: 'Enhanced API Client',
      test: 'read enhanced-api-client.ts',
      passed: false,
      message: 'Could not read file'
    });
  }
}

/**
 * Validate performance utilities
 */
function validatePerformanceUtilities() {
  console.log(chalk.blue('\n⚡ Validating Performance Utilities\n'));
  
  // Check memoization utilities
  logResult({
    category: 'Performance',
    test: 'memoization.ts exists',
    passed: checkFileExists('src/lib/utils/memoization.ts')
  });
  
  // Check lazy loading utilities
  logResult({
    category: 'Performance',
    test: 'lazy-loading.ts exists',
    passed: checkFileExists('src/lib/utils/lazy-loading.ts')
  });
  
  // Check performance monitoring hooks
  logResult({
    category: 'Performance',
    test: 'usePerformanceMonitor.ts exists',
    passed: checkFileExists('src/lib/hooks/usePerformanceMonitor.ts')
  });
  
  // Check monitoring service updates
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'src/lib/monitoring/monitoring-service.ts'), 'utf-8');
    logResult({
      category: 'Performance',
      test: 'monitoring service has recordCustomMetric',
      passed: content.includes('recordCustomMetric')
    });
  } catch (error) {
    logResult({
      category: 'Performance',
      test: 'monitoring service check',
      passed: false,
      message: 'Could not verify monitoring service'
    });
  }
}

/**
 * Validate documentation
 */
function validateDocumentation() {
  console.log(chalk.blue('\n📚 Validating Documentation\n'));
  
  const docs = [
    'docs/safebigint-usage-guide.md',
    'docs/complex-types-guide.md',
    'docs/migration-guide.md'
  ];
  
  docs.forEach(doc => {
    logResult({
      category: 'Documentation',
      test: `${path.basename(doc)} exists`,
      passed: checkFileExists(doc)
    });
    
    // Check if docs have content
    if (checkFileExists(doc)) {
      try {
        const content = fs.readFileSync(path.join(process.cwd(), doc), 'utf-8');
        const lines = content.split('\n').length;
        logResult({
          category: 'Documentation',
          test: `${path.basename(doc)} has content`,
          passed: lines > 50,
          message: `${lines} lines`
        });
      } catch (error) {
        // Skip content check if can't read
      }
    }
  });
}

/**
 * Check for TypeScript errors in key files
 */
function checkTypeScriptErrors() {
  console.log(chalk.blue('\n🔍 Checking TypeScript Errors in Key Files\n'));
  
  const passed = runTypeCheck();
  logResult({
    category: 'TypeScript',
    test: 'No TypeScript errors',
    passed,
    message: passed ? 'All files compile successfully' : 'TypeScript errors found'
  });
}

/**
 * Run bundle size analysis
 */
function checkBundleSize() {
  console.log(chalk.blue('\n📦 Checking Bundle Size\n'));
  
  try {
    // Run build
    console.log(chalk.gray('Building project...'));
    execSync('npm run build', { stdio: 'pipe' });
    
    // Check if build directory exists
    const buildExists = checkFileExists('dist') || checkFileExists('build');
    logResult({
      category: 'Bundle',
      test: 'Build successful',
      passed: buildExists,
      message: buildExists ? 'Build directory created' : 'Build directory not found'
    });
    
    // TODO: Add actual bundle size analysis if needed
  } catch (error) {
    logResult({
      category: 'Bundle',
      test: 'Build successful',
      passed: false,
      message: 'Build failed'
    });
  }
}

/**
 * Check for console warnings
 */
function validateNoConsoleWarnings() {
  console.log(chalk.blue('\n⚠️  Checking for Console Warnings\n'));
  
  const { hasWarnings, files } = checkForConsoleWarnings();
  logResult({
    category: 'Code Quality',
    test: 'No console.warn or console.error',
    passed: !hasWarnings,
    message: hasWarnings ? `Found in ${files.length} files: ${files.slice(0, 3).join(', ')}${files.length > 3 ? '...' : ''}` : 'No console warnings found'
  });
}

/**
 * Generate summary report
 */
function generateSummary() {
  console.log(chalk.blue('\n📊 VALIDATION SUMMARY\n'));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);
  
  console.log(`Total Tests: ${total}`);
  console.log(`${chalk.green(`Passed: ${passed}`)}`);
  console.log(`${chalk.red(`Failed: ${failed}`)}`);
  console.log(`Success Rate: ${percentage}%`);
  
  if (failed > 0) {
    console.log(chalk.red('\n❌ VALIDATION FAILED\n'));
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.category}: ${r.test}`);
      if (r.message) {
        console.log(`    ${chalk.gray(r.message)}`);
      }
    });
  } else {
    console.log(chalk.green('\n✅ ALL VALIDATIONS PASSED!\n'));
  }
  
  // Write detailed report
  const reportPath = path.join(process.cwd(), 'phase3-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed, percentage },
    results
  }, null, 2));
  
  console.log(chalk.gray(`\nDetailed report saved to: ${reportPath}`));
}

/**
 * Main validation runner
 */
async function main() {
  console.log(chalk.bold.blue('🚀 Phase 3 Validation Script\n'));
  console.log(chalk.gray('Validating all medium priority improvements...\n'));
  
  // Run all validations
  validateDefaultValues();
  validateDateTransformations();
  validateEnumHelpers();
  validateArrayOperations();
  validateEnhancedApiClient();
  validatePerformanceUtilities();
  validateDocumentation();
  checkTypeScriptErrors();
  validateNoConsoleWarnings();
  checkBundleSize();
  
  // Generate summary
  generateSummary();
  
  // Exit with appropriate code
  const failed = results.filter(r => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

// Run validation
main().catch(error => {
  console.error(chalk.red('Validation script error:'), error);
  process.exit(1);
});