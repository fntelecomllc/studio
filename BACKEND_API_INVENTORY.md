# Backend API Inventory

This document provides a complete inventory of the Go backend's API contracts, data structures, and other relevant components.

## 1. HTTP REST Endpoints

All API endpoints are prefixed with `/api/v2`.

| Method | Path | Handler | Middleware | Description |
| --- | --- | --- | --- | --- |
| GET | `/ping` | `api.PingHandlerGin` | None | A public endpoint to check if the API is responsive. |
| GET | `/health` | `api.HealthCheckHandler` | None | Provides a simple health check of the application. |
| GET | `/health/ready` | `api.HealthCheckHandler` | None | Indicates if the application is ready to handle traffic. |
| GET | `/health/live` | `api.HealthCheckHandler` | None | Indicates if the application is running. |
| POST | `/auth/login` | `authHandler.Login` | `rateLimitMiddleware.LoginRateLimit()` | Authenticates a user and returns a session. |
| POST | `/auth/logout` | `authHandler.Logout` | None | Logs out a user and invalidates their session. |
| POST | `/auth/refresh` | `authHandler.RefreshSession` | None | Refreshes an existing session. |
| GET | `/me` | `authHandler.Me` | `authMiddleware.SessionAuth()` | Retrieves the current authenticated user's details. |
| POST | `/change-password` | `authHandler.ChangePassword` | `authMiddleware.SessionAuth()` | Allows the authenticated user to change their password. |
| POST | `/personas/dns` | `apiHandler.CreateDNSPersonaGin` | `authMiddleware.RequirePermission("personas:create")` | Creates a new DNS persona. |
| GET | `/personas/dns` | `apiHandler.ListDNSPersonasGin` | `authMiddleware.RequirePermission("personas:read")` | Lists all DNS personas. |
| PUT | `/personas/dns/:personaId` | `apiHandler.UpdateDNSPersonaGin` | `authMiddleware.RequirePermission("personas:update")` | Updates a specific DNS persona. |
| DELETE | `/personas/dns/:personaId` | `apiHandler.DeleteDNSPersonaGin` | `authMiddleware.RequirePermission("personas:delete")` | Deletes a specific DNS persona. |
| POST | `/personas/http` | `apiHandler.CreateHTTPPersonaGin` | `authMiddleware.RequirePermission("personas:create")` | Creates a new HTTP persona. |
| GET | `/personas/http` | `apiHandler.ListHTTPPersonasGin` | `authMiddleware.RequirePermission("personas:read")` | Lists all HTTP personas. |
| PUT | `/personas/http/:personaId` | `apiHandler.UpdateHTTPPersonaGin` | `authMiddleware.RequirePermission("personas:update")` | Updates a specific HTTP persona. |
| DELETE | `/personas/http/:personaId` | `apiHandler.DeleteHTTPPersonaGin` | `authMiddleware.RequirePermission("personas:delete")` | Deletes a specific HTTP persona. |
| GET | `/proxies` | `apiHandler.ListProxiesGin` | `authMiddleware.RequirePermission("proxies:read")` | Lists all configured proxies. |
| POST | `/proxies` | `apiHandler.AddProxyGin` | `authMiddleware.RequirePermission("proxies:create")` | Adds a new proxy. |
| GET | `/proxies/status` | `apiHandler.GetProxyStatusesGin` | `authMiddleware.RequirePermission("proxies:read")` | Gets the health status of all proxies. |
| PUT | `/proxies/:proxyId` | `apiHandler.UpdateProxyGin` | `authMiddleware.RequirePermission("proxies:update")` | Updates a specific proxy. |
| DELETE | `/proxies/:proxyId` | `apiHandler.DeleteProxyGin` | `authMiddleware.RequirePermission("proxies:delete")` | Deletes a specific proxy. |
| POST | `/proxies/:proxyId/test` | `apiHandler.TestProxyGin` | `authMiddleware.RequirePermission("proxies:read")` | Tests a specific proxy's connectivity. |
| POST | `/proxies/:proxyId/health-check` | `apiHandler.ForceCheckSingleProxyGin` | `authMiddleware.RequirePermission("proxies:read")` | Forces a health check on a single proxy. |
| POST | `/proxies/health-check` | `apiHandler.ForceCheckAllProxiesGin` | `authMiddleware.RequirePermission("proxies:read")` | Forces a health check on all proxies. |
| GET | `/config/dns` | `apiHandler.GetDNSConfigGin` | `authMiddleware.RequirePermission("system:config")` | Retrieves the DNS validator configuration. |
| POST | `/config/dns` | `apiHandler.UpdateDNSConfigGin` | `authMiddleware.RequirePermission("system:config")` | Updates the DNS validator configuration. |
| GET | `/config/http` | `apiHandler.GetHTTPConfigGin` | `authMiddleware.RequirePermission("system:config")` | Retrieves the HTTP validator configuration. |
| POST | `/config/http` | `apiHandler.UpdateHTTPConfigGin` | `authMiddleware.RequirePermission("system:config")` | Updates the HTTP validator configuration. |
| GET | `/config/logging` | `apiHandler.GetLoggingConfigGin` | `authMiddleware.RequirePermission("system:config")` | Retrieves the logging configuration. |
| POST | `/config/logging` | `apiHandler.UpdateLoggingConfigGin` | `authMiddleware.RequirePermission("system:config")` | Updates the logging configuration. |
| GET | `/config/server` | `apiHandler.GetServerConfigGin` | `authMiddleware.RequirePermission("system:config")` | Retrieves the server configuration. |
| PUT | `/config/server` | `apiHandler.UpdateServerConfigGin` | `authMiddleware.RequirePermission("system:config")` | Updates the server configuration. |
| POST | `/keywords/sets` | `apiHandler.CreateKeywordSetGin` | `authMiddleware.RequirePermission("campaigns:create")` | Creates a new keyword set. |
| GET | `/keywords/sets` | `apiHandler.ListKeywordSetsGin` | `authMiddleware.RequirePermission("campaigns:read")` | Lists all keyword sets. |
| GET | `/keywords/sets/:setId` | `apiHandler.GetKeywordSetGin` | `authMiddleware.RequirePermission("campaigns:read")` | Retrieves a specific keyword set. |
| PUT | `/keywords/sets/:setId` | `apiHandler.UpdateKeywordSetGin` | `authMiddleware.RequirePermission("campaigns:update")` | Updates a specific keyword set. |
| DELETE | `/keywords/sets/:setId` | `apiHandler.DeleteKeywordSetGin` | `authMiddleware.RequirePermission("campaigns:delete")` | Deletes a specific keyword set. |
| POST | `/extract/keywords` | `apiHandler.BatchExtractKeywordsGin` | `authMiddleware.RequirePermission("campaigns:read")` | Extracts keywords from a batch of text. |
| GET | `/extract/keywords/stream` | `apiHandler.StreamExtractKeywordsGin` | `authMiddleware.RequirePermission("campaigns:read")` | Extracts keywords from a stream of text. |
| POST | `/campaigns/generate` | `campaignOrchestratorAPIHandler.createDomainGenerationCampaign` | `authMiddleware.RequirePermission("campaigns:create")` | Creates a new domain generation campaign. |
| POST | `/campaigns/dns-validate` | `campaignOrchestratorAPIHandler.createDNSValidationCampaign` | `authMiddleware.RequirePermission("campaigns:create")` | Creates a new DNS validation campaign. |
| POST | `/campaigns/http-validate` | `campaignOrchestratorAPIHandler.createHTTPKeywordCampaign` | `authMiddleware.RequirePermission("campaigns:create")` | Creates a new HTTP keyword validation campaign. |
| POST | `/campaigns/keyword-validate` | `campaignOrchestratorAPIHandler.createHTTPKeywordCampaign` | `authMiddleware.RequirePermission("campaigns:create")` | Creates a new HTTP keyword validation campaign. |
| GET | `/campaigns` | `campaignOrchestratorAPIHandler.listCampaigns` | `authMiddleware.RequirePermission("campaigns:read")` | Lists all campaigns. |
| GET | `/campaigns/:campaignId` | `campaignOrchestratorAPIHandler.getCampaignDetails` | `authMiddleware.RequirePermission("campaigns:read")` | Retrieves the details of a specific campaign. |
| POST | `/campaigns/:campaignId/start` | `campaignOrchestratorAPIHandler.startCampaign` | `authMiddleware.RequirePermission("campaigns:execute")` | Starts a specific campaign. |
| POST | `/campaigns/:campaignId/pause` | `campaignOrchestratorAPIHandler.pauseCampaign` | `authMiddleware.RequirePermission("campaigns:execute")` | Pauses a specific campaign. |
| POST | `/campaigns/:campaignId/resume` | `campaignOrchestratorAPIHandler.resumeCampaign` | `authMiddleware.RequirePermission("campaigns:execute")` | Resumes a specific campaign. |
| POST | `/campaigns/:campaignId/cancel` | `campaignOrchestratorAPIHandler.cancelCampaign` | `authMiddleware.RequirePermission("campaigns:execute")` | Cancels a specific campaign. |
| DELETE | `/campaigns/:campaignId` | `campaignOrchestratorAPIHandler.deleteCampaign` | `authMiddleware.RequirePermission("campaigns:delete")` | Deletes a specific campaign. |
| GET | `/campaigns/:campaignId/results/generated-domains` | `campaignOrchestratorAPIHandler.getGeneratedDomains` | `authMiddleware.RequirePermission("campaigns:read")` | Retrieves the generated domains for a campaign. |
| GET | `/campaigns/:campaignId/results/dns-validation` | `campaignOrchestratorAPIHandler.getDNSValidationResults` | `authMiddleware.RequirePermission("campaigns:read")` | Retrieves the DNS validation results for a campaign. |
| GET | `/campaigns/:campaignId/results/http-keyword` | `campaignOrchestratorAPIHandler.getHTTPKeywordResults` | `authMiddleware.RequirePermission("campaigns:read")` | Retrieves the HTTP keyword results for a campaign. |

