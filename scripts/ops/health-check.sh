#!/bin/bash
# DomainFlow Health Check Script
# Comprehensive system health monitoring

set -euo pipefail

# Configuration
readonly LOG_FILE="/opt/domainflow/logs/health-check.log"
readonly METRICS_FILE="/opt/domainflow/logs/metrics.log"
readonly ALERT_THRESHOLD_CPU=80
readonly ALERT_THRESHOLD_MEMORY=85
readonly ALERT_THRESHOLD_DISK=90

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$METRICS_FILE")"

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging function
log_health() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "$message"
    echo "[$timestamp] $message" >> "$LOG_FILE"
}

log_metric() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$METRICS_FILE"
}

# Health check functions
check_service_health() {
    local service=$1
    if systemctl is-active --quiet "$service"; then
        log_health "${GREEN}✓${NC} $service: HEALTHY"
        return 0
    else
        log_health "${RED}✗${NC} $service: UNHEALTHY"
        return 1
    fi
}

check_http_endpoint() {
    local url=$1
    local name=$2
    local timeout=${3:-10}
    
    local response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
    local response_time=$(curl -s -o /dev/null -w "%{time_total}" --max-time "$timeout" "$url" 2>/dev/null || echo "0")
    
    if [[ "$response" == "200" ]]; then
        log_health "${GREEN}✓${NC} $name: HEALTHY (HTTP $response, ${response_time}s)"
        log_metric "${name}_response_time=${response_time}"
        return 0
    else
        log_health "${RED}✗${NC} $name: UNHEALTHY (HTTP $response)"
        return 1
    fi
}

check_database_health() {
    if pg_isready -h localhost -p 5432 -U domainflow >/dev/null 2>&1; then
        log_health "${GREEN}✓${NC} Database: HEALTHY"
        
        # Check database connections
        local connections=$(sudo -u postgres psql -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='domainflow_production';" 2>/dev/null | xargs || echo "0")
        log_metric "database_connections=$connections"
        log_health "${BLUE}ℹ${NC} Database connections: $connections"
        
        return 0
    else
        log_health "${RED}✗${NC} Database: UNHEALTHY"
        return 1
    fi
}

check_system_resources() {
    local status=0
    
    # CPU Usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1 | cut -d',' -f1)
    cpu_usage=${cpu_usage%.*}  # Remove decimal part
    log_metric "cpu_usage=$cpu_usage"
    
    if [[ $cpu_usage -gt $ALERT_THRESHOLD_CPU ]]; then
        log_health "${YELLOW}⚠${NC} CPU usage high: ${cpu_usage}%"
        status=1
    else
        log_health "${GREEN}✓${NC} CPU usage normal: ${cpu_usage}%"
    fi
    
    # Memory Usage
    local mem_info=$(free | grep Mem)
    local mem_total=$(echo $mem_info | awk '{print $2}')
    local mem_used=$(echo $mem_info | awk '{print $3}')
    local mem_usage=$((mem_used * 100 / mem_total))
    log_metric "memory_usage=$mem_usage"
    
    if [[ $mem_usage -gt $ALERT_THRESHOLD_MEMORY ]]; then
        log_health "${YELLOW}⚠${NC} Memory usage high: ${mem_usage}%"
        status=1
    else
        log_health "${GREEN}✓${NC} Memory usage normal: ${mem_usage}%"
    fi
    
    # Disk Usage
    local disk_usage=$(df /opt/domainflow | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    log_metric "disk_usage=$disk_usage"
    
    if [[ $disk_usage -gt $ALERT_THRESHOLD_DISK ]]; then
        log_health "${YELLOW}⚠${NC} Disk usage high: ${disk_usage}%"
        status=1
    else
        log_health "${GREEN}✓${NC} Disk usage normal: ${disk_usage}%"
    fi
    
    return $status
}

# Main health check
main_health_check() {
    local overall_status=0
    
    echo "========================================"
    echo "  DomainFlow Health Check"
    echo "========================================"
    echo "Started: $(date)"
    echo
    
    # Check services
    echo "Service Status:"
    echo "---------------"
    check_service_health "postgresql" || overall_status=1
    check_service_health "domainflow-backend" || overall_status=1
    check_service_health "domainflow-frontend" || overall_status=1
    check_service_health "nginx" || overall_status=1
    echo
    
    # Check HTTP endpoints
    echo "HTTP Endpoints:"
    echo "---------------"
    check_http_endpoint "http://localhost/health" "Frontend Health" || overall_status=1
    check_http_endpoint "http://localhost:8080/ping" "Backend API" || overall_status=1
    echo
    
    # Check database
    echo "Database:"
    echo "---------"
    check_database_health || overall_status=1
    echo
    
    # Check system resources
    echo "System Resources:"
    echo "-----------------"
    check_system_resources || overall_status=1
    echo
    
    # Overall status
    echo "========================================"
    if [[ $overall_status -eq 0 ]]; then
        log_health "${GREEN}=== Overall Status: HEALTHY ===${NC}"
        echo "✓ All systems operational"
    else
        log_health "${YELLOW}=== Overall Status: ISSUES DETECTED ===${NC}"
        echo "⚠ Some issues detected - check details above"
    fi
    echo "========================================"
    
    return $overall_status
}

# Run health check
main_health_check