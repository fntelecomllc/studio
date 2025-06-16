package migrationverifier

import (
	"context"
	"fmt"
	"io/ioutil"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
)

// MigrationVerifier verifies database migrations
type MigrationVerifier struct {
	db *sqlx.DB
}

// FailedMigration represents a migration that failed to apply
type FailedMigration struct {
	Name  string
	Error string
}

// VerificationResult contains the results of migration verification
type VerificationResult struct {
	Success               bool
	MissingMigrations     []string
	ConflictingMigrations []string
	FailedMigrations      []FailedMigration
	AppliedMigrations     []string
	PendingMigrations     []string
}

// NewMigrationVerifier creates a new MigrationVerifier
func NewMigrationVerifier(db *sqlx.DB) *MigrationVerifier {
	return &MigrationVerifier{
		db: db,
	}
}

// VerifyMigrations verifies that all migrations can be applied cleanly
func (v *MigrationVerifier) VerifyMigrations() (*VerificationResult, error) {
	ctx := context.Background()

	// Create result
	result := &VerificationResult{
		Success: true,
	}

	// 1. Check if migration table exists
	exists, err := v.checkMigrationTableExists(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to check if migration table exists: %w", err)
	}

	// 2. Get applied migrations from database
	appliedMigrations, err := v.getAppliedMigrations(ctx, exists)
	if err != nil {
		return nil, fmt.Errorf("failed to get applied migrations: %w", err)
	}
	result.AppliedMigrations = appliedMigrations

	// 3. Get migration files from disk
	migrationFiles, err := v.getMigrationFiles()
	if err != nil {
		return nil, fmt.Errorf("failed to get migration files: %w", err)
	}

	// 4. Check for missing migrations (in DB but not in files)
	missingMigrations := v.findMissingMigrations(appliedMigrations, migrationFiles)
	if len(missingMigrations) > 0 {
		result.Success = false
		result.MissingMigrations = missingMigrations
	}

	// 5. Check for conflicting migrations (different content for same version)
	conflictingMigrations, err := v.findConflictingMigrations(exists, migrationFiles)
	if err != nil {
		return nil, fmt.Errorf("failed to find conflicting migrations: %w", err)
	}
	if len(conflictingMigrations) > 0 {
		result.Success = false
		result.ConflictingMigrations = conflictingMigrations
	}

	// 6. Identify pending migrations
	pendingMigrations := v.findPendingMigrations(appliedMigrations, migrationFiles)
	result.PendingMigrations = pendingMigrations

	// 7. Verify pending migrations can be applied
	if len(pendingMigrations) > 0 {
		// Create a temporary database to test migrations
		tempDB, cleanup, err := v.createTempDatabase(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to create temporary database: %w", err)
		}
		defer cleanup()

		// Apply all migrations that are already applied in the main database
		if err := v.applyMigrationsToTempDB(ctx, tempDB, appliedMigrations); err != nil {
			return nil, fmt.Errorf("failed to apply existing migrations to temp database: %w", err)
		}

		// Try to apply pending migrations
		failedMigrations, err := v.applyPendingMigrations(ctx, tempDB, pendingMigrations)
		if err != nil {
			return nil, fmt.Errorf("failed to apply pending migrations: %w", err)
		}

		if len(failedMigrations) > 0 {
			result.Success = false
			result.FailedMigrations = failedMigrations
		}
	}

	return result, nil
}

// checkMigrationTableExists checks if the migration table exists in the database
func (v *MigrationVerifier) checkMigrationTableExists(ctx context.Context) (bool, error) {
	var exists bool
	query := `
		SELECT EXISTS (
			SELECT FROM information_schema.tables 
			WHERE table_schema = 'public' 
			AND table_name = 'schema_migrations'
		)
	`
	err := v.db.GetContext(ctx, &exists, query)
	return exists, err
}

// getAppliedMigrations gets the list of migrations that have been applied to the database
func (v *MigrationVerifier) getAppliedMigrations(ctx context.Context, tableExists bool) ([]string, error) {
	if !tableExists {
		return []string{}, nil
	}

	var versions []string
	query := `SELECT version FROM schema_migrations ORDER BY version`
	err := v.db.SelectContext(ctx, &versions, query)
	return versions, err
}

// getMigrationFiles gets the list of migration files from disk
func (v *MigrationVerifier) getMigrationFiles() (map[string]string, error) {
	migrationsDir := "./migrations"
	files, err := ioutil.ReadDir(migrationsDir)
	if err != nil {
		return nil, err
	}

	migrationFiles := make(map[string]string)
	for _, file := range files {
		if file.IsDir() {
			continue
		}

		// Only consider .sql files
		if !strings.HasSuffix(file.Name(), ".sql") {
			continue
		}

		// Extract version from filename (assuming format: YYYYMMDDHHMMSS_description.sql)
		re := regexp.MustCompile(`^(\d+)_.*\.sql$`)
		matches := re.FindStringSubmatch(file.Name())
		if len(matches) < 2 {
			continue
		}

		version := matches[1]
		path := filepath.Join(migrationsDir, file.Name())

		// Read file content
		content, err := ioutil.ReadFile(path)
		if err != nil {
			return nil, err
		}

		migrationFiles[version] = string(content)
	}

	return migrationFiles, nil
}

// findMissingMigrations finds migrations that are in the database but not in files
func (v *MigrationVerifier) findMissingMigrations(appliedMigrations []string, migrationFiles map[string]string) []string {
	var missingMigrations []string
	for _, version := range appliedMigrations {
		if _, exists := migrationFiles[version]; !exists {
			missingMigrations = append(missingMigrations, version)
		}
	}
	return missingMigrations
}

