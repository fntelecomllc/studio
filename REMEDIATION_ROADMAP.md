# Remediation Roadmap

This document provides a comprehensive, multi-dimensional remediation plan to address all identified API contract mismatches and architectural inconsistencies. The backend contract, as documented in `BACKEND_API_INVENTORY.md`, is the authoritative source of truth for all remediation actions.

---

## Analysis Matrix

### Issue 1: Disconnected Frontend and Backend Validation

*   **Severity Classification:** Critical
*   **Priority Ranking:** 1
*   **Estimated Effort:** Large
*   **Dependency Mappings:** None
*   **Risk Assessment:** High. Mismatched validation rules can lead to data integrity issues if the backend is too permissive, or a poor user experience if the frontend is more permissive than the backend. There is also a high maintenance overhead from duplicating validation logic.
*   **Immediate Action Items:** Develop a script or tool to automatically generate frontend `Zod` validation schemas from the backend's Go struct tags.
*   **Specific Refactoring Instructions:**
    *   **Target Files:** All Go models with `validate` tags, primarily located in `backend/internal/models/` and `backend/internal/api/`.
        *   [`backend/internal/models/auth_models.go`](backend/internal/models/auth_models.go)
        *   [`backend/internal/models/models.go`](backend/internal/models/models.go)
        *   [`backend/internal/api/persona_handlers.go`](backend/internal/api/persona_handlers.go) (for request structs)
    *   **Code Changes:**
        1.  **Create a code generation script:** This script will parse the Go source files, read the `json` and `validate` tags for each field in the relevant structs, and generate corresponding TypeScript `Zod` schemas.
        2.  **Example Mapping:**
            *   Go: `Email string \`json:"email" binding:"required,email"\``
            *   Zod: `email: z.string().email()`
            *   Go: `Name *string \`json:"name,omitempty" validate:"omitempty,min=1,max=255"\``
            *   Zod: `name: z.string().min(1).max(255).optional()`
    *   **Migration Sequence:**
        1.  Run the generator script to create the initial set of Zod schemas.
        2.  Refactor one frontend form at a time to use the new generated schemas, removing the old manually-written ones.
        3.  Integrate the script into the CI/CD pipeline to run on any changes to the backend models.
    *   **Impact Assessment:** This is a non-breaking change if implemented correctly, as it aligns the frontend with existing backend validation.
    *   **Rollback Procedures:** Revert to the manually created Zod schemas.
    *   **Testing Requirements:** End-to-end testing for each form migrated to the new schemas to ensure validation messages work as expected.

### Issue 2: Lack of Synchronized Permission Model

