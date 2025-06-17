# Data Model Map

This document provides a comprehensive mapping of the data models across the database, backend (Go), and frontend (TypeScript).

## User

| Database (`auth.users`) | Backend (`models.User`) | Frontend (`types.User`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the user. |
| `email` (VARCHAR) | `Email` (string) | `email` (string) | User's email address. |
| `email_verified` (BOOLEAN) | `EmailVerified` (bool) | `emailVerified` (boolean) | Whether the user's email has been verified. |
| `password_hash` (VARCHAR) | `PasswordHash` (string) | - | Hashed password. |
| `first_name` (VARCHAR) | `FirstName` (string) | `firstName` (string) | User's first name. |
| `last_name` (VARCHAR) | `LastName` (string) | `lastName` (string) | User's last name. |
| `avatar_url` (TEXT) | `AvatarURL` (sql.NullString) | `avatarUrl` (string, optional) | URL for the user's avatar. |
| `is_active` (BOOLEAN) | `IsActive` (bool) | `isActive` (boolean) | Whether the user's account is active. |
| `is_locked` (BOOLEAN) | `IsLocked` (bool) | `isLocked` (boolean) | Whether the user's account is locked. |
| `created_at` (TIMESTAMP) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the user was created. |
| `updated_at` (TIMESTAMP) | `UpdatedAt` (time.Time) | `updatedAt` (string) | Timestamp of when the user was last updated. |

## Campaign

| Database (`campaigns`) | Backend (`models.Campaign`) | Frontend (`types.Campaign`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the campaign. |
| `name` (TEXT) | `Name` (string) | `name` (string) | Name of the campaign. |
| `campaign_type` (TEXT) | `CampaignType` (CampaignTypeEnum) | `campaignType` (CampaignType) | Type of the campaign. |
| `status` (TEXT) | `Status` (CampaignStatusEnum) | `status` (CampaignStatus) | Current status of the campaign. |
| `user_id` (UUID) | `UserID` (*uuid.UUID) | `userId` (string, optional) | ID of the user who created the campaign. |
| `total_items` (BIGINT) | `TotalItems` (*int64) | `totalItems` (number, optional) | Total number of items to be processed. |
| `processed_items` (BIGINT) | `ProcessedItems` (*int64) | `processedItems` (number, optional) | Number of items processed. |
| `successful_items` (BIGINT) | `SuccessfulItems` (*int64) | `successfulItems` (number, optional) | Number of items successfully processed. |
| `failed_items` (BIGINT) | `FailedItems` (*int64) | `failedItems` (number, optional) | Number of items that failed to process. |
| `progress_percentage` (DOUBLE PRECISION) | `ProgressPercentage` (*float64) | `progressPercentage` (number, optional) | Progress of the campaign in percentage. |
| `metadata` (JSONB) | `Metadata` (*json.RawMessage) | `metadata` (Record<string, unknown>, optional) | Additional campaign-specific metadata. |
| `created_at` (TIMESTAMPTZ) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the campaign was created. |
| `updated_at` (TIMESTAMPTZ) | `UpdatedAt` (time.Time) | `updatedAt` (string) | Timestamp of when the campaign was last updated. |
| `started_at` (TIMESTAMPTZ) | `StartedAt` (*time.Time) | `startedAt` (string, optional) | Timestamp of when the campaign started. |
| `completed_at` (TIMESTAMPTZ) | `CompletedAt` (*time.Time) | `completedAt` (string, optional) | Timestamp of when the campaign completed. |
| `error_message` (TEXT) | `ErrorMessage` (*string) | `errorMessage` (string, optional) | Last error message if the campaign failed. |

## Persona

| Database (`personas`) | Backend (`models.Persona`) | Frontend (`types.Persona`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the persona. |
| `name` (TEXT) | `Name` (string) | `name` (string) | Name of the persona. |
| `description` (TEXT) | `Description` (sql.NullString) | `description` (string, optional) | Description of the persona. |
| `persona_type` (TEXT) | `PersonaType` (PersonaTypeEnum) | `personaType` (PersonaType) | Type of the persona (DNS or HTTP). |
| `config_details` (JSONB) | `ConfigDetails` (json.RawMessage) | `configDetails` (DNSConfigDetails \| HTTPConfigDetails) | Configuration details for the persona. |
| `is_enabled` (BOOLEAN) | `IsEnabled` (bool) | `isEnabled` (boolean) | Whether the persona is enabled. |
| `created_at` (TIMESTAMPTZ) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the persona was created. |
| `updated_at` (TIMESTAMPTZ) | `UpdatedAt` (time.Time) | `updatedAt` (string) | Timestamp of when the persona was last updated. |

## Proxy

| Database (`proxies`) | Backend (`models.Proxy`) | Frontend (`types.Proxy`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the proxy. |
| `name` (TEXT) | `Name` (string) | `name` (string) | Name of the proxy. |
| `description` (TEXT) | `Description` (sql.NullString) | `description` (string, optional) | Description of the proxy. |
| `address` (TEXT) | `Address` (string) | `address` (string) | Full proxy address. |
| `protocol` (TEXT) | `Protocol` (*ProxyProtocolEnum) | `protocol` (ProxyProtocol, optional) | Protocol of the proxy. |
| `username` (TEXT) | `Username` (sql.NullString) | `username` (string, optional) | Username for proxy authentication. |
| `password_hash` (TEXT) | `PasswordHash` (sql.NullString) | - | Hashed password for proxy authentication. |
| `host` (TEXT) | `Host` (sql.NullString) | `host` (string, optional) | Hostname or IP address of the proxy. |
| `port` (INT) | `Port` (sql.NullInt32) | `port` (number, optional) | Port number of the proxy. |
| `is_enabled` (BOOLEAN) | `IsEnabled` (bool) | `isEnabled` (boolean) | Whether the proxy is enabled. |
| `is_healthy` (BOOLEAN) | `IsHealthy` (bool) | `isHealthy` (boolean) | Last known health status of the proxy. |
| `last_status` (TEXT) | `LastStatus` (sql.NullString) | `lastStatus` (string, optional) | Last reported status of the proxy. |
| `last_checked_at` (TIMESTAMPTZ) | `LastCheckedAt` (sql.NullTime) | `lastCheckedAt` (string, optional) | Timestamp of when the proxy was last checked. |
| `latency_ms` (INT) | `LatencyMs` (sql.NullInt32) | `latencyMs` (number, optional) | Last measured latency to the proxy. |
| `city` (TEXT) | `City` (sql.NullString) | `city` (string, optional) | City where the proxy is located. |
| `country_code` (TEXT) | `CountryCode` (sql.NullString) | `countryCode` (string, optional) | Country code of the proxy's location. |
| `provider` (TEXT) | `Provider` (sql.NullString) | `provider` (string, optional) | Name of the proxy provider. |
| `created_at` (TIMESTAMPTZ) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the proxy was created. |
| `updated_at` (TIMESTAMPTZ) | `UpdatedAt` (time.Time) | `updatedAt` (string) | Timestamp of when the proxy was last updated. |

## KeywordSet

| Database (`keyword_sets`) | Backend (`models.KeywordSet`) | Frontend (`types.KeywordSet`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the keyword set. |
| `name` (TEXT) | `Name` (string) | `name` (string) | Name of the keyword set. |
| `description` (TEXT) | `Description` (sql.NullString) | `description` (string, optional) | Description of the keyword set. |
| `keywords` (JSONB) | `Rules` ([]KeywordRule) | `rules` (KeywordRule[], optional) | Array of keyword rules. |
| `is_enabled` (BOOLEAN) | `IsEnabled` (bool) | `isEnabled` (boolean) | Whether the keyword set is enabled. |
| `created_at` (TIMESTAMPTZ) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the keyword set was created. |
| `updated_at` (TIMESTAMPTZ) | `UpdatedAt` (time.Time) | `updatedAt` (string) | Timestamp of when the keyword set was last updated. |

## GeneratedDomain

| Database (`generated_domains`) | Backend (`models.GeneratedDomain`) | Frontend (`types.GeneratedDomain`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the generated domain. |
| `domain_generation_campaign_id` (UUID) | `GenerationCampaignID` (uuid.UUID) | `generationCampaignId` (string) | ID of the campaign that generated this domain. |
| `domain_name` (TEXT) | `DomainName` (string) | `domainName` (string) | The generated domain name. |
| `source_keyword` (TEXT) | `SourceKeyword` (sql.NullString) | `sourceKeyword` (string, optional) | The keyword used to generate this domain. |
| `source_pattern` (TEXT) | `SourcePattern` (sql.NullString) | `sourcePattern` (string, optional) | The pattern used to generate this domain. |
| `tld` (TEXT) | `TLD` (sql.NullString) | `tld` (string, optional) | The TLD of the generated domain. |
| `offset_index` (BIGINT) | `OffsetIndex` (int64) | `offsetIndex` (number) | The offset in the generation sequence. |
| `generated_at` (TIMESTAMPTZ) | `GeneratedAt` (time.Time) | `generatedAt` (string) | Timestamp of when the domain was generated. |
| `created_at` (TIMESTAMPTZ) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the record was created. |

## DNSValidationResult

| Database (`dns_validation_results`) | Backend (`models.DNSValidationResult`) | Frontend (`types.DNSValidationResult`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the DNS validation result. |
| `dns_campaign_id` (UUID) | `DNSCampaignID` (uuid.UUID) | `dnsCampaignId` (string) | ID of the DNS validation campaign. |
| `generated_domain_id` (UUID) | `GeneratedDomainID` (uuid.NullUUID) | `generatedDomainId` (string, optional) | ID of the generated domain. |
| `domain_name` (TEXT) | `DomainName` (string) | `domainName` (string) | The domain name that was validated. |
| `validation_status` (TEXT) | `ValidationStatus` (string) | `validationStatus` (string) | Status of the DNS validation. |
| `dns_records` (JSONB) | `DNSRecords` (*json.RawMessage) | `dnsRecords` (Record<string, unknown>, optional) | DNS records found for the domain. |
| `validated_by_persona_id` (UUID) | `ValidatedByPersonaID` (uuid.NullUUID) | `validatedByPersonaId` (string, optional) | ID of the persona used for validation. |
| `attempts` (INT) | `Attempts` (*int) | `attempts` (number, optional) | Number of validation attempts. |
| `last_checked_at` (TIMESTAMPTZ) | `LastCheckedAt` (*time.Time) | `lastCheckedAt` (string, optional) | Timestamp of when the domain was last checked. |
| `created_at` (TIMESTAMPTZ) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the record was created. |

## HTTPKeywordResult

| Database (`http_keyword_results`) | Backend (`models.HTTPKeywordResult`) | Frontend (`types.HTTPKeywordResult`) | Description |
| --- | --- | --- | --- |
| `id` (UUID) | `ID` (uuid.UUID) | `id` (string) | Unique identifier for the HTTP keyword result. |
| `http_keyword_campaign_id` (UUID) | `HTTPKeywordCampaignID` (uuid.UUID) | `httpKeywordCampaignId` (string) | ID of the HTTP keyword campaign. |
| `dns_result_id` (UUID) | `DNSResultID` (uuid.NullUUID) | `dnsResultId` (string, optional) | ID of the DNS validation result. |
| `domain_name` (TEXT) | `DomainName` (string) | `domainName` (string) | The domain name that was validated. |
| `validation_status` (TEXT) | `ValidationStatus` (string) | `validationStatus` (string) | Status of the HTTP validation. |
| `http_status_code` (INT) | `HTTPStatusCode` (*int32) | `httpStatusCode` (number, optional) | HTTP status code of the response. |
| `response_headers` (JSONB) | `ResponseHeaders` (*json.RawMessage) | `responseHeaders` (Record<string, unknown>, optional) | Headers of the HTTP response. |
| `page_title` (TEXT) | `PageTitle` (*string) | `pageTitle` (string, optional) | Title of the web page. |
| `extracted_content_snippet` (TEXT) | `ExtractedContentSnippet` (*string) | `extractedContentSnippet` (string, optional) | Snippet of the extracted content. |
| `found_keywords_from_sets` (JSONB) | `FoundKeywordsFromSets` (*json.RawMessage) | `foundKeywordsFromSets` (Record<string, unknown>, optional) | Keywords found from predefined sets. |
| `found_ad_hoc_keywords` (JSONB) | `FoundAdHocKeywords` (*[]string) | `foundAdHocKeywords` (string[], optional) | Ad-hoc keywords found. |
| `content_hash` (TEXT) | `ContentHash` (*string) | `contentHash` (string, optional) | Hash of the page content. |
| `validated_by_persona_id` (UUID) | `ValidatedByPersonaID` (uuid.NullUUID) | `validatedByPersonaId` (string, optional) | ID of the persona used for validation. |
| `used_proxy_id` (UUID) | `UsedProxyID` (uuid.NullUUID) | `usedProxyId` (string, optional) | ID of the proxy used for the request. |
| `attempts` (INT) | `Attempts` (int) | `attempts` (number) | Number of validation attempts. |
| `last_checked_at` (TIMESTAMPTZ) | `LastCheckedAt` (*time.Time) | `lastCheckedAt` (string, optional) | Timestamp of when the domain was last checked. |
| `created_at` (TIMESTAMPTZ) | `CreatedAt` (time.Time) | `createdAt` (string) | Timestamp of when the record was created. |