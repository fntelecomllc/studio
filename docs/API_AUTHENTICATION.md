# DomainFlow API Authentication Documentation

## Table of Contents

1. [Authentication Overview](#authentication-overview)
2. [Authentication Methods](#authentication-methods)
3. [API Endpoints](#api-endpoints)
4. [Role-Based Access Control](#role-based-access-control)
5. [Rate Limiting](#rate-limiting)
6. [Error Handling](#error-handling)
7. [Security Best Practices](#security-best-practices)
8. [Integration Examples](#integration-examples)
9. [SDK and Libraries](#sdk-and-libraries)
10. [Troubleshooting](#troubleshooting)

## Authentication Overview

DomainFlow provides a comprehensive authentication system supporting both web-based session authentication and API key authentication for programmatic access. The system implements enterprise-grade security features including role-based access control, rate limiting, and comprehensive audit logging.

### Supported Authentication Methods

1. **Session-Based Authentication** - For web interface access
2. **API Key Authentication** - For programmatic API access
3. **Bearer Token Authentication** - For service-to-service communication

### Base API URL

```
Production: https://api.domainflow.com/v1
Development: http://localhost:8080/api/v2
```

## Authentication Methods

### 1. Session-Based Authentication

Used primarily for web interface access with secure HTTP-only cookies.

#### Login Endpoint

**POST** `/api/v2/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123!",
  "rememberMe": false,
  "captchaToken": "optional_captcha_token"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "roles": ["campaign_manager"],
    "permissions": [
      "campaigns.create",
      "campaigns.read",
      "campaigns.update",
      "personas.read"
    ],
    "lastLogin": "2024-01-15T10:30:00Z",
    "mustChangePassword": false
  },
  "sessionExpiry": "2024-01-16T10:30:00Z"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid credentials",
  "errorCode": "AUTH_INVALID_CREDENTIALS",
  "remainingAttempts": 3,
  "lockoutTime": null
}
```

#### Logout Endpoint

**POST** `/api/v2/auth/logout`

**Headers:**
```
Cookie: domainflow_session=session_token_here
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

#### Session Validation

**GET** `/api/v2/auth/me`

**Headers:**
```
Cookie: domainflow_session=session_token_here
```

**Response:**
```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "roles": ["campaign_manager"],
    "permissions": ["campaigns.create", "campaigns.read"],
    "sessionExpiry": "2024-01-16T10:30:00Z"
  }
}
```

### 2. API Key Authentication

For programmatic access to the DomainFlow API.

#### API Key Format

```
Authorization: Bearer df_api_1234567890abcdef1234567890abcdef
```

#### Obtaining API Keys

**POST** `/api/v2/auth/api-keys`

**Headers:**
```
Cookie: domainflow_session=session_token_here
```

**Request Body:**
```json
{
  "name": "My Application API Key",
  "description": "API key for automated campaign management",
  "scopes": ["campaigns:read", "campaigns:write", "personas:read"],
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "apiKey": {
    "id": "key-456",
    "name": "My Application API Key",
    "key": "df_api_1234567890abcdef1234567890abcdef",
    "scopes": ["campaigns:read", "campaigns:write", "personas:read"],
    "createdAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-12-31T23:59:59Z",
    "lastUsed": null
  }
}
```

#### Using API Keys

**Example Request:**
```bash
curl -H "Authorization: Bearer df_api_1234567890abcdef1234567890abcdef" \
     -H "Content-Type: application/json" \
     https://api.domainflow.com/v1/campaigns
```

#### Managing API Keys

**List API Keys:**
```bash
GET /api/v2/auth/api-keys
```

**Revoke API Key:**
```bash
DELETE /api/v2/auth/api-keys/{keyId}
```

**Rotate API Key:**
```bash
POST /api/v2/auth/api-keys/{keyId}/rotate
```

### 3. Bearer Token Authentication

For service-to-service communication and temporary access tokens.

#### Token Exchange

**POST** `/api/v2/auth/token`

**Request Body:**
```json
{
  "grant_type": "client_credentials",
  "client_id": "your_client_id",
  "client_secret": "your_client_secret",
  "scope": "campaigns:read personas:read"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "campaigns:read personas:read"
}
```

## API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Authentication |
|--------|----------|-------------|----------------|
| POST | `/api/v2/auth/login` | User login | None |
| POST | `/api/v2/auth/logout` | User logout | Session |
| GET | `/api/v2/me` | Get current user | Session |
| POST | `/api/v2/auth/change-password` | Change password | Session |
| POST | `/api/v2/auth/api-keys` | Create API key | Session |
| GET | `/api/v2/auth/api-keys` | List API keys | Session |
| DELETE | `/api/v2/auth/api-keys/{id}` | Revoke API key | Session |

### User Management Endpoints

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|-------------------|
| GET | `/api/v2/users` | List users | `system.users` |
| POST | `/api/v2/users` | Create user | `system.users` |
| GET | `/api/v2/users/{id}` | Get user details | `system.users` or own profile |
| PUT | `/api/v2/users/{id}` | Update user | `system.users` or own profile |
| DELETE | `/api/v2/users/{id}` | Delete user | `system.users` |
| POST | `/api/v2/users/{id}/roles` | Assign role | `system.users` |
| DELETE | `/api/v2/users/{id}/roles/{roleId}` | Remove role | `system.users` |

### Campaign Management Endpoints

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|-------------------|
| GET | `/api/v2/campaigns` | List campaigns | `campaigns.read` |
| POST | `/api/v2/campaigns` | Create campaign | `campaigns.create` |
| GET | `/api/v2/campaigns/{id}` | Get campaign details | `campaigns.read` |
| PUT | `/api/v2/campaigns/{id}` | Update campaign | `campaigns.update` |
| DELETE | `/api/v2/campaigns/{id}` | Delete campaign | `campaigns.delete` |
| POST | `/api/v2/campaigns/{id}/start` | Start campaign | `campaigns.execute` |
| POST | `/api/v2/campaigns/{id}/stop` | Stop campaign | `campaigns.execute` |

### Persona Management Endpoints

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|-------------------|
| GET | `/api/v2/personas` | List personas | `personas.read` |
| POST | `/api/v2/personas` | Create persona | `personas.create` |
| GET | `/api/v2/personas/{id}` | Get persona details | `personas.read` |
| PUT | `/api/v2/personas/{id}` | Update persona | `personas.update` |
| DELETE | `/api/v2/personas/{id}` | Delete persona | `personas.delete` |

### Proxy Management Endpoints

| Method | Endpoint | Description | Required Permission |
|--------|----------|-------------|-------------------|
| GET | `/api/v2/proxies` | List proxies | `proxies.read` |
| POST | `/api/v2/proxies` | Create proxy | `proxies.create` |
| GET | `/api/v2/proxies/{id}` | Get proxy details | `proxies.read` |
| PUT | `/api/v2/proxies/{id}` | Update proxy | `proxies.update` |
| DELETE | `/api/v2/proxies/{id}` | Delete proxy | `proxies.delete` |

## Role-Based Access Control

### Predefined Roles

#### Super Administrator
**Permissions:**
- All system permissions
- User management
- System configuration
- Audit log access

**API Scope:** `admin:*`

#### Administrator
**Permissions:**
- User management (limited)
- Campaign management
- System monitoring
- Configuration management (limited)

**API Scope:** `admin:users admin:config campaigns:* personas:* proxies:*`

#### Campaign Manager
**Permissions:**
- Campaign CRUD operations
- Persona and proxy management
- Team member management

**API Scope:** `campaigns:* personas:* proxies:* users:team`

#### Analyst
**Permissions:**
- Read-only access to campaigns
- Report generation
- Dashboard access

**API Scope:** `campaigns:read personas:read reports:*`

#### User
**Permissions:**
- Basic campaign access
- Personal profile management
- Limited resource creation

**API Scope:** `campaigns:read campaigns:create personas:read profile:*`

### Permission System

#### Permission Format
Permissions follow the format: `resource.action`

**Resources:**
- `campaigns` - Campaign management
- `personas` - Persona management
- `proxies` - Proxy management
- `users` - User management
- `system` - System administration
- `reports` - Report generation
- `audit` - Audit log access

**Actions:**
- `create` - Create new resources
- `read` - View resources
- `update` - Modify existing resources
- `delete` - Remove resources
- `execute` - Execute operations (campaigns)
- `admin` - Administrative access

#### Dynamic Permission Checking

**API Request Example:**
```bash
# Check if user has permission to create campaigns
GET /api/v2/auth/permissions/check?permission=campaigns.create

# Response
{
  "hasPermission": true,
  "reason": "User has campaign_manager role"
}
```

### API Scopes

API keys and tokens use scopes to limit access:

#### Scope Format
- `resource:action` - Specific permission
- `resource:*` - All actions on resource
- `*` - All permissions (admin only)

#### Example Scopes
```json
{
  "scopes": [
    "campaigns:read",
    "campaigns:create",
    "personas:read",
    "reports:generate"
  ]
}
```

## Rate Limiting

### Rate Limit Tiers

#### Global Limits (per IP)
- **Requests:** 1000 per hour
- **Burst:** 100 requests
- **Window:** 1 hour sliding window

#### Authentication Endpoints
- **Login:** 5 attempts per 15 minutes
- **Password Reset:** 3 requests per hour
- **API Key Creation:** 10 per day

#### API Endpoints (per API key)
- **Standard:** 1000 requests per hour
- **Premium:** 5000 requests per hour
- **Enterprise:** 10000 requests per hour

### Rate Limit Headers

All API responses include rate limit information:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
X-RateLimit-Window: 3600
```

### Rate Limit Exceeded Response

```json
{
  "error": "Rate limit exceeded",
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 3600,
  "limit": 1000,
  "remaining": 0,
  "resetTime": "2024-01-15T11:00:00Z"
}
```

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "error": "Human readable error message",
  "errorCode": "MACHINE_READABLE_ERROR_CODE",
  "details": {
    "field": "specific field that caused the error",
    "value": "invalid value",
    "constraint": "validation rule that was violated"
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "requestId": "req-123456"
}
```

### Authentication Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid email or password |
| `AUTH_ACCOUNT_LOCKED` | 423 | Account temporarily locked |
| `AUTH_SESSION_EXPIRED` | 401 | Session has expired |
| `AUTH_INVALID_TOKEN` | 401 | Invalid or expired token |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | Insufficient permissions |
| `AUTH_API_KEY_INVALID` | 401 | Invalid API key |
| `AUTH_API_KEY_EXPIRED` | 401 | API key has expired |
| `AUTH_API_KEY_REVOKED` | 401 | API key has been revoked |
| `RATE_LIMIT_EXCEEDED` | 429 | Rate limit exceeded |

### Error Handling Best Practices

#### Retry Logic
```javascript
async function apiRequest(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = response.headers.get('Retry-After') || 60;
        await sleep(retryAfter * 1000);
        continue;
      }
      
      if (response.status === 401) {
        // Authentication failed - refresh token or re-authenticate
        await refreshAuthentication();
        options.headers.Authorization = getNewAuthHeader();
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(1000 * attempt); // Exponential backoff
    }
  }
}
```

## Security Best Practices

### API Key Security

#### Storage
- **Never** store API keys in client-side code
- Use environment variables or secure key management systems
- Rotate API keys regularly (recommended: every 90 days)
- Use different API keys for different environments

#### Transmission
- Always use HTTPS for API requests
- Never include API keys in URLs or logs
- Use proper HTTP headers for authentication

#### Monitoring
- Monitor API key usage patterns
- Set up alerts for unusual activity
- Regularly audit API key permissions

### Session Security

#### Cookie Configuration
```javascript
{
  "httpOnly": true,
  "secure": true,
  "sameSite": "strict",
  "maxAge": 86400000, // 24 hours
  "domain": ".domainflow.com"
}
```

#### Session Management
- Implement session timeout (30 minutes idle)
- Regenerate session IDs after login
- Clear sessions on logout
- Monitor concurrent sessions

### Request Security

#### HTTPS Only
All API requests must use HTTPS in production:

```bash
# Correct
curl https://api.domainflow.com/v1/campaigns

# Incorrect (will be redirected)
curl http://api.domainflow.com/v1/campaigns
```

#### Input Validation
Always validate and sanitize input data:

```javascript
// Example validation
const campaignSchema = {
  name: { type: 'string', minLength: 1, maxLength: 100 },
  description: { type: 'string', maxLength: 500 },
  domains: { type: 'array', items: { type: 'string', format: 'hostname' } }
};
```

## Integration Examples

### JavaScript/Node.js

#### Basic Authentication
```javascript
class DomainFlowClient {
  constructor(apiKey, baseUrl = 'https://api.domainflow.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${error.message}`);
    }
    
    return response.json();
  }
  
  async getCampaigns() {
    return this.request('/campaigns');
  }
  
  async createCampaign(campaignData) {
    return this.request('/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaignData)
    });
  }
}

// Usage
const client = new DomainFlowClient('df_api_your_key_here');
const campaigns = await client.getCampaigns();
```

#### Session-Based Authentication
```javascript
class DomainFlowWebClient {
  constructor(baseUrl = 'https://api.domainflow.com/v1') {
    this.baseUrl = baseUrl;
  }
  
  async login(email, password) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      return data;
    }
    
    throw new Error('Login failed');
  }
  
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    return fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include'
    });
  }
}
```

### Python

#### Using requests library
```python
import requests
from typing import Dict, Any, Optional

