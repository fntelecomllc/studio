package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"testing"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testDB is a global variable to hold the test database connection.
var testDB *sqlx.DB

// clearPersonasTable is a helper to clean the personas table before each test.
func clearPersonasTable(t *testing.T, db *sqlx.DB) {
	_, err := db.ExecContext(context.Background(), "DELETE FROM personas")
	require.NoError(t, err, "Failed to clear personas table")
}

func TestMain(m *testing.M) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		log.Fatal("TEST_POSTGRES_DSN environment variable must be set")
	}

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to test database for TestMain using DSN '%s': %v", dsn, err)
	}
	testDB = db // Assign to global var for use in tests

	// Clean test data by truncating tables to ensure a clean state
	// This prevents data from previous test runs from affecting current tests
	_, err = testDB.Exec(`
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
	if err != nil {
		log.Printf("Warning: Failed to clean test data: %v", err)
	}

	// Schema setup is handled by test_helpers.go for all tests.
	// This TestMain only connects to the database.

	// Run the actual tests
	code := m.Run()
	testDB.Close()
	os.Exit(code)
}

func TestPersonaStore_CreatePersona(t *testing.T) {
	require.NotNil(t, testDB, "testDB is nil. Ensure TestMain ran or TEST_POSTGRES_DSN is set.")
	personaStore := NewPersonaStorePostgres(testDB)
	ctx := context.Background()

	t.Run("successful creation", func(t *testing.T) {
		clearPersonasTable(t, testDB)
		details := json.RawMessage(`{"userAgent": "test-agent"}`)
		persona := &models.Persona{		ID:            uuid.New(),
		Name:          "Test Create Persona",
		PersonaType:   models.PersonaTypeHTTP,
		Description:   sql.NullString{String: "A test persona", Valid: true},
			ConfigDetails: details,
			IsEnabled:     true,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}

		err := personaStore.CreatePersona(ctx, testDB, persona)
		assert.NoError(t, err)

		retrieved, err := personaStore.GetPersonaByID(ctx, testDB, persona.ID)
		require.NoError(t, err)
		require.NotNil(t, retrieved)
		assert.Equal(t, persona.Name, retrieved.Name)
		assert.Equal(t, persona.PersonaType, retrieved.PersonaType)
		assert.Equal(t, string(persona.ConfigDetails), string(retrieved.ConfigDetails))
		assert.Equal(t, persona.Description.Valid, retrieved.Description.Valid)
		if persona.Description.Valid {
			assert.Equal(t, persona.Description.String, retrieved.Description.String)
		}
		assert.Equal(t, persona.IsEnabled, retrieved.IsEnabled)
		assert.WithinDuration(t, persona.CreatedAt, retrieved.CreatedAt, time.Second)
		assert.WithinDuration(t, persona.UpdatedAt, retrieved.UpdatedAt, time.Second)
	})

	t.Run("duplicate name and type", func(t *testing.T) { // Renamed for clarity
		clearPersonasTable(t, testDB)
		persona1 := &models.Persona{ID: uuid.New(), Name: "Duplicate Name Type Test", PersonaType: models.PersonaTypeDNS, ConfigDetails: json.RawMessage(`{}`), IsEnabled: true, CreatedAt: time.Now(), UpdatedAt: time.Now()}

		err := personaStore.CreatePersona(ctx, testDB, persona1)
		require.NoError(t, err)

		persona2 := &models.Persona{ID: uuid.New(), Name: "Duplicate Name Type Test", PersonaType: models.PersonaTypeDNS, ConfigDetails: json.RawMessage(`{}`), IsEnabled: false, CreatedAt: time.Now(), UpdatedAt: time.Now()}
		err = personaStore.CreatePersona(ctx, testDB, persona2)
		assert.ErrorIs(t, err, store.ErrDuplicateEntry)
	})

	t.Run("duplicate ID", func(t *testing.T) {
		clearPersonasTable(t, testDB)
		commonID := uuid.New()
		persona1 := &models.Persona{ID: commonID, Name: "ID Test 1", PersonaType: models.PersonaTypeDNS, ConfigDetails: json.RawMessage(`{}`), CreatedAt: time.Now(), UpdatedAt: time.Now()}
		persona2 := &models.Persona{ID: commonID, Name: "ID Test 2", PersonaType: models.PersonaTypeHTTP, ConfigDetails: json.RawMessage(`{}`), CreatedAt: time.Now(), UpdatedAt: time.Now()}

		err := personaStore.CreatePersona(ctx, testDB, persona1)
		require.NoError(t, err)

		err = personaStore.CreatePersona(ctx, testDB, persona2)
		assert.ErrorIs(t, err, store.ErrDuplicateEntry, "Creating persona with duplicate ID should fail")
	})
}

func TestPersonaStore_GetPersonaByID(t *testing.T) {
	require.NotNil(t, testDB, "testDB is nil.")
	personaStore := NewPersonaStorePostgres(testDB)
	ctx := context.Background()
	clearPersonasTable(t, testDB)

	details := json.RawMessage(`{"resolver": "1.1.1.1"}`)
	persona := &models.Persona{
		ID:            uuid.New(),
		Name:          "Get By ID Persona",
		PersonaType:   models.PersonaTypeHTTP,
		ConfigDetails: details,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	err := personaStore.CreatePersona(ctx, testDB, persona)
	require.NoError(t, err)

	retrieved, err := personaStore.GetPersonaByID(ctx, testDB, persona.ID)
	assert.NoError(t, err)
	require.NotNil(t, retrieved)
	assert.Equal(t, persona.ID, retrieved.ID)
	assert.Equal(t, persona.Name, retrieved.Name)

	_, err = personaStore.GetPersonaByID(ctx, testDB, uuid.New()) // Non-existent ID
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestPersonaStore_GetPersonaByName(t *testing.T) {
	require.NotNil(t, testDB, "testDB is nil.")
	personaStore := NewPersonaStorePostgres(testDB)
	ctx := context.Background()
	clearPersonasTable(t, testDB)

	personaName := "Get By Name Persona Unique"
	details := json.RawMessage(`{"resolver": "8.8.8.8"}`)
	persona := &models.Persona{
		ID:            uuid.New(),
		Name:          personaName,
		PersonaType:   models.PersonaTypeHTTP, // Ensure this matches for unique (name, type)
		ConfigDetails: details,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	err := personaStore.CreatePersona(ctx, testDB, persona)
	require.NoError(t, err)

	retrieved, err := personaStore.GetPersonaByName(ctx, testDB, personaName)
	assert.NoError(t, err)
	require.NotNil(t, retrieved)
	assert.Equal(t, persona.ID, retrieved.ID)
	assert.Equal(t, personaName, retrieved.Name)

	_, err = personaStore.GetPersonaByName(ctx, testDB, "NonExistent Persona Name")
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestPersonaStore_UpdatePersona(t *testing.T) {
	require.NotNil(t, testDB, "testDB is nil.")
	personaStore := NewPersonaStorePostgres(testDB)
	ctx := context.Background()
	clearPersonasTable(t, testDB)

	details := json.RawMessage(`{"userAgent": "initial-agent"}`)
	persona := &models.Persona{
		ID:            uuid.New(),
		Name:          "Update Persona Original",
		PersonaType:   models.PersonaTypeHTTP,
		ConfigDetails: details,
		IsEnabled:     true,
		CreatedAt:     time.Now().UTC().Truncate(time.Millisecond),
		UpdatedAt:     time.Now().UTC().Truncate(time.Millisecond),
	}
	err := personaStore.CreatePersona(ctx, testDB, persona)
	require.NoError(t, err)

	retrieved, _ := personaStore.GetPersonaByID(ctx, testDB, persona.ID)

	retrieved.Name = "Updated Persona Name"
	retrieved.IsEnabled = false
	newDetails := json.RawMessage(`{"userAgent": "updated-agent"}`)
	retrieved.ConfigDetails = newDetails
	retrieved.UpdatedAt = time.Now().UTC().Truncate(time.Millisecond).Add(time.Second) // Ensure updated_at changes

	err = personaStore.UpdatePersona(ctx, testDB, retrieved)
	assert.NoError(t, err)

	updated, errGet := personaStore.GetPersonaByID(ctx, testDB, persona.ID)
	require.NoError(t, errGet)
	assert.Equal(t, "Updated Persona Name", updated.Name)
	assert.False(t, updated.IsEnabled)
	assert.Equal(t, string(newDetails), string(updated.ConfigDetails))
	assert.True(t, updated.UpdatedAt.After(persona.CreatedAt), "UpdatedAt should be after CreatedAt")

	// Test update non-existent persona
	nonExistentPersona := &models.Persona{
		ID:            uuid.New(),
		Name:          "Non Existent",
		PersonaType:   models.PersonaTypeHTTP,
		Description:   sql.NullString{},
		ConfigDetails: json.RawMessage("{}"),
		IsEnabled:     false,
		UpdatedAt:     time.Now(),
	}
	err = personaStore.UpdatePersona(ctx, testDB, nonExistentPersona)
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestPersonaStore_DeletePersona(t *testing.T) {
	require.NotNil(t, testDB, "testDB is nil.")
	personaStore := NewPersonaStorePostgres(testDB)
	ctx := context.Background()
	clearPersonasTable(t, testDB)

	persona := &models.Persona{ID: uuid.New(), Name: "Delete Me", PersonaType: models.PersonaTypeDNS, ConfigDetails: json.RawMessage(`{}`)}
	err := personaStore.CreatePersona(ctx, testDB, persona)
	require.NoError(t, err)

	err = personaStore.DeletePersona(ctx, testDB, persona.ID)
	assert.NoError(t, err)

	_, err = personaStore.GetPersonaByID(ctx, testDB, persona.ID)
	assert.ErrorIs(t, err, store.ErrNotFound)

	// Test delete non-existent persona
	err = personaStore.DeletePersona(ctx, testDB, uuid.New())
	assert.ErrorIs(t, err, store.ErrNotFound)
}

func TestPersonaStore_ListPersonas(t *testing.T) {
	require.NotNil(t, testDB, "testDB is nil.")
	personaStore := NewPersonaStorePostgres(testDB)
	ctx := context.Background()
	clearPersonasTable(t, testDB)

	configDNS := json.RawMessage(`{"resolver": "1.1.1.1"}`)
	configHTTP := json.RawMessage(`{"userAgent": "list-agent"}`)

	personasData := []models.Persona{
		{ID: uuid.New(), Name: "DNS Persona 1 (Enabled)", PersonaType: models.PersonaTypeDNS, ConfigDetails: configDNS, IsEnabled: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New(), Name: "HTTP Persona 1 (Enabled)", PersonaType: models.PersonaTypeHTTP, ConfigDetails: configHTTP, IsEnabled: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New(), Name: "DNS Persona 2 (Disabled)", PersonaType: models.PersonaTypeDNS, ConfigDetails: configDNS, IsEnabled: false, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New(), Name: "HTTP Persona 2 (Disabled)", PersonaType: models.PersonaTypeHTTP, ConfigDetails: configHTTP, IsEnabled: false, CreatedAt: time.Now(), UpdatedAt: time.Now()},
		{ID: uuid.New(), Name: "Another DNS One (Enabled)", PersonaType: models.PersonaTypeDNS, ConfigDetails: configDNS, IsEnabled: true, CreatedAt: time.Now(), UpdatedAt: time.Now()},
	}

	for i := range personasData {
		err := personaStore.CreatePersona(ctx, testDB, &personasData[i])
		require.NoError(t, err)
	}

	t.Run("list all", func(t *testing.T) {
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{})
		assert.NoError(t, err)
		assert.Len(t, listed, 5, "Should list all personas")
	})

	t.Run("filter by type DNS", func(t *testing.T) {
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{Type: models.PersonaTypeDNS})
		assert.NoError(t, err)
		assert.Len(t, listed, 3)
		for _, persona := range listed {
			assert.Equal(t, models.PersonaTypeDNS, persona.PersonaType)
		}
	})

	t.Run("filter by type HTTP", func(t *testing.T) {
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{Type: models.PersonaTypeHTTP})
		assert.NoError(t, err)
		assert.Len(t, listed, 2)
		for _, persona := range listed {
			assert.Equal(t, models.PersonaTypeHTTP, persona.PersonaType)
		}
	})

	t.Run("filter by is_enabled true", func(t *testing.T) {
		enabled := true
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{IsEnabled: &enabled})
		assert.NoError(t, err)
		assert.Len(t, listed, 3)
		for _, persona := range listed {
			assert.True(t, persona.IsEnabled)
		}
	})

	t.Run("filter by is_enabled false", func(t *testing.T) {
		disabled := false
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{IsEnabled: &disabled})
		assert.NoError(t, err)
		assert.Len(t, listed, 2)
		for _, persona := range listed {
			assert.False(t, persona.IsEnabled)
		}
	})

	t.Run("filter by type DNS and is_enabled true", func(t *testing.T) {
		enabled := true
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{Type: models.PersonaTypeDNS, IsEnabled: &enabled})
		assert.NoError(t, err)
		assert.Len(t, listed, 2)
		for _, persona := range listed {
			assert.Equal(t, models.PersonaTypeDNS, persona.PersonaType)
			assert.True(t, persona.IsEnabled)
		}
	})

	t.Run("limit and offset", func(t *testing.T) {
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{Limit: 2, Offset: 1})
		assert.NoError(t, err)
		assert.Len(t, listed, 2)
		// Add more specific checks for which items are returned based on default sort order (name ASC)
		// Names for this test: "Another DNS One (Enabled)", "DNS Persona 1 (Enabled)", "DNS Persona 2 (Disabled)", "HTTP Persona 1 (Enabled)", "HTTP Persona 2 (Disabled)"
		// After sorting: "Another DNS One (Enabled)", "DNS Persona 1 (Enabled)", "DNS Persona 2 (Disabled)", "HTTP Persona 1 (Enabled)", "HTTP Persona 2 (Disabled)"
		// Offset 1, Limit 2: "DNS Persona 1 (Enabled)", "DNS Persona 2 (Disabled)"
		assert.Equal(t, "DNS Persona 1 (Enabled)", listed[0].Name)
		assert.Equal(t, "DNS Persona 2 (Disabled)", listed[1].Name)
	})

	t.Run("empty result set", func(t *testing.T) {
		nonExistentType := "non_existent_type"
		listed, err := personaStore.ListPersonas(ctx, testDB, store.ListPersonasFilter{Type: models.PersonaTypeEnum(nonExistentType)})
		assert.NoError(t, err)
		assert.Empty(t, listed)
	})
}

func TestPersonaStore_Transactionality(t *testing.T) {
	if testDB == nil {
		t.Skip("Skipping Postgres tests as TEST_POSTGRES_DSN is not set.")
	}
	personaStore := NewPersonaStorePostgres(testDB)
	ctx := context.Background()

	t.Run("commit transaction", func(t *testing.T) {
		clearPersonasTable(t, testDB)
		tx, err := personaStore.BeginTxx(ctx, nil)
		require.NoError(t, err)

		persona1 := &models.Persona{ID: uuid.New(), Name: "TX Commit 1", PersonaType: models.PersonaTypeDNS, ConfigDetails: json.RawMessage(`{}`), CreatedAt: time.Now(), UpdatedAt: time.Now()}
		err = personaStore.CreatePersona(ctx, tx, persona1) // Use tx as Querier
		require.NoError(t, err)

		persona2 := &models.Persona{ID: uuid.New(), Name: "TX Commit 2", PersonaType: models.PersonaTypeHTTP, ConfigDetails: json.RawMessage(`{}`), CreatedAt: time.Now(), UpdatedAt: time.Now()}
		err = personaStore.CreatePersona(ctx, tx, persona2)
		require.NoError(t, err)

		err = tx.Commit()
		require.NoError(t, err)

		// Verify data is persisted using a new Querier (testDB)
		retrieved1, err := personaStore.GetPersonaByID(ctx, testDB, persona1.ID)
		assert.NoError(t, err)
		assert.NotNil(t, retrieved1)

		retrieved2, err := personaStore.GetPersonaByID(ctx, testDB, persona2.ID)
		assert.NoError(t, err)
		assert.NotNil(t, retrieved2)
	})

	t.Run("rollback transaction", func(t *testing.T) {
		clearPersonasTable(t, testDB)
		tx, err := personaStore.BeginTxx(ctx, nil)
		require.NoError(t, err)

		personaToRollback := &models.Persona{ID: uuid.New(), Name: "TX Rollback", PersonaType: models.PersonaTypeDNS, ConfigDetails: json.RawMessage(`{}`)}
		err = personaStore.CreatePersona(ctx, tx, personaToRollback)
		require.NoError(t, err)

		err = tx.Rollback()
		require.NoError(t, err)

		// Verify data is NOT persisted
		_, err = personaStore.GetPersonaByID(ctx, testDB, personaToRollback.ID)
		assert.ErrorIs(t, err, store.ErrNotFound)
	})
}
