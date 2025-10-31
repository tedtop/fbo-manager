# FBO Manager - Project Overview & Proposal

**Version:** 1.0
**Last Updated:** October 31, 2025
**Status:** In Active Development

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Vision & Goals](#project-vision--goals)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Core Features](#core-features)
6. [Implementation Status](#implementation-status)
7. [Roadmap](#roadmap)

---

## Executive Summary

**FBO Manager** is a comprehensive Fixed-Base Operator (FBO) management system designed to streamline aircraft fueling operations, crew training certification tracking, flight dispatch management, and fuel farm monitoring. The system provides a modern, type-safe API with a responsive web interface for managing day-to-day FBO operations at airports.

### Key Differentiators

- **Type-Safe Full Stack**: OpenAPI-generated TypeScript types ensure frontend-backend contract safety
- **Modern Tech Stack**: Django 5.1 + Next.js 15 with React Server Components
- **Real-Time Fuel Monitoring**: Track fuel tank levels and trigger alerts
- **Certification Tracking**: Automated expiry notifications for fueler training certifications
- **Multi-Site Support**: Designed to scale across multiple FBO locations
- **Developer-Friendly**: Comprehensive API documentation, Docker development environment, pre-commit hooks

---

## Project Vision & Goals

### Business Objectives

1. **Streamline Operations**: Reduce manual tracking of fuel transactions, training, and aircraft servicing
2. **Improve Safety**: Ensure all fuelers maintain current certifications with automated tracking
3. **Optimize Fuel Management**: Monitor tank levels, prevent stockouts, track consumption patterns
4. **Enhance Visibility**: Real-time dashboards for fuel farm status, flight schedules, and dispatch orders
5. **Integrate Systems**: Connect with existing FBO systems (QT Technologies dispatch, external fuel monitoring)

### Technical Objectives

1. **API-First Architecture**: RESTful API with comprehensive OpenAPI documentation
2. **Type Safety**: End-to-end type safety from database to frontend
3. **Developer Experience**: Fast local development with Docker, hot reload, and excellent tooling
4. **Test Coverage**: Comprehensive test suites for backend and frontend
5. **Production Ready**: CI/CD pipelines, monitoring, logging, and deployment automation

---

## Technology Stack

### Backend Stack

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| **Framework** | Django | 5.1+ | Mature ORM, admin interface, extensive ecosystem. Perfect for data-heavy applications. |
| **API Framework** | Django REST Framework | 3.15+ | Industry standard for Django APIs, excellent serialization, permissions, and viewsets. |
| **Database** | PostgreSQL | 15+ (Supabase) | ACID compliance, excellent for relational data. Supabase provides managed hosting with real-time capabilities. |
| **Authentication** | djangorestframework-simplejwt | 5.4+ | Stateless JWT authentication, perfect for API-first architecture. |
| **API Documentation** | drf-spectacular | 0.28+ | OpenAPI 3.0 schema generation from DRF serializers and viewsets. |
| **Admin UI** | django-unfold | 0.42+ | Modern, clean admin interface that improves upon Django's default admin. |
| **Database Driver** | psycopg[binary] | 3.2+ | Fast PostgreSQL adapter for Python, binary package for performance. |
| **Package Manager** | uv | latest | Next-generation Python package manager, 10-100x faster than pip. |

**Why Django?**
- Built-in ORM handles complex relational data (aircraft, flights, fuelers, training, transactions)
- Django Admin provides instant CRUD interface for operations staff
- Excellent security defaults (CSRF, XSS, SQL injection protection)
- Mature ecosystem with libraries for every need
- Easy to deploy and scale

### Frontend Stack

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| **Framework** | Next.js | 15.2+ | React Server Components reduce client-side JS, App Router for modern routing. |
| **UI Framework** | React | 19.0+ | Industry standard, huge ecosystem, excellent DX. |
| **Authentication** | NextAuth.js | 4.24+ | Drop-in authentication for Next.js, supports JWT credentials provider. |
| **UI Components** | Radix UI | latest | Unstyled, accessible component primitives. |
| **Styling** | Tailwind CSS | 3.4+ | Utility-first CSS, rapid development, excellent DX. |
| **Forms** | React Hook Form | 7.54+ | Performant form handling with minimal re-renders. |
| **Validation** | Zod | 3.24+ | TypeScript-first schema validation, integrates with React Hook Form. |
| **Type Generation** | openapi-typescript-codegen | latest | Auto-generates TypeScript client from OpenAPI schema. |
| **Icons** | Lucide React | latest | Beautiful, consistent icon set. |
| **Package Manager** | pnpm | latest | Fast, disk-efficient package manager with monorepo support. |
| **Code Quality** | Biome | latest | Fast all-in-one formatter/linter replacing ESLint + Prettier. |

**Why Next.js 15?**
- Server Components reduce JavaScript bundle size and improve performance
- Server Actions simplify form submissions without client-side API calls
- Image optimization out of the box
- Excellent TypeScript support
- File-based routing is intuitive
- Easy deployment to Vercel or Docker

### DevOps & Infrastructure

| Component | Technology | Justification |
|-----------|-----------|---------------|
| **Containerization** | Docker + Docker Compose | Consistent dev environment, easy onboarding, production parity. |
| **CI/CD** | GitHub Actions | Native GitHub integration, free for public repos, excellent ecosystem. |
| **Code Quality** | Ruff + Biome + pre-commit | Fast linting/formatting, enforces conventional commits. |
| **Testing** | pytest + pytest-django | Industry standard for Python testing. |
| **Dev Containers** | VS Code Dev Containers | Instant reproducible development environment. |

### What's NOT Implemented Yet

| Component | Status | Reason |
|-----------|--------|--------|
| **Redis** | ❌ Not implemented | Planned for caching and session storage. Not critical for MVP. |
| **Celery** | ❌ Not implemented | Planned for background tasks (email notifications, training reminders). Not critical for MVP. |
| **Frontend Tests** | ❌ Not implemented | Planned to add Jest/Vitest for component testing. |
| **Monitoring** | ❌ Not implemented | Planned to add Sentry for error tracking and monitoring. |
| **Rate Limiting** | ❌ Not implemented | Needed before production deployment. |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client Browser                        │
│                    (http://localhost:3000)                    │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │ HTTP Requests
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                      Next.js Frontend                         │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  App Router (React Server Components)                │    │
│  │  - (auth): login, register                           │    │
│  │  - (account): profile, change-password               │    │
│  │  - (dashboard): dashboard, fuel-farm, dispatch       │    │
│  │                  flights, training                   │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Server Actions (Form Submissions)                   │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  API Client (OpenAPI Generated TypeScript)          │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │ REST API Calls (JWT Auth)
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                    Django REST API                            │
│                   (http://localhost:8000)                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  API Endpoints                                       │    │
│  │  - /api/auth/ (JWT tokens)                          │    │
│  │  - /api/users/ (user management)                    │    │
│  │  - /api/tanks/ (fuel farm)                          │    │
│  │  - /api/flights/ (flight tracking)                  │    │
│  │  - /api/transactions/ (fuel dispatch)               │    │
│  │  - /api/trainings/ (certification tracking)         │    │
│  └──────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Django ORM (SQLAlchemy-like)                       │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │ SQL Queries
                            │
┌───────────────────────────▼───────────────────────────────────┐
│                   PostgreSQL Database                         │
│                        (Supabase)                             │
│  Tables: users, fuel_tanks, tank_level_readings,             │
│          aircraft, flights, terminal_gates,                   │
│          fuelers, trainings, fueler_trainings,                │
│          fuel_transactions, fueler_assignments                │
└───────────────────────────────────────────────────────────────┘
```

### Data Flow

**Authentication Flow:**
```
User → Login Form → Server Action → Django /api/auth/token/
     ← JWT Tokens ← NextAuth Session ← JWT Response

Subsequent Requests:
User → API Call → ApiClient + JWT Header → Django Endpoint → Database
                                         ← JSON Response ←
```

**Type Safety Flow:**
```
Django Models → DRF Serializers → drf-spectacular → OpenAPI Schema
                                                   ↓
                                          openapi-typescript-codegen
                                                   ↓
                                    TypeScript Types & API Client
                                                   ↓
                                          Next.js Components
```

### Deployment Architecture

**Development (Current):**
```
Docker Compose
├── api (Django) - Port 8000
└── web (Next.js) - Port 3000
```

**Production (Planned):**
```
Cloud Provider (AWS/GCP/Azure)
├── Load Balancer
├── Next.js (Serverless/Container)
├── Django API (Container/ECS/Cloud Run)
├── PostgreSQL (Managed Database)
├── Redis (Managed Cache) - Planned
└── Celery Workers (Container) - Planned
```

---

## Core Features

### 1. Fuel Farm Management

**Purpose**: Monitor fuel tank levels, track consumption, and prevent stockouts.

**Features Implemented:**
- ✅ Tank configuration (Jet A, Avgas, capacity, thresholds)
- ✅ Real-time tank level readings
- ✅ Historical level tracking
- ✅ Dashboard with tank status visualization

**API Endpoints:**
- `GET /api/tanks/` - List all tanks with latest readings
- `GET /api/tanks/{id}/readings/` - Historical data for graphing

**Database Models:**
- `FuelTank` - Tank configuration
- `TankLevelReading` - Historical readings (read-only, external source)

---

### 2. Flight Management

**Purpose**: Track inbound/outbound flights, aircraft assignments, and gate locations.

**Features Implemented:**
- ✅ Flight tracking with status (scheduled, boarding, departed, arrived, cancelled)
- ✅ Aircraft assignment (tail number, type, airline)
- ✅ Terminal gate assignment
- ✅ Departure/arrival time tracking
- ✅ Flight list with filtering by status and date

**API Endpoints:**
- `GET /api/flights/?status=scheduled&date=2025-10-31`
- `GET /api/flights/{id}/` - Flight detail with nested aircraft/gate

**Database Models:**
- `Flight` - Flight information
- `Aircraft` - Aircraft registry
- `TerminalGate` - Terminal and gate assignments

---

### 3. Fuel Dispatch Management

**Purpose**: Track fuel service orders, assign fuelers, and sync with QT Technologies dispatch system.

**Features Implemented:**
- ✅ Fuel transaction creation and tracking
- ✅ Fueler assignment to transactions
- ✅ Progress tracking (started → in_progress → completed)
- ✅ QT Technologies integration fields (qt_dispatch_id, qt_sync_status)
- ✅ Charge flags (JSONField for flexible billing metadata)

**API Endpoints:**
- `GET /api/transactions/` - List fuel orders
- `POST /api/transactions/` - Create new fuel order
- `POST /api/transactions/{id}/assign_fueler/` - Assign fueler
- `POST /api/transactions/{id}/update_progress/` - Update status

**Database Models:**
- `FuelTransaction` - Dispatch orders
- `FuelerAssignment` - Many-to-many junction table (transaction ↔ fueler)

---

### 4. Training & Certification Management

**Purpose**: Track fueler certifications, expiry dates, and ensure compliance.

**Features Implemented:**
- ✅ Training course definitions (course name, validity period)
- ✅ Aircraft-type-specific training support
- ✅ Fueler certification tracking
- ✅ Expiry date calculation and tracking
- ✅ "Expiring Soon" endpoint for proactive alerts
- ✅ Certified-by tracking (who signed off)

**API Endpoints:**
- `GET /api/trainings/` - List all training courses
- `GET /api/fuelers/{id}/certifications/` - Fueler's certs
- `GET /api/fuelers/expiring_soon/` - Alert endpoint
- `GET /api/fueler-certifications/?status=expired` - Filter by status

**Database Models:**
- `Training` - Course definitions
- `Fueler` - Employee profile (OneToOne with User)
- `FuelerTraining` - Certification records with expiry tracking

---

### 5. User & Authentication Management

**Purpose**: Secure access control, role-based permissions, user profiles.

**Features Implemented:**
- ✅ Custom User model (extends Django's AbstractUser)
- ✅ Role field (admin, manager, fueler, dispatcher)
- ✅ Employee ID tracking
- ✅ JWT-based authentication (access + refresh tokens)
- ✅ NextAuth.js frontend integration
- ✅ Password change and account deletion
- ✅ Admin-only user management endpoints

**API Endpoints:**
- `POST /api/auth/token/` - Login (obtain JWT)
- `POST /api/auth/refresh/` - Refresh access token
- `GET /api/users/me/` - Current user profile
- `POST /api/users/change-password/` - Change password
- `DELETE /api/users/delete-account/` - Delete account

**Database Models:**
- `User` - Custom user model with FBO-specific fields

---

### 6. Admin Interface

**Purpose**: Provide operations staff with CRUD interface for managing data.

**Features Implemented:**
- ✅ Django Unfold theme (modern, clean UI)
- ✅ Custom admin for all models
- ✅ Inline editing for related objects
- ✅ List filters and search
- ✅ Readonly fields for audit tracking

**Access:** `http://localhost:8000/admin/`

---

## Implementation Status

### ✅ Fully Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Django Backend | ✅ Complete | Django 5.1 + DRF 3.15 |
| Next.js Frontend | ✅ Complete | Next.js 15.2, App Router, Server Components |
| Database Models | ✅ Complete | All 11 models implemented and migrated |
| Authentication | ✅ Complete | JWT + NextAuth integration working |
| API Endpoints | ✅ Complete | 30+ endpoints across 8 resource types |
| OpenAPI Docs | ✅ Complete | Swagger UI at `/api/schema/swagger-ui/` |
| Docker Setup | ✅ Complete | docker-compose.yaml for local dev |
| CI/CD | ✅ Complete | GitHub Actions for tests and linting |
| Frontend Pages | ✅ Complete | Dashboard, Fuel Farm, Dispatch, Flights, Training |
| Server Actions | ✅ Complete | Form submissions via Next.js Server Actions |
| Type Generation | ✅ Complete | OpenAPI → TypeScript types |
| Admin Interface | ✅ Complete | Django Unfold theme with custom admin |
| Testing Setup | ✅ Complete | pytest + pytest-django + factory-boy |

### ⚠️ Partially Implemented

| Feature | Status | What's Missing |
|---------|--------|----------------|
| API Tests | ⚠️ Partial | Only 2 test cases, need comprehensive coverage |
| Permissions | ⚠️ Development | Using `AllowAnyReadOnly` - NOT production-ready |
| Error Handling | ⚠️ Basic | Need standardized error responses |
| Pagination | ⚠️ Configured | Page-based pagination enabled, needs testing |

### ❌ Not Yet Implemented

| Feature | Priority | Reason Not Implemented |
|---------|----------|------------------------|
| Redis Cache | Medium | Not critical for MVP, adds complexity |
| Celery Tasks | Medium | Needed for email notifications, training reminders |
| Frontend Tests | High | Jest/Vitest not configured yet |
| Rate Limiting | High | Required before production |
| Monitoring/Logging | High | Sentry integration needed |
| Email Notifications | Medium | Celery dependency |
| CORS Configuration | High | Needed for production deployment |
| API Versioning | Low | Can be added later |
| Database Connection Pooling | Medium | Optimization for production |

---

## Roadmap

### Phase 1: MVP (Current) ✅
- ✅ Core data models
- ✅ REST API endpoints
- ✅ Frontend dashboard
- ✅ Authentication
- ✅ Docker development environment

### Phase 2: Production Readiness (Next 2-4 weeks)
- [ ] Comprehensive test coverage (80%+ backend, 70%+ frontend)
- [ ] Production-ready permissions (remove AllowAnyReadOnly)
- [ ] Rate limiting on API endpoints
- [ ] CORS configuration
- [ ] Error tracking (Sentry integration)
- [ ] Logging and monitoring
- [ ] Production deployment guide

### Phase 3: Background Tasks (4-6 weeks)
- [ ] Redis caching layer
- [ ] Celery task queue
- [ ] Email notifications
- [ ] Training expiry reminders (automated)
- [ ] Daily fuel level reports
- [ ] Low tank level alerts

### Phase 4: Integrations (6-8 weeks)
- [ ] QT Technologies API integration
- [ ] External tank monitoring system integration
- [ ] Email/SMS notification service
- [ ] Reporting and analytics

### Phase 5: Advanced Features (8-12 weeks)
- [ ] Mobile app (React Native)
- [ ] Real-time updates (WebSockets)
- [ ] Advanced analytics dashboard
- [ ] Multi-site management
- [ ] Billing and invoicing

---

## Getting Started

For detailed setup instructions, see:
- [Developer Guide](./DEVELOPER_GUIDE.md) - Local setup and development
- [Architecture Documentation](./ARCHITECTURE.md) - Detailed architecture
- [API Reference](./API_REFERENCE.md) - Complete API documentation
- [Database Schema](./DATABASE_SCHEMA.md) - Data model details
- [File Structure](./FILE_STRUCTURE.md) - Annotated codebase guide

**Quick Start:**

```bash
# Clone repository
git clone https://github.com/yourusername/fbo-manager.git
cd fbo-manager

# Copy environment templates
cp .env.backend.template .env.backend
cp .env.frontend.template .env.frontend

# Start development environment
docker-compose up

# Access services
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/api/schema/swagger-ui/
# Django Admin: http://localhost:8000/admin/
```

---

## Contributing

See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for:
- Code style guidelines
- Git workflow (conventional commits)
- Testing requirements
- Pull request process

---

## License

See [LICENSE.md](../LICENSE.md)

---

## Support

For questions or issues:
- GitHub Issues: [https://github.com/yourusername/fbo-manager/issues](https://github.com/yourusername/fbo-manager/issues)
- Email: stelliosbonadurer@gmail.com

---

**Document History:**
- v1.0 - October 31, 2025 - Initial comprehensive documentation synthesizing FBO-33 and FBO-7
