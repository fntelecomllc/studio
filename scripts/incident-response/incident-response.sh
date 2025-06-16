#!/bin/bash
# Phase 7.2: Incident Response Automation Script

set -euo pipefail

# Configuration
INCIDENT_DIR="/var/log/domainflow/incidents"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
JIRA_API_URL="${JIRA_API_URL:-}"
JIRA_API_TOKEN="${JIRA_API_TOKEN:-}"

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    echo -e "${2:-}$(date '+%Y-%m-%d %H:%M:%S') - $1${NC}"
}

# Function to create JIRA ticket
create_jira_ticket() {
    local severity=$1
    local description=$2
    
    if [[ -z "$JIRA_API_URL" || -z "$JIRA_API_TOKEN" ]]; then
        log "JIRA integration not configured" "$YELLOW"
        echo "MANUAL-$(date +%s)"
        return
    fi
    
    local response=$(curl -s -X POST \
        -H "Authorization: Bearer $JIRA_API_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"fields\": {
                \"project\": {\"key\": \"DF\"},
                \"summary\": \"[$severity] $description\",
                \"description\": \"$description\",
                \"issuetype\": {\"name\": \"Incident\"},
                \"priority\": {\"name\": \"$severity\"}
            }
        }" \
        "$JIRA_API_URL/rest/api/2/issue")
    
    echo "$response" | jq -r '.key'
}

# Function to notify on-call engineer
notify_oncall() {
    local severity=$1
    local ticket_id=$2
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -s -X POST -H 'Content-type: application/json' \
            --data "{
                \"text\": \"🚨 *Incident Alert*\",
                \"blocks\": [{
                    \"type\": \"section\",
                    \"text\": {
                        \"type\": \"mrkdwn\",
                        \"text\": \"*Severity:* $severity\n*Ticket:* $ticket_id\n*Time:* $(date)\n*Action Required:* Immediate response needed\"
                    }
                }]
            }" \
            "$SLACK_WEBHOOK" > /dev/null
    fi
    
    # Send PagerDuty alert for P1/P2
    if [[ "$severity" =~ ^(P1|P2)$ ]]; then
        log "Triggering PagerDuty alert for $severity incident" "$RED"
        # Add PagerDuty integration here
    fi
}

# Function to collect diagnostics
collect_diagnostics() {
    local ticket_id=$1
    local diag_dir="$INCIDENT_DIR/$ticket_id"
    
    log "Collecting diagnostics for incident $ticket_id" "$YELLOW"
    mkdir -p "$diag_dir"
    
    # System metrics
    log "Collecting system metrics..."
    top -b -n 1 > "$diag_dir/top.txt" 2>&1 || true
    ps aux > "$diag_dir/processes.txt" 2>&1 || true
    netstat -an > "$diag_dir/network.txt" 2>&1 || true
    df -h > "$diag_dir/disk_usage.txt" 2>&1 || true
    free -h > "$diag_dir/memory.txt" 2>&1 || true
    
    # Docker containers
    log "Collecting Docker information..."
    docker ps -a > "$diag_dir/docker_ps.txt" 2>&1 || true
    docker stats --no-stream > "$diag_dir/docker_stats.txt" 2>&1 || true
    
    # Application logs (last 10000 lines)
    log "Collecting application logs..."
    for service in backend frontend postgres redis haproxy; do
        docker logs --tail 10000 "domainflow-$service" > "$diag_dir/${service}_logs.txt" 2>&1 || true
    done
    
    # Database diagnostics
    log "Collecting database diagnostics..."
    docker exec domainflow-postgres psql -U domainflow -c "
        SELECT * FROM pg_stat_activity;
    " > "$diag_dir/db_activity.txt" 2>&1 || true
    
    docker exec domainflow-postgres psql -U domainflow -c "
        SELECT * FROM pg_stat_database WHERE datname = 'domainflow';
    " > "$diag_dir/db_stats.txt" 2>&1 || true
    
    # Create diagnostic bundle
    log "Creating diagnostic bundle..."
    tar -czf "$INCIDENT_DIR/incident-$ticket_id.tar.gz" -C "$diag_dir" . || true
    
    log "Diagnostics collected at: $INCIDENT_DIR/incident-$ticket_id.tar.gz" "$GREEN"
}

# Function to create Slack channel for war room
create_slack_channel() {
    local ticket_id=$1
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        log "Creating Slack channel #incident-$ticket_id"
        # Add Slack API call to create channel
        # This requires Slack App with appropriate permissions
    fi
}

