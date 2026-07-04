## API Documentation

This document enumerates all REST endpoints exposed by the Django REST Framework API, grouped by domain. For complete, always‑up‑to‑date details, see the Swagger UI and OpenAPI schema:

- Swagger UI (dev): http://localhost:8000/api/schema/swagger-ui/
- OpenAPI JSON: http://localhost:8000/api/schema/

The frontend TypeScript client is generated from the OpenAPI schema using `openapi-typescript-codegen` and lives under `frontend/packages/types/api`.

---

## Authentication

- POST `/api/auth/token/` — Obtain access and refresh tokens
  - Body: `{ "username": string, "password": string }`
  - 200: `{ access: string, refresh: string }`
- POST `/api/auth/refresh/` — Refresh access token
  - Body: `{ "refresh": string }`
  - 200: `{ access: string, refresh?: string }` (may rotate refresh)

Notes:
- Access token: 24h; Refresh token: 30d with rotation
- Default `Authorization: Bearer <access>` header required for protected endpoints

---

## Users

- GET `/api/users/` — Current user (depending on implementation in `api.py` UserViewSet)
- Admin users (admin only):
  - GET `/api/admin/users/` — List users
  - POST `/api/admin/users/` — Create user
  - GET `/api/admin/users/{id}/` — Retrieve
  - PATCH `/api/admin/users/{id}/` — Update
  - DELETE `/api/admin/users/{id}/` — Delete
  - Filters: `role`, `is_active`, `is_active_fueler`; search by `username`, `email`, etc.

---

## Fuel Farm

Fuel Tanks
- GET `/api/tanks/` — List tanks (includes latest reading)
  - Search: `tank_id`, `tank_name`, `fuel_type`
  - Order: `tank_id`, `tank_name`, `fuel_type`
- POST `/api/tanks/` — Create tank (admin)
- GET `/api/tanks/{tank_id}/` — Retrieve tank
- PATCH `/api/tanks/{tank_id}/` — Update (admin)
- DELETE `/api/tanks/{tank_id}/` — Delete (admin)
- GET `/api/tanks/{tank_id}/readings/?days=7` — Historical level readings

Tank Level Readings
- GET `/api/tank-readings/` — List readings
  - Filter: `tank_id`
  - Order: `recorded_at`, `tank_id`

---

## Aircraft & Parking

Aircraft
- GET `/api/aircraft/` — List
  - Search: `tail_number`, `aircraft_type`, `airline_icao`
- POST `/api/aircraft/` — Create (admin)
- GET `/api/aircraft/{tail_number}/` — Retrieve
- PATCH `/api/aircraft/{tail_number}/` — Update (admin)
- DELETE `/api/aircraft/{tail_number}/` — Delete (admin)

Parking Locations
- GET `/api/parking-locations/?include_inactive=false` — List (active by default)
  - Filters: `airport`, `terminal`, `gate`, `display_order`
  - Actions:
    - GET `/api/parking-locations/active/`
    - GET `/api/parking-locations/by_airport/?airport=MSO`
- POST `/api/parking-locations/` — Create (admin)
- GET `/api/parking-locations/{id}/` — Retrieve
- PATCH `/api/parking-locations/{id}/` — Update (admin)
- DELETE `/api/parking-locations/{id}/` — Soft delete (sets `display_order=0`)

Terminal Gates (deprecated; use parking locations)
- Standard CRUD under `/api/gates/`

---

## Flights

- GET `/api/flights/?today=true&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — List
  - Filter: `flight_status`, `aircraft`, `location`
- POST `/api/flights/` — Create (admin)
- GET `/api/flights/{id}/` — Retrieve (detail serializer)
- PATCH `/api/flights/{id}/` — Update (admin)
- DELETE `/api/flights/{id}/` — Delete (admin)

---

## Fuel Dispatch

Fuel Transactions
- GET `/api/transactions/?unassigned=true&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` — List
  - Filter: `progress`, `qt_sync_status`
- POST `/api/transactions/` — Create (admin) — uses `FuelTransactionCreateSerializer`
- GET `/api/transactions/{id}/` — Retrieve (detail serializer)
- PATCH `/api/transactions/{id}/` — Update (admin)
- DELETE `/api/transactions/{id}/` — Delete (admin)
- POST `/api/transactions/{id}/assign_fueler/` — Body `{ fueler_id: number }` → 201 assignment created
- POST `/api/transactions/{id}/remove_fueler/` — Body `{ fueler_id: number }` → 204
- POST `/api/transactions/{id}/update_progress/` — Body `{ progress: 'started'|'in_progress'|'completed' }`

---

## Personnel & Training

Fuelers
- GET `/api/fuelers/` — List (search `fueler_name`, `handheld_name`)
- POST `/api/fuelers/` — Create (admin)
- GET `/api/fuelers/{id}/` — Retrieve (includes certifications)
- PATCH `/api/fuelers/{id}/` — Update (admin)
- DELETE `/api/fuelers/{id}/` — Delete (admin)
- GET `/api/fuelers/{id}/certifications/` — Certifications for fueler
- GET `/api/fuelers/expiring_soon/?days=7` — Fuelers with soon‑expiring certs

Trainings
- Standard CRUD under `/api/trainings/` (admin for mutations)
  - Search: `training_name`, `aircraft_type`

Fueler Certifications
- CRUD under `/api/fueler-certifications/`
  - Filters: `fueler`, `training`
  - Filter `status`: `expired`, `expiring_soon` (with `days`), or `valid`
  - List/retrieve require auth; writes are admin-only

---

## Equipment & Line Service

Equipment
- CRUD under `/api/equipment/` (admin for mutations)
  - Search: `equipment_id`, `equipment_name`, `type`, `manufacturer`, `model`
  - Filters: `equipment_type`, `status`
  - Maintenance filters via query param `maintenance_status=overdue|due_soon`

Line Schedules
- CRUD under `/api/line-schedules/` (admin for mutations)
  - Filters: `service_type`, `status`, `gate`
  - Date filter: `start_date`, `end_date`; `today=true`
  - Actions:
    - POST `/api/line-schedules/{id}/start_service/`
    - POST `/api/line-schedules/{id}/complete_service/`

---

## Example: Auth and API Call

Request access token:

```http
POST /api/auth/token/
Content-Type: application/json

{ "username": "admin", "password": "secret" }
```

Use access token to list flights:

```http
GET /api/flights/?today=true
Authorization: Bearer <access>
```

---

## Updating TypeScript Client

Run the VS Code task “Update OpenAPI schema” or execute inside the `web` container:

```bash
pnpm openapi:generate
```

This regenerates `frontend/packages/types/api` with the latest endpoints and models.
