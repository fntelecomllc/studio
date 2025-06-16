# DomainFlow Backend Services

This directory contains the Go-based backend services for DomainFlow, built with the Gin framework. It features a robust, PostgreSQL-backed system for managing entities like Personas, Proxies, and Keyword Sets, and includes a new V2 stateful campaign engine for advanced domain generation, DNS validation, and HTTP/Keyword validation tasks. The system offers real-time communication via WebSockets and is designed for high-throughput, configurable domain intelligence operations.

## Main Features

*   **Stateful Campaign Management (V2):**
    *   **Domain Generation Campaigns:** Deterministic, batch-based domain generation with resumability and ability to specify target number of domains.
    *   **DNS Validation Campaigns:** Validates domains from generation campaigns using configurable DNS personas.
    *   **HTTP & Keyword Validation Campaigns:** Performs HTTP validation and keyword extraction on DNS-validated domains using HTTP personas and keyword sets.
    *   All campaigns are persistent, managed via a new API, and processed by a background worker system.
    *   Endpoints available to retrieve paginated results for each campaign type.
*   **Database-Backed Entities:** Personas, Proxies, and Keyword Sets are now managed via APIs and stored persistently in PostgreSQL.
*   **Real-time Communication (WebSockets):**
    *   A general-purpose WebSocket endpoint (`/api/v2/ws`) allows for persistent, bidirectional communication between clients and the server.
    *   Can be used for live updates on campaign progress, system notifications, and other real-time interactions.
*   **Advanced Validation Engines:** Core DNS and HTTP validators with persona support.
*   **Keyword Extraction:** Dedicated endpoints for fetching content and extracting keywords.
*   **Configurable Operations:** Extensive configuration via `config.json` (in the `backend` directory) and environment variables.
*   **PostgreSQL Database:** Robust and scalable database backend for all data storage needs.

## Database to Go Struct Mapping

This section outlines the mapping between PostgreSQL tables and Go structs defined in `internal/models/models.go`.

### Table: `campaigns` <-> Struct: `Campaign`

| Go Field (Type)                           | DB Column (`db` tag) | DB Type             | Notes                                     |
| ----------------------------------------- | -------------------- | ------------------- | ----------------------------------------- |
| `ID (uuid.UUID)`                          | `id`                   | `UUID`              | Primary Key                               |
| `Name (string)`                           | `name`                 | `TEXT`              |                                           |
| `CampaignType (CampaignTypeEnum)`         | `campaign_type`        | `TEXT`              | e.g., 'domain_generation'                 |
| `Status (CampaignStatusEnum)`             | `status`               | `TEXT`              | e.g., 'pending'                           |
| `UserID (sql.NullString)`                 | `user_id`              | `TEXT`              |                                           |
| `TotalItems (int64)`                      | `total_items`          | `BIGINT`            |                                           |
| `ProcessedItems (int64)`                  | `processed_items`      | `BIGINT`            |                                           |
| `SuccessfulItems (int64)`                 | `successful_items`     | `BIGINT`            |                                           |
| `FailedItems (int64)`                     | `failed_items`         | `BIGINT`            |                                           |
| `ProgressPercentage (float64)`            | `progress_percentage`  | `DOUBLE PRECISION`  |                                           |
| `Metadata (*json.RawMessage)`             | `metadata`             | `JSONB`             |                                           |
| `CreatedAt (time.Time)`                   | `created_at`           | `TIMESTAMPTZ`       |                                           |
| `UpdatedAt (time.Time)`                   | `updated_at`           | `TIMESTAMPTZ`       |                                           |
| `StartedAt (sql.NullTime)`                | `started_at`           | `TIMESTAMPTZ`       |                                           |
| `CompletedAt (sql.NullTime)`              | `completed_at`         | `TIMESTAMPTZ`       |                                           |
| `ErrorMessage (sql.NullString)`           | `error_message`        | `TEXT`              |                                           |
| `DomainGenerationParams (*DomainGenerationCampaignParams)`          | *(N/A)*                | *(N/A)*             | Nested struct, see `domain_generation_campaign_params` |
| `DNSValidationParams (*DNSValidationCampaignParams)`             | *(N/A)*                | *(N/A)*             | Nested struct, see `dns_validation_params` |
| `HTTPKeywordValidationParams (*HTTPKeywordCampaignParams)`     | *(N/A)*                | *(N/A)*             | Nested struct, see `http_keyword_campaign_params` |

### Table: `domain_generation_campaign_params` <-> Struct: `DomainGenerationCampaignParams`

