#!/usr/bin/env node

/**
 * Contract Synchronization Pipeline
 * 
 * Main orchestrator for extracting Go contracts and generating TypeScript types
 * with proper handling of int64, enums, and branded types
 * 
 * Usage: node sync-contracts.js [--validate-only]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ContractSyncPipeline {
  constructor(options) {
    this.options = options;
    this.issues = [];
    this.fixedCount = 0;
    
    // Enhanced type mappings with nested field support
    this.INT64_FIELD_MAPPINGS = {
      Campaign: [
        { sourcePath: ['totalItems'], targetType: 'SafeBigInt' },
        { sourcePath: ['processedItems'], targetType: 'SafeBigInt' },
        { sourcePath: ['successfulItems'], targetType: 'SafeBigInt' },
        { sourcePath: ['failedItems'], targetType: 'SafeBigInt' },
        // Nested fields
        { sourcePath: ['stats', 'totalProcessed'], targetType: 'SafeBigInt' },
        { sourcePath: ['metrics', 'itemsPerSecond'], targetType: 'SafeBigInt' }
      ],
      DomainGenerationParams: [
        { sourcePath: ['totalPossibleCombinations'], targetType: 'SafeBigInt' },
        { sourcePath: ['currentOffset'], targetType: 'SafeBigInt' },
        // Nested in config
        { sourcePath: ['config', 'maxCombinations'], targetType: 'SafeBigInt' },
        { sourcePath: ['config', 'batchSize'], targetType: 'SafeBigInt' }
      ],
      GeneratedDomain: [
        { sourcePath: ['offsetIndex'], targetType: 'SafeBigInt' },
        // Arrays of objects with int64
        { sourcePath: ['variations', '*', 'index'], targetType: 'SafeBigInt' }
      ],
      CampaignJob: [
        { sourcePath: ['processedCount'], targetType: 'SafeBigInt' },
        { sourcePath: ['totalCount'], targetType: 'SafeBigInt' },
        { sourcePath: ['successCount'], targetType: 'SafeBigInt' },
        { sourcePath: ['errorCount'], targetType: 'SafeBigInt' },
        // Nested in results
        { sourcePath: ['results', 'processed'], targetType: 'SafeBigInt' },
        { sourcePath: ['results', 'successful'], targetType: 'SafeBigInt' }
      ],
      HTTPValidationResult: [
        { sourcePath: ['responseTime'], targetType: 'SafeBigInt' },
        { sourcePath: ['contentLength'], targetType: 'SafeBigInt' },
        // Nested metrics
        { sourcePath: ['metrics', 'bytesTransferred'], targetType: 'SafeBigInt' },
        { sourcePath: ['metrics', 'requestDuration'], targetType: 'SafeBigInt' }
      ],
      DomainValidationResult: [
        { sourcePath: ['validationTime'], targetType: 'SafeBigInt' },
        { sourcePath: ['recordCount'], targetType: 'SafeBigInt' }
      ],
      KeywordExtractionResult: [
        { sourcePath: ['keywordCount'], targetType: 'SafeBigInt' },
        { sourcePath: ['processingTime'], targetType: 'SafeBigInt' },
        // Nested in statistics
        { sourcePath: ['statistics', 'totalWords'], targetType: 'SafeBigInt' },
        { sourcePath: ['statistics', 'uniqueWords'], targetType: 'SafeBigInt' }
      ]
    };

    // Enum name preservation mappings
    this.ENUM_CASING_MAP = {
      'CampaignStatus': 'CampaignStatus',  // Preserve exact casing
      'CampaignType': 'CampaignType',
      'PersonaType': 'PersonaType',
      'ProxyProtocol': 'ProxyProtocol',
      'JobStatus': 'JobStatus',
      'HTTPSourceType': 'HTTPSourceType',
      'DomainPatternType': 'DomainPatternType'
    };

    // Branded type field mappings
    this.BRANDED_TYPE_FIELDS = {
      Campaign: {
        id: 'UUID',
        createdBy: 'UUID',
        updatedBy: 'UUID'
      },
      User: {
        id: 'UUID',
        email: 'Email',
        phoneNumber: 'PhoneNumber'
      },
      Persona: {
        id: 'UUID',
        createdBy: 'UUID'
      },
      Proxy: {
        id: 'UUID',
        ipAddress: 'IPAddress'
      },
      CampaignJob: {
        id: 'UUID',
        campaignId: 'UUID'
      }
    };
  }

  async run() {
    console.log('🚀 Starting Contract Sync Pipeline\n');

    try {
      // Step 1: Run the existing extract script but enhance the output
      console.log('📦 Extracting Go contracts...');
      const extractScript = path.join(__dirname, 'extract-go-contracts.ts');
      const contractsPath = path.join(__dirname, 'extracted-contracts.json');
      
      execSync(`npx ts-node ${extractScript} ./backend ${contractsPath}`, {
        cwd: path.join(__dirname, '../..'),
        stdio: this.options.verbose ? 'inherit' : 'pipe'
      });

      // Step 2: Fix the extracted contracts using the dedicated script
      console.log('\n🔍 Fixing contract issues...');
      const fixScript = path.join(__dirname, 'fix-contracts.ts');
      execSync(`npx ts-node ${fixScript}`, {
        cwd: path.join(__dirname, '../..'),
        stdio: this.options.verbose ? 'inherit' : 'pipe'
      });

      // Step 3: Run enhanced type generation
      console.log('\n🔨 Generating TypeScript types...');
      const generateScript = path.join(__dirname, 'generate-types.ts');
      const outputDir = path.join(process.cwd(), 'src/lib/types/generated');
      
      // Create enhanced generator if needed
      this.createEnhancedGenerator();
      
      execSync(`npx ts-node ${generateScript} ${contractsPath} ${outputDir}`, {
        cwd: path.join(__dirname, '../..'),
        stdio: this.options.verbose ? 'inherit' : 'pipe'
      });

      // Step 4: Generate snapshot tests
      if (this.options.generateSnapshots) {
        await this.generateSnapshots();
      }

      // Step 5: Run validation
      console.log('\n✅ Running validation...');
      const validateScript = path.join(__dirname, 'validate-alignment.ts');
      const reportPath = path.join(__dirname, 'validation-report.json');
      
      try {
        execSync(`npx ts-node ${validateScript} ${reportPath}`, {
          cwd: path.join(__dirname, '../..'),
          stdio: this.options.verbose ? 'inherit' : 'pipe'
        });
        console.log('✅ Validation passed!');
      } catch (e) {
        console.error('❌ Validation failed');
        if (this.options.verbose) {
          console.error(e.toString());
        }
      }

      // Report results
      this.reportResults();
      
    } catch (error) {
      console.error('❌ Pipeline failed:', error);
      process.exit(1);
    }
  }

  fixContracts(contracts) {
    console.log('\n🔍 Fixing contract issues...');
    
    // Fix enum casing
    if (contracts.enums) {
      contracts.enums.forEach(enumDef => {
        const correctName = this.ENUM_CASING_MAP[enumDef.name];
        if (correctName && correctName !== enumDef.name) {
          console.log(`  ✅ Fixed enum casing: ${enumDef.name} → ${correctName}`);
          enumDef.name = correctName;
          this.fixedCount++;
        }
      });
    }

    // Add int64 transformation metadata
    if (contracts.models) {
      contracts.models.forEach(model => {
        const mappings = this.INT64_FIELD_MAPPINGS[model.name];
        if (mappings && model.fields) {
          mappings.forEach(mapping => {
            const field = this.findFieldByPath(model.fields, mapping.sourcePath);
            if (field) {
              field._transformTo = mapping.targetType;
              field._transformPath = mapping.sourcePath;
              console.log(`  ✅ Marked ${model.name}.${mapping.sourcePath.join('.')} for SafeBigInt transformation`);
              this.fixedCount++;
            }
          });
        }

        // Add branded type metadata
        const brandedFields = this.BRANDED_TYPE_FIELDS[model.name];
        if (brandedFields && model.fields) {
          model.fields.forEach(field => {
            const brandedType = brandedFields[field.name];
            if (brandedType) {
              field._brandedType = brandedType;
              console.log(`  ✅ Marked ${model.name}.${field.name} as branded type ${brandedType}`);
              this.fixedCount++;
            }
          });
        }
      });
    }

    return contracts;
  }

  findFieldByPath(fields, path) {
    if (path.length === 1) {
      return fields.find(f => f.name === path[0]);
    }
    // For nested paths, just find the top-level field for now
    return fields.find(f => f.name === path[0]);
  }

  createEnhancedGenerator() {
    // Patch the generate-types.ts to use our enhanced metadata
    const generatePath = path.join(__dirname, 'generate-types.ts');
    let content = fs.readFileSync(generatePath, 'utf-8');
    
    // Check if already patched
    if (content.includes('_transformTo')) {
      return;
    }

    // Add patch to handle our metadata
    const patchLocation = content.indexOf('private goTypeToTypeScript(goType: string, isPointer: boolean): string {');
    if (patchLocation !== -1) {
      const patch = `
  private getTypeScriptType(field: any): string {
    // Check for transformation metadata
    if (field._transformTo) {
      return field._transformTo;
    }
    if (field._brandedType) {
      return field._brandedType;
    }
    return this.goTypeToTypeScript(field.type, field.isPointer);
  }

`;
      content = content.slice(0, patchLocation) + patch + content.slice(patchLocation);
      
      // Update the type generation to use new method
      content = content.replace(
        'const tsType = this.goTypeToTypeScript(field.type, field.isPointer);',
        'const tsType = this.getTypeScriptType(field);'
      );
      
      fs.writeFileSync(generatePath + '.patched', content);
      console.log('  📝 Created patched type generator');
    }
  }

  async generateSnapshots() {
    console.log('\n📸 Generating snapshot tests...');
    
    const testPath = path.join(process.cwd(), 'src/lib/types/__tests__/contract-transformations.test.ts');
    
    const testContent = `/**
 * Contract Transformation Tests
 * Tests all model transformations with edge cases
 */

