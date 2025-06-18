# API Remediation Roadmap

This document provides a structured and actionable plan to resolve the discrepancies identified in the `API_CONTRACT_MISMATCHES.md` analysis. The plan is divided into four key sections:
1.  **Actionable Report:** A prioritized list of all identified issues with clear remediation steps.
2.  **Unified Data Contracts:** A "source of truth" view for core data entities to guide alignment.
3.  **Schema Migration Plan:** Concrete SQL statements to align the database with the data contracts.
4.  **Governance Strategy:** A plan to prevent future API and data contract drift.

---

## 1. Actionable Report

This table tracks each identified issue, assigning a severity level and a clear, actionable recommendation to resolve the discrepancy.

| ID | Severity | Entity/Endpoint | Layer | Location (file:line) | Mismatch Description | Recommended Action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FG-03** | `Critical` | `/api/v2/admin/users` | Go | `BACKEND_API_INVENTORY.md` | The frontend expects a full suite of user management endpoints that are completely missing from the backend. Admin functionality is broken. | **Update Backend:** Implement the full suite of CRUD endpoints (`GET`, `POST`, `PUT`, `DELETE /api/v2/admin/users`) in the Go backend to enable user management. |
| **DR-03** | `Critical` | `User` | PostgreSQL | [`DATABASE_SCHEMA.md:15`](DATABASE_SCHEMA.md:15) | The `mfa_enabled` column is missing from the `auth.users` table, meaning user MFA state cannot be persisted. | **Update Database:** Add the `mfa_enabled` column to the `auth.users` table. See Migration Plan section for the `ALTER TABLE` statement. |
| **FG-01** | `High` | `POST /api/v2/auth/refresh` | TypeScript | [`src/lib/services/authService.ts`](src/lib/services/authService.ts) | The frontend does not use the backend's session refresh endpoint, leading to abrupt session expirations and a poor user experience. | **Update Frontend:** Implement session refresh logic in the `authService` to proactively call the refresh endpoint before the session token expires. |
| **FG-02** | `High` | `GET /api/v2/personas` | Go | [`BACKEND_API_INVENTORY.md:45-59`](BACKEND_API_INVENTORY.md:45) | The frontend calls generic persona list/delete endpoints, but the backend only provides type-specific ones, breaking persona management. | **Update Backend:** Create new unified endpoints (`GET /api/v2/personas`, `DELETE /api/v2/personas/{id}`) that handle all persona types. |
| **DR-02** | `Medium` | `Campaign` | PostgreSQL | `DATABASE_SCHEMA.md` | `UserID` is `*uuid.UUID` in Go but `TEXT` in the `campaigns` table, preventing foreign key constraints and proper indexing. | **Update Database:** Change the `user_id` column in the `campaigns` table from `TEXT` to `UUID`. See Migration Plan section for the `ALTER TABLE` statement. |
| **DR-04** | `Medium` | `User` | Go | [`backend/internal/models/auth_models.go`](backend/internal/models/auth_models.go) | The backend uses a generic `*string` for `LastLoginIP`, while the database correctly uses the `INET` type, bypassing type safety. | **Update Backend:** Change the type of `LastLoginIP` in the Go `User` model from `*string` to `net.IP` to align with the database's stricter validation. |
| **SE-01** | `Medium` | WebSocket Messaging | Go, TS | [`src/lib/schemas/websocketMessageSchema.ts:1`](src/lib/schemas/websocketMessageSchema.ts:1) | The backend sends a generic WebSocket message, forcing complex parsing and type guarding on the frontend. | **Update Backend & Frontend:** Refactor the WebSocket message to use a standard wrapper with a `type` string and a typed `payload` object to simplify frontend logic. |
| **SE-02** | `Medium` | All API Endpoints | Go | N/A | The backend lacks a standardized, structured error response format, making frontend error handling brittle and inconsistent. | **Update Backend:** Implement a standardized error response wrapper in Go. All API errors should return a consistent JSON object. |
| **DR-01** | `Low` | All Entities | Go, PostgreSQL | `backend/internal/models/*.go` | Go struct JSON tags use `camelCase`, while database columns use `snake_case`, creating an implicit mapping dependency. | **Update Backend:** Add `db` struct tags to all Go models to explicitly map fields to their `snake_case` database columns (e.g., `db:"user_id"`). |
| **FE-01** | `Low` | `Campaign` | TypeScript | [`src/lib/types.ts:303`](src/lib/types.ts:303) | The frontend `Campaign` interface is bloated with UI-specific state fields that are not part of the API model. | **Update Frontend:** Refactor to a core `Campaign` type matching the API and a `CampaignViewModel` that extends it for UI-specific properties. |
| **BE-01** | `Low` | Legacy Campaign Endpoints | Go | [`BACKEND_API_INVENTORY.md:154-166`](BACKEND_API_INVENTORY.md:154) | Legacy campaign creation endpoints exist in the backend but are unused by the frontend, creating dead code and increasing surface area. | **Update Backend:** Deprecate and remove the legacy campaign creation routes and their corresponding handlers from the backend. |

---

