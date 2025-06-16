package services_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/fntelecomllc/studio/backend/internal/testutil"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupDNSTestEnvironment adapts the general test setup for DNS campaign service tests.
// It ensures PersonaStore is also initialized and returned.
func setupDNSTestEnvironment(t *testing.T) (*sqlx.DB, store.CampaignStore, store.CampaignJobStore, store.PersonaStore, store.AuditLogStore, *config.AppConfig, func()) {
	db, campaignStore, auditLogStore, personaStore, campaignJobStore, _, _, baseTeardown := testutil.SetupTestStores(t)

	if db == nil { // Test was skipped
		return nil, nil, nil, nil, nil, nil, func() {}
	}

	// Load a minimal AppConfig for service initialization
	appCfg := &config.AppConfig{
		DNSValidator: config.DNSValidatorConfig{
			QueryTimeout: 5 * time.Second,
		},
		Worker: config.WorkerConfig{
			DNSSubtaskConcurrency: 5,
		},
	}

	return db, campaignStore, campaignJobStore, personaStore, auditLogStore, appCfg, baseTeardown
}

// Helper function to create a dummy DomainGeneration campaign for source
func createTestSourceDomainGenerationCampaign(t *testing.T, ctx context.Context, db *sqlx.DB, campaignStore store.CampaignStore, campaignJobStore store.CampaignJobStore, auditLogStore store.AuditLogStore) *models.Campaign {
	dgService := services.NewDomainGenerationService(db, campaignStore, campaignJobStore, auditLogStore)
	campaign, _ := testutil.CreateTestDomainGenerationCampaignAndJob(t, ctx, dgService, campaignJobStore, "Source Gen Campaign for DNS Test", 100)
	return campaign
}

// Local createTestDNSPersona function REMOVED as it now resides in test_helpers_test.go

