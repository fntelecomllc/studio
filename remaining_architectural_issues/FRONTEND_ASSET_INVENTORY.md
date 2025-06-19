# Frontend Asset Inventory Report

This report provides a comprehensive inventory of the frontend assets, including data types, API service functions, WebSocket usage, and UI data consumption.

## 1. Data Types Inventory

This section details the TypeScript `interface` and `type` definitions used for API communication and state management.

### 1.1. Core Application Types (`src/lib/types.ts`)

This file contains the primary type definitions that are synchronized with the backend Go structs.

**Enums:**

*   `CampaignType`: "domain_generation" | "dns_validation" | "http_keyword_validation"
*   `CampaignStatus`: "pending" | "queued" | "running" | "pausing" | "paused" | "completed" | "failed" | "archived" | "cancelled"
*   `PersonaType`: "dns" | "http"
*   `ProxyProtocol`: "http" | "https" | "socks5" | "socks4"
*   `KeywordRuleType`: "string" | "regex"
*   `ValidationStatus`: "pending" | "valid" | "invalid" | "error" | "skipped"

**Interfaces:**

*   `Campaign`: Core campaign model.
*   `CampaignViewModel`: Extended campaign model for UI purposes.
*   `Persona`: Represents a DNS or HTTP persona.
*   `Proxy`: Represents a proxy server.
*   `KeywordSet`: A collection of keyword rules.
*   `User`: Represents an application user.
*   `Session`: Represents a user session.
*   `ApiResponse<T>`: A generic type for API responses.

### 1.2. Cross-Stack Synchronization Types (`src/lib/types/cross-stack-sync.ts`)

This file ensures perfect alignment between the database schema, backend Go structs, and frontend TypeScript types. It contains synced interfaces for all major database tables, including `SessionSecurity`, `UserSecurity`, `RoleSecurity`, `PermissionSecurity`, `CampaignSynced`, `PersonaSynced`, and `ProxySynced`.

### 1.3. Unified Types (`src/lib/types/unifiedTypes.ts`)

This file provides unified enum definitions and type guards for runtime validation, ensuring consistency across the application.

### 1.4. Schema Definitions (`src/lib/schemas/`)

The `src/lib/schemas/` directory contains Zod schemas for form validation and data structure enforcement.

*   **`campaignFormSchema.ts`**: Defines the schema for the campaign creation and editing form, including complex validation logic with `superRefine`.
*   **`campaignSchemas.ts`**: Contains a comprehensive set of Zod schemas for all campaign-related data structures, including request payloads and API responses.
*   **`commonSchemas.ts`**: Provides common schemas used throughout the application, such as `uuidSchema` and `timestampSchema`.
*   **`unifiedCampaignSchema.ts`**: Defines a unified schema for creating campaigns, which maps to the backend's `CreateCampaignRequest` struct.
*   **`websocketMessageSchema.ts`**: Defines the schema for WebSocket messages, ensuring real-time data synchronization.
*   **`generated/validationSchemas.ts`**: Contains Zod schemas auto-generated from the backend Go validation tags, ensuring frontend validation rules match the backend.

## 2. API Service Functions Catalog

This section catalogs the API service functions, their endpoints, request/response types, and the libraries used. All API communication is handled by the `ProductionApiClient` in `src/lib/services/apiClient.production.ts`, which uses the native `fetch` API.

### 2.1. `authService.ts`

*   **`login(credentials)`**:
    *   **Endpoint**: `POST /api/v2/auth/login`
    *   **Request Type**: `LoginCredentials`
    *   **Response Type**: `LoginResponse`
*   **`logout()`**:
    *   **Endpoint**: `POST /api/v2/auth/logout`
*   **`updatePassword(request)`**:
    *   **Endpoint**: `POST /api/v2/auth/change-password`
    *   **Request Type**: `ChangePasswordRequest`
*   **`getUsers()`**:
    *   **Endpoint**: `GET /api/v2/admin/users`
    *   **Response Type**: `UserListResponse`