class DomainFlowClient:
    def __init__(self, api_key: str, base_url: str = "https://api.domainflow.com/v1"):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        })
    
    def request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}{endpoint}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()
    
    def get_campaigns(self) -> Dict[str, Any]:
        return self.request('GET', '/campaigns')
    
    def create_campaign(self, campaign_data: Dict[str, Any]) -> Dict[str, Any]:
        return self.request('POST', '/campaigns', json=campaign_data)
    
    def get_campaign(self, campaign_id: str) -> Dict[str, Any]:
        return self.request('GET', f'/campaigns/{campaign_id}')

# Usage
client = DomainFlowClient('df_api_your_key_here')
campaigns = client.get_campaigns()
```

### Go

#### HTTP client implementation
```go
package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type DomainFlowClient struct {
    APIKey  string
    BaseURL string
    Client  *http.Client
}

func NewDomainFlowClient(apiKey string) *DomainFlowClient {
    return &DomainFlowClient{
        APIKey:  apiKey,
        BaseURL: "https://api.domainflow.com/v1",
        Client: &http.Client{
            Timeout: 30 * time.Second,
        },
    }
}

func (c *DomainFlowClient) request(method, endpoint string, body interface{}) (*http.Response, error) {
    var reqBody []byte
    var err error
    
    if body != nil {
        reqBody, err = json.Marshal(body)
        if err != nil {
            return nil, err
        }
    }
    
    req, err := http.NewRequest(method, c.BaseURL+endpoint, bytes.NewBuffer(reqBody))
    if err != nil {
        return nil, err
    }
    
    req.Header.Set("Authorization", "Bearer "+c.APIKey)
    req.Header.Set("Content-Type", "application/json")
    
    return c.Client.Do(req)
}

