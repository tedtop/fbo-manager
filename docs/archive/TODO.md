# FBO Manager - TODO & Project Memory

**Last Updated:** 2025-10-30

=== HOW TO HANDLE DATABASE MIGRATIONS ===
- Look into supabase realtime, do we proxy it through django or just have the frontend connect to the db directly?

- How to handle database migrations:

Option 1: Django as Source of Truth (Recommended for your setup)
Define models in Django → Push to Supabase
This is the most common pattern for Django projects:

Define your models in Django (models.py)
Generate migrations: python manage.py makemigrations
Apply to Supabase: python manage.py migrate
DRF generates OpenAPI schemas automatically from your models/serializers
Generate TypeScript types from OpenAPI using a tool like openapi-typescript or swagger-typescript-api

Benefits:

Single source of truth (Django models)
Automatic OpenAPI schema generation via DRF
Django ORM handles relationships, validations, etc.
TypeScript types can be auto-generated from your API schema

Setup for TypeScript generation:
bash# Install in your Next.js project
npm install --save-dev openapi-typescript

# Generate types from your Django API
npx openapi-typescript http://localhost:8000/api/schema/ -o types/api.ts

1. **Django models as primary source** - Define everything in `models.py`
2. **Carefully handle existing tables** - Use `Meta: db_table = 'tank_level_readings'` to map to existing Supabase tables
3. **Auto-generate OpenAPI** - DRF's built-in schema generation
4. **Auto-generate TypeScript** - From the OpenAPI schema using `openapi-typescript`