func TestDNSCampaignServiceImpl_CreateCampaign(t *testing.T) {
	db, campaignStore, campaignJobStore, personaStore, auditLogStore, appCfg, teardown := setupDNSTestEnvironment(t)
	defer teardown()

	if db == nil { // Test skipped
		return
	}

	dnsService := services.NewDNSCampaignService(db, campaignStore, personaStore, auditLogStore, campaignJobStore, appCfg)
	ctx := context.Background()

	// Setup: Create a source domain generation campaign and a DNS persona
	sourceGenCampaign := createTestSourceDomainGenerationCampaign(t, ctx, db, campaignStore, campaignJobStore, auditLogStore)
	dnsPersona1 := testutil.CreateTestDNSPersona(t, ctx, personaStore, db, "Test DNS Persona 1 "+uuid.NewString(), true)

	baseUserID := "test-dns-user-" + uuid.NewString()
	baseCampaignName := "Test DNS Validation Campaign " + time.Now().Format(time.RFC3339Nano)

	baseReq := services.CreateDNSValidationCampaignRequest{
		Name:                       baseCampaignName,
		UserID:                     uuid.MustParse(baseUserID),
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

		campaign, err := dnsService.CreateCampaign(ctx, req)

		require.NoError(t, err)
		require.NotNil(t, campaign)
		require.NotEqual(t, uuid.Nil, campaign.ID)

		assert.Equal(t, req.Name, campaign.Name)
		assert.Equal(t, models.CampaignTypeDNSValidation, campaign.CampaignType)
		assert.Equal(t, models.CampaignStatusPending, campaign.Status)
		require.NotNil(t, campaign.UserID)
		assert.Equal(t, req.UserID, *campaign.UserID)
		assert.Equal(t, sourceGenCampaign.TotalItems, campaign.TotalItems, "TotalItems should match source gen campaign")

		fetchedCampaign, dbErr := campaignStore.GetCampaignByID(ctx, db, campaign.ID)
		require.NoError(t, dbErr)
		require.NotNil(t, fetchedCampaign)
		assert.Equal(t, req.Name, fetchedCampaign.Name)

		fetchedParams, dbParamsErr := campaignStore.GetDNSValidationParams(ctx, db, campaign.ID)
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
		auditLogs, auditErr := auditLogStore.ListAuditLogs(ctx, db, auditLogFilter)
		require.NoError(t, auditErr)
		require.NotEmpty(t, auditLogs)
		// Further check action string for specifics like "DNS Validation Campaign Created"
	})

	errorTestCases := []struct {
		name          string
		modifier      func(req *services.CreateDNSValidationCampaignRequest, stores map[string]interface{}) // Stores for pre-test setup if needed
		expectedError string
	}{
		{
			name: "No Persona IDs",
			modifier: func(req *services.CreateDNSValidationCampaignRequest, _ map[string]interface{}) {
				req.PersonaIDs = []uuid.UUID{}
			},
			expectedError: "dns persona ids required", // Based on internal validatePersonaIDs logic
		},
		{
			name: "Non-existent Persona ID",
			modifier: func(req *services.CreateDNSValidationCampaignRequest, _ map[string]interface{}) {
				req.PersonaIDs = []uuid.UUID{uuid.New()} // Random, likely non-existent ID
			},
			expectedError: "dns persona id", // And "not found"
		},
		{
			name: "Disabled Persona ID",
			modifier: func(req *services.CreateDNSValidationCampaignRequest, stores map[string]interface{}) {
				disabledPersona := testutil.CreateTestDNSPersona(t, ctx, stores["personaStore"].(store.PersonaStore), db, "Disabled DNS Persona "+uuid.NewString(), false)
				req.PersonaIDs = []uuid.UUID{disabledPersona.ID}
			},
			expectedError: "dns persona id", // And "disabled"
		},
		{
			name: "HTTP Persona ID for DNS Campaign",
			modifier: func(req *services.CreateDNSValidationCampaignRequest, stores map[string]interface{}) {
				httpPersona := testutil.CreateTestHTTPPersona(t, ctx, stores["personaStore"].(store.PersonaStore), db, "HTTP Persona for DNS Test "+uuid.NewString(), true)
				req.PersonaIDs = []uuid.UUID{httpPersona.ID}
			},
			expectedError: "persona id", // And "type 'http', expected 'dns'"
		},
		{
			name: "Non-existent Source Generation Campaign ID",
			modifier: func(req *services.CreateDNSValidationCampaignRequest, _ map[string]interface{}) {
				req.SourceGenerationCampaignID = uuid.New() // Random, non-existent ID
			},
			expectedError: "failed to fetch source generation campaign params",
		},
	}

	for _, tc := range errorTestCases {
		t.Run(tc.name, func(t *testing.T) {
			currentSourceGenCampaign := createTestSourceDomainGenerationCampaign(t, ctx, db, campaignStore, campaignJobStore, auditLogStore)
			currentDNSPersona := testutil.CreateTestDNSPersona(t, ctx, personaStore, db, "DNS Persona for Error Test "+uuid.NewString(), true)

			req := baseReq
			req.Name = "Error DNS Test " + tc.name + " " + uuid.NewString()
			req.SourceGenerationCampaignID = currentSourceGenCampaign.ID
			req.PersonaIDs = []uuid.UUID{currentDNSPersona.ID}

			storesForModifier := map[string]interface{}{
				"personaStore":  personaStore,
				"campaignStore": campaignStore,
			}
			tc.modifier(&req, storesForModifier)

			campaign, err := dnsService.CreateCampaign(ctx, req)

			require.Error(t, err, "Expected an error for test case: %s", tc.name)
			if tc.expectedError != "" {
				assert.Contains(t, strings.ToLower(err.Error()), strings.ToLower(tc.expectedError), "Error message mismatch for test case: %s", tc.name)
			}
			assert.Nil(t, campaign, "Campaign should be nil on error for test case: %s", tc.name)
		})
	}

	// TODO: Test GetCampaignDetails
	// TODO: Test ProcessDNSValidationCampaignBatch (this will be complex)
}
