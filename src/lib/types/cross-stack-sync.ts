// src/lib/types/cross-stack-sync.ts
// CRITICAL: Cross-stack schema synchronization types
// This file maintains perfect alignment between database schema, backend Go structs, and frontend TypeScript types

// ===== AUTHENTICATION TYPES - SYNCHRONIZED WITH BACKEND =====

// Validation status enums matching backend exactly
export const ValidationStatus = {
  PENDING: 'pending',
  VALID: 'valid',
  INVALID: 'invalid',
  ERROR: 'error',
  SKIPPED: 'skipped',
} as const;

export const DNSValidationStatus = {
  RESOLVED: 'resolved',
  UNRESOLVED: 'unresolved',
  TIMEOUT: 'timeout',
  ERROR: 'error',
} as const;

export const HTTPValidationStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  ERROR: 'error',
} as const;

export const CampaignStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSING: 'pausing',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ARCHIVED: 'archived',
  CANCELLED: 'cancelled',
} as const;

export const CampaignJobStatus = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY: 'retry',
} as const;

export const CampaignType = {
  DOMAIN_GENERATION: 'domain_generation',
  DNS_VALIDATION: 'dns_validation',
  HTTP_KEYWORD_VALIDATION: 'http_keyword_validation',
} as const;

export const PersonaType = {
  DNS: 'dns',
  HTTP: 'http',
} as const;

export const ProxyProtocol = {
  HTTP: 'http',
  HTTPS: 'https',
  SOCKS4: 'socks4',
  SOCKS5: 'socks5',
} as const;

// Type definitions matching backend Go structs exactly
export type ValidationStatusType = typeof ValidationStatus[keyof typeof ValidationStatus];
export type DNSValidationStatusType = typeof DNSValidationStatus[keyof typeof DNSValidationStatus];
export type HTTPValidationStatusType = typeof HTTPValidationStatus[keyof typeof HTTPValidationStatus];
export type CampaignStatusType = typeof CampaignStatus[keyof typeof CampaignStatus];
export type CampaignJobStatusType = typeof CampaignJobStatus[keyof typeof CampaignJobStatus];
export type CampaignTypeType = typeof CampaignType[keyof typeof CampaignType];
export type PersonaTypeType = typeof PersonaType[keyof typeof PersonaType];
export type ProxyProtocolType = typeof ProxyProtocol[keyof typeof ProxyProtocol];

// ===== SESSION SECURITY TYPES =====

// Enhanced session interface matching database auth.sessions table exactly
export interface SessionSecurity {
  id: string;                      // VARCHAR(128) PRIMARY KEY
  userId: string;                  // UUID REFERENCES auth.users(id)
  ipAddress?: string;              // INET
  userAgent?: string;              // TEXT
  userAgentHash?: string;          // VARCHAR(64) - SHA-256 hash
  sessionFingerprint?: string;     // VARCHAR(255) - SHA-256 hash
  browserFingerprint?: string;     // TEXT - Enhanced fingerprinting
  screenResolution?: string;       // VARCHAR(20) - Screen resolution
  isActive: boolean;               // BOOLEAN DEFAULT TRUE
  expiresAt: string;              // TIMESTAMP NOT NULL
  lastActivityAt: string;         // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  createdAt: string;              // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
}

// Enhanced User interface matching auth.users table exactly
export interface UserSecurity {
  id: string;                      // UUID PRIMARY KEY
  email: string;                   // VARCHAR(255) UNIQUE NOT NULL
  emailVerified: boolean;          // BOOLEAN DEFAULT FALSE
  emailVerificationToken?: string; // VARCHAR(255)
  emailVerificationExpires?: string; // TIMESTAMP
  firstName: string;               // VARCHAR(100) NOT NULL
  lastName: string;                // VARCHAR(100) NOT NULL
  avatarUrl?: string;              // TEXT
  isActive: boolean;               // BOOLEAN DEFAULT TRUE
  isLocked: boolean;               // BOOLEAN DEFAULT FALSE
  failedLoginAttempts: number;     // INTEGER DEFAULT 0
  lockedUntil?: string;            // TIMESTAMP
  lastLoginAt?: string;            // TIMESTAMP
  lastLoginIp?: string;            // INET
  passwordChangedAt: string;       // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  mustChangePassword: boolean;     // BOOLEAN DEFAULT FALSE
  
