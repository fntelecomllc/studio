// File: backend/internal/services/campaign_orchestrator_service.go
package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type campaignOrchestratorServiceImpl struct {
	db               *sqlx.DB
	campaignStore    store.CampaignStore
	personaStore     store.PersonaStore
	keywordStore     store.KeywordStore
	auditLogStore    store.AuditLogStore
	campaignJobStore store.CampaignJobStore

	// Specialized services
	domainGenService   DomainGenerationService
	dnsService         DNSCampaignService
	httpKeywordService HTTPKeywordCampaignService

	// State machine for campaign status transitions
	stateMachine *CampaignStateMachine
}

func NewCampaignOrchestratorService(
	db *sqlx.DB,
	cs store.CampaignStore, ps store.PersonaStore, ks store.KeywordStore, as store.AuditLogStore, cjs store.CampaignJobStore,
	dgs DomainGenerationService, dNSService DNSCampaignService, hkService HTTPKeywordCampaignService,
) CampaignOrchestratorService {
	return &campaignOrchestratorServiceImpl{
		db:                 db,
		campaignStore:      cs,
		personaStore:       ps,
		keywordStore:       ks,
		auditLogStore:      as,
		campaignJobStore:   cjs,
		domainGenService:   dgs,
		dnsService:         dNSService,
		httpKeywordService: hkService,
		stateMachine:       NewCampaignStateMachine(),
	}
}

func (s *campaignOrchestratorServiceImpl) CreateDomainGenerationCampaign(ctx context.Context, req CreateDomainGenerationCampaignRequest) (*models.Campaign, error) {
	log.Printf("Orchestrator: Delegating CreateDomainGenerationCampaign for Name: %s", req.Name)
	return s.domainGenService.CreateCampaign(ctx, req)
}

func (s *campaignOrchestratorServiceImpl) CreateDNSValidationCampaign(ctx context.Context, req CreateDNSValidationCampaignRequest) (*models.Campaign, error) {
	log.Printf("Orchestrator: Delegating CreateDNSValidationCampaign for Name: %s", req.Name)
	return s.dnsService.CreateCampaign(ctx, req)
}

func (s *campaignOrchestratorServiceImpl) CreateHTTPKeywordCampaign(ctx context.Context, req CreateHTTPKeywordCampaignRequest) (*models.Campaign, error) {
	log.Printf("Orchestrator: Delegating CreateHTTPKeywordCampaign for Name: %s", req.Name)
	return s.httpKeywordService.CreateCampaign(ctx, req)
}

