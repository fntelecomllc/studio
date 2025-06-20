# DomainFlow - Advanced Domain Generation & Validation Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/domainflow/studio)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue.svg)](https://www.typescriptlang.org/)
[![Go](https://img.shields.io/badge/Go-1.21+-00ADD8.svg)](https://golang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3.3-000000.svg)](https://nextjs.org/)
[![Contract Alignment](https://img.shields.io/badge/Contract_Alignment-100%25-success.svg)](./COMPREHENSIVE_REMEDIATION_REPORT.md)

## 🚀 Project Status: Contract Alignment Complete

DomainFlow has successfully completed a **comprehensive contract alignment effort** resolving 78+ contract violations between frontend, backend, and database. The platform maintains **100% API contract compliance** with type-safe operations throughout the stack.

### Latest Updates (v3.0.0)
- ✅ **15 CRITICAL issues resolved** - Int64 safety with SafeBigInt implementation
- ✅ **4 HIGH priority issues resolved** - API contract compliance
- ✅ **59+ MEDIUM priority issues resolved** - Type safety and validation alignment
- ✅ **Enhanced API Client** - Automatic snake_case/camelCase transformations
- ✅ **Database Schema Aligned** - BIGINT fields, enum constraints, naming conventions

## 📋 Architecture Overview

### Frontend (Next.js 15.3.3 + TypeScript)
- **Type-Safe**: Zero `any` types with branded types (UUID, SafeBigInt)
- **Enhanced API Client**: Automatic naming convention transformations
- **Component Library**: Custom UI components with SafeBigInt handling
- **State Management**: React hooks with performance monitoring
- **Validation**: Aligned Zod schemas matching backend rules
- **Permission System**: Role-based access control throughout

### Backend (Go + Gin Framework)
- **Clean Architecture**: Service-oriented design with dependency injection
- **Type Safety**: Comprehensive validation middleware
- **Database**: PostgreSQL with optimized schema and BIGINT support
- **Authentication**: Session-based with secure cookie handling
- **WebSocket**: Real-time communication with SafeBigInt message handling

### Key Features
- 🔐 **Advanced Security**: Permission-based access control, session management
- ⚡ **Performance Monitoring**: Real-time metrics and optimization
- 🛡️ **Type Safety**: SafeBigInt for int64 fields, UUID branded types
- 📊 **Campaign Management**: Domain generation, DNS validation, HTTP keyword analysis
- 🎯 **Admin Controls**: User management with complete CRUD operations
- 📱 **Responsive UI**: Modern interface with SafeBigInt display components
- 🔄 **Closed-Loop Architecture**: Maintains sequential campaign pipeline integrity

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

# Database setup (IMPORTANT: Apply migrations in order)
createdb domainflow_dev
psql domainflow_dev < backend/database/schema.sql
psql domainflow_dev < migrations/contract_alignment/001_critical_int64_fields.sql
psql domainflow_dev < migrations/contract_alignment/002_missing_required_columns.sql
psql domainflow_dev < migrations/contract_alignment/003_enum_constraints_alignment.sql
psql domainflow_dev < migrations/contract_alignment/004_naming_convention_fixes.sql
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
│   │   │   ├── api/         # Enhanced API client with transformations
│   │   │   ├── monitoring/  # Performance monitoring system
│   │   │   ├── schemas/     # Aligned validation schemas
│   │   │   ├── services/    # Enhanced services (API, WebSocket)
│   │   │   ├── types/       # Branded types (UUID, SafeBigInt)
│   │   │   └── utils/       # Case transformations & validators
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
├── migrations/              # Contract alignment migrations
│   └── contract_alignment/  # Database schema fixes
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
- **TypeScript**: Strict mode enabled, branded types for safety
- **Contract Alignment**: 100% frontend/backend/database alignment
- **ESLint**: Comprehensive rules with test file exceptions
- **Go**: Standard Go practices with comprehensive error handling
- **Testing**: Unit & integration tests for all critical paths

## 🔄 API Client & Transformations

The enhanced API client provides automatic transformations between frontend and backend naming conventions:

```typescript
import { enhancedApiClient } from '@/lib/services/apiClient.enhanced';

// Frontend uses camelCase
const response = await enhancedApiClient.post('/api/v2/campaigns', {
  campaignType: 'domain_generation',
  domainGenerationParams: {
    totalPossibleCombinations: createSafeBigInt('1000000000000')
  }
});

// Automatically transformed to snake_case for backend
// Response transformed back to camelCase
console.log(response.data.campaignId); // Not campaign_id
```

## 📊 API Documentation

The API follows OpenAPI 3.0 specification with automatically generated TypeScript clients.

### Key Endpoints
- **Authentication**: `/auth/login`, `/auth/logout`, `/auth/refresh`
- **Campaigns**: `/api/v2/campaigns/*` - Full CRUD operations
- **Admin**: `/api/v2/admin/*` - User & system management (including PUT /users/:id)
- **WebSocket**: `/ws` - Real-time campaign updates with SafeBigInt support

See `API_SPEC.md` for complete API documentation.

## 🗄️ Database

PostgreSQL database with optimized schema for high-performance domain operations.

### Key Schema Features
- **BIGINT fields**: All counters use BIGINT to prevent int64 overflow
- **Enum constraints**: Aligned with Go backend enums
- **Snake_case naming**: Consistent column naming convention
- **Check constraints**: Validation at database level

### Key Tables
- **users**: Authentication & authorization with UUID primary keys
- **campaigns**: Domain generation & validation campaigns with BIGINT counters
- **domains**: Generated domain results with offset tracking
- **audit_logs**: Comprehensive operation tracking

See `DATABASE_SETUP_GUIDE.md` for schema details and setup instructions.

## 🚀 Deployment

### Production Requirements
- Node.js 18+ (frontend)
- Go 1.21+ (backend)
- PostgreSQL 13+ (database with BIGINT support)
- Redis (optional, for session storage)

### Deployment Guide
See `DEPLOYMENT_GUIDE.md` for comprehensive deployment instructions including:
- Pre-deployment checklist
- Database migration sequence
- Frontend/backend deployment steps
- Rollback procedures
- Post-deployment verification

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

### Contract Alignment Tests
```bash
# Test transformations
npm test src/lib/utils/__tests__/case-transformations.test.ts

# Test API client
npm test src/lib/services/__tests__/api-naming-transformations.test.ts

# Test SafeBigInt handling
npm test src/lib/types/__tests__/uuid-type-safety-fix.test.ts
```

## 📚 Documentation

- `COMPREHENSIVE_REMEDIATION_REPORT.md` - Complete contract alignment documentation
- `DEPLOYMENT_GUIDE.md` - Step-by-step deployment instructions
- `API_SPEC.md` - Complete API specification
- `DATABASE_SETUP_GUIDE.md` - Database schema & setup
- `backend/README.md` - Backend-specific documentation
- `docs/` - Component & architecture documentation
- `docs/audit/` - Individual fix summaries for all contract violations

## 🤝 Contributing

1. Follow TypeScript strict mode with branded types
2. Ensure contract alignment between frontend/backend
3. Write comprehensive tests for new features
4. Update API documentation for endpoint changes
5. Follow Go standard practices and error handling
6. Ensure both frontend and backend build successfully

## 📄 License

[Your License Here]

## 🆘 Support

For technical questions or issues:
1. Check the contract alignment report in `COMPREHENSIVE_REMEDIATION_REPORT.md`
2. Review deployment guide in `DEPLOYMENT_GUIDE.md`
3. Check the documentation in `/docs`
4. Review API specification in `API_SPEC.md`
5. Check database setup in `DATABASE_SETUP_GUIDE.md`

---

**DomainFlow v3.0.0** - Production-ready domain generation and validation platform with 100% contract alignment, advanced type safety, and comprehensive performance monitoring.
