package postgres

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

type CampaignStoreTestSuite struct {
	suite.Suite
	db       *sqlx.DB
	store    store.CampaignStore
	tx       *sqlx.Tx
	teardown func()
}

// T returns the test suite's testing.T instance.
// This is a workaround for the compiler not recognizing the embedded suite.Suite.T() method.
func (s *CampaignStoreTestSuite) T() *testing.T {
	return s.Suite.T()
}

func (s *CampaignStoreTestSuite) SetupSuite() {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		s.T().Fatal("TEST_POSTGRES_DSN environment variable must be set")
	}

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		s.T().Fatalf("Failed to connect to test database: %v. DSN: %s", err, dsn)
	}
	s.db = db
	s.store = NewCampaignStorePostgres(s.db)

	// Run migrations
	_, err = db.Exec(`
		CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
		
		-- Create campaigns table if not exists
		CREATE TABLE IF NOT EXISTS campaigns (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			name TEXT NOT NULL,
			campaign_type TEXT NOT NULL,
			status TEXT NOT NULL,
			user_id TEXT,
			total_items BIGINT DEFAULT 0,
			processed_items BIGINT DEFAULT 0,
			successful_items BIGINT DEFAULT 0,
			failed_items BIGINT DEFAULT 0,
			progress_percentage DOUBLE PRECISION DEFAULT 0.0,
			metadata JSONB,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			started_at TIMESTAMPTZ,
			completed_at TIMESTAMPTZ,
			error_message TEXT
		);

		-- Create domain_generation_campaign_params table
		CREATE TABLE IF NOT EXISTS domain_generation_campaign_params (
			campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
			pattern_type TEXT NOT NULL,
			variable_length INT,
			character_set TEXT,
			constant_string TEXT,
			tld TEXT NOT NULL,
			num_domains_to_generate INT NOT NULL,
			total_possible_combinations BIGINT NOT NULL,
			current_offset BIGINT NOT NULL DEFAULT 0
		);

		-- Create generated_domains table with all required columns
		CREATE TABLE IF NOT EXISTS generated_domains (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			domain_generation_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
			domain_name TEXT NOT NULL,
			source_keyword TEXT,
			source_pattern TEXT,
			tld TEXT,
			offset_index BIGINT NOT NULL DEFAULT 0,
			generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			CONSTRAINT uq_generated_domains_campaign_name UNIQUE (domain_generation_campaign_id, domain_name)
		);

		-- Create indexes
		CREATE INDEX IF NOT EXISTS idx_generated_domains_campaign_id ON generated_domains(domain_generation_campaign_id);
		CREATE INDEX IF NOT EXISTS idx_generated_domains_name ON generated_domains(domain_name);
		CREATE INDEX IF NOT EXISTS idx_generated_domains_offset ON generated_domains(domain_generation_campaign_id, offset_index);

		-- Create domain_generation_config_states table
		CREATE TABLE IF NOT EXISTS domain_generation_config_states (
			config_hash TEXT PRIMARY KEY,
			last_offset BIGINT NOT NULL,
			config_details JSONB NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
	`)
	require.NoError(s.T(), err, "Failed to create test tables")
}

func (s *CampaignStoreTestSuite) SetupTest() {
	tx, err := s.db.Beginx()
	require.NoError(s.T(), err, "Failed to begin transaction")
	s.tx = tx
	s.teardown = func() {
		if r := recover(); r != nil {
			tx.Rollback()
			panic(r)
		}
	}
}

func (s *CampaignStoreTestSuite) TearDownTest() {
	if s.teardown != nil {
		s.teardown()
	}
	if s.tx != nil {
		s.tx.Rollback()
	}
}

func (s *CampaignStoreTestSuite) TearDownSuite() {
	if s.db != nil {
		s.db.Close()
	}
}

func TestCampaignStore(t *testing.T) {
	suite.Run(t, new(CampaignStoreTestSuite))
}