func (s *campaignOrchestratorServiceImpl) GetCampaignDetails(ctx context.Context, campaignID uuid.UUID) (*models.Campaign, interface{}, error) {
	fmt.Printf("[DEBUG orchestrator] GetCampaignDetails called for campaign ID: %s\n", campaignID)
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}
	baseCampaign, err := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if err != nil {
		fmt.Printf("[DEBUG orchestrator] Error getting campaign: %v\n", err)
		return nil, nil, fmt.Errorf("orchestrator: get campaign failed: %w", err)
	}
	fmt.Printf("[DEBUG orchestrator] Campaign type: %s\n", baseCampaign.CampaignType)

	var specificParams interface{}
	var specificErr error

	fmt.Printf("[DEBUG orchestrator] Entering switch for campaign type: %s\n", baseCampaign.CampaignType)
	switch baseCampaign.CampaignType {
	case models.CampaignTypeDomainGeneration:
		fmt.Printf("[DEBUG orchestrator] Handling DomainGeneration case\n")
		_, params, errGet := s.domainGenService.GetCampaignDetails(ctx, campaignID)
		if errGet != nil {
			specificErr = fmt.Errorf("orchestrator: get domain gen params failed: %w", errGet)
		} else {
			specificParams = params
			baseCampaign.DomainGenerationParams = params
		}
	case models.CampaignTypeDNSValidation:
		fmt.Printf("[DEBUG orchestrator] Handling DNSValidation case\n")
		_, params, errGet := s.dnsService.GetCampaignDetails(ctx, campaignID)
		if errGet != nil {
			specificErr = fmt.Errorf("orchestrator: get dns validation params failed: %w", errGet)
		} else {
			specificParams = params
			baseCampaign.DNSValidationParams = params
		}
	case models.CampaignTypeHTTPKeywordValidation:
		fmt.Printf("[DEBUG orchestrator] Handling HTTPKeywordValidation case\n")
		fmt.Printf("[DEBUG orchestrator] Calling httpKeywordService.GetCampaignDetails for campaign ID: %s\n", campaignID)
		_, params, errGet := s.httpKeywordService.GetCampaignDetails(ctx, campaignID)
		if errGet != nil {
			fmt.Printf("[DEBUG orchestrator] Error from httpKeywordService.GetCampaignDetails: %v\n", errGet)
			specificErr = fmt.Errorf("orchestrator: get http keyword params failed: %w", errGet)
		} else {
			fmt.Printf("[DEBUG orchestrator] httpKeywordService.GetCampaignDetails returned params: %+v\n", params)
			typeStr := fmt.Sprintf("%T", params)
			fmt.Printf("[DEBUG orchestrator] (before assign) params type: %s, ptr: %p, PersonaIDs: %+v (len=%d)\n", typeStr, params, params.PersonaIDs, len(params.PersonaIDs))

			// Detailed inspection of incoming PersonaIDs
			if len(params.PersonaIDs) > 0 {
				fmt.Printf("[DEBUG orchestrator] First PersonaID from service: %s\n", params.PersonaIDs[0])
			} else {
				fmt.Printf("[DEBUG orchestrator] WARNING: Incoming PersonaIDs slice is empty!\n")
			}

			// Create a new instance of HTTPKeywordCampaignParams with all fields copied
			// This ensures we don't lose the PersonaIDs during assignment
			newParams := &models.HTTPKeywordCampaignParams{
				CampaignID:       params.CampaignID,
				SourceCampaignID: params.SourceCampaignID,
				// KeywordSetIDs and PersonaIDs are not pointers to slices in the model, direct copy is fine.
				KeywordSetIDs:            make([]uuid.UUID, len(params.KeywordSetIDs)),
				PersonaIDs:               make([]uuid.UUID, len(params.PersonaIDs)),
				ProxyPoolID:              params.ProxyPoolID,
				ProxySelectionStrategy:   params.ProxySelectionStrategy,
				RotationIntervalSeconds:  params.RotationIntervalSeconds,  // These are *int, direct assignment of pointer is fine
				ProcessingSpeedPerMinute: params.ProcessingSpeedPerMinute, // *int
				BatchSize:                params.BatchSize,                // *int
				RetryAttempts:            params.RetryAttempts,            // *int
				LastProcessedDomainName:  params.LastProcessedDomainName,  // *string
				SourceType:               params.SourceType,
				Metadata:                 params.Metadata, // *json.RawMessage
			}

			// Deep copy for slices that are pointers in the model
			if params.AdHocKeywords != nil {
				adhocCopy := make([]string, len(*params.AdHocKeywords))
				copy(adhocCopy, *params.AdHocKeywords)
				newParams.AdHocKeywords = &adhocCopy
			} else {
				newParams.AdHocKeywords = nil
			}

			if params.TargetHTTPPorts != nil {
				targetPortsCopy := make([]int, len(*params.TargetHTTPPorts))
				copy(targetPortsCopy, *params.TargetHTTPPorts)
				newParams.TargetHTTPPorts = &targetPortsCopy
			} else {
				newParams.TargetHTTPPorts = nil
			}

			if params.ProxyIDs != nil {
				proxyIDsCopy := make([]uuid.UUID, len(*params.ProxyIDs))
				copy(proxyIDsCopy, *params.ProxyIDs)
				newParams.ProxyIDs = &proxyIDsCopy
			} else {
				newParams.ProxyIDs = nil
			}

			// Copy non-pointer slice contents
			copy(newParams.KeywordSetIDs, params.KeywordSetIDs)
			copy(newParams.PersonaIDs, params.PersonaIDs)

			fmt.Printf("[DEBUG orchestrator] Created deep copy with PersonaIDs: %+v (len=%d)\n", newParams.PersonaIDs, len(newParams.PersonaIDs))

			// Explicitly set the specificParams first
			specificParams = newParams

			// Then set the baseCampaign.HTTPKeywordValidationParams
			baseCampaign.HTTPKeywordValidationParams = newParams

			// Verify both pointers are the same
			fmt.Printf("[DEBUG orchestrator] specificParams ptr: %p\n", specificParams)
			fmt.Printf("[DEBUG orchestrator] baseCampaign.HTTPKeywordValidationParams ptr: %p\n", baseCampaign.HTTPKeywordValidationParams)

			// Final verification of PersonaIDs
			fmt.Printf("[DEBUG orchestrator] (after assign) baseCampaign.HTTPKeywordValidationParams type: %T, ptr: %p\n", baseCampaign.HTTPKeywordValidationParams, baseCampaign.HTTPKeywordValidationParams)
			fmt.Printf("[DEBUG orchestrator] (after assign) baseCampaign.HTTPKeywordValidationParams.PersonaIDs: %+v (len=%d)\n", baseCampaign.HTTPKeywordValidationParams.PersonaIDs, len(baseCampaign.HTTPKeywordValidationParams.PersonaIDs))
			fmt.Printf("[DEBUG orchestrator] (after assign) specificParams.(*models.HTTPKeywordCampaignParams).PersonaIDs: %+v (len=%d)\n", specificParams.(*models.HTTPKeywordCampaignParams).PersonaIDs, len(specificParams.(*models.HTTPKeywordCampaignParams).PersonaIDs))
		}
	default:
		specificErr = fmt.Errorf("orchestrator: unknown campaign type '%s' for campaign %s", baseCampaign.CampaignType, campaignID)
	}

	if specificErr != nil {
		return baseCampaign, nil, specificErr
	}

	// Final verification before returning
	fmt.Printf("[DEBUG orchestrator] FINAL CHECK - specificParams type: %T\n", specificParams)
	if specificParams != nil && baseCampaign.CampaignType == models.CampaignTypeHTTPKeywordValidation {
		httpParams, ok := specificParams.(*models.HTTPKeywordCampaignParams)
		if ok {
			fmt.Printf("[DEBUG orchestrator] FINAL CHECK - specificParams.PersonaIDs: %+v (len=%d)\n",
				httpParams.PersonaIDs, len(httpParams.PersonaIDs))
		}
	}

	return baseCampaign, specificParams, nil
}

