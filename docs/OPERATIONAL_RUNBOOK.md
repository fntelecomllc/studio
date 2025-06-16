# DomainFlow Operational Runbook

This runbook provides comprehensive procedures for daily operations, maintenance, and troubleshooting of the DomainFlow production environment.

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Weekly Operations](#weekly-operations)
3. [Monthly Operations](#monthly-operations)
4. [Emergency Procedures](#emergency-procedures)
5. [Monitoring and Alerting](#monitoring-and-alerting)
6. [Backup and Recovery](#backup-and-recovery)
7. [Performance Tuning](#performance-tuning)
8. [Security Operations](#security-operations)

## Daily Operations

### Morning Health Check

Perform these checks every morning:

```bash
# 1. Run comprehensive health check
sudo /opt/domainflow/scripts/ops/health-check.sh

# 2. Check service status
sudo systemctl status domainflow.target

# 3. Check disk usage
df -h /opt/domainflow

# 4. Check memory usage
free -h

# 5. Check recent errors
sudo journalctl --since "24 hours ago" --priority=err --no-pager
```

### Automated Daily Tasks

These tasks run automatically via cron:

- **2:00 AM**: Daily database backup
- **3:00 AM**: Daily application backup
- **Every 5 minutes**: Health monitoring
- **Every 15 minutes**: Performance metrics collection

### Manual Daily Checks

#### 1. Application Health

```bash
# Test frontend
curl -s http://localhost/health

# Test backend API
curl -s http://localhost:8080/ping

# Check response times
curl -w "@/opt/domainflow/monitoring/curl-format.txt" -s -o /dev/null http://localhost/
```

#### 2. Database Health

```bash
# Check database connections
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname='domainflow_production';"

# Check database size
sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('domainflow_production'));"

# Check for long-running queries
sudo -u postgres psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"
```

#### 3. Log Review

```bash
# Check for application errors
sudo grep -i error /opt/domainflow/logs/*.log | tail -10

# Check nginx error log
sudo tail -20 /var/log/nginx/error.log

# Check fail2ban status
sudo fail2ban-client status
```

## Weekly Operations

### Sunday Maintenance Window

Perform these tasks every Sunday during low-traffic hours:

#### 1. System Updates

```bash
# Run system update script
sudo /opt/domainflow/scripts/ops/update.sh --system-only

# Check for security updates
sudo /opt/domainflow/scripts/ops/update.sh --security-only
```

#### 2. Database Maintenance

```bash
# Vacuum and analyze database
sudo -u postgres psql domainflow_production -c "VACUUM ANALYZE;"

# Update database statistics
sudo -u postgres psql domainflow_production -c "ANALYZE;"

# Check database performance
sudo -u postgres psql domainflow_production -c "SELECT schemaname, tablename, attname, n_distinct, correlation FROM pg_stats WHERE schemaname = 'public' ORDER BY tablename, attname;"
```

#### 3. Log Analysis

```bash
# Generate weekly log analysis report
sudo /opt/domainflow/monitoring/scripts/analyze-logs.sh

# Review nginx access patterns
sudo /opt/domainflow/scripts/ops/analyze-access-logs.sh
```

#### 4. Backup Verification

```bash
# Verify backup integrity
sudo /opt/domainflow/scripts/ops/verify-backups.sh

# Test backup restoration (on test environment)
sudo /opt/domainflow/scripts/ops/test-backup-restore.sh
```

#### 5. Performance Review

```bash
# Generate performance report
sudo /opt/domainflow/monitoring/scripts/generate-performance-report.sh

# Review resource usage trends
sudo /opt/domainflow/monitoring/scripts/resource-trend-analysis.sh
```

## Monthly Operations

### First Sunday of Each Month

#### 1. Security Audit

```bash
# Run security scan
sudo /opt/domainflow/scripts/ops/security-scan.sh

# Review fail2ban logs
sudo fail2ban-client status
for jail in $(sudo fail2ban-client status | grep "Jail list:" | cut -d: -f2 | tr ',' ' '); do
    echo "=== $jail ==="
    sudo fail2ban-client status $jail
done

# Check for unauthorized access attempts
sudo grep "Failed password" /var/log/auth.log | tail -20
```

#### 2. SSL Certificate Review

```bash
# Check SSL certificate expiration
sudo /opt/domainflow/scripts/ssl/certificate-status.sh

# Test SSL configuration
sudo /opt/domainflow/scripts/ssl/test-ssl.sh
```

#### 3. Capacity Planning

```bash
# Review disk usage trends
sudo du -sh /opt/domainflow/* | sort -h

# Review backup storage usage
sudo du -sh /opt/domainflow/backups/*

# Check database growth
sudo -u postgres psql -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;"
```

#### 4. Documentation Review

```bash
# Update system documentation
# Review and update configuration changes
# Document any customizations or modifications
```

## Emergency Procedures

### Service Outage Response

#### 1. Immediate Assessment

```bash
# Check overall system status
sudo /opt/domainflow/scripts/ops/health-check.sh

# Check individual services
sudo systemctl status domainflow.target
sudo systemctl status nginx
sudo systemctl status postgresql
```

#### 2. Service Recovery

```bash
# Restart all services
sudo systemctl restart domainflow.target nginx

# If restart fails, check logs
sudo journalctl -u domainflow-backend --since "10 minutes ago"
sudo journalctl -u domainflow-frontend --since "10 minutes ago"
```

#### 3. Database Recovery

```bash
# Check database status
sudo systemctl status postgresql

# If database is down
sudo systemctl restart postgresql

# Check database connectivity
sudo -u postgres psql -c "\l"
```

### Security Incident Response

#### 1. Immediate Actions

```bash
# Check for active threats
sudo fail2ban-client status

# Review recent access logs
sudo tail -100 /var/log/nginx/access.log | grep -E "(POST|PUT|DELETE)"

# Check for suspicious processes
ps aux | grep -v "\[" | sort -k3 -nr | head -10
```

#### 2. Containment

```bash
# Block suspicious IPs (if identified)
sudo iptables -A INPUT -s SUSPICIOUS_IP -j DROP

# Restart fail2ban with updated rules
sudo systemctl restart fail2ban
```

#### 3. Investigation

```bash
# Generate security audit log
sudo /opt/domainflow/scripts/ops/security-audit.sh

# Review authentication logs
sudo grep -i "authentication failure" /var/log/auth.log
```

### Data Recovery

#### 1. Database Recovery

```bash
# Stop application services
sudo systemctl stop domainflow.target

# Restore from latest backup
sudo /opt/domainflow/scripts/ops/restore.sh database /opt/domainflow/backups/database/daily/latest_backup.sql.gz

# Start services and verify
sudo systemctl start domainflow.target
sudo /opt/domainflow/scripts/ops/health-check.sh
```

#### 2. Configuration Recovery

```bash
# Restore configuration files
sudo /opt/domainflow/scripts/ops/restore.sh config /opt/domainflow/backups/application/daily/latest_config.tar.gz

# Reload services
sudo systemctl daemon-reload
sudo systemctl restart domainflow.target nginx
```

## Monitoring and Alerting

### Key Metrics to Monitor

#### System Metrics
- CPU usage (alert if > 80%)
- Memory usage (alert if > 85%)
- Disk usage (alert if > 90%)
- Load average
- Network connectivity

#### Application Metrics
- HTTP response times
- Error rates
- Database connections
- Service availability

#### Security Metrics
- Failed login attempts
- Firewall blocks
- SSL certificate expiration
- Security scan results

### Alert Thresholds

```bash
# Configure alert thresholds in monitoring script
sudo nano /opt/domainflow/monitoring/scripts/alert-manager.sh

# Key thresholds:
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=85
ALERT_THRESHOLD_DISK=90
ALERT_THRESHOLD_RESPONSE_TIME=5
```

### Monitoring Commands

```bash
# Real-time monitoring
sudo watch -n 5 '/opt/domainflow/scripts/ops/health-check.sh --quiet'

# Performance monitoring
sudo /opt/domainflow/monitoring/scripts/performance-monitor.sh

# Generate monitoring report
sudo /opt/domainflow/monitoring/scripts/generate-monitoring-report.sh
```

## Backup and Recovery

### Backup Schedule

- **Daily**: Database and application data (2:00 AM)
- **Weekly**: Full system backup (Sunday 1:00 AM)
- **Monthly**: Archive backup (1st Sunday)

### Backup Verification

```bash
# Daily backup verification
sudo /opt/domainflow/scripts/ops/verify-backups.sh

# Test backup restoration
sudo /opt/domainflow/scripts/ops/test-backup-restore.sh
```

### Recovery Procedures

#### Point-in-Time Recovery

```bash
# List available backups
ls -la /opt/domainflow/backups/database/daily/

# Restore to specific point in time
sudo /opt/domainflow/scripts/ops/restore.sh database /path/to/specific/backup.sql.gz
```

#### Disaster Recovery

```bash
# Full system recovery from backups
sudo /opt/domainflow/scripts/ops/disaster-recovery.sh

# Verify system integrity after recovery
sudo /opt/domainflow/scripts/ops/health-check.sh
```

## Performance Tuning

### Database Performance

```bash
# Check slow queries
sudo -u postgres psql domainflow_production -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Optimize database configuration
sudo /opt/domainflow/scripts/ops/optimize-database.sh

# Update database statistics
sudo -u postgres psql domainflow_production -c "ANALYZE;"
```

### Application Performance

```bash
# Monitor application performance
sudo /opt/domainflow/monitoring/scripts/app-performance-monitor.sh

# Check memory usage by service
sudo systemctl status domainflow-backend domainflow-frontend --no-pager | grep -E "(Memory|CPU)"
```

### System Performance

```bash
# Check system performance
sudo iostat -x 1 5
sudo vmstat 1 5
sudo sar -u 1 5

# Optimize system parameters
sudo /opt/domainflow/scripts/ops/optimize-system.sh
```

## Security Operations

### Daily Security Checks

```bash
# Check fail2ban status
sudo fail2ban-client status

# Review authentication logs
sudo grep "authentication failure" /var/log/auth.log | tail -10

# Check for rootkit
sudo rkhunter --check --skip-keypress
```

### Weekly Security Tasks

```bash
# Update security signatures
sudo freshclam  # if ClamAV is installed

# Run security audit
sudo /opt/domainflow/scripts/ops/security-audit.sh

# Review firewall logs
sudo grep "DPT=" /var/log/kern.log | tail -20
```

### Security Incident Response

```bash
# Immediate threat assessment
sudo /opt/domainflow/scripts/ops/threat-assessment.sh

# Block malicious IPs
sudo /opt/domainflow/scripts/firewall/block-ip.sh MALICIOUS_IP

# Generate security report
sudo /opt/domainflow/scripts/ops/security-incident-report.sh
```

## Troubleshooting Quick Reference

### Common Issues

| Issue | Command | Solution |
|-------|---------|----------|
| Service won't start | `systemctl status service-name` | Check logs, restart dependencies |
| High CPU usage | `top -p $(pgrep domainflow)` | Check for runaway processes |
| Database connection issues | `pg_isready -h localhost -p 5432` | Restart PostgreSQL, check config |
| nginx 502 errors | `nginx -t && systemctl status nginx` | Check upstream services |
| Disk space full | `df -h && du -sh /opt/domainflow/*` | Clean logs, old backups |

### Emergency Contacts

- **System Administrator**: [Contact Information]
- **Database Administrator**: [Contact Information]
- **Security Team**: [Contact Information]
- **On-call Engineer**: [Contact Information]

### Useful Log Locations

- Application logs: `/opt/domainflow/logs/`
- nginx logs: `/var/log/nginx/`
- System logs: `/var/log/syslog`
- Authentication logs: `/var/log/auth.log`
- Database logs: `/var/log/postgresql/`

This runbook should be reviewed and updated regularly to reflect changes in the environment and procedures.