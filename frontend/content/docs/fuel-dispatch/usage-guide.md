---
title: Fuel Dispatch usage guide
module: fuel-dispatch
order: 1
anchors: [status, cards, changes, countdowns, filter, density, weather, fuel-sheet, save-fueling, meter-gaps]
---

## Overview

Fuel Dispatch shows the airline flights QT Technologies has on the ramp, one card per flight, with the fuel each one has requested. It is laid out the same way as the Fuel Dispatch screen on the Minuteman Dashboard, so the two read alike.

- The page loads the QT dispatch list by itself every 30 seconds and again whenever you come back to the tab. Nothing needs to be typed in.
- The weather card (top right on a wide screen) and the fuel density box at the bottom sit on the same page, so the temperature and density are in front of you while you fuel.

## Common tasks

### Read the status pill {#status}

The pill under the title counts down to the next refresh: **Next refresh in 23s** (green). Click it to refresh right away. It turns yellow (**Refreshing...**) while loading and red (**Dispatch error - retrying in Ns**) when QT could not be reached; the red banner under the header stays up until a refresh works. If the banner says QT is rejecting the login, QT has probably forced a password reset: reset it at go.qttechnologies.com and ask an administrator to update the password the app uses.

### Read a flight card {#cards}

Each card shows the flight (click it, or the tail number, to open the aircraft on FlightRadar24), a status badge, and tiles for tail number, airline, arrival and departure.

- The left edge colour is the state: purple for a normal flight, red for **In Flight** (already departed), green and faded for **Completed**, orange when the aircraft has a MEL item or a recent change.
- Badge colours: **Planned** purple, **In** (on the ground) green, **In Flight** blue.
- Under the tail number are the aircraft type and the gate, written as terminal plus gate (**A4**), the way the ramp signage reads. When the aircraft's transponder reports a more specific type than QT does, you see both, for example **B39M (737)**.
- The green box is the fuel QT has planned, in pounds and gallons.
- An orange box with a warning sign is the MEL note for the aircraft.

### Spot a change {#changes}

When fuel, gate or times change in QT while the page is open, the card turns orange and an orange line says what moved, for example **Fuel increased: 6,700 → 8,000 lbs**, **Gate changed: A4 → B2** or **Departure changed: 02:37 PM → 03:10 PM**. Every change is listed, oldest first. A flag clears three hours after the change, or when the flight completes. Changes are noticed only while the page is open: a page opened after the change shows the new value without a flag.

### Read the countdowns {#countdowns}

Planned flights show how long until arrival and flights on the ground show how long until departure. The text turns orange inside 45 minutes and red inside 15 minutes or when overdue. For a flight still in the air, a green **live** badge means the time comes from the aircraft's own ADS-B position instead of QT's schedule; hover it to see distance, speed and altitude. Most inbound flights are out of ADS-B range until late, so QT's time is the usual case. Flights on the ground also show **Time on Ground**, with QT's scheduled turn underneath.

### Hide departed flights {#filter}

The **Hide departed flights** switch at the bottom (on by default) removes flights that have already left. Turn it off to see them too. **Airlines / All** switches between the airline cards alone and the airline cards plus this app's own fuel orders (the **New Fuel Order** button appears there).

### Fuel density {#density}

The box under the cards shows the outside temperature and the estimated Jet A density at that temperature. It uses the fuel farm's gravity QC average when loads have been logged, and otherwise the last hydrometer reading. The thermometer button (bottom right) opens a panel to record a new hydrometer reading: enter the fuel temperature and density and press **Save**; everyone sees it.

### Weather {#weather}

On a wide screen the card at the top right shows the Missoula (KMSO) conditions: temperature, flight category, wind, ceiling, visibility, altimeter, pressure and density altitude, sunrise and sunset, and the raw METAR. It refreshes every 10 minutes. It is hidden on phones and tablets.

### Work out the wing loading {#fuel-sheet}

On a card with a fuel request, press **Fuel sheet** to open the worked fuel service form: type in what each tank holds on arrival and every line to write on the sheet is filled in. The planned gate fuel from QT is the total the aircraft should hold after fueling; the gallons to add are that, minus what is on board, divided by the density.

