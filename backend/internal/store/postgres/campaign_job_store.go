package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/models"
	"github.com/fntelecomllc/studio/backend/internal/store"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// campaignJobStorePostgres implements store.CampaignJobStore for PostgreSQL
type campaignJobStorePostgres struct {
	db *sqlx.DB
}

// NewCampaignJobStorePostgres creates a new CampaignJobStore for PostgreSQL.
func NewCampaignJobStorePostgres(db *sqlx.DB) store.CampaignJobStore {
	return &campaignJobStorePostgres{db: db}
}

// BeginTxx starts a new transaction.
func (s *campaignJobStorePostgres) BeginTxx(ctx context.Context, opts *sql.TxOptions) (*sqlx.Tx, error) {
	return s.db.BeginTxx(ctx, opts)
}

func (s *campaignJobStorePostgres) CreateJob(ctx context.Context, exec store.Querier, job *models.CampaignJob) error {
	if job.ID == uuid.Nil {
		job.ID = uuid.New()
	}

	now := time.Now().UTC()
	if job.CreatedAt.IsZero() {
		job.CreatedAt = now
	}
	job.UpdatedAt = now

	// Ensure ScheduledAt is set to a valid time
	if job.ScheduledAt.IsZero() {
		job.ScheduledAt = now
	}

	// Create a map to hold the job data with the correct column names
	jobData := map[string]interface{}{
		"id":                   job.ID,
		"campaign_id":          job.CampaignID,
		"job_type":             string(job.JobType), // Changed from job.CampaignType
		"status":               string(job.Status),
		"job_payload":          nil, // Will be set below if payload exists
		"attempts":             job.Attempts,
		"max_attempts":         job.MaxAttempts,
		"last_error":           job.LastError,
		"last_attempted_at":    job.LastAttemptedAt, // Added
		"created_at":           job.CreatedAt,
		"updated_at":           job.UpdatedAt,
		"scheduled_at":         job.ScheduledAt,
		"processing_server_id": job.ProcessingServerID, // Changed from job.WorkerID
	}

	// If JobPayload is not nil, set it as JSON string
	if job.JobPayload != nil && len(*job.JobPayload) > 0 {
		// Store the raw JSON string directly
		jobData["job_payload"] = string(*job.JobPayload)
	}

	query := `INSERT INTO campaign_jobs
			(id, campaign_id, job_type, status, job_payload, attempts, max_attempts, last_error, last_attempted_at,
			 created_at, updated_at, scheduled_at, processing_server_id)
		  VALUES
			(:id, :campaign_id, :job_type, :status, :job_payload, :attempts, :max_attempts, :last_error, :last_attempted_at,
			 :created_at, :updated_at, :scheduled_at, :processing_server_id)`

	// Use the provided transaction if available, otherwise use the db connection
	if exec != nil {
		_, err := exec.NamedExecContext(ctx, query, jobData)
		return err
	}
	_, err := s.db.NamedExecContext(ctx, query, jobData)
	return err
}

