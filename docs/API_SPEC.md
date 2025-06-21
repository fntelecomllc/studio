# DomainFlow API Specification

## Overview

DomainFlow API v2 provides a comprehensive REST API for domain generation, validation, and campaign management. The API follows OpenAPI 3.0 specification and includes real-time WebSocket communication for live updates.

**Base URL**: `http://localhost:8080/api/v2`  
**WebSocket URL**: `ws://localhost:8080/ws`  
**API Version**: 2.0  
**Authentication**: Session-based with HTTP-only cookies

## Authentication

### Session-Based Authentication
All API endpoints (except public endpoints) require authentication via session cookies. The authentication flow uses HTTP-only cookies for security.

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response (200)**:
```json
{
  "status": "success",
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "role": "admin|user",
    "permissions": ["string"]
  }
}
```

#### Logout
```http
POST /auth/logout
```

#### Session Status
```http
GET /auth/status
```

**Response (200)**:
```json
{
  "authenticated": true,
  "user": {
    "id": "uuid",
    "username": "string",
    "role": "string",
    "permissions": ["string"]
  }
}
```

## Core API Endpoints

### Campaigns

#### List Campaigns
```http
GET /api/v2/campaigns
```

**Query Parameters**:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20)
- `status` (string): Filter by status
- `type` (string): Filter by campaign type

**Response (200)**:
```json
{
  "campaigns": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string",
      "type": "domain_generation|dns_validation|http_keyword",
      "status": "pending|running|completed|failed",
      "createdAt": "2025-06-19T10:00:00Z",
      "updatedAt": "2025-06-19T10:00:00Z",
      "userId": "uuid",
      "parameters": {
        // Campaign-specific parameters
      },
      "progress": {
        "totalItems": 1000,
        "processedItems": 450,
        "successCount": 425,
        "errorCount": 25
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

#### Create Campaign
```http
POST /api/v2/campaigns
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "type": "domain_generation|dns_validation|http_keyword",
  "parameters": {
    // Type-specific parameters
  }
}
```

**Domain Generation Parameters**:
```json
{
  "type": "domain_generation",
  "parameters": {
    "keywords": ["example", "test"],
    "tlds": [".com", ".net"],
    "maxLength": 20,
    "includeDashes": true,
    "includeNumbers": true
  }
}
```

**DNS Validation Parameters**:
```json
{
  "type": "dns_validation",
  "parameters": {
    "domains": ["example.com", "test.net"],
    "recordTypes": ["A", "AAAA", "MX"],
    "timeout": 30
  }
}
```

**HTTP Keyword Parameters**:
```json
{
  "type": "http_keyword",
  "parameters": {
    "urls": ["https://example.com"],
    "keywords": ["product", "service"],
    "timeout": 30,
    "followRedirects": true
  }
}
```

#### Get Campaign
```http
GET /api/v2/campaigns/{id}
```

#### Update Campaign
```http
PUT /api/v2/campaigns/{id}
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "parameters": {
    // Updated parameters
  }
}
```

#### Delete Campaign
```http
DELETE /api/v2/campaigns/{id}
```

#### Start Campaign
```http
POST /api/v2/campaigns/{id}/start
```

#### Stop Campaign
```http
POST /api/v2/campaigns/{id}/stop
```

#### Get Campaign Results
```http
GET /api/v2/campaigns/{id}/results
```

**Query Parameters**:
- `page` (integer): Page number
- `limit` (integer): Items per page
- `status` (string): Filter by result status

### Admin Operations

#### List Users
```http
GET /api/v2/admin/users
```

**Required Permission**: `admin:users:read`

**Response (200)**:
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "role": "admin|user",
      "isActive": true,
      "createdAt": "2025-06-19T10:00:00Z",
      "lastLogin": "2025-06-19T09:00:00Z"
    }
  ]
}
```

#### Create User
```http
POST /api/v2/admin/users
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "admin|user"
}
```

**Required Permission**: `admin:users:create`

#### Update User
```http
PUT /api/v2/admin/users/{id}
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "role": "admin|user",
  "isActive": true
}
```

**Required Permission**: `admin:users:update`

#### Delete User
```http
DELETE /api/v2/admin/users/{id}
```

**Required Permission**: `admin:users:delete`

### Keyword Sets

#### List Keyword Sets
```http
GET /api/v2/keyword-sets
```

#### Create Keyword Set
```http
POST /api/v2/keyword-sets
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "keywords": ["string"]
}
```

