/**
 * Schema Snapshot Testing
 * 
 * This test suite ensures that all Zod schemas remain consistent over time.
 * Any changes to schemas will be caught by CI and require explicit approval.
 */

import * as fs from 'fs';
import * as path from 'path';

// Import all schemas from campaignSchemas
import {
  campaignSelectedTypeSchema,
  campaignPhaseSchema,
  campaignPhaseStatusSchema,
  domainGenerationPatternSchema,
  domainGenerationConfigSchema,
  domainSourceTypeSchema,
  domainSourceSchema,
  leadGenerationSpecificConfigSchema,
  proxyAssignmentSchema,
  campaignAuditEntrySchema,
  uploadEventSchema,
  extractedContentItemSchema,
  leadSchema,
  baseCampaignSchema,
  generatedDomainSchema,
  dnsValidationCampaignItemSchema,
  httpValidationCampaignItemSchema,
  campaignSchema,
  createCampaignPayloadSchema,
  updateCampaignPayloadSchema,
  startCampaignPhasePayloadSchema,
  campaignsListResponseSchema,
  campaignDetailResponseSchema,
  campaignCreationResponseSchema,
  campaignUpdateResponseSchema,
  campaignDeleteResponseSchema,
  createDnsCampaignRequestSchema,
  updateDnsCampaignRequestSchema,
  dnsValidationCampaignSchema,
  createHttpValidationCampaignRequestSchema,
  updateHttpValidationCampaignRequestSchema,
  httpValidationCampaignSchema,
  createDomainGenerationCampaignRequestSchema,
  domainGenerationCampaignSchema,
  campaignOperationResponseSchema,
  dnsValidationCampaignListResponseSchema,
  dnsValidationCampaignDetailResponseSchema,
  dnsValidationCampaignCreationResponseSchema,
  dnsValidationCampaignUpdateResponseSchema,
  dnsValidationCampaignItemsResponseSchema,
  dnsCampaignOperationResponseSchema,
  httpValidationCampaignListResponseSchema,
  httpValidationCampaignDetailResponseSchema,
  httpValidationCampaignCreationResponseSchema,
  httpValidationCampaignUpdateResponseSchema,
  httpValidationCampaignItemsResponseSchema,
  httpCampaignOperationResponseSchema,
  generatedDomainsForCampaignResponseSchema
} from '../campaignSchemas';

// Import schemas from commonSchemas
import {
  uuidSchema,
  timestampSchema,
  apiSuccessResponseSchema,
  apiErrorResponseSchema,
  apiResponseSchema,
  paginationSchema,
  apiListResponseSchema
} from '../commonSchemas';

// Import schemas from alignedValidationSchemas
import {
  loginRequestSchema,
  changePasswordRequestSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  createPersonaRequestSchema,
  updatePersonaRequestSchema,
  createProxyRequestSchema,
  updateProxyRequestSchema,
  keywordRuleRequestSchema,
  createKeywordSetRequestSchema,
  updateKeywordSetRequestSchema,
  domainGenerationParamsSchema,
  dnsValidationParamsSchema,
  httpKeywordParamsSchema,
  createCampaignRequestSchema,
  keywordExtractionRequestItemSchema,
  batchKeywordExtractionRequestSchema,
  paginationResponseSchema,
  errorResponseSchema
} from '../alignedValidationSchemas';

// Import campaign form schema
import { campaignFormSchema } from '../campaignFormSchema';

// Import unified campaign schemas
import {
  enhancedDomainGenerationParamsSchema,
  enhancedDnsValidationParamsSchema,
  enhancedHttpKeywordParamsSchema,
  unifiedCreateCampaignRequestSchema
} from '../unifiedCampaignSchema';

// Import from brandedValidationSchemas
import {
  safeBigIntSchema,
  isoDateStringSchema,
  campaignIdSchema,
  userIdSchema,
  personaIdSchema,
  proxyIdSchema,
  keywordSetIdSchema
} from '../brandedValidationSchemas';

// Import websocket message schemas
import {
  webSocketMessageSchema,
  typedWebSocketMessageSchema,
  campaignProgressPayloadSchema,
  campaignStatusPayloadSchema,
  domainResultPayloadSchema,
  systemStatusPayloadSchema,
  errorPayloadSchema,
  campaignProgressMessageSchema,
  campaignStatusMessageSchema,
  domainResultMessageSchema,
  systemStatusMessageSchema,
  errorMessageSchema
} from '../websocketMessageSchema';

