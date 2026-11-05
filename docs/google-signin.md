# Google sign-in and user accounts

How people get an account, and the one-time setup to turn Google sign-in on.

## How it works

1. Someone clicks **Continue with Google** on `/login` (or `/register`). Supabase Auth runs the Google flow and
   returns to `/auth/callback`, which stores the session.
2. A database trigger (`handle_new_auth_user`) creates their `profiles` row from Google's name and email. They have
   **no role**.
3. The middleware asks the database what the person may do (`get_my_access()`) on every page request. No role, a
   role with no modules, or a disabled account means they are held on `/pending`. Nothing else in the app opens.
4. An admin opens **Users**. New sign-ups sit at the top as "Awaiting access" and the **Awaiting access** card counts
   them. Picking a role in the Role column gives access immediately; the person presses **Check again** on the
   waiting page.

## Roles

| Role | Access |
|---|---|
| Administrator | Everything, including Users. For line managers and management. |
| Front Desk | Manage flight operations, invoicing, parking. View fuel farm, equipment, line schedule. |
| Line Department | Manage equipment, fuel farm, truck sheets. View flight board, parking, training, line schedule. |
| Customer | Can sign in, sees no modules yet (customer portal is B25). |

Exact per-module levels are editable at **Users > Roles & Permissions**. Access is checked in the app (middleware and
navigation). Row-level security for the business tables is still the old "any signed-in user" model until B30 lands,
so a signed-in person without a role is blocked by the app, not yet by the database.

Guards: an admin cannot remove their own Administrator role, deactivate or delete themselves, and the last active
Administrator cannot be demoted, deactivated or deleted. A signed-in user cannot change their own status, email or
employee ID (database trigger `guard_profile_columns`).

## One-time setup

### 1. Google Cloud (Ted)

1. <https://console.cloud.google.com/> > pick or create a project > **APIs & Services > OAuth consent screen**.
   User type **External** (customers need to sign in, so Internal is no good). App name, support email, developer
   contact. Scopes: only `openid`, `email`, `profile` (no verification needed). Then **Publish app** so it is "In
   production"; in "Testing" only listed test users can sign in and sessions expire after 7 days.
2. **Credentials > Create credentials > OAuth client ID > Web application**.
   - Authorized JavaScript origins: `https://minuteman.up.railway.app` and `http://localhost:4000`
   - Authorized redirect URIs: `https://qkuhvlrdidhumyyxokil.supabase.co/auth/v1/callback`
     (and `http://127.0.0.1:54321/auth/v1/callback` if you want Google locally)
3. Copy the **Client ID** and **Client secret**.

### 2. Supabase (live project `qkuhvlrdidhumyyxokil`)

- **Authentication > Providers > Google**: enable, paste Client ID and secret.
- **Authentication > URL Configuration**: Site URL `https://minuteman.up.railway.app` (it is
  `http://localhost:3000` today, so invite emails link to the wrong place), and Redirect URLs
  `https://minuteman.up.railway.app/auth/callback` and `http://localhost:4000/auth/callback`.

### 3. Database

Apply migration `20261104001400_google_signin_roles.sql` to live (never `db push`; see the live-DB notes), then
deploy. Do this **before** anyone signs in with the new build, and give yourself the Administrator role first or
you will be held on `/pending` like everyone else.

### 4. Make the first admin

Sign in once with Google so the profile exists, then run
`frontend/scripts/bootstrap-admin-role.sql` with your email (replace `you@example.com`). After that, promote everyone
else from **Users**.

## Local development

Google can be tried locally: export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, set `enabled = true` in `[auth.external.google]` in
`frontend/supabase/config.toml`, restart the stack. Tests do not use Google; they create users through the admin API
(`frontend/cypress/e2e/users/users-access.cy.ts`).

The Quick Dev Login buttons are still on the login page (B37). `admin@minutemanfbo.local` and `user@minutemanfbo.local` need a role
like anyone else or they land on `/pending`; the e2e seed gives them Administrator and Line Department.
