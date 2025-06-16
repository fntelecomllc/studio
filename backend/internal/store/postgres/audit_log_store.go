package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"

	"strings"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// auditLogStorePostgres implements the store.AuditLogStore interface
type auditLogStorePostgres struct {
	db *sqlx.DB // Retains DB for Transactor part if it were needed, and for direct execution if no tx
}

// NewAuditLogStorePostgres creates a new AuditLogStore for PostgreSQL
func NewAuditLogStorePostgres(db *sqlx.DB) store.AuditLogStore {
	return &auditLogStorePostgres{db: db}
}

// BeginTxx starts a new transaction - added for interface completeness, though audit logs might not always need explicit tx from store.
func (s *auditLogStorePostgres) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	return s.db.BeginTxx(ctx, opts)
}

func (s *auditLogStorePostgres) CreateAuditLog(ctx context.Context, exec store.Querier, logEntry *models.AuditLog) error {
	if logEntry.ID == uuid.Nil {
		logEntry.ID = uuid.New()
	}
	if logEntry.Timestamp.IsZero() {
		logEntry.Timestamp = time.Now().UTC()
	}
	query := `INSERT INTO audit_logs (id, timestamp, user_id, action, entity_type, entity_id, details, client_ip, user_agent)
	             VALUES (:id, :timestamp, :user_id, :action, :entity_type, :entity_id, :details, :client_ip, :user_agent)`

	// If exec is nil, use the internal db connection
	if exec == nil {
		if s.db == nil {
			return fmt.Errorf("both exec and internal db connection are nil")
		}
		_, err := s.db.NamedExecContext(ctx, query, logEntry)
		return err
	}

	// Otherwise use the provided exec
	_, err := exec.NamedExecContext(ctx, query, logEntry)
	return err
}

func (s *auditLogStorePostgres) ListAuditLogs(ctx context.Context, exec store.Querier, filter store.ListAuditLogsFilter) ([]*models.AuditLog, error) {
	baseQuery := `SELECT id, timestamp, user_id, action, entity_type, entity_id, details, client_ip, user_agent FROM audit_logs`
	args := []interface{}{}
	conditions := []string{}

	if filter.UserID != "" {
		conditions = append(conditions, "user_id = ?")
		args = append(args, filter.UserID)
	}
	if filter.EntityType != "" {
		conditions = append(conditions, "entity_type = ?")
		args = append(args, filter.EntityType)
	}
	// Check for uuid.NullUUID specifically for EntityID
	if filter.EntityID.Valid { // Only add condition if EntityID in filter is valid (not nil UUID)
		conditions = append(conditions, "entity_id = ?")
		args = append(args, filter.EntityID.UUID)
	}
	if filter.Action != "" {
		conditions = append(conditions, "action = ?")
		args = append(args, filter.Action)
	}
	if !filter.StartDate.IsZero() {
		conditions = append(conditions, "timestamp >= ?")
		args = append(args, filter.StartDate)
	}
	if !filter.EndDate.IsZero() {
		conditions = append(conditions, "timestamp <= ?")
		args = append(args, filter.EndDate)
	}

	finalQuery := baseQuery
	if len(conditions) > 0 {
		finalQuery += " WHERE " + strings.Join(conditions, " AND ")
	}

	finalQuery += " ORDER BY timestamp DESC"

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

	logs := []*models.AuditLog{}
	err := exec.SelectContext(ctx, &logs, reboundQuery, args...)
	return logs, err
}

// Ensure auditLogStorePostgres implements store.AuditLogStore
var _ store.AuditLogStore = (*auditLogStorePostgres)(nil)
