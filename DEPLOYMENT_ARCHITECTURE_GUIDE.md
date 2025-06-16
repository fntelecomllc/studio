# DomainFlow Deployment & Architecture Guide

## Overview

DomainFlow is a production-ready, enterprise-grade domain analysis and campaign management platform built with modern web technologies. This guide covers deployment, architecture, and operational considerations.

## Current Architecture

### Technology Stack

**Frontend (TypeScript/React/Next.js)**
- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript 5.0+ with strict mode
- **UI Library**: React 18+ with Radix UI components
- **Styling**: Tailwind CSS with custom component system
- **State Management**: TanStack Query for server state, React Context for client state
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Next.js built-in bundler with optimization

**Backend (Go/PostgreSQL)**
- **Language**: Go 1.21+ with Gin web framework
- **Database**: PostgreSQL 15+ with optimized connection pooling
- **Authentication**: Session-based with secure cookies and CSRF protection
- **WebSocket**: Real-time bidirectional communication
- **Logging**: Structured JSON logging with correlation IDs
- **Security**: bcrypt password hashing, input validation, SQL injection prevention

**Infrastructure**
- **Deployment**: Native deployment scripts (no Docker required)
- **Database**: PostgreSQL with automated migrations
- **Web Server**: Direct application serving (development) or behind reverse proxy (production)
- **Monitoring**: Built-in health checks and performance metrics

### Service Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Next.js Frontend  │────▶│   Go Backend API    │────▶│   PostgreSQL DB     │
│   (Port 3000)       │     │   (Port 8080)       │     │   (Port 5432)       │
│                     │     │                     │     │                     │
│ • Session Auth      │     │ • RESTful API v1/v2 │     │ • User Management   │
│ • Real-time UI      │◀────│ • WebSocket Server  │     │ • Campaign Data     │
│ • CSRF Protection   │     │ • Authentication    │     │ • Persona/Proxy     │
│ • Type Safety       │     │ • Authorization     │     │ • Audit Logging     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## Deployment Options

### 1. Development Deployment

**Quick Setup:**
```bash
git clone <repository-url>
cd domainflow
./deploy-quick.sh
```

**What it does:**
- Uses existing PostgreSQL database
- Builds and starts backend on port 8080
- Builds and starts frontend on port 3000
- Preserves existing data and configuration

**Use cases:**
- Local development
- Testing changes
- Quick demos

### 2. Fresh Deployment

**Complete Setup:**
```bash
./deploy-fresh.sh
```

**What it does:**
- Completely rebuilds backend and frontend
- Runs database migrations
- Resets all configurations
- Creates clean environment

**Use cases:**
- Initial setup
- Major updates
- Clean environment needed

### 3. Production Deployment

**Production Setup:**
```bash
./deploy.sh
```

**What it does:**
- Optimized production builds
- Security hardening
- Performance optimization
- Production logging configuration

**Use cases:**
- Production environments
- Staging environments
- Performance testing

## Configuration Management

### Backend Configuration (`backend/config.json`)

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "domainflow_dev",
    "user": "domainflow",
    "password": "secure-password",
    "ssl_mode": "disable"
  },
  "server": {
    "port": 8080,
    "host": "localhost",
    "cors_origins": ["http://localhost:3000"],
    "read_timeout": "30s",
    "write_timeout": "30s"
  },
  "security": {
    "session_secret": "32-character-secret-key",
    "csrf_key": "32-character-csrf-key",
    "bcrypt_cost": 12,
    "session_max_age": 86400
  },
  "logging": {
    "level": "INFO",
    "format": "json",
    "file": "logs/app.log"
  }
}
```

### Frontend Configuration (`.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NODE_ENV=development
```

## Database Schema

### Core Tables

**Users and Authentication:**
- `users` - User accounts with roles and permissions
- `sessions` - Active user sessions
- `roles` - Role definitions
- `permissions` - Permission definitions
- `user_roles` - User-role assignments

**Campaign Management:**
- `campaigns` - Campaign definitions and metadata
- `campaign_results` - Analysis results and progress
- `keywords` - Keyword sets for campaigns
- `domains` - Domain lists and generation results

**Configuration:**
- `personas` - DNS and HTTP analysis personas
- `proxies` - Proxy configurations
- `system_config` - System-wide configuration

### Database Migrations

Migrations are automatically applied during deployment:

```bash
# Manual migration commands
cd backend
./scripts/migrate.sh up
./scripts/migrate.sh down
./scripts/migrate.sh create new_feature
```

## Security Architecture

### Authentication Flow

1. **Login Request**: User submits credentials to `/api/v2/auth/login`
2. **Password Verification**: bcrypt comparison with stored hash
3. **Session Creation**: Secure session token generated and stored
4. **Cookie Setting**: HttpOnly, Secure, SameSite cookie set
5. **CSRF Token**: CSRF protection token provided for state changes

### Authorization Model

**Role-Based Access Control (RBAC):**
- **Admin Role**: Full system access, user management, system configuration
- **User Role**: Campaign management, personal data access
- **Permission System**: Granular permissions for specific operations

### Security Features

**Request Security:**
- CSRF token validation for state-changing operations
- Input validation and sanitization
- SQL injection prevention through prepared statements
- XSS protection through content security policy

**Session Security:**
- Secure cookie configuration (HttpOnly, Secure, SameSite)
- Configurable session expiration
- Automatic session refresh
- Session invalidation on logout

**Password Security:**
- bcrypt hashing with configurable cost factor
- Minimum password requirements
- Secure password reset flow
- Account lockout protection

## Performance Optimization

### Frontend Optimization

**Build Optimization:**
- Code splitting and lazy loading
- Static asset optimization
- Tree shaking for minimal bundle size
- Automatic image optimization

**Runtime Optimization:**
- TanStack Query for efficient server state caching
- React 18 concurrent features
- Efficient re-rendering with proper dependency arrays
- WebSocket connection pooling

### Backend Optimization

**Database Optimization:**
- Connection pooling with configurable limits
- Prepared statements for query efficiency
- Proper indexing on frequently queried columns
- Query optimization with EXPLAIN analysis

**Server Optimization:**
- Gin framework for high-performance HTTP routing
- Goroutine-based concurrent request handling
- Efficient WebSocket connection management
- Structured logging with minimal overhead

## Monitoring and Observability

### Health Checks

**Application Health:**
```bash
# Backend health
curl http://localhost:8080/ping

# Frontend health
curl http://localhost:3000/api/health

# Database connectivity
pg_isready -h localhost -p 5432
```

**WebSocket Health:**
```bash
# Test WebSocket connection
wscat -c ws://localhost:8080/api/v2/ws \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Logging

**Backend Logging:**
- Structured JSON logging
- Request correlation IDs
- Error tracking with stack traces
- Performance metrics logging

**Frontend Logging:**
- Client-side error boundary logging
- API request/response logging
- User interaction tracking
- Performance metrics collection

### Metrics Collection

**Application Metrics:**
- Request rate and response times
- Error rates and types
- Active user sessions
- WebSocket connection counts

**System Metrics:**
- CPU and memory usage
- Database connection pool utilization
- Disk space and I/O metrics
- Network throughput

## Backup and Disaster Recovery

### Database Backup

```bash
# Create backup
pg_dump -h localhost -U domainflow domainflow_dev > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
psql -h localhost -U domainflow domainflow_dev < backup_file.sql
```

### Application Backup

```bash
# Backup configuration
cp backend/config.json backup/config_$(date +%Y%m%d_%H%M%S).json

# Backup logs
tar -czf logs_backup_$(date +%Y%m%d_%H%M%S).tar.gz backend/logs/ frontend.log
```

### Disaster Recovery Procedures

1. **Database Recovery**: Restore from latest backup
2. **Configuration Recovery**: Restore configuration files
3. **Application Recovery**: Redeploy from source control
4. **Health Verification**: Run comprehensive health checks

## Scaling Considerations

### Horizontal Scaling

**Frontend Scaling:**
- Multiple Next.js instances behind load balancer
- CDN for static assets
- Edge caching for API responses

**Backend Scaling:**
- Multiple Go API server instances
- Database connection pooling across instances
- WebSocket connection distribution

**Database Scaling:**
- Read replicas for query distribution
- Connection pooling optimization
- Query optimization and indexing

### Vertical Scaling

**Resource Optimization:**
- Memory allocation tuning
- CPU core utilization
- Database configuration tuning
- Application-level caching

## Troubleshooting Guide

### Common Issues

**Application Won't Start:**
```bash
# Check port conflicts
sudo lsof -i :3000 :8080 :5432

# Check configuration
cat backend/config.json

# Check logs
tail -f backend/backend.log
tail -f frontend.log
```

**Database Connection Issues:**
```bash
# Test database connectivity
pg_isready -h localhost -p 5432

# Check database status
sudo systemctl status postgresql

# Check connection limits
psql -h localhost -U domainflow -d domainflow_dev \
  -c "SELECT * FROM pg_stat_activity;"
```

**Authentication Issues:**
```bash
# Test authentication endpoint
curl -X POST http://localhost:8080/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'

# Check session configuration
grep -A 5 "security" backend/config.json
```

### Performance Issues

**Slow Response Times:**
```bash
# Monitor process usage
top -p $(pgrep -f apiserver)
top -p $(pgrep -f "node.*next")

# Check database performance
psql -h localhost -U domainflow -d domainflow_dev \
  -c "SELECT query, state, query_start FROM pg_stat_activity WHERE state = 'active';"
```

**Memory Issues:**
```bash
# Check memory usage
free -h

# Monitor application memory
ps -o pid,ppid,cmd,%mem,%cpu -p $(pgrep -f apiserver)
ps -o pid,ppid,cmd,%mem,%cpu -p $(pgrep -f "node.*next")
```

## Maintenance Procedures

### Regular Maintenance

**Daily:**
- Check application health status
- Monitor error logs
- Verify backup completion

**Weekly:**
- Database maintenance (VACUUM, ANALYZE)
- Log rotation and cleanup
- Security update checks

**Monthly:**
- Performance analysis and optimization
- Capacity planning review
- Security audit and updates

### Update Procedures

**Application Updates:**
```bash
# Stop application
./stop-domainflow.sh

# Update source code
git pull origin main

# Run fresh deployment
./deploy-fresh.sh

# Verify health
curl http://localhost:8080/ping
```

**Database Updates:**
```bash
# Backup before update
pg_dump -h localhost -U domainflow domainflow_dev > pre_update_backup.sql

# Run migrations
cd backend && ./scripts/migrate.sh up

# Verify integrity
./scripts/verify-database.sh
```

---

*This document provides comprehensive guidance for deploying and operating DomainFlow in production environments. For specific implementation details, refer to the source code and inline documentation.*
