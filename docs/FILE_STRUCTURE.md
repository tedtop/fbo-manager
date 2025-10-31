# FBO Manager - File Structure Guide

**For Developer Onboarding**

This document provides a complete, annotated guide to the FBO Manager codebase structure. Use this as your map for navigating the project.

---

## Table of Contents

1. [Project Root](#project-root)
2. [Backend Structure](#backend-structure)
3. [Frontend Structure](#frontend-structure)
4. [Configuration Files](#configuration-files)
5. [Quick Reference: Where to Find What](#quick-reference-where-to-find-what)

---

## Project Root

```
/home/user/fbo-manager/
├── backend/                    # Django REST API (see Backend Structure)
├── frontend/                   # Next.js monorepo (see Frontend Structure)
├── docs/                       # Project documentation
│   ├── PROJECT_OVERVIEW.md     # THIS FILE: Comprehensive project guide
│   ├── FILE_STRUCTURE.md       # Annotated file structure
│   ├── DATABASE_SCHEMA.md      # Database models and relationships
│   ├── API_REFERENCE.md        # API endpoint documentation
│   ├── DEVELOPER_GUIDE.md      # Setup and development guide
│   └── ARCHITECTURE.md         # Architecture diagrams and patterns
├── .github/                    # GitHub configuration
│   ├── workflows/              # CI/CD pipelines
│   │   ├── test.yml            # Run pytest on push/PR
│   │   └── lint.yml            # Run pre-commit hooks (Ruff, Biome)
│   └── dependabot.yml          # Automated dependency updates
├── .devcontainer/              # VS Code Dev Containers
│   ├── backend/                # Python dev container for backend
│   └── frontend/               # Node.js dev container for frontend
├── .vscode/                    # VS Code workspace settings
├── .claude/                    # Claude Code CLI configuration
├── .env.backend.template       # Backend environment variables template
├── .env.frontend.template      # Frontend environment variables template
├── .gitignore                  # Git ignore patterns
├── .pre-commit-config.yaml     # Pre-commit hooks (Ruff, Biome, checks)
├── biome.json                  # Biome configuration (JS/TS formatter/linter)
├── docker-compose.yaml         # Development environment orchestration
├── LICENSE.md                  # Project license
└── README.md                   # Quick start guide
```

---

## Backend Structure

**Location:** `/home/user/fbo-manager/backend/`

```
backend/
├── api/                        # Main Django application
│   ├── __init__.py
│   ├── models.py               # ⭐ DATABASE MODELS - All 11 models defined here
│   ├── serializers.py          # ⭐ DRF SERIALIZERS - API request/response schemas
│   ├── viewsets.py             # ⭐ API VIEWS - ViewSets for all endpoints
│   ├── urls.py                 # ⭐ API ROUTES - URL routing configuration
│   ├── api.py                  # User authentication endpoints (login, register)
│   ├── admin.py                # Django admin interface configuration
│   ├── permissions.py          # Custom DRF permissions (IsAdminOrReadOnly, etc.)
│   ├── settings.py             # ⭐ DJANGO SETTINGS - Configuration, database, middleware
│   ├── wsgi.py                 # WSGI entry point for production
│   ├── asgi.py                 # ASGI entry point (WebSockets, async)
│   ├── migrations/             # Database migrations
│   │   ├── 0001_initial.py     # Initial migration (custom User model)
│   │   └── 0002_*.py           # All FBO models created
│   ├── management/             # Django management commands
│   │   └── commands/
│   └── tests/                  # ⭐ TEST SUITE
│       ├── __init__.py
│       ├── conftest.py         # Pytest configuration (pytest-django, pytest-factoryboy)
│       ├── factories.py        # Factory Boy test data generators
│       ├── fixtures.py         # Pytest fixtures (api_client, users)
│       └── test_api.py         # API endpoint tests
├── manage.py                   # Django management script
├── pyproject.toml              # ⭐ PYTHON DEPENDENCIES - uv package manager config
├── uv.lock                     # uv lockfile (like package-lock.json)
├── Dockerfile                  # Docker image for backend
└── .env                        # Local environment variables (not in git)
```

### Key Backend Files Explained

#### `models.py` - Database Models
**What it contains:** All 11 database models representing the FBO domain.

```python
# Core models defined:
- User            # Custom user with role, employee_id, phone
- FuelTank        # Fuel tank configuration (Jet A, Avgas)
- TankLevelReading # Historical tank levels (read-only)
- Aircraft        # Aircraft registry (tail_number, type, airline)
- TerminalGate    # Terminal and gate assignments
- Flight          # Flight tracking (status, times, aircraft, gate)
- Fueler          # Employee profile (OneToOne with User)
- Training        # Training course definitions
- FuelerTraining  # Certification records (expiry tracking)
- FuelTransaction # Fuel dispatch orders (QT integration)
- FuelerAssignment # Many-to-many junction (transaction ↔ fueler)
```

**Where to edit:**
- Adding new fields: Edit model class, then run `python manage.py makemigrations`
- Adding validation: Override `clean()` method
- Adding computed properties: Use `@property` decorator

#### `serializers.py` - API Serialization
**What it contains:** DRF serializers that convert models to/from JSON.

```python
# Key serializers:
- UserSerializer           # User profile with role
- FuelTankSerializer       # Tank with latest_reading (SerializerMethodField)
- FlightSerializer         # Flight with nested aircraft and gate
- FuelerSerializer         # Fueler with certifications
- FuelTransactionSerializer # Transaction with assigned_fuelers
- FuelerTrainingSerializer  # Certification with status calculation
```

**Where to edit:**
- Changing API response format: Edit serializer fields
- Adding nested data: Use nested serializers or SerializerMethodField
- Custom validation: Override `validate()` or `validate_<field_name>()`

#### `viewsets.py` - API Views
**What it contains:** DRF ViewSets handling HTTP requests.

```python
# Key viewsets:
- UserViewSet              # User CRUD + /me/, /change-password/
- FuelTankViewSet          # Tank CRUD + /readings/ action
- FlightViewSet            # Flight CRUD with filtering
- FuelerViewSet            # Fueler CRUD + /certifications/, /expiring_soon/
- FuelTransactionViewSet   # Transaction CRUD + assign/remove fueler actions
- TrainingViewSet          # Training course CRUD
- FuelerTrainingViewSet    # Certification CRUD
```

**Where to edit:**
- Adding new endpoints: Add `@action` decorated methods
- Changing permissions: Override `get_permissions()`
- Custom filtering: Override `get_queryset()`

#### `urls.py` - URL Routing
**What it contains:** URL patterns mapping endpoints to viewsets.

```python
# Router automatically creates:
- /api/users/
- /api/tanks/
- /api/flights/
- /api/fuelers/
- /api/trainings/
- /api/transactions/
- etc.

# Plus manual routes for:
- /api/auth/token/        # JWT login
- /api/auth/refresh/      # JWT refresh
- /api/schema/            # OpenAPI schema
- /admin/                 # Django admin
```

**Where to edit:**
- Adding new resources: Register viewset with router
- Custom endpoints: Add to `urlpatterns` manually

#### `settings.py` - Django Configuration
**What it contains:** All Django configuration.

```python
# Key settings:
- DATABASES              # PostgreSQL (Supabase) connection
- INSTALLED_APPS         # Django apps (DRF, spectacular, unfold)
- MIDDLEWARE             # Request/response processing
- REST_FRAMEWORK         # DRF configuration (auth, pagination, permissions)
- SIMPLE_JWT             # JWT token configuration
- SPECTACULAR_SETTINGS   # OpenAPI schema configuration
- AUTH_USER_MODEL        # Custom User model
```

**Where to edit:**
- Database settings: `DATABASES` dict
- API behavior: `REST_FRAMEWORK` dict
- Add new apps: `INSTALLED_APPS` list

#### `tests/` - Test Suite
**What it contains:** Pytest test suite with fixtures and factories.

```python
# Current tests:
- test_api_users_me_unauthorized()  # Auth required test
- test_api_users_me_authorized()    # Auth success test

# Infrastructure:
- conftest.py    # Pytest configuration
- factories.py   # UserFactory (Factory Boy)
- fixtures.py    # api_client, regular_user fixtures
```

**Where to add tests:**
- API tests: Add to `test_api.py`
- Model tests: Create `test_models.py`
- Serializer tests: Create `test_serializers.py`

**Run tests:**
```bash
cd backend
uv run pytest .
```

---

## Frontend Structure

**Location:** `/home/user/fbo-manager/frontend/`

The frontend is a **pnpm monorepo** with multiple packages.

```
frontend/
├── apps/                       # Application packages
│   └── web/                    # ⭐ Main Next.js application
│       ├── app/                # ⭐ Next.js App Router
│       │   ├── (auth)/         # Auth route group (login, register)
│       │   │   ├── login/
│       │   │   │   └── page.tsx         # Login page
│       │   │   ├── register/
│       │   │   │   └── page.tsx         # Registration page
│       │   │   └── api/
│       │   │       └── auth/
│       │   │           └── [...nextauth]/
│       │   │               └── route.ts  # NextAuth API route
│       │   ├── (account)/      # Account management route group
│       │   │   ├── profile/
│       │   │   │   └── page.tsx         # User profile page
│       │   │   ├── change-password/
│       │   │   │   └── page.tsx         # Password change page
│       │   │   └── delete-account/
│       │   │       └── page.tsx         # Account deletion page
│       │   ├── (dashboard)/    # Main dashboard route group
│       │   │   ├── dashboard/
│       │   │   │   └── page.tsx         # ⭐ Main dashboard
│       │   │   ├── fuel-farm/
│       │   │   │   └── page.tsx         # Fuel tank monitoring
│       │   │   ├── dispatch/
│       │   │   │   └── page.tsx         # Fuel dispatch orders
│       │   │   ├── flights/
│       │   │   │   └── page.tsx         # Flight tracking
│       │   │   ├── training/
│       │   │   │   └── page.tsx         # Certification tracking
│       │   │   └── layout.tsx           # Dashboard layout (nav, sidebar)
│       │   ├── layout.tsx      # Root layout (providers, metadata)
│       │   ├── page.tsx        # Landing page
│       │   └── globals.css     # Global CSS with Tailwind directives
│       ├── lib/                # ⭐ Utilities and API client
│       │   ├── api-client.ts   # OpenAPI-generated API client wrapper
│       │   ├── auth.ts         # NextAuth configuration (JWT provider)
│       │   ├── utils.ts        # Utility functions (cn, formatters)
│       │   └── hooks/          # Custom React hooks
│       ├── actions/            # ⭐ Next.js Server Actions
│       │   ├── auth.ts         # Login, register, logout actions
│       │   ├── profile.ts      # Profile update actions
│       │   └── transactions.ts # Fuel transaction actions
│       ├── components/         # ⭐ React components
│       │   ├── ui/             # Radix UI components (Button, Input, etc.)
│       │   ├── forms/          # Form components (react-hook-form + zod)
│       │   ├── dashboard/      # Dashboard-specific components
│       │   ├── layout/         # Layout components (Navbar, Sidebar)
│       │   └── shared/         # Shared components (LoadingSpinner, etc.)
│       ├── public/             # Static assets (images, icons)
│       ├── package.json        # Dependencies for web app
│       ├── next.config.ts      # Next.js configuration
│       ├── tailwind.config.ts  # Tailwind CSS configuration
│       ├── tsconfig.json       # TypeScript configuration
│       ├── postcss.config.mjs  # PostCSS configuration
│       └── Dockerfile          # Docker image for frontend
├── packages/                   # Shared packages (monorepo)
│   ├── types/                  # ⭐ @frontend/types - Generated API types
│   │   ├── api/                # OpenAPI-generated TypeScript client
│   │   │   ├── index.ts        # Exported types and client
│   │   │   ├── models/         # TypeScript interfaces for all models
│   │   │   └── services/       # API service classes
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── ui/                     # ⭐ @frontend/ui - Shared UI components
│       ├── components/         # Reusable Radix UI components
│       ├── package.json
│       └── tsconfig.json
├── package.json                # Root package.json (workspace config)
├── pnpm-workspace.yaml         # pnpm workspace configuration
└── pnpm-lock.yaml              # pnpm lockfile
```

### Key Frontend Files Explained

#### App Router Structure

**Route Groups:** Folders in parentheses `(group)` don't affect URL paths but allow logical organization.

- `(auth)/` - Authentication pages (public)
  - `/login` → `app/(auth)/login/page.tsx`
  - `/register` → `app/(auth)/register/page.tsx`

- `(account)/` - Account management (private)
  - `/profile` → `app/(account)/profile/page.tsx`
  - `/change-password` → `app/(account)/change-password/page.tsx`

- `(dashboard)/` - Main application (private)
  - `/dashboard` → `app/(dashboard)/dashboard/page.tsx`
  - `/fuel-farm` → `app/(dashboard)/fuel-farm/page.tsx`
  - `/dispatch` → `app/(dashboard)/dispatch/page.tsx`

#### `lib/api-client.ts` - API Client
**What it contains:** Wrapper around OpenAPI-generated client.

```typescript
// Usage example:
import { apiClient } from '@/lib/api-client'

// Fetch user profile
const user = await apiClient.users.usersRetrieve('me')

// List fuel tanks
const tanks = await apiClient.tanks.tanksList()

// Create flight
const flight = await apiClient.flights.flightsCreate({
  flight_number: 'AA123',
  status: 'scheduled',
  // ...
})
```

**Where to edit:**
- Adding auth headers: Edit `apiClient` configuration
- Changing base URL: Edit `API_URL` environment variable

#### `actions/` - Server Actions
**What it contains:** Next.js Server Actions for form submissions.

```typescript
// Example: actions/auth.ts
'use server'

export async function loginAction(formData: FormData) {
  // Server-side form processing
  // Calls Django API
  // Returns result or error
}
```

**Benefits:**
- No client-side API calls needed
- Automatic CSRF protection
- Better SEO (form works without JS)

#### `components/` - React Components
**Structure:**
- `ui/` - Base Radix UI components (Button, Input, Card, etc.)
- `forms/` - Form components with react-hook-form + zod validation
- `dashboard/` - Dashboard-specific components (FuelTankCard, FlightList, etc.)
- `layout/` - Layout components (Navbar, Sidebar, Footer)
- `shared/` - Shared utilities (LoadingSpinner, ErrorMessage, etc.)

**Component naming:**
- PascalCase for files: `FuelTankCard.tsx`
- Default export for component
- Named exports for types/utilities

#### `packages/types/` - Generated API Types
**What it contains:** Auto-generated TypeScript types from OpenAPI schema.

**Generated by:**
```bash
cd frontend
pnpm run generate-api-types
```

**This runs:**
```bash
openapi-typescript-codegen --input http://localhost:8000/api/schema/ --output packages/types/api
```

**⚠️ IMPORTANT:** Never edit files in `packages/types/api/` manually! They are regenerated from the backend schema.

**When to regenerate:**
- After adding/changing Django models
- After updating DRF serializers
- After adding new API endpoints

---

## Configuration Files

### Root Configuration

| File | Purpose | When to Edit |
|------|---------|--------------|
| `docker-compose.yaml` | Development environment orchestration | Adding new services (Redis, Celery) |
| `.env.backend.template` | Backend environment variables template | Adding new env vars |
| `.env.frontend.template` | Frontend environment variables template | Adding new env vars |
| `.pre-commit-config.yaml` | Pre-commit hooks (Ruff, Biome) | Changing linting rules |
| `biome.json` | Biome configuration (JS/TS formatting) | Changing code style |
| `.gitignore` | Files to ignore in git | Adding new ignored patterns |

### Backend Configuration

| File | Purpose | When to Edit |
|------|---------|--------------|
| `backend/pyproject.toml` | Python dependencies (uv) | Adding new Python packages |
| `backend/api/settings.py` | Django configuration | Database, middleware, apps, DRF settings |
| `backend/manage.py` | Django management script | Rarely edited (Django default) |

### Frontend Configuration

| File | Purpose | When to Edit |
|------|---------|--------------|
| `frontend/package.json` | Root workspace dependencies | Adding workspace-wide dependencies |
| `frontend/apps/web/package.json` | Next.js app dependencies | Adding new npm packages |
| `frontend/pnpm-workspace.yaml` | pnpm workspace config | Adding new packages to monorepo |
| `frontend/apps/web/next.config.ts` | Next.js configuration | Output mode, transpiling, env vars |
| `frontend/apps/web/tailwind.config.ts` | Tailwind CSS configuration | Custom colors, fonts, plugins |
| `frontend/apps/web/tsconfig.json` | TypeScript configuration | Path aliases, compiler options |

### CI/CD Configuration

| File | Purpose | When to Edit |
|------|---------|--------------|
| `.github/workflows/test.yml` | Run pytest on push/PR | Changing test commands |
| `.github/workflows/lint.yml` | Run pre-commit on push/PR | Adding new linting steps |
| `.github/dependabot.yml` | Automated dependency updates | Changing update frequency |

---

## Quick Reference: Where to Find What

### "I need to..."

| Task | Location | File |
|------|----------|------|
| **Add a new API endpoint** | Backend | `backend/api/viewsets.py` + `backend/api/urls.py` |
| **Add a new database model** | Backend | `backend/api/models.py` |
| **Change API response format** | Backend | `backend/api/serializers.py` |
| **Add a new frontend page** | Frontend | `frontend/apps/web/app/(dashboard)/newpage/page.tsx` |
| **Create a reusable component** | Frontend | `frontend/apps/web/components/` |
| **Add a form with validation** | Frontend | `frontend/apps/web/components/forms/` + `actions/` |
| **Change authentication logic** | Backend | `backend/api/api.py` + Frontend: `lib/auth.ts` |
| **Update database schema** | Backend | Edit model → `uv run python manage.py makemigrations` |
| **Regenerate TypeScript types** | Frontend | `cd frontend && pnpm run generate-api-types` |
| **Add API tests** | Backend | `backend/api/tests/test_api.py` |
| **Configure environment variables** | Root | `.env.backend` / `.env.frontend` |
| **Change Django settings** | Backend | `backend/api/settings.py` |
| **Add a custom permission** | Backend | `backend/api/permissions.py` |
| **Style a component** | Frontend | Use Tailwind classes or `globals.css` |
| **Add a server action** | Frontend | `frontend/apps/web/actions/` |

### "Where is the code for..."

| Feature | Location |
|---------|----------|
| **User authentication** | Backend: `backend/api/api.py`, Frontend: `lib/auth.ts` + `actions/auth.ts` |
| **Fuel tank monitoring** | Backend: `FuelTank` model, Frontend: `app/(dashboard)/fuel-farm/page.tsx` |
| **Flight tracking** | Backend: `Flight` model, Frontend: `app/(dashboard)/flights/page.tsx` |
| **Fuel dispatch** | Backend: `FuelTransaction` model, Frontend: `app/(dashboard)/dispatch/page.tsx` |
| **Training certifications** | Backend: `FuelerTraining` model, Frontend: `app/(dashboard)/training/page.tsx` |
| **User profile** | Frontend: `app/(account)/profile/page.tsx` |
| **Dashboard** | Frontend: `app/(dashboard)/dashboard/page.tsx` |
| **Admin interface** | Backend: `backend/api/admin.py` (visit `/admin/`) |
| **API documentation** | Backend: Auto-generated at `/api/schema/swagger-ui/` |

### "How do I run..."

| Task | Command |
|------|---------|
| **Development environment** | `docker-compose up` |
| **Backend server only** | `cd backend && uv run python manage.py runserver` |
| **Frontend dev server only** | `cd frontend && pnpm dev` |
| **Backend tests** | `cd backend && uv run pytest .` |
| **Database migrations** | `cd backend && uv run python manage.py migrate` |
| **Create migration** | `cd backend && uv run python manage.py makemigrations` |
| **Django shell** | `cd backend && uv run python manage.py shell` |
| **Create superuser** | `cd backend && uv run python manage.py createsuperuser` |
| **Regenerate API types** | `cd frontend && pnpm run generate-api-types` |
| **Format code** | `pre-commit run --all-files` |
| **Lint code** | Automatic on git commit (pre-commit hooks) |

---

## Development Workflow

### Typical Feature Development Flow

1. **Define data model** (if needed)
   - Edit `backend/api/models.py`
   - Run `uv run python manage.py makemigrations`
   - Run `uv run python manage.py migrate`

2. **Create serializer**
   - Edit `backend/api/serializers.py`
   - Define fields and validation

3. **Create viewset**
   - Edit `backend/api/viewsets.py`
   - Add CRUD methods and custom actions

4. **Register URL**
   - Edit `backend/api/urls.py`
   - Register viewset with router

5. **Test API** (optional but recommended)
   - Visit `http://localhost:8000/api/schema/swagger-ui/`
   - Test endpoints manually

6. **Regenerate TypeScript types**
   - Run `cd frontend && pnpm run generate-api-types`

7. **Create frontend page**
   - Create `frontend/apps/web/app/(dashboard)/mypage/page.tsx`
   - Use API client to fetch data

8. **Add navigation**
   - Edit `frontend/apps/web/components/layout/Navbar.tsx` or `Sidebar.tsx`

9. **Write tests**
   - Backend: `backend/api/tests/test_api.py`
   - Frontend: (not yet configured)

10. **Commit**
    - Pre-commit hooks run automatically
    - Use conventional commits: `feat: add my feature`

---

## Next Steps

For detailed guides on specific topics, see:

- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) - Setup, coding standards, workflows
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Complete data model reference
- [API_REFERENCE.md](./API_REFERENCE.md) - Endpoint documentation with examples
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and design patterns

---

**Pro Tips:**

1. **Use VS Code Dev Containers** for instant setup: `.devcontainer/backend/` or `.devcontainer/frontend/`
2. **Swagger UI is your friend**: Visit `/api/schema/swagger-ui/` to test API endpoints
3. **Always regenerate types** after backend changes: `cd frontend && pnpm run generate-api-types`
4. **Use factories for tests**: See `backend/api/tests/factories.py` for examples
5. **Server Actions simplify forms**: See `frontend/apps/web/actions/` for patterns
6. **Conventional commits are enforced**: Use `feat:`, `fix:`, `docs:`, etc.

Happy coding! 🚀
