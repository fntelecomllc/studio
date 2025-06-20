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
import { execSync } from 'child_process';

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
    // Load extracted Go contracts
    const contractsPath = path.join(__dirname, 'extracted-contracts.json');
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
    try {
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
              campaigns_status_check: ['pending', 'queued', 'running', 'pausing', 'paused', 'completed', 'failed', 'cancelled'],
              campaigns_campaign_type_check: ['domain_generation', 'dns_validation', 'http_keyword_validation']
            }
          }
        }
      };
    } catch (error) {
      console.error('Failed to extract database schema:', error);
      return {};
    }
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
      
      // Extract interfaces
      const interfaceRegex = /export interface (\w+) {([^}]+)}/g;
      let match;
      while ((match = interfaceRegex.exec(content)) !== null) {
        const interfaceName = match[1];
        const body = match[2];
        types.interfaces[interfaceName] = this.parseTypeScriptInterface(body);
      }

      // Extract enums
      const enumRegex = /export enum (\w+) {([^}]+)}/g;
      while ((match = enumRegex.exec(content)) !== null) {
        const enumName = match[1];
        const body = match[2];
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
    const fieldRegex = /(\w+)(\?)?:\s*([^;]+);/g;
    let match;

    while ((match = fieldRegex.exec(body)) !== null) {
      const fieldName = match[1];
      const optional = match[2] === '?';
      const fieldType = match[3].trim();
      
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
      values.push(match[1]);
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
      { model: 'Campaign', fields: ['totalItems', 'processedItems', 'successfulItems', 'failedItems'] },
      { model: 'DomainGenerationParams', fields: ['totalPossibleCombinations', 'currentOffset'] },
      { model: 'GeneratedDomain', fields: ['offsetIndex'] }
    ];

    int64Fields.forEach(({ model, fields }) => {
      fields.forEach(field => {
        // Check database type
        const dbTable = this.camelToSnake(model);
        const dbField = this.camelToSnake(field);
        const dbColumn = this.databaseSchema.tables[dbTable]?.columns[dbField];

        if (dbColumn && dbColumn.type !== 'bigint') {
          this.addIssue({
            severity: 'CRITICAL',
            layer: 'database',
            type: 'int64_type_mismatch',
            field: `${model}.${field}`,
            expected: 'bigint',
            actual: dbColumn.type,
            description: `Database column ${dbTable}.${dbField} should be BIGINT for int64 safety`
          });
        }

        // Check TypeScript type
        const tsInterface = this.typeScriptTypes.interfaces[model];
        if (tsInterface && tsInterface[field]) {
          const tsType = tsInterface[field].type;
          if (tsType !== 'SafeBigInt') {
            this.addIssue({
              severity: 'CRITICAL',
              layer: 'frontend',
              type: 'int64_type_mismatch',
              field: `${model}.${field}`,
              expected: 'SafeBigInt',
              actual: tsType,
              description: `TypeScript field should use SafeBigInt for int64 values`
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
        model: 'DomainGenerationParams',
        fields: ['totalPossibleCombinations', 'currentOffset']
      },
      {
        model: 'HTTPKeywordParams',
        fields: ['sourceType']
      }
    ];

    criticalFields.forEach(({ model, fields }) => {
      const goModel = this.extractedContracts?.models.find((m: any) => m.name === model);
      const tsInterface = this.typeScriptTypes.interfaces[model];

      fields.forEach(field => {
        // Check Go model
        if (goModel && !goModel.fields?.find((f: any) => f.name === field)) {
          this.addIssue({
            severity: 'CRITICAL',
            layer: 'backend',
            type: 'missing_required_field',
            field: `${model}.${field}`,
            expected: 'present',
            actual: 'missing',
            description: `Required field ${field} missing from Go model ${model}`
          });
        }

        // Check TypeScript interface
        if (tsInterface && !tsInterface[field]) {
          this.addIssue({
            severity: 'CRITICAL',
            layer: 'frontend',
            type: 'missing_required_field',
            field: `${model}.${field}`,
            expected: 'present',
            actual: 'missing',
            description: `Required field ${field} missing from TypeScript interface ${model}`
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
      { method: 'GET', path: '/api/v2/admin/users', description: 'List users' },
      { method: 'POST', path: '/api/v2/admin/users', description: 'Create user' },
      { method: 'PUT', path: '/api/v2/admin/users/:id', description: 'Update user' },
      { method: 'DELETE', path: '/api/v2/admin/users/:id', description: 'Delete user' }
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
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
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

if (require.main === module) {
  main();
}

export { ContractValidator, ValidationReport };