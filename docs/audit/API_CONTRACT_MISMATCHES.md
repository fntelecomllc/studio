# API Contract Mismatch Analysis

This document details the identified discrepancies, gaps, and inconsistencies across the application's backend, frontend, and database layers. Each issue includes references to the specific files and locations to facilitate remediation.

## 1. Data Contract Mismatches

This section outlines mismatches in data representation (naming, typing, nullability) for core entities across the Go backend, PostgreSQL database, and TypeScript frontend.

---
### 1.1. Entity: Campaign

The `Campaign` entity shows several inconsistencies across the stack, primarily in naming conventions and type mapping between Go, PostgreSQL, and TypeScript.

| Field Name (Conceptual) | Backend (`models.Campaign`) | Database (`campaigns`) | Frontend (`Campaign`) | Discrepancy Details |
| :--- | :--- | :--- | :--- | :--- |
| **ID** | `ID uuid.UUID` (`json:"id"`) | `id UUID` | `id: string` | **Type Mismatch**: Go's `uuid.UUID` is correctly mapped to the DB's `UUID`, but becomes a `string` in TypeScript. This is standard practice but a notable transformation. |
| **Name** | `Name string` (`json:"name"`) | `name TEXT NOT NULL` | `name: string` | **Consistent**. |
| **Campaign Type** | `CampaignType CampaignTypeEnum` (`json:"campaignType"`) | `campaign_type TEXT NOT NULL` | `campaignType: CampaignType` | **Naming Mismatch**: `CampaignType` (Go JSON) vs. `campaign_type` (DB). |
| **Status** | `Status CampaignStatusEnum` (`json:"status"`) | `status TEXT NOT NULL` | `status: CampaignStatus` | **Consistent**. |
| **User ID** | `UserID *uuid.UUID` (`json:"userId,omitempty"`) | `user_id TEXT` | `userId?: string` | **Type & Nullability Mismatch**: Go uses a nullable UUID pointer, the DB uses a nullable `TEXT`, and the frontend uses an optional `string`. The DB should ideally use `UUID` and be nullable. |
| **Created At** | `CreatedAt time.Time` (`json:"createdAt"`) | `created_at TIMESTAMPTZ NOT NULL` | `createdAt: string` | **Type Mismatch**: `time.Time` -> `TIMESTAMPTZ` -> `string`. Standard transformation. |
| **Updated At** | `UpdatedAt time.Time` (`json:"updatedAt"`) | `updated_at TIMESTAMPTZ NOT NULL` | `updatedAt: string` | **Type Mismatch**: `time.Time` -> `TIMESTAMPTZ` -> `string`. Standard transformation. |
| **Started At** | `StartedAt *time.Time` (`json:"startedAt,omitempty"`) | `started_at TIMESTAMPTZ` | `startedAt?: string` | **Type Mismatch**: `*time.Time` -> `TIMESTAMPTZ` -> `string`. Standard transformation. |
| **Completed At** | `CompletedAt *time.Time` (`json:"completedAt,omitempty"`) | `completed_at TIMESTAMPTZ` | `completedAt?: string` | **Type Mismatch**: `*time.Time` -> `TIMESTAMPTZ` -> `string`. Standard transformation. |
| **Progress** | `ProgressPercentage *float64` (`json:"progressPercentage,omitempty"`) | `progress_percentage DOUBLE PRECISION` | `progressPercentage?: number` | **Naming Mismatch**: `ProgressPercentage` (Go JSON) vs. `progress_percentage` (DB). |
| **Total Items** | `TotalItems *int64` (`json:"totalItems,omitempty"`) | `total_items BIGINT` | `totalItems?: number` | **Naming Mismatch**: `TotalItems` (Go JSON) vs. `total_items` (DB). |
| **Processed Items** | `ProcessedItems *int64` (`json:"processedItems,omitempty"`) | `processed_items BIGINT` | `processedItems?: number` | **Naming Mismatch**: `ProcessedItems` (Go JSON) vs. `processed_items` (DB). |
| **Successful Items** | `SuccessfulItems *int64` (`json:"successfulItems,omitempty"`) | `successful_items BIGINT` | `successfulItems?: number` | **Naming Mismatch**: `SuccessfulItems` (Go JSON) vs. `successful_items` (DB). |
| **Failed Items** | `FailedItems *int64` (`json:"failedItems,omitempty"`) | `failed_items BIGINT` | `failedItems?: number` | **Naming Mismatch**: `FailedItems` (Go JSON) vs. `failed_items` (DB). |
| **Error Message** | `ErrorMessage *string` (`json:"errorMessage,omitempty"`) | `error_message TEXT` | `errorMessage?: string` | **Naming Mismatch**: `ErrorMessage` (Go JSON) vs. `error_message` (DB). |
| **Metadata** | `Metadata *json.RawMessage` (`json:"metadata,omitempty"`) | `metadata JSONB` | `metadata?: Record<string, unknown>` | **Type Mismatch**: `*json.RawMessage` -> `JSONB` -> `Record<string, unknown>`. Standard transformation. |
| **Params** | `...Params` (struct pointers) | (Separate tables) | `...Params?: ...` (optional objects) | **Structural Difference**: Backend/Frontend embed params directly, while the DB correctly normalizes them into separate tables (`domain_generation_campaign_params`, etc.). This is a good design, not a flaw. |
| **Frontend-Only Fields** | N/A | N/A | `description?`, `selectedType?`, `currentPhase?`, etc. | **Gap**: The frontend `Campaign` interface ([`src/lib/types.ts:303`](src/lib/types.ts:303)) contains numerous fields for UI state management that do not exist on the backend. This is expected but should be noted. |

