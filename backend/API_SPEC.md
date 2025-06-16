# DomainFlow API Specification v2

This document outlines the API endpoints for the DomainFlow application backend.
It includes entity management (Personas, Proxies, Keyword Sets), configuration management, ad-hoc keyword extraction, the V2 Stateful Campaign Management system, real-time communication via WebSockets, and comprehensive authentication.

**Authentication:**
The API supports two authentication methods:

1. **Session-Based Authentication** (Web Interface): Secure cookie-based sessions with CSRF protection
   - Login via `POST /api/v2/auth/login` 
   - Session cookies: httpOnly, secure, sameSite
   - CSRF tokens required for state-changing operations

2. **Bearer Token Authentication** (API Access): For programmatic access
   - Header: `Authorization: Bearer YOUR_API_KEY`
   - Used for automated tools and integrations

All RESTful API endpoints under `/api/v2` and `/api/v2` (excluding `GET /ping`) require authentication.

For WebSocket connections, authentication must be provided via the `Authorization: Bearer YOUR_API_KEY` header during the initial HTTP upgrade request.

---

## Health Check

**1. Server Liveness Check**
-   **Endpoint:** `GET /ping`
-   **Description:** Checks if the API server is running and reachable.
-   **Authentication:** None required.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "pong",
      "timestamp": "YYYY-MM-DDTHH:MM:SSZ"
    }
    ```

---

## General WebSocket API

**1. General Purpose WebSocket Connection**
-   **Endpoint:** `GET /api/v2/ws` (HTTP GET for WebSocket upgrade)
-   **Protocol:** WebSocket (wss:// preferred in production, ws:// for local development)
-   **Authentication:** Requires `Authorization: Bearer YOUR_API_KEY` header during the HTTP upgrade request.
-   **Description:** Establishes a persistent WebSocket connection for real-time, bidirectional communication between the client and server. This can be used for various purposes such as live updates, notifications, or interactive commands.
-   **Messages:**
    -   **Server-to-Client:** The server can send JSON-formatted messages to connected clients. The specific message types and payloads will depend on the events occurring in the backend (e.g., campaign progress, system alerts, data updates).
        ```json
        // Example: Campaign progress update
        {
          "event_type": "campaign_update",
          "payload": {
            "campaignId": "<uuid_string>",
            "status": "running",
            "progressPercentage": 75.5,
            "message": "Batch processed successfully."
          }
        }
        ```
    -   **Client-to-Server:** Clients can send JSON-formatted messages to the server. The server will process these based on the message `action` or `type` defined.
        ```json
        // Example: Client requesting to subscribe to specific campaign updates
        {
          "action": "subscribe_campaign_updates",
          "campaignId": "<uuid_string>"
        }
        ```
-   **Error Responses (during WebSocket handshake):** Standard HTTP errors (e.g., 401 Unauthorized if API key is missing/invalid, 403 Forbidden, 500 Internal Server Error).
-   **Connection Management:** Clients should implement reconnection logic in case of disconnections.

---

## Authentication APIs (`/api/v2/auth`)

### User Authentication

**1. User Login**
-   **Endpoint:** `POST /api/v2/auth/login`
-   **Description:** Authenticates a user and creates a secure session.
-   **Authentication:** None required.
-   **Request Body:**
    ```json
    {
      "username": "admin",
      "password": "password123"
    }
    ```
-   **Success Response (200 OK):**
    ```json
    {
      "user": {
        "id": "uuid",
        "username": "admin",
        "email": "admin@example.com",
        "role": "admin",
        "isActive": true
      },
      "message": "Login successful"
    }
    ```
    - Sets secure session cookie: `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict`
-   **Error Responses:** 400 (Bad Request), 401 (Invalid Credentials), 500.

**2. User Logout**
-   **Endpoint:** `POST /api/v2/auth/logout`
-   **Description:** Invalidates the current session and clears session cookie.
-   **Authentication:** Requires valid session.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "Logout successful"
    }
    ```

