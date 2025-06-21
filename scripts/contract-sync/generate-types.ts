#!/usr/bin/env ts-node

/**
 * Generate Types from Go Contracts
 * 
 * Auto-generates TypeScript types from extracted Go contracts
 * Ensures frontend types always match backend source of truth
 * 
 * Usage: ts-node generate-types.ts [input.json] [output-dir]
 */

import * as fs from 'fs';
import * as path from 'path';

interface GeneratorConfig {
  inputPath: string;
  outputDir: string;
  generateEnums: boolean;
  generateInterfaces: boolean;
  generateAPITypes: boolean;
  generateTransformers: boolean;
}

class TypeScriptGenerator {
  private contracts: any;
  private config: GeneratorConfig;
  private generatedFiles: string[] = [];

  constructor(contracts: any, config: GeneratorConfig) {
    this.contracts = contracts;
    this.config = config;
  }

  /**
   * Generate all TypeScript files
   */
  async generate() {
    console.log('🔨 Generating TypeScript types from Go contracts...\n');

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    // Generate different file types
    if (this.config.generateEnums) {
      await this.generateEnums();
    }

    if (this.config.generateInterfaces) {
      await this.generateModels();
    }

    if (this.config.generateAPITypes) {
      await this.generateAPITypes();
    }

    if (this.config.generateTransformers) {
      await this.generateTransformers();
    }

    // Generate index file
    await this.generateIndex();

    console.log(`\n✅ Generated ${this.generatedFiles.length} files`);
    return this.generatedFiles;
  }

  /**
   * Generate enum definitions
   */
  private async generateEnums() {
    const outputPath = path.join(this.config.outputDir, 'generated-enums.ts');
    let content = `/**
 * Auto-generated Enums from Go Backend
 * Generated: ${new Date().toISOString()}
 * Source: Go Backend Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

`;

    // Generate enum types
    this.contracts.enums.forEach((enumDef: any) => {
      // Generate const object
      content += `export const ${enumDef.name}Enum = {\n`;
      enumDef.values.forEach((value: string) => {
        const key = this.toConstantCase(value);
        content += `  ${key}: '${value}',\n`;
      });
      content += `} as const;\n\n`;

      // Generate type
      content += `export type ${enumDef.name}Enum = typeof ${enumDef.name}Enum[keyof typeof ${enumDef.name}Enum];\n\n`;

      // Generate validation function
      content += `export function isValid${enumDef.name}(value: unknown): value is ${enumDef.name}Enum {\n`;
      content += `  return Object.values(${enumDef.name}Enum).includes(value as string);\n`;
      content += `}\n\n`;
    });

    // Add enum lists
    content += '// Enum value lists for validation\n';
    this.contracts.enums.forEach((enumDef: any) => {
      content += `export const VALID_${this.toConstantCase(enumDef.name)}_VALUES = Object.values(${enumDef.name}Enum);\n`;
    });

    fs.writeFileSync(outputPath, content);
    this.generatedFiles.push(outputPath);
    console.log(`📄 Generated: ${path.basename(outputPath)}`);
  }

  /**
   * Generate model interfaces
   */
  private async generateModels() {
    const outputPath = path.join(this.config.outputDir, 'generated-models.ts');
    let content = `/**
 * Auto-generated Models from Go Backend
 * Generated: ${new Date().toISOString()}
 * Source: Go Backend Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import { 
  SafeBigInt, 
  UUID, 
  ISODateString, 
  Email,
  createSafeBigInt,
  createUUID,
  createISODateString,
  createEmail
} from '../branded';

`;

    // Import enums
    if (this.config.generateEnums) {
      content += `import {\n`;
      this.contracts.enums.forEach((enumDef: any) => {
        content += `  ${enumDef.name}Enum,\n`;
      });
      content += `} from './generated-enums';\n\n`;
    }

    // Add custom types
    content += `// Custom branded types\n`;
    content += `export type IPAddress = string & { readonly __brand: 'IPAddress' };\n\n`;

    // Generate interfaces
    const structs = this.contracts.models.filter((m: any) => m.kind === 'struct');
    structs.forEach((model: any) => {
      content += `export interface ${model.name} {\n`;
      
      if (model.fields) {
        model.fields.forEach((field: any) => {
          const tsType = this.goTypeToTypeScript(field.type, field.isPointer);
          const optional = field.isPointer || !field.required ? '?' : '';
          const fieldName = field.jsonTag || this.toCamelCase(field.name);
          
          // Add JSDoc if needed
          if (field.type === 'int64') {
            content += `  /** @int64 */\n`;
          }
          
          content += `  ${fieldName}${optional}: ${tsType};\n`;
        });
      }
      
      content += `}\n\n`;
    });

    fs.writeFileSync(outputPath, content);
    this.generatedFiles.push(outputPath);
    console.log(`📄 Generated: ${path.basename(outputPath)}`);
  }

