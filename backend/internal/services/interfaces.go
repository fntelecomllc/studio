// File: backend/internal/services/interfaces.go
package services

import (
	"context"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store" // Added for store.ListCampaignsFilter
	"github.com/google/uuid"
)

// --- Campaign Update Request DTOs ---
type UpdateCampaignRequest struct {
	Name                       *string                    `json:"name,omitempty"`
	Status                     *models.CampaignStatusEnum `json:"status,omitempty"`
	SourceGenerationCampaignID *uuid.UUID                 `json:"sourceGenerationCampaignId,omitempty"`
	SourceDnsCampaignID        *uuid.UUID                 `json:"sourceDnsCampaignId,omitempty"`
	KeywordSetIDs              *[]uuid.UUID               `json:"keywordSetIds,omitempty"`
	AdHocKeywords              *[]string                  `json:"adHocKeywords,omitempty"`
	PersonaIDs                 *[]uuid.UUID               `json:"personaIds,omitempty"`
	ProxyPoolID                *uuid.UUID                 `json:"proxyPoolId,omitempty"`
	ProxySelectionStrategy     *string                    `json:"proxySelectionStrategy,omitempty"`
	RotationIntervalSeconds    *int                       `json:"rotationIntervalSeconds,omitempty"`
	ProcessingSpeedPerMinute   *int                       `json:"processingSpeedPerMinute,omitempty"`
	BatchSize                  *int                       `json:"batchSize,omitempty"`
	RetryAttempts              *int                       `json:"retryAttempts,omitempty"`
	TargetHTTPPorts            *[]int                     `json:"targetHttpPorts,omitempty"`
	NumDomainsToGenerate       *int64                     `json:"numDomainsToGenerate,omitempty"`
	VariableLength             *int                       `json:"variableLength,omitempty"`
	CharacterSet               *string                    `json:"characterSet,omitempty"`
	ConstantString             *string                    `json:"constantString,omitempty"`
	TLD                        *string                    `json:"tld,omitempty"`
}

// --- Campaign Creation Request DTOs (specific to each campaign type) ---

type CreateDomainGenerationCampaignRequest struct {
	Name                 string `json:"name" validate:"required"`
	PatternType          string `json:"patternType" validate:"required,oneof=prefix suffix both"`
	VariableLength       int    `json:"variableLength" validate:"required,gt=0"`
	CharacterSet         string `json:"characterSet" validate:"required"`
	ConstantString       string `json:"constantString" validate:"required"`
	TLD                  string `json:"tld" validate:"required"`
	NumDomainsToGenerate int64     `json:"numDomainsToGenerate,omitempty" validate:"omitempty,gte=0"`
	UserID               uuid.UUID `json:"userId,omitempty"`
}

type CreateDNSValidationCampaignRequest struct {
	Name                       string      `json:"name" validate:"required"`
	SourceGenerationCampaignID uuid.UUID   `json:"sourceCampaignId" validate:"required"`
	PersonaIDs                 []uuid.UUID `json:"personaIds" validate:"required,min=1,dive,uuid"`
	RotationIntervalSeconds    int         `json:"rotationIntervalSeconds,omitempty" validate:"gte=0"`
	ProcessingSpeedPerMinute   int         `json:"processingSpeedPerMinute,omitempty" validate:"gte=0"`
	BatchSize                  int         `json:"batchSize,omitempty" validate:"gt=0"`
	RetryAttempts              int         `json:"retryAttempts,omitempty" validate:"gte=0"`
	UserID                     uuid.UUID   `json:"userId,omitempty"`
}

type CreateHTTPKeywordCampaignRequest struct {
	Name                     string      `json:"name" validate:"required"`
	SourceCampaignID         uuid.UUID   `json:"sourceCampaignId" validate:"required"`
	KeywordSetIDs            []uuid.UUID `json:"keywordSetIds,omitempty" validate:"omitempty,dive,uuid"`
	AdHocKeywords            []string    `json:"adHocKeywords,omitempty" validate:"omitempty,dive,min=1"`
	PersonaIDs               []uuid.UUID `json:"personaIds" validate:"required,min=1,dive,uuid"`
	ProxyPoolID              *uuid.UUID  `json:"proxyPoolId,omitempty"`
	ProxySelectionStrategy   string      `json:"proxySelectionStrategy,omitempty"`
	RotationIntervalSeconds  int         `json:"rotationIntervalSeconds,omitempty" validate:"gte=0"`
	ProcessingSpeedPerMinute int         `json:"processingSpeedPerMinute,omitempty" validate:"gte=0"`
	BatchSize                int         `json:"batchSize,omitempty" validate:"gt=0"`
	RetryAttempts            int         `json:"retryAttempts,omitempty" validate:"gte=0"`
	TargetHTTPPorts          []int       `json:"targetHttpPorts,omitempty" validate:"omitempty,dive,gt=0,lte=65535"`
	UserID                   uuid.UUID   `json:"userId,omitempty"`
}

// --- Campaign Result Response DTOs ---

type GeneratedDomainsResponse struct {
	Data       []models.GeneratedDomain `json:"data"`
	NextCursor int64                    `json:"nextCursor,omitempty"` // Represents the last offset_index for the next query
	TotalCount int64                    `json:"totalCount"`
}

