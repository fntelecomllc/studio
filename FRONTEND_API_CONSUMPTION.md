# Frontend API Consumption Analysis

This document provides a comprehensive analysis of the React/TypeScript frontend, detailing its API consumption patterns, data structures, and overall architecture for interacting with the backend.

## 1. API Service Abstractions

The frontend employs a modular, service-oriented architecture for API communication, primarily located in the `src/lib/services/` directory.

### 1.1. Core API Client

-   **File:** [`src/lib/api/client.ts`](src/lib/api/client.ts:1)
-   **Class:** `SessionApiClient`
-   **Description:** A singleton client that handles all HTTP requests. It is configured to use session-based authentication by automatically including cookies in every request (`credentials: 'include'`). It also features built-in retry logic with exponential backoff, request timeouts, and a standardized error handling mechanism that parses a unified error response format from the backend.

### 1.2. Authentication Service

-   **File:** [`src/lib/services/authService.ts`](src/lib/services/authService.ts:1)
-   **Class:** `AuthService`
-   **Description:** A singleton service that manages the entire authentication lifecycle. It handles user login, logout, session validation, and provides methods for role-based and permission-based access control (`hasRole`, `hasPermission`). It subscribes to its own state changes, allowing React components to react to authentication events.

### 1.3. Data Services

The application uses dedicated services for each major data entity, ensuring a clean separation of concerns.

-   **Campaign Service:**
    -   **File:** [`src/lib/services/campaignService.production.ts`](src/lib/services/campaignService.production.ts:1)
    -   **Description:** Manages all CRUD operations and lifecycle actions (start, pause, resume, cancel) for campaigns. It communicates with the backend's `/api/v2/campaigns` endpoints.
-   **Persona Service:**
    -   **File:** [`src/lib/services/personaService.ts`](src/lib/services/personaService.ts:1)
    -   **Description:** Handles CRUD operations for both `DNS` and `HTTP` personas, interacting with the `/api/v2/personas` endpoints.

## 2. TypeScript Interfaces and Types

The frontend maintains a strict type system that mirrors the backend's data models, ensuring type safety and clarity.

-   **Primary Type Definitions:**
    -   **File:** [`src/lib/types.ts`](src/lib/types.ts:1)
    -   **Description:** This file is the cornerstone of the frontend's type system. It contains a comprehensive set of `interface` and `type` definitions that are meticulously synchronized with the backend's Go structs. This includes core models like `Campaign`, `Persona`, `Proxy`, `User`, and `Session`, as well as all associated enums (`CampaignStatus`, `CampaignType`, etc.).
-   **Unified Enum Types:**
    -   **File:** [`src/lib/types/unifiedTypes.ts`](src/lib/types/unifiedTypes.ts:1)
    -   **Description:** This file defines and exports TypeScript `enum`-like constant objects for all major backend enums, along with type guards (`isValidCampaignStatus`, etc.) to ensure runtime type safety.
-   **Zod Schemas for Validation:**
    -   **Files:** [`src/lib/schemas/campaignSchemas.ts`](src/lib/schemas/campaignSchemas.ts:1), [`src/lib/schemas/commonSchemas.ts`](src/lib/schemas/commonSchemas.ts:1)
    -   **Description:** The application uses `Zod` to define runtime validation schemas for API payloads and responses. This adds a critical layer of data integrity, ensuring that data conforms to expected structures before being processed by the application.

## 3. HTTP Client Configurations

-   **File:** [`src/lib/api/client.ts`](src/lib/api/client.ts:1)
-   **Configuration Details:**
    -   **Authentication:** The client is hardcoded to use `credentials: 'include'`, which automatically sends session cookies with every request. This is the foundation of the session-based authentication mechanism.
    -   **Headers:** It automatically includes a `X-Requested-With: XMLHttpRequest` header, a common practice for identifying AJAX requests and preventing CSRF attacks in some frameworks.
    -   **Error Handling:** The client is designed to parse a `UnifiedErrorResponse` from the backend. It gracefully handles HTTP status codes `401` (Unauthorized) and `403` (Forbidden) by redirecting to the login page.
    -   **Retries & Timeouts:** It implements a retry mechanism with exponential backoff and a default request timeout of 30 seconds.

## 4. WebSocket Event Handlers

The application uses WebSockets for real-time updates, particularly for monitoring campaign progress.

-   **WebSocket Client:**
    -   **File:** [`src/lib/websocket/client.ts`](src/lib/websocket/client.ts:1)
    -   **Class:** `SessionWebSocketClient`
    -   **Description:** A robust WebSocket client that uses session cookies for authentication. It features automatic reconnection logic, a ping/pong mechanism to keep the connection alive, and a message queue to handle messages sent while disconnected.
-   **WebSocket Service:**
    -   **File:** [`src/lib/services/websocketService.production.ts`](src/lib/services/websocketService.production.ts:1)
    -   **Description:** A service layer that simplifies WebSocket interactions. It provides methods to connect to specific campaigns (`connectToCampaign`) and subscribe to their updates.
-   **React Hook:**
    -   **File:** [`src/lib/hooks/useWebSocket.ts`](src/lib/hooks/useWebSocket.ts:1)
    -   **Hook:** `useCampaignWebSocket`
    -   **Description:** A custom React hook that abstracts the complexity of managing WebSocket connections within components. It handles connecting, disconnecting, and receiving messages for a specific campaign.
-   **Message Schemas:**
    -   **File:** [`src/lib/schemas/websocketMessageSchema.ts`](src/lib/schemas/websocketMessageSchema.ts:1)
    -   **Description:** Zod schemas are used to validate the structure of incoming WebSocket messages, ensuring that real-time data is correctly formatted.

## 5. State Management Schemas

The application uses a combination of React Context and a lightweight store pattern for state management.

-   **Authentication State:**
    -   **File:** [`src/contexts/AuthContext.tsx`](src/contexts/AuthContext.tsx:1)
    -   **Description:** The `AuthProvider` component uses the `AuthContext` to provide authentication state (`isAuthenticated`, `user`, `isLoading`) and methods (`login`, `logout`, `hasPermission`) to the entire application. This is the primary mechanism for managing user sessions and access control.
-   **Auth Store:**
    -   **File:** [`src/lib/stores/auth.ts`](src/lib/stores/auth.ts:1)
    -   **Description:** The `authStore` acts as a singleton wrapper around the `authService`. It subscribes to the service's state changes and provides a simple, non-React-specific way to access authentication state.

## 6. Component Prop Types

API data is primarily passed to components via props, with types enforced by TypeScript.

-   **Example:** [`src/components/campaigns/CampaignProgressMonitor.tsx`](src/components/campaigns/CampaignProgressMonitor.tsx:1)
    -   **Props:** This component receives a `campaign` object of type `Campaign` as a prop.
    -   **Data Flow:** It uses the `useCampaignWebSocket` hook to subscribe to real-time updates for the given campaign. When new messages arrive, it updates its internal state and uses the `onCampaignUpdate` callback to propagate changes to its parent component.

## 7. Data Transformation Utilities

-   **File:** [`src/lib/utils/websocketMessageAdapter.ts`](src/lib/utils/websocketMessageAdapter.ts:1)
-   **Function:** `adaptWebSocketMessage`
-   **Description:** This utility function is a crucial adapter that transforms incoming WebSocket messages from the standardized format into a legacy format that older components might expect. This allows for a gradual migration of components to the new message schema without breaking existing functionality.