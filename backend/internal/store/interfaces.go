// File: backend/internal/store/interfaces.go
package store

import (
	"context"
	"database/sql"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx" // For sqlx.Tx
)

// Querier defines methods that can be executed by both sqlx.DB and sqlx.Tx
type Querier interface {
	GetContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
	SelectContext(ctx context.Context, dest interface{}, query string, args ...interface{}) error
	NamedExecContext(ctx context.Context, query string, arg interface{}) (sql.Result, error)
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	PrepareNamedContext(ctx context.Context, query string) (*sqlx.NamedStmt, error)
}

// Transactor defines an interface for starting and managing transactions for SQL stores.
type Transactor interface {
	BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error)
}

// CampaignStore defines the interface for campaign data operations
// Methods that can be part of a larger transaction accept an exec Querier.
// If exec is nil, the implementation should use its internal *sqlx.DB.
type CampaignStore interface {
	Transactor // Only Postgres store will meaningfully implement this

	CreateCampaign(ctx context.Context, exec Querier, campaign *models.Campaign) error
	GetCampaignByID(ctx context.Context, exec Querier, id uuid.UUID) (*models.Campaign, error)
	UpdateCampaign(ctx context.Context, exec Querier, campaign *models.Campaign) error
	DeleteCampaign(ctx context.Context, exec Querier, id uuid.UUID) error
	ListCampaigns(ctx context.Context, exec Querier, filter ListCampaignsFilter) ([]*models.Campaign, error)
	CountCampaigns(ctx context.Context, exec Querier, filter ListCampaignsFilter) (int64, error)
	UpdateCampaignStatus(ctx context.Context, exec Querier, id uuid.UUID, status models.CampaignStatusEnum, errorMessage sql.NullString) error
	UpdateCampaignProgress(ctx context.Context, exec Querier, id uuid.UUID, processedItems, totalItems int64, progressPercentage float64) error

	CreateDomainGenerationParams(ctx context.Context, exec Querier, params *models.DomainGenerationCampaignParams) error
	GetDomainGenerationParams(ctx context.Context, exec Querier, campaignID uuid.UUID) (*models.DomainGenerationCampaignParams, error)
	UpdateDomainGenerationParamsOffset(ctx context.Context, exec Querier, campaignID uuid.UUID, newOffset int64) error

	// Methods for DomainGenerationConfigState
	GetDomainGenerationConfigStateByHash(ctx context.Context, exec Querier, configHash string) (*models.DomainGenerationConfigState, error)
	CreateOrUpdateDomainGenerationConfigState(ctx context.Context, exec Querier, state *models.DomainGenerationConfigState) error

	CreateGeneratedDomains(ctx context.Context, exec Querier, domains []*models.GeneratedDomain) error
	GetGeneratedDomainsByCampaign(ctx context.Context, exec Querier, campaignID uuid.UUID, limit int, lastOffsetIndex int64) ([]*models.GeneratedDomain, error)
	CountGeneratedDomainsByCampaign(ctx context.Context, exec Querier, campaignID uuid.UUID) (int64, error)

	CreateDNSValidationParams(ctx context.Context, exec Querier, params *models.DNSValidationCampaignParams) error
	GetDNSValidationParams(ctx context.Context, exec Querier, campaignID uuid.UUID) (*models.DNSValidationCampaignParams, error)

	CreateDNSValidationResults(ctx context.Context, exec Querier, results []*models.DNSValidationResult) error
	GetDNSValidationResultsByCampaign(ctx context.Context, exec Querier, campaignID uuid.UUID, filter ListValidationResultsFilter) ([]*models.DNSValidationResult, error)
	CountDNSValidationResults(ctx context.Context, exec Querier, campaignID uuid.UUID, onlyValid bool) (int64, error)
	GetDomainsForDNSValidation(ctx context.Context, exec Querier, dnsCampaignID uuid.UUID, sourceGenerationCampaignID uuid.UUID, limit int, lastOffsetIndex int64) ([]*models.GeneratedDomain, error)

	CreateHTTPKeywordParams(ctx context.Context, exec Querier, params *models.HTTPKeywordCampaignParams) error
	GetHTTPKeywordParams(ctx context.Context, exec Querier, campaignID uuid.UUID) (*models.HTTPKeywordCampaignParams, error)

	CreateHTTPKeywordResults(ctx context.Context, exec Querier, results []*models.HTTPKeywordResult) error
	GetHTTPKeywordResultsByCampaign(ctx context.Context, exec Querier, campaignID uuid.UUID, filter ListValidationResultsFilter) ([]*models.HTTPKeywordResult, error)
	GetDomainsForHTTPValidation(ctx context.Context, exec Querier, httpKeywordCampaignID uuid.UUID, sourceCampaignID uuid.UUID, limit int, lastDomainName string) ([]*models.DNSValidationResult, error)
}

// ListCampaignsFilter and ListValidationResultsFilter remain the same

type ListCampaignsFilter struct {
	Type      models.CampaignTypeEnum
	Status    models.CampaignStatusEnum
	UserID    string
	Limit     int
	Offset    int
	SortBy    string
	SortOrder string
}

