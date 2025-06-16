#!/bin/bash

# Secure deployment script with zero-configuration

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}DomainFlow Secure Deployment${NC}"
echo "============================="

# Check if configuration exists
if [ ! -f ".env.production" ]; then
    echo -e "${YELLOW}No configuration found. Running configuration generator...${NC}"
    ./scripts/generate-config.sh
fi

# Process configuration templates
echo -e "\n${BLUE}Processing configuration templates...${NC}"
./scripts/process-config.sh

# Validate configuration
if [ ! -f "backend/config.json" ]; then
    echo -e "${RED}Error: Failed to generate backend configuration${NC}"
    exit 1
fi

# Build and deploy
echo -e "\n${BLUE}Building and deploying DomainFlow...${NC}"
cd docker
docker-compose -f docker-compose.production.yml up --build -d

# Wait for services to be healthy
echo -e "\n${BLUE}Waiting for services to be healthy...${NC}"
sleep 10

# Check service health
docker-compose -f docker-compose.production.yml ps

# Run migrations
echo -e "\n${BLUE}Running database migrations...${NC}"
docker exec domainflow-backend /app/migrate up

# Create admin user
echo -e "\n${BLUE}Creating admin user...${NC}"
source ../.env.production
docker exec domainflow-backend /app/domainflow-api create-admin \
    --email "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD"

echo -e "\n${GREEN}✓ Deployment complete!${NC}"
echo -e "\n${BLUE}Admin Credentials:${NC}"
echo -e "Email: ${ADMIN_EMAIL}"
echo -e "Password: ${ADMIN_PASSWORD}"
echo -e "\n${YELLOW}Please save these credentials securely and change the password after first login.${NC}"
echo -e "\nAccess DomainFlow at: http://localhost"