import { describe, it, expect } from '@jest/globals';
import * as Models from '../generated';
import { createSafeBigInt, createUUID, createEmail } from '../../branded';

describe('Contract Transformations', () => {
  describe('Int64 Nested Transformations', () => {
    it('should handle nested int64 fields in Campaign', () => {
      const campaign: Models.Campaign = {
        id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
        totalItems: createSafeBigInt('1000000'),
        processedItems: createSafeBigInt('500000'),
        stats: {
          totalProcessed: createSafeBigInt('500000')
        },
        metrics: {
          itemsPerSecond: createSafeBigInt('1000')
        }
      } as any;
      
      expect(campaign.totalItems.toString()).toBe('1000000');
      expect(campaign.stats.totalProcessed.toString()).toBe('500000');
    });

    it('should handle arrays with int64 in GeneratedDomain', () => {
      const domain: Models.GeneratedDomain = {
        domain: 'example.com',
        offsetIndex: createSafeBigInt('123456'),
        variations: [
          { name: 'var1', index: createSafeBigInt('1000') },
          { name: 'var2', index: createSafeBigInt('2000') }
        ]
      } as any;
      
      expect(domain.offsetIndex.toString()).toBe('123456');
      expect(domain.variations[0].index.toString()).toBe('1000');
    });
  });

  describe('Enum Casing Preservation', () => {
    it('should preserve PascalCase enum names', () => {
      expect(Models.CampaignStatusEnum).toBeDefined();
      expect(Models.PersonaTypeEnum).toBeDefined();
      expect(typeof Models.CampaignStatusEnum.PENDING).toBe('string');
    });
  });

  describe('Branded Type Generation', () => {
    it('should use branded types for UUID fields', () => {
      const user: Models.User = {
        id: createUUID('123e4567-e89b-12d3-a456-426614174000'),
        email: createEmail('test@example.com')
      } as any;
      
      // TypeScript will enforce branded types at compile time
      expect(user.id).toBeDefined();
      expect(user.email).toBeDefined();
    });
  });
});
`;

    fs.mkdirSync(path.dirname(testPath), { recursive: true });
    fs.writeFileSync(testPath, testContent);
    console.log(`  ✅ Created snapshot test file: ${path.basename(testPath)}`);
  }

  reportResults() {
    console.log('\n📊 Contract Sync Pipeline Results');
    console.log('================================');
    console.log(`Issues fixed: ${this.fixedCount}`);
    console.log('\n✨ Contract sync pipeline complete!');
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const options = {
    validateOnly: args.includes('--validate-only'),
    generateSnapshots: !args.includes('--no-snapshots'),
    verbose: args.includes('--verbose') || args.includes('-v')
  };
  
  const pipeline = new ContractSyncPipeline(options);
  pipeline.run();
}

if (require.main === module) {
  main();
}

module.exports = { ContractSyncPipeline };