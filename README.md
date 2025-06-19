# DomainFlow - Advanced Domain Generation & Validation Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/domainflow/studio)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8.svg)](https://golang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3.3-000000.svg)](https://nextjs.org/)

## 🚀 Project Status: Phase 5 Complete

DomainFlow has successfully completed **Phase 5: Advanced Security & Performance** with all architectural goals achieved. The platform is production-ready with comprehensive type safety, runtime validation, and performance monitoring.

## 📋 Architecture Overview

### Frontend (Next.js 15.3.3 + TypeScript)
- **Type-Safe**: Zero `any` types in production code
- **Component Library**: Custom UI components with SafeBigInt handling
- **State Management**: React hooks with performance monitoring
- **API Integration**: Type-safe client with runtime validation
- **Permission System**: Role-based access control throughout

### Backend (Go + Gin Framework)
- **Clean Architecture**: Service-oriented design with dependency injection
- **Type Safety**: Comprehensive validation middleware
- **Database**: PostgreSQL with optimized schema
- **Authentication**: Session-based with secure cookie handling
- **WebSocket**: Real-time communication with standardized message types

### Key Features
- 🔐 **Advanced Security**: Permission-based access control, session management
- ⚡ **Performance Monitoring**: Real-time metrics and optimization
- 🛡️ **Runtime Validation**: Type-safe data handling throughout the stack
- 📊 **Campaign Management**: Domain generation, DNS validation, HTTP keyword analysis
- 🎯 **Admin Controls**: User management, system configuration
- 📱 **Responsive UI**: Modern interface with SafeBigInt display components

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ and npm
- Go 1.21+
- PostgreSQL 13+
- Git

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd studio

# Frontend setup
npm install
npm run generate:schemas  # Generate TypeScript schemas from Go models
npm run dev               # Start development server on http://localhost:3000

# Backend setup (in separate terminal)
cd backend
make build               # Build the Go application
make run                 # Start API server on http://localhost:8080

# Database setup
createdb domainflow_dev
psql domainflow_dev < database/schema.sql
```

### Production Build

```bash
# Frontend production build
npm run build
npm start

# Backend production build
cd backend
make build
./bin/studio
```

## 📂 Project Structure

```
studio/
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── components/      # UI components
│   │   │   ├── auth/        # Permission & authentication components
│   │   │   ├── ui/          # Base UI components (BigInt, forms)
│   │   │   └── campaigns/   # Campaign-specific components
│   │   ├── lib/
│   │   │   ├── api/         # API client & validation wrapper
│   │   │   ├── monitoring/  # Performance monitoring system
│   │   │   ├── schemas/     # Generated & manual validation schemas
│   │   │   └── utils/       # Runtime validators & utilities
│   │   ├── hooks/           # React hooks (permissions, monitoring)
│   │   └── app/             # Next.js 13+ app directory
│   └── docs/                # Component & API documentation
├── backend/                 # Go API server
│   ├── cmd/apiserver/       # Application entry point
│   ├── internal/
│   │   ├── api/             # HTTP handlers & middleware
│   │   ├── models/          # Database models & validation
│   │   ├── services/        # Business logic
│   │   ├── websocket/       # WebSocket message handling
│   │   └── middleware/      # Runtime validation middleware
│   └── database/            # Database migrations & schema
└── scripts/                 # Build & deployment scripts
```

## 🔧 Development

### Frontend Development
```bash
npm run dev          # Development server with hot reload
npm run build        # Production build
npm run lint         # ESLint checking
npm run test         # Run Jest tests
npm run type-check   # TypeScript compilation check
```

### Backend Development
```bash
make build           # Build application
make run             # Run development server
make test            # Run Go tests
make lint            # Run Go linting
make migrate         # Run database migrations
```

### Code Quality
- **TypeScript**: Strict mode enabled, zero `any` types in production
- **ESLint**: Comprehensive rules with test file exceptions
- **Go**: Standard Go practices with comprehensive error handling
- **Testing**: Unit & integration tests for all critical paths

## 📊 API Documentation

The API follows OpenAPI 3.0 specification with automatically generated TypeScript clients.

### Key Endpoints
- **Authentication**: `/auth/login`, `/auth/logout`, `/auth/refresh`
- **Campaigns**: `/api/v2/campaigns/*` - Full CRUD operations
- **Admin**: `/api/v2/admin/*` - User & system management
- **WebSocket**: `/ws` - Real-time campaign updates

See `API_SPEC.md` for complete API documentation.

## 🗄️ Database

PostgreSQL database with optimized schema for high-performance domain operations.

### Key Tables
- **users**: Authentication & authorization
- **campaigns**: Domain generation & validation campaigns
- **domains**: Generated domain results
- **audit_logs**: Comprehensive operation tracking

See `DATABASE_SETUP_GUIDE.md` for schema details and setup instructions.

## 🚀 Deployment

### Production Requirements
- Node.js 18+ (frontend)
- Go 1.21+ (backend)
- PostgreSQL 13+ (database)
- Redis (optional, for session storage)

### Environment Configuration
```bash
# Frontend (.env.production)
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com/ws

# Backend (config.json)
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "dbname": "domainflow_prod"
  },
  "server": {
    "port": 8080,
    "cors_origins": ["https://yourdomain.com"]
  }
}
```

## 🧪 Testing

### Frontend Tests
```bash
npm run test                    # All tests
npm run test:watch             # Watch mode
npm run test:coverage          # Coverage report
```

### Backend Tests
```bash
make test                      # All Go tests
make test-coverage             # Coverage report
make test-integration          # Integration tests
```

## 📚 Documentation

- `API_SPEC.md` - Complete API specification
- `DATABASE_SETUP_GUIDE.md` - Database schema & setup
- `backend/README.md` - Backend-specific documentation
- `docs/` - Component & architecture documentation
- `PHASE_5_FINAL_STATUS.md` - Implementation completion status

## 🤝 Contributing

1. Follow TypeScript strict mode (no `any` types)
2. Write comprehensive tests for new features
3. Update API documentation for endpoint changes
4. Follow Go standard practices and error handling
5. Ensure both frontend and backend build successfully

## 📄 License

[Your License Here]

## 🆘 Support

For technical questions or issues:
1. Check the documentation in `/docs`
2. Review API specification in `API_SPEC.md`
3. Check database setup in `DATABASE_SETUP_GUIDE.md`
4. Review Phase 5 completion status for recent changes

---

**DomainFlow** - Production-ready domain generation and validation platform with advanced security and performance monitoring.
