# Frontend API Consumption Inventory

This document provides a comprehensive inventory of the frontend TypeScript assets, focusing on how the application interacts with the backend API.

## 1. API-Related Types

The frontend maintains a strict type alignment with the backend Go models. The primary sources for these types are `src/lib/types.ts`, `src/lib/schemas/`, and `src/lib/types/`.

### Key Data Models

-   **`Campaign`**: [`src/lib/types.ts:303`](src/lib/types.ts:303) - Represents a campaign, including its type, status, parameters, and results.
-   **`Persona`**: [`src/lib/types.ts:193`](src/lib/types.ts:193) - Defines a persona for DNS or HTTP requests, including configuration details.
-   **`Proxy`**: [`src/lib/types.ts:209`](src/lib/types.ts:209) - Represents a proxy server configuration.
-   **`User`**: [`src/lib/types.ts:457`](src/lib/types.ts:457) - Defines the user model, including roles and permissions.
-   **`Session`**: [`src/lib/types.ts:479`](src/lib/types.ts:479) - Represents a user session.
-   **`KeywordSet` / `KeywordRule`**: [`src/lib/types.ts:237`](src/lib/types.ts:237) - Define keyword sets and rules for HTTP validation.

### Request/Response Payloads

-   **Login**: [`LoginRequest`](src/lib/types.ts:567) / [`LoginResponse`](src/lib/types.ts:574)
-   **Campaign Creation**: [`CreateCampaignPayload`](src/lib/types.ts:749), [`UnifiedCreateCampaignRequest`](src/lib/schemas/unifiedCampaignSchema.ts:117)
-   **Persona Creation**: [`CreatePersonaPayload`](src/lib/types.ts:768)
-   **Proxy Creation**: [`CreateProxyPayload`](src/lib/types.ts:787)
-   **API Response Wrapper**: [`ApiResponse`](src/lib/types.ts:719) provides a standard structure for all API responses.

### Zod Schemas for Validation

The application uses Zod for runtime validation of form data and API responses. Key schemas are located in `src/lib/schemas/`:
-   [`campaignFormSchema.ts`](src/lib/schemas/campaignFormSchema.ts:1)
-   [`campaignSchemas.ts`](src/lib/schemas/campaignSchemas.ts:1)
-   [`unifiedCampaignSchema.ts`](src/lib/schemas/unifiedCampaignSchema.ts:1)
-   [`websocketMessageSchema.ts`](src/lib/schemas/websocketMessageSchema.ts:1)

## 2. API Service Functions

API communication is centralized in `src/lib/api/client.ts` and abstracted through various service files in `src/lib/services/`.

### API Client

-   **File**: [`src/lib/api/client.ts`](src/lib/api/client.ts:1) and [`src/lib/services/apiClient.production.ts`](src/lib/services/apiClient.production.ts:1)
-   **Method**: Uses the browser's `fetch` API.
-   **Authentication**: Relies on session-based authentication. Cookies are automatically included in requests via the `credentials: 'include'` option.

### Service Endpoints

#### Auth Service (`src/lib/services/authService.ts`)
-   **Login**: `POST /api/v2/auth/login` - Authenticates a user.
-   **Logout**: `POST /api/v2/auth/logout` - Terminates the user session.
-   **Get Current User**: `GET /api/v2/me` - Fetches the current user's data.
-   **Change Password**: `POST /api/v2/auth/change-password`
-   **User Management (Admin)**: `GET, POST, PUT, DELETE /api/v2/admin/users`

