#!/bin/bash

# Script to run database migrations

# Set the database connection string
# Use the same credentials as in run_enhanced.sh
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-domainflowdb_test}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-123456789}

# Path to the migrations directory
MIGRATIONS_DIR="$(dirname "$(dirname "$0")")/database/migrations"

# Check if migrate tool is installed
if ! command -v migrate &> /dev/null; then
    echo "Error: migrate tool is not installed."
    echo "Please install it from https://github.com/golang-migrate/migrate"
    exit 1
fi

# Build the database URL
DB_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable"

# Run the migrations
echo "Running migrations from ${MIGRATIONS_DIR} to ${DB_URL}..."
migrate -path ${MIGRATIONS_DIR} -database ${DB_URL} up

# Check the migration status
if [ $? -eq 0 ]; then
    echo "Migrations completed successfully."
else
    echo "Error: Migrations failed."
    exit 1
fi