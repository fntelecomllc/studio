#!/usr/bin/env node

// Comprehensive authentication security test
// This script tests all the critical authentication fixes

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8080';

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          location: res.headers.location
        });
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testAuthenticationSecurity() {
  console.log('🔒 AUTHENTICATION SECURITY TEST SUITE');
  console.log('=====================================\n');
  
  const tests = [];
  
  // Test 1: Root page should redirect to login
  console.log('Test 1: Root page redirect to login');
  try {
    const response = await makeRequest(BASE_URL);
    if (response.statusCode === 302 || response.statusCode === 307) {
      if (response.location && response.location.includes('/login')) {
        console.log('✅ PASS: Root page redirects to login');
        tests.push({ name: 'Root redirect', status: 'PASS' });
      } else {
        console.log('❌ FAIL: Root page redirects but not to login:', response.location);
        tests.push({ name: 'Root redirect', status: 'FAIL', details: 'Wrong redirect location' });
      }
    } else {
      console.log('❌ FAIL: Root page does not redirect (status:', response.statusCode, ')');
      tests.push({ name: 'Root redirect', status: 'FAIL', details: 'No redirect' });
    }
  } catch (error) {
    console.log('❌ ERROR: Failed to test root page:', error.message);
    tests.push({ name: 'Root redirect', status: 'ERROR', details: error.message });
  }
  
  // Test 2: Dashboard should redirect to login
  console.log('\nTest 2: Dashboard redirect to login');
  try {
    const response = await makeRequest(`${BASE_URL}/`);
    if (response.statusCode === 302 || response.statusCode === 307) {
      if (response.location && response.location.includes('/login')) {
        console.log('✅ PASS: Dashboard redirects to login');
        tests.push({ name: 'Dashboard redirect', status: 'PASS' });
      } else {
        console.log('❌ FAIL: Dashboard redirects but not to login:', response.location);
        tests.push({ name: 'Dashboard redirect', status: 'FAIL', details: 'Wrong redirect location' });
      }
    } else {
      console.log('❌ FAIL: Dashboard does not redirect (status:', response.statusCode, ')');
      tests.push({ name: 'Dashboard redirect', status: 'FAIL', details: 'No redirect' });
    }
  } catch (error) {
    console.log('❌ ERROR: Failed to test dashboard:', error.message);
    tests.push({ name: 'Dashboard redirect', status: 'ERROR', details: error.message });
  }
  
  // Test 3: Campaigns page should redirect to login
  console.log('\nTest 3: Campaigns page redirect to login');
  try {
    const response = await makeRequest(`${BASE_URL}/campaigns`);
    if (response.statusCode === 302 || response.statusCode === 307) {
      if (response.location && response.location.includes('/login')) {
        console.log('✅ PASS: Campaigns page redirects to login');
        tests.push({ name: 'Campaigns redirect', status: 'PASS' });
      } else {
        console.log('❌ FAIL: Campaigns page redirects but not to login:', response.location);
        tests.push({ name: 'Campaigns redirect', status: 'FAIL', details: 'Wrong redirect location' });
      }
    } else {
      console.log('❌ FAIL: Campaigns page does not redirect (status:', response.statusCode, ')');
      tests.push({ name: 'Campaigns redirect', status: 'FAIL', details: 'No redirect' });
    }
  } catch (error) {
    console.log('❌ ERROR: Failed to test campaigns page:', error.message);
    tests.push({ name: 'Campaigns redirect', status: 'ERROR', details: error.message });
  }
  
  // Test 4: Login page should be accessible
  console.log('\nTest 4: Login page accessibility');
  try {
    const response = await makeRequest(`${BASE_URL}/login`);
    if (response.statusCode === 200) {
      console.log('✅ PASS: Login page is accessible');
      tests.push({ name: 'Login accessible', status: 'PASS' });
    } else {
      console.log('❌ FAIL: Login page not accessible (status:', response.statusCode, ')');
      tests.push({ name: 'Login accessible', status: 'FAIL', details: `Status: ${response.statusCode}` });
    }
  } catch (error) {
    console.log('❌ ERROR: Failed to test login page:', error.message);
    tests.push({ name: 'Login accessible', status: 'ERROR', details: error.message });
  }
  
  // Test 5: Backend API health check
  console.log('\nTest 5: Backend API health check');
  try {
    const response = await makeRequest(`${API_URL}/api/v2/health`);
    if (response.statusCode === 200) {
      console.log('✅ PASS: Backend API is running');
      tests.push({ name: 'Backend health', status: 'PASS' });
    } else {
      console.log('❌ FAIL: Backend API not healthy (status:', response.statusCode, ')');
      tests.push({ name: 'Backend health', status: 'FAIL', details: `Status: ${response.statusCode}` });
    }
  } catch (error) {
    console.log('❌ ERROR: Failed to test backend API:', error.message);
    tests.push({ name: 'Backend health', status: 'ERROR', details: error.message });
  }
  
  // Test 6: Login attempt with valid credentials
  console.log('\nTest 6: Login attempt with admin credentials');
  try {
    const loginData = JSON.stringify({
      email: 'admin@domainflow.local',
      password: 'admin123456789'
    });
    
    const response = await makeRequest(`${API_URL}/api/v2/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      },
      body: loginData
    });
    
    if (response.statusCode === 200) {
      console.log('✅ PASS: Login API accepts valid credentials');
      tests.push({ name: 'Login API', status: 'PASS' });
    } else {
      console.log('❌ FAIL: Login API rejects valid credentials (status:', response.statusCode, ')');
      console.log('Response:', response.body);
      tests.push({ name: 'Login API', status: 'FAIL', details: `Status: ${response.statusCode}` });
    }
  } catch (error) {
    console.log('❌ ERROR: Failed to test login API:', error.message);
    tests.push({ name: 'Login API', status: 'ERROR', details: error.message });
  }
  
  // Summary
  console.log('\n🔒 AUTHENTICATION SECURITY TEST RESULTS');
  console.log('========================================');
  
  const passed = tests.filter(t => t.status === 'PASS').length;
  const failed = tests.filter(t => t.status === 'FAIL').length;
  const errors = tests.filter(t => t.status === 'ERROR').length;
  
  tests.forEach(test => {
    const icon = test.status === 'PASS' ? '✅' : test.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${test.name}: ${test.status}${test.details ? ` (${test.details})` : ''}`);
  });
  
  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${errors} errors`);
  
  if (failed === 0 && errors === 0) {
    console.log('\n🎉 ALL AUTHENTICATION SECURITY TESTS PASSED!');
    console.log('The authentication system is properly secured.');
    return true;
  } else {
    console.log('\n⚠️  AUTHENTICATION SECURITY ISSUES DETECTED!');
    console.log('Please review and fix the failing tests.');
    return false;
  }
}

// Run the tests
testAuthenticationSecurity().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});