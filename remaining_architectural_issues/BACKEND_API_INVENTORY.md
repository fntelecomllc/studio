# Backend API Inventory Report

This document provides a comprehensive inventory of the Go backend assets, including API endpoints, data structures, WebSocket communications, and enumerations.

## 1. API Definitions

### 1.1. Router

The backend uses the **Gin-gonic** router (`github.com/gin-gonic/gin`).

### 1.2. Middleware

The following middleware chains are applied:

*   **Global Middleware:**
    *   `securityMiddleware.SecurityHeaders()`: Applies basic security headers.
    *   `securityMiddleware.EnhancedCORS()`: Configures Cross-Origin Resource Sharing.
    *   `nonWSMiddleware()`: A conditional middleware that applies a request size limit of 10MB to all non-WebSocket routes.
    *   `rateLimitMiddleware.IPRateLimit(100, time.Minute)`: Limits requests to 100 per minute per IP address.

*   **Authenticated Routes (`/api/v2`) Middleware:**
    *   `authMiddleware.SessionAuth()`: Enforces session-based authentication.
    *   `securityMiddleware.SessionProtection()`: Applies additional security measures for session-based requests.

### 1.3. API Endpoints

#### Public Routes

| Method | Path                  | Handler Function        | Middleware Chain                               |
| :----- | :-------------------- | :---------------------- | :--------------------------------------------- |
| `GET`  | `/ping`               | `api.PingHandlerGin`    | Global Middleware                              |
| `GET`  | `/health`             | `healthCheckHandler.Check` | Global Middleware                              |
| `GET`  | `/health/ready`       | `healthCheckHandler.Ready` | Global Middleware                              |
| `GET`  | `/health/live`        | `healthCheckHandler.Live`  | Global Middleware                              |

#### Authentication Routes (`/api/v2/auth`)

| Method | Path         | Handler Function           | Middleware Chain                               |
| :----- | :----------- | :------------------------- | :--------------------------------------------- |
| `POST` | `/login`     | `authHandler.Login`        | Global, `rateLimitMiddleware.LoginRateLimit()` |
| `POST` | `/logout`    | `authHandler.Logout`       | Global Middleware                              |
| `POST` | `/refresh`   | `authHandler.RefreshSession` | Global Middleware                              |

#### WebSocket Route

| Method | Path         | Handler Function                | Middleware Chain                               |
| :----- | :----------- | :------------------------------ | :--------------------------------------------- |
| `GET`  | `/api/v2/ws` | `webSocketAPIHandler.HandleConnections` | `securityMiddleware`, `rateLimitMiddleware` (Request size limit is skipped) |

#### Protected Routes (`/api/v2`)

All routes in this section are protected by `authMiddleware.SessionAuth()` and `securityMiddleware.SessionProtection()`.

