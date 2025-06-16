package schemavalidator

import (
	"context"
	"fmt"
	"os"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/jmoiron/sqlx"
)

// ModelWrapper combines the functionality of SchemaExtractor, ModelReflector, and SchemaComparator
type ModelWrapper struct {
	db *sqlx.DB
}

// NewModelWrapper creates a new ModelWrapper
func NewModelWrapper(db *sqlx.DB) *ModelWrapper {
	return &ModelWrapper{
		db: db,
	}
}

// ValidateSchema validates the database schema against the Go models and generates a report
func (w *ModelWrapper) ValidateSchema(outputFile string) error {
	ctx := context.Background()

	// Extract database schema
	extractor := NewSchemaExtractor(w.db)
	dbSchema, err := extractor.ExtractDatabaseSchema(ctx)
	if err != nil {
		return fmt.Errorf("failed to extract database schema: %w", err)
	}

	// Create model registry
	modelRegistry := map[string]interface{}{
		"Persona":                        &models.Persona{},
		"Proxy":                          &models.Proxy{},
		"KeywordSet":                     &models.KeywordSet{},
		"Campaign":                       &models.Campaign{},
		"DomainGenerationCampaignParams": &models.DomainGenerationCampaignParams{},
		"DomainGenerationConfigState":    &models.DomainGenerationConfigState{},
		"GeneratedDomain":                &models.GeneratedDomain{},
		"DNSValidationCampaignParams":    &models.DNSValidationCampaignParams{},
		"DNSValidationResult":            &models.DNSValidationResult{},
		"HTTPKeywordCampaignParams":      &models.HTTPKeywordCampaignParams{},
		"HTTPKeywordResult":              &models.HTTPKeywordResult{},
		"AuditLog":                       &models.AuditLog{},
		"CampaignJob":                    &models.CampaignJob{},
	}

	// Extract model schemas
	reflector := NewModelReflector(modelRegistry)
	modelSchemas, err := reflector.ExtractModelSchemas()
	if err != nil {
		return fmt.Errorf("failed to extract model schemas: %w", err)
	}

	// Compare schemas
	comparator := NewSchemaComparator(dbSchema, modelSchemas)
	result, err := comparator.CompareSchemas()
	if err != nil {
		return fmt.Errorf("failed to compare schemas: %w", err)
	}

	// Generate report
	report := comparator.GenerateReport(result)

	// Write report to file
	err = os.WriteFile(outputFile, []byte(report), 0644)
	if err != nil {
		return fmt.Errorf("failed to write report to file: %w", err)
	}

	return nil
}
