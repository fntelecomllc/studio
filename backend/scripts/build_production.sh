#!/bin/bash

# =============================================================================
# DomainFlow Production Build Script
# =============================================================================
# This script builds the Go backend for production deployment
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
BUILD_DIR="$BACKEND_DIR/build"
BINARY_NAME="domainflow-api"

# Build information
BUILD_TIME=$(date -u '+%Y-%m-%d_%H:%M:%S_UTC')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
VERSION="1.0.0"

# Go build settings
export CGO_ENABLED=0
export GOOS=linux
export GOARCH=amd64

# Check Go installation
check_go() {
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed or not in PATH"
        log_info "Please install Go from https://golang.org/dl/"
        exit 1
    fi
    
    GO_VERSION=$(go version | awk '{print $3}')
    log_info "Using Go version: $GO_VERSION"
}

# Clean previous builds
clean_build() {
    log_info "Cleaning previous builds..."
    
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"
    
    # Clean Go module cache if requested
    if [[ "${CLEAN_CACHE:-false}" == "true" ]]; then
        log_info "Cleaning Go module cache..."
        go clean -modcache
    fi
    
    log_success "Build directory cleaned"
}

# Download and verify dependencies
download_dependencies() {
    log_info "Downloading Go dependencies..."
    
    cd "$BACKEND_DIR"
    
    # Download dependencies
    go mod download
    
    # Verify dependencies
    go mod verify
    
    # Tidy up go.mod and go.sum
    go mod tidy
    
    log_success "Dependencies downloaded and verified"
}

# Run tests before building
run_tests() {
    if [[ "${SKIP_TESTS:-false}" != "true" ]]; then
        log_info "Running tests before build..."
        
        cd "$BACKEND_DIR"
        
        # Run unit tests
        go test -v ./... -timeout 30s
        
        if [[ $? -eq 0 ]]; then
            log_success "All tests passed"
        else
            log_error "Tests failed"
            exit 1
        fi
    else
        log_warning "Skipping tests (SKIP_TESTS=true)"
    fi
}

# Build the application
build_application() {
    log_info "Building DomainFlow backend for production..."
    
    cd "$BACKEND_DIR"
    
    # Set build flags
    BUILD_FLAGS=(
        -a
        -installsuffix cgo
        -ldflags "-w -s -X main.Version=$VERSION -X main.BuildTime=$BUILD_TIME -X main.GitCommit=$GIT_COMMIT"
        -o "$BUILD_DIR/$BINARY_NAME"
        ./cmd/apiserver
    )
    
    log_info "Build command: go build ${BUILD_FLAGS[*]}"
    
    # Build the binary
    go build "${BUILD_FLAGS[@]}"
    
    if [[ $? -eq 0 ]]; then
        log_success "Build completed successfully"
    else
        log_error "Build failed"
        exit 1
    fi
    
    # Make binary executable
    chmod +x "$BUILD_DIR/$BINARY_NAME"
    
    # Display binary information
    BINARY_SIZE=$(du -h "$BUILD_DIR/$BINARY_NAME" | cut -f1)
    log_info "Binary size: $BINARY_SIZE"
    log_info "Binary location: $BUILD_DIR/$BINARY_NAME"
}

# Build additional tools
build_tools() {
    log_info "Building additional tools..."
    
    cd "$BACKEND_DIR"
    
    # List of tools to build
    TOOLS=(
        "cmd/migrate:migrate-tool"
        "cmd/health_check_test:health-check"
        "cmd/schema_validator:schema-validator"
        "cmd/performance_tester:performance-tester"
    )
    
    for tool in "${TOOLS[@]}"; do
        IFS=':' read -r source_path binary_name <<< "$tool"
        
        if [[ -d "$source_path" ]]; then
            log_info "Building $binary_name..."
            go build -ldflags "-w -s" -o "$BUILD_DIR/$binary_name" "./$source_path"
            chmod +x "$BUILD_DIR/$binary_name"
            log_success "$binary_name built successfully"
        else
            log_warning "Tool source not found: $source_path"
        fi
    done
}

# Create production configuration
create_production_config() {
    log_info "Creating production configuration..."
    
    # Copy configuration files
    cp -r "$BACKEND_DIR/config" "$BUILD_DIR/" 2>/dev/null || log_warning "No config directory found"
    
    # Create production config template
    cat > "$BUILD_DIR/production.env" << EOF
# DomainFlow Production Configuration
ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=domainflow
DB_USER=domainflow
DB_PASSWORD=CHANGE_ME
SERVER_PORT=8080
LOG_LEVEL=INFO
RATE_LIMIT_ENABLED=true
EOF
    
    log_success "Production configuration created"
}

# Create systemd service file
create_systemd_service() {
    log_info "Creating systemd service file..."
    
    cat > "$BUILD_DIR/domainflow-backend.service" << EOF
[Unit]
Description=DomainFlow Backend API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=domainflow
Group=domainflow
WorkingDirectory=/opt/domainflow
EnvironmentFile=/etc/domainflow/production.env
ExecStart=/usr/local/bin/domainflow-api
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=domainflow-backend

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/domainflow /var/lib/domainflow

[Install]
WantedBy=multi-user.target
EOF
    
    log_success "Systemd service file created"
}