| Method   | Path                                      | Handler Function                             | Additional Middleware                                  |
| :------- | :---------------------------------------- | :------------------------------------------- | :----------------------------------------------------- |
| `GET`    | `/me`                                     | `authHandler.Me`                             | -                                                      |
| `GET`    | `/auth/permissions`                       | `authHandler.GetPermissions`                 | -                                                      |
| `POST`   | `/change-password`                        | `authHandler.ChangePassword`                 | -                                                      |
| `GET`    | `/admin/users`                            | `authHandler.ListUsers`                      | `authMiddleware.RequirePermission("admin:users")`      |
| `POST`   | `/admin/users`                            | `authHandler.CreateUser`                     | `authMiddleware.RequirePermission("admin:users")`      |
| `GET`    | `/admin/users/:userId`                    | `authHandler.GetUser`                        | `authMiddleware.RequirePermission("admin:users")`      |
| `PUT`    | `/admin/users/:userId`                    | `authHandler.UpdateUser`                     | `authMiddleware.RequirePermission("admin:users")`      |
| `DELETE` | `/admin/users/:userId`                    | `authHandler.DeleteUser`                     | `authMiddleware.RequirePermission("admin:users")`      |
| `GET`    | `/personas`                               | `apiHandler.ListAllPersonasGin`              | `authMiddleware.RequirePermission("personas:read")`    |
| `POST`   | `/personas`                               | `apiHandler.CreatePersonaGin`                | `authMiddleware.RequirePermission("personas:create")`  |
| `GET`    | `/personas/:id`                           | `apiHandler.GetPersonaByIDGin`               | `authMiddleware.RequirePermission("personas:read")`    |
| `PUT`    | `/personas/:id`                           | `apiHandler.UpdatePersonaGin`                | `authMiddleware.RequirePermission("personas:update")`  |
| `DELETE` | `/personas/:id`                           | `apiHandler.DeletePersonaGin`                | `authMiddleware.RequirePermission("personas:delete")`  |
| `POST`   | `/personas/:id/test`                      | `apiHandler.TestPersonaGin`                  | `authMiddleware.RequirePermission("personas:read")`    |
| `POST`   | `/personas/dns`                           | `apiHandler.CreateDNSPersonaGin`             | `authMiddleware.RequirePermission("personas:create")`  |
| `GET`    | `/personas/dns`                           | `apiHandler.ListDNSPersonasGin`              | `authMiddleware.RequirePermission("personas:read")`    |
| `PUT`    | `/personas/dns/:personaId`                | `apiHandler.UpdateDNSPersonaGin`             | `authMiddleware.RequirePermission("personas:update")`  |
| `DELETE` | `/personas/dns/:personaId`                | `apiHandler.DeleteDNSPersonaGin`             | `authMiddleware.RequirePermission("personas:delete")`  |
| `POST`   | `/personas/http`                          | `apiHandler.CreateHTTPPersonaGin`            | `authMiddleware.RequirePermission("personas:create")`  |
| `GET`    | `/personas/http`                          | `apiHandler.ListHTTPPersonasGin`             | `authMiddleware.RequirePermission("personas:read")`    |
| `PUT`    | `/personas/http/:personaId`               | `apiHandler.UpdateHTTPPersonaGin`            | `authMiddleware.RequirePermission("personas:update")`  |
| `DELETE` | `/personas/http/:personaId`               | `apiHandler.DeleteHTTPPersonaGin`            | `authMiddleware.RequirePermission("personas:delete")`  |
| `GET`    | `/proxies`                                | `apiHandler.ListProxiesGin`                  | `authMiddleware.RequirePermission("proxies:read")`     |
| `POST`   | `/proxies`                                | `apiHandler.AddProxyGin`                     | `authMiddleware.RequirePermission("proxies:create")`   |
| `GET`    | `/proxies/status`                         | `apiHandler.GetProxyStatusesGin`             | `authMiddleware.RequirePermission("proxies:read")`     |
| `PUT`    | `/proxies/:proxyId`                       | `apiHandler.UpdateProxyGin`                  | `authMiddleware.RequirePermission("proxies:update")`   |
| `DELETE` | `/proxies/:proxyId`                       | `apiHandler.DeleteProxyGin`                  | `authMiddleware.RequirePermission("proxies:delete")`   |
| `POST`   | `/proxies/:proxyId/test`                  | `apiHandler.TestProxyGin`                    | `authMiddleware.RequirePermission("proxies:read")`     |
| `POST`   | `/proxies/:proxyId/health-check`          | `apiHandler.ForceCheckSingleProxyGin`        | `authMiddleware.RequirePermission("proxies:read")`     |
| `POST`   | `/proxies/health-check`                   | `apiHandler.ForceCheckAllProxiesGin`         | `authMiddleware.RequirePermission("proxies:read")`     |
| `GET`    | `/config/dns`                             | `apiHandler.GetDNSConfigGin`                 | `authMiddleware.RequirePermission("system:config")`    |
| `POST`   | `/config/dns`                             | `apiHandler.UpdateDNSConfigGin`              | `authMiddleware.RequirePermission("system:config")`    |
| `GET`    | `/config/http`                            | `apiHandler.GetHTTPConfigGin`                | `authMiddleware.RequirePermission("system:config")`    |
| `POST`   | `/config/http`                            | `apiHandler.UpdateHTTPConfigGin`             | `authMiddleware.RequirePermission("system:config")`    |
| `GET`    | `/config/logging`                         | `apiHandler.GetLoggingConfigGin`             | `authMiddleware.RequirePermission("system:config")`    |
| `POST`   | `/config/logging`                         | `apiHandler.UpdateLoggingConfigGin`          | `authMiddleware.RequirePermission("system:config")`    |
| `GET`    | `/config/server`                          | `apiHandler.GetServerConfigGin`              | `authMiddleware.RequirePermission("system:config")`    |
| `PUT`    | `/config/server`                          | `apiHandler.UpdateServerConfigGin`           | `authMiddleware.RequirePermission("system:config")`    |
| `POST`   | `/keywords/sets`                          | `apiHandler.CreateKeywordSetGin`             | `authMiddleware.RequirePermission("campaigns:create")` |
| `GET`    | `/keywords/sets`                          | `apiHandler.ListKeywordSetsGin`              | `authMiddleware.RequirePermission("campaigns:read")`   |
| `GET`    | `/keywords/sets/:setId`                   | `apiHandler.GetKeywordSetGin`                | `authMiddleware.RequirePermission("campaigns:read")`   |
| `PUT`    | `/keywords/sets/:setId`                   | `apiHandler.UpdateKeywordSetGin`             | `authMiddleware.RequirePermission("campaigns:update")` |
| `DELETE` | `/keywords/sets/:setId`                   | `apiHandler.DeleteKeywordSetGin`             | `authMiddleware.RequirePermission("campaigns:delete")` |
| `POST`   | `/extract/keywords`                       | `apiHandler.BatchExtractKeywordsGin`         | `authMiddleware.RequirePermission("campaigns:read")`   |
| `GET`    | `/extract/keywords/stream`                | `apiHandler.StreamExtractKeywordsGin`        | `authMiddleware.RequirePermission("campaigns:read")`   |
| `GET`    | `/broadcast-test`                         | `(inline func)`                              | -                                                      |

