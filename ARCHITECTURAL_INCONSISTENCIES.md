# Architectural Inconsistency Analysis: Go Backend vs. React Frontend

This document identifies and analyzes architectural inconsistencies and instances of architectural drift between the Go backend and the React/TypeScript frontend. The analysis is based on the findings documented in `BACKEND_API_INVENTORY.md`, `FRONTEND_API_CONSUMPTION.md`, and `API_CONTRACT_MISMATCHES.md`.

---

## 1. Error Handling

### 1.1. Inconsistency: Discrepancy in Error Structure Consumption

-   **Description:** The backend API documentation specifies two distinct error structures: a standard format (`{ "error": "...", "code": "..." }`) and a more detailed format for validation errors (`{ "error": "...", "details": [...] }`). The frontend's core API client (`SessionApiClient`) is documented as parsing a single "unified error response format," but it is not specified how it differentiates between these two backend structures. This ambiguity suggests that the frontend may not be fully leveraging the detailed validation feedback provided by the backend.
-   **Potential Impact:** If the frontend does not correctly parse the detailed validation error format, specific field-level error messages from the backend will not be displayed to the user. This leads to a poor user experience, as users will receive generic error messages instead of targeted feedback on which fields are incorrect.
-   **Recommendation:** The frontend's `SessionApiClient` and its consuming services should be updated to explicitly check for the presence of the `details` field in error responses. When `details` are present, the frontend should iterate over them and display the specific error messages next to the corresponding form fields.

---

## 2. Loading State Management

### 2.1. Inconsistency: Lack of a Centralized Loading State Strategy

-   **Description:** The frontend documentation mentions loading state in the context of the `AuthContext` (`isLoading`), but it does not describe a global or standardized approach for managing loading states for other data-fetching operations (e.g., fetching campaigns, personas). Individual components or services likely implement their own loading state management, leading to potential inconsistencies in how loading is visually represented across the application.
-   **Potential Impact:** Inconsistent loading state management can lead to a disjointed user experience. Some parts of the application might show a loading spinner, others might disable buttons, and some might do nothing, leaving the user confused about the application's status. This also leads to duplicated code and makes it difficult to implement global features like a top-level loading bar.
-   **Recommendation:** Implement a centralized state management solution for API request statuses (e.g., using a dedicated slice in a Redux store or a global context). This store should track the status (`idle`, `loading`, `succeeded`, `failed`) of each major API request. A global `LoadingIndicator` component can then subscribe to this store to provide consistent feedback to the user.

---

## 3. Data Fetching Strategies

### 3.1. Inconsistency: Dual Real-Time Update Mechanisms

-   **Description:** The backend provides real-time updates via two mechanisms: a WebSocket connection for campaign progress and a series of REST endpoints for forcing health checks on proxies (`/proxies/health-check`, `/proxies/:proxyId/health-check`). The frontend uses a `SessionWebSocketClient` for campaigns but likely relies on polling (repeatedly calling the REST endpoints) for proxy status updates. Using two different strategies for real-time data adds unnecessary complexity.
-   **Potential Impact:** Polling is less efficient than WebSockets, leading to increased network traffic and higher server load. It also introduces latency, as the frontend will only receive updates at a fixed interval. Architecturally, it creates two separate mental models for developers to follow when implementing real-time features.
-   **Recommendation:** Consolidate all real-time communication over the existing WebSocket connection. The backend should be enhanced to push proxy status updates through the WebSocket channel. The frontend can then subscribe to these messages, eliminating the need for polling and creating a unified, efficient data-fetching strategy for real-time events.

---

## 4. Authentication Flows

### 4.1. Inconsistency: Ambiguity in Session Refresh Logic

