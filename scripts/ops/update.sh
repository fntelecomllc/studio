#!/bin/bash
# DomainFlow System Update Script
# Handles system updates, security patches, and application updates

set -euo pipefail

# Configuration
readonly LOG_FILE="/opt/domainflow/logs/update.log"
readonly BACKUP_DIR="/opt/domainflow/backups/pre-update"
readonly SERVICE_USER="domainflow"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")" "$BACKUP_DIR"

# Logging function
log_update() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "$message"
    echo "[$timestamp] $message" >> "$LOG_FILE"
}

# Detect OS
detect_os() {
    if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        OS_ID="$ID"
        OS_VERSION="$VERSION_ID"
    elif [[ -f /etc/redhat-release ]]; then
        OS_ID="centos"
        OS_VERSION=$(grep -oE '[0-9]+\.[0-9]+' /etc/redhat-release | head -1)
    else
        OS_ID="unknown"
    fi
}

# Create pre-update backup
create_pre_update_backup() {
    log_update "${BLUE}Creating pre-update backup...${NC}"
    
    local backup_timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$BACKUP_DIR/pre_update_${backup_timestamp}.tar.gz"
    
    # Create backup
    tar -czf "$backup_file" \
        /opt/domainflow/config \
        /etc/systemd/system/domainflow*.service \
        /etc/nginx/sites-available/domainflow* \
        /etc/fail2ban/jail.local \
        2>/dev/null || true
    
    log_update "${GREEN}✓${NC} Pre-update backup created: $backup_file"
}

# Update system packages
update_system_packages() {
    log_update "${BLUE}Updating system packages...${NC}"
    
    detect_os
    
    case "$OS_ID" in
        ubuntu|debian)
            apt-get update
            DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
            apt-get autoremove -y
            apt-get autoclean
            ;;
        centos|rhel|rocky|almalinux|amzn)
            yum update -y
            yum autoremove -y
            yum clean all
            ;;
        *)
            log_update "${YELLOW}⚠${NC} Unknown OS: $OS_ID - skipping system updates"
            return 1
            ;;
    esac
    
    log_update "${GREEN}✓${NC} System packages updated"
}

# Update Node.js and npm packages
update_nodejs() {
    log_update "${BLUE}Updating Node.js and npm packages...${NC}"
    
    # Update npm to latest
    npm install -g npm@latest
    
    # Update frontend dependencies
    if [[ -d "/opt/domainflow/frontend" ]]; then
        cd /opt/domainflow/frontend
        npm update
        npm run build
        chown -R "$SERVICE_USER:$SERVICE_USER" /opt/domainflow/frontend
    fi
    
    log_update "${GREEN}✓${NC} Node.js and npm packages updated"
}

# Restart services
restart_services() {
    log_update "${BLUE}Restarting services...${NC}"
    
    systemctl restart domainflow.target
    systemctl restart nginx
    
    sleep 10
    
    # Verify services are running
    local failed_services=()
    local services=("postgresql" "domainflow-backend" "domainflow-frontend" "nginx")
    
    for service in "${services[@]}"; do
        if ! systemctl is-active --quiet "$service"; then
            failed_services+=("$service")
        fi
    done
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_update "${RED}✗${NC} Failed to start services: ${failed_services[*]}"
        return 1
    else
        log_update "${GREEN}✓${NC} All services restarted successfully"
    fi
}

# Main update function
main() {
    local system_only=false
    local no_backup=false
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --system-only)
                system_only=true
                shift
                ;;
            --no-backup)
                no_backup=true
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [--system-only] [--no-backup]"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    log_update "${BLUE}Starting DomainFlow update process...${NC}"
    
    # Create backup unless skipped
    if [[ "$no_backup" != "true" ]]; then
        create_pre_update_backup
    fi
    
    # Update system packages
    update_system_packages
    
    # Update application components unless system-only
    if [[ "$system_only" != "true" ]]; then
        update_nodejs
    fi
    
    # Restart services
    restart_services
    
    log_update "${GREEN}Update completed successfully!${NC}"
}

# Run update
main "$@"