**Summary of Campaign Entity Issues:**

1.  **Systematic Naming Mismatch**: The backend uses `camelCase` for its JSON tags, while the database uses `snake_case` for column names. This requires constant mapping and is a source of potential errors.
2.  **Inconsistent `UserID` Type**: The `UserID` is a `*uuid.UUID` in Go, but a `TEXT` in the database. It should be a nullable `UUID` in the database to maintain type integrity and allow for proper foreign key constraints.
3.  **Frontend Interface Bloat**: The frontend `Campaign` interface is overloaded with UI-specific state fields. A better practice would be to have a core `Campaign` type that strictly matches the API response, and a separate `CampaignViewModel` or extended interface for UI-specific properties.

---
### 1.2. Entity: User

The `User` entity analysis shows a clear separation between the internal model and the public-facing data structure, which is a good security practice. However, there are still notable naming and typing inconsistencies. The backend's `PublicUser()` function ([`backend/internal/models/auth_models.go:50`](backend/internal/models/auth_models.go:50)) serves as the source of truth for the frontend contract.

| Field Name (Conceptual) | Backend (`models.User`) | Database (`auth.users`) | Frontend (`User`) | Discrepancy Details |
| :--- | :--- | :--- | :--- | :--- |
| **ID** | `ID uuid.UUID` (`json:"id"`) | `id UUID` | `id: string` | **Type Mismatch**: `uuid.UUID` -> `UUID` -> `string`. Standard transformation. |
| **Email** | `Email string` (`json:"email"`) | `email VARCHAR(255) UNIQUE NOT NULL` | `email: string` | **Consistent**. |
| **Email Verified** | `EmailVerified bool` (`json:"emailVerified"`) | `email_verified BOOLEAN` | `emailVerified: boolean` | **Naming Mismatch**: `emailVerified` (Go JSON) vs. `email_verified` (DB). |
| **Password Hash** | `PasswordHash string` (`json:"-"`) | `password_hash VARCHAR(255) NOT NULL` | N/A | **Gap (Intentional)**: Field is correctly not exposed to the frontend. |
| **First Name** | `FirstName string` (`json:"firstName"`) | `first_name VARCHAR(100) NOT NULL` | `firstName: string` | **Naming Mismatch**: `firstName` (Go JSON) vs. `first_name` (DB). |
| **Last Name** | `LastName string` (`json:"lastName"`) | `last_name VARCHAR(100) NOT NULL` | `lastName: string` | **Naming Mismatch**: `lastName` (Go JSON) vs. `last_name` (DB). |
| **Avatar URL** | `AvatarURL *string` (`json:"avatarUrl"`) | `avatar_url TEXT` | `avatarUrl?: string` | **Naming Mismatch**: `avatarUrl` (Go JSON) vs. `avatar_url` (DB). |
| **Is Active** | `IsActive bool` (`json:"isActive"`) | `is_active BOOLEAN` | `isActive: boolean` | **Naming Mismatch**: `isActive` (Go JSON) vs. `is_active` (DB). |
| **Is Locked** | `IsLocked bool` (`json:"isLocked"`) | `is_locked BOOLEAN` | `isLocked: boolean` | **Naming Mismatch**: `isLocked` (Go JSON) vs. `is_locked` (DB). |
| **Last Login At** | `LastLoginAt *time.Time` (`json:"lastLoginAt"`) | `last_login_at TIMESTAMP` | `lastLoginAt?: string` | **Naming Mismatch**: `lastLoginAt` (Go JSON) vs. `last_login_at` (DB). |
| **Last Login IP** | `LastLoginIP *string` (`json:"lastLoginIp"`) | `last_login_ip INET` | `lastLoginIp?: string` | **Naming & Type Mismatch**: `lastLoginIp` (Go JSON) vs. `last_login_ip` (DB). Go `*string` vs DB `INET`. |
| **Must Change Pwd** | `MustChangePassword bool` (`json:"mustChangePassword"`) | `must_change_password BOOLEAN` | `mustChangePassword: boolean` | **Naming Mismatch**: `mustChangePassword` (Go JSON) vs. `must_change_password` (DB). |
| **MFA Enabled** | `MFAEnabled bool` (`json:"mfaEnabled"`) | `mfa_enabled BOOLEAN` (Missing from schema) | `mfaEnabled: boolean` | **DB Gap & Naming Mismatch**: `mfaEnabled` (Go JSON) vs. `mfa_enabled` (DB). The `mfa_enabled` column is missing from the `auth.users` table in [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md:15). |
| **Roles / Permissions** | `Roles []Role`, `Permissions []Permission` | (Separate tables) | `roles: Role[]`, `permissions: Permission[]` | **Structural Difference**: Backend/Frontend embed these as computed fields, while the DB correctly uses junction tables (`auth.user_roles`, `auth.role_permissions`). This is good design. |
| **Full Name** | `Name string` (Computed) | N/A | `name?: string` | **Gap**: The full name is computed on the backend and sent to the frontend, but does not exist as a column in the database. |

