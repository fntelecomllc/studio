package testutil

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/services"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/require"
)

// CreateTestDNSPersona creates a test DNS persona for testing
func CreateTestDNSPersona(t *testing.T, ctx context.Context, personaStore store.PersonaStore, db *sqlx.DB, name string, enabled bool) *models.Persona {
	persona := &models.Persona{
		ID:            uuid.New(),
		Name:          name,
		PersonaType:   models.PersonaTypeDNS,
		IsEnabled:     enabled,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		Description:   sql.NullString{String: "Test DNS Persona", Valid: true},
		ConfigDetails: json.RawMessage(`{"resolvers": ["8.8.8.8", "8.8.4.4"]}`),
	}
	err := personaStore.CreatePersona(ctx, db, persona)
	require.NoError(t, err)
	return persona
}

// CreateTestHTTPPersona creates a test HTTP persona for testing
func CreateTestHTTPPersona(t *testing.T, ctx context.Context, personaStore store.PersonaStore, db *sqlx.DB, name string, enabled bool) *models.Persona {
	persona := &models.Persona{
		ID:            uuid.New(),
		Name:          name,
		PersonaType:   models.PersonaTypeHTTP,
		IsEnabled:     enabled,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		Description:   sql.NullString{String: "Test HTTP Persona", Valid: true},
		ConfigDetails: json.RawMessage(`{"userAgent": "Mozilla/5.0 Test", "acceptLanguage": "en-US,en;q=0.9"}`),
	}
	err := personaStore.CreatePersona(ctx, db, persona)
	require.NoError(t, err)
	return persona
}

// CreateTestKeywordSet creates a test keyword set for testing
func CreateTestKeywordSet(t *testing.T, ctx context.Context, keywordStore store.KeywordStore, db *sqlx.DB) *models.KeywordSet {
	keywordSet := &models.KeywordSet{
		ID:          uuid.New(),
		Name:        "Test Keyword Set " + uuid.NewString(),
		Description: sql.NullString{String: "Test Keyword Set for HTTP Tests", Valid: true},
		IsEnabled:   true,
		Rules: &[]models.KeywordRule{
			{ID: uuid.New(), RuleType: models.KeywordRuleTypeString, Pattern: "test1"},
			{ID: uuid.New(), RuleType: models.KeywordRuleTypeString, Pattern: "test2"},
			{ID: uuid.New(), RuleType: models.KeywordRuleTypeString, Pattern: "test3"},
		},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	err := keywordStore.CreateKeywordSet(ctx, db, keywordSet)
	require.NoError(t, err)
	return keywordSet
}

// CreateTestDomainGenerationCampaignAndJob creates a test domain generation campaign and job for testing
func CreateTestDomainGenerationCampaignAndJob(t *testing.T, ctx context.Context, dgService services.DomainGenerationService, jobStore store.CampaignJobStore, namePrefix string, numToGenerate int64) (*models.Campaign, *models.CampaignJob) {
	userID := uuid.New()
	campaignName := namePrefix + " " + time.Now().Format(time.RFC3339Nano)

	genReq := services.CreateDomainGenerationCampaignRequest{
		Name:                 campaignName,
		UserID:               userID,
		PatternType:          "prefix",
		VariableLength:       5,
		CharacterSet:         "abcdefghijklmnopqrstuvwxyz",
		ConstantString:       "test",
		TLD:                  ".com",
		NumDomainsToGenerate: numToGenerate,
	}

	campaign, err := dgService.CreateCampaign(ctx, genReq)
	require.NoError(t, err)
	require.NotNil(t, campaign)

	if jobStore != nil {
		now := time.Now()
		job := &models.CampaignJob{
			ID:              uuid.New(),
			CampaignID:      campaign.ID,
			JobType:         models.CampaignTypeDomainGeneration,
			Status:          "queued",
			NextExecutionAt: sql.NullTime{Time: now, Valid: true},
			CreatedAt:       now,
			UpdatedAt:       now,
			Attempts:        0,
			MaxAttempts:     3,
		}
		err = jobStore.CreateJob(ctx, nil, job)
		require.NoError(t, err)
		return campaign, job
	}
	return campaign, nil
}
