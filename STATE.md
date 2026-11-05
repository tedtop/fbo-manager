# STATE

- **Phase:** 3 (build loop, continuous). Branch `feature/flight-board-cleanup`, local commits only, nothing pushed (about 35 ahead of origin).
- **Last loop commits (2026-11-04):** B43 69d6b58/1aecec5/5cbb213, B42 d20f69a/5e4a414, B44 08da286/52ec3f6, B39 ae67bb1/8a74d02/6769c0f, B45a a55bb69/c812de1/b2ca7d4, B18 fe27041/d260717/f50a83b, Tailwind exclusion of `.next-e2e` 28efa3e.
- **Next:** nothing unblocked is left in the loop's lane; see "Waiting on Ted".
- **Review link:** http://localhost:4000/ (`cd frontend && pnpm dev`).

## Lane rule
Ted works the flight add/edit form in another chat. The loop must not touch `flight-form-dialog.tsx`, its tests, or the flight table schema and migrations, and stages only its own files by explicit path. Skipped for that reason: B17, B24, B26a-e, B40, B41, and B45b (writes through the flights repo while the form and schema change).

## Waiting on Ted
- **B43b:** when does an arrival-only flight (no scheduled departure) drop off the board: after an actual departure, a departed/cancelled status, or an age cut-off? B43's overlap rule shows it on every later day. Also fixes the stale Cypress spec "Tomorrow shows only tomorrow's flights".
- **B45 (schedule sheet scan):** needs a sample printout saved under `docs/samples/`, the FBO's time zone, whether aircraft types are ICAO codes or free text, and the sheet's columns (PLAN section 6). B45c is blocked on the sample; B45b waits for the form and schema work to settle.
- **Biome:** clean up the ~60 existing lint errors, or drop Biome? Lint CI (`lint.yml`) stays off until then.
- **CI:** re-enable `test.yml` on pull requests and pushes to `master` after one clean full local run (Cypress on private ports). Deploy gate `typescript.ignoreBuildErrors` stays until a production build is checked with a private dist dir.
- **B27a:** needs approval to add react-markdown, remark-gfm and rehype-slug.
- **B29/B30/B38:** RLS live apply, RLS policies and the admin role need Ted's go-ahead (auth and live data).
- **Not verified:** the full Cypress suites have not been run together since this session's changes (agents ran subsets). The local equipment repo tests fail (`equipment.sort_order` missing) because someone else's uncommitted equipment migration is not applied to the local DB.

## Notes
- Live `flight` table was emptied on 2026-11-04 at Ted's request (146 sample rows; backup in `docs/archive/flight-backup-2026-11-04.json`, untracked).
- B37 parked: the Quick Dev Login buttons stay until a Google login and real accounts exist.
- Test runs use private dist dirs (`NEXT_DIST_DIR=.next-e2e/<name>`) and ports so the owner's `next dev` on :4000 is never touched. `.next` and `.next-e2e` are excluded from Tailwind scanning in `styles/globals.css`.

<!-- usage:start -->
Usage (tokens, excl. cache reads): this session 232k | last 5h 23.62M | budget not set
<!-- usage:end -->