#### Campaign Orchestration Routes (`/api/v2/campaigns`)

These routes are registered via `campaignOrchestratorAPIHandler.RegisterCampaignOrchestrationRoutes`. The specific routes are defined within that method, which is not included in the provided file excerpts.

## 2. Data Structures

### 2.1. Main Models (`backend/internal/models/models.go`)

#### `Persona`

| Field Name    | Go Type         | JSON Tag                      | Validation Tag                      | Nullability |
| :------------ | :-------------- | :---------------------------- | :---------------------------------- | :---------- |
| `ID`          | `uuid.UUID`     | `json:"id"`                   | -                                   | Not Null    |
| `Name`        | `string`        | `json:"name"`                 | `validate:"required"`               | Not Null    |
| `PersonaType` | `PersonaTypeEnum` | `json:"personaType"`          | `validate:"required,oneof=dns http"` | Not Null    |
| `Description` | `sql.NullString`  | `json:"description,omitempty"`  | -                                   | Nullable    |
| `ConfigDetails` | `json.RawMessage` | `json:"configDetails"`        | `validate:"required"`               | Not Null    |
| `IsEnabled`   | `bool`          | `json:"isEnabled"`            | -                                   | Not Null    |
| `CreatedAt`   | `time.Time`     | `json:"createdAt"`            | -                                   | Not Null    |
| `UpdatedAt`   | `time.Time`     | `json:"updatedAt"`            | -                                   | Not Null    |

#### `Proxy`

