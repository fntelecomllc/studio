// File: backend/internal/services/dns_campaign_service.go
package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/dnsvalidator"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/fntelecomllc/studio/backend/internal/websocket"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type dnsCampaignServiceImpl struct {
	db               *sqlx.DB
	campaignStore    store.CampaignStore
	personaStore     store.PersonaStore
	auditLogStore    store.AuditLogStore
	campaignJobStore store.CampaignJobStore
	appConfig        *config.AppConfig
}

// NewDNSCampaignService creates a new DNSCampaignService.
func NewDNSCampaignService(db *sqlx.DB, cs store.CampaignStore, ps store.PersonaStore, as store.AuditLogStore, cjs store.CampaignJobStore, appCfg *config.AppConfig) DNSCampaignService {
	return &dnsCampaignServiceImpl{
		db:               db,
		campaignStore:    cs,
		personaStore:     ps,
		auditLogStore:    as,
		campaignJobStore: cjs,
		appConfig:        appCfg,
	}
}

func (s *dnsCampaignServiceImpl) CreateCampaign(ctx context.Context, req CreateDNSValidationCampaignRequest) (*models.Campaign, error) {
	log.Printf("DNSCampaignService: CreateCampaign called with Name: %s, SourceGenCampaignID: %s", req.Name, req.SourceGenerationCampaignID)
	now := time.Now().UTC()
	campaignID := uuid.New()

	// Validate personas using a conditional querier (read-only pattern)
	var validationQuerier store.Querier
	if s.db != nil {
		validationQuerier = s.db
	}
	if err := s.validatePersonaIDs(ctx, validationQuerier, req.PersonaIDs, models.PersonaTypeDNS); err != nil {
		return nil, fmt.Errorf("dns create: persona validation failed: %w", err)
	}

	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			log.Printf("Error beginning SQL transaction for DNS CreateCampaign %s: %v", req.Name, startTxErr)
			return nil, fmt.Errorf("dns create: failed to begin SQL transaction: %w", startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for DNS CreateCampaign %s.", req.Name)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL DNS CreateCampaign for %s, rolling back: %v", req.Name, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("Error occurred for DNS CreateCampaign %s (SQL), rolling back: %v", req.Name, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("Error committing SQL transaction for DNS CreateCampaign %s: %v", req.Name, commitErr)
					opErr = commitErr
				} else {
					log.Printf("SQL Transaction committed for DNS CreateCampaign %s.", req.Name)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for DNS CreateCampaign %s (no service-level transaction).", req.Name)
		// querier remains nil
	}

	sourceGenParams, errGetSource := s.campaignStore.GetDomainGenerationParams(ctx, querier, req.SourceGenerationCampaignID)
	if errGetSource != nil {
		opErr = fmt.Errorf("dns create: failed to fetch source generation campaign params %s: %w", req.SourceGenerationCampaignID, errGetSource)
		return nil, opErr
	}
	totalItems := int64(sourceGenParams.NumDomainsToGenerate)

	var userIDPtr *uuid.UUID
	if req.UserID != uuid.Nil {
		userIDPtr = &req.UserID
	}
	baseCampaign := &models.Campaign{
		ID:                 campaignID,
		Name:               req.Name,
		CampaignType:       models.CampaignTypeDNSValidation,
		Status:             models.CampaignStatusPending,
		UserID:             userIDPtr,
		CreatedAt:          now,
		UpdatedAt:          now,
		TotalItems:         models.Int64Ptr(totalItems),
		ProcessedItems:     models.Int64Ptr(0),
		ProgressPercentage: models.Float64Ptr(0.0),
	}

	dnsParams := &models.DNSValidationCampaignParams{
		CampaignID:                 campaignID,
		SourceGenerationCampaignID: &req.SourceGenerationCampaignID,
		PersonaIDs:                 req.PersonaIDs,
		RotationIntervalSeconds:    models.IntPtr(req.RotationIntervalSeconds),
		ProcessingSpeedPerMinute:   models.IntPtr(req.ProcessingSpeedPerMinute),
		BatchSize:                  models.IntPtr(req.BatchSize),
		RetryAttempts:              models.IntPtr(req.RetryAttempts),
	}
	if dnsParams.BatchSize == nil || *dnsParams.BatchSize == 0 {
		dnsParams.BatchSize = models.IntPtr(50)
	}
	if dnsParams.RetryAttempts == nil || *dnsParams.RetryAttempts == 0 {
		dnsParams.RetryAttempts = models.IntPtr(1)
	}
	baseCampaign.DNSValidationParams = dnsParams

	opErr = s.campaignStore.CreateCampaign(ctx, querier, baseCampaign)
	if opErr != nil {
		// opErr is set, defer will handle rollback if in transaction
		return nil, fmt.Errorf("dns create: failed to create base campaign: %w", opErr)
	}

	opErr = s.campaignStore.CreateDNSValidationParams(ctx, querier, dnsParams)
	if opErr != nil {
		// opErr is set, defer will handle rollback if in transaction
		return nil, fmt.Errorf("dns create: failed to create DNS validation params: %w", opErr)
	}

	if opErr == nil {
		s.logAuditEvent(ctx, querier, baseCampaign, "DNS Validation Campaign Created (Service)", fmt.Sprintf("Name: %s, SourceCampaignID: %s", req.Name, req.SourceGenerationCampaignID))

		// Create a job for the campaign if campaignJobStore is available
		if s.campaignJobStore != nil {
			jobCreationTime := time.Now().UTC()
			job := &models.CampaignJob{
				ID:              uuid.New(),
				CampaignID:      baseCampaign.ID,
				JobType:         models.CampaignTypeDNSValidation,
				Status:          models.JobStatusQueued,
				ScheduledAt:     jobCreationTime,
				NextExecutionAt: sql.NullTime{Time: jobCreationTime, Valid: true},
				CreatedAt:       jobCreationTime,
				UpdatedAt:       jobCreationTime,
				MaxAttempts:     3,
			}

			if err := s.campaignJobStore.CreateJob(ctx, querier, job); err != nil {
				log.Printf("Warning: failed to create initial job for DNS campaign %s: %v", baseCampaign.ID, err)
				// Don't fail the campaign creation if job creation fails
			} else {
				log.Printf("Created initial job for DNS campaign %s", baseCampaign.ID)
			}
		} else {
			log.Printf("Warning: campaignJobStore is nil for DNS campaign %s. Skipping job creation.", baseCampaign.ID)
		}
	}

	return baseCampaign, opErr
}

func (s *dnsCampaignServiceImpl) GetCampaignDetails(ctx context.Context, campaignID uuid.UUID) (*models.Campaign, *models.DNSValidationCampaignParams, error) {
	var querier store.Querier
	if s.db != nil {
		querier = s.db
	}

	campaign, err := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get campaign by ID %s: %w", campaignID, err)
	}
	if campaign.CampaignType != models.CampaignTypeDNSValidation {
		return nil, nil, fmt.Errorf("campaign %s is not a DNS validation campaign (type: %s)", campaignID, campaign.CampaignType)
	}

	params, err := s.campaignStore.GetDNSValidationParams(ctx, querier, campaignID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get DNS validation params for campaign %s: %w", campaignID, err)
	}
	return campaign, params, nil
}

