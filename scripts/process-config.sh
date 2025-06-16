#!/bin/bash
# Process configuration template with environment variables

set -e

# Source environment variables
if [ -f ".env.production" ]; then
    export $(grep -v '^#' .env.production | xargs)
fi

# Function to expand environment variables in template
expand_template() {
    local template=$1
    local output=$2
    
    # Use envsubst to replace variables
    envsubst < "$template" > "$output"
}

# Process backend configuration
if [ -f "backend/config.template.json" ]; then
    echo "Processing backend configuration..."
    expand_template "backend/config.template.json" "backend/config.json"
    echo "✓ Generated backend/config.json"
fi

# Validate generated configuration
if [ -f "backend/config.json" ]; then
    # Check if any variables are still unexpanded
    if grep -q '\${' backend/config.json; then
        echo "Warning: Some configuration variables may not be expanded properly"
        grep '\${' backend/config.json || true
    fi
fi