type ListValidationResultsFilter struct {
	ValidationStatus string
	HasKeywords      *bool
	Limit            int
	Offset           int
}

// PersonaStore, ProxyStore, KeywordStore, AuditLogStore: methods will accept exec Querier where transactional execution is an option.

type PersonaStore interface {
	Transactor
	CreatePersona(ctx context.Context, exec Querier, persona *models.Persona) error
	GetPersonaByID(ctx context.Context, exec Querier, id uuid.UUID) (*models.Persona, error)
	GetPersonaByName(ctx context.Context, exec Querier, name string) (*models.Persona, error)
	UpdatePersona(ctx context.Context, exec Querier, persona *models.Persona) error
	DeletePersona(ctx context.Context, exec Querier, id uuid.UUID) error
	ListPersonas(ctx context.Context, exec Querier, filter ListPersonasFilter) ([]*models.Persona, error)
}

type ListPersonasFilter struct {
	Type      models.PersonaTypeEnum
	IsEnabled *bool
	Limit     int
	Offset    int
}

type ProxyStore interface {
	Transactor
	CreateProxy(ctx context.Context, exec Querier, proxy *models.Proxy) error
	GetProxyByID(ctx context.Context, exec Querier, id uuid.UUID) (*models.Proxy, error)
	UpdateProxy(ctx context.Context, exec Querier, proxy *models.Proxy) error
	DeleteProxy(ctx context.Context, exec Querier, id uuid.UUID) error
	ListProxies(ctx context.Context, exec Querier, filter ListProxiesFilter) ([]*models.Proxy, error)
	UpdateProxyHealth(ctx context.Context, exec Querier, id uuid.UUID, isHealthy bool, latencyMs sql.NullInt32, lastCheckedAt time.Time) error
}

type ListProxiesFilter struct {
	Protocol  models.ProxyProtocolEnum
	IsEnabled *bool
	IsHealthy *bool
	Limit     int
	Offset    int
}

type KeywordStore interface {
	Transactor

	CreateKeywordSet(ctx context.Context, exec Querier, keywordSet *models.KeywordSet) error
	GetKeywordSetByID(ctx context.Context, exec Querier, id uuid.UUID) (*models.KeywordSet, error)
	GetKeywordSetByName(ctx context.Context, exec Querier, name string) (*models.KeywordSet, error)
	UpdateKeywordSet(ctx context.Context, exec Querier, keywordSet *models.KeywordSet) error
	DeleteKeywordSet(ctx context.Context, exec Querier, id uuid.UUID) error
	ListKeywordSets(ctx context.Context, exec Querier, filter ListKeywordSetsFilter) ([]*models.KeywordSet, error)

	CreateKeywordRules(ctx context.Context, exec Querier, rules []*models.KeywordRule) error
	GetKeywordRulesBySetID(ctx context.Context, exec Querier, keywordSetID uuid.UUID) ([]models.KeywordRule, error)
	UpdateKeywordRule(ctx context.Context, exec Querier, rule *models.KeywordRule) error
	DeleteKeywordRule(ctx context.Context, exec Querier, id uuid.UUID) error
	DeleteKeywordRulesBySetID(ctx context.Context, exec Querier, keywordSetID uuid.UUID) error
}

type ListKeywordSetsFilter struct {
	IsEnabled *bool
	Limit     int
	Offset    int
}

type AuditLogStore interface {
	// Audit logs are often single, append-only operations.
	// No Transactor needed. exec Querier allows running in existing Tx if caller provides one.
	CreateAuditLog(ctx context.Context, exec Querier, logEntry *models.AuditLog) error
	ListAuditLogs(ctx context.Context, exec Querier, filter ListAuditLogsFilter) ([]*models.AuditLog, error)
}

type ListAuditLogsFilter struct {
	UserID     string
	EntityType string
	EntityID   uuid.NullUUID
	Action     string
	StartDate  time.Time
	EndDate    time.Time
	Limit      int
	Offset     int
}

// CampaignJobStore: Most methods will use internal client/db directly.
// GetNextQueuedJob manages its own transaction for atomicity.
// Transactor is kept if a service needs to batch multiple job store operations into one Tx.
type CampaignJobStore interface {
	Transactor // For potential service-managed transactions involving multiple job ops

	CreateJob(ctx context.Context, exec Querier, job *models.CampaignJob) error
	GetJobByID(ctx context.Context, jobID uuid.UUID) (*models.CampaignJob, error)
	UpdateJob(ctx context.Context, exec Querier, job *models.CampaignJob) error
	GetNextQueuedJob(ctx context.Context, campaignTypes []models.CampaignTypeEnum, workerID string) (*models.CampaignJob, error)
	DeleteJob(ctx context.Context, jobID uuid.UUID) error
	ListJobs(ctx context.Context, filter ListJobsFilter) ([]*models.CampaignJob, error)
}

type ListJobsFilter struct {
	CampaignID   uuid.NullUUID
	CampaignType models.CampaignTypeEnum
	Status       models.CampaignJobStatusEnum
	Limit        int
	Offset       int
	SortBy       string
	SortOrder    string
}

func BoolPtr(b bool) *bool {
	return &b
}
