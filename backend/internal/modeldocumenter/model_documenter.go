package modeldocumenter

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/schemavalidator"
	"github.com/jmoiron/sqlx"
)

// ModelDocumenter generates documentation for data models
type ModelDocumenter struct {
	db *sqlx.DB
}

// TableInfo contains information about a database table
type TableInfo struct {
	Name        string
	Description string
	Columns     []ColumnInfo
	Indexes     []IndexInfo
	ForeignKeys []ForeignKeyInfo
}

// ColumnInfo contains information about a database column
type ColumnInfo struct {
	Name        string
	Type        string
	Nullable    bool
	PrimaryKey  bool
	Description string
	Default     string
}

// IndexInfo contains information about a database index
type IndexInfo struct {
	Name    string
	Columns []string
	Unique  bool
}

// ForeignKeyInfo contains information about a foreign key
type ForeignKeyInfo struct {
	Name              string
	Columns           []string
	ReferencedTable   string
	ReferencedColumns []string
}

// NewModelDocumenter creates a new ModelDocumenter
func NewModelDocumenter(db *sqlx.DB) *ModelDocumenter {
	return &ModelDocumenter{
		db: db,
	}
}

// GenerateDocumentation generates documentation for all models
func (d *ModelDocumenter) GenerateDocumentation() (string, error) {
	ctx := context.Background()

	// Get database schema
	extractor := schemavalidator.NewSchemaExtractor(d.db)
	dbSchema, err := extractor.ExtractDatabaseSchema(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to extract database schema: %w", err)
	}

	// Build model map
	modelMap := buildModelMap()

	// Create reflector
	reflector := schemavalidator.NewModelReflector(modelMap)
	modelSchemas, err := reflector.ExtractModelSchemas()
	if err != nil {
		return "", fmt.Errorf("failed to extract model schemas: %w", err)
	}

	// Generate table info
	tables, err := d.generateTableInfo(ctx, dbSchema.Tables, modelSchemas)
	if err != nil {
		return "", fmt.Errorf("failed to generate table info: %w", err)
	}

	// Generate documentation
	return d.generateMarkdownDocumentation(tables), nil
}

// generateTableInfo generates information about database tables
func (d *ModelDocumenter) generateTableInfo(ctx context.Context, dbSchema map[string]schemavalidator.TableSchema, modelSchemas map[string]schemavalidator.ModelSchema) ([]TableInfo, error) {
	var tables []TableInfo

	// Get table descriptions
	tableDescriptions, err := d.getTableDescriptions(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get table descriptions: %w", err)
	}

	// Get column descriptions
	columnDescriptions, err := d.getColumnDescriptions(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get column descriptions: %w", err)
	}

	// Get indexes
	indexes, err := d.getIndexes(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get indexes: %w", err)
	}

	// Get foreign keys
	foreignKeys, err := d.getForeignKeys(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get foreign keys: %w", err)
	}

	// Process each table
	for tableName, tableSchema := range dbSchema {
		table := TableInfo{
			Name:        tableName,
			Description: tableDescriptions[tableName],
		}

		// Process columns
		for _, column := range tableSchema.Columns {
			columnInfo := ColumnInfo{
				Name:        column.Name,
				Type:        column.DataType,
				Nullable:    column.IsNullable,
				PrimaryKey:  column.IsPrimaryKey,
				Description: columnDescriptions[tableName+"."+column.Name],
				Default:     column.DefaultValue.String,
			}
			table.Columns = append(table.Columns, columnInfo)
		}

		// Sort columns (primary key first, then alphabetically)
		sort.Slice(table.Columns, func(i, j int) bool {
			if table.Columns[i].PrimaryKey && !table.Columns[j].PrimaryKey {
				return true
			}
			if !table.Columns[i].PrimaryKey && table.Columns[j].PrimaryKey {
				return false
			}
			return table.Columns[i].Name < table.Columns[j].Name
		})

		// Add indexes
		if tableIndexes, ok := indexes[tableName]; ok {
			table.Indexes = tableIndexes
		}

		// Add foreign keys
		if tableForeignKeys, ok := foreignKeys[tableName]; ok {
			table.ForeignKeys = tableForeignKeys
		}

		tables = append(tables, table)
	}

	// Sort tables alphabetically
	sort.Slice(tables, func(i, j int) bool {
		return tables[i].Name < tables[j].Name
	})

	return tables, nil
}

