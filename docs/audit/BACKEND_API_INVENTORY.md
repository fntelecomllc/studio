# Backend API Inventory

This document provides a comprehensive inventory of the Go backend assets, including API endpoints, data structures, WebSocket handlers, and enums.

## Endpoints

### Public Routes

-   `GET /ping`: Pings the server.
    -   Handler: `api.PingHandlerGin`
-   `GET /health`: Health check.
-   `GET /health/ready`: Readiness probe.
-   `GET /health/live`: Liveness probe.

### Authentication Routes (`/api/v2/auth`)

-   `POST /login`: User login.
    -   Handler: `authHandler.Login`
    -   Request Body: `models.LoginRequest`
    -   Middleware: `rateLimitMiddleware.LoginRateLimit()`
-   `POST /logout`: User logout.
    -   Handler: `authHandler.Logout`
-   `POST /refresh`: Refresh user session.
    -   Handler: `authHandler.RefreshSession`

### Protected Routes (`/api/v2`)

All routes in this group are protected by `authMiddleware.SessionAuth()` and `securityMiddleware.SessionProtection()`.

#### User Routes

-   `GET /me`: Get current user information.
    -   Handler: `authHandler.Me`
-   `GET /auth/permissions`: Get all available permissions.
    -   Handler: `authHandler.GetPermissions`
-   `POST /change-password`: Change user password.
    -   Handler: `authHandler.ChangePassword`
    -   Request Body: `models.ChangePasswordRequest`

#### Persona Routes (`/personas`)

-   `POST /dns`: Create a DNS persona.
    -   Handler: `apiHandler.CreateDNSPersonaGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:create")`
-   `GET /dns`: List DNS personas.
    -   Handler: `apiHandler.ListDNSPersonasGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:read")`
-   `PUT /dns/:personaId`: Update a DNS persona.
    -   Handler: `apiHandler.UpdateDNSPersonaGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:update")`
-   `DELETE /dns/:personaId`: Delete a DNS persona.
    -   Handler: `apiHandler.DeleteDNSPersonaGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:delete")`
-   `POST /http`: Create an HTTP persona.
    -   Handler: `apiHandler.CreateHTTPPersonaGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:create")`
-   `GET /http`: List HTTP personas.
    -   Handler: `apiHandler.ListHTTPPersonasGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:read")`
-   `PUT /http/:personaId`: Update an HTTP persona.
    -   Handler: `apiHandler.UpdateHTTPPersonaGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:update")`
-   `DELETE /http/:personaId`: Delete an HTTP persona.
    -   Handler: `apiHandler.DeleteHTTPPersonaGin`
    -   Middleware: `authMiddleware.RequirePermission("personas:delete")`

#### Proxy Routes (`/proxies`)

-   `GET /`: List proxies.
    -   Handler: `apiHandler.ListProxiesGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:read")`
-   `POST /`: Add a proxy.
    -   Handler: `apiHandler.AddProxyGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:create")`
-   `GET /status`: Get proxy statuses.
    -   Handler: `apiHandler.GetProxyStatusesGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:read")`
-   `PUT /:proxyId`: Update a proxy.
    -   Handler: `apiHandler.UpdateProxyGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:update")`
-   `DELETE /:proxyId`: Delete a proxy.
    -   Handler: `apiHandler.DeleteProxyGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:delete")`
-   `POST /:proxyId/test`: Test a proxy.
    -   Handler: `apiHandler.TestProxyGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:read")`
-   `POST /:proxyId/health-check`: Force a health check on a single proxy.
    -   Handler: `apiHandler.ForceCheckSingleProxyGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:read")`
-   `POST /health-check`: Force a health check on all proxies.
    -   Handler: `apiHandler.ForceCheckAllProxiesGin`
    -   Middleware: `authMiddleware.RequirePermission("proxies:read")`

#### Configuration Routes (`/config`)

-   `GET /dns`: Get DNS configuration.
    -   Handler: `apiHandler.GetDNSConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`
-   `POST /dns`: Update DNS configuration.
    -   Handler: `apiHandler.UpdateDNSConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`