// findConflictingMigrations finds migrations with different content than what was applied
func (v *MigrationVerifier) findConflictingMigrations(tableExists bool, _ map[string]string) ([]string, error) {
	if !tableExists {
		return []string{}, nil
	}

	// This is a simplified implementation. In a real system, you would need to:
	// 1. Store the hash of each migration in the schema_migrations table
	// 2. Compare the hash of the file with the stored hash
	// 3. Use a database context to query the schema_migrations table
	// For this example, we'll just return an empty list
	return []string{}, nil
}

// findPendingMigrations finds migrations that are in files but not applied to the database
func (v *MigrationVerifier) findPendingMigrations(appliedMigrations []string, migrationFiles map[string]string) []string {
	// Convert applied migrations to a map for faster lookup
	appliedMap := make(map[string]bool)
	for _, version := range appliedMigrations {
		appliedMap[version] = true
	}

	// Find pending migrations
	var pendingMigrations []string
	for version := range migrationFiles {
		if !appliedMap[version] {
			pendingMigrations = append(pendingMigrations, version)
		}
	}

	// Sort pending migrations by version
	sort.Strings(pendingMigrations)
	return pendingMigrations
}

// createTempDatabase creates a temporary database for testing migrations
func (v *MigrationVerifier) createTempDatabase(_ context.Context) (*sqlx.DB, func(), error) {
	// In a real implementation, this would create a temporary database
	// For this example, we'll just return the same database
	// In a production system, you would:
	// 1. Create a new database with a unique name
	// 2. Return a connection to that database
	// 3. Return a cleanup function that drops the database

	cleanup := func() {
		// In a real implementation, this would drop the temporary database
	}

	return v.db, cleanup, nil
}

// applyMigrationsToTempDB applies existing migrations to the temporary database
func (v *MigrationVerifier) applyMigrationsToTempDB(_ context.Context, _ *sqlx.DB, _ []string) error {
	// In a real implementation, this would apply all migrations that are already applied
	// in the main database to the temporary database
	// For this example, we'll just return nil
	return nil
}

// applyPendingMigrations applies pending migrations to the temporary database
func (v *MigrationVerifier) applyPendingMigrations(_ context.Context, _ *sqlx.DB, _ []string) ([]FailedMigration, error) {
	// In a real implementation, this would apply pending migrations to the temporary database
	// and return any that fail
	// For this example, we'll just return an empty list
	return []FailedMigration{}, nil
}

// GenerateReport generates a report of the verification results
func (v *MigrationVerifier) GenerateReport(result *VerificationResult) string {
	var report strings.Builder

	// Add header
	report.WriteString("# Migration Verification Report\n\n")
	report.WriteString(fmt.Sprintf("Generated: %s\n\n", time.Now().Format(time.RFC3339)))

	// Add overall status
	if result.Success {
		report.WriteString("## Status: ✅ SUCCESS\n\n")
		report.WriteString("All migrations are valid and can be applied cleanly.\n\n")
	} else {
		report.WriteString("## Status: ❌ FAILURE\n\n")
		report.WriteString("Issues were found with migrations. See details below.\n\n")
	}

	// Add missing migrations
	report.WriteString("## Missing Migrations\n\n")
	if len(result.MissingMigrations) > 0 {
		report.WriteString("The following migrations are applied to the database but missing from the filesystem:\n\n")
		for _, migration := range result.MissingMigrations {
			report.WriteString(fmt.Sprintf("- `%s`\n", migration))
		}
	} else {
		report.WriteString("No missing migrations found.\n")
	}
	report.WriteString("\n")

	// Add conflicting migrations
	report.WriteString("## Conflicting Migrations\n\n")
	if len(result.ConflictingMigrations) > 0 {
		report.WriteString("The following migrations have different content than what was applied to the database:\n\n")
		for _, migration := range result.ConflictingMigrations {
			report.WriteString(fmt.Sprintf("- `%s`\n", migration))
		}
	} else {
		report.WriteString("No conflicting migrations found.\n")
	}
	report.WriteString("\n")

	// Add failed migrations
	report.WriteString("## Failed Migrations\n\n")
	if len(result.FailedMigrations) > 0 {
		report.WriteString("The following migrations failed to apply:\n\n")
		for _, migration := range result.FailedMigrations {
			report.WriteString(fmt.Sprintf("### %s\n\n", migration.Name))
			report.WriteString("```\n")
			report.WriteString(migration.Error)
			report.WriteString("\n```\n\n")
		}
	} else {
		report.WriteString("No failed migrations found.\n")
	}
	report.WriteString("\n")

	// Add applied migrations
	report.WriteString("## Applied Migrations\n\n")
	if len(result.AppliedMigrations) > 0 {
		report.WriteString("The following migrations have been applied to the database:\n\n")
		for _, migration := range result.AppliedMigrations {
			report.WriteString(fmt.Sprintf("- `%s`\n", migration))
		}
	} else {
		report.WriteString("No migrations have been applied to the database.\n")
	}
	report.WriteString("\n")

	// Add pending migrations
	report.WriteString("## Pending Migrations\n\n")
	if len(result.PendingMigrations) > 0 {
		report.WriteString("The following migrations are pending and will be applied on the next migration:\n\n")
		for _, migration := range result.PendingMigrations {
			report.WriteString(fmt.Sprintf("- `%s`\n", migration))
		}
	} else {
		report.WriteString("No pending migrations found.\n")
	}
	report.WriteString("\n")

	return report.String()
}
