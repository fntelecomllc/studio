package schemavalidator

import (
	"database/sql"
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// TestModel is a test struct for the reflector
type TestModel struct {
	ID          uuid.UUID      `db:"id" json:"id"`
	Name        string         `db:"name" json:"name" validate:"required"`
	Description sql.NullString `db:"description" json:"description,omitempty"`
	IsActive    bool           `db:"is_active" json:"isActive"`
	Count       int            `db:"count" json:"count"`
	CreatedAt   time.Time      `db:"created_at" json:"createdAt"`
	UpdatedAt   time.Time      `db:"updated_at" json:"updatedAt"`
}

// TestRefModel is a test struct with a reference to TestModel
type TestRefModel struct {
	ID        uuid.UUID `db:"id" json:"id"`
	TestID    uuid.UUID `db:"test_id" json:"testId"`
	Value     int       `db:"value" json:"value"`
	CreatedAt time.Time `db:"created_at" json:"createdAt"`
}

func TestModelReflector(t *testing.T) {
	// Create a map of models
	models := map[string]interface{}{
		"TestModel":    &TestModel{},
		"TestRefModel": &TestRefModel{},
	}

	// Create a reflector
	reflector := NewModelReflector(models)

	// Extract model schemas
	schemas, err := reflector.ExtractModelSchemas()
	assert.NoError(t, err, "Failed to extract model schemas")
	assert.NotNil(t, schemas, "Schemas should not be nil")
	assert.Len(t, schemas, 2, "Should have extracted 2 schemas")

	// Check TestModel schema
	testModelSchema, exists := schemas["TestModel"]
	assert.True(t, exists, "TestModel schema should exist")
	assert.Equal(t, "TestModel", testModelSchema.Name, "Schema name should match")
	assert.Len(t, testModelSchema.Fields, 7, "TestModel should have 7 fields")

	// Check field details
	var idField, nameField, descField, activeField, countField *FieldSchema
	for i, field := range testModelSchema.Fields {
		switch field.Name {
		case "ID":
			idField = &testModelSchema.Fields[i]
		case "Name":
			nameField = &testModelSchema.Fields[i]
		case "Description":
			descField = &testModelSchema.Fields[i]
		case "IsActive":
			activeField = &testModelSchema.Fields[i]
		case "Count":
			countField = &testModelSchema.Fields[i]
		case "CreatedAt", "UpdatedAt":
			// We don't need to check these fields specifically
		}
	}

	// Verify field properties
	assert.NotNil(t, idField, "ID field should exist")
	assert.Equal(t, "uuid.UUID", idField.Type, "ID field should be UUID type")
	assert.Equal(t, "id", idField.DBColumnName, "ID field should map to id column")
	assert.True(t, idField.IsPrimaryKey, "ID field should be primary key")

	assert.NotNil(t, nameField, "Name field should exist")
	assert.Equal(t, "string", nameField.Type, "Name field should be string type")
	assert.Equal(t, "name", nameField.DBColumnName, "Name field should map to name column")
	assert.True(t, nameField.IsRequired, "Name field should be required")

	assert.NotNil(t, descField, "Description field should exist")
	assert.Equal(t, "sql.NullString", descField.Type, "Description field should be NullString type")
	assert.Equal(t, "description", descField.DBColumnName, "Description field should map to description column")
	assert.False(t, descField.IsRequired, "Description field should not be required")

	assert.NotNil(t, activeField, "IsActive field should exist")
	assert.Equal(t, "bool", activeField.Type, "IsActive field should be bool type")
	assert.Equal(t, "is_active", activeField.DBColumnName, "IsActive field should map to is_active column")

	assert.NotNil(t, countField, "Count field should exist")
	assert.Equal(t, "int", countField.Type, "Count field should be int type")
	assert.Equal(t, "count", countField.DBColumnName, "Count field should map to count column")

	// Check TestRefModel schema
	testRefModelSchema, exists := schemas["TestRefModel"]
	assert.True(t, exists, "TestRefModel schema should exist")
	assert.Equal(t, "TestRefModel", testRefModelSchema.Name, "Schema name should match")
	assert.Len(t, testRefModelSchema.Fields, 4, "TestRefModel should have 4 fields")

	// Check reference field
	var testIDField *FieldSchema
	for i, field := range testRefModelSchema.Fields {
		if field.Name == "TestID" {
			testIDField = &testRefModelSchema.Fields[i]
			break
		}
	}

	assert.NotNil(t, testIDField, "TestID field should exist")
	assert.Equal(t, "uuid.UUID", testIDField.Type, "TestID field should be UUID type")
	assert.Equal(t, "test_id", testIDField.DBColumnName, "TestID field should map to test_id column")
	assert.True(t, testIDField.IsReference, "TestID field should be a reference")
	assert.Equal(t, "Test", testIDField.RefModelName, "TestID field should reference Test model")
}

func TestGetFieldTypeName(t *testing.T) {
	// We don't need to create an actual reflector instance for this test

	// Test various types
	testCases := []struct {
		value    interface{}
		expected string
	}{
		{uuid.UUID{}, "uuid.UUID"},
		{"string", "string"},
		{123, "int"},
		{true, "bool"},
		{time.Time{}, "time.Time"},
		{sql.NullString{}, "sql.NullString"},
		{[]string{}, "[]string"},
		{map[string]int{}, "map[string]int"},
		{struct{}{}, "struct{}"},
	}

	for _, tc := range testCases {
		t.Run(tc.expected, func(t *testing.T) {
			typeName := getFieldTypeName(reflect.TypeOf(tc.value))
			assert.Equal(t, tc.expected, typeName)
		})
	}
}

func TestToSnakeCase(t *testing.T) {
	testCases := []struct {
		input    string
		expected string
	}{
		{"ID", "id"},
		{"UserID", "user_id"},
		{"FirstName", "first_name"},
		{"IsActive", "is_active"},
		{"CreatedAt", "created_at"},
	}

	for _, tc := range testCases {
		t.Run(tc.input, func(t *testing.T) {
			result := toSnakeCase(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}

func TestFormatSnakeCaseToCamelCase(t *testing.T) {
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
			result := formatSnakeCaseToCamelCase(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}
