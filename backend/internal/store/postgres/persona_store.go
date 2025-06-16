package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq" // Imported for pq.Error
	"strings"
)

// personaStorePostgres implements the store.PersonaStore interface
type personaStorePostgres struct {
	db *sqlx.DB
}

// NewPersonaStorePostgres creates a new PersonaStore for PostgreSQL
func NewPersonaStorePostgres(db *sqlx.DB) store.PersonaStore {
	return &personaStorePostgres{db: db}
}

// BeginTxx starts a new transaction.
func (s *personaStorePostgres) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	return s.db.BeginTxx(ctx, opts)
}

func (s *personaStorePostgres) CreatePersona(ctx context.Context, exec store.Querier, persona *models.Persona) error {
	query := `INSERT INTO personas (id, name, persona_type, description, config_details, is_enabled, created_at, updated_at)
			  VALUES (:id, :name, :persona_type, :description, :config_details, :is_enabled, :created_at, :updated_at)`
	_, err := exec.NamedExecContext(ctx, query, persona)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" { // 23505 is unique_violation
			return store.ErrDuplicateEntry
		}
	}
	return err
}

func (s *personaStorePostgres) GetPersonaByID(ctx context.Context, exec store.Querier, id uuid.UUID) (*models.Persona, error) {
	persona := &models.Persona{}
	query := `SELECT id, name, persona_type, description, config_details, is_enabled, created_at, updated_at 
			  FROM personas WHERE id = $1`
	err := exec.GetContext(ctx, persona, query, id)
	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	return persona, err
}

func (s *personaStorePostgres) GetPersonaByName(ctx context.Context, exec store.Querier, name string) (*models.Persona, error) {
	persona := &models.Persona{}
	query := `SELECT id, name, persona_type, description, config_details, is_enabled, created_at, updated_at 
			  FROM personas WHERE name = $1`
	err := exec.GetContext(ctx, persona, query, name)
	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	return persona, err
}

func (s *personaStorePostgres) UpdatePersona(ctx context.Context, exec store.Querier, persona *models.Persona) error {
	query := `UPDATE personas SET 
				name = :name, 
				persona_type = :persona_type, 
				description = :description, 
				config_details = :config_details, 
				is_enabled = :is_enabled, 
				updated_at = :updated_at
			  WHERE id = :id`
	result, err := exec.NamedExecContext(ctx, query, persona)
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

func (s *personaStorePostgres) DeletePersona(ctx context.Context, exec store.Querier, id uuid.UUID) error {
	query := `DELETE FROM personas WHERE id = $1`
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

func (s *personaStorePostgres) ListPersonas(ctx context.Context, exec store.Querier, filter store.ListPersonasFilter) ([]*models.Persona, error) {
	baseQuery := `SELECT id, name, persona_type, description, config_details, is_enabled, created_at, updated_at FROM personas`
	args := []interface{}{}
	conditions := []string{}

	if filter.Type != "" {
		conditions = append(conditions, "persona_type = ?")
		args = append(args, filter.Type)
	}
	if filter.IsEnabled != nil {
		conditions = append(conditions, "is_enabled = ?")
		args = append(args, *filter.IsEnabled)
	}

	finalQuery := baseQuery
	if len(conditions) > 0 {
		finalQuery += " WHERE " + strings.Join(conditions, " AND ")
	}

	finalQuery += " ORDER BY name ASC"

	if filter.Limit > 0 {
		finalQuery += " LIMIT ?"
		args = append(args, filter.Limit)
	}
	if filter.Offset > 0 {
		finalQuery += " OFFSET ?"
		args = append(args, filter.Offset)
	}

	var reboundQuery string
	switch q := exec.(type) {
	case *sqlx.DB:
		reboundQuery = q.Rebind(finalQuery)
	case *sqlx.Tx:
		reboundQuery = q.Rebind(finalQuery)
	default:
		return nil, fmt.Errorf("unexpected Querier type for Rebind: %T", exec)
	}

	personas := []*models.Persona{}
	err := exec.SelectContext(ctx, &personas, reboundQuery, args...)
	return personas, err
}

// Ensure personaStorePostgres implements store.PersonaStore
var _ store.PersonaStore = (*personaStorePostgres)(nil)