### 2.2. `campaignService.production.ts`

*   **`getCampaigns(filters)`**:
    *   **Endpoint**: `GET /api/v2/campaigns`
    *   **Response Type**: `CampaignsListResponse`
*   **`getCampaignById(campaignId)`**:
    *   **Endpoint**: `GET /api/v2/campaigns/{campaignId}`
    *   **Response Type**: `CampaignDetailResponse`
*   **`createCampaignUnified(payload)`**:
    *   **Endpoint**: `POST /api/v2/campaigns`
    *   **Request Type**: `UnifiedCreateCampaignRequest`
    *   **Response Type**: `CampaignCreationResponse`
*   **`startCampaign(campaignId)`**:
    *   **Endpoint**: `POST /api/v2/campaigns/{campaignId}/start`
    *   **Response Type**: `CampaignOperationResponse`
*   **`pauseCampaign(campaignId)`**:
    *   **Endpoint**: `POST /api/v2/campaigns/{campaignId}/pause`
    *   **Response Type**: `CampaignOperationResponse`

### 2.3. `personaService.production.ts`

*   **`getPersonas(filters)`**:
    *   **Endpoint**: `GET /api/v2/personas`
    *   **Response Type**: `Persona[]`
*   **`createHttpPersona(payload)`**:
    *   **Endpoint**: `POST /api/v2/personas/http`
    *   **Request Type**: `CreateHttpPersonaPayload`
    *   **Response Type**: `HttpPersona`
*   **`createDnsPersona(payload)`**:
    *   **Endpoint**: `POST /api/v2/personas/dns`
    *   **Request Type**: `CreateDnsPersonaPayload`
    *   **Response Type**: `DnsPersona`

### 2.4. `proxyService.production.ts`

*   **`getProxies()`**:
    *   **Endpoint**: `GET /api/v2/proxies`
    *   **Response Type**: `ProxiesListResponse`
*   **`createProxy(payload)`**:
    *   **Endpoint**: `POST /api/v2/proxies`
    *   **Request Type**: `CreateProxyPayload`
    *   **Response Type**: `ProxyCreationResponse`

## 3. WebSocket Usage Documentation

WebSocket connections are managed by `src/lib/services/websocketService.production.ts`.

*   **Connection Handler**: The `SimpleWebSocketService` class handles WebSocket connections, subscriptions, and message routing.
*   **`useWebSocket` Hook**: The `useWebSocket` hook in `src/lib/hooks/useWebSocket.ts` provides a simple interface for components to subscribe to WebSocket messages.
*   **Message Types**: WebSocket messages are defined in `src/lib/schemas/websocketMessageSchema.ts`. The `websocketMessageSchema` Zod schema validates incoming messages. Key message types include:
    *   `campaign_progress`
    *   `domain_generated`
    *   `dns_validation_result`
    *   `http_validation_result`
    *   `campaign_complete`
    *   `campaign_error`

## 4. UI Data Consumption Analysis

### 4.1. `src/components/campaigns/CampaignFormV2.tsx`

This component is the primary interface for creating and editing campaigns.

*   **Data Consumption**: It consumes `HttpPersona`, `DnsPersona`, and `CampaignViewModel` types to populate form selects and fields.
*   **Data Creation**: It uses the `createCampaignUnified` service function to create new campaigns, constructing a `UnifiedCreateCampaignRequest` payload.
*   **Client-Side Validation**: It uses `zodResolver` with the `campaignFormSchema` from `src/lib/schemas/campaignFormSchema.ts` to perform comprehensive client-side validation before submitting the form. The schema includes conditional validation logic based on the selected campaign type.

### 4.2. `src/lib/hooks/useCampaignFormData.ts`

This hook is responsible for fetching the data required by the campaign form.

*   **Data Fetching**: It uses the `getPersonas` and `getCampaigns` service functions to fetch persona and campaign data.
*   **Data Transformation**: It uses `transformCampaignsToViewModels` to convert the raw campaign data into the `CampaignViewModel` format required by the UI.