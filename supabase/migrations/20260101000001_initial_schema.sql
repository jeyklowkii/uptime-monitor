-- Website Uptime Monitor - core schema
-- Tables mirror the original relational design closely (this app started
-- as a plain Postgres/Knex backend before moving through Firebase and
-- landing here) - Supabase being real Postgres means we can go back to
-- proper server-side SQL aggregates instead of client-side workarounds.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- websites
-- ---------------------------------------------------------------------
create table websites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  enabled boolean not null default true,

  check_interval_seconds integer not null default 300,
  timeout_seconds integer not null default 10,
  expected_status_code integer not null default 200,
  failure_threshold integer not null default 2,
  alert_on_slow boolean not null default false,
  slow_threshold_ms integer not null default 3000,

  notify_on_down boolean not null default true,
  notify_on_recovery boolean not null default true,
  notify_on_slow boolean not null default false,
  notify_every_failed_check boolean not null default false,
  recipients text[] not null default '{}',

  current_status text not null default 'unknown'
    check (current_status in ('unknown', 'up', 'down', 'degraded')),
  consecutive_failures integer not null default 0,
  last_checked_at timestamptz,
  last_response_time_ms integer,
  last_http_status_code integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- checks - one row per HTTP check ever performed
-- ---------------------------------------------------------------------
create table checks (
  id bigint generated always as identity primary key,
  website_id uuid not null references websites(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('up', 'down', 'degraded')),
  http_status_code integer,
  response_time_ms integer,
  error_message text
);

create index checks_website_id_checked_at_idx on checks (website_id, checked_at desc);
create index checks_checked_at_idx on checks (checked_at);

-- ---------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------
create table incidents (
  id bigint generated always as identity primary key,
  website_id uuid not null references websites(id) on delete cascade,
  started_at timestamptz not null,
  recovered_at timestamptz,
  duration_seconds integer,
  reason text not null,
  status text not null default 'active' check (status in ('active', 'recovered')),
  notification_sent boolean not null default false,
  recovery_notification_sent boolean not null default false
);

create index incidents_website_id_idx on incidents (website_id);
create index incidents_website_id_status_idx on incidents (website_id, status);
create index incidents_status_started_at_idx on incidents (status, started_at desc);
create index incidents_started_at_idx on incidents (started_at desc);

-- Enforces the duplicate-prevention invariant at the database level too:
-- at most one active incident per website, ever. Belt-and-suspenders on
-- top of the application-level state machine in _shared/statusEngine.ts -
-- if that logic ever had a bug, this constraint turns it into a loud
-- insert failure instead of a silent second "DOWN" incident.
create unique index incidents_one_active_per_website
  on incidents (website_id) where (status = 'active');

-- ---------------------------------------------------------------------
-- settings - single row (global notification defaults; SMTP lives in
-- Edge Function secrets, never in the database - see supabase/functions)
-- ---------------------------------------------------------------------
create table settings (
  id integer primary key default 1 check (id = 1),
  notify_on_down boolean not null default true,
  notify_on_recovery boolean not null default true,
  notify_on_slow boolean not null default false,
  notify_every_failed_check boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into settings (id) values (1);

-- ---------------------------------------------------------------------
-- keep updated_at honest regardless of what a client sends
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger websites_set_updated_at
  before update on websites
  for each row execute function set_updated_at();

create trigger settings_set_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
--
-- Single-tenant tool: any authenticated user is treated as an
-- administrator (there's no public sign-up screen in the app - see
-- scripts/create-admin.js for how the one account gets created). Reads on
-- `checks`/`incidents` are open to authenticated users; writes to those
-- two tables are intentionally NOT granted to `authenticated` at all -
-- only the service role (used exclusively by Edge Functions, which
-- bypasses RLS by design) can write check/incident history, so a
-- compromised session can't forge fake uptime history.
-- ---------------------------------------------------------------------
alter table websites enable row level security;
alter table checks enable row level security;
alter table incidents enable row level security;
alter table settings enable row level security;

create policy "authenticated read websites" on websites
  for select to authenticated using (true);
create policy "authenticated insert websites" on websites
  for insert to authenticated with check (true);
create policy "authenticated update websites" on websites
  for update to authenticated using (true) with check (true);
create policy "authenticated delete websites" on websites
  for delete to authenticated using (true);

create policy "authenticated read checks" on checks
  for select to authenticated using (true);

create policy "authenticated read incidents" on incidents
  for select to authenticated using (true);

create policy "authenticated read settings" on settings
  for select to authenticated using (true);
create policy "authenticated update settings" on settings
  for update to authenticated using (true) with check (true);
