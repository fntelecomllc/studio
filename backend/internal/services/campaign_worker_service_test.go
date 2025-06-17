package services_test

import (
	"context"
	"errors"
	"log"
	"sync"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
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

type CampaignWorkerServiceTestSuite struct {
	ServiceTestSuite // This line was already correct, CampaignServiceTestSuite is in the services package.
	dgService           services.DomainGenerationService
	dnsService          services.DNSCampaignService
	httpService         services.HTTPKeywordCampaignService
	orchestratorService services.CampaignOrchestratorService
}

func (s *CampaignWorkerServiceTestSuite) SetupTest() {
	s.dgService = services.NewDomainGenerationService(s.DB, s.CampaignStore, s.CampaignJobStore, s.AuditLogStore)
	s.dnsService = services.NewDNSCampaignService(s.DB, s.CampaignStore, s.PersonaStore, s.AuditLogStore, s.CampaignJobStore, s.AppConfig)
	s.httpService = services.NewHTTPKeywordCampaignService(s.DB, s.CampaignStore, s.PersonaStore, s.ProxyStore, s.KeywordStore, s.AuditLogStore, s.CampaignJobStore, nil, nil, nil, s.AppConfig)
	s.orchestratorService = services.NewCampaignOrchestratorService(s.DB, s.CampaignStore, s.PersonaStore, s.KeywordStore, s.AuditLogStore, s.CampaignJobStore, s.dgService, s.dnsService, s.httpService)
}

func TestCampaignWorkerService(t *testing.T) {
	suite.Run(t, new(CampaignWorkerServiceTestSuite))
}

func (s *CampaignWorkerServiceTestSuite) TestSuccessfulDomainGenerationJobProcessing() {
	t := s.T()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	testWorkerID := "test-worker-001"
	workerService := services.NewCampaignWorkerService(s.CampaignJobStore, s.dgService, s.dnsService, s.httpService, s.orchestratorService, testWorkerID, s.AppConfig)

	numDomains := int64(2)
	userID := uuid.New()
	campaignName := "SuccessDGWorkerJob " + time.Now().Format(time.RFC3339Nano)
	genReq := services.CreateDomainGenerationCampaignRequest{
		Name:                 campaignName,
		UserID:               userID,
		PatternType:          "prefix",
		VariableLength:       2,
		CharacterSet:         "ab",
		ConstantString:       "test",
		TLD:                  ".com",
		NumDomainsToGenerate: numDomains,
	}
	campaign, err := s.dgService.CreateCampaign(ctx, genReq)
	require.NoError(t, err)
	require.NotNil(t, campaign)
	require.Equal(t, models.CampaignStatusPending, campaign.Status, "Campaign should be initially pending")

	jobs, err := s.CampaignJobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
	require.NoError(t, err)
	require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
	initialJob := jobs[0]
	require.Equal(t, models.JobStatusQueued, initialJob.Status, "Job created by dgService should be queued")

	var workerWg sync.WaitGroup
	workerWg.Add(1)

	workerCtx, workerCancelFunc := context.WithCancel(ctx)

	go func() {
		defer workerWg.Done()
		log.Printf("Worker goroutine starting for job %s with its own context.", initialJob.ID)
		workerService.StartWorkers(workerCtx, 1)
		log.Printf("Worker goroutine finished for job %s.", initialJob.ID)
	}()

	var processedJob *models.CampaignJob
	for i := 0; i < 60; i++ {
		processedJob, err = s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
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

	workerCancelFunc()
	workerWg.Wait()

	finalProcessedJob, finalErr := s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
	require.NoError(t, finalErr, "Failed to fetch final job status for job %s after workerWg.Wait()", initialJob.ID)
	require.NotNil(t, finalProcessedJob, "Final processed job not found after workerWg.Wait() for job %s", initialJob.ID)

	processedJob = finalProcessedJob
	t.Logf("Final status for job %s after workerWg.Wait() and re-fetch: %s", initialJob.ID, processedJob.Status)

	require.NotNil(t, processedJob, "Processed job not found after polling and workerWg.Wait()")
	assert.Equal(t, models.JobStatusCompleted, processedJob.Status, "Job status should be Completed")
	assert.Equal(t, testWorkerID+"-0", processedJob.ProcessingServerID.String, "Job should be marked with worker ID")

	updatedCampaign, errGetCampaign := s.CampaignStore.GetCampaignByID(ctx, s.DB, campaign.ID)
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

	if *updatedCampaign.TotalItems == 0 {
		t.Log("Campaign TotalItems is 0, which is valid when all possible domains have been generated")
	} else {
		assert.True(t, *updatedCampaign.TotalItems > 0, "Campaign total items should be positive")
	}

	generatedDomains, err := s.CampaignStore.GetGeneratedDomainsByCampaign(ctx, s.DB, campaign.ID, int(numDomains)+5, 0)
	require.NoError(t, err)
	require.NotNil(t, updatedCampaign.TotalItems)

	expectedDomains := int(*updatedCampaign.TotalItems)
	assert.Len(t, generatedDomains, expectedDomains, "Number of generated domains mismatch")
}

func (s *CampaignWorkerServiceTestSuite) TestJobProcessingFailure() {
	t := s.T()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	testWorkerID := "test-worker-001"

	mockDGService := newMockDomainGenerationService(s.dgService)
	mockDGService.SetFailProcessingCount(3)

	mockWorkerService := services.NewCampaignWorkerService(
		s.CampaignJobStore,
		mockDGService,
		s.dnsService,
		s.httpService,
		s.orchestratorService,
		testWorkerID+"-fail",
		s.AppConfig,
	)

	userID := uuid.New()
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
	campaign, err := s.dgService.CreateCampaign(ctx, genReq)
	require.NoError(t, err)
	require.NotNil(t, campaign)

	jobs, err := s.CampaignJobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
	require.NoError(t, err)
	require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
	initialJob := jobs[0]

	var workerWg sync.WaitGroup
	workerWg.Add(1)
	workerCtx, workerCancelFunc := context.WithCancel(ctx)
	go func() {
		defer workerWg.Done()
		log.Printf("Worker goroutine starting for failure test job %s with its own context.", initialJob.ID)
		mockWorkerService.StartWorkers(workerCtx, 1)
		log.Printf("Worker goroutine finished for failure test job %s.", initialJob.ID)
	}()

	var processedJob *models.CampaignJob
	for i := 0; i < 60; i++ {
		processedJob, err = s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
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

	workerCancelFunc()
	workerWg.Wait()

	finalJob, err := s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
	require.NoError(t, err)
	require.NotNil(t, finalJob)
	assert.Equal(t, models.JobStatusFailed, finalJob.Status, "Job should be marked as failed")
	assert.True(t, finalJob.LastError.Valid, "Job should have an error message")
	assert.Contains(t, finalJob.LastError.String, "simulated processing failure", "Error message should contain the expected error")
	assert.True(t, finalJob.Attempts > 0, "Job should have been attempted at least once")

	updatedCampaign, err := s.CampaignStore.GetCampaignByID(ctx, s.DB, campaign.ID)
	require.NoError(t, err)
	require.NotNil(t, updatedCampaign)
	assert.Equal(t, models.CampaignStatusCancelled, updatedCampaign.Status, "Campaign should be marked as cancelled when it fails before processing starts")
}

func (s *CampaignWorkerServiceTestSuite) TestRetryThenSuccess() {
	t := s.T()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	testWorkerID := "test-worker-001"

	mockDGService := newMockDomainGenerationService(s.dgService)
	mockDGService.SetFailProcessingCount(1)

	mockWorkerService := services.NewCampaignWorkerService(
		s.CampaignJobStore,
		mockDGService,
		s.dnsService,
		s.httpService,
		s.orchestratorService,
		testWorkerID+"-retry",
		s.AppConfig,
	)

	userID := uuid.New()
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
	campaign, err := s.dgService.CreateCampaign(ctx, genReq)
	require.NoError(t, err)
	require.NotNil(t, campaign)

	jobs, err := s.CampaignJobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
	require.NoError(t, err)
	require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
	initialJob := jobs[0]

	var workerWg sync.WaitGroup
	workerWg.Add(1)
	workerCtx, workerCancelFunc := context.WithCancel(ctx)
	go func() {
		defer workerWg.Done()
		log.Printf("Worker goroutine starting for retry test job %s with its own context.", initialJob.ID)
		mockWorkerService.StartWorkers(workerCtx, 1)
		log.Printf("Worker goroutine finished for retry test job %s.", initialJob.ID)
	}()

	var processedJob *models.CampaignJob
	for i := 0; i < 60; i++ {
		processedJob, err = s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
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

	workerCancelFunc()
	workerWg.Wait()

	finalJob, err := s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
	require.NoError(t, err)
	require.NotNil(t, finalJob)
	assert.Equal(t, models.JobStatusCompleted, finalJob.Status, "Job should be marked as completed")
	assert.True(t, finalJob.Attempts > 1, "Job should have been attempted more than once")

	updatedCampaign, err := s.CampaignStore.GetCampaignByID(ctx, s.DB, campaign.ID)
	require.NoError(t, err)
	require.NotNil(t, updatedCampaign)
	assert.Equal(t, models.CampaignStatusCompleted, updatedCampaign.Status, "Campaign should be marked as completed")
	require.NotNil(t, updatedCampaign.ProgressPercentage)
	assert.Equal(t, 100.0, *updatedCampaign.ProgressPercentage, "Campaign progress should be 100%")
}

func (s *CampaignWorkerServiceTestSuite) TestJobCancellation() {
	t := s.T()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	testWorkerID := "test-worker-001"

	mockDGService := newMockDomainGenerationService(s.dgService)
	mockDGService.SetProcessDelay(5 * time.Second)

	mockWorkerService := services.NewCampaignWorkerService(
		s.CampaignJobStore,
		mockDGService,
		s.dnsService,
		s.httpService,
		s.orchestratorService,
		testWorkerID+"-cancel",
		s.AppConfig,
	)

	userID := uuid.New()
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
	campaign, err := s.dgService.CreateCampaign(ctx, genReq)
	require.NoError(t, err)
	require.NotNil(t, campaign)

	jobs, err := s.CampaignJobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
	require.NoError(t, err)
	require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
	initialJob := jobs[0]

	var workerWg sync.WaitGroup
	workerWg.Add(1)
	workerCtx, workerCancelFunc := context.WithCancel(ctx)
	go func() {
		defer workerWg.Done()
		log.Printf("Worker goroutine starting for job cancellation test job %s with its own context.", initialJob.ID)
		mockWorkerService.StartWorkers(workerCtx, 1)
		log.Printf("Worker goroutine finished for job cancellation test job %s.", initialJob.ID)
	}()

	var processingJob *models.CampaignJob
	for i := 0; i < 10; i++ {
		processingJob, err = s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
		require.NoError(t, err)
		if processingJob != nil && processingJob.Status == models.JobStatusProcessing {
			t.Logf("Job %s is now processing (iteration %d)", initialJob.ID, i+1)
			break
		}
		time.Sleep(300 * time.Millisecond)
	}
	assert.Equal(t, models.JobStatusProcessing, processingJob.Status, "Job should be in processing state before cancellation")

	workerCancelFunc()
	workerWg.Wait()

	cancelledJob, err := s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
	require.NoError(t, err)
	require.NotNil(t, cancelledJob)
	assert.NotEqual(t, models.JobStatusCompleted, cancelledJob.Status, "Job should NOT be marked as completed after cancellation")
	assert.NotEqual(t, models.JobStatusFailed, cancelledJob.Status, "Job should NOT be marked as failed after cancellation")
	assert.Contains(t, []models.CampaignJobStatusEnum{models.JobStatusProcessing, models.JobStatusQueued, models.JobStatusRetry}, cancelledJob.Status, "Job should be in a recoverable state after cancellation")
}

func (s *CampaignWorkerServiceTestSuite) TestJobStuckInProcessing() {
	t := s.T()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	testWorkerID := "test-worker-001"

	errJobStore := &erroringJobStore{CampaignJobStore: s.CampaignJobStore, errorOnUpdate: true}

	mockWorkerService := services.NewCampaignWorkerService(
		errJobStore,
		s.dgService,
		s.dnsService,
		s.httpService,
		s.orchestratorService,
		testWorkerID+"-dbfail",
		s.AppConfig,
	)

	userID := uuid.New()
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
	campaign, err := s.dgService.CreateCampaign(ctx, genReq)
	require.NoError(t, err)
	require.NotNil(t, campaign)

	jobs, err := s.CampaignJobStore.ListJobs(ctx, store.ListJobsFilter{CampaignID: uuid.NullUUID{UUID: campaign.ID, Valid: true}, Limit: 1})
	require.NoError(t, err)
	require.Len(t, jobs, 1, "Expected one job to be created by dgService.CreateCampaign")
	initialJob := jobs[0]

	var workerWg sync.WaitGroup
	workerWg.Add(1)
	workerCtx, workerCancelFunc := context.WithCancel(ctx)
	go func() {
		defer workerWg.Done()
		log.Printf("Worker goroutine starting for job status stuck test job %s with its own context.", initialJob.ID)
		mockWorkerService.StartWorkers(workerCtx, 1)
		log.Printf("Worker goroutine finished for job status stuck test job %s.", initialJob.ID)
	}()

	var observedStatuses []models.CampaignJobStatusEnum
	var stuckJob *models.CampaignJob
	for i := 0; i < 30; i++ {
		stuckJob, err = s.CampaignJobStore.GetJobByID(ctx, initialJob.ID)
		require.NoError(t, err)
		if stuckJob != nil {
			observedStatuses = append(observedStatuses, stuckJob.Status)
			if stuckJob.Status == models.JobStatusCompleted || stuckJob.Status == models.JobStatusFailed || stuckJob.Status == models.JobStatusRetry {
				break
			}
		}
		time.Sleep(400 * time.Millisecond)
	}

	workerCancelFunc()
	workerWg.Wait()

	assert.NotEqual(t, models.JobStatusProcessing, stuckJob.Status, "Job should not remain stuck in processing state after DB/network error")
	assert.Contains(t, []models.CampaignJobStatusEnum{models.JobStatusRetry, models.JobStatusFailed, models.JobStatusCompleted}, stuckJob.Status, "Job should eventually transition out of processing state")
	t.Logf("Observed job status transitions: %v", observedStatuses)
}
