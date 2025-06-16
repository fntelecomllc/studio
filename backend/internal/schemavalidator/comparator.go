package schemavalidator

import (
	"fmt"
	"strings"
)

// SchemaComparator compares database schema with Go model definitions
type SchemaComparator struct {
	dbSchema    *DatabaseSchema
	modelSchema map[string]ModelSchema
	typeMapping map[string]string
}

// NewSchemaComparator creates a new SchemaComparator
func NewSchemaComparator(dbSchema *DatabaseSchema, modelSchema map[string]ModelSchema) *SchemaComparator {
	return &SchemaComparator{
		dbSchema:    dbSchema,
		modelSchema: modelSchema,
		typeMapping: GetColumnDataTypeMapping(),
	}
}

// ComparisonResult represents the result of a schema comparison
type ComparisonResult struct {
	MissingTables        []string
	MissingModels        []string
	TableFieldMismatches map[string][]FieldMismatch
}

// FieldMismatch represents a mismatch between a database column and a model field
type FieldMismatch struct {
	ColumnName     string
	FieldName      string
	MismatchType   string // "missing_column", "missing_field", "type_mismatch", "nullable_mismatch"
	DatabaseType   string
	ModelType      string
	DatabaseColumn *ColumnSchema
	ModelField     *FieldSchema
}

// CompareSchemas compares the database schema with the model schema
func (c *SchemaComparator) CompareSchemas() (*ComparisonResult, error) {
	result := &ComparisonResult{
		MissingTables:        make([]string, 0),
		MissingModels:        make([]string, 0),
		TableFieldMismatches: make(map[string][]FieldMismatch),
	}

	// Check for tables that don't have corresponding models
	for tableName := range c.dbSchema.Tables {
		// Skip schema_migrations table as it's managed by the migration tool
		if tableName == "schema_migrations" {
			continue
		}

		// Try to find a model that maps to this table
		modelName := getModelNameForTable(tableName)
		if modelName == "" {
			modelName = FormatTableName(tableName)
		}

		if _, exists := c.modelSchema[modelName]; !exists {
			// Double check with the reverse mapping
			found := false
			for mName := range c.modelSchema {
				if getTableNameForModel(mName) == tableName {
					found = true
					break
				}
			}

			if !found {
				result.MissingModels = append(result.MissingModels, tableName)
			}
		}
	}

	// Check for models that don't have corresponding tables
	for modelName := range c.modelSchema {
		// Try to get the mapped table name first
		tableName := getTableNameForModel(modelName)
		if _, exists := c.dbSchema.Tables[tableName]; !exists {
			result.MissingTables = append(result.MissingTables, tableName)
		}
	}

	// Compare fields for each table-model pair
	for tableName, tableSchema := range c.dbSchema.Tables {
		// Try to find a model that maps to this table
		modelName := getModelNameForTable(tableName)
		if modelName == "" {
			modelName = FormatTableName(tableName)
		}

		modelSchema, exists := c.modelSchema[modelName]
		if !exists {
			continue // Already reported as missing model
		}

		mismatches := c.compareFields(tableName, tableSchema, modelSchema)
		if len(mismatches) > 0 {
			result.TableFieldMismatches[tableName] = mismatches
		}
	}

	// Also check fields for each model-table pair to catch fields in models that don't exist in tables
	for modelName, modelSchema := range c.modelSchema {
		// Try to get the mapped table name first
		tableName := getTableNameForModel(modelName)
		tableSchema, exists := c.dbSchema.Tables[tableName]
		if !exists {
			continue // Already reported as missing table
		}

		// We've already compared this pair above, but we need to ensure we catch fields in models
		// that don't exist in tables, which might have been missed in the previous loop
		mismatches := c.compareFields(tableName, tableSchema, modelSchema)
		if len(mismatches) > 0 {
			// Merge with existing mismatches if any
			if existingMismatches, ok := result.TableFieldMismatches[tableName]; ok {
				// Check if we already have these mismatches
				for _, mismatch := range mismatches {
					found := false
					for _, existing := range existingMismatches {
						if mismatch.ColumnName == existing.ColumnName &&
							mismatch.FieldName == existing.FieldName &&
							mismatch.MismatchType == existing.MismatchType {
							found = true
							break
						}
					}
					if !found {
						result.TableFieldMismatches[tableName] = append(result.TableFieldMismatches[tableName], mismatch)
					}
				}
			} else {
				result.TableFieldMismatches[tableName] = mismatches
			}
		}
	}

	return result, nil
}