func (s *campaignOrchestratorServiceImpl) GetCampaignStatus(ctx context.Context, campaignID uuid.UUID) (models.CampaignStatusEnum, *float64, error) {
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}
	campaign, err := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if err != nil {
		return "", nil, err
	}
	return campaign.Status, campaign.ProgressPercentage, nil
}

func (s *campaignOrchestratorServiceImpl) ListCampaigns(ctx context.Context, filter store.ListCampaignsFilter) ([]models.Campaign, int64, error) {
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}

	campaignsSlice, err := s.campaignStore.ListCampaigns(ctx, querier, filter)
	if err != nil {
		return nil, 0, err
	}

	actualCampaigns := make([]models.Campaign, len(campaignsSlice))
	for i, cPtr := range campaignsSlice {
		if cPtr != nil {
			actualCampaigns[i] = *cPtr
		}
	}

	totalCount, err := s.campaignStore.CountCampaigns(ctx, querier, filter)
	if err != nil {
		log.Printf("Error counting campaigns: %v. List will be paged based on items returned.", err)
		return actualCampaigns, int64(len(actualCampaigns)), nil
	}
	return actualCampaigns, totalCount, nil
}

func (s *campaignOrchestratorServiceImpl) GetGeneratedDomainsForCampaign(ctx context.Context, campaignID uuid.UUID, limit int, cursor int64) (*GeneratedDomainsResponse, error) {
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}

	campaign, err := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if err != nil {
		return nil, fmt.Errorf("orchestrator: failed to get campaign %s: %w", campaignID, err)
	}
	if campaign.CampaignType != models.CampaignTypeDomainGeneration {
		return nil, fmt.Errorf("orchestrator: campaign %s is not a domain generation campaign", campaignID)
	}

	resultsPtr, err := s.campaignStore.GetGeneratedDomainsByCampaign(ctx, querier, campaignID, limit, cursor)
	if err != nil {
		return nil, fmt.Errorf("orchestrator: failed to get generated domains for campaign %s: %w", campaignID, err)
	}

	totalCount, countErr := s.campaignStore.CountGeneratedDomainsByCampaign(ctx, querier, campaignID)
	if countErr != nil {
		log.Printf("Orchestrator: Error counting generated domains for campaign %s: %v", campaignID, countErr)
	}

	var nextCursor int64 = 0
	if len(resultsPtr) > 0 && limit > 0 && len(resultsPtr) == limit {
		nextCursor = cursor + int64(limit)
	}
	results := models.DereferenceGeneratedDomainSlice(resultsPtr)

	return &GeneratedDomainsResponse{
		Data:       results,
		NextCursor: nextCursor,
		TotalCount: totalCount,
	}, nil
}

func (s *campaignOrchestratorServiceImpl) GetDNSValidationResultsForCampaign(ctx context.Context, campaignID uuid.UUID, limit int, cursor string, filter store.ListValidationResultsFilter) (*DNSValidationResultsResponse, error) {
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}

	_, err := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if err != nil {
		return nil, fmt.Errorf("orchestrator: failed to get campaign %s: %w", campaignID, err)
	}

	actualFilter := filter
	if limit > 0 {
		actualFilter.Limit = limit
	}
	currentOffset := 0
	if cursor != "" {
		parsedOffset, parseErr := strconv.Atoi(cursor)
		if parseErr == nil && parsedOffset > 0 {
			currentOffset = parsedOffset
		}
	}
	actualFilter.Offset = currentOffset

	resultsPtr, err := s.campaignStore.GetDNSValidationResultsByCampaign(ctx, querier, campaignID, actualFilter)
	if err != nil {
		return nil, fmt.Errorf("orchestrator: failed to get DNS validation results for campaign %s: %w", campaignID, err)
	}

	totalCount, countErr := s.campaignStore.CountDNSValidationResults(ctx, querier, campaignID, true)
	if countErr != nil {
		log.Printf("Orchestrator: Error counting DNS validation results for campaign %s: %v", campaignID, countErr)
	}

	var nextCursorStr string
	if len(resultsPtr) > 0 && actualFilter.Limit > 0 && len(resultsPtr) == actualFilter.Limit {
		nextCursorStr = strconv.Itoa(currentOffset + len(resultsPtr))
	}
	results := models.DereferenceDNSValidationResultSlice(resultsPtr)

	return &DNSValidationResultsResponse{
		Data:       results,
		NextCursor: nextCursorStr,
		TotalCount: totalCount,
	}, nil
}

