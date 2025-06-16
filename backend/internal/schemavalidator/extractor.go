// Package schemavalidator provides tools for validating database schema against Go models
package schemavalidator

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/jmoiron/sqlx"
)

// TableSchema represents the schema of a database table
type TableSchema struct {
	Name        string
	Columns     []ColumnSchema
	Constraints []ConstraintSchema
	Indexes     []IndexSchema
}

// ColumnSchema represents the schema of a database column
type ColumnSchema struct {
	Name         string
	DataType     string
	IsNullable   bool
	DefaultValue sql.NullString
	IsPrimaryKey bool
}

// ConstraintSchema represents a constraint in the database
type ConstraintSchema struct {
	Name       string
	Type       string // PK, FK, UNIQUE, CHECK
	Columns    []string
	References *ReferenceSchema
}

// ReferenceSchema represents a foreign key reference
type ReferenceSchema struct {
	Table   string
	Columns []string
}

// IndexSchema represents an index in the database
type IndexSchema struct {
	Name     string
	Columns  []string
	IsUnique bool
}

// DatabaseSchema represents the schema of the entire database
type DatabaseSchema struct {
	Tables map[string]TableSchema
}

// SchemaExtractor extracts database schema information
type SchemaExtractor struct {
	db *sqlx.DB
}

// NewSchemaExtractor creates a new SchemaExtractor
func NewSchemaExtractor(db *sqlx.DB) *SchemaExtractor {
	return &SchemaExtractor{db: db}
}

// ExtractDatabaseSchema extracts the schema of the entire database
func (e *SchemaExtractor) ExtractDatabaseSchema(ctx context.Context) (*DatabaseSchema, error) {
	// Get all table names
	tables, err := e.extractTableNames(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to extract table names: %w", err)
	}

	// Create database schema
	schema := &DatabaseSchema{
		Tables: make(map[string]TableSchema),
	}

	// Extract schema for each table
	for _, tableName := range tables {
		tableSchema, err := e.extractTableSchema(ctx, tableName)
		if err != nil {
			return nil, fmt.Errorf("failed to extract schema for table %s: %w", tableName, err)
		}
		schema.Tables[tableName] = *tableSchema
	}

	return schema, nil
}

// extractTableNames extracts all table names from the database
func (e *SchemaExtractor) extractTableNames(ctx context.Context) ([]string, error) {
	query := `
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`

	var tables []string
	err := e.db.SelectContext(ctx, &tables, query)
	if err != nil {
		return nil, err
	}

	return tables, nil
}

// extractTableSchema extracts the schema of a specific table
func (e *SchemaExtractor) extractTableSchema(ctx context.Context, tableName string) (*TableSchema, error) {
	tableSchema := &TableSchema{
		Name: tableName,
	}

	// Extract columns
	columns, err := e.extractColumns(ctx, tableName)
	if err != nil {
		return nil, fmt.Errorf("failed to extract columns for table %s: %w", tableName, err)
	}
	tableSchema.Columns = columns

	// Extract constraints
	constraints, err := e.extractConstraints(ctx, tableName)
	if err != nil {
		return nil, fmt.Errorf("failed to extract constraints for table %s: %w", tableName, err)
	}
	tableSchema.Constraints = constraints

	// Extract indexes
	indexes, err := e.extractIndexes(ctx, tableName)
	if err != nil {
		return nil, fmt.Errorf("failed to extract indexes for table %s: %w", tableName, err)
	}
	tableSchema.Indexes = indexes

	// Update primary key information in columns
	for i := range tableSchema.Columns {
		for _, constraint := range constraints {
			if constraint.Type == "PRIMARY KEY" {
				for _, colName := range constraint.Columns {
					if tableSchema.Columns[i].Name == colName {
						tableSchema.Columns[i].IsPrimaryKey = true
					}
				}
			}
		}
	}

	return tableSchema, nil
}

