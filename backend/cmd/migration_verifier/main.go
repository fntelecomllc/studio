package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/migrationverifier"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	// Parse command line flags
	dsn := flag.String("dsn", "", "PostgreSQL connection string (required)")
	outputFile := flag.String("output", "migration_verification_report.md", "Output file for the verification report")
	flag.Parse()

	// Validate required flags
	if *dsn == "" {
		if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
			*dsn = envDSN
		} else {
			log.Fatal("Error: --dsn flag or DATABASE_URL environment variable is required")
		}
	}

	// Connect to the database
	log.Println("Connecting to database...")
	db, err := sqlx.Connect("postgres", *dsn)
	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}
	defer db.Close()

	// Set connection pool settings
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Minute * 5)

	// Create the migration verifier
	log.Println("Creating migration verifier...")
	verifier := migrationverifier.NewMigrationVerifier(db)

	// Verify migrations
	log.Println("Verifying migrations...")
	result, err := verifier.VerifyMigrations()
	if err != nil {
		log.Fatalf("Error verifying migrations: %v", err)
	}

	// Generate report
	log.Println("Generating report...")
	report := verifier.GenerateReport(result)

	// Write report to file
	err = os.WriteFile(*outputFile, []byte(report), 0644)
	if err != nil {
		log.Fatalf("Error writing report to file: %v", err)
	}

	// Print summary
	printSummary(result)

	// Exit with error if there are issues
	if !result.Success {
		os.Exit(1)
	}

	log.Printf("Migration verification complete. Report written to %s", *outputFile)
}

// printSummary prints a summary of the verification results
func printSummary(result *migrationverifier.VerificationResult) {
	fmt.Println("\nMigration Verification Summary:")
	fmt.Println("-------------------------------")

	if result.Success {
		fmt.Println("✅ SUCCESS: All migrations are valid and can be applied cleanly.")
	} else {
		fmt.Println("❌ FAILURE: Issues found with migrations.")

		if len(result.MissingMigrations) > 0 {
			fmt.Printf("Missing Migrations: %d\n", len(result.MissingMigrations))
			for _, migration := range result.MissingMigrations {
				fmt.Printf("  - %s\n", migration)
			}
		}

		if len(result.ConflictingMigrations) > 0 {
			fmt.Printf("Conflicting Migrations: %d\n", len(result.ConflictingMigrations))
			for _, migration := range result.ConflictingMigrations {
				fmt.Printf("  - %s\n", migration)
			}
		}

		if len(result.FailedMigrations) > 0 {
			fmt.Printf("Failed Migrations: %d\n", len(result.FailedMigrations))
			for _, migration := range result.FailedMigrations {
				fmt.Printf("  - %s: %s\n", migration.Name, migration.Error)
			}
		}
	}
}
