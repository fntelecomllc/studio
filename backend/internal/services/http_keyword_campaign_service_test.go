package services_test

import (
	"context"
	"encoding/json"

	// "fmt" // Already removed
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/httpvalidator"
	"github.com/fntelecomllc/studio/backend/internal/keywordscanner"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/proxymanager"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/fntelecomllc/studio/backend/internal/testutil"
	"github.com/google/uuid"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

type HTTPKeywordCampaignServiceTestSuite struct {
	ServiceTestSuite
	httpService services.HTTPKeywordCampaignService
	dgService   services.DomainGenerationService
	dnsService  services.DNSCampaignService
}

func (s *HTTPKeywordCampaignServiceTestSuite) SetupTest() {
	s.AppConfig.Proxies = []config.ProxyConfigEntry{
		{
			ID:       uuid.New().String(),
			Name:     "TestHTTPProxyForService",
			Address:  "127.0.0.1:8888",
			Protocol: "http",
		},
	}

	httpValSvc := httpvalidator.NewHTTPValidator(s.AppConfig)
	kwordScannerSvc := keywordscanner.NewService(s.KeywordStore)
	proxyMgr := proxymanager.NewProxyManager(s.AppConfig.Proxies, 30*time.Second)

	s.dgService = services.NewDomainGenerationService(s.DB, s.CampaignStore, s.CampaignJobStore, s.AuditLogStore)
	s.dnsService = services.NewDNSCampaignService(s.DB, s.CampaignStore, s.PersonaStore, s.AuditLogStore, s.CampaignJobStore, s.AppConfig)
	s.httpService = services.NewHTTPKeywordCampaignService(s.DB, s.CampaignStore, s.PersonaStore, s.ProxyStore, s.KeywordStore, s.AuditLogStore, s.CampaignJobStore, httpValSvc, kwordScannerSvc, proxyMgr, s.AppConfig)
}

func TestHTTPKeywordCampaignService(t *testing.T) {
	suite.Run(t, new(HTTPKeywordCampaignServiceTestSuite))
}

func (s *HTTPKeywordCampaignServiceTestSuite) TestCreateCampaign() {
	t := s.T()
	ctx := context.Background()

	// 1. Setup: Create a source Domain Generation Campaign
	dgCampaign, _ := testutil.CreateTestDomainGenerationCampaignAndJob(t, ctx, s.dgService, s.CampaignJobStore, "SrcDGForHTTP", 5)
	dgCampaign.Status = models.CampaignStatusCompleted
	dgCampaign.ProcessedItems = dgCampaign.TotalItems
	dgCampaign.ProgressPercentage = models.Float64Ptr(100.0)
	require.NoError(t, s.CampaignStore.UpdateCampaign(ctx, s.DB, dgCampaign))

	// 2. Setup: Create a source DNS Validation Campaign using the DG campaign
	dnsPersona := testutil.CreateTestDNSPersona(t, ctx, s.PersonaStore, s.DB, "DNS Persona for HTTP Test "+uuid.NewString(), true)
	dnsReq := services.CreateDNSValidationCampaignRequest{
		Name:                       "SrcDNSForHTTP " + uuid.New().String(),
		SourceGenerationCampaignID: dgCampaign.ID,
		PersonaIDs:                 []uuid.UUID{dnsPersona.ID},
	}
	dnsCampaign, err := s.dnsService.CreateCampaign(ctx, dnsReq)
	require.NoError(t, err)

	// Update the campaign status to completed
	dnsCampaign.Status = models.CampaignStatusCompleted
	dnsCampaign.ProcessedItems = models.Int64Ptr(2)
	dnsCampaign.TotalItems = models.Int64Ptr(2)
	dnsCampaign.ProgressPercentage = models.Float64Ptr(100.0)
	nowForCompletedAt126 := time.Now()
	dnsCampaign.CompletedAt = &nowForCompletedAt126
	require.NoError(t, s.CampaignStore.UpdateCampaign(ctx, s.DB, dnsCampaign))

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
	require.NoError(t, s.CampaignStore.CreateDNSValidationResults(ctx, s.DB, []*models.DNSValidationResult{mockResolvedDomain1, mockResolvedDomain2}))

	// Update the campaign status to completed after creating the results
	dnsCampaign.Status = models.CampaignStatusCompleted
	dnsCampaign.ProcessedItems = models.Int64Ptr(2)
	dnsCampaign.TotalItems = models.Int64Ptr(2)
	dnsCampaign.ProgressPercentage = models.Float64Ptr(100.0)
	nowForCompletedAt145 := time.Now()
	dnsCampaign.CompletedAt = &nowForCompletedAt145
	require.NoError(t, s.CampaignStore.UpdateCampaign(ctx, s.DB, dnsCampaign))

	// Verify the campaign was updated in the database
	updatedDNSCampaign, err := s.CampaignStore.GetCampaignByID(ctx, s.DB, dnsCampaign.ID)
	require.NoError(t, err)
	require.Equal(t, models.CampaignStatusCompleted, updatedDNSCampaign.Status)
	require.NotNil(t, updatedDNSCampaign.ProcessedItems)
	assert.Equal(t, int64(2), *updatedDNSCampaign.ProcessedItems)
	require.NotNil(t, updatedDNSCampaign.TotalItems)
	assert.Equal(t, int64(2), *updatedDNSCampaign.TotalItems)
	require.NotNil(t, updatedDNSCampaign.CompletedAt)

	// Verify the DNS results were created
	results, err := s.CampaignStore.GetDNSValidationResultsByCampaign(ctx, s.DB, dnsCampaign.ID, store.ListValidationResultsFilter{})
	require.NoError(t, err)
	require.Len(t, results, 2)

	// 3. Setup: Create HTTP Persona and KeywordSet
	httpPersona := testutil.CreateTestHTTPPersona(t, ctx, s.PersonaStore, s.DB, "HTTP Persona for HTTP Test "+uuid.NewString(), true)
	keywordSet := testutil.CreateTestKeywordSet(t, ctx, s.KeywordStore, s.DB)

	t.Run("Successful HTTP Keyword Campaign Creation", func(t *testing.T) {
		campaignName := "Test HTTP Keyword Campaign " + uuid.NewString()
		userID := uuid.New()
		hkReq := services.CreateHTTPKeywordCampaignRequest{
			Name:             campaignName,
			UserID:           userID,
			SourceCampaignID: dnsCampaign.ID,
			PersonaIDs:       []uuid.UUID{httpPersona.ID},
			KeywordSetIDs:    []uuid.UUID{keywordSet.ID},
			AdHocKeywords:    []string{"adhoc1"},
			BatchSize:        10,
		}

		campaign, err := s.httpService.CreateCampaign(ctx, hkReq)
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

		fetchedCampaign, _ := s.CampaignStore.GetCampaignByID(ctx, s.DB, campaign.ID)
		require.NotNil(t, fetchedCampaign)
		assert.Equal(t, campaignName, fetchedCampaign.Name)

		fetchedParams, err := s.CampaignStore.GetHTTPKeywordParams(ctx, s.DB, campaign.ID)
		require.NoError(t, err)
		require.NotNil(t, fetchedParams)
		assert.Equal(t, dnsCampaign.ID, fetchedParams.SourceCampaignID)
		assert.Contains(t, fetchedParams.PersonaIDs, httpPersona.ID)
		assert.Contains(t, fetchedParams.KeywordSetIDs, keywordSet.ID)
		require.NotNil(t, fetchedParams.AdHocKeywords, "AdHocKeywords should not be nil")
		assert.Contains(t, *fetchedParams.AdHocKeywords, "adhoc1")
	})
}