// extractColumns extracts column information for a table
func (e *SchemaExtractor) extractColumns(ctx context.Context, tableName string) ([]ColumnSchema, error) {
	query := `
		SELECT 
			column_name, 
			data_type,
			is_nullable,
			column_default
		FROM 
			information_schema.columns
		WHERE 
			table_schema = 'public'
			AND table_name = $1
		ORDER BY 
			ordinal_position
	`

	type columnRow struct {
		ColumnName    string         `db:"column_name"`
		DataType      string         `db:"data_type"`
		IsNullable    string         `db:"is_nullable"`
		ColumnDefault sql.NullString `db:"column_default"`
	}

	var rows []columnRow
	err := e.db.SelectContext(ctx, &rows, query, tableName)
	if err != nil {
		return nil, err
	}

	columns := make([]ColumnSchema, len(rows))
	for i, row := range rows {
		columns[i] = ColumnSchema{
			Name:         row.ColumnName,
			DataType:     row.DataType,
			IsNullable:   row.IsNullable == "YES",
			DefaultValue: row.ColumnDefault,
		}
	}

	return columns, nil
}

// extractConstraints extracts constraint information for a table
func (e *SchemaExtractor) extractConstraints(ctx context.Context, tableName string) ([]ConstraintSchema, error) {
	// Query for primary key and unique constraints
	pkUniqueQuery := `
		SELECT
			tc.constraint_name,
			tc.constraint_type,
			array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
		FROM
			information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
		WHERE
			tc.table_schema = 'public'
			AND tc.table_name = $1
			AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
		GROUP BY
			tc.constraint_name, tc.constraint_type
	`

	// Query for foreign key constraints
	fkQuery := `
		SELECT
			tc.constraint_name,
			tc.constraint_type,
			array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns,
			ccu.table_name as referenced_table,
			array_agg(ccu.column_name ORDER BY kcu.ordinal_position) as referenced_columns
		FROM
			information_schema.table_constraints tc
			JOIN information_schema.key_column_usage kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.table_schema = kcu.table_schema
			JOIN information_schema.constraint_column_usage ccu
				ON tc.constraint_name = ccu.constraint_name
				AND tc.table_schema = ccu.table_schema
		WHERE
			tc.table_schema = 'public'
			AND tc.table_name = $1
			AND tc.constraint_type = 'FOREIGN KEY'
		GROUP BY
			tc.constraint_name, tc.constraint_type, ccu.table_name
	`

	// For PostgreSQL arrays, we need to use a string and parse it
	type pkUniqueRow struct {
		ConstraintName string `db:"constraint_name"`
		ConstraintType string `db:"constraint_type"`
		ColumnsStr     string `db:"columns"` // Will parse this into []string
	}

	type fkRow struct {
		ConstraintName       string `db:"constraint_name"`
		ConstraintType       string `db:"constraint_type"`
		ColumnsStr           string `db:"columns"` // Will parse this into []string
		ReferencedTable      string `db:"referenced_table"`
		ReferencedColumnsStr string `db:"referenced_columns"` // Will parse this into []string
	}

	// Helper function to parse PostgreSQL array string into []string
	parseArrayString := func(arrayStr string) []string {
		// Remove the curly braces
		arrayStr = strings.TrimPrefix(arrayStr, "{")
		arrayStr = strings.TrimSuffix(arrayStr, "}")

		// Split by comma
		if arrayStr == "" {
			return []string{}
		}

		parts := strings.Split(arrayStr, ",")

		// Trim quotes and whitespace
		for i, part := range parts {
			parts[i] = strings.Trim(strings.TrimSpace(part), "\"")
		}

		return parts
	}

	var pkUniqueRows []pkUniqueRow
	err := e.db.SelectContext(ctx, &pkUniqueRows, pkUniqueQuery, tableName)
	if err != nil {
		return nil, fmt.Errorf("failed to extract PK/UNIQUE constraints: %w", err)
	}

	var fkRows []fkRow
	err = e.db.SelectContext(ctx, &fkRows, fkQuery, tableName)
	if err != nil {
		return nil, fmt.Errorf("failed to extract FK constraints: %w", err)
	}

	constraints := make([]ConstraintSchema, 0, len(pkUniqueRows)+len(fkRows))

	// Add primary key and unique constraints
	for _, row := range pkUniqueRows {
		columns := parseArrayString(row.ColumnsStr)
		constraints = append(constraints, ConstraintSchema{
			Name:    row.ConstraintName,
			Type:    row.ConstraintType,
			Columns: columns,
		})
	}

	// Add foreign key constraints
	for _, row := range fkRows {
		columns := parseArrayString(row.ColumnsStr)
		referencedColumns := parseArrayString(row.ReferencedColumnsStr)
		constraints = append(constraints, ConstraintSchema{
			Name:    row.ConstraintName,
			Type:    row.ConstraintType,
			Columns: columns,
			References: &ReferenceSchema{
				Table:   row.ReferencedTable,
				Columns: referencedColumns,
			},
		})
	}

	return constraints, nil
}

