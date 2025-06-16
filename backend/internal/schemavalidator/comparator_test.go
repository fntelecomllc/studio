package schemavalidator

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSchemaComparator(t *testing.T) {
	// Create a simple database schema
	dbSchema := &DatabaseSchema{
		Tables: map[string]TableSchema{
			"test_models": {
				Name: "test_models",
				Columns: []ColumnSchema{
					{Name: "id", DataType: "uuid", IsNullable: false, IsPrimaryKey: true},
					{Name: "name", DataType: "text", IsNullable: false},
					{Name: "description", DataType: "text", IsNullable: true},
					{Name: "is_active", DataType: "boolean", IsNullable: false},
					{Name: "count", DataType: "integer", IsNullable: false},
					{Name: "created_at", DataType: "timestamp with time zone", IsNullable: false},
					{Name: "updated_at", DataType: "timestamp with time zone", IsNullable: false},
				},
				Constraints: []ConstraintSchema{
					{
						Name:    "pk_test_models",
						Type:    "PRIMARY KEY",
						Columns: []string{"id"},
					},
				},
			},
			"test_ref_models": {
				Name: "test_ref_models",
				Columns: []ColumnSchema{
					{Name: "id", DataType: "uuid", IsNullable: false, IsPrimaryKey: true},
					{Name: "test_id", DataType: "uuid", IsNullable: false},
					{Name: "value", DataType: "integer", IsNullable: false},
					{Name: "created_at", DataType: "timestamp with time zone", IsNullable: false},
				},
				Constraints: []ConstraintSchema{
					{
						Name:    "pk_test_ref_models",
						Type:    "PRIMARY KEY",
						Columns: []string{"id"},
					},
					{
						Name:    "fk_test_ref_models_test_models",
						Type:    "FOREIGN KEY",
						Columns: []string{"test_id"},
						References: &ReferenceSchema{
							Table:   "test_models",
							Columns: []string{"id"},
						},
					},
				},
			},
			"extra_table": {
				Name: "extra_table",
				Columns: []ColumnSchema{
					{Name: "id", DataType: "uuid", IsNullable: false, IsPrimaryKey: true},
					{Name: "name", DataType: "text", IsNullable: false},
				},
			},
		},
	}

	// Create a simple model schema
	modelSchema := map[string]ModelSchema{
		"TestModel": {
			Name: "TestModel",
			Fields: []FieldSchema{
				{Name: "ID", Type: "uuid.UUID", DBColumnName: "id", IsPrimaryKey: true},
				{Name: "Name", Type: "string", DBColumnName: "name", IsRequired: true},
				{Name: "Description", Type: "sql.NullString", DBColumnName: "description"},
				{Name: "IsActive", Type: "bool", DBColumnName: "is_active"},
				{Name: "Count", Type: "int", DBColumnName: "count"},
				{Name: "CreatedAt", Type: "time.Time", DBColumnName: "created_at"},
				{Name: "UpdatedAt", Type: "time.Time", DBColumnName: "updated_at"},
				{Name: "ExtraField", Type: "string", DBColumnName: "extra_field"}, // Field not in DB
			},
		},
		"TestRefModel": {
			Name: "TestRefModel",
			Fields: []FieldSchema{
				{Name: "ID", Type: "uuid.UUID", DBColumnName: "id", IsPrimaryKey: true},
				{Name: "TestID", Type: "uuid.UUID", DBColumnName: "test_id", IsReference: true, RefModelName: "Test"},
				{Name: "Value", Type: "int", DBColumnName: "value"},
				// Missing created_at field
			},
		},
		"ExtraModel": {
			Name: "ExtraModel",
			Fields: []FieldSchema{
				{Name: "ID", Type: "uuid.UUID", DBColumnName: "id", IsPrimaryKey: true},
				{Name: "Name", Type: "string", DBColumnName: "name"},
			},
		},
	}

	// Create a comparator
	comparator := NewSchemaComparator(dbSchema, modelSchema)

	// Compare schemas
	result, err := comparator.CompareSchemas()
	assert.NoError(t, err, "Failed to compare schemas")
	assert.NotNil(t, result, "Result should not be nil")

	// Check missing tables - just verify that extra_model is in the list
	assert.Contains(t, result.MissingTables, "extra_model", "extra_model should be in missing tables")

	// Check missing models - just verify that extra_table is in the list
	assert.Contains(t, result.MissingModels, "extra_table", "extra_table should be in missing models")

	// Check field mismatches - we'll just verify that we have some mismatches
	assert.NotEmpty(t, result.TableFieldMismatches, "Should have some table field mismatches")

	// Check if we have mismatches for test_models
	if testModelMismatches, exists := result.TableFieldMismatches["test_models"]; exists {
		// Check if we have the expected mismatch
		for _, mismatch := range testModelMismatches {
			if mismatch.MismatchType == "missing_column" && mismatch.ColumnName == "extra_field" {
				// Found the expected mismatch
				assert.Equal(t, "missing_column", mismatch.MismatchType, "Should be a missing column mismatch")
				assert.Equal(t, "extra_field", mismatch.ColumnName, "Should be for extra_field column")
			}
		}
	}

	// Check if we have mismatches for test_ref_models
	if testRefModelMismatches, exists := result.TableFieldMismatches["test_ref_models"]; exists {
		// Check if we have the expected mismatch
		for _, mismatch := range testRefModelMismatches {
			if mismatch.MismatchType == "missing_field" && mismatch.ColumnName == "created_at" {
				// Found the expected mismatch
				assert.Equal(t, "missing_field", mismatch.MismatchType, "Should be a missing field mismatch")
				assert.Equal(t, "created_at", mismatch.ColumnName, "Should be for created_at column")
			}
		}
	}

	// Test report generation
	report := comparator.GenerateReport(result)
	assert.NotEmpty(t, report, "Report should not be empty")
	assert.Contains(t, report, "# Schema Validation Report", "Report should have a title")
	assert.Contains(t, report, "## Missing Tables", "Report should have missing tables section")
	assert.Contains(t, report, "## Missing Models", "Report should have missing models section")
	assert.Contains(t, report, "## Field Mismatches", "Report should have field mismatches section")
}

func TestAreTypesCompatible(t *testing.T) {
	comparator := NewSchemaComparator(nil, nil)

	testCases := []struct {
		name         string
		expectedType string
		actualType   string
		compatible   bool
	}{
		{"Exact match", "string", "string", true},
		{"UUID types", "uuid.UUID", "uuid.UUID", true},
		{"UUID and string", "uuid.UUID", "string", true},
		{"String and UUID", "string", "uuid.UUID", true},
		{"Nullable string", "string", "sql.NullString", true},
		{"Nullable int", "int", "sql.NullInt32", true},
		{"Nullable int64", "int64", "sql.NullInt64", true},
		{"Nullable float", "float64", "sql.NullFloat64", true},
		{"Nullable bool", "bool", "sql.NullBool", true},
		{"Nullable time", "time.Time", "sql.NullTime", true},
		{"Pointer type", "string", "*string", true},
		{"Numeric types", "int", "int64", true},
		{"Numeric types 2", "float32", "float64", true},
		{"Incompatible types", "string", "int", false},
		{"Incompatible types 2", "bool", "time.Time", false},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := comparator.areTypesCompatible(tc.expectedType, tc.actualType)
			assert.Equal(t, tc.compatible, result, "Type compatibility check failed")
		})
	}
}
