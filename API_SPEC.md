# DomainFlow API Specification

## Overview

DomainFlow provides a comprehensive RESTful API for domain analysis and campaign management. The API is built with Go using the Gin framework and follows OpenAPI 3.0 standards.

**Base URL**: `http://localhost:8080` (development) / `https://your-domain.com` (production)

**API Version**: v1 (with v2 extensions for campaigns)

**Authentication**: Session-based with CSRF protection for web interface, Bearer tokens for API access

---

## Authentication

### Session-Based Authentication (Web Interface)

The web interface uses secure session cookies with CSRF protection:

```javascript
// Login request
POST /api/v2/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password"
}

// Response includes secure session cookie
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict
```

### Bearer Token Authentication (API Access)

For programmatic API access, use Bearer tokens:

```bash
curl -X GET "http://localhost:8080/api/v2/campaigns" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

---

## Core Endpoints

### Health Check

**GET /ping**
- Description: Server health check
- Authentication: None required
- Response: `{"message": "pong", "timestamp": "2025-06-14T10:30:00Z"}`

---

## Authentication Endpoints

### Login
**POST /api/v2/auth/login**
```json
{
  "username": "string",
  "password": "string"
}
```

### Logout
**POST /api/v2/auth/logout**
- Clears session and CSRF tokens

### Current User
**GET /api/v2/me**
- Returns current authenticated user information

---

## User Management

### List Users
**GET /api/v2/users**
- Admin only
- Returns paginated list of users

### Create User
**POST /api/v2/users**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "admin|user"
}
```

### Update User
**PUT /api/v2/users/:id**
```json
{
  "username": "string",
  "email": "string",
  "role": "admin|user",
  "isActive": true
}
```

### Delete User
**DELETE /api/v2/users/:id**
- Admin only
- Soft delete with audit trail

---

## Campaign Management (V2 API)

### List Campaigns
**GET /api/v2/campaigns**
- Returns paginated list of campaigns for current user

### Get Campaign Details
**GET /api/v2/campaigns/:id**
- Returns detailed campaign information including progress

### Create Campaign
**POST /api/v2/campaigns**
```json
{
  "name": "string",
  "keywords": ["keyword1", "keyword2"],
  "selectedType": "dns|http",
  "domainSource": {
    "type": "generated|uploaded",
    "domains": ["domain1.com", "domain2.com"] // for uploaded
  },
  "config": {
    "maxDomains": 1000,
    "timeout": 30,
    "retries": 3
  }
}
```

### Start Campaign Phase
**POST /api/v2/campaigns/:id/start**
- Starts the campaign execution
- Returns updated campaign status

### Stop Campaign
**POST /api/v2/campaigns/:id/stop**
- Stops campaign execution gracefully

### Delete Campaign
**DELETE /api/v2/campaigns/:id**
- Soft delete with audit trail

---

## Persona Management

### DNS Personas

**GET /api/v2/personas/dns**
- List all DNS personas

**POST /api/v2/personas/dns**
```json
{
  "name": "string",
  "description": "string",
  "configDetails": {
    "resolvers": ["1.1.1.1:53", "8.8.8.8:53"],
    "queryTimeoutSeconds": 5,
    "retries": 3,
    "queryTypes": ["A", "AAAA", "MX", "TXT"]
  },
  "isEnabled": true
}
```

**PUT /api/v2/personas/dns/:id**
- Update DNS persona configuration

**DELETE /api/v2/personas/dns/:id**
- Delete DNS persona

### HTTP Personas

**GET /api/v2/personas/http**
- List all HTTP personas

**POST /api/v2/personas/http**
```json
{
  "name": "string",
  "description": "string",
  "configDetails": {
    "userAgent": "DomainFlow/1.0",
    "headers": {
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9"
    },
    "timeout": 30,
    "followRedirects": true,
    "maxRedirects": 5
  },
  "isEnabled": true
}
```

---