// compareFields compares the fields of a table with the fields of a model
func (c *SchemaComparator) compareFields(tableName string, tableSchema TableSchema, modelSchema ModelSchema) []FieldMismatch {
	mismatches := make([]FieldMismatch, 0)

	// Create maps for quick lookup
	columnMap := make(map[string]ColumnSchema)
	for _, column := range tableSchema.Columns {
		columnMap[column.Name] = column
	}

	fieldMap := make(map[string]FieldSchema)
	for _, field := range modelSchema.Fields {
		fieldMap[field.DBColumnName] = field
	}

	// Check for columns that don't have corresponding fields
	for columnName, column := range columnMap {
		if _, exists := fieldMap[columnName]; !exists {
			mismatches = append(mismatches, FieldMismatch{
				ColumnName:     columnName,
				MismatchType:   "missing_field",
				DatabaseType:   column.DataType,
				DatabaseColumn: &column,
			})
		}
	}

	// Check for fields that don't have corresponding columns
	for fieldDBName, field := range fieldMap {
		if _, exists := columnMap[fieldDBName]; !exists {
			// Skip fields that are not actually stored in the database
			if isNonDatabaseField(field.Name, tableName) {
				continue
			}

			mismatches = append(mismatches, FieldMismatch{
				ColumnName:   fieldDBName,
				FieldName:    field.Name,
				MismatchType: "missing_column",
				ModelType:    field.Type,
				ModelField:   &field,
			})
		}
	}

	// Check for type and nullable mismatches
	for columnName, column := range columnMap {
		field, exists := fieldMap[columnName]
		if !exists {
			continue // Already reported as missing field
		}

		// Check type mismatch
		expectedGoType := c.typeMapping[column.DataType]
		if expectedGoType == "" {
			// If we don't have a mapping, use the raw data type
			expectedGoType = column.DataType
		}

		// Handle nullable types
		if column.IsNullable && !strings.HasPrefix(field.Type, "*") &&
			!strings.Contains(field.Type, "Null") && !strings.Contains(field.Type, "sql.") {
			// Field should be nullable but isn't
			mismatches = append(mismatches, FieldMismatch{
				ColumnName:     columnName,
				FieldName:      field.Name,
				MismatchType:   "nullable_mismatch",
				DatabaseType:   column.DataType,
				ModelType:      field.Type,
				DatabaseColumn: &column,
				ModelField:     &field,
			})

			// Provide a suggested fix
			var suggestedFix string
			switch field.Type {
			case "string":
				suggestedFix = "sql.NullString or *string"
			case "int":
				suggestedFix = "sql.NullInt32 or *int"
			case "int64":
				suggestedFix = "sql.NullInt64 or *int64"
			case "float64":
				suggestedFix = "sql.NullFloat64 or *float64"
			case "bool":
				suggestedFix = "sql.NullBool or *bool"
			case "time.Time":
				suggestedFix = "sql.NullTime or *time.Time"
			default:
				suggestedFix = "*" + field.Type
			}

			// Log the suggested fix
			fmt.Printf("Nullable mismatch for %s.%s: Use %s instead of %s\n",
				tableName, columnName, suggestedFix, field.Type)
		}

		// Check type compatibility
		if !c.areTypesCompatible(expectedGoType, field.Type) {
			// Special handling for common type mismatches
			if c.isCommonTypeMismatch(column.DataType, field.Type) {
				// Skip adding this as a mismatch
				continue
			}

			mismatches = append(mismatches, FieldMismatch{
				ColumnName:     columnName,
				FieldName:      field.Name,
				MismatchType:   "type_mismatch",
				DatabaseType:   column.DataType,
				ModelType:      field.Type,
				DatabaseColumn: &column,
				ModelField:     &field,
			})
		}
	}

	return mismatches
}

// areTypesCompatible checks if a Go type is compatible with the expected type from the database
func (c *SchemaComparator) areTypesCompatible(expectedType, actualType string) bool {
	// Exact match
	if expectedType == actualType {
		return true
	}

	// Handle nullable types
	if strings.Contains(actualType, "sql.Null") {
		// Extract the base type from sql.Null* types
		switch actualType {
		case "sql.NullString":
			return expectedType == "string"
		case "sql.NullInt32":
			return expectedType == "int" || expectedType == "int32"
		case "sql.NullInt64":
			return expectedType == "int64"
		case "sql.NullFloat64":
			return expectedType == "float64"
		case "sql.NullBool":
			return expectedType == "bool"
		case "sql.NullTime":
			return expectedType == "time.Time"
		}
	}

	// Handle pointer types
	if strings.HasPrefix(actualType, "*") {
		return c.areTypesCompatible(expectedType, actualType[1:])
	}

	// Handle UUID special case
	if (expectedType == "uuid.UUID" || expectedType == "string") &&
		(actualType == "uuid.UUID" || actualType == "string") {
		return true
	}

	// Handle numeric types
	numericTypes := map[string]bool{
		"int":     true,
		"int32":   true,
		"int64":   true,
		"float32": true,
		"float64": true,
	}
	if numericTypes[expectedType] && numericTypes[actualType] {
		return true
	}

	return false
}

