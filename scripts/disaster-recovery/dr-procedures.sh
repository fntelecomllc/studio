#!/bin/bash
# Phase 7.3: Disaster Recovery Procedures

set -euo pipefail

# Configuration
DR_CONFIG_DIR="/etc/domainflow/dr"
BACKUP_DIR="/var/backups/domainflow"
S3_BUCKET="${S3_BACKUP_BUCKET:-domainflow-backups}"
AZURE_CONTAINER="${AZURE_BACKUP_CONTAINER:-domainflow-dr}"
DR_SITE="${DR_SITE:-us-west-2}"

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging function
log() {
    echo -e "${2:-}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

# Database Failover Function
database_failover() {
    local target_replica=$1
    local promote=${2:-false}
    
    log "=== DATABASE FAILOVER PROCEDURE ===" "$BLUE"
    log "Target replica: $target_replica" "$YELLOW"
    
    # 1. Check replica health
    log "Checking replica health..."
    if ! docker exec "$target_replica" pg_isready -U domainflow; then
        log "ERROR: Replica $target_replica is not healthy!" "$RED"
        return 1
    fi
    
    # 2. Check replication lag
    lag=$(docker exec "$target_replica" psql -U domainflow -t -c "
        SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int;
    ")
    
    log "Replication lag: ${lag}s"
    if [[ $lag -gt 60 ]]; then
        log "WARNING: High replication lag detected!" "$YELLOW"
        read -p "Continue with failover? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Failover cancelled" "$YELLOW"
            return 1
        fi
    fi
    
    if [[ "$promote" == "true" ]]; then
        # 3. Stop writes to primary
        log "Stopping writes to primary database..."
        docker exec postgres-primary psql -U domainflow -c "
            ALTER SYSTEM SET default_transaction_read_only = on;
            SELECT pg_reload_conf();
        " || true
        
        # 4. Wait for replication to catch up
        log "Waiting for replication to sync..."
        sleep 5
        
        # 5. Promote replica
        log "Promoting $target_replica to primary..."
        docker exec "$target_replica" pg_ctl promote -D /var/lib/postgresql/data
        
        # 6. Update application configuration
        log "Updating application configuration..."
        update_db_config "$target_replica"
        
        # 7. Restart applications
        log "Restarting applications..."
        docker-compose restart backend-1 backend-2 backend-3
        
        log "Database failover completed successfully!" "$GREEN"
    else
        log "Dry run completed. Use --promote to execute failover" "$YELLOW"
    fi
}

# Update database configuration
update_db_config() {
    local new_primary=$1
    
    # Update environment files
    sed -i "s/DATABASE_HOST=.*/DATABASE_HOST=$new_primary/" /opt/domainflow/.env
    
    # Update HAProxy configuration
    cat > /tmp/haproxy-db.cfg << EOF
backend postgres_backend
    balance roundrobin
    option pgsql-check user domainflow
    server primary $new_primary:5432 check
EOF
    
    docker exec load-balancer haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
    docker exec load-balancer kill -HUP 1
}

# Application Failover (Blue-Green Deployment)
application_failover() {
    local from_env=$1
    local to_env=$2
    
    log "=== APPLICATION FAILOVER PROCEDURE ===" "$BLUE"
    log "Switching from $from_env to $to_env" "$YELLOW"
    
    # 1. Health check target environment
    log "Checking $to_env environment health..."
    if ! check_environment_health "$to_env"; then
        log "ERROR: Target environment $to_env is not healthy!" "$RED"
        return 1
    fi
    
    # 2. Warm up target environment
    log "Warming up $to_env environment..."
    warm_up_environment "$to_env"
    
    # 3. Update load balancer
    log "Updating load balancer configuration..."
    update_load_balancer "$from_env" "$to_env"
    
    # 4. Monitor traffic shift
    log "Monitoring traffic shift..."
    monitor_traffic_shift "$to_env"
    
    # 5. Drain old environment
    log "Draining connections from $from_env..."
    drain_environment "$from_env"
    
    log "Application failover completed successfully!" "$GREEN"
}

# Check environment health
check_environment_health() {
    local env=$1
    local health_checks=0
    local required_checks=3
    
    # Check backend health
    for i in 1 2 3; do
        if curl -sf "http://${env}-backend-${i}:8080/health" > /dev/null; then
            ((health_checks++))
        fi
    done
    
    # Check frontend health
    for i in 1 2 3; do
        if curl -sf "http://${env}-frontend-${i}:3000/" > /dev/null; then
            ((health_checks++))
        fi
    done
    
    [[ $health_checks -ge $required_checks ]]
}

# Warm up environment
warm_up_environment() {
    local env=$1
    
    # Send synthetic traffic
    for i in {1..100}; do
        curl -sf "http://${env}-backend-1:8080/api/health" > /dev/null &
        curl -sf "http://${env}-frontend-1:3000/" > /dev/null &
    done
    wait
}

# Update load balancer for blue-green switch
update_load_balancer() {
    local from_env=$1
    local to_env=$2
    
    # Generate new HAProxy config
    cat > /tmp/haproxy-switch.cfg << EOF
backend api_backend
    balance roundrobin
    option httpchk GET /health
    
    # New environment (active)
    server ${to_env}-backend-1 ${to_env}-backend-1:8080 check weight 100
    server ${to_env}-backend-2 ${to_env}-backend-2:8080 check weight 100
    server ${to_env}-backend-3 ${to_env}-backend-3:8080 check weight 100
    
    # Old environment (draining)
    server ${from_env}-backend-1 ${from_env}-backend-1:8080 check weight 0
    server ${from_env}-backend-2 ${from_env}-backend-2:8080 check weight 0
    server ${from_env}-backend-3 ${from_env}-backend-3:8080 check weight 0
EOF
    
    # Reload HAProxy
    docker cp /tmp/haproxy-switch.cfg load-balancer:/usr/local/etc/haproxy/
    docker exec load-balancer haproxy -c -f /usr/local/etc/haproxy/haproxy-switch.cfg
    docker exec load-balancer kill -HUP 1
}

# Complete DR Site Activation
activate_dr_site() {
    local site=$1
    local verify=${2:-true}
    
    log "=== DISASTER RECOVERY SITE ACTIVATION ===" "$RED"
    log "Activating DR site: $site" "$YELLOW"
    
    # 1. Verify backups
    if [[ "$verify" == "true" ]]; then
        log "Verifying backup integrity..."
        if ! verify_backups "$site"; then
            log "ERROR: Backup verification failed!" "$RED"
            return 1
        fi
    fi
    
    # 2. Restore databases
    log "Restoring databases at DR site..."
    restore_databases "$site"
    
    # 3. Start DR infrastructure
    log "Starting DR infrastructure..."
    start_dr_infrastructure "$site"
    
    # 4. Update DNS
    log "Updating DNS records..."
    update_dns_records "$site"
    
    # 5. Verify DR site
    log "Verifying DR site functionality..."
    verify_dr_site "$site"
    
    log "DR site activation completed!" "$GREEN"
}

# Verify backups
verify_backups() {
    local site=$1
    
    # Check S3 backups
    aws s3 ls "s3://$S3_BUCKET/$site/latest/" || return 1
    
    # Check Azure backups
    az storage blob list \
        --container-name "$AZURE_CONTAINER" \
        --prefix "$site/latest/" \
        --output table || return 1
    
    return 0
}

# Restore databases
restore_databases() {
    local site=$1
    local latest_backup
    
    # Find latest backup
    latest_backup=$(aws s3 ls "s3://$S3_BUCKET/$site/postgres/" | tail -1 | awk '{print $4}')
    
    # Download backup
    log "Downloading backup: $latest_backup"
    aws s3 cp "s3://$S3_BUCKET/$site/postgres/$latest_backup" /tmp/
    
    # Restore database
    log "Restoring database..."
    docker exec -i postgres-dr psql -U domainflow < "/tmp/$latest_backup"
}

# Start DR infrastructure
start_dr_infrastructure() {
    local site=$1
    
    # Start services in DR site
    cd "/opt/domainflow/dr-sites/$site"
    docker-compose up -d
    
    # Wait for services to be healthy
    log "Waiting for services to start..."
    sleep 30
    
    # Verify all services are running
    docker-compose ps
}

# Update DNS records
update_dns_records() {
    local site=$1
    
    # Update Route53 (AWS)
    if [[ -n "${AWS_HOSTED_ZONE_ID:-}" ]]; then
        aws route53 change-resource-record-sets \
            --hosted-zone-id "$AWS_HOSTED_ZONE_ID" \
            --change-batch '{
                "Changes": [{
                    "Action": "UPSERT",
                    "ResourceRecordSet": {
                        "Name": "domainflow.studio.",
                        "Type": "A",
                        "TTL": 60,
                        "ResourceRecords": [{"Value": "'$site'-dr.domainflow.studio"}]
                    }
                }]
            }'
    fi
}

# Verify DR site
verify_dr_site() {
    local site=$1
    local checks_passed=0
    local total_checks=5
    
    # Check API health
    if curl -sf "https://$site-dr.domainflow.studio/api/health"; then
        ((checks_passed++))
    fi
    
    # Check frontend
    if curl -sf "https://$site-dr.domainflow.studio/"; then
        ((checks_passed++))
    fi
    
    # Check database connectivity
    if docker exec postgres-dr pg_isready -U domainflow; then
        ((checks_passed++))
    fi
    
    # Check WebSocket connectivity
    if timeout 5 websocat "wss://$site-dr.domainflow.studio/ws" --ping-interval 1; then
        ((checks_passed++))
    fi
    
    # Check critical business function
    if curl -sf "https://$site-dr.domainflow.studio/api/campaigns"; then
        ((checks_passed++))
    fi
    
    log "DR verification: $checks_passed/$total_checks checks passed"
    [[ $checks_passed -eq $total_checks ]]
}

# Backup verification test
test_backup_restore() {
    local backup_file=$1
    
    log "=== BACKUP RESTORATION TEST ===" "$BLUE"
    
    # Create test database
    docker exec postgres-primary createdb -U domainflow domainflow_test
    
    # Restore backup to test database
    docker exec -i postgres-primary psql -U domainflow domainflow_test < "$backup_file"
    
    # Run integrity checks
    docker exec postgres-primary psql -U domainflow domainflow_test -c "
        SELECT COUNT(*) FROM campaigns;
        SELECT COUNT(*) FROM users;
        SELECT COUNT(*) FROM personas;
    "
    
    # Cleanup
    docker exec postgres-primary dropdb -U domainflow domainflow_test
    
    log "Backup restoration test completed" "$GREEN"
}

# Main command handler
case "${1:-}" in
    database-failover)
        database_failover "${2:-postgres-replica-1}" "${3:-false}"
        ;;
    app-failover)
        application_failover "${2:-blue}" "${3:-green}"
        ;;
    activate-dr)
        activate_dr_site "${2:-$DR_SITE}" "${3:-true}"
        ;;
    test-backup)
        test_backup_restore "${2:-}"
        ;;
    *)
        echo "DomainFlow Disaster Recovery Tool"
        echo ""
        echo "Usage:"
        echo "  $0 database-failover <replica> [--promote]  - Database failover"
        echo "  $0 app-failover <from> <to>                 - Application failover"
        echo "  $0 activate-dr <site> [--verify]            - Activate DR site"
        echo "  $0 test-backup <backup-file>                - Test backup restoration"
        echo ""
        echo "Examples:"
        echo "  $0 database-failover postgres-replica-1 --promote"
        echo "  $0 app-failover blue green"
        echo "  $0 activate-dr us-west-2"
        exit 1
        ;;
esac