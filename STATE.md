# STATE

- **Phase:** 3, continuous build loop run by the **FBO Orchestrator** session (since 2026-11-09). Plan: `~/.claude/plans/how-should-we-go-stateless-toast.md`. Rules: `.claude/CLAUDE.md` "Orchestrator".
- **Trunk:** `master` (auto-deploys prod, https://minuteman.up.railway.app). Main checkout stays on `master`; all code is written in child worktrees.
- **Milestones:** M0 consolidate, M1 board + form, M2 logins + security, M3 fuel ops parity, M4 parking/equipment/docs (BACKLOG "Milestones to v1"; Linear projects of the same names).
- **Heartbeat:** hourly cron at :17 in the orchestrator session (session-only, 7-day expiry; re-create on resume).

## Sessions
| Child | Branch | Items | State |
|---|---|---|---|
| (lane: schema/migrations) | `feature/b87-meter-gaps` (from `origin/feature/fuel-meter-readings` 973e4d9) | B87, B91, B46 | queued: start from the desktop app (cannot start over Remote Control) |
| (lane: flight form) | `feature/b40-flight-form` | B26e form fix, B40, B41 | queued |
| (lane: truck sheets) | `feature/b80-truck-sheet-dpi` | B80 | queued |

Consolidation 2026-11-09: 11 sessions finalized and merged; 6 archived by the orchestrator. Still to archive from the sidebar (Remote Control/queued work blocked it): Fuel Dispatch module integration, Truck sheet scanner, Mobile viewport fixes, Parking areas, Line schedule update, Record fuel sheet meters. Google sign-in and user manager has not reported yet. Minuteman `feature/wing-loading` stays open (B92).

## Waiting on Ted
- **B120 live migration (2026-11-13 hourly build):** `feature/b120-fuel-order-status` (6433ef7) is built and verified (tsc clean, 48 pure tests; DB-backed repo/service tests passed on the builder's throwaway stack, not re-run by the verifier). Before merging: backup, spot-check `select progress, count(*) from fuel_transaction` and `select fuel_type, count(*)` (values outside jet_a/jet_a_plus/avgas abort the migration), then apply `supabase/migrations/20261113000100_fuel_order_status.sql` with `db query --linked -f` + `migration repair`. B121/B122/B127/B129/B130 build on it.
- **B68 live migration (2026-11-13 hourly build):** `feature/b68-fuelers-as-users` (68bb911) is built and verified (tsc clean, 24 vitest; migration, rollback and re-apply run on the LOCAL stack, partial unique index checked). Apply `frontend/supabase/migrations/20261113000200_profile_initials_fueler_user.sql` (adds `profiles.initials` unique among active users, `truck_sheets.fueler_user_id`) with `db query --linked -f` + `migration repair`, then merge. Independent of B120 (order free). After it is live, set initials (TT, TS, KG...) on the real users in the user manager; until then scans show initials as unresolved with a picker. Not done in B68: dispatch assignment (needs B122's `fuel_order_fueler`), the resolved name on truck-sheet detail/list pages, dropping `fueler`.
- **B123 live migration (2026-11-13 hourly build):** `feature/b123-charge-list-schema` (2b9b884) is built and verified (tsc clean, 42 repo tests; migration, rollback and re-apply run on the LOCAL stack). Back up `invoices` and `invoice_line_items`, then apply `frontend/supabase/migrations/20261113000300_charge_list_schema.sql` with `db query --linked -f` + `migration repair`, then merge. Independent of B120/B68. Existing invoices become `kind='legacy'`. Must be live before B124/B125 merge. Left for B124/B125: other screens still print `#<invoice_number>` (would show "#null" for unnumbered lists, none exist yet); Relationships entries for the new `service_id`/`keyed_in_by` FKs in `types/database.ts`.
- **B19c merged (2026-11-13 hourly build):** mobile viewport audit, 24c8c54. Layout `vh`/`h-screen` moved to `dvh`; every dialog capped at the viewport height with internal scroll; equipment/users/parking/line-schedule headers wrap at 375px (equipment was 493px wide); nav and board toolbar buttons 44px on phones (desktop unchanged via `sm:`). New Cypress `cypress/e2e/mobile/viewport-audit.cy.ts` (30/30, 11 routes at 375 and 390). Verifier PASS. Check on your phone: board toolbar, Add Flight sheet scrolls, equipment and users pages have no sideways scroll. Not covered: in-page buttons outside nav/board toolbar not resized; Add Shift dialog not exercised (no department seeded locally). `flight-services.cy.ts` and `tail-prefix.cy.ts` flake intermittently (not caused by B19c; B103 covers tail-prefix).
- **B17 merged (2026-11-13 hourly build):** new flights are attributed to the signed-in user (auth email matched to `users.email`); the card shows their initials/name, rows without a creator show `--`. Check on prod: create a flight, the card badge shows your initials. Logins with no `users` row of the same email still fall back to user 1, so check that real accounts have matching `users.email` rows (match is case-sensitive). BACKLOG B49/B50 rows still say todo but their code is on master (edc0c24, 25e6899); orchestrator to reconcile.
- **Look on prod (phone):** mobile toolbar + login (B19b); Fuel Farm (B84); `/parking` hard refresh, seeded plane positions, N509CQ shows airborne (B54/B55); tail lookup spinner + hover card (B60); QT airline cards + wing loading (B93); a real truck-sheet scan (B69).
- **Answers:** TKS price per gallon and ramp fees per class (B51/B52); real DPI replace limit (15 psi placeholder) and whether 5282 "5/32" = DPI 5 / nozzle 32 (B71); 8338 dead-battery open item; N33PX type = C560; B27 docs design answers + react-markdown approval (B27a); Google emails for Chris Hart, Keith Leathers, Kelby Grussling, Dakota Mamuzich, Ted (B76).
- **Go-aheads:** Minuteman wing-loading merge/deploy (B92); B26e column drop after the form fix; flight in the live realtime publication (B16); RLS + admin role live (B29/B30/B38); Google OAuth client for B59a; Google Map Tiles key (B58).
- **Unmerged branches the app would not force-delete** (worktrees already removed; delete with `git branch -D` if wanted): feature/parking-areas, feature/parking (tag archive/parking-old), feature/invoicing, feature/playwright-testing (tag archive/playwright-testing), wip/parking-chip, chore/renumber-scan-migrations; remote feature/board-cleanup-no-auth, docs/b60-lookup-status. Open PRs: #39 (decide under M3), #35 (close; B48).

## Notes
- Live `flight` table was emptied 2026-11-04 at Ted's request (backups in ~/backups/fbo-manager/).
- Test runs use private dist dirs (`NEXT_DIST_DIR=.next-e2e/<name>`) and ports, never :4000.

<!-- usage:start -->
Usage (tokens, excl. cache reads): this session 81k | last 5h 30.88M | budget not set
<!-- usage:end -->
