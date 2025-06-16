#!/bin/bash

# DomainFlow Zero-Configuration Generator
# Automatically generates all required secrets and configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}DomainFlow Zero-Configuration Generator${NC}"
echo "========================================"

# Function to generate secure random string
generate_secret() {
    local length=${1:-32}
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# Function to generate secure password
generate_password() {
    local length=${1:-24}
    # Generate a password with mixed case, numbers, and special characters
    local password=$(openssl rand -base64 $length | tr -d "=/" | cut -c1-$length)
    # Ensure it has at least one number and one special character
    echo "${password}$(shuf -i 0-9 -n 1)@"
}

# Check if configuration already exists
if [ -f ".env.production" ]; then
    echo -e "${YELLOW}Warning: .env.production already exists${NC}"
    read -p "Do you want to regenerate all configurations? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborting configuration generation"
        exit 0
    fi
    # Backup existing configuration
    cp .env.production .env.production.backup.$(date +%Y%m%d_%H%M%S)
    echo -e "${GREEN}Backed up existing configuration${NC}"
fi

echo -e "\n${BLUE}Generating secure configurations...${NC}"

# Generate database credentials
DB_PASSWORD=$(generate_password 32)
DB_NAME="domainflow_production"
DB_USER="domainflow"

# Generate authentication secrets
JWT_SECRET=$(generate_secret 64)
SESSION_SECRET=$(generate_secret 64)
ENCRYPTION_KEY=$(generate_secret 32)
API_KEY_SALT=$(generate_secret 32)

# Generate admin credentials
ADMIN_EMAIL="admin@domainflow.local"
ADMIN_PASSWORD=$(generate_password 16)

# Create .env.production file
cat > .env.production << EOF
# DomainFlow Production Configuration
# Generated on $(date)
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

# Database Configuration
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=${DB_NAME}
DATABASE_USER=${DB_USER}
DATABASE_PASSWORD=${DB_PASSWORD}
DATABASE_SSL_MODE=disable

# Redis Configuration
REDIS_URL=redis://redis:6379/0

# Authentication & Security
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
API_KEY_SALT=${API_KEY_SALT}
SESSION_TIMEOUT=24h
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_HTTPONLY=true
SESSION_COOKIE_SAMESITE=strict

# CORS Configuration
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
CORS_ALLOWED_METHODS=GET,POST,PUT,DELETE,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization,X-Requested-With
CORS_ALLOW_CREDENTIALS=true

# Application Settings
NODE_ENV=production
APP_ENV=production
NEXT_PUBLIC_API_URL=/api/v2
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100

# Worker Configuration
WORKER_COUNT=5
WORKER_BATCH_SIZE=100
WORKER_POLL_INTERVAL=5s

# Initial Admin User
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF

# Create backend configuration template
cat > backend/config.template.json << 'EOF'
{
  "server": {
    "port": "${SERVER_PORT:-8080}",
    "streamChunkSize": 50,
    "ginMode": "${GIN_MODE:-debug}"
  },
  "database": {
    "host": "${DATABASE_HOST}",
    "port": ${DATABASE_PORT},
    "name": "${DATABASE_NAME}",
    "user": "${DATABASE_USER}",
    "password": "${DATABASE_PASSWORD}",
    "sslmode": "${DATABASE_SSL_MODE:-disable}",
    "maxConnections": 100,
    "maxIdleConnections": 20,
    "connectionLifetime": 600
  },
  "auth": {
    "jwtSecret": "${JWT_SECRET}",
    "sessionSecret": "${SESSION_SECRET}",
    "encryptionKey": "${ENCRYPTION_KEY}",
    "apiKeySalt": "${API_KEY_SALT}",
    "sessionTimeout": "${SESSION_TIMEOUT:-24h}",
    "cookieSecure": ${COOKIE_SECURE:-true},
    "cookieHttpOnly": true,
    "cookieSameSite": "strict"
  },
  "dnsValidator": {
    "resolvers": [
      "https://cloudflare-dns.com/dns-query",
      "1.1.1.1:53",
      "https://dns.google/dns-query",
      "8.8.8.8:53",
      "9.9.9.9:53"
    ],
    "useSystemResolvers": false,
    "queryTimeoutSeconds": 5,
    "maxDomainsPerRequest": 100,
    "resolverStrategy": "random_rotation",
    "concurrentQueriesPerDomain": 2,
    "queryDelayMaxMs": 20,
    "maxConcurrentGoroutines": 15,
    "rateLimitDps": 10,
    "rateLimitBurst": 5
  },
  "httpValidator": {
    "userAgents": [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/115.0"
    ],
    "defaultHeaders": {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      "DNT": "1",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1"
    },
    "timeoutSeconds": 30,
    "followRedirects": true,
    "maxRedirects": 5,
    "maxDomainsPerRequest": 50,
    "concurrentRequestsPerDomain": 1,
    "requestDelayMaxMs": 100,
    "maxConcurrentGoroutines": 10,
    "rateLimitRps": 5,
    "rateLimitBurst": 10
  },
  "logging": {
    "level": "${LOG_LEVEL:-info}",
    "enableFileLogging": true,
    "logDirectory": "logs",
    "maxFileSize": 100,
    "maxBackups": 5,
    "maxAge": 30,
    "enableJSONFormat": true,
    "enableRequestLogging": true,
    "enablePerformanceLogging": true
  },
  "worker": {
    "numWorkers": ${WORKER_COUNT:-5},
    "pollIntervalSeconds": 5,
    "batchSize": ${WORKER_BATCH_SIZE:-100},
    "maxRetries": 3,
    "retryDelaySeconds": 30
  }
}
EOF

# Create configuration processor script
cat > scripts/process-config.sh << 'EOF'
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
EOF

chmod +x scripts/process-config.sh

# Create Docker secrets file
cat > docker/secrets.env << EOF
# Docker Secrets - Generated on $(date)
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

POSTGRES_DB=${DB_NAME}
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASSWORD}
EOF

