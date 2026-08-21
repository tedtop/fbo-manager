# Parking Map — Code Audit Findings

**Date:** 2026-06-28  
**Files audited:** `frontend/components/parking/parking-map-enhanced.tsx`, `frontend/components/parking/aircraft-sheet.tsx`  
**Output:** `frontend/lib/parking-math.ts`

---

## Calculations Traced

### 1. Web Mercator scale (`getFeetPerPixel`)
**Location:** `parking-map-enhanced.tsx` (removed; now `feetPerPixelAtZoom` in `parking-math.ts`)

```ts
const metersPerPixel = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoomLevel)
return metersPerPixel * 3.28084
```

**What it does:** Standard Web Mercator tile resolution formula. Returns feet-per-pixel at the given latitude and zoom level. Used to scale SVG aircraft icons so their pixel size matches their real-world wingspan/length on the ground.

**Convention:** 1 metre = 3.28084 ft (exact ISO definition).  
**Correctness:** ✅ Formula is the canonical Web Mercator ground resolution.  
**Extracted to:** `feetPerPixelAtZoom(lat, zoom)` + `metersPerPixelAtZoom(lat, zoom)`.

---

### 2. Aircraft icon pixel size
**Location:** `createAircraftIcon` — `widthPixels = def.wingspan * scale`, `heightPixels = def.length * scale`

**What it does:** `scale = 1 / feetPerPixel`. Multiplying feet by `1/feetPerPixel` gives pixels. So a 100 ft wingspan at a zoom where 1 ft = 0.5 px renders as 50 px.

**Correctness:** ✅ Correct unit cancellation. Aircraft types in `aircraft-types.ts` are pre-scaled ≈2.2× real size for map visibility, which is intentional.

---

### 3. Bearing → movement deltas (`moveAircraft` loop)
**Location:** `parking-map-enhanced.tsx:1356-1370` (removed; now `aircraftMoveDeltas` in `parking-math.ts`)

```ts
const mathRad = (90 - newRotation) * Math.PI / 180
const dLat = moveStep * Math.sin(mathRad)
const dLng = (moveStep * Math.cos(mathRad)) / Math.cos(latRad)
```

**What it does:** Converts a navigation bearing (0 = North, CW) to a math angle (0 = East, CCW) via `90 − bearing`, then computes lat/lng deltas. The longitude delta is divided by `cos(lat)` to correct for Mercator distortion — without this, one degree of longitude near the poles covers much less distance than near the equator.

**Convention:** `newRotation` is the aircraft's true heading (Mapbox `setRotation` value).  
**Correctness:** ✅ Mathematically correct for small displacements.  
**Note:** `moveStep = 0.000005` is in degrees of latitude (≈ 1.8 ft / step at zoom 18). Adequate resolution for smooth 60 fps movement.  
**Extracted to:** `aircraftMoveDeltas(bearing, stepDeg, lat)`.

---

### 4. Bearing normalization
**Location:** `parking-map-enhanced.tsx:1347-1349`

```ts
if (newRotation < 0) newRotation += 360
if (newRotation >= 360) newRotation -= 360
```

**What it does:** Wraps rotation into [0, 360). The two-branch form only handles a single wrap; if `rotateStep` were ever > 360 this would break, but at the current 4°/frame it's safe.

**Correctness:** ⚠️ Works in practice but is fragile. Replaced with `normalizeBearing` which uses modulo arithmetic and handles any magnitude.  
**Extracted to:** `normalizeBearing(deg)`.

---

### 5. Compass CSS rotation (`updateCompassRotation`)
**Location:** `aircraft-sheet.tsx:42-55`

```ts
let delta = (targetRotation - current) % 360
if (delta > 180) delta -= 360
if (delta < -180) delta += 360
const newCumulative = current + delta
compassPlaneRef.current.style.transform = `rotate(${newCumulative - mapRotation - 45}deg)`
```

**What it does:**
- Computes the shortest angular delta (preventing spin-around on e.g. 359° → 1°).
- Accumulates into a cumulative rotation so CSS transitions animate in the correct direction.
- `− mapRotation` converts the true heading to a map-relative visual direction.
- `− 45` corrects for the Lucide `Plane` icon's natural orientation (points upper-right at 0° CSS).

**Convention:** `cumulativeRotationRef.current` is a raw cumulative angle, not normalised; it can exceed 360 intentionally so CSS rotation animates through the correct arc.  
**Correctness:** ✅ Correct. The -45 offset was verified against the Lucide Plane SVG path.  
**Extracted to:** `shortestRotationDelta(from, to)` + `trueHeadingToCssRotation(heading, mapBearing)`.

---

### 6. Compass drag → true heading
**Location:** `aircraft-sheet.tsx:202-214` (mouse drag on compass widget)

```ts
let visualDeg = (Math.atan2(y, x) * 180 / Math.PI) + 90
if (visualDeg < 0) visualDeg += 360
let trueHeading = visualDeg + mapRotation
if (trueHeading < 0) trueHeading += 360
if (trueHeading >= 360) trueHeading -= 360
```