**Summary of User Entity Issues:**

1.  **Systematic Naming Mismatch**: As with `Campaign`, there is a consistent `camelCase` vs. `snake_case` mismatch between the Go JSON tags and the database columns.
2.  **Missing `mfa_enabled` Column**: The Go struct ([`backend/internal/models/auth_models.go:31`](backend/internal/models/auth_models.go:31)) and the frontend type ([`src/lib/types.ts:470`](src/lib/types.ts:470)) both include `mfaEnabled`, but the corresponding `mfa_enabled` column is absent from the `auth.users` table definition in [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md:15). This is a critical data persistence gap.
3.  **Type Inconsistency for `LastLoginIP`**: The backend uses a `*string` for `LastLoginIP`, while the database more appropriately uses the `INET` type. This could lead to data validation issues if the backend ever tries to save an invalid IP address string.

---
### 1.3. Entity: Persona

The `Persona` entity is used to configure DNS and HTTP clients. The analysis reveals inconsistencies in nullability and the representation of its complex `config_details` field.

| Field Name (Conceptual) | Backend (`models.Persona`) | Database (`personas`) | Frontend (`Persona`) | Discrepancy Details |
| :--- | :--- | :--- | :--- | :--- |
| **ID** | `ID uuid.UUID` (`json:"id"`) | `id UUID` | `id: string` | **Type Mismatch**: `uuid.UUID` -> `UUID` -> `string`. Standard transformation. |
| **Name** | `Name string` (`json:"name"`) | `name TEXT NOT NULL` | `name: string` | **Consistent**. |
| **Persona Type** | `PersonaType PersonaTypeEnum` (`json:"personaType"`) | `persona_type TEXT NOT NULL` | `personaType: PersonaType` | **Naming Mismatch**: `personaType` (Go JSON) vs. `persona_type` (DB). |
| **Description** | `Description sql.NullString` (`json:"description,omitempty"`) | `description TEXT` | `description?: string` | **Nullability Mismatch**: Go uses `sql.NullString`, the DB uses a nullable `TEXT`, and the frontend uses an optional `string`. This is a consistent and correct handling of a nullable field. |
| **Config Details** | `ConfigDetails json.RawMessage` (`json:"configDetails"`) | `config_details JSONB NOT NULL` | `configDetails: DNSConfigDetails | HTTPConfigDetails` | **Type Mismatch & Naming**: `json.RawMessage` -> `JSONB` -> TypeScript union type. This is a standard transformation for flexible JSON data. The DB column name `config_details` mismatches the Go JSON tag `configDetails`. |
| **Is Enabled** | `IsEnabled bool` (`json:"isEnabled"`) | `is_enabled BOOLEAN NOT NULL` | `isEnabled: boolean` | **Naming Mismatch**: `isEnabled` (Go JSON) vs. `is_enabled` (DB). |
| **Frontend-Only Fields** | N/A | N/A | `status: string`, `lastTested?: string`, `lastError?: string`, `tags?: string[]` | **Gap**: The frontend `Persona` interface ([`src/lib/types.ts:193`](src/lib/types.ts:193)) includes several status and metadata fields that are not present in the backend model. These are likely computed or managed purely on the client-side. |