-   `GET /http`: Get HTTP configuration.
    -   Handler: `apiHandler.GetHTTPConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`
-   `POST /http`: Update HTTP configuration.
    -   Handler: `apiHandler.UpdateHTTPConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`
-   `GET /logging`: Get logging configuration.
    -   Handler: `apiHandler.GetLoggingConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`
-   `POST /logging`: Update logging configuration.
    -   Handler: `apiHandler.UpdateLoggingConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`
-   `GET /server`: Get server configuration.
    -   Handler: `apiHandler.GetServerConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`
-   `PUT /server`: Update server configuration.
    -   Handler: `apiHandler.UpdateServerConfigGin`
    -   Middleware: `authMiddleware.RequirePermission("system:config")`

#### Keyword Set Routes (`/keywords/sets`)

-   `POST /`: Create a keyword set.
    -   Handler: `apiHandler.CreateKeywordSetGin`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:create")`
-   `GET /`: List keyword sets.
    -   Handler: `apiHandler.ListKeywordSetsGin`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`
-   `GET /:setId`: Get a keyword set.
    -   Handler: `apiHandler.GetKeywordSetGin`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`
-   `PUT /:setId`: Update a keyword set.
    -   Handler: `apiHandler.UpdateKeywordSetGin`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:update")`
-   `DELETE /:setId`: Delete a keyword set.
    -   Handler: `apiHandler.DeleteKeywordSetGin`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:delete")`

#### Keyword Extraction Routes (`/extract/keywords`)

-   `POST /`: Batch extract keywords.
    -   Handler: `apiHandler.BatchExtractKeywordsGin`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`
-   `GET /stream`: Stream extract keywords.
    -   Handler: `apiHandler.StreamExtractKeywordsGin`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`

#### Campaign Routes (`/campaigns`)

-   `POST /`: Unified campaign creation.
    -   Handler: `campaignOrchestratorAPIHandler.createCampaign`
    -   Request Body: `services.CreateCampaignRequest`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:create")`
-   `POST /generate`: Create a domain generation campaign (legacy).
    -   Handler: `campaignOrchestratorAPIHandler.createDomainGenerationCampaign`
    -   Request Body: `services.CreateDomainGenerationCampaignRequest`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:create")`
-   `POST /dns-validate`: Create a DNS validation campaign (legacy).
    -   Handler: `campaignOrchestratorAPIHandler.createDNSValidationCampaign`
    -   Request Body: `services.CreateDNSValidationCampaignRequest`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:create")`
-   `POST /http-validate`: Create an HTTP keyword campaign (legacy).
    -   Handler: `campaignOrchestratorAPIHandler.createHTTPKeywordCampaign`
    -   Request Body: `services.CreateHTTPKeywordCampaignRequest`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:create")`
-   `POST /keyword-validate`: Alias for `/http-validate`.
-   `GET /`: List campaigns.
    -   Handler: `campaignOrchestratorAPIHandler.listCampaigns`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`
-   `GET /:campaignId`: Get campaign details.
    -   Handler: `campaignOrchestratorAPIHandler.getCampaignDetails`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`
-   `POST /:campaignId/start`: Start a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.startCampaign`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:execute")`
-   `POST /:campaignId/pause`: Pause a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.pauseCampaign`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:execute")`
-   `POST /:campaignId/resume`: Resume a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.resumeCampaign`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:execute")`
-   `POST /:campaignId/cancel`: Cancel a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.cancelCampaign`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:execute")`
-   `DELETE /:campaignId`: Delete a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.deleteCampaign`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:delete")`
-   `GET /:campaignId/results/generated-domains`: Get generated domains for a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.getGeneratedDomains`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`
-   `GET /:campaignId/results/dns-validation`: Get DNS validation results for a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.getDNSValidationResults`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`
-   `GET /:campaignId/results/http-keyword`: Get HTTP keyword results for a campaign.
    -   Handler: `campaignOrchestratorAPIHandler.getHTTPKeywordResults`
    -   Middleware: `authMiddleware.RequirePermission("campaigns:read")`

## Structs

### `models.LoginRequest`

