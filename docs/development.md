## Development Guide

This guide covers local setup, coding standards, workflows, and common tasks.

---

## Prerequisites

- Docker and Docker Compose
- macOS/Linux/Windows (tested on macOS)

---

## Quick Start

1. Configure environment files:
   - Copy `.env.backend.template` → `.env.backend` and set `SECRET_KEY` and DB envs
   - Copy `.env.frontend.template` → `.env.frontend` and set `NEXTAUTH_SECRET`
2. Start services:

```bash
docker compose up
```

3. Create a superuser (for Django admin):

```bash
docker compose exec api uv run -- python manage.py createsuperuser
```

4. Access:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:8000
   - Swagger UI: http://localhost:8000/api/schema/swagger-ui/

---

## Monorepo Layout

- `frontend/apps/web` — Next.js app
- `frontend/packages/ui` — Shared UI components
- `frontend/packages/types` — Generated API client & types
- `backend/api` — Django app (models, viewsets, serializers)

---

## Coding Standards

### Frontend (TypeScript/JS)
- Formatter/Linter: Biome (`biome.json`)
- React/Next conventions: App Router, server actions, `use client` where necessary
- Shared code via workspace packages (`@frontend/ui`, `@frontend/types`)

### Backend (Python)
- Linter: Ruff (configured in `pyproject.toml`)
- Tests: pytest, pytest-django, pytest-factoryboy (`backend/api/tests`)

---

## OpenAPI and Type Safety

- Source of truth: DRF + drf-spectacular
- Regenerate the TS client after backend changes:

```bash
docker compose exec web pnpm openapi:generate
```

This updates `frontend/packages/types/api` with `ApiClient` and models.

---

## Testing

### Backend

Run all tests:

```bash
docker compose exec api uv run -- pytest .
```

Run a single file or test:

```bash
docker compose exec api uv run -- pytest api/tests/test_api.py
docker compose exec api uv run -- pytest api/tests/test_api.py -k "test_name"
```

### Frontend (Recommended Additions)
- Unit tests: Vitest or Jest
- Components: Testing Library + Playwright

---

## Git Workflow

- Branching: `main` protected; create feature branches `feat/<short-name>`, `fix/<short-name>`
- Commits: Small, focused, imperative mood
- PRs: Include screenshots for UI changes; link issues; add test notes
- CI: Lint + tests must pass (configure in future CI/CD)

---

## Common Tasks

- Install new backend dependency:

```bash
docker compose exec api uv add <package>
```

- Install frontend dependency globally (workspace):

```bash
docker compose exec web pnpm add <pkg> -w
```

- Install dependency for `web` only:

```bash
docker compose exec web pnpm --filter web add <pkg>
```

---

## Troubleshooting

- 401s in frontend: Ensure tokens are valid; check NextAuth refresh logic and Django SIMPLE_JWT lifetimes.
- CORS errors: Confirm `CORS_ALLOWED_ORIGINS` in `backend/api/settings.py` includes the dev origin.
- Types out of date: Re-run OpenAPI codegen and restart dev server.