**Summary of Persona Entity Issues:**

1.  **Systematic Naming Mismatch**: The consistent `camelCase` (Go JSON) vs. `snake_case` (DB) naming issue persists.
2.  **Frontend-Only Status Fields**: The frontend model contains several fields (`status`, `lastTested`, `lastError`) that are not part of the backend `Persona` struct. This suggests that either the frontend is managing this state itself, or it's receiving this data from a different API endpoint that joins `Persona` data with real-time status information. This is a potential **Feature Gap** to investigate in Phase 2.

---
### 1.4. Entity: Proxy

The `Proxy` entity analysis reveals a significant discrepancy in how credentials are handled, as well as the recurring naming and nullability mismatches.

| Field Name (Conceptual) | Backend (`models.Proxy`) | Database (`proxies`) | Frontend (`Proxy`) | Discrepancy Details |
| :--- | :--- | :--- | :--- | :--- |
| **ID** | `ID uuid.UUID` (`json:"id"`) | `id UUID` | `id: string` | **Type Mismatch**: `uuid.UUID` -> `UUID` -> `string`. Standard transformation. |
| **Name** | `Name string` (`json:"name"`) | `name TEXT NOT NULL UNIQUE` | `name: string` | **Consistent**. |
| **Address** | `Address string` (`json:"address"`) | `address TEXT NOT NULL UNIQUE` | `address: string` | **Consistent**. |
| **Protocol** | `Protocol *ProxyProtocolEnum` (`json:"protocol,omitempty"`) | `protocol TEXT` | `protocol?: ProxyProtocol` | **Consistent** handling of an optional enum. |
| **Username** | `Username sql.NullString` (`json:"username,omitempty"`) | `username TEXT` | `username?: string` | **Nullability Mismatch**: Go uses `sql.NullString`, the DB uses a nullable `TEXT`, and the frontend uses an optional `string`. This is consistent handling. |
| **Password** | `PasswordHash sql.NullString` (`json:"-"`) | `password_hash TEXT` | N/A | **Gap (Intentional)**: The password hash is correctly stored in the DB and not exposed to the frontend. |
| **Is Healthy** | `IsHealthy bool` (`json:"isHealthy"`) | `is_healthy BOOLEAN NOT NULL` | `isHealthy: boolean` | **Naming Mismatch**: `isHealthy` (Go JSON) vs. `is_healthy` (DB). |
| **Last Checked At** | `LastCheckedAt sql.NullTime` (`json:"lastCheckedAt,omitempty"`) | `last_checked_at TIMESTAMPTZ` | `lastCheckedAt?: string` | **Naming Mismatch**: `lastCheckedAt` (Go JSON) vs. `last_checked_at` (DB). |
| **Country Code** | `CountryCode sql.NullString` (`json:"countryCode,omitempty"`) | `country_code TEXT` | `countryCode?: string` | **Naming Mismatch**: `countryCode` (Go JSON) vs. `country_code` (DB). |
| **Input Password** | `InputPassword sql.NullString` (`json:"password,omitempty"`) | N/A | `password?: string` (in `CreateProxyPayload`) | **Gap**: The Go model has a separate `InputPassword` field for API input, which is then hashed into `PasswordHash`. The frontend `CreateProxyPayload` ([`src/lib/types.ts:787`](src/lib/types.ts:787)) also has a `password` field. This separation is a good security practice. |