func (c *DomainFlowClient) GetCampaigns() ([]Campaign, error) {
    resp, err := c.request("GET", "/campaigns", nil)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var campaigns []Campaign
    err = json.NewDecoder(resp.Body).Decode(&campaigns)
    return campaigns, err
}
```

### cURL Examples

#### Basic API Key Authentication
```bash
# Get campaigns
curl -H "Authorization: Bearer df_api_your_key_here" \
     https://api.domainflow.com/v1/campaigns

# Create campaign
curl -X POST \
     -H "Authorization: Bearer df_api_your_key_here" \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Campaign","description":"API test"}' \
     https://api.domainflow.com/v1/campaigns

# Get specific campaign
curl -H "Authorization: Bearer df_api_your_key_here" \
     https://api.domainflow.com/v1/campaigns/campaign-123
```

#### Session-Based Authentication
```bash
# Login and save cookies
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}' \
     -c cookies.txt \
     https://api.domainflow.com/v1/auth/login

# Use session for subsequent requests
curl -H "Content-Type: application/json" \
     -b cookies.txt \
     https://api.domainflow.com/v1/campaigns
```

## SDK and Libraries

### Official SDKs

#### JavaScript/TypeScript SDK
```bash
npm install @domainflow/sdk
```

```typescript
import { DomainFlowClient } from '@domainflow/sdk';

