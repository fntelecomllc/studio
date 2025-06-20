#!/usr/bin/env node

/**
 * Enum Registry Validation Script
 * 
 * This script ensures that enums remain consistent between frontend and backend.
 * It locks allowed enum values and fails if frontend/backend enums diverge.
 */

const fs = require('fs');
const path = require('path');

// Enum registry - defines all allowed enum values
const ENUM_REGISTRY = {
  // Campaign enums
  CampaignSelectedType: [
    'domain_generation',
    'dns_validation', 
    'http_keyword_validation',
    'lead_generation'
  ],
  
  CampaignPhase: [
    'idle',
    'domain_generation',
    'dns_validation',
    'http_validation',
    'lead_generation',
    'completed',
    'failed'
  ],
  
  CampaignPhaseStatus: [
    'pending',
    'running',
    'completed',
    'failed',
    'idle',
    'paused'
  ],
  
  DomainGenerationPattern: [
    'prefix_variable',
    'suffix_variable',
    'both_variable'
  ],
  
  DomainSourceType: [
    'upload',
    'campaign_output',
    'current_campaign_output',
    'none'
  ],
  
  // Auth enums
  UserRole: [
    'admin',
    'user',
    'viewer',
    'operator'
  ],
  
  AuthProvider: [
    'local',
    'oauth',
    'saml'
  ],
  
  // Proxy enums
  ProxyProtocol: [
    'http',
    'https',
    'socks4',
    'socks5'
  ],
  
  ProxyStatus: [
    'active',
    'inactive',
    'testing',
    'failed'
  ],
  
  // Persona enums
  PersonaType: [
    'dns',
    'http'
  ],
  
  // HTTP enums
  HttpMethod: [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'HEAD',
    'OPTIONS'
  ],
  
  // Keyword enums
  KeywordRuleType: [
    'string',
    'regex'
  ],
  
  SourceType: [
    'DomainGeneration',
    'DNSValidation'
  ]
};

// Paths to check
const PATHS = {
  frontend: {
    schemas: 'src/lib/schemas',
    types: 'src/lib/types',
    apiClient: 'src/lib/api-client/models'
  },
  backend: {
    models: 'backend/internal/models',
    api: 'backend/internal/api',
    services: 'backend/internal/services'
  }
};

// Extract enums from TypeScript files
function extractTypeScriptEnums(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const enums = {};
  
  // Match z.union([z.literal('value1'), z.literal('value2')])
  const zodUnionRegex = /export\s+const\s+(\w+Schema)\s*=\s*z\.union\(\[([\s\S]*?)\]\)/g;
  let match;
  
  while ((match = zodUnionRegex.exec(content)) !== null) {
    const schemaName = match[1].replace('Schema', '');
    const literalsContent = match[2];
    
    // Extract literal values
    const literalRegex = /z\.literal\(['"]([^'"]+)['"]\)/g;
    const values = [];
    let literalMatch;
    
    while ((literalMatch = literalRegex.exec(literalsContent)) !== null) {
      values.push(literalMatch[1]);
    }
    
    if (values.length > 0) {
      enums[schemaName] = values;
    }
  }
  
  // Match TypeScript enums: export enum Name { ... }
  const tsEnumRegex = /export\s+enum\s+(\w+)\s*{([^}]+)}/g;
  while ((match = tsEnumRegex.exec(content)) !== null) {
    const enumName = match[1];
    const enumBody = match[2];
    
    // Extract enum values
    const valueRegex = /(\w+)\s*=\s*['"]([^'"]+)['"]/g;
    const values = [];
    let valueMatch;
    
    while ((valueMatch = valueRegex.exec(enumBody)) !== null) {
      values.push(valueMatch[2]);
    }
    
    if (values.length > 0) {
      enums[enumName] = values;
    }
  }
  
  // Match type unions: export type Name = 'value1' | 'value2'
  const typeUnionRegex = /export\s+type\s+(\w+)\s*=\s*([^;]+);/g;
  while ((match = typeUnionRegex.exec(content)) !== null) {
    const typeName = match[1];
    const typeBody = match[2];
    
    if (typeBody.includes('|')) {
      const values = typeBody
        .split('|')
        .map(v => v.trim())
        .filter(v => v.startsWith("'") || v.startsWith('"'))
        .map(v => v.slice(1, -1));
      
      if (values.length > 0) {
        enums[typeName] = values;
      }
    }
  }
  
  return enums;
}