**Summary of Proxy Entity Issues:**

1.  **Systematic Naming Mismatch**: The `camelCase` vs. `snake_case` issue is present across multiple fields.
2.  **Clear Credential Handling**: The separation of `InputPassword` (from the API) and `PasswordHash` (for the DB) is a well-implemented security pattern. The frontend payload aligns with this by providing a `password` field on creation.

---
## 2. Feature & Logic Gaps

This section identifies discrepancies between backend capabilities and frontend implementation, including unused endpoints, missing features, and divergent validation logic.

---
### 2.1. Backend-Implemented, Frontend-Missing

The following API endpoints are defined in the backend but are not referenced in the frontend's API service consumption documentation. This may indicate dead code, features that were planned but never implemented, or features accessible only via other means (e.g., CLI tools).

*   **`POST /api/v2/auth/refresh`**:
    *   **Description**: The backend provides an endpoint to refresh user sessions ([`BACKEND_API_INVENTORY.md:24`](BACKEND_API_INVENTORY.md:24)).
    *   **Gap**: The frontend's `authService` ([`FRONTEND_API_CONSUMPTION.md:46`](FRONTEND_API_CONSUMPTION.md:46)) does not list or implement a function to call this endpoint. The frontend appears to rely solely on the initial session duration.

*   **`GET /api/v2/auth/permissions`**:
    *   **Description**: An endpoint exists to fetch all available system permissions ([`BACKEND_API_INVENTORY.md:35`](BACKEND_API_INVENTORY.md:35)).
    *   **Gap**: This endpoint is not consumed by the frontend. The frontend likely relies on the permissions being embedded within the `User` object returned after login.

*   **Proxy Health Check Endpoints**:
    *   **Description**: The backend provides multiple endpoints for forcing proxy health checks: `POST /proxies/:proxyId/health-check` and `POST /proxies/health-check` ([`BACKEND_API_INVENTORY.md:87-92`](BACKEND_API_INVENTORY.md:87)).
    *   **Gap**: The frontend's `proxyService` ([`FRONTEND_API_CONSUMPTION.md:74`](FRONTEND_API_CONSUMPTION.md:74)) does not implement calls to these endpoints. It only implements list, create, update, delete, and test.

*   **Legacy Campaign Creation Endpoints**:
    *   **Description**: The backend still contains legacy, type-specific campaign creation endpoints like `POST /campaigns/generate`, `POST /campaigns/dns-validate`, and `POST /campaigns/http-validate` ([`BACKEND_API_INVENTORY.md:154-166`](BACKEND_API_INVENTORY.md:154)).
    *   **Gap**: The frontend has correctly migrated to using the unified `POST /api/v2/campaigns` endpoint ([`FRONTEND_API_CONSUMPTION.md:56`](FRONTEND_API_CONSUMPTION.md:56)). These legacy backend routes appear to be unused and could be deprecated.

*   **Keyword Extraction Endpoints**:
    *   **Description**: The backend has endpoints for keyword extraction: `POST /extract/keywords` and `GET /extract/keywords/stream` ([`BACKEND_API_INVENTORY.md:139-146`](BACKEND_API_INVENTORY.md:139)).
    *   **Gap**: These do not appear to be used by the main frontend application, suggesting they might be for a separate tool or a feature that is not fully integrated.

### 2.2. Frontend-Anticipated, Backend-Missing

The following API calls are referenced in the frontend's consumption documentation but do not have corresponding endpoints defined in the backend inventory. This could indicate incorrect frontend code, reliance on undocumented endpoints, or a misconfiguration in the backend router.