| Field        | Go Type | JSON Tag         | Validation Tag        | Nullability |
|--------------|---------|------------------|-----------------------|-------------|
| Email        | `string`  | `json:"email"`     | `binding:"required,email"` | Not nullable |
| Password     | `string`  | `json:"password"`  | `binding:"required,min=12"` | Not nullable |
| RememberMe   | `bool`    | `json:"rememberMe"`|                       | Not nullable |
| CaptchaToken | `string`  | `json:"captchaToken"`|                     | Not nullable |

### `models.ChangePasswordRequest`

| Field           | Go Type | JSON Tag              | Validation Tag      | Nullability |
|-----------------|---------|-----------------------|---------------------|-------------|
| CurrentPassword | `string`  | `json:"currentPassword"`| `binding:"required"`  | Not nullable |
| NewPassword     | `string`  | `json:"newPassword"`    | `binding:"required,min=12"` | Not nullable |

### `services.CreateCampaignRequest`

| Field                  | Go Type                                | JSON Tag                         | Validation Tag | Nullability |
|------------------------|----------------------------------------|----------------------------------|----------------|-------------|
| Name                   | `string`                                 | `json:"name"`                      | `validate:"required"` | Not nullable |
| CampaignType           | `string`                                 | `json:"campaignType"`              | `validate:"required,oneof=domain_generation dns_validation http_keyword_validation"` | Not nullable |
| UserID                 | `*uuid.UUID`                           | `json:"userId,omitempty"`          |                | Nullable    |
| DomainGenerationParams | `*DomainGenerationCampaignParams`      | `json:"domainGenerationParams,omitempty"` | `validate:"omitempty"` | Nullable    |
| DnsValidationParams    | `*DNSValidationCampaignParams`         | `json:"dnsValidationParams,omitempty"`    | `validate:"omitempty"` | Nullable    |
| HttpKeywordParams      | `*HTTPKeywordCampaignParams`           | `json:"httpKeywordParams,omitempty"`      | `validate:"omitempty"` | Nullable    |

### `models.Campaign`

| Field                       | Go Type                                | JSON Tag                              | Validation Tag                 | Nullability |
|-----------------------------|----------------------------------------|---------------------------------------|--------------------------------|-------------|
| ID                          | `uuid.UUID`                            | `json:"id"`                             |                                | Not nullable |
| Name                        | `string`                                 | `json:"name"`                           | `validate:"required"`            | Not nullable |
| CampaignType                | `CampaignTypeEnum`                     | `json:"campaignType"`                   | `validate:"required"`            | Not nullable |
| Status                      | `CampaignStatusEnum`                   | `json:"status"`                         | `validate:"required"`            | Not nullable |
| UserID                      | `*uuid.UUID`                           | `json:"userId,omitempty"`               |                                | Nullable    |
| CreatedAt                   | `time.Time`                            | `json:"createdAt"`                      |                                | Not nullable |
| UpdatedAt                   | `time.Time`                            | `json:"updatedAt"`                      |                                | Not nullable |
| StartedAt                   | `*time.Time`                           | `json:"startedAt,omitempty"`            |                                | Nullable    |
| CompletedAt                 | `*time.Time`                           | `json:"completedAt,omitempty"`          |                                | Nullable    |
| ProgressPercentage          | `*float64`                             | `json:"progressPercentage,omitempty"`   | `validate:"omitempty,gte=0,lte=100"` | Nullable    |
| TotalItems                  | `*int64`                               | `json:"totalItems,omitempty"`           | `validate:"omitempty,gte=0"`     | Nullable    |
| ProcessedItems              | `*int64`                               | `json:"processedItems,omitempty"`       | `validate:"omitempty,gte=0"`     | Nullable    |
| ErrorMessage                | `*string`                              | `json:"errorMessage,omitempty"`         |                                | Nullable    |
| SuccessfulItems             | `*int64`                               | `json:"successfulItems,omitempty"`      |                                | Nullable    |
| FailedItems                 | `*int64`                               | `json:"failedItems,omitempty"`          |                                | Nullable    |
| Metadata                    | `*json.RawMessage`                     | `json:"metadata,omitempty"`             |                                | Nullable    |
| DomainGenerationParams      | `*DomainGenerationCampaignParams`      | `json:"domainGenerationParams,omitempty"` |                                | Nullable    |
| DNSValidationParams         | `*DNSValidationCampaignParams`         | `json:"dnsValidationParams,omitempty"`    |                                | Nullable    |
| HTTPKeywordValidationParams | `*HTTPKeywordCampaignParams`           | `json:"httpKeywordValidationParams,omitempty"` |                                | Nullable    |

