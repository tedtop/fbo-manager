# FBO Manager - API Reference

**Base URL:** `http://localhost:8000/api/`
**API Version:** 1.0
**Authentication:** JWT (JSON Web Tokens)

---

## Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Fuel Farm Management](#fuel-farm-management)
4. [Aircraft & Gates](#aircraft--gates)
5. [Flight Management](#flight-management)
6. [Training & Certifications](#training--certifications)
7. [Fuel Dispatch](#fuel-dispatch)
8. [Error Responses](#error-responses)
9. [Pagination](#pagination)

---

## Quick Start

### 1. Register a User

```bash
curl -X POST http://localhost:8000/api/users/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "securepassword123",
    "first_name": "John",
    "last_name": "Doe"
  }'
```

### 2. Obtain JWT Token

```bash
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "securepassword123"
  }'
```

Response:
```json
{
  "access": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
}
```

### 3. Use Access Token

```bash
curl -X GET http://localhost:8000/api/users/me/ \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..."
```

---

## Authentication

### Obtain JWT Token

**Endpoint:** `POST /api/auth/token/`
**Authentication:** None (public)

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200 OK):**
```json
{
  "access": "string",
  "refresh": "string"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "adminpass"
  }'
```

---

### Refresh JWT Token

**Endpoint:** `POST /api/auth/refresh/`
**Authentication:** None (public)

**Request Body:**
```json
{
  "refresh": "string"
}
```

**Response (200 OK):**
```json
{
  "access": "string"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/auth/refresh/ \
  -H "Content-Type: application/json" \
  -d '{
    "refresh": "eyJ0eXAiOiJKV1QiLCJhbGc..."
  }'
```

---

## User Management

### Register User

**Endpoint:** `POST /api/users/`
**Authentication:** None (public)

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "first_name": "string",
  "last_name": "string"
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "user",
  "created_at": "2025-10-31T12:00:00Z"
}
```

---

### Get Current User

**Endpoint:** `GET /api/users/me/`
**Authentication:** Required (JWT)

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "role": "user",
  "phone_number": "",
  "employee_id": null,
  "is_active_fueler": false,
  "created_at": "2025-10-31T12:00:00Z",
  "modified_at": "2025-10-31T12:00:00Z"
}
```

**Example:**
```bash
curl -X GET http://localhost:8000/api/users/me/ \
  -H "Authorization: Bearer <access_token>"
```

---

### Update Current User

**Endpoint:** `PUT /api/users/me/` or `PATCH /api/users/me/`
**Authentication:** Required (JWT)

**Request Body (PATCH):**
```json
{
  "first_name": "Jonathan",
  "phone_number": "+1-555-1234"
}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "john_doe",
  "email": "john@example.com",
  "first_name": "Jonathan",
  "last_name": "Doe",
  "role": "user",
  "phone_number": "+1-555-1234",
  "employee_id": null,
  "is_active_fueler": false,
  "created_at": "2025-10-31T12:00:00Z",
  "modified_at": "2025-10-31T13:00:00Z"
}
```

---

### Change Password

**Endpoint:** `POST /api/users/change-password/`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "password_old": "string",
  "password_new": "string"
}
```

**Response (204 No Content)**

**Example:**
```bash
curl -X POST http://localhost:8000/api/users/change-password/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "password_old": "oldpassword",
    "password_new": "newpassword123"
  }'
```

---

### Delete Account

**Endpoint:** `DELETE /api/users/delete-account/`
**Authentication:** Required (JWT)

**Response (204 No Content)**

**Example:**
```bash
curl -X DELETE http://localhost:8000/api/users/delete-account/ \
  -H "Authorization: Bearer <access_token>"
```

---

### List All Users (Admin Only)

**Endpoint:** `GET /api/admin/users/`
**Authentication:** Required (Admin JWT)

**Query Parameters:**
- `search` - Search by username, email, first_name, last_name, employee_id
- `role` - Filter by role (admin, user)
- `is_active` - Filter by active status (true, false)
- `is_active_fueler` - Filter by fueler status (true, false)
- `ordering` - Order by field (username, email, date_joined)

**Response (200 OK):**
```json
{
  "count": 25,
  "next": "http://localhost:8000/api/admin/users/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "username": "john_doe",
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "role": "user",
      "is_active": true,
      "is_active_fueler": true,
      "employee_id": "EMP001",
      "created_at": "2025-10-31T12:00:00Z"
    }
  ]
}
```

---

## Fuel Farm Management

### List Fuel Tanks

**Endpoint:** `GET /api/tanks/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `search` - Search by tank_id, tank_name, fuel_type
- `ordering` - Order by field (tank_id, tank_name, fuel_type)