func (s *campaignOrchestratorServiceImpl) GetHTTPKeywordResultsForCampaign(ctx context.Context, campaignID uuid.UUID, limit int, cursor string, filter store.ListValidationResultsFilter) (*HTTPKeywordResultsResponse, error) {
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}

	campaign, err := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if err != nil {
		return nil, fmt.Errorf("orchestrator: failed to get campaign %s: %w", campaignID, err)
	}
	if campaign.CampaignType != models.CampaignTypeHTTPKeywordValidation {
		return nil, fmt.Errorf("orchestrator: campaign %s is not an HTTP/Keyword validation campaign", campaignID)
	}

	actualFilter := filter
	if limit > 0 {
		actualFilter.Limit = limit
	}
	currentOffset := 0
	if cursor != "" {
		parsedOffset, parseErr := strconv.Atoi(cursor)
		if parseErr == nil && parsedOffset > 0 {
			currentOffset = parsedOffset
		}
	}
	actualFilter.Offset = currentOffset

	resultsPtr, err := s.campaignStore.GetHTTPKeywordResultsByCampaign(ctx, querier, campaignID, actualFilter)
	if err != nil {
		return nil, fmt.Errorf("orchestrator: failed to get HTTP/Keyword results for campaign %s: %w", campaignID, err)
	}

	var totalCount int64
	if campaign.TotalItems != nil {
		totalCount = *campaign.TotalItems
	}
	// If the campaign is completed, the total count for pagination purposes might be the number of processed items.
	// However, the frontend might still want to see the original total items.
	// For now, let's assume TotalItems is the authoritative source for the total,
	// and ProcessedItems is just for progress.
	// If the campaign is completed, and ProcessedItems is available, it might be more accurate for "results found".
	// The original logic was:
	// var totalCount int64 = campaign.TotalItems
	// if campaign.Status == models.CampaignStatusCompleted {
	//  totalCount = campaign.ProcessedItems
	// }
	// Replicating this with pointer checks:
	if campaign.Status == models.CampaignStatusCompleted && campaign.ProcessedItems != nil {
		totalCount = *campaign.ProcessedItems
	} else if campaign.TotalItems == nil && campaign.Status == models.CampaignStatusCompleted {
		// If total items was nil, and it's completed, processed items might also be nil, implying 0.
		totalCount = 0
	}

	var nextCursorStr string
	if len(resultsPtr) > 0 && actualFilter.Limit > 0 && len(resultsPtr) == actualFilter.Limit {
		nextCursorStr = strconv.Itoa(currentOffset + len(resultsPtr))
	}
	results := models.DereferenceHTTPKeywordResultSlice(resultsPtr)

	return &HTTPKeywordResultsResponse{
		Data:       results,
		NextCursor: nextCursorStr,
		TotalCount: totalCount,
	}, nil
}

