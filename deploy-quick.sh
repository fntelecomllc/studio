#!/bin/bash
# =============================================================================
# DomainFlow Quick Deployment Script
# =============================================================================
# This script deploys the DomainFlow application using the existing test database
# Perfect for development/testing environments where database is already set up
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_PORT=3000
BACKEND_PORT=8080

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
    echo -e "${CYAN}║                     DomainFlow Quick Deploy                   ║${NC}"
    echo -e "${CYAN}║              Using Existing Test Database                     ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check if Go is installed
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed. Please install Go first."
        exit 1
    fi
    
    # Check if PostgreSQL is available
    if ! command -v psql &> /dev/null; then
        log_error "PostgreSQL client (psql) is not available. Please install PostgreSQL client."
        exit 1
    fi
    
    log_success "All prerequisites are installed"
}

# Check database connectivity
check_database() {
    log_step "Checking database connectivity..."
    
    # Check if .db_connection file exists from previous deployment
    if [ -f "$SCRIPT_DIR/.db_connection" ]; then
        local existing_conn=$(cat "$SCRIPT_DIR/.db_connection")
        log_info "Found existing database connection, testing..."
        if psql "$existing_conn" -c "SELECT 1;" &>/dev/null; then
            log_success "Existing database connection successful!"
            return 0
        else
            log_warning "Existing connection failed, trying alternatives..."
        fi
    fi
    
    # Check if .credentials file exists and extract connection info
    if [ -f "$SCRIPT_DIR/.credentials" ]; then
        log_info "Found credentials file, extracting database connection..."
        local db_url=$(grep "DATABASE_URL=" "$SCRIPT_DIR/.credentials" | cut -d'=' -f2)
        if [ ! -z "$db_url" ]; then
            log_info "Testing credentials-based connection..."
            if psql "$db_url" -c "SELECT 1;" &>/dev/null; then
                log_success "Credentials-based database connection successful!"
                echo "$db_url" > "$SCRIPT_DIR/.db_connection"
                return 0
            fi
        fi
    fi
    
    local connections=(
        "postgres://domainflow:domainflow_dev_password@localhost:5432/domainflow_dev?sslmode=disable"
        "postgres://test_user:123456789@localhost:5432/domainflowdb?sslmode=disable"
        "postgres://domainflow:domainflow@localhost:5432/domainflow?sslmode=disable"
        "postgres://postgres:postgres@localhost:5432/domainflow?sslmode=disable"
    )
    
    for conn in "${connections[@]}"; do
        log_info "Testing connection: ${conn%:*}:***@..."
        if psql "$conn" -c "SELECT 1;" &>/dev/null; then
            log_success "Database connection successful!"
            echo "$conn" > "$SCRIPT_DIR/.db_connection"
            return 0
        fi
    done
    
    log_error "Could not connect to any test database."
    log_error "Please ensure PostgreSQL is running and the test database is set up."
    log_error "You may need to run the fresh deployment script first."
    exit 1
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
    log_step "Checking frontend dependencies..."
    
    cd "$SCRIPT_DIR"
    
    if [ ! -d "node_modules" ] || [ ! -f "node_modules/.bin/next" ]; then
        log_info "Installing npm packages..."
        npm install
        log_success "Frontend dependencies installed"
    else
        log_info "Dependencies already installed, skipping installation for quick deploy"
        log_success "Frontend dependencies check completed"
    fi
}

