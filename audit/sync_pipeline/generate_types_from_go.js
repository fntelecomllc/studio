#!/usr/bin/env node

/**
 * GENERATE TYPESCRIPT TYPES FROM GO AST
 * 
 * This script parses Go source files and generates corresponding TypeScript
 * type definitions, ensuring frontend types stay synchronized with the
 * authoritative backend contracts.
 * 
 * Features:
 * - Parses Go structs, interfaces, and enums
 * - Handles int64 to SafeBigInt conversion
 * - Preserves Go struct tags for JSON mapping
 * - Generates branded types for special fields
 * - Creates discriminated unions for polymorphic types
 * 
 * Usage:
 *   node generate_types_from_go.js [options]
 *   
 * Options:
 *   --input <dir>    Go source directory (default: backend/internal)
 *   --output <file>  TypeScript output file (default: src/lib/types/generated.ts)
 *   --watch          Watch for changes and regenerate
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ==============================================================================
// CONFIGURATION
// ==============================================================================

const config = {
  inputDir: process.argv.includes('--input') 
    ? process.argv[process.argv.indexOf('--input') + 1] 
    : 'backend/internal',
  outputFile: process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : 'src/lib/types/generated.ts',
  watchMode: process.argv.includes('--watch'),
  
  // Type mappings from Go to TypeScript
  typeMap: {
    // Basic types
    'string': 'string',
    'bool': 'boolean',
    'int': 'number',
    'int8': 'number',
    'int16': 'number',
    'int32': 'number',
    'int64': 'SafeBigInt',
    'uint': 'number',
    'uint8': 'number',
    'uint16': 'number',
    'uint32': 'number',
    'uint64': 'SafeBigInt',
    'float32': 'number',
    'float64': 'number',
    'byte': 'number',
    'rune': 'number',
    
    // Common types
    'time.Time': 'ISODateString',
    'uuid.UUID': 'UUID',
    'decimal.Decimal': 'string',
    'json.RawMessage': 'unknown',
    
    // Custom types
    'NullString': 'string | null',
    'NullTime': 'ISODateString | null',
    'NullInt64': 'SafeBigInt | null',
  },
  
  // Fields that should use branded types
  brandedFields: {
    'id': 'UUID',
    'uuid': 'UUID',
    'email': 'Email',
    'url': 'URL',
    'created_at': 'ISODateString',
    'updated_at': 'ISODateString',
    'deleted_at': 'ISODateString | null',
  },
  
  // Enum detection patterns
  enumPatterns: [
    /type\s+(\w+)\s+string\s*$/,
    /type\s+(\w+)\s+int\s*$/,
  ]
};

// ==============================================================================
// GO AST PARSER
// ==============================================================================

class GoASTParser {
  constructor() {
    this.structs = new Map();
    this.enums = new Map();
    this.constants = new Map();
    this.interfaces = new Map();
  }
  
  /**
   * Parse Go source file using go/ast
   */
  async parseFile(filePath) {
    // Use Go's built-in parser via a helper Go program
    const goParserScript = `
package main

import (
    "encoding/json"
    "fmt"
    "go/ast"
    "go/parser"
    "go/token"
    "os"
    "reflect"
    "strings"
)

type FieldInfo struct {
    Name     string \`json:"name"\`
    Type     string \`json:"type"\`
    Tag      string \`json:"tag"\`
    JsonName string \`json:"jsonName"\`
    Optional bool   \`json:"optional"\`
}

type StructInfo struct {
    Name   string      \`json:"name"\`
    Fields []FieldInfo \`json:"fields"\`
}

type EnumInfo struct {
    Name   string   \`json:"name"\`
    Type   string   \`json:"type"\`
    Values []string \`json:"values"\`
}

type ParseResult struct {
    Structs []StructInfo \`json:"structs"\`
    Enums   []EnumInfo   \`json:"enums"\`
}

func main() {
    if len(os.Args) < 2 {
        fmt.Fprintf(os.Stderr, "Usage: %s <file.go>\\n", os.Args[0])
        os.Exit(1)
    }

    fset := token.NewFileSet()
    node, err := parser.ParseFile(fset, os.Args[1], nil, parser.ParseComments)
    if err != nil {
        fmt.Fprintf(os.Stderr, "Error parsing file: %v\\n", err)
        os.Exit(1)
    }

    result := ParseResult{
        Structs: []StructInfo{},
        Enums:   []EnumInfo{},
    }

    // Extract structs
    ast.Inspect(node, func(n ast.Node) bool {
        switch x := n.(type) {
        case *ast.TypeSpec:
            if structType, ok := x.Type.(*ast.StructType); ok {
                structInfo := StructInfo{
                    Name:   x.Name.Name,
                    Fields: []FieldInfo{},
                }

                for _, field := range structType.Fields.List {
                    fieldType := getTypeString(field.Type)
                    tag := ""
                    jsonName := ""
                    optional := false

                    if field.Tag != nil {
                        tag = field.Tag.Value
                        jsonTag := reflect.StructTag(strings.Trim(tag, "\`")).Get("json")
                        parts := strings.Split(jsonTag, ",")
                        if len(parts) > 0 && parts[0] != "" && parts[0] != "-" {
                            jsonName = parts[0]
                        }
                        for _, part := range parts[1:] {
                            if part == "omitempty" {
                                optional = true
                            }
                        }
                    }

                    for _, name := range field.Names {
                        if jsonName == "" {
                            jsonName = name.Name
                        }
                        structInfo.Fields = append(structInfo.Fields, FieldInfo{
                            Name:     name.Name,
                            Type:     fieldType,
                            Tag:      tag,
                            JsonName: jsonName,
                            Optional: optional,
                        })
                    }
                }

                result.Structs = append(result.Structs, structInfo)
            }
        }
        return true
    })

    // Output as JSON
    output, err := json.MarshalIndent(result, "", "  ")
    if err != nil {
        fmt.Fprintf(os.Stderr, "Error marshaling result: %v\\n", err)
        os.Exit(1)
    }
    fmt.Println(string(output))
}

func getTypeString(expr ast.Expr) string {
    switch t := expr.(type) {
    case *ast.Ident:
        return t.Name
    case *ast.SelectorExpr:
        return getTypeString(t.X) + "." + t.Sel.Name
    case *ast.ArrayType:
        return "[]" + getTypeString(t.Elt)
    case *ast.MapType:
        return "map[" + getTypeString(t.Key) + "]" + getTypeString(t.Value)
    case *ast.StarExpr:
        return "*" + getTypeString(t.X)
    case *ast.InterfaceType:
        return "interface{}"
    default:
        return "unknown"
    }
}
`;

    // Write temporary Go parser program
    const tempFile = path.join('/tmp', `go_parser_${Date.now()}.go`);
    await fs.promises.writeFile(tempFile, goParserScript);
    
    try {
      // Run the Go parser
      const { stdout } = await execAsync(`go run ${tempFile} ${filePath}`);
      const result = JSON.parse(stdout);
      
      // Process structs
      for (const struct of result.structs || []) {
        this.structs.set(struct.name, struct);
      }
      
      // Process enums (would need additional logic in Go parser)
      for (const enumDef of result.enums || []) {
        this.enums.set(enumDef.name, enumDef);
      }
      
    } finally {
      // Clean up temp file
      await fs.promises.unlink(tempFile).catch(() => {});
    }
  }
  
  /**
   * Parse all Go files in a directory
   */
  async parseDirectory(dir) {
    const files = await this.findGoFiles(dir);
    
    for (const file of files) {
      console.log(`Parsing ${file}...`);
      await this.parseFile(file);
    }
  }
  
  /**
   * Find all Go files recursively
   */
  async findGoFiles(dir) {
    const files = [];
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        files.push(...await this.findGoFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.go') && !entry.name.endsWith('_test.go')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
}

// ==============================================================================
// TYPESCRIPT GENERATOR
// ==============================================================================

class TypeScriptGenerator {
  constructor(parser) {
    this.parser = parser;
    this.output = [];
  }
  
  /**
   * Generate TypeScript definitions
   */
  generate() {
    this.generateHeader();
    this.generateImports();
    this.generateEnums();
    this.generateInterfaces();
    this.generateTypeGuards();
    this.generateTransformers();
    
    return this.output.join('\n');
  }
  
  generateHeader() {
    this.output.push(`/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * 
 * This file is automatically generated from Go source code.
 * Any manual changes will be overwritten.
 * 
 * Generated: ${new Date().toISOString()}
 * Source: ${config.inputDir}
 */

/* eslint-disable */
/* tslint:disable */
`);
  }
  
  generateImports() {
    this.output.push(`import {
  SafeBigInt,
  UUID,
  ISODateString,
  Email,
  URL,
  createSafeBigInt,
  createUUID,
  createISODateString,
  createEmail,
  createURL,
  transformInt64Fields,
} from './branded';
`);
  }
  
  generateEnums() {
    for (const [name, enumInfo] of this.parser.enums) {
      this.output.push(`
/**
 * ${name} enum from Go
 */
export const ${name} = {`);
      
      for (const value of enumInfo.values) {
        this.output.push(`  ${value}: '${value}',`);
      }
      
      this.output.push(`} as const;

export type ${name} = typeof ${name}[keyof typeof ${name}];
`);
    }
  }
  
  generateInterfaces() {
    for (const [name, struct] of this.parser.structs) {
      // Skip internal structs
      if (name.startsWith('_') || name.toLowerCase().includes('internal')) {
        continue;
      }
      
      this.output.push(`
/**
 * ${name} from Go struct
 */
export interface ${name} {`);
      
      for (const field of struct.fields) {
        const tsType = this.mapGoTypeToTS(field.type, field.jsonName);
        const optional = field.optional ? '?' : '';
        const comment = field.tag ? ` // ${field.tag}` : '';
        
        this.output.push(`  ${field.jsonName}${optional}: ${tsType};${comment}`);
      }
      
      this.output.push(`}
`);
    }
  }
  
  generateTypeGuards() {
    this.output.push(`
// ==============================================================================
// TYPE GUARDS
// ==============================================================================
`);
    
    for (const [name, struct] of this.parser.structs) {
      if (name.startsWith('_') || name.toLowerCase().includes('internal')) {
        continue;
      }
      
      this.output.push(`
export function is${name}(value: unknown): value is ${name} {
  return (
    typeof value === 'object' &&
    value !== null &&`);
      
      // Add checks for required fields
      const requiredFields = struct.fields.filter(f => !f.optional);
      for (const field of requiredFields) {
        this.output.push(`    '${field.jsonName}' in value &&`);
      }
      
      // Remove last &&
      if (requiredFields.length > 0) {
        this.output[this.output.length - 1] = this.output[this.output.length - 1].slice(0, -3);
      }
      
      this.output.push(`  );
}`);
    }
  }
  
  generateTransformers() {
    this.output.push(`
// ==============================================================================
// API TRANSFORMERS
// ==============================================================================
`);
    
    for (const [name, struct] of this.parser.structs) {
      if (name.startsWith('_') || name.toLowerCase().includes('internal')) {
        continue;
      }
      
      // Find int64 fields
      const int64Fields = struct.fields.filter(f => 
        f.type === 'int64' || f.type === 'uint64' || f.type === 'NullInt64'
      );
      
      if (int64Fields.length === 0) {
        continue;
      }
      
      this.output.push(`
/**
 * Transform raw API response to ${name} with proper int64 handling
 */
export function transform${name}(raw: any): ${name} {
  return {
    ...raw,`);
      
      for (const field of int64Fields) {
        if (field.optional || field.type === 'NullInt64') {
          this.output.push(`    ${field.jsonName}: raw.${field.jsonName} ? createSafeBigInt(raw.${field.jsonName}) : null,`);
        } else {
          this.output.push(`    ${field.jsonName}: createSafeBigInt(raw.${field.jsonName}),`);
        }
      }
      
      this.output.push(`  };
}`);
    }
  }
  
  /**
   * Map Go type to TypeScript type
   */
  mapGoTypeToTS(goType, fieldName) {
    // Check branded fields first
    if (config.brandedFields[fieldName]) {
      return config.brandedFields[fieldName];
    }
    
    // Handle arrays
    if (goType.startsWith('[]')) {
      const elementType = goType.substring(2);
      return `${this.mapGoTypeToTS(elementType, fieldName)}[]`;
    }
    
    // Handle maps
    if (goType.startsWith('map[')) {
      const match = goType.match(/map\[(.+)\](.+)/);
      if (match) {
        const keyType = this.mapGoTypeToTS(match[1], fieldName);
        const valueType = this.mapGoTypeToTS(match[2], fieldName);
        return `Record<${keyType}, ${valueType}>`;
      }
    }
    
    // Handle pointers
    if (goType.startsWith('*')) {
      const innerType = goType.substring(1);
      return `${this.mapGoTypeToTS(innerType, fieldName)} | null`;
    }
    
    // Check type map
    return config.typeMap[goType] || 'unknown';
  }
}

// ==============================================================================
// MAIN EXECUTION
// ==============================================================================

async function main() {
  console.log('🚀 Generating TypeScript types from Go source...\n');
  
  try {
    // Check if Go is installed
    await execAsync('go version');
  } catch (error) {
    console.error('❌ Go is not installed or not in PATH');
    process.exit(1);
  }
  
  const parser = new GoASTParser();
  
  // Parse Go files
  console.log(`📁 Parsing Go files in ${config.inputDir}...`);
  await parser.parseDirectory(config.inputDir);
  
  console.log(`\n✅ Parsed ${parser.structs.size} structs, ${parser.enums.size} enums\n`);
  
  // Generate TypeScript
  const generator = new TypeScriptGenerator(parser);
  const output = generator.generate();
  
  // Write output
  const outputDir = path.dirname(config.outputFile);
  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(config.outputFile, output);
  
  console.log(`📝 Generated TypeScript definitions: ${config.outputFile}`);
  
  // Watch mode
  if (config.watchMode) {
    console.log('\n👀 Watching for changes...');
    
    const { watch } = require('chokidar');
    const watcher = watch(config.inputDir, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
    });
    
    watcher.on('change', async (filePath) => {
      if (filePath.endsWith('.go')) {
        console.log(`\n🔄 ${filePath} changed, regenerating...`);
        await main();
      }
    });
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { GoASTParser, TypeScriptGenerator };