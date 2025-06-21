package services_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	_ "github.com/lib/pq" // PostgreSQL driver (imported for side effects)
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

type DomainGenerationServiceTestSuite struct {
	services.CampaignServiceTestSuite
	dgService services.DomainGenerationService
}

func (s *DomainGenerationServiceTestSuite) SetupTest() {
	s.dgService = services.NewDomainGenerationService(s.DB, s.CampaignStore, s.CampaignJobStore, s.AuditLogStore)
}

func TestDomainGenerationService(t *testing.T) {
	suite.Run(t, new(DomainGenerationServiceTestSuite))
}

func (s *DomainGenerationServiceTestSuite) TestCreateDomainGenerationCampaign() {
	t := s.T()
	ctx := context.Background()

	baseUserID := uuid.New()
	baseCampaignName := "Test Gen Campaign Base " + time.Now().Format(time.RFC3339Nano)

	baseReq := services.CreateDomainGenerationCampaignRequest{
		Name:                 baseCampaignName,
		UserID:               baseUserID,
		PatternType:          "prefix",
		VariableLength:       3,
		CharacterSet:         "abc",
		ConstantString:       "prefix",
		TLD:                  ".com",
		NumDomainsToGenerate: 10,
	}

	t.Run("Successful Campaign Creation", func(t *testing.T) {
		req := baseReq
		req.Name = "Success Campaign " + uuid.NewString()

		campaign, err := s.dgService.CreateCampaign(ctx, req)

		require.NoError(t, err)
		require.NotNil(t, campaign)
		require.NotEqual(t, uuid.Nil, campaign.ID)

		assert.Equal(t, req.Name, campaign.Name)
		assert.Equal(t, models.CampaignTypeDomainGeneration, campaign.CampaignType)
		assert.Equal(t, models.CampaignStatusPending, campaign.Status)
		if assert.NotNil(t, campaign.UserID) {
			assert.Equal(t, req.UserID, *campaign.UserID)
		}
		require.NotNil(t, campaign.TotalItems)
		assert.True(t, *campaign.TotalItems >= 0)

		fetchedCampaign, dbErr := s.CampaignStore.GetCampaignByID(ctx, s.DB, campaign.ID)
		require.NoError(t, dbErr)
		require.NotNil(t, fetchedCampaign)
		assert.Equal(t, req.Name, fetchedCampaign.Name)
		if campaign.TotalItems == nil {
			assert.Nil(t, fetchedCampaign.TotalItems)
		} else {
			require.NotNil(t, fetchedCampaign.TotalItems)
			assert.Equal(t, *campaign.TotalItems, *fetchedCampaign.TotalItems)
		}

		fetchedParams, dbParamsErr := s.CampaignStore.GetDomainGenerationParams(ctx, s.DB, campaign.ID)
		require.NoError(t, dbParamsErr)
		require.NotNil(t, fetchedParams)
		assert.Equal(t, campaign.ID, fetchedParams.CampaignID)
		assert.Equal(t, req.PatternType, fetchedParams.PatternType)
		require.NotNil(t, fetchedParams.VariableLength)
		assert.Equal(t, req.VariableLength, *fetchedParams.VariableLength)
		require.NotNil(t, fetchedParams.CharacterSet)
		assert.Equal(t, req.CharacterSet, *fetchedParams.CharacterSet)
		require.NotNil(t, fetchedParams.ConstantString)
		assert.Equal(t, req.ConstantString, *fetchedParams.ConstantString)
		assert.Equal(t, req.TLD, fetchedParams.TLD)
		assert.Equal(t, req.NumDomainsToGenerate, int64(fetchedParams.NumDomainsToGenerate))
		assert.True(t, fetchedParams.TotalPossibleCombinations >= 0)
		assert.True(t, fetchedParams.CurrentOffset >= 0)

		auditLogFilter := store.ListAuditLogsFilter{
			EntityID:   uuid.NullUUID{UUID: campaign.ID, Valid: true},
			EntityType: "Campaign",
			Limit:      5,
		}
		auditLogs, auditErr := s.AuditLogStore.ListAuditLogs(ctx, s.DB, auditLogFilter)
		require.NoError(t, auditErr)
		require.NotEmpty(t, auditLogs)
		foundExpectedLog := false
		for _, logEntry := range auditLogs {
			if strings.Contains(logEntry.Action, "Domain Generation Campaign Created") {
				foundExpectedLog = true
				break
			}
		}
		assert.True(t, foundExpectedLog, "Expected audit log 'Domain Generation Campaign Created' not found")
	})

	errorTestCases := []struct {
		name          string
		modifier      func(req *services.CreateDomainGenerationCampaignRequest)
		expectedError string
	}{
		{
			name: "Invalid PatternType",
			modifier: func(req *services.CreateDomainGenerationCampaignRequest) {
				req.PatternType = "INVALID_PATTERN_TYPE"
			},
			expectedError: "invalid domain generation parameters",
		},
		{
			name: "VariableLength Zero",
			modifier: func(req *services.CreateDomainGenerationCampaignRequest) {
				req.VariableLength = 0
			},
			expectedError: "invalid domain generation parameters",
		},
		{
			name: "VariableLength Negative",
			modifier: func(req *services.CreateDomainGenerationCampaignRequest) {
				req.VariableLength = -1
			},
			expectedError: "invalid domain generation parameters",
		},
		{
			name: "Empty CharacterSet",
			modifier: func(req *services.CreateDomainGenerationCampaignRequest) {
				req.CharacterSet = ""
			},
			expectedError: "invalid domain generation parameters",
		},
		{
			name: "Empty TLD",
			modifier: func(req *services.CreateDomainGenerationCampaignRequest) {
				req.TLD = ""
			},
			expectedError: "invalid domain generation parameters",
		},
		{
			name: "TLD without dot",
			modifier: func(req *services.CreateDomainGenerationCampaignRequest) {
				req.TLD = "com"
			},
			expectedError: "invalid domain generation parameters",
		},
	}

	for _, tc := range errorTestCases {
		t.Run(tc.name, func(t *testing.T) {
			req := baseReq
			req.Name = "Error Test " + tc.name + " " + uuid.NewString()
			tc.modifier(&req)

			campaign, err := s.dgService.CreateCampaign(ctx, req)

			require.Error(t, err, "Expected an error for test case: %s", tc.name)
			if tc.expectedError != "" {
				assert.Contains(t, strings.ToLower(err.Error()), strings.ToLower(tc.expectedError), "Error message mismatch for test case: %s", tc.name)
			}
			assert.Nil(t, campaign, "Campaign should be nil on error for test case: %s", tc.name)

			if campaign != nil && campaign.ID != uuid.Nil {
				fetchedCampaign, _ := s.CampaignStore.GetCampaignByID(ctx, s.DB, campaign.ID)
				assert.Nil(t, fetchedCampaign, "Campaign should not have been created in DB on error for test case: %s", tc.name)
			}
		})
	}
}