  // MFA support fields
  mfaEnabled: boolean;             // BOOLEAN DEFAULT FALSE
  mfaLastUsedAt?: string;          // TIMESTAMP
  
  createdAt: string;               // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  updatedAt: string;               // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  
  // Computed fields
  roles: RoleSecurity[];
  permissions: PermissionSecurity[];
}

// Role interface matching auth.roles table exactly
export interface RoleSecurity {
  id: string;                      // UUID PRIMARY KEY
  name: string;                    // VARCHAR(50) UNIQUE NOT NULL
  displayName: string;             // VARCHAR(100) NOT NULL
  description?: string;            // TEXT
  isSystemRole: boolean;           // BOOLEAN DEFAULT FALSE
  createdAt: string;               // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  updatedAt: string;               // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  
  // Computed fields
  permissions?: PermissionSecurity[];
}

// Permission interface matching auth.permissions table exactly
export interface PermissionSecurity {
  id: string;                      // UUID PRIMARY KEY
  name: string;                    // VARCHAR(100) UNIQUE NOT NULL
  displayName: string;             // VARCHAR(150) NOT NULL
  description?: string;            // TEXT
  resource: string;                // VARCHAR(50) NOT NULL
  action: string;                  // VARCHAR(20) NOT NULL
  createdAt: string;               // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
}

// Enhanced audit log matching auth.auth_audit_log table exactly
export interface AuthAuditLogSecurity {
  id: number;                      // BIGSERIAL PRIMARY KEY
  userId?: string;                 // UUID REFERENCES auth.users(id)
  sessionId?: string;              // VARCHAR(128)
  eventType: string;               // VARCHAR(50) NOT NULL
  eventStatus: string;             // VARCHAR(20) NOT NULL
  ipAddress?: string;              // INET
  userAgent?: string;              // TEXT
  sessionFingerprint?: string;     // VARCHAR(255)
  securityFlags?: Record<string, unknown>; // JSONB
  details?: Record<string, unknown>; // JSONB
  riskScore: number;               // INTEGER DEFAULT 0
  createdAt: string;               // TIMESTAMP DEFAULT CURRENT_TIMESTAMP
}

// ===== CAMPAIGN TYPES SYNCHRONIZED WITH BACKEND =====

// Campaign interface matching campaigns table exactly
export interface CampaignSynced {
  id: string;                      // UUID PRIMARY KEY
  name: string;                    // TEXT NOT NULL
  campaignType: CampaignTypeType;  // TEXT NOT NULL CHECK (campaign_type IN (...))
  status: CampaignStatusType;      // TEXT NOT NULL
  userId?: string;                 // UUID REFERENCES auth.users(id)
  totalItems?: number;             // BIGINT DEFAULT 0
  processedItems?: number;         // BIGINT DEFAULT 0
  successfulItems?: number;        // BIGINT DEFAULT 0
  failedItems?: number;            // BIGINT DEFAULT 0
  progressPercentage?: number;     // DOUBLE PRECISION DEFAULT 0.0
  metadata?: Record<string, unknown>; // JSONB
  createdAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updatedAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  startedAt?: string;              // TIMESTAMPTZ
  completedAt?: string;            // TIMESTAMPTZ
  errorMessage?: string;           // TEXT
  estimatedCompletionAt?: string;  // TIMESTAMPTZ
  avgProcessingRate?: number;      // DOUBLE PRECISION
  lastHeartbeatAt?: string;        // TIMESTAMPTZ
}

// Domain Generation Params matching domain_generation_campaign_params table exactly
export interface DomainGenerationParamsSynced {
  campaignId: string;              // UUID PRIMARY KEY REFERENCES campaigns(id)
  patternType: string;             // TEXT NOT NULL
  variableLength?: number;         // INT
  characterSet?: string;           // TEXT
  constantString?: string;         // TEXT
  tld: string;                     // TEXT NOT NULL
  numDomainsToGenerate: number;    // INT NOT NULL
  totalPossibleCombinations: number; // BIGINT NOT NULL
  currentOffset: number;           // BIGINT NOT NULL DEFAULT 0
  generationRatePerSecond?: number; // DOUBLE PRECISION
  estimatedCompletionTime?: string; // INTERVAL as string
}