## 2. WebSocket Connections

| Path | Handler | Description |
| --- | --- | --- |
| `/api/v2/ws` | `webSocketAPIHandler.HandleConnections` | Establishes a WebSocket connection for real-time communication. |

The WebSocket connection is authenticated using the same session cookie as the REST API.

## 3. Request/Response Models

This section details the primary Go `struct` types used in the API.

### Authentication Models (`models.LoginRequest`, `models.ChangePasswordRequest`)

```go
// models.LoginRequest
type LoginRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required"`
}

// models.ChangePasswordRequest
type ChangePasswordRequest struct {
    OldPassword string `json:"oldPassword" binding:"required"`
    NewPassword string `json:"newPassword" binding:"required"`
}
```

### Persona Models (`models.Persona`, `api.CreatePersonaRequest`, `api.UpdatePersonaRequest`)

```go
// models.Persona
type Persona struct {
    ID            uuid.UUID       `db:"id" json:"id"`
    Name          string          `db:"name" json:"name" validate:"required"`
    PersonaType   PersonaTypeEnum `db:"persona_type" json:"personaType" validate:"required,oneof=dns http"`
    Description   sql.NullString  `db:"description" json:"description,omitempty"`
    ConfigDetails json.RawMessage `db:"config_details" json:"configDetails" validate:"required"`
    IsEnabled     bool            `db:"is_enabled" json:"isEnabled"`
    CreatedAt     time.Time       `db:"created_at" json:"createdAt"`
    UpdatedAt     time.Time       `db:"updated_at" json:"updatedAt"`
}

