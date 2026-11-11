---
title: Ramp Management (Parking) usage guide
module: parking
order: 1
anchors: [add-airplane, move-airplane, heading, remove-airplane, board-chip, scale-and-layers, config-mode, new-area, draw-boundary, edit-shape, make-rectangle, edit-freely, snap-to-grid, map-rotation, clear-or-archive]
---

## Overview

Ramp Management is a satellite map of the ramp, hangars and tie-downs. Every airplane that is parked at the FBO is a marker on the map at its exact position, with the nose pointing the way it is parked. **Areas** are coloured shapes drawn over the map (a hangar, a tie-down row, a ramp spot). A plane that sits inside an area belongs to that area, and the area name shows on the plane's card on the Arrivals / Departures board.

Two modes, switched at the top right of the page:

- **Operations Mode** is for everyday use: add, move and turn airplanes.
- **Config Mode** is for admins: draw and edit the areas.

Airplanes are drawn with a silhouette that matches their type (single, twin, turboprop, jet, helicopter) at their real size, so a Citation looks smaller than a Gulfstream at any zoom. A plane with an unknown type is drawn as an average airplane, slightly faded.

## Common tasks

### Add an airplane {#add-airplane}

Press **Add airplane**. Pick an aircraft that already exists, or create a new one by typing its tail number: the type is looked up from the tail number and filled in for you (you can still change it). The airplane appears on the map and you drag it into place.

### Move an airplane {#move-airplane}

Drag the airplane on the map. With it selected on the map you can also use the arrow keys (up and down move it, left and right turn it), and Cmd/Ctrl+Z undoes the last move. Dropping it inside an area attaches it to that area; dropping it on open ramp leaves it without one.

### Turn an airplane {#heading}

Click an airplane to open its drawer. The **compass** in the drawer shows the airplane (its own silhouette) pointing the way it is parked. **Click or drag on the compass** to point it a new way; the heading changes by 1 degree and saves automatically.

- The red **N** is true north and turns with the map, so if you have rotated the map, north on the compass still matches north on the map. The small purple mark at the top of the compass is "up on your screen".
- With the compass selected (click it, or Tab to it), the **arrow keys** turn the airplane by 1 degree and **Shift + arrow** by 10. **Home** points it north.
- The four buttons under the compass turn the airplane to face left, up, right or down as you see them on screen, whatever the map rotation.

### Remove an airplane from the ramp {#remove-airplane}

Open the airplane's drawer and press **Remove from ramp**. The aircraft record is kept; it just no longer has a parked position.

### See the area on the board card {#board-chip}

A parked airplane that is inside an area shows a small map-pin chip with the area name on its card on the Arrivals / Departures board, for example "MH" for the main hangar.

### What the colours and layers mean {#scale-and-layers}

Areas are solid colours so the airplanes that appear in the satellite photo underneath do not look like duplicates: only the live airplane markers are visible inside an area. Hangars are orange, tie-downs green, ramp violet and other areas pink. The area you are editing is see-through with a light-blue outline so you can line it up with the buildings.

## Config Mode (admins)

### Switch to Config Mode {#config-mode}

Use the switch at the top right. The list of areas appears on the left of the map.

### Create an area {#new-area}

Press **New area**, give it a code, a name and a kind (hangar, tie-down, ramp or other). A tie-down row is one area that holds many planes.

### Draw its boundary {#draw-boundary}

Select the area, press **Draw boundary**, click each corner on the map and **double-click to finish** the shape (Esc cancels). **Redraw boundary** replaces an existing shape.

### Edit a shape {#edit-shape}

Click an area on the map (or in the list) to edit it directly: there is no separate edit button. Drag the shape to move it. Changes save automatically. Click empty map or press Esc to deselect.

- A **rectangle** shows eight handles: dragging a **corner** resizes it with the opposite corner fixed, and dragging a **side handle** moves just that side. It stays a rectangle, whatever direction it faces.
- Any other shape shows its corners; drag a corner to move it, or drag a midpoint to add a new corner.

### Make a shape a rectangle {#make-rectangle}

Press **Make rectangle** to turn the selected shape into the smallest rectangle that fits it, facing the same way as the shape. Use this for a hangar or a tie-down row you outlined roughly.

### Edit a rectangle freely {#edit-freely}

A rectangle normally keeps its rectangular handles. Press **Edit freely** to edit its corners like any polygon (for an L-shaped hangar, for example); **Keep rectangular** returns to the rectangle handles when the shape is a rectangle again.

### Snap to grid {#snap-to-grid}

**Snap to grid** squares the shape up with the map as you currently see it, so its sides line up with the screen. **Make rectangle** keeps the shape's own direction instead.

### Rotate the map {#map-rotation}

The **Map rotation** slider turns the map (for example to make the hangars sit upright); **N up** returns to north. Selecting an area keeps the rotation you chose.

### Clear a boundary or archive an area {#clear-or-archive}

**Clear boundary** removes the shape but keeps the area. The archive icon in the list removes the area from the map; the airplanes in it keep their positions.

## Troubleshooting

- **A plane is not where I dropped it.** Open its drawer: the heading and area are listed there. If it was dropped on open ramp it has no area. Drag it again, and use Cmd/Ctrl+Z to undo a bad move.
- **I cannot edit an area.** Editing needs Config Mode. Switch it on at the top right, then click the area.
- **The satellite photo shows a plane that is not in the app.** The photo is old. Only the airplane markers are live; areas cover the photographed planes inside them, but outside an area they remain visible.
- **The buttons do nothing right after the page loads.** Wait a moment for the map to finish loading, then try again.
- **The map looks tilted.** Press **N up**, or set the rotation you want with the slider.