# Create installation script
create_install_script() {
    log_info "Creating installation script..."
    
    cat > "$BUILD_DIR/install.sh" << 'EOF'
#!/bin/bash

# DomainFlow Backend Installation Script

set -euo pipefail

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root"
    exit 1
fi

# Configuration
BINARY_NAME="domainflow-api"
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/domainflow"
LOG_DIR="/var/log/domainflow"
DATA_DIR="/var/lib/domainflow"
USER="domainflow"
GROUP="domainflow"

echo "Installing DomainFlow Backend..."

# Create user and group
if ! id "$USER" &>/dev/null; then
    useradd --system --shell /bin/false --home-dir "$DATA_DIR" --create-home "$USER"
    echo "Created user: $USER"
fi

# Create directories
mkdir -p "$CONFIG_DIR" "$LOG_DIR" "$DATA_DIR"
chown "$USER:$GROUP" "$LOG_DIR" "$DATA_DIR"
chmod 755 "$CONFIG_DIR" "$LOG_DIR" "$DATA_DIR"

# Install binary
cp "$BINARY_NAME" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/$BINARY_NAME"
echo "Installed binary to: $INSTALL_DIR/$BINARY_NAME"

# Install configuration
if [[ -f "production.env" ]]; then
    cp production.env "$CONFIG_DIR/"
    chmod 600 "$CONFIG_DIR/production.env"
    echo "Installed configuration to: $CONFIG_DIR/production.env"
fi

# Install systemd service
if [[ -f "domainflow-backend.service" ]]; then
    cp domainflow-backend.service /etc/systemd/system/
    systemctl daemon-reload
    echo "Installed systemd service"
fi

echo "Installation completed successfully!"
echo "Next steps:"
echo "1. Edit $CONFIG_DIR/production.env with your settings"
echo "2. Start the service: systemctl start domainflow-backend"
echo "3. Enable auto-start: systemctl enable domainflow-backend"
EOF
    
    chmod +x "$BUILD_DIR/install.sh"
    log_success "Installation script created"
}

# Create deployment package
create_deployment_package() {
    log_info "Creating deployment package..."
    
    cd "$BUILD_DIR"
    
    # Create tarball
    PACKAGE_NAME="domainflow-backend-${VERSION}-${BUILD_TIME}.tar.gz"
    tar -czf "$PACKAGE_NAME" *
    
    # Create checksum
    sha256sum "$PACKAGE_NAME" > "${PACKAGE_NAME}.sha256"
    
    log_success "Deployment package created: $BUILD_DIR/$PACKAGE_NAME"
}

# Verify build
verify_build() {
    log_info "Verifying build..."
    
    # Check if binary exists and is executable
    if [[ -x "$BUILD_DIR/$BINARY_NAME" ]]; then
        log_success "Binary is executable"
    else
        log_error "Binary is not executable"
        exit 1
    fi
    
    # Check binary dependencies
    if command -v ldd &> /dev/null; then
        log_info "Binary dependencies:"
        ldd "$BUILD_DIR/$BINARY_NAME" || log_info "Static binary (no dynamic dependencies)"
    fi
    
    # Test binary help
    if "$BUILD_DIR/$BINARY_NAME" --help &> /dev/null; then
        log_success "Binary help command works"
    else
        log_warning "Binary help command failed - may be normal"
    fi
    
    log_success "Build verification completed"
}

# Display build summary
display_summary() {
    log_success "=== DomainFlow Backend Build Complete ==="
    echo
    log_info "Build Information:"
    echo "  Version: $VERSION"
    echo "  Build Time: $BUILD_TIME"
    echo "  Git Commit: $GIT_COMMIT"
    echo "  Go Version: $(go version | awk '{print $3}')"
    echo
    log_info "Build Artifacts:"
    echo "  Binary: $BUILD_DIR/$BINARY_NAME"
    echo "  Size: $(du -h "$BUILD_DIR/$BINARY_NAME" | cut -f1)"
    echo "  Config: $BUILD_DIR/production.env"
    echo "  Service: $BUILD_DIR/domainflow-backend.service"
    echo "  Installer: $BUILD_DIR/install.sh"
    echo
    log_info "Deployment:"
    echo "  Package: $(ls "$BUILD_DIR"/*.tar.gz 2>/dev/null || echo "Not created")"
    echo "  Checksum: $(ls "$BUILD_DIR"/*.sha256 2>/dev/null || echo "Not created")"
    echo
    log_info "Next Steps:"
    echo "  1. Test the binary: $BUILD_DIR/$BINARY_NAME --help"
    echo "  2. Install: sudo $BUILD_DIR/install.sh"
    echo "  3. Configure: /etc/domainflow/production.env"
    echo "  4. Start service: systemctl start domainflow-backend"
}

# Main function
main() {
    log_info "Starting DomainFlow Backend Production Build..."
    echo
    
    check_go
    clean_build
    download_dependencies
    run_tests
    build_application
    build_tools
    create_production_config
    create_systemd_service
    create_install_script
    create_deployment_package
    verify_build
    
    echo
    display_summary
    
    log_success "Production build completed successfully!"
}

# Handle script interruption
trap 'log_error "Build interrupted"; exit 1' INT TERM

# Run main function
main "$@"