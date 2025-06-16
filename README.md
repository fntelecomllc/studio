# DomainFlow - Enterprise Domain Analysis & Campaign Management Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8.svg)](https://golang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15+-000000.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791.svg)](https://www.postgresql.org/)

DomainFlow is a production-ready, enterprise-grade domain analysis and campaign management platform built with modern web technologies. Features real-time WebSocket updates, secure authentication, and a comprehensive API for automated domain research workflows.

## 🚀 Quick Start

Deploy DomainFlow in development mode:

```bash
# Clone the repository
git clone <repository-url>
cd domainflow

# Quick deployment with existing database
./deploy-quick.sh

# Access the application
open http://localhost:3000
```

**Fresh deployment (rebuilds everything):**
```bash
./deploy-fresh.sh
```

**Production deployment:**
```bash
./deploy.sh
```

The deployment system will:
- ✅ Build and deploy the Go backend API server (port 8080)
- ✅ Build and deploy the Next.js frontend (port 3000)
- ✅ Set up PostgreSQL database with schema migrations
- ✅ Configure session-based authentication with CSRF protection
- ✅ Enable real-time WebSocket updates
- ✅ Set up health monitoring and graceful shutdown

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## ✨ Features

### Core Platform Features
- **Campaign Management**: Create, monitor, and manage domain analysis campaigns with V2 stateful API
- **Real-time Updates**: WebSocket-based live progress tracking and notifications
- **Domain Analysis**: Comprehensive DNS validation and HTTP fingerprinting
- **Persona System**: Configurable analysis personas for DNS and HTTP behaviors
- **Proxy Management**: Integrated proxy support for distributed analysis
- **User Management**: Role-based access control with admin and user roles
- **Secure Authentication**: Session-based authentication with CSRF protection

### Enterprise Features
- **Production-Ready Architecture**: Clean service separation with TypeScript strict mode
- **RESTful API**: Comprehensive V1 and V2 API endpoints with OpenAPI documentation
- **Database Optimization**: PostgreSQL with optimized queries and connection pooling
- **Error Handling**: Comprehensive error logging and user-friendly error messages
- **Type Safety**: Full TypeScript implementation with strict type checking
- **Performance Monitoring**: Built-in health checks and performance metrics
- **Scalable Design**: Microservices-ready architecture with clear service boundaries

## 🏗️ Architecture

DomainFlow uses a modern, production-ready architecture with clean service separation:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Next.js Frontend│    │   Go Backend    │    │   PostgreSQL    │
│   (Port 3000)   │◄──►│   (Port 8080)   │◄──►│   (Port 5432)   │
│  - TypeScript   │    │  - Gin Framework│    │  - Optimized    │
│  - Session Auth │    │  - WebSocket    │    │  - Migrations   │
│  - Real-time UI │    │  - RESTful API  │    │  - RBAC Schema  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack

**Frontend:**
- **Next.js 15+** with App Router and TypeScript 5.0+
- **React 18+** with modern hooks and context patterns  
- **Tailwind CSS** for responsive design and component styling
- **Radix UI** for accessible, headless UI components
- **React Hook Form** with Zod validation for type-safe forms
- **TanStack Query** for server state management and caching
- **WebSocket** client for real-time updates

**Backend:**
- **Go 1.21+** with Gin web framework for high-performance APIs
- **PostgreSQL 15+** with optimized connection pooling
- **Session-based authentication** with secure cookies and CSRF tokens
- **WebSocket** support for real-time bidirectional communication
- **Structured logging** with request correlation and error tracking
- **Graceful shutdown** with proper resource cleanup

**Development & Deployment:**
- **TypeScript strict mode** with comprehensive type checking
- **ESLint + Prettier** for code quality and consistency
- **Jest** for unit and integration testing
- **Native deployment scripts** for streamlined development workflow
- **Health monitoring** with automated status checks

## 📋 Prerequisites

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 4GB
- Disk: 10GB free space  
- OS: Linux, macOS, or Windows with WSL2

**Recommended:**
- CPU: 4+ cores
- RAM: 8GB+
- Disk: 20GB+ free space
- OS: Linux (Ubuntu 20.04+) or macOS