**Response (200 OK):**
```json
{
  "count": 5,
  "next": null,
  "previous": null,
  "results": [
    {
      "tank_id": "T1",
      "tank_name": "Tank 1 - Jet A",
      "fuel_type": "jet_a",
      "capacity_gallons": "50000.00",
      "min_level_inches": "10.00",
      "max_level_inches": "120.00",
      "usable_min_inches": "15.00",
      "usable_max_inches": "115.00",
      "latest_reading": {
        "level": "85.50",
        "recorded_at": "2025-10-31T11:45:00Z"
      },
      "status": "normal",
      "created_at": "2025-10-01T00:00:00Z",
      "modified_at": "2025-10-31T11:45:00Z"
    }
  ]
}
```

**Status Values:**
- `low` - Level below usable_min_inches
- `normal` - Level within usable range
- `high` - Level above usable_max_inches
- `critical` - Level below min_level_inches or above max_level_inches

---

### Get Tank Detail

**Endpoint:** `GET /api/tanks/{tank_id}/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Response (200 OK):**
```json
{
  "tank_id": "T1",
  "tank_name": "Tank 1 - Jet A",
  "fuel_type": "jet_a",
  "capacity_gallons": "50000.00",
  "min_level_inches": "10.00",
  "max_level_inches": "120.00",
  "usable_min_inches": "15.00",
  "usable_max_inches": "115.00",
  "created_at": "2025-10-01T00:00:00Z",
  "modified_at": "2025-10-31T11:45:00Z"
}
```

---

### Get Tank Readings (Historical)

**Endpoint:** `GET /api/tanks/{tank_id}/readings/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `days` - Number of days to retrieve (default: 7)

**Response (200 OK):**
```json
[
  {
    "id": 1234,
    "tank_id": "T1",
    "level": "85.50",
    "recorded_at": "2025-10-31T11:45:00Z",
    "created_at": "2025-10-31T11:45:05Z"
  },
  {
    "id": 1233,
    "tank_id": "T1",
    "level": "86.20",
    "recorded_at": "2025-10-31T11:30:00Z",
    "created_at": "2025-10-31T11:30:05Z"
  }
]
```

**Example:**
```bash
# Get last 14 days of readings
curl -X GET "http://localhost:8000/api/tanks/T1/readings/?days=14" \
  -H "Authorization: Bearer <access_token>"
```

---

### Create Fuel Tank (Admin Only)

**Endpoint:** `POST /api/tanks/`
**Authentication:** Required (Admin JWT)

**Request Body:**
```json
{
  "tank_id": "T5",
  "tank_name": "Tank 5 - Avgas",
  "fuel_type": "avgas",
  "capacity_gallons": "10000.00",
  "min_level_inches": "10.00",
  "max_level_inches": "80.00",
  "usable_min_inches": "15.00",
  "usable_max_inches": "75.00"
}
```

**Response (201 Created):**
```json
{
  "tank_id": "T5",
  "tank_name": "Tank 5 - Avgas",
  "fuel_type": "avgas",
  "capacity_gallons": "10000.00",
  "min_level_inches": "10.00",
  "max_level_inches": "80.00",
  "usable_min_inches": "15.00",
  "usable_max_inches": "75.00",
  "created_at": "2025-10-31T12:00:00Z",
  "modified_at": "2025-10-31T12:00:00Z"
}
```

---

### List Tank Readings (All Tanks)

**Endpoint:** `GET /api/tank-readings/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `tank_id` - Filter by tank ID
- `ordering` - Order by field (recorded_at, tank_id)

**Response (200 OK):**
```json
{
  "count": 1500,
  "next": "http://localhost:8000/api/tank-readings/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1234,
      "tank_id": "T1",
      "level": "85.50",
      "recorded_at": "2025-10-31T11:45:00Z",
      "created_at": "2025-10-31T11:45:05Z"
    }
  ]
}
```

---

## Aircraft & Gates

### List Aircraft

**Endpoint:** `GET /api/aircraft/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `search` - Search by tail_number, aircraft_type, airline_icao
- `ordering` - Order by field (tail_number, aircraft_type, airline_icao)