// Extract enums from Go files
function extractGoEnums(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const enums = {};
  
  // Match Go const blocks
  const constBlockRegex = /const\s*\(([\s\S]*?)\)/g;
  let match;
  
  while ((match = constBlockRegex.exec(content)) !== null) {
    const blockContent = match[1];
    
    // Extract constants by type
    const typeGroups = {};
    const lines = blockContent.split('\n');
    let currentType = null;
    
    lines.forEach(line => {
      // Match type declaration
      const typeMatch = line.match(/\/\/\s*(\w+)\s+enum/i);
      if (typeMatch) {
        currentType = typeMatch[1];
        if (!typeGroups[currentType]) {
          typeGroups[currentType] = [];
        }
      }
      
      // Match constant declaration
      const constMatch = line.match(/(\w+)\s*=\s*"([^"]+)"/);
      if (constMatch && currentType) {
        typeGroups[currentType].push(constMatch[2]);
      }
    });
    
    Object.assign(enums, typeGroups);
  }
  
  // Match individual const declarations
  const singleConstRegex = /const\s+(\w+)\s+\w+\s*=\s*"([^"]+)"/g;
  const typeConstants = {};
  
  while ((match = singleConstRegex.exec(content)) !== null) {
    const constName = match[1];
    const constValue = match[2];
    
    // Group by prefix (e.g., CampaignPhase* -> CampaignPhase)
    const typeMatch = constName.match(/^([A-Z][a-zA-Z]+)([A-Z])/);
    if (typeMatch) {
      const enumType = typeMatch[1];
      if (!typeConstants[enumType]) {
        typeConstants[enumType] = [];
      }
      typeConstants[enumType].push(constValue);
    }
  }
  
  Object.assign(enums, typeConstants);
  
  return enums;
}

// Recursively find files with specific extensions
function findFiles(dir, extensions) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
      files.push(...findFiles(fullPath, extensions));
    } else if (stat.isFile()) {
      const ext = path.extname(item);
      if (extensions.includes(ext)) {
        files.push(fullPath);
      }
    }
  });
  
  return files;
}

// Compare enum values
function compareEnums(registryEnums, foundEnums) {
  const issues = [];
  
  // Check each enum in the registry
  Object.keys(registryEnums).forEach(enumName => {
    const registryValues = registryEnums[enumName];
    const foundValues = foundEnums[enumName] || [];
    
    // Check for missing values
    registryValues.forEach(value => {
      if (!foundValues.includes(value)) {
        issues.push({
          type: 'missing',
          enum: enumName,
          value: value,
          message: `Missing required enum value '${value}' in ${enumName}`
        });
      }
    });
    
    // Check for extra values
    foundValues.forEach(value => {
      if (!registryValues.includes(value)) {
        issues.push({
          type: 'extra',
          enum: enumName,
          value: value,
          message: `Unexpected enum value '${value}' in ${enumName} (not in registry)`
        });
      }
    });
  });
  
  // Check for enums not in registry
  Object.keys(foundEnums).forEach(enumName => {
    if (!registryEnums[enumName]) {
      issues.push({
        type: 'unregistered',
        enum: enumName,
        message: `Enum '${enumName}' is not registered in the enum registry`
      });
    }
  });
  
  return issues;
}

