# FBO Manager

**Comprehensive Fixed-Base Operator (FBO) Management System**

FBO Manager streamlines aircraft fueling operations, crew training certification tracking, flight dispatch management, and fuel farm monitoring for FBO operations at airports.

---

## Features

- **Fuel Farm Management** - Real-time tank level monitoring, capacity tracking, and alerts
- **Flight Tracking** - Track inbound/outbound flights with aircraft and gate assignments
- **Fuel Dispatch** - Manage fuel service orders with fueler assignments and progress tracking
- **Training & Certifications** - Track fueler certifications with automated expiry notifications
- **User Management** - Role-based access control with JWT authentication
- **API-First Architecture** - Comprehensive REST API with OpenAPI documentation
- **Type Safety** - End-to-end type safety with OpenAPI-generated TypeScript types
- **Modern Tech Stack** - Django 5.1 + Next.js 15 with React 19
- **Docker Development** - Start both frontend and backend with `docker-compose up`
- **Admin Dashboard** - Django Unfold theme for operations management

---

## Quick Start

### Prerequisites

- [Docker](https://www.docker.com/) 20.10+
- [Docker Compose](https://docs.docker.com/compose/) 2.0+
- [Git](https://git-scm.com/) 2.30+

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/fbo-manager.git
cd fbo-manager
```

### 2. Configure Environment Variables

```bash
# Backend environment
cp .env.backend.template .env.backend
# Edit .env.backend - set DEBUG, SECRET_KEY, and database credentials

# Frontend environment
cp .env.frontend.template .env.frontend
# Edit .env.frontend - set NEXTAUTH_SECRET (generate with: openssl rand -base64 32)
```

### 3. Start Development Environment

```bash
docker-compose up
```

This starts:
- **Backend API** at http://localhost:8000
- **Frontend** at http://localhost:3000

### 4. Run Database Migrations

```bash
docker-compose exec api uv run python manage.py migrate
```

### 5. Create Superuser

```bash
docker-compose exec api uv run python manage.py createsuperuser
```

### 6. Access Services

- **Frontend Application:** http://localhost:3000
- **Backend API:** http://localhost:8000/api/
- **API Documentation (Swagger):** http://localhost:8000/api/schema/swagger-ui/
- **Django Admin:** http://localhost:8000/admin/

---

## Documentation

Comprehensive documentation is available in the `/docs` directory:

### Getting Started

- **[Project Overview](./docs/PROJECT_OVERVIEW.md)** - Complete project proposal, technology stack, features, and roadmap
- **[Developer Guide](./docs/DEVELOPER_GUIDE.md)** - Setup instructions, development workflow, testing, and troubleshooting

### Technical Documentation

- **[Architecture](./docs/ARCHITECTURE.md)** - System design, component details, data flow, and deployment architecture
- **[Database Schema](./docs/DATABASE_SCHEMA.md)** - Complete data model with ER diagrams and relationships
- **[API Reference](./docs/API_REFERENCE.md)** - All API endpoints with request/response examples
- **[File Structure](./docs/FILE_STRUCTURE.md)** - Annotated codebase guide for developer onboarding

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Django | 5.1+ | Web framework with ORM and admin |
| Django REST Framework | 3.15+ | RESTful API framework |
| PostgreSQL | 15+ | Relational database (Supabase) |
| JWT | 5.4+ | Stateless authentication |
| drf-spectacular | 0.28+ | OpenAPI schema generation |
| uv | latest | Fast Python package manager |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.2+ | React framework with App Router |
| React | 19.0+ | UI library |
| TypeScript | 5.0+ | Type safety |
| Tailwind CSS | 3.4+ | Utility-first CSS |
| NextAuth.js | 4.24+ | Authentication for Next.js |
| pnpm | latest | Fast package manager |

### DevOps

| Technology | Purpose |
|------------|---------|
| Docker + Docker Compose | Development environment |
| GitHub Actions | CI/CD pipelines |
| Pre-commit | Code quality checks |
| pytest | Backend testing |

---

## Project Structure

```
fbo-manager/
├── backend/              # Django REST API
│   ├── api/              # Main Django app
│   │   ├── models.py     # Database models (11 models)
│   │   ├── serializers.py # DRF serializers
│   │   ├── viewsets.py   # API viewsets
│   │   ├── urls.py       # URL routing
│   │   └── tests/        # Test suite
│   ├── manage.py
│   └── pyproject.toml    # Python dependencies (uv)
├── frontend/             # Next.js monorepo
│   ├── apps/
│   │   └── web/          # Main Next.js app
│   │       ├── app/      # Next.js App Router
│   │       ├── lib/      # API client & utilities
│   │       ├── actions/  # Server actions
│   │       └── components/ # React components
│   └── packages/
│       ├── types/        # OpenAPI-generated types
│       └── ui/           # Shared UI components
├── docs/                 # Comprehensive documentation
└── docker-compose.yaml   # Development orchestration
```

For detailed file structure with annotations, see [File Structure Guide](./docs/FILE_STRUCTURE.md).

---

## Core Features

### 1. Fuel Farm Management

Monitor fuel tank levels, track capacity, and receive alerts:

- Tank configuration (Jet A, Avgas)
- Real-time level readings
- Historical data tracking
- Status indicators (low, normal, high, critical)

**API Endpoints:** `/api/tanks/`, `/api/tank-readings/`

---

### 2. Flight Management

Track flights with aircraft and gate assignments:

- Flight status tracking (scheduled, arrived, departed, cancelled, delayed)
- Aircraft assignment (tail number, type, airline)
- Terminal gate assignment
- Date range filtering

**API Endpoints:** `/api/flights/`, `/api/aircraft/`, `/api/gates/`

---

### 3. Fuel Dispatch Management

Manage fuel service orders and assignments:

- Create fuel transactions
- Assign fuelers to transactions
- Track progress (started → in_progress → completed)
- QT Technologies integration fields

**API Endpoints:** `/api/transactions/`

---

### 4. Training & Certifications

Track fueler certifications with expiry monitoring:

- Training course definitions
- Certification records with expiry dates
- "Expiring Soon" alerts
- Certified-by tracking

**API Endpoints:** `/api/trainings/`, `/api/fuelers/`, `/api/fueler-certifications/`

---

### 5. User Management

Role-based access control:

- Custom user model with roles (admin, user)
- JWT authentication
- Profile management
- Password change and account deletion

**API Endpoints:** `/api/users/`, `/api/auth/token/`

---

## Development Workflow

### Common Tasks

**Run Tests:**
```bash
docker-compose exec api uv run pytest .
```

**Create Migration:**
```bash
docker-compose exec api uv run python manage.py makemigrations
```

**Apply Migrations:**
```bash
docker-compose exec api uv run python manage.py migrate
```

**Regenerate API Types:**
```bash
cd frontend
pnpm run generate-api-types
```

**View Logs:**
```bash
docker-compose logs -f
```

For complete development guide, see [Developer Guide](./docs/DEVELOPER_GUIDE.md).

---

## API Documentation

Interactive API documentation is available at:

**Swagger UI:** http://localhost:8000/api/schema/swagger-ui/

**OpenAPI Schema:** http://localhost:8000/api/schema/

For detailed API reference with examples, see [API Reference](./docs/API_REFERENCE.md).

---

## Testing

### Backend Tests (pytest)

```bash
# Run all tests
docker-compose exec api uv run pytest .

# Run with coverage
docker-compose exec api uv run pytest --cov=api .

# Run specific test
docker-compose exec api uv run pytest api/tests/test_api.py -k "test_name"
```

**Test Infrastructure:**
- pytest + pytest-django
- Factory Boy for test data
- APIClient for endpoint testing

---

## Code Quality

Pre-commit hooks run automatically on commit:

- **Ruff** - Python linting and formatting
- **Biome** - JavaScript/TypeScript formatting
- **Conventional Commits** - Commit message validation

**Run manually:**
```bash
pre-commit run --all-files
```

---

## Contributing

### Git Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and commit: `git commit -m "feat: add my feature"`
3. Push to origin: `git push -u origin feature/my-feature`
4. Create Pull Request on GitHub
5. Wait for CI checks and code review
6. Merge after approval

### Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[body]

[footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**
```
feat(api): add fuel tank level alerts
fix(frontend): correct date formatting in dashboard
docs: update API reference with new endpoints
```

---

## Deployment

### Development (Current)

```
Docker Compose
├── api (Django) - Port 8000
└── web (Next.js) - Port 3000
```

### Production (Planned)

- **Frontend:** Next.js on Vercel or containerized
- **Backend:** Django API on Cloud Run / ECS
- **Database:** Managed PostgreSQL (Supabase)
- **Cache:** Redis (planned)
- **Workers:** Celery (planned)

For deployment guide, see [Architecture Documentation](./docs/ARCHITECTURE.md).

---

## Roadmap

### Current Status: MVP ✅

- ✅ Core data models (11 models)
- ✅ REST API endpoints (30+ endpoints)
- ✅ Frontend dashboard with 5 pages
- ✅ JWT authentication
- ✅ Docker development environment
- ✅ Comprehensive documentation

### Next: Production Readiness

- [ ] Comprehensive test coverage (80%+ backend, 70%+ frontend)
- [ ] Production-ready permissions
- [ ] Rate limiting
- [ ] Error tracking (Sentry)
- [ ] Monitoring and logging

### Future Phases

- [ ] Redis caching + Celery tasks
- [ ] Email notifications
- [ ] QT Technologies API integration
- [ ] Mobile app
- [ ] Real-time updates (WebSockets)

For complete roadmap, see [Project Overview](./docs/PROJECT_OVERVIEW.md).

---

## Database Schema

**11 Models:**

- `User` - Custom user with role and employee ID
- `Fueler` - Employee profile (OneToOne with User)
- `Training` - Training course definitions
- `FuelerTraining` - Certification records
- `FuelTank` - Tank configuration
- `TankLevelReading` - Historical readings (read-only)
- `Aircraft` - Aircraft registry
- `TerminalGate` - Terminal gates
- `Flight` - Flight tracking
- `FuelTransaction` - Fuel dispatch orders
- `FuelerAssignment` - Transaction-to-fueler mapping

For complete schema with ER diagrams, see [Database Schema](./docs/DATABASE_SCHEMA.md).

---

## VS Code Development

The project includes Dev Container configuration for seamless development:

1. Open project in VS Code
2. Click "Reopen in Container" when prompted
3. Select `backend` or `frontend` container
4. Start coding with full IDE integration

**Switch containers:** Command Palette → "Dev Containers: Switch Container"

---

## Troubleshooting

### Common Issues

**Problem:** Port 8000 already in use

**Solution:**
```bash
# Find and kill process
lsof -i :8000
kill -9 <PID>
```

---

**Problem:** Database connection error

**Solution:**
1. Check `.env.backend` credentials
2. Verify Supabase database is running
3. Test connection: `docker-compose exec api uv run python manage.py dbshell`

---

**Problem:** API types not found

**Solution:**
```bash
cd frontend
pnpm run generate-api-types
```

For more troubleshooting, see [Developer Guide](./docs/DEVELOPER_GUIDE.md#troubleshooting).

---

## Support

- **Documentation:** [/docs](./docs/)
- **Issues:** https://github.com/yourusername/fbo-manager/issues
- **Discussions:** https://github.com/yourusername/fbo-manager/discussions
- **Email:** stelliosbonadurer@gmail.com

---

## License

See [LICENSE.md](./LICENSE.md)

---

## Acknowledgments

Built with:
- [Django](https://www.djangoproject.com/) - Web framework
- [Next.js](https://nextjs.org/) - React framework
- [Django REST Framework](https://www.django-rest-framework.org/) - API framework
- [Django Unfold](https://github.com/unfoldadmin/django-unfold) - Admin theme
- [Turbo Template](https://github.com/unfoldadmin/turbo) - Initial boilerplate

---

**Last Updated:** October 31, 2025
