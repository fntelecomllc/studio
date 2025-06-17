package testutil

import (
	"os"
	"strings"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/fntelecomllc/studio/backend/internal/store"
	pg_store "github.com/fntelecomllc/studio/backend/internal/store/postgres"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

var testDB *sqlx.DB
var testDSN string

// SetupTestDatabase initializes a test database connection and runs migrations.
// It returns the database connection and a cleanup function.
// If TEST_POSTGRES_DSN is not set, it uses a default local DSN.
func SetupTestDatabase(t *testing.T) (*sqlx.DB, func()) {
	t.Helper()

	// Initialize DSN on first run
	if testDSN == "" {
		testDSN = os.Getenv("TEST_POSTGRES_DSN")
		if testDSN == "" {
			// Read from .db_connection file if it exists
			dbConnBytes, err := os.ReadFile("../../.db_connection")
			if err == nil && len(dbConnBytes) > 0 {
				testDSN = strings.TrimSpace(string(dbConnBytes))
				t.Log("Using DSN from .db_connection file")
			} else {
				t.Log("TEST_POSTGRES_DSN not set and .db_connection not found, using default: postgres://studio:studio@localhost:5432/studio_test?sslmode=disable")
				testDSN = "postgres://studio:studio@localhost:5432/studio_test?sslmode=disable"
			}
		}
	}

	// Return existing connection if available
	if testDB != nil {
		if err := testDB.Ping(); err == nil {
			return testDB, func() {}
		}
		t.Log("Test DB connection ping failed, re-establishing...")
		testDB.Close()
	}

	var err error
	testDB, err = sqlx.Connect("postgres", testDSN)
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	_, err = testDB.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
	if err != nil {
		t.Fatalf("Failed to create uuid-ossp extension: %v", err)
	}

	migrationsURL := "file://../../database/migrations"

	m, err := migrate.New(migrationsURL, testDSN)
	if err != nil {
		t.Fatalf("Failed to create migrator: %v", err)
	}

	// Force drop any existing schema to ensure a clean state
	if err := m.Drop(); err != nil && err != migrate.ErrNoChange {
		t.Logf("Could not drop database (might be first run): %v", err)
	}

	// Re-create the migrator after dropping the database
	m, err = migrate.New(migrationsURL, testDSN)
	if err != nil {
		t.Fatalf("Failed to re-create migrator: %v", err)
	}

	t.Logf("Running migrations from: %s", migrationsURL)
	err = m.Up()
	if err != nil && err != migrate.ErrNoChange {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	return testDB, func() {
		// The cleanup function could be used to drop tables or close the connection
		// if the connection wasn't cached globally (testDB variable).
		// Since we cache it, we'll handle cleanup separately if needed, e.g., via TestMain.
	}
}

// SetupTestStores creates all the necessary stores for testing
func SetupTestStores(t *testing.T) (*sqlx.DB, store.CampaignStore, store.AuditLogStore, store.PersonaStore, store.CampaignJobStore, store.KeywordStore, store.ProxyStore, func()) {
	t.Helper()

	db, teardown := SetupTestDatabase(t)
	if db == nil { // Should not happen if SetupTestDatabase calls t.Fatal
		t.Fatalf("Database setup failed unexpectedly")
	}

	campaignStore := pg_store.NewCampaignStorePostgres(db)
	auditLogStore := pg_store.NewAuditLogStorePostgres(db)
	personaStore := pg_store.NewPersonaStorePostgres(db)
	campaignJobStore := pg_store.NewCampaignJobStorePostgres(db)
	keywordStore := pg_store.NewKeywordStorePostgres(db)
	proxyStore := pg_store.NewProxyStorePostgres(db)

	return db, campaignStore, auditLogStore, personaStore, campaignJobStore, keywordStore, proxyStore, teardown
}

// CleanupTestDatabase closes the test database connection.
// This could be called in a TestMain m.Run() defer if using a global testDB.
func CleanupTestDatabase() {
	if testDB != nil {
		testDB.Close()
		testDB = nil
	}
}
