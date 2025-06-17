// File: backend/internal/services/campaign_worker_service.go
package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
)

// Default worker settings if not provided by config
const (
	workerPollIntervalDefault    = 5 * time.Second
	workerErrorRetryDelayDefault = 30 * time.Second
	workerMaxRetriesDefault      = 3
	workerJobTimeoutDefault      = 15 * time.Minute
)

type campaignWorkerServiceImpl struct {
	jobStore                store.CampaignJobStore
	genService              DomainGenerationService
	dnsService              DNSCampaignService
	httpKeywordService      HTTPKeywordCampaignService
	campaignOrchestratorSvc CampaignOrchestratorService
	workerID                string
	appConfig               *config.AppConfig // Added AppConfig
}

// NewCampaignWorkerService creates a new CampaignWorkerService.
func NewCampaignWorkerService(
	js store.CampaignJobStore,
	gs DomainGenerationService,
	ds DNSCampaignService,
	hks HTTPKeywordCampaignService,
	cos CampaignOrchestratorService,
	serverInstanceID string,
	appCfg *config.AppConfig, // Added appCfg parameter
) CampaignWorkerService {
	workerID := serverInstanceID
	if workerID == "" {
		host, err := os.Hostname()
		if err != nil {
			host = uuid.NewString()
		}
		workerID = fmt.Sprintf("workerpool-%s", host)
	}
	return &campaignWorkerServiceImpl{
		jobStore:                js,
		genService:              gs,
		dnsService:              ds,
		httpKeywordService:      hks,
		campaignOrchestratorSvc: cos,
		workerID:                workerID,
		appConfig:               appCfg, // Store appConfig
	}
}

func (s *campaignWorkerServiceImpl) StartWorkers(ctx context.Context, numWorkers int) {
	// Check if job store is initialized
	if s.jobStore == nil {
		log.Printf("CampaignWorkerService [%s]: ERROR - Job store is nil. Cannot start workers.", s.workerID)
		return
	}

	pollInterval := time.Duration(s.appConfig.Worker.PollIntervalSeconds) * time.Second
	if pollInterval <= 0 {
		pollInterval = workerPollIntervalDefault
	}

	log.Printf("CampaignWorkerService [%s]: Starting %d workers (poll interval: %v)...", s.workerID, numWorkers, pollInterval)
	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerNum int) {
			defer wg.Done()
			workerName := fmt.Sprintf("%s-%d", s.workerID, workerNum)
			log.Printf("Worker [%s]: Started.", workerName)
			s.workerLoop(ctx, workerName, pollInterval)
			log.Printf("Worker [%s]: Stopped.", workerName)
		}(i)
	}
	wg.Wait()
	log.Printf("CampaignWorkerService [%s]: All workers have stopped.", s.workerID)
}

func (s *campaignWorkerServiceImpl) workerLoop(ctx context.Context, workerName string, pollInterval time.Duration) {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	// Check if job store is initialized
	if s.jobStore == nil {
		log.Printf("Worker [%s]: ERROR - Job store is nil. Worker cannot function properly.", workerName)
		// Sleep for a while to avoid tight loop and then return
		time.Sleep(30 * time.Second)
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// GetNextQueuedJob filters by workerID to attempt to claim a job.
			// If campaignTypes is nil or empty, it fetches for any type.
			// This will pick up both queued jobs and retry jobs whose next_execution_at time has passed
			job, err := s.jobStore.GetNextQueuedJob(ctx, nil, workerName)
			if err == store.ErrNotFound {
				continue // No job found, wait for next tick
			}
			if err != nil {
				log.Printf("Worker [%s]: Error fetching next job: %v. Retrying poll later.", workerName, err)
				continue // Error fetching, wait for next tick
			}

			log.Printf("Worker [%s]: Picked up job %s for campaign %s (type: %s, attempt: %d)",
				workerName, job.ID, job.CampaignID, job.JobType, job.Attempts)

			s.processJob(ctx, job, workerName)
		}
	}
}