func (s *campaignOrchestratorServiceImpl) StartCampaign(ctx context.Context, campaignID uuid.UUID) error {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for StartCampaign %s: %v", campaignID, startTxErr)
			return fmt.Errorf("failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for StartCampaign %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL StartCampaign for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for StartCampaign %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for StartCampaign %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for StartCampaign %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for StartCampaign %s (no service-level transaction).", campaignID)
	}

	// s.campaignStore.GetCampaignByID will use the querier (which is sqlTx or nil)
	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = errGet
		return opErr // opErr will be handled by defer if in SQL transaction
	}
	if campaign.Status != models.CampaignStatusPending {
		opErr = fmt.Errorf("campaign %s not pending: %s", campaignID, campaign.Status)
		return opErr // opErr will be handled by defer if in SQL transaction
	}

	initialJob := &models.CampaignJob{
		ID:              uuid.New(),
		CampaignID:      campaignID,
		JobType:         campaign.CampaignType,
		Status:          models.JobStatusQueued,
		MaxAttempts:     3,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
		NextExecutionAt: sql.NullTime{Time: time.Now().UTC(), Valid: true},
	}

	// Set job payload based on campaign type
	switch campaign.CampaignType {
	case models.CampaignTypeDomainGeneration:
		params, getErr := s.campaignStore.GetDomainGenerationParams(ctx, querier, campaignID)
		if getErr != nil {
			log.Printf("Warning: Failed to get domain generation params for job payload: %v", getErr)
		} else {
			// Marshal the params struct directly to JSON
			payloadBytes, err := json.Marshal(params)
			if err != nil {
				log.Printf("Warning: Failed to marshal domain generation job payload: %v", err)
			} else {
				rawMsg := json.RawMessage(payloadBytes)
				initialJob.JobPayload = &rawMsg
			}
		}
	case models.CampaignTypeDNSValidation:
		params, getErr := s.campaignStore.GetDNSValidationParams(ctx, querier, campaignID)
		if getErr != nil {
			log.Printf("Warning: Failed to get DNS validation params for job payload: %v", getErr)
		} else {
			// Marshal the params struct directly to JSON
			payloadBytes, err := json.Marshal(params)
			if err != nil {
				log.Printf("Warning: Failed to marshal DNS validation job payload: %v", err)
			} else {
				rawMsg := json.RawMessage(payloadBytes)
				initialJob.JobPayload = &rawMsg
			}
		}
	case models.CampaignTypeHTTPKeywordValidation:
		params, getErr := s.campaignStore.GetHTTPKeywordParams(ctx, querier, campaignID)
		if getErr != nil {
			log.Printf("Warning: Failed to get HTTP keyword params for job payload: %v", getErr)
		} else {
			// Marshal the params struct directly to JSON
			payloadBytes, err := json.Marshal(params)
			if err != nil {
				log.Printf("Warning: Failed to marshal HTTP keyword job payload: %v", err)
			} else {
				rawMsg := json.RawMessage(payloadBytes)
				initialJob.JobPayload = &rawMsg
			}
		}
	}
	// s.campaignJobStore.CreateJob is called with its original signature.
	// It was NOT using 'tx' in the original code, so it does NOT use 'querier' here.
	// It handles its own DB interaction (e.g. using s.db directly, or its own transaction, or Firestore client).
	jobCreated := false
	if s.campaignJobStore == nil {
		log.Printf("Warning: campaignJobStore is nil for campaign %s. Skipping job creation.", campaignID)
		// Continue with status update even if we can't create a job
	} else if errCreateJob := s.campaignJobStore.CreateJob(ctx, querier, initialJob); errCreateJob != nil {
		opErr = fmt.Errorf("failed to create initial job for campaign %s: %w", campaignID, errCreateJob)
		return opErr // opErr will be handled by defer if in SQL transaction
	} else {
		jobCreated = true
	}

	// If we couldn't create a job but we still want to update the campaign status,
	// we need to make sure the campaign is marked as running so it doesn't get stuck in pending
	if !jobCreated {
		log.Printf("No job created for campaign %s. Marking campaign as running directly.", campaignID)
		campaign.Status = models.CampaignStatusRunning
		campaign.UpdatedAt = time.Now().UTC()
		if campaign.StartedAt == nil {
			now := time.Now().UTC()
			campaign.StartedAt = &now
		}
		if err := s.campaignStore.UpdateCampaign(ctx, querier, campaign); err != nil {
			opErr = fmt.Errorf("failed to update campaign %s status to running: %w", campaignID, err)
			return opErr
		}
	}

	desc := fmt.Sprintf("Campaign status changed to %s", models.CampaignStatusQueued)
	// s.updateCampaignStatusInTx will use the querier (which is sqlTx or nil)
	opErr = s.updateCampaignStatusInTx(ctx, querier, campaign, models.CampaignStatusQueued, "", desc, "Campaign Start Requested")
	return opErr
}

func (s *campaignOrchestratorServiceImpl) PauseCampaign(ctx context.Context, campaignID uuid.UUID) error {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for PauseCampaign %s: %v", campaignID, startTxErr)
			return fmt.Errorf("failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for PauseCampaign %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL PauseCampaign for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for PauseCampaign %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for PauseCampaign %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for PauseCampaign %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for PauseCampaign %s (no service-level transaction).", campaignID)
	}

	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = errGet
		return opErr
	}
	if campaign.Status != models.CampaignStatusRunning && campaign.Status != models.CampaignStatusQueued {
		opErr = fmt.Errorf("campaign %s not running/queued: %s", campaignID, campaign.Status)
		return opErr
	}
	desc := fmt.Sprintf("Status changed from %s to %s", campaign.Status, models.CampaignStatusPaused)
	opErr = s.updateCampaignStatusInTx(ctx, querier, campaign, models.CampaignStatusPaused, "", desc, "Campaign Paused")
	return opErr
}

