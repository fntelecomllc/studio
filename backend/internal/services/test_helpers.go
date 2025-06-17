package services

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/config"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/fntelecomllc/studio/backend/internal/store/postgres"
	"github.com/jmoiron/sqlx"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
)

// CampaignServiceTestSuite provides a test suite with a fully initialized database and stores.
type CampaignServiceTestSuite struct {
	suite.Suite
	DB               *sqlx.DB
	AppConfig        *config.AppConfig
	CampaignStore    store.CampaignStore
	CampaignJobStore store.CampaignJobStore
	AuditLogStore    store.AuditLogStore
	PersonaStore     store.PersonaStore
	ProxyStore       store.ProxyStore
	KeywordStore     store.KeywordStore
	teardown         func()
}

func (s *CampaignServiceTestSuite) T() *testing.T {
	return s.Suite.T()
}

func (s *CampaignServiceTestSuite) SetupSuite() {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		dbConnBytes, err := os.ReadFile("../../.db_connection")
		if err == nil && len(dbConnBytes) > 0 {
			dsn = strings.TrimSpace(string(dbConnBytes))
		} else {
			s.T().Fatal("TEST_POSTGRES_DSN not set and .db_connection not found")
		}
	}

	db, err := sqlx.Connect("postgres", dsn)
	require.NoError(s.T(), err, "Failed to connect to test database")
	s.DB = db

	// Clean test data by truncating tables (preserving schema and data structure)
	// Only truncate tables that exist and are relevant for testing
	_, err = s.DB.Exec(`
		TRUNCATE TABLE 
			campaigns, 
			personas, 
			proxies, 
			keyword_sets, 
			campaign_jobs,
			audit_logs,
			generated_domains,
			dns_validation_results,
			http_keyword_results,
			domain_generation_campaign_params,
			dns_validation_params,
			http_keyword_campaign_params,
			auth.users,
			auth.sessions,
			auth.auth_audit_log
		RESTART IDENTITY CASCADE;
	`)
	require.NoError(s.T(), err, "Failed to clean test data")

	// Ensure required extensions exist (but don't recreate if they already exist)
	_, err = s.DB.Exec(`
		CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
		CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;
	`)
	require.NoError(s.T(), err, "Failed to ensure required extensions")

	// Initialize stores
	s.CampaignStore = postgres.NewCampaignStorePostgres(s.DB)
	s.CampaignJobStore = postgres.NewCampaignJobStorePostgres(s.DB)
	s.AuditLogStore = postgres.NewAuditLogStorePostgres(s.DB)
	s.PersonaStore = postgres.NewPersonaStorePostgres(s.DB)
	s.ProxyStore = postgres.NewProxyStorePostgres(s.DB)
	s.KeywordStore = postgres.NewKeywordStorePostgres(s.DB)

	// Load a minimal AppConfig
	s.AppConfig = &config.AppConfig{
		DNSValidator: config.DNSValidatorConfig{
			Resolvers:    []string{"1.1.1.1", "8.8.8.8"},
			QueryTimeout: 5 * time.Second,
		},
		Worker: config.WorkerConfig{
			DNSSubtaskConcurrency: 5,
			PollIntervalSeconds:   1, // Fast polling for tests
		},
	}

	s.teardown = func() {
		s.DB.Close()
	}
}

func (s *CampaignServiceTestSuite) TearDownSuite() {
	if s.teardown != nil {
		s.teardown()
	}
}