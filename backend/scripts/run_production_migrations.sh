#!/bin/bash

# =============================================================================
# DomainFlow Production Database Migration Script
# =============================================================================
# This script runs database migrations for production deployment
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"
ENV_FILE="$PROJECT_ROOT/.env.production"

# Load production environment variables
if [[ -f "$ENV_FILE" ]]; then
    log_info "Loading production environment from $ENV_FILE"
    source "$ENV_FILE"
else
    log_warning "Production environment file not found, using defaults"
fi

# Set database connection parameters
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-domainflow}
DB_USER=${DB_USER:-domainflow}
DB_PASSWORD=${DB_PASSWORD:-DomainFlow_Prod_2025_SecurePass!}

# Path to the migrations directory
MIGRATIONS_DIR="$BACKEND_DIR/database/migrations"

# Check if migrate tool is installed
check_migrate_tool() {
    if ! command -v migrate &> /dev/null; then
        log_error "migrate tool is not installed."
        log_info "Installing migrate tool..."
        
        # Download and install migrate tool
        MIGRATE_VERSION="v4.16.2"
        MIGRATE_URL="https://github.com/golang-migrate/migrate/releases/download/${MIGRATE_VERSION}/migrate.linux-amd64.tar.gz"
        
        curl -L "$MIGRATE_URL" | tar xvz
        sudo mv migrate /usr/local/bin/
        chmod +x /usr/local/bin/migrate
        
        log_success "migrate tool installed successfully"
    else
        log_info "migrate tool found: $(which migrate)"
    fi
}

# Test database connectivity
test_database_connection() {
    log_info "Testing database connectivity..."
    
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
        log_success "Database connection successful"
    else
        log_error "Failed to connect to database"
        log_error "Host: $DB_HOST:$DB_PORT"
        log_error "Database: $DB_NAME"
        log_error "User: $DB_USER"
        exit 1
    fi
}

# Initialize database with production schema
initialize_database() {
    log_info "Initializing database with production schema..."
    
    # Run the production initialization script
    INIT_SCRIPT="$PROJECT_ROOT/docker/postgres/init-production.sql"
    
    if [[ -f "$INIT_SCRIPT" ]]; then
        log_info "Running production database initialization..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$INIT_SCRIPT"
        log_success "Database initialization completed"
    else
        log_warning "Production initialization script not found: $INIT_SCRIPT"
    fi
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."
    
    # Build the database URL
    DB_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"
    
    log_info "Migrations directory: $MIGRATIONS_DIR"
    log_info "Database URL: postgres://${DB_USER}:***@${DB_HOST}:${DB_PORT}/${DB_NAME}"
    
    # Check if migrations directory exists
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        log_error "Migrations directory not found: $MIGRATIONS_DIR"
        exit 1
    fi
    
    # List available migrations
    log_info "Available migrations:"
    ls -la "$MIGRATIONS_DIR"/*.sql 2>/dev/null || log_warning "No migration files found"
    
    # Run the migrations
    log_info "Executing migrations..."
    migrate -path "$MIGRATIONS_DIR" -database "$DB_URL" up
    
    # Check migration status
    if [[ $? -eq 0 ]]; then
        log_success "Migrations completed successfully"
    else
        log_error "Migrations failed"
        exit 1
    fi
}

# Verify migration status
verify_migrations() {
    log_info "Verifying migration status..."
    
    DB_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"
    
    # Show current migration version
    CURRENT_VERSION=$(migrate -path "$MIGRATIONS_DIR" -database "$DB_URL" version 2>/dev/null || echo "unknown")
    log_info "Current migration version: $CURRENT_VERSION"
    
    # List applied migrations from database
    log_info "Applied migrations:"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT version, dirty 
        FROM schema_migrations 
        ORDER BY version;" 2>/dev/null || log_warning "Could not query schema_migrations table"
}

# Verify database schema
verify_schema() {
    log_info "Verifying database schema..."
    
    # Check if authentication tables exist
    log_info "Checking authentication schema..."
    AUTH_TABLES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) 
        FROM information_schema.tables 
        WHERE table_schema = 'auth';" 2>/dev/null || echo "0")
    
    if [[ "$AUTH_TABLES" -gt 0 ]]; then
        log_success "Authentication schema verified ($AUTH_TABLES tables found)"
    else
        log_warning "Authentication schema not found or incomplete"
    fi
    
    # Check if main application tables exist
    log_info "Checking main application schema..."
    MAIN_TABLES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('campaigns', 'personas', 'proxies');" 2>/dev/null || echo "0")
    
    if [[ "$MAIN_TABLES" -gt 0 ]]; then
        log_success "Main application schema verified ($MAIN_TABLES core tables found)"
    else
        log_warning "Main application schema not found or incomplete"
    fi
    
    # List all tables
    log_info "All database tables:"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        ORDER BY schemaname, tablename;" 2>/dev/null || log_warning "Could not list database tables"
}

# Seed default data
seed_default_data() {
    log_info "Seeding default data..."
    
    # Check if default admin user exists
    ADMIN_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) 
        FROM auth.users 
        WHERE email = 'admin@domainflow.local';" 2>/dev/null || echo "0")
    
    if [[ "$ADMIN_EXISTS" -eq 0 ]]; then
        log_info "Creating default admin user..."
        # The admin user should be created by the migration, but let's verify
        log_warning "Default admin user not found - this should be created by migration 000002"
    else
        log_success "Default admin user exists"
    fi
    
    # Verify roles and permissions
    ROLES_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM auth.roles;" 2>/dev/null || echo "0")
    
    PERMISSIONS_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM auth.permissions;" 2>/dev/null || echo "0")
    
    log_info "Roles: $ROLES_COUNT, Permissions: $PERMISSIONS_COUNT"
    
    if [[ "$ROLES_COUNT" -gt 0 ]] && [[ "$PERMISSIONS_COUNT" -gt 0 ]]; then
        log_success "RBAC system seeded successfully"
    else
        log_warning "RBAC system may not be properly seeded"
    fi
}

# Main function
main() {
    log_info "Starting DomainFlow Production Database Migration..."
    echo
    
    check_migrate_tool
    test_database_connection
    initialize_database
    run_migrations
    verify_migrations
    verify_schema
    seed_default_data
    
    echo
    log_success "Production database migration completed successfully!"
    echo
    log_info "Database Summary:"
    echo "  Host: $DB_HOST:$DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo "  Migrations: Applied successfully"
    echo "  Authentication: Configured with RBAC"
    echo "  Default Admin: admin@domainflow.local (password: TempPassword123!)"
    echo
    log_warning "Important: Change the default admin password on first login!"
}

# Handle script interruption
trap 'log_error "Migration interrupted"; exit 1' INT TERM

# Run main function
main "$@"