| Go Field (Type)                | DB Column (`db` tag)        | DB Type  | Notes                               |
| ------------------------------ | --------------------------- | -------- | ----------------------------------- |
| `CampaignID (uuid.UUID)`       | `campaign_id`               | `UUID`   | Primary Key, Foreign Key to `campaigns` |
| `PatternType (string)`         | `pattern_type`              | `TEXT`   |                                     |
| `VariableLength (int)`         | `variable_length`           | `INT`    |                                     |
| `CharacterSet (string)`        | `character_set`             | `TEXT`   |                                     |
| `ConstantString (string)`      | `constant_string`           | `TEXT`   |                                     |
| `TLD (string)`                 | `tld`                       | `TEXT`   |                                     |
| `NumDomainsToGenerate (int)`   | `num_domains_to_generate`   | `INT`    |                                     |
| `TotalPossibleCombinations (int64)` | `total_possible_combinations` | `BIGINT` |                                     |
| `CurrentOffset (int64)`        | `current_offset`            | `BIGINT` |                                     |

### Table: `generated_domains` <-> Struct: `GeneratedDomain`

| Go Field (Type)                     | DB Column (`db` tag)             | DB Type       | Notes                               |
| ----------------------------------- | -------------------------------- | ------------- | ----------------------------------- |
| `ID (uuid.UUID)`                    | `id`                             | `UUID`        | Primary Key                         |
| `GenerationCampaignID (uuid.UUID)`  | `domain_generation_campaign_id`  | `UUID`        | Foreign Key to `campaigns`          |
| `DomainName (string)`               | `domain_name`                    | `TEXT`        |                                     |
| `SourceKeyword (sql.NullString)`    | `source_keyword`                 | `TEXT`        |                                     |
| `SourcePattern (sql.NullString)`    | `source_pattern`                 | `TEXT`        |                                     |
| `TLD (sql.NullString)`              | `tld`                            | `TEXT`        |                                     |
| `OffsetIndex (int64)`               | `offset_index`                   | `BIGINT`      |                                     |
| `GeneratedAt (time.Time)`           | `generated_at`                   | `TIMESTAMPTZ` |                                     |
| `CreatedAt (time.Time)`             | `created_at`                     | `TIMESTAMPTZ` |                                     |

### Table: `domain_generation_config_states` <-> Struct: `DomainGenerationConfigState`

| Go Field (Type)                | DB Column (`db` tag) | DB Type       | Notes                                     |
| ------------------------------ | -------------------- | ------------- | ----------------------------------------- |
| `ConfigHash (string)`          | `config_hash`        | `TEXT`        | Primary Key                               |
| `LastOffset (int64)`           | `last_offset`        | `BIGINT`      |                                           |
| `ConfigDetails (json.RawMessage)` | `config_details`   | `JSONB`       | Stores marshalled `NormalizedDomainGenerationParams` |
| `UpdatedAt (time.Time)`        | `updated_at`         | `TIMESTAMPTZ` |                                           |

### Table: `personas` <-> Struct: `Persona`

| Go Field (Type)                  | DB Column (`db` tag) | DB Type       | Notes                               |
| -------------------------------- | -------------------- | ------------- | ----------------------------------- |
| `ID (uuid.UUID)`                 | `id`                   | `UUID`        | Primary Key                         |
| `Name (string)`                  | `name`                 | `TEXT`        |                                     |
| `PersonaType (PersonaTypeEnum)`  | `persona_type`         | `TEXT`        | 'DNS' or 'HTTP'                     |
| `Description (sql.NullString)`   | `description`          | `TEXT`        |                                     |
| `ConfigDetails (json.RawMessage)`| `config_details`       | `JSONB`       | Stores `DNSConfigDetails` or `HTTPConfigDetails` |
| `IsEnabled (bool)`               | `is_enabled`           | `BOOLEAN`     |                                     |
| `CreatedAt (time.Time)`          | `created_at`           | `TIMESTAMPTZ` |                                     |
| `UpdatedAt (time.Time)`          | `updated_at`           | `TIMESTAMPTZ` |                                     |

### Table: `keyword_sets` <-> Struct: `KeywordSet`

| Go Field (Type)                  | DB Column (`db` tag) | DB Type       | Notes                               |
| -------------------------------- | -------------------- | ------------- | ----------------------------------- |
| `ID (uuid.UUID)`                 | `id`                   | `UUID`        | Primary Key                         |
| `Name (string)`                  | `name`                 | `TEXT`        | Unique                              |
| `Description (sql.NullString)`   | `description`          | `TEXT`        |                                     |
| `Rules ([]KeywordRule)`          | `keywords`             | `JSONB`       | Stores an array of `KeywordRule` objects |
| `IsEnabled (bool)`               | `is_enabled`           | `BOOLEAN`     |                                     |
| `CreatedAt (time.Time)`          | `created_at`           | `TIMESTAMPTZ` |                                     |
| `UpdatedAt (time.Time)`          | `updated_at`           | `TIMESTAMPTZ` |                                     |

*Note: `KeywordRule` is a separate Go struct, its fields are stored within the `keywords` JSONB array of the `keyword_sets` table.*
Fields for `KeywordRule`: `ID (uuid.UUID)`, `KeywordSetID (uuid.UUID)`, `Pattern (string)`, `RuleType (KeywordRuleTypeEnum)`, `IsCaseSensitive (bool)`, `Category (sql.NullString)`, `ContextChars (int)`, `CreatedAt (time.Time)`, `UpdatedAt (time.Time)`. These do not have direct `db` tags for a separate table.