// isNonDatabaseField checks if a field is not actually stored in the database
func isNonDatabaseField(fieldName, tableName string) bool {
	// Fields that are not actually stored in the database
	nonDatabaseFields := map[string]map[string]bool{
		"campaigns": {
			"DomainGenerationParams":      true,
			"DNSValidationParams":         true,
			"HTTPKeywordValidationParams": true,
		},
		"proxies": {
			"InputUsername": true,
			"InputPassword": true,
		},
	}

	if tableFields, ok := nonDatabaseFields[tableName]; ok {
		if tableFields[fieldName] {
			return true
		}
	}

	return false
}

// isCommonTypeMismatch checks if this is a common type mismatch that we can ignore
func (c *SchemaComparator) isCommonTypeMismatch(dbType, goType string) bool {
	// Handle enum types
	if dbType == "text" && (strings.Contains(goType, "Enum") ||
		strings.HasSuffix(goType, "TypeEnum") ||
		strings.HasSuffix(goType, "StatusEnum")) {
		return true
	}

	// Handle JSON fields
	if (dbType == "jsonb" || dbType == "json") && (goType == "json.RawMessage" ||
		goType == "*json.RawMessage" ||
		goType == "[]uint8" ||
		goType == "*[]uint8" ||
		goType == "[]string" ||
		goType == "*[]string" ||
		strings.Contains(goType, "KeywordRule")) {
		return true
	}

	// Handle array fields
	if strings.HasPrefix(dbType, "ARRAY") && (strings.HasPrefix(goType, "[]") ||
		strings.HasPrefix(goType, "*[]")) {
		return true
	}

	// Handle UUID fields
	if dbType == "uuid" && (goType == "uuid.UUID" ||
		goType == "uuid.NullUUID" ||
		goType == "*uuid.UUID") {
		return true
	}

	return false
}

// getTableNameForModel returns the table name for a given model name
// This function should match the logic in schema_validator_wrapper.go
func getTableNameForModel(modelName string) string {
	// Define table name mappings
	tableNameMappings := map[string]string{
		"Persona":    "personas",
		"Proxy":      "proxies",
		"KeywordSet": "keyword_sets",
		// KeywordRule is embedded in KeywordSet as a JSONB array, not a separate table
		// "KeywordRule":                    "keyword_rules",
		"Campaign":                       "campaigns",
		"DomainGenerationCampaignParams": "domain_generation_campaign_params",
		"DomainGenerationConfigState":    "domain_generation_config_states",
		"GeneratedDomain":                "generated_domains",
		"DNSValidationCampaignParams":    "dns_validation_campaign_params",
		"DNSValidationResult":            "dns_validation_results",
		"HTTPKeywordCampaignParams":      "http_keyword_campaign_params",
		"HTTPKeywordResult":              "http_keyword_results",
		"AuditLog":                       "audit_logs",
		"CampaignJob":                    "campaign_jobs",
	}

	tableName, ok := tableNameMappings[modelName]
	if ok {
		return tableName
	}

	// Default to snake_case conversion
	return toSnakeCase(modelName)
}

// getModelNameForTable returns the model name for a given table name
func getModelNameForTable(tableName string) string {
	// Define reverse mappings
	modelNameMappings := map[string]string{
		"personas":     "Persona",
		"proxies":      "Proxy",
		"keyword_sets": "KeywordSet",
		// KeywordRule is embedded in KeywordSet as a JSONB array, not a separate table
		// "keyword_rules":                     "KeywordRule",
		"campaigns":                         "Campaign",
		"domain_generation_campaign_params": "DomainGenerationCampaignParams",
		"domain_generation_config_states":   "DomainGenerationConfigState",
		"generated_domains":                 "GeneratedDomain",
		"dns_validation_campaign_params":    "DNSValidationCampaignParams",
		"dns_validation_results":            "DNSValidationResult",
		"http_keyword_campaign_params":      "HTTPKeywordCampaignParams",
		"http_keyword_results":              "HTTPKeywordResult",
		"audit_logs":                        "AuditLog",
		"campaign_jobs":                     "CampaignJob",
	}

	modelName, ok := modelNameMappings[tableName]
	if ok {
		return modelName
	}

	return ""
}

