# UX benchmark (fixed task set)

Created 2026-11-13. Tasks are fixed so scores compare across runs. Add a task only when a feature
ships (note the date); never change one silently. Each task is walked at desktop 1280px and phone
390px unless marked. "Env" says where it can be walked: prod (look only) or local (saves allowed).

## Parking (current focus, Ted 2026-11-13)

| ID | Persona | Start | Goal | Done when | Env |
|----|---------|-------|------|-----------|-----|
| P1 | Admin (Ted) | /parking | Draw a new area freeform | Polygon saved with a name and kind, visible on the map | local |
| P2 | Admin (Ted) | /parking | Draw an area as a rectangle, square it up, resize it by a handle | Saved rectangle with new size | local |
| P3 | Front desk | /parking | Add a plane from its tail number | Plane marker with the right type appears on the ramp | local |
| P4 | Line tech | /parking | Move a plane into a hangar with the arrow keys only | Plane inside the hangar polygon, area updated, saved | local |
| P5 | Line tech | /parking | Rotate a plane to face the door: (a) keyboard, (b) compass rose | Heading saved within 5 degrees of target | local |
| P6 | Line manager Chris | /parking | Find a plane by tail (e.g. N446FM) | Plane selected and centered | prod |
| P7 | Admin (Ted) | /parking | Compare sizes: C172 next to a G650 and an E175 | Relative sizes look right (judged against real spans 11.0 m / 30.4 m / 26.0 m) | local |
| P8 | Line tech (phone) | /parking at 390px | P3 to P6 on a phone | Each completes without a keyboard | local |

## Front desk agent (at the counter)

| ID | Start | Goal | Done when | Env |
|----|-------|------|-----------|-----|
| F1 | /flight-operations | Add a transient arrival with QT | Card on the board with ETA | local |
| F2 | /flight-operations | Find today's fuel requests | List of today's requests visible | prod |
| F3 | /flight-operations | Mark a hangar pull for a departure | Pull shown on the card | local |

## Line tech (phone, cold, gloves)

| ID | Start | Goal | Done when | Env |
|----|-------|------|-----------|-----|
| L1 | /fuel-dispatch | Find my next fuel order | Order open with tail and gallons | prod |
| L2 | /parking | Find where N446FM is parked and turn it 90 degrees | Heading changed by 90 | local |
| L3 | /truck-sheets | Record a truck sheet's DPI | DPI saved on the sheet | local |

## Line manager Chris

| ID | Start | Goal | Done when | Env |
|----|-------|------|-----------|-----|
| C1 | /fuel-farm | Read tank T3's usable fuel | Number found | prod |
| C2 | /line-schedule | See who is on shift tomorrow morning | Names found | prod |
| C3 | /training | See who is missing a fueling certification | List found | prod |

## Administrator Ted

| ID | Start | Goal | Done when | Env |
|----|-------|------|-----------|-----|
| A1 | /users | Give a new Google sign-up the Line Department role | Role saved | local |
| A2 | /settings | Change the tail number prefix | Setting saved | local |