**3. Get Current User**
-   **Endpoint:** `GET /api/v2/auth/me`
-   **Description:** Returns information about the currently authenticated user.
-   **Authentication:** Requires valid session.
-   **Success Response (200 OK):**
    ```json
    {
      "user": {
        "id": "uuid",
        "username": "admin",
        "email": "admin@example.com",
        "role": "admin",
        "isActive": true,
        "createdAt": "2025-06-14T10:00:00Z",
        "lastLoginAt": "2025-06-14T12:00:00Z"
      }
    }
    ```

### User Management (Admin Only)

**4. List Users**
-   **Endpoint:** `GET /api/v2/users`
-   **Description:** Returns a paginated list of all users.
-   **Authentication:** Requires admin role.
-   **Query Parameters:**
    - `page`: Page number (default: 1)
    - `limit`: Items per page (default: 10, max: 100)
-   **Success Response (200 OK):**
    ```json
    {
      "users": [
        {
          "id": "uuid",
          "username": "user1",
          "email": "user1@example.com",
          "role": "user",
          "isActive": true,
          "createdAt": "2025-06-14T10:00:00Z"
        }
      ],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 25,
        "totalPages": 3
      }
    }
    ```

**5. Create User**
-   **Endpoint:** `POST /api/v2/users`
-   **Description:** Creates a new user account.
-   **Authentication:** Requires admin role.
-   **Request Body:**
    ```json
    {
      "username": "newuser",
      "email": "newuser@example.com",
      "password": "securepassword123",
      "role": "user",
      "isActive": true
    }
    ```
-   **Success Response (201 Created):** Returns the created user object.

**6. Update User**
-   **Endpoint:** `PUT /api/v2/users/:id`
-   **Description:** Updates an existing user.
-   **Authentication:** Requires admin role or self-update.
-   **Request Body:**
    ```json
    {
      "username": "updateduser",
      "email": "updated@example.com",
      "role": "admin",
      "isActive": false
    }
    ```

