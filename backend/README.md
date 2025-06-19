# DomainFlow Backend - Go API Server

## 🚀 Status: Production Ready

The DomainFlow backend is a high-performance Go API server built with the Gin framework, featuring comprehensive validation, secure authentication, and real-time WebSocket communication.

## 🏗️ Architecture

### Core Components
- **API Handlers**: HTTP request processing with validation middleware
- **Services**: Business logic layer with dependency injection
- **Models**: Database entities with validation tags
- **WebSocket**: Real-time communication with standardized message types
- **Middleware**: Authentication, validation, and CORS handling

### Technology Stack
- **Language**: Go 1.21+
- **Framework**: Gin HTTP framework
- **Database**: PostgreSQL with pgx driver
- **Authentication**: Session-based with HTTP-only cookies
- **WebSocket**: Gorilla WebSocket for real-time updates
- **Validation**: Comprehensive runtime validation

## 📂 Project Structure

```
backend/
├── cmd/
│   └── apiserver/           # Application entry point
│       └── main.go         # Server initialization and configuration
├── internal/
│   ├── api/                # HTTP handlers and API endpoints
│   │   ├── auth_handlers.go            # Authentication endpoints
│   │   ├── campaign_handlers.go        # Campaign CRUD operations
│   │   ├── campaign_orchestrator_handlers.go  # Campaign control
│   │   ├── admin_handlers.go           # Admin user management
│   │   ├── keyword_*.go               # Keyword management
│   │   ├── persona_handlers.go        # Persona management
│   │   └── proxy_handlers.go          # Proxy management
│   ├── models/             # Database models and validation
│   │   ├── models.go                  # Core data models
│   │   ├── auth_models.go             # Authentication models
│   │   └── validation_tags.go         # Custom validation rules
│   ├── services/           # Business logic services
│   │   ├── interfaces.go              # Service interfaces
│   │   ├── auth_service.go            # Authentication service
│   │   ├── campaign_service.go        # Campaign business logic
│   │   └── admin_service.go           # Admin operations
│   ├── middleware/         # HTTP middleware
│   │   ├── auth.go                    # Authentication middleware
│   │   ├── validation.go              # Runtime validation middleware
│   │   └── cors.go                    # CORS configuration
│   ├── websocket/          # WebSocket handling
│   │   ├── websocket.go               # WebSocket manager
│   │   ├── message_types.go           # Standardized message types
│   │   └── client.go                  # Client connection handling
│   └── database/           # Database operations
│       ├── connection.go              # Database connection setup
│       └── migrations/                # Schema migrations
├── database/               # Database schema and setup
│   ├── schema.sql                     # Main database schema
│   └── migrations/                    # Migration files
├── scripts/               # Build and deployment scripts
├── test_data/            # Test fixtures and sample data
├── Makefile              # Build automation
├── go.mod                # Go module dependencies
└── config.json           # Server configuration
```

## 🛠️ Development Setup

### Prerequisites
- Go 1.21 or higher
- PostgreSQL 13+ database
- Make (for build automation)

### Installation

```bash
# Clone and navigate to backend
cd backend

# Install dependencies
go mod download

# Build the application
make build

# Run tests
make test

# Start development server
make run
```

### Configuration

Create `config.json` based on `config.example.json`:

```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "user": "domainflow",
    "password": "your_password",
    "dbname": "domainflow_dev",
    "sslmode": "disable"
  },
  "server": {
    "port": 8080,
    "cors_origins": ["http://localhost:3000"],
    "session_secret": "your-session-secret-key"
  },
  "auth": {
    "session_duration": "24h",
    "cookie_name": "domainflow_session",
    "cookie_secure": false,
    "cookie_httponly": true
  }
}
```

### Database Setup

```bash
# Create database
createdb domainflow_dev

# Run migrations
psql domainflow_dev < database/schema.sql

# Or use the migration tool
make migrate
```

## 🔧 Build Commands

```bash
# Development
make run                    # Run development server with hot reload
make build                  # Build binary to bin/studio
make test                   # Run all tests
make test-coverage          # Run tests with coverage report

# Production
make build-prod             # Build optimized production binary
make docker                 # Build Docker image

# Maintenance
make clean                  # Clean build artifacts
make lint                   # Run Go linting
make format                 # Format Go code
```

## 📊 API Endpoints

### Authentication
- `POST /auth/login` - User login with credentials
- `POST /auth/logout` - User logout and session cleanup
- `GET /auth/refresh` - Refresh session token
- `GET /auth/status` - Check authentication status

