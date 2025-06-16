package main

import (
	"flag"
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	_ "github.com/golang-migrate/migrate/v4/source/github"
)

func main() {
	// Define command line flags
	var (
		dsn           string
		migrationsDir string
		direction     string
	)

	flag.StringVar(&dsn, "dsn", "", "PostgreSQL connection string (required)")
	flag.StringVar(&migrationsDir, "migrations", "database/migrations", "Directory containing migration files")
	flag.StringVar(&direction, "direction", "up", "Migration direction (up or down)")
	flag.Parse()

	// Validate flags
	if dsn == "" {
		dsn = os.Getenv("POSTGRES_DSN")
		if dsn == "" {
			log.Fatal("Database connection string (DSN) is required. Provide via -dsn flag or POSTGRES_DSN environment variable")
		}
	}

	// Use local filesystem for migrations
	migrationsURL := "file://" + migrationsDir
	log.Printf("Using migrations from: %s", migrationsDir)

	// Create a new migrate instance
	m, err := migrate.New(migrationsURL, dsn)
	if err != nil {
		log.Fatalf("Failed to create migrator: %v", err)
	}

	// Run migrations based on direction
	switch direction {
	case "up":
		log.Println("Running migrations up...")
		err = m.Up()
		if err == migrate.ErrNoChange {
			log.Println("No migrations to run, database is up to date")
		} else if err != nil {
			log.Fatalf("Migration failed: %v", err)
		} else {
			log.Println("Migrations completed successfully")
		}
	case "down":
		log.Println("Running migrations down...")
		err = m.Down()
		if err != nil && err != migrate.ErrNoChange {
			log.Fatalf("Migration failed: %v", err)
		} else {
			log.Println("Migrations rolled back successfully")
		}
	default:
		log.Fatalf("Invalid migration direction: %s. Use 'up' or 'down'.", direction)
	}
}