// Generated Domain matching generated_domains table exactly
export interface GeneratedDomainSynced {
  id: string;                      // UUID PRIMARY KEY
  domainGenerationCampaignId: string; // UUID NOT NULL REFERENCES campaigns(id)
  domainName: string;              // TEXT NOT NULL
  sourceKeyword?: string;          // TEXT
  sourcePattern?: string;          // TEXT
  tld?: string;                    // TEXT
  offsetIndex: number;             // BIGINT NOT NULL DEFAULT 0
  validationStatus: ValidationStatusType; // TEXT DEFAULT 'pending'
  generatedAt: string;             // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  createdAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  generationBatchId?: string;      // UUID
  validationAttempts: number;      // INTEGER DEFAULT 0
  lastValidationAt?: string;       // TIMESTAMPTZ
}

// DNS Validation Params matching dns_validation_params table exactly
export interface DNSValidationParamsSynced {
  campaignId: string;              // UUID PRIMARY KEY REFERENCES campaigns(id)
  sourceGenerationCampaignId?: string; // UUID REFERENCES campaigns(id)
  personaIds: string[];            // UUID[] NOT NULL
  rotationIntervalSeconds?: number; // INT DEFAULT 0
  processingSpeedPerMinute?: number; // INT DEFAULT 0
  batchSize?: number;              // INT DEFAULT 50
  retryAttempts?: number;          // INT DEFAULT 1
  metadata?: Record<string, unknown>; // JSONB
  parallelWorkers?: number;        // INT DEFAULT 1
  timeoutSeconds?: number;         // INT DEFAULT 30
}

// DNS Validation Result matching dns_validation_results table exactly
export interface DNSValidationResultSynced {
  id: string;                      // UUID PRIMARY KEY
  dnsCampaignId: string;           // UUID NOT NULL REFERENCES campaigns(id)
  generatedDomainId?: string;      // UUID REFERENCES generated_domains(id)
  domainName: string;              // TEXT NOT NULL
  validationStatus: string;        // TEXT NOT NULL
  dnsRecords?: Record<string, unknown>; // JSONB
  validatedByPersonaId?: string;   // UUID REFERENCES personas(id)
  attempts?: number;               // INT DEFAULT 0
  lastCheckedAt?: string;          // TIMESTAMPTZ
  createdAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  responseTimeMs?: number;         // INTEGER
  errorDetails?: Record<string, unknown>; // JSONB
  resolverIp?: string;             // INET
}

// HTTP Keyword Params matching http_keyword_campaign_params table exactly
export interface HTTPKeywordParamsSynced {
  campaignId: string;              // UUID PRIMARY KEY REFERENCES campaigns(id)
  sourceCampaignId: string;        // UUID NOT NULL REFERENCES campaigns(id)
  sourceType: string;              // TEXT NOT NULL CHECK (source_type IN (...))
  personaIds: string[];            // UUID[] NOT NULL
  keywordSetIds?: string[];        // UUID[]
  adHocKeywords?: string[];        // TEXT[]
  proxyIds?: string[];             // UUID[]
  proxyPoolId?: string;            // UUID
  proxySelectionStrategy?: string; // TEXT
  rotationIntervalSeconds?: number; // INT DEFAULT 0
  processingSpeedPerMinute?: number; // INT DEFAULT 0
  batchSize?: number;              // INT DEFAULT 10
  retryAttempts?: number;          // INT DEFAULT 1
  targetHttpPorts?: number[];      // INT[]
  lastProcessedDomainName?: string; // TEXT
  metadata?: Record<string, unknown>; // JSONB
  followRedirects?: boolean;       // BOOLEAN DEFAULT TRUE
  maxRedirects?: number;           // INT DEFAULT 5
  requestTimeoutSeconds?: number;  // INT DEFAULT 30
}

