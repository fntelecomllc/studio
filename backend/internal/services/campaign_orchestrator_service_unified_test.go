// Test file to validate unified campaign creation endpoint
package services_test

import (
	"context"
	"testing"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

type CampaignOrchestratorUnifiedTestSuite struct {
	ServiceTestSuite
	orchestrator services.CampaignOrchestratorService
}

func (s *CampaignOrchestratorUnifiedTestSuite) SetupTest() {
	dgService := services.NewDomainGenerationService(s.DB, s.CampaignStore, s.CampaignJobStore, s.AuditLogStore)
	dnsService := services.NewDNSCampaignService(s.DB, s.CampaignStore, s.PersonaStore, s.AuditLogStore, s.CampaignJobStore, s.AppConfig)
	httpKeywordService := services.NewHTTPKeywordCampaignService(s.DB, s.CampaignStore, s.PersonaStore, s.ProxyStore, s.KeywordStore, s.AuditLogStore, s.CampaignJobStore, nil, nil, nil, s.AppConfig)
	
	s.orchestrator = services.NewCampaignOrchestratorService(
		s.DB,
		s.CampaignStore,
		s.PersonaStore,
		s.KeywordStore,
		s.AuditLogStore,
		s.CampaignJobStore,
		dgService,
		dnsService,
		httpKeywordService,
	)
}

func TestCampaignOrchestratorUnified(t *testing.T) {
	suite.Run(t, new(CampaignOrchestratorUnifiedTestSuite))
}

func (s *CampaignOrchestratorUnifiedTestSuite) TestCreateCampaignUnified_DomainGeneration() {
	req := services.CreateCampaignRequest{
		CampaignType: "domain_generation",
		Name:         "Test Unified Domain Generation",
		Description:  "Test campaign created via unified endpoint",
		UserID:       uuid.New(),
		DomainGenerationParams: &services.DomainGenerationParams{
			PatternType:          "prefix",
			VariableLength:       3,
			CharacterSet:         "abc123",
			ConstantString:       "test",
			TLD:                  ".com",
			NumDomainsToGenerate: 100,
		},
	}

	campaign, err := s.orchestrator.CreateCampaignUnified(context.Background(), req)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), campaign)

	assert.Equal(s.T(), req.Name, campaign.Name)
	assert.Equal(s.T(), models.CampaignTypeDomainGeneration, campaign.CampaignType)
	assert.Equal(s.T(), models.CampaignStatusPending, campaign.Status)
	assert.NotEqual(s.T(), uuid.Nil, campaign.ID)
}

func (s *CampaignOrchestratorUnifiedTestSuite) TestCreateCampaignUnified_InvalidType() {
	req := services.CreateCampaignRequest{
		CampaignType: "invalid_type",
		Name:         "Invalid Type Test",
		UserID:       uuid.New(),
	}

	campaign, err := s.orchestrator.CreateCampaignUnified(context.Background(), req)
	assert.Error(s.T(), err)
	assert.Nil(s.T(), campaign)
	assert.Contains(s.T(), err.Error(), "unsupported campaign type")
}

func (s *CampaignOrchestratorUnifiedTestSuite) TestCreateCampaignUnified_MissingParams() {
	req := services.CreateCampaignRequest{
		CampaignType: "domain_generation",
		Name:         "Missing Params Test",
		UserID:       uuid.New(),
		// Missing DomainGenerationParams
	}

	campaign, err := s.orchestrator.CreateCampaignUnified(context.Background(), req)
	assert.Error(s.T(), err)
	assert.Nil(s.T(), campaign)
	assert.Contains(s.T(), err.Error(), "domainGenerationParams required")
}