type DNSValidationResultsResponse struct {
	Data       []models.DNSValidationResult `json:"data"`
	NextCursor string                       `json:"nextCursor,omitempty"` // Represents the last domain_name for the next query
	TotalCount int64                        `json:"totalCount"`
}

type HTTPKeywordResultsResponse struct {
	Data       []models.HTTPKeywordResult `json:"data"`
	NextCursor string                     `json:"nextCursor,omitempty"` // Represents the last domain_name for the next query
	TotalCount int64                      `json:"totalCount"`
}

// --- Service Interfaces ---

// CampaignOrchestratorService defines the interface for managing the lifecycle of all campaigns.
type CampaignOrchestratorService interface {
	CreateDomainGenerationCampaign(ctx context.Context, req CreateDomainGenerationCampaignRequest) (*models.Campaign, error)
	CreateDNSValidationCampaign(ctx context.Context, req CreateDNSValidationCampaignRequest) (*models.Campaign, error)
	CreateHTTPKeywordCampaign(ctx context.Context, req CreateHTTPKeywordCampaignRequest) (*models.Campaign, error)

	GetCampaignDetails(ctx context.Context, campaignID uuid.UUID) (*models.Campaign, interface{}, error) // Stays as interface{} for flexibility at orchestrator level
	GetCampaignStatus(ctx context.Context, campaignID uuid.UUID) (models.CampaignStatusEnum, *float64, error)
	ListCampaigns(ctx context.Context, filter store.ListCampaignsFilter) ([]models.Campaign, int64, error)

	// Methods for fetching campaign results
	GetGeneratedDomainsForCampaign(ctx context.Context, campaignID uuid.UUID, limit int, cursor int64) (*GeneratedDomainsResponse, error)
	GetDNSValidationResultsForCampaign(ctx context.Context, campaignID uuid.UUID, limit int, cursor string, filter store.ListValidationResultsFilter) (*DNSValidationResultsResponse, error)
	GetHTTPKeywordResultsForCampaign(ctx context.Context, campaignID uuid.UUID, limit int, cursor string, filter store.ListValidationResultsFilter) (*HTTPKeywordResultsResponse, error)

	StartCampaign(ctx context.Context, campaignID uuid.UUID) error
	PauseCampaign(ctx context.Context, campaignID uuid.UUID) error
	ResumeCampaign(ctx context.Context, campaignID uuid.UUID) error
	CancelCampaign(ctx context.Context, campaignID uuid.UUID) error
	UpdateCampaign(ctx context.Context, campaignID uuid.UUID, req UpdateCampaignRequest) (*models.Campaign, error)
	DeleteCampaign(ctx context.Context, campaignID uuid.UUID) error
	SetCampaignErrorStatus(ctx context.Context, campaignID uuid.UUID, errorMessage string) error
	SetCampaignStatus(ctx context.Context, campaignID uuid.UUID, status models.CampaignStatusEnum) error
}

// DomainGenerationService defines the interface for domain generation campaign logic.
type DomainGenerationService interface {
	// CreateCampaign creates a new domain generation campaign and its associated parameters.
	// It handles the specific logic for domain generation setup, including config hashing and state management.
	CreateCampaign(ctx context.Context, req CreateDomainGenerationCampaignRequest) (*models.Campaign, error)
	// GetCampaignDetails retrieves the base campaign and its specific domain generation parameters.
	GetCampaignDetails(ctx context.Context, campaignID uuid.UUID) (*models.Campaign, *models.DomainGenerationCampaignParams, error)
	ProcessGenerationCampaignBatch(ctx context.Context, campaignID uuid.UUID) (done bool, processedCount int, err error)
}

// DNSCampaignService defines the interface for DNS validation campaign logic.
type DNSCampaignService interface {
	// CreateCampaign creates a new DNS validation campaign and its associated parameters.
	CreateCampaign(ctx context.Context, req CreateDNSValidationCampaignRequest) (*models.Campaign, error)
	// GetCampaignDetails retrieves the base campaign and its specific DNS validation parameters.
	GetCampaignDetails(ctx context.Context, campaignID uuid.UUID) (*models.Campaign, *models.DNSValidationCampaignParams, error)
	ProcessDNSValidationCampaignBatch(ctx context.Context, campaignID uuid.UUID) (done bool, processedCount int, err error)
}

// HTTPKeywordCampaignService defines the interface for HTTP & Keyword validation campaign logic.
type HTTPKeywordCampaignService interface {
	// CreateCampaign creates a new HTTP & Keyword campaign and its associated parameters.
	CreateCampaign(ctx context.Context, req CreateHTTPKeywordCampaignRequest) (*models.Campaign, error)
	// GetCampaignDetails retrieves the base campaign and its specific HTTP & Keyword validation parameters.
	GetCampaignDetails(ctx context.Context, campaignID uuid.UUID) (*models.Campaign, *models.HTTPKeywordCampaignParams, error)
	ProcessHTTPKeywordCampaignBatch(ctx context.Context, campaignID uuid.UUID) (done bool, processedCount int, err error)
}

// CampaignWorkerService manages the pool of background workers that process campaign jobs.
type CampaignWorkerService interface {
	StartWorkers(ctx context.Context, numWorkers int)
}