| Field Name      | Go Type             | JSON Tag                       | Validation Tag        | Nullability |
| :-------------- | :------------------ | :----------------------------- | :-------------------- | :---------- |
| `ID`            | `uuid.UUID`         | `json:"id"`                    | -                     | Not Null    |
| `Name`          | `string`            | `json:"name"`                  | `validate:"required"` | Not Null    |
| `Description`   | `sql.NullString`    | `json:"description,omitempty"` | -                     | Nullable    |
| `Address`       | `string`            | `json:"address"`               | `validate:"required"` | Not Null    |
| `Protocol`      | `*ProxyProtocolEnum`| `json:"protocol,omitempty"`    | -                     | Nullable    |
| `Username`      | `sql.NullString`    | `json:"username,omitempty"`    | -                     | Nullable    |
| `PasswordHash`  | `sql.NullString`    | `json:"-"`                     | -                     | Nullable    |
| `Host`          | `sql.NullString`    | `json:"host,omitempty"`        | -                     | Nullable    |
| `Port`          | `sql.NullInt32`     | `json:"port,omitempty"`        | -                     | Nullable    |
| `IsEnabled`     | `bool`              | `json:"isEnabled"`             | -                     | Not Null    |
| `IsHealthy`     | `bool`              | `json:"isHealthy"`             | -                     | Not Null    |
| `LastStatus`    | `sql.NullString`    | `json:"lastStatus,omitempty"`  | -                     | Nullable    |
| `LastCheckedAt` | `sql.NullTime`      | `json:"lastCheckedAt,omitempty"`| -                     | Nullable    |
| `LatencyMs`     | `sql.NullInt32`     | `json:"latencyMs,omitempty"`   | -                     | Nullable    |
| `City`          | `sql.NullString`    | `json:"city,omitempty"`        | -                     | Nullable    |
| `CountryCode`   | `sql.NullString`    | `json:"countryCode,omitempty"` | -                     | Nullable    |
| `Provider`      | `sql.NullString`    | `json:"provider,omitempty"`    | -                     | Nullable    |
| `CreatedAt`     | `time.Time`         | `json:"createdAt"`             | -                     | Not Null    |
| `UpdatedAt`     | `time.Time`         | `json:"updatedAt"`             | -                     | Not Null    |
| `InputUsername` | `sql.NullString`    | `json:"username,omitempty"`    | -                     | Nullable    |
| `InputPassword` | `sql.NullString`    | `json:"password,omitempty"`    | -                     | Nullable    |

#### `Campaign`

| Field Name                  | Go Type                         | JSON Tag                               | Validation Tag                       | Nullability |
| :-------------------------- | :------------------------------ | :------------------------------------- | :----------------------------------- | :---------- |
| `ID`                        | `uuid.UUID`                     | `json:"id"`                            | -                                    | Not Null    |
| `Name`                      | `string`                        | `json:"name"`                          | `validate:"required"`                | Not Null    |
| `CampaignType`              | `CampaignTypeEnum`              | `json:"campaignType"`                  | `validate:"required"`                | Not Null    |
| `Status`                    | `CampaignStatusEnum`            | `json:"status"`                        | `validate:"required"`                | Not Null    |
| `UserID`                    | `*uuid.UUID`                    | `json:"userId,omitempty"`              | -                                    | Nullable    |
| `CreatedAt`                 | `time.Time`                     | `json:"createdAt"`                     | -                                    | Not Null    |
| `UpdatedAt`                 | `time.Time`                     | `json:"updatedAt"`                     | -                                    | Not Null    |
| `StartedAt`                 | `*time.Time`                    | `json:"startedAt,omitempty"`           | -                                    | Nullable    |
| `CompletedAt`               | `*time.Time`                    | `json:"completedAt,omitempty"`         | -                                    | Nullable    |
| `ProgressPercentage`        | `*float64`                      | `json:"progressPercentage,omitempty"`  | `validate:"omitempty,gte=0,lte=100"` | Nullable    |
| `TotalItems`                | `*int64`                        | `json:"totalItems,omitempty"`          | `validate:"omitempty,gte=0"`         | Nullable    |
| `ProcessedItems`            | `*int64`                        | `json:"processedItems,omitempty"`      | `validate:"omitempty,gte=0"`         | Nullable    |
| `ErrorMessage`              | `*string`                       | `json:"errorMessage,omitempty"`        | -                                    | Nullable    |
| `SuccessfulItems`           | `*int64`                        | `json:"successfulItems,omitempty"`     | -                                    | Nullable    |
| `FailedItems`               | `*int64`                        | `json:"failedItems,omitempty"`         | -                                    | Nullable    |
| `Metadata`                  | `*json.RawMessage`              | `json:"metadata,omitempty"`            | -                                    | Nullable    |
| `EstimatedCompletionAt`     | `*time.Time`                    | `json:"estimatedCompletionAt,omitempty"`| -                                    | Nullable    |
| `AvgProcessingRate`         | `*float64`                      | `json:"avgProcessingRate,omitempty"`   | -                                    | Nullable    |
| `LastHeartbeatAt`           | `*time.Time`                    | `json:"lastHeartbeatAt,omitempty"`     | -                                    | Nullable    |
| `DomainGenerationParams`    | `*DomainGenerationCampaignParams` | `json:"domainGenerationParams,omitempty"` | -                                    | Nullable    |
| `DNSValidationParams`       | `*DNSValidationCampaignParams`  | `json:"dnsValidationParams,omitempty"` | -                                    | Nullable    |
| `HTTPKeywordValidationParams` | `*HTTPKeywordCampaignParams`    | `json:"httpKeywordValidationParams,omitempty"` | -                                    | Nullable    |

