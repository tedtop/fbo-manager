## FBO Manager — Technology Stack and Rationale

This document provides a complete overview of the technologies used across the project (backend, frontend, shared tooling, and infrastructure), along with the reasoning behind each choice and key configuration notes.

### At-a-glance

- Monorepo: pnpm workspaces (apps + packages) with shared TypeScript types and UI
- Backend: Python 3.13, Django 5, Django REST Framework, JWT (simplejwt), PostgreSQL (Supabase)
- Frontend: Next.js 16 (App Router, Turbopack), React 19, NextAuth (credentials), Tailwind CSS, React Hook Form, Zod
- API typing: OpenAPI schema via drf-spectacular → generated TypeScript client with openapi-typescript-codegen
- Containers & Dev: Docker Compose for local dev; uv for Python dependency management; Biome + Ruff for linting
- Tests: pytest, pytest-django, pytest-factoryboy (backend)

---

## Backend

### Language & Runtime
- Python 3.13 (base image: `python:3.13-slim-bookworm`)
  - Why: Latest stable Python for performance and language improvements (e.g., faster startup, modern typing). Slim image keeps the container small.

### Web Framework
- Django 5.1
  - Why: Mature, batteries-included framework with ORM, migrations, auth, admin, and a large ecosystem. Well-suited for relational data models and complex business rules.

### API Layer
- Django REST Framework (djangorestframework)
  - Why: De facto standard for building REST APIs on Django with robust serialization, pagination, permissions, and browsable API support.
- Authentication: djangorestframework-simplejwt
  - Why: Stateless JWT auth works well with SPAs and server actions; integrates cleanly with DRF; supports refresh tokens and rotation.
- OpenAPI: drf-spectacular
  - Why: Reliable OpenAPI 3 schema generator, strong DRF compatibility, and easy to wire Swagger UI. Enables type-safe client generation for frontend.

### Admin UI
- django-unfold
  - Why: A modern theme for Django admin with better UX out of the box. Useful for internal back office operations and quick data administration.

### CORS
- django-cors-headers
  - Why: Safe cross-origin access from `localhost:3000` during development while keeping server defaults restrictive.

### Database
- PostgreSQL via Supabase (psycopg 3 client)
  - Why: Postgres is stable, feature-rich, and well-supported by Django. Supabase provides managed Postgres with tooling and observability. `psycopg[binary]` offers a modern driver with good performance and simple install.
  - Config: Database connection is sourced from `SUPABASE_DB_*` env vars in `backend/api/settings.py`.

### Auth settings (JWT)
- Access token: 24 hours; Refresh token: 30 days with rotation enabled
  - Why: Longer-lived refresh tokens improve UX while keeping access tokens short(er). Rotation adds security at acceptable complexity.

### Dependency & Tooling
- uv for Python dependency management
  - Why: Fast, reproducible, modern Python package and venv manager. Container entry does `uv sync` on boot.
- Ruff for linting (`pyproject.toml`)
  - Why: Fast Python linter with opinionated rules and import sorting.
- pytest + pytest-django + pytest-factoryboy
  - Why: Concise, expressive tests; Django integration; easy factory-based fixtures to keep tests deterministic and readable.

### Containerization
- Backend Dockerfile
  - Base: `python:3.13-slim-bookworm`
  - Creates project venv with `uv`, exposes `8000`.
- Compose service `api`
  - Command: `uv sync && uv run -- python manage.py migrate && uv run -- python manage.py runserver 0.0.0.0:8000`
  - Why: Simple dev flow with automatic migrations; volume mounts for live reload.

---

## Frontend

### Framework & Runtime
- Next.js 16 with Turbopack and App Router
  - Why: First-class SSR/SSG/ISR, server actions, and great DX. Turbopack is the default bundler in Next 16 for fast dev builds.
- React 19
  - Why: Latest stable with performance and ergonomics improvements.
- Node 21 (container base)
  - Why: Modern runtime matching Next 16 requirements; kept in Dockerfile for reproducible dev.

### Auth
- NextAuth v4 (credentials provider)
  - Why: Mature Next.js auth with flexible provider model. Credentials flow integrates with DRF SimpleJWT tokens and enables server-side session checks.
  - Implementation: `frontend/apps/web/lib/auth.ts` handles credentials login and token refresh with a small time buffer to preempt expiry. Session data carries both access and refresh tokens.

### Forms & Validation
- react-hook-form
  - Why: Performant, minimal rerenders, good TS support.
- zod
  - Why: Declarative schema validation with great TS inference; pairs well with react-hook-form via zod resolver.

### Styling & UI
- Tailwind CSS
  - Why: Utility-first styling with a strong ecosystem; consistent design tokens across apps and shared UI package.
- Shared UI package: `frontend/packages/ui`
  - Why: Central place for common components, hooks, and styles; promotes reuse and consistency between microsites.

