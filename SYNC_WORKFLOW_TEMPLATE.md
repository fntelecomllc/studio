# Workflow Template: Synchronizing Frontend, Backend, and Database

This document outlines a structured workflow for identifying and resolving inconsistencies between the frontend, backend, and database layers of the application.

**Objective:** To ensure data models are consistent across the entire stack, preventing bugs, and improving maintainability.

**Modes:**
*   **Architect:** For high-level analysis, planning, and documentation.
*   **Code:** For implementing code-level changes and running analysis tools.
*   **Debug:** For investigating runtime errors and validating fixes.

---

### **Phase 1: Discovery & Analysis (Architect Mode)**

**Goal:** Identify all potential points of data model mismatch.

*   **Subtask 1.1: Map Data Models**
    *   **Action:** Create a comprehensive document (`DATA_MODEL_MAP.md`) that maps data models across the stack.
    *   **Details:**
        *   **Database:** Extract schema definitions for all relevant tables.
        *   **Backend:** Document the Go structs in `backend/internal/models/models.go` and how they map to database tables.
        *   **Frontend:** Document the TypeScript types in `src/lib/types.ts` and how they correspond to backend API responses.
    *   **Tooling:** Use `list_files` and `read_file` to gather information.

*   **Subtask 1.2: Identify Discrepancies**
    *   **Action:** Analyze the `DATA_MODEL_MAP.md` to pinpoint specific mismatches.
    *   **Examples of Mismatches:**
        *   Field name differences (e.g., `user_id` vs. `userID`).
        *   Data type inconsistencies (e.g., `string` in frontend, `int` in backend).
        *   Missing or extra fields in any layer.
        *   Nullability differences.
    *   **Output:** A detailed list of all identified discrepancies in a new file `SYNC_ISSUES.md`.

---

### **Phase 2: Planning & Prioritization (Architect Mode)**

**Goal:** Create a clear action plan to resolve the identified issues.

*   **Subtask 2.1: Develop a Remediation Plan**
    *   **Action:** For each issue in `SYNC_ISSUES.md`, define a clear resolution strategy.
    *   **Details:**
        *   Determine the "source of truth" for each data model (usually the database or backend).
        *   Outline the specific changes required in the frontend, backend, or database schema.
        *   Estimate the effort and potential impact of each change.
    *   **Output:** An updated `SYNC_ISSUES.md` with a "Proposed Fix" section for each issue.

*   **Subtask 2.2: Prioritize Fixes**
    *   **Action:** Prioritize the issues based on severity, user impact, and development effort.
    *   **Output:** A prioritized list of tasks in `SYNC_ISSUES.md`.

---

### **Phase 3: Implementation (Code Mode)**

**Goal:** Execute the remediation plan and fix the inconsistencies.

*   **Subtask 3.1: Backend Model & API Adjustments**
    *   **Action:** Modify the Go structs and API handlers (`/backend/internal/models/`, `/backend/internal/api/`) to align with the remediation plan.
    *   **Tooling:** Use `apply_diff` or `write_to_file` to apply changes.

*   **Subtask 3.2: Frontend Type & Component Adjustments**
    *   **Action:** Update the TypeScript types (`/src/lib/types.ts`) and any affected components to match the new backend API contracts.
    *   **Tooling:** Use `apply_diff` or `write_to_file` to apply changes.

*   **Subtask 3.3: Database Schema Migrations**
    *   **Action:** If necessary, create and apply database migration scripts to update the schema.
    *   **Tooling:** Use `write_to_file` to create SQL migration scripts.

---

### **Phase 4: Validation & Verification (Debug Mode)**

**Goal:** Ensure all fixes are working correctly and have not introduced new issues.

*   **Subtask 4.1: Unit & Integration Testing**
    *   **Action:** Run existing tests and add new ones to cover the changes.
    *   **Tooling:** Use `execute_command` to run test suites.

*   **Subtask 4.2: End-to-End (E2E) Testing**
    *   **Action:** Manually test the affected application flows to confirm that the frontend, backend, and database are communicating correctly.
    *   **Output:** A summary of test results.

*   **Subtask 4.3: Final Review**
    *   **Action:** Review all changes and test results to confirm that all discrepancies from `SYNC_ISSUES.md` have been resolved.
    *   **Output:** A final confirmation that the synchronization is complete.