### Personas

#### List Personas
```http
GET /api/v2/personas
```

#### Create Persona
```http
POST /api/v2/personas
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "userAgent": "string",
  "acceptLanguage": "string",
  "acceptEncoding": "string"
}
```

### Proxies

#### List Proxies
```http
GET /api/v2/proxies
```

#### Create Proxy
```http
POST /api/v2/proxies
Content-Type: application/json

{
  "name": "string",
  "description": "string",
  "host": "string",
  "port": 8080,
  "protocol": "http|https|socks5",
  "username": "string",
  "password": "string"
}
```

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:8080/ws');
```

### Message Format
All WebSocket messages follow this standardized format:

```json
{
  "type": "string",
  "timestamp": "2025-06-19T10:00:00Z",
  "data": {
    // Message-specific data
  }
}
```

### Message Types

#### Campaign Progress
```json
{
  "type": "campaign_progress",
  "timestamp": "2025-06-19T10:00:00Z",
  "data": {
    "campaignId": "uuid",
    "totalItems": 1000,
    "processedItems": 450,
    "successCount": 425,
    "errorCount": 25,
    "estimatedCompletion": "2025-06-19T10:30:00Z"
  }
}
```

#### Campaign Complete
```json
{
  "type": "campaign_complete",
  "timestamp": "2025-06-19T10:00:00Z",
  "data": {
    "campaignId": "uuid",
    "status": "completed|failed",
    "totalItems": 1000,
    "successCount": 950,
    "errorCount": 50,
    "duration": "00:30:15"
  }
}
```

#### System Notification
```json
{
  "type": "system_notification",
  "timestamp": "2025-06-19T10:00:00Z",
  "data": {
    "level": "info|warning|error",
    "message": "string",
    "details": {}
  }
}
```

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {},
    "timestamp": "2025-06-19T10:00:00Z"
  }
}
```

### Common Error Codes

#### Authentication Errors
- `401 Unauthorized`: Invalid or missing authentication
- `403 Forbidden`: Insufficient permissions

#### Validation Errors
- `400 Bad Request`: Invalid request data
- `422 Unprocessable Entity`: Validation failed

#### Resource Errors
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict

#### Server Errors
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service temporarily unavailable

### Example Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid campaign parameters",
    "details": {
      "field": "keywords",
      "reason": "Keywords array cannot be empty"
    },
    "timestamp": "2025-06-19T10:00:00Z"
  }
}
```

## Data Models

### Campaign Model
```typescript
interface Campaign {
  id: string;
  name: string;
  description?: string;
  type: 'domain_generation' | 'dns_validation' | 'http_keyword';
  status: 'pending' | 'running' | 'completed' | 'failed';
  userId: string;
  parameters: CampaignParameters;
  progress?: CampaignProgress;
  createdAt: string;
  updatedAt: string;
}
```

### User Model
```typescript
interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}
```

### Campaign Progress Model
```typescript
interface CampaignProgress {
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  estimatedCompletion?: string;
}
```

## Rate Limiting

- **Authentication endpoints**: 10 requests per minute per IP
- **Campaign operations**: 100 requests per minute per user
- **WebSocket connections**: 5 concurrent connections per user
- **General API**: 1000 requests per hour per user

## Security Considerations

### HTTPS Only
All production deployments must use HTTPS for secure communication.

### CORS Configuration
Configure CORS origins appropriately for your frontend domains.

### Session Security
- Sessions use HTTP-only cookies
- SameSite attribute set to 'Strict'
- Secure flag enabled in production
- Session expiration: 24 hours (configurable)

### Input Validation
- All inputs are validated server-side
- SQL injection prevention with parameterized queries
- XSS protection with proper output encoding

## SDKs and Client Libraries

### TypeScript/JavaScript Client
Auto-generated TypeScript client available in `/src/lib/api-client/`

```typescript
import { CampaignsApi, Configuration } from '@/lib/api-client';

const config = new Configuration({
  basePath: 'http://localhost:8080/api/v2'
});

const campaignsApi = new CampaignsApi(config);
```

## Changelog

### Version 2.0 (Current)
- Added comprehensive runtime validation
- Implemented permission-based access control
- Standardized WebSocket message types
- Added admin user management endpoints
- Enhanced campaign orchestration controls

### Version 1.0
- Initial API implementation
- Basic campaign management
- User authentication
- WebSocket support

---

For technical support or API questions, refer to the main documentation or contact the development team.