func (s *campaignOrchestratorServiceImpl) ResumeCampaign(ctx context.Context, campaignID uuid.UUID) error {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for ResumeCampaign %s: %v", campaignID, startTxErr)
			return fmt.Errorf("failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for ResumeCampaign %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL ResumeCampaign for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for ResumeCampaign %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for ResumeCampaign %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for ResumeCampaign %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for ResumeCampaign %s (no service-level transaction).", campaignID)
	}

	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = errGet
		return opErr
	}
	if campaign.Status != models.CampaignStatusPaused {
		opErr = fmt.Errorf("campaign %s not paused: %s", campaignID, campaign.Status)
		return opErr
	}

	desc := fmt.Sprintf("Status changed from %s to %s", campaign.Status, models.CampaignStatusQueued)
	resumeJob := &models.CampaignJob{
		ID:              uuid.New(),
		CampaignID:      campaignID,
		JobType:         campaign.CampaignType,
		Status:          models.JobStatusQueued,
		MaxAttempts:     3,
		CreatedAt:       time.Now().UTC(),
		UpdatedAt:       time.Now().UTC(),
		NextExecutionAt: sql.NullTime{Time: time.Now().UTC(), Valid: true},
	}
	jobCreated := false
	if s.campaignJobStore == nil {
		log.Printf("Warning: campaignJobStore is nil for campaign %s. Skipping resume job creation.", campaignID)
	} else if err := s.campaignJobStore.CreateJob(ctx, querier, resumeJob); err != nil {
		log.Printf("Warning: failed to create resume job for campaign %s: %v", campaignID, err)
		// If this error should cause the transaction to roll back (in SQL mode), set opErr:
		// opErr = fmt.Errorf("failed to create resume job for campaign %s: %w", campaignID, err)
		// return opErr
	} else {
		jobCreated = true
	}

	// If we couldn't create a job but we still want to update the campaign status,
	// we need to make sure the campaign is marked as running so it doesn't get stuck in queued
	if !jobCreated {
		log.Printf("No resume job created for campaign %s. Marking campaign as running directly.", campaignID)
		campaign.Status = models.CampaignStatusRunning
		campaign.UpdatedAt = time.Now().UTC()
		if campaign.StartedAt == nil {
			now := time.Now().UTC()
			campaign.StartedAt = &now
		}
		if err := s.campaignStore.UpdateCampaign(ctx, querier, campaign); err != nil {
			opErr = fmt.Errorf("failed to update campaign %s status to running: %w", campaignID, err)
			return opErr
		}
		// Return early since we've already updated the campaign status
		return nil
	}
	opErr = s.updateCampaignStatusInTx(ctx, querier, campaign, models.CampaignStatusQueued, "", desc, "Campaign Resumed")
	return opErr
}

func (s *campaignOrchestratorServiceImpl) CancelCampaign(ctx context.Context, campaignID uuid.UUID) error {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for CancelCampaign %s: %v", campaignID, startTxErr)
			return fmt.Errorf("failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for CancelCampaign %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL CancelCampaign for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for CancelCampaign %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for CancelCampaign %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for CancelCampaign %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for CancelCampaign %s (no service-level transaction).", campaignID)
	}

	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = errGet
		return opErr
	}
	if campaign.Status == models.CampaignStatusCompleted || campaign.Status == models.CampaignStatusFailed ||
		campaign.Status == models.CampaignStatusCancelled ||
		(campaign.BusinessStatus != nil && *campaign.BusinessStatus == models.CampaignBusinessStatusArchived) {
		opErr = fmt.Errorf("campaign %s already in a final state: %s", campaignID, campaign.Status)
		return opErr
	}
	desc := fmt.Sprintf("Status changed from %s to %s", campaign.Status, models.CampaignStatusCancelled)
	opErr = s.updateCampaignStatusInTx(ctx, querier, campaign, models.CampaignStatusCancelled, "User cancelled campaign", desc, "Campaign Cancelled")
	return opErr
}

func (s *campaignOrchestratorServiceImpl) SetCampaignErrorStatus(ctx context.Context, campaignID uuid.UUID, errorMessage string) error {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for SetCampaignErrorStatus %s: %v", campaignID, startTxErr)
			return fmt.Errorf("SetCampaignErrorStatus: failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for SetCampaignErrorStatus %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL SetCampaignErrorStatus for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for SetCampaignErrorStatus %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for SetCampaignErrorStatus %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for SetCampaignErrorStatus %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for SetCampaignErrorStatus %s (no service-level transaction).", campaignID)
	}

	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = fmt.Errorf("SetCampaignErrorStatus: get campaign %s failed: %w", campaignID, errGet)
		return opErr
	}
	desc := fmt.Sprintf("Campaign %s error: %s", campaign.Name, errorMessage)
	opErr = s.updateCampaignStatusInTx(ctx, querier, campaign, models.CampaignStatusFailed, errorMessage, desc, "Campaign Error")
	return opErr
}

// SetCampaignStatus sets the campaign status to the specified value
func (s *campaignOrchestratorServiceImpl) SetCampaignStatus(ctx context.Context, campaignID uuid.UUID, status models.CampaignStatusEnum) error {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for SetCampaignStatus %s: %v", campaignID, startTxErr)
			return fmt.Errorf("SetCampaignStatus: failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for SetCampaignStatus %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL SetCampaignStatus for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for SetCampaignStatus %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for SetCampaignStatus %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for SetCampaignStatus %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for SetCampaignStatus %s (no service-level transaction).", campaignID)
	}

	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = fmt.Errorf("SetCampaignStatus: get campaign %s failed: %w", campaignID, errGet)
		return opErr
	}

	desc := fmt.Sprintf("Campaign status changed from %s to %s", campaign.Status, status)
	auditAction := fmt.Sprintf("Campaign Status Changed to %s", status)
	opErr = s.updateCampaignStatusInTx(ctx, querier, campaign, status, "", desc, auditAction)
	return opErr
}