**7. Delete User**
-   **Endpoint:** `DELETE /api/v2/users/:id`
-   **Description:** Soft deletes a user (sets isActive to false).
-   **Authentication:** Requires admin role.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "User deleted successfully"
    }
    ```

---

## V1 Core APIs (`/api/v2`)

### Persona Management

Personas define configurations for DNS resolution or HTTP requests. They are stored persistently in the database.

**Base Path for DNS Personas:** `/api/v2/personas/dns`
**Base Path for HTTP Personas:** `/api/v2/personas/http`

**1. Create Persona (DNS or HTTP)**
-   **Endpoint:** 
    - `POST /personas/dns`
    - `POST /personas/http`
-   **Description:** Creates a new DNS or HTTP persona.
-   **Request Body (`api.CreatePersonaRequest`):
    ```json
    {
      "name": "My Custom DNS Persona",
      "personaType": "dns", // or "http"
      "description": "Optional description.",
      "configDetails": { // JSON object matching models.DNSConfigDetails or models.HTTPConfigDetails
        // For DNS:
        // "resolvers": ["1.1.1.1:53"], "queryTimeoutSeconds": 3, ... 
        // For HTTP:
        // "userAgent": "MyCustomAgent/1.0", "headers": {"X-Custom": "Value"}, ...
      },
      "isEnabled": true
    }
    ```
-   **Success Response (201 Created):** The created `models.Persona` object (`api.PersonaResponse` format).
-   **Error Responses:** 400 (Bad Request, Validation Error), 401 (Unauthorized), 409 (Conflict - name exists), 500.

**2. List Personas (DNS or HTTP)**
-   **Endpoint:** 
    - `GET /personas/dns`
    - `GET /personas/http`
-   **Description:** Lists all personas of the specified type.
-   **Query Parameters (Optional):
    *   `isEnabled={true|false}`: Filter by enabled status.
    *   `limit={number}`: Default 20.
    *   `offset={number}`: Default 0.
-   **Success Response (200 OK):** Array of `models.Persona` objects (`api.PersonaResponse` format).

**3. Update Persona (DNS or HTTP)**
-   **Endpoint:** 
    - `PUT /personas/dns/{personaId}`
    - `PUT /personas/http/{personaId}`
-   **Path Parameter:** `personaId` (UUID string).
-   **Request Body (`api.UpdatePersonaRequest` - fields are optional):
    ```json
    {
      "name": "Updated Persona Name",
      "description": "New description.",
      "configDetails": { /* ... updated config ... */ },
      "isEnabled": false
    }
    ```
-   **Success Response (200 OK):** The updated `models.Persona` object (`api.PersonaResponse` format).
-   **Error Responses:** 400, 401, 404 (Not Found), 500.

**4. Delete Persona (DNS or HTTP)**
-   **Endpoint:** 
    - `DELETE /personas/dns/{personaId}`
    - `DELETE /personas/http/{personaId}`
-   **Path Parameter:** `personaId` (UUID string).
-   **Success Response (204 No Content).**
-   **Error Responses:** 401, 404, 500.

### Proxy Management

Proxies are stored persistently in the database.

**Base Path:** `/api/v2/proxies`

**1. Add New Proxy**
-   **Endpoint:** `POST /`
-   **Request Body (`api.CreateProxyRequest`):
    ```json
    {
      "name": "My Residential Proxy",
      "protocol": "http", // "http", "https", "socks5", "socks4"
      "address": "proxy.example.com:8080",
      "username": "user",
      "password": "pass", // Plaintext, will be hashed by server
      "countryCode": "US",
      "isEnabled": true
    }
    ```
-   **Success Response (201 Created):** The created `models.Proxy` object.

**2. List Proxies**
-   **Endpoint:** `GET /`
-   **Query Parameters (Optional):** `protocol`, `isEnabled`, `isHealthy`, `limit`, `offset`.
-   **Success Response (200 OK):** Array of `models.Proxy` objects.

**3. Update Proxy**
-   **Endpoint:** `PUT /{proxyId}`
-   **Request Body (`api.UpdateProxyRequest` - fields optional).
-   **Success Response (200 OK):** The updated `models.Proxy` object.

**4. Delete Proxy**
-   **Endpoint:** `DELETE /{proxyId}`
-   **Success Response (204 No Content).**

**5. Get Proxy Statuses**
-   **Endpoint:** `GET /status`
-   **Description:** Retrieves current health statuses from the active `ProxyManager`.
-   **Success Response (200 OK):** Array of `proxymanager.ProxyStatus` objects.

**6. Test Proxy**
-   **Endpoint:** `POST /{proxyId}/test`
-   **Description:** Tests connectivity through a specific proxy.
-   **Success Response (200 OK):** `proxymanager.ProxyTestResult` object.

**7. Force Health Check (Single Proxy)**
-   **Endpoint:** `POST /{proxyId}/health-check`
-   **Success Response (200 OK):** Updated `proxymanager.ProxyStatus` object.

**8. Force Health Check (All/Specified Proxies)**
-   **Endpoint:** `POST /health-check`
-   **Request Body (Optional):** `{"ids": ["uuid1", "uuid2"]}` (If empty or no body, checks all managed proxies).
-   **Success Response (202 Accepted):** `{"message": "Health check process initiated..."}`.

### Keyword Set Management

Keyword Sets and their rules are stored persistently in the database.

**Base Path:** `/api/v2/keywords/sets`

**1. Create Keyword Set**
-   **Endpoint:** `POST /`
-   **Request Body (`api.CreateKeywordSetRequest`):
    ```json
    {
      "name": "Contact Info Keywords",
      "description": "Rules to find contact details.",
      "isEnabled": true,
      "rules": [
        {"pattern": "mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "ruleType": "regex", "category": "Email"},
        {"pattern": "contact us", "ruleType": "string", "isCaseSensitive": false, "category": "Contact Page"}
      ]
    }
    ```
-   **Success Response (201 Created):** `api.KeywordSetResponse` object (includes the set and its rules).

**2. List Keyword Sets**
-   **Endpoint:** `GET /`
-   **Query Parameters (Optional):** `isEnabled`, `includeRules={true|false}`, `limit`, `offset`.
-   **Success Response (200 OK):** Array of `api.KeywordSetResponse` objects.

**3. Get Keyword Set Details**
-   **Endpoint:** `GET /{setId}`
-   **Success Response (200 OK):** `api.KeywordSetResponse` object (includes rules).

**4. Update Keyword Set**
-   **Endpoint:** `PUT /{setId}`
-   **Request Body (`api.UpdateKeywordSetRequest` - fields optional). Providing `rules` will replace all existing rules for the set.
-   **Success Response (200 OK):** `api.KeywordSetResponse` object.

**5. Delete Keyword Set**
-   **Endpoint:** `DELETE /{setId}`
-   **Success Response (204 No Content).**

### Keyword Extraction Utilities

**Base Path:** `/api/v2/extract/keywords`

**1. Batch Keyword Extraction**
-   **Endpoint:** `POST /`
-   **Description:** Fetches content for multiple URLs and extracts keywords using specified (DB-backed) KeywordSetIDs and optional (DB-backed) PersonaIDs.
-   **Request Body (`api.BatchKeywordExtractionRequest`):
    ```json
    {
      "items": [
        {
          "url": "https://www.example.com/page1",
          "httpPersonaId": "<http_persona_uuid_string>", 
          "dnsPersonaId": "<dns_persona_uuid_string>",    
          "keywordSetId": "<keyword_set_uuid_string>"
        }
      ]
    }
    ```
-   **Success Response (200 OK):** `api.BatchKeywordExtractionResponse` containing an array of `api.KeywordExtractionAPIResult` objects.

**2. Streaming Keyword Extraction**
-   **Endpoint:** `GET /stream`
-   **Description:** Fetches content for a single URL and streams keyword extraction results.
-   **Query Parameters:** `url` (required), `keywordSetId` (required, UUID string), `httpPersonaId` (optional, UUID string), `dnsPersonaId` (optional, UUID string).
-   **Response (text/event-stream):** Stream of `keyword_extraction_result` events (`api.KeywordExtractionAPIResult`), then a `done` event.

### Server Configuration Management

**Base Path:** `/api/v2/config`

These endpoints manage server-wide default configurations stored in `config.json`.

**1. DNS Validator Settings**
-   **Endpoint:** `GET /dns` (Retrieve), `POST /dns` (Update)
-   **Request/Response Body:** `config.DNSValidatorConfigJSON` object.

**2. HTTP Validator Settings**
-   **Endpoint:** `GET /http` (Retrieve), `POST /http` (Update)
-   **Request/Response Body:** `config.HTTPValidatorConfigJSON` object.

**3. Logging Settings**
-   **Endpoint:** `GET /logging` (Retrieve), `POST /logging` (Update)
-   **Request/Response Body:** `config.LoggingConfig` object.

**4. Server Settings**
-   **Endpoint:** `GET /server` (Retrieve), `PUT /server` (Update)
-   **Request/Response Body for GET:** 
    ```json
    {
        "port": "8080",
        "streamChunkSize": 200,
        "ginMode": "debug"
    }
    ```
-   **Request Body for PUT (partial updates allowed):**
    ```json
    {
        "streamChunkSize": 250,
        "ginMode": "release"
    }
    ```

---

## V2 Stateful Campaign Management API

**Base Path:** `/api/v2/campaigns`

These APIs manage persistent, multi-stage campaigns processed by background workers.

**1. Create Domain Generation Campaign**
-   **Endpoint:** `POST /generate`
-   **Description:** Creates a new campaign to generate domain names based on specified patterns.
-   **Request Body (`services.CreateDomainGenerationCampaignRequest`):
    ```json
    {
      "name": "Q1 Domain Gen - Prefixes",
      "patternType": "prefix", // "prefix", "suffix", or "both"
      "variableLength": 3,
      "characterSet": "abcdefghijklmnopqrstuvwxyz0123456789",
      "constantString": "brand",
      "tld": ".com",
      "numDomainsToGenerate": 1000, // Optional: specific number of domains to generate for this campaign instance
      "userId": "user-abc"
    }
    ```
-   **Success Response (201 Created):** `models.Campaign` object (includes embedded `domainGenerationParams`).
-   **Error Responses:** 400 (Validation Error), 401, 500.

**2. Create DNS Validation Campaign**
-   **Endpoint:** `POST /dns-validate`
-   **Description:** Creates a campaign to perform DNS validation on domains from a previously completed Domain Generation campaign.
-   **Request Body (`services.CreateDNSValidationCampaignRequest`):
    ```json
    {
      "name": "DNS Check for Q1 Gen",
      "sourceGenerationCampaignId": "<uuid_of_generation_campaign>",
      "personaIds": ["<dns_persona_uuid1>", "<dns_persona_uuid2>"],
      "batchSize": 100,
      "retryAttempts": 2,
      "userId": "user-abc"
    }
    ```
-   **Success Response (201 Created):** `models.Campaign` object (includes embedded `dnsValidationParams`).
-   **Error Responses:** 400, 401, 404 (If source campaign or personas not found), 500.

**3. Create HTTP & Keyword Validation Campaign**
-   **Endpoint:** `POST /http-keyword-validate`
-   **Description:** Creates a campaign to perform HTTP validation and keyword extraction on domains from a completed DNS Validation campaign.
-   **Request Body (`services.CreateHTTPKeywordCampaignRequest`):
    ```json
    {
      "name": "HTTP & Keyword Scan for Leads",
      "sourceDnsCampaignId": "<uuid_of_dns_validation_campaign>",
      "keywordSetIds": ["<keyword_set_uuid1>"],
      "adHocKeywords": ["special offer", "request quote"],
      "personaIds": ["<http_persona_uuid1>"],
      "batchSize": 50,
      "retryAttempts": 1,
      "targetHttpPorts": [80, 443],
      "userId": "user-abc"
    }
    ```
-   **Success Response (201 Created):** `models.Campaign` object (includes embedded `httpKeywordValidationParams`).
-   **Error Responses:** 400, 401, 404 (If source campaign, personas, or keyword sets not found), 500.

**4. List Campaigns**
-   **Endpoint:** `GET /`
-   **Description:** Retrieves a list of all V2 campaigns.
-   **Query Parameters (Optional):
    *   `type={campaignType}`: Filter by `models.CampaignTypeEnum` (e.g., "domain_generation").
    *   `status={campaignStatus}`: Filter by `models.CampaignStatusEnum` (e.g., "pending", "running").
    *   `userId={string}`: Filter by user ID.
    *   `limit={number}`: Default 20.
    *   `offset={number}`: Default 0.
    *   `sortBy={field}`: e.g., `createdAt`, `name`, `status`. Default `createdAt`.
    *   `sortOrder={asc|desc}`: Default `desc`.
-   **Success Response (200 OK):** Array of `models.Campaign` objects. `X-Total-Count` header contains total number of matching campaigns.

**5. Get Campaign Details**
-   **Endpoint:** `GET /{campaignId}`
-   **Path Parameter:** `campaignId` (UUID string).
-   **Description:** Retrieves comprehensive details for a specific campaign, including its base information and type-specific parameters.
-   **Success Response (200 OK):** 
    ```json
    // Example for a Domain Generation Campaign
    {
      "id": "<campaign_uuid>",
      "name": "Q1 Domain Gen - Prefixes",
      "campaignType": "domain_generation",
      "status": "completed",
      // ... other base campaign fields ...
      "domainGenerationParams": {
        "patternType": "prefix",
        "variableLength": 3,
        "numDomainsToGenerate": 1000, // User's requested number for this campaign run (0 if "all available")
        // ... other gen params ...
      }
    }
    ```
-   **Error Responses:** 401, 404 (Not Found), 500.

**6. Get Campaign Status**
-   **Endpoint:** `GET /{campaignId}/status`
-   **Path Parameter:** `campaignId` (UUID string).
-   **Description:** Retrieves the current status and progress percentage of a campaign.
-   **Success Response (200 OK):
    ```json
    {
      "status": "running",
      "progressPercentage": 45.5
    }
    ```
-   **Error Responses:** 401, 404, 500.

**7. Start Campaign**
-   **Endpoint:** `POST /{campaignId}/start`
-   **Path Parameter:** `campaignId` (UUID string).
-   **Description:** Moves a `pending` campaign to `queued`. A background worker will pick it up for processing.
-   **Success Response (200 OK):** `{"message": "Campaign queued for start"}`.
-   **Error Responses:** 400 (e.g., campaign not in pending state), 401, 404, 500.

**8. Pause Campaign**
-   **Endpoint:** `POST /{campaignId}/pause`
-   **Path Parameter:** `campaignId` (UUID string).
-   **Description:** Requests to pause a `running` or `queued` campaign. Actual pause may take effect after the current batch finishes.
-   **Success Response (200 OK):** `{"message": "Campaign pause requested"}`.

**9. Resume Campaign**
-   **Endpoint:** `POST /{campaignId}/resume`
-   **Path Parameter:** `campaignId` (UUID string).
-   **Description:** Moves a `paused` campaign to `queued` to resume processing.
-   **Success Response (200 OK):** `{"message": "Campaign queued for resume"}`.

**10. Cancel Campaign**
-    **Endpoint:** `POST /{campaignId}/cancel`
-    **Path Parameter:** `campaignId` (UUID string).
-    **Description:** Requests to cancel a campaign. Sets status to `cancelled`. Processing will stop (current batch may complete).
-    **Success Response (200 OK):** `{"message": "Campaign cancellation requested"}`.

**11. Stream Generated Domains for Campaign (WebSocket)**
-   **Endpoint:** `GET /api/v2/campaigns/{campaignId}/stream/generated-domains` (Conceptual: HTTP GET for WebSocket upgrade)
-   **Path Parameter:** `campaignId` (UUID string of a Domain Generation campaign).
-   **Protocol:** WebSocket
-   **Description:** Streams generated domain names in real-time for an active Domain Generation campaign. This is a specific use case for WebSocket communication.
-   **Server-to-Client Messages (JSON):**
    *   `{"type": "domain", "data": "example01.com"}`
    *   `{"type": "progress", "payload": {"processed": 150, "total": 1000, "percentage": 15.0}}` (Optional)
    *   `{"type": "error", "message": "Error during generation: <details>"}`
    *   `{"type": "complete", "message": "Domain generation stream finished."}`
-   **Error Responses (during WebSocket handshake):** Standard HTTP errors (e.g., 401, 404 if campaign not found or not a Domain Generation type or not running).

**12. Get Generated Domains for Campaign (Paginated REST)**
-   **Endpoint:** `GET /{campaignId}/results/generated-domains`
-   **Path Parameter:** `campaignId` (UUID string of a Domain Generation campaign).
-   **Description:** Retrieves a paginated list of domains generated by the specified campaign.
-   **Query Parameters (Optional):
    *   `limit={number}`: Number of results per page (e.g., 100). Default: 100. Max: 1000.
    *   `cursor={int64}`: Offset index for pagination. For the first page, omit or use 0. For subsequent pages, use the `nextCursor` value from the previous response.
-   **Success Response (200 OK):** (`services.GeneratedDomainsResponse`)
    ```json
    {
      "data": [
        {
          "id": "<domain_uuid>",
          "generationCampaignId": "<campaign_uuid>",
          "domainName": "example01.com",
          "offsetIndex": 0,
          "generatedAt": "YYYY-MM-DDTHH:MM:SSZ"
        }
        // ... more domain objects
      ],
      "nextCursor": 100, // Or the next offset_index to use for pagination
      "totalCount": 5000
    }
    ```
-   **Error Responses:** 400 (Invalid campaignId or parameters), 401 (Unauthorized), 404 (Campaign not found or not a Domain Generation campaign), 500.

**13. Get DNS Validation Results for Campaign**
-   **Endpoint:** `GET /{campaignId}/results/dns-validation`
-   **Path Parameter:** `campaignId` (UUID string of a DNS Validation campaign).
-   **Description:** Retrieves a paginated list of DNS validation results for the specified campaign.
-   **Query Parameters (Optional):
    *   `limit={number}`: Number of results per page. Default: 100. Max: 1000.
    *   `cursor={string}`: Cursor for pagination (e.g., last domain name or an offset string). For the first page, omit. For subsequent pages, use `nextCursor` from the previous response.
    *   `validationStatus={string}`: Filter by validation status (e.g., "Resolved", "Error").
-   **Success Response (200 OK):** (`services.DNSValidationResultsResponse`)
    ```json
    {
      "data": [
        {
          "id": "<result_uuid>",
          "dnsCampaignId": "<campaign_uuid>",
          "generatedDomainId": "<source_domain_uuid>",
          "domainName": "example.com",
          "validationStatus": "Resolved",
          "dnsRecords": {"ips": ["1.2.3.4"]},
          "validatedByPersonaId": "<persona_uuid>",
          "attempts": 1,
          "lastCheckedAt": "YYYY-MM-DDTHH:MM:SSZ"
        }
        // ... more result objects
      ],
      "nextCursor": "some_string_cursor_value", // e.g., base64 encoded offset or last item identifier
      "totalCount": 1234
    }
    ```
-   **Error Responses:** 400, 401, 404, 500.

**14. Get HTTP & Keyword Validation Results for Campaign**
-   **Endpoint:** `GET /{campaignId}/results/http-keyword`
-   **Path Parameter:** `campaignId` (UUID string of an HTTP & Keyword Validation campaign).
-   **Description:** Retrieves a paginated list of HTTP and keyword validation results.
-   **Query Parameters (Optional):
    *   `limit={number}`: Default: 100. Max: 1000.
    *   `cursor={string}`: Cursor for pagination.
    *   `validationStatus={string}`: Filter by validation status (e.g., "lead_valid", "http_valid_no_keywords", "invalid_http_code").
    *   `hasKeywords={true|false}`: Filter by whether any keywords (from sets or ad-hoc) were found.
-   **Success Response (200 OK):** (`services.HTTPKeywordResultsResponse`)
    ```json
    {
      "data": [
        {
          "id": "<result_uuid>",
          "httpKeywordCampaignId": "<campaign_uuid>",
          "dnsResultId": "<source_dns_result_uuid>",
          "domainName": "example.com",
          "validationStatus": "lead_valid",
          "httpStatusCode": 200,
          "responseHeaders": {"Content-Type": ["text/html"]},
          "pageTitle": "Example Domain",
          "extractedContentSnippet": "This domain is for use in illustrative examples...",
          "foundKeywordsFromSets": [{"pattern": "example", "category": "Generic", "ruleType": "string", "context": "domain is for use in illustrative **example**s"}],
          "foundAdHocKeywords": ["example"],
          "contentHash": "sha256_hash_value",
          "validatedByPersonaID": "<http_persona_uuid>",
          "usedProxyID": "<proxy_uuid>",
          "attempts": 1,
          "lastCheckedAt": "YYYY-MM-DDTHH:MM:SSZ"
        }
        // ... more result objects
      ],
      "nextCursor": "another_string_cursor",
      "totalCount": 789
    }
    ```
-   **Error Responses:** 400, 401, 404, 500.

