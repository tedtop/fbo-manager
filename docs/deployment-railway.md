# Deploying to Railway

This is the runbook for deploying the `frontend/` Next.js app to
[Railway](https://railway.app). It assumes the repo prep described below is
already merged to `master` (`frontend/railway.json`, `frontend/Dockerfile.prod`,
`frontend/.dockerignore`).

**Everything in this document is account-side setup only Ted can do** — it
requires his own Railway account, GitHub authorization, and real secret
values. Nothing here can be automated by an agent.

## Which build path

Two deploy paths are prepared in this repo. Pick one in Railway's service
settings:

- **Default / recommended: Railpack auto-builder.** No Dockerfile involved.
  Railway detects the Node/pnpm project and builds/starts it using the
  commands pinned in `frontend/railway.json` (`pnpm build` / `pnpm start`).
  This is what the steps below assume.
- **Alternative: `frontend/Dockerfile.prod`.** A hand-written multi-stage
  production Dockerfile, kept for parity with the original Docker-on-VPS plan
  in case the Railpack path doesn't work out, or you want to run this image
  outside Railway. To use it instead, set the service's builder to
  "Dockerfile" and point it at `frontend/Dockerfile.prod` (see comments in
  that file — it needs `--build-arg` for each `NEXT_PUBLIC_*` variable, which
  Railway's Dockerfile builder support lets you wire to the same service
  variables you set in step 4 below).

Note on terminology: Railway renamed its default auto-builder from
"Nixpacks" to "Railpack" in 2026. `frontend/railway.json` already specifies
`"builder": "RAILPACK"` — this is the current equivalent of what used to be
called Nixpacks, not a different, unrelated thing.

## The most important thing to understand before you start

Next.js bakes every `NEXT_PUBLIC_*` environment variable into the client-side
JS bundle **at `next build` time**, not at runtime. If a `NEXT_PUBLIC_*`
variable is missing when `pnpm build` runs, the build either fails outright
(confirmed locally — see below) or silently ships `undefined` to the browser.

The good news for the default (Railpack) path: **Railway automatically
exposes every service variable you configure to both the build step and the
running container** — there's nothing extra to configure. You do not need
separate "build-time" vs "runtime" variable groups; setting a variable once
in the dashboard (step 4) covers both.

This is only a manual concern if you use the `Dockerfile.prod` alternative
instead — see the comments at the top of that file.

(Verified locally in this repo: `pnpm build` inside `frontend/` fails with
`@supabase/ssr: Your project's URL and API key are required to create a
Supabase client!` when `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` aren't set, and succeeds cleanly once they
are. Several pages construct a Supabase client during static prerendering, so
this isn't optional.)

## 1. Create the Railway project

1. Go to [railway.app](https://railway.app) and sign in (or create an
   account) with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Authorize Railway's GitHub App for the `tedtop/fbo-manager` repository if
   prompted (grant access to this repo only, not all repos, unless you want
   otherwise).
4. Select `tedtop/fbo-manager` as the repo to deploy.

## 2. Point the service at `frontend/`, not the repo root

This repo is a monorepo with an unrelated, dead `backend/` (Django) directory
next to `frontend/`. Railway must be told the real app lives in `frontend/`:

1. Open the newly created service → **Settings** tab.
2. Under **Source**, set **Root Directory** to `frontend`. This restricts
   which files Railway pulls in for the build to `frontend/` only —
   `backend/` will never be touched or considered.
3. Still in **Settings**, find the **Config-as-code Path** (sometimes labeled
   **Config File Path**) field. Railway config files do **not** follow the
   Root Directory setting automatically — you must give the absolute
   in-repo path explicitly: enter `/frontend/railway.json`.
4. Confirm the **Builder** shown is Railpack (it should auto-detect from
   `railway.json`; if it shows something else, set it to Railpack manually).

## 3. Node version

The repo pins `"engines": { "node": ">=22.0.0" }` in `frontend/package.json`
(added as part of this change) so Railpack picks a Node version consistent
with what CI (`.github/workflows/test.yml`) already tests against (Node 22).
No action needed here — just verify the build logs show a Node 22.x image
being used, and flag it if Railway picked something else.

## 4. Environment variables

In the service → **Variables** tab, add each of the following. Names must
match exactly (case-sensitive). None of these values are recorded anywhere
in this repo — you're pulling each from its own source below.

### Required — public, baked into the client bundle at build time

| Variable | Where to get the value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → your project → **Settings → API** → "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → **Settings → API** → "Project API keys" → `anon` `public` key |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | [Mapbox account](https://account.mapbox.com/access-tokens/) → a public token (used by the parking map) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The public half of a VAPID keypair, if push notifications are wired up (see note below — this may not be needed yet) |
| `NEXT_PUBLIC_SITE_URL` | This app's own public URL, e.g. `https://<your-service>.up.railway.app`, or your custom domain once set (step 6). Used to build the redirect link in user-invite emails (`app/api/users/invite/route.ts`). You won't know this until after step 5's first deploy — set it once Railway assigns a domain, then redeploy. |

### Required — server-only secrets (never expose client-side)

| Variable | Where to get the value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → **Settings → API** → "Project API keys" → `service_role` key. **Secret** — bypasses Row Level Security, treat like a root DB password. |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/) → API Keys. Used for Claude Vision OCR of truck sheets (`app/api/ocr/truck-sheet/route.ts`). |
| `QT_USERNAME` | QT Technologies fuel-dispatch vendor account username |
| `QT_PASSWORD` | QT Technologies fuel-dispatch vendor account password |
| `QT_COMPANY_LOCATION_ID` | QT Technologies vendor portal — your company/location ID |
| `QT_USER_ID` | QT Technologies vendor portal — your user ID |

### Not needed on Railway — skip these

The repo root's `.env.example` lists a few more names for historical/local
reasons; none of them are read by the deployed frontend app (verified by
grepping `process.env.*` usage across `frontend/`):

- `API_URL`, `NEXT_PUBLIC_API_URL`, `DEBUG`, `SECRET_KEY` — Django backend
  only; `backend/` is dead and not deployed.
- `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`,
  `SUPABASE_DB_NAME`, `SUPABASE_DB_PORT` — only used for local Supabase CLI /
  direct-psql schema migration scripts run by hand from a dev machine, never
  by the running app.
- `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, and a non-prefixed `VAPID_PUBLIC_KEY` —
  present in `.env.example` but no current code reads them (no `web-push`
  dependency either). Looks like a leftover from a partial/removed push
  feature. Skip unless you know of an actual use.

## 5. Trigger the first deploy

1. After adding the variables above (`NEXT_PUBLIC_SITE_URL` can wait — see
   below), go to the **Deployments** tab and trigger a deploy (pushing to
   `master`, or the manual **Deploy** button, both work).
2. Watch the build logs. Confirm:
   - Railpack detects Node + pnpm and runs `pnpm build` (per
     `frontend/railway.json`).
   - No `Supabase client` errors during "Generating static pages" — if you
     see one, a `NEXT_PUBLIC_SUPABASE_*` variable is missing or misspelled.
3. Once deployed, open the assigned `*.up.railway.app` URL and confirm the
   login page loads.
4. Go back to Variables, set `NEXT_PUBLIC_SITE_URL` to that URL, and redeploy
   once so invite emails link to the right place.

## 6. Custom domain (optional)

1. Service → **Settings** → **Networking** → **Custom Domain**.
2. Enter your domain, add the CNAME record Railway shows you at your DNS
   provider.
3. Wait for DNS/SSL to provision (Railway shows status inline).
4. Update `NEXT_PUBLIC_SITE_URL` to the custom domain and redeploy.

## Troubleshooting

- **Build fails with a Supabase client error** — a `NEXT_PUBLIC_SUPABASE_*`
  variable is missing/misspelled in the service's Variables tab. Re-check
  step 4.
- **Railway seems to be building `backend/` or picking the wrong
  language/builder** — Root Directory (step 2) isn't set to `frontend`, or
  the Config-as-code Path isn't set to `/frontend/railway.json`.
- **Invite emails link to `undefined/login`** — `NEXT_PUBLIC_SITE_URL` isn't
  set; set it and redeploy (step 5.4).