func (s *dnsCampaignServiceImpl) validatePersonaIDs(ctx context.Context, querier store.Querier, personaIDs []uuid.UUID, expectedType models.PersonaTypeEnum) error {
	if len(personaIDs) == 0 {
		return fmt.Errorf("%s Persona IDs required", expectedType)
	}
	for _, pID := range personaIDs {
		persona, err := s.personaStore.GetPersonaByID(ctx, querier, pID)
		if err != nil {
			if err == store.ErrNotFound {
				return fmt.Errorf("%s persona ID '%s' not found", expectedType, pID)
			}
			return fmt.Errorf("verifying %s persona ID '%s': %w", expectedType, pID, err)
		}
		if persona.PersonaType != expectedType {
			return fmt.Errorf("persona ID '%s' type '%s', expected '%s'", pID, persona.PersonaType, expectedType)
		}
		if !persona.IsEnabled {
			return fmt.Errorf("%s persona ID '%s' disabled", expectedType, pID)
		}
	}
	return nil
}

func (s *dnsCampaignServiceImpl) logAuditEvent(ctx context.Context, exec store.Querier, campaign *models.Campaign, action, description string) {
	detailsMap := map[string]string{
		"campaign_name": campaign.Name,
		"description":   description,
	}
	detailsJSON, err := json.Marshal(detailsMap)
	if err != nil {
		log.Printf("Error marshalling audit log details for campaign %s, action %s: %v. Using raw description.", campaign.ID, action, err)
		detailsJSON = json.RawMessage(fmt.Sprintf(`{"campaign_name": "%s", "description": "Details marshalling error: %s"}`, campaign.Name, description))
	}

	var auditLogUserID sql.NullString
	if campaign.UserID != nil {
		auditLogUserID = sql.NullString{String: campaign.UserID.String(), Valid: true}
	}
	auditLog := &models.AuditLog{
		Timestamp:  time.Now().UTC(),
		UserID:     auditLogUserID,
		Action:     action,
		EntityType: sql.NullString{String: "Campaign", Valid: true},
		EntityID:   uuid.NullUUID{UUID: campaign.ID, Valid: true},
		Details:    models.JSONRawMessagePtr(detailsJSON),
	}
	if err := s.auditLogStore.CreateAuditLog(ctx, exec, auditLog); err != nil {
		log.Printf("Error creating audit log for campaign %s, action %s: %v", campaign.ID, action, err)
	}
}