# Update docker-compose to use secrets
cat > docker/docker-compose.production.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: domainflow-postgres
    env_file:
      - ./secrets.env
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres/init-production.sql:/docker-entrypoint-initdb.d/01-init.sql
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - domainflow-network

  redis:
    image: redis:7-alpine
    container_name: domainflow-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - domainflow-network

  backend:
    build:
      context: ../
      dockerfile: docker/backend/Dockerfile
    container_name: domainflow-backend
    env_file:
      - ../.env.production
    volumes:
      - ../backend/config.json:/app/config.json:ro
      - backend_logs:/app/logs
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v2/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - domainflow-network

  frontend:
    build:
      context: ../
      dockerfile: docker/frontend/Dockerfile
    container_name: domainflow-frontend
    env_file:
      - ../.env.production
    ports:
      - "3000:3000"
    depends_on:
      - backend
    networks:
      - domainflow-network

  nginx:
    build:
      context: ./nginx
      dockerfile: Dockerfile
    container_name: domainflow-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - nginx_logs:/var/log/nginx
      - ./nginx/nginx.prod.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - frontend
      - backend
    networks:
      - domainflow-network

volumes:
  postgres_data:
  redis_data:
  backend_logs:
  nginx_logs:

networks:
  domainflow-network:
    driver: bridge
EOF

# Update init SQL to use environment variables
cat > docker/postgres/init-production-template.sql << 'EOF'
-- DomainFlow Production Database Initialization
-- This file is processed with environment variables

-- Create auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- Create domainflow user if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DATABASE_USER}') THEN
        CREATE ROLE ${DATABASE_USER} WITH LOGIN PASSWORD '${DATABASE_PASSWORD}';
    END IF;
END $$;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE ${DATABASE_NAME} TO ${DATABASE_USER};
GRANT ALL ON SCHEMA public TO ${DATABASE_USER};
GRANT ALL ON SCHEMA auth TO ${DATABASE_USER};

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EOF

# Generate processed init SQL
echo -e "\n${BLUE}Processing configuration templates...${NC}"
./scripts/process-config.sh

# Process init SQL
envsubst < docker/postgres/init-production-template.sql > docker/postgres/init-production.sql

# Update deployment scripts
cat > deploy-secure.sh << 'EOF'
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
EOF

chmod +x deploy-secure.sh

# Output summary
echo -e "\n${GREEN}✓ Zero-configuration setup complete!${NC}"
echo -e "\n${BLUE}Generated files:${NC}"
echo "  - .env.production (main configuration)"
echo "  - backend/config.template.json (backend config template)"
echo "  - docker/secrets.env (Docker secrets)"
echo "  - scripts/process-config.sh (config processor)"
echo "  - deploy-secure.sh (secure deployment script)"

echo -e "\n${BLUE}Generated credentials:${NC}"
echo "  Database Password: ${DB_PASSWORD}"
echo "  Admin Email: ${ADMIN_EMAIL}"
echo "  Admin Password: ${ADMIN_PASSWORD}"

echo -e "\n${YELLOW}IMPORTANT: Save these credentials securely!${NC}"
echo -e "${YELLOW}The admin password will not be shown again.${NC}"

echo -e "\n${BLUE}To deploy DomainFlow, run:${NC}"
echo "  ./deploy-secure.sh"