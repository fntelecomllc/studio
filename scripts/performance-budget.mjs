#!/usr/bin/env node

/**
 * Performance Budget Monitor for DomainFlow
 * Monitors bundle sizes and performance metrics against defined budgets
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// Performance budgets (in KB unless specified)
const PERFORMANCE_BUDGETS = {
  // Bundle size budgets
  'total-js': 500, // Total JavaScript bundle size
  'main-bundle': 150, // Main bundle (_app.js)
  'page-bundles': 100, // Individual page bundles
  'vendor-bundle': 200, // Third-party libraries
  'css-total': 50, // Total CSS size
  
  // Resource count budgets
  'js-requests': 10, // Number of JS files
  'css-requests': 5, // Number of CSS files
  'image-requests': 20, // Number of images
  'font-requests': 4, // Number of fonts
  
  // Performance timing budgets (in ms)
  'first-paint': 1000,
  'first-contentful-paint': 1500,
  'time-to-interactive': 3500,
};

// File patterns to analyze
const FILE_PATTERNS = {
  js: /\.js$/,
  css: /\.css$/,
  images: /\.(jpg|jpeg|png|gif|svg|webp|avif)$/,
  fonts: /\.(woff|woff2|eot|ttf|otf)$/,
};

function getDirectorySize(dirPath) {
  if (!existsSync(dirPath)) return 0;
  
  let totalSize = 0;
  const files = readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = join(dirPath, file);
    const stats = statSync(filePath);
    
    if (stats.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}

function analyzeBundle() {
  const buildDir = '.next';
  const staticDir = join(buildDir, 'static');
  
  if (!existsSync(buildDir)) {
    throw new Error('Build directory not found. Run "npm run build" first.');
  }
  
  const analysis = {
    timestamp: new Date().toISOString(),
    bundles: {
      js: { files: [], totalSize: 0 },
      css: { files: [], totalSize: 0 },
      images: { files: [], totalSize: 0 },
      fonts: { files: [], totalSize: 0 },
    },
    chunks: [],
    budget: {
      passed: [],
      failed: [],
      warnings: [],
    },
  };
  
  // Analyze static files
  if (existsSync(staticDir)) {
    analyzeDirectory(staticDir, '', analysis);
  }
  
  // Calculate totals
  Object.keys(analysis.bundles).forEach(type => {
    analysis.bundles[type].totalSize = analysis.bundles[type].files.reduce(
      (sum, file) => sum + file.size, 0
    );
  });
  
  // Check against budgets
  checkBudgets(analysis);
  
  return analysis;
}

function analyzeDirectory(dirPath, relativePath, analysis) {
  const files = readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = join(dirPath, file);
    const stats = statSync(filePath);
    const fullRelativePath = join(relativePath, file);
    
    if (stats.isDirectory()) {
      analyzeDirectory(filePath, fullRelativePath, analysis);
    } else {
      const fileInfo = {
        name: file,
        path: fullRelativePath,
        size: stats.size,
        sizeKB: Math.round(stats.size / 1024 * 100) / 100,
      };
      
      // Categorize file
      if (FILE_PATTERNS.js.test(file)) {
        analysis.bundles.js.files.push(fileInfo);
        
        // Special handling for chunk analysis
        if (file.includes('chunks')) {
          analysis.chunks.push({
            ...fileInfo,
            type: getChunkType(file),
          });
        }
      } else if (FILE_PATTERNS.css.test(file)) {
        analysis.bundles.css.files.push(fileInfo);
      } else if (FILE_PATTERNS.images.test(file)) {
        analysis.bundles.images.files.push(fileInfo);
      } else if (FILE_PATTERNS.fonts.test(file)) {
        analysis.bundles.fonts.files.push(fileInfo);
      }
    }
  }
}

function getChunkType(filename) {
  if (filename.includes('_app')) return 'main';
  if (filename.includes('pages')) return 'page';
  if (filename.includes('vendors') || filename.includes('node_modules')) return 'vendor';
  if (filename.includes('runtime')) return 'runtime';
  if (filename.includes('webpack')) return 'webpack';
  return 'other';
}

function checkBudgets(analysis) {
  const checks = [
    {
      key: 'total-js',
      value: analysis.bundles.js.totalSize / 1024,
      budget: PERFORMANCE_BUDGETS['total-js'],
      unit: 'KB',
      description: 'Total JavaScript bundle size',
    },
    {
      key: 'css-total',
      value: analysis.bundles.css.totalSize / 1024,
      budget: PERFORMANCE_BUDGETS['css-total'],
      unit: 'KB',
      description: 'Total CSS size',
    },
    {
      key: 'js-requests',
      value: analysis.bundles.js.files.length,
      budget: PERFORMANCE_BUDGETS['js-requests'],
      unit: 'files',
      description: 'Number of JavaScript files',
    },
    {
      key: 'css-requests',
      value: analysis.bundles.css.files.length,
      budget: PERFORMANCE_BUDGETS['css-requests'],
      unit: 'files',
      description: 'Number of CSS files',
    },
  ];
  
  // Check main bundle size
  const mainChunk = analysis.chunks.find(chunk => chunk.type === 'main');
  if (mainChunk) {
    checks.push({
      key: 'main-bundle',
      value: mainChunk.sizeKB,
      budget: PERFORMANCE_BUDGETS['main-bundle'],
      unit: 'KB',
      description: 'Main bundle size (_app.js)',
    });
  }
  
  // Check vendor bundle size
  const vendorChunks = analysis.chunks.filter(chunk => chunk.type === 'vendor');
  if (vendorChunks.length > 0) {
    const vendorSize = vendorChunks.reduce((sum, chunk) => sum + chunk.sizeKB, 0);
    checks.push({
      key: 'vendor-bundle',
      value: vendorSize,
      budget: PERFORMANCE_BUDGETS['vendor-bundle'],
      unit: 'KB',
      description: 'Vendor bundle size',
    });
  }
  
  // Perform budget checks
  checks.forEach(check => {
    const percentage = (check.value / check.budget) * 100;
    const result = {
      ...check,
      percentage: Math.round(percentage * 100) / 100,
      status: percentage <= 100 ? 'passed' : 'failed',
    };
    
    if (percentage <= 100) {
      analysis.budget.passed.push(result);
    } else if (percentage <= 120) {
      result.status = 'warning';
      analysis.budget.warnings.push(result);
    } else {
      analysis.budget.failed.push(result);
    }
  });
}

function generateReport(analysis) {
  console.log('📊 DomainFlow Performance Budget Report\n');
  console.log(`Generated: ${new Date(analysis.timestamp).toLocaleString()}\n`);
  
  // Bundle summary
  console.log('📦 Bundle Analysis:');
  Object.entries(analysis.bundles).forEach(([type, bundle]) => {
    if (bundle.files.length > 0) {
      console.log(`   ${type.toUpperCase()}: ${bundle.files.length} files, ${Math.round(bundle.totalSize / 1024 * 100) / 100} KB`);
    }
  });
  console.log('');
  
  // Chunk analysis
  if (analysis.chunks.length > 0) {
    console.log('🧩 Chunk Analysis:');
    const chunksByType = analysis.chunks.reduce((acc, chunk) => {
      acc[chunk.type] = acc[chunk.type] || [];
      acc[chunk.type].push(chunk);
      return acc;
    }, {});
    
    Object.entries(chunksByType).forEach(([type, chunks]) => {
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.sizeKB, 0);
      console.log(`   ${type}: ${chunks.length} chunks, ${Math.round(totalSize * 100) / 100} KB`);
      
      // Show largest chunks
      const largest = chunks.sort((a, b) => b.sizeKB - a.sizeKB).slice(0, 3);
      largest.forEach(chunk => {
        console.log(`     - ${chunk.name}: ${chunk.sizeKB} KB`);
      });
    });
    console.log('');
  }
  
  // Budget results
  console.log('💰 Budget Status:');
  
  if (analysis.budget.passed.length > 0) {
    console.log('   ✅ PASSED:');
    analysis.budget.passed.forEach(item => {
      console.log(`     ${item.description}: ${item.value.toFixed(1)} ${item.unit} (${item.percentage}% of budget)`);
    });
  }
  
  if (analysis.budget.warnings.length > 0) {
    console.log('   ⚠️  WARNINGS:');
    analysis.budget.warnings.forEach(item => {
      console.log(`     ${item.description}: ${item.value.toFixed(1)} ${item.unit} (${item.percentage}% of budget)`);
    });
  }
  
  if (analysis.budget.failed.length > 0) {
    console.log('   ❌ FAILED:');
    analysis.budget.failed.forEach(item => {
      console.log(`     ${item.description}: ${item.value.toFixed(1)} ${item.unit} (${item.percentage}% of budget)`);
    });
  }
  
  console.log('');
  
  // Recommendations
  if (analysis.budget.failed.length > 0 || analysis.budget.warnings.length > 0) {
    console.log('💡 Recommendations:');
    
    const issues = [...analysis.budget.failed, ...analysis.budget.warnings];
    issues.forEach(issue => {
      console.log(`   • ${issue.description}:`);
      
      if (issue.key.includes('js') || issue.key.includes('bundle')) {
        console.log('     - Enable tree-shaking for unused code');
        console.log('     - Consider dynamic imports for large components');
        console.log('     - Optimize third-party library usage');
      }
      
      if (issue.key.includes('css')) {
        console.log('     - Remove unused CSS with PurgeCSS');
        console.log('     - Minimize CSS-in-JS runtime overhead');
      }
      
      if (issue.key.includes('requests')) {
        console.log('     - Bundle similar resources together');
        console.log('     - Use HTTP/2 push for critical resources');
      }
    });
  }
  
  return analysis;
}

function saveReport(analysis) {
  if (!existsSync('reports')) {
    require('fs').mkdirSync('reports');
  }
  
  const reportPath = `reports/performance-budget-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(analysis, null, 2));
  console.log(`📄 Detailed report saved: ${reportPath}\n`);
  
  return reportPath;
}

async function main() {
  try {
    console.log('🎯 Starting Performance Budget Analysis...\n');
    
    const analysis = analyzeBundle();
    generateReport(analysis);
    saveReport(analysis);
    
    // Exit codes
    if (analysis.budget.failed.length > 0) {
      console.log('❌ Performance budget exceeded. Build failed.');
      process.exit(1);
    } else if (analysis.budget.warnings.length > 0) {
      console.log('⚠️  Performance budget warnings detected.');
      process.exit(0);
    } else {
      console.log('✅ All performance budgets passed!');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Performance budget analysis failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);