### API Client & Type Safety
- Generated client: `openapi-typescript-codegen`
  - Why: Single source of truth for API contracts from backend OpenAPI schema; reduces runtime errors and drift.
- Consumption: `frontend/apps/web/lib/api.ts` builds a typed `ApiClient` with base URL and auth header. Some endpoints also use direct `fetch` with the same bearer token.

### Monorepo & Build
- pnpm workspaces (`frontend/pnpm-workspace.yaml`)
  - Why: Fast installs, efficient storage, and native workspace support. Clear separation between `apps/*` and `packages/*`.
- Next config (`frontend/apps/web/next.config.ts`)
  - `output: 'standalone'` for production portability and `transpilePackages` to include shared packages.
  - Turbopack configured with monorepo root and common aliases.

### Containerization
- Frontend Dockerfile
  - Base: `node:21`, installs `pnpm`, exposes `3000`.
- Compose service `web`
  - Command: `pnpm install -r && pnpm --filter web dev`
  - Why: Simple local dev flow with workspace-aware install; live reload via volume mount.

---

## Shared Tooling & Developer Experience

### Type-Safe API via OpenAPI
- Backend exposes an OpenAPI schema via drf-spectacular. Swagger UI is served at `/api/schema/swagger-ui/`.
- A VS Code task (“Update OpenAPI schema”) runs the codegen: `pnpm openapi:generate` in the `web` container, generating the TypeScript client under `frontend/packages/types/api`.
  - Why: Minimizes client/server drift, improves developer velocity, and catches breaking changes earlier.

### Monorepo structure
- `frontend/apps/*`: independently runnable Next.js apps (microsites)
- `frontend/packages/*`: shared code (`types`, `ui`, utilities)
- Why: Encourages code reuse and consistent standards while retaining per-app autonomy.

### Linting & Formatting
- Biome for frontend (`biome.json` at project root and `frontend/biome.json`)
  - Why: Fast, all-in-one formatter/linter for TypeScript/JS/CSS.
- Ruff for backend Python
  - Why: Fast, modern linter with a sensible rule set and autofix.

### Editor & Tasks
- VS Code tasks
  - Update OpenAPI schema (frontend)
  - Create superuser (backend)
- Why: Common workflows are one-click, repeatable, and discoverable for new team members.

---

## Infrastructure & Operations

### Local development
- Docker Compose orchestrates backend (`api`) and frontend (`web`) with port forwards `8000` and `3000`.
- Env files: `.env.backend`, `.env.frontend` are loaded by Compose.
  - Why: Local parity and easy onboarding—single `docker compose up` brings the stack up.

### Runtime configuration
- Backend CORS allows default local hosts; JWT configured in settings with 24h access / 30d refresh lifetimes and rotation.
- Frontend `getApiClient` selects base URL depending on server vs browser context (`http://api:8000` in server, `http://localhost:8000` in browser) and reads overrides from env.

### Production readiness notes
- `next.config.ts` uses `output: 'standalone'` to simplify container images for deployment.
- Backend is compatible with WSGI/ASGI server runners (e.g., `gunicorn` + `uvicorn` workers) when moving beyond `runserver`.

---

## Testing

### Backend
- pytest, pytest-django, pytest-factoryboy
  - Why: Expressive tests with fixtures and factories; fast iteration; widely adopted in Django projects.
  - Preconfigured in `backend/api/tests` with factories and shared fixtures.

### Frontend
- Not yet configured. Recommended next steps:
  - Unit tests with Vitest or Jest
  - Component tests with Testing Library + Playwright
  - Contract tests against generated `ApiClient` to catch schema drift

---

## Alternatives considered (and why we didn’t choose them)

- Flask/FastAPI instead of Django/DRF: Lighter-weight but would require assembling more pieces (auth, admin, ORM decisions). Django + DRF provides a cohesive, mature stack that accelerates delivery for data-heavy apps.
- Session cookies instead of JWT: Simpler CSRF story, but less convenient across multiple frontends/microsites and server actions. JWT + refresh fits the monorepo and SPA+server actions architecture well.
- GraphQL instead of REST: Powerful but adds operational and learning overhead; the domain fits REST nicely and OpenAPI gives strong type safety.
- Yarn/npm instead of pnpm: pnpm offers better workspace ergonomics and disk efficiency for monorepos.

---

## Operational checklists and tips

- Update API types after backend changes: run the “Update OpenAPI schema” task (or inside the `web` container: `pnpm openapi:generate`).
- Create an admin user locally: run the “Create superuser” task.
- Verify auth token refresh logic when adjusting JWT lifetimes in Django settings.
- For production, prefer a proper app server for Django (e.g., `gunicorn` with `uvicorn` workers) and `next start` or containerized Next.js output depending on your infra.