func (s *CampaignStoreTestSuite) createTestCampaign(t *testing.T, name string, campaignType models.CampaignTypeEnum) *models.Campaign {
	t.Helper()

	userID := uuid.New()
	campaign := &models.Campaign{
		ID:                 uuid.New(),
		Name:               name,
		CampaignType:       campaignType,
		Status:             models.CampaignStatusPending,
		UserID:             models.StringPtr(userID.String()),
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
		ProgressPercentage: models.Float64Ptr(0),
		TotalItems:         models.Int64Ptr(100),
		ProcessedItems:     models.Int64Ptr(0),
		ErrorMessage:       nil,
	}

	err := s.store.CreateCampaign(context.Background(), s.tx, campaign)
	require.NoError(t, err, "Failed to create test campaign")
	return campaign
}

func (s *CampaignStoreTestSuite) TestCreateAndGetCampaign() {
	// Create a test campaign
	campaignType := models.CampaignTypeDomainGeneration
	campaign := s.createTestCampaign(s.T(), "Test Campaign", campaignType)

	// Get the campaign back
	retrieved, err := s.store.GetCampaignByID(context.Background(), s.tx, campaign.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), retrieved)

	// Verify the data
	assert.Equal(s.T(), campaign.ID, retrieved.ID)
	assert.Equal(s.T(), "Test Campaign", retrieved.Name)
	assert.Equal(s.T(), campaignType, retrieved.CampaignType)
	assert.Equal(s.T(), models.CampaignStatusPending, retrieved.Status)
}

func (s *CampaignStoreTestSuite) TestUpdateCampaign() {
	// Create a test campaign
	campaign := s.createTestCampaign(s.T(), "Test Update", models.CampaignTypeDomainGeneration)

	// Update the campaign
	campaign.Name = "Updated Name"
	campaign.Status = models.CampaignStatusRunning
	err := s.store.UpdateCampaign(context.Background(), s.tx, campaign)
	require.NoError(s.T(), err)

	// Get the updated campaign
	updated, err := s.store.GetCampaignByID(context.Background(), s.tx, campaign.ID)
	require.NoError(s.T(), err)

	// Verify the update
	assert.Equal(s.T(), "Updated Name", updated.Name)
	assert.Equal(s.T(), models.CampaignStatusRunning, updated.Status)
}

func (s *CampaignStoreTestSuite) TestDeleteCampaign() {
	t := s.T()
	// Create a test campaign
	campaign := s.createTestCampaign(t, "Test Delete", models.CampaignTypeDomainGeneration)

	// Delete the campaign
	err := s.store.DeleteCampaign(context.Background(), s.tx, campaign.ID)
	require.NoError(t, err, "Failed to delete campaign")

	// Try to get the deleted campaign
	deleted, err := s.store.GetCampaignByID(context.Background(), s.tx, campaign.ID)
	require.Error(t, err, "Expected error when getting deleted campaign")
	assert.True(t, errors.Is(err, store.ErrNotFound), "Error should be ErrNotFound")
	assert.Nil(t, deleted, "Deleted campaign should be nil")
}

func (s *CampaignStoreTestSuite) TestListCampaigns() {
	// Create test campaigns
	campaign1 := s.createTestCampaign(s.T(), "Campaign 1", models.CampaignTypeDomainGeneration)
	campaign2 := s.createTestCampaign(s.T(), "Campaign 2", models.CampaignTypeDNSValidation)

	// List all campaigns
	campaigns, err := s.store.ListCampaigns(context.Background(), s.tx, store.ListCampaignsFilter{})
	require.NoError(s.T(), err)
	assert.GreaterOrEqual(s.T(), len(campaigns), 2)

	// Verify we can find both campaigns
	var found1, found2 bool
	for _, c := range campaigns {
		if c.ID == campaign1.ID {
			found1 = true
		} else if c.ID == campaign2.ID {
			found2 = true
		}
	}
	assert.True(s.T(), found1, "Campaign 1 not found in list")
	assert.True(s.T(), found2, "Campaign 2 not found in list")
}

