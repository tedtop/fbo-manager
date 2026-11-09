---
title: Fuel Dispatch usage guide
module: fuel-dispatch
order: 1
anchors: [status, cards, changes, countdowns, filter, density, weather, fuel-sheet]
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

On a card with a fuel request, press **Fuel sheet** to open the worked fuel service form: type in what each tank holds on arrival and every line to write on the sheet is filled in. Nothing is stored.

## Troubleshooting

- **The pill is red and no cards appear.** QT could not be reached or rejected the login. Use the **?** button (bottom right) for QT's support contact, or ask an administrator.
- **Cards show no live badge.** Normal: the aircraft is out of ADS-B range or on the ground. QT's own time is shown.
- **A change flag disappeared.** It clears after three hours, when the flight completes, or when the page is reloaded.

To go back to the flights, open [Fuel Dispatch](module:fuel-dispatch).