  /**
   * Generate API request/response types
   */
  private async generateAPITypes() {
    const outputPath = path.join(this.config.outputDir, 'generated-api-types.ts');
    let content = `/**
 * Auto-generated API Types from Go Backend
 * Generated: ${new Date().toISOString()}
 * Source: Go Backend API Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import { SafeBigInt, UUID, ISODateString } from '../branded';
import * as Models from './generated-models';

`;

    // Group endpoints by resource
    const endpointGroups = this.groupEndpointsByResource(this.contracts.endpoints);

    Object.entries(endpointGroups).forEach(([resource, endpoints]) => {
      content += `// ============================================\n`;
      content += `// ${resource.toUpperCase()} API TYPES\n`;
      content += `// ============================================\n\n`;

      (endpoints as any[]).forEach(endpoint => {
        // Generate request type if needed
        if (endpoint.requestType && endpoint.requestType !== 'gin.H') {
          content += `export interface ${endpoint.requestType} {\n`;
          content += `  // TODO: Extract fields from Go type\n`;
          content += `}\n\n`;
        }

        // Generate response type if needed
        if (endpoint.responseType && endpoint.responseType !== 'gin.H') {
          content += `export interface ${endpoint.responseType} {\n`;
          content += `  // TODO: Extract fields from Go type\n`;
          content += `}\n\n`;
        }
      });
    });

    // Add common types
    content += this.generateCommonAPITypes();

    fs.writeFileSync(outputPath, content);
    this.generatedFiles.push(outputPath);
    console.log(`📄 Generated: ${path.basename(outputPath)}`);
  }

  /**
   * Generate common API types
   */
  private generateCommonAPITypes(): string {
    return `// Common API types

export interface APIError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  requestId?: string;
  timestamp: ISODateString;
}

export interface PaginationRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  data: T[];
  total: SafeBigInt;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
`;
  }

  /**
   * Generate transformation functions
   */
  private async generateTransformers() {
    const outputPath = path.join(this.config.outputDir, 'generated-transformers.ts');
    let content = `/**
 * Auto-generated Transformers from Go Backend
 * Generated: ${new Date().toISOString()}
 * Source: Go Backend Contracts
 * 
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import {
  SafeBigInt,
  createSafeBigInt,
  transformInt64Fields,
  prepareForSerialization
} from '../branded';

import * as Models from './generated-models';

`;

    // Identify models with int64 fields
    const modelsWithInt64 = this.contracts.models
      .filter((m: any) => m.kind === 'struct' && m.fields)
      .filter((m: any) => m.fields!.some((f: any) => f.type === 'int64'));

    // Generate INT64_FIELDS mapping
    content += `// Fields that contain int64 values from Go backend\n`;
    content += `export const INT64_FIELDS = {\n`;
    
    modelsWithInt64.forEach((model: any) => {
      const int64Fields = model.fields!
        .filter((f: any) => f.type === 'int64')
        .map((f: any) => f.jsonTag || this.toCamelCase(f.name));
      
      content += `  ${this.toCamelCase(model.name)}: [${int64Fields.map((f: string) => `'${f}'`).join(', ')}],\n`;
    });
    
    content += `} as const;\n\n`;

    // Generate transform functions for each model
    modelsWithInt64.forEach((model: any) => {
      const camelName = this.toCamelCase(model.name);
      
      content += `/**\n`;
      content += ` * Transform raw ${model.name} response\n`;
      content += ` */\n`;
      content += `export function transform${model.name}(raw: Record<string, unknown>): Models.${model.name} {\n`;
      content += `  const int64Transformed = transformInt64Fields(raw, [...INT64_FIELDS.${camelName}]);\n`;
      content += `  \n`;
      content += `  return {\n`;
      content += `    ...raw,\n`;
      
      // Override int64 fields
      const int64Fields = model.fields!.filter((f: any) => f.type === 'int64');
      int64Fields.forEach((field: any) => {
        const fieldName = field.jsonTag || this.toCamelCase(field.name);
        content += `    ${fieldName}: int64Transformed.${fieldName} as SafeBigInt,\n`;
      });
      
      content += `  } as Models.${model.name};\n`;
      content += `}\n\n`;
    });

    // Generate serialization functions
    modelsWithInt64.forEach((model: any) => {
      content += `/**\n`;
      content += ` * Prepare ${model.name} for API request\n`;
      content += ` */\n`;
      content += `export function serialize${model.name}(data: Partial<Models.${model.name}>): Record<string, unknown> {\n`;
      content += `  return prepareForSerialization(data, INT64_FIELDS.${this.toCamelCase(model.name)});\n`;
      content += `}\n\n`;
    });

    fs.writeFileSync(outputPath, content);
    this.generatedFiles.push(outputPath);
    console.log(`📄 Generated: ${path.basename(outputPath)}`);
  }