-   **Description:** The backend provides a `/auth/refresh` endpoint to refresh a user's session. However, the frontend's `SessionApiClient` documentation does not specify the strategy for using this endpoint. It is unclear if the client proactively refreshes the session before it expires or reactively refreshes it only after receiving a `401 Unauthorized` response.
-   **Potential Impact:** If the session is only refreshed reactively, a user performing an action at the exact moment their session expires could experience a failed request, which then needs to be retried after the refresh. This can lead to a clunky user experience. Furthermore, without a clear strategy, there is a risk of race conditions or redundant refresh requests.
-   **Recommendation:** The `SessionApiClient` should implement a proactive, interceptor-based approach. An outgoing request interceptor should check the session's expiration time. If the session is close to expiring, the interceptor should automatically trigger the refresh flow, pause the original request, and then resume it with the new session token. This process should be transparent to the user and the calling service.

---

## 5. Validation Approaches

### 5.1. Inconsistency: Disconnected Frontend and Backend Validation

-   **Description:** The frontend uses `Zod` schemas for client-side validation, while the backend uses `go-playground/validator` with struct tags. As noted in `API_CONTRACT_MISMATCHES.md`, there is no automated synchronization between these two validation systems. This creates a significant risk of drift, where validation rules enforced on the frontend do not match the rules enforced by the backend.
-   -**Potential Impact:** Mismatched validation rules can lead to several issues. If the frontend is more permissive, the API will reject valid-looking forms, frustrating the user. If the backend is more permissive, invalid data could be saved to the database, leading to data integrity issues. This also represents a duplication of effort, as validation logic is maintained in two separate places.
-   **Recommendation:** The backend should be the single source of truth for validation rules. A mechanism should be created to automatically generate the `Zod` schemas from the Go struct tags. This could be a custom script that runs as part of the build process. This would eliminate drift, reduce duplicated effort, and ensure that frontend and backend validation are always perfectly aligned.

---

## 6. Business Logic Implementation

### 6.1. Inconsistency: Potential for Logic Duplication in Campaign Creation

-   **Description:** The backend exposes three distinct endpoints for creating campaigns (`/campaigns/generate`, `/campaigns/dns-validate`, `/campaigns/http-validate`). The frontend's `CampaignService` is documented as managing all CRUD operations, but it is not specified how it abstracts these different creation endpoints. It is likely that the frontend contains business logic to decide which endpoint to call based on user input, potentially duplicating logic that should reside on the backend.
-   **Potential Impact:** Duplicating business logic on the frontend makes the system harder to maintain. If the rules for creating a campaign type change, the logic must be updated in both the backend and the frontend. This increases the risk of inconsistencies and bugs.
-   **Recommendation:** The backend should expose a single, unified `/campaigns` endpoint for creating all campaign types. The request body should contain a `campaignType` field and the corresponding parameter object (e.g., `domainGenerationParams`). The backend would then be responsible for interpreting the type and routing the request to the appropriate service logic. This simplifies the frontend's responsibility to just collecting user input and sending it to a single endpoint.

---

## 7. Feature Flag and Permission Synchronization

### 7.1. Inconsistency: Lack of a Synchronized Permission Model

-   **Description:** As highlighted in `API_CONTRACT_MISMATCHES.md`, the backend uses string-based permissions (e.g., `"campaigns:create"`) to protect its endpoints, while the frontend's `AuthService` has a `hasPermission` method. There is no shared contract or automated synchronization to ensure the permission strings used on the frontend for conditional rendering match the ones required by the backend.
-   **Potential Impact:** This is a critical security and UX issue. If the frontend uses an incorrect or outdated permission string, it might erroneously hide a feature from a user who should have access, or, more critically, show a UI element for an action the user is not authorized to perform, resulting in a failed API call and a poor user experience.
-   **Recommendation:** The backend should expose a dedicated endpoint (e.g., `/auth/permissions`) that returns the complete set of permission strings available in the system. The frontend's `AuthService` should fetch this list upon login and use it as the source of truth for all `hasPermission` checks. This ensures that the frontend's understanding of permissions is always synchronized with the backend's.