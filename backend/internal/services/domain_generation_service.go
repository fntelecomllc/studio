// File: backend/internal/services/domain_generation_service.go
package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/domainexpert"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/monitoring"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/fntelecomllc/studio/backend/internal/websocket"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type domainGenerationServiceImpl struct {
	db               *sqlx.DB // This will be nil when using Firestore
	campaignStore    store.CampaignStore
	campaignJobStore store.CampaignJobStore
	auditLogStore    store.AuditLogStore
}

// NewDomainGenerationService creates a new DomainGenerationService.
func NewDomainGenerationService(db *sqlx.DB, cs store.CampaignStore, cjs store.CampaignJobStore, as store.AuditLogStore) DomainGenerationService {
	return &domainGenerationServiceImpl{
		db:               db,
		campaignStore:    cs,
		campaignJobStore: cjs,
		auditLogStore:    as,
	}
}

func (s *domainGenerationServiceImpl) CreateCampaign(ctx context.Context, req CreateDomainGenerationCampaignRequest) (*models.Campaign, error) {
	log.Printf("DomainGenerationService: CreateCampaign called with Name: %s, PatternType: %s", req.Name, req.PatternType)
	functionStartTime := time.Now().UTC() // Use a distinct name for clarity
	campaignID := uuid.New()

	tempGenParamsForHash := models.DomainGenerationCampaignParams{
		PatternType:    req.PatternType,
		VariableLength: models.IntPtr(req.VariableLength),
		CharacterSet:   models.StringPtr(req.CharacterSet),
		ConstantString: models.StringPtr(req.ConstantString),
		TLD:            req.TLD,
	}

	hashResult, hashErr := domainexpert.GenerateDomainGenerationConfigHash(tempGenParamsForHash)
	if hashErr != nil {
		log.Printf("Error generating config hash for domain generation campaign %s: %v", req.Name, hashErr)
		return nil, fmt.Errorf("failed to generate config hash: %w", hashErr)
	}
	configHashString := hashResult.HashString
	normalizedHashedParams := hashResult.NormalizedParams
	log.Printf("Generated ConfigHash: %s for campaign %s", configHashString, req.Name)

	var startingOffset int64 = 0
	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("[DomainGenerationService.CreateCampaign] Error beginning SQL transaction for %s: %v", req.Name, startTxErr)
			monitoring.LogTransactionEvent(campaignID.String(), "create_campaign", "begin_failed", startTxErr)
			return nil, fmt.Errorf("failed to start SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("[DomainGenerationService.CreateCampaign] SQL Transaction started for %s.", req.Name)
		monitoring.LogTransactionEvent(campaignID.String(), "create_campaign", "begin_success", nil)

		// Log initial database metrics
		if s.db != nil {
			metrics := monitoring.NewDatabaseMetrics(s.db)
			metrics.LogConnectionPoolStats("CreateCampaign_tx_start", campaignID.String())
		}

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[DomainGenerationService.CreateCampaign] Panic recovered (SQL) for %s, rolling back: %v", req.Name, p)
				if sqlTx != nil { // Check if sqlTx is not nil before rollback
					rollbackErr := sqlTx.Rollback()
					monitoring.LogTransactionEvent(campaignID.String(), "create_campaign", "rollback_panic", rollbackErr)
				}
				panic(p)
			} else if opErr != nil {
				log.Printf("[DomainGenerationService.CreateCampaign] Error occurred (SQL) for %s, rolling back: %v", req.Name, opErr)
				if sqlTx != nil { // Check if sqlTx is not nil before rollback
					rollbackErr := sqlTx.Rollback()
					monitoring.LogTransactionEvent(campaignID.String(), "create_campaign", "rollback_error", rollbackErr)
				}
			} else {
				if sqlTx != nil { // Check if sqlTx is not nil before commit
					if commitErr := sqlTx.Commit(); commitErr != nil {
						log.Printf("[DomainGenerationService.CreateCampaign] Error committing SQL transaction for %s: %v", req.Name, commitErr)
						monitoring.LogTransactionEvent(campaignID.String(), "create_campaign", "commit_failed", commitErr)
						opErr = commitErr
					} else {
						log.Printf("[DomainGenerationService.CreateCampaign] SQL Transaction committed for %s.", req.Name)
						monitoring.LogTransactionEvent(campaignID.String(), "create_campaign", "commit_success", nil)
					}
				}
			}

			// Log final database metrics
			if s.db != nil {
				metrics := monitoring.NewDatabaseMetrics(s.db)
				metrics.LogConnectionPoolStats("CreateCampaign_tx_end", campaignID.String())
			}
		}()
	} else {
		log.Printf("[DomainGenerationService.CreateCampaign] Operating in Firestore mode for %s (no service-level transaction).", req.Name)
	}

	existingConfigState, errGetState := s.campaignStore.GetDomainGenerationConfigStateByHash(ctx, querier, configHashString)
	if errGetState == nil && existingConfigState != nil {
		startingOffset = existingConfigState.LastOffset
		log.Printf("Found existing config state for hash %s. Starting new campaign %s from global offset: %d", configHashString, req.Name, startingOffset)
	} else if errGetState != nil && errGetState != store.ErrNotFound {
		opErr = fmt.Errorf("failed to get existing domain generation config state: %w", errGetState)
		log.Printf("Error for campaign %s: %v", req.Name, opErr)
		return nil, opErr
	} else {
		log.Printf("No existing config state found for hash %s (or ErrNotFound). New campaign %s will start from offset 0 globally for this config.", configHashString, req.Name)
	}

	// Ensure required fields for domainGen are not nil
	// For CreateCampaign, req fields are direct values, so they won't be nil.
	// The tempGenParamsForHash uses pointers, but req values are used here.
	domainGen, errDomainExpert := domainexpert.NewDomainGenerator(
		domainexpert.CampaignPatternType(req.PatternType),
		req.VariableLength, // req.VariableLength is int, not *int
		req.CharacterSet,   // req.CharacterSet is string, not *string
		req.ConstantString, // req.ConstantString is string, not *string
		req.TLD,
	)
	if errDomainExpert != nil {
		opErr = fmt.Errorf("invalid domain generation parameters for campaign %s: %w", req.Name, errDomainExpert)
		return nil, opErr
	}

	totalPossibleCombinations := domainGen.GetTotalCombinations()
	campaignInstanceTargetCount := req.NumDomainsToGenerate
	var actualTotalItemsForThisRun int64
	availableFromGlobalOffset := int64(totalPossibleCombinations) - startingOffset
	if availableFromGlobalOffset < 0 {
		availableFromGlobalOffset = 0
	}
	if req.NumDomainsToGenerate == 0 {
		actualTotalItemsForThisRun = availableFromGlobalOffset
	} else {
		if req.NumDomainsToGenerate > availableFromGlobalOffset {
			actualTotalItemsForThisRun = availableFromGlobalOffset
		} else {
			actualTotalItemsForThisRun = req.NumDomainsToGenerate
		}
	}
	if actualTotalItemsForThisRun < 0 {
		actualTotalItemsForThisRun = 0
	}

	log.Printf("Campaign %s: RequestedForInstance: %d, StartGlobalOffset: %d, TotalPossibleForConfig: %d, ActualTotalItemsForThisRun: %d",
		req.Name, campaignInstanceTargetCount, startingOffset, totalPossibleCombinations, actualTotalItemsForThisRun)

	var userIDPtr *uuid.UUID
	if req.UserID != uuid.Nil {
		userIDPtr = &req.UserID
	}
	baseCampaign := &models.Campaign{
		ID:                 campaignID,
		Name:               req.Name,
		CampaignType:       models.CampaignTypeDomainGeneration,
		Status:             models.CampaignStatusPending,
		UserID:             userIDPtr,
		CreatedAt:          functionStartTime, // Use functionStartTime
		UpdatedAt:          functionStartTime, // Use functionStartTime
		TotalItems:         models.Int64Ptr(actualTotalItemsForThisRun),
		ProcessedItems:     models.Int64Ptr(0),
		ProgressPercentage: models.Float64Ptr(0.0),
	}

	campaignDomainGenParams := &models.DomainGenerationCampaignParams{
		CampaignID:                campaignID,
		PatternType:               req.PatternType,
		VariableLength:            models.IntPtr(req.VariableLength),
		CharacterSet:              models.StringPtr(req.CharacterSet),
		ConstantString:            models.StringPtr(req.ConstantString),
		TLD:                       req.TLD,
		NumDomainsToGenerate:      int(campaignInstanceTargetCount), // Converted int64 to int
		TotalPossibleCombinations: totalPossibleCombinations,
		CurrentOffset:             startingOffset,
	}
	baseCampaign.DomainGenerationParams = campaignDomainGenParams

	if err := s.campaignStore.CreateCampaign(ctx, querier, baseCampaign); err != nil {
		opErr = fmt.Errorf("failed to create base campaign record: %w", err)
		log.Printf("Error creating base campaign record for %s: %v", req.Name, opErr)
		return nil, opErr
	}
	log.Printf("Base campaign record created for %s.", req.Name)

	if err := s.campaignStore.CreateDomainGenerationParams(ctx, querier, campaignDomainGenParams); err != nil {
		opErr = fmt.Errorf("failed to create domain generation params: %w", err)
		log.Printf("Error creating domain generation params for %s: %v", req.Name, opErr)
		return nil, opErr
	}
	log.Printf("Domain generation params created for %s. Campaign-specific start offset: %d", req.Name, startingOffset)

	configDetailsBytes, jsonErr := json.Marshal(normalizedHashedParams)
	if jsonErr != nil {
		opErr = fmt.Errorf("failed to marshal normalized config details for global state: %w", jsonErr)
		log.Printf("Error for campaign %s: %v", req.Name, opErr)
		return nil, opErr
	}

	globalConfigState := &models.DomainGenerationConfigState{
		ConfigHash:    configHashString,
		LastOffset:    startingOffset,
		ConfigDetails: configDetailsBytes,
		UpdatedAt:     functionStartTime, // Use functionStartTime
	}

	if err := s.campaignStore.CreateOrUpdateDomainGenerationConfigState(ctx, querier, globalConfigState); err != nil {
		opErr = fmt.Errorf("failed to create/update domain generation config state: %w", err)
		log.Printf("Error creating/updating DomainGenerationConfigState for hash %s, campaign %s: %v", configHashString, req.Name, opErr)
		return nil, opErr
	}
	if existingConfigState == nil {
		log.Printf("Initial DomainGenerationConfigState created for hash %s, campaign %s.", configHashString, req.Name)
	} else {
		log.Printf("DomainGenerationConfigState for hash %s already exists, ensured updated_at for campaign %s.", configHashString, req.Name)
	}

	if opErr == nil {
		s.logAuditEvent(ctx, querier, baseCampaign, "Domain Generation Campaign Created (Service)", fmt.Sprintf("Name: %s, ConfigHash: %s, StartOffset: %d, RequestedForInstance: %d, ActualTotalItemsForThisRun: %d", req.Name, configHashString, startingOffset, campaignInstanceTargetCount, actualTotalItemsForThisRun))

		// Only attempt to create a job if campaignJobStore is not nil
		jobCreated := false
		if s.campaignJobStore != nil {
			jobCreationTime := time.Now().UTC()
			job := &models.CampaignJob{
				ID:              uuid.New(),
				CampaignID:      baseCampaign.ID,
				JobType:         models.CampaignTypeDomainGeneration, // Changed CampaignType to JobType
				Status:          models.JobStatusQueued,
				ScheduledAt:     jobCreationTime, // Set ScheduledAt
				NextExecutionAt: sql.NullTime{Time: jobCreationTime, Valid: true},
				CreatedAt:       jobCreationTime,
				UpdatedAt:       jobCreationTime,
				MaxAttempts:     3, // Provide a default for MaxAttempts
			}

			// If job.JobPayload needs to be set, do it here. Example:
			// defaultPayload := json.RawMessage(`{}`)
			// job.JobPayload = &defaultPayload

			if err := s.campaignJobStore.CreateJob(ctx, querier, job); err != nil {
				opErr = fmt.Errorf("failed to create initial campaign job: %w", err)
				log.Printf("Error creating initial job for campaign %s: %v", baseCampaign.ID, opErr)
				return nil, opErr
			}
			jobCreated = true
		} else {
			log.Printf("Warning: campaignJobStore is nil for campaign %s. Skipping job creation.", baseCampaign.ID)
		}

		// If we couldn't create a job, update the campaign status to running directly
		if !jobCreated {
			log.Printf("No job created for campaign %s. Marking campaign as running directly.", baseCampaign.ID)
			baseCampaign.Status = models.CampaignStatusRunning
			baseCampaign.UpdatedAt = time.Now().UTC()
			if baseCampaign.StartedAt == nil {
				now := time.Now().UTC()
				baseCampaign.StartedAt = &now
			}
			if err := s.campaignStore.UpdateCampaign(ctx, querier, baseCampaign); err != nil {
				opErr = fmt.Errorf("failed to update campaign %s status to running: %w", baseCampaign.ID, err)
				log.Printf("Error updating campaign status for %s: %v", baseCampaign.ID, opErr)
				return nil, opErr
			}
		}
	}

	return baseCampaign, opErr
}

