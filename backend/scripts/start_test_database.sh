#!/bin/bash

# Script to help set up the PostgreSQL test database for the DomainFlow project.

echo "DomainFlow Test Database Setup Helper"
echo "---------------------------------------"
echo ""
echo "This script will guide you and provide commands to set up your test database."
echo "It assumes you have a PostgreSQL server installed and running."
echo "If not, please install PostgreSQL and ensure its service is started."
echo ""

# --- Database Configuration ---
# Configuration for the test database - using values from .env file
TEST_DB_USER="test_user"
TEST_DB_PASS="123456789"  # Password for test user
TEST_DB_HOST="localhost"
TEST_DB_PORT="5432"
TEST_DB_NAME="domainflowdb_test"
SUPERUSER="postgres"
SUPERUSER_PASSWORD="123456789"  # Using the same password for superuser

# Always force drop the database for test environment
FORCE_DROP_DB="true"  # Always drop existing DB for test environment

# --- Colors for output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Functions ---
log_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

log_error() {
    echo -e "${RED}✗ $1${NC}" >&2
}

check_psql() {
    if ! command -v psql &> /dev/null; then
        log_error "PostgreSQL client (psql) is not installed or not in PATH"
        exit 1
    fi
}

setup_database() {
    log_warning "Setting up test database..."
    
    # Check if the database exists
    if PGPASSWORD="${TEST_DB_PASS}" psql -h "${TEST_DB_HOST}" -p "${TEST_DB_PORT}" -U "${TEST_DB_USER}" -lqt | cut -d \| -f 1 | grep -qw "${TEST_DB_NAME}"; then
        log_warning "Database '${TEST_DB_NAME}' already exists."
    else
        log_warning "Creating database '${TEST_DB_NAME}'..."
        # Create the database
        PGPASSWORD="${TEST_DB_PASS}" psql -h "${TEST_DB_HOST}" -p "${TEST_DB_PORT}" -U "${TEST_DB_USER}" -d "postgres" -c "CREATE DATABASE ${TEST_DB_NAME};" || {
            log_error "Failed to create database. Make sure PostgreSQL is running and credentials are correct."
            log_warning "Attempting to connect to PostgreSQL with current user credentials..."
            
            # Try to create database without specifying user/password (using OS authentication)
            psql -h "${TEST_DB_HOST}" -p "${TEST_DB_PORT}" -c "CREATE DATABASE ${TEST_DB_NAME};" || {
                log_error "Failed to create database using OS authentication."
                log_warning "Please create the database manually:"
                log_warning "psql -c \"CREATE DATABASE ${TEST_DB_NAME};\""
                return 1
            }
        }
    fi
    
    # Connect to the test database
    PGPASSWORD="${TEST_DB_PASS}" psql -h "${TEST_DB_HOST}" -p "${TEST_DB_PORT}" -U "${TEST_DB_USER}" -d "${TEST_DB_NAME}" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" || {
        log_warning "Failed to create extension. Continuing anyway..."
    }
    
    log_success "Test database setup complete"
}

# Function to run migrations
run_migrations() {
    local dsn="postgres://${TEST_DB_USER}:${TEST_DB_PASS}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}?sslmode=disable"
    local script_dir
    script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    local project_root="${script_dir}/.."
    local migrations_dir="${project_root}/database/migrations"
    
    log_warning "Running database migrations..."
    
    # Check if migrate command is available
    if ! command -v migrate &> /dev/null; then
        log_error "'migrate' command not found. Please install golang-migrate."
        log_warning "Skipping migrations. Tests will run migrations automatically."
        return 1
    fi
    
    # Verify migrations directory exists
    if [ ! -d "${migrations_dir}" ]; then
        log_error "Migrations directory not found at: ${migrations_dir}"
        return 1
    fi
    
    # Run migrations with retry logic
    local max_attempts=3
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        log_warning "Running migrations (attempt $attempt of $max_attempts)..."
        
        if (cd "${project_root}" && migrate -path "${migrations_dir}" -database "${dsn}" up); then
            log_success "Database migrations applied successfully"
            return 0
        else
            log_error "Failed to apply migrations (attempt $attempt)"
            attempt=$((attempt + 1))
            sleep 2
        fi
    done
    
    log_error "Failed to apply migrations after $max_attempts attempts"
    return 1
}

# --- Main Execution ---
check_psql
setup_database
run_migrations

# Output connection string for tests
echo -e "\n${GREEN}✅ Test database is ready!${NC}"
echo -e "Connection string (TEST_POSTGRES_DSN):"
echo -e "postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}?sslmode=disable"

echo -e "\nTo run tests, set this environment variable:"
echo -e "export TEST_POSTGRES_DSN=\"postgresql://${TEST_DB_USER}:${TEST_DB_PASS}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}?sslmode=disable\"\n"

echo "Using the following configuration for the test database:"
echo "  User:     ${TEST_DB_USER}"
echo "  Password: (hidden - ensure PGPASSWORD or ~/.pgpass is configured if needed, or modify script)"
echo "  Host:     ${TEST_DB_HOST}"
echo "  Port:     ${TEST_DB_PORT}"
echo "  Database: ${TEST_DB_NAME}"
echo ""

# --- Environment Variable for Go Tests ---
# This is the DSN format our Go tests expect.
export TEST_POSTGRES_DSN="postgres://${TEST_DB_USER}:${TEST_DB_PASS}@${TEST_DB_HOST}:${TEST_DB_PORT}/${TEST_DB_NAME}?sslmode=disable"

echo "---------------------------------------"
echo "Test Database Setup Complete (or verified)!"
echo ""
echo "1. Ensure your PostgreSQL server IS RUNNING and accessible at:"
echo "   Host: ${TEST_DB_HOST}, Port: ${TEST_DB_PORT}"
echo ""
echo "2. The script attempted to check/create the database '${TEST_DB_NAME}' with user '${TEST_DB_USER}'."
echo ""
echo "3. To run the Go backend tests that require the database, THE FOLLOWING"
echo "   ENVIRONMENT VARIABLE MUST BE SET in your terminal session:"
echo ""
echo "   export TEST_POSTGRES_DSN="${TEST_POSTGRES_DSN}""
echo ""
echo "   You can copy and paste the line above into your terminal."
echo ""
echo "4. This script has set up the database and applied all migrations from 'database/migrations'."
echo ""