// updateCampaignStatusInTx correctly uses the passed querier (which can be sqlTx or nil)
func (s *campaignOrchestratorServiceImpl) updateCampaignStatusInTx(ctx context.Context, querier store.Querier, campaign *models.Campaign, newStatus models.CampaignStatusEnum, errMsg string, auditDesc string, auditAction string) error {
	originalStatus := campaign.Status

	// Validate state transition using the state machine
	currentState := CampaignStatus(string(originalStatus))
	newState := CampaignStatus(string(newStatus))

	if err := s.stateMachine.ValidateTransition(currentState, newState); err != nil {
		// Log the invalid transition attempt
		log.Printf("Invalid state transition attempt for campaign %s: %v", campaign.ID, err)
		return fmt.Errorf("state transition validation failed for campaign %s: %w", campaign.ID, err)
	}

	campaign.Status = newStatus
	campaign.UpdatedAt = time.Now().UTC()
	if errMsg != "" {
		campaign.ErrorMessage = models.StringPtr(errMsg)
	} else {
		campaign.ErrorMessage = nil
	}
	if newStatus == models.CampaignStatusCompleted || newStatus == models.CampaignStatusFailed || newStatus == models.CampaignStatusCancelled {
		if campaign.CompletedAt == nil {
			campaign.CompletedAt = &campaign.UpdatedAt
		}
	}

	// s.campaignStore.UpdateCampaign will use the querier
	if err := s.campaignStore.UpdateCampaign(ctx, querier, campaign); err != nil {
		return fmt.Errorf("update campaign %s to %s: %w", campaign.ID, newStatus, err)
	}
	// s.logAuditEvent will use the querier
	s.logAuditEvent(ctx, querier, campaign, auditAction, auditDesc)
	log.Printf("Campaign %s status changed from %s to %s.", campaign.ID, originalStatus, newStatus)
	return nil
}

// logAuditEvent correctly uses the passed exec (querier)
func (s *campaignOrchestratorServiceImpl) logAuditEvent(ctx context.Context, exec store.Querier, campaign *models.Campaign, action, description string) {
	detailsMap := map[string]string{
		"campaign_name":      campaign.Name,
		"description":        description,
		"orchestrator_event": "true",
	}
	detailsJSON, err := json.Marshal(detailsMap)
	if err != nil {
		log.Printf("Orchestrator Audit: Error marshalling details for campaign %s, action %s: %v. Using raw desc.", campaign.ID, action, err)
		detailsJSON = json.RawMessage(fmt.Sprintf(`{"campaign_name": "%s", "description": "%s (details marshalling error)"}`, campaign.Name, description))
	}

	var auditLogUserID uuid.NullUUID
	if campaign.UserID != nil {
		auditLogUserID = uuid.NullUUID{UUID: *campaign.UserID, Valid: true}
	}
	auditLog := &models.AuditLog{
		Timestamp:  time.Now().UTC(),
		UserID:     auditLogUserID,
		Action:     action,
		EntityType: sql.NullString{String: "Campaign", Valid: true},
		EntityID:   uuid.NullUUID{UUID: campaign.ID, Valid: true},
		Details:    models.JSONRawMessagePtr(detailsJSON),
	}
	// s.auditLogStore.CreateAuditLog will use the exec (querier)
	if s.auditLogStore == nil {
		log.Printf("Warning: auditLogStore is nil for campaign %s, action %s. Skipping audit log creation.", campaign.ID, action)
	} else if exec == nil {
		log.Printf("Warning: exec is nil for campaign %s, action %s. Skipping audit log creation.", campaign.ID, action)
	} else if err := s.auditLogStore.CreateAuditLog(ctx, exec, auditLog); err != nil {
		log.Printf("Orchestrator Audit: Error creating log for campaign %s, action %s: %v", campaign.ID, action, err)
	}
}

func (s *campaignOrchestratorServiceImpl) UpdateCampaign(ctx context.Context, campaignID uuid.UUID, req UpdateCampaignRequest) (*models.Campaign, error) {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for UpdateCampaign %s: %v", campaignID, startTxErr)
			return nil, fmt.Errorf("failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for UpdateCampaign %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL UpdateCampaign for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for UpdateCampaign %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for UpdateCampaign %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for UpdateCampaign %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for UpdateCampaign %s (no service-level transaction).", campaignID)
	}

	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = fmt.Errorf("UpdateCampaign: get campaign %s failed: %w", campaignID, errGet)
		return nil, opErr
	}

	// Update campaign fields if provided
	if req.Name != nil {
		campaign.Name = *req.Name
	}
	if req.Status != nil {
		campaign.Status = *req.Status
	}

	campaign.UpdatedAt = time.Now().UTC()

	if err := s.campaignStore.UpdateCampaign(ctx, querier, campaign); err != nil {
		opErr = fmt.Errorf("UpdateCampaign: update campaign %s failed: %w", campaignID, err)
		return nil, opErr
	}

	// Log audit event
	s.logAuditEvent(ctx, querier, campaign, "Campaign Updated", fmt.Sprintf("Campaign %s was updated", campaign.Name))

	return campaign, nil
}

