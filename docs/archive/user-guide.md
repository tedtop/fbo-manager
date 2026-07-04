## User Guide

This guide walks through the main features of FBO Manager. Screenshots are indicated as placeholders—replace with actual images from your environment.

> Tip: Ensure you’re logged in (NextAuth) to access protected pages.

---

## Dashboard

- Overview of operations: quick links to flights, fuel transactions, training, and equipment.
- Placeholder screenshot: `![Dashboard](./images/dashboard.png)`

---

## Flights

- View today’s flights or filter by date range.
- Update flight details (admin only): status, notes, parking location.
- Example filter: `today=true` or `start_date=YYYY-MM-DD` / `end_date=YYYY-MM-DD`.
- Placeholder screenshot: `![Flights](./images/flights.png)`

---

## Fuel Farm

- Tanks list shows latest reading and status.
- Click a tank to view historical readings (7 days by default, configurable).
- Placeholder screenshot: `![Fuel Farm](./images/fuel-farm.png)`

---

## Fuel Dispatch

- View fuel transactions with progress state.
- Assign fuelers to a transaction and update progress to “in_progress” → “completed”.
- Placeholder screenshot: `![Fuel Dispatch](./images/fuel-dispatch.png)`

---

## Training & Certifications

- Fuelers list with certification status badges.
- Filter certifications by validity (expired, expiring soon, valid).
- Placeholder screenshot: `![Training](./images/training.png)`

---

## Equipment

- Inventory overview with status and maintenance dates.
- Filter by equipment type or maintenance due.
- Placeholder screenshot: `![Equipment](./images/equipment.png)`

---

## Parking Locations

- Active list by default; toggle to include inactive.
- Group by airport for quick access.
- Placeholder screenshot: `![Parking Locations](./images/parking-locations.png)`

---

## Account & Profile

- Update password and profile details from the Account area.
- Admin users can manage users in Django admin.

---

## Troubleshooting

- “Not authorized”/empty pages: log in again; tokens may have expired.
- Data not updating: refresh; if persistent, contact an admin to verify permissions.
