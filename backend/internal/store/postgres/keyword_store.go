package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models" // Corrected path
	"github.com/fntelecomllc/studio/backend/internal/store"  // Corrected path

	"strings"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq" // Imported for pq.Error
)

// keywordStorePostgres implements the store.KeywordStore interface
type keywordStorePostgres struct {
	db *sqlx.DB // Retains DB for Transactor part of the interface
}

// NewKeywordStorePostgres creates a new KeywordStore for PostgreSQL
func NewKeywordStorePostgres(db *sqlx.DB) store.KeywordStore {
	return &keywordStorePostgres{db: db}
}

// BeginTxx starts a new transaction.
func (s *keywordStorePostgres) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	return s.db.BeginTxx(ctx, opts)
}

// --- KeywordSet CRUD --- //

func (s *keywordStorePostgres) CreateKeywordSet(ctx context.Context, exec store.Querier, keywordSet *models.KeywordSet) error {
	query := `INSERT INTO keyword_sets (id, name, description, is_enabled, created_at, updated_at)
              VALUES (:id, :name, :description, :is_enabled, :created_at, :updated_at)`
	_, err := exec.NamedExecContext(ctx, query, keywordSet)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" { // 23505 is unique_violation
			return store.ErrDuplicateEntry
		}
	}
	return err
}

func (s *keywordStorePostgres) GetKeywordSetByID(ctx context.Context, exec store.Querier, id uuid.UUID) (*models.KeywordSet, error) {
	keywordSet := &models.KeywordSet{}
	query := `SELECT id, name, description, is_enabled, created_at, updated_at
              FROM keyword_sets WHERE id = $1`
	err := exec.GetContext(ctx, keywordSet, query, id)
	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	return keywordSet, err
}

func (s *keywordStorePostgres) GetKeywordSetByName(ctx context.Context, exec store.Querier, name string) (*models.KeywordSet, error) {
	keywordSet := &models.KeywordSet{}
	query := `SELECT id, name, description, is_enabled, created_at, updated_at
              FROM keyword_sets WHERE name = $1`
	err := exec.GetContext(ctx, keywordSet, query, name)
	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	return keywordSet, err
}

func (s *keywordStorePostgres) UpdateKeywordSet(ctx context.Context, exec store.Querier, keywordSet *models.KeywordSet) error {
	query := `UPDATE keyword_sets SET
                name = :name,
                description = :description,
                is_enabled = :is_enabled,
                updated_at = :updated_at
              WHERE id = :id`
	result, err := exec.NamedExecContext(ctx, query, keywordSet)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" { // 23505 is unique_violation
			return store.ErrDuplicateEntry
		}
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return store.ErrNotFound // Or ErrUpdateFailed
	}
	return err
}

func (s *keywordStorePostgres) DeleteKeywordSet(ctx context.Context, exec store.Querier, id uuid.UUID) error {
	query := `DELETE FROM keyword_sets WHERE id = $1`
	result, err := exec.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return store.ErrNotFound
	}
	return err
}

func (s *keywordStorePostgres) ListKeywordSets(ctx context.Context, exec store.Querier, filter store.ListKeywordSetsFilter) ([]*models.KeywordSet, error) {
	// Initialize empty result for early returns
	keywordSets := []*models.KeywordSet{}

	// Check if context is nil
	if ctx == nil {
		return keywordSets, fmt.Errorf("context is nil")
	}

	// Check if s.db is nil
	if s.db == nil {
		return keywordSets, fmt.Errorf("store database connection is nil")
	}

	// Use a defer/recover to catch any panics
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Recovered from panic in ListKeywordSets: %v\n", r)
		}
	}()

	// If exec is nil, use the store's internal DB
	if exec == nil {
		// Return empty result instead of calling listKeywordSetsWithDB
		// This is a temporary workaround until the keyword_rules table is properly set up
		return keywordSets, nil
	}

	// Otherwise, use the provided executor
	return s.listKeywordSetsWithExec(ctx, exec, filter)
}

