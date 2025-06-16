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
	"github.com/lib/pq" // Imported for pq.Error
)

// proxyStorePostgres implements the store.ProxyStore interface
type proxyStorePostgres struct {
	db *sqlx.DB
}

// NewProxyStorePostgres creates a new ProxyStore for PostgreSQL
func NewProxyStorePostgres(db *sqlx.DB) store.ProxyStore {
	return &proxyStorePostgres{db: db}
}

// BeginTxx starts a new transaction.
func (s *proxyStorePostgres) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	return s.db.BeginTxx(ctx, opts)
}

func (s *proxyStorePostgres) CreateProxy(ctx context.Context, exec store.Querier, proxy *models.Proxy) error {
	query := `INSERT INTO proxies (id, name, description, address, protocol, username, password_hash, host, port, is_enabled, is_healthy, last_status, last_checked_at, latency_ms, city, country_code, provider, created_at, updated_at)
	             VALUES (:id, :name, :description, :address, :protocol, :username, :password_hash, :host, :port, :is_enabled, :is_healthy, :last_status, :last_checked_at, :latency_ms, :city, :country_code, :provider, :created_at, :updated_at)`
	_, err := exec.NamedExecContext(ctx, query, proxy)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" { // 23505 is unique_violation
			return store.ErrDuplicateEntry
		}
	}
	return err
}

func (s *proxyStorePostgres) GetProxyByID(ctx context.Context, exec store.Querier, id uuid.UUID) (*models.Proxy, error) {
	proxy := &models.Proxy{}
	query := `SELECT id, name, description, address, protocol, username, password_hash, host, port, is_enabled, is_healthy, last_status, last_checked_at, latency_ms, city, country_code, provider, created_at, updated_at
	                FROM proxies WHERE id = $1`
	err := exec.GetContext(ctx, proxy, query, id)
	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	return proxy, err
}

func (s *proxyStorePostgres) UpdateProxy(ctx context.Context, exec store.Querier, proxy *models.Proxy) error {
	query := `UPDATE proxies SET
	                  name = :name,
	                  description = :description,
	                  address = :address,
	                  protocol = :protocol,
	                  username = :username,
	                  password_hash = :password_hash,
	                  host = :host,
	                  port = :port,
	                  is_enabled = :is_enabled,
	                  is_healthy = :is_healthy,
	                  last_status = :last_status,
	                  last_checked_at = :last_checked_at,
	                  latency_ms = :latency_ms,
	                  city = :city,
	                  country_code = :country_code,
	                  provider = :provider,
	                  updated_at = :updated_at
	                WHERE id = :id`
	result, err := exec.NamedExecContext(ctx, query, proxy)
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

func (s *proxyStorePostgres) DeleteProxy(ctx context.Context, exec store.Querier, id uuid.UUID) error {
	query := `DELETE FROM proxies WHERE id = $1`
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

func (s *proxyStorePostgres) ListProxies(ctx context.Context, exec store.Querier, filter store.ListProxiesFilter) ([]*models.Proxy, error) {
	baseQuery := `SELECT id, name, description, address, protocol, username, password_hash, host, port, is_enabled, is_healthy, last_status, last_checked_at, latency_ms, city, country_code, provider, created_at, updated_at FROM proxies`
	args := []interface{}{}
	conditions := []string{}

	if filter.Protocol != "" {
		conditions = append(conditions, "protocol = ?")
		args = append(args, filter.Protocol)
	}
	if filter.IsEnabled != nil {
		conditions = append(conditions, "is_enabled = ?")
		args = append(args, *filter.IsEnabled)
	}
	if filter.IsHealthy != nil {
		conditions = append(conditions, "is_healthy = ?")
		args = append(args, *filter.IsHealthy)
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

	proxies := []*models.Proxy{}
	err := exec.SelectContext(ctx, &proxies, reboundQuery, args...)
	return proxies, err
}

func (s *proxyStorePostgres) UpdateProxyHealth(ctx context.Context, exec store.Querier, id uuid.UUID, isHealthy bool, latencyMs sql.NullInt32, lastCheckedAt time.Time) error {
	query := `UPDATE proxies SET
                is_healthy = $1,
                last_checked_at = $2,
                latency_ms = $3,
                updated_at = NOW()
              WHERE id = $4`
	result, err := exec.ExecContext(ctx, query, isHealthy, lastCheckedAt, latencyMs, id)
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return store.ErrNotFound // Or ErrUpdateFailed
	}
	return err
}

// Ensure proxyStorePostgres implements store.ProxyStore
var _ store.ProxyStore = (*proxyStorePostgres)(nil)