### 2.2. Auth Models (`backend/internal/models/auth_models.go`)

#### `User` (Public Fields)

| Field Name         | Go Type      | JSON Tag                  | Nullability |
| :----------------- | :----------- | :------------------------ | :---------- |
| `ID`               | `uuid.UUID`  | `json:"id"`               | Not Null    |
| `Email`            | `string`     | `json:"email"`            | Not Null    |
| `EmailVerified`    | `bool`       | `json:"emailVerified"`    | Not Null    |
| `FirstName`        | `string`     | `json:"firstName"`        | Not Null    |
| `LastName`         | `string`     | `json:"lastName"`         | Not Null    |
| `AvatarURL`        | `*string`    | `json:"avatarUrl"`        | Nullable    |
| `IsActive`         | `bool`       | `json:"isActive"`         | Not Null    |
| `IsLocked`         | `bool`       | `json:"isLocked"`         | Not Null    |
| `LastLoginAt`      | `*time.Time` | `json:"lastLoginAt"`      | Nullable    |
| `LastLoginIP`      | `*net.IP`    | `json:"lastLoginIp"`      | Nullable    |
| `MustChangePassword` | `bool`       | `json:"mustChangePassword"` | Not Null    |
| `MFAEnabled`       | `bool`       | `json:"mfaEnabled"`       | Not Null    |
| `MFALastUsedAt`    | `*time.Time` | `json:"mfaLastUsedAt"`    | Nullable    |
| `CreatedAt`        | `time.Time`  | `json:"createdAt"`        | Not Null    |
| `UpdatedAt`        | `time.Time`  | `json:"updatedAt"`        | Not Null    |
| `Name`             | `string`     | `json:"name,omitempty"`   | Not Null    |
| `Roles`            | `[]Role`     | `json:"roles,omitempty"`  | Nullable    |
| `Permissions`      | `[]Permission`| `json:"permissions,omitempty"`| Nullable    |

#### `LoginRequest`

| Field Name   | Go Type | JSON Tag          | Validation Tag                |
| :----------- | :------ | :---------------- | :---------------------------- |
| `Email`      | `string`  | `json:"email"`      | `binding:"required,email"`    |
| `Password`   | `string`  | `json:"password"`   | `binding:"required,min=12"`   |
| `RememberMe` | `bool`    | `json:"rememberMe"` | -                             |
| `CaptchaToken`| `string`  | `json:"captchaToken"`| -                             |

#### `LoginResponse`

| Field Name        | Go Type | JSON Tag                    |
| :---------------- | :------ | :-------------------------- |
| `Success`         | `bool`    | `json:"success"`            |
| `User`            | `*User`   | `json:"user,omitempty"`     |
| `Error`           | `string`  | `json:"error,omitempty"`    |
| `RequiresCaptcha` | `bool`    | `json:"requires_captcha,omitempty"`|
| `SessionID`       | `string`  | `json:"sessionId,omitempty"`|
| `ExpiresAt`       | `string`  | `json:"expiresAt,omitempty"`|

## 3. WebSocket Communication

### 3.1. Event Handlers

The primary WebSocket event handler is `WebSocketHandler.HandleConnections`. It performs the following actions:
1.  Validates the user's session via the `domainflow_session` cookie.
2.  Validates the request `Origin` header for CSRF protection.
3.  Performs additional security checks on the session data.
4.  Upgrades the HTTP connection to a WebSocket connection using `gorilla/websocket`.
5.  Creates a new `Client` instance with a security context and registers it with the `WebSocketManager`.

The `Client` instance then handles incoming messages in its `readPump` goroutine, processing messages like `subscribe_campaign` and `unsubscribe_campaign`.

### 3.2. Data Structures

#### `WebSocketMessage` (Server-to-Client)

This is the main struct used for messages sent from the server to the client.