func (s *campaignOrchestratorServiceImpl) DeleteCampaign(ctx context.Context, campaignID uuid.UUID) error {
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for DeleteCampaign %s: %v", campaignID, startTxErr)
			return fmt.Errorf("failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for DeleteCampaign %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL DeleteCampaign for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for DeleteCampaign %s (SQL), rolling back: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for DeleteCampaign %s: %v", campaignID, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for DeleteCampaign %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for DeleteCampaign %s (no service-level transaction).", campaignID)
	}

	campaign, errGet := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGet != nil {
		opErr = fmt.Errorf("DeleteCampaign: get campaign %s failed: %w", campaignID, errGet)
		return opErr
	}

	// Check if campaign can be deleted (not running)
	if campaign.Status == models.CampaignStatusRunning || campaign.Status == models.CampaignStatusQueued {
		opErr = fmt.Errorf("cannot delete campaign %s: campaign is %s", campaignID, campaign.Status)
		return opErr
	}

	if err := s.campaignStore.DeleteCampaign(ctx, querier, campaignID); err != nil {
		opErr = fmt.Errorf("DeleteCampaign: delete campaign %s failed: %w", campaignID, err)
		return opErr
	}

	// Log audit event
	s.logAuditEvent(ctx, querier, campaign, "Campaign Deleted", fmt.Sprintf("Campaign %s was deleted", campaign.Name))

	return nil
}

// CreateCampaignUnified creates a campaign of any type using a unified request structure
func (s *campaignOrchestratorServiceImpl) CreateCampaignUnified(ctx context.Context, req CreateCampaignRequest) (*models.Campaign, error) {
	log.Printf("Orchestrator: Creating campaign with unified endpoint. Type: %s, Name: %s", req.CampaignType, req.Name)

	switch req.CampaignType {
	case "domain_generation":
		if req.DomainGenerationParams == nil {
			return nil, fmt.Errorf("domainGenerationParams required for domain_generation campaigns")
		}

		// Convert unified request to legacy request structure
		legacyReq := CreateDomainGenerationCampaignRequest{
			Name:                 req.Name,
			PatternType:          req.DomainGenerationParams.PatternType,
			VariableLength:       req.DomainGenerationParams.VariableLength,
			CharacterSet:         req.DomainGenerationParams.CharacterSet,
			ConstantString:       req.DomainGenerationParams.ConstantString,
			TLD:                  req.DomainGenerationParams.TLD,
			NumDomainsToGenerate: req.DomainGenerationParams.NumDomainsToGenerate,
			UserID:               req.UserID,
		}

		return s.domainGenService.CreateCampaign(ctx, legacyReq)

	case "dns_validation":
		if req.DnsValidationParams == nil {
			return nil, fmt.Errorf("dnsValidationParams required for dns_validation campaigns")
		}

		// Convert unified request to legacy request structure
		legacyReq := CreateDNSValidationCampaignRequest{
			Name:                       req.Name,
			SourceGenerationCampaignID: req.DnsValidationParams.SourceGenerationCampaignID,
			PersonaIDs:                 req.DnsValidationParams.PersonaIDs,
			RotationIntervalSeconds:    req.DnsValidationParams.RotationIntervalSeconds,
			ProcessingSpeedPerMinute:   req.DnsValidationParams.ProcessingSpeedPerMinute,
			BatchSize:                  req.DnsValidationParams.BatchSize,
			RetryAttempts:              req.DnsValidationParams.RetryAttempts,
			UserID:                     req.UserID,
		}

		return s.dnsService.CreateCampaign(ctx, legacyReq)

	case "http_keyword_validation":
		if req.HttpKeywordParams == nil {
			return nil, fmt.Errorf("httpKeywordParams required for http_keyword_validation campaigns")
		}

		// Convert unified request to legacy request structure
		legacyReq := CreateHTTPKeywordCampaignRequest{
			Name:                     req.Name,
			SourceCampaignID:         req.HttpKeywordParams.SourceCampaignID,
			KeywordSetIDs:            req.HttpKeywordParams.KeywordSetIDs,
			AdHocKeywords:            req.HttpKeywordParams.AdHocKeywords,
			PersonaIDs:               req.HttpKeywordParams.PersonaIDs,
			ProxyPoolID:              req.HttpKeywordParams.ProxyPoolID,
			ProxySelectionStrategy:   req.HttpKeywordParams.ProxySelectionStrategy,
			RotationIntervalSeconds:  req.HttpKeywordParams.RotationIntervalSeconds,
			ProcessingSpeedPerMinute: req.HttpKeywordParams.ProcessingSpeedPerMinute,
			BatchSize:                req.HttpKeywordParams.BatchSize,
			RetryAttempts:            req.HttpKeywordParams.RetryAttempts,
			TargetHTTPPorts:          req.HttpKeywordParams.TargetHTTPPorts,
			UserID:                   req.UserID,
		}

		return s.httpKeywordService.CreateCampaign(ctx, legacyReq)

	default:
		return nil, fmt.Errorf("unsupported campaign type: %s", req.CampaignType)
	}
}

// Legacy campaign creation methods (kept for backward compatibility)
