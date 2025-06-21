#!/usr/bin/env ts-node

/**
 * Validate Alignment
 * 
 * Compares contracts across Go backend, PostgreSQL database, and TypeScript frontend
 * Identifies mismatches and generates validation report
 * 
 * Usage: ts-node validate-alignment.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync as _execSync } from 'child_process';
import { fileURLToPath as _fileURLToPath } from 'url';

interface ValidationIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  layer: 'backend' | 'database' | 'frontend';
  type: string;
  field?: string;
  expected: string;
  actual: string;
  description: string;
  file?: string;
  line?: number;
}

interface ValidationReport {
  timestamp: string;
  passed: boolean;
  issueCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: ValidationIssue[];
  recommendations: string[];
}

class ContractValidator {
  private issues: ValidationIssue[] = [];
  private extractedContracts: any;
  private databaseSchema: any;
  private typeScriptTypes: any;

  constructor() {
    this.loadContracts();
  }

  /**
   * Load contracts from various sources
   */
  private loadContracts() {
    // Load extracted Go contracts - use project root instead of script location
    const contractsPath = path.join(process.cwd(), 'extracted-contracts.json');
    if (fs.existsSync(contractsPath)) {
      this.extractedContracts = JSON.parse(fs.readFileSync(contractsPath, 'utf-8'));
    }

    // Load database schema
    this.databaseSchema = this.extractDatabaseSchema();

    // Load TypeScript types
    this.typeScriptTypes = this.extractTypeScriptTypes();
  }

  /**
   * Extract database schema using psql
   */
  private extractDatabaseSchema(): any {
    // This would connect to the database and extract schema
    // For now, we'll use a mock structure
    return {
      tables: {
        campaigns: {
          columns: {
            id: { type: 'uuid', nullable: false },
            name: { type: 'text', nullable: false },
            campaign_type: { type: 'text', nullable: false },
            status: { type: 'text', nullable: false },
            total_items: { type: 'bigint', nullable: true, default: '0' },
            processed_items: { type: 'bigint', nullable: true, default: '0' },
            successful_items: { type: 'bigint', nullable: true, default: '0' },
            failed_items: { type: 'bigint', nullable: true, default: '0' }
          },
          constraints: {
            campaigns_status_check: ['pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled', 'archived'],
            campaigns_campaign_type_check: ['domain_generation', 'dns_validation', 'http_keyword_validation']
          }
        }
      }
    };
  }

  /**
   * Extract TypeScript types by parsing files
   */
  private extractTypeScriptTypes(): any {
    const types: any = {
      interfaces: {},
      enums: {}
    };

    // Parse aligned models
    const modelsPath = path.join(process.cwd(), 'src/lib/types/aligned/aligned-models.ts');
    if (fs.existsSync(modelsPath)) {
      const content = fs.readFileSync(modelsPath, 'utf-8');
      
      // Extract interfaces with better regex that handles nested braces
      const interfaceRegex = /export interface (\w+) \{([\s\S]*?)\n\}/g;
      let match;
      while ((match = interfaceRegex.exec(content)) !== null) {
        const interfaceName = match[1];
        const body = match[2];
        if (!interfaceName || !body) continue;
        
        types.interfaces[interfaceName] = this.parseTypeScriptInterface(body);
      }

      // Extract enums
      const enumRegex = /export enum (\w+) {([^}]+)}/g;
      while ((match = enumRegex.exec(content)) !== null) {
        const enumName = match[1];
        const body = match[2];
        if (!enumName || !body) continue;
        types.enums[enumName] = this.parseTypeScriptEnum(body);
      }
    }

    return types;
  }

  /**
   * Parse TypeScript interface body
   */
  private parseTypeScriptInterface(body: string): any {
    const fields: any = {};
    
    // Clean up the body - remove comments and extra whitespace
    const cleanBody = body
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // More robust field regex that handles various patterns
    const fieldRegex = /(\w+)(\?)?:\s*([^;,}]+);/g;
    let match;

    while ((match = fieldRegex.exec(cleanBody)) !== null) {
      const fieldName = match[1];
      const optional = match[2] === '?';
      const fieldType = match[3]?.trim();
      
      if (!fieldName || !fieldType) continue;
      
      fields[fieldName] = {
        type: fieldType,
        optional
      };
    }

    return fields;
  }

  /**
   * Parse TypeScript enum body
   */
  private parseTypeScriptEnum(body: string): string[] {
    const values: string[] = [];
    const valueRegex = /\w+\s*=\s*'([^']+)'/g;
    let match;

    while ((match = valueRegex.exec(body)) !== null) {
      const value = match[1];
      if (!value) continue;
      values.push(value);
    }

    return values;
  }

  /**
   * Validate all contracts
   */
  async validate(): Promise<ValidationReport> {
    console.log('🔍 Validating contract alignment...\n');

    // Validate int64 fields
    this.validateInt64Fields();

    // Validate enum values
    this.validateEnums();

    // Validate required fields
    this.validateRequiredFields();

    // Validate API endpoints
    this.validateAPIEndpoints();

    // Validate naming conventions
    this.validateNamingConventions();

    // Generate report
    return this.generateReport();
  }

  /**
   * Validate int64 field handling
   */
  private validateInt64Fields() {
    const int64Fields = [
      { tsModel: 'Campaign', goModel: 'Campaign', fields: ['totalItems', 'processedItems', 'successfulItems', 'failedItems'] },
      { tsModel: 'DomainGenerationParams', goModel: 'DomainGenerationCampaignParams', fields: ['totalPossibleCombinations', 'currentOffset'] },
      { tsModel: 'GeneratedDomain', goModel: 'GeneratedDomain', fields: ['offsetIndex'] }
    ];

    int64Fields.forEach(({ tsModel, goModel, fields }) => {
      fields.forEach(field => {
        // Check database type
        const dbTable = this.camelToSnake(tsModel);
        const dbField = this.camelToSnake(field);
        const dbColumn = this.databaseSchema.tables[dbTable]?.columns[dbField];

        if (dbColumn && dbColumn.type !== 'bigint') {
          this.addIssue({
            severity: 'CRITICAL',
            layer: 'database',
            type: 'int64_type_mismatch',
            field: `${tsModel}.${field}`,
            expected: 'bigint',
            actual: dbColumn.type,
            description: `Database column ${dbTable}.${dbField} should be BIGINT for int64 safety`
          });
        }

        // Check TypeScript type
        const tsInterface = this.typeScriptTypes.interfaces[tsModel];
        if (tsInterface && tsInterface[field]) {
          const tsType = tsInterface[field].type;
          if (tsType !== 'SafeBigInt') {
            this.addIssue({
              severity: 'CRITICAL',
              layer: 'frontend',
              type: 'int64_type_mismatch',
              field: `${tsModel}.${field}`,
              expected: 'SafeBigInt',
              actual: tsType,
              description: `TypeScript field should use SafeBigInt for int64 values`
            });
          }
        }

        // Check Go model has int64 type
        const goModelData = this.extractedContracts?.models.find((m: any) => m.name === goModel);
        if (goModelData) {
          const goField = goModelData.fields?.find((f: any) => f.jsonTag === field);
          if (goField && goField.type !== 'int64') {
            this.addIssue({
              severity: 'CRITICAL',
              layer: 'backend',
              type: 'int64_type_mismatch',
              field: `${goModel}.${field}`,
              expected: 'int64',
              actual: goField.type,
              description: `Go field should use int64 type for large numeric values`
            });
          }
        }
      });
    });
  }

  /**
   * Validate enum values match exactly
   */
  private validateEnums() {
    const enumMappings = [
      { name: 'CampaignStatus', dbTable: 'campaigns', dbColumn: 'status' },
      { name: 'CampaignType', dbTable: 'campaigns', dbColumn: 'campaign_type' },
      { name: 'PersonaType', dbTable: 'personas', dbColumn: 'persona_type' }
    ];

    enumMappings.forEach(({ name, dbTable, dbColumn }) => {
      const goEnum = this.extractedContracts?.enums.find((e: any) => e.name === name);
      const tsEnum = this.typeScriptTypes.enums[name];
      const dbConstraint = this.databaseSchema.tables[dbTable]?.constraints[`${dbTable}_${dbColumn}_check`];

      if (goEnum && tsEnum) {
        // Check for extra values in TypeScript
        tsEnum.forEach((value: string) => {
          if (!goEnum.values.includes(value)) {
            this.addIssue({
              severity: 'HIGH',
              layer: 'frontend',
              type: 'enum_extra_value',
              field: name,
              expected: goEnum.values.join(', '),
              actual: value,
              description: `TypeScript enum ${name} contains value '${value}' not in Go backend`
            });
          }
        });

        // Check for missing values in TypeScript
        goEnum.values.forEach((value: string) => {
          if (!tsEnum.includes(value)) {
            this.addIssue({
              severity: 'HIGH',
              layer: 'frontend',
              type: 'enum_missing_value',
              field: name,
              expected: value,
              actual: 'missing',
              description: `TypeScript enum ${name} missing value '${value}' from Go backend`
            });
          }
        });
      }

      // Check database constraints
      if (dbConstraint && goEnum) {
        goEnum.values.forEach((value: string) => {
          if (!dbConstraint.includes(value)) {
            this.addIssue({
              severity: 'HIGH',
              layer: 'database',
              type: 'enum_constraint_missing',
              field: `${dbTable}.${dbColumn}`,
              expected: value,
              actual: 'missing',
              description: `Database constraint missing enum value '${value}'`
            });
          }
        });
      }
    });
  }

  /**
   * Validate required fields are present
   */
  private validateRequiredFields() {
    // Check for missing critical fields
    const criticalFields = [
      {
        tsModel: 'DomainGenerationParams',
        goModel: 'DomainGenerationCampaignParams',
        fields: ['totalPossibleCombinations', 'currentOffset']
      },
      {
        tsModel: 'HTTPKeywordParams',
        goModel: 'HTTPKeywordCampaignParams',
        fields: ['sourceType']
      }
    ];

    criticalFields.forEach(({ tsModel, goModel, fields }) => {
      const goModelData = this.extractedContracts?.models.find((m: any) => m.name === goModel);
      const tsInterface = this.typeScriptTypes.interfaces[tsModel];

      fields.forEach(field => {
        // Check Go model (using camelCase field names as they appear in JSON tags)
        if (goModelData && !goModelData.fields?.find((f: any) => f.jsonTag === field)) {
          this.addIssue({
            severity: 'CRITICAL',
            layer: 'backend',
            type: 'missing_required_field',
            field: `${goModel}.${field}`,
            expected: 'present',
            actual: 'missing',
            description: `Required field ${field} missing from Go model ${goModel}`
          });
        }

        // Check TypeScript interface (more robust field checking)
        if (tsInterface && !tsInterface[field]) {
          this.addIssue({
            severity: 'CRITICAL',
            layer: 'frontend',
            type: 'missing_required_field',
            field: `${tsModel}.${field}`,
            expected: 'present',
            actual: 'missing',
            description: `Required field ${field} missing from TypeScript interface ${tsModel}`
          });
        }
      });
    });
  }

  /**
   * Validate API endpoints exist
   */
  private validateAPIEndpoints() {
    const requiredEndpoints = [
      { method: 'GET', path: '/users', description: 'List users' },
      { method: 'POST', path: '/users', description: 'Create user' },
      { method: 'PUT', path: '/users/:userId', description: 'Update user' },
      { method: 'DELETE', path: '/users/:userId', description: 'Delete user' }
    ];

    requiredEndpoints.forEach(required => {
      const exists = this.extractedContracts?.endpoints.find(
        (e: any) => e.method === required.method && e.path === required.path
      );

      if (!exists) {
        this.addIssue({
          severity: 'CRITICAL',
          layer: 'backend',
          type: 'missing_endpoint',
          expected: `${required.method} ${required.path}`,
          actual: 'missing',
          description: `Missing required endpoint: ${required.description}`
        });
      }
    });
  }

  /**
   * Validate naming conventions
   */
  private validateNamingConventions() {
    // Check database columns use snake_case
    Object.entries(this.databaseSchema.tables).forEach(([tableName, tableInfo]: [string, any]) => {
      Object.keys(tableInfo.columns).forEach(columnName => {
        if (columnName !== this.camelToSnake(this.snakeToCamel(columnName))) {
          this.addIssue({
            severity: 'LOW',
            layer: 'database',
            type: 'naming_convention',
            field: `${tableName}.${columnName}`,
            expected: 'snake_case',
            actual: columnName,
            description: `Database column should use consistent snake_case naming`
          });
        }
      });
    });
  }

  /**
   * Add validation issue
   */
  private addIssue(issue: ValidationIssue) {
    this.issues.push(issue);
  }

  /**
   * Generate validation report
   */
  private generateReport(): ValidationReport {
    const issueCount = {
      critical: this.issues.filter(i => i.severity === 'CRITICAL').length,
      high: this.issues.filter(i => i.severity === 'HIGH').length,
      medium: this.issues.filter(i => i.severity === 'MEDIUM').length,
      low: this.issues.filter(i => i.severity === 'LOW').length
    };

    const passed = issueCount.critical === 0 && issueCount.high === 0;

    const recommendations = this.generateRecommendations();

    return {
      timestamp: new Date().toISOString(),
      passed,
      issueCount,
      issues: this.issues,
      recommendations
    };
  }

  /**
   * Generate recommendations based on issues
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.issues.some(i => i.type === 'int64_type_mismatch')) {
      recommendations.push('Implement SafeBigInt across all int64 fields to prevent numeric overflow');
    }

    if (this.issues.some(i => i.type === 'missing_endpoint')) {
      recommendations.push('Implement missing user management endpoints in backend');
    }

    if (this.issues.some(i => i.type === 'enum_extra_value')) {
      recommendations.push('Remove deprecated enum values from frontend');
    }

    if (this.issues.some(i => i.type === 'missing_required_field')) {
      recommendations.push('Add missing required fields to API contracts');
    }

    recommendations.push('Set up automated contract validation in CI/CD pipeline');
    recommendations.push('Use backend as single source of truth for type generation');

    return recommendations;
  }

  /**
   * Save validation report
   */
  async saveReport(outputPath: string) {
    const report = await this.validate();
    const output = JSON.stringify(report, null, 2);
    
    fs.writeFileSync(outputPath, output);
    console.log(`\n📄 Validation report saved to: ${outputPath}`);

    // Also create markdown report
    const markdownPath = outputPath.replace('.json', '.md');
    const markdown = this.generateMarkdownReport(report);
    fs.writeFileSync(markdownPath, markdown);
    console.log(`📄 Markdown report saved to: ${markdownPath}`);

    return report;
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(report: ValidationReport): string {
    let markdown = `# Contract Alignment Validation Report

**Generated:** ${report.timestamp}  
**Status:** ${report.passed ? '✅ PASSED' : '❌ FAILED'}

## Summary

- **Critical Issues:** ${report.issueCount.critical}
- **High Issues:** ${report.issueCount.high}
- **Medium Issues:** ${report.issueCount.medium}
- **Low Issues:** ${report.issueCount.low}

`;

    if (report.issues.length > 0) {
      markdown += '## Issues\n\n';
      
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(severity => {
        const severityIssues = report.issues.filter(i => i.severity === severity);
        if (severityIssues.length > 0) {
          markdown += `### ${severity} Issues\n\n`;
          severityIssues.forEach(issue => {
            markdown += `- **[${issue.layer}]** ${issue.description}\n`;
            markdown += `  - Type: ${issue.type}\n`;
            markdown += `  - Expected: ${issue.expected}\n`;
            markdown += `  - Actual: ${issue.actual}\n`;
            if (issue.field) {
              markdown += `  - Field: ${issue.field}\n`;
            }
            markdown += '\n';
          });
        }
      });
    }

    if (report.recommendations.length > 0) {
      markdown += '## Recommendations\n\n';
      report.recommendations.forEach(rec => {
        markdown += `- ${rec}\n`;
      });
    }

    return markdown;
  }

  /**
   * Utility: Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '');
  }

  /**
   * Utility: Convert snake_case to camelCase
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (g) => {
      const char = g[1];
      return char ? char.toUpperCase() : '';
    });
  }
}

// Main execution
async function main() {
  const validator = new ContractValidator();
  const outputPath = process.argv[2] || './validation-report.json';

  try {
    const report = await validator.saveReport(outputPath);
    
    if (report.passed) {
      console.log('\n✅ Contract validation passed!');
      process.exit(0);
    } else {
      console.log(`\n❌ Contract validation failed with ${report.issueCount.critical} critical and ${report.issueCount.high} high severity issues`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  }
}

// CommonJS main module check
if (require.main === module) {
  main();
}

export { ContractValidator };
export type { ValidationReport };