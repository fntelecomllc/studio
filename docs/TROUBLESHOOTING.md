# DomainFlow Troubleshooting Guide

This guide helps you diagnose and resolve common issues with DomainFlow deployment and operation.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues](#common-issues)
- [Service-Specific Issues](#service-specific-issues)
- [Performance Issues](#performance-issues)
- [Network Issues](#network-issues)
- [Database Issues](#database-issues)
- [Container Issues](#container-issues)
- [Development Issues](#development-issues)
- [Production Issues](#production-issues)
- [Emergency Procedures](#emergency-procedures)

## Quick Diagnostics

### Health Check

Always start with a comprehensive health check:

```bash
# Basic health check
./health-check.sh

# Detailed health check with JSON output
./health-check.sh --detailed --json

# Check specific environment
./health-check.sh production --detailed
```

### System Status

```bash
# Check Docker status
docker info
docker version

# Check running containers
docker ps -a

# Check system resources
docker stats --no-stream
df -h
free -h
```

### Log Analysis

```bash
# View all service logs
docker-compose logs --tail=100

# View specific service logs
docker-compose logs backend --tail=50
docker-compose logs frontend --tail=50
docker-compose logs postgres --tail=50

# Follow logs in real-time
docker-compose logs -f
```

## Common Issues

### 1. Services Won't Start

**Symptoms:**
- Containers exit immediately
- "Port already in use" errors
- Permission denied errors

**Diagnosis:**
```bash
# Check what's using the ports
sudo lsof -i :3000  # Frontend
sudo lsof -i :8080  # Backend
sudo lsof -i :5432  # Database
sudo lsof -i :80    # Nginx

# Check container status
docker-compose ps

# Check container logs
docker-compose logs
```

**Solutions:**

**Port Conflicts:**
```bash
# Kill processes using the ports
sudo kill -9 $(sudo lsof -t -i:3000)
sudo kill -9 $(sudo lsof -t -i:8080)

# Or change ports in .env file
echo "FRONTEND_PORT=3001" >> .env
echo "SERVER_PORT=8081" >> .env
```

**Permission Issues:**
```bash
# Fix script permissions
chmod +x *.sh scripts/*.sh

# Fix Docker permissions (Linux)
sudo usermod -aG docker $USER
newgrp docker

# Fix file ownership
sudo chown -R $USER:$USER .
```

### 2. Database Connection Failures

**Symptoms:**
- "Connection refused" errors
- Backend can't connect to database
- Migration failures

**Diagnosis:**
```bash
# Check database container
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Test database connection
docker-compose exec postgres pg_isready -U domainflow
```

**Solutions:**

**Database Not Ready:**
```bash
# Wait for database to be ready
./scripts/wait-for-it.sh localhost:5432 -- echo "Database is ready"

# Restart database service
docker-compose restart postgres
```

**Connection Configuration:**
```bash
# Check environment variables
docker-compose exec backend env | grep DB_

# Verify database credentials
docker-compose exec postgres psql -U domainflow -d domainflow_dev -c "SELECT 1;"
```

### 3. Build Failures

**Symptoms:**
- Docker build errors
- Missing dependencies
- Out of disk space

**Diagnosis:**
```bash
# Check disk space
df -h

# Check Docker space usage
docker system df

# Check build logs
docker-compose build --no-cache 2>&1 | tee build.log
```

**Solutions:**

**Disk Space Issues:**
```bash
# Clean Docker system
docker system prune -a

# Remove unused volumes
docker volume prune

# Remove unused images
docker image prune -a
```

**Build Cache Issues:**
```bash
# Force rebuild without cache
./start.sh --rebuild

# Or manually
docker-compose build --no-cache
```

### 4. Network Connectivity Issues

**Symptoms:**
- Services can't communicate
- API calls fail
- WebSocket connections fail

**Diagnosis:**
```bash
# Check network configuration
docker network ls
docker network inspect domainflow-network

# Test service connectivity
docker-compose exec frontend curl http://backend:8080/health
docker-compose exec backend curl http://frontend:3000
```

**Solutions:**

**Network Recreation:**
```bash
# Stop services and recreate network
./stop.sh
docker network prune
./start.sh
```

**DNS Resolution:**
```bash
# Check service discovery
docker-compose exec frontend nslookup backend
docker-compose exec backend nslookup postgres
```

## Service-Specific Issues

### Backend Issues

**Go Build Failures:**
```bash
# Check Go version in container
docker-compose exec backend go version

# Check module dependencies
docker-compose exec backend go mod verify
docker-compose exec backend go mod tidy

# Manual build test
docker-compose exec backend go build -o test-build cmd/apiserver/main.go
```

**Configuration Issues:**
```bash
# Check configuration loading
docker-compose exec backend cat config/config.json

# Validate configuration
docker-compose exec backend ./domainflow-apiserver --validate-config

# Check environment variables
docker-compose exec backend env | grep -E "(DB_|API_|LOG_)"
```

**Memory Issues:**
```bash
# Check memory usage
docker stats backend --no-stream

# Increase memory limits in docker-compose.yml
# deploy:
#   resources:
#     limits:
#       memory: 1G
```

### Frontend Issues

**Node.js Build Failures:**
```bash
# Check Node.js version
docker-compose exec frontend node --version
docker-compose exec frontend npm --version

# Clear npm cache
docker-compose exec frontend npm cache clean --force

# Reinstall dependencies
docker-compose exec frontend rm -rf node_modules package-lock.json
docker-compose exec frontend npm install
```

**Next.js Issues:**
```bash
# Check Next.js build
docker-compose exec frontend npm run build

# Clear Next.js cache
docker-compose exec frontend rm -rf .next

# Check environment variables
docker-compose exec frontend env | grep NEXT_PUBLIC_
```

**Hot Reload Issues:**
```bash
# Check file watching
docker-compose exec frontend ls -la node_modules/.bin/next

# Increase file watchers (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Database Issues

**PostgreSQL Connection Issues:**
```bash
# Check PostgreSQL status
docker-compose exec postgres pg_isready

# Check PostgreSQL configuration
docker-compose exec postgres cat /etc/postgresql/postgresql.conf

# Check active connections
docker-compose exec postgres psql -U domainflow -d domainflow_dev -c "SELECT count(*) FROM pg_stat_activity;"
```

**Migration Issues:**
```bash
# Check migration status
./scripts/migrate.sh version

# Force migration to specific version
./scripts/migrate.sh force 1

# Rollback problematic migration
./scripts/migrate.sh down 1
```

**Performance Issues:**
```bash
# Check slow queries
docker-compose exec postgres psql -U domainflow -d domainflow_dev -c "SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Analyze database
docker-compose exec postgres psql -U domainflow -d domainflow_dev -c "VACUUM ANALYZE;"
```

### Nginx Issues

**Configuration Errors:**
```bash
# Test Nginx configuration
docker-compose exec nginx nginx -t

# Reload Nginx configuration
docker-compose exec nginx nginx -s reload

# Check Nginx error logs
docker-compose logs nginx | grep error
```

**SSL/TLS Issues:**
```bash
# Check SSL certificate
openssl x509 -in ssl/cert.pem -text -noout

# Test SSL configuration
curl -I https://localhost --insecure

# Check SSL logs
docker-compose logs nginx | grep ssl
```

## Performance Issues

### High CPU Usage

**Diagnosis:**
```bash
# Check container CPU usage
docker stats --no-stream

# Check system CPU usage
top
htop

# Check specific processes
docker-compose exec backend top
docker-compose exec frontend top
```

**Solutions:**
```bash
# Limit CPU usage in docker-compose.yml
# deploy:
#   resources:
#     limits:
#       cpus: '0.5'

# Scale services
docker-compose up --scale backend=2
```

### High Memory Usage

**Diagnosis:**
```bash
# Check memory usage
docker stats --no-stream
free -h

# Check container memory
docker-compose exec backend free -h
docker-compose exec frontend free -h
```

**Solutions:**
```bash
# Increase memory limits
# In docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       memory: 2G

# Optimize Node.js memory
# NODE_OPTIONS=--max-old-space-size=2048
```

### Slow Response Times

**Diagnosis:**
```bash
# Test API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8080/health

# Create curl-format.txt:
cat > curl-format.txt << 'EOF'
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
EOF
```

**Solutions:**
```bash
# Enable caching
# Add to nginx configuration:
# proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=api_cache:10m;

# Optimize database queries
docker-compose exec postgres psql -U domainflow -d domainflow_dev -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_campaigns_status ON campaigns(status);"
```

## Network Issues

### DNS Resolution Problems

**Diagnosis:**
```bash
# Test DNS resolution
docker-compose exec frontend nslookup backend
docker-compose exec backend nslookup postgres

# Check /etc/hosts
docker-compose exec frontend cat /etc/hosts
```

**Solutions:**
```bash
# Recreate network
docker-compose down
docker network prune
docker-compose up
```

### Firewall Issues

**Diagnosis:**
```bash
# Check firewall status (Linux)
sudo ufw status
sudo iptables -L

# Test port connectivity
telnet localhost 3000
telnet localhost 8080
```

**Solutions:**
```bash
# Open required ports (Linux)
sudo ufw allow 3000
sudo ufw allow 8080
sudo ufw allow 80
sudo ufw allow 443
```

## Container Issues

### Container Keeps Restarting

**Diagnosis:**
```bash
# Check container status
docker-compose ps

# Check restart count
docker inspect $(docker-compose ps -q backend) | grep RestartCount

# Check exit codes
docker-compose logs backend | grep "exited with code"
```

**Solutions:**
```bash
# Check health check configuration
# Increase timeout in docker-compose.yml:
# healthcheck:
#   timeout: 30s
#   retries: 5

# Disable restart policy temporarily
# restart: "no"
```

### Out of Memory Errors

**Diagnosis:**
```bash
# Check for OOM kills
dmesg | grep -i "killed process"
docker-compose logs | grep -i "out of memory"
```

**Solutions:**
```bash
# Increase memory limits
# In docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       memory: 2G

# Add swap space (Linux)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Development Issues

### Hot Reload Not Working

**Solutions:**
```bash
# Increase file watchers (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Check volume mounts
docker-compose exec frontend ls -la /app

# Restart development server
docker-compose restart frontend
```

### Code Changes Not Reflected

**Solutions:**
```bash
# Check volume mounts in docker-compose.yml
# volumes:
#   - .:/app
#   - /app/node_modules

# Force rebuild
./start.sh --rebuild
```

## Production Issues

### SSL Certificate Problems

**Diagnosis:**
```bash
# Check certificate validity
openssl x509 -in ssl/cert.pem -dates -noout

# Test SSL connection
openssl s_client -connect localhost:443 -servername yourdomain.com
```

**Solutions:**
```bash
# Renew Let's Encrypt certificate
sudo certbot renew

# Update certificate in container
docker-compose restart nginx
```

### Load Balancing Issues

**Diagnosis:**
```bash
# Check upstream servers
docker-compose exec nginx cat /etc/nginx/conf.d/default.conf | grep upstream -A 10

# Test backend connectivity
docker-compose exec nginx curl http://backend:8080/health
```

## Emergency Procedures

### Complete System Recovery

```bash
# 1. Stop all services
./stop.sh all --force

# 2. Clean everything
docker system prune -a --volumes

# 3. Reset environment
./reset.sh --force

# 4. Restore from backup
# (Restore database and configuration files)

# 5. Start services
./start.sh production --rebuild
```

### Database Recovery

```bash
# 1. Stop services
./stop.sh

# 2. Backup current state (if possible)
docker-compose exec postgres pg_dump -U domainflow domainflow_dev > emergency_backup.sql

# 3. Restore from backup
docker-compose up -d postgres
docker-compose exec -T postgres psql -U domainflow -d domainflow_dev < backup.sql

# 4. Start other services
./start.sh
```

### Service Isolation

```bash
# Start only database
docker-compose up -d postgres

# Start only backend
docker-compose up -d postgres backend

# Start without frontend
docker-compose up -d postgres backend nginx
```

## Getting Help

### Collecting Debug Information

```bash
# Create debug report
cat > debug-report.sh << 'EOF'
#!/bin/bash
echo "=== DomainFlow Debug Report ===" > debug-report.txt
echo "Date: $(date)" >> debug-report.txt
echo "" >> debug-report.txt

echo "=== System Information ===" >> debug-report.txt
uname -a >> debug-report.txt
docker version >> debug-report.txt
docker-compose version >> debug-report.txt
echo "" >> debug-report.txt

echo "=== Container Status ===" >> debug-report.txt
docker-compose ps >> debug-report.txt
echo "" >> debug-report.txt

echo "=== Health Check ===" >> debug-report.txt
./health-check.sh --detailed >> debug-report.txt
echo "" >> debug-report.txt

echo "=== Recent Logs ===" >> debug-report.txt
docker-compose logs --tail=50 >> debug-report.txt

echo "Debug report saved to debug-report.txt"
EOF

chmod +x debug-report.sh
./debug-report.sh
```

### Support Checklist

Before contacting support, ensure you have:

- [ ] Run health check: `./health-check.sh --detailed`
- [ ] Collected logs: `docker-compose logs > logs.txt`
- [ ] Documented error messages
- [ ] Listed steps to reproduce the issue
- [ ] Checked this troubleshooting guide
- [ ] Tried basic recovery steps

### Useful Commands Reference

```bash
# Quick fixes
./health-check.sh                    # Check system health
./stop.sh && ./start.sh             # Restart everything
./start.sh --rebuild                # Force rebuild
docker system prune -a              # Clean Docker system

# Debugging
docker-compose logs -f              # Follow logs
docker-compose exec <service> bash  # Access container
docker stats                        # Resource usage
docker system df                    # Disk usage

# Recovery
./reset.sh --force                  # Nuclear option
./stop.sh --remove-volumes          # Clean slate
```

Remember: When in doubt, try turning it off and on again! 🔄