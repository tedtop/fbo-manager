# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

FBO Manager is a Django + Next.js monorepo application for Fixed-Base Operator (FBO) operations management. It handles flight operations, fuel dispatch, fuel farm monitoring, equipment tracking, line service scheduling, and fueler training certifications.

**Tech Stack:**
- **Backend:** Django 5.1+ with Django REST Framework, PostgreSQL (Supabase), JWT authentication
- **Frontend:** Next.js 15+ with React 19, NextAuth.js, TypeScript, Tailwind CSS
- **Package Manager:** `uv` (backend), `pnpm` (frontend)
- **Container:** Docker Compose for local development

## Commands

### Docker Compose (Primary Development)

```bash
# Start all services (backend + frontend)
docker compose up

# Execute commands in running containers
docker compose exec api <command>
docker compose exec web <command>
```

### Backend Commands

```bash
# Run from host or inside docker container with: docker compose exec api <command>

# Database operations
uv run -- python manage.py makemigrations
uv run -- python manage.py migrate
uv run -- python manage.py createsuperuser

# Run development server (when not using docker compose)
uv run -- python manage.py runserver 0.0.0.0:8000

# Testing
uv run -- pytest .                                    # Run all tests
uv run -- pytest api/tests/test_api.py               # Run specific file
uv run -- pytest api/tests/test_api.py -k "test_name" # Run specific test

# Dependency management
uv add <package-name>                                # Add dependency
uv sync                                              # Install dependencies
```

### Frontend Commands

```bash
# Run from host or inside docker container with: docker compose exec web <command>

# Development
pnpm --filter web dev          # Start Next.js dev server (when not using docker compose)
pnpm --filter web build        # Build production bundle
pnpm --filter web lint         # Run Next.js linting

# Regenerate TypeScript types from Django OpenAPI schema (after backend changes)
pnpm openapi:generate

# Package management
pnpm add <package> -w                    # Add workspace-wide dependency
pnpm --filter web add <package>          # Add to specific app
pnpm --filter web add @frontend/ui       # Add internal workspace package
pnpm install -r                          # Install all dependencies recursively
```

### Accessing Services

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **API Documentation (Swagger):** http://localhost:8000/api/schema/swagger-ui/
- **Django Admin:** http://localhost:8000/admin/

## Architecture

### Backend Structure (Django)

All backend code lives in `backend/api/`:

- **`models.py`** - Single-file model definitions for all domain entities (User, Flight, FuelTransaction, etc.)
- **`serializers.py`** - DRF serializers (read/write, list/detail variations)
- **`viewsets.py`** - API ViewSets with filtering, custom actions, and business logic
- **`api.py`** - User authentication endpoints (separate from main ViewSets)
- **`permissions.py`** - Custom permission classes
- **`urls.py`** - API router registration and URL configuration
- **`settings.py`** - Django configuration (uses environment variables from `.env.backend`)
- **`tests/`** - pytest test suite with factories and fixtures

**Key Models:**
- `User` (extended AbstractUser with role, employee_id, is_active_fueler)
- `Flight` (aircraft operations with status tracking and service requests)
- `FuelTransaction` (fuel dispatch with fueler assignments and QT sync)
- `FuelTank` / `TankLevelReading` (fuel farm monitoring)
- `Fueler` / `Training` / `FuelerTraining` (certification tracking)
- `Equipment` (ground support equipment with maintenance tracking)
- `LineSchedule` (service assignments with personnel and equipment)

**API Patterns:**
- All ViewSets use `AllowAnyReadOnly` permission during development (will be locked down for production)
- Admin-only actions use `IsAdminUser` permission
- List vs. Detail views often use different serializers (e.g., `FlightListSerializer` vs. `FlightDetailSerializer`)
- Custom actions like `@action(detail=True, methods=['post'])` handle business logic (e.g., assigning fuelers, updating progress)
- Filtering via query params: `?status=completed`, `?today=true`, `?start_date=2025-01-01`

### Frontend Structure (Next.js)

Monorepo structure under `frontend/`:

```
frontend/
├── apps/
│   └── web/              # Main Next.js application
│       ├── app/          # App Router pages
│       │   ├── (auth)/        # Auth pages (login, register)
│       │   ├── (account)/     # Account pages (profile, password)
│       │   ├── flight-ops/    # Flight operations module
│       │   ├── dispatch/      # Fuel dispatch module
│       │   ├── fuel-farm/     # Fuel farm monitoring
│       │   ├── equipment/     # Equipment tracking
│       │   ├── schedule/      # Line service scheduling
│       │   └── training/      # Fueler training/certifications
│       ├── actions/      # Next.js server actions for API calls
│       ├── lib/          # Utilities (auth.ts, api.ts)
│       └── components/   # React components
├── packages/
│   ├── types/            # @frontend/types - Auto-generated TypeScript types from OpenAPI
│   └── ui/               # @frontend/ui - Shared UI components
```