func (s *CampaignStoreTestSuite) TestUpdateCampaignStatus() {
	// Create a test campaign
	campaign := s.createTestCampaign(s.T(), "Test Status Update", models.CampaignTypeDomainGeneration)

	// Update the status
	err := s.store.UpdateCampaignStatus(context.Background(), s.tx, campaign.ID, models.CampaignStatusRunning, sql.NullString{})
	require.NoError(s.T(), err)

	// Verify the status update
	updated, err := s.store.GetCampaignByID(context.Background(), s.tx, campaign.ID)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), models.CampaignStatusRunning, updated.Status)
}

func (s *CampaignStoreTestSuite) TestUpdateCampaignProgress() {
	// Create a test campaign
	campaign := s.createTestCampaign(s.T(), "Test Progress", models.CampaignTypeDomainGeneration)

	// Update the progress
	err := s.store.UpdateCampaignProgress(context.Background(), s.tx, campaign.ID, 50, 100, 50.0)
	require.NoError(s.T(), err)

	// Verify the update
	retrieved, err := s.store.GetCampaignByID(context.Background(), s.tx, campaign.ID)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), models.CampaignStatusRunning, retrieved.Status, "Status should be running when progress is updated")
	require.NotNil(s.T(), retrieved.ProgressPercentage)
	assert.Equal(s.T(), 50.0, *retrieved.ProgressPercentage, "Progress percentage should be 50")
	require.NotNil(s.T(), retrieved.ProcessedItems)
	assert.Equal(s.T(), int64(50), *retrieved.ProcessedItems, "Processed items should be 50")
	require.NotNil(s.T(), retrieved.ProgressPercentage)
	assert.Equal(s.T(), 50.0, *retrieved.ProgressPercentage)
}

func (s *CampaignStoreTestSuite) TestDomainGenerationParams() {
	t := s.T()
	// Create a test campaign
	campaign := s.createTestCampaign(t, "Domain Gen Test", models.CampaignTypeDomainGeneration)

	// Create domain generation params
	params := &models.DomainGenerationCampaignParams{
		CampaignID:                campaign.ID,
		PatternType:               "prefix",
		VariableLength:            models.IntPtr(5),
		CharacterSet:              models.StringPtr("abc"),
		ConstantString:            models.StringPtr("test"),
		TLD:                       ".com",
		NumDomainsToGenerate:      100,
		TotalPossibleCombinations: 1000,
		CurrentOffset:             0,
	}

	// Test create
	err := s.store.CreateDomainGenerationParams(context.Background(), s.tx, params)
	require.NoError(t, err, "Failed to create domain generation params")

	// Test get
	retrieved, err := s.store.GetDomainGenerationParams(context.Background(), s.tx, campaign.ID)
	require.NoError(t, err, "Failed to get domain generation params")
	require.NotNil(t, retrieved, "Retrieved params should not be nil")

	// Verify the data
	assert.Equal(t, params.PatternType, retrieved.PatternType, "PatternType should match")
	require.NotNil(t, retrieved.VariableLength)
	assert.Equal(t, *params.VariableLength, *retrieved.VariableLength, "VariableLength should match")
	require.NotNil(t, retrieved.CharacterSet)
	assert.Equal(t, *params.CharacterSet, *retrieved.CharacterSet, "CharacterSet should match")
	require.NotNil(t, retrieved.ConstantString)
	assert.Equal(t, *params.ConstantString, *retrieved.ConstantString, "ConstantString should match")
	assert.Equal(t, params.TLD, retrieved.TLD, "TLD should match")

	// Test update offset
	newOffset := int64(50)
	err = s.store.UpdateDomainGenerationParamsOffset(context.Background(), s.tx, campaign.ID, newOffset)
	require.NoError(t, err, "Failed to update domain generation params offset")

	// Verify the update
	retrieved, err = s.store.GetDomainGenerationParams(context.Background(), s.tx, campaign.ID)
	require.NoError(t, err, "Failed to get updated domain generation params")
	assert.Equal(t, newOffset, retrieved.CurrentOffset, "CurrentOffset should be updated")
	require.NotNil(t, retrieved, "Retrieved params should not be nil")
}