// api.CreatePersonaRequest
type CreatePersonaRequest struct {
    Name          string                 `json:"name" validate:"required,min=1,max=255"`
    PersonaType   models.PersonaTypeEnum `json:"personaType" validate:"required,oneof=dns http"`
    Description   string                 `json:"description,omitempty"`
    ConfigDetails json.RawMessage        `json:"configDetails" validate:"required"`
    IsEnabled     *bool                  `json:"isEnabled,omitempty"`
}

// api.UpdatePersonaRequest
type UpdatePersonaRequest struct {
    Name          *string         `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
    Description   *string         `json:"description,omitempty"`
    ConfigDetails json.RawMessage `json:"configDetails,omitempty"`
    IsEnabled     *bool           `json:"isEnabled,omitempty"`
}
```

### Proxy Models (`models.Proxy`, `api.CreateProxyRequest`, `api.UpdateProxyRequest`)

```go
// models.Proxy
type Proxy struct {
    ID            uuid.UUID          `db:"id" json:"id"`
    Name          string             `db:"name" json:"name" validate:"required"`
    Description   sql.NullString     `db:"description" json:"description,omitempty"`
    Address       string             `db:"address" json:"address" validate:"required"`
    Protocol      *ProxyProtocolEnum `db:"protocol" json:"protocol,omitempty"`
    Username      sql.NullString     `db:"username" json:"username,omitempty"`
    PasswordHash  sql.NullString     `db:"password_hash" json:"-"`
    Host          sql.NullString     `db:"host" json:"host,omitempty"`
    Port          sql.NullInt32      `db:"port" json:"port,omitempty"`
    IsEnabled     bool               `db:"is_enabled" json:"isEnabled"`
    IsHealthy     bool               `db:"is_healthy" json:"isHealthy"`
    LastStatus    sql.NullString     `db:"last_status" json:"lastStatus,omitempty"`
    LastCheckedAt sql.NullTime       `db:"last_checked_at" json:"lastCheckedAt,omitempty"`
    LatencyMs     sql.NullInt32      `db:"latency_ms" json:"latencyMs,omitempty"`
    City          sql.NullString     `db:"city" json:"city,omitempty"`
    CountryCode   sql.NullString     `db:"country_code" json:"countryCode,omitempty"`
    Provider      sql.NullString     `db:"provider" json:"provider,omitempty"`
    CreatedAt     time.Time          `db:"created_at" json:"createdAt"`
    UpdatedAt     time.Time          `db:"updated_at" json:"updatedAt"`
}

// api.CreateProxyRequest
type CreateProxyRequest struct {
    Name        string                   `json:"name" validate:"required,min=1,max=255"`
    Description string                   `json:"description,omitempty"`
    Protocol    models.ProxyProtocolEnum `json:"protocol" validate:"required,oneof=http https socks5 socks4"`
    Address     string                   `json:"address" validate:"required,hostname_port"`
    Username    string                   `json:"username,omitempty"`
    Password    string                   `json:"password,omitempty"`
    CountryCode string                   `json:"countryCode,omitempty"`
    IsEnabled   *bool                    `json:"isEnabled,omitempty"`
}

// api.UpdateProxyRequest
type UpdateProxyRequest struct {
    Name        *string                   `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
    Description *string                   `json:"description,omitempty"`
    Protocol    *models.ProxyProtocolEnum `json:"protocol,omitempty" validate:"omitempty,oneof=http https socks5 socks4"`
    Address     *string                   `json:"address,omitempty" validate:"omitempty,hostname_port"`
    Username    *string                   `json:"username,omitempty"`
    Password    *string                   `json:"password,omitempty"`
    CountryCode *string                   `json:"countryCode,omitempty"`
    IsEnabled   *bool                     `json:"isEnabled,omitempty"`
}
```

### KeywordSet Models (`models.KeywordSet`, `api.CreateKeywordSetRequest`, `api.UpdateKeywordSetRequest`)

```go
// models.KeywordSet
type KeywordSet struct {
    ID          uuid.UUID      `db:"id" json:"id"`
    Name        string         `db:"name" json:"name" validate:"required"`
    Description sql.NullString `db:"description" json:"description,omitempty"`
    IsEnabled   bool           `db:"is_enabled" json:"isEnabled"`
    CreatedAt   time.Time      `db:"created_at" json:"createdAt"`
    UpdatedAt   time.Time      `db:"updated_at" json:"updatedAt"`
    Rules       *[]KeywordRule `db:"rules" json:"rules,omitempty"`
}