## 2. Unified Data Contracts

This section defines the canonical "Source of Truth" for each core entity, derived from the Go backend models. All other layers (PostgreSQL, TypeScript) should be aligned with these contracts.

### 2.1. User Entity

| Field (Go JSON) | Go Type | SQL Column | SQL Type | TS Type | Nullability (Go/SQL/TS) | Mismatch Highlights |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid.UUID` | `id` | `UUID` | `string` | N/N/N | |
| `email` | `string` | `email` | `VARCHAR(255)` | `string` | N/N/N | |
| `emailVerified` | `bool` | `email_verified` | `BOOLEAN` | `boolean` | N/Y/N | Naming (`emailVerified` vs `email_verified`) |
| `firstName` | `string` | `first_name` | `VARCHAR(100)` | `string` | N/N/N | Naming (`firstName` vs `first_name`) |
| `lastName` | `string` | `last_name` | `VARCHAR(100)` | `string` | N/N/N | Naming (`lastName` vs `last_name`) |
| `avatarUrl` | `*string` | `avatar_url` | `TEXT` | `string` | Y/Y/Y | Naming (`avatarUrl` vs `avatar_url`) |
| `isActive` | `bool` | `is_active` | `BOOLEAN` | `boolean` | N/Y/N | Naming (`isActive` vs `is_active`) |
| `lastLoginAt` | `*time.Time` | `last_login_at` | `TIMESTAMP` | `string` | Y/Y/Y | Naming (`lastLoginAt` vs `last_login_at`) |
| `lastLoginIp` | `*string` | `last_login_ip` | `INET` | `string` | Y/Y/Y | **Type** (`string` vs `INET`), Naming |
| `mfaEnabled` | `bool` | `mfa_enabled` | `BOOLEAN` | `boolean` | N/A/N | **DB Column Missing** |

### 2.2. Campaign Entity

| Field (Go JSON) | Go Type | SQL Column | SQL Type | TS Type | Nullability (Go/SQL/TS) | Mismatch Highlights |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `uuid.UUID` | `id` | `UUID` | `string` | N/N/N | |
| `name` | `string` | `name` | `TEXT` | `string` | N/N/N | |
| `campaignType` | `CampaignTypeEnum` | `campaign_type` | `TEXT` | `CampaignType` | N/N/N | Naming |
| `status` | `CampaignStatusEnum` | `status` | `TEXT` | `CampaignStatus` | N/N/N | |
| `userId` | `*uuid.UUID` | `user_id` | `TEXT` | `string` | Y/Y/Y | **Type** (`UUID` vs `TEXT`) |
| `createdAt` | `time.Time` | `created_at` | `TIMESTAMPTZ` | `string` | N/N/N | Naming |
| `progressPercentage` | `*float64` | `progress_percentage` | `DOUBLE PRECISION` | `number` | Y/Y/Y | Naming |

---

## 3. Schema Migration Plan

The following SQL statements must be executed to align the PostgreSQL database schema with the Go data models.

```sql
-- Remediates DR-02: Changes the type of the user_id column in the campaigns table to UUID for type consistency and to allow foreign key constraints.
-- This assumes that the existing TEXT values are valid UUIDs.
ALTER TABLE campaigns ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

-- Remediates DR-03: Adds the missing mfa_enabled column to the auth.users table to persist user MFA status.
-- It is defined as NOT NULL with a default of false to ensure data integrity for existing and new records.
ALTER TABLE auth.users ADD COLUMN mfa_enabled BOOLEAN NOT NULL DEFAULT false;
```

---

## 4. Governance Strategy

To prevent future contract drift and ensure consistency across the stack, the following governance measures are proposed for integration into the development lifecycle and CI/CD pipeline.

1.  **API Specification as Source of Truth**:
    *   **Action**: Formalize and maintain an `OpenAPI 3.0` specification (e.g., in `API_SPEC.md`) as the single, canonical source of truth for all API contracts, including endpoints, request/response shapes, and data types.
    *   **Benefit**: Creates a clear, language-agnostic contract that all teams can reference.

2.  **CI/CD Pipeline Automation**:
    *   **Go Backend Generation**: Integrate `oapi-codegen` to generate Go server stubs, request/response models, and validation logic directly from the `OpenAPI` spec. This makes it impossible for the Go code to drift from the documented contract.
    *   **TypeScript Client Generation**: Use `openapi-typescript-codegen` or a similar tool in the frontend build pipeline to automatically generate the `apiClient` and all TypeScript types from the same `OpenAPI` spec. This eliminates manual type definitions and ensures the frontend is always in sync with the backend.
    *   **Contract Testing**: Add a CI step that runs a tool like `Dredd` or `schemathesis` to test the live backend API against the `OpenAPI` specification on every build, failing the build if a discrepancy is found.
    *   **Database Schema Validation**: Implement a CI job that programmatically inspects the Go models' `db` struct tags and compares them against the live database schema to detect drift before it reaches production.

By implementing this strategy, the majority of the issues identified in this report can be caught and resolved automatically, ensuring long-term architectural consistency and reducing bugs.