const client = new DomainFlowClient({
  apiKey: 'df_api_your_key_here',
  environment: 'production' // or 'development'
});

// Type-safe API calls
const campaigns = await client.campaigns.list();
const campaign = await client.campaigns.create({
  name: 'My Campaign',
  description: 'Campaign description'
});
```

#### Python SDK
```bash
pip install domainflow-sdk
```

```python
from domainflow import DomainFlowClient

client = DomainFlowClient(api_key='df_api_your_key_here')

# List campaigns
campaigns = client.campaigns.list()

# Create campaign
campaign = client.campaigns.create(
    name='My Campaign',
    description='Campaign description'
)
```

#### Go SDK
```bash
go get github.com/domainflow/go-sdk
```

```go
import "github.com/domainflow/go-sdk/domainflow"

client := domainflow.NewClient("df_api_your_key_here")

campaigns, err := client.Campaigns.List(context.Background())
if err != nil {
    log.Fatal(err)
}
```

### Community Libraries

- **PHP**: `domainflow/php-sdk`
- **Ruby**: `domainflow-ruby`
- **Java**: `com.domainflow:java-sdk`
- **C#**: `DomainFlow.SDK`

## Troubleshooting

### Common Issues

#### Authentication Failures

**Issue**: `AUTH_INVALID_CREDENTIALS`
```json
{
  "error": "Invalid credentials",
  "errorCode": "AUTH_INVALID_CREDENTIALS"
}
```

**Solutions:**
1. Verify email and password are correct
2. Check if account is locked
3. Ensure CAPTCHA is completed if required
4. Check for typos in credentials

**Issue**: `AUTH_API_KEY_INVALID`
```json
{
  "error": "Invalid API key",
  "errorCode": "AUTH_API_KEY_INVALID"
}
```

**Solutions:**
1. Verify API key format (starts with `df_api_`)
2. Check if API key has been revoked
3. Ensure API key hasn't expired
4. Verify correct environment (dev/prod)

#### Permission Errors

**Issue**: `AUTH_INSUFFICIENT_PERMISSIONS`
```json
{
  "error": "Insufficient permissions",
  "errorCode": "AUTH_INSUFFICIENT_PERMISSIONS",
  "required": "campaigns.create",
  "userPermissions": ["campaigns.read"]
}
```

**Solutions:**
1. Contact administrator to grant required permissions
2. Check if user role includes necessary permissions
3. Verify API key scopes include required permissions

#### Rate Limiting

**Issue**: `RATE_LIMIT_EXCEEDED`
```json
{
  "error": "Rate limit exceeded",
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 3600
}
```

**Solutions:**
1. Implement exponential backoff retry logic
2. Respect `Retry-After` header
3. Consider upgrading to higher rate limit tier
4. Optimize API usage patterns

### Debug Mode

Enable debug mode for detailed request/response logging:

```javascript
const client = new DomainFlowClient('df_api_your_key_here', {
  debug: true,
  logLevel: 'verbose'
});
```

### Support Channels

- **Documentation**: https://docs.domainflow.com
- **API Status**: https://status.domainflow.com
- **Support Email**: api-support@domainflow.com
- **Community Forum**: https://community.domainflow.com
- **GitHub Issues**: https://github.com/domainflow/api-issues

### API Testing Tools

#### Postman Collection
Import our official Postman collection:
```
https://api.domainflow.com/postman/collection.json
```

#### OpenAPI Specification
Download the OpenAPI spec:
```
https://api.domainflow.com/openapi.json
```

#### Interactive API Explorer
Test APIs directly in your browser:
```
https://api.domainflow.com/explorer
```

---

For additional support or questions about the DomainFlow API, please contact our support team or refer to the comprehensive documentation at https://docs.domainflow.com.