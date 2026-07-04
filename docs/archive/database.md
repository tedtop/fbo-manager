## Database Schema

This document describes the relational schema for FBO Manager, based on Django models in `backend/api/models.py`.

---

## Entity–Relationship Diagram

```mermaid
erDiagram
  User {
    int id PK
    string username
    string email
    string role
    string employee_id
    bool is_active_fueler
  }

  Fueler {
    int id PK
    int user_id FK
    string fueler_name
    string handheld_name
    string status
  }

  Training {
    int id PK
    string training_name
    string description
    int validity_period_days
    string aircraft_type
  }

  FuelerTraining {
    int id PK
    int fueler_id FK
    int training_id FK
    date completed_date
    date expiry_date
    int certified_by_id FK nullable
  }

  FuelTank {
    string tank_id PK
    string tank_name
    string fuel_type
    decimal capacity_gallons
  }

  TankLevelReading {
    string tank_id
    decimal level
    datetime recorded_at
  }

  Aircraft {
    string tail_number PK
    string aircraft_type_icao
    string aircraft_type_display
    string airline_icao
  }

  ParkingLocation {
    int id PK
    string location_code unique
    string airport
    string terminal
    string gate
    int display_order
  }

  Flight {
    int id PK
    int aircraft_id FK
    int location_id FK nullable
    int created_by_id FK
    string call_sign
    datetime departure_time
    string flight_status
  }

  FuelTransaction {
    int id PK
    int flight_id FK nullable
    string ticket_number unique
    decimal quantity_gallons
    decimal quantity_lbs
    decimal density
    string progress
    string qt_sync_status
  }

  FuelerAssignment {
    int id PK
    int transaction_id FK
    int fueler_id FK
    datetime assigned_at
  }

  Equipment {
    int id PK
    string equipment_id unique
    string equipment_name
    string equipment_type
    string status
  }

  TerminalGate {
    int id PK
    string terminal_num
    string gate_number
    int display_order
  }

  LineSchedule {
    int id PK
    int flight_id FK nullable
    int gate_id FK nullable
    string service_type
    datetime scheduled_time
    string status
  }

  User ||--o{ Fueler : has
  User ||--o{ Flight : creates
  User ||--o{ FuelerTraining : certifies
  Fueler ||--o{ FuelerTraining : earns
  Training ||--o{ FuelerTraining : defined
  Aircraft ||--o{ Flight : operates
  ParkingLocation ||--o{ Flight : positioned_at
  Flight ||--o{ FuelTransaction : fueling
  FuelTransaction ||--o{ FuelerAssignment : assigns
  Fueler ||--o{ FuelerAssignment : performs
  Equipment ||--o{ LineSchedule : used_in
  Flight ||--o{ LineSchedule : services
  TerminalGate ||--o{ LineSchedule : occurs_at
```

Note: `TankLevelReading` is managed externally (`managed=False`) and uses `tank_id` as a loose FK to `FuelTank.tank_id`.

---

## Models and Fields

### User
- Extends Django `AbstractUser` with additional fields: `role`, `phone_number`, `employee_id` (unique, nullable), `is_active_fueler`.
- Typical roles: `admin`, `line`, `frontdesk`.

### FuelTank and TankLevelReading
- `FuelTank` holds static configuration and limits for tanks.
- `TankLevelReading` is read‑only, timestamped measurements (external ingestion). Indexed by `recorded_at`.

### Aircraft
- Registry keyed by `tail_number`. Stores type codes and display labels.

### ParkingLocation
- Physical location descriptor with optional coordinates/polygon for map display.
- Soft‑delete semantics via `display_order=0`.

### Flight
- Core operational entity linking `Aircraft`, `ParkingLocation`, and creator `User`.
- Supports origin/destination, services (JSON), and notes.

### Fueler and Training
- `Fueler` profile extends `User` via OneToOne.
- `Training` course definitions; `FuelerTraining` captures completion/expiry and certifier (`User`).

### FuelTransaction & FuelerAssignment
- Tracks fuel delivery with progress state machine and QuickTurn sync status.
- `FuelerAssignment` maps fuelers to transactions; unique per (transaction, fueler).

### Equipment & LineSchedule
- Ground Support Equipment inventory and maintenance dates.
- `LineSchedule` links flights, personnel (M2M to `User`), and equipment (M2M) with start/complete actions.

---

## Constraints & Indexing
- Unique constraints: `FuelerTraining(fueler, training)`, `FuelerAssignment(transaction, fueler)`, `FuelTransaction.ticket_number`, `Equipment.equipment_id`, `ParkingLocation.location_code`.
- Ordering defaults ensure newest operational items appear first (e.g., `-created_at`, `-scheduled_time`).
- Additional DB indexes defined on `ParkingLocation(airport, display_order)` and `ParkingLocation(location_code)`.

---

## Migration & Seeding Notes
- Migrations live under `backend/api/migrations/`.
- A seed management command exists for fuel tanks: `backend/api/management/commands/seed_fuel_tanks.py`.
