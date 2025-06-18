# API Contract Mismatch Analysis

This document details the identified discrepancies between the backend API contract (as defined in `BACKEND_API_INVENTORY.md`) and the frontend API consumption patterns (as described in `FRONTEND_API_CONSUMPTION.md`). The backend contract is considered the source of truth for all resolutions.

---

## 1. Data Type Mismatches

### 1.1. Date/Time Formatting

-   **Issue:** The backend models use `time.Time` for date fields (e.g., `CreatedAt`, `UpdatedAt`, `StartedAt`). The JSON representation of this type is a string, but the specific format (e.g., ISO 8601, RFC3339) is not explicitly defined in the backend documentation. The frontend will receive these as strings and likely parse them into `Date` objects. Any discrepancy in the format can lead to parsing errors.
-   **Location:**
    -   **Backend:** [`BACKEND_API_INVENTORY.md:105`](BACKEND_API_INVENTORY.md:105) (and other model definitions)
    -   **Frontend:** [`FRONTEND_API_CONSUMPTION.md:38`](FRONTEND_API_CONSUMPTION.md:38) (inferred from `src/lib/types.ts`)
-   **Severity:** **High**
-   **Recommendation:** The backend should explicitly document the date/time format used in its API responses (e.g., RFC3339). The frontend should ensure it parses this exact format.

---

## 2. Nullability and Optionality

### 2.1. Inconsistent Handling of Null vs. Undefined

-   **Issue:** The Go backend uses multiple ways to represent optional or nullable fields:
    1.  Pointer types (`*string`, `*int64`), which are omitted from JSON if `nil` due to the `omitempty` tag. This results in `undefined` on the frontend.
    2.  `sql.NullString`, `sql.NullInt32`, etc., which can result in a `null` value in the JSON.
    The frontend TypeScript interfaces must be able to handle both `null` and `undefined` for these fields (e.g., `fieldName?: string | null;`). The frontend documentation does not specify if this is handled consistently.
-   **Location:**
    -   **Backend:** [`BACKEND_API_INVENTORY.md:102`](BACKEND_API_INVENTORY.md:102) (`sql.NullString`), [`BACKEND_API_INVENTORY.md:221`](BACKEND_API_INVENTORY.md:221) (`*time.Time`)
    -   **Frontend:** [`FRONTEND_API_CONSUMPTION.md:38`](FRONTEND_API_CONSUMPTION.md:38)
-   **Severity:** **Medium**
-   **Recommendation:** All frontend interfaces should explicitly type nullable/optional fields to handle both `null` and `undefined` (e.g., `progressPercentage?: number | null;`). The frontend's data handling logic should be reviewed to ensure it correctly checks for both cases before accessing these fields.

---

## 3. Enum and Constant Synchronization

### 3.1. Potential for Enum Value Desynchronization

-   **Issue:** The backend defines several enums (e.g., `CampaignStatusEnum`, `CampaignTypeEnum`). The frontend maintains a parallel set of enums in `src/lib/types/unifiedTypes.ts`. There is a risk that these enums could become desynchronized if a value is added, removed, or changed on the backend but not updated on the frontend.
-   **Location:**
    -   **Backend:** [`BACKEND_API_INVENTORY.md:217`](BACKEND_API_INVENTORY.md:217)
    -   **Frontend:** [`FRONTEND_API_CONSUMPTION.md:40`](FRONTEND_API_CONSUMPTION.md:40)
-   **Severity:** **High**
-   **Recommendation:** Implement a shared schema or a script that automatically generates the TypeScript enums from the Go source code to ensure they are always synchronized. Short of that, a manual audit is required.

---

## 4. API Endpoint Contracts

### 4.1. Ambiguous Endpoint Aliasing

-   **Issue:** The backend API has two distinct endpoint paths, `/api/v2/campaigns/http-validate` and `/api/v2/campaigns/keyword-validate`, that both map to the same handler (`campaignOrchestratorAPIHandler.createHTTPKeywordCampaign`). This is not an error, but it creates ambiguity. The frontend may be using only one, or both, and the intended distinction between them is unclear.
-   **Location:**
    -   **Backend:** [`BACKEND_API_INVENTORY.md:53-54`](BACKEND_API_INVENTORY.md:53)
    -   **Frontend:** [`FRONTEND_API_CONSUMPTION.md:27`](FRONTEND_API_CONSUMPTION.md:27)
-   **Severity:** **Low**
-   **Recommendation:** The backend documentation should clarify the purpose of having two separate endpoints for the same functionality. If one is legacy or deprecated, it should be marked as such.

### 4.2. Lack of Explicit Permission String Synchronization

-   **Issue:** The backend uses specific permission strings in its `RequirePermission` middleware (e.g., `"campaigns:create"`, `"personas:read"`). The frontend's `AuthService` has a `hasPermission` method. There is no guarantee that the strings used on the frontend for conditional rendering or logic match the strings required by the backend.
-   **Location:**
    -   **Backend:** [`BACKEND_API_INVENTORY.md:20`](BACKEND_API_INVENTORY.md:20) (and all other protected endpoints)
    -   **Frontend:** [`FRONTEND_API_CONSUMPTION.md:19`](FRONTEND_API_CONSUMPTION.md:19)
-   **Severity:** **High**
-   **Recommendation:** The permission strings should be defined in a shared location or contract, similar to the enums. At a minimum, the backend should provide a comprehensive list of all permission strings, and the frontend must be audited to ensure it uses the correct ones.

---

## 5. Field Name Consistency

### 5.1. Casing Convention

-   **Issue:** The backend correctly uses `camelCase` for its JSON field names (e.g., `campaignType`, `createdAt`), which should align with TypeScript/JavaScript conventions. This appears to be consistent across the documented models.
-   **Location:**
    -   **Backend:** [`BACKEND_API_INVENTORY.md:98-233`](BACKEND_API_INVENTORY.md:98)
    -   **Frontend:** [`FRONTEND_API_CONSUMPTION.md:38`](FRONTEND_API_CONSUMPTION.md:38)
-   **Severity:** **Low (Informational)**
-   **Recommendation:** This is a point of validation rather than a current mismatch. A full code-level audit should confirm that every single backend `json` tag is `camelCase` and that the frontend interfaces match this convention.