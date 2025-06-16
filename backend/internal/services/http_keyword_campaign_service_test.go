package services_test

import (
	"context"
	"encoding/json"

	// "fmt" // Already removed
	"log"
	// "os" // Not used directly here
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/httpvalidator"
	"github.com/fntelecomllc/studio/backend/internal/keywordscanner"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/proxymanager"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/fntelecomllc/studio/backend/internal/store/postgres"
	"github.com/fntelecomllc/studio/backend/internal/testutil"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupHTTPKeywordTestEnvironment sets up the environment for HTTPKeywordCampaignService tests.
// It uses the shared setupPostgresTestEnvironment from test_helpers_test.go
func setupHTTPKeywordTestEnvironment(t *testing.T) (
	db *sqlx.DB,
	httpService services.HTTPKeywordCampaignService,
	appCfg *config.AppConfig,
	campaignStore store.CampaignStore,
	personaStore store.PersonaStore,
	proxyStore store.ProxyStore,
	keywordStore store.KeywordStore,
	auditLogStore store.AuditLogStore,
	dgService services.DomainGenerationService,
	dnsService services.DNSCampaignService,
	teardown func(),
) {
	// The 8th return value from setupPostgresTestEnvironment is proxyStore
	db, campaignStore, auditLogStore, personaStore, _, kwStore, pgProxyStore, baseTeardown := testutil.SetupTestStores(t)

	if db == nil { // Test was skipped
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, func() {}
	}

	testAppConfig := config.DefaultConfig()
	testAppConfig.Worker.MaxJobRetries = 1

	testAppConfig.Proxies = []config.ProxyConfigEntry{
		{
			ID:       uuid.New().String(),
			Name:     "TestHTTPProxyForService",
			Address:  "127.0.0.1:8888",
			Protocol: "http",
			// IsEnabled field was removed from ProxyConfigEntry
		},
	}

	httpValSvc := httpvalidator.NewHTTPValidator(testAppConfig)
	kwordScannerSvc := keywordscanner.NewService(kwStore)

	var proxyRequestTimeout time.Duration = time.Duration(testAppConfig.HTTPValidator.RequestTimeoutSeconds) * time.Second
	if proxyRequestTimeout <= 0 {
		proxyRequestTimeout = 30 * time.Second
	}
	proxyMgr := proxymanager.NewProxyManager(testAppConfig.Proxies, proxyRequestTimeout)

	// Initialize campaign job store for domain generation service
	campaignJobStore := postgres.NewCampaignJobStorePostgres(db)
	domainGenSvc := services.NewDomainGenerationService(db, campaignStore, campaignJobStore, auditLogStore)
	dnsValidationSvc := services.NewDNSCampaignService(db, campaignStore, personaStore, auditLogStore, campaignJobStore, testAppConfig)

	httpKwSvc := services.NewHTTPKeywordCampaignService(db, campaignStore, personaStore, pgProxyStore, kwStore, auditLogStore, campaignJobStore, httpValSvc, kwordScannerSvc, proxyMgr, testAppConfig)

	teardownFunc := func() {
		log.Println("Tearing down HTTPKeywordTestEnvironment...")
		baseTeardown()
	}

	return db, httpKwSvc, testAppConfig, campaignStore, personaStore, pgProxyStore, kwStore, auditLogStore, domainGenSvc, dnsValidationSvc, teardownFunc
}

func TestHTTPKeywordCampaignServiceImpl_CreateCampaign(t *testing.T) {
	// The 11th return value from setupHTTPKeywordTestEnvironment is the teardown func.
	// auditLogStore (8th) is not used here, assigned to _
	db, httpService, _, campaignStore, personaStore, _, keywordStoreFromSetup, _, dgService, dnsService, teardown := setupHTTPKeywordTestEnvironment(t)
	defer teardown()

	if db == nil { // Test skipped
		return
	}
	ctx := context.Background()

	// 1. Setup: Create a source Domain Generation Campaign
	// Corrected call: removed campaignStore, jobStore is nil for this helper call
	dgCampaign, _ := testutil.CreateTestDomainGenerationCampaignAndJob(t, ctx, dgService, nil, "SrcDGForHTTP", 5)
	dgCampaign.Status = models.CampaignStatusCompleted
	// Assuming dgCampaign.TotalItems is already a pointer and set correctly before this.
	// If dgCampaign.TotalItems could be nil, this assignment needs a nil check or to assign a pointer.
	// For now, assuming TotalItems is correctly a *int64.
	dgCampaign.ProcessedItems = dgCampaign.TotalItems
	dgCampaign.ProgressPercentage = models.Float64Ptr(100.0)
	require.NoError(t, campaignStore.UpdateCampaign(ctx, db, dgCampaign))

	// 2. Setup: Create a source DNS Validation Campaign using the DG campaign
	dnsPersona := testutil.CreateTestDNSPersona(t, ctx, personaStore, db, "DNS Persona for HTTP Test "+uuid.NewString(), true)
	dnsReq := services.CreateDNSValidationCampaignRequest{
		Name:                       "SrcDNSForHTTP " + uuid.New().String(),
		SourceGenerationCampaignID: dgCampaign.ID,
		PersonaIDs:                 []uuid.UUID{dnsPersona.ID},
	}
	dnsCampaign, err := dnsService.CreateCampaign(ctx, dnsReq)
	require.NoError(t, err)

	// Update the campaign status to completed
	dnsCampaign.Status = models.CampaignStatusCompleted
	dnsCampaign.ProcessedItems = models.Int64Ptr(2)
	dnsCampaign.TotalItems = models.Int64Ptr(2)
	dnsCampaign.ProgressPercentage = models.Float64Ptr(100.0)
	nowForCompletedAt126 := time.Now()
	dnsCampaign.CompletedAt = &nowForCompletedAt126
	require.NoError(t, campaignStore.UpdateCampaign(ctx, db, dnsCampaign))

	// Create mock DNS validation results first
	nowForLastCheckedAt132 := time.Now()
	mockResolvedDomain1 := &models.DNSValidationResult{
		ID: uuid.New(), DNSCampaignID: dnsCampaign.ID, DomainName: "resolved1.com", ValidationStatus: "valid_dns",
		DNSRecords: models.JSONRawMessagePtr(json.RawMessage(`{"ips":["1.2.3.4"]}`)), LastCheckedAt: &nowForLastCheckedAt132,
	}
	nowForLastCheckedAt136 := time.Now()
	mockResolvedDomain2 := &models.DNSValidationResult{
		ID: uuid.New(), DNSCampaignID: dnsCampaign.ID, DomainName: "resolved2.com", ValidationStatus: "valid_dns",
		DNSRecords: models.JSONRawMessagePtr(json.RawMessage(`{"ips":["1.2.3.5"]}`)), LastCheckedAt: &nowForLastCheckedAt136,
	}
	require.NoError(t, campaignStore.CreateDNSValidationResults(ctx, db, []*models.DNSValidationResult{mockResolvedDomain1, mockResolvedDomain2}))

	// Update the campaign status to completed after creating the results
	dnsCampaign.Status = models.CampaignStatusCompleted
	dnsCampaign.ProcessedItems = models.Int64Ptr(2)
	dnsCampaign.TotalItems = models.Int64Ptr(2)
	dnsCampaign.ProgressPercentage = models.Float64Ptr(100.0)
	nowForCompletedAt145 := time.Now()
	dnsCampaign.CompletedAt = &nowForCompletedAt145
	require.NoError(t, campaignStore.UpdateCampaign(ctx, db, dnsCampaign))

	// Verify the campaign was updated in the database
	updatedDNSCampaign, err := campaignStore.GetCampaignByID(ctx, db, dnsCampaign.ID)
	require.NoError(t, err)
	require.Equal(t, models.CampaignStatusCompleted, updatedDNSCampaign.Status)
	require.NotNil(t, updatedDNSCampaign.ProcessedItems)
	assert.Equal(t, int64(2), *updatedDNSCampaign.ProcessedItems)
	require.NotNil(t, updatedDNSCampaign.TotalItems)
	assert.Equal(t, int64(2), *updatedDNSCampaign.TotalItems)
	require.NotNil(t, updatedDNSCampaign.CompletedAt)

	// Verify the DNS results were created
	results, err := campaignStore.GetDNSValidationResultsByCampaign(ctx, db, dnsCampaign.ID, store.ListValidationResultsFilter{})
	require.NoError(t, err)
	require.Len(t, results, 2)

	// 3. Setup: Create HTTP Persona and KeywordSet
	httpPersona := testutil.CreateTestHTTPPersona(t, ctx, personaStore, db, "HTTP Persona for HTTP Test "+uuid.NewString(), true)
	keywordSet := testutil.CreateTestKeywordSet(t, ctx, keywordStoreFromSetup, db)

	t.Run("Successful HTTP Keyword Campaign Creation", func(t *testing.T) {
		campaignName := "Test HTTP Keyword Campaign " + uuid.NewString()
		userID := "http-user-" + uuid.NewString()
		hkReq := services.CreateHTTPKeywordCampaignRequest{
			Name:             campaignName,
			UserID:           userID,
			SourceCampaignID: dnsCampaign.ID,
			PersonaIDs:       []uuid.UUID{httpPersona.ID},
			KeywordSetIDs:    []uuid.UUID{keywordSet.ID},
			AdHocKeywords:    []string{"adhoc1"},
			BatchSize:        10,
		}

		campaign, err := httpService.CreateCampaign(ctx, hkReq)
		require.NoError(t, err)
		require.NotNil(t, campaign)

		assert.Equal(t, campaignName, campaign.Name)
		assert.Equal(t, models.CampaignTypeHTTPKeywordValidation, campaign.CampaignType)
		assert.Equal(t, models.CampaignStatusPending, campaign.Status)
		if assert.NotNil(t, campaign.UserID) {
			assert.Equal(t, userID, *campaign.UserID)
		}
		// Compare values of pointers, ensuring neither is nil if the other isn't
		if dnsCampaign.ProcessedItems == nil {
			assert.Nil(t, campaign.TotalItems, "campaign.TotalItems should be nil if dnsCampaign.ProcessedItems is nil")
		} else {
			require.NotNil(t, campaign.TotalItems, "campaign.TotalItems should not be nil if dnsCampaign.ProcessedItems is not nil")
			assert.Equal(t, *dnsCampaign.ProcessedItems, *campaign.TotalItems, "campaign.TotalItems should match dnsCampaign.ProcessedItems")
		}

		fetchedCampaign, _ := campaignStore.GetCampaignByID(ctx, db, campaign.ID)
		require.NotNil(t, fetchedCampaign)
		assert.Equal(t, campaignName, fetchedCampaign.Name)

		fetchedParams, err := campaignStore.GetHTTPKeywordParams(ctx, db, campaign.ID)
		require.NoError(t, err)
		require.NotNil(t, fetchedParams)
		assert.Equal(t, dnsCampaign.ID, fetchedParams.SourceCampaignID)
		assert.Contains(t, fetchedParams.PersonaIDs, httpPersona.ID)
		assert.Contains(t, fetchedParams.KeywordSetIDs, keywordSet.ID)
		require.NotNil(t, fetchedParams.AdHocKeywords, "AdHocKeywords should not be nil")
		assert.Contains(t, *fetchedParams.AdHocKeywords, "adhoc1")
	})

	// TODO: Add error case scenarios for CreateHTTPKeywordCampaign
	//  - Invalid SourceCampaignID (not found, wrong type, not completed)
	//  - PersonaID not found, or not HTTP type, or disabled
	//  - KeywordSetID not found
	//  - No personaIDs provided
	//  - No keywordSetIDs AND no adHocKeywords provided
}

// TODO: Test HTTPKeywordCampaignServiceImpl_ProcessHTTPKeywordCampaignBatch
//  - Successful batch processing of a few domains.
//  - Handling of domains that are reachable vs. unreachable.
//  - Keyword finding and reporting in HTTPKeywordResult.
//  - Proxy rotation if multiple proxies configured and used by personas.
//  - Correct updates to job status and campaign progress.
//  - Multi-batch processing.
//  - Error handling from httpvalidator or keywordscanner.
