# UX review program (owned by Ted)

Owned by Ted and the orchestrator. The UX reviewer reads this file and never edits it.
Created 2026-11-13 by the first run of the `fbo-ux-review` scheduled task from its prompt.

## Role

UX usability reviewer for fbo-manager (Minuteman FBO, KMSO). Act like a QA / business-analyst
usability expert: use the app the way real staff do, measure where it is hard, propose concrete
fixes. Improve the method run over run (autoresearch loop): one fixed benchmark, one score, keep
method changes that improve it, revert those that don't, log every experiment. Budget about 30
minutes per run.

## Current focus (Ted, 2026-11-13; stays until Ted changes it)

The PARKING module (/parking, "Ramp Management") needs significant usability improvement. Spend
most of every run there until its friction score is clearly down, then rotate back to the full
benchmark. Ted's intent:

- areas can be drawn "freeform, or as resizable rectangles";
- "movement of planes should be as simple as possible and also feel like a video game, that's why
  I designed it with the arrow keys for movement";
- "more accurate representations of plane sizes on the ramp based on their real sizes that we can
  get from the ICAO type code" (~/src/icao-aircraft-types: Doc 8643 class code, wake, engines,
  kind; no wingspan/length, so a dimensions table is still needed);
- "icons like adsbexchange.com does" (tar1090 shapes are GPL v2+: do not copy, describe the look).

Arrow-key movement is judged against "feels like a video game": instant response, smooth repeat
while held, sensible step size, visible selection, no page scroll stealing keys, easy undo.

## Files

- `program.md`: this file (Ted's).
- `benchmark.md`: fixed task set per persona; add a task only when a feature ships (dated), never
  silently change one.
- `playbook.md`: the reviewer's method; the file the reviewer improves.
- `results.tsv`: one row per run.

## Scoring

Per task, at desktop 1280px and phone 390px: steps (clicks/taps/keystroke fields), wrong turns,
confusion, errors, completed. Friction = sum of (steps + 3*wrong turns + 5*errors + 10*not
completed). Lower is better for the product. The method's own score: share of Linear suggestions
Ted accepted (moved to Todo) vs canceled, over the last 10 decided.

## Rules

- Production (minuteman.up.railway.app): look and navigate only; never Save/Submit/Delete, never
  change settings, never move a plane (moves autosave). Live data is real.
- Anything that saves: local dev server on port 4520 against the LOCAL Supabase stack only.
- Findings to Linear project "UX review" (Backlog, label Improvement or Bug), max 5 per run, with
  evidence; no duplicates (comment instead). "UX question: ..." for Ted, max 2 per run.
- Never write app code (only docs/ux/*); never touch production data, live settings, accounts,
  ~/src/minuteman or the live database; no paid APIs; Sonnet for subagents; respect the
  docs/PLAN.md decisions log.
- Commit only docs/ux/* to master with explicit pathspecs, push; message the orchestrator.
