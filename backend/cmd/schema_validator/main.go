package main

import (
	"flag"
	"log"
	"os"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/schemavalidator"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	// Parse command line flags
	dsn := flag.String("dsn", "", "PostgreSQL connection string (required)")
	outputFile := flag.String("output", "schema_validation_report.md", "Output file for the validation report")
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

	// Create the model wrapper
	log.Println("Creating model wrapper...")
	wrapper := schemavalidator.NewModelWrapper(db)

	// Validate schema
	log.Println("Validating schema...")
	err = wrapper.ValidateSchema(*outputFile)
	if err != nil {
		log.Fatalf("Error validating schema: %v", err)
	}

	log.Printf("Schema validation complete. Report written to %s", *outputFile)
}