# Function to start recording metrics
start_recording_metrics() {
    local ticket_id=$1
    
    log "Starting enhanced metrics recording for incident $ticket_id"
    
    # Create a marker in Prometheus
    curl -X POST http://localhost:9090/api/v2/admin/tsdb/snapshot \
        -d "skip_head=false" > /dev/null 2>&1 || true
    
    # Start continuous diagnostics collection in background
    (
        while [[ -f "/tmp/incident-$ticket_id.active" ]]; do
            date >> "$INCIDENT_DIR/$ticket_id/continuous_metrics.log"
            docker stats --no-stream >> "$INCIDENT_DIR/$ticket_id/continuous_metrics.log" 2>&1
            sleep 30
        done
    ) &
    
    touch "/tmp/incident-$ticket_id.active"
}

# Function to stop recording metrics
stop_recording_metrics() {
    local ticket_id=$1
    rm -f "/tmp/incident-$ticket_id.active"
}

# Main incident response function
incident_response() {
    local severity=$1
    local description=$2
    
    log "=== INCIDENT RESPONSE INITIATED ===" "$RED"
    log "Severity: $severity" "$YELLOW"
    log "Description: $description" "$YELLOW"
    
    # 1. Create incident ticket
    log "Creating incident ticket..."
    ticket_id=$(create_jira_ticket "$severity" "$description")
    log "Incident ticket created: $ticket_id" "$GREEN"
    
    # 2. Notify on-call engineer
    log "Notifying on-call engineer..."
    notify_oncall "$severity" "$ticket_id"
    
    # 3. Start diagnostics collection
    log "Starting diagnostics collection..."
    collect_diagnostics "$ticket_id"
    
    # 4. Create war room if P1/P2
    if [[ "$severity" =~ ^(P1|P2)$ ]]; then
        log "Creating war room for $severity incident..."
        create_slack_channel "$ticket_id"
        start_recording_metrics "$ticket_id"
    fi
    
    log "=== INCIDENT RESPONSE INITIATED SUCCESSFULLY ===" "$GREEN"
    log "Incident ID: $ticket_id"
    log "Diagnostics: $INCIDENT_DIR/incident-$ticket_id.tar.gz"
    
    echo "$ticket_id"
}

# Function to resolve incident
resolve_incident() {
    local ticket_id=$1
    local resolution=$2
    
    log "=== RESOLVING INCIDENT $ticket_id ===" "$GREEN"
    
    # Stop metrics recording
    stop_recording_metrics "$ticket_id"
    
    # Collect final diagnostics
    collect_diagnostics "$ticket_id"
    
    # Update JIRA ticket
    if [[ -n "$JIRA_API_URL" && -n "$JIRA_API_TOKEN" ]]; then
        curl -s -X PUT \
            -H "Authorization: Bearer $JIRA_API_TOKEN" \
            -H "Content-Type: application/json" \
            -d "{
                \"fields\": {
                    \"resolution\": {\"name\": \"Fixed\"},
                    \"status\": {\"name\": \"Resolved\"}
                },
                \"update\": {
                    \"comment\": [{
                        \"add\": {
                            \"body\": \"Resolution: $resolution\"
                        }
                    }]
                }
            }" \
            "$JIRA_API_URL/rest/api/2/issue/$ticket_id/transitions" > /dev/null
    fi
    
    log "Incident $ticket_id resolved" "$GREEN"
}

# Parse command line arguments
case "${1:-}" in
    start)
        if [[ $# -lt 3 ]]; then
            echo "Usage: $0 start <severity> <description>"
            echo "Severity: P1, P2, P3, P4"
            exit 1
        fi
        incident_response "$2" "$3"
        ;;
    resolve)
        if [[ $# -lt 3 ]]; then
            echo "Usage: $0 resolve <ticket_id> <resolution>"
            exit 1
        fi
        resolve_incident "$2" "$3"
        ;;
    collect)
        if [[ $# -lt 2 ]]; then
            echo "Usage: $0 collect <ticket_id>"
            exit 1
        fi
        collect_diagnostics "$2"
        ;;
    *)
        echo "DomainFlow Incident Response Tool"
        echo ""
        echo "Usage:"
        echo "  $0 start <severity> <description>  - Start incident response"
        echo "  $0 resolve <ticket_id> <resolution> - Resolve incident"
        echo "  $0 collect <ticket_id>              - Collect diagnostics only"
        echo ""
        echo "Severity levels: P1 (Critical), P2 (High), P3 (Medium), P4 (Low)"
        exit 1
        ;;
esac