**Response (200 OK):**
```json
{
  "count": 15,
  "next": null,
  "previous": null,
  "results": [
    {
      "tail_number": "N12345",
      "aircraft_type": "737-800",
      "airline_icao": "AAL",
      "fleet_id": "FLEET001",
      "created_at": "2025-10-01T00:00:00Z",
      "modified_at": "2025-10-15T00:00:00Z"
    }
  ]
}
```

---

### Create Aircraft (Admin Only)

**Endpoint:** `POST /api/aircraft/`
**Authentication:** Required (Admin JWT)

**Request Body:**
```json
{
  "tail_number": "N67890",
  "aircraft_type": "A320",
  "airline_icao": "UAL",
  "fleet_id": "FLEET002"
}
```

**Response (201 Created):**
```json
{
  "tail_number": "N67890",
  "aircraft_type": "A320",
  "airline_icao": "UAL",
  "fleet_id": "FLEET002",
  "created_at": "2025-10-31T12:00:00Z",
  "modified_at": "2025-10-31T12:00:00Z"
}
```

---

### List Terminal Gates

**Endpoint:** `GET /api/gates/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `search` - Search by terminal_num, gate_number
- `terminal_num` - Filter by terminal number
- `ordering` - Order by field (display_order, terminal_num, gate_number)

**Response (200 OK):**
```json
{
  "count": 20,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "terminal_id": "TERM-A-01",
      "terminal_num": "A",
      "gate_number": "1",
      "location_id": "LOC-A1",
      "display_order": 1,
      "created_at": "2025-10-01T00:00:00Z",
      "modified_at": "2025-10-01T00:00:00Z"
    }
  ]
}
```

---

## Flight Management

### List Flights

**Endpoint:** `GET /api/flights/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `search` - Search by flight_number, destination
- `flight_status` - Filter by status (scheduled, arrived, departed, cancelled, delayed)
- `aircraft` - Filter by aircraft tail_number
- `gate` - Filter by gate ID
- `start_date` - Filter by departure_time >= start_date (ISO 8601)
- `end_date` - Filter by departure_time <= end_date (ISO 8601)
- `today` - Filter today's flights (true)
- `ordering` - Order by field (departure_time, arrival_time, flight_number)

**Response (200 OK):**
```json
{
  "count": 50,
  "next": "http://localhost:8000/api/flights/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "flight_number": "AA123",
      "aircraft": {
        "tail_number": "N12345",
        "aircraft_type": "737-800"
      },
      "gate": {
        "terminal_num": "A",
        "gate_number": "12"
      },
      "arrival_time": "2025-10-31T14:30:00Z",
      "departure_time": "2025-10-31T15:45:00Z",
      "flight_status": "scheduled",
      "destination": "LAX",
      "created_at": "2025-10-30T10:00:00Z"
    }
  ]
}
```

**Example:**
```bash
# Get today's scheduled flights
curl -X GET "http://localhost:8000/api/flights/?today=true&flight_status=scheduled" \
  -H "Authorization: Bearer <access_token>"
```

---

### Get Flight Detail

**Endpoint:** `GET /api/flights/{id}/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Response (200 OK):**
```json
{
  "id": 1,
  "flight_number": "AA123",
  "aircraft": {
    "tail_number": "N12345",
    "aircraft_type": "737-800",
    "airline_icao": "AAL",
    "fleet_id": "FLEET001"
  },
  "gate": {
    "id": 1,
    "terminal_id": "TERM-A-12",
    "terminal_num": "A",
    "gate_number": "12",
    "display_order": 12
  },
  "arrival_time": "2025-10-31T14:30:00Z",
  "departure_time": "2025-10-31T15:45:00Z",
  "flight_status": "scheduled",
  "destination": "LAX",
  "created_at": "2025-10-30T10:00:00Z",
  "modified_at": "2025-10-30T10:00:00Z"
}
```

---

### Create Flight

**Endpoint:** `POST /api/flights/`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "flight_number": "UA456",
  "aircraft": "N67890",
  "gate": 5,
  "arrival_time": "2025-11-01T10:30:00Z",
  "departure_time": "2025-11-01T11:45:00Z",
  "flight_status": "scheduled",
  "destination": "SFO"
}
```

