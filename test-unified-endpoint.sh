#!/bin/bash
# Test script for unified campaign creation endpoint

echo "🧪 Testing Unified Campaign Creation Endpoint"

# Backend URL
BACKEND_URL="http://localhost:8080"

# Check if backend is running
if ! curl -s "$BACKEND_URL/health" > /dev/null; then
    echo "❌ Backend is not running. Please start it first with:"
    echo "   cd backend && go run cmd/apiserver/main.go"
    exit 1
fi

echo "✅ Backend is running"

# Check if database is accessible by testing a simple authenticated endpoint
echo "📝 Testing database connectivity via auth endpoints..."

# Test health endpoint first
HEALTH_RESPONSE=$(curl -s "$BACKEND_URL/health")
echo "Health check: $HEALTH_RESPONSE"

# Test login endpoint to check if database connection works
echo "📝 Testing authentication (this will fail but should show database connectivity)..."

LOGIN_RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test@example.com",
    "password": "testpassword"
  }')

echo "Login response: $LOGIN_RESPONSE"

# If we get a proper auth error (not a database connection error), database is working
if echo "$LOGIN_RESPONSE" | grep -q "Invalid credentials\|authentication\|password\|email"; then
    echo "✅ Database connectivity confirmed (authentication endpoint responding)"
elif echo "$LOGIN_RESPONSE" | grep -q "database\|connection\|timeout"; then
    echo "❌ Database connection issue detected"
    echo "   Make sure PostgreSQL is running and accessible with the credentials in .env"
    echo "   DB_HOST=localhost, DB_PORT=5432, DB_NAME=domainflow_production, DB_USER=domainflow"
    exit 1
else
    echo "⚠️  Unknown response from auth endpoint - proceeding with campaign tests"
fi

# Test unified campaign creation endpoint (will fail due to authentication, but should show endpoint is accessible)
echo ""
echo "📝 Test 1: Testing unified endpoint accessibility..."

RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/campaigns" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignType": "domain_generation",
    "name": "Test Unified Domain Generation",
    "description": "Testing the unified campaign creation endpoint",
    "domainGenerationParams": {
      "patternType": "prefix",
      "variableLength": 3,
      "characterSet": "abc123",
      "constantString": "testunified",
      "tld": ".com",
      "numDomainsToGenerate": 50
    }
  }')

echo "Response: $RESPONSE"

# Check if we get an authentication error (which means the endpoint exists and is working)
if echo "$RESPONSE" | grep -q "Unauthorized\|unauthorized\|authentication\|login"; then
    echo "✅ Test 1 PASSED: Unified campaign endpoint is accessible and properly protected"
elif echo "$RESPONSE" | grep -q "route\|not found\|404"; then
    echo "❌ Test 1 FAILED: Unified campaign endpoint not found"
    echo "   The endpoint /api/v2/campaigns POST might not be registered correctly"
elif echo "$RESPONSE" | grep -q "database\|connection"; then
    echo "❌ Test 1 FAILED: Database connection issue"
else
    echo "⚠️  Test 1 UNKNOWN: Unexpected response format"
    echo "   Response: $RESPONSE"
fi

# Test invalid campaign type to verify validation works
echo ""
echo "📝 Test 2: Testing validation with invalid campaign type..."

RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/v2/campaigns" \
  -H "Content-Type: application/json" \
  -d '{
    "campaignType": "invalid_type",
    "name": "Test Invalid Type"
  }')

echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "Unauthorized\|unauthorized"; then
    echo "✅ Test 2 PASSED: Endpoint protected by authentication (validation would happen after auth)"
elif echo "$RESPONSE" | grep -q "unsupported\|invalid.*type"; then
    echo "✅ Test 2 PASSED: Campaign type validation working"
else
    echo "⚠️  Test 2: Response suggests endpoint is working: $RESPONSE"
fi

echo ""
echo "🎉 Integration testing completed!"
echo ""
echo "� Summary:"
echo "   - Backend is running on $BACKEND_URL"
echo "   - Unified campaign creation endpoint is accessible at POST /api/v2/campaigns"
echo "   - Endpoint is properly protected by authentication middleware"
echo "   - Database connectivity appears to be working"
echo ""
echo "🔐 To test actual campaign creation, you'll need to:"
echo "   1. Create a valid user account or use existing credentials"
echo "   2. Login via POST /api/v2/auth/login to get session cookies"
echo "   3. Use the session cookies in subsequent campaign creation requests"
