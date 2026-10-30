# Five9 Media — Request Pipeline

Next.js 16 app (App Router, Cache Components, Tailwind v4) with Supabase auth, Postgres, and storage.
A multi-board request pipeline modelled on the Sales Hub marketing request pipeline, branded for Five9 Media.

## Features

- **Boards** — admins create as many boards as they need (e.g. one per client or team). Each user is given
  access per board as **Team** (works the board) or **Requester** (submits requests and follows their own).
  Admins see every board.
- **Team board** (`/b/<board>`) — Board, Table, and Archive views; Not Started → On Hold → In Progress → In Review
  → Completed (→ Cancelled). Drag cards between columns, quick-edit type/priority/status/assignees from the card,
  right-click menu (open, move to, archive, delete), search and filters ("My tickets", assignee, priority, type),
  sortable table columns, collapsible groups, overdue/due-soon highlighting (On Hold pauses the clock),
  "Archive closed", and shareable links (`?request=F9-1001`).
- **Request details** — editable title/details, status, priority, type (add new categories on the fly), due date,
  change requester, assignees, file attachments (up to 10 × 50 MB), and a conversation with **internal notes**
  and automatic status history.
- **Requester view** — "Tell us what you need" form plus *Your requests* with progress bars, conversation, and
  file uploads.
- **Emails** — new requests and requester replies go to the team inbox (`NOTIFY_EMAILS`, default
  geoff@ and travis@pgamemes.com); requesters get a confirmation, team replies, new files, and a completion
  email with a one-click **satisfaction survey**; assignees get an assignment email.
- **Analytics** (`/b/<board>/analytics`) — requester happiness, completed volume, contributors, turnaround
  (excluding On Hold), on-time rate, completion trend, by-person and by-type breakdowns, recent completions.
- **Admin** (`/admin`) — invite users (with board access), roles, deactivate/remove users; create, rename, and
  delete boards and manage who can see each one. Preset admins come from `ADMIN_EMAILS`.

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
| `NOTIFY_EMAILS` | Optional. Team inbox for new requests (defaults to geoff@ and travis@pgamemes.com) |
| `EMAIL_FROM` | Sender address for notifications |
| `RESEND_API_KEY` *or* `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD` | Email provider — without one, emails are skipped |

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
app/(app)/boards     board picker (home)
app/(app)/b/[slug]   team board or requester view, analytics, server actions
app/(app)/admin      users & boards admin + server actions
app/survey/[token]   public one-click satisfaction survey
app/login, app/forgot-password, app/account/set-password, app/auth/*   auth flows
components/requests  board, request details, requester view, analytics
lib/email            email sending + notification rules
lib/auth.ts          current user + admin checks (preset admins from ADMIN_EMAILS)
proxy.ts             refreshes the Supabase session, redirects signed-out visitors
supabase/migrations  database schema + row-level security
```
