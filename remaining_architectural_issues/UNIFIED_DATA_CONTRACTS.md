# Unified Data Contracts

This document provides the canonical "Source of Truth" data contracts for the core data entities in the system. The Go backend serves as the ultimate source of truth.

## User

| Field Name | Go (Source of Truth) | PostgreSQL | TypeScript | Notes |
|---|---|---|---|---|
| `id` | `uuid.UUID` (req) | `uuid` (PK, NOT NULL) | `string` (req) | |
| `email` | `string` (req) | `varchar(255)` (NOT NULL, UNIQUE) | `string` (req) | |
| `emailVerified` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | DB default is `FALSE`. |
| `firstName` | `string` (req) | `varchar(100)` (NOT NULL) | `string` (req) | |
| `lastName` | `string` (req) | `varchar(100)` (NOT NULL) | `string` (req) | |
| `avatarUrl` | `*string` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `isActive` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | DB default is `TRUE`. |
| `isLocked` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | DB default is `FALSE`. |
| `lastLoginAt` | `*time.Time` (opt) | `timestamp` (NULL) | `string \| null` (opt) | Mismatch: TS should be `Date \| null`. |
| `lastLoginIp` | `*net.IP` (opt) | `inet` (NULL) | `string \| null` (opt) | |
| `mustChangePassword` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | DB default is `FALSE`. |
| `mfaEnabled` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | DB default is `FALSE`. |
| `mfaLastUsedAt` | `*time.Time` (opt) | `timestamp` (NULL) | `string \| null` (opt) | Mismatch: TS should be `Date \| null`. Not in DB schema. |
| `createdAt` | `time.Time` (req) | `timestamp` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |
| `updatedAt` | `time.Time` (req) | `timestamp` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |

## Campaign

| Field Name | Go (Source of Truth) | PostgreSQL | TypeScript | Notes |
|---|---|---|---|---|
| `id` | `uuid.UUID` (req) | `uuid` (PK, NOT NULL) | `string` (req) | |
| `name` | `string` (req) | `text` (NOT NULL) | `string` (req) | |
| `campaignType` | `CampaignTypeEnum` (req) | `text` (NOT NULL, CHECK) | `CampaignType` (req) | |
| `status` | `CampaignStatusEnum` (req) | `text` (NOT NULL) | `CampaignStatus` (req) | |
| `userId` | `*uuid.UUID` (opt) | `uuid` (NULL, FK) | `string \| null` (opt) | |
| `createdAt` | `time.Time` (req) | `timestamptz` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |
| `updatedAt` | `time.Time` (req) | `timestamptz` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |
| `startedAt` | `*time.Time` (opt) | `timestamptz` (NULL) | `string \| null` (opt) | Mismatch: TS should be `Date \| null`. |
| `completedAt` | `*time.Time` (opt) | `timestamptz` (NULL) | `string \| null` (opt) | Mismatch: TS should be `Date \| null`. |
| `progressPercentage` | `*float64` (opt) | `double precision` (NULL) | `number \| null` (opt) | |
| `totalItems` | `*int64` (opt) | `bigint` (NULL) | `number \| null` (opt) | |
| `processedItems` | `*int64` (opt) | `bigint` (NULL) | `number \| null` (opt) | |
| `errorMessage` | `*string` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `successfulItems` | `*int64` (opt) | `bigint` (NULL) | `number \| null` (opt) | |
| `failedItems` | `*int64` (opt) | `bigint` (NULL) | `number \| null` (opt) | |
| `metadata` | `*json.RawMessage` (opt) | `jsonb` (NULL) | `any \| null` (opt) | |
| `estimatedCompletionAt` | `*time.Time` (opt) | Not in DB schema | `string \| null` (opt) | Mismatch: TS should be `Date \| null`. |
| `avgProcessingRate` | `*float64` (opt) | Not in DB schema | `number \| null` (opt) | |
| `lastHeartbeatAt` | `*time.Time` (opt) | Not in DB schema | `string \| null` (opt) | Mismatch: TS should be `Date \| null`. |

## Persona

| Field Name | Go (Source of Truth) | PostgreSQL | TypeScript | Notes |
|---|---|---|---|---|
| `id` | `uuid.UUID` (req) | `uuid` (PK, NOT NULL) | `string` (req) | |
| `name` | `string` (req) | `text` (NOT NULL, UNIQUE) | `string` (req) | |
| `personaType` | `PersonaTypeEnum` (req) | `text` (NOT NULL, CHECK) | `PersonaType` (req) | |
| `description` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `configDetails` | `json.RawMessage` (req) | `jsonb` (NOT NULL) | `any` (req) | |
| `isEnabled` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | |
| `createdAt` | `time.Time` (req) | `timestamptz` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |
| `updatedAt` | `time.Time` (req) | `timestamptz` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |

## Proxy

| Field Name | Go (Source of Truth) | PostgreSQL | TypeScript | Notes |
|---|---|---|---|---|
| `id` | `uuid.UUID` (req) | `uuid` (PK, NOT NULL) | `string` (req) | |
| `name` | `string` (req) | `text` (NOT NULL, UNIQUE) | `string` (req) | |
| `description` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `address` | `string` (req) | `text` (NOT NULL, UNIQUE) | `string` (req) | |
| `protocol` | `*ProxyProtocolEnum` (opt) | `text` (NULL) | `ProxyProtocol \| null` (opt) | |
| `username` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `passwordHash` | `sql.NullString` (opt) | `text` (NULL) | Not exposed to TS | |
| `host` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `port` | `sql.NullInt32` (opt) | `int` (NULL) | `number \| null` (opt) | |
| `isEnabled` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | |
| `isHealthy` | `bool` (req) | `boolean` (NOT NULL) | `boolean` (req) | |
| `lastStatus` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `lastCheckedAt` | `sql.NullTime` (opt) | `timestamptz` (NULL) | `string \| null` (opt) | Mismatch: TS should be `Date \| null`. |
| `latencyMs` | `sql.NullInt32` (opt) | `int` (NULL) | `number \| null` (opt) | |
| `city` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `countryCode` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `provider` | `sql.NullString` (opt) | `text` (NULL) | `string \| null` (opt) | |
| `createdAt` | `time.Time` (req) | `timestamptz` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |
| `updatedAt` | `time.Time` (req) | `timestamptz` (NOT NULL) | `string` (req) | Mismatch: TS should be `Date`. |