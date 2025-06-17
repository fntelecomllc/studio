# API Synchronization and Refactoring Workflow

This document outlines the workflow for resolving the API and WebSocket synchronization issues identified in `API_SYNC_ISSUES.md`. The work will be divided into four phases: Pre-flight Checks, Implementation, Validation, and a Rollback Plan.

## Phase 0: Pre-flight Checks

Before any code is modified, the following safety measures must be taken.

### Task 0.1: Backup Database

1.  **Objective:** Ensure the production database can be restored in case of a critical failure.
2.  **Action:** Create a complete backup of the production database.

### Task 0.2: Create a New Version Control Branch

1.  **Objective:** Isolate the changes in a new branch to facilitate easy review and rollback.
2.  **Action:** Create a new feature branch from the `main` or `develop` branch.

## Phase 1: Implementation (`code` mode)

The `code` mode will be responsible for the following tasks:

### Task 1.1: Unify Data Models

1.  **Objective:** Create a single source of truth for all data models shared between the frontend and backend.
2.  **Action:**
    *   Modify the `src/lib/types.ts` file to perfectly align with the backend Go structs in `backend/internal/models/`.
    *   Remove all legacy, compatibility, and mapping-related fields from the frontend types.
    *   Update the `campaignService.production.ts` file to use the new, unified types, removing the need for the `mapTo...Request` functions.

### Task 1.2: Refactor WebSocket Service

1.  **Objective:** Consolidate the WebSocket service implementation and validate its authentication.
2.  **Action:**
    *   Move the contents of `src/lib/services/websocketService.simple.ts` to `src/lib/services/websocketService.production.ts`.
    *   Delete the `src/lib/services/websocketService.simple.ts` file.
    *   Update the `WebSocketMessage` interface in the new `websocketService.production.ts` to match the backend's definition.
    *   **Explicitly test that the WebSocket connection fails without a valid session cookie and succeeds with one.**

### Task 1.3: Deprecate Unused API Endpoints

1.  **Objective:** Reduce the API surface area by removing unused endpoints.
2.  **Action:**
    *   In `backend/cmd/apiserver/main.go` and `backend/internal/api/campaign_orchestrator_handlers.go`, comment out or remove the routes and handlers for:
        *   `GET /api/v2/campaigns/:campaignId/status`
        *   `PUT /api/v2/campaigns/:campaignId`
    *   Add a comment indicating that these endpoints have been deprecated due to lack of use.

## Phase 2: Validation (`debug` mode)

The `debug` mode will be responsible for thoroughly testing the changes made by the `code` mode.

### Task 2.1: Backend Validation

1.  **Objective:** Ensure the backend is stable and all tests pass after the changes.
2.  **Action:**
    *   Run all backend unit and integration tests.
    *   Run database migrations. **Note:** While no schema changes are expected from this refactoring, this step ensures that the migration process is still functional and that the database connection is healthy.
    *   Manually test the API endpoints using a tool like `curl` or Postman to confirm they behave as expected.

### Task 2.2: Frontend Validation

1.  **Objective:** Ensure the frontend application is fully functional after the data model and service refactoring.
2.  **Action:**
    *   Run all frontend unit and end-to-end tests.
    *   Manually test all application features related to campaigns and real-time updates to ensure they work correctly.
    *   Pay close attention to the campaign creation and progress monitoring features.

### Task 2.3: Final Report

1.  **Objective:** Produce a final report summarizing the validation results.
2.  **Action:**
    *   Create a new document named `VALIDATION_REPORT.md`.
    *   This report should detail the results of all tests, including any new issues that were discovered.
    *   The report should conclude with a confirmation that all identified API synchronization issues have been resolved.

## Phase 3: Rollback Plan

If the validation phase reveals critical issues that cannot be easily fixed, the following steps should be taken to revert the changes.

1.  **Revert Code:** Discard all changes in the feature branch and revert to the original state.
2.  **Restore Database:** If any data was corrupted during testing, restore the database from the backup created in Phase 0.