package monitoring

import (
	"log"
	"time"

	"github.com/jmoiron/sqlx"
)

// DatabaseMetrics provides database connection pool monitoring
type DatabaseMetrics struct {
	db *sqlx.DB
}

// NewDatabaseMetrics creates a new database metrics monitor
func NewDatabaseMetrics(db *sqlx.DB) *DatabaseMetrics {
	return &DatabaseMetrics{db: db}
}

// LogConnectionPoolStats logs current database connection pool statistics
func (dm *DatabaseMetrics) LogConnectionPoolStats(operation string, campaignID string) {
	if dm.db == nil {
		return
	}

	stats := dm.db.Stats()
	log.Printf("DB_METRICS: operation=%s campaign_id=%s active_connections=%d max_open=%d idle=%d in_use=%d wait_count=%d wait_duration=%v",
		operation,
		campaignID,
		stats.OpenConnections,
		stats.MaxOpenConnections,
		stats.Idle,
		stats.InUse,
		stats.WaitCount,
		stats.WaitDuration,
	)

	// Log warning if connection pool is under stress
	if stats.InUse > int(float64(stats.MaxOpenConnections)*0.8) {
		log.Printf("DB_WARNING: high_connection_usage operation=%s campaign_id=%s usage_pct=%.1f%%",
			operation,
			campaignID,
			float64(stats.InUse)/float64(stats.MaxOpenConnections)*100,
		)
	}

	// Log critical if wait count is increasing
	if stats.WaitCount > 0 {
		log.Printf("DB_CRITICAL: connection_wait_detected operation=%s campaign_id=%s wait_count=%d wait_duration=%v",
			operation,
			campaignID,
			stats.WaitCount,
			stats.WaitDuration,
		)
	}
}

// LogTransactionEvent logs transaction lifecycle events
func LogTransactionEvent(event string, campaignID string, txID string, err error) {
	if err != nil {
		log.Printf("TRANSACTION_ERROR: event=%s campaign_id=%s tx_id=%s error=%v",
			event, campaignID, txID, err)
	} else {
		log.Printf("TRANSACTION_SUCCESS: event=%s campaign_id=%s tx_id=%s",
			event, campaignID, txID)
	}
}

// LogResourceCleanup logs resource cleanup events
func LogResourceCleanup(resourceType string, campaignID string, success bool, err error) {
	if !success {
		log.Printf("RESOURCE_LEAK: type=%s campaign_id=%s cleanup_failed error=%v",
			resourceType, campaignID, err)
	} else {
		log.Printf("RESOURCE_CLEANUP: type=%s campaign_id=%s cleanup_success",
			resourceType, campaignID)
	}
}

// LogPreparedStatementLifecycle logs prepared statement creation and cleanup
func LogPreparedStatementLifecycle(operation string, campaignID string, query string, event string, err error) {
	if err != nil {
		log.Printf("STMT_ERROR: operation=%s campaign_id=%s event=%s query_hash=%d error=%v",
			operation, campaignID, event, hashString(query), err)
	} else {
		log.Printf("STMT_SUCCESS: operation=%s campaign_id=%s event=%s query_hash=%d",
			operation, campaignID, event, hashString(query))
	}
}

// hashString creates a simple hash of SQL query for logging
func hashString(s string) uint32 {
	h := uint32(2166136261)
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

// StartConnectionMonitoring starts periodic connection pool monitoring
func (dm *DatabaseMetrics) StartConnectionMonitoring(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			dm.LogConnectionPoolStats("periodic_monitor", "system")
		}
	}()
}