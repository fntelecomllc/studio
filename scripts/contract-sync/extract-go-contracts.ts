#!/usr/bin/env ts-node

/**
 * Extract Go Contracts
 * 
 * Parses Go AST to extract type definitions, enums, and API contracts
 * This is the source of truth for contract synchronization
 * 
 * Usage: ts-node extract-go-contracts.ts [backend-path]
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface GoType {
  name: string;
  package: string;
  kind: 'struct' | 'interface' | 'enum' | 'type';
  fields?: GoField[];
  values?: string[];
  underlying?: string;
  file: string;
}

interface GoField {
  name: string;
  type: string;
  jsonTag?: string;
  dbTag?: string;
  required: boolean;
  isPointer: boolean;
}

interface GoEnum {
  name: string;
  values: string[];
  package: string;
  file: string;
}

interface GoEndpoint {
  method: string;
  path: string;
  handler: string;
  requestType?: string;
  responseType?: string;
  middleware?: string[];
}

interface ExtractedContracts {
  models: GoType[];
  enums: GoEnum[];
  endpoints: GoEndpoint[];
  timestamp: string;
  goVersion: string;
}

class GoContractExtractor {
  private backendPath: string;
  private contracts: ExtractedContracts;

  constructor(backendPath: string) {
    this.backendPath = path.resolve(backendPath);
    this.contracts = {
      models: [],
      enums: [],
      endpoints: [],
      timestamp: new Date().toISOString(),
      goVersion: this.getGoVersion()
    };
  }

  private getGoVersion(): string {
    try {
      return execSync('go version', { encoding: 'utf-8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Extract all contracts from Go codebase
   */
  async extract(): Promise<ExtractedContracts> {
    console.log(`Extracting contracts from: ${this.backendPath}`);

    // Extract models
    await this.extractModels();
    
    // Extract API endpoints
    await this.extractEndpoints();
    
    // Enums are extracted as part of extractConstants in parseGoFile

    return this.contracts;
  }

  /**
   * Extract model definitions from models package
   */
  private async extractModels() {
    const modelsPath = path.join(this.backendPath, 'internal/models');
    
    if (!fs.existsSync(modelsPath)) {
      console.warn('Models directory not found:', modelsPath);
      return;
    }

    const files = fs.readdirSync(modelsPath)
      .filter(f => f.endsWith('.go') && !f.endsWith('_test.go'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(modelsPath, file), 'utf-8');
      this.parseGoFile(content, file, 'models');
    }
  }

  /**
   * Parse Go file and extract type definitions
   */
  private parseGoFile(content: string, filename: string, pkg: string) {
    // Extract struct definitions
    const structRegex = /type\s+(\w+)\s+struct\s*{([^}]+)}/g;
    let match;

    while ((match = structRegex.exec(content)) !== null) {
      const typeName = match[1];
      const body = match[2];
      
      if (!typeName || !body) continue;
      
      const fields = this.parseStructFields(body);
      
      this.contracts.models.push({
        name: typeName,
        package: pkg,
        kind: 'struct',
        fields,
        file: filename
      });
    }

    // Extract type aliases
    const typeRegex = /type\s+(\w+)\s+(\w+)/g;
    content.match(typeRegex)?.forEach(typeDecl => {
      const parts = typeDecl.split(/\s+/);
      if (parts.length >= 3 && !typeDecl.includes('struct') && parts[1] && parts[2]) {
        this.contracts.models.push({
          name: parts[1],
          package: pkg,
          kind: 'type',
          underlying: parts[2],
          file: filename
        });
      }
    });

    // Extract constants (potential enums)
    this.extractConstants(content, filename, pkg);
  }

  /**
   * Parse struct fields with improved regex and comment handling
   */
  private parseStructFields(body: string): GoField[] {
    const fields: GoField[] = [];
    
    // Clean the body - remove comments and normalize whitespace
    const cleanBody = body
      .split('\n')
      .map(line => {
        // Remove line comments
        const commentIndex = line.indexOf('//');
        if (commentIndex !== -1) {
          line = line.substring(0, commentIndex);
        }
        return line.trim();
      })
      .filter(line => line.length > 0)
      .join('\n');

    // Enhanced regex to properly capture struct fields
    // Matches: FieldName *?Type `tags`
    const fieldRegex = /^\s*([A-Z]\w*)\s+(\*?)([^\s`]+(?:\[[^\]]*\])?)\s*(`[^`]*`)?\s*$/gm;
    let match;

    while ((match = fieldRegex.exec(cleanBody)) !== null) {
      const fieldName = match[1];
      const isPointer = match[2] === '*';
      let fieldType = match[3];
      const tags = match[4] || '';

      if (!fieldName || !fieldType) continue;

      // Skip embedded types (fields without proper names)
      if (fieldName.includes(' ') || fieldName.includes(':')) continue;

      // Clean up field type
      fieldType = fieldType.trim();

      // Parse tags
      const jsonTag = this.parseTag(tags, 'json');
      const dbTag = this.parseTag(tags, 'db');
      
      // Skip fields with '-' json tag (excluded from JSON)
      if (jsonTag === '-') continue;
      
      // Check if field is required
      const required = !isPointer && !jsonTag?.includes('omitempty');

      fields.push({
        name: fieldName,
        type: fieldType,
        jsonTag: jsonTag?.split(',')[0] || this.camelCase(fieldName),
        dbTag,
        required,
        isPointer
      });
    }

    return fields;
  }

  /**
   * Convert PascalCase to camelCase for JSON field names
   */
  private camelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  /**
   * Parse struct tag
   */
  private parseTag(tags: string, tagName: string): string | undefined {
    const regex = new RegExp(`${tagName}:"([^"]+)"`);
    const match = tags.match(regex);
    return match ? match[1] : undefined;
  }

  /**
   * Extract constants and enums
   */
  private extractConstants(content: string, filename: string, pkg: string) {
    // Look for const blocks
    const constBlockRegex = /const\s*\(([^)]+)\)/gs;
    let match;

    while ((match = constBlockRegex.exec(content)) !== null) {
      const block = match[1];
      
      if (!block) continue;
      
      // Check if this is an enum pattern
      const _enumPattern = /(\w+)Enum/;
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      
      const enumMap = new Map<string, string[]>();
      
      lines.forEach(line => {
        const constMatch = line.match(/(\w+)\s*=\s*"([^"]+)"/);
        if (constMatch) {
          const constName = constMatch[1];
          const constValue = constMatch[2];
          
          if (!constName || !constValue) return;
          
          // Try to determine enum type from name
          const enumType = this.inferEnumType(constName);
          if (enumType) {
            if (!enumMap.has(enumType)) {
              enumMap.set(enumType, []);
            }
            enumMap.get(enumType)!.push(constValue);
          }
        }
      });

      // Add discovered enums
      enumMap.forEach((values, name) => {
        this.contracts.enums.push({
          name,
          values,
          package: pkg,
          file: filename
        });
      });
    }
  }

  /**
   * Infer enum type from constant name
   */
  private inferEnumType(constName: string): string | null {
    const patterns = [
      { regex: /^CampaignStatus/, type: 'CampaignStatus' },
      { regex: /^CampaignType/, type: 'CampaignType' },
      { regex: /^PersonaType/, type: 'PersonaType' },
      { regex: /^ProxyProtocol/, type: 'ProxyProtocol' },
      { regex: /^JobStatus/, type: 'JobStatus' },
      { regex: /^HTTPSourceType/, type: 'HTTPSourceType' },
      { regex: /^DomainPatternType/, type: 'DomainPatternType' }
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(constName)) {
        return pattern.type;
      }
    }

    return null;
  }

  /**
   * Extract API endpoints from handlers
   */
  private async extractEndpoints() {
    const handlersPath = path.join(this.backendPath, 'internal/api');
    const mainPath = path.join(this.backendPath, 'cmd/apiserver/main.go');

    if (!fs.existsSync(handlersPath)) {
      console.warn('API handlers directory not found:', handlersPath);
      return;
    }

    // Parse main.go for route definitions
    if (fs.existsSync(mainPath)) {
      const content = fs.readFileSync(mainPath, 'utf-8');
      this.parseRoutes(content);
    }

    // Parse handler files
    const files = fs.readdirSync(handlersPath)
      .filter(f => f.endsWith('_handlers.go'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(handlersPath, file), 'utf-8');
      this.parseHandlers(content, file);
    }
  }

  /**
   * Parse route definitions
   */
  private parseRoutes(content: string) {
    // Gin route patterns
    const routePatterns = [
      /(\w+)\.(GET|POST|PUT|DELETE|PATCH)\("([^"]+)",\s*(\w+)/g,
      /router\.(GET|POST|PUT|DELETE|PATCH)\("([^"]+)",\s*(\w+)/g
    ];

    routePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const method = match[1] === 'router' ? match[1] : match[2];
        const path = match[1] === 'router' ? match[2] : match[3];
        const handler = match[1] === 'router' ? match[3] : match[4];

        if (!method || !path || !handler) continue;

        this.contracts.endpoints.push({
          method,
          path,
          handler
        });
      }
    });
  }

  /**
   * Parse handler functions
   */
  private parseHandlers(content: string, _filename: string) {
    // Extract handler function signatures
    const handlerRegex = /func\s+\((\w+)\s+\*\w+\)\s+(\w+)\s*\(/g;
    let match;

    while ((match = handlerRegex.exec(content)) !== null) {
      const handlerName = match[2];
      
      // Try to find request/response types in handler body
      const handlerBody = this.extractHandlerBody(content, match.index);
      const requestType = this.findRequestType(handlerBody);
      const responseType = this.findResponseType(handlerBody);

      // Update endpoint info if exists
      const endpoint = this.contracts.endpoints.find(e => e.handler === handlerName);
      if (endpoint) {
        endpoint.requestType = requestType;
        endpoint.responseType = responseType;
      }
    }
  }

  /**
   * Extract handler function body
   */
  private extractHandlerBody(content: string, startIndex: number): string {
    let braceCount = 0;
    let inBody = false;
    let bodyStart = startIndex;
    
    for (let i = startIndex; i < content.length; i++) {
      if (content[i] === '{') {
        if (!inBody) {
          inBody = true;
          bodyStart = i;
        }
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0 && inBody) {
          return content.substring(bodyStart, i + 1);
        }
      }
    }
    
    return '';
  }

  /**
   * Find request type in handler body
   */
  private findRequestType(body: string): string | undefined {
    const patterns = [
      /var\s+(\w+)\s+(\w+).*ShouldBindJSON/,
      /(\w+)\s*:=\s*&?(\w+){}/,
      /&(\w+){}.*ShouldBindJSON/
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return match[2] || match[1];
      }
    }

    return undefined;
  }

  /**
   * Find response type in handler body
   */
  private findResponseType(body: string): string | undefined {
    const patterns = [
      /c\.JSON\(\d+,\s*(\w+)/,
      /response\s*:=\s*&?(\w+){}/,
      /gin\.H{([^}]+)}/
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) {
        return match[1] === 'gin' ? 'gin.H' : match[1];
      }
    }

    return undefined;
  }

  /**
   * Save extracted contracts to file
   */
  async save(outputPath: string) {
    const output = JSON.stringify(this.contracts, null, 2);
    fs.writeFileSync(outputPath, output);
    console.log(`Contracts saved to: ${outputPath}`);
    
    // Also create a TypeScript declaration file
    const tsDeclaration = this.generateTypeScriptDeclaration();
    const tsPath = outputPath.replace('.json', '.d.ts');
    fs.writeFileSync(tsPath, tsDeclaration);
    console.log(`TypeScript declarations saved to: ${tsPath}`);
  }

  /**
   * Generate TypeScript declaration from contracts with SafeBigInt imports
   */
  private generateTypeScriptDeclaration(): string {
    let output = `// Auto-generated TypeScript declarations from Go contracts
// Generated: ${this.contracts.timestamp}
// Go Version: ${this.contracts.goVersion}

// Import branded types for type safety
import type { SafeBigInt, UUID, ISODateString } from '../types/branded-types';

`;

    // Generate enums
    this.contracts.enums.forEach(enumDef => {
      output += `export enum ${enumDef.name} {\n`;
      enumDef.values.forEach(value => {
        const key = this.toConstantCase(value);
        output += `  ${key} = '${value}',\n`;
      });
      output += `}\n\n`;
    });

    // Generate interfaces with SafeBigInt integration
    this.contracts.models.forEach(model => {
      if (model.kind === 'struct' && model.fields) {
        // Add JSDoc comments for int64 fields
        const int64Fields = model.fields?.filter(f => f.type === 'int64' || f.type === 'uint64') || [];
        if (int64Fields.length > 0) {
          output += `/**\n * ${model.name} - Auto-generated from Go struct\n`;
          output += ` * \n * SafeBigInt fields (int64/uint64 from Go):\n`;
          int64Fields.forEach(field => {
            output += ` * - ${field.jsonTag || field.name}: Requires SafeBigInt for overflow protection\n`;
          });
          output += ` */\n`;
        }
        
        output += `export interface ${model.name} {\n`;
        model.fields.forEach(field => {
          const tsType = this.goTypeToTypeScript(field.type);
          const optional = field.isPointer ? '?' : '';
          const fieldName = field.jsonTag || field.name;
          
          // Add comment for SafeBigInt fields
          if (tsType.includes('SafeBigInt')) {
            output += `  /** @description int64 field from Go - use createSafeBigInt() for construction */\n`;
          }
          
          output += `  ${fieldName}${optional}: ${tsType};\n`;
        });
        output += `}\n\n`;
      }
    });

    // Generate utility types for API responses
    output += `// Utility types for API integration\n`;
    output += `export type ApiResponse<T> = {\n`;
    output += `  data: T;\n`;
    output += `  status: number;\n`;
    output += `  message?: string;\n`;
    output += `};\n\n`;
    
    output += `export type PaginatedResponse<T> = {\n`;
    output += `  data: T[];\n`;
    output += `  pagination: {\n`;
    output += `    page: number;\n`;
    output += `    limit: number;\n`;
    output += `    total: SafeBigInt;\n`;
    output += `    totalPages: number;\n`;
    output += `  };\n`;
    output += `};\n\n`;

    return output;
  }

  /**
   * Convert Go type to TypeScript type with SafeBigInt integration
   */
  private goTypeToTypeScript(goType: string): string {
    // Clean up the type string
    goType = goType.trim();

    const typeMap: Record<string, string> = {
      'string': 'string',
      'int': 'number',
      'int32': 'number',
      'int64': 'SafeBigInt',
      'uint64': 'SafeBigInt',
      'float32': 'number',
      'float64': 'number',
      'bool': 'boolean',
      'time.Time': 'ISODateString',
      'uuid.UUID': 'UUID',
      'uuid.NullUUID': 'UUID | null',
      'json.RawMessage': 'Record<string, unknown>',
      'interface{}': 'Record<string, unknown>',
      'sql.NullString': 'string | null',
      'sql.NullInt64': 'SafeBigInt | null',
      'sql.NullBool': 'boolean | null',
      'sql.NullTime': 'ISODateString | null',
      'net.IP': 'string',
      '[]string': 'string[]',
      '[]byte': 'string',
      '[]int': 'number[]',
      '[]int64': 'SafeBigInt[]',
      '[]uint64': 'SafeBigInt[]',
      '[]UUID': 'UUID[]',
      '*string': 'string | null',
      '*int': 'number | null',
      '*int32': 'number | null',
      '*int64': 'SafeBigInt | null',
      '*uint64': 'SafeBigInt | null',
      '*bool': 'boolean | null',
      '*time.Time': 'ISODateString | null',
      '*uuid.UUID': 'UUID | null'
    };

    // Handle map types: map[string]int -> Record<string, number>
    const mapMatch = goType.match(/^map\[([^\]]+)\](.+)$/);
    if (mapMatch && mapMatch[1] && mapMatch[2]) {
      const keyType = this.goTypeToTypeScript(mapMatch[1]);
      const valueType = this.goTypeToTypeScript(mapMatch[2]);
      return `Record<${keyType}, ${valueType}>`;
    }

    // Handle slice types: []Type -> Type[]
    if (goType.startsWith('[]')) {
      const elementType = goType.substring(2);
      const tsElementType = this.goTypeToTypeScript(elementType);
      return `${tsElementType}[]`;
    }

    // Handle pointer types: *Type -> Type | null
    if (goType.startsWith('*')) {
      const baseType = goType.substring(1);
      const tsBaseType = this.goTypeToTypeScript(baseType);
      return `${tsBaseType} | null`;
    }

    // Handle channel types: chan Type -> never (not used in API)
    if (goType.startsWith('chan ')) {
      return 'never';
    }

    // Direct type mapping
    const mappedType = typeMap[goType];
    if (mappedType) {
      return mappedType;
    }

    // If it's a custom type name (starts with uppercase), assume it's an interface
    if (/^[A-Z][a-zA-Z0-9]*$/.test(goType)) {
      return goType;
    }

    // Default fallback to unknown for unmapped types
    console.warn(`Unknown Go type: ${goType}, defaulting to 'unknown'`);
    return 'unknown';
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
}

// Main execution
async function main() {
  const backendPath = process.argv[2] || './backend';
  const outputPath = process.argv[3] || './extracted-contracts.json';

  const extractor = new GoContractExtractor(backendPath);
  
  try {
    await extractor.extract();
    await extractor.save(outputPath);
    
    console.log('✅ Contract extraction complete!');
    process.exit(0);
  } catch {
    console.error('❌ Contract extraction failed:', error);
    process.exit(1);
  }
}

// ESM-compatible main module check
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { GoContractExtractor };
export type { ExtractedContracts };