func (s *domainGenerationServiceImpl) GetCampaignDetails(ctx context.Context, campaignID uuid.UUID) (*models.Campaign, *models.DomainGenerationCampaignParams, error) {
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}

	campaign, err := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get campaign by ID %s: %w", campaignID, err)
	}
	if campaign.CampaignType != models.CampaignTypeDomainGeneration {
		return nil, nil, fmt.Errorf("campaign %s is not a domain generation campaign (type: %s)", campaignID, campaign.CampaignType)
	}

	params, err := s.campaignStore.GetDomainGenerationParams(ctx, querier, campaignID)
	if err != nil {
		if campaign.DomainGenerationParams != nil {
			return campaign, campaign.DomainGenerationParams, nil
		}
		return nil, nil, fmt.Errorf("failed to get domain generation params for campaign %s: %w", campaignID, err)
	}
	return campaign, params, nil
}

func (s *domainGenerationServiceImpl) logAuditEvent(ctx context.Context, exec store.Querier, campaign *models.Campaign, action, description string) {
	if campaign == nil { // Add nil check for campaign
		log.Printf("Error in logAuditEvent: campaign object is nil. Action: %s, Description: %s", action, description)
		return
	}

	detailsMap := map[string]string{
		"campaign_name": campaign.Name, // Safe if campaign is not nil
		"description":   description,
	}
	detailsJSON, err := json.Marshal(detailsMap)
	if err != nil {
		log.Printf("Error marshalling audit log details for campaign %s, action %s: %v. Using raw description.", campaign.ID, action, err)
		detailsJSON = json.RawMessage(fmt.Sprintf(`{"campaign_name": "%s", "description": "Details marshalling error, raw: %s"}`, campaign.Name, description))
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

	if s.auditLogStore == nil {
		log.Printf("Warning: auditLogStore is nil for campaign %s, action %s. Skipping audit log creation.", campaign.ID, action)
	} else if exec == nil {
		log.Printf("Warning: exec is nil for campaign %s, action %s. Skipping audit log creation.", campaign.ID, action)
	} else if err := s.auditLogStore.CreateAuditLog(ctx, exec, auditLog); err != nil {
		log.Printf("Error creating audit log for campaign %s, action %s: %v", campaign.ID, action, err)
	}
}

func (s *domainGenerationServiceImpl) ProcessGenerationCampaignBatch(ctx context.Context, campaignID uuid.UUID) (done bool, processedInThisBatch int, opErr error) {
	log.Printf("ProcessGenerationCampaignBatch: Starting for campaignID %s", campaignID)

	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			opErr = fmt.Errorf("failed to begin SQL transaction for campaign %s: %w", campaignID, startTxErr)
			log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
			monitoring.LogTransactionEvent(campaignID.String(), "process_batch", "begin_failed", startTxErr)
			return false, 0, opErr
		}
		querier = sqlTx
		log.Printf("[ProcessGenerationCampaignBatch] SQL Transaction started for %s.", campaignID)
		monitoring.LogTransactionEvent(campaignID.String(), "process_batch", "begin_success", nil)

		// Log initial database metrics
		if s.db != nil {
			metrics := monitoring.NewDatabaseMetrics(s.db)
			metrics.LogConnectionPoolStats("ProcessBatch_tx_start", campaignID.String())
		}

		defer func() {
			if p := recover(); p != nil {
				log.Printf("[ProcessGenerationCampaignBatch] Panic recovered (SQL) for %s, rolling back: %v", campaignID, p)
				if sqlTx != nil {
					rollbackErr := sqlTx.Rollback()
					monitoring.LogTransactionEvent(campaignID.String(), "process_batch", "rollback_panic", rollbackErr)
				}
				panic(p)
			} else if opErr != nil {
				log.Printf("[ProcessGenerationCampaignBatch] Rolled back SQL transaction for campaign %s due to error: %v", campaignID, opErr)
				if sqlTx != nil {
					rollbackErr := sqlTx.Rollback()
					monitoring.LogTransactionEvent(campaignID.String(), "process_batch", "rollback_error", rollbackErr)
				}
			} else {
				if sqlTx != nil {
					if commitErr := sqlTx.Commit(); commitErr != nil {
						log.Printf("[ProcessGenerationCampaignBatch] Failed to commit SQL transaction for campaign %s: %v", campaignID, commitErr)
						monitoring.LogTransactionEvent(campaignID.String(), "process_batch", "commit_failed", commitErr)
						opErr = commitErr
					} else {
						log.Printf("[ProcessGenerationCampaignBatch] SQL Transaction committed for %s.", campaignID)
						monitoring.LogTransactionEvent(campaignID.String(), "process_batch", "commit_success", nil)
					}
				}
			}

			// Log final database metrics
			if s.db != nil {
				metrics := monitoring.NewDatabaseMetrics(s.db)
				metrics.LogConnectionPoolStats("ProcessBatch_tx_end", campaignID.String())
			}
		}()
	} else {
		log.Printf("[ProcessGenerationCampaignBatch] Operating in Firestore mode for %s (no service-level transaction).", campaignID)
	}

	var campaign *models.Campaign
	campaign, opErr = s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if opErr != nil {
		log.Printf("[ProcessGenerationCampaignBatch] Failed to fetch campaign %s: %v", campaignID, opErr)
		return false, 0, opErr
	}

	if campaign == nil { // Add nil check for campaign after fetching
		opErr = fmt.Errorf("ProcessGenerationCampaignBatch: Campaign %s not found after GetCampaignByID", campaignID)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		return false, 0, opErr
	}

	if campaign.Status == models.CampaignStatusCompleted || campaign.Status == models.CampaignStatusFailed || campaign.Status == models.CampaignStatusCancelled || campaign.BusinessStatus != nil && *campaign.BusinessStatus == models.CampaignBusinessStatusArchived {
		log.Printf("ProcessGenerationCampaignBatch: Campaign %s already in terminal state (status: %s). No action.", campaignID, campaign.Status)
		return true, 0, nil
	}

	// If campaign is Pending or Queued, transition to Running
	if campaign.Status == models.CampaignStatusPending || campaign.Status == models.CampaignStatusQueued {
		originalStatus := campaign.Status
		campaign.Status = models.CampaignStatusRunning
		if campaign.StartedAt == nil { // Set StartedAt only if not already set
			now := time.Now().UTC()
			campaign.StartedAt = &now
		}
		campaign.UpdatedAt = time.Now().UTC()
		if errUpdate := s.campaignStore.UpdateCampaign(ctx, querier, campaign); errUpdate != nil {
			opErr = fmt.Errorf("failed to mark campaign %s from %s to running: %w", campaignID, originalStatus, errUpdate)
			log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
			return false, 0, opErr
		}
		log.Printf("ProcessGenerationCampaignBatch: Campaign %s marked as Running (was %s).", campaignID, originalStatus)
		
		// Broadcast campaign status change via WebSocket
		websocket.BroadcastCampaignProgress(campaignID.String(), 0.0, "running", "domain_generation")
	} else if campaign.Status != models.CampaignStatusRunning {
		// If it's some other non-runnable, non-terminal state (e.g., Paused, Pausing)
		log.Printf("ProcessGenerationCampaignBatch: Campaign %s is not in a runnable state (status: %s). Skipping job.", campaignID, campaign.Status)
		return true, 0, nil // True because the job itself is "done" for now, campaign is not runnable
	}

	var genParams *models.DomainGenerationCampaignParams
	genParams, opErr = s.campaignStore.GetDomainGenerationParams(ctx, querier, campaignID)
	if opErr != nil {
		log.Printf("[ProcessGenerationCampaignBatch] Failed to fetch generation params for campaign %s: %v", campaignID, opErr)
		return false, 0, opErr
	}
	if genParams == nil && campaign.DomainGenerationParams != nil {
		genParams = campaign.DomainGenerationParams
		opErr = nil
	} else if genParams == nil && campaign.DomainGenerationParams == nil {
		opErr = fmt.Errorf("domain generation parameters not found for campaign %s", campaignID)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		campaign.Status = models.CampaignStatusFailed
		campaign.ErrorMessage = models.StringPtr(opErr.Error())
		now := time.Now().UTC()
		campaign.CompletedAt = &now
		if updateErr := s.campaignStore.UpdateCampaign(ctx, querier, campaign); updateErr != nil {
			log.Printf("Error updating campaign %s to failed after missing params: %v", campaignID, updateErr)
		}
		return true, 0, opErr
	}
	// Ensure genParams fields are not nil before dereferencing for NewDomainGenerator
	var varLength int
	if genParams.VariableLength != nil {
		varLength = *genParams.VariableLength
	} else {
		// Handle error or default if VariableLength is critical and nil
		opErr = fmt.Errorf("ProcessGenerationCampaignBatch: VariableLength is nil for campaign %s", campaignID)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		// Optionally mark campaign as failed
		return false, 0, opErr
	}

	var charSet string
	if genParams.CharacterSet != nil {
		charSet = *genParams.CharacterSet
	} else {
		opErr = fmt.Errorf("ProcessGenerationCampaignBatch: CharacterSet is nil for campaign %s", campaignID)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		return false, 0, opErr
	}

	var constStr string
	if genParams.ConstantString != nil {
		constStr = *genParams.ConstantString
	} else {
		// ConstantString might be optional depending on PatternType,
		// domainexpert.NewDomainGenerator should handle empty string if appropriate.
		// If it must not be nil, add error handling like above.
		// Assuming empty string is acceptable if nil for now.
	}

	domainGen, expertErr := domainexpert.NewDomainGenerator(
		domainexpert.CampaignPatternType(genParams.PatternType),
		varLength,
		charSet,
		constStr,
		genParams.TLD,
	)
	if expertErr != nil {
		opErr = fmt.Errorf("failed to initialize domain generator for campaign %s: %w. Campaign marked failed", campaignID, expertErr)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		campaign.Status = models.CampaignStatusFailed
		campaign.ErrorMessage = models.StringPtr(fmt.Sprintf("Generator init failed: %v", expertErr))
		now := time.Now().UTC()
		campaign.CompletedAt = &now
		if errUpdate := s.campaignStore.UpdateCampaign(ctx, querier, campaign); errUpdate != nil {
			log.Printf("Error updating campaign %s to failed after generator init error: %v", campaignID, errUpdate)
		}
		return true, 0, opErr
	}
	// Ensure campaign.ProcessedItems is not nil for comparison
	processedItems := int64(0)
	if campaign.ProcessedItems != nil {
		processedItems = *campaign.ProcessedItems
	}

	if (genParams.NumDomainsToGenerate > 0 && processedItems >= int64(genParams.NumDomainsToGenerate)) ||
		(genParams.CurrentOffset >= genParams.TotalPossibleCombinations) {
		log.Printf("ProcessGenerationCampaignBatch: Campaign %s completion condition met before batch processing. Processed: %d, Target: %d, Global offset: %d / %d.",
			campaignID, processedItems, genParams.NumDomainsToGenerate, genParams.CurrentOffset, genParams.TotalPossibleCombinations)

		if campaign.Status != models.CampaignStatusCompleted {
			campaign.Status = models.CampaignStatusCompleted
			campaign.ProgressPercentage = models.Float64Ptr(100.0)
			now := time.Now().UTC()
			campaign.CompletedAt = &now
			opErr = s.campaignStore.UpdateCampaign(ctx, querier, campaign)
			if opErr != nil {
				log.Printf("[ProcessGenerationCampaignBatch] Error marking campaign %s as completed: %v", campaignID, opErr)
			}
		}
		return true, 0, opErr
	}

	batchSize := 1000
	var domainsStillNeededForThisCampaignInstance int64

	if genParams.NumDomainsToGenerate > 0 {
		domainsStillNeededForThisCampaignInstance = int64(genParams.NumDomainsToGenerate) - processedItems
	} else {
		if genParams.TotalPossibleCombinations > genParams.CurrentOffset {
			domainsStillNeededForThisCampaignInstance = genParams.TotalPossibleCombinations - genParams.CurrentOffset
		} else {
			domainsStillNeededForThisCampaignInstance = 0
		}
	}

	if domainsStillNeededForThisCampaignInstance <= 0 {
		log.Printf("ProcessGenerationCampaignBatch: Campaign %s no more domains needed based on instance target/processed. Processed: %d, Target: %d. Marking complete.",
			campaignID, processedItems, genParams.NumDomainsToGenerate)
		if campaign.Status != models.CampaignStatusCompleted {
			campaign.Status = models.CampaignStatusCompleted
			campaign.ProgressPercentage = models.Float64Ptr(100.0)
			now := time.Now().UTC()
			campaign.CompletedAt = &now
			opErr = s.campaignStore.UpdateCampaign(ctx, querier, campaign)
		}
		return true, 0, opErr
	}

	maxPossibleToGenerateFromGlobalOffset := int64(0)
	if genParams.TotalPossibleCombinations > genParams.CurrentOffset {
		maxPossibleToGenerateFromGlobalOffset = genParams.TotalPossibleCombinations - genParams.CurrentOffset
	}

	numToGenerateInBatch := int64(batchSize)
	if numToGenerateInBatch > domainsStillNeededForThisCampaignInstance {
		numToGenerateInBatch = domainsStillNeededForThisCampaignInstance
	}
	if numToGenerateInBatch > maxPossibleToGenerateFromGlobalOffset {
		numToGenerateInBatch = maxPossibleToGenerateFromGlobalOffset
	}

	if numToGenerateInBatch <= 0 {
		log.Printf("ProcessGenerationCampaignBatch: Campaign %s - numToGenerateInBatch is %d. All possible/requested domains generated. Marking complete.", campaignID, numToGenerateInBatch)
		done = true
		if campaign.Status != models.CampaignStatusCompleted {
			campaign.Status = models.CampaignStatusCompleted
			campaign.ProgressPercentage = models.Float64Ptr(100.0)
			now := time.Now().UTC()
			campaign.CompletedAt = &now
			opErr = s.campaignStore.UpdateCampaign(ctx, querier, campaign)
		}
		return done, 0, opErr
	}

	generatedDomainsSlice, nextGeneratorOffsetAbsolute, genErr := domainGen.GenerateBatch(genParams.CurrentOffset, int(numToGenerateInBatch))
	if genErr != nil {
		opErr = fmt.Errorf("error during domain batch generation for campaign %s: %w. Campaign marked failed", campaignID, genErr)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		campaign.Status = models.CampaignStatusFailed
		campaign.ErrorMessage = models.StringPtr(fmt.Sprintf("Domain generation error: %v", genErr))
		now := time.Now().UTC()
		campaign.CompletedAt = &now
		if errUpdate := s.campaignStore.UpdateCampaign(ctx, querier, campaign); errUpdate != nil {
			log.Printf("Error updating campaign %s to failed after batch generation error: %v", campaignID, errUpdate)
		}
		return true, 0, opErr
	}

	nowTime := time.Now().UTC()
	generatedDomainsToStore := make([]*models.GeneratedDomain, len(generatedDomainsSlice))
	for i, dom := range generatedDomainsSlice {
		newDom := dom
		newDom.ID = uuid.New()
		newDom.GenerationCampaignID = campaignID
		newDom.GeneratedAt = nowTime
		newDom.OffsetIndex = genParams.CurrentOffset + int64(i)
		generatedDomainsToStore[i] = &newDom
	}

	if len(generatedDomainsToStore) > 0 {
		if errStoreDomains := s.campaignStore.CreateGeneratedDomains(ctx, querier, generatedDomainsToStore); errStoreDomains != nil {
			opErr = fmt.Errorf("failed to save generated domains for campaign %s: %w", campaignID, errStoreDomains)
			log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
			return false, 0, opErr
		}
		processedInThisBatch = len(generatedDomainsToStore)
		log.Printf("ProcessGenerationCampaignBatch: Saved %d domains for campaign %s.", processedInThisBatch, campaignID)
		
		// Broadcast domain generation progress via WebSocket
		newProcessedItems := processedItems + int64(processedInThisBatch)
		targetDomains := int64(genParams.NumDomainsToGenerate)
		if targetDomains == 0 {
			targetDomains = genParams.TotalPossibleCombinations
		}
		websocket.BroadcastDomainGeneration(campaignID.String(), newProcessedItems, targetDomains)
	}

	if errUpdateOffset := s.campaignStore.UpdateDomainGenerationParamsOffset(ctx, querier, campaignID, nextGeneratorOffsetAbsolute); errUpdateOffset != nil {
		opErr = fmt.Errorf("failed to update campaign-specific current offset for %s to %d: %w", campaignID, nextGeneratorOffsetAbsolute, errUpdateOffset)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		return false, processedInThisBatch, opErr
	}
	genParams.CurrentOffset = nextGeneratorOffsetAbsolute

	hashResultForUpdate, hashErrForUpdate := domainexpert.GenerateDomainGenerationConfigHash(*genParams)
	if hashErrForUpdate != nil {
		opErr = fmt.Errorf("failed to re-generate config hash for updating global state: %w", hashErrForUpdate)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		return false, processedInThisBatch, opErr
	}
	configHashStringForUpdate := hashResultForUpdate.HashString
	normalizedHashedParamsBytesForUpdate, jsonMarshalErrForUpdate := json.Marshal(hashResultForUpdate.NormalizedParams)
	if jsonMarshalErrForUpdate != nil {
		opErr = fmt.Errorf("failed to marshal normalized params for global state update: %w", jsonMarshalErrForUpdate)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		return false, processedInThisBatch, opErr
	}

	globalConfigState := &models.DomainGenerationConfigState{
		ConfigHash:    configHashStringForUpdate,
		LastOffset:    nextGeneratorOffsetAbsolute,
		ConfigDetails: normalizedHashedParamsBytesForUpdate,
		UpdatedAt:     nowTime,
	}
	if errUpdateGlobalState := s.campaignStore.CreateOrUpdateDomainGenerationConfigState(ctx, querier, globalConfigState); errUpdateGlobalState != nil {
		opErr = fmt.Errorf("failed to update global domain generation config state for hash %s to offset %d: %w", configHashStringForUpdate, nextGeneratorOffsetAbsolute, errUpdateGlobalState)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		return false, processedInThisBatch, opErr
	}
	log.Printf("ProcessGenerationCampaignBatch: Updated global offset for config hash %s to %d for campaign %s", configHashStringForUpdate, nextGeneratorOffsetAbsolute, campaignID)

	// Ensure pointers are not nil before operating on them. They should be initialized when campaign is created/fetched.
	if campaign.ProcessedItems == nil {
		campaign.ProcessedItems = models.Int64Ptr(0)
	}
	*campaign.ProcessedItems += int64(processedInThisBatch)

	if campaign.ProgressPercentage == nil {
		campaign.ProgressPercentage = models.Float64Ptr(0.0)
	}

	currentProcessedItemsVal := *campaign.ProcessedItems // Use the updated value

	if genParams.NumDomainsToGenerate > 0 {
		*campaign.ProgressPercentage = (float64(currentProcessedItemsVal) / float64(genParams.NumDomainsToGenerate)) * 100
	} else {
		if genParams.TotalPossibleCombinations > 0 {
			*campaign.ProgressPercentage = (float64(genParams.CurrentOffset) / float64(genParams.TotalPossibleCombinations)) * 100
		} else {
			*campaign.ProgressPercentage = 100.0
		}
	}
	if *campaign.ProgressPercentage > 100.0 {
		*campaign.ProgressPercentage = 100.0
	}

	if (genParams.NumDomainsToGenerate > 0 && currentProcessedItemsVal >= int64(genParams.NumDomainsToGenerate)) ||
		(genParams.CurrentOffset >= genParams.TotalPossibleCombinations) {
		campaign.Status = models.CampaignStatusCompleted
		campaign.ProgressPercentage = models.Float64Ptr(100.0)
		campaign.CompletedAt = &nowTime
		done = true
		log.Printf("ProcessGenerationCampaignBatch: Campaign %s completed. Processed: %d. Target: %d. Global Offset: %d. Total Possible: %d",
			campaignID, campaign.ProcessedItems, genParams.NumDomainsToGenerate, genParams.CurrentOffset, genParams.TotalPossibleCombinations)
		
		// Broadcast campaign completion via WebSocket
		websocket.BroadcastCampaignProgress(campaignID.String(), 100.0, "completed", "domain_generation")
	} else {
		done = false
		
		// Broadcast campaign progress update via WebSocket
		progressPercent := 0.0
		if campaign.ProgressPercentage != nil {
			progressPercent = *campaign.ProgressPercentage
		}
		websocket.BroadcastCampaignProgress(campaignID.String(), progressPercent, "running", "domain_generation")
	}

	if errUpdateCampaign := s.campaignStore.UpdateCampaign(ctx, querier, campaign); errUpdateCampaign != nil {
		opErr = fmt.Errorf("failed to update campaign %s status/progress: %w", campaignID, errUpdateCampaign)
		log.Printf("[ProcessGenerationCampaignBatch] %v", opErr)
		return false, processedInThisBatch, opErr
	}

	currentProcessedItems := int64(0)
	if campaign.ProcessedItems != nil {
		currentProcessedItems = *campaign.ProcessedItems
	}
	log.Printf("ProcessGenerationCampaignBatch: Finished batch for campaignID %s. ProcessedInBatch: %d, DoneForJob: %t, CampaignProcessedItems: %d, NewCampaignGlobalOffset: %d",
		campaignID, processedInThisBatch, done, currentProcessedItems, genParams.CurrentOffset)

	return done, processedInThisBatch, opErr
}