// getTableDescriptions gets descriptions for all tables
func (d *ModelDocumenter) getTableDescriptions(ctx context.Context) (map[string]string, error) {
	descriptions := make(map[string]string)

	// Query table descriptions from PostgreSQL
	query := `
		SELECT 
			c.relname AS table_name,
			pg_catalog.obj_description(c.oid, 'pg_class') AS description
		FROM 
			pg_catalog.pg_class c
		JOIN 
			pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE 
			c.relkind = 'r'
			AND n.nspname = 'public'
			AND pg_catalog.obj_description(c.oid, 'pg_class') IS NOT NULL
	`

	type tableDescription struct {
		TableName   string `db:"table_name"`
		Description string `db:"description"`
	}

	var results []tableDescription
	err := d.db.SelectContext(ctx, &results, query)
	if err != nil {
		return nil, err
	}

	for _, result := range results {
		descriptions[result.TableName] = result.Description
	}

	return descriptions, nil
}

// getColumnDescriptions gets descriptions for all columns
func (d *ModelDocumenter) getColumnDescriptions(ctx context.Context) (map[string]string, error) {
	descriptions := make(map[string]string)

	// Query column descriptions from PostgreSQL
	query := `
		SELECT 
			c.table_name,
			c.column_name,
			pgd.description
		FROM 
			pg_catalog.pg_statio_all_tables AS st
		JOIN 
			pg_catalog.pg_description pgd ON pgd.objoid = st.relid
		JOIN 
			information_schema.columns c ON 
				pgd.objsubid = c.ordinal_position AND
				c.table_schema = st.schemaname AND
				c.table_name = st.relname
		WHERE 
			c.table_schema = 'public'
	`

	type columnDescription struct {
		TableName   string `db:"table_name"`
		ColumnName  string `db:"column_name"`
		Description string `db:"description"`
	}

	var results []columnDescription
	err := d.db.SelectContext(ctx, &results, query)
	if err != nil {
		return nil, err
	}

	for _, result := range results {
		key := result.TableName + "." + result.ColumnName
		descriptions[key] = result.Description
	}

	return descriptions, nil
}

// getIndexes gets all indexes for all tables
func (d *ModelDocumenter) getIndexes(ctx context.Context) (map[string][]IndexInfo, error) {
	indexes := make(map[string][]IndexInfo)

	// Query indexes from PostgreSQL
	query := `
		SELECT
			t.relname AS table_name,
			i.relname AS index_name,
			a.attname AS column_name,
			ix.indisunique AS is_unique
		FROM
			pg_class t,
			pg_class i,
			pg_index ix,
			pg_attribute a
		WHERE
			t.oid = ix.indrelid
			AND i.oid = ix.indexrelid
			AND a.attrelid = t.oid
			AND a.attnum = ANY(ix.indkey)
			AND t.relkind = 'r'
			AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
		ORDER BY
			t.relname,
			i.relname,
			a.attnum
	`

	type indexRow struct {
		TableName  string `db:"table_name"`
		IndexName  string `db:"index_name"`
		ColumnName string `db:"column_name"`
		IsUnique   bool   `db:"is_unique"`
	}

	var results []indexRow
	err := d.db.SelectContext(ctx, &results, query)
	if err != nil {
		return nil, err
	}

	// Group by table and index
	indexMap := make(map[string]map[string]*IndexInfo)
	for _, row := range results {
		if _, ok := indexMap[row.TableName]; !ok {
			indexMap[row.TableName] = make(map[string]*IndexInfo)
		}

		if _, ok := indexMap[row.TableName][row.IndexName]; !ok {
			indexMap[row.TableName][row.IndexName] = &IndexInfo{
				Name:   row.IndexName,
				Unique: row.IsUnique,
			}
		}

		indexMap[row.TableName][row.IndexName].Columns = append(
			indexMap[row.TableName][row.IndexName].Columns,
			row.ColumnName,
		)
	}

	// Convert to result format
	for tableName, tableIndexes := range indexMap {
		var indexList []IndexInfo
		for _, idx := range tableIndexes {
			indexList = append(indexList, *idx)
		}
		indexes[tableName] = indexList
	}

	return indexes, nil
}

