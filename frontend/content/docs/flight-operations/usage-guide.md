---
title: Arrivals and Departures usage guide
module: flight-operations
order: 1
anchors: [add-flight, quick-turn, times, hangar-pull, services, status, delete, filters, airports, conflicts, hide]
---

## Overview

The Arrivals / Departures board (the home page, "Flight Ops") lists every aircraft the FBO is expecting or has on the ramp. Each flight is a card showing the tail number, aircraft type, origin and destination, scheduled and actual times, services and status.

- **Split view** (default) shows Arrivals on one side and Departures on the other. The toolbar also offers **Arrivals Only**, **Departures Only** and a **Calendar View** (week).
- A quick turn (QT) appears in both columns, because the same aircraft arrives and leaves.
- The board shows **Today + Future** by default: everything whose stay ends today or later. Finished (Departed) and hidden flights drop off, see "Hide a flight" below.
- The board updates live: flights added or changed by other people appear without reloading.

## Common tasks

### Add a flight {#add-flight}

Press **Add Flight** in the board toolbar. The form is a panel on the right.

1. **Tail Number** (required). The field is pre-filled with your tail prefix (for example `N`, set in Settings) and suggests known aircraft as you type. Saving with only the prefix shows "Enter the tail number".
2. **Aircraft Type** (required). For an aircraft the app has not seen before, the type is looked up from the tail number and filled in when found; check it and correct it if needed.
3. **Status** (required), normally left at Scheduled.
4. **Date** (required) and **Scheduled Times** (24-hour). At least one of arrival or departure is needed.
5. Optional: Origin, Destination, Contact Name and Notes, Services, Notes, Fuel order notes.

New flights have **QT** ticked, so you normally only enter the arrival time. If the aircraft is new, it is created together with the flight.

### Quick turn (QT) and the +1 hour rule {#quick-turn}

QT means the aircraft arrives and leaves again soon. While QT is ticked, the departure time is always the arrival time plus one hour, and it updates as you change the arrival. A departure after midnight lands on the next day (a 23:30 arrival departs at 00:30).

Typing a departure time by hand **unticks QT**, because the departure is then no longer the automatic one. Ticking QT again recalculates the departure from the arrival (if there is an arrival time). QT cards appear in both the Arrivals and Departures columns.

### Scheduled vs actual times {#times}

Each side has two times. The upper one is the **scheduled** time (the plan, used to place the flight on the board and in the date filters). The smaller **Actual** field below it is for what really happened.

- Fill in the scheduled times when you add the flight.
- Fill in the actual arrival or departure when it happens. Leave them blank until then.
- All times are entered and shown in the board's local time, 24-hour.
- When both scheduled times are set, the form shows the ground time between them.

### Arrival-only and departure-only entries (hangar pull) {#hangar-pull}

Not every flight has both ends.

- **Arrival only (a return):** leave Departure blank. Used for an aircraft coming in that will leave later or on a different booking.
- **Departure only (a hangar pull):** leave Arrival blank. Used for an aircraft already in the hangar that is pulled out to depart.

At least one scheduled time is required; saving with neither shows an error under the times. Untick QT (or just type the departure) when there is no arrival, since the +1 hour rule needs an arrival. Notes such as takeoff fuel go in **Fuel order notes**.

The home airport pre-fills the end that is known: Destination for an arrival, Origin for a hangar pull. See "Choosing an airport" below.

### Services {#services}

Services are shown as coloured pills in the form and on the card. Click a pill to switch the service on or off; selected pills are coloured. Selected services show on the card and can be used as a board filter.

Some services carry a quantity. **TKS Fluid** is sold per gallon: when you select it, a small number field appears next to the pill for the **gallons** (a whole number, at least 1), and the card shows it as, for example, "TKS Fluid · 12 gal". Unselecting the pill clears the quantity.

You can also edit services and notes directly on the card without opening the form. The list of available services is managed centrally, so the pills you see can change over time.

### Change a flight's status {#status}

The statuses are **Scheduled, Arrived, Departed, Delayed** and **Cancelled** (there is no "en route"). Change the status in the form, or use the status control on the card for a one-click change.

Setting a flight to **Departed** also schedules it to leave the default board the next day, see "Hide a flight". If someone else changed the flight since your board loaded, the card shows "Flight was changed by someone else" and does not change the status; look at the latest details and try again.

### Hide a flight {#hide}