// GenerateReport generates a human-readable report of the comparison result
func (c *SchemaComparator) GenerateReport(result *ComparisonResult) string {
	var report strings.Builder

	report.WriteString("# Schema Validation Report\n\n")

	// Missing tables
	if len(result.MissingTables) > 0 {
		report.WriteString("## Missing Tables\n\n")
		report.WriteString("These models don't have corresponding tables in the database:\n\n")
		for _, table := range result.MissingTables {
			report.WriteString(fmt.Sprintf("- %s\n", table))
		}
		report.WriteString("\n")
	}

	// Missing models
	if len(result.MissingModels) > 0 {
		report.WriteString("## Missing Models\n\n")
		report.WriteString("These tables don't have corresponding models in the code:\n\n")
		for _, model := range result.MissingModels {
			report.WriteString(fmt.Sprintf("- %s\n", model))
		}
		report.WriteString("\n")
	}

	// Field mismatches
	if len(result.TableFieldMismatches) > 0 {
		report.WriteString("## Field Mismatches\n\n")

		for table, mismatches := range result.TableFieldMismatches {
			report.WriteString(fmt.Sprintf("### Table: %s\n\n", table))

			// Group mismatches by type
			missingColumns := make([]FieldMismatch, 0)
			missingFields := make([]FieldMismatch, 0)
			typeMismatches := make([]FieldMismatch, 0)
			nullableMismatches := make([]FieldMismatch, 0)

			for _, mismatch := range mismatches {
				switch mismatch.MismatchType {
				case "missing_column":
					missingColumns = append(missingColumns, mismatch)
				case "missing_field":
					missingFields = append(missingFields, mismatch)
				case "type_mismatch":
					typeMismatches = append(typeMismatches, mismatch)
				case "nullable_mismatch":
					nullableMismatches = append(nullableMismatches, mismatch)
				}
			}

			// Missing columns
			if len(missingColumns) > 0 {
				report.WriteString("#### Missing Columns\n\n")
				report.WriteString("These fields in the model don't have corresponding columns in the database:\n\n")
				report.WriteString("| Field | Type |\n")
				report.WriteString("|-------|------|\n")
				for _, mismatch := range missingColumns {
					report.WriteString(fmt.Sprintf("| %s | %s |\n", mismatch.FieldName, mismatch.ModelType))
				}
				report.WriteString("\n")
			}

			// Missing fields
			if len(missingFields) > 0 {
				report.WriteString("#### Missing Fields\n\n")
				report.WriteString("These columns in the database don't have corresponding fields in the model:\n\n")
				report.WriteString("| Column | Type |\n")
				report.WriteString("|--------|------|\n")
				for _, mismatch := range missingFields {
					report.WriteString(fmt.Sprintf("| %s | %s |\n", mismatch.ColumnName, mismatch.DatabaseType))
				}
				report.WriteString("\n")
			}

			// Type mismatches
			if len(typeMismatches) > 0 {
				report.WriteString("#### Type Mismatches\n\n")
				report.WriteString("These fields have type mismatches between the database and the model:\n\n")
				report.WriteString("| Column | Field | Database Type | Model Type |\n")
				report.WriteString("|--------|-------|---------------|------------|\n")
				for _, mismatch := range typeMismatches {
					report.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n",
						mismatch.ColumnName, mismatch.FieldName, mismatch.DatabaseType, mismatch.ModelType))
				}
				report.WriteString("\n")
			}

			// Nullable mismatches
			if len(nullableMismatches) > 0 {
				report.WriteString("#### Nullable Mismatches\n\n")
				report.WriteString("These fields have nullable mismatches between the database and the model:\n\n")
				report.WriteString("| Column | Field | Database Type | Model Type | Suggested Fix |\n")
				report.WriteString("|--------|-------|---------------|------------|---------------|\n")
				for _, mismatch := range nullableMismatches {
					var suggestedFix string
					switch mismatch.ModelType {
					case "string":
						suggestedFix = "sql.NullString or *string"
					case "int":
						suggestedFix = "sql.NullInt32 or *int"
					case "int64":
						suggestedFix = "sql.NullInt64 or *int64"
					case "float64":
						suggestedFix = "sql.NullFloat64 or *float64"
					case "bool":
						suggestedFix = "sql.NullBool or *bool"
					case "time.Time":
						suggestedFix = "sql.NullTime or *time.Time"
					default:
						suggestedFix = "*" + mismatch.ModelType
					}

					report.WriteString(fmt.Sprintf("| %s | %s | %s (nullable) | %s | %s |\n",
						mismatch.ColumnName, mismatch.FieldName, mismatch.DatabaseType,
						mismatch.ModelType, suggestedFix))
				}
				report.WriteString("\n")
			}
		}
	}

	// No issues found
	if len(result.MissingTables) == 0 && len(result.MissingModels) == 0 && len(result.TableFieldMismatches) == 0 {
		report.WriteString("## No Issues Found\n\n")
		report.WriteString("The database schema and Go models are in sync.\n")
	}

	return report.String()
}