func (s *campaignJobStorePostgres) GetJobByID(ctx context.Context, jobID uuid.UUID) (*models.CampaignJob, error) {
	type dbJob struct {
		ID                 uuid.UUID               `db:"id"`
		CampaignID         uuid.UUID               `db:"campaign_id"`
		JobType            models.CampaignTypeEnum `db:"job_type"` // Changed CampaignType to JobType and db tag
		Status             string                  `db:"status"`
		JobPayload         *json.RawMessage        `db:"job_payload"` // Changed Payload to JobPayload and db tag
		Attempts           int                     `db:"attempts"`
		MaxAttempts        int                     `db:"max_attempts"`
		LastError          sql.NullString          `db:"last_error"`
		LastAttemptedAt    sql.NullTime            `db:"last_attempted_at"` // Added
		CreatedAt          time.Time               `db:"created_at"`
		UpdatedAt          time.Time               `db:"updated_at"`
		ScheduledAt        sql.NullTime            `db:"scheduled_at"`         // Added to fetch directly
		ProcessingServerID sql.NullString          `db:"processing_server_id"` // Changed WorkerID to ProcessingServerID and db tag
		NextExecutionAt    sql.NullTime            `db:"next_execution_at"`    // Kept for compatibility if used by GetNextQueuedJob logic
		LockedAt           sql.NullTime            `db:"locked_at"`            // Added
		LockedBy           sql.NullString          `db:"locked_by"`            // Added
	}

	dbj := &dbJob{}
	query := `SELECT id, campaign_id, job_type, status, job_payload, attempts, max_attempts, last_error, last_attempted_at, created_at, updated_at, scheduled_at, processing_server_id, next_execution_at, locked_at, locked_by
			  FROM campaign_jobs WHERE id = $1`
	err := s.db.GetContext(ctx, dbj, query, jobID)
	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	// Convert to the actual model
	job := &models.CampaignJob{
		ID:                 dbj.ID,
		CampaignID:         dbj.CampaignID,
		JobType:            dbj.JobType, // Changed from CampaignType
		Status:             models.CampaignJobStatusEnum(dbj.Status),
		JobPayload:         dbj.JobPayload, // Changed from Payload
		Attempts:           dbj.Attempts,
		MaxAttempts:        dbj.MaxAttempts,
		LastError:          dbj.LastError,
		LastAttemptedAt:    dbj.LastAttemptedAt, // Added
		CreatedAt:          dbj.CreatedAt,
		UpdatedAt:          dbj.UpdatedAt,
		ScheduledAt:        dbj.ScheduledAt.Time,   // Directly use fetched scheduled_at
		ProcessingServerID: dbj.ProcessingServerID, // Changed from WorkerID
		NextExecutionAt:    dbj.NextExecutionAt,    // Keep if distinct logic needed
		LockedAt:           dbj.LockedAt,           // Added
		LockedBy:           dbj.LockedBy,           // Added
	}

	// Ensure ScheduledAt is valid if dbj.ScheduledAt was NULL
	if !dbj.ScheduledAt.Valid {
		job.ScheduledAt = time.Time{} // Or some other default if appropriate
	}

	return job, nil
}

func (s *campaignJobStorePostgres) UpdateJob(ctx context.Context, exec store.Querier, job *models.CampaignJob) error {
	job.UpdatedAt = time.Now().UTC()
	query := `UPDATE campaign_jobs SET 
				status = :status, 
				job_payload = :job_payload, 
				attempts = :attempts, 
				max_attempts = :max_attempts,
				last_error = :last_error,
				last_attempted_at = :last_attempted_at,
				updated_at = :updated_at,
				scheduled_at = :scheduled_at,
				next_execution_at = :next_execution_at,
				processing_server_id = :processing_server_id
				 WHERE id = :id`

	// Use the provided transaction if available, otherwise use the db connection
	var result sql.Result
	var err error

	jobData := map[string]interface{}{
		"id":                   job.ID,
		"status":               job.Status,
		"job_payload":          nil, // Set to NULL by default
		"attempts":             job.Attempts,
		"max_attempts":         job.MaxAttempts,
		"last_error":           job.LastError,
		"last_attempted_at":    job.LastAttemptedAt, // Added
		"updated_at":           job.UpdatedAt,
		"scheduled_at":         job.ScheduledAt,        // Use job.ScheduledAt directly
		"next_execution_at":    job.NextExecutionAt,    // Added for retry scheduling
		"processing_server_id": job.ProcessingServerID, // Changed from job.WorkerID
	}

	// If JobPayload is not nil, set it as JSON string
	if job.JobPayload != nil {
		if len(*job.JobPayload) > 0 {
			// Store the raw JSON string directly
			jobData["job_payload"] = string(*job.JobPayload)
		} else {
			jobData["job_payload"] = nil
		}
	}

	if exec != nil {
		result, err = exec.NamedExecContext(ctx, query, jobData)
	} else {
		result, err = s.db.NamedExecContext(ctx, query, jobData)
	}

	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return store.ErrNotFound
	}
	return err
}