// api.CreateKeywordSetRequest
type CreateKeywordSetRequest struct {
    Name        string               `json:"name" validate:"required,min=1,max=255"`
    Description string               `json:"description,omitempty"`
    IsEnabled   *bool                `json:"isEnabled,omitempty"`
    Rules       []KeywordRuleRequest `json:"rules,omitempty" validate:"omitempty,dive"`
}

// api.UpdateKeywordSetRequest
type UpdateKeywordSetRequest struct {
    Name        *string              `json:"name,omitempty" validate:"omitempty,min=1,max=255"`
    Description *string              `json:"description,omitempty"`
    IsEnabled   *bool                `json:"isEnabled,omitempty"`
    Rules       []KeywordRuleRequest `json:"rules,omitempty" validate:"omitempty,dive"`
}
```

### Campaign Models (`models.Campaign`, `services.CreateDomainGenerationCampaignRequest`, etc.)

```go
// models.Campaign
type Campaign struct {
    ID                          uuid.UUID                       `db:"id" json:"id"`
    Name                        string                          `db:"name" json:"name" validate:"required"`
    CampaignType                CampaignTypeEnum                `db:"campaign_type" json:"campaignType" validate:"required"`
    Status                      CampaignStatusEnum              `db:"status" json:"status" validate:"required"`
    UserID                      *uuid.UUID                      `db:"user_id" json:"userId,omitempty"`
    CreatedAt                   time.Time                       `db:"created_at" json:"createdAt"`
    UpdatedAt                   time.Time                       `db:"updated_at" json:"updatedAt"`
    StartedAt                   *time.Time                      `db:"started_at" json:"startedAt,omitempty"`
    CompletedAt                 *time.Time                      `db:"completed_at" json:"completedAt,omitempty"`
    ProgressPercentage          *float64                        `db:"progress_percentage" json:"progressPercentage,omitempty" validate:"omitempty,gte=0,lte=100"`
    TotalItems                  *int64                          `db:"total_items" json:"totalItems,omitempty" validate:"omitempty,gte=0"`
    ProcessedItems              *int64                          `db:"processed_items" json:"processedItems,omitempty" validate:"omitempty,gte=0"`
    ErrorMessage                *string                         `db:"error_message" json:"errorMessage,omitempty"`
    SuccessfulItems             *int64                          `db:"successful_items" json:"successfulItems,omitempty"`
    FailedItems                 *int64                          `db:"failed_items" json:"failedItems,omitempty"`
    Metadata                    *json.RawMessage                `db:"metadata" json:"metadata,omitempty"`
    DomainGenerationParams      *DomainGenerationCampaignParams `json:"domainGenerationParams,omitempty"`
    DNSValidationParams         *DNSValidationCampaignParams    `json:"dnsValidationParams,omitempty"`
    HTTPKeywordValidationParams *HTTPKeywordCampaignParams      `json:"httpKeywordValidationParams,omitempty"`
}
```

## 4. Authentication and Authorization

The API uses session-based authentication. After a successful login, a session cookie (`domainflow_session`) is set in the client's browser. This cookie is used to authenticate subsequent requests.

Authorization is handled through a permission-based system. The `authMiddleware.RequirePermission()` middleware is used to protect endpoints, ensuring that only users with the required permissions can access them.

## 5. Error Response Structure

The API uses a standardized error response structure:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

For validation errors, a more detailed structure is used:

```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "fieldName",
      "code": "ErrorCodeValidation",
      "message": "Validation error message"
    }
  ]
}
```

## 6. Database Entity Mappings

The Go `struct`s in the `backend/internal/models/` directory map directly to database tables. The `db` tag in each struct field corresponds to a column in the database. For example, the `models.Campaign` struct maps to the `campaigns` table.

## 7. Pagination, Filtering, and Sorting

List endpoints (e.g., `/campaigns`, `/personas/dns`) support pagination through `limit` and `offset` query parameters. Filtering is also supported via query parameters like `status`, `type`, and `isEnabled`. Sorting is not explicitly implemented in the handlers but can be added to the store layer.
`