# Makefile for backend tasks

# Database connection string (can be overridden with environment variable)
DATABASE_URL ?= postgres://postgres:123456789@localhost:5432/studio?sslmode=disable

# Go build flags
GOFLAGS = -mod=mod

.PHONY: build test clean deps dev-tools generate-mocks help

# Build the application
build:
	@echo "Building application..."
	go build -o bin/studio ./cmd/apiserver

# Build for production
build-prod:
	@echo "Building for production..."
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o bin/domainflow-apiserver ./cmd/apiserver

# Run the application
run:
	@echo "Running application..."
	go run ./cmd/apiserver

# Run tests
test:
	@echo "Running tests..."
	go test -v -coverprofile=coverage.out ./...

# Run tests with coverage
test-cover:
	@$(MAKE) test
	go tool cover -html=coverage.out
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
	@echo "  build             - Build the application for development"
	@echo "  build-prod        - Build the application for production (Linux/amd64)"
	@echo "  run               - Run the application in development mode"
	@echo "  test              - Run tests"
	@echo "  test-cover        - Run tests with coverage report"
	@echo "  clean             - Clean build artifacts"
	@echo "  deps              - Install dependencies"
	@echo "  dev-tools         - Install development tools"
	@echo "  generate-mocks    - Generate mock implementations"
	@echo "  help              - Show this help message"
	@echo ""
	@echo "Database deployment (no migrations needed):"
	@echo "  Use: psql \"connection_string\" < database/production_schema_v3.sql"
	@echo "  Or:  psql \"connection_string\" < database/schema.sql"