This gives you a workflow where you only maintain **one place** (Django models), and everything else flows from there:
```
Django Models → Migrations → Supabase
            ↓
        Serializers → OpenAPI Schema → TypeScript Types

==== /DATABASE ====

## ✅ Recently Completed (October 30, 2025)

### Critical Bug Fixes
- [x] Fixed FlightStatusEnum import bug (changed from type-only to value import)
- [x] Fixed infinite refresh loop in useFlights hook (removed session from dependencies)
- [x] Fixed flight form saving functionality with date field

### Navigation & Branding
- [x] Updated navigation title to "FBO Manager"
- [x] Added all menu items: Flight Ops, Fuel Dispatch, Fuel Farm, Equipment, Line Schedule, Training
- [x] Removed Dashboard from navigation (not needed)

### Flight Operations Enhancements
- [x] Expanded flight types to 5 categories:
  - Arrival (shows in arrivals column only)
  - Departure (shows in departures column only)
  - Quick Turn (shows in BOTH columns)
  - Overnight (shows in BOTH columns)
  - Long Term (shows in BOTH columns)
- [x] Replaced single time input with dual arrival/departure time inputs
- [x] Added automatic ground time calculator (handles overnight flights)
- [x] Implemented smart column filtering logic for arrivals/departures
- [x] Added visual indicators (green for arrival, blue for departure)

### Backend - New Modules
- [x] Created Equipment model with maintenance tracking
  - Equipment types: fuel_truck, tug, gpu, air_start, belt_loader, stairs, lavatory_service, water_service
  - Status tracking: available, in_use, maintenance, out_of_service
  - Maintenance date tracking and status calculation
- [x] Created LineSchedule model with personnel and equipment assignments
  - Service types: arrival_service, departure_service, turnaround, overnight
  - Status tracking: scheduled, in_progress, completed, cancelled
  - Links to flights, gates, personnel, and equipment
- [x] Created serializers for Equipment and LineSchedule
- [x] Created viewsets with filtering and custom actions
- [x] Registered API routes at /api/equipment/ and /api/line-schedules/

### Frontend - Theme System Migration
- [x] Converted Fuel Dispatch page to dark/light theme with client components
- [x] Converted Fuel Farm page to dark/light theme with client components
- [x] Converted Training page to dark/light theme with client components
- [x] Created Equipment page with dark/light theme support
- [x] Created Line Schedule page with dark/light theme support
- [x] All pages now use theme-aware colors (bg-card, text-foreground, etc.)

---

## 🚨 HIGH PRIORITY - Next Steps

### Backend - Critical
1. **[ ] Run Database Migrations** (Equipment & LineSchedule tables)
   ```bash
   cd backend
   python manage.py makemigrations
   python manage.py migrate
   ```

2. **[ ] Regenerate TypeScript Types** after migrations
   ```bash
   cd frontend
   pnpm openapi:generate
   ```

### Frontend - Critical
3. **[ ] Build CRUD Dialogs for All Modules**
   - [ ] Fuel Dispatch: Create/Edit/Delete transactions dialog
   - [ ] Fuel Farm: Add/Edit tank readings dialog
   - [ ] Training: Create/Edit/Delete certifications dialog
   - [ ] Equipment: Create/Edit/Delete equipment dialog
   - [ ] Line Schedule: Create/Edit/Delete schedules dialog

4. **[ ] Implement API Hooks for All Modules**
   - [ ] `useTransactions` hook for Fuel Dispatch
   - [ ] `useTanks` hook for Fuel Farm
   - [ ] `useCertifications` hook for Training
   - [ ] `useEquipment` hook for Equipment
   - [ ] `useLineSchedules` hook for Line Schedule

---

## 📋 PLANNING NEEDED - Module Definitions

### Flight Operations Module
**Needs Planning:**
- [ ] Define all fields needed for the flight intake sheet
- [ ] Map fields from front desk process
- [ ] Define integration with QuickTurn dispatch format
- [ ] Plan flight source tracking (QT, FD, LD, TC indicators)
- [ ] Define aircraft type taxonomy
- [ ] Define service request types and workflows

**Questions to Answer:**
- What information does front desk collect when a flight calls in?
- What fields are mandatory vs optional?
- How should we handle international vs domestic flights?
- What aircraft services are typically requested?

### Fuel Dispatch Module
**Needs Planning:**
- [ ] Define complete transaction lifecycle (creation → assignment → in-progress → completion)
- [ ] Plan fueler assignment logic and constraints
- [ ] Define QT sync integration points
- [ ] Plan charge flags and billing integration
- [ ] Define density calculation rules

**Questions to Answer:**
- What's the complete workflow from transaction creation to completion?
- How are fuelers assigned (manual, automatic, both)?
- What data needs to sync with QuickTurn?
- How are charges calculated and categorized?

### Fuel Farm Module
**Needs Planning:**
- [ ] Define tank reading entry workflow
- [ ] Plan alert thresholds and notification rules
- [ ] Define tank calibration data structure
- [ ] Plan historical reporting requirements

**Questions to Answer:**
- How often are tank readings taken?
- Who enters the readings and from where?
- What alerts are needed (low level, critical, etc.)?
- What reports are generated from tank data?

### Training Module
**Needs Planning:**
- [ ] Define complete training type taxonomy
- [ ] Plan certification renewal workflows
- [ ] Define notification schedule for expiring certs
- [ ] Plan training record keeping requirements

**Questions to Answer:**
- What types of training are required?
- How far in advance should expiry notifications go out?
- Who can certify fuelers for different training types?
- How are training records archived/audited?

### Equipment Module
**Needs Planning:**
- [ ] Define complete equipment taxonomy
- [ ] Plan maintenance schedule types (daily, 50hr, 100hr, annual)
- [ ] Define inspection checklist structure
- [ ] Plan equipment reservation/checkout system

**Questions to Answer:**
- What equipment needs to be tracked?
- What maintenance schedules apply to each equipment type?
- Should equipment be reservable/checkable?
- How are repairs/issues reported and tracked?

### Line Schedule Module
**Needs Planning:**
- [ ] Define all service types and SLAs
- [ ] Plan personnel assignment logic
- [ ] Define equipment requirements per service type
- [ ] Plan schedule optimization algorithm

**Questions to Answer:**
- What services are provided on the line?
- How are personnel assigned to services?
- What equipment is required for each service type?
- How should the schedule be optimized?

---

## 📋 TODO - Backend API

### Priority 1: Core Functionality
- [ ] Create database schema documentation with ER diagrams
- [ ] Add `origin` field to Flight model (currently missing)
- [ ] Add `updated_at` field to Flight model
- [ ] Add validation for flight time logic (arrival before departure for same-day)
- [ ] Implement cascade delete rules for all models
- [ ] Add soft delete functionality for critical models

### Priority 2: API Enhancements
- [ ] Add pagination to all list endpoints
- [ ] Add filtering by date range to all applicable endpoints
- [ ] Add search functionality to all list views
- [ ] Implement bulk operations (bulk update, bulk delete)
- [ ] Add export endpoints (CSV, Excel) for reporting

### Priority 3: Real-time & Background Tasks
- [ ] Django Channels setup for WebSocket support
- [ ] WebSocket consumer for fuel dispatch updates
- [ ] WebSocket consumer for tank level updates
- [ ] Celery configuration for background tasks
- [ ] Celery Beat scheduler for periodic tasks
- [ ] Redis configuration (Channels layer & Celery broker)
- [ ] Task: Sync with QT API
- [ ] Task: Send training expiry notifications
- [ ] Task: Check tank level alerts
- [ ] Task: Generate daily/weekly reports

### Priority 4: Integrations
- [ ] QT Technologies API integration
  - [ ] Authentication mechanism
  - [ ] Dispatch data sync
  - [ ] Real-time transaction updates
  - [ ] Conflict resolution strategy
- [ ] Weather API integration (optional)
- [ ] SMS/Email notification service
- [ ] FlightRadar24 API for live tracking (future)

---

## 📋 TODO - Frontend Development

### Priority 1: CRUD Operations
**All modules need:**
- [ ] Create dialog with form validation
- [ ] Edit dialog with pre-populated data
- [ ] Delete confirmation dialog
- [ ] Success/error toast notifications
- [ ] Optimistic UI updates
- [ ] Error handling and retry logic

**Specific to Flight Operations:**
- [ ] Implement dual-handle time slider (replace current time inputs)
- [ ] Add aircraft autocomplete/search
- [ ] Add gate assignment dropdown
- [ ] Add service request checkboxes
- [ ] Add pilot information fields
- [ ] Add passenger count field
- [ ] Add notes/special requests field

### Priority 2: Data Fetching & State
- [ ] Install TanStack Query (React Query)
- [ ] Create custom hooks for each module
- [ ] Implement optimistic updates
- [ ] Add loading states and skeletons
- [ ] Add error boundaries
- [ ] Implement data refetching strategies

### Priority 3: UI/UX Polish
- [ ] Add loading skeletons to all pages
- [ ] Implement error boundaries
- [ ] Add toast notification system
- [ ] Improve responsive design for mobile
- [ ] Add keyboard shortcuts for common actions
- [ ] Add confirmation dialogs for destructive actions
- [ ] Implement form validation with Zod
- [ ] Add drag-and-drop for schedule/calendar views

### Priority 4: Authentication & Authorization
- [ ] Implement protected route wrapper
- [ ] Add auto-refresh token logic
- [ ] Add logout functionality
- [ ] Create admin-only pages
- [ ] Implement role-based UI (hide/show based on permissions)

---

## 🏗️ TODO - Infrastructure & DevOps

### Development Environment
- [x] Docker Compose setup (api, frontend, db)
- [x] Supabase connection configured
- [ ] Switch from Docker to pnpm dev for local development (optional)
- [ ] Install Next.js MCP server for debugging
- [ ] Set up hot reload for backend changes
- [ ] Configure VSCode debugging

### Build & Deployment
- [ ] Upgrade to Next.js 16 (when stable)
- [ ] Install Next.js Turbopack for faster builds
- [ ] Set up production environment variables
- [ ] Configure production database (connection pooling)
- [ ] Set up CDN for static assets
- [ ] Implement automated backups
- [ ] Set up monitoring and alerting

---

## 📊 TODO - Reporting & Analytics

### Dashboards
- [ ] Executive dashboard (fuel volumes, revenue trends)
- [ ] Operations dashboard (real-time status, today's activity)
- [ ] Fueler performance dashboard
- [ ] Equipment utilization dashboard

### Reports
- [ ] Training compliance reports (expired, expiring soon)
- [ ] Fuel consumption by aircraft type
- [ ] Monthly fuel sales summary
- [ ] Maintenance cost analysis
- [ ] Schedule coverage reports
- [ ] Audit logs and compliance reports

---

## 🔒 TODO - Security & Compliance

### Security Hardening
- [ ] Remove development user (admin/admin) before production
- [ ] Change SECRET_KEY in production
- [ ] Implement API rate limiting
- [ ] Configure CORS for production domains
- [ ] Add CSP headers for XSS protection
- [ ] Implement audit logging system
- [ ] Add data encryption at rest
- [ ] Security dependency audits
- [ ] Penetration testing

### Compliance
- [ ] Data retention policy implementation
- [ ] GDPR compliance (if applicable)
- [ ] Audit trail for all data changes
- [ ] User activity logging
- [ ] Backup and recovery procedures

---

## 📝 TODO - Documentation

- [ ] API documentation (Swagger/OpenAPI - auto-generated)
- [ ] Database schema diagram (ER diagram)
- [ ] User manual - Admin role
- [ ] User manual - User role
- [ ] User manual - Fueler role
- [ ] Developer setup guide
- [ ] Deployment guide
- [ ] Backup & recovery procedures
- [ ] Troubleshooting guide

---

## 🆕 Future Feature Modules

### Employee Scheduler Module
- [ ] Shift model (definitions, times, colors)
- [ ] FuelerSchedule model (schedule entries)
- [ ] TimeOffRequest model (PTO requests)
- [ ] Week-long calendar view with drag-and-drop
- [ ] Conflict detection and resolution
- [ ] Approval workflow
- [ ] Export to PDF/CSV
- [ ] Mobile-responsive view

### Fuel Truck Maintenance Module
- [ ] FuelTruck model (fleet inventory)
- [ ] InspectionChecklist model (templates)
- [ ] TruckInspection model (completed inspections)
- [ ] MaintenanceRecord model (service history)
- [ ] Daily inspection form (mobile-friendly)
- [ ] Photo upload for inspection items
- [ ] Service due alerts
- [ ] Inspection history & reports

### Daily/Monthly Checklist System
- [ ] Generic operational checklist system
- [ ] Checklist templates and items
- [ ] Completion tracking
- [ ] Signature capture for critical items
- [ ] Compliance reporting
- [ ] Due date alerts

---

## 💡 Future Ideas

- [ ] Mobile app for fuelers (React Native or PWA)
- [ ] Offline-first capabilities for inspections
- [ ] QuickBooks integration for accounting
- [ ] Biometric authentication
- [ ] Database read replicas for reporting
- [ ] Redis caching for frequently accessed data
- [ ] Automated backup system
- [ ] Multi-tenant support (multiple FBOs)
- [ ] White-label capability

---

## 🐛 Known Issues

**None currently** - All critical bugs have been fixed!

---

## ⚠️ Security Notes

- **Development user `admin/admin` must be removed before production deployment**
- Change SECRET_KEY in .env.backend before production
- Review all environment variables for production use
- Implement rate limiting on API endpoints
- Set up proper CORS configuration for production domains
- Enable SSL/TLS for all connections
- Implement proper session management
- Regular security audits and dependency updates

---

## 📈 Progress Summary

### Backend
- ✅ 13 models created (User, Aircraft, Flight, Equipment, LineSchedule, FuelTank, TankLevelReading, TerminalGate, Fueler, Training, FuelerTraining, FuelTransaction, FuelerAssignment)
- ✅ All serializers implemented
- ✅ All ViewSets with permissions
- ✅ All API routes registered
- ⏳ Migrations pending for Equipment and LineSchedule
- ⏳ Real-time features (WebSockets) not yet implemented

### Frontend
- ✅ 6 main pages created (Flight Ops, Fuel Dispatch, Fuel Farm, Training, Equipment, Line Schedule)
- ✅ Dark/light theme system fully implemented
- ✅ Navigation system complete
- ✅ Flight board with smart filtering
- ✅ Dual time inputs with ground time calculator
- ⏳ CRUD dialogs not yet implemented
- ⏳ API integration incomplete (hooks needed)

### Overall Progress: ~60% Complete
- Core foundation is solid
- Planning needed for detailed module requirements
- CRUD operations are next major milestone
- Real-time features and integrations are later phase
