# UX reviewer playbook (the reviewer's own method; edited run over run)

## How to walk a task

1. Read the task in `benchmark.md`, start at its start page, and do it as the persona would: the
   persona knows the ramp, not the code. Count every click/tap/keystroke-field as a step, every
   detour as a wrong turn, every error message or wrong result as an error.
2. Walk it at 1280px first, then at 390px (`resize_window`), then look once in dark theme.
3. Saves only on the local stack (port 4520, local Supabase). Seed what the task needs (planes,
   areas) with the Cypress task helpers from a scratchpad script, and remove it afterwards.
4. Verify the outcome in the DB (for example `parkingTasks.getParkedPose`), not only on screen.
5. Write the steps down while walking. Score = steps + 3*wrong turns + 5*errors + 10*not done.

## Heuristics checked on every task

- Visibility of status: is the selection, saving or loading visible? Is the map blank while it loads?
- Match to the ramp's words: tail, tow, hangar pull, DPI, QT; ICAO type codes as dispatch writes them.
- Error prevention: destructive buttons apart from safe ones, confirm or undo.
- Recognition over recall: search where people look; no retyping what was already typed.
- Phone, gloves, sunlight: targets at least 44px (56px for gloves), no keyboard-only paths, drawers
  that keep the thing being edited visible.
- Speed for repeat work: autofocus, Enter submits, deep links (`?tail=`).
- Parking "video game" movement (Ted 2026-11-13): instant response, smooth hold-repeat, sensible
  step, visible selection, keys not stolen by page scroll, easy undo.

- Cold walk first (2026-11-13 run 2, provisional): walk each task as the persona with no code
  read, scoring as you go; read the code only afterwards to explain each friction point. Layout
  problems that only show up in a real viewport (map squeezed by drawers and footers) show up this
  way; reading the code first anchors on handlers and misses them.
- Production first at real data scale (2026-11-14 run 3, provisional): walk every look-only step on
  production before the local stack. Prod has 26 planes in 5 areas; a 3-plane local seed hides
  framing, label-collision and "where is everything" problems. Count visible vs total markers
  (`.maplibregl-marker` rects vs the canvas rect) at both widths.
- Measure layout on the phone with `getBoundingClientRect` (map canvas height, button sizes,
  `scrollHeight` vs `innerHeight`) in every mode the page has, not only the default mode.

## Ted's answers

(none yet; questions open: FBO-204 arrow-key feel, 2026-11-13; no comments as of 2026-11-14 run 4)

## Lessons learned

- 2026-11-13: the built-in browser pane may be hidden; then `requestAnimationFrame` runs at about
  2 fps and any timing-based behaviour (hold-to-move speed, tap distance) cannot be measured. Check
  `tabs_context` first; if hidden, judge speed from the constants in code and test only outcomes
  (moved / undone / saved).
- 2026-11-13: the browser tool's `key` press sends keydown and keyup in the same frame, so a
  single "tap" does not move a plane at all; hold with dispatched KeyboardEvents (keydown, wait,
  keyup) from `javascript_tool` instead.
- 2026-11-13 (run 2): while the pane is hidden, screenshots lag a few seconds behind the page. A
  click made from a stale screenshot can toggle a dialog closed, and then Tab/Enter go to the nav
  logo (once it sent me to Flight Ops). That's the harness, not the app. Read state with
  `javascript_tool` (dialog present, activeElement, DB row) before each next step, and click by `ref`.
- 2026-11-13 (run 2): `next dev` only reads `.env.local` for vars that aren't already set, so
  exporting all four Supabase vars (local demo keys from `cypress/tasks/env.ts`) safely points the
  :4520 server at the local stack.
- 2026-11-14 (run 3): on production, a drawer can slide in between a screenshot and the next click,
  so a coordinate click can land on drawer content (my "zoom out" clicks hit the plane drawer; the
  compass was 46px away). Before any coordinate click on prod, check `document.elementFromPoint`
  and keep clicks well clear of the compass rose and the drawer buttons.
- 2026-11-14 (run 3): re-read the size code before re-reporting a size issue; B101 changed the
  fallback (E75L now goes to the mid-jet nominal, not a single), and an old finding's wording went stale.
- 2026-11-14 (run 4): the pane can turn hidden mid-run while `document.visibilityState` still says
  "visible"; the map then stops drawing markers (looked like a 30 s+ load). Only `tabs_context`
  tells the truth: call it right before any timing or load measurement, and discard timings taken
  while hidden.
- 2026-11-14 (run 4): the drawer's role=dialog exists before the screenshot shows it; read the
  dialog text with `javascript_tool` rather than waiting for the picture.
- 2026-11-13: the local map takes 8-15 s to show on first dev compile; wait before judging.
- 2026-11-13: `next dev` adds its dist dir to `frontend/tsconfig.json` include; revert those
  lines in the main checkout after stopping the server.

## Experiment log (one method change per run)

| Run | Change tried | Kept? | Why |
|-----|--------------|-------|-----|
| 2026-11-14 run 4 | Verify-the-shipped-fix: turn each B57 claim (min icon size, contrast, heading undo, toasts, dark sheet) into a falsifiable check at prod scale before walking | reverted | Every B57 claim held (icons true-scale at ramp zoom, 36px floor only when zoomed out; undo present; sheet dark), so it produced no findings; the two new findings (FBO-211 door, FBO-212 labels) came from the ordinary cold walk. B57's own verifier already covers this |
| 2026-11-14 run 3 | Production first at real data scale, local only for saves | kept (provisional) | Found FBO-208 (2 of 26 planes visible on a phone) and FBO-209 (drawer covers zoom), neither visible with a 3-plane local seed; still no Ted decisions on FBO-200..207 to judge accept rate |
| 2026-11-13 run 2 | Cold walk first, code only afterwards; measure layout in every mode at 390px | kept (provisional) | Found the 63px Config Mode map (FBO-206), which code-first reading missed in run 1, plus the missing draw-rectangle path (FBO-207). No Ted decisions yet on FBO-200..204, so the accept rate can't be judged |
| 2026-11-13 | Baseline method + "read the module's input handlers and constants before walking, then probe the edges they imply" (found the E75L size gap and the tap/hold behaviour fast) | kept (provisional) | First run, no prior score; judge on Ted's accept rate for FBO-200..203 |