// extractIndexes extracts index information for a table
func (e *SchemaExtractor) extractIndexes(ctx context.Context, tableName string) ([]IndexSchema, error) {
	query := `
		SELECT
			i.relname as index_name,
			array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns,
			ix.indisunique as is_unique
		FROM
			pg_index ix
			JOIN pg_class i ON i.oid = ix.indexrelid
			JOIN pg_class t ON t.oid = ix.indrelid
			JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
			JOIN pg_namespace n ON n.oid = t.relnamespace
		WHERE
			t.relname = $1
			AND n.nspname = 'public'
			AND NOT ix.indisprimary  -- Exclude primary key indexes as they're covered by constraints
		GROUP BY
			i.relname, ix.indisunique
	`

	type indexRow struct {
		IndexName  string `db:"index_name"`
		ColumnsStr string `db:"columns"` // Will parse this into []string
		IsUnique   bool   `db:"is_unique"`
	}

	// Reuse the parseArrayString function from extractConstraints
	parseArrayString := func(arrayStr string) []string {
		// Remove the curly braces
		arrayStr = strings.TrimPrefix(arrayStr, "{")
		arrayStr = strings.TrimSuffix(arrayStr, "}")

		// Split by comma
		if arrayStr == "" {
			return []string{}
		}

		parts := strings.Split(arrayStr, ",")

		// Trim quotes and whitespace
		for i, part := range parts {
			parts[i] = strings.Trim(strings.TrimSpace(part), "\"")
		}

		return parts
	}

	var rows []indexRow
	err := e.db.SelectContext(ctx, &rows, query, tableName)
	if err != nil {
		return nil, err
	}

	indexes := make([]IndexSchema, len(rows))
	for i, row := range rows {
		columns := parseArrayString(row.ColumnsStr)
		indexes[i] = IndexSchema{
			Name:     row.IndexName,
			Columns:  columns,
			IsUnique: row.IsUnique,
		}
	}

	return indexes, nil
}

// GetColumnDataTypeMapping returns a mapping of PostgreSQL data types to Go types
func GetColumnDataTypeMapping() map[string]string {
	return map[string]string{
		"uuid":                     "uuid.UUID",
		"text":                     "string",
		"character varying":        "string",
		"varchar":                  "string",
		"char":                     "string",
		"integer":                  "int",
		"int":                      "int",
		"smallint":                 "int16",
		"bigint":                   "int64",
		"numeric":                  "float64",
		"decimal":                  "float64",
		"real":                     "float32",
		"double precision":         "float64",
		"boolean":                  "bool",
		"timestamp":                "time.Time",
		"timestamp with time zone": "time.Time",
		"timestamptz":              "time.Time",
		"date":                     "time.Time",
		"time":                     "time.Time",
		"time with time zone":      "time.Time",
		"interval":                 "time.Duration",
		"bytea":                    "[]byte",
		"json":                     "json.RawMessage",
		"jsonb":                    "json.RawMessage",
		"ARRAY":                    "[]interface{}",
		"USER-DEFINED":             "string", // Enum types are typically represented as strings in Go
	}
}

// FormatTableName formats a table name to a Go struct name
func FormatTableName(tableName string) string {
	parts := strings.Split(tableName, "_")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[0:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}

// FormatColumnName formats a column name to a Go field name
func FormatColumnName(columnName string) string {
	parts := strings.Split(columnName, "_")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[0:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}
