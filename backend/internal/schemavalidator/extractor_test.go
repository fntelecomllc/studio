package schemavalidator

import (
	"context"
	"os"
	"testing"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSchemaExtractor(t *testing.T) {
	// Skip if no database connection is available
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("Skipping schema extractor test: TEST_POSTGRES_DSN environment variable not set")
	}

	// Connect to the database
	db, err := sqlx.Connect("postgres", dsn)
	require.NoError(t, err, "Failed to connect to test database")
	defer db.Close()

	// Create a test table
	_, err = db.Exec(`
		DROP TABLE IF EXISTS schema_validator_test;
		CREATE TABLE schema_validator_test (
			id UUID PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			is_active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
		);
		
		CREATE INDEX idx_schema_validator_test_name ON schema_validator_test(name);
		
		DROP TABLE IF EXISTS schema_validator_ref_test;
		CREATE TABLE schema_validator_ref_test (
			id UUID PRIMARY KEY,
			test_id UUID NOT NULL REFERENCES schema_validator_test(id) ON DELETE CASCADE,
			value INTEGER NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
		);
	`)
	require.NoError(t, err, "Failed to create test tables")

	// Clean up after the test
	defer func() {
		_, err := db.Exec(`
			DROP TABLE IF EXISTS schema_validator_ref_test;
			DROP TABLE IF EXISTS schema_validator_test;
		`)
		if err != nil {
			t.Logf("Failed to clean up test tables: %v", err)
		}
	}()

	// Create a schema extractor
	extractor := NewSchemaExtractor(db)

	// Extract the schema
	ctx := context.Background()
	schema, err := extractor.ExtractDatabaseSchema(ctx)
	require.NoError(t, err, "Failed to extract database schema")

	// Verify the schema
	assert.NotNil(t, schema, "Schema should not be nil")
	assert.NotNil(t, schema.Tables, "Tables should not be nil")

	// Check if our test tables are in the schema
	testTable, exists := schema.Tables["schema_validator_test"]
	assert.True(t, exists, "schema_validator_test table should exist in schema")

	refTable, exists := schema.Tables["schema_validator_ref_test"]
	assert.True(t, exists, "schema_validator_ref_test table should exist in schema")

	// Check columns in test table
	assert.Equal(t, "schema_validator_test", testTable.Name, "Table name should match")
	assert.Len(t, testTable.Columns, 6, "Test table should have 6 columns")

	// Check column details
	var idColumn, nameColumn, descColumn, activeColumn *ColumnSchema
	for i, col := range testTable.Columns {
		switch col.Name {
		case "id":
			idColumn = &testTable.Columns[i]
		case "name":
			nameColumn = &testTable.Columns[i]
		case "description":
			descColumn = &testTable.Columns[i]
		case "is_active":
			activeColumn = &testTable.Columns[i]
		case "created_at", "updated_at":
			// We don't need to check these columns specifically
		}
	}

	// Verify column properties
	assert.NotNil(t, idColumn, "id column should exist")
	assert.Equal(t, "uuid", idColumn.DataType, "id column should be UUID type")
	assert.True(t, idColumn.IsPrimaryKey, "id column should be primary key")
	assert.False(t, idColumn.IsNullable, "id column should not be nullable")

	assert.NotNil(t, nameColumn, "name column should exist")
	assert.Equal(t, "text", nameColumn.DataType, "name column should be TEXT type")
	assert.False(t, nameColumn.IsNullable, "name column should not be nullable")

	assert.NotNil(t, descColumn, "description column should exist")
	assert.Equal(t, "text", descColumn.DataType, "description column should be TEXT type")
	assert.True(t, descColumn.IsNullable, "description column should be nullable")

	assert.NotNil(t, activeColumn, "is_active column should exist")
	assert.Equal(t, "boolean", activeColumn.DataType, "is_active column should be BOOLEAN type")
	assert.False(t, activeColumn.IsNullable, "is_active column should not be nullable")

	// Check constraints
	foundPK := false
	for _, constraint := range testTable.Constraints {
		if constraint.Type == "PRIMARY KEY" {
			foundPK = true
			assert.Contains(t, constraint.Columns, "id", "Primary key should include id column")
		}
	}
	assert.True(t, foundPK, "Should have found a primary key constraint")

	// Check indexes
	foundNameIndex := false
	for _, index := range testTable.Indexes {
		if index.Name == "idx_schema_validator_test_name" {
			foundNameIndex = true
			assert.Contains(t, index.Columns, "name", "Name index should include name column")
			assert.False(t, index.IsUnique, "Name index should not be unique")
		}
	}
	assert.True(t, foundNameIndex, "Should have found name index")

	// Check foreign key in ref table
	foundFK := false
	for _, constraint := range refTable.Constraints {
		if constraint.Type == "FOREIGN KEY" {
			foundFK = true
			assert.Contains(t, constraint.Columns, "test_id", "Foreign key should include test_id column")
			assert.NotNil(t, constraint.References, "Foreign key should have references")
			assert.Equal(t, "schema_validator_test", constraint.References.Table, "Foreign key should reference schema_validator_test table")
			assert.Contains(t, constraint.References.Columns, "id", "Foreign key should reference id column")
		}
	}
	assert.True(t, foundFK, "Should have found a foreign key constraint")
}

func TestFormatTableName(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"users", "Users"},
		{"user_profiles", "UserProfiles"},
		{"campaign_jobs", "CampaignJobs"},
		{"dns_validation_results", "DnsValidationResults"},
		{"http_keyword_results", "HttpKeywordResults"},
	}

	for _, tc := range testCases {
		t.Run(tc.input, func(t *testing.T) {
			result := FormatTableName(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestFormatColumnName(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"id", "Id"},
		{"user_id", "UserId"},
		{"first_name", "FirstName"},
		{"is_active", "IsActive"},
		{"created_at", "CreatedAt"},
	}

	for _, tc := range testCases {
		t.Run(tc.input, func(t *testing.T) {
			result := FormatColumnName(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestGetColumnDataTypeMapping(t *testing.T) {
	mapping := GetColumnDataTypeMapping()

	// Check a few key mappings
	assert.Equal(t, "uuid.UUID", mapping["uuid"])
	assert.Equal(t, "string", mapping["text"])
	assert.Equal(t, "int", mapping["integer"])
	assert.Equal(t, "bool", mapping["boolean"])
	assert.Equal(t, "time.Time", mapping["timestamp with time zone"])
	assert.Equal(t, "json.RawMessage", mapping["jsonb"])
}