| Field Name             | Go Type     | JSON Tag                         | Description                                      |
| :--------------------- | :---------- | :------------------------------- | :----------------------------------------------- |
| `ID`                   | `string`      | `json:"id"`                      | Unique message ID.                               |
| `Timestamp`            | `string`      | `json:"timestamp"`               | Message timestamp in RFC3339 format.             |
| `Type`                 | `string`      | `json:"type"`                    | Message type (e.g., `campaign_progress`).        |
| `SequenceNumber`       | `int64`       | `json:"sequenceNumber"`          | Monotonically increasing sequence number.        |
| `Data`                 | `interface{}` | `json:"data,omitempty"`          | Primary payload for structured data.             |
| `Payload`              | `interface{}` | `json:"payload,omitempty"`       | Alternative payload field.                       |
| `Message`              | `string`      | `json:"message,omitempty"`       | A human-readable message.                        |
| `CampaignID`           | `string`      | `json:"campaignId,omitempty"`    | The campaign this message relates to.            |
| `Phase`                | `string`      | `json:"phase,omitempty"`         | The current phase of the campaign.               |
| `Status`               | `string`      | `json:"status,omitempty"`        | The current status.                              |
| `Progress`             | `float64`     | `json:"progress,omitempty"`      | Progress percentage.                             |
| `ErrorMessage`         | `string`      | `json:"error,omitempty"`         | An error message, if any.                        |
| `ProxyID`              | `string`      | `json:"proxyId,omitempty"`       | Real-time update field for proxy ID.             |
| `ProxyStatus`          | `string`      | `json:"proxyStatus,omitempty"`   | Real-time update field for proxy status.         |
| `PersonaID`            | `string`      | `json:"personaId,omitempty"`     | Real-time update field for persona ID.           |
| `PersonaStatus`        | `string`      | `json:"personaStatus,omitempty"` | Real-time update field for persona status.       |
| `ValidationsProcessed` | `int64`       | `json:"validationsProcessed,omitempty"` | Real-time update field for validation count.     |
| `DomainsGenerated`     | `int64`       | `json:"domainsGenerated,omitempty"` | Real-time update field for domain generation count.|
| `EstimatedTimeRemaining`| `string`    | `json:"estimatedTimeRemaining,omitempty"` | Estimated time remaining for the task.         |

#### `ClientMessage` (Client-to-Server)

This struct is used for messages sent from the client to the server.

| Field Name         | Go Type | JSON Tag                         | Description                                      |
| :----------------- | :------ | :------------------------------- | :----------------------------------------------- |
| `Type`             | `string`  | `json:"type"`                    | Message type (e.g., `subscribe_campaign`).       |
| `CampaignID`       | `string`  | `json:"campaignId,omitempty"`    | The campaign to subscribe/unsubscribe from.      |
| `LastSequenceNumber`| `int64`   | `json:"lastSequenceNumber,omitempty"` | The last sequence number received by the client. |

## 4. Enumerations

The following enumerations are defined in `backend/internal/models/models.go`:

*   **`CampaignTypeEnum`**:
    *   `domain_generation`
    *   `dns_validation`
    *   `http_keyword_validation`
*   **`CampaignStatusEnum`**:
    *   `pending`
    *   `queued`
    *   `running`
    *   `pausing`
    *   `paused`
    *   `completed`
    *   `failed`
    *   `archived`
    *   `cancelled`
*   **`PersonaTypeEnum`**:
    *   `dns`
    *   `http`
*   **`ProxyProtocolEnum`**:
    *   `http`
    *   `https`
    *   `socks5`
    *   `socks4`
*   **`KeywordRuleTypeEnum`**:
    *   `string`
    *   `regex`
*   **`CampaignJobStatusEnum`**:
    *   `pending`
    *   `queued`
    *   `running`
    *   `processing`
    *   `completed`
    *   `failed`
    *   `retry`
*   **`ValidationStatusEnum`**:
    *   `pending`
    *   `valid`
    *   `invalid`
    *   `error`
    *   `skipped`
*   **`DNSValidationStatusEnum`**:
    *   `resolved`
    *   `unresolved`
    *   `timeout`
    *   `error`
*   **`HTTPValidationStatusEnum`**:
    *   `success`
    *   `failed`
    *   `timeout`
    *   `error`