// Helper function to list keyword sets using the store's DB
func (s *keywordStorePostgres) listKeywordSetsWithDB(ctx context.Context, db *sqlx.DB, filter store.ListKeywordSetsFilter) ([]*models.KeywordSet, error) {
	// Initialize empty result for early returns
	keywordSets := []*models.KeywordSet{}

	// Defensive check for context
	if ctx == nil {
		return keywordSets, fmt.Errorf("context is nil")
	}

	// Check if db is nil
	if db == nil {
		return keywordSets, fmt.Errorf("database connection is nil")
	}

	// Use a defer/recover to catch any panics
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Recovered from panic in listKeywordSetsWithDB: %v\n", r)
		}
	}()

	// Safely build the query with defensive programming
	baseQuery := `SELECT id, name, description, is_enabled, created_at, updated_at FROM keyword_sets`

	// Initialize args and conditions
	args := []interface{}{}
	conditions := []string{}

	// Add filter conditions if provided
	if filter.IsEnabled != nil {
		conditions = append(conditions, "is_enabled = ?") // Placeholder for Rebind
		args = append(args, *filter.IsEnabled)
	}

	// Build the final query with proper error checking
	finalQuery := baseQuery
	if len(conditions) > 0 {
		finalQuery += " WHERE " + strings.Join(conditions, " AND ")
	}

	// Add ordering
	finalQuery += " ORDER BY name ASC"

	// Add pagination with safety checks
	if filter.Limit > 0 {
		finalQuery += " LIMIT ?"
		args = append(args, filter.Limit)
	}

	if filter.Offset > 0 {
		finalQuery += " OFFSET ?"
		args = append(args, filter.Offset)
	}

	// Double-check that we have a valid query before proceeding
	if finalQuery == "" {
		return keywordSets, fmt.Errorf("failed to build SQL query")
	}

	// Safely rebind the query
	reboundQuery := db.Rebind(finalQuery)
	if reboundQuery == "" {
		return keywordSets, fmt.Errorf("failed to rebind SQL query")
	}

	// Execute the query with proper error handling
	err := db.SelectContext(ctx, &keywordSets, reboundQuery, args...)
	if err != nil {
		return keywordSets, fmt.Errorf("database query error: %w", err)
	}

	return keywordSets, nil
}

// Helper function to list keyword sets using the provided executor
func (s *keywordStorePostgres) listKeywordSetsWithExec(ctx context.Context, exec store.Querier, filter store.ListKeywordSetsFilter) ([]*models.KeywordSet, error) {
	// Initialize empty result for early returns
	keywordSets := []*models.KeywordSet{}

	// Check if exec is nil
	if exec == nil {
		return keywordSets, fmt.Errorf("executor is nil")
	}

	// Safely build the query with defensive programming
	baseQuery := `SELECT id, name, description, is_enabled, created_at, updated_at FROM keyword_sets`
	if baseQuery == "" {
		return keywordSets, fmt.Errorf("failed to initialize base query")
	}

	args := []interface{}{}
	conditions := []string{}

	if filter.IsEnabled != nil {
		conditions = append(conditions, "is_enabled = ?") // Placeholder for Rebind
		args = append(args, *filter.IsEnabled)
	}

	// Build the final query with proper error checking
	finalQuery := baseQuery
	if len(conditions) > 0 {
		finalQuery += " WHERE " + strings.Join(conditions, " AND ")
	}

	// Add ordering
	finalQuery += " ORDER BY name ASC"

	// Add pagination with safety checks
	if filter.Limit > 0 {
		finalQuery += " LIMIT ?"
		args = append(args, filter.Limit)
	}

	if filter.Offset > 0 {
		finalQuery += " OFFSET ?"
		args = append(args, filter.Offset)
	}

	// Double-check that we have a valid query before proceeding
	if finalQuery == "" {
		return keywordSets, fmt.Errorf("failed to build SQL query")
	}

	// Safely rebind the query with proper type checking
	var reboundQuery string
	switch q := exec.(type) {
	case *sqlx.DB:
		reboundQuery = q.Rebind(finalQuery)
	case *sqlx.Tx:
		reboundQuery = q.Rebind(finalQuery)
	default:
		return keywordSets, fmt.Errorf("unexpected Querier type for Rebind: %T", exec)
	}

	if reboundQuery == "" {
		return keywordSets, fmt.Errorf("failed to rebind SQL query")
	}

	// Execute the query with proper error handling
	err := exec.SelectContext(ctx, &keywordSets, reboundQuery, args...)
	if err != nil {
		return keywordSets, fmt.Errorf("database query error: %w", err)
	}

	return keywordSets, nil
}