# Build backend
build_backend() {
    log_step "Building backend..."
    
    cd "$BACKEND_DIR"
    
    log_info "Building Go backend..."
    go mod download
    go build -buildvcs=false -o apiserver ./cmd/apiserver
    
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
    
    # Load environment variables from project root
    if [ -f "$SCRIPT_DIR/.env" ]; then
        log_info "Loading environment variables from .env file..."
        set -a  # Mark variables for export
        source "$SCRIPT_DIR/.env"
        set +a  # Stop marking for export
    fi
    
    # Extract database connection details from working connection
    if [ -f "$SCRIPT_DIR/.db_connection" ]; then
        local db_conn=$(cat "$SCRIPT_DIR/.db_connection")
        log_info "Using test database connection for backend..."
        
        # Parse the connection string and set environment variables
        # Format: postgres://user:password@host:port/database?sslmode=disable
        # Backend expects DATABASE_* environment variables
        export DATABASE_HOST=$(echo "$db_conn" | sed -n 's|.*://[^:]*:[^@]*@\([^:]*\):.*|\1|p')
        export DATABASE_PORT=$(echo "$db_conn" | sed -n 's|.*://[^:]*:[^@]*@[^:]*:\([0-9]*\)/.*|\1|p')
        export DATABASE_USER=$(echo "$db_conn" | sed -n 's|.*://\([^:]*\):.*|\1|p')
        export DATABASE_PASSWORD=$(echo "$db_conn" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
        export DATABASE_NAME=$(echo "$db_conn" | sed -n 's|.*/\([^?]*\).*|\1|p')
        export DATABASE_SSL_MODE=$(echo "$db_conn" | sed -n 's|.*sslmode=\([^&]*\).*|\1|p')
        
        log_info "Database config: ${DATABASE_USER}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}"
        log_info "Debug database environment variables:"
        log_info "  DATABASE_HOST=$DATABASE_HOST"
        log_info "  DATABASE_PORT=$DATABASE_PORT"
        log_info "  DATABASE_USER=$DATABASE_USER"
        log_info "  DATABASE_PASSWORD=${DATABASE_PASSWORD:0:8}... (truncated)"
        log_info "  DATABASE_NAME=$DATABASE_NAME"
        log_info "  DATABASE_SSL_MODE=$DATABASE_SSL_MODE"
    fi
    
    # Ensure critical environment variables are set
    export SERVER_PORT=${SERVER_PORT:-8080}
    export GIN_MODE=${GIN_MODE:-debug}
    
    log_info "Starting backend with SERVER_PORT=$SERVER_PORT and GIN_MODE=$GIN_MODE"
    
    # Start backend in background with environment variables
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
    
    # Ensure Next.js is available
    if [ ! -f "node_modules/.bin/next" ]; then
        log_error "Next.js not found in node_modules. Installing dependencies..."
        npm install
    fi
    
    # First try: Start with turbopack (original)
    log_info "Starting frontend with turbopack..."
    nohup npm run dev > frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > frontend.pid
    
    # Wait for frontend to start (shorter timeout for first attempt)
    log_info "Waiting for frontend to start..."
    for i in {1..30}; do
        if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
            log_success "Frontend started successfully on port $FRONTEND_PORT"
            return 0
        fi
        
        # Check if process crashed (bus error, etc.)
        if ! kill -0 $FRONTEND_PID 2>/dev/null; then
            log_warning "Frontend process crashed (likely turbopack issue), trying stable mode..."
            break
        fi
        
        sleep 1
    done
    
    # Fallback: Try without turbopack
    log_info "Trying fallback: starting without turbopack..."
    pkill -f "next dev" 2>/dev/null || true
    sleep 2
    
    # Clear the log and start fresh
    > frontend.log
    
    # Start without turbopack
    nohup npm run dev:stable > frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > frontend.pid
    
    # Wait for stable version to start
    for i in {1..60}; do
        if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
            log_success "Frontend started successfully on port $FRONTEND_PORT (stable mode)"
            return 0
        fi
        
        # Check if this attempt also crashed
        if ! kill -0 $FRONTEND_PID 2>/dev/null; then
            log_error "Frontend process crashed even in stable mode"
            break
        fi
        
        if [ $i -eq 30 ]; then
            log_info "Still waiting... This may take a moment for first-time setup"
        fi
        sleep 1
    done
    
    log_error "Frontend failed to start with both turbopack and stable modes"
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
    
    log_success "Application tests completed"
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
    echo -e "${CYAN}📋 Default Admin Credentials:${NC}"
    echo -e "   ${BLUE}Email:${NC}    admin@domainflow.local"
    echo -e "   ${BLUE}Password:${NC} TempPassword123!"
    echo ""
    echo -e "${CYAN}📁 Log Files:${NC}"
    echo -e "   ${BLUE}Backend:${NC}  $BACKEND_DIR/apiserver.log"
    echo -e "   ${BLUE}Frontend:${NC} $SCRIPT_DIR/frontend.log"
    echo ""
    echo -e "${CYAN}🛑 To stop the application:${NC}"
    echo -e "   ${BLUE}./stop-domainflow.sh${NC}"
    echo ""
    echo -e "${YELLOW}Note: This deployment uses the existing test database.${NC}"
    echo -e "${YELLOW}For a fresh installation, use ./deploy-fresh.sh${NC}"
    echo ""
}

# Create stop script
create_stop_script() {
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
pkill -f "next dev" 2>/dev/null && echo -e "${GREEN}Frontend stopped${NC}" || echo -e "${RED}Frontend not running${NC}"
pkill -f "apiserver" 2>/dev/null && echo -e "${GREEN}Backend stopped${NC}" || echo -e "${RED}Backend not running${NC}"

# Clean up PID files
rm -f backend.pid frontend.pid 2>/dev/null

echo -e "${GREEN}DomainFlow stopped successfully${NC}"
EOF
    chmod +x "$SCRIPT_DIR/stop-domainflow.sh"
}

# Main deployment function
main() {
    print_header
    
    log_info "Starting DomainFlow quick deployment..."
    echo ""
    
    check_prerequisites
    check_database
    stop_existing_processes
    install_frontend_dependencies
    build_backend
    start_backend
    start_frontend
    test_application
    create_stop_script
    
    print_deployment_info
}

# Run main function
main "$@"
