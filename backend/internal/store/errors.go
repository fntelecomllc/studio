package store

import "errors"

var (
	// ErrNotFound is returned when a requested record is not found in the database.
	ErrNotFound = errors.New("requested record not found")

	// ErrDuplicateEntry is returned when an insert or update operation violates a unique constraint.
	ErrDuplicateEntry = errors.New("database record already exists or violates unique constraint")

	// ErrUpdateFailed is returned when an update operation does not affect any rows,
	// potentially because the record does not exist or the data hasn't changed.
	ErrUpdateFailed = errors.New("database record update failed")

	// ErrOptimisticLock is returned when an update operation fails due to a version mismatch in optimistic locking.
	// ErrOptimisticLock = errors.New("database record update failed due to version mismatch (optimistic lock)")
)
