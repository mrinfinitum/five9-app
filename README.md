# Five9 Media — Project Tracker

Next.js 16 app (App Router, Cache Components, Tailwind v4) with Supabase auth and Postgres.
Invite-only email login, a project board (kanban + table), and an admin screen for managing users.

## Features

- **Project board** — Inbox → In Progress → Client Review → On Hold → Completed. Drag cards between columns,
  switch to a table view, search and filter by person, priority, and type, archive finished work.
- **Project details** — status, priority, type, client, dates, team, description, subtasks
  (Not started / Working on it / Stuck / Done), budget and expenses, and a team update feed.
  Each project has a shareable link (`/projects?project=F9-1001`).
- **Invite-only login** — email + password or a one-time email link. Public sign-up is off; only invited people get in.
- **Admin screen** (`/admin`) — invite users, resend invites, set Admin/Member, deactivate, or remove.
  **Preset admins** come from `ADMIN_EMAILS` and are always admins (they can't be demoted or removed in the UI).

## Setup

### 1. Supabase

1. Create a Supabase project.
2. Database tables are created automatically on each production deploy: `npm run build` runs
   [`scripts/migrate.mjs`](scripts/migrate.mjs), which applies any new files in `supabase/migrations/` using
   `POSTGRES_URL_NON_POOLING` (added by the Vercel ↔ Supabase integration). To do it by hand instead, run
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the SQL Editor.
3. **Authentication → Sign In / Providers → Email**: turn **off** “Allow new users to sign up” (invite only).
   Keep the Email provider enabled.
4. **Authentication → URL Configuration**:
   - Site URL: your production URL, e.g. `https://five9-app.vercel.app`
   - Redirect URLs: add `https://five9-app.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`
5. (Recommended) Set up custom SMTP under **Project Settings → Authentication** so invite emails come from your
   own domain and aren't limited by Supabase's built-in email rate limit.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in (same values go in Vercel → Project → Settings → Environment Variables):

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_…`) or legacy anon key |
| `SUPABASE_SECRET_KEY` | Secret key (`sb_secret_…`) or legacy service_role key — **server only** |
| `NEXT_PUBLIC_SITE_URL` | Optional. Your app URL for email links; defaults to the URL the app is visited on |
| `ADMIN_EMAILS` | Comma-separated preset admin emails |

### 3. First admin sign-in

On the login page, a preset admin chooses **Sign in with an email link instead** and enters their email.
If they don't have an account yet, an invite is emailed automatically. They open it, set a password, and land
on the board. (Alternatively run `npm run invite-admins` locally with the keys in `.env.local`.) Everyone else is invited
from **Admin → Invite someone**.

### 4. Run locally

```bash
npm run dev
```

## Deploy to Vercel

1. Import `mrinfinitum/five9-app` in Vercel (framework preset: Next.js).
2. Add the environment variables above.
3. Deploy, then put the production URL into Supabase's Site URL / Redirect URLs (step 1.4).

## Project layout

```
app/(app)/projects   board page + server actions
app/(app)/admin      admin screen + server actions
app/login, app/forgot-password, app/account/set-password, app/auth/*   auth flows
components/projects  board, detail drawer, new-project dialog
lib/auth.ts          current user + admin checks (preset admins from ADMIN_EMAILS)
proxy.ts             refreshes the Supabase session, redirects signed-out visitors
supabase/migrations  database schema + row-level security
```
