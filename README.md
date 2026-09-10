# Website Monitor (Supabase edition)

A self-hosted uptime monitoring system: checks your websites on a
schedule, tracks incidents, and emails you via Brevo when something goes
down (and again when it recovers) — without spamming your inbox while it
stays down.

```
Administrator → React dashboard → Supabase Auth + Postgres (direct via PostgREST)
                        │                          │
                        │                          ├── Edge Function: check-now / send-test-email
                        │                          └── Edge Function: scheduled-monitor
                        │                                     ▲
                        │                                     │
                        └──────────────────  external cron ping (every 1-5 min)
                                                                │
                                                                ▼
                                                          Brevo API → your inbox
```

This app has moved through three backends during development - a plain
Node/Express server, then Firebase, now Supabase. Each version is a
genuine rewrite for its platform, not a shim over the last one - this
README describes the Supabase version as it actually is.

## Stack & the choices behind it

- **Database:** Supabase Postgres — real foreign keys, `ON DELETE CASCADE`,
  and (unlike the NoSQL version this app briefly went through) genuine SQL
  aggregates for uptime % and average response time, computed in the
  database instead of client-side workarounds
- **Backend logic:** Supabase Edge Functions (Deno) — one function for
  on-demand checks, one for test emails, one for the scheduled monitor
- **Auth:** Supabase Auth (email/password) — no sign-up screen; you create
  the one admin account yourself (`npm run create-admin`)
- **Email:** [Brevo](https://brevo.com)'s transactional email REST API,
  called directly from the Edge Function - no SMTP library needed
- **Scheduling:** an **external** cron service (cron-job.org, free) pings
  the `scheduled-monitor` function on a schedule - deliberately not
  Postgres's own `pg_cron`. See [why](#why-an-external-cron-service-not-pg_cron) below.
- **Frontend:** React + Vite, Tailwind CSS, Recharts — talks to Postgres
  directly via PostgREST (`@supabase/supabase-js`), no REST API layer of
  our own to maintain

### Why an external cron service, not pg_cron

Supabase's free tier pauses a project after 7 days with no genuine
external API activity. Postgres's own `pg_cron` (calling out via
`pg_net`) runs *inside* the database - it's not clearly established
whether that counts as the kind of external activity that prevents the
pause. Rather than build on that uncertainty, `scheduled-monitor` is
designed to be triggered by a real external HTTP request instead: one
mechanism that both runs the checks *and* unambiguously counts as genuine
API usage, so the project can't quietly go to sleep a week after you last
opened the dashboard. See [Set up the monitoring schedule](#6-set-up-the-monitoring-schedule) below.

## Cost: realistic numbers, not just "it's free"

You said you want to stay on free tiers as much as possible. Here's the
honest picture:

**No credit card required for Supabase's free tier** (unlike Firebase's
Blaze plan, which requires one even to stay at $0). The real constraints
are usage caps and the 7-day inactivity pause, which the external-cron
design above sidesteps as a side effect of how the monitor already works.

For a small deployment (**5 monitored sites, checked every 5 minutes**):