// Helper to serialize schema structure
function serializeSchema(schema: any): string {
  const schemaShape = schema._def || schema;
  
  // Create a deterministic representation of the schema
  const serialize = (obj: any, depth = 0): string => {
    const indent = '  '.repeat(depth);
    
    if (obj === null || obj === undefined) {
      return 'null';
    }
    
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return JSON.stringify(obj);
    }
    
    if (Array.isArray(obj)) {
      return `[\n${obj.map(item => `${indent}  ${serialize(item, depth + 1)}`).join(',\n')}\n${indent}]`;
    }
    
    if (typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      const entries = keys
        .filter(key => !key.startsWith('_') && key !== 'description') // Ignore internal fields
        .map(key => {
          const value = serialize(obj[key], depth + 1);
          return `${indent}  "${key}": ${value}`;
        });
      
      return `{\n${entries.join(',\n')}\n${indent}}`;
    }
    
    return String(obj);
  };
  
  return serialize(schemaShape);
}

// Schema registry
const SCHEMA_REGISTRY = {
  // Campaign schemas
  campaignSelectedTypeSchema,
  campaignPhaseSchema,
  campaignPhaseStatusSchema,
  domainGenerationPatternSchema,
  domainGenerationConfigSchema,
  domainSourceTypeSchema,
  domainSourceSchema,
  leadGenerationSpecificConfigSchema,
  proxyAssignmentSchema,
  campaignAuditEntrySchema,
  uploadEventSchema,
  extractedContentItemSchema,
  leadSchema,
  baseCampaignSchema,
  generatedDomainSchema,
  dnsValidationCampaignItemSchema,
  httpValidationCampaignItemSchema,
  campaignSchema,
  createCampaignPayloadSchema,
  updateCampaignPayloadSchema,
  startCampaignPhasePayloadSchema,
  campaignsListResponseSchema,
  campaignDetailResponseSchema,
  campaignCreationResponseSchema,
  campaignUpdateResponseSchema,
  campaignDeleteResponseSchema,
  createDnsCampaignRequestSchema,
  updateDnsCampaignRequestSchema,
  dnsValidationCampaignSchema,
  createHttpValidationCampaignRequestSchema,
  updateHttpValidationCampaignRequestSchema,
  httpValidationCampaignSchema,
  createDomainGenerationCampaignRequestSchema,
  domainGenerationCampaignSchema,
  campaignOperationResponseSchema,
  dnsValidationCampaignListResponseSchema,
  dnsValidationCampaignDetailResponseSchema,
  dnsValidationCampaignCreationResponseSchema,
  dnsValidationCampaignUpdateResponseSchema,
  dnsValidationCampaignItemsResponseSchema,
  dnsCampaignOperationResponseSchema,
  httpValidationCampaignListResponseSchema,
  httpValidationCampaignDetailResponseSchema,
  httpValidationCampaignCreationResponseSchema,
  httpValidationCampaignUpdateResponseSchema,
  httpValidationCampaignItemsResponseSchema,
  httpCampaignOperationResponseSchema,
  generatedDomainsForCampaignResponseSchema,
  
  // Common schemas
  uuidSchema,
  timestampSchema,
  apiSuccessResponseSchema,
  apiErrorResponseSchema,
  apiResponseSchema,
  paginationSchema,
  apiListResponseSchema,
  
  // Aligned validation schemas
  loginRequestSchema,
  changePasswordRequestSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  createPersonaRequestSchema,
  updatePersonaRequestSchema,
  createProxyRequestSchema,
  updateProxyRequestSchema,
  keywordRuleRequestSchema,
  createKeywordSetRequestSchema,
  updateKeywordSetRequestSchema,
  domainGenerationParamsSchema,
  dnsValidationParamsSchema,
  httpKeywordParamsSchema,
  createCampaignRequestSchema,
  keywordExtractionRequestItemSchema,
  batchKeywordExtractionRequestSchema,
  paginationResponseSchema,
  errorResponseSchema,
  
  // Branded schemas
  safeBigIntSchema,
  isoDateStringSchema,
  campaignIdSchema,
  userIdSchema,
  personaIdSchema,
  proxyIdSchema,
  keywordSetIdSchema,
  
  // Campaign form schema
  campaignFormSchema,
  
  // Unified campaign schemas
  enhancedDomainGenerationParamsSchema,
  enhancedDnsValidationParamsSchema,
  enhancedHttpKeywordParamsSchema,
  unifiedCreateCampaignRequestSchema,
  
  // WebSocket message schemas
  webSocketMessageSchema,
  typedWebSocketMessageSchema,
  campaignProgressPayloadSchema,
  campaignStatusPayloadSchema,
  domainResultPayloadSchema,
  systemStatusPayloadSchema,
  errorPayloadSchema,
  campaignProgressMessageSchema,
  campaignStatusMessageSchema,
  domainResultMessageSchema,
  systemStatusMessageSchema,
  errorMessageSchema
};

