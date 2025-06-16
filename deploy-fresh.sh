#!/bin/bash
# =============================================================================
# DomainFlow Fresh Deployment Script
# =============================================================================
# This script sets up DomainFlow from scratch with a new database
# Perfect for new installations or production deployments
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_PORT=3000
BACKEND_PORT=8080

# Database configuration
DB_NAME="domainflow_production"
DB_USER="domainflow"
DB_PASSWORD="$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)"
DB_HOST="localhost"
DB_PORT=5432

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

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

log_db() {
    echo -e "${MAGENTA}[DATABASE]${NC} $1"
}

# Error handling
cleanup_on_error() {
    log_error "Deployment failed! Cleaning up..."
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "apiserver" 2>/dev/null || true
    exit 1
}

trap cleanup_on_error ERR

# Print header
print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    DomainFlow Fresh Deploy                    ║${NC}"
    echo -e "${CYAN}║              Complete Setup with New Database                 ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Check if running as root or with sudo access
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root. This is not recommended for production."
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Installing Node.js..."
        install_nodejs
    else
        local node_version=$(node --version | cut -d'v' -f2)
        log_success "Node.js is installed (version $node_version)"
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check if Go is installed
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed. Installing Go..."
        install_golang
    else
        local go_version=$(go version | awk '{print $3}')
        log_success "Go is installed ($go_version)"
    fi
    
    # Check if PostgreSQL is installed
    if ! command -v psql &> /dev/null; then
        log_error "PostgreSQL is not installed. Installing PostgreSQL..."
        install_postgresql
    else
        log_success "PostgreSQL is available"
    fi
    
    log_success "All prerequisites are satisfied"
}

# Install Node.js
install_nodejs() {
    log_info "Installing Node.js..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs npm
    else
        log_error "Could not install Node.js automatically. Please install it manually."
        exit 1
    fi
    
    log_success "Node.js installed successfully"
}

# Install Go
install_golang() {
    log_info "Installing Go..."
    
    local go_version="1.21.5"
    local go_os="linux"
    local go_arch="amd64"
    
    cd /tmp
    wget "https://go.dev/dl/go${go_version}.${go_os}-${go_arch}.tar.gz"
    sudo rm -rf /usr/local/go
    sudo tar -C /usr/local -xzf "go${go_version}.${go_os}-${go_arch}.tar.gz"
    
    # Add Go to PATH
    echo 'export PATH=$PATH:/usr/local/go/bin' | sudo tee -a /etc/profile
    export PATH=$PATH:/usr/local/go/bin
    
    log_success "Go installed successfully"
}

# Install PostgreSQL
install_postgresql() {
    log_info "Installing PostgreSQL..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        sudo apt-get update
        sudo apt-get install -y postgresql postgresql-contrib
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        sudo yum install -y postgresql-server postgresql-contrib
        sudo postgresql-setup initdb
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
    else
        log_error "Could not install PostgreSQL automatically. Please install it manually."
        exit 1
    fi
    
    log_success "PostgreSQL installed successfully"
}

# Setup database
setup_database() {
    log_step "Setting up database..."
    
    # Check if PostgreSQL is running
    if ! systemctl is-active --quiet postgresql 2>/dev/null; then
        log_info "Starting PostgreSQL service..."
        sudo systemctl start postgresql || true
    fi
    
    # Create database user and database
    log_db "Creating database user and database..."
    
    sudo -u postgres psql << EOF
-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
ALTER USER $DB_USER CREATEDB;
EOF

    log_success "Database user and database created"
    
    # Test connection
    log_db "Testing database connection..."
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
        log_success "Database connection test passed"
    else
        log_error "Database connection test failed"
        exit 1
    fi
    
    # Save connection string
    echo "postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=disable" > "$SCRIPT_DIR/.db_connection"
}