**Response (201 Created):**
```json
{
  "id": 2,
  "flight_number": "UA456",
  "aircraft": {
    "tail_number": "N67890",
    "aircraft_type": "A320"
  },
  "gate": {
    "terminal_num": "B",
    "gate_number": "5"
  },
  "arrival_time": "2025-11-01T10:30:00Z",
  "departure_time": "2025-11-01T11:45:00Z",
  "flight_status": "scheduled",
  "destination": "SFO",
  "created_at": "2025-10-31T12:00:00Z"
}
```

---

## Training & Certifications

### List Training Courses

**Endpoint:** `GET /api/trainings/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `search` - Search by training_name, aircraft_type
- `aircraft_type` - Filter by aircraft type
- `ordering` - Order by field (training_name, validity_period_days)

**Response (200 OK):**
```json
{
  "count": 10,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "training_name": "737-800 Fueling Certification",
      "description": "Certification for fueling Boeing 737-800 aircraft",
      "validity_period_days": 365,
      "aircraft_type": "737-800",
      "created_at": "2025-01-01T00:00:00Z",
      "modified_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### List Fuelers

**Endpoint:** `GET /api/fuelers/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `search` - Search by fueler_name, handheld_name, user__username
- `status` - Filter by status (active, inactive)
- `ordering` - Order by field (fueler_name, status)

**Response (200 OK):**
```json
{
  "count": 25,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "user": {
        "id": 5,
        "username": "jsmith",
        "email": "jsmith@example.com"
      },
      "fueler_name": "John Smith",
      "handheld_name": "JSMITH",
      "status": "active",
      "created_at": "2025-10-01T00:00:00Z",
      "modified_at": "2025-10-15T00:00:00Z"
    }
  ]
}
```

---

### Get Fueler Detail (with Certifications)

**Endpoint:** `GET /api/fuelers/{id}/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Response (200 OK):**
```json
{
  "id": 1,
  "user": {
    "id": 5,
    "username": "jsmith",
    "email": "jsmith@example.com",
    "first_name": "John",
    "last_name": "Smith"
  },
  "fueler_name": "John Smith",
  "handheld_name": "JSMITH",
  "status": "active",
  "certifications": [
    {
      "id": 1,
      "training": {
        "id": 1,
        "training_name": "737-800 Fueling Certification",
        "validity_period_days": 365,
        "aircraft_type": "737-800"
      },
      "completed_date": "2025-01-15",
      "expiry_date": "2026-01-15",
      "status": "valid",
      "certified_by": {
        "id": 2,
        "username": "manager",
        "email": "manager@example.com"
      }
    }
  ],
  "created_at": "2025-10-01T00:00:00Z",
  "modified_at": "2025-10-15T00:00:00Z"
}
```

---

### Get Fuelers with Expiring Certifications

**Endpoint:** `GET /api/fuelers/expiring_soon/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `days` - Days threshold (default: 7)

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "user": {
      "id": 5,
      "username": "jsmith"
    },
    "fueler_name": "John Smith",
    "handheld_name": "JSMITH",
    "status": "active"
  }
]
```

**Example:**
```bash
# Get fuelers with certs expiring in 30 days
curl -X GET "http://localhost:8000/api/fuelers/expiring_soon/?days=30" \
  -H "Authorization: Bearer <access_token>"
```

---

### List Fueler Certifications

**Endpoint:** `GET /api/fueler-certifications/`
**Authentication:** Required (JWT)

**Query Parameters:**
- `fueler` - Filter by fueler ID
- `training` - Filter by training ID
- `status` - Filter by status (valid, expiring_soon, expired)
- `days` - Days threshold for expiring_soon (default: 7)
- `ordering` - Order by field (expiry_date, completed_date)

**Response (200 OK):**
```json
{
  "count": 50,
  "next": "http://localhost:8000/api/fueler-certifications/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "fueler": {
        "id": 1,
        "fueler_name": "John Smith"
      },
      "training": {
        "id": 1,
        "training_name": "737-800 Fueling Certification",
        "validity_period_days": 365
      },
      "completed_date": "2025-01-15",
      "expiry_date": "2026-01-15",
      "status": "valid",
      "certified_by": {
        "id": 2,
        "username": "manager"
      },
      "created_at": "2025-01-15T12:00:00Z",
      "modified_at": "2025-01-15T12:00:00Z"
    }
  ]
}
```

**Example:**
```bash
# Get expired certifications
curl -X GET "http://localhost:8000/api/fueler-certifications/?status=expired" \
  -H "Authorization: Bearer <access_token>"
```

---

### Create Fueler Certification (Admin Only)