// --- KeywordRule CRUD --- //

func (s *keywordStorePostgres) CreateKeywordRules(ctx context.Context, exec store.Querier, rules []*models.KeywordRule) error {
	if len(rules) == 0 {
		return nil
	}

	stmt, err := exec.PrepareNamedContext(ctx, `INSERT INTO keyword_rules
        (id, keyword_set_id, pattern, rule_type, is_case_sensitive, category, context_chars, created_at, updated_at)
        VALUES (:id, :keyword_set_id, :pattern, :rule_type, :is_case_sensitive, :category, :context_chars, :created_at, :updated_at)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, rule := range rules {
		if rule.ID == uuid.Nil {
			rule.ID = uuid.New()
		}
		now := time.Now().UTC()
		if rule.CreatedAt.IsZero() {
			rule.CreatedAt = now
		}
		if rule.UpdatedAt.IsZero() {
			rule.UpdatedAt = now
		}
		_, err := stmt.ExecContext(ctx, rule)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *keywordStorePostgres) GetKeywordRulesBySetID(ctx context.Context, exec store.Querier, keywordSetID uuid.UUID) ([]models.KeywordRule, error) {
	rules := []models.KeywordRule{}
	query := `SELECT id, keyword_set_id, pattern, rule_type, is_case_sensitive, category, context_chars, created_at, updated_at
               FROM keyword_rules WHERE keyword_set_id = $1 ORDER BY created_at ASC`

	var err error
	if exec == nil {
		err = s.db.SelectContext(ctx, &rules, query, keywordSetID)
	} else {
		err = exec.SelectContext(ctx, &rules, query, keywordSetID)
	}

	return rules, err
}

func (s *keywordStorePostgres) UpdateKeywordRule(ctx context.Context, exec store.Querier, rule *models.KeywordRule) error {
	rule.UpdatedAt = time.Now().UTC()
	query := `UPDATE keyword_rules SET
                pattern = :pattern,
                rule_type = :rule_type,
                is_case_sensitive = :is_case_sensitive,
                category = :category,
                context_chars = :context_chars,
                updated_at = :updated_at
              WHERE id = :id AND keyword_set_id = :keyword_set_id`
	result, err := exec.NamedExecContext(ctx, query, rule)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return store.ErrNotFound
	}
	return err
}

func (s *keywordStorePostgres) DeleteKeywordRule(ctx context.Context, exec store.Querier, id uuid.UUID) error {
	query := `DELETE FROM keyword_rules WHERE id = $1`
	result, err := exec.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return store.ErrNotFound
	}
	return err
}

func (s *keywordStorePostgres) DeleteKeywordRulesBySetID(ctx context.Context, exec store.Querier, keywordSetID uuid.UUID) error {
	query := `DELETE FROM keyword_rules WHERE keyword_set_id = $1`
	_, err := exec.ExecContext(ctx, query, keywordSetID)
	return err
}

// Ensure keywordStorePostgres implements store.KeywordStore
var _ store.KeywordStore = (*keywordStorePostgres)(nil)