// HTTP Keyword Result matching http_keyword_results table exactly
export interface HTTPKeywordResultSynced {
  id: string;                      // UUID PRIMARY KEY
  httpKeywordCampaignId: string;   // UUID NOT NULL REFERENCES campaigns(id)
  dnsResultId?: string;            // UUID REFERENCES dns_validation_results(id)
  domainName: string;              // TEXT NOT NULL
  validationStatus: string;        // TEXT NOT NULL
  httpStatusCode?: number;         // INT
  responseHeaders?: Record<string, unknown>; // JSONB
  pageTitle?: string;              // TEXT
  extractedContentSnippet?: string; // TEXT
  foundKeywordsFromSets?: Record<string, unknown>; // JSONB
  foundAdHocKeywords?: string[];   // JSONB as string[]
  contentHash?: string;            // TEXT
  validatedByPersonaId?: string;   // UUID REFERENCES personas(id)
  usedProxyId?: string;            // UUID REFERENCES proxies(id)
  attempts: number;                // INT DEFAULT 0
  lastCheckedAt?: string;          // TIMESTAMPTZ
  createdAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  responseTimeMs?: number;         // INTEGER
  contentLength?: number;          // BIGINT
  finalUrl?: string;               // TEXT
  redirectCount?: number;          // INT DEFAULT 0
  sslCertValid?: boolean;          // BOOLEAN
  securityHeaders?: Record<string, unknown>; // JSONB
}

// ===== PERSONA TYPES SYNCHRONIZED WITH BACKEND =====

// Persona interface matching personas table exactly
export interface PersonaSynced {
  id: string;                      // UUID PRIMARY KEY
  name: string;                    // TEXT NOT NULL
  description?: string;            // TEXT
  personaType: PersonaTypeType;    // TEXT NOT NULL CHECK (persona_type IN ('dns', 'http'))
  configDetails: Record<string, unknown>; // JSONB NOT NULL
  isEnabled: boolean;              // BOOLEAN NOT NULL DEFAULT TRUE
  createdAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updatedAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  lastUsedAt?: string;             // TIMESTAMPTZ
  usageCount?: number;             // BIGINT DEFAULT 0
  successRate?: number;            // DOUBLE PRECISION
  avgResponseTimeMs?: number;      // INTEGER
}

// ===== PROXY TYPES SYNCHRONIZED WITH BACKEND =====

// Proxy interface matching proxies table exactly
export interface ProxySynced {
  id: string;                      // UUID PRIMARY KEY
  name: string;                    // TEXT NOT NULL UNIQUE
  description?: string;            // TEXT
  address: string;                 // TEXT NOT NULL UNIQUE
  protocol?: ProxyProtocolType;    // TEXT
  username?: string;               // TEXT
  passwordHash?: string;           // TEXT (hidden from JSON)
  host?: string;                   // TEXT
  port?: number;                   // INT
  isEnabled: boolean;              // BOOLEAN NOT NULL DEFAULT TRUE
  isHealthy: boolean;              // BOOLEAN NOT NULL DEFAULT TRUE
  lastStatus?: string;             // TEXT
  lastCheckedAt?: string;          // TIMESTAMPTZ
  latencyMs?: number;              // INT
  city?: string;                   // TEXT
  countryCode?: string;            // TEXT
  provider?: string;               // TEXT
  createdAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  updatedAt: string;               // TIMESTAMPTZ NOT NULL DEFAULT NOW()
  successRate?: number;            // DOUBLE PRECISION
  totalRequests?: number;          // BIGINT DEFAULT 0
  failedRequests?: number;         // BIGINT DEFAULT 0
  avgResponseTimeMs?: number;      // INTEGER
  lastErrorMessage?: string;       // TEXT
  consecutiveFailures?: number;    // INT DEFAULT 0
}

// ===== REQUEST/RESPONSE TYPES FOR SESSION-BASED AUTH =====

// Login request matching backend LoginRequest exactly
export interface LoginRequestSynced {
  email: string;                   // string `json:"email" binding:"required,email"`
  password: string;                // string `json:"password" binding:"required,min=12"`
  rememberMe?: boolean;            // bool   `json:"rememberMe"`
  captchaToken?: string;           // string `json:"captchaToken"`
}

// Login response matching backend LoginResponse exactly
export interface LoginResponseSynced {
  success: boolean;                // bool   `json:"success"`
  user?: UserSecurity;             // *User  `json:"user,omitempty"`
  error?: string;                  // string `json:"error,omitempty"`
  requiresCaptcha?: boolean;       // bool   `json:"requires_captcha,omitempty"`
  sessionId?: string;              // string `json:"sessionId,omitempty"`
  expiresAt?: string;              // string `json:"expiresAt,omitempty"`
}