// getForeignKeys gets all foreign keys for all tables
func (d *ModelDocumenter) getForeignKeys(ctx context.Context) (map[string][]ForeignKeyInfo, error) {
	foreignKeys := make(map[string][]ForeignKeyInfo)

	// Query foreign keys from PostgreSQL
	query := `
		SELECT
			tc.table_name,
			kcu.column_name,
			ccu.table_name AS referenced_table,
			ccu.column_name AS referenced_column,
			tc.constraint_name
		FROM
			information_schema.table_constraints tc
		JOIN
			information_schema.key_column_usage kcu ON
				tc.constraint_name = kcu.constraint_name AND
				tc.table_schema = kcu.table_schema
		JOIN
			information_schema.constraint_column_usage ccu ON
				ccu.constraint_name = tc.constraint_name AND
				ccu.table_schema = tc.table_schema
		WHERE
			tc.constraint_type = 'FOREIGN KEY'
			AND tc.table_schema = 'public'
		ORDER BY
			tc.table_name,
			tc.constraint_name,
			kcu.ordinal_position
	`

	type foreignKeyRow struct {
		TableName        string `db:"table_name"`
		ColumnName       string `db:"column_name"`
		ReferencedTable  string `db:"referenced_table"`
		ReferencedColumn string `db:"referenced_column"`
		ConstraintName   string `db:"constraint_name"`
	}

	var results []foreignKeyRow
	err := d.db.SelectContext(ctx, &results, query)
	if err != nil {
		return nil, err
	}

	// Group by table and constraint
	fkMap := make(map[string]map[string]*ForeignKeyInfo)
	for _, row := range results {
		if _, ok := fkMap[row.TableName]; !ok {
			fkMap[row.TableName] = make(map[string]*ForeignKeyInfo)
		}

		if _, ok := fkMap[row.TableName][row.ConstraintName]; !ok {
			fkMap[row.TableName][row.ConstraintName] = &ForeignKeyInfo{
				Name:            row.ConstraintName,
				ReferencedTable: row.ReferencedTable,
			}
		}

		fkMap[row.TableName][row.ConstraintName].Columns = append(
			fkMap[row.TableName][row.ConstraintName].Columns,
			row.ColumnName,
		)

		fkMap[row.TableName][row.ConstraintName].ReferencedColumns = append(
			fkMap[row.TableName][row.ConstraintName].ReferencedColumns,
			row.ReferencedColumn,
		)
	}

	// Convert to result format
	for tableName, tableFKs := range fkMap {
		var fkList []ForeignKeyInfo
		for _, fk := range tableFKs {
			fkList = append(fkList, *fk)
		}
		foreignKeys[tableName] = fkList
	}

	return foreignKeys, nil
}