**Endpoint:** `POST /api/fueler-certifications/`
**Authentication:** Required (Admin JWT)

**Request Body:**
```json
{
  "fueler": 1,
  "training": 1,
  "completed_date": "2025-10-31",
  "expiry_date": "2026-10-31",
  "certified_by": 2
}
```

**Response (201 Created):**
```json
{
  "id": 2,
  "fueler": {
    "id": 1,
    "fueler_name": "John Smith"
  },
  "training": {
    "id": 1,
    "training_name": "737-800 Fueling Certification"
  },
  "completed_date": "2025-10-31",
  "expiry_date": "2026-10-31",
  "status": "valid",
  "certified_by": {
    "id": 2,
    "username": "manager"
  },
  "created_at": "2025-10-31T12:00:00Z",
  "modified_at": "2025-10-31T12:00:00Z"
}
```

---

## Fuel Dispatch

### List Fuel Transactions

**Endpoint:** `GET /api/transactions/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Query Parameters:**
- `search` - Search by ticket_number, flight__flight_number
- `progress` - Filter by progress (started, in_progress, completed)
- `qt_sync_status` - Filter by QT sync status (pending, synced, failed)
- `start_date` - Filter by created_at >= start_date
- `end_date` - Filter by created_at <= end_date
- `unassigned` - Filter unassigned transactions (true)
- `ordering` - Order by field (created_at, assigned_at, completed_at)

**Response (200 OK):**
```json
{
  "count": 100,
  "next": "http://localhost:8000/api/transactions/?page=2",
  "previous": null,
  "results": [
    {
      "id": 1,
      "flight": {
        "id": 1,
        "flight_number": "AA123"
      },
      "ticket_number": "TKT001234",
      "quantity_gallons": "5000.00",
      "quantity_lbs": "33500.00",
      "density": "6.7000",
      "progress": "started",
      "charge_flags": {
        "wing_walker": true,
        "gpu": false
      },
      "assigned_fuelers": [],
      "assigned_at": null,
      "completed_at": null,
      "qt_dispatch_id": "QT-12345",
      "qt_sync_status": "pending",
      "created_at": "2025-10-31T12:00:00Z",
      "modified_at": "2025-10-31T12:00:00Z"
    }
  ]
}
```

**Example:**
```bash
# Get unassigned transactions
curl -X GET "http://localhost:8000/api/transactions/?unassigned=true" \
  -H "Authorization: Bearer <access_token>"
```

---

### Get Transaction Detail

**Endpoint:** `GET /api/transactions/{id}/`
**Authentication:** Required (JWT) - or AllowAnyReadOnly in dev

**Response (200 OK):**
```json
{
  "id": 1,
  "flight": {
    "id": 1,
    "flight_number": "AA123",
    "aircraft": {
      "tail_number": "N12345",
      "aircraft_type": "737-800"
    },
    "gate": {
      "terminal_num": "A",
      "gate_number": "12"
    }
  },
  "ticket_number": "TKT001234",
  "quantity_gallons": "5000.00",
  "quantity_lbs": "33500.00",
  "density": "6.7000",
  "progress": "in_progress",
  "charge_flags": {
    "wing_walker": true,
    "gpu": false,
    "apu": true
  },
  "assigned_fuelers": [
    {
      "fueler": {
        "id": 1,
        "fueler_name": "John Smith",
        "handheld_name": "JSMITH"
      },
      "assigned_at": "2025-10-31T12:15:00Z"
    }
  ],
  "assigned_at": "2025-10-31T12:15:00Z",
  "completed_at": null,
  "qt_dispatch_id": "QT-12345",
  "qt_sync_status": "synced",
  "created_at": "2025-10-31T12:00:00Z",
  "modified_at": "2025-10-31T12:15:00Z"
}
```

---

### Create Fuel Transaction

**Endpoint:** `POST /api/transactions/`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "flight": 1,
  "ticket_number": "TKT005678",
  "quantity_gallons": "3500.00",
  "quantity_lbs": "23450.00",
  "density": "6.7000",
  "charge_flags": {
    "wing_walker": false,
    "gpu": true,
    "apu": false
  },
  "qt_dispatch_id": "QT-67890"
}
```

