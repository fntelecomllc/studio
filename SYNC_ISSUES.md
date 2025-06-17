# Data Model Synchronization Issues

This document outlines the identified discrepancies in the data models between the database, backend (Go), and frontend (TypeScript).

## Model-Specific Discrepancies

### KeywordSet

*   **Field:** `keywords` / `Rules` / `rules`
*   **Issue:** **Nullability Mismatch.** The `rules` field is optional in the frontend type (`KeywordRule[] | undefined`), but the database (`JSONB`) and backend (`[]KeywordRule`) fields are not explicitly nullable. An empty array is not the same as `null` or `undefined`.
*   **Recommendation:** Clarify the business logic. If a KeywordSet can exist without any rules, the backend and database should explicitly handle null values. Otherwise, the frontend type should be changed to `KeywordRule[]` and always expect an array (even if empty).
*   **Proposed Fix:**
    *   **Source of Truth:** The frontend model (`KeywordRule[] | undefined`) will be the source of truth, allowing a `KeywordSet` to exist without rules.
    *   **Database:** The `rules` column in the `keyword_sets` table will be altered to be `NULLABLE`.
    *   **Backend:** In `backend/internal/models/models.go`, the `rules` field in the `KeywordSet` struct will be changed to a pointer type (`*[]KeywordRule`) to allow for `nil` values.
    *   **Frontend:** The type `KeywordRule[] | undefined` in `src/lib/types.ts` is correct. No change is needed.
    *   **Status: Done**

*   **Field:** `keywords` / `Rules` / `rules`
*   **Issue:** **Naming Inconsistency.** The field is named `keywords` in the database, `Rules` in the backend, and `rules` in the frontend.
*   **Recommendation:** Rename for consistency. The recommended name is `rules` across all layers (with `rules` as the JSON tag in Go).
*   **Proposed Fix:**
    *   **Source of Truth:** The name `rules` will be the standard.
    *   **Database:** Create a migration to rename the `keywords` column to `rules` in the `keyword_sets` table.
    *   **Backend:** In `backend/internal/models/models.go`, rename the `Rules` field in the `KeywordSet` struct to `rules` and ensure the JSON tag is `json:"rules"`.
    *   **Frontend:** The `rules` field in the `KeywordSet` type in `src/lib/types.ts` is already correct. No change is needed.
    *   **Status: Done**

### HTTPKeywordResult vs. DNSValidationResult

*   **Field:** `attempts`
*   **Issue:** **Inconsistent Nullability in Backend.**
    *   In `DNSValidationResult`, `Attempts` is a pointer (`*int`), making it nullable.
    *   In `HTTPKeywordResult`, `Attempts` is a non-pointer (`int`), making it non-nullable.
    *   The database schema (`INT`) does not specify nullability for either.
*   **Recommendation:** The nullability of the `attempts` field should be consistent. Decide if `attempts` should be nullable in both cases (e.g., for a job that hasn't run yet) and update the Go models and database schema accordingly.
*   **Proposed Fix:**
    *   **Source of Truth:** The `DNSValidationResult` model's use of a nullable pointer (`*int`) will be the standard.
    *   **Database:** The `attempts` column will be made `NULLABLE` in both the `http_keyword_results` and `dns_validation_results` tables.
    *   **Backend:** In `backend/internal/models/models.go`, the `Attempts` field in the `HTTPKeywordResult` struct will be changed to a pointer (`*int`). The `DNSValidationResult` struct is already correct.
    *   **Frontend:** The corresponding types in `src/lib/types.ts` will be updated to allow for null values (e.g., `attempts: number | null`).
    *   **Status: Done**

### User
*   **Field:** `password_hash`
*   **Issue:** **Missing in Frontend.** The `password_hash` field exists in the database and backend but is correctly omitted from the frontend `User` type for security.
*   **Recommendation:** No action needed. This is expected behavior.
*   **Proposed Fix:** No action is required. The current implementation is correct and follows security best practices.
*   **Status: Done**
*   **Status: Done**

### Proxy
*   **Field:** `password_hash`
*   **Issue:** **Missing in Frontend.** The `password_hash` field exists in the database and backend but is correctly omitted from the frontend `Proxy` type for security.
*   **Recommendation:** No action needed. This is expected behavior.
*   **Proposed Fix:** No action is required. The current implementation is correct and follows security best practices.

## General Discrepancies

These are patterns of difference that apply to multiple data models.

1.  **UUID Handling**
    *   **Description:** UUID types are handled differently across the stack.
    *   **Database:** `UUID`
    *   **Backend (Go):** `uuid.UUID`
    *   **Frontend (TypeScript):** `string`
    *   **Recommendation:** This is a common and generally acceptable pattern, but it should be documented as the standard approach.
    *   **Proposed Fix:** No code changes are required. This pattern will be formally documented in the project's architecture guide. For the purpose of this synchronization, this is considered acceptable.
    *   **Status: Done**

2.  **Timestamp Handling**
    *   **Description:** Timestamp types are handled differently across the stack.
    *   **Database:** `TIMESTAMP` or `TIMESTAMPTZ`
    *   **Backend (Go):** `time.Time`
    *   **Frontend (TypeScript):** `string`
    *   **Recommendation:** This is a standard serialization practice. Ensure consistent date-time formatting (e.g., ISO 8601) on the frontend.
    *   **Proposed Fix:** No code changes are required. The frontend will ensure all date-time strings conform to the ISO 8601 standard. This will be documented as the official project standard.
    *   **Status: Done**