  /**
   * Generate index file
   */
  private async generateIndex() {
    const outputPath = path.join(this.config.outputDir, 'index.ts');
    let content = `/**
 * Auto-generated TypeScript Definitions
 * Generated: ${new Date().toISOString()}
 * 
 * This is the main entry point for all generated types
 */

`;

    // Export all generated files
    if (fs.existsSync(path.join(this.config.outputDir, 'generated-enums.ts'))) {
      content += `export * from './generated-enums';\n`;
    }
    
    if (fs.existsSync(path.join(this.config.outputDir, 'generated-models.ts'))) {
      content += `export * from './generated-models';\n`;
    }
    
    if (fs.existsSync(path.join(this.config.outputDir, 'generated-api-types.ts'))) {
      content += `export * from './generated-api-types';\n`;
    }
    
    if (fs.existsSync(path.join(this.config.outputDir, 'generated-transformers.ts'))) {
      content += `export * from './generated-transformers';\n`;
    }

    fs.writeFileSync(outputPath, content);
    this.generatedFiles.push(outputPath);
    console.log(`📄 Generated: ${path.basename(outputPath)}`);
  }

  /**
   * Convert Go type to TypeScript type
   */
  private goTypeToTypeScript(goType: string, _isPointer: boolean): string {
    const typeMap: Record<string, string> = {
      'string': 'string',
      'int': 'number',
      'int32': 'number',
      'int64': 'SafeBigInt',
      'float32': 'number',
      'float64': 'number',
      'bool': 'boolean',
      'time.Time': 'ISODateString',
      'uuid.UUID': 'UUID',
      'json.RawMessage': 'Record<string, unknown>',
      '[]string': 'string[]',
      '[]byte': 'string'
    };

    // Check if it's an enum
    const enumType = this.contracts.enums.find((e: any) => e.name === goType);
    if (enumType) {
      return `${goType}Enum`;
    }

    return typeMap[goType] || goType;
  }

  /**
   * Group endpoints by resource
   */
  private groupEndpointsByResource(endpoints: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    endpoints.forEach(endpoint => {
      const pathParts = endpoint.path.split('/').filter((p: string) => p && !p.startsWith(':'));
      const resource = pathParts[2] || 'general'; // e.g., /api/v2/campaigns -> 'campaigns'
      
      if (!groups[resource]) {
        groups[resource] = [];
      }
      groups[resource].push(endpoint);
    });
    
    return groups;
  }

  /**
   * Convert string to CONSTANT_CASE
   */
  private toConstantCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]/g, '_')
      .toUpperCase();
  }

  /**
   * Convert string to camelCase
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/_([a-z])/g, (g) => g[1]?.toUpperCase() || '')
      .replace(/^[A-Z]/, (g) => g.toLowerCase());
  }
}

// Main execution
async function main() {
  const inputPath = process.argv[2] || './extracted-contracts.json';
  const outputDir = process.argv[3] || './src/lib/types/generated';

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    console.log('Run extract-go-contracts.ts first to generate the contracts file');
    process.exit(1);
  }

  const contracts = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  
  const generator = new TypeScriptGenerator(contracts, {
    inputPath,
    outputDir,
    generateEnums: true,
    generateInterfaces: true,
    generateAPITypes: true,
    generateTransformers: true
  });

  try {
    await generator.generate();
    console.log('\n✅ Type generation complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Type generation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { TypeScriptGenerator };