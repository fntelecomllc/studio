# Makefile for backend tasks

# Database connection string (can be overridden with environment variable)
DATABASE_URL ?= postgres://postgres:123456789@localhost:5432/studio?sslmode=disable

# Go build flags
GOFLAGS = -mod=mod

.PHONY: migrate-up migrate-down migrate-force migrate-version migrate-create build test

# Run all migrations
migrate-up:
	@echo "Running migrations..."
	@go run -mod=mod ./scripts/migrate.go -action=up -database="$(DATABASE_URL)"

# Rollback the last migration
migrate-down:
	@echo "Rolling back last migration..."
	@go run -mod=mod ./scripts/migrate.go -action=down -database="$(DATABASE_URL)"

# Force a specific migration version
migrate-force:
	@if [ -z "$(VERSION)" ]; then \
		echo "Error: VERSION must be specified"; \
		echo "Usage: make migrate-force VERSION=<version>"; \
		exit 1; \
	fi
	@go run -mod=mod ./scripts/migrate.go -action=force -version=$(VERSION) -database="$(DATABASE_URL)"

# Show current migration version
migrate-version:
	@go run -mod=mod ./scripts/migrate.go -action=version -database="$(DATABASE_URL)"

# Create a new migration file
migrate-create:
	@if [ -z "$(NAME)" ]; then \
		echo "Error: NAME must be specified"; \
		echo "Usage: make migrate-create NAME=<migration_name>"; \
		exit 1; \
	fi
	@echo "Creating new migration: $(NAME)"
	@mkdir -p migrations
	@timestamp=$$(date +%Y%m%d%H%M%S); \
	filename="migrations/$${timestamp}_$(NAME)"; \
	touch "$${filename}.up.sql"; \
	touch "$${filename}.down.sql"; \
	echo "Created migrations: $${filename}.{up,down}.sql"

# Build the application
build:
	@echo "Building application..."
	go build -o bin/studio ./cmd/apiserver

# Run tests
test:
	@echo "Running tests..."
	go test -v -coverprofile=coverage.out ./...

# Run tests with coverage
test-cover:
	@$(MAKE) test
	go tool cover -html=coverage.out

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf bin/ coverage.out

# Install dependencies
deps:
	@echo "Installing dependencies..."
	go mod download

# Install development tools
dev-tools:
	@echo "Installing development tools..."
	go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	go install github.com/vektra/mockery/v2@latest

# Generate mocks
generate-mocks:
	@echo "Generating mocks..."
	go generate ./...

# Default target
.DEFAULT_GOAL := help

# Show help
help:
	@echo "Available targets:"
	@echo "  migrate-up         - Run all pending migrations"
	@echo "  migrate-down       - Rollback the last migration"
	@echo "  migrate-force      - Force a specific migration version (VERSION=number)"
	@echo "  migrate-version    - Show current migration version"
	@echo "  migrate-create     - Create new migration files (NAME=description)"
	@echo "  build             - Build the application"
	@echo "  test              - Run tests"
	@echo "  test-cover        - Run tests with coverage report"
	@echo "  clean             - Clean build artifacts"
	@echo "  deps              - Install dependencies"
	@echo "  dev-tools         - Install development tools"
	@echo "  generate-mocks    - Generate mock implementations"
	@echo "  help              - Show this help message"