The fuel sheet picks the tank capacities from the aircraft type (you can change the type in the list at the top). Wings are filled evenly to their maximum and only the rest goes in the center tank. Any type whose capacities are unconfirmed shows **(unverified)** in the list and a note under the sheet: for those, check the wing max against the airline's own sheet and type it over the **Wing max** box if it differs.

| Type | Each wing | Center | Status | Source |
| --- | --- | --- | --- | --- |
| B737-700/800/900 | 1,288 gal | 4,299 gal | Confirmed | Boeing ARFF 737 page 737.1.6 (30 Apr 2024) and D6-58325-7 Rev C (Oct 2025); total 6,875 gal at 6.7 lb/gal. Optional auxiliary tanks (-900ER, BBJ) are not included |
| B737 MAX 7/8/9/10 | 8,650 lb | 28,394 lb (about 4,238 gal) | Confirmed (wings from airline slips, center derived) | Wings: airline fuel slips (Ted, 2026-11-11); Boeing publishes no per-tank split in D6-38A004 Rev K (Jul 2025), only 6,820 gal usable at 6.7 lb/gal, so the center is that total minus both wings. Boeing's fire-fighting sheet shows 1,288 gal (8,630 lb) per wing, 20 lb lower |
| A319/A320 | 2,046 gal | 2,179 gal | Confirmed | Airbus Aircraft Characteristics, Airport and Maintenance Planning, Rev Jul 01/26, 2-1-1, at 0.785 kg/l. Wings differ slightly by variant (2,046 to 2,108 gal each); the smallest (neo) is used |

Pounds on the sheet are these gallons at the density the document states (6.7 lb/gal Boeing, 0.785 kg/l Airbus). The E175 and CRJ figures are from the airline sheets and are confirmed.

### Save the fueling with the truck meters {#save-fueling}

Under the calculated gallons, choose the **fuel truck** and type the **meter start and stop** for the front register (and the rear register if you used it). The gallons pumped are stop minus start and are compared with the calculated gallons: within 75 gallons either way shows **OK**, otherwise **out of tolerance**. Press **Save fueling**.

- Saving records the whole fueling: truck, meter start and stop, gallons pumped, calculated gallons, density, planned fuel and the tank readings before and after (left, center where the type has one, right). It lands in the same place as the truck-sheet scans, on the truck's sheet for the day, so typed readings and scanned sheets are one record.
- Open the sheet again later and it is filled back in; **Update** changes the saved fueling instead of adding a second one.
- The truck you used last is chosen for you, and the front start is filled with where that truck's meter last ended. Check it against the meter.
- If the meter rolled past its last digit during the fueling, the pumped gallons still come out right and the sheet says so.
- A stop below the start (and not a roll-over) cannot be saved: check the numbers.

### Meter gaps {#meter-gaps}

Each reading on a truck's meter should start where the one before it ended. When the start you type is not where the truck's last reading ended, an amber note says how many gallons are not recorded in between (or how far below it you started). **You can still save**: a gap is never a reason to stop, the point is to mark it so it can be looked into.

Gaps are listed on the truck's page in Equipment, under **Meter gaps**, whether they came from a typed fueling or a scanned sheet. Press **Add note** on a gap to say why: **Meter roll**, **Forgotten fueling**, **Typo** or **Other**, with a note, and **Save and resolve** once it is explained. Resolved gaps are hidden until you press **Show resolved**; **Reopen** brings one back. If a wrong number is corrected so the readings chain again, the gap disappears by itself.

A meter that rolls over (for example 999,990 to 5) is recognised: the gallons missing across the roll are worked out, not shown as a huge backwards jump. The roll-over point is assumed to be 1,000,000; a truck whose meter rolls at another number shows each roll as a gap to note as **Meter roll**.

## Troubleshooting

- **The pill is red and no cards appear.** QT could not be reached or rejected the login. Use the **?** button (bottom right) for QT's support contact, or ask an administrator.
- **Cards show no live badge.** Normal: the aircraft is out of ADS-B range or on the ground. QT's own time is shown.
- **A change flag disappeared.** It clears after three hours, when the flight completes, or when the page is reloaded.

To go back to the flights, open [Fuel Dispatch](module:fuel-dispatch).
