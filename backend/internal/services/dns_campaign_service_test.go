package services_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/fntelecomllc/studio/backend/internal/testutil"
	"github.com/google/uuid"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

type DNSCampaignServiceTestSuite struct {
	ServiceTestSuite
	dnsService services.DNSCampaignService
}

func (s *DNSCampaignServiceTestSuite) SetupTest() {
	s.dnsService = services.NewDNSCampaignService(s.DB, s.CampaignStore, s.PersonaStore, s.AuditLogStore, s.CampaignJobStore, s.AppConfig)
}

func TestDNSCampaignService(t *testing.T) {
	suite.Run(t, new(DNSCampaignServiceTestSuite))
}

// Helper function to create a dummy DomainGeneration campaign for source
func (s *DNSCampaignServiceTestSuite) createTestSourceDomainGenerationCampaign(ctx context.Context, name string, numDomains int) *models.Campaign {
	dgService := services.NewDomainGenerationService(s.DB, s.CampaignStore, s.CampaignJobStore, s.AuditLogStore)
	campaign, _ := testutil.CreateTestDomainGenerationCampaignAndJob(s.T(), ctx, dgService, s.CampaignJobStore, name, int64(numDomains))
	return campaign
}

func (s *DNSCampaignServiceTestSuite) TestCreateCampaign() {
	t := s.T()
	ctx := context.Background()

	// Setup: Create a source domain generation campaign and a DNS persona
	sourceGenCampaign := s.createTestSourceDomainGenerationCampaign(ctx, "Source Gen Campaign for DNS Test", 100)
	dnsPersona1 := testutil.CreateTestDNSPersona(t, ctx, s.PersonaStore, s.DB, "Test DNS Persona 1 "+uuid.NewString(), true)

	baseUserID := uuid.New()
	baseCampaignName := "Test DNS Validation Campaign " + time.Now().Format(time.RFC3339Nano)

	baseReq := services.CreateDNSValidationCampaignRequest{
		Name:                       baseCampaignName,
		UserID:                     baseUserID,
		SourceGenerationCampaignID: sourceGenCampaign.ID,
		PersonaIDs:                 []uuid.UUID{dnsPersona1.ID},
		RotationIntervalSeconds:    10,
		ProcessingSpeedPerMinute:   60,
		BatchSize:                  50,
		RetryAttempts:              2,
	}

	t.Run("Successful DNS Campaign Creation", func(t *testing.T) {
		req := baseReq
		req.Name = "Success DNS Campaign " + uuid.NewString()

		campaign, err := s.dnsService.CreateCampaign(ctx, req)

		require.NoError(t, err)
		require.NotNil(t, campaign)
		require.NotEqual(t, uuid.Nil, campaign.ID)

		assert.Equal(t, req.Name, campaign.Name)
		assert.Equal(t, models.CampaignTypeDNSValidation, campaign.CampaignType)
		assert.Equal(t, models.CampaignStatusPending, campaign.Status)
		require.NotNil(t, campaign.UserID)
		assert.Equal(t, req.UserID, *campaign.UserID)
		assert.Equal(t, sourceGenCampaign.TotalItems, campaign.TotalItems, "TotalItems should match source gen campaign")

		fetchedCampaign, dbErr := s.CampaignStore.GetCampaignByID(ctx, s.DB, campaign.ID)
		require.NoError(t, dbErr)
		require.NotNil(t, fetchedCampaign)
		assert.Equal(t, req.Name, fetchedCampaign.Name)

		fetchedParams, dbParamsErr := s.CampaignStore.GetDNSValidationParams(ctx, s.DB, campaign.ID)
		require.NoError(t, dbParamsErr)
		require.NotNil(t, fetchedParams)
		assert.Equal(t, campaign.ID, fetchedParams.CampaignID)
		require.NotNil(t, fetchedParams.SourceGenerationCampaignID)
		assert.Equal(t, req.SourceGenerationCampaignID, *fetchedParams.SourceGenerationCampaignID)
		assert.ElementsMatch(t, req.PersonaIDs, fetchedParams.PersonaIDs)
		require.NotNil(t, fetchedParams.BatchSize)
		assert.Equal(t, req.BatchSize, *fetchedParams.BatchSize)

		auditLogFilter := store.ListAuditLogsFilter{
			EntityID:   uuid.NullUUID{UUID: campaign.ID, Valid: true},
			EntityType: "Campaign",
			Limit:      5,
		}
		auditLogs, auditErr := s.AuditLogStore.ListAuditLogs(ctx, s.DB, auditLogFilter)
		require.NoError(t, auditErr)
		require.NotEmpty(t, auditLogs)
	})

	errorTestCases := []struct {
		name          string
		modifier      func(req *services.CreateDNSValidationCampaignRequest)
		expectedError string
	}{
		{
			name: "No Persona IDs",
			modifier: func(req *services.CreateDNSValidationCampaignRequest) {
				req.PersonaIDs = []uuid.UUID{}
			},
			expectedError: "dns persona ids required",
		},
		{
			name: "Non-existent Persona ID",
			modifier: func(req *services.CreateDNSValidationCampaignRequest) {
				req.PersonaIDs = []uuid.UUID{uuid.New()}
			},
			expectedError: "dns persona id",
		},
		{
			name: "Disabled Persona ID",
			modifier: func(req *services.CreateDNSValidationCampaignRequest) {
				disabledPersona := testutil.CreateTestDNSPersona(t, ctx, s.PersonaStore, s.DB, "Disabled DNS Persona "+uuid.NewString(), false)
				req.PersonaIDs = []uuid.UUID{disabledPersona.ID}
			},
			expectedError: "dns persona id",
		},
		{
			name: "HTTP Persona ID for DNS Campaign",
			modifier: func(req *services.CreateDNSValidationCampaignRequest) {
				httpPersona := testutil.CreateTestHTTPPersona(t, ctx, s.PersonaStore, s.DB, "HTTP Persona for DNS Test "+uuid.NewString(), true)
				req.PersonaIDs = []uuid.UUID{httpPersona.ID}
			},
			expectedError: "persona id",
		},
		{
			name: "Non-existent Source Generation Campaign ID",
			modifier: func(req *services.CreateDNSValidationCampaignRequest) {
				req.SourceGenerationCampaignID = uuid.New()
			},
			expectedError: "failed to fetch source generation campaign params",
		},
	}

	for _, tc := range errorTestCases {
		t.Run(tc.name, func(t *testing.T) {
			currentSourceGenCampaign := s.createTestSourceDomainGenerationCampaign(ctx, "DNS Error Test Source", 10)
			currentDNSPersona := testutil.CreateTestDNSPersona(t, ctx, s.PersonaStore, s.DB, "DNS Persona for Error Test "+uuid.NewString(), true)

			req := baseReq
			req.Name = "Error DNS Test " + tc.name + " " + uuid.NewString()
			req.SourceGenerationCampaignID = currentSourceGenCampaign.ID
			req.PersonaIDs = []uuid.UUID{currentDNSPersona.ID}

			tc.modifier(&req)

			campaign, err := s.dnsService.CreateCampaign(ctx, req)

			require.Error(t, err, "Expected an error for test case: %s", tc.name)
			if tc.expectedError != "" {
				assert.Contains(t, strings.ToLower(err.Error()), strings.ToLower(tc.expectedError), "Error message mismatch for test case: %s", tc.name)
			}
			assert.Nil(t, campaign, "Campaign should be nil on error for test case: %s", tc.name)
		})
	}
}