func (s *campaignJobStorePostgres) GetNextQueuedJob(ctx context.Context, campaignTypes []models.CampaignTypeEnum, workerID string) (*models.CampaignJob, error) {
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("pg: failed to begin transaction for GetNextQueuedJob: %w", err)
	}
	defer tx.Rollback()

	now := time.Now().UTC()
	selectArgs := []interface{}{models.JobStatusQueued, now}
	// Check for queued jobs AND jobs with retry business status that are ready to be executed again
	selectQuery := "SELECT id FROM campaign_jobs WHERE (status = $1 OR (business_status = 'retry' AND next_execution_at <= $2)) AND (scheduled_at IS NULL OR scheduled_at <= $2)"

	if len(campaignTypes) > 0 {
		var typePlaceholders []string
		for _, ct := range campaignTypes {
			typePlaceholders = append(typePlaceholders, fmt.Sprintf("$%d", len(selectArgs)+1))
			selectArgs = append(selectArgs, string(ct))
		}
		selectQuery += fmt.Sprintf(" AND job_type IN (%s)", strings.Join(typePlaceholders, ","))
	}
	selectQuery += " ORDER BY COALESCE(scheduled_at, '1970-01-01'::timestamp) ASC, created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1"

	var jobID uuid.UUID
	err = tx.GetContext(ctx, &jobID, selectQuery, selectArgs...)
	if err == sql.ErrNoRows {
		return nil, store.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("pg: failed to select next queued job: %w", err)
	}

	// First, update the job to mark it as running with processing business status
	updateQuery := `UPDATE campaign_jobs SET
				status = $1,
				business_status = $2,
				processing_server_id = $3,
				updated_at = NOW(),
				attempts = attempts + 1,
				scheduled_at = COALESCE(scheduled_at, NOW())
			  WHERE id = $4`

	result, err := tx.ExecContext(ctx, updateQuery, models.JobStatusRunning, models.JobBusinessStatusProcessing, workerID, jobID)
	if err != nil {
		return nil, fmt.Errorf("pg: failed to update job %s: %w", jobID, err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("pg: failed to get rows affected for job %s: %w", jobID, err)
	}
	if rowsAffected == 0 {
		return nil, store.ErrNotFound
	}

	// Then, fetch the full job details
	job := &models.CampaignJob{} // This will be populated by GetContext
	fetchQuery := `SELECT id, campaign_id, job_type, status, job_payload,
					attempts, max_attempts, last_error, last_attempted_at, created_at, updated_at, scheduled_at,
					next_execution_at, -- Assuming next_execution_at is a distinct column or handled by COALESCE if needed
					processing_server_id, locked_at, locked_by
			  FROM campaign_jobs
			  WHERE id = $1`
	// sqlx.GetContext will map columns to struct fields based on db tags in models.CampaignJob
	err = tx.GetContext(ctx, job, fetchQuery, jobID)
	if err != nil {
		return nil, fmt.Errorf("pg: failed to fetch updated job %s: %w", jobID, err)
	}
	// No need to manually set job.ScheduledAt if it's correctly fetched via db tag
	// and dbJob struct is not used for this final fetch.
	// If job.ScheduledAt can be NULL in DB and needs a default in Go model if NULL,
	// that logic would be here or in the model itself.
	// For now, assume direct mapping is sufficient.

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("pg: failed to commit transaction for GetNextQueuedJob: %w", err)
	}

	return job, nil
}

func (s *campaignJobStorePostgres) DeleteJob(ctx context.Context, jobID uuid.UUID) error {
	query := `DELETE FROM campaign_jobs WHERE id = $1`
	result, err := s.db.ExecContext(ctx, query, jobID) // Uses s.db
	if err != nil {
		return err
	}
	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return store.ErrNotFound
	}
	return err
}

func (s *campaignJobStorePostgres) ListJobs(ctx context.Context, filter store.ListJobsFilter) ([]*models.CampaignJob, error) {
	baseQuery := `SELECT id, campaign_id, job_type, status, job_payload, attempts, max_attempts, last_error, created_at, updated_at, scheduled_at, scheduled_at as next_execution_at, processing_server_id, locked_at, locked_by FROM campaign_jobs`
	args := []interface{}{}
	conditions := []string{}

	if filter.CampaignID.Valid {
		conditions = append(conditions, "campaign_id = ?")
		args = append(args, filter.CampaignID.UUID)
	}
	if filter.CampaignType != "" {
		conditions = append(conditions, "job_type = ?")
		args = append(args, filter.CampaignType)
	}
	if filter.Status != "" {
		conditions = append(conditions, "status = ?")
		args = append(args, filter.Status)
	}

	if len(conditions) > 0 {
		baseQuery += " WHERE " + strings.Join(conditions, " AND ")
	}

	baseQuery += " ORDER BY created_at DESC"

	if filter.Limit > 0 {
		baseQuery += fmt.Sprintf(" LIMIT %d", filter.Limit)
	}

	if filter.Offset > 0 {
		baseQuery += fmt.Sprintf(" OFFSET %d", filter.Offset)
	}

	jobs := []*models.CampaignJob{}
	// Rebind the query to use PostgreSQL's $1, $2, etc. placeholders
	reboundQuery := s.db.Rebind(baseQuery)
	err := s.db.SelectContext(ctx, &jobs, reboundQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("pg: failed to list jobs: %w", err)
	}

	return jobs, nil
}

var _ store.CampaignJobStore = (*campaignJobStorePostgres)(nil)