func (s *CampaignStoreTestSuite) TestGeneratedDomains() {
	t := s.T()
	// Create a test campaign
	campaign := s.createTestCampaign(t, "Generated Domains Test", models.CampaignTypeDomainGeneration)

	// Create test domains
	domains := []*models.GeneratedDomain{
		{
			ID:                   uuid.New(),
			GenerationCampaignID: campaign.ID,
			DomainName:           "test1.com",
			OffsetIndex:          0,
			GeneratedAt:          time.Now().UTC(),
		},
		{
			ID:                   uuid.New(),
			GenerationCampaignID: campaign.ID,
			DomainName:           "test2.com",
			OffsetIndex:          1,
			GeneratedAt:          time.Now().UTC(),
		},
	}

	// Test create
	err := s.store.CreateGeneratedDomains(context.Background(), s.tx, domains)
	require.NoError(t, err, "Failed to create generated domains")

	// Test get by campaign
	retrieved, err := s.store.GetGeneratedDomainsByCampaign(context.Background(), s.tx, campaign.ID, 10, -1)
	require.NoError(t, err, "Failed to get generated domains by campaign")
	assert.Len(t, retrieved, 2, "Should retrieve 2 domains")

	// Test count
	count, err := s.store.CountGeneratedDomainsByCampaign(context.Background(), s.tx, campaign.ID)
	require.NoError(t, err, "Failed to count generated domains")
	assert.Equal(t, int64(2), count, "Should count 2 domains")
}

func (s *CampaignStoreTestSuite) TestCampaignPagination() {
	// Create multiple campaigns
	for i := 0; i < 15; i++ {
		s.createTestCampaign(s.T(), "Campaign "+string(rune('A'+i)), models.CampaignTypeDomainGeneration)
	}

	// Test pagination
	filter := store.ListCampaignsFilter{
		Type:   models.CampaignTypeDomainGeneration,
		Limit:  1,
		Offset: 1,
	}

	// Should get second campaign
	paginated, err := s.store.ListCampaigns(context.Background(), s.tx, filter)
	require.NoError(s.T(), err)
	assert.Len(s.T(), paginated, 1)

	// Test count
	count, err := s.store.CountCampaigns(context.Background(), s.tx, filter)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(15), count)
}

func (s *CampaignStoreTestSuite) TestTransactionRollback() {
	// Test transaction rollback on error
	tx, err := s.db.BeginTxx(context.Background(), nil)
	require.NoError(s.T(), err)

	// Create a campaign in the transaction
	userID := uuid.New()
	campaign := &models.Campaign{
		ID:                 uuid.New(),
		Name:               "Transaction Test",
		CampaignType:       models.CampaignTypeDomainGeneration,
		Status:             models.CampaignStatusPending,
		UserID:             models.StringPtr(userID.String()),
		CreatedAt:          time.Now().UTC(),
		UpdatedAt:          time.Now().UTC(),
		ProgressPercentage: models.Float64Ptr(0),
		TotalItems:         models.Int64Ptr(100),
		ProcessedItems:     models.Int64Ptr(0),
		ErrorMessage:       nil,
	}

	err = s.store.CreateCampaign(context.Background(), tx, campaign)
	require.NoError(s.T(), err, "Failed to create test campaign")

	// Intentionally cause an error
	err = s.store.CreateGeneratedDomains(context.Background(), tx, []*models.GeneratedDomain{{
		ID:                   uuid.New(),
		GenerationCampaignID: uuid.New(), // Invalid campaign ID
		DomainName:           "should-fail.com",
		OffsetIndex:          0,
		GeneratedAt:          time.Now().UTC(),
	}})
	require.Error(s.T(), err)

	// Rollback the transaction
	err = tx.Rollback()
	require.NoError(s.T(), err)

	// Verify the campaign was not created
	_, err = s.store.GetCampaignByID(context.Background(), s.tx, campaign.ID)
	assert.True(s.T(), errors.Is(err, store.ErrNotFound), "Expected campaign to be rolled back")
}