// generateMarkdownDocumentation generates markdown documentation for tables
func (d *ModelDocumenter) generateMarkdownDocumentation(tables []TableInfo) string {
	var doc strings.Builder

	// Add header
	doc.WriteString("# Data Model Documentation\n\n")
	doc.WriteString(fmt.Sprintf("Generated: %s\n\n", time.Now().Format(time.RFC3339)))

	// Add table of contents
	doc.WriteString("## Table of Contents\n\n")
	for _, table := range tables {
		doc.WriteString(fmt.Sprintf("- [%s](#%s)\n", table.Name, strings.ToLower(table.Name)))
	}
	doc.WriteString("\n")

	// Add tables
	for _, table := range tables {
		doc.WriteString(fmt.Sprintf("## %s\n\n", table.Name))

		if table.Description != "" {
			doc.WriteString(fmt.Sprintf("%s\n\n", table.Description))
		}

		// Add columns
		doc.WriteString("### Columns\n\n")
		doc.WriteString("| Name | Type | Nullable | Primary Key | Default | Description |\n")
		doc.WriteString("|------|------|----------|-------------|---------|-------------|\n")
		for _, column := range table.Columns {
			primaryKey := "No"
			if column.PrimaryKey {
				primaryKey = "Yes"
			}
			nullable := "No"
			if column.Nullable {
				nullable = "Yes"
			}
			doc.WriteString(fmt.Sprintf("| %s | %s | %s | %s | %s | %s |\n",
				column.Name,
				column.Type,
				nullable,
				primaryKey,
				column.Default,
				column.Description,
			))
		}
		doc.WriteString("\n")

		// Add indexes
		if len(table.Indexes) > 0 {
			doc.WriteString("### Indexes\n\n")
			doc.WriteString("| Name | Columns | Unique |\n")
			doc.WriteString("|------|---------|--------|\n")
			for _, index := range table.Indexes {
				unique := "No"
				if index.Unique {
					unique = "Yes"
				}
				doc.WriteString(fmt.Sprintf("| %s | %s | %s |\n",
					index.Name,
					strings.Join(index.Columns, ", "),
					unique,
				))
			}
			doc.WriteString("\n")
		}

		// Add foreign keys
		if len(table.ForeignKeys) > 0 {
			doc.WriteString("### Foreign Keys\n\n")
			doc.WriteString("| Name | Columns | Referenced Table | Referenced Columns |\n")
			doc.WriteString("|------|---------|------------------|-------------------|\n")
			for _, fk := range table.ForeignKeys {
				doc.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n",
					fk.Name,
					strings.Join(fk.Columns, ", "),
					fk.ReferencedTable,
					strings.Join(fk.ReferencedColumns, ", "),
				))
			}
			doc.WriteString("\n")
		}

		// Add corresponding Go model
		modelName := getModelNameForTable(table.Name)
		if modelName != "" {
			doc.WriteString("### Go Model\n\n")
			doc.WriteString(fmt.Sprintf("This table corresponds to the `%s` struct in the `models` package.\n\n", modelName))
		}

		doc.WriteString("---\n\n")
	}

	return doc.String()
}

// getModelNameForTable returns the Go model name for a given table name
func getModelNameForTable(tableName string) string {
	// Define table to model mappings
	tableToModel := map[string]string{
		"personas":                          "Persona",
		"proxies":                           "Proxy",
		"keyword_sets":                      "KeywordSet",
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

	return tableToModel[tableName]
}

// buildModelMap builds a map of model names to model instances
func buildModelMap() map[string]interface{} {
	modelMap := make(map[string]interface{})

	// Add all models from the models package
	modelMap["Campaign"] = &models.Campaign{}
	modelMap["Persona"] = &models.Persona{}
	modelMap["Proxy"] = &models.Proxy{}
	modelMap["KeywordSet"] = &models.KeywordSet{}
	modelMap["GeneratedDomain"] = &models.GeneratedDomain{}
	modelMap["DNSValidationResult"] = &models.DNSValidationResult{}
	modelMap["HTTPKeywordResult"] = &models.HTTPKeywordResult{}
	modelMap["AuditLog"] = &models.AuditLog{}
	modelMap["CampaignJob"] = &models.CampaignJob{}
	modelMap["DomainGenerationCampaignParams"] = &models.DomainGenerationCampaignParams{}
	modelMap["DNSValidationCampaignParams"] = &models.DNSValidationCampaignParams{}
	modelMap["HTTPKeywordCampaignParams"] = &models.HTTPKeywordCampaignParams{}
	modelMap["DomainGenerationConfigState"] = &models.DomainGenerationConfigState{}

	return modelMap
}