**What it does:** Converts a mouse pointer position (relative to the compass center) into a true geographic heading.
- `atan2(y, x)` → angle from East, CCW in math space (but screen y increases downward, making CW on screen).
- `+ 90` shifts origin from East to North (top of screen), yielding a clockwise-from-top angle.
- `+ mapRotation` converts the map-relative visual angle to a true geographic heading.

**Convention:** `y` and `x` are `clientY − centerY`, `clientX − centerX` in viewport pixels.  
**Correctness:** ✅ Correct. The sign-flip from inverted y cancels with the +90 shift.  
**Extracted to:** `pointerToTrueHeading(pointerX, pointerY, centerX, centerY, mapBearing)`.

---

### 7. Preset heading buttons
**Location:** `aircraft-sheet.tsx:301-351`

```ts
// Left:   270 + mapRotation
// Top:      0 + mapRotation
// Right:   90 + mapRotation
// Bottom: 180 + mapRotation
```

**What it does:** Maps screen directions (left/up/right/down relative to the current map orientation) to true headings by adding the map bearing. "Up on screen" = `mapBearing` degrees true.

**Correctness:** ✅ Correct, but each button had duplicate `if (h >= 360) h -= 360` — fragile for negative values.  
**Extracted to:** `mapDirectionToHeading(visualDir, mapBearing)`.

---

### 8. Flight stacking offset
**Location:** `parking-map-enhanced.tsx:634-638`

```ts
const offsetAngle = (indexAtLocation / aircraftsAtLocation.length) * 2 * Math.PI
const stackRadius = aircraftsAtLocation.length > 1 ? 0.00003 * indexAtLocation : 0
const offsetLng = Math.cos(offsetAngle) * stackRadius
const offsetLat = Math.sin(offsetAngle) * stackRadius
```

**What it does:** Spreads multiple aircraft at the same parking location in a circular fan so icons don't overlap. `stackRadius` grows linearly with index (not all at the same radius), so it's more of a spiral than a circle.

**Correctness:** ⚠️ Minor: the longitude offset isn't corrected for latitude (no `/ Math.cos(latRad)`), so at high latitudes the spread would be non-circular. At MSO (lat ≈ 47°) `cos(47°) ≈ 0.68`, so icons spread ~32% further east/west than north/south. Acceptable for a parking ramp; not extracted (not pure math, inline is fine).

---

## Bugs Found

| # | Severity | Description | Resolution |
|---|----------|-------------|------------|
| 1 | Low | `currentBearing` state initialised to `320` but `INITIAL_BEARING` constant is `40`. These disagreed before DB config loaded. | Fixed: `useState(INITIAL_BEARING)`. |
| 2 | Low | Rotation normalisation used two-branch `if/if` which fails for `|step| > 360`. | Fixed: replaced with `normalizeBearing` (modulo). |
| 3 | Low | Preset heading buttons used `let h = N + mapRotation; if (h >= 360) h -= 360` — negative values not handled. | Fixed: `mapDirectionToHeading` uses `normalizeBearing`. |
| 4 | Low | Map default view was stored in `localStorage` — cleared on browser data wipe, not shared across devices. | Fixed: replaced with `parking_map_configurations` DB table. |
| 5 | Info | `visualRotation` state in `aircraft-sheet.tsx` is set but never read; effectively dead code. | Left in place (not a regression risk). |
| 6 | Info | Flight stacking longitude offset not Mercator-corrected (see §8 above). | Documented; not extracted (acceptable at MSO latitude). |

---

## Functions Extracted to `frontend/lib/parking-math.ts`

| Function | Replaces |
|----------|---------|
| `normalizeBearing(deg)` | Inline `if (r<0) r+=360; if (r>=360) r-=360` in movement loop and preset buttons |
| `shortestRotationDelta(from, to)` | Inline delta logic in `updateCompassRotation` and sheet-open animation |
| `metersPerPixelAtZoom(lat, zoom)` | Base of `getFeetPerPixel` |
| `feetPerPixelAtZoom(lat, zoom)` | `getFeetPerPixel` local function in map component |
| `aircraftMoveDeltas(bearing, stepDeg, lat)` | Inline `mathRad / dLat / dLng` block in `moveAircraft` RAF loop |
| `trueHeadingToCssRotation(heading, mapBearing, iconOffset?)` | `newCumulative - mapRotation - 45` in `updateCompassRotation` and effects |
| `pointerToTrueHeading(pX, pY, cX, cY, mapBearing)` | `atan2` + normalise block in compass `onMouseDown` handler |
| `mapDirectionToHeading(visualDir, mapBearing)` | Per-button `N + mapRotation` arithmetic in four preset buttons |

---

## DB Changes

New table `parking_map_configurations` — see `.omc/sql/parking-migration.sql`.

Replaces the four `localStorage` keys (`fbo_map_center_lat/lng`, `fbo_map_zoom`, `fbo_map_bearing`) with a persisted, per-airport row loaded via TanStack Query on page mount.