// Security context matching backend SecurityContext exactly
export interface SecurityContextSynced {
  userId: string;                  // uuid.UUID `json:"userId"`
  sessionId: string;               // string    `json:"sessionId"`
  lastActivity: string;            // time.Time `json:"lastActivity"`
  sessionExpiry: string;           // time.Time `json:"sessionExpiry"`
  requiresPasswordChange: boolean; // bool      `json:"requiresPasswordChange"`
  riskScore: number;               // int       `json:"riskScore"`
  permissions: string[];           // []string  `json:"permissions"`
  roles: string[];                 // []string  `json:"roles"`
}

// ===== TYPE GUARDS AND VALIDATORS =====

export function isValidationStatus(status: string): status is ValidationStatusType {
  return Object.values(ValidationStatus).includes(status as ValidationStatusType);
}

export function isCampaignStatus(status: string): status is CampaignStatusType {
  return Object.values(CampaignStatus).includes(status as CampaignStatusType);
}

export function isCampaignType(type: string): type is CampaignTypeType {
  return Object.values(CampaignType).includes(type as CampaignTypeType);
}

export function isPersonaType(type: string): type is PersonaTypeType {
  return Object.values(PersonaType).includes(type as PersonaTypeType);
}

export function isProxyProtocol(protocol: string): protocol is ProxyProtocolType {
  return Object.values(ProxyProtocol).includes(protocol as ProxyProtocolType);
}

// ===== MIGRATION HELPERS =====

// Helper to convert between legacy and new User interfaces
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertUserToSynced(user: any): UserSecurity {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified ?? user.email_verified ?? false,
    firstName: user.firstName ?? user.first_name ?? '',
    lastName: user.lastName ?? user.last_name ?? '',
    avatarUrl: user.avatarUrl ?? user.avatar_url,
    isActive: user.isActive ?? user.is_active ?? false,
    isLocked: user.isLocked ?? user.is_locked ?? false,
    failedLoginAttempts: user.failedLoginAttempts ?? 0,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt ?? user.last_login_at,
    lastLoginIp: user.lastLoginIp ?? user.last_login_ip,
    passwordChangedAt: user.passwordChangedAt ?? user.password_changed_at ?? new Date().toISOString(),
    mustChangePassword: user.mustChangePassword ?? user.must_change_password ?? false,
    mfaEnabled: user.mfaEnabled ?? false,
    mfaLastUsedAt: user.mfaLastUsedAt,
    createdAt: user.createdAt ?? user.created_at ?? new Date().toISOString(),
    updatedAt: user.updatedAt ?? user.updated_at ?? new Date().toISOString(),
    roles: user.roles ?? [],
    permissions: user.permissions ?? [],
  };
}

// Helper to convert between legacy and new Campaign interfaces
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertCampaignToSynced(campaign: any): CampaignSynced {
  return {
    id: campaign.id,
    name: campaign.name ?? campaign.campaignName ?? '',
    campaignType: campaign.campaignType ?? campaign.selectedType ?? CampaignType.DOMAIN_GENERATION,
    status: campaign.status ?? CampaignStatus.PENDING,
    userId: campaign.userId ?? campaign.user_id,
    totalItems: campaign.totalItems,
    processedItems: campaign.processedItems,
    successfulItems: campaign.successfulItems,
    failedItems: campaign.failedItems,
    progressPercentage: campaign.progressPercentage ?? campaign.progress,
    metadata: campaign.metadata,
    createdAt: campaign.createdAt ?? campaign.created_at ?? new Date().toISOString(),
    updatedAt: campaign.updatedAt ?? campaign.updated_at ?? new Date().toISOString(),
    startedAt: campaign.startedAt ?? campaign.started_at,
    completedAt: campaign.completedAt ?? campaign.completed_at,
    errorMessage: campaign.errorMessage ?? campaign.error_message ?? campaign.lastErrorMessage,
    estimatedCompletionAt: campaign.estimatedCompletionAt,
    avgProcessingRate: campaign.avgProcessingRate,
    lastHeartbeatAt: campaign.lastHeartbeatAt,
  };
}

// Note: All types are exported individually above
// This ensures perfect cross-stack synchronization between:
// - Database schema (PostgreSQL)
// - Backend Go structs
// - Frontend TypeScript types