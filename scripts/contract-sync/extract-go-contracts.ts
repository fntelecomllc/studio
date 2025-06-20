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
    
    // Extract enums
    await this.extractEnums();

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
      if (parts.length >= 3 && !typeDecl.includes('struct')) {
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
   * Parse struct fields
   */
  private parseStructFields(body: string): GoField[] {
    const fields: GoField[] = [];
    const fieldRegex = /(\w+)\s+(\*?)([^\s`]+)\s*(`[^`]*`)?/g;
    let match;

    while ((match = fieldRegex.exec(body)) !== null) {
      const fieldName = match[1];
      const isPointer = match[2] === '*';
      const fieldType = match[3];
      const tags = match[4] || '';

      // Parse tags
      const jsonTag = this.parseTag(tags, 'json');
      const dbTag = this.parseTag(tags, 'db');
      
      // Check if field is required
      const required = !isPointer && !jsonTag?.includes('omitempty');

      fields.push({
        name: fieldName,
        type: fieldType,
        jsonTag: jsonTag?.split(',')[0] || fieldName,
        dbTag,
        required,
        isPointer
      });
    }

    return fields;
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
      
      // Check if this is an enum pattern
      const enumPattern = /(\w+)Enum/;
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      
      const enumMap = new Map<string, string[]>();
      
      lines.forEach(line => {
        const constMatch = line.match(/(\w+)\s*=\s*"([^"]+)"/);
        if (constMatch) {
          const constName = constMatch[1];
          const constValue = constMatch[2];
          
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
  private parseHandlers(content: string, filename: string) {
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
   * Generate TypeScript declaration from contracts
   */
  private generateTypeScriptDeclaration(): string {
    let output = `// Auto-generated TypeScript declarations from Go contracts
// Generated: ${this.contracts.timestamp}
// Go Version: ${this.contracts.goVersion}

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

    // Generate interfaces
    this.contracts.models.forEach(model => {
      if (model.kind === 'struct' && model.fields) {
        output += `export interface ${model.name} {\n`;
        model.fields.forEach(field => {
          const tsType = this.goTypeToTypeScript(field.type);
          const optional = field.isPointer ? '?' : '';
          const fieldName = field.jsonTag || field.name;
          output += `  ${fieldName}${optional}: ${tsType};\n`;
        });
        output += `}\n\n`;
      }
    });

    return output;
  }

  /**
   * Convert Go type to TypeScript type
   */
  private goTypeToTypeScript(goType: string): string {
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

    return typeMap[goType] || goType;
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
  } catch (error) {
    console.error('❌ Contract extraction failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { GoContractExtractor, ExtractedContracts };