### Table: `dns_validation_params` <-> Struct: `DNSValidationCampaignParams`

| Go Field (Type)                       | DB Column (`db` tag)             | DB Type       | Notes                               |
| ------------------------------------- | -------------------------------- | ------------- | ----------------------------------- |
| `CampaignID (uuid.UUID)`              | `campaign_id`                    | `UUID`        | Primary Key, Foreign Key to `campaigns` |
| `SourceGenerationCampaignID (uuid.UUID)`| `source_generation_campaign_id`  | `UUID`        | Foreign Key to `campaigns`          |
| `PersonaIDs ([]uuid.UUID)`            | `persona_ids`                    | `UUID[]`      |                                     |
| `RotationIntervalSeconds (int)`       | `rotation_interval_seconds`      | `INT`         |                                     |
| `ProcessingSpeedPerMinute (int)`      | `processing_speed_per_minute`    | `INT`         |                                     |
| `BatchSize (int)`                     | `batch_size`                     | `INT`         |                                     |
| `RetryAttempts (int)`                 | `retry_attempts`                 | `INT`         |                                     |
| `Metadata (*json.RawMessage)`         | `metadata`                       | `JSONB`       |                                     |

### Table: `dns_validation_results` <-> Struct: `DNSValidationResult`

| Go Field (Type)                     | DB Column (`db` tag)        | DB Type       | Notes                               |
| ----------------------------------- | --------------------------- | ------------- | ----------------------------------- |
| `ID (uuid.UUID)`                    | `id`                          | `UUID`        | Primary Key                         |
| `DNSCampaignID (uuid.UUID)`         | `dns_campaign_id`           | `UUID`        | Foreign Key to `campaigns`          |
| `GeneratedDomainID (uuid.NullUUID)` | `generated_domain_id`       | `UUID`        | Foreign Key to `generated_domains`  |
| `DomainName (string)`               | `domain_name`                 | `TEXT`        |                                     |
| `ValidationStatus (string)`         | `validation_status`           | `TEXT`        |                                     |
| `DNSRecords (json.RawMessage)`      | `dns_records`                 | `JSONB`       |                                     |
| `ValidatedByPersonaID (uuid.NullUUID)`| `validated_by_persona_id`   | `UUID`        | Foreign Key to `personas`           |
| `Attempts (int)`                    | `attempts`                    | `INT`         |                                     |
| `LastCheckedAt (sql.NullTime)`      | `last_checked_at`             | `TIMESTAMPTZ` |                                     |
| `CreatedAt (time.Time)`             | `created_at`                  | `TIMESTAMPTZ` |                                     |

### Table: `http_keyword_campaign_params` <-> Struct: `HTTPKeywordCampaignParams`

| Go Field (Type)                       | DB Column (`db` tag)             | DB Type       | Notes                               |
| ------------------------------------- | -------------------------------- | ------------- | ----------------------------------- |
| `CampaignID (uuid.UUID)`              | `campaign_id`                    | `UUID`        | Primary Key, Foreign Key to `campaigns` |
| `SourceCampaignID (uuid.UUID)`        | `source_campaign_id`             | `UUID`        | Foreign Key to `campaigns`          |
| `SourceType (string)`                 | `source_type`                    | `TEXT`        | 'DomainGeneration' or 'DNSValidation' |
| `PersonaIDs ([]uuid.UUID)`            | `persona_ids`                    | `UUID[]`      |                                     |
| `KeywordSetIDs ([]uuid.UUID)`         | `keyword_set_ids`                | `UUID[]`      |                                     |
| `AdHocKeywords ([]string)`            | `ad_hoc_keywords`                | `TEXT[]`      |                                     |
| `ProxyIDs ([]uuid.UUID)`              | `proxy_ids`                      | `UUID[]`      |                                     |
| `ProxyPoolID (uuid.NullUUID)`         | `proxy_pool_id`                  | `UUID`        |                                     |
| `ProxySelectionStrategy (sql.NullString)`| `proxy_selection_strategy`     | `TEXT`        |                                     |
| `RotationIntervalSeconds (int)`       | `rotation_interval_seconds`      | `INT`         |                                     |
| `ProcessingSpeedPerMinute (int)`      | `processing_speed_per_minute`    | `INT`         |                                     |
| `BatchSize (int)`                     | `batch_size`                     | `INT`         |                                     |
| `RetryAttempts (int)`                 | `retry_attempts`                 | `INT`         |                                     |
| `TargetHTTPPorts ([]int)`             | `target_http_ports`              | `INT[]`       |                                     |
| `LastProcessedDomainName (string)`    | `last_processed_domain_name`     | `TEXT`        |                                     |
| `Metadata (*json.RawMessage)`         | `metadata`                       | `JSONB`       |                                     |

