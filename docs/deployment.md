## Deployment Guide

This guide covers container images, environment configuration, and CI/CD recommendations.

---

## Containers

### Backend (Django)
- Base: `python:3.13-slim-bookworm`
- Uses `uv` for virtualenv and dependency sync
- Exposes port `8000`
- Production entrypoint recommendation: `gunicorn api.wsgi --bind 0.0.0.0:8000 --workers 3 --threads 2`

### Frontend (Next.js)
- Base: `node:21` with global `pnpm`
- Exposes port `3000`
- For production: `next build` and run `next start` or package `output: 'standalone'` into a minimal runtime image

---

## Environment Configuration

### Backend
- `SECRET_KEY`: Django secret
- Database (Supabase Postgres):
  - `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_NAME`
- JWT & CORS:
  - Update `CORS_ALLOWED_ORIGINS` for production domains
  - Adjust `SIMPLE_JWT` lifetimes as needed

### Frontend
- API base URL:
  - Server-side: `API_URL` (defaults to `http://api:8000` in Compose)
  - Client-side: `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:8000` in dev)
- NextAuth:
  - `NEXTAUTH_SECRET` required

---

## Build & Release Pipeline (CI/CD)

Suggested steps (GitHub Actions or similar):

1. Checkout and cache deps
2. Backend job:
   - Install Python + uv
   - Lint (Ruff) and run pytest
   - Build backend image and push to registry
3. Frontend job:
   - Install Node + pnpm
   - Generate API types against deployed/staging schema if needed
   - Build (`next build`)
   - Build frontend image and push
4. Deploy job:
   - Pull images
   - Run DB migrations: `python manage.py migrate`
   - Roll out services (Kubernetes/ECS/Compose on VM), with health checks

---

## Deployment Topologies

### Single VM / Docker Compose
- Pros: Simple, minimal infra
- Cons: Limited scalability and resilience

### Container Orchestrator (ECS/Kubernetes)
- Pros: Scalability, autoscaling, rolling updates, secrets management
- Cons: More setup

---

## Operational Hardening

- Use reverse proxy (Nginx/Traefik) for TLS termination and route `/api/*` to Django
- Enforce HTTPS and set secure cookies if migrating to cookie-based sessions later
- Lock down CORS to production hosts only
- Configure resource requests/limits and autoscaling policies
- Centralize logs and metrics; add health/ready endpoints

---

## Rollback Strategy

- Keep last two image tags available
- Database migrations should be backward‑compatible when possible; otherwise include down migrations or feature flags