## WebSockets

### Endpoint

-   `GET /api/v2/ws`: Establishes a WebSocket connection.
    -   Handler: `webSocketAPIHandler.HandleConnections`

### WebSocket Messages

#### `websocket.WebSocketMessage` (Server -> Client)

| Field                  | Go Type       | JSON Tag                       | Description                               |
|------------------------|---------------|--------------------------------|-------------------------------------------|
| ID                     | `string`        | `json:"id"`                      | Unique message ID                         |
| Timestamp              | `string`        | `json:"timestamp"`               | Message timestamp                         |
| Type                   | `string`        | `json:"type"`                    | Message type                              |
| SequenceNumber         | `int64`         | `json:"sequenceNumber"`          | Message sequence number                   |
| Data                   | `interface{}` | `json:"data,omitempty"`          | Generic data payload                      |
| Payload                | `interface{}` | `json:"payload,omitempty"`       | Generic payload                           |
| Message                | `string`        | `json:"message,omitempty"`       | Message content                           |
| CampaignID             | `string`        | `json:"campaignId,omitempty"`    | Campaign ID                               |
| Phase                  | `string`        | `json:"phase,omitempty"`         | Campaign phase                            |
| Status                 | `string`        | `json:"status,omitempty"`        | Status                                    |
| Progress               | `float64`       | `json:"progress,omitempty"`      | Progress percentage                       |
| ErrorMessage           | `string`        | `json:"error,omitempty"`         | Error message                             |
| ProxyID                | `string`        | `json:"proxyId,omitempty"`       | Proxy ID                                  |
| ProxyStatus            | `string`        | `json:"proxyStatus,omitempty"`   | Proxy status                              |
| PersonaID              | `string`        | `json:"personaId,omitempty"`     | Persona ID                                |
| PersonaStatus          | `string`        | `json:"personaStatus,omitempty"` | Persona status                            |
| ValidationsProcessed   | `int64`         | `json:"validationsProcessed,omitempty"` | Number of validations processed |
| DomainsGenerated       | `int64`         | `json:"domainsGenerated,omitempty"` | Number of domains generated       |
| EstimatedTimeRemaining | `string`        | `json:"estimatedTimeRemaining,omitempty"` | Estimated time remaining          |

#### `websocket.ClientMessage` (Client -> Server)

| Field              | Go Type | JSON Tag                         | Description                               |
|--------------------|---------|----------------------------------|-------------------------------------------|
| Type               | `string`  | `json:"type"`                      | Message type                              |
| CampaignID         | `string`  | `json:"campaignId,omitempty"`    | Campaign ID for subscription              |
| LastSequenceNumber | `int64`   | `json:"lastSequenceNumber,omitempty"` | Last received sequence number for resync |

## Enums

-   **`CampaignTypeEnum`**: `domain_generation`, `dns_validation`, `http_keyword_validation`
-   **`CampaignStatusEnum`**: `pending`, `queued`, `running`, `pausing`, `paused`, `completed`, `failed`, `archived`, `cancelled`
-   **`PersonaTypeEnum`**: `dns`, `http`
-   **`ProxyProtocolEnum`**: `http`, `https`, `socks5`, `socks4`
-   **`KeywordRuleTypeEnum`**: `string`, `regex`
-   **`CampaignJobStatusEnum`**: `pending`, `queued`, `running`, `processing`, `completed`, `failed`, `retry`
-   **`ValidationStatusEnum`**: `pending`, `valid`, `invalid`, `error`, `skipped`
-   **`DNSValidationStatusEnum`**: `resolved`, `unresolved`, `timeout`, `error`
-   **`HTTPValidationStatusEnum`**: `success`, `failed`, `timeout`, `error`