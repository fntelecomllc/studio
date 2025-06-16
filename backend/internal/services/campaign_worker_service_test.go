package services_test

import (
	"context"
	"errors"
	"log"
	"sync"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"

	"github.com/fntelecomllc/studio/backend/internal/testutil"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// erroringJobStore is a mock CampaignJobStore that fails UpdateJob once, then succeeds
// Used to simulate DB/network errors after job is picked up
// for stuck-in-processing tests
var _ store.CampaignJobStore = (*erroringJobStore)(nil)

type erroringJobStore struct {
	store.CampaignJobStore
	errorOnUpdate bool
}

func (ejs *erroringJobStore) UpdateJob(ctx context.Context, exec store.Querier, job *models.CampaignJob) error {
	errMsg := "simulated DB/network error on UpdateJob"
	if ejs.errorOnUpdate {
		ejs.errorOnUpdate = false // Only fail once
		return errors.New(errMsg)
	}
	return ejs.CampaignJobStore.UpdateJob(ctx, exec, job)
}

// mockDomainGenerationService implements services.DomainGenerationService for testing
type mockDomainGenerationService struct {
	// Embed the real service to inherit most methods
	services.DomainGenerationService

	// Control behavior for tests
	failProcessingCount     int
	failProcessingCountLock sync.Mutex
	failProcessingError     error
	processDelay            time.Duration
}

// newMockDomainGenerationService creates a new mock service that wraps a real service
func newMockDomainGenerationService(realService services.DomainGenerationService) *mockDomainGenerationService {
	return &mockDomainGenerationService{
		DomainGenerationService: realService,
		failProcessingError:     errors.New("simulated processing failure"),
	}
}

// SetFailProcessingCount configures the mock to fail the first N calls to ProcessGenerationCampaignBatch
func (m *mockDomainGenerationService) SetFailProcessingCount(count int) {
	m.failProcessingCountLock.Lock()
	defer m.failProcessingCountLock.Unlock()
	m.failProcessingCount = count
}

// SetProcessDelay adds a delay to ProcessGenerationCampaignBatch to simulate slow processing
func (m *mockDomainGenerationService) SetProcessDelay(delay time.Duration) {
	m.processDelay = delay
}

// ProcessGenerationCampaignBatch overrides the real implementation to allow simulating failures
func (m *mockDomainGenerationService) ProcessGenerationCampaignBatch(ctx context.Context, campaignID uuid.UUID) (bool, int, error) {
	// Apply configured delay if any
	if m.processDelay > 0 {
		select {
		case <-time.After(m.processDelay):
			// Delay completed
		case <-ctx.Done():
			return false, 0, ctx.Err()
		}
	}

	// Check if we should fail this call
	m.failProcessingCountLock.Lock()
	shouldFail := m.failProcessingCount > 0
	if shouldFail {
		m.failProcessingCount--
	}
	m.failProcessingCountLock.Unlock()

	if shouldFail {
		return false, 0, m.failProcessingError
	}

	// If not failing, delegate to the real implementation
	return m.DomainGenerationService.ProcessGenerationCampaignBatch(ctx, campaignID)
}

// setupWorkerTestEnvironment sets up the full environment needed for worker service tests.
// It uses the shared setupPostgresTestEnvironment from test_helpers_test.go
func setupWorkerTestEnvironment(t *testing.T) (
	db *sqlx.DB,
	dgService services.DomainGenerationService,
	dnsService services.DNSCampaignService,
	httpService services.HTTPKeywordCampaignService,
	orchestratorService services.CampaignOrchestratorService,
	jobStore store.CampaignJobStore,
	campaignStore store.CampaignStore,
	auditLogStore store.AuditLogStore,
	personaStore store.PersonaStore,
	keywordStore store.KeywordStore,
	proxyStore store.ProxyStore,
	appConfig *config.AppConfig,
	teardown func(),
) {
	// The 8th return value from setupPostgresTestEnvironment is proxyStore
	db, campaignStore, auditLogStore, personaStore, campaignJobStore, keywordStore, pgProxyStore, baseTeardown := testutil.SetupTestStores(t)

	if db == nil { // Test was skipped by base setup
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, func() {}
	}

	appCfg := &config.AppConfig{
		Worker: config.WorkerConfig{
			NumWorkers:                  1,
			PollIntervalSeconds:         1,
			MaxJobRetries:               1,
			ErrorRetryDelaySeconds:      1,
			JobProcessingTimeoutMinutes: 2, // Increased job timeout to allow for retries
		},
	}

	dgSvc := services.NewDomainGenerationService(db, campaignStore, campaignJobStore, auditLogStore)
	dnsSvc := services.NewDNSCampaignService(db, campaignStore, personaStore, auditLogStore, campaignJobStore, appCfg)

	httpSvc := services.NewHTTPKeywordCampaignService(db, campaignStore, personaStore, pgProxyStore, keywordStore, auditLogStore, campaignJobStore, nil, nil, nil, appCfg)

	orchSvc := services.NewCampaignOrchestratorService(db, campaignStore, personaStore, keywordStore, auditLogStore, campaignJobStore, dgSvc, dnsSvc, httpSvc)

	teardownFunc := func() {
		log.Println("Tearing down Worker Test Environment...")
		baseTeardown()
	}

	return db, dgSvc, dnsSvc, httpSvc, orchSvc, campaignJobStore, campaignStore, auditLogStore, personaStore, keywordStore, pgProxyStore, appCfg, teardownFunc
}

// createTestDomainGenerationCampaignAndJob is now in test_helpers_test.go

func TestCampaignWorkerServiceImpl_ProcessJob_DomainGeneration(t *testing.T) {
	db, dgService, dnsService, httpService, orchestratorService, jobStore, campaignStore, _, _, _, _, appConfig, teardown := setupWorkerTestEnvironment(t)
	defer teardown()

	if db == nil { // Test skipped
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	testWorkerID := "test-worker-001"

	workerService := services.NewCampaignWorkerService(jobStore, dgService, dnsService, httpService, orchestratorService, testWorkerID, appConfig)

	t.Run("Successful DomainGeneration Job Processing by Worker", func(t *testing.T) {
		numDomains := int64(2)
		// 1. Create the campaign. dgService.CreateCampaign creates the campaign (pending) and an initial job (queued).
		userID := "worker-test-user-" + uuid.New().String()
		campaignName := "SuccessDGWorkerJob " + time.Now().Format(time.RFC3339Nano)
		genReq := services.CreateDomainGenerationCampaignRequest{
			Name:                 campaignName,
			UserID:               userID,
			PatternType:          "prefix",
			VariableLength:       2, // Keep it small for faster generation
			CharacterSet:         "ab",
			ConstantString:       "test",
			TLD:                  ".com",
			NumDomainsToGenerate: numDomains,
		}
		campaign, err := dgService.CreateCampaign(ctx, genReq)
		require.NoError(t, err)
		require.NotNil(t, campaign)
		require.Equal(t, models.CampaignStatusPending, campaign.Status, "Campaign should be initially pending")

		// 2. Fetch the job created by dgService.CreateCampaign
		jobs, err := jobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
		require.NoError(t, err)
		require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
		initialJob := jobs[0]
		require.Equal(t, models.JobStatusQueued, initialJob.Status, "Job created by dgService should be queued")

		var workerWg sync.WaitGroup // Renamed from wg to workerWg for clarity
		workerWg.Add(1)

		// Create a cancellable context for the worker, derived from the main test context
		workerCtx, workerCancelFunc := context.WithCancel(ctx)

		go func() {
			defer workerWg.Done()
			log.Printf("Worker goroutine starting for job %s with its own context.", initialJob.ID)
			workerService.StartWorkers(workerCtx, 1) // Pass workerCtx to the worker
			log.Printf("Worker goroutine finished for job %s.", initialJob.ID)
		}()

		var processedJob *models.CampaignJob
		// var err error // err is already declared by dgService.CreateCampaign and jobStore.ListJobs
		for i := 0; i < 60; i++ { // Polls for ~30 seconds (60 * 500ms)
			processedJob, err = jobStore.GetJobByID(ctx, initialJob.ID)
			require.NoError(t, err)
			if processedJob != nil {
				t.Logf("Polling job %s, attempt %d: Status: %s, Attempts: %d, LastError: %s", initialJob.ID, i+1, processedJob.Status, processedJob.Attempts, processedJob.LastError.String)
				if processedJob.Status == models.JobStatusCompleted || processedJob.Status == models.JobStatusFailed {
					break
				}
			} else {
				t.Logf("Polling job %s, attempt %d: GetJobByID returned nil", initialJob.ID, i+1)
			}
			time.Sleep(500 * time.Millisecond)
		}

		t.Logf("Finished polling for job %s. Current status from poll: %s. Signalling worker to stop.", initialJob.ID, processedJob.Status)
		workerCancelFunc() // Explicitly cancel the worker's context to signal it to stop
		t.Logf("Worker context cancelled for job %s. Proceeding to workerWg.Wait().", initialJob.ID)

		workerWg.Wait() // Wait for the worker goroutine to actually finish
		t.Logf("Worker goroutine (workerWg.Wait()) finished for job %s.", initialJob.ID)

		// Re-fetch the job after wg.Wait() to get the absolute latest status,
		// as the worker might have updated it in its final moments or the polling might have missed the last update.
		// The main 'ctx' should still be valid here as its 60s timeout likely hasn't hit yet,
		// and its 'cancel()' is deferred until the end of the parent test function.
		finalProcessedJob, finalErr := jobStore.GetJobByID(ctx, initialJob.ID)
		require.NoError(t, finalErr, "Failed to fetch final job status for job %s after workerWg.Wait()", initialJob.ID)
		require.NotNil(t, finalProcessedJob, "Final processed job not found after workerWg.Wait() for job %s", initialJob.ID)

		// Use the final fetched job for assertions
		processedJob = finalProcessedJob
		t.Logf("Final status for job %s after workerWg.Wait() and re-fetch: %s", initialJob.ID, processedJob.Status)

		require.NotNil(t, processedJob, "Processed job not found after polling and workerWg.Wait()")
		assert.Equal(t, models.JobStatusCompleted, processedJob.Status, "Job status should be Completed")
		assert.Equal(t, testWorkerID+"-0", processedJob.ProcessingServerID.String, "Job should be marked with worker ID")

		updatedCampaign, errGetCampaign := campaignStore.GetCampaignByID(ctx, db, campaign.ID)
		require.NoError(t, errGetCampaign)
		require.NotNil(t, updatedCampaign)
		assert.Equal(t, models.CampaignStatusCompleted, updatedCampaign.Status, "Campaign status should be Completed")
		require.NotNil(t, updatedCampaign.ProgressPercentage)
		assert.Equal(t, 100.0, *updatedCampaign.ProgressPercentage, "Campaign progress should be 100%")
		if updatedCampaign.TotalItems == nil {
			assert.Nil(t, updatedCampaign.ProcessedItems, "ProcessedItems should be nil if TotalItems is nil")
		} else {
			require.NotNil(t, updatedCampaign.ProcessedItems, "ProcessedItems should not be nil if TotalItems is not nil")
			assert.Equal(t, *updatedCampaign.TotalItems, *updatedCampaign.ProcessedItems, "Campaign processed items should match total items")
		}
		require.NotNil(t, updatedCampaign.TotalItems, "Campaign TotalItems should not be nil")
		t.Logf("Campaign TotalItems: %d", *updatedCampaign.TotalItems)

		// When StartGlobalOffset equals TotalPossibleCombinations, ActualTotalItemsForThisRun can be 0
		// This is a valid scenario when all possible domains have already been generated
		if *updatedCampaign.TotalItems == 0 {
			t.Log("Campaign TotalItems is 0, which is valid when all possible domains have been generated")
		} else {
			assert.True(t, *updatedCampaign.TotalItems > 0, "Campaign total items should be positive")
		}

		generatedDomains, err := campaignStore.GetGeneratedDomainsByCampaign(ctx, db, campaign.ID, int(numDomains)+5, 0)
		require.NoError(t, err)
		require.NotNil(t, updatedCampaign.TotalItems) // Ensure TotalItems is not nil before dereferencing

		// Check the number of generated domains matches TotalItems
		// When TotalItems is 0, we expect no domains to be generated
		expectedDomains := int(*updatedCampaign.TotalItems)
		assert.Len(t, generatedDomains, expectedDomains, "Number of generated domains mismatch")
	})

	t.Run("Job Processing Failure", func(t *testing.T) {
		// Create a mock domain generation service that always fails processing
		mockDGService := newMockDomainGenerationService(dgService)
		mockDGService.SetFailProcessingCount(3) // Fail more times than max retries

		// Create a worker service with the mock domain generation service
		mockWorkerService := services.NewCampaignWorkerService(
			jobStore,
			mockDGService,
			dnsService,
			httpService,
			orchestratorService,
			testWorkerID+"-fail",
			appConfig,
		)

		// Create a campaign that will fail processing
		userID := "worker-test-user-" + uuid.New().String()
		campaignName := "FailingDGWorkerJob " + time.Now().Format(time.RFC3339Nano)
		genReq := services.CreateDomainGenerationCampaignRequest{
			Name:                 campaignName,
			UserID:               userID,
			PatternType:          "prefix",
			VariableLength:       1,
			ConstantString:       "fail",
			TLD:                  ".com",
			CharacterSet:         "abcdefghijklmnopqrstuvwxyz0123456789",
			NumDomainsToGenerate: 1,
		}
		campaign, err := dgService.CreateCampaign(ctx, genReq)
		require.NoError(t, err)
		require.NotNil(t, campaign)

		// Fetch the job created by dgService.CreateCampaign
		jobs, err := jobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
		require.NoError(t, err)
		require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
		initialJob := jobs[0]

		// Start the worker in a goroutine
		var workerWg sync.WaitGroup
		workerWg.Add(1)
		workerCtx, workerCancelFunc := context.WithCancel(ctx)
		go func() {
			defer workerWg.Done()
			log.Printf("Worker goroutine starting for failure test job %s with its own context.", initialJob.ID)
			mockWorkerService.StartWorkers(workerCtx, 1)
			log.Printf("Worker goroutine finished for failure test job %s.", initialJob.ID)
		}()

		// Poll for job status changes
		var processedJob *models.CampaignJob
		for i := 0; i < 60; i++ {
			processedJob, err = jobStore.GetJobByID(ctx, initialJob.ID)
			require.NoError(t, err)
			if processedJob != nil {
				t.Logf("Polling job %s, attempt %d: Status: %s, Attempts: %d, LastError: %s",
					initialJob.ID, i+1, processedJob.Status, processedJob.Attempts, processedJob.LastError.String)
				if processedJob.Status == models.JobStatusFailed {
					break
				}
			}
			time.Sleep(500 * time.Millisecond)
		}

		// Stop the worker
		workerCancelFunc()
		workerWg.Wait()

		// Verify the job failed
		finalJob, err := jobStore.GetJobByID(ctx, initialJob.ID)
		require.NoError(t, err)
		require.NotNil(t, finalJob)
		assert.Equal(t, models.JobStatusFailed, finalJob.Status, "Job should be marked as failed")
		assert.True(t, finalJob.LastError.Valid, "Job should have an error message")
		assert.Contains(t, finalJob.LastError.String, "simulated processing failure", "Error message should contain the expected error")
		assert.True(t, finalJob.Attempts > 0, "Job should have been attempted at least once")

		// Verify the campaign is marked as failed
		updatedCampaign, err := campaignStore.GetCampaignByID(ctx, db, campaign.ID)
		require.NoError(t, err)
		require.NotNil(t, updatedCampaign)
		assert.Equal(t, models.CampaignStatusFailed, updatedCampaign.Status, "Campaign should be marked as failed")
	})

	t.Run("Retry Then Success", func(t *testing.T) {
		// Create a mock domain generation service that fails once then succeeds
		mockDGService := newMockDomainGenerationService(dgService)
		mockDGService.SetFailProcessingCount(1) // Fail once, then succeed

		// Create a worker service with the mock domain generation service
		mockWorkerService := services.NewCampaignWorkerService(
			jobStore,
			mockDGService,
			dnsService,
			httpService,
			orchestratorService,
			testWorkerID+"-retry",
			appConfig,
		)

		// Create a campaign that will fail once then succeed
		userID := "worker-test-user-" + uuid.New().String()
		campaignName := "RetryThenSuccessDGWorkerJob " + time.Now().Format(time.RFC3339Nano)
		genReq := services.CreateDomainGenerationCampaignRequest{
			Name:                 campaignName,
			UserID:               userID,
			PatternType:          "prefix",
			VariableLength:       1,
			ConstantString:       "retry",
			TLD:                  ".com",
			CharacterSet:         "abcdefghijklmnopqrstuvwxyz0123456789",
			NumDomainsToGenerate: 2,
		}
		campaign, err := dgService.CreateCampaign(ctx, genReq)
		require.NoError(t, err)
		require.NotNil(t, campaign)

		// Fetch the job created by dgService.CreateCampaign
		jobs, err := jobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
		require.NoError(t, err)
		require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
		initialJob := jobs[0]

		// Start the worker in a goroutine
		var workerWg sync.WaitGroup
		workerWg.Add(1)
		workerCtx, workerCancelFunc := context.WithCancel(ctx)
		go func() {
			defer workerWg.Done()
			log.Printf("Worker goroutine starting for retry test job %s with its own context.", initialJob.ID)
			mockWorkerService.StartWorkers(workerCtx, 1)
			log.Printf("Worker goroutine finished for retry test job %s.", initialJob.ID)
		}()

		// Poll for job status changes
		var processedJob *models.CampaignJob
		for i := 0; i < 60; i++ {
			processedJob, err = jobStore.GetJobByID(ctx, initialJob.ID)
			require.NoError(t, err)
			if processedJob != nil {
				t.Logf("Polling job %s, attempt %d: Status: %s, Attempts: %d, LastError: %s",
					initialJob.ID, i+1, processedJob.Status, processedJob.Attempts, processedJob.LastError.String)
				if processedJob.Status == models.JobStatusCompleted {
					break
				}
			}
			time.Sleep(500 * time.Millisecond)
		}

		// Stop the worker
		workerCancelFunc()
		workerWg.Wait()

		// Verify the job succeeded after retry
		finalJob, err := jobStore.GetJobByID(ctx, initialJob.ID)
		require.NoError(t, err)
		require.NotNil(t, finalJob)
		assert.Equal(t, models.JobStatusCompleted, finalJob.Status, "Job should be marked as completed")
		assert.True(t, finalJob.Attempts > 1, "Job should have been attempted more than once")

		// Verify the campaign is marked as completed
		updatedCampaign, err := campaignStore.GetCampaignByID(ctx, db, campaign.ID)
		require.NoError(t, err)
		require.NotNil(t, updatedCampaign)
		assert.Equal(t, models.CampaignStatusCompleted, updatedCampaign.Status, "Campaign should be marked as completed")
		require.NotNil(t, updatedCampaign.ProgressPercentage)
		assert.Equal(t, 100.0, *updatedCampaign.ProgressPercentage, "Campaign progress should be 100%")
	})

	t.Run("Job Cancellation/Interruption", func(t *testing.T) {
		// Create a mock domain generation service that adds a long delay
		mockDGService := newMockDomainGenerationService(dgService)
		mockDGService.SetProcessDelay(5 * time.Second) // Simulate long processing

		// Create a worker service with the mock domain generation service
		mockWorkerService := services.NewCampaignWorkerService(
			jobStore,
			mockDGService,
			dnsService,
			httpService,
			orchestratorService,
			testWorkerID+"-cancel",
			appConfig,
		)

		// Create a campaign and job
		userID := "worker-test-user-" + uuid.New().String()
		campaignName := "JobCancelInterruptionDGWorkerJob " + time.Now().Format(time.RFC3339Nano)
		genReq := services.CreateDomainGenerationCampaignRequest{
			Name:                 campaignName,
			UserID:               userID,
			PatternType:          "prefix",
			VariableLength:       1,
			ConstantString:       "cancel",
			TLD:                  ".com",
			CharacterSet:         "abcdefghijklmnopqrstuvwxyz0123456789",
			NumDomainsToGenerate: 2,
		}
		campaign, err := dgService.CreateCampaign(ctx, genReq)
		require.NoError(t, err)
		require.NotNil(t, campaign)

		// Fetch the job created by dgService.CreateCampaign
		jobs, err := jobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
		require.NoError(t, err)
		require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
		initialJob := jobs[0]

		// Start the worker in a goroutine
		var workerWg sync.WaitGroup
		workerWg.Add(1)
		workerCtx, workerCancelFunc := context.WithCancel(ctx)
		go func() {
			defer workerWg.Done()
			log.Printf("Worker goroutine starting for job cancellation test job %s with its own context.", initialJob.ID)
			mockWorkerService.StartWorkers(workerCtx, 1)
			log.Printf("Worker goroutine finished for job cancellation test job %s.", initialJob.ID)
		}()

		// Wait until job is picked up and processing (status should be 'processing')
		var processingJob *models.CampaignJob
		for i := 0; i < 10; i++ {
			processingJob, err = jobStore.GetJobByID(ctx, initialJob.ID)
			require.NoError(t, err)
			if processingJob != nil && processingJob.Status == models.JobStatusProcessing {
				t.Logf("Job %s is now processing (iteration %d)", initialJob.ID, i+1)
				break
			}
			time.Sleep(300 * time.Millisecond)
		}
		assert.Equal(t, models.JobStatusProcessing, processingJob.Status, "Job should be in processing state before cancellation")

		// Cancel the worker context while job is processing
		workerCancelFunc()
		workerWg.Wait()

		// Re-fetch job after cancellation
		cancelledJob, err := jobStore.GetJobByID(ctx, initialJob.ID)
		require.NoError(t, err)
		require.NotNil(t, cancelledJob)
		// Job should not be completed or failed, should be left in processing or queued state
		assert.NotEqual(t, models.JobStatusCompleted, cancelledJob.Status, "Job should NOT be marked as completed after cancellation")
		assert.NotEqual(t, models.JobStatusFailed, cancelledJob.Status, "Job should NOT be marked as failed after cancellation")
		assert.Contains(t, []models.CampaignJobStatusEnum{models.JobStatusProcessing, models.JobStatusQueued, models.JobStatusRetry}, cancelledJob.Status, "Job should be in a recoverable state after cancellation")
	})

	t.Run("Job Status Stuck in Non-Terminal State", func(t *testing.T) {
		// Create a mock job store that simulates a DB error on UpdateJob
		type erroringJobStore struct {
			store.CampaignJobStore
			errorOnUpdate bool
		}
		errJobStore := &erroringJobStore{CampaignJobStore: jobStore, errorOnUpdate: true}

		// Use a normal domain generation service
		// Create a worker service with the erroring job store
		mockWorkerService := services.NewCampaignWorkerService(
			errJobStore,
			dgService,
			dnsService,
			httpService,
			orchestratorService,
			testWorkerID+"-dbfail",
			appConfig,
		)

		// Create a campaign and job
		userID := "worker-test-user-" + uuid.New().String()
		campaignName := "JobStatusStuckNonTerminalDGWorkerJob " + time.Now().Format(time.RFC3339Nano)
		genReq := services.CreateDomainGenerationCampaignRequest{
			Name:                 campaignName,
			UserID:               userID,
			PatternType:          "prefix",
			VariableLength:       1,
			ConstantString:       "dbfail",
			TLD:                  ".com",
			CharacterSet:         "abcdefghijklmnopqrstuvwxyz0123456789",
			NumDomainsToGenerate: 2,
		}
		campaign, err := dgService.CreateCampaign(ctx, genReq)
		require.NoError(t, err)
		require.NotNil(t, campaign)

		// Fetch the job created by dgService.CreateCampaign
		jobs, err := jobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
		require.NoError(t, err)
		require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
		initialJob := jobs[0]

		// Start the worker in a goroutine
		var workerWg sync.WaitGroup
		workerWg.Add(1)
		workerCtx, workerCancelFunc := context.WithCancel(ctx)
		go func() {
			defer workerWg.Done()
			log.Printf("Worker goroutine starting for job status stuck test job %s with its own context.", initialJob.ID)
			mockWorkerService.StartWorkers(workerCtx, 1)
			log.Printf("Worker goroutine finished for job status stuck test job %s.", initialJob.ID)
		}()

		// Poll for job status changes (should eventually leave processing state)
		var observedStatuses []models.CampaignJobStatusEnum
		var stuckJob *models.CampaignJob
		for i := 0; i < 30; i++ {
			stuckJob, err = jobStore.GetJobByID(ctx, initialJob.ID)
			require.NoError(t, err)
			if stuckJob != nil {
				observedStatuses = append(observedStatuses, stuckJob.Status)
				if stuckJob.Status == models.JobStatusCompleted || stuckJob.Status == models.JobStatusFailed || stuckJob.Status == models.JobStatusRetry {
					break
				}
			}
			time.Sleep(400 * time.Millisecond)
		}

		// Stop the worker
		workerCancelFunc()
		workerWg.Wait()

		// The job should not remain stuck in processing state forever
		assert.NotEqual(t, models.JobStatusProcessing, stuckJob.Status, "Job should not remain stuck in processing state after DB/network error")
		// Should eventually transition to retry or failed
		assert.Contains(t, []models.CampaignJobStatusEnum{models.JobStatusRetry, models.JobStatusFailed, models.JobStatusCompleted}, stuckJob.Status, "Job should eventually transition out of processing state")
		// Optionally, print observed status transitions
		t.Logf("Observed job status transitions: %v", observedStatuses)
	})

	// TODO: TestCampaignWorkerService - Multi-Batch Job Processing (e.g., DNS or HTTP campaign)
	// TODO: TestCampaignWorkerService - Worker correctly handles different job types (DNS, HTTP)
	// TODO: TestCampaignWorkerService - Graceful shutdown of workers via context cancellation
}