### Table: `http_keyword_results` <-> Struct: `HTTPKeywordResult`

| Go Field (Type)                         | DB Column (`db` tag)           | DB Type       | Notes                               |
| --------------------------------------- | ------------------------------ | ------------- | ----------------------------------- |
| `ID (uuid.UUID)`                        | `id`                             | `UUID`        | Primary Key                         |
| `HTTPKeywordCampaignID (uuid.UUID)`     | `http_keyword_campaign_id`     | `UUID`        | Foreign Key to `campaigns`          |
| `DNSResultID (uuid.NullUUID)`           | `dns_result_id`                | `UUID`        | Foreign Key to `dns_validation_results` |
| `DomainName (string)`                   | `domain_name`                  | `TEXT`        |                                     |
| `ValidationStatus (string)`             | `validation_status`            | `TEXT`        |                                     |
| `HTTPStatusCode (sql.NullInt32)`        | `http_status_code`             | `INT`         |                                     |
| `ResponseHeaders (json.RawMessage)`     | `response_headers`             | `JSONB`       |                                     |
| `PageTitle (sql.NullString)`            | `page_title`                   | `TEXT`        |                                     |
| `ExtractedContentSnippet (sql.NullString)`| `extracted_content_snippet`    | `TEXT`        |                                     |
| `FoundKeywordsFromSets (json.RawMessage)`| `found_keywords_from_sets`     | `JSONB`       |                                     |
| `FoundAdHocKeywords ([]string)`         | `found_ad_hoc_keywords`        | `JSONB`       | Stored as JSON array of strings     |
| `ContentHash (sql.NullString)`          | `content_hash`                 | `TEXT`        |                                     |
| `ValidatedByPersonaID (uuid.NullUUID)`  | `validated_by_persona_id`      | `UUID`        | Foreign Key to `personas`           |
| `UsedProxyID (uuid.NullUUID)`           | `used_proxy_id`                | `UUID`        | Foreign Key to `proxies`            |
| `Attempts (int)`                        | `attempts`                     | `INT`         |                                     |
| `LastCheckedAt (sql.NullTime)`          | `last_checked_at`              | `TIMESTAMPTZ` |                                     |
| `CreatedAt (time.Time)`                 | `created_at`                   | `TIMESTAMPTZ` |                                     |

### Table: `proxies` <-> Struct: `Proxy`

| Go Field (Type)                      | DB Column (`db` tag) | DB Type       | Notes                               |
| ------------------------------------ | -------------------- | ------------- | ----------------------------------- |
| `ID (uuid.UUID)`                     | `id`                   | `UUID`        | Primary Key                         |
| `Name (string)`                      | `name`                 | `TEXT`        | Unique                              |
| `Description (sql.NullString)`       | `description`          | `TEXT`        |                                     |
| `Address (string)`                   | `address`              | `TEXT`        | Unique, e.g. 'http://user:pass@host:port' |
| `Protocol (ProxyProtocolEnum)`       | `protocol`             | `TEXT`        |                                     |
| `Username (sql.NullString)`          | `username`             | `TEXT`        |                                     |
| `PasswordHash (sql.NullString)`      | `password_hash`        | `TEXT`        |                                     |
| `Host (sql.NullString)`              | `host`                 | `TEXT`        |                                     |
| `Port (sql.NullInt32)`               | `port`                 | `INT`         |                                     |
| `IsEnabled (bool)`                   | `is_enabled`           | `BOOLEAN`     |                                     |
| `IsHealthy (bool)`                   | `is_healthy`           | `BOOLEAN`     |                                     |
| `LastStatus (sql.NullString)`        | `last_status`          | `TEXT`        |                                     |
| `LastCheckedAt (sql.NullTime)`       | `last_checked_at`      | `TIMESTAMPTZ` |                                     |
| `LatencyMs (sql.NullInt32)`          | `latency_ms`           | `INT`         |                                     |
| `City (sql.NullString)`              | `city`                 | `TEXT`        |                                     |
| `CountryCode (sql.NullString)`       | `country_code`         | `TEXT`        |                                     |
| `Provider (sql.NullString)`          | `provider`             | `TEXT`        |                                     |
| `CreatedAt (time.Time)`              | `created_at`           | `TIMESTAMPTZ` |                                     |
| `UpdatedAt (time.Time)`              | `updated_at`           | `TIMESTAMPTZ` |                                     |
| `InputUsername (sql.NullString)`     | *(N/A)*                | *(N/A)*       | For API input, not direct DB field  |
| `InputPassword (sql.NullString)`     | *(N/A)*                | *(N/A)*       | For API input, not direct DB field  |

### Table: `audit_logs` <-> Struct: `AuditLog`