#### Campaign Service (`src/lib/services/campaignService.production.ts`)
-   **Get Campaigns**: `GET /api/v2/campaigns`
-   **Get Campaign by ID**: `GET /api/v2/campaigns/{id}`
-   **Create Campaign (Unified)**: `POST /api/v2/campaigns`
-   **Start Campaign**: `POST /api/v2/campaigns/{id}/start`
-   **Pause Campaign**: `POST /api/v2/campaigns/{id}/pause`
-   **Resume Campaign**: `POST /api/v2/campaigns/{id}/resume`
-   **Cancel Campaign**: `POST /api/v2/campaigns/{id}/cancel`
-   **Get Campaign Results**:
    -   `GET /api/v2/campaigns/{id}/results/generated-domains`
    -   `GET /api/v2/campaigns/{id}/results/dns-validation`
    -   `GET /api/v2/campaigns/{id}/results/http-keyword`

#### Persona Service (`src/lib/services/personaService.production.ts`)
-   **Get Personas**: `GET /api/v2/personas`
-   **Create HTTP Persona**: `POST /api/v2/personas/http`
-   **Update HTTP Persona**: `PUT /api/v2/personas/http/{id}`
-   **Create DNS Persona**: `POST /api/v2/personas/dns`
-   **Update DNS Persona**: `PUT /api/v2/personas/dns/{id}`
-   **Delete Persona**: `DELETE /api/v2/personas/{id}`

#### Proxy Service (`src/lib/services/proxyService.production.ts`)
-   **Get Proxies**: `GET /api/v2/proxies`
-   **Create Proxy**: `POST /api/v2/proxies`
-   **Update Proxy**: `PUT /api/v2/proxies/{id}`
-   **Delete Proxy**: `DELETE /api/v2/proxies/{id}`
-   **Test Proxy**: `POST /api/v2/proxies/{id}/test`

## 3. WebSocket Handlers

Real-time communication is handled via WebSockets.

-   **Endpoint**: The client connects to `wss://<host>/api/v2/ws`.
-   **Authentication**: Uses the same session cookie as the REST API.
-   **Core Logic**: [`src/lib/services/websocketService.simple.ts`](src/lib/services/websocketService.simple.ts:1) and [`src/lib/services/websocketService.production.ts`](src/lib/services/websocketService.production.ts:1) manage the connection, subscriptions, and message handling.
-   **React Hook**: [`useCampaignWebSocket`](src/lib/hooks/useWebSocket.ts:22) in `src/lib/hooks/useWebSocket.ts` provides a simple way for components to subscribe to campaign-specific messages.
-   **Message Schema**: Incoming messages are validated against the schema in [`src/lib/schemas/websocketMessageSchema.ts`](src/lib/schemas/websocketMessageSchema.ts:1).

### Key WebSocket Message Types
-   `subscribe_campaign`: Sent by the client to subscribe to updates for a specific campaign.
-   `unsubscribe_campaign`: Sent by the client to stop receiving updates.
-   `campaign_progress`: Received from the server with progress updates.
-   `domain_generated`: Received when a new domain is generated.
-   `dns_validation_result`: Received with the result of a DNS validation.
-   `http_validation_result`: Received with the result of an HTTP validation.
-   `campaign_complete`: Received when a campaign finishes.
-   `campaign_error`: Received when an error occurs in a campaign.

## 4. Form/UI Data Consumption

The frontend uses forms to create and manage various resources.

-   **Campaign Form**: [`src/components/campaigns/CampaignFormV2.tsx`](src/components/campaigns/CampaignFormV2.tsx:1) is the primary interface for creating campaigns.
    -   **Data Loading**: It uses the [`useCampaignFormData`](src/lib/hooks/useCampaignFormData.ts:19) hook to fetch necessary data like personas and source campaigns.
    -   **Validation**: It uses `react-hook-form` with `zodResolver` and the schema from [`src/lib/schemas/campaignFormSchema.ts`](src/lib/schemas/campaignFormSchema.ts:1) to perform client-side validation before submission. The schema includes conditional logic based on the selected campaign type.
    -   **Submission**: On submit, it constructs a `UnifiedCreateCampaignRequest` payload and sends it to the `/api/v2/campaigns` endpoint via the `createCampaignUnified` function.

-   **Other Forms**: Similar patterns are used for creating and editing Personas and Proxies, although they are simpler than the campaign form.