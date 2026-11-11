---
title: Fuel Farm usage guide
module: fuel-farm
order: 1
anchors: [reading, gauge, ullage, unusable, trend, gravity, edit-tank]
---

## Overview

The Fuel Farm page shows every storage tank with its latest tape reading: T1 (Avgas) and T2–T6 (Jet A) inside the containment area, then T7 and the Life Flight tank (LF), which sit outside containment and are marked with an amber border and divider.

- Each tank card shows the gauge, the reading in inches, the gallons it converts to, how much of that is usable, how full the tank is and how much more it can take (ullage).
- The top of the page shows the total Jet A on hand across T2–T7 with its history, and the fuel load gravity QC summary.
- The page refreshes itself every 30 seconds (the green "Next refresh" chip; click it to refresh now) and again whenever you come back to the tab. It is laid out to fill a wide line office screen.

## Common tasks

### Enter a tape reading {#reading}

Type the reading under the tank and press **Update** (or Enter). Inches (`54.5`) or feet and inches (`5'7` or `5'7"`) both work. Pressing **Update** with the box empty fills in the current reading, so you can adjust it instead of retyping.

A reading below the tank's minimum or above its physical limit is refused with a message. A reading above the usable-max line is saved as entered, so an overfill shows at its real level.

### Read the gauge {#gauge}

The coloured column is the fuel (orange for Avgas, teal for Jet A). Tick marks on the left are every 10 inches. The column fills to the usable-max line, so a full-looking tank is at its normal ceiling. Above that line the column turns into red stripes and the % full pill turns solid red with a warning.

The **% full** pill runs from red (around 10 inches, where these tanks run dry) to white (full).

### Ullage before a delivery {#ullage}

The green **Ullage** pill under each tank is how many gallons fit before the usable-max line, from the tank's calibration chart. The total for T2–T7 is the **Ullage** pill at the top of the page. A tank already over the line counts as zero toward the total.

### Unusable fuel {#unusable}

The grey striped band at the bottom of each gauge is fuel below the lowest level the tank has ever been read at, which the pumps cannot reach in practice. Hover over it to see the gallons and that lowest reading. **gal usable** on each card (and **Usable** at the top for T2–T7) is the tank's gallons less that band. A new record low updates the band automatically.

### Jet A trend {#trend}

The chart shows total Jet A in T2–T7 over time, rebuilt from every reading. Pick a range (7D to All) above the chart, and hover the chart to see the total on a given date. Low and High under the total are for the chosen range.

### Log a fuel load (gravity QC) {#gravity}

When a Jet A load arrives, press **Log a fuel load** on the gravity QC card. The form opens on the right.

1. Enter the observed fuel temperature and the hydrometer reading.
2. Enter the GTP-3012-1A wheel's reading corrected to 60°F.
3. Enter the driver's BOL API gravity (and specific gravity, if it is on the BOL) and the gallons delivered.
4. Press **Save load**.

The result says **Acceptable** when the wheel reading is within ±1.0° API of the driver's BOL, otherwise **Reject**. A note appears if the app's own temperature correction disagrees with the wheel reading by more than 0.3°, so you can double-check the wheel. The card then shows the mixed API gravity, specific gravity and density of the recent loads, weighted by gallons.

### Edit a tank {#edit-tank}

Press the pencil at the top right of a tank card to change its name, fuel type, capacity and level limits. **New Tank** adds one. Limits are in inches: the minimum and physical maximum bound what a reading can be, and the usable max is the line used for % full and ullage.

At the bottom of the sheet, **Lowest measured** shows the lowest level ever saved for that tank and the date it happened (read only, from the tank's readings). Next to it, **Lowest level override (inches)** lets the line manager set the lowest level by hand when the measured one is wrong, for example a mistyped reading. Save with **Update**. Clear the field and press **Update** to remove the override and go back to the measured value. The line under the two fields says which one is in use, with its gallons.

The override is for the record only: the grey unusable band and **gal usable** on the cards still follow the lowest *measured* reading.

## Troubleshooting

- **"Database offline" in the refresh chip.** The page could not load readings. It keeps retrying every 30 seconds; the last loaded readings stay on screen.
- **A reading was refused.** It was below the tank's minimum or above its physical limit. Check the tape and the units (inches, or feet and inches with an apostrophe).
- **The unusable band looks too high.** It follows the lowest reading ever saved for that tank, so a mistyped low reading raises it. Ask an administrator to correct the reading. The override in Edit Tank does not move the band.
- **Gravity QC says "No loads logged yet".** No loads have been logged; the mixed averages appear after the first one.

To go back to the tanks, open the [Fuel Farm](module:fuel-farm).
