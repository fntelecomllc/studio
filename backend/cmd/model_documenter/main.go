package main

import (
	"flag"
	"log"
	"os"
	"time"

	"github.com/fntelecomllc/studio/backend/internal/modeldocumenter"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	// Parse command line flags
	dsn := flag.String("dsn", "", "PostgreSQL connection string (required)")
	outputFile := flag.String("output", "data_model_documentation.md", "Output file for the documentation")
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

	// Create the model documenter
	log.Println("Creating model documenter...")
	documenter := modeldocumenter.NewModelDocumenter(db)

	// Generate documentation
	log.Println("Generating documentation...")
	documentation, err := documenter.GenerateDocumentation()
	if err != nil {
		log.Fatalf("Error generating documentation: %v", err)
	}

	// Write documentation to file
	err = os.WriteFile(*outputFile, []byte(documentation), 0644)
	if err != nil {
		log.Fatalf("Error writing documentation to file: %v", err)
	}

	log.Printf("Documentation generated successfully. Written to %s", *outputFile)
}
