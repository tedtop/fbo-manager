# FBO Manager - Developer Guide

**Complete guide for local development and contribution**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Development Setup](#development-setup)
4. [Development Workflow](#development-workflow)
5. [Code Style & Standards](#code-style--standards)
6. [Testing](#testing)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)
9. [Git Workflow](#git-workflow)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Git** | 2.30+ | Version control |

### Optional (for native development)

| Software | Version | Purpose |
|----------|---------|---------|
| **Python** | 3.13+ | Backend development |
| **uv** | latest | Python package manager |
| **Node.js** | 21+ | Frontend development |
| **pnpm** | latest | Node package manager |
| **PostgreSQL** | 15+ | Database (if not using Docker) |

### Recommended Tools

- **VS Code** - IDE with excellent Docker and Dev Container support
- **Postman** or **Insomnia** - API testing (though Swagger UI is built-in)
- **DBeaver** or **pgAdmin** - Database management
- **Git GUI** - SourceTree, GitKraken, or GitHub Desktop

---

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/fbo-manager.git
cd fbo-manager
```

### 2. Copy Environment Files

```bash
# Backend environment
cp .env.backend.template .env.backend

# Frontend environment
cp .env.frontend.template .env.frontend
```

### 3. Configure Environment Variables

**Edit `.env.backend`:**
```bash
# Development settings
DEBUG=True
SECRET_KEY=your-secret-key-here-change-in-production

# Supabase Database Connection
DATABASE_HOST=your-supabase-host.supabase.co
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USER=postgres
DATABASE_PASSWORD=your-database-password
```

**Edit `.env.frontend`:**
```bash
# API URL (docker service name)
API_URL=http://api:8000

# NextAuth configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here-generate-with-openssl
```

**Generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

### 4. Start Development Environment

```bash
docker-compose up
```

This will start:
- **Backend API** at `http://localhost:8000`
- **Frontend** at `http://localhost:3000`

### 5. Run Database Migrations

```bash
# In a new terminal
docker-compose exec api uv run python manage.py migrate
```

### 6. Create Superuser

```bash
docker-compose exec api uv run python manage.py createsuperuser
```

### 7. Access Services

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000/api/
- **API Docs:** http://localhost:8000/api/schema/swagger-ui/
- **Django Admin:** http://localhost:8000/admin/

---

## Development Setup

### Option 1: Docker Compose (Recommended)

**Advantages:**
- Consistent environment across team
- No need to install Python, Node.js, or PostgreSQL
- Automatic hot reload for both frontend and backend
- Easy to reset and start fresh

**Start all services:**
```bash
docker-compose up
```

**Start in detached mode:**
```bash
docker-compose up -d
```

**View logs:**
```bash
docker-compose logs -f
```

**Stop services:**
```bash
docker-compose down
```

**Rebuild containers:**
```bash
docker-compose up --build
```

---

### Option 2: VS Code Dev Containers

**Advantages:**
- Full IDE integration
- All VS Code extensions work inside container
- Seamless debugging
- Terminal runs inside container

**Setup:**

1. Install VS Code extension: "Dev Containers"

2. Open backend in dev container:
   ```
   Open Command Palette (Ctrl+Shift+P)
   > Dev Containers: Reopen in Container
   Select: .devcontainer/backend
   ```

3. Or open frontend in dev container:
   ```
   Open Command Palette (Ctrl+Shift+P)
   > Dev Containers: Reopen in Container
   Select: .devcontainer/frontend
   ```

---

### Option 3: Native Development

**Backend Setup:**

```bash
cd backend

# Install uv (if not installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Create virtual environment and install dependencies
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv sync

# Run migrations
uv run python manage.py migrate

# Start development server
uv run python manage.py runserver
```

**Frontend Setup:**

```bash
cd frontend

# Install pnpm (if not installed)
npm install -g pnpm

# Install dependencies
pnpm install

# Generate API types from backend
pnpm run generate-api-types

# Start development server
pnpm dev
```

**Database Setup (if not using Docker):**

```bash
# Install PostgreSQL 15+
# Create database
createdb fbo_manager

# Update .env.backend with local database credentials
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=fbo_manager
DATABASE_USER=your_username
DATABASE_PASSWORD=your_password
```

---

## Development Workflow

### Typical Feature Development Flow

#### 1. Create Feature Branch

```bash
git checkout -b feature/my-new-feature
```

#### 2. Backend Development

**Add Model (if needed):**

```bash
# Edit backend/api/models.py
# Add new model class

# Create migration
docker-compose exec api uv run python manage.py makemigrations

# Apply migration
docker-compose exec api uv run python manage.py migrate
```

**Add API Endpoint:**

```bash
# 1. Edit backend/api/serializers.py - Add serializer
# 2. Edit backend/api/viewsets.py - Add viewset
# 3. Edit backend/api/urls.py - Register with router
# 4. Test in Swagger UI: http://localhost:8000/api/schema/swagger-ui/
```

#### 3. Frontend Development

**Regenerate TypeScript Types:**

```bash
# After backend changes
cd frontend
pnpm run generate-api-types
```

**Add New Page:**

```bash
# Create frontend/apps/web/app/(dashboard)/mypage/page.tsx
# Add to navigation in layout component
```

**Create Components:**

```bash
# Add to frontend/apps/web/components/
# Use Tailwind CSS for styling
# Import from @frontend/ui for shared components
```

#### 4. Testing

**Backend Tests:**

```bash
# Run all tests
docker-compose exec api uv run pytest .

# Run specific test file
docker-compose exec api uv run pytest api/tests/test_api.py

# Run with coverage
docker-compose exec api uv run pytest --cov=api .
```

**Frontend Tests:**

```bash
# Not yet configured
# TODO: Add Jest/Vitest
```

#### 5. Code Quality

Pre-commit hooks run automatically on `git commit`. To run manually:

```bash
# Install pre-commit (if not installed)
pip install pre-commit

# Install hooks
pre-commit install

# Run on all files
pre-commit run --all-files
```

**Pre-commit checks:**
- JSON/TOML/YAML syntax
- Trailing whitespace
- End-of-file newline
- Python: Ruff linting + formatting
- JS/TS: Biome formatting
- Conventional commit message format

#### 6. Commit Changes

```bash
git add .
git commit -m "feat: add new feature description"
```

**Commit Message Format (Conventional Commits):**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(api): add fuel tank level alerts
fix(frontend): correct date formatting in dashboard
docs: update API reference with new endpoints
refactor(backend): simplify serializer logic
test(api): add tests for fueler certification
chore: update dependencies
```

#### 7. Push and Create Pull Request

```bash
git push -u origin feature/my-new-feature
```

Then create PR on GitHub.

---

## Code Style & Standards

### Python (Backend)

**Tool:** Ruff (linter + formatter)

**Configuration:** `backend/pyproject.toml`

**Line length:** 88 characters

**Key Rules:**
- PEP 8 compliance
- Use type hints where reasonable
- Docstrings for all public functions/classes
- No unused imports
- No mutable default arguments

**Example:**

```python
from typing import Optional
from rest_framework import serializers

class MySerializer(serializers.Serializer):
    """Serializer for my resource."""

    name = serializers.CharField(max_length=100)
    value = serializers.IntegerField()

    def validate_value(self, value: int) -> int:
        """Validate that value is positive."""
        if value < 0:
            raise serializers.ValidationError("Value must be positive")
        return value
```

**Run Ruff manually:**

```bash
cd backend
uv run ruff check .
uv run ruff format .
```

---

### TypeScript/JavaScript (Frontend)

**Tool:** Biome (linter + formatter)

**Configuration:** `biome.json`

**Key Rules:**
- Use TypeScript for type safety
- Functional components with hooks
- Avoid `any` type
- Use proper prop types

**Example:**

```typescript
import { FC } from 'react'

interface FuelTankCardProps {
  tankId: string
  level: number
  capacity: number
}

export const FuelTankCard: FC<FuelTankCardProps> = ({ tankId, level, capacity }) => {
  const percentage = (level / capacity) * 100

  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-lg font-semibold">{tankId}</h3>
      <p>Level: {level} / {capacity} gallons</p>
      <p>Fill: {percentage.toFixed(1)}%</p>
    </div>
  )
}
```

**Run Biome manually:**

```bash
cd frontend
pnpm run format
pnpm run lint
```

---

### Django Best Practices

1. **Models:**
   - Use `verbose_name` for all fields
   - Add `help_text` for complex fields
   - Override `__str__()` for readable representation
   - Use `db_table` to control table names
   - Add `ordering` in Meta for consistent results

2. **Serializers:**
   - Use nested serializers for related objects
   - Add custom validation in `validate()` or `validate_<field>()`
   - Use `SerializerMethodField` for computed values

3. **ViewSets:**
   - Use `select_related()` for foreign keys
   - Use `prefetch_related()` for reverse foreign keys
   - Add filtering, searching, ordering
   - Use `@action` for custom endpoints

4. **Permissions:**
   - Never use `AllowAny` in production
   - Use `IsAuthenticated` as default
   - Create custom permissions in `permissions.py`

5. **URLs:**
   - Use routers for viewsets
   - Keep URL patterns simple
   - Use dashes for multi-word URLs

---

### Next.js Best Practices

1. **Server Components (Default):**
   - Use for static content and data fetching
   - Better performance (less client JS)

2. **Client Components:**
   - Add `'use client'` directive
   - Use for interactivity (onClick, useState, etc.)

3. **Server Actions:**
   - Use for form submissions
   - Add `'use server'` directive
   - Return serializable data

4. **API Client:**
   - Use OpenAPI-generated client from `@frontend/types`
   - Wrap in try-catch for error handling

5. **Styling:**
   - Use Tailwind utility classes
   - Extract to components for reuse
   - Use `cn()` utility for conditional classes

---

## Testing

### Backend Testing (pytest)

**Location:** `backend/api/tests/`

**Run tests:**

```bash
# All tests
docker-compose exec api uv run pytest .

# Specific file
docker-compose exec api uv run pytest api/tests/test_api.py

# Specific test
docker-compose exec api uv run pytest api/tests/test_api.py::test_api_users_me_authorized

# With coverage
docker-compose exec api uv run pytest --cov=api .

# With verbose output
docker-compose exec api uv run pytest -v
```

**Writing Tests:**

```python
# backend/api/tests/test_my_feature.py

import pytest
from rest_framework import status

@pytest.mark.django_db
def test_my_endpoint(api_client, regular_user):
    """Test my endpoint returns correct data."""
    api_client.force_authenticate(regular_user)

    response = api_client.get('/api/my-endpoint/')

    assert response.status_code == status.HTTP_200_OK
    assert response.data['key'] == 'expected_value'
```

**Factories (Factory Boy):**

```python
# backend/api/tests/factories.py

import factory
from api.models import MyModel

class MyModelFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MyModel

    name = factory.Sequence(lambda n: f"Name {n}")
    value = 100

# Usage in tests:
my_instance = MyModelFactory()
```

---

### Frontend Testing

**Status:** ❌ Not yet implemented

**Planned:** Jest or Vitest for unit tests, Playwright for E2E tests

---

## Common Tasks

### Database Operations

**Create Migration:**

```bash
docker-compose exec api uv run python manage.py makemigrations
```

**Apply Migrations:**

```bash
docker-compose exec api uv run python manage.py migrate
```

**Revert Migration:**

```bash
# Revert to specific migration
docker-compose exec api uv run python manage.py migrate api 0001_initial

# Revert all migrations
docker-compose exec api uv run python manage.py migrate api zero
```

**Django Shell:**

```bash
docker-compose exec api uv run python manage.py shell
```

**Database Shell:**

```bash
docker-compose exec api uv run python manage.py dbshell
```

**Load Fixtures:**

```bash
docker-compose exec api uv run python manage.py loaddata mydata.json
```

**Create Superuser:**

```bash
docker-compose exec api uv run python manage.py createsuperuser
```

---

### Frontend Operations

**Regenerate API Types:**

```bash
cd frontend
pnpm run generate-api-types
```

**Build for Production:**

```bash
cd frontend
pnpm run build
```

**Lint & Format:**

```bash
cd frontend
pnpm run lint
pnpm run format
```

**Add Dependency:**

```bash
cd frontend

# Workspace root
pnpm add package-name -w

# Specific app
pnpm add package-name --filter web

# Specific package
pnpm add package-name --filter @frontend/ui
```

---

### Docker Operations

**View Logs:**

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
```

**Restart Service:**

```bash
docker-compose restart api
docker-compose restart web
```

**Rebuild Containers:**

```bash
# Rebuild all
docker-compose up --build

# Rebuild specific service
docker-compose up --build api
```

**Execute Command in Container:**

```bash
docker-compose exec api <command>
docker-compose exec web <command>
```

**Remove Containers & Volumes:**

```bash
# Stop and remove containers
docker-compose down

# Also remove volumes (⚠️ deletes database data)
docker-compose down -v
```

---

## Troubleshooting

### Backend Issues

**Problem:** `ModuleNotFoundError`

**Solution:**
```bash
# Rebuild container
docker-compose up --build api

# Or sync dependencies
docker-compose exec api uv sync
```

---

**Problem:** Database connection error

**Solution:**
1. Check `.env.backend` has correct database credentials
2. Verify Supabase database is running
3. Check DATABASE_HOST is reachable

```bash
# Test connection
docker-compose exec api uv run python manage.py dbshell
```

---

**Problem:** Migration conflicts

**Solution:**
```bash
# Show migrations
docker-compose exec api uv run python manage.py showmigrations

# Create merge migration
docker-compose exec api uv run python manage.py makemigrations --merge
```

---

### Frontend Issues

**Problem:** API types not found

**Solution:**
```bash
cd frontend
pnpm run generate-api-types
```

---

**Problem:** Module not found

**Solution:**
```bash
cd frontend

# Reinstall dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Or rebuild container
docker-compose up --build web
```

---

**Problem:** NextAuth configuration error

**Solution:**
1. Verify `NEXTAUTH_SECRET` is set in `.env.frontend`
2. Generate new secret:
   ```bash
   openssl rand -base64 32
   ```
3. Restart frontend service:
   ```bash
   docker-compose restart web
   ```

---

### Docker Issues

**Problem:** Port already in use

**Solution:**
```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>

# Or use different ports in docker-compose.yaml
```

---

**Problem:** Docker out of space

**Solution:**
```bash
# Remove unused containers, images, volumes
docker system prune -a --volumes

# Be careful - this removes ALL unused Docker data
```

---

## Git Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Pull Request Process

1. **Create feature branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and commit:**
   ```bash
   git add .
   git commit -m "feat: add my feature"
   ```

3. **Push to origin:**
   ```bash
   git push -u origin feature/my-feature
   ```

4. **Create Pull Request on GitHub**

5. **CI Checks:**
   - ✅ Tests pass
   - ✅ Linting passes
   - ✅ No conflicts with base branch

6. **Code Review:**
   - At least 1 approval required
   - Address review comments

7. **Merge:**
   - Squash and merge (preferred)
   - Delete branch after merge

---

## Environment Variables Reference

### Backend (.env.backend)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEBUG` | No | False | Enable debug mode (dev only) |
| `SECRET_KEY` | Yes | - | Django secret key |
| `DATABASE_HOST` | Yes | - | PostgreSQL host |
| `DATABASE_PORT` | No | 5432 | PostgreSQL port |
| `DATABASE_NAME` | Yes | - | Database name |
| `DATABASE_USER` | Yes | - | Database user |
| `DATABASE_PASSWORD` | Yes | - | Database password |
| `ALLOWED_HOSTS` | No | * | Comma-separated allowed hosts |

### Frontend (.env.frontend)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_URL` | Yes | - | Backend API URL |
| `NEXTAUTH_URL` | Yes | - | NextAuth callback URL |
| `NEXTAUTH_SECRET` | Yes | - | NextAuth encryption secret |

---

## Additional Resources

- [Project Overview](./PROJECT_OVERVIEW.md) - System architecture
- [Database Schema](./DATABASE_SCHEMA.md) - Data models
- [API Reference](./API_REFERENCE.md) - API endpoints
- [File Structure](./FILE_STRUCTURE.md) - Codebase guide

---

## Getting Help

- **Issues:** https://github.com/yourusername/fbo-manager/issues
- **Discussions:** https://github.com/yourusername/fbo-manager/discussions
- **Email:** stelliosbonadurer@gmail.com

---

**Last Updated:** October 31, 2025
