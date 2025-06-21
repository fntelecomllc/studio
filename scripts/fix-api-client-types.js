#!/usr/bin/env node

const fs = require('fs');
const _path = require('path');
const glob = require('glob');

// Find all API client files
const apiClientFiles = glob.sync('src/lib/api-client/api/*.ts');

apiClientFiles.forEach(filePath => {
  console.log(`Fixing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix spread operator issues
  content = content.replace(
    /\.\.\.baseOptions,\s*\.\.\.options/g,
    '...(baseOptions as Record<string, unknown> || {}), ...(options || {})'
  );
  
  // Fix headers access issues
  content = content.replace(
    /baseOptions && baseOptions\.headers \? baseOptions\.headers/g,
    'baseOptions && (baseOptions as Record<string, unknown>).headers ? (baseOptions as Record<string, unknown>).headers'
  );
  
  // Fix options.headers spread issues
  content = content.replace(
    /\.\.\.options\.headers/g,
    '...((options as Record<string, unknown>)?.headers as Record<string, unknown> || {})'
  );
  
  // Fix headersFromBaseOptions type issue
  content = content.replace(
    /let headersFromBaseOptions = (.+);/g,
    'let headersFromBaseOptions = $1 as Record<string, unknown>;'
  );
  
  fs.writeFileSync(filePath, content);
});

console.log(`Fixed ${apiClientFiles.length} API client files.`);