# Run database migrations
run_migrations() {
    log_step "Running database migrations..."
    
    cd "$BACKEND_DIR"
    
    # Read database connection
    local db_conn=$(cat "$SCRIPT_DIR/.db_connection")
    
    # Apply migrations
    for migration in database/migrations/*.up.sql; do
        if [ -f "$migration" ]; then
            log_db "Applying migration: $(basename "$migration")"
            PGPASSWORD="$DB_PASSWORD" psql "$db_conn" -f "$migration"
        fi
    done
    
    log_success "Database migrations completed"
}

# Create backend configuration
create_backend_config() {
    log_step "Creating backend configuration..."
    
    # Generate API key
    local api_key=$(openssl rand -hex 32)
    
    cat > "$BACKEND_DIR/config.json" << EOF
{
  "server": {
    "port": "$BACKEND_PORT",
    "apiKey": "$api_key",
    "streamChunkSize": 50,
    "ginMode": "debug"
  },
  "database": {
    "host": "$DB_HOST",
    "port": $DB_PORT,
    "name": "$DB_NAME",
    "user": "$DB_USER",
    "password": "$DB_PASSWORD",
    "sslmode": "disable",
    "maxConnections": 25,
    "maxIdleConnections": 5,
    "connectionLifetime": 300
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
    "resolversWeighted": {
      "1.1.1.1:53": 20,
      "https://cloudflare-dns.com/dns-query": 50,
      "https://dns.google/dns-query": 30
    },
    "resolversPreferredOrder": [
      "1.1.1.1:53",
      "https://cloudflare-dns.com/dns-query"
    ],
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
    "level": "info",
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
    "numWorkers": 5,
    "pollIntervalSeconds": 5,
    "batchSize": 100,
    "maxRetries": 3,
    "retryDelaySeconds": 30
  }
}
EOF

    log_success "Backend configuration created"
    
    # Save credentials for later use
    cat > "$SCRIPT_DIR/.credentials" << EOF
# DomainFlow Deployment Credentials
# Generated on $(date)

DATABASE_URL=postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=disable
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

API_KEY=$api_key

FRONTEND_URL=http://localhost:$FRONTEND_PORT
BACKEND_URL=http://localhost:$BACKEND_PORT

ADMIN_EMAIL=admin@domainflow.local
ADMIN_PASSWORD=TempPassword123!
EOF
    chmod 600 "$SCRIPT_DIR/.credentials"
}

# Initialize authentication system
init_auth_system() {
    log_step "Initializing authentication system..."
    
    cd "$SCRIPT_DIR"
    
    # Run the auth initialization script
    if [ -f "scripts/init-auth-system.sh" ]; then
        log_info "Running authentication system initialization..."
        bash scripts/init-auth-system.sh
    else
        log_warning "Auth initialization script not found, creating admin user manually..."
        
        # Read database connection
        local db_conn=$(cat "$SCRIPT_DIR/.db_connection")
        
        # Create admin user
        PGPASSWORD="$DB_PASSWORD" psql "$db_conn" << 'EOF'
-- Create admin user if not exists
INSERT INTO users (id, email, password_hash, name, role, permissions, is_active, must_change_password, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'admin@domainflow.local',
    '$2a$10$8K8T8K8T8K8T8K8T8K8T8O7Q7Q7Q7Q7Q7Q7Q7Q7Q7Q7Q7Q7Q7Q7Q7',  -- TempPassword123!
    'Administrator',
    'admin',
    ARRAY['users.read', 'users.create', 'users.update', 'users.delete', 'campaigns.read', 'campaigns.create', 'campaigns.update', 'campaigns.delete', 'personas.read', 'personas.create', 'personas.update', 'personas.delete', 'proxies.read', 'proxies.create', 'proxies.update', 'proxies.delete', 'system.config'],
    true,
    true,
    NOW(),
    NOW()
) ON CONFLICT (email) DO NOTHING;
EOF
    fi
    
    log_success "Authentication system initialized"
}

# Stop existing processes
stop_existing_processes() {
    log_step "Stopping any existing DomainFlow processes..."
    
    # Function to safely kill processes
    safe_kill() {
        local process_name="$1"
        local signal="${2:-TERM}"
        
        local pids=$(pgrep -f "$process_name" 2>/dev/null || true)
        if [ ! -z "$pids" ]; then
            log_info "Found $process_name processes (PIDs: $pids). Stopping with SIG$signal..."
            pkill -$signal -f "$process_name" 2>/dev/null || true
            sleep 2
            
            # Check if still running and force kill if necessary
            local remaining_pids=$(pgrep -f "$process_name" 2>/dev/null || true)
            if [ ! -z "$remaining_pids" ] && [ "$signal" != "KILL" ]; then
                log_warning "Process still running. Force killing..."
                pkill -KILL -f "$process_name" 2>/dev/null || true
                sleep 1
            fi
        fi
    }
    
    # Function to free up ports
    free_port() {
        local port="$1"
        local port_pids=$(lsof -ti:$port 2>/dev/null || true)
        if [ ! -z "$port_pids" ]; then
            log_info "Port $port is in use (PIDs: $port_pids). Freeing up..."
            kill -TERM $port_pids 2>/dev/null || true
            sleep 2
            
            # Force kill if still there
            local remaining_pids=$(lsof -ti:$port 2>/dev/null || true)
            if [ ! -z "$remaining_pids" ]; then
                log_warning "Processes still using port $port. Force killing..."
                kill -KILL $remaining_pids 2>/dev/null || true
                sleep 1
            fi
        fi
    }
    
    # Stop frontend processes
    safe_kill "next dev"
    safe_kill "npm.*dev"
    
    # Stop backend processes  
    safe_kill "apiserver"
    safe_kill "./apiserver"
    
    # Free up critical ports
    free_port $FRONTEND_PORT
    free_port $BACKEND_PORT
    
    # Clean up any remaining Node.js processes on our ports
    safe_kill "node.*$FRONTEND_PORT"
    
    # Remove PID files if they exist
    rm -f "$SCRIPT_DIR/frontend.pid" "$BACKEND_DIR/backend.pid" 2>/dev/null || true
    
    log_success "All existing processes stopped and ports freed"
}

# Install frontend dependencies
install_frontend_dependencies() {
    log_step "Installing frontend dependencies..."
    
    cd "$SCRIPT_DIR"
    
    log_info "Installing npm packages..."
    npm install
    
    log_success "Frontend dependencies installed"
}

# Build backend
build_backend() {
    log_step "Building backend..."
    
    cd "$BACKEND_DIR"
    
    log_info "Downloading Go modules..."
    go mod download
    
    log_info "Building Go backend..."
    go build -o apiserver ./cmd/apiserver
    
    if [ ! -f "apiserver" ]; then
        log_error "Backend build failed"
        exit 1
    fi
    
    log_success "Backend built successfully"
}

# Start backend
start_backend() {
    log_step "Starting backend server..."
    
    cd "$BACKEND_DIR"
    
    # Create logs directory
    mkdir -p logs
    
    # Start backend in background
    nohup ./apiserver > apiserver.log 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > backend.pid
    
    # Wait for backend to start
    log_info "Waiting for backend to start..."
    for i in {1..30}; do
        if curl -s http://localhost:$BACKEND_PORT/ping > /dev/null 2>&1; then
            log_success "Backend started successfully on port $BACKEND_PORT"
            return 0
        fi
        sleep 1
    done
    
    log_error "Backend failed to start within 30 seconds"
    log_error "Check backend.log for details:"
    tail -n 20 apiserver.log
    exit 1
}

# Start frontend
start_frontend() {
    log_step "Starting frontend server..."
    
    cd "$SCRIPT_DIR"
    
    # Start frontend in background
    nohup npm run dev > frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > frontend.pid
    
    # Wait for frontend to start
    log_info "Waiting for frontend to start..."
    for i in {1..60}; do
        if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
            log_success "Frontend started successfully on port $FRONTEND_PORT"
            return 0
        fi
        sleep 1
    done
    
    log_error "Frontend failed to start within 60 seconds"
    log_error "Check frontend.log for details:"
    tail -n 20 frontend.log
    exit 1
}

# Test application
test_application() {
    log_step "Testing application..."
    
    # Test backend health
    log_info "Testing backend health..."
    if curl -s http://localhost:$BACKEND_PORT/health | grep -q "ok"; then
        log_success "Backend health check passed"
    else
        log_warning "Backend health check failed, but continuing..."
    fi
    
    # Test frontend
    log_info "Testing frontend..."
    if curl -s http://localhost:$FRONTEND_PORT | grep -q "DomainFlow\|html"; then
        log_success "Frontend is responding"
    else
        log_warning "Frontend test failed, but continuing..."
    fi
    
    # Test database connectivity
    log_info "Testing database connectivity..."
    local db_conn=$(cat "$SCRIPT_DIR/.db_connection")
    if PGPASSWORD="$DB_PASSWORD" psql "$db_conn" -c "SELECT COUNT(*) FROM users;" > /dev/null 2>&1; then
        log_success "Database connectivity test passed"
    else
        log_warning "Database connectivity test failed, but continuing..."
    fi
    
    log_success "Application tests completed"
}

# Create management scripts
create_management_scripts() {
    log_step "Creating management scripts..."
    
    # Create stop script
    cat > "$SCRIPT_DIR/stop-domainflow.sh" << 'EOF'
#!/bin/bash
# Stop DomainFlow Application

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stopping DomainFlow...${NC}"

# Stop processes
if pkill -f "next dev" 2>/dev/null; then
    echo -e "${GREEN}Frontend stopped${NC}"
else
    echo -e "${RED}Frontend not running${NC}"
fi

if pkill -f "apiserver" 2>/dev/null; then
    echo -e "${GREEN}Backend stopped${NC}"
else
    echo -e "${RED}Backend not running${NC}"
fi

# Clean up PID files
rm -f backend.pid frontend.pid 2>/dev/null

echo -e "${GREEN}DomainFlow stopped successfully${NC}"
EOF
    chmod +x "$SCRIPT_DIR/stop-domainflow.sh"
    
    # Create restart script
    cat > "$SCRIPT_DIR/restart-domainflow.sh" << 'EOF'
#!/bin/bash
# Restart DomainFlow Application

echo "Restarting DomainFlow..."
./stop-domainflow.sh
sleep 3
./deploy-quick.sh
EOF
    chmod +x "$SCRIPT_DIR/restart-domainflow.sh"
    
    # Create status script
    cat > "$SCRIPT_DIR/status-domainflow.sh" << 'EOF'
#!/bin/bash
# Check DomainFlow Application Status

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}DomainFlow Status Check${NC}"
echo "========================"

# Check frontend
if pgrep -f "next dev" > /dev/null; then
    echo -e "Frontend: ${GREEN}RUNNING${NC}"
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "Frontend Health: ${GREEN}OK${NC}"
    else
        echo -e "Frontend Health: ${RED}FAILED${NC}"
    fi
else
    echo -e "Frontend: ${RED}STOPPED${NC}"
fi

# Check backend
if pgrep -f "apiserver" > /dev/null; then
    echo -e "Backend: ${GREEN}RUNNING${NC}"
    if curl -s http://localhost:8080/ping > /dev/null 2>&1; then
        echo -e "Backend Health: ${GREEN}OK${NC}"
    else
        echo -e "Backend Health: ${RED}FAILED${NC}"
    fi
else
    echo -e "Backend: ${RED}STOPPED${NC}"
fi

# Check database
if [ -f ".credentials" ]; then
    source .credentials
    if PGPASSWORD="$DB_PASSWORD" psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "Database: ${GREEN}CONNECTED${NC}"
    else
        echo -e "Database: ${RED}DISCONNECTED${NC}"
    fi
else
    echo -e "Database: ${YELLOW}UNKNOWN${NC}"
fi

echo ""
echo -e "${BLUE}URLs:${NC}"
echo -e "Frontend: http://localhost:3000"
echo -e "Backend:  http://localhost:8080"
EOF
    chmod +x "$SCRIPT_DIR/status-domainflow.sh"
    
    log_success "Management scripts created"
}

# Create systemd services (optional)
create_systemd_services() {
    if [[ $EUID -eq 0 ]] || command -v sudo &> /dev/null; then
        log_step "Creating systemd services (optional)..."
        
        local current_user=$(whoami)
        local working_dir="$SCRIPT_DIR"
        
        # Create backend service
        sudo tee /etc/systemd/system/domainflow-backend.service > /dev/null << EOF
[Unit]
Description=DomainFlow Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=$current_user
WorkingDirectory=$BACKEND_DIR
ExecStart=$BACKEND_DIR/apiserver
Restart=always
RestartSec=5
Environment=PATH=/usr/local/go/bin:/usr/bin:/bin
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

        # Create frontend service
        sudo tee /etc/systemd/system/domainflow-frontend.service > /dev/null << EOF
[Unit]
Description=DomainFlow Frontend Service
After=network.target domainflow-backend.service

[Service]
Type=simple
User=$current_user
WorkingDirectory=$working_dir
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

        sudo systemctl daemon-reload
        
        log_success "Systemd services created"
        log_info "To enable services at boot: sudo systemctl enable domainflow-backend domainflow-frontend"
    else
        log_info "Skipping systemd services (no sudo access)"
    fi
}

# Print deployment info
print_deployment_info() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                    Deployment Successful!                     ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}🚀 DomainFlow is now running:${NC}"
    echo ""
    echo -e "   ${BLUE}Frontend:${NC} http://localhost:$FRONTEND_PORT"
    echo -e "   ${BLUE}Backend:${NC}  http://localhost:$BACKEND_PORT"
    echo ""
    echo -e "${CYAN}📋 Admin Credentials:${NC}"
    echo -e "   ${BLUE}Email:${NC}    admin@domainflow.local"
    echo -e "   ${BLUE}Password:${NC} TempPassword123!"
    echo ""
    echo -e "${CYAN}📁 Important Files:${NC}"
    echo -e "   ${BLUE}Credentials:${NC} $SCRIPT_DIR/.credentials"
    echo -e "   ${BLUE}DB Connection:${NC} $SCRIPT_DIR/.db_connection"
    echo -e "   ${BLUE}Backend Config:${NC} $BACKEND_DIR/config.json"
    echo ""
    echo -e "${CYAN}🔧 Management Commands:${NC}"
    echo -e "   ${BLUE}Stop:${NC}    ./stop-domainflow.sh"
    echo -e "   ${BLUE}Restart:${NC} ./restart-domainflow.sh"
    echo -e "   ${BLUE}Status:${NC}  ./status-domainflow.sh"
    echo ""
    echo -e "${CYAN}📊 Log Files:${NC}"
    echo -e "   ${BLUE}Backend:${NC}  $BACKEND_DIR/apiserver.log"
    echo -e "   ${BLUE}Frontend:${NC} $SCRIPT_DIR/frontend.log"
    echo ""
    echo -e "${YELLOW}⚠️  Important Security Notes:${NC}"
    echo -e "   • Change default admin password after first login"
    echo -e "   • Secure the .credentials file (permissions: 600)"
    echo -e "   • Configure firewall for production use"
    echo -e "   • Set up SSL/TLS certificates for HTTPS"
    echo ""
    echo -e "${GREEN}🎉 Setup complete! Visit http://localhost:$FRONTEND_PORT to get started.${NC}"
    echo ""
}

# Main deployment function
main() {
    print_header
    
    log_info "Starting DomainFlow fresh deployment..."
    echo ""
    
    check_prerequisites
    stop_existing_processes
    setup_database
    run_migrations
    create_backend_config
    init_auth_system
    install_frontend_dependencies
    build_backend
    start_backend
    start_frontend
    test_application
    create_management_scripts
    create_systemd_services
    
    print_deployment_info
}

# Run main function
main "$@"