### Campaigns
- `GET /api/v2/campaigns` - List all campaigns
- `POST /api/v2/campaigns` - Create new campaign
- `GET /api/v2/campaigns/{id}` - Get campaign details
- `PUT /api/v2/campaigns/{id}` - Update campaign
- `DELETE /api/v2/campaigns/{id}` - Delete campaign
- `POST /api/v2/campaigns/{id}/start` - Start campaign execution
- `POST /api/v2/campaigns/{id}/stop` - Stop campaign execution

### Admin Operations
- `GET /api/v2/admin/users` - List all users
- `POST /api/v2/admin/users` - Create new user
- `GET /api/v2/admin/users/{id}` - Get user details
- `PUT /api/v2/admin/users/{id}` - Update user
- `DELETE /api/v2/admin/users/{id}` - Delete user

### WebSocket
- `GET /ws` - WebSocket connection for real-time updates

## ��️ Security Features

### Authentication
- Session-based authentication with HTTP-only cookies
- CSRF protection with SameSite cookie attributes
- Secure session storage with encrypted cookies
- Automatic session expiration and renewal

### Validation
- Comprehensive runtime validation middleware
- Input sanitization and type checking
- SQL injection prevention with parameterized queries
- XSS protection with proper output encoding

### Authorization
- Role-based access control (RBAC)
- Permission checking middleware
- Admin-only endpoints protection
- Resource-level access controls

## 🔗 WebSocket Communication

### Message Types
- `campaign_progress` - Campaign execution updates
- `campaign_complete` - Campaign completion notification
- `system_notification` - System-wide notifications
- `error_notification` - Error and warning messages

### Message Format
```json
{
  "type": "campaign_progress",
  "timestamp": "2025-06-19T10:30:00Z",
  "data": {
    "campaignId": "uuid",
    "totalItems": 1000,
    "processedItems": 450,
    "successCount": 425,
    "errorCount": 25,
    "estimatedCompletion": "2025-06-19T10:45:00Z"
  }
}
```

## 🗄️ Database Schema

### Core Tables
- **users**: User accounts and authentication
- **campaigns**: Campaign definitions and metadata
- **generated_domains**: Domain generation results
- **dns_validation_results**: DNS validation outcomes
- **http_keyword_results**: HTTP keyword analysis results
- **audit_logs**: Comprehensive operation logging

### Relationships
- Users → Campaigns (one-to-many)
- Campaigns → Results (one-to-many per result type)
- All operations → Audit Logs (comprehensive tracking)

## 🧪 Testing

### Test Structure
```bash
internal/
├── api/
│   └── *_test.go           # API handler tests
├── services/
│   └── *_test.go           # Service layer tests
├── models/
│   └── *_test.go           # Model validation tests
└── middleware/
    └── *_test.go           # Middleware tests
```

### Running Tests
```bash
# All tests
make test

# Specific package
go test ./internal/api/...

# With coverage
make test-coverage

# Integration tests
make test-integration
```

## 📦 Dependencies

### Core Dependencies
- `github.com/gin-gonic/gin` - HTTP framework
- `github.com/jackc/pgx/v5` - PostgreSQL driver
- `github.com/gorilla/websocket` - WebSocket support
- `github.com/google/uuid` - UUID generation
- `golang.org/x/crypto` - Password hashing

### Development Dependencies
- `github.com/stretchr/testify` - Testing framework
- `github.com/golang/mock` - Mock generation
- `golang.org/x/tools` - Development tools

## 🚀 Deployment

### Production Build
```bash
# Build optimized binary
make build-prod

# Run with production config
./bin/studio -config=config.production.json
```

### Docker Deployment
```bash
# Build Docker image
make docker

# Run container
docker run -p 8080:8080 domainflow-backend
```

### Environment Variables
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=domainflow_prod
export DB_USER=domainflow
export DB_PASSWORD=your_password
export SERVER_PORT=8080
export SESSION_SECRET=your_production_secret
```

## 🔍 Monitoring

### Health Checks
- `GET /health` - Basic health status
- `GET /health/db` - Database connectivity
- `GET /health/detailed` - Comprehensive system status

### Metrics
- Request duration and count
- Database connection pool status
- Active WebSocket connections
- Error rates by endpoint

## 📚 Additional Documentation

- See `../API_SPEC.md` for complete API specification
- See `../DATABASE_SETUP_GUIDE.md` for database details
- See `../docs/` for architecture documentation
- See `../PHASE_5_FINAL_STATUS.md` for recent updates

## 🤝 Contributing

1. Follow Go standard code style (`gofmt`)
2. Write comprehensive tests for new features
3. Update API documentation for new endpoints
4. Ensure database migrations are backwards compatible
5. Add proper error handling and logging

---

**DomainFlow Backend** - High-performance Go API server with enterprise-grade security and real-time capabilities.