| Resource | Free quota | This app's usage | Result |
|---|---|---|---|
| Database storage | 500 MB | A few MB/month of check history (see [cleanup_old_checks](#maintenance-trimming-old-check-history)) | **$0** |
| Edge Function invocations | 500,000/month | ~10,000-45,000/month depending on your cron interval | **$0** |
| Database egress | 5 GB/month | Dashboard + detail-page traffic for personal/small-team use is a small fraction of this | **$0** |
| Brevo emails | 300/day | Only sent on actual DOWN/RECOVERY transitions - realistically a handful a day at most | **$0** |
| cron-job.org | Free, unlimited jobs down to 1/minute | 1 job | **$0** |

Realistically: **$0/month**. Where it could start costing something:
monitoring dozens of sites very frequently, or database egress from heavy
dashboard traffic. Supabase's dashboard shows current usage against your
quotas at a glance if you want to keep an eye on it.

## Project layout

```
supabase/
  migrations/                  SQL: schema, RLS policies, dashboard/analytics functions, cleanup function
  functions/
    _shared/
      checkService.ts           performs one HTTP check (ported from the Node version)
      statusEngine.ts            the DOWN/RECOVERY state machine (pure function, unchanged across every rewrite)
      ssrfGuard.ts                blocks monitoring targets on private/internal networks
      incidentService.ts          Postgres-backed orchestration: check -> state machine -> incident -> email
      emailService.ts              Brevo REST API calls
    scheduled-monitor/           triggered by external cron - checks whichever sites are due
    check-now/                    powers the "Check now" button
    send-test-email/               powers the Settings page's test-email button
  config.toml                    Supabase CLI project config (incl. per-function verify_jwt)
frontend/
  src/
    pages/                       Dashboard, Websites, WebsiteDetails, Incidents, Analytics, Settings, Login
    components/                   shared UI (StatusBadge, PulseStrip, Sidebar, etc.)
    context/                       Auth (Supabase Auth), Theme, Toast
    api/client.js                  PostgREST queries + RPC calls + Edge Function invocations, exposing `api.xxx()`
    supabase.js                     Supabase client initialization
tests/                          vitest - the shared logic, run under Node (see "Running the tests")
scripts/create-admin.js         one-time script to create your admin account
vercel.json                     tells Vercel how to build frontend/ and serves the SPA fallback (see "Deploy to GitHub + Vercel")
```

## How the DOWN / RECOVERY logic works

Unchanged across every rewrite of this app - every check runs through a
small pure state machine (`supabase/functions/_shared/statusEngine.ts`):

```
NORMAL → (failure) → FAILURE DETECTED → (threshold reached) → CONFIRMED DOWN
   ↑                                                                │
   └──────────────── RECOVERED ←──────────── (success) ─────────────┘
```

One DOWN email per incident, silence while it stays down, one RECOVERY
email when it comes back. A unique partial index in the schema
(`incidents_one_active_per_website`) enforces "at most one active incident
per site" at the database level too - a backstop under the application
logic, not just trust in it. `tests/incidentFlow.test.ts` proves the whole
thing end to end against a small in-memory Postgres-shaped fake.

## Prerequisites

- Node.js 18.17+ (Node 20 or 22 recommended)
- npm 9+
- A free [Supabase](https://supabase.com) account and a free
  [Brevo](https://brevo.com) account
- A free [cron-job.org](https://cron-job.org) account (or any HTTP-capable
  scheduler you prefer - GitHub Actions' `schedule` trigger works too, just
  with a looser minimum interval in practice)

No credit card needed anywhere in this stack at this scale.

## Setup

A note before you start: every step below tells you the exact menu path
and what you're looking for, plus how to tell it worked before moving on.
If something doesn't match what you see on screen, dashboards change their
wording occasionally — the goal (get a URL, get a key, paste it somewhere)
stays the same even if a button gets renamed.

**A heads-up on Supabase's key names specifically:** Supabase is in the
middle of renaming its API keys during 2026 — the old names `anon` and
`service_role` are being replaced by `publishable` and `secret`. Both
names work with this app right now. Depending on exactly when you read
this, your dashboard might show either pair. Step 2 below tells you
which one to grab either way.

Where each thing lives, at a glance:

| What | Where |
|---|---|
| Supabase project URL + keys | supabase.com dashboard → your project → **Connect** button |
| Supabase SQL Editor | supabase.com dashboard → your project → left sidebar → **SQL Editor** |
| Brevo API key | app.brevo.com → your name/account (top right) → **Settings** → **SMTP & API** → **API Keys & MCP** tab |
| Brevo sender verification | app.brevo.com → **Settings** → **Senders, Domains & Dedicated IPs** |
| cron-job.org job setup | console.cron-job.org → **CREATE CRONJOB** → **Method and Headers** tab |

### 1. Create the Supabase project

1. Go to **[supabase.com](https://supabase.com)** and sign up or log in (GitHub login is the fastest option).
2. Click **New project** (if this is your first project, you may need to create an "Organization" first — accept the defaults, it's just a container for your projects, name it anything).
3. Fill in the form:
   - **Name:** anything, e.g. `uptime-monitor`
   - **Database Password:** click **Generate a password**, then copy it somewhere safe (a notes app, a password manager — you likely won't need it directly for this app, but you don't want to lose it)
   - **Region:** pick whichever is closest to you
4. Click **Create new project**. This takes 1-2 minutes — you'll land on the project's dashboard automatically once it's ready.

**✅ You'll know this worked when:** you see your project's dashboard, with a left sidebar showing icons for Table Editor, SQL Editor, Database, Authentication, Storage, and so on.

### 2. Get your project URL and keys

1. Still on your project's dashboard, look for a green **Connect** button — it's usually near the top of the page, sometimes next to the project name.
2. Click it. A dialog opens with several tabs (App Frameworks, ORMs, etc.) — you don't need any of those; look for the section showing your **Project URL** and your **API Keys** directly in this dialog (or click through to **App Frameworks** if it's not immediately visible — the URL and keys are shown there too).
3. If you can't find keys in the Connect dialog, use this direct path instead: left sidebar → the gear icon (⚙) at the very bottom, labeled **Project Settings** → **API Keys** (or just **API** on older dashboards).
4. Copy three things into a scratch note somewhere (a text file, whatever's handy — you'll paste each into a specific place in the next few steps):
   - **Project URL** — looks like `https://abcdefghijklmnop.supabase.co`
   - **anon** key (may be labeled **publishable**) — a long string, this one is safe to put in the frontend
   - **service_role** key (may be labeled **secret**) — a long string, this one is powerful and must stay out of the frontend — you'll only use it once, in Step 5

**✅ You'll know this worked when:** you have three values copied — a URL starting with `https://` and ending in `.supabase.co`, and two long key strings that look different from each other.

### 3. Set up Brevo

1. Go to **[brevo.com](https://brevo.com)** and sign up for a free account (or log in).
2. Verify the email address you want alerts to come *from*:
   - Click your account name/icon (top right) → **Settings**
   - In the left-hand Settings menu, click **Senders, Domains & Dedicated IPs**
   - Click **Add a sender**, enter the email address you want DOWN/RECOVERY alerts to come from (e.g. `alerts@yourdomain.com`, or even a personal Gmail address works for testing)
   - Brevo emails that address a verification link — open your inbox for that address and click it
3. Generate your API key:
   - Still under **Settings**, click **SMTP & API**
   - Click the **API Keys & MCP** tab
   - Click **Generate a new API key**
   - Name it anything (e.g. `uptime-monitor`)
   - For **expiry**, choose **No expiration** (or a long one) — a short expiry will silently break your email alerts later when it lapses
   - Click **Generate**
   - **Copy the key immediately** — it's shown once and starts with `xkeysib-`. Add it to the same scratch note from Step 2.

**✅ You'll know this worked when:** you have a verified sender email (green checkmark next to it in the Senders list) and an API key string starting with `xkeysib-`.

### 4. Deploy the database and Edge Functions

This step uses your terminal (Terminal on Mac, PowerShell or Command Prompt on Windows, or the built-in terminal in VS Code if you have it — any of these work). All commands below run from the project's root folder (the one containing this README).

1. Install dependencies:
   ```bash
   npm install
   ```
   This installs the root tools, including the Supabase CLI, and the frontend's dependencies together. First run can take a couple of minutes — most of that time is the Supabase CLI downloading itself, not a stuck process.

2. Log in to the Supabase CLI (opens your browser once to confirm):
   ```bash
   npx supabase login
   ```

3. Link this project folder to your actual Supabase project. You need your **project ref** — this is the subdomain part of your Project URL from Step 2 (if your URL is `https://abcdefghijklmnop.supabase.co`, your project ref is `abcdefghijklmnop`):
   ```bash
   npx supabase link --project-ref abcdefghijklmnop
   ```
   (Replace `abcdefghijklmnop` with your actual project ref.) It may ask for the database password from Step 1 — paste it in.

4. Push the database schema:
   ```bash
   npm run db:push
   ```
   This runs everything in `supabase/migrations/` against your real database — creates the `websites`, `checks`, `incidents`, and `settings` tables, the security policies, and the SQL functions the dashboard uses.

   **✅ You'll know this worked when:** the terminal prints something like `Applying migration 20260101000001_initial_schema.sql...` for each of the three migration files, ending without an error. You can double check by going to your Supabase dashboard → left sidebar → **Table Editor** — you should see `websites`, `checks`, `incidents`, and `settings` listed.

5. Set your secrets (these are read by the Edge Functions — they never touch the frontend or get stored in the database):
   ```bash
   npx supabase secrets set BREVO_API_KEY=xkeysib-your-actual-key-here
   npx supabase secrets set BREVO_FROM_EMAIL=the-address-you-verified@yourdomain.com
   npx supabase secrets set BREVO_FROM_NAME="Website Monitor"
   ```
   Then generate and set a random secret the monitoring schedule will use (Step 6 needs this exact value, so the command below also prints it for you to copy):
   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
   Copy what that prints, then:
   ```bash
   npx supabase secrets set CRON_SECRET=paste-the-value-you-just-copied-here
   ```

   *(Prefer clicking through a form instead of typing commands? You can set these same four secrets from the dashboard instead: left sidebar → **Edge Functions** → **Secrets** tab → **Add new secret**, once for each of the four names above.)*

6. Deploy the three functions:
   ```bash
   npm run functions:deploy
   ```

   **✅ You'll know this worked when:** the terminal shows `Deployed Functions on project abcdefghijklmnop` (or similar) three times, once per function. On your dashboard, left sidebar → **Edge Functions** should now list `check-now`, `send-test-email`, and `scheduled-monitor`.

### 5. Create your admin account

There's no sign-up screen in this app on purpose — you create the one account that can log in.

1. Open a terminal in the project's root folder (the one with `README.md` and `package.json` in it).
2. Have three things ready: your **Project URL** and **service_role**/**secret** key from Step 2, and an email + password you'll use to log into the app (the email doesn't need to be reachable — nothing gets sent to it — but the password needs to be **8 characters minimum**).
3. Run the command below, replacing the placeholder values with your own. Pick the version matching your terminal — the syntax for setting environment variables differs by shell:

   **Mac/Linux terminal, or Git Bash on Windows:**
   ```bash
   SUPABASE_URL=https://abcdefghijklmnop.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=paste-your-service-role-or-secret-key-here \
   npm run create-admin -- you@example.com "a-strong-password"
   ```

   **Windows PowerShell:**
   ```powershell
   $env:SUPABASE_URL="https://abcdefghijklmnop.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY="paste-your-service-role-or-secret-key-here"
   npm run create-admin -- you@example.com "a-strong-password"
   ```

   **Windows Command Prompt (cmd.exe):**
   ```cmd
   set SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   set SUPABASE_SERVICE_ROLE_KEY=paste-your-service-role-or-secret-key-here
   npm run create-admin -- you@example.com "a-strong-password"
   ```

   The `--` before your email isn't a typo — it tells npm "everything after this belongs to the script." Keep the quotes around the password exactly as shown, especially if it has spaces or symbols.

**✅ You'll know this worked when:** the terminal prints `Created administrator account: you@example.com (id: ...)`. Re-running the same command later with a different password updates it instead of erroring, so this doubles as a "reset my password" tool if you ever need one. You can also confirm visually in the Supabase dashboard under **Authentication → Users**.

**If something goes wrong:**

| You see | It means |
|---|---|
| `npm error Missing script: "create-admin"` | You're not in the project root folder — `cd` back to where `package.json` lives |
| `Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables` | The env vars didn't get set — on PowerShell, double-check you used `$env:NAME=` and not just `NAME=` |
| `Password must be at least 8 characters` | Pick a longer password |
| An error mentioning permissions or JWT | You likely pasted the **anon/publishable** key by mistake — go back and copy the *other* one (service_role/secret) |

### 6. Set up the monitoring schedule

1. Go to **[console.cron-job.org](https://console.cron-job.org)** and create a free account.
2. Click **CREATE CRONJOB**.
3. On the first tab (usually called **Common**), fill in:
   - **Title:** anything, e.g. `uptime-monitor scheduler`
   - **URL:** `https://abcdefghijklmnop.supabase.co/functions/v1/scheduled-monitor` (use your own project ref)
   - **Schedule:** every 1-5 minutes, your choice — this controls how often the app *checks what's due*, not how often every site gets checked (each site's own interval, set on its Add/Edit form in the app, still governs that separately)
4. Click the **Method and Headers** tab (or **Advanced**, depending on the current layout):
   - **Request method:** change from GET to **POST**
   - Under custom headers, add one: name `x-cron-secret`, value = the `CRON_SECRET` you generated earlier in Step 4
5. Click **CREATE** (or **Save**) to save the job.
6. Find your new job in the list and use its **Execute now** / **Run now** option to trigger it immediately rather than waiting for the schedule.

**✅ You'll know this worked when:** the execution history for that job shows a `200` response with a small body like `{"checked":0,"total_enabled":0}` (0 is expected — you haven't added any websites yet). If you see a `401` or `403` instead, double-check the header name is exactly `x-cron-secret` and the value exactly matches what you set with `supabase secrets set CRON_SECRET=...` in Step 4.

This single scheduled ping is also what keeps the free-tier project from auto-pausing — see [why](#why-an-external-cron-service-not-pg_cron) above.

### 7. Configure and run the frontend

1. Create your local environment file from the template:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
2. Open `frontend/.env` in any text editor and fill in the two values from Step 2:
   ```
   VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key-here
   ```
   (Use the **anon**/**publishable** key here — never the service_role/secret one.)
3. Start it:
   ```bash
   npm run dev:frontend-only
   ```
4. Open **[http://localhost:5173](http://localhost:5173)** in your browser and log in with the admin account from Step 5.

**✅ You'll know this worked when:** you see the login page, and after logging in, an empty Dashboard (no websites yet — that's expected).

**To put this online instead of just running it on your own machine**, see [Deploy to GitHub + Vercel](#deploy-to-github--vercel) below.

## Deploy to GitHub + Vercel

Optional, but this is how you get a real URL instead of just `localhost`.

### Publish to GitHub

1. Check Git is installed: `git --version` in a terminal. No version number? Install it from [git-scm.com](https://git-scm.com/downloads) first.
2. Create a free account at [github.com](https://github.com) if you don't have one.
3. Go to **[github.com/new](https://github.com/new)**. Name it anything (e.g. `uptime-monitor`), choose Public or Private, and **leave "Add a README file," "Add .gitignore," and "Choose a license" all unchecked** — this project already has those, and checking them causes conflicts in a moment. Click **Create repository**. Keep the page open — you'll need the URL it shows you (`https://github.com/your-username/uptime-monitor.git`) in a moment.
4. In a terminal, in this project's root folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```
   `.gitignore` already excludes `node_modules/`, `.env` files, and build output, so nothing sensitive gets committed.
5. Connect it to GitHub and push (replace the URL with your own from step 3):
   ```bash
   git branch -M main
   git remote add origin https://github.com/your-username/uptime-monitor.git
   git push -u origin main
   ```
   GitHub will prompt for a password here but no longer accepts your actual account password — it wants a **Personal Access Token** instead. Get one at [github.com/settings/tokens/new](https://github.com/settings/tokens/new): name it anything, check the **repo** scope, click **Generate token**, and paste the string it shows you (once — it won't be shown again) when `git push` asks for a password.

   *(Prefer a point-and-click app instead of tokens? [GitHub Desktop](https://desktop.github.com) handles steps 4-5 with a "Publish repository" button.)*

**✅ You'll know this worked when:** refreshing your repository's page on GitHub shows your project files instead of the empty setup page.

### Deploy to Vercel

1. Create a free account at **[vercel.com](https://vercel.com)** — **Sign Up** → **Continue with GitHub** (this also grants Vercel access to your repos).
2. On your Vercel dashboard: **Add New...** → **Project** → find your repo → **Import**.
3. **Leave "Root Directory" at its default** (blank / repo root) — don't change it. This repo has both a frontend and a backend folder in it, but rather than pointing Vercel at the `frontend` subfolder via a dashboard setting (easy to forget, and the build fails in a confusing way if you do), the root-level `vercel.json` in this project already tells Vercel exactly how to build it: install and build from inside `frontend/`, and find the output at `frontend/dist`. Nothing to configure here.
4. Click **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon/publishable key

   Leave all three environment checkboxes (Production, Preview, Development) checked for both.
5. Click **Deploy** (takes 1-2 minutes).

**✅ You'll know this worked when:** Vercel shows a preview of your app with a **Visit** button that opens your live site at a URL like `uptime-monitor-yourname.vercel.app`. Log in with the admin account from Step 5 above and confirm the dashboard loads.

**If you get `Error: No Output Directory named "public" found`:** this means Vercel built from the repo root without using `vercel.json` — usually because "Root Directory" got set to `frontend` at some point (from an older version of this guide) *and* that also hid the root-level `vercel.json` from Vercel, since a non-default Root Directory changes where it looks for that file. Fix: **Project Settings → General → Root Directory → Edit → clear it back to blank/default → Save**, then **Deployments → (latest) → Redeploy**.

`vercel.json` (at the repo root) also tells Vercel to serve `index.html` for any URL it doesn't otherwise recognize — without it, refreshing the page on any screen but the dashboard (e.g. a specific website's detail page) would 404, since those routes only exist client-side via React Router.

From here, every `git push` to `main` triggers an automatic rebuild and redeploy on Vercel — nothing further to repeat.

## Testing the alert flow yourself

Same scenario the monitoring engine is built to handle: one email when a
site goes down, silence while it stays down, one email when it recovers.
Do this after finishing Setup above, while logged into the app.

1. On the **Websites** page, click **Add website**.
2. Fill in the form so it's guaranteed to look "down" right away:
   - **Name:** anything, e.g. `Test Site`
   - **URL:** `https://this-site-does-not-exist-12345.com` (a made-up domain — easiest way to force a DOWN result on demand)
   - **Failed checks before DOWN:** change this to `1` (so it doesn't wait for repeated failures)
   - **Alert email recipients:** type your own email address, press Enter to add it as a chip
   - Leave everything else as the defaults
3. Click **Save website**.
4. Back on the Websites page, find your new site's row and click the **Check now** icon (a small refresh/circular-arrow icon).
5. Check your email — you should get exactly **one** "🚨 Website DOWN" email within a minute or two. On the **Incidents** page, you should see one entry with status **Active**.
6. Click **Check now** on that same site a few more times. **No additional emails** should arrive — this is the duplicate-prevention behavior working as intended.
7. Edit the site (pencil icon) and change the URL to something real, like `https://example.com`. Save, then click **Check now** again.
8. Check your email again — you should get exactly **one** "✅ Website RECOVERED" email, and the Incidents page entry should flip to **Recovered** with a duration shown.

If step 5 doesn't produce an email within a few minutes: double-check Step 3 (Brevo sender is verified) and the `BREVO_*` secrets in Step 4 (make sure they're set correctly) above — those are the two most common things to have mistyped.

Note that `localhost` and private/internal IP ranges are **blocked by
default** (`supabase/functions/_shared/ssrfGuard.ts`) so the app can't be
pointed at your own network by accident. `http://192.0.2.1` is a reserved
documentation address (RFC 5737) that reliably times out — another good
option for step 2 above if you'd rather not use a made-up domain.

## Running the tests

```bash
npm test
```

23 tests covering: the DOWN/RECOVERY state machine and duplicate-email
prevention (pure function, dependency-injected DNS resolver, no real
network or database needed), the SSRF guard, and a full integration flow
against a small in-memory Postgres-shaped fake
(`supabase/functions/_shared/fakeSupabase.deno-test-util.ts`) that proves
`incidentService.ts`'s actual read/write sequence works, not just the pure
reducer in isolation.

The three Edge Function entry points (`index.ts` files) aren't covered by
this suite directly - they're thin routing/glue around the well-tested
`_shared` modules. You can type-check and lint them for free with Deno,
which is already installed if you have the Supabase CLI's dependencies:

```bash
deno check supabase/functions/*/index.ts
deno lint supabase/functions/
```

## Maintenance: trimming old check history

`checks` grows roughly 8-10 MB/month at 5 sites checked every 5 minutes -
a small fraction of the 500 MB free tier, but unbounded over years. Run
this occasionally (monthly is plenty) from the Supabase SQL Editor:

```sql
select cleanup_old_checks(90); -- deletes check rows older than 90 days; returns the count deleted
```

Incidents are never cleaned up - there are orders of magnitude fewer of
them, and that history is the point of the app.

## Security notes

- **Row Level Security** (`supabase/migrations`) is the enforcement
  boundary: any signed-in user can read/write `websites`/`settings`, read
  (not write) `checks`/`incidents`, and only the service role - used
  exclusively by Edge Functions - can write check/incident history, so a
  compromised session can't forge fake uptime data. (This was verified
  against a real local Postgres instance during development, role by role
  and table by table - not just read from the SQL.) Note that RLS policies
  only take effect on top of base table grants; Supabase's platform
  applies the standard `anon`/`authenticated` grants automatically when
  you create a project, so you don't need to add them yourself - this only
  matters if you're ever testing these migrations against a bare
  non-Supabase Postgres instance, where you'd need to grant those first.
- **SSRF protection**: monitoring targets are checked against
  private/loopback/link-local IP ranges (including the cloud metadata
  endpoint `169.254.169.254`) on every single check, so a hostname can't be
  repointed at an internal service after the fact. A URL that doesn't
  resolve at all is allowed through (that's just a normal DOWN site, not a
  security risk) — only URLs that resolve to a blocked range are rejected.
- `scheduled-monitor` doesn't require a user session (an external cron
  service can't carry one) - it's gated by `CRON_SECRET` instead, a
  narrow-purpose value separate from the all-powerful service-role key.
  `check-now` and `send-test-email` do require a real signed-in session.
- Supabase Auth handles password storage, session tokens, and refresh —
  none of that is custom code in this app.
- The Brevo API key lives only in Edge Function secrets, never in
  Postgres, the frontend bundle, or this repo.

## Known limitations

- **No self-service password reset in the UI** — re-run
  `npm run create-admin -- you@example.com "new-password"` to reset it.
- **Check frequency is bounded by your external cron interval** - most
  free options land around 1-5 minutes; this isn't a Supabase-specific
  limit the way Cloud Scheduler's floor was for the Firebase version, but
  in practice free HTTP-cron services rarely go below 1 minute either.
- **Single-tenant**: anyone who successfully signs in is treated as a full
  administrator (see the RLS policies in `supabase/migrations`). Fine for
  one person or a small trusted team; Postgres row-level policies keyed on
  a custom claim is the natural next step if you need tiered permissions.

## Data model reference

**websites** — one row per monitored site: config (name, url, interval,
timeout, expected status, failure threshold, slow-response settings,
notification toggles, `recipients text[]`) plus rolling state
(`current_status`, `consecutive_failures`, `last_checked_at`,
`last_response_time_ms`).

**checks** — one row per HTTP check ever performed
(`website_id`, `checked_at`, `status`, `http_status_code`,
`response_time_ms`, `error_message`).

**incidents** — one row per DOWN event
(`website_id`, `started_at`, `recovered_at`, `duration_seconds`, `reason`,
`status`, `notification_sent`, `recovery_notification_sent`). The partial
unique index `incidents_one_active_per_website` guarantees at most one
`status = 'active'` row per site.

**settings** — single row: the four global notification-default toggles
new sites inherit. SMTP/Brevo credentials are Edge Function secrets, not a
database table.

**SQL functions** (`supabase/migrations/20260101000002_dashboard_functions.sql`):
`uptime_percent(website_id, since, now)`, `uptime_windows(website_id)`
(the 24h/7d/30d/90d bundle), `dashboard_websites()` (everything the
Dashboard/Websites pages need in one call), `analytics_data()` (per-site
stats + 30-day incident count for the Analytics page).
