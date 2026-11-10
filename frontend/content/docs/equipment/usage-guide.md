---
title: Equipment usage guide
module: equipment
order: 2
anchors: [open-equipment, log-maintenance-item, resolve-maintenance-item, out-of-service, daily-readings, filter-changes, equipment-notes, meter-readings, scans]
---

## Overview

The Equipment page lists the FBO's trucks and other equipment with a live status. Click an equipment name to open its **detail page**: status and maintenance dates at the top, then the maintenance items, and for fuel trucks the meter readings and scanned truck sheet pages.

An open maintenance item does not change the equipment status. The status stays a manual setting; the list only shows a small "open maintenance items" count so nobody misses it.

## Common tasks

### Open an equipment page {#open-equipment}

On the Equipment list, click the name of the equipment. The page works on a phone as well as on a desktop. From the Fuel Truck Logs, the truck number on a sheet opens the same page.

### Log a maintenance item {#log-maintenance-item}

1. Press **Add item** in the Maintenance items section.
2. Enter a short **Title**, for example "Dead battery".
3. Set **Noted at** to when the problem was found, not when you are typing it in. It starts at the current time and is read in the FBO time zone (shown next to the label, for example MST). Found at 2:00 AM? Enter 02:00.
4. Add **Notes** if useful, then **Save**.

Open items are listed first, newest first, then resolved ones. **Edit** changes the title, notes or time; **Delete** removes an item from the list (it is kept in the database, not erased).

### Resolve a maintenance item {#resolve-maintenance-item}

Press **Resolve** on the item, adjust the resolved time if it was fixed earlier, optionally add resolution notes, and press **Resolve**. The item moves to the resolved group. **Reopen** puts it back to open.

### Take a truck out of service {#out-of-service}

Choose **Out of Service** in the status menu (list or detail page). It asks for the reason, for example "Dead battery", and files it as an open maintenance item. While the truck is down its card shows "Down N days: <reason>". When you resolve the last open item the page offers to set the truck back to Available.

### Daily readings (DPI and nozzle pressure) {#daily-readings}

On a fuel truck's page press **Log readings** and enter the differential pressure across the filters (DPI, psi) and/or the nozzle pressure (psi), the time (starts at now) and an optional note. Do this once a day. The section shows the latest values, a small trend line for each, and, when DPI is climbing, how many days until it reaches the replacement limit (15 psi for now). The list card shows the latest DPI / nozzle values.

### Filter changes {#filter-changes}

Press **Log filter change** when the filters are replaced: when, which filters, and the DPI just before the change. The section and the list card show how many days ago the filters were changed; they are flagged "Due soon" in the last 30 days of the one-year life and "Replace now" after it. Replace sooner if the DPI trend says so.

### Notes {#equipment-notes}

**Add note** writes a general note about the equipment, for example "Noticed the battery was dead at 2am". The time starts at now and can be set earlier. Notes are listed newest first.

### Meter readings of a fuel truck {#meter-readings}

For a fuel truck with truck sheets, the page lists its sheets by day, newest first (30 at first, **Show more** for older): fuel type, front and rear meter start and end, gallons pumped, starting and remaining gallons and the fueler's initials. **Open the sheet** goes to the full truck sheet. Equipment without truck sheets shows no readings section, and neither does a user without access to Truck Sheets.

### Scanned pages {#scans}

Each day's card also shows the stored (upright) scan pages as thumbnails in page order. Click one to see it full size; the dialog links to the original file.

## Troubleshooting

- **No readings section:** the equipment has no truck sheets yet, or your role does not include Truck Sheets.
- **The time is off by hours:** the Noted at time is read in the FBO time zone set in Settings, not in your device's zone.
- **A scan shows "Unavailable":** the image could not be loaded; reload the page. If it persists, the file may be missing from storage.
