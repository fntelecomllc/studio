#!/bin/bash

# Test script for user management API endpoints
# This script tests all 5 user management endpoints

BASE_URL="http://localhost:8080/api/v2/admin"
SESSION_ID="test-session-id" # You'll need to get a valid session ID from login

echo "Testing User Management API Endpoints"
echo "====================================="

# Test 1: List all users
echo -e "\n1. Testing GET /api/v2/admin/users (List all users)"
curl -X GET "${BASE_URL}/users?page=1&limit=10" \
  -H "Cookie: session_id=${SESSION_ID}" \
  -H "Accept: application/json" \
  -w "\nHTTP Status: %{http_code}\n"

# Test 2: Create a new user
echo -e "\n\n2. Testing POST /api/v2/admin/users (Create new user)"
curl -X POST "${BASE_URL}/users" \
  -H "Cookie: session_id=${SESSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "email": "testuser@example.com",
    "firstName": "Test",
    "lastName": "User",
    "password": "TestPassword123!"
  }' \
  -w "\nHTTP Status: %{http_code}\n"

# Test 3: Get specific user (you'll need to replace USER_ID with actual ID)
USER_ID="REPLACE_WITH_ACTUAL_USER_ID"
echo -e "\n\n3. Testing GET /api/v2/admin/users/:userId (Get specific user)"
echo "Note: Replace USER_ID with an actual user ID"
curl -X GET "${BASE_URL}/users/${USER_ID}" \
  -H "Cookie: session_id=${SESSION_ID}" \
  -H "Accept: application/json" \
  -w "\nHTTP Status: %{http_code}\n"

# Test 4: Update user
echo -e "\n\n4. Testing PUT /api/v2/admin/users/:userId (Update user)"
echo "Note: Replace USER_ID with an actual user ID"
curl -X PUT "${BASE_URL}/users/${USER_ID}" \
  -H "Cookie: session_id=${SESSION_ID}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "firstName": "Updated",
    "lastName": "Name",
    "isActive": true
  }' \
  -w "\nHTTP Status: %{http_code}\n"

# Test 5: Delete user
echo -e "\n\n5. Testing DELETE /api/v2/admin/users/:userId (Delete user)"
echo "Note: Replace USER_ID with an actual user ID"
curl -X DELETE "${BASE_URL}/users/${USER_ID}" \
  -H "Cookie: session_id=${SESSION_ID}" \
  -H "Accept: application/json" \
  -w "\nHTTP Status: %{http_code}\n"

echo -e "\n\nTest completed!"
echo "====================================="
echo "Expected results:"
echo "- List users: HTTP 200 with user list and pagination"
echo "- Create user: HTTP 201 with created user data"
echo "- Get user: HTTP 200 with user data (404 if not found)"
echo "- Update user: HTTP 200 with updated user data (404 if not found)"
echo "- Delete user: HTTP 204 (404 if not found)"
echo ""
echo "If you see 401/403 errors, ensure you have:"
echo "1. A valid session ID from login"
echo "2. The 'admin:users' permission"