## Proxy Management

### List Proxies
**GET /api/v2/proxies**
- Returns all configured proxies

### Create Proxy
**POST /api/v2/proxies**
```json
{
  "name": "string",
  "url": "http://proxy.example.com:8080",
  "username": "string",
  "password": "string",
  "isEnabled": true
}
```

### Update Proxy
**PUT /api/v2/proxies/:id**
```json
{
  "name": "string",
  "url": "string",
  "username": "string",
  "password": "string",
  "isEnabled": true
}
```

### Delete Proxy
**DELETE /api/v2/proxies/:id**

### Test Proxy
**POST /api/v2/proxies/:id/test**
- Tests proxy connectivity and returns status

---

## WebSocket API

### General WebSocket Connection
**GET /api/v2/ws** (WebSocket upgrade)

**Authentication**: Include `Authorization: Bearer YOUR_API_KEY` header

**Message Format**:
```json
{
  "event_type": "campaign_update|system_notification|error",
  "payload": {
    "campaignId": "uuid",
    "status": "running|completed|failed",
    "progressPercentage": 75.5,
    "message": "Status message",
    "timestamp": "2025-06-14T10:30:00Z"
  }
}
```

**Client Commands**:
```json
{
  "action": "subscribe_campaign_updates",
  "campaignId": "uuid"
}
```

---

## Data Models

### Campaign
```typescript
interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed' | 'failed' | 'stopped';
  selectedType: 'dns' | 'http';
  keywords: string[];
  domainSource: {
    type: 'generated' | 'uploaded';
    domains?: string[];
  };
  config: {
    maxDomains: number;
    timeout: number;
    retries: number;
  };
  progress: {
    percentage: number;
    currentPhase: string;
    phaseStatus: string;
    processedDomains: number;
    totalDomains: number;
  };
  createdAt: string;
  updatedAt: string;
  userId: string;
}
```

### User
```typescript
interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}
```

### Persona
```typescript
interface Persona {
  id: string;
  name: string;
  personaType: 'dns' | 'http';
  description: string;
  configDetails: DNSConfigDetails | HTTPConfigDetails;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Proxy
```typescript
interface Proxy {
  id: string;
  name: string;
  url: string;
  username?: string;
  password?: string;
  isEnabled: boolean;
  lastTestAt?: string;
  lastTestStatus?: 'success' | 'failure';
  createdAt: string;
  updatedAt: string;
}
```

---

## Error Handling

### Standard Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": {
      "field": "username",
      "issue": "Username already exists"
    }
  },
  "timestamp": "2025-06-14T10:30:00Z",
  "requestId": "uuid"
}
```

### HTTP Status Codes

- **200 OK**: Successful request
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict (e.g., duplicate username)
- **422 Unprocessable Entity**: Validation error
- **500 Internal Server Error**: Server error

---

## Rate Limiting

- **General API**: 100 requests per minute per IP
- **Authentication**: 10 login attempts per minute per IP
- **WebSocket**: 5 connections per user
- **Campaign Operations**: 10 operations per minute per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1671883200
```

---

## CORS Configuration

**Allowed Origins**: Configurable in backend config.json
**Allowed Methods**: GET, POST, PUT, DELETE, OPTIONS
**Allowed Headers**: Authorization, Content-Type, X-CSRF-Token
**Credentials**: Supported for session-based authentication

---

## Security Considerations

1. **Authentication**: All endpoints except `/ping` require authentication
2. **CSRF Protection**: Required for all state-changing operations from web interface
3. **Input Validation**: All inputs are validated and sanitized
4. **SQL Injection**: Prevented through prepared statements
5. **XSS Protection**: Content Security Policy headers enabled
6. **Session Security**: Secure, HttpOnly cookies with appropriate expiration

---

*For implementation details and examples, see the source code in `/backend/internal/handlers/` and the frontend API client in `/src/lib/services/apiClient.production.ts`.*