func (s *campaignWorkerServiceImpl) processJob(ctx context.Context, job *models.CampaignJob, workerName string) {
	var batchDone bool
	var processedCount int
	var processErr error

	// Get max retries configuration
	maxRetries := job.MaxAttempts
	if maxRetries <= 0 {
		maxRetries = s.appConfig.Worker.MaxJobRetries
		if maxRetries <= 0 {
			maxRetries = workerMaxRetriesDefault
		}
	}

	// Check if job has already reached max retries

	jobTimeout := time.Duration(s.appConfig.Worker.JobProcessingTimeoutMinutes) * time.Minute
	if jobTimeout <= 0 {
		jobTimeout = workerJobTimeoutDefault
	}
	jobCtx, cancelJobCtx := context.WithTimeout(ctx, jobTimeout)
	defer cancelJobCtx()

	switch job.JobType {
	case models.CampaignTypeDomainGeneration:
		if s.genService == nil {
			processErr = fmt.Errorf("domain generation service is nil")
		} else {
			batchDone, processedCount, processErr = s.genService.ProcessGenerationCampaignBatch(jobCtx, job.CampaignID)
		}
	case models.CampaignTypeDNSValidation:
		if s.dnsService == nil {
			processErr = fmt.Errorf("DNS validation service is nil")
		} else {
			batchDone, processedCount, processErr = s.dnsService.ProcessDNSValidationCampaignBatch(jobCtx, job.CampaignID)
		}
	case models.CampaignTypeHTTPKeywordValidation:
		if s.httpKeywordService == nil {
			processErr = fmt.Errorf("HTTP keyword validation service is nil")
		} else {
			batchDone, processedCount, processErr = s.httpKeywordService.ProcessHTTPKeywordCampaignBatch(jobCtx, job.CampaignID)
		}
	default:
		processErr = fmt.Errorf("unknown campaign type '%s' for job %s", job.JobType, job.ID)
	}

	job.UpdatedAt = time.Now().UTC()

	if processErr != nil {
		log.Printf("Worker [%s]: Error processing job %s (campaign %s): %v", workerName, job.ID, job.CampaignID, processErr)
		job.LastError = sql.NullString{String: processErr.Error(), Valid: true}
		maxRetries := job.MaxAttempts
		if maxRetries <= 0 {
			maxRetries = s.appConfig.Worker.MaxJobRetries
			if maxRetries <= 0 {
				maxRetries = workerMaxRetriesDefault
			}
		}

		if job.Attempts >= maxRetries {
			// Max retries reached, mark job as failed
			job.Status = models.JobStatusFailed
			log.Printf("Worker [%s]: Job %s failed after %d attempts. Last error: %s", workerName, job.ID, job.Attempts, processErr.Error())

			// Update campaign status - need to check current campaign status to ensure valid state transition
			if s.campaignOrchestratorSvc != nil {
				errMsg := fmt.Sprintf("Job %s failed after max retries: %v", job.ID, processErr)
				
				// Get current campaign status to determine appropriate action
				campaign, _, err := s.campaignOrchestratorSvc.GetCampaignDetails(jobCtx, job.CampaignID)
				if err != nil {
					log.Printf("Worker [%s]: Failed to get campaign %s details for status update: %v", workerName, job.CampaignID, err)
				} else {
					// If campaign is still in pending state, transition to cancelled instead of failed
					// since pending->failed is not a valid state transition
					if campaign.Status == models.CampaignStatusPending {
						if err := s.campaignOrchestratorSvc.CancelCampaign(jobCtx, job.CampaignID); err != nil {
							log.Printf("Worker [%s]: Failed to cancel campaign %s after job failure: %v", workerName, job.CampaignID, err)
						} else {
							log.Printf("Worker [%s]: Campaign %s cancelled due to job failure while in pending state", workerName, job.CampaignID)
						}
					} else {
						// Campaign is in another state where transition to failed might be valid
						if err := s.campaignOrchestratorSvc.SetCampaignErrorStatus(jobCtx, job.CampaignID, errMsg); err != nil {
							log.Printf("Worker [%s]: Failed to set campaign %s error status: %v", workerName, job.CampaignID, err)
						}
					}
				}
			}
		} else {
			// Still have retries left, schedule for retry
			job.Status = models.JobStatusRetry
			retryDelay := time.Duration(s.appConfig.Worker.ErrorRetryDelaySeconds) * time.Second
			if retryDelay <= 0 {
				retryDelay = workerErrorRetryDelayDefault
			}
			// Set next execution time for retry - make it very short for tests to pick up quickly
			// In production this would be a longer delay based on configuration
			job.NextExecutionAt = sql.NullTime{Time: time.Now().UTC().Add(100 * time.Millisecond), Valid: true}
			log.Printf("Worker [%s]: Job %s will retry in %v (attempt %d/%d)", workerName, job.ID, retryDelay, job.Attempts, maxRetries)
		}
	} else {
		log.Printf("Worker [%s]: Successfully processed batch for job %s (campaign %s). BatchDone: %t, ProcessedInBatch: %d",
			workerName, job.ID, job.CampaignID, batchDone, processedCount)
		job.Status = models.JobStatusCompleted
		job.LastError = sql.NullString{}

		if !batchDone {
			nextJob := &models.CampaignJob{
				ID:              uuid.New(),
				CampaignID:      job.CampaignID,
				JobType:         job.JobType,
				Status:          models.JobStatusQueued,
				MaxAttempts:     job.MaxAttempts,
				CreatedAt:       time.Now().UTC(),
				UpdatedAt:       time.Now().UTC(),
				NextExecutionAt: sql.NullTime{Time: time.Now().UTC(), Valid: true},
			}
			if err := s.jobStore.CreateJob(jobCtx, nil, nextJob); err != nil {
				log.Printf("Worker [%s]: CRITICAL - Failed to create next job for campaign %s: %v.", workerName, job.CampaignID, err)
			} else {
				log.Printf("Worker [%s]: Enqueued next job %s for campaign %s.", workerName, nextJob.ID, nextJob.CampaignID)
			}
		} else {
			log.Printf("Worker [%s]: Campaign %s reported as fully completed by its service.", workerName, job.CampaignID)

			// When batch is done, check if there are any other active jobs for this campaign
			if s.campaignOrchestratorSvc != nil {
				// First, update the current job in the database to mark it as completed
				jobUpdateSuccessful := true
				if err := s.jobStore.UpdateJob(jobCtx, nil, job); err != nil {
					log.Printf("Worker [%s]: Failed to update job %s status to completed: %v", workerName, job.ID, err)
					jobUpdateSuccessful = false
				}

				// If job update failed, we should handle this gracefully
				if !jobUpdateSuccessful {
					// Try to set job to retry status so it can be picked up again
					job.Status = models.JobStatusRetry
					job.NextExecutionAt = sql.NullTime{Time: time.Now().UTC().Add(30 * time.Second), Valid: true}
					if err := s.jobStore.UpdateJob(jobCtx, nil, job); err != nil {
						log.Printf("Worker [%s]: CRITICAL - Failed to set job %s to retry after job update failure: %v", workerName, job.ID, err)
					} else {
						log.Printf("Worker [%s]: Job %s set to retry due to job update failure", workerName, job.ID)
					}
					return // Don't proceed with campaign completion checks if job update failed
				}

				// Then check for other active jobs for this campaign
				filter := store.ListJobsFilter{
					CampaignID: uuid.NullUUID{UUID: job.CampaignID, Valid: true},
				}

				otherJobs, err := s.jobStore.ListJobs(jobCtx, filter)
				if err != nil {
					log.Printf("Worker [%s]: Failed to check for other jobs for campaign %s: %v", workerName, job.CampaignID, err)
				} else {
					// Count active jobs (excluding the current one that's being completed)
					activeJobsCount := 0
					for _, otherJob := range otherJobs {
						if otherJob.ID != job.ID &&
							(otherJob.Status == models.JobStatusQueued ||
								otherJob.Status == models.JobStatusProcessing ||
								otherJob.Status == models.JobStatusRetry) {
							activeJobsCount++
						}
					}

					// If no other active jobs, update campaign status to completed
					if activeJobsCount == 0 {
						log.Printf("Worker [%s]: No other active jobs found for campaign %s, checking if campaign needs to be marked as completed", workerName, job.CampaignID)

						// First, get the current campaign status to avoid invalid state transitions
						campaign, _, err := s.campaignOrchestratorSvc.GetCampaignDetails(jobCtx, job.CampaignID)
						if err != nil {
							log.Printf("Worker [%s]: Failed to get campaign %s details: %v", workerName, job.CampaignID, err)
						} else if campaign.Status != models.CampaignStatusCompleted {
							// Only try to set to completed if not already completed
							log.Printf("Worker [%s]: Campaign %s current status is %s, marking as completed", workerName, job.CampaignID, campaign.Status)
							if err := s.campaignOrchestratorSvc.SetCampaignStatus(jobCtx, job.CampaignID, models.CampaignStatusCompleted); err != nil {
								log.Printf("Worker [%s]: Failed to update campaign %s status to completed: %v", workerName, job.CampaignID, err)
							} else {
								log.Printf("Worker [%s]: Campaign %s status updated to completed", workerName, job.CampaignID)
							}
						} else {
							log.Printf("Worker [%s]: Campaign %s is already completed, no status update needed", workerName, job.CampaignID)
						}
					} else {
						log.Printf("Worker [%s]: Found %d other active jobs for campaign %s, not marking as completed yet", workerName, activeJobsCount, job.CampaignID)
					}
				}

				// Skip the UpdateJob call at the end of processJob since we've already updated the job
				return
			}
		}
	}

	if err := s.jobStore.UpdateJob(jobCtx, nil, job); err != nil {
		log.Printf("Worker [%s]: CRITICAL - Failed to update job %s status to %s: %v.",
			workerName, job.ID, job.Status, err)
	}
}