func modelsDNStoConfigDNSJSON(details models.DNSConfigDetails) config.DNSValidatorConfigJSON {
	return config.DNSValidatorConfigJSON{
		Resolvers:                  details.Resolvers,
		UseSystemResolvers:         details.UseSystemResolvers,
		QueryTimeoutSeconds:        details.QueryTimeoutSeconds,
		MaxDomainsPerRequest:       details.MaxDomainsPerRequest,
		ResolverStrategy:           details.ResolverStrategy,
		ResolversWeighted:          details.ResolversWeighted,
		ResolversPreferredOrder:    details.ResolversPreferredOrder,
		ConcurrentQueriesPerDomain: details.ConcurrentQueriesPerDomain,
		QueryDelayMinMs:            details.QueryDelayMinMs,
		QueryDelayMaxMs:            details.QueryDelayMaxMs,
		MaxConcurrentGoroutines:    details.MaxConcurrentGoroutines,
		RateLimitDPS:               details.RateLimitDps,
		RateLimitBurst:             details.RateLimitBurst,
	}
}

func (s *dnsCampaignServiceImpl) ProcessDNSValidationCampaignBatch(ctx context.Context, campaignID uuid.UUID) (done bool, processedInThisBatch int, err error) {
	log.Printf("ProcessDNSValidationCampaignBatch: Starting for campaignID %s", campaignID)

	var opErr error
	var querier store.Querier
	isSQL := s.db != nil
	var sqlTx *sqlx.Tx

	if isSQL {
		var startTxErr error
		sqlTx, startTxErr = s.db.BeginTxx(ctx, nil)
		if startTxErr != nil {
			return false, 0, fmt.Errorf("failed to begin SQL transaction for DNS campaign %s: %w", campaignID, startTxErr)
		}
		querier = sqlTx
		log.Printf("SQL Transaction started for ProcessDNSValidationCampaignBatch %s.", campaignID)

		defer func() {
			if p := recover(); p != nil {
				log.Printf("Panic recovered during SQL ProcessDNSValidationCampaignBatch for %s, rolling back: %v", campaignID, p)
				_ = sqlTx.Rollback()
				panic(p)
			} else if opErr != nil {
				log.Printf("ProcessDNSValidationCampaignBatch: Rolled back SQL transaction for campaign %s due to error: %v", campaignID, opErr)
				_ = sqlTx.Rollback()
			} else {
				if commitErr := sqlTx.Commit(); commitErr != nil {
					log.Printf("ProcessDNSValidationCampaignBatch: Failed to commit SQL transaction for campaign %s: %v", campaignID, commitErr)
					opErr = fmt.Errorf("failed to commit SQL transaction: %w", commitErr)
				} else {
					log.Printf("SQL Transaction committed for ProcessDNSValidationCampaignBatch %s.", campaignID)
				}
			}
		}()
	} else {
		log.Printf("Operating in Firestore mode for ProcessDNSValidationCampaignBatch %s (no service-level transaction).", campaignID)
		// querier remains nil
	}

	campaign, errGetCamp := s.campaignStore.GetCampaignByID(ctx, querier, campaignID)
	if errGetCamp != nil {
		opErr = fmt.Errorf("failed to fetch campaign %s: %w", campaignID, errGetCamp)
		return false, 0, opErr
	}

	// Fix the status transition logic
	originalStatus := campaign.Status
	if campaign.Status == models.CampaignStatusPending || campaign.Status == models.CampaignStatusQueued {
		campaign.Status = models.CampaignStatusRunning
		now := time.Now().UTC()
		campaign.StartedAt = &now
		if errUpdateCamp := s.campaignStore.UpdateCampaign(ctx, querier, campaign); errUpdateCamp != nil {
			opErr = fmt.Errorf("failed to mark campaign %s as running: %w", campaignID, errUpdateCamp)
			return false, 0, opErr
		}
		log.Printf("ProcessDNSValidationCampaignBatch: Campaign %s marked as Running (was %s).", campaignID, originalStatus)
	} else if campaign.Status != models.CampaignStatusRunning {
		log.Printf("ProcessDNSValidationCampaignBatch: Campaign %s not runnable (status: %s). Skipping.", campaignID, campaign.Status)
		return true, 0, nil
	}

	dnsParams, errGetParams := s.campaignStore.GetDNSValidationParams(ctx, querier, campaignID)
	if errGetParams != nil {
		opErr = fmt.Errorf("failed to fetch DNS params for campaign %s: %w", campaignID, errGetParams)
		return false, 0, opErr
	}
	if dnsParams.SourceGenerationCampaignID == nil {
		opErr = fmt.Errorf("ProcessDNSValidationCampaignBatch: SourceGenerationCampaignID is nil for DNS params of campaign %s", campaignID)
		return false, 0, opErr
	}
	sourceGenParams, errGetSourceParams := s.campaignStore.GetDomainGenerationParams(ctx, querier, *dnsParams.SourceGenerationCampaignID)
	if errGetSourceParams != nil {
		opErr = fmt.Errorf("failed to fetch params for source generation campaign %s: %w", dnsParams.SourceGenerationCampaignID, errGetSourceParams)
		return false, 0, opErr
	}
	expectedTotalItems := int64(sourceGenParams.NumDomainsToGenerate)
	if campaign.TotalItems == nil || *campaign.TotalItems != expectedTotalItems {
		log.Printf("ProcessDNSValidationCampaignBatch: Correcting TotalItems for campaign %s from %v to %d based on source.",
			campaignID, campaign.TotalItems, expectedTotalItems)
		campaign.TotalItems = models.Int64Ptr(expectedTotalItems)
	}

	// Ensure pointers are not nil for upcoming operations, defaulting to 0 if they are.
	// This is a safe-guard; they should be initialized.
	if campaign.ProcessedItems == nil {
		campaign.ProcessedItems = models.Int64Ptr(0)
	}
	if campaign.TotalItems == nil { // Should have been set above
		campaign.TotalItems = models.Int64Ptr(0)
	}
	if campaign.ProgressPercentage == nil {
		campaign.ProgressPercentage = models.Float64Ptr(0.0)
	}

	if *campaign.ProcessedItems >= *campaign.TotalItems && *campaign.TotalItems > 0 {
		log.Printf("ProcessDNSValidationCampaignBatch: Campaign %s already validated all %d domains. Marking complete.", campaignID, *campaign.TotalItems)
		campaign.Status = models.CampaignStatusCompleted
		campaign.ProgressPercentage = models.Float64Ptr(100.0)
		now := time.Now().UTC()
		campaign.CompletedAt = &now
		opErr = s.campaignStore.UpdateCampaign(ctx, querier, campaign)
		return true, 0, opErr
	}

	var batchSizeVal int
	if dnsParams.BatchSize != nil && *dnsParams.BatchSize > 0 {
		batchSizeVal = *dnsParams.BatchSize
	} else {
		batchSizeVal = 50
	}
	// Ensure SourceGenerationCampaignID is not nil before dereferencing
	if dnsParams.SourceGenerationCampaignID == nil {
		opErr = fmt.Errorf("ProcessDNSValidationCampaignBatch: SourceGenerationCampaignID is nil when trying to get domains for campaign %s", campaignID)
		return false, 0, opErr
	}
	domainsToProcess, errGetDomains := s.campaignStore.GetDomainsForDNSValidation(ctx, querier, campaignID, *dnsParams.SourceGenerationCampaignID, batchSizeVal, 0)
	if errGetDomains != nil {
		opErr = fmt.Errorf("failed to get domains for DNS validation for campaign %s: %w", campaignID, errGetDomains)
		return false, 0, opErr
	}

	if len(domainsToProcess) == 0 {
		log.Printf("ProcessDNSValidationCampaignBatch: No more domains to process for campaign %s. Checking for completion.", campaignID)
		if campaign.ProcessedItems == nil {
			campaign.ProcessedItems = models.Int64Ptr(0)
		}
		if campaign.TotalItems == nil {
			campaign.TotalItems = models.Int64Ptr(0)
		} // Should be set

		if *campaign.ProcessedItems >= *campaign.TotalItems && *campaign.TotalItems > 0 {
			campaign.Status = models.CampaignStatusCompleted
			campaign.ProgressPercentage = models.Float64Ptr(100.0)
			now := time.Now().UTC()
			campaign.CompletedAt = &now
			log.Printf("ProcessDNSValidationCampaignBatch: All domains processed for campaign %s. Marking complete.", campaignID)
			done = true
		} else if *campaign.TotalItems == 0 {
			campaign.Status = models.CampaignStatusCompleted
			campaign.ProgressPercentage = models.Float64Ptr(100.0)
			now := time.Now().UTC()
			campaign.CompletedAt = &now
			log.Printf("ProcessDNSValidationCampaignBatch: Campaign %s has 0 total items. Marking complete.", campaignID)
			done = true
		} else {
			log.Printf("ProcessDNSValidationCampaignBatch: Campaign %s has %d/%d processed, but no domains fetched for this batch. May need more jobs or source completed.", campaignID, *campaign.ProcessedItems, *campaign.TotalItems)
			done = true
		}
		opErr = s.campaignStore.UpdateCampaign(ctx, querier, campaign)
		return done, 0, opErr
	}

	personas := make([]*models.Persona, 0, len(dnsParams.PersonaIDs))
	for _, pID := range dnsParams.PersonaIDs {
		p, pErr := s.personaStore.GetPersonaByID(ctx, querier, pID)
		if pErr != nil {
			opErr = fmt.Errorf("failed to fetch DNS persona %s for campaign %s: %w", pID, campaignID, pErr)
			return false, 0, opErr
		}
		if p.PersonaType != models.PersonaTypeDNS || !p.IsEnabled {
			opErr = fmt.Errorf("persona %s is not a valid/enabled DNS persona for campaign %s", pID, campaignID)
			return false, 0, opErr
		}
		personas = append(personas, p)
	}
	if len(personas) == 0 {
		opErr = fmt.Errorf("no valid DNS personas configured for campaign %s", campaignID)
		return false, 0, opErr
	}

	var wg sync.WaitGroup
	concurrencyLimit := s.appConfig.Worker.DNSSubtaskConcurrency
	if concurrencyLimit <= 0 {
		concurrencyLimit = 10
	}
	semaphore := make(chan struct{}, concurrencyLimit)
	muResults := sync.Mutex{}
	dbResults := make([]*models.DNSValidationResult, 0, len(domainsToProcess))
	nowTime := time.Now().UTC()

	// Store the original context error, if any, to check after the loop
	// This helps determine if the loop was cut short by cancellation.
	var batchProcessingContextErr error
	batchCtx, batchCancel := context.WithCancel(ctx) // Create a cancellable context for this batch
	defer batchCancel()                              // Ensure cancellation if function exits early for other reasons

	for _, domainToValidate := range domainsToProcess {
		// Check for batch context cancellation before starting new goroutine
		if batchCtx.Err() != nil {
			log.Printf("Batch context cancelled before processing domain %s for campaign %s", domainToValidate.DomainName, campaignID)
			batchProcessingContextErr = batchCtx.Err()
			break // Exit the domain processing loop
		}

		wg.Add(1)
		semaphore <- struct{}{}
		go func(domainModel models.GeneratedDomain) {
			defer wg.Done()
			defer func() { <-semaphore }()

			var finalValidationResult *dnsvalidator.ValidationResult
			var successPersonaID uuid.NullUUID
			attemptCount := 0

			for i, persona := range personas {
				// Check for batch context cancellation before each persona attempt
				if batchCtx.Err() != nil {
					log.Printf("Batch context cancelled during persona processing for domain %s (persona %s)", domainModel.DomainName, persona.ID)
					finalValidationResult = &dnsvalidator.ValidationResult{Domain: domainModel.DomainName, Status: "Error", Error: fmt.Sprintf("Context cancelled during persona %s processing", persona.ID)}
					goto StoreResultInGoRoutine
				}

				attemptCount++

				var modelDNSDetails models.DNSConfigDetails
				if errUnmarshal := json.Unmarshal(persona.ConfigDetails, &modelDNSDetails); errUnmarshal != nil {
					log.Printf("Error unmarshalling DNS persona %s ConfigDetails for domain %s: %v. Using app defaults.", persona.ID, domainModel.DomainName, errUnmarshal)
					validator := dnsvalidator.New(s.appConfig.DNSValidator)
					valResult := validator.ValidateSingleDomain(domainModel.DomainName, batchCtx) // Use batchCtx
					finalValidationResult = &valResult
					goto StoreResultInGoRoutine
				}

				configDNSJSON := modelsDNStoConfigDNSJSON(modelDNSDetails)
				validatorConfig := config.ConvertJSONToDNSConfig(configDNSJSON)
				validator := dnsvalidator.New(validatorConfig)
				valResult := validator.ValidateSingleDomain(domainModel.DomainName, batchCtx) // Use batchCtx

				if valResult.Status == "Resolved" {
					finalValidationResult = &valResult
					successPersonaID = uuid.NullUUID{UUID: persona.ID, Valid: true}
					goto StoreResultInGoRoutine
				}
				finalValidationResult = &valResult

				rotationInterval := 0
				if dnsParams.RotationIntervalSeconds != nil {
					rotationInterval = *dnsParams.RotationIntervalSeconds
				}
				if i < len(personas)-1 && rotationInterval > 0 {
					select {
					case <-batchCtx.Done(): // Use batchCtx.Done()
						log.Printf("Batch context cancelled during DNS persona rotation for domain %s", domainModel.DomainName)
						finalValidationResult = &dnsvalidator.ValidationResult{Domain: domainModel.DomainName, Status: "Error", Error: "Context cancelled during rotation"}
						goto StoreResultInGoRoutine
					case <-time.After(time.Duration(rotationInterval) * time.Second):
						// Continue
					}
				}
			} // End persona loop

			// After persona loop, check batch context one last time
			if batchCtx.Err() != nil && finalValidationResult == nil { // only if not already set due to cancellation
				log.Printf("Batch context cancelled after all DNS persona attempts for domain %s", domainModel.DomainName)
				finalValidationResult = &dnsvalidator.ValidationResult{
					Domain: domainModel.DomainName,
					Status: "Error",
					Error:  "Context cancelled after all attempts",
				}
			}

		StoreResultInGoRoutine:
			if finalValidationResult == nil {
				log.Printf("CRITICAL: finalValidationResult is nil for domain %s before storing. Setting to generic error.", domainModel.DomainName)
				finalValidationResult = &dnsvalidator.ValidationResult{
					Domain: domainModel.DomainName,
					Status: "Error",
					Error:  "Internal processing error: validation result not captured.",
				}
			}

			dbRes := &models.DNSValidationResult{
				ID:                   uuid.New(),
				DNSCampaignID:        campaignID,
				GeneratedDomainID:    uuid.NullUUID{UUID: domainModel.ID, Valid: true},
				DomainName:           domainModel.DomainName,
				ValidationStatus:     finalValidationResult.Status,
				ValidatedByPersonaID: successPersonaID,
				Attempts:             models.IntPtr(attemptCount),
				LastCheckedAt:        &nowTime,
			}
			if len(finalValidationResult.IPs) > 0 {
				ipBytes, _ := json.Marshal(finalValidationResult.IPs)
				dbRes.DNSRecords = models.JSONRawMessagePtr(json.RawMessage(ipBytes))
			} else if finalValidationResult.Error != "" {
				errorMap := map[string]string{"error": finalValidationResult.Error}
				errorBytes, _ := json.Marshal(errorMap)
				dbRes.DNSRecords = models.JSONRawMessagePtr(json.RawMessage(errorBytes))
			}

			muResults.Lock()
			dbResults = append(dbResults, dbRes)
			muResults.Unlock()
		}(*domainToValidate)
	}
	wg.Wait()

	// If the loop was exited due to batch context cancellation, batchProcessingContextErr will be set.
	if batchProcessingContextErr != nil {
		log.Printf("Context cancelled during DNS batch processing for campaign %s. Partial results may be saved. Error: %v", campaignID, batchProcessingContextErr)
		// Set opErr to ensure transaction rollback if in SQL mode and to signal an issue.
		// Preserve original opErr if it was already set (e.g., by a DB call before the loop).
		if opErr == nil {
			opErr = fmt.Errorf("context cancelled during batch processing: %w", batchProcessingContextErr)
		}
	}

	if len(dbResults) > 0 {
		if errCreateResults := s.campaignStore.CreateDNSValidationResults(ctx, querier, dbResults); errCreateResults != nil {
			currentErr := fmt.Errorf("failed to save DNS validation results for campaign %s: %w", campaignID, errCreateResults)
			if opErr == nil {
				opErr = currentErr
			} else { // opErr was already set (e.g. context cancellation), log this new error
				log.Printf("Additionally failed to save DNS results for campaign %s: %v (original opErr: %v)", campaignID, currentErr, opErr)
			}
			// Do not return yet if opErr was from context cancellation, allow campaign update attempt
			// If opErr was nil and now set by CreateDNSValidationResults, this is the primary error.
			if batchProcessingContextErr == nil { // If not a context error, this is the main failure.
				return false, 0, opErr
			}
		} else {
			processedInThisBatch = len(dbResults)
			log.Printf("ProcessDNSValidationCampaignBatch: Saved %d DNS results for campaign %s.", processedInThisBatch, campaignID)
		}
	}

	// Only update ProcessedItems if opErr is not from a critical save failure of results
	// or if it's a context cancellation (where some results might have been saved)
	if opErr == nil || batchProcessingContextErr != nil {
		if campaign.ProcessedItems == nil {
			campaign.ProcessedItems = models.Int64Ptr(0)
		}
		*campaign.ProcessedItems += int64(processedInThisBatch)
	}

	if campaign.TotalItems == nil {
		campaign.TotalItems = models.Int64Ptr(0)
	} // Should be set
	if campaign.ProcessedItems == nil {
		campaign.ProcessedItems = models.Int64Ptr(0)
	}
	if campaign.ProgressPercentage == nil {
		campaign.ProgressPercentage = models.Float64Ptr(0.0)
	}

	if *campaign.TotalItems > 0 {
		*campaign.ProgressPercentage = (float64(*campaign.ProcessedItems) / float64(*campaign.TotalItems)) * 100
		if *campaign.ProgressPercentage > 100 {
			*campaign.ProgressPercentage = 100
		}
	} else if *campaign.TotalItems == 0 { // If total is 0, it's 100% done
		*campaign.ProgressPercentage = 100
	}

	// Determine 'done' status based on current state, even if there was a context error
	if *campaign.ProcessedItems >= *campaign.TotalItems && *campaign.TotalItems > 0 {
		campaign.Status = models.CampaignStatusCompleted
		campaign.ProgressPercentage = models.Float64Ptr(100.0)
		campaign.CompletedAt = &nowTime
		done = true
		log.Printf("ProcessDNSValidationCampaignBatch: Campaign %s completed DNS validation (post-batch).", campaignID)
	} else if *campaign.TotalItems == 0 {
		campaign.Status = models.CampaignStatusCompleted
		campaign.ProgressPercentage = models.Float64Ptr(100.0)
		campaign.CompletedAt = &nowTime
		done = true
		log.Printf("ProcessDNSValidationCampaignBatch: Campaign %s has 0 total items, marked as completed (post-batch).", campaignID)
	} else {
		done = false
	}

	if errUpdateCamp := s.campaignStore.UpdateCampaign(ctx, querier, campaign); errUpdateCamp != nil {
		currentErr := fmt.Errorf("failed to update campaign %s status/progress: %w", campaignID, errUpdateCamp)
		if opErr == nil {
			opErr = currentErr
		} else {
			log.Printf("ProcessDNSValidationCampaignBatch: Also failed to update campaign %s status/progress: %v (original opErr: %v)", campaignID, currentErr, opErr)
		}
		// If opErr was from context cancellation or result saving, this return includes processed count.
		// If opErr is newly set here, processedInThisBatch might be from a successful save.
		return false, processedInThisBatch, opErr
	}

	// Broadcast DNS validation progress via WebSocket
	if campaign.ProgressPercentage != nil && campaign.ProcessedItems != nil && campaign.TotalItems != nil {
		processedCount := *campaign.ProcessedItems
		totalCount := *campaign.TotalItems
		
		if done {
			// Campaign completed
			websocket.BroadcastCampaignProgress(campaignID.String(), 100.0, "completed", "dns_validation")
		} else {
			// Progress update
			websocket.BroadcastValidationProgress(campaignID.String(), processedCount, totalCount, "dns_validation")
		}
	}

	processedItemsVal := int64(0)
	if campaign.ProcessedItems != nil {
		processedItemsVal = *campaign.ProcessedItems
	}
	totalItemsVal := int64(0)
	if campaign.TotalItems != nil {
		totalItemsVal = *campaign.TotalItems
	}
	log.Printf("ProcessDNSValidationCampaignBatch: Finished batch for campaign %s. ProcessedInBatch: %d, DoneForJob: %t, CampaignProcessed: %d/%d, Final opErr: %v",
		campaignID, processedInThisBatch, done, processedItemsVal, totalItemsVal, opErr)
	return done, processedInThisBatch, opErr
}