*   **Severity Classification:** Critical
*   **Priority Ranking:** 1
*   **Estimated Effort:** Medium
*   **Dependency Mappings:** None
*   **Risk Assessment:** Critical. A mismatch in permission strings between the frontend and backend can lead to a broken user experience (users can't access features they should have) or, in a worst-case scenario, security gaps if the frontend incorrectly assumes a permission is granted.
*   **Immediate Action Items:** Create a new backend endpoint that exposes all available permission strings.
*   **Specific Refactoring Instructions:**
    *   **Target Files:**
        *   Backend: A new handler file, e.g., `backend/internal/api/auth_handlers.go`.
        *   Frontend: The `AuthService` or equivalent context/service responsible for managing user permissions.
    *   **Code Changes:**
        1.  **Backend:** Create a new endpoint, e.g., `GET /api/v2/auth/permissions`. This handler should collect all unique permission strings used in the `authMiddleware.RequirePermission()` calls and return them as a JSON array.
        2.  **Frontend:** On application load or after login, the `AuthService` must call this new endpoint and store the list of permissions in its state. The `hasPermission` method must be updated to check against this authoritative list.
    *   **Migration Sequence:**
        1.  Implement the backend endpoint.
        2.  Update the frontend to fetch and store the permissions.
        3.  Gradually refactor UI components to rely on the new `hasPermission` logic.
    *   **Impact Assessment:** Low impact on users during migration. This change will fix existing permission-related bugs.
    *   **Rollback Procedures:** The frontend can revert to using its hardcoded list of permissions.
    *   **Testing Requirements:** Test that a user's UI correctly reflects their permissions after logging in. Test that removing a permission from a user correctly hides the corresponding UI element.

### Issue 3: Ambiguity in Session Refresh Logic

*   **Severity Classification:** High
*   **Priority Ranking:** 2
*   **Estimated Effort:** Medium
*   **Dependency Mappings:** None
*   **Risk Assessment:** Medium. The current reactive approach can lead to a clunky user experience where an action fails and must be retried after a session refresh. This can also lead to race conditions if multiple requests fail simultaneously and trigger multiple refresh calls.
*   **Immediate Action Items:** Implement a proactive, interceptor-based session refresh strategy in the frontend API client.
*   **Specific Refactoring Instructions:**
    *   **Target Files:** The frontend's core API client (e.g., `SessionApiClient` or equivalent `axios` instance).
    *   **Code Changes:**
        1.  Implement a request interceptor.
        2.  Before a request is sent, the interceptor checks the expiration time of the current session token.
        3.  If the token is expired or close to expiring, the interceptor should:
            a.  "Lock" subsequent requests.
            b.  Make a call to the `POST /auth/refresh` endpoint.
            c.  On success, update the stored session token.
            d.  "Unlock" and retry the original request and any other queued requests with the new token.
    *   **Migration Sequence:** This change can be developed and deployed as a single unit.
    *   **Impact Assessment:** This is a non-breaking change that will improve the user experience by making session refreshes seamless.
    *   **Rollback Procedures:** Remove or disable the interceptor.
    *   **Testing Requirements:**
        1.  Manually test that API calls made near the session expiry time are automatically refreshed and succeed.
        2.  Test that concurrent API calls only trigger a single refresh request.

### Issue 4: Enum and Constant Desynchronization

*   **Severity Classification:** High
*   **Priority Ranking:** 2
*   **Estimated Effort:** Medium (for manual audit) / Large (for automation)
*   **Dependency Mappings:** None
*   **Risk Assessment:** High. If the frontend and backend enums for concepts like `CampaignStatusEnum` or `CampaignTypeEnum` are out of sync, it can lead to incorrect data being sent to the backend, or the frontend failing to display data correctly.
*   **Immediate Action Items:** Perform a manual audit of all enums and constants shared between the frontend and backend.
*   **Specific Refactoring Instructions:**
    *   **Target Files:**
        *   Backend: [`backend/internal/models/models.go`](backend/internal/models/models.go) (for `CampaignStatusEnum`, `CampaignTypeEnum`, etc.)
        *   Frontend: `src/lib/types/unifiedTypes.ts` or equivalent.
    *   **Code Changes (Long-term):**
        1.  The ideal solution is to create a script, similar to the validation schema generator, that parses the Go `const` definitions and generates corresponding TypeScript enums.
    *   **Migration Sequence (Short-term):**
        1.  Manually compare the values in the backend Go files with the frontend TypeScript files.
        2.  Correct any discrepancies. The backend is the source of truth.
    *   **Impact Assessment:** Low impact. This is a bug-fixing and stability improvement task.
    *   **Rollback Procedures:** Revert the changes to the TypeScript enum files.
    *   **Testing Requirements:** Manually verify that UI elements driven by these enums (e.g., status dropdowns, campaign type selectors) display the correct options and send the correct values to the backend.

### Issue 5: Inconsistent Error Handling

*   **Severity Classification:** Medium
*   **Priority Ranking:** 3
*   **Estimated Effort:** Medium
*   **Dependency Mappings:** None
*   **Risk Assessment:** Low. This is primarily a user experience issue. Not handling detailed validation errors means users get generic feedback instead of specific guidance on what to fix in a form.
*   **Immediate Action Items:** Update the frontend's API client to correctly parse and handle the detailed validation error format.
*   **Specific Refactoring Instructions:**
    *   **Target Files:** The frontend's core API client (`SessionApiClient`) and any components that handle form submissions.
    *   **Code Changes:**
        1.  In the `catch` block of the API client, inspect the error response from the backend.
        2.  Check for the existence of a `details` array in the response body.
        3.  If `details` exists, transform it into a more usable structure (e.g., a map of `fieldName` to `message`) and pass it up to the calling component.
        4.  Update form components to accept this detailed error structure and display the messages next to the corresponding input fields.
    *   **Migration Sequence:**
        1.  Update the central API client.
        2.  Refactor one form at a time to utilize the new detailed error messages.
    *   **Impact Assessment:** Positive impact on user experience. No breaking changes.
    *   **Rollback Procedures:** Revert the API client to its previous error handling logic.
    *   **Testing Requirements:** For each updated form, submit invalid data and verify that the correct, field-specific error messages are displayed.

### Issue 6: Unified Campaign Creation Endpoint

*   **Severity Classification:** Medium
*   **Priority Ranking:** 4
*   **Estimated Effort:** Large
*   **Dependency Mappings:** None
*   **Risk Assessment:** Medium. This is a significant refactoring of a core piece of business logic. The risk is that the new unified endpoint might not correctly handle all campaign creation cases.
*   **Immediate Action Items:** Design a new, unified `POST /api/v2/campaigns` endpoint that can handle all campaign creation types.
*   **Specific Refactoring Instructions:**
    *   **Target Files:**
        *   Backend: [`backend/internal/api/campaign_orchestrator_handlers.go`](backend/internal/api/campaign_orchestrator_handlers.go), [`backend/internal/services/campaign_orchestrator_service.go`](backend/internal/services/campaign_orchestrator_service.go).
        *   Frontend: The `CampaignService` and campaign creation forms.
    *   **Code Changes:**
        1.  **Backend:**
            a.  Deprecate the old endpoints: `/campaigns/generate`, `/campaigns/dns-validate`, `/campaigns/http-validate`.
            b.  Create a new `POST /api/v2/campaigns` endpoint.
            c.  The request body for this new endpoint should contain a `campaignType` field and a single `params` object.
            d.  The `campaignOrchestratorAPIHandler` will inspect the `campaignType` and delegate to the appropriate service method.
        2.  **Frontend:**
            a.  Update the `CampaignService` to call the new unified endpoint.
            b.  The service will be responsible for constructing the correct request body based on the user's selections in the UI.
    *   **Migration Sequence:**
        1.  Implement the new backend endpoint while keeping the old ones functional.
        2.  Update the frontend to use the new endpoint.
        3.  Once the new flow is tested and stable, remove the old backend endpoints.
    *   **Impact Assessment:** This simplifies the frontend logic significantly and makes the backend API more robust and easier to maintain.
    *   **Rollback Procedures:** The frontend can revert to calling the old, specific campaign creation endpoints.
    *   **Testing Requirements:** End-to-end testing for each campaign creation flow to ensure they all work correctly through the new unified endpoint.

### Issue 7: Consolidate Real-Time Updates

*   **Severity Classification:** Medium
*   **Priority Ranking:** 5
*   **Estimated Effort:** Large
*   **Dependency Mappings:** None
*   **Risk Assessment:** Medium. This involves changes to both the WebSocket handler and the frontend client. There is a risk of breaking existing real-time functionality for campaign progress.
*   **Immediate Action Items:** Enhance the backend WebSocket service to push proxy status updates.
*   **Specific Refactoring Instructions:**
    *   **Target Files:**
        *   Backend: [`backend/internal/websocket/websocket.go`](backend/internal/websocket/websocket.go), [`backend/internal/services/http_keyword_campaign_service.go`](backend/internal/services/http_keyword_campaign_service.go) (where health checks are initiated).
        *   Frontend: `SessionWebSocketClient` and components that display proxy status.
    *   **Code Changes:**
        1.  **Backend:**
            a.  When a proxy health check completes, the service should publish an event (e.g., on a message bus or channel).
            b.  The WebSocket handler will listen for these events and broadcast a new message type (e.g., `proxy_status_update`) to connected clients.
        2.  **Frontend:**
            a.  The `SessionWebSocketClient` should be updated to handle the new `proxy_status_update` message.
            b.  The component responsible for displaying proxy statuses should subscribe to these updates from the WebSocket client instead of polling the REST API.
    *   **Migration Sequence:**
        1.  Implement the backend changes to push proxy status updates.
        2.  Update the frontend to listen for and display these updates.
        3.  Once stable, remove the polling logic from the frontend.
    *   **Impact Assessment:** This will improve application performance by reducing network traffic and server load. It also simplifies the frontend's real-time data fetching logic.
    *   **Rollback Procedures:** The frontend can revert to polling the REST API for proxy status.
    *   **Testing Requirements:** Verify that when a proxy's health status changes, the UI updates in real-time without a page refresh.

### Issue 8: Centralized Loading State Management

*   **Severity Classification:** Medium
*   **Priority Ranking:** 6
*   **Estimated Effort:** Large
*   **Dependency Mappings:** None
*   **Risk Assessment:** Low. This is a quality-of-life and code quality improvement. The main risk is the time investment required for the refactoring.
*   **Immediate Action Items:** Choose a global state management library (e.g., Redux, Zustand, or React Context) and design a state slice for managing API request statuses.
*   **Specific Refactoring Instructions:**
    *   **Target Files:** This will involve creating new files for the state store and updating many components and services across the frontend.
    *   **Code Changes:**
        1.  Implement a global store to track the status (`idle`, `loading`, `succeeded`, `failed`) of all major API requests.
        2.  Refactor data-fetching hooks and services to dispatch actions to this store.
        3.  Create a global `LoadingIndicator` component (e.g., a top progress bar) that subscribes to the loading state from the store.
        4.  Update individual components to use the centralized loading state for disabling buttons, showing skeletons, etc., removing their local `isLoading` state variables.
    *   **Migration Sequence:** This can be done incrementally. Start with one feature (e.g., fetching campaigns), implement the centralized state management for it, and then gradually migrate other features.
    *   **Impact Assessment:** This will lead to a more consistent and predictable user experience and will reduce code duplication.
    *   **Rollback Procedures:** Revert the changes for a specific feature, re-introducing local loading state management.
    *   **Testing Requirements:** For each migrated feature, verify that loading indicators appear and disappear correctly during data fetching operations.

### Issue 9: Clarify Ambiguous Endpoint Aliasing

*   **Severity Classification:** Low
*   **Priority Ranking:** 7
*   **Estimated Effort:** Small
*   **Dependency Mappings:** None
*   **Risk Assessment:** Low. This is a documentation and code clarity issue with no direct impact on functionality.
*   **Immediate Action Items:** Investigate the purpose of the two aliased endpoints and document the findings.
*   **Specific Refactoring Instructions:**
    *   **Target Files:** [`backend/internal/api/campaign_orchestrator_handlers.go`](backend/internal/api/campaign_orchestrator_handlers.go) and the API documentation.
    *   **Code Changes:**
        1.  Add comments to the router definition in the backend code to explain why the alias exists.
        2.  If one of the endpoints is deprecated, mark it as such and update the frontend to use the preferred endpoint.
        3.  Update the `BACKEND_API_INVENTORY.md` to reflect the clarification.
    *   **Migration Sequence:** This is a single-step change.
    *   **Impact Assessment:** None.
    *   **Rollback Procedures:** Remove the comments from the code.
    *   **Testing Requirements:** None.