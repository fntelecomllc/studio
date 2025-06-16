#!/usr/bin/env node

/**
 * Performance Audit Script for DomainFlow
 * Performs automated Lighthouse audits and generates performance reports
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const PERFORMANCE_THRESHOLDS = {
  'first-contentful-paint': 1800, // 1.8s
  'largest-contentful-paint': 2500, // 2.5s
  'cumulative-layout-shift': 0.1,
  'total-blocking-time': 200, // 200ms
  'speed-index': 3400, // 3.4s
  'interactive': 3800, // 3.8s
};

const URLS_TO_TEST = [
  'http://localhost:3000',
  'http://localhost:3000/dashboard',
  'http://localhost:3000/campaigns',
  'http://localhost:3000/campaigns/new',
];

async function auditUrl(url) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const options = {
    logLevel: 'info',
    output: 'json',
    onlyCategories: ['performance'],
    port: chrome.port,
  };

  try {
    const runnerResult = await lighthouse(url, options);
    await chrome.kill();
    return runnerResult;
  } catch (error) {
    await chrome.kill();
    throw error;
  }
}

function analyzeResults(results) {
  const analysis = {
    url: results.lhr.finalUrl,
    timestamp: new Date().toISOString(),
    score: results.lhr.categories.performance.score * 100,
    metrics: {},
    passed: true,
    failedMetrics: [],
  };

  // Extract key metrics
  const audits = results.lhr.audits;
  for (const [key, threshold] of Object.entries(PERFORMANCE_THRESHOLDS)) {
    if (audits[key]) {
      const metric = audits[key];
      const value = metric.numericValue || metric.score;
      analysis.metrics[key] = {
        value,
        displayValue: metric.displayValue,
        score: metric.score,
        threshold,
        passed: key === 'cumulative-layout-shift' 
          ? value <= threshold 
          : value <= threshold || metric.score >= 0.9,
      };

      if (!analysis.metrics[key].passed) {
        analysis.passed = false;
        analysis.failedMetrics.push(key);
      }
    }
  }

  return analysis;
}

function generateReport(allResults) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalUrls: allResults.length,
      averageScore: allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length,
      passedUrls: allResults.filter(r => r.passed).length,
      failedUrls: allResults.filter(r => !r.passed).length,
    },
    results: allResults,
    recommendations: generateRecommendations(allResults),
  };

  return report;
}

function generateRecommendations(results) {
  const recommendations = [];
  const commonIssues = {};

  results.forEach(result => {
    result.failedMetrics.forEach(metric => {
      commonIssues[metric] = (commonIssues[metric] || 0) + 1;
    });
  });

  if (commonIssues['first-contentful-paint']) {
    recommendations.push({
      issue: 'Slow First Contentful Paint',
      suggestion: 'Optimize critical rendering path, reduce server response time, enable text compression',
      priority: 'high',
    });
  }

  if (commonIssues['largest-contentful-paint']) {
    recommendations.push({
      issue: 'Slow Largest Contentful Paint',
      suggestion: 'Optimize images, preload key resources, reduce render-blocking resources',
      priority: 'high',
    });
  }

  if (commonIssues['cumulative-layout-shift']) {
    recommendations.push({
      issue: 'Layout Shift Issues',
      suggestion: 'Add size attributes to images, reserve space for ads, avoid inserting content above existing content',
      priority: 'medium',
    });
  }

  if (commonIssues['total-blocking-time']) {
    recommendations.push({
      issue: 'High Total Blocking Time',
      suggestion: 'Reduce impact of third-party code, minimize main thread work, keep request counts low',
      priority: 'high',
    });
  }

  return recommendations;
}

async function main() {
  console.log('🚀 Starting DomainFlow Performance Audit...\n');

  // Ensure reports directory exists
  if (!existsSync('reports')) {
    mkdirSync('reports');
  }

  const allResults = [];

  for (const url of URLS_TO_TEST) {
    console.log(`📊 Auditing: ${url}`);
    try {
      const results = await auditUrl(url);
      const analysis = analyzeResults(results);
      allResults.push(analysis);
      
      console.log(`   Score: ${analysis.score.toFixed(1)}/100 ${analysis.passed ? '✅' : '❌'}`);
      if (!analysis.passed) {
        console.log(`   Failed metrics: ${analysis.failedMetrics.join(', ')}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to audit ${url}:`, error.message);
      allResults.push({
        url,
        error: error.message,
        passed: false,
        score: 0,
      });
    }
    console.log('');
  }

  // Generate and save report
  const report = generateReport(allResults);
  const reportPath = `reports/performance-audit-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Console summary
  console.log('📋 Performance Audit Summary:');
  console.log(`   Average Score: ${report.summary.averageScore.toFixed(1)}/100`);
  console.log(`   Passed URLs: ${report.summary.passedUrls}/${report.summary.totalUrls}`);
  console.log(`   Report saved: ${reportPath}`);

  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    report.recommendations.forEach((rec, index) => {
      console.log(`   ${index + 1}. [${rec.priority.toUpperCase()}] ${rec.issue}`);
      console.log(`      ${rec.suggestion}`);
    });
  }

  // Exit with error code if any audits failed
  if (report.summary.failedUrls > 0) {
    console.log('\n❌ Some performance audits failed. Check the report for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All performance audits passed!');
    process.exit(0);
  }
}

main().catch(console.error);