| Go Field (Type)                  | DB Column (`db` tag) | DB Type       | Notes       |
| -------------------------------- | -------------------- | ------------- | ----------- |
| `ID (uuid.UUID)`                 | `id`                   | `UUID`        | Primary Key |
| `Timestamp (time.Time)`          | `timestamp`            | `TIMESTAMPTZ` |             |
| `UserID (sql.NullString)`        | `user_id`              | `TEXT`        |             |
| `Action (string)`                | `action`               | `TEXT`        |             |
| `EntityType (sql.NullString)`    | `entity_type`          | `TEXT`        |             |
| `EntityID (uuid.NullUUID)`       | `entity_id`            | `UUID`        |             |
| `Details (json.RawMessage)`      | `details`              | `JSONB`       |             |
| `ClientIP (sql.NullString)`      | `client_ip`            | `TEXT`        |             |
| `UserAgent (sql.NullString)`     | `user_agent`           | `TEXT`        |             |

### Table: `campaign_jobs` <-> Struct: `CampaignJob`

| Go Field (Type)                         | DB Column (`db` tag)     | DB Type       | Notes                               |
| --------------------------------------- | ------------------------ | ------------- | ----------------------------------- |
| `ID (uuid.UUID)`                        | `id`                       | `UUID`        | Primary Key                         |
| `CampaignID (uuid.UUID)`                | `campaign_id`              | `UUID`        | Foreign Key to `campaigns`          |
| `JobType (CampaignTypeEnum)`            | `job_type`                 | `TEXT`        |                                     |
| `Status (CampaignJobStatusEnum)`        | `status`                   | `TEXT`        |                                     |
| `ScheduledAt (time.Time)`               | `scheduled_at`             | `TIMESTAMPTZ` |                                     |
| `JobPayload (*json.RawMessage)`         | `job_payload`              | `JSONB`       |                                     |
| `Attempts (int)`                        | `attempts`                 | `INT`         |                                     |
| `MaxAttempts (int)`                     | `max_attempts`             | `INT`         |                                     |
| `LastError (sql.NullString)`            | `last_error`               | `TEXT`        |                                     |
| `LastAttemptedAt (sql.NullTime)`        | `last_attempted_at`        | `TIMESTAMPTZ` |                                     |
| `ProcessingServerID (sql.NullString)`   | `processing_server_id`     | `TEXT`        |                                     |
| `CreatedAt (time.Time)`                 | `created_at`               | `TIMESTAMPTZ` |                                     |
| `UpdatedAt (time.Time)`                 | `updated_at`               | `TIMESTAMPTZ` |                                     |
| `NextExecutionAt (sql.NullTime)`        | `next_execution_at`        | `TIMESTAMPTZ` |                                     |
| `LockedAt (sql.NullTime)`               | `locked_at`                | `TIMESTAMPTZ` |                                     |
| `LockedBy (sql.NullString)`             | `locked_by`                | `TEXT`        |                                     |
## Prerequisites

*   Go (version 1.21 or later recommended for latest features like `slog`).
*   Ensure your Go environment is set up with canonical import paths (e.g., `github.com/fntelecomllc/studio/backend/internal/...`).
*   Standard build tools.
*   `jq` (optional, for command-line JSON parsing during API testing).

## Setup

1.  **Navigate to the `backend` directory:**
    ```bash
    cd backend
    ```

2.  **Module Path Configuration:**
    The Go module path defined in `backend/go.mod` should be:
    ```
    module github.com/fntelecomllc/studio/backend
    ```
    If different, update it using `go mod edit -module github.com/fntelecomllc/studio/backend`.
    Ensure import paths in `.go` files match this.

3.  **Initialize/Tidy Go Modules:**
    ```bash
    # Run from the 'backend' directory
    go mod tidy
    ```