*   **`GET /api/v2/personas`**:
    *   **Description**: The frontend's `personaService` attempts to fetch all personas from a generic `/api/v2/personas` endpoint ([`FRONTEND_API_CONSUMPTION.md:67`](FRONTEND_API_CONSUMPTION.md:67)).
    *   **Gap**: The backend inventory does not list a generic `GET /personas` endpoint. Instead, it provides type-specific listing endpoints: `GET /personas/dns` and `GET /personas/http` ([`BACKEND_API_INVENTORY.md:45-59`](BACKEND_API_INVENTORY.md:45)). The frontend must make two separate calls to list all personas.

*   **`DELETE /api/v2/personas/{id}`**:
    *   **Description**: The frontend `personaService` attempts to delete a persona using a generic `DELETE /api/v2/personas/{id}` call ([`FRONTEND_API_CONSUMPTION.md:72`](FRONTEND_API_CONSUMPTION.md:72)).
    *   **Gap**: Similar to listing, the backend requires type-specific deletion endpoints: `DELETE /personas/dns/:personaId` and `DELETE /personas/http/:personaId` ([`BACKEND_API_INVENTORY.md:51-65`](BACKEND_API_INVENTORY.md:51)). The frontend would need to know the persona's type before making a deletion call.

*   **User Management Endpoints**:
    *   **Description**: The frontend's `authService` documentation mentions admin endpoints for user management: `GET, POST, PUT, DELETE /api/v2/admin/users` ([`FRONTEND_API_CONSUMPTION.md:51`](FRONTEND_API_CONSUMPTION.md:51)).
    *   **Gap**: These endpoints are entirely missing from the `BACKEND_API_INVENTORY.md` file. This is a major gap, suggesting either the backend inventory is incomplete or the frontend is calling non-existent endpoints for a critical feature.

---
## 3. Security & Error Handling Mismatches

This section analyzes inconsistencies in security mechanisms, authentication flows, and error handling between the backend and frontend.

---
### 3.1. WebSocket Message Discrepancy

There is a notable mismatch between the generic structure of the server-sent WebSocket messages and the more specific message types the frontend expects.

*   **Backend Message Structure**: The backend sends a generic `websocket.WebSocketMessage` ([`BACKEND_API_INVENTORY.md:260`](BACKEND_API_INVENTORY.md:260)) which contains a large number of optional fields (`CampaignID`, `Phase`, `Status`, `Progress`, `ErrorMessage`, etc.). The actual event type is determined by the `Type` field within this message.

*   **Frontend Message Handling**: The frontend documentation lists several specific, distinct message types it expects to handle, such as `campaign_progress`, `domain_generated`, and `campaign_complete` ([`FRONTEND_API_CONSUMPTION.md:91`](FRONTEND_API_CONSUMPTION.md:91)).

*   **Gap**: The frontend's `websocketMessageSchema.ts` ([`src/lib/schemas/websocketMessageSchema.ts:1`](src/lib/schemas/websocketMessageSchema.ts:1)) must contain complex logic to parse the generic backend message and transform it into the specific types the application uses. This creates a tight coupling and a potential point of failure. If the backend adds a new message `Type`, the frontend's parsing logic must be updated, even if the new type is not relevant to that client. A more robust pattern would be for the backend to send messages with a consistent wrapper but a clearly typed, distinct `payload` for each message type.

### 3.2. Authentication Flow

*   **Session Refresh**: As noted in the Feature Gaps section, the frontend does not utilize the backend's session refresh endpoint (`POST /api/v2/auth/refresh`). This could lead to users being logged out unexpectedly if their session expires while the application is open, creating a poor user experience.

### 3.3. Error Handling

*   **API Response Wrapper**: The frontend defines a standard `ApiResponse` wrapper ([`src/lib/types.ts:719`](src/lib/types.ts:719)) that includes a structured `errors` array. The backend inventory does not specify a corresponding standard error response structure. While the `LoginResponse` ([`BACKEND_API_INVENTORY.md:176`](BACKEND_API_INVENTORY.md:176)) includes an `error` string, it's not a system-wide, structured format. This lack of a standardized error contract can make frontend error handling brittle and inconsistent.