describe('Schema Snapshot Tests', () => {
  const snapshotDir = path.join(__dirname, '__snapshots__');
  
  // Ensure snapshot directory exists
  beforeAll(() => {
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }
  });
  
  Object.entries(SCHEMA_REGISTRY).forEach(([schemaName, schema]) => {
    it(`should match snapshot for ${schemaName}`, () => {
      const snapshotPath = path.join(snapshotDir, `${schemaName}.snapshot.json`);
      const currentSchema = serializeSchema(schema);
      
      if (fs.existsSync(snapshotPath)) {
        // Compare with existing snapshot
        const existingSnapshot = fs.readFileSync(snapshotPath, 'utf-8');
        
        if (currentSchema !== existingSnapshot) {
          // Schema has changed - fail the test
          console.error(`\nSchema '${schemaName}' has changed!`);
          console.error('\nPrevious schema structure:');
          console.error(existingSnapshot);
          console.error('\nCurrent schema structure:');
          console.error(currentSchema);
          
          // Write the diff to a file for easier review
          const diffPath = path.join(snapshotDir, `${schemaName}.diff`);
          fs.writeFileSync(diffPath, `--- Previous\n+++ Current\n\n${existingSnapshot}\n\n${currentSchema}`);
          
          expect(currentSchema).toBe(existingSnapshot);
        }
      } else {
        // Create initial snapshot
        fs.writeFileSync(snapshotPath, currentSchema);
        console.log(`Created initial snapshot for ${schemaName}`);
      }
    });
  });
  
  it('should detect any new schemas not in registry', () => {
    const schemaFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('Schema.ts') || f.endsWith('Schemas.ts'));
    
    schemaFiles.forEach(file => {
      const filePath = path.join(__dirname, '..', file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Look for exported schemas
      const exportMatches = content.matchAll(/export\s+(?:const|let)\s+(\w+Schema)\s*=/g);
      
      for (const match of exportMatches) {
        const exportedSchema = match[1];
        if (exportedSchema && !SCHEMA_REGISTRY.hasOwnProperty(exportedSchema)) {
          throw new Error(`Schema '${exportedSchema}' from '${file}' is not registered in schema snapshot tests!`);
        }
      }
    });
  });
  
  it('should validate SafeBigInt usage for numeric fields', () => {
    // Check that all ID, count, and size fields use SafeBigInt
    Object.entries(SCHEMA_REGISTRY).forEach(([schemaName, schema]) => {
      const schemaStr = serializeSchema(schema);
      
      // Skip check for common schemas that define primitives
      if (['timestampSchema', 'uuidSchema', 'paginationSchema'].includes(schemaName)) {
        return;
      }
      
      // Check for problematic numeric field patterns
      const problematicPatterns = [
        /"\w+Id":\s*{\s*"typeName":\s*"ZodNumber"/,
        /"\w+Count":\s*{\s*"typeName":\s*"ZodNumber"/,
        /"\w+Size":\s*{\s*"typeName":\s*"ZodNumber"/,
        /"total\w+":\s*{\s*"typeName":\s*"ZodNumber"/,
        /"max\w+":\s*{\s*"typeName":\s*"ZodNumber"/,
        /"min\w+":\s*{\s*"typeName":\s*"ZodNumber"/
      ];
      
      problematicPatterns.forEach(pattern => {
        if (pattern.test(schemaStr)) {
          console.warn(`Warning: Schema '${schemaName}' contains numeric fields that might need SafeBigInt`);
        }
      });
    });
  });
});

// CLI command support for updating snapshots
if (process.argv.includes('--update-snapshots')) {
  console.log('Updating schema snapshots...');
  
  const snapshotDir = path.join(__dirname, '__snapshots__');
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }
  
  Object.entries(SCHEMA_REGISTRY).forEach(([schemaName, schema]) => {
    const snapshotPath = path.join(snapshotDir, `${schemaName}.snapshot.json`);
    const currentSchema = serializeSchema(schema);
    fs.writeFileSync(snapshotPath, currentSchema);
    console.log(`Updated snapshot for ${schemaName}`);
  });
  
  console.log('All snapshots updated!');
}