4.  **Configuration:**
    *   **`config.json`**: Located in the `backend` directory. Defines main server settings (port, API key), default configurations for DNS/HTTP validators, logging, worker settings, and database connection pool settings (for PostgreSQL).
        *   Copy `config.example.json` to `config.json` and customize.
        *   **CRITICAL:** Set `server.apiKey`.
    *   **Entity Configuration Files (for Initial Seeding/Reference):**
        *   `dns_personas.config.json`, `http_personas.config.json`, `proxies.config.json`, `keywords.config.json` (all within the `backend` directory): These files can be used for initial data seeding if desired, but entities are now primarily managed via API calls and stored in the database.
    *   **Environment Variables (Primary Configuration Method):**
        *   `DB_TYPE`: Set to `postgres` (default) or `firestore`.
        *   **PostgreSQL:** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE`.
        *   **Firestore:** `FIRESTORE_PROJECT_ID` (and `GOOGLE_APPLICATION_CREDENTIALS` must be set in the environment for authentication).
        *   `SERVER_PORT`: Overrides `server.port` in `config.json`.
        *   `API_KEY`: Overrides `server.apiKey` in `config.json`. **Recommended for production.**
           (e.g., `export API_KEY='your_very_secure_api_key_generated_here'`)

## Building the API Server

From the `backend` directory:
```bash
./scripts/build.sh
```
This compiles the Go application into an executable named `domainflow-apiserver` (or similar) within the `backend` directory.

## Running the API Server

Ensure the server is built and configuration (especially environment variables for DB and API key) is correctly set up.

From the `backend` directory:
```bash
./scripts/run_enhanced.sh
```
The server will start, typically on the port defined in `config.json` or by `SERVER_PORT`. Monitor startup logs.

## API Endpoints

All endpoints under the `/api/v2` prefix (including REST and WebSocket upgrade requests) require Bearer Token authentication: `Authorization: Bearer YOUR_API_KEY`.

### Health Check

*   **`GET /ping`**
    *   Description: Checks if the server is running. No authentication required.
    *   Response (200 OK): `{"message":"pong","timestamp":"YYYY-MM-DDTHH:MM:SSZ"}`

### General WebSocket API
*   **`GET /api/v2/ws`** (WebSocket Upgrade)
    *   Description: Establishes a persistent WebSocket connection for general real-time communication. Requires API key authentication during the upgrade.
    *   See the "Connecting Frontend to WebSocket API" section below for more details.

### Entity Management APIs (Database Backed)

These entities are now managed via APIs and persisted in the configured database.

**DNS Personas:** (`/api/v2/personas/dns`)
*   `POST /`: Creates a new DNS persona.
*   `GET /`: Lists all DNS personas.
*   `PUT /{personaId}`: Updates an existing DNS persona.
*   `DELETE /{personaId}`: Deletes a DNS persona.

**HTTP Personas:** (`/api/v2/personas/http`)
*   `POST /`: Creates a new HTTP persona.
*   `GET /`: Lists all HTTP personas.
*   `PUT /{personaId}`: Updates an existing HTTP persona.
*   `DELETE /{personaId}`: Deletes an HTTP persona.

**Proxies:** (`/api/v2/proxies`)
*   `POST /`: Adds a new proxy.
*   `GET /`: Lists all proxies.
*   `PUT /{proxyId}`: Updates a proxy.
*   `DELETE /{proxyId}`: Deletes a proxy.
*   `GET /status`: Retrieves current statuses of managed proxies from the `ProxyManager`.
*   `POST /{proxyId}/test`: Tests a specific proxy configuration.
*   `POST /{proxyId}/health-check`: Forces a health check for a single proxy.
*   `POST /health-check`: Forces a health check for all (or specified ID list in body) managed proxies.

**Keyword Sets:** (`/api/v2/keywords/sets`)
*   `POST /`: Creates a new keyword set.
*   `GET /`: Lists all keyword sets.
*   `GET /{setId}`: Retrieves a specific keyword set.
*   `PUT /{setId}`: Updates a keyword set.
*   `DELETE /{setId}`: Deletes a keyword set.

**Keyword Extraction Utilities:** (`/api/v2/extract/keywords`)
*   **`POST /`** (Batch): Fetches content and extracts keywords.
*   **`GET /stream`** (Streaming): Fetches content and streams keyword extraction results.

**Server Default Configuration Management:** (`/api/v2/config/*`)
*   `GET /dns`, `POST /dns`: Manage default DNS validator settings.
*   `GET /http`, `POST /http`: Manage default HTTP validator settings.
*   `GET /logging`, `POST /logging`: Manage logging settings.
*   `GET /server`, `PUT /server`: Manage server settings.

---

### V2 Stateful Campaign Management API (`/api/v2/v2/campaigns`)

This API manages persistent, multi-stage campaigns processed by background workers.

**Campaign Creation:**
*   **`POST /generate`**: Creates a Domain Generation campaign. User can specify the number of domains to generate.
*   **`POST /dns-validate`**: Creates a DNS Validation campaign.
*   **`POST /http-keyword-validate`**: Creates an HTTP & Keyword Validation campaign.

**Campaign Information & Control:**
*   **`GET /`**: Lists all campaigns.
*   **`GET /{campaignId}`**: Retrieves details for a specific campaign.
*   **`GET /{campaignId}/status`**: Retrieves current status and progress.
*   **`POST /{campaignId}/start`**: Queues a `pending` campaign for processing.
*   **`POST /{campaignId}/pause`**: Requests to pause a `running` or `queued` campaign.
*   **`POST /{campaignId}/resume`**: Moves a `paused` campaign to `queued`.
*   **`POST /{campaignId}/cancel`**: Cancels a campaign.

**Campaign Results:**
*   **`GET /{campaignId}/results/generated-domains`**: Retrieves paginated generated domains for a Domain Generation campaign.
*   **`GET /{campaignId}/results/dns-validation`**: Retrieves paginated DNS validation results for a DNS Validation campaign.
*   **`GET /{campaignId}/results/http-keyword`**: Retrieves paginated HTTP & Keyword validation results for an HTTP & Keyword Validation campaign.

*(Legacy campaign endpoints have been removed.)*

---

## Connecting Frontend to WebSocket API

This section provides guidance for frontend developers (React/Next.js) on connecting to and utilizing the backend's WebSocket API for real-time communication.

**Endpoint:**
*   URL: `ws://<your_backend_host>:<port>/api/v2/ws` (for local development)
*   URL: `wss://<your_backend_domain>/api/v2/ws` (for production with TLS/SSL)
*   Replace `<your_backend_host>:<port>` or `<your_backend_domain>` with the actual address of the running backend server (e.g., `localhost:8080` during development).

**Authentication:**
*   The WebSocket connection requires API key authentication during the initial HTTP upgrade request.
*   The API key must be sent as a `Authorization: Bearer YOUR_API_KEY` header.
*   When using the native browser `WebSocket` API, you cannot directly set arbitrary headers like `Authorization`. There are a few ways to handle this:
    1.  **Via Query Parameter (If Server Supports It):** The backend's WebSocket authentication middleware would need to be modified to accept the API key via a query parameter (e.g., `/api/v2/ws?apiKey=YOUR_API_KEY`). *Currently, the Go backend's API key middleware primarily checks the `Authorization` header.* This would be a backend change if direct browser WebSocket usage is preferred without a library that can set headers.
    2.  **Using a WebSocket Client Library:** Libraries like `socket.io-client` (if the backend were using Socket.IO, which it isn't currently) or more generic WebSocket clients for JavaScript that allow custom headers during the handshake (e.g., the `options` argument in some libraries) might be an option. For the standard `WebSocket` API, this is a limitation.
    3.  **Backend Proxy/Endpoint for Token Exchange:** A common pattern is for the frontend to authenticate with a regular HTTP endpoint, receive a short-lived session token or WebSocket-specific token, and then pass *that* token to the WebSocket connection (e.g., via query param, which is easier for the native `WebSocket` API, or as the first message after connection).
*   **Current Recommendation:** Given the existing Gin middleware checks the `Authorization` header, directly connecting from a browser-based `WebSocket` object with only the API key will be problematic. The simplest path *without backend changes* might be if your HTTP client/framework used for REST API calls can also handle WebSocket upgrades with custom headers (less common for plain browser JS). **Consider modifying the backend API key middleware for the `/ws` route to also check for the API key in a query parameter for easier browser client integration.**

**Establishing a Connection (Conceptual Example with Native WebSocket API - assuming query param auth was added):**

```javascript
// Assuming API_KEY is available in your frontend environment
const getWebSocket = (apiKey) => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsHost = window.location.host; // Or your specific backend host
  // IMPORTANT: The backend needs to support apiKey via query param for this to work directly
  const socket = new WebSocket(`${wsProtocol}://${wsHost}/api/v2/ws?apiKey=${apiKey}`);

  socket.onopen = () => {
    console.log('WebSocket connection established');
    // Send a message if needed, e.g., to subscribe to specific updates
    // socket.send(JSON.stringify({ action: 'subscribe_to_campaign', campaignId: 'some-uuid' }));
  };

  socket.onmessage = (event) => {
    console.log('Message from server: ', event.data);
    try {
      const message = JSON.parse(event.data);
      // Handle different message types from the server
      // if (message.event_type === 'campaign_update') { ... }
    } catch (e) {
      console.error('Error parsing message from server: ', e);
    }
  };

  socket.onclose = (event) => {
    if (event.wasClean) {
      console.log(`WebSocket connection closed cleanly, code=${event.code} reason=${event.reason}`);
    } else {
      // e.g. server process killed or network down
      // event.code is usually 1006 in this case
      console.error('WebSocket connection died');
      // Implement reconnection logic here
    }
  };

  socket.onerror = (error) => {
    console.error(`WebSocket error: ${error.message}`);
  };

  return socket;
};

// Usage in a React component (e.g., in a useEffect hook)
// const apiKey = "YOUR_API_KEY"; // Should be securely managed
// useEffect(() => {
//   const ws = getWebSocket(apiKey);
//   return () => {
//     ws.close();
//   };
// }, [apiKey]);
```

**Using a Library (e.g., `react-use-websocket` for easier management in React):**

If you choose a library like `react-use-websocket`, you might have more options for handling connection and messages, but header-based authentication for the initial handshake remains a challenge without server-side adjustments or a proxy.

```javascript
import useWebSocket, { ReadyState } from 'react-use-websocket';

// const MyComponent = () => {
//   const apiKey = "YOUR_API_KEY"; // Manage securely
//   // Backend needs to support apiKey via query param for this direct approach
//   const socketUrl = `ws://localhost:8080/api/v2/ws?apiKey=${apiKey}`;

//   const { sendMessage, lastMessage, readyState } = useWebSocket(socketUrl);

//   useEffect(() => {
//     if (lastMessage !== null) {
//       console.log('Received via useWebSocket:', lastMessage.data);
//       // Handle message
//     }
//   }, [lastMessage]);

//   const connectionStatus = {
//     [ReadyState.CONNECTING]: 'Connecting',
//     [ReadyState.OPEN]: 'Open',
//     [ReadyState.CLOSING]: 'Closing',
//     [ReadyState.CLOSED]: 'Closed',
//     [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
//   }[readyState];

//   return (
//     <div>
//       <p>WebSocket Connection Status: {connectionStatus}</p>
//       {/* UI to send messages or display received data */}
//     </div>
//   );
// };
```

**Message Format:**
*   **Server-to-Client:** Messages from the server will typically be JSON strings. The frontend should parse these and handle them based on a predefined structure (e.g., using an `event_type` field as shown in the API spec).
    ```json
    {
      "event_type": "some_event_from_server",
      "payload": { /* ...event specific data... */ }
    }
    ```
*   **Client-to-Server:** If the frontend needs to send messages to the server (e.g., to request subscription to certain data feeds), these should also be JSON strings with a defined structure (e.g., using an `action` field).
    ```json
    {
      "action": "subscribe_to_something",
      "data": { /* ...parameters for the action... */ }
    }
    ```
    The backend's WebSocket `readPump` (in `client.go`) currently logs received messages but doesn't process them further. This would need to be extended if client-to-server actions are required.

**Key Considerations for Frontend:**

1.  **API Key Management:** Securely store and manage the API key on the frontend. For browser clients, this typically means fetching it from a secure backend endpoint after user authentication or embedding it carefully if the frontend itself is served behind authentication that protects the key.
2.  **Connection Lifecycle:** Implement robust handling for `onopen`, `onmessage`, `onclose`, and `onerror` events.
3.  **Reconnection Logic:** WebSockets can disconnect due to network issues or server restarts. Implement an exponential backoff or similar strategy for reconnection attempts.
4.  **Message Parsing and Handling:** Safely parse incoming JSON messages and route them to appropriate handlers in your application state (e.g., Redux, Zustand, React Context).
5.  **State Management:** Update your application's state based on messages received from the WebSocket to reflect real-time changes in the UI.
6.  **Development vs. Production URL:** Use `ws://` for local development and `wss://` (secure WebSockets) for production deployments over HTTPS.
7.  **Backend API Key Middleware:** As noted, for the most straightforward browser `WebSocket` integration, the backend's `/api/v2/ws` authentication should ideally be updated to also check for the API key in a query parameter (e.g., `?token=YOUR_API_KEY` or `?apiKey=YOUR_API_KEY`). This avoids the header limitation of the browser's native WebSocket API.

This guide should provide a starting point for your frontend team. Further details on specific message types and server-side event broadcasting will need to be defined as the application features evolve.

---

## Configuration Details

### Main Configuration (`config.json`)

Located in the `backend` directory.

*   **`server`**:
    *   `port`, `apiKey`, `streamChunkSize`, `ginMode`.
    *   PostgreSQL specific: `dbMaxOpenConns`, `dbMaxIdleConns`, `dbConnMaxLifetimeMinutes`.
*   **`worker`**:
    *   `numWorkers`: Number of concurrent campaign processing workers.
    *   `pollIntervalSeconds`: How often workers poll for new jobs.
    *   `errorRetryDelaySeconds`: Delay before retrying a failed job.
    *   `maxJobRetries`: Default max retries for a job.
    *   `jobProcessingTimeoutMinutes`: Timeout for processing a single job batch.
*   **`dnsValidator`**: Default DNS settings (see `config.DNSValidatorConfigJSON`).
*   **`httpValidator`**: Default HTTP settings (see `config.HTTPValidatorConfigJSON`).
*   **`logging`**: `level` (e.g., "DEBUG", "INFO").

### Entity Configuration Files (Legacy / Initial Seed)

Located in the `backend` directory (e.g., `dns_personas.config.json`). These are **no longer the primary source of truth** if the database is populated and are for reference or initial seeding only.

## Development

### Code Structure

*   **`cmd/apiserver/main.go`**: Entry point, Gin router, service/store initialization.
*   **`internal/config`**: Loads `config.json` and defaults.
*   **`internal/models`**: Core data structures with `db` tags.
*   **`internal/store`**: Data access interfaces (`interfaces.go`) with PostgreSQL implementations.
*   **`internal/services`**: Business logic, using store interfaces.
*   **`internal/api`**: Gin HTTP handlers.
    *   `handler_base.go`: Defines `APIHandler` (holds DB connection for Postgres, stores, config).
    *   `handler_utils_gin.go`: Gin helpers, global validator.
*   **`internal/websocket`**: Handles WebSocket connections and broadcasting.
*   **Utility Packages**: `dnsvalidator`, `httpvalidator`, etc., provide core functionalities.
*   *Legacy `internal/campaigns` and `internal/memorystore` are removed.*

### Building & Running

(Use `./scripts/build.sh` and `./scripts/run_enhanced.sh` from the `backend` directory)

---
**Note on Module Path:** The Go module path for this backend is `github.com/fntelecomllc/studio/backend`. Ensure your `go.mod` file and import paths reflect this.