**Hide** (next to Edit on the card) removes a flight from the board without deleting it. A flight set to Departed hides itself from the day after its departure day. To see hidden flights, turn on **Show hidden** in the filters; they appear muted and marked Hidden, and the button becomes **Unhide**.

### Delete a flight {#delete}

Use **Delete** at the bottom of the card. A confirmation names the tail ("Delete N123AB?"). Confirming removes the flight from the board; the record is kept in the database, so an administrator can restore it. Use Hide instead if you only want it off the board.

### Filters, search, views and the date filter {#filters}

- **Search** matches the tail number, aircraft type, origin, destination and contact name. Press `/` or use the search box in the toolbar.
- **Filters** (the filter button) has **Status**, **Date Range**, **Required Services** and **Show hidden**.
- **Date Range** choices: Today, **Today + Future** (the default), Tomorrow, This Week, All Dates. Days are local days. A flight is included when its stay overlaps the range; with only one scheduled time, that time (or an actual time) decides.
- The view buttons switch between Split, Calendar, Arrivals Only and Departures Only.
- Clearing the filters returns to Today + Future with nothing else selected.

### Choosing an airport {#airports}

Origin and Destination use an airport picker. Open it and type a code or name: `MSO`, `FCA`, `KMSO`, or part of a city or airport name. Results appear as you type and the **first match is preselected**: press Enter to take it, or use the arrow keys to move.

- Some codes are shared by more than one airport. For example `GPI` is Glacier Park (KGPI) and also Guapi in Colombia. All exact matches are listed, with airports in the home country first, so choose the right one (type `KGPI` to be exact).
- **Clear (no airport)** at the top of the list empties the field.
- If you type something that is not in the airport table, you can still use the text as typed.
- The airport is stored by its ICAO code (KMSO) but **shown** using the display code chosen in Settings.

In **Settings** an administrator sets the **Home airport** (it pre-fills Origin or Destination on new flights and ranks its country first in results) and **Airport code shown** (FAA identifier like MSO, IATA, or ICAO like KMSO). Settings is under the account menu and needs the users-management permission.

### Editing conflicts {#conflicts}

Two people can open the same flight. The form tells you:

- **"<name> is also editing this"**: someone else has the flight open. Changes may conflict if you both save, so coordinate first.
- **"This record was just changed by someone else"** (shown while you edit): **Reload** shows their changes and discards your edits, **Keep editing** continues with your version.
- **"Someone else saved changes to this record"** (when you press Save and your version is older): choose **Reload** to take their version, or **Overwrite anyway** to save yours over it. Overwrite only when you are sure your version is the right one.

## Fields and rules

| Field | Rule |
| --- | --- |
| Tail Number | Required. Pre-filled with the tail prefix from Settings; a field holding only the prefix is treated as empty. |
| Aircraft Type | Required. Looked up automatically for new aircraft when possible. |
| Status | Required: Scheduled, Arrived, Departed, Delayed or Cancelled. |
| Date | Required. The day the scheduled times are on. |
| Scheduled arrival / departure | At least one is required. 24-hour local time. A time earlier than the one before it falls on the next day. |
| Actual arrival / departure | Optional. Fill in when it happens. |
| QT | On for new flights. Departure is arrival + 1 hour while on; typing a departure unticks it. |
| Origin / Destination | Optional airport picker. Home airport pre-fills the known end on new flights. |
| Services | Optional pills. Quantity services (TKS Fluid, gallons) need a whole number of at least 1. |
| Fuel order notes | Free text: fuel type, quantity, special instructions. |
| Notes, Contact | Free text. |

## Troubleshooting

- **A flight is not on the board.** Check Date Range in the filters (the default Today + Future does not show past days; choose All Dates), the Status filter and search box, and whether it is hidden (turn on Show hidden). A Departed flight leaves the default board the day after it departed.
- **Save failed (error message).** The form stays open with your input intact. Read the message, fix the field it names (for example a missing tail, aircraft type or time) and save again.
- **Conflict message when saving.** Someone else saved first. See "Editing conflicts": Reload to take their version, or Overwrite anyway to keep yours.
- **QT got unticked.** Typing a departure time by hand unticks QT. Tick it again to restore arrival + 1 hour.
- **The departure date is the next day.** A departure time earlier than the arrival time is treated as after midnight.
- **An airport code finds the wrong place.** Several airports can share a code. Type the full ICAO code (for example KGPI) or pick from the list by name.
- **Settings shows "Access Restricted".** Changing the home airport, airport code display or tail prefix needs the users-management permission. Ask an administrator.