// Main validation function
function validateEnums() {
  console.log('🔍 Validating enum consistency...\n');
  
  const allIssues = [];
  const frontendEnums = {};
  const backendEnums = {};
  
  // Extract frontend enums
  console.log('📂 Scanning frontend files...');
  Object.entries(PATHS.frontend).forEach(([category, dir]) => {
    const files = findFiles(dir, ['.ts', '.tsx']);
    console.log(`  Found ${files.length} files in ${category}`);
    
    files.forEach(file => {
      try {
        const enums = extractTypeScriptEnums(file);
        Object.keys(enums).forEach(enumName => {
          if (!frontendEnums[enumName]) {
            frontendEnums[enumName] = [];
          }
          // Merge unique values
          enums[enumName].forEach(value => {
            if (!frontendEnums[enumName].includes(value)) {
              frontendEnums[enumName].push(value);
            }
          });
        });
      } catch (error) {
        console.error(`  ⚠️  Error parsing ${file}: ${error.message}`);
      }
    });
  });
  
  // Extract backend enums
  console.log('\n📂 Scanning backend files...');
  Object.entries(PATHS.backend).forEach(([category, dir]) => {
    const files = findFiles(dir, ['.go']);
    console.log(`  Found ${files.length} files in ${category}`);
    
    files.forEach(file => {
      try {
        const enums = extractGoEnums(file);
        Object.keys(enums).forEach(enumName => {
          if (!backendEnums[enumName]) {
            backendEnums[enumName] = [];
          }
          // Merge unique values
          enums[enumName].forEach(value => {
            if (!backendEnums[enumName].includes(value)) {
              backendEnums[enumName].push(value);
            }
          });
        });
      } catch (error) {
        console.error(`  ⚠️  Error parsing ${file}: ${error.message}`);
      }
    });
  });
  
  // Validate frontend enums
  console.log('\n🔍 Validating frontend enums...');
  const frontendIssues = compareEnums(ENUM_REGISTRY, frontendEnums);
  allIssues.push(...frontendIssues.map(issue => ({ ...issue, side: 'frontend' })));
  
  // Validate backend enums
  console.log('🔍 Validating backend enums...');
  const backendIssues = compareEnums(ENUM_REGISTRY, backendEnums);
  allIssues.push(...backendIssues.map(issue => ({ ...issue, side: 'backend' })));
  
  // Compare frontend vs backend
  console.log('🔍 Comparing frontend and backend enums...');
  Object.keys(ENUM_REGISTRY).forEach(enumName => {
    const frontendValues = frontendEnums[enumName] || [];
    const backendValues = backendEnums[enumName] || [];
    
    // Check for mismatches
    frontendValues.forEach(value => {
      if (backendValues.length > 0 && !backendValues.includes(value)) {
        allIssues.push({
          type: 'mismatch',
          enum: enumName,
          value: value,
          side: 'cross-stack',
          message: `Frontend has enum value '${value}' for ${enumName} but backend doesn't`
        });
      }
    });
    
    backendValues.forEach(value => {
      if (frontendValues.length > 0 && !frontendValues.includes(value)) {
        allIssues.push({
          type: 'mismatch',
          enum: enumName,
          value: value,
          side: 'cross-stack',
          message: `Backend has enum value '${value}' for ${enumName} but frontend doesn't`
        });
      }
    });
  });
  
  // Report results
  console.log('\n📊 Validation Results:');
  console.log(`  Total enums in registry: ${Object.keys(ENUM_REGISTRY).length}`);
  console.log(`  Frontend enums found: ${Object.keys(frontendEnums).length}`);
  console.log(`  Backend enums found: ${Object.keys(backendEnums).length}`);
  console.log(`  Issues found: ${allIssues.length}`);
  
  if (allIssues.length > 0) {
    console.log('\n❌ Enum validation failed!\n');
    
    // Group issues by type
    const issuesByType = {};
    allIssues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });
    
    // Display issues
    Object.entries(issuesByType).forEach(([type, issues]) => {
      console.log(`\n${type.toUpperCase()} ISSUES (${issues.length}):`);
      issues.forEach(issue => {
        console.log(`  - [${issue.side}] ${issue.message}`);
      });
    });
    
    // Write detailed report
    const report = {
      timestamp: new Date().toISOString(),
      registry: ENUM_REGISTRY,
      frontend: frontendEnums,
      backend: backendEnums,
      issues: allIssues
    };
    
    fs.writeFileSync('enum-validation-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed report written to enum-validation-report.json');
    
    process.exit(1);
  } else {
    console.log('\n✅ All enums are valid and consistent!');
    process.exit(0);
  }
}

// Run validation
if (require.main === module) {
  validateEnums();
}

module.exports = { validateEnums, ENUM_REGISTRY };