### Software Dependencies

**Required:**
- [Go](https://golang.org/doc/install) 1.21+
- [Node.js](https://nodejs.org/) 18+ with npm
- [PostgreSQL](https://www.postgresql.org/) 15+

**Optional:**
- Git 2.20+
- curl (for API testing)
- jq (for JSON processing)

### Database Setup

DomainFlow requires a PostgreSQL database. You can either:

1. **Use existing PostgreSQL installation:**
   ```bash
   # Create database and user
   sudo -u postgres psql
   CREATE DATABASE domainflow_dev;
   CREATE USER domainflow WITH ENCRYPTED PASSWORD 'your-secure-password';
   GRANT ALL PRIVILEGES ON DATABASE domainflow_dev TO domainflow;
   ```

2. **Use the deployment scripts** (handles database setup automatically)

## 🔧 Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd domainflow
```

### 2. Configure Environment

```bash
# Backend configuration
cd backend
cp config.example.json config.json

# Edit backend configuration
nano config.json
```

**Key configuration options:**
```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "domainflow_dev",
    "user": "domainflow",
    "password": "your-secure-password"
  },
  "server": {
    "port": 8080,
    "host": "localhost"
  },
  "security": {
    "session_secret": "your-session-secret-key",
    "csrf_key": "your-csrf-secret-key"
  }
}
```

### 3. Deploy Application

```bash
# Quick deployment (recommended for development)
./deploy-quick.sh

# Fresh deployment (rebuilds everything)
./deploy-fresh.sh

# Production deployment
./deploy.sh
```

### 4. Create Admin User

```bash
# Access backend container
cd backend
./debug_auth_service

# Or use the admin creation script (if available)
./scripts/create-admin-user.sh
```

## 🎯 Usage

### Application Access

**Development Environment:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- Database: localhost:5432

### Basic Operations

```bash
# Deploy application
./deploy-quick.sh     # Quick deployment for development
./deploy-fresh.sh     # Complete rebuild and deployment
./deploy.sh          # Production deployment

# Stop services
./stop-domainflow.sh  # Graceful shutdown

# Check application status
curl http://localhost:8080/ping        # Backend health check
curl http://localhost:3000/api/health  # Frontend health check
```

### API Authentication

The application uses session-based authentication:

1. **Web Interface**: Automatic session handling via secure cookies
2. **API Access**: Use session cookies or API keys for programmatic access

```bash
# Example API call with curl
curl -X GET "http://localhost:8080/api/v2/campaigns" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### Common Workflows

```bash
# 1. Development workflow
./deploy-quick.sh
# ... make code changes ...
./deploy-quick.sh   # Redeploy with changes

# 2. Fresh environment setup
./deploy-fresh.sh   # Complete rebuild
# Create admin user via debug tool

# 3. Production deployment
./deploy.sh
# Configure production database and security settings
```

## ⚙️ Configuration

### Backend Configuration (`backend/config.json`)

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "name": "domainflow_dev",
    "user": "domainflow",
    "password": "your-secure-password",
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
    "session_secret": "your-session-secret-key-32-chars",
    "csrf_key": "your-csrf-secret-key-32-chars",
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

### Frontend Configuration

Frontend configuration is handled through Next.js environment variables:

```bash
# .env.local (create this file)
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NODE_ENV=development
```

### Environment-Specific Settings

**Development:**
- Hot reload enabled for both frontend and backend
- Debug logging enabled
- CORS configured for localhost origins
- Session cookies with secure=false

**Production:**
- Optimized builds and minification
- Structured JSON logging
- SSL/TLS configuration required
- Session cookies with secure=true and sameSite=strict

## 🛠️ Development

### Development Environment Setup

```bash
# 1. Clone and setup
git clone <repository-url>
cd domainflow

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
cd backend
go mod download
cd ..

# 4. Deploy in development mode
./deploy-quick.sh
```

### Development Workflow

```bash
# Daily development routine
git pull origin main

# Start development environment
./deploy-quick.sh

# Make code changes
# Frontend: Hot reload active at http://localhost:3000
# Backend: Restart with ./deploy-quick.sh after changes

# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm test
cd backend && go test ./...

# Commit changes
git add .
git commit -m "feat: add new feature"
git push origin feature-branch
```

### Code Structure

```
src/
├── app/                 # Next.js App Router pages
│   ├── campaigns/       # Campaign management pages  
│   ├── admin/          # Admin panel pages
│   └── auth/           # Authentication pages
├── components/         # Reusable React components
│   ├── ui/             # Base UI components (Radix UI)
│   ├── campaigns/      # Campaign-specific components
│   └── auth/           # Authentication components
├── lib/                # Shared utilities and services
│   ├── services/       # API client services
│   ├── types.ts        # TypeScript type definitions
│   ├── schemas/        # Zod validation schemas
│   └── utils.ts        # Utility functions
└── middleware.ts       # Next.js middleware for auth
```

### Backend Structure

```
backend/
├── cmd/apiserver/      # Application entry point
├── internal/
│   ├── models/         # Data models and types
│   ├── services/       # Business logic services
│   ├── handlers/       # HTTP request handlers
│   ├── middleware/     # HTTP middleware
│   └── database/       # Database operations
└── scripts/            # Deployment and utility scripts
```

## 🚀 Production Deployment

### Production Setup

For production deployment, ensure you have:

1. **Secure Database Configuration**
   ```json
   {
     "database": {
       "host": "your-production-db-host",
       "port": 5432,
       "name": "domainflow_prod",
       "user": "domainflow_prod",
       "password": "secure-production-password",
       "ssl_mode": "require"
     }
   }
   ```

2. **Security Configuration**
   ```json
   {
     "security": {
       "session_secret": "secure-32-character-secret-key",
       "csrf_key": "secure-32-character-csrf-key",
       "bcrypt_cost": 14
     }
   }
   ```

3. **Production Environment Variables**
   ```bash
   NODE_ENV=production
   NEXT_PUBLIC_API_URL=https://your-domain.com/api
   NEXT_PUBLIC_WS_URL=wss://your-domain.com/ws
   ```

### Production Deployment Script

```bash
# Deploy to production
./deploy.sh

# Check production status
curl https://your-domain.com/api/ping
```

### Production Considerations

- **SSL/TLS**: Configure HTTPS with valid certificates
- **Database**: Use production-grade PostgreSQL with backups
- **Logging**: Configure structured logging with log rotation
- **Monitoring**: Set up health checks and performance monitoring
- **Security**: Enable firewall, fail2ban, and security headers
- **Backups**: Regular database and application backups

### Nginx Configuration Example

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Backend API
    location /api {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 📊 Monitoring & Health Checks

### Application Health

```bash
# Backend health check
curl http://localhost:8080/ping

# Frontend health check  
curl http://localhost:3000/api/health

# Database connectivity check
psql -h localhost -U domainflow -d domainflow_dev -c "SELECT 1;"
```

### Log Management

```bash
# Backend logs
tail -f backend/backend.log
tail -f backend/apiserver.log

# Frontend logs  
tail -f frontend.log

# Application-specific logs
grep "ERROR" backend/backend.log
grep "campaign" backend/apiserver.log
```

### Performance Monitoring

```bash
# Check process status
ps aux | grep -E "(apiserver|node|postgres)"

# Monitor resource usage
top -p $(pgrep -f apiserver)
top -p $(pgrep -f "node.*next")

# Database performance
psql -h localhost -U domainflow -d domainflow_dev \
  -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
```

### WebSocket Connection Testing

```bash
# Test WebSocket connection
wscat -c ws://localhost:8080/api/v2/ws \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## 🔧 Troubleshooting

### Common Issues

**Backend won't start:**
```bash
# Check port conflicts
sudo lsof -i :8080

# Check backend configuration
cat backend/config.json

# Check backend logs
tail -f backend/backend.log
```

**Frontend won't start:**
```bash
# Check port conflicts  
sudo lsof -i :3000

# Check Node.js installation
node --version
npm --version

# Check frontend logs
tail -f frontend.log
```

**Database connection issues:**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql
# or
pg_isready -h localhost -p 5432

# Test database connection
psql -h localhost -U domainflow -d domainflow_dev -c "SELECT 1;"

# Check database logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

**Authentication issues:**
```bash
# Check session configuration
grep -A 5 "security" backend/config.json

# Test authentication endpoint
curl -X POST http://localhost:8080/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'
```

### Build and Deployment Issues

```bash
# Clean rebuild
./stop-domainflow.sh
rm -rf backend/apiserver
rm -rf .next
./deploy-fresh.sh

# Check TypeScript errors
npm run typecheck

# Check for syntax errors
npm run lint
```

## 🤝 Contributing

We welcome contributions! Please see our [Development Guide](docs/DEVELOPMENT.md) for detailed information on:

- Setting up development environment
- Code organization and standards
- Testing requirements
- Pull request process

### Quick Contribution Setup

```bash
# Fork and clone repository
git clone https://github.com/yourusername/domainflow.git
cd domainflow

# Start development environment
./start.sh development --seed

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and test
# ... code changes ...
npm test
cd backend && go test ./...

# Commit and push
git commit -m "feat: add amazing feature"
git push origin feature/amazing-feature

# Create pull request
```

## 📚 Documentation

### Core Documentation
- **[API Specification](backend/API_SPEC.md)** - Complete backend API documentation
- **[Development Guide](docs/DEVELOPER_GUIDE.md)** - Development workflow and best practices  
- **[User Guide](docs/USER_GUIDE.md)** - End-user application guide
- **[Troubleshooting Guide](docs/TROUBLESHOOTING.md)** - Common issues and solutions

### Architecture Documentation
- **[System Architecture](docs/SYSTEM_ARCHITECTURE_DOCUMENTATION.md)** - Technical architecture overview
- **[Integration Architecture](docs/INTEGRATION_ARCHITECTURE.md)** - Integration patterns and APIs
- **[Authentication System](docs/AUTHENTICATION_SYSTEM_ARCHITECTURE.md)** - Security and auth details

### Operational Documentation  
- **[Installation Guide](docs/INSTALLATION_GUIDE.md)** - Detailed installation instructions
- **[Operational Runbook](docs/OPERATIONAL_RUNBOOK.md)** - Production operations guide
- **[Security Guide](docs/SECURITY.md)** - Security configuration and best practices

## 🤝 Contributing

We welcome contributions! Please see our [Developer Guide](docs/DEVELOPER_GUIDE.md) for detailed information on:

- Development environment setup
- Code organization and standards  
- Testing requirements
- Pull request process

### Quick Contribution Setup

```bash
# Fork and clone repository
git clone https://github.com/yourusername/domainflow.git
cd domainflow

# Setup development environment
npm install
cd backend && go mod download && cd ..

# Start development environment
./deploy-quick.sh

# Create feature branch
git checkout -b feature/amazing-feature

# Make changes and test
# ... code changes ...
npm run typecheck
npm run lint
npm test

# Commit and push
git commit -m "feat: add amazing feature"
git push origin feature/amazing-feature

# Create pull request
```

### Code Standards

- **TypeScript**: Strict mode enabled with comprehensive type checking
- **ESLint**: Code quality and consistency enforcement
- **Prettier**: Automatic code formatting
- **Conventional Commits**: Standardized commit message format
- **Testing**: Unit tests for critical functionality

## 🔒 Security & Authentication

### Authentication System

DomainFlow implements a secure, production-ready authentication system:

**Session-Based Authentication:**
- **Secure Cookies**: httpOnly, secure, sameSite protection
- **CSRF Protection**: Token-based protection for all state-changing operations
- **Session Management**: Automatic refresh and secure expiration
- **Password Security**: bcrypt hashing with configurable cost factor

**Role-Based Access Control (RBAC):**
- **Admin Role**: Full system access including user management
- **User Role**: Access to campaigns and domain analysis features
- **Permission System**: Granular permissions for specific operations

**API Authentication:**
- **Bearer Tokens**: For programmatic API access
- **Session Cookies**: For web interface authentication
- **CORS Configuration**: Configurable origins for cross-origin requests

### Security Features

**Password Security:**
- Minimum 8 characters (configurable)
- bcrypt hashing with salt rounds (default: 12)
- Secure password reset functionality
- Account lockout after failed attempts

**Request Security:**
- CSRF token validation
- Request rate limiting
- Input validation and sanitization
- XSS protection headers

**Database Security:**
- Prepared statements to prevent SQL injection
- Connection pooling with secure configurations
- Encrypted database connections (SSL/TLS)

### Authentication Endpoints

```bash
# Login
POST /api/v2/auth/login
{
  "username": "admin",
  "password": "password"
}

# Logout
POST /api/v2/auth/logout

# Get current user
GET /api/v2/auth/me

# User management (admin only)
GET /api/v2/users
POST /api/v2/users
PUT /api/v2/users/:id
DELETE /api/v2/users/:id
```

## 📈 Performance & Optimization

### Performance Features

- **Optimized Frontend**: Next.js with code splitting, lazy loading, and static optimization
- **Efficient Backend**: Go with connection pooling and optimized query patterns  
- **Database Performance**: PostgreSQL with proper indexing and query optimization
- **Real-time Updates**: Efficient WebSocket implementation with minimal overhead
- **TypeScript Optimization**: Strict mode compilation with tree shaking

### Performance Monitoring

```bash
# Monitor application performance
top -p $(pgrep -f apiserver)
top -p $(pgrep -f "node.*next")

# Database performance monitoring
psql -h localhost -U domainflow -d domainflow_dev \
  -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"

# Check memory and disk usage
free -h
df -h

# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8080/ping
```

### Performance Tuning

```bash
# Database optimization
psql -h localhost -U domainflow -d domainflow_dev \
  -c "VACUUM ANALYZE;"

# Frontend optimization
npm run build    # Optimized production build
npm run start    # Optimized production server

# Backend optimization (configure in config.json)
# - Adjust database connection pool size
# - Configure request timeouts
# - Enable gzip compression
```

## 🆘 Support & Help

### Getting Help

1. **Check Documentation**: Review the relevant documentation in the `docs/` folder
2. **Check Logs**: Review application logs for error details
3. **Run Health Checks**: Use monitoring commands to diagnose issues
4. **Search Issues**: Check existing GitHub issues for similar problems
5. **Create Issue**: Submit a detailed issue with debug information

### Debug Information Collection

```bash
# Collect basic system information
echo "=== System Info ===" > debug-report.txt
uname -a >> debug-report.txt
echo "=== Node.js Version ===" >> debug-report.txt
node --version >> debug-report.txt
echo "=== Go Version ===" >> debug-report.txt
go version >> debug-report.txt
echo "=== PostgreSQL Status ===" >> debug-report.txt
pg_isready -h localhost -p 5432 >> debug-report.txt

# Collect application logs
echo "=== Backend Logs ===" >> debug-report.txt
tail -n 50 backend/backend.log >> debug-report.txt
echo "=== Frontend Logs ===" >> debug-report.txt
tail -n 50 frontend.log >> debug-report.txt

# Collect configuration (remove sensitive data)
echo "=== Configuration ===" >> debug-report.txt
cat backend/config.json | jq 'del(.database.password, .security)' >> debug-report.txt
```

### Community Support

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For general questions and community support
- **Documentation**: Comprehensive guides in the `docs/` folder
- **Code Examples**: Check the source code for implementation examples

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Go Team** for the excellent programming language and ecosystem
- **PostgreSQL Team** for the robust and reliable database system
- **React & Next.js Teams** for the modern frontend framework and tooling
- **TypeScript Team** for bringing type safety to JavaScript
- **Radix UI Team** for accessible and composable UI components
- **Tailwind CSS Team** for the utility-first CSS framework
- **All Contributors** who have helped improve DomainFlow

---

## 🚀 Ready to Get Started?

```bash
# Clone and deploy in one command
git clone <repository-url> && cd domainflow && ./deploy-quick.sh
```

**Welcome to DomainFlow!** 🎉

For questions, issues, or contributions, please visit our [GitHub repository](https://github.com/yourusername/domainflow) or check our comprehensive [documentation](docs/).

---

*DomainFlow - Enterprise Domain Analysis Made Simple*