**Response (201 Created):**
```json
{
  "id": 2,
  "flight": 1,
  "ticket_number": "TKT005678",
  "quantity_gallons": "3500.00",
  "quantity_lbs": "23450.00",
  "density": "6.7000",
  "progress": "started",
  "charge_flags": {
    "wing_walker": false,
    "gpu": true,
    "apu": false
  },
  "assigned_at": null,
  "completed_at": null,
  "qt_dispatch_id": "QT-67890",
  "qt_sync_status": "pending",
  "created_at": "2025-10-31T13:00:00Z",
  "modified_at": "2025-10-31T13:00:00Z"
}
```

---

### Assign Fueler to Transaction

**Endpoint:** `POST /api/transactions/{id}/assign_fueler/`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "fueler_id": 1
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "transaction": 1,
  "fueler": {
    "id": 1,
    "fueler_name": "John Smith",
    "handheld_name": "JSMITH"
  },
  "assigned_at": "2025-10-31T13:15:00Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/transactions/1/assign_fueler/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"fueler_id": 1}'
```

---

### Remove Fueler from Transaction

**Endpoint:** `POST /api/transactions/{id}/remove_fueler/`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "fueler_id": 1
}
```

**Response (204 No Content)**

**Example:**
```bash
curl -X POST http://localhost:8000/api/transactions/1/remove_fueler/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"fueler_id": 1}'
```

---

### Update Transaction Progress

**Endpoint:** `POST /api/transactions/{id}/update_progress/`
**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "progress": "completed"
}
```

**Valid Progress Values:**
- `started`
- `in_progress`
- `completed`

**Response (200 OK):**
```json
{
  "id": 1,
  "flight": {
    "id": 1,
    "flight_number": "AA123"
  },
  "ticket_number": "TKT001234",
  "quantity_gallons": "5000.00",
  "quantity_lbs": "33500.00",
  "density": "6.7000",
  "progress": "completed",
  "charge_flags": {
    "wing_walker": true,
    "gpu": false
  },
  "assigned_fuelers": [
    {
      "fueler": {
        "id": 1,
        "fueler_name": "John Smith"
      },
      "assigned_at": "2025-10-31T12:15:00Z"
    }
  ],
  "assigned_at": "2025-10-31T12:15:00Z",
  "completed_at": "2025-10-31T13:30:00Z",
  "qt_dispatch_id": "QT-12345",
  "qt_sync_status": "synced",
  "created_at": "2025-10-31T12:00:00Z",
  "modified_at": "2025-10-31T13:30:00Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/api/transactions/1/update_progress/ \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"progress": "completed"}'
```

---

## Error Responses

### Common Error Codes

| Status Code | Meaning | Example |
|-------------|---------|---------|
| 400 | Bad Request | Invalid data in request body |
| 401 | Unauthorized | Missing or invalid JWT token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Server Error | Server error |

### Error Response Format

```json
{
  "detail": "Authentication credentials were not provided."
}
```

or

```json
{
  "field_name": [
    "This field is required."
  ],
  "another_field": [
    "Ensure this value has at most 50 characters."
  ]
}
```

---

## Pagination

All list endpoints use page-based pagination.

**Default:** 10 items per page

**Query Parameters:**
- `page` - Page number (default: 1)

**Response Format:**
```json
{
  "count": 100,
  "next": "http://localhost:8000/api/resource/?page=2",
  "previous": null,
  "results": [...]
}
```

**Example:**
```bash
curl -X GET "http://localhost:8000/api/flights/?page=2" \
  -H "Authorization: Bearer <access_token>"
```

---

## API Documentation UI

### Swagger UI

**URL:** `http://localhost:8000/api/schema/swagger-ui/`

Interactive API documentation where you can:
- Browse all endpoints
- See request/response schemas
- Test endpoints directly in the browser
- Authenticate with JWT tokens

### OpenAPI Schema (JSON)

**URL:** `http://localhost:8000/api/schema/`

Download the OpenAPI 3.0 schema for:
- Code generation (TypeScript, Python clients)
- Postman import
- API testing tools

---

## Rate Limiting

⚠️ **Not yet implemented** - Will be added before production deployment.

---

## Versioning

⚠️ **Not yet implemented** - Current API is version 1.0 (unversioned).

Future versions will use URL-based versioning: `/api/v2/...`

---

## See Also

- [Database Schema](./DATABASE_SCHEMA.md) - Data model reference
- [Developer Guide](./DEVELOPER_GUIDE.md) - Local development setup
- [Project Overview](./PROJECT_OVERVIEW.md) - System architecture

---

**Last Updated:** October 31, 2025