**Key Frontend Patterns:**
- **Authentication:** NextAuth.js with JWT credentials provider (`lib/auth.ts`)
- **API Client:** Auto-generated from Django OpenAPI schema via `openapi-typescript-codegen`
- **API Helper:** `getApiClient(session)` handles auth tokens and server/client URL switching (`lib/api.ts`)
- **Theme System:** Dark/light mode support using Tailwind CSS theme variables
- **Server Actions:** API calls happen in `actions/` directory, called from client components
- **Type Safety:** TypeScript types in `@frontend/types/api` are auto-generated from backend schema

### Authentication Flow

1. User logs in via `/login` page
2. NextAuth calls Django's `/api/auth/token/` endpoint
3. Receives JWT access token (24hr) and refresh token (30 days)
4. Tokens stored in NextAuth session
5. `getApiClient(session)` injects `Authorization: Bearer <token>` header
6. NextAuth auto-refreshes access token 5 minutes before expiry

### Database & Type Generation Workflow

**Django models are the single source of truth:**

```
Django Models → makemigrations → migrate → Supabase PostgreSQL
     ↓
Serializers → DRF OpenAPI Schema → openapi-typescript-codegen → TypeScript types
```

**After backend model changes:**
1. `docker compose exec api uv run -- python manage.py makemigrations`
2. `docker compose exec api uv run -- python manage.py migrate`
3. `docker compose exec web pnpm openapi:generate` (regenerates `@frontend/types/api`)

### Environment Configuration

**Backend (`.env.backend`):**
- `SECRET_KEY` - Django secret key
- `DEBUG=1` - Enable debug mode
- `SUPABASE_DB_NAME`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT` - Database connection

**Frontend (`.env.frontend`):**
- `NEXTAUTH_SECRET` - NextAuth.js secret (generate with `openssl rand -base64 32`)
- `NEXTAUTH_URL` - Base URL for NextAuth
- `API_URL` - Backend URL for server-side requests (default: `http://api:8000`)
- `NEXT_PUBLIC_API_URL` - Backend URL for client-side requests (default: `http://localhost:8000`)

## Development Workflow

### Making Backend Changes

1. Edit models in `backend/api/models.py`
2. Create serializers in `backend/api/serializers.py`
3. Create viewsets in `backend/api/viewsets.py`
4. Register routes in `backend/api/urls.py`
5. Run migrations: `docker compose exec api uv run -- python manage.py makemigrations && docker compose exec api uv run -- python manage.py migrate`
6. Regenerate frontend types: `docker compose exec web pnpm openapi:generate`
7. Write tests in `backend/api/tests/`

### Making Frontend Changes

1. Use auto-generated types from `@frontend/types/api`
2. Create server actions in `apps/web/actions/` that call `getApiClient(session)`
3. Build UI components using Tailwind theme variables for dark/light mode
4. Use `@frontend/ui` for shared components across apps
5. Follow Next.js App Router patterns (Server Components by default, Client Components when needed)

### Adding a New Frontend Feature

1. Create new page under `frontend/apps/web/app/<feature>/page.tsx`
2. Create server action in `frontend/apps/web/actions/<feature>.ts`
3. Use `getServerSession(authOptions)` for auth-protected routes
4. Import types from `@frontend/types/api` for type safety
5. Use `getApiClient(session)` to call backend endpoints

## Testing

**Backend:**
- Uses pytest with pytest-django and pytest-factoryboy
- Configuration in `backend/api/tests/conftest.py`
- Test factories in `backend/api/tests/factories.py`
- Run all tests: `docker compose exec api uv run -- pytest .`

**Frontend:**
- No test suite currently configured
- Follow Next.js testing best practices when adding tests

## Important Notes

- **Database:** Using Supabase PostgreSQL (not local Docker PostgreSQL)
- **Django migrations are source of truth** - don't manually edit Supabase schema
- **Regenerate TypeScript types** after any backend model/serializer changes
- **Custom User model:** `api.User` extends Django's AbstractUser with FBO-specific fields (role, employee_id, is_active_fueler)
- **Read-only model:** `TankLevelReading` uses `Meta: managed = False` - table exists in Supabase but Django doesn't manage it
- **CORS:** Configured to allow `http://localhost:3000` for frontend development
- **JWT Tokens:** Access token expires in 24 hours, refresh token in 30 days, auto-rotation enabled

## Common Pitfalls

- **After backend changes, regenerate types** - Frontend will break without updated TypeScript types
- **Server vs Client API URLs** - `getApiClient()` handles this automatically; server uses `http://api:8000`, client uses `http://localhost:8000`
- **Auth-protected routes** - Use `getServerSession(authOptions)` to check authentication status in Server Components
- **Theme support** - Use Tailwind theme classes (`bg-card`, `text-foreground`, etc.) not hardcoded colors
- **Workspace packages** - When adding `@frontend/types` or `@frontend/ui` to an app, run `pnpm --filter <app> add @frontend/<package>`
