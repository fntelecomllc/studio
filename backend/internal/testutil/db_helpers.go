package testutil

import (
	"os"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	// _ "github.com/golang-migrate/migrate/v4/source/file" // Removed local file migrations
	"github.com/fntelecomllc/studio/backend/internal/store"
	pg_store "github.com/fntelecomllc/studio/backend/internal/store/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/github" // Restored GitHub source
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

var testDB *sqlx.DB

// SetupTestDatabase initializes a test database connection and runs migrations.
// It returns the database connection and a cleanup function.
// If TEST_POSTGRES_DSN is not set, it returns nil, nil.
func SetupTestDatabase(t *testing.T) (*sqlx.DB, func()) {
	t.Helper()

	// Return existing connection if available
	if testDB != nil {
		// Basic check to see if connection is still valid
		if err := testDB.Ping(); err == nil {
			// Before returning existing connection, ensure migrations are up-to-date
			dsn := os.Getenv("TEST_POSTGRES_DSN")
			if dsn == "" {
				t.Fatal("TEST_POSTGRES_DSN environment variable is not set for re-check")
			}
			// Reverted to GitHub source
			migrationsURL := "github://fntelecomllc/studio/backend/database/migrations"
			m, err := migrate.New(migrationsURL, dsn)
			if err != nil {
				t.Fatalf("Failed to create migrator for re-check: %v", err)
			}
			err = m.Up()
			if err != nil && err != migrate.ErrNoChange {
				t.Fatalf("Failed to run migrations for re-check: %v", err)
			}
			if err == migrate.ErrNoChange {
				t.Log("Migrations re-check: No new migrations to run, database is up to date.")
			} else {
				t.Log("Migrations re-check: Migrations applied successfully.")
			}
			srcErr, dbErr := m.Close()
			if srcErr != nil {
				t.Logf("Warning: error closing migration source during re-check: %v", srcErr)
			}
			if dbErr != nil {
				t.Logf("Warning: error closing migration database connection during re-check: %v", dbErr)
			}
			return testDB, func() {}
		}
		// If ping fails, connection might be stale, proceed to recreate
		t.Log("Test DB connection ping failed, re-establishing...")
		testDB.Close() // Attempt to close stale connection
		testDB = nil   // Nullify to allow re-initialization
	}

	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Fatal("TEST_POSTGRES_DSN environment variable is not set")
	}

	var err error
	testDB, err = sqlx.Connect("postgres", dsn)
	if err != nil {
		t.Fatalf("Failed to connect to test database: %v", err)
	}

	_, err = testDB.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
	if err != nil {
		t.Fatalf("Failed to create uuid-ossp extension: %v", err)
	}

	// Reverted to GitHub source
	migrationsURL := "github://fntelecomllc/studio/backend/database/migrations"
	dbURL := dsn

	m, err := migrate.New(migrationsURL, dbURL)
	if err != nil {
		t.Fatalf("Failed to create migrator: %v", err)
	}

	t.Logf("Running migrations from: %s", migrationsURL)
	err = m.Up()
	if err != nil && err != migrate.ErrNoChange {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	if err == migrate.ErrNoChange {
		t.Log("No migrations to run, database is up to date")
	} else {
		t.Log("Migrations applied successfully")
	}

	srcErr, dbErr := m.Close()
	if srcErr != nil {
		t.Logf("Warning: error closing migration source: %v", srcErr)
	}
	if dbErr != nil {
		t.Logf("Warning: error closing migration database connection: %v", dbErr)
	}

	// Schema verification (optional, can be enhanced)
	_, err = testDB.Exec("SELECT 1 FROM campaigns LIMIT 1;") // Example check
	if err != nil {
		t.Fatalf("Database schema verification failed (campaigns table): %v", err)
	}
	t.Log("Database schema verified successfully (campaigns table exists)")

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
