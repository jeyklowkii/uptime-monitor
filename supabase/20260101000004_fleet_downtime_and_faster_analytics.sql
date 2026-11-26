-- ---------------------------------------------------------------------
-- Analytics page, built so one slow query can't blank the whole page:
--
--  * analytics_data()   per-site uptime + downtime. Reads only the small
--                       incidents/websites tables, so it is fast no matter
--                       how many checks have piled up.
--  * fleet_downtime()   total downtime across ALL sites as a percentage for
--                       24h / 7d / 30d / 90d. Computed in the database, so it
--                       is never cut off by the API's 1000-row limit.
--  * site_response_times()  the 30-day average response time per site, read
--                       from a small DAILY SUMMARY (check_daily_stats) instead
--                       of re-averaging millions of check rows on every page
--                       load. Past days are summarized once; only today is
--                       read live. The summary builds itself a few days per
--                       call, so nothing needs backfilling by hand.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------

-- Seconds of ONE incident that fall inside [p_since, p_now]. An incident
-- with no recovered_at is still ongoing, so it counts up to p_now.
create or replace function incident_overlap_seconds(
  p_started timestamptz,
  p_recovered timestamptz,
  p_since timestamptz,
  p_now timestamptz
)
returns numeric
language sql
immutable
parallel safe
as $$
  select greatest(
    0,
    extract(epoch from (least(coalesce(p_recovered, p_now), p_now) - greatest(p_started, p_since)))
  );
$$;

-- Same formula and rounding uptime_percent() uses, for a downtime total
-- that was already summed: 100 - downtime/period, clamped to 0..100.
create or replace function uptime_pct(p_downtime_seconds numeric, p_period_seconds numeric)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when p_period_seconds <= 0 then 100
    else greatest(0, least(100, round((1 - p_downtime_seconds / p_period_seconds) * 100, 2)))
  end;
$$;

-- Per-site uptime + downtime, and the 30-day incident count. Reads ONLY
-- `incidents` and `websites` (a few thousand rows) - it deliberately does
-- not touch `checks`, which can hold millions of rows. The 30-day average
-- response time lives in site_response_times() below so that a slow scan of
-- `checks` can never take this whole page down with it.
create or replace function analytics_data()
returns json
language sql
stable
as $$
  with t as (select now() as now_ts),

  -- ONE pass over incidents: downtime seconds inside each window, per site.
  dt as (
    select
      i.website_id,
      sum(incident_overlap_seconds(i.started_at, i.recovered_at, t.now_ts - interval '1 day',   t.now_ts)) as s24h,
      sum(incident_overlap_seconds(i.started_at, i.recovered_at, t.now_ts - interval '7 days',  t.now_ts)) as s7d,
      sum(incident_overlap_seconds(i.started_at, i.recovered_at, t.now_ts - interval '30 days', t.now_ts)) as s30d,
      sum(incident_overlap_seconds(i.started_at, i.recovered_at, t.now_ts - interval '90 days', t.now_ts)) as s90d
    from incidents i, t
    where i.started_at < t.now_ts
      and coalesce(i.recovered_at, t.now_ts) > t.now_ts - interval '90 days'
    group by i.website_id
  )

  select json_build_object(
    'perWebsite', (
      select coalesce(json_agg(json_build_object(
        'websiteId', w.id,
        'name', w.name,
        'status', w.current_status,
        'uptime', json_build_object(
          'last24h', uptime_pct(coalesce(dt.s24h, 0), extract(epoch from interval '1 day')),
          'last7d',  uptime_pct(coalesce(dt.s7d,  0), extract(epoch from interval '7 days')),
          'last30d', uptime_pct(coalesce(dt.s30d, 0), extract(epoch from interval '30 days')),
          'last90d', uptime_pct(coalesce(dt.s90d, 0), extract(epoch from interval '90 days'))
        ),
        'downtimeSeconds30d', round(coalesce(dt.s30d, 0))::bigint
      ) order by w.name), '[]'::json)
      from websites w
      left join dt on dt.website_id = w.id
    ),
    'incidentsLast30d', (
      select count(*) from incidents, t where started_at > t.now_ts - interval '30 days'
    )
  );
$$;

-- ---------------------------------------------------------------------
-- Daily response-time summary: one row per site per UTC day.
-- ---------------------------------------------------------------------
create table if not exists check_daily_stats (
  website_id      uuid    not null references websites(id) on delete cascade,
  day             date    not null,   -- UTC calendar day
  check_count     integer not null,   -- checks that day that HAVE a response time
  response_ms_sum bigint  not null,   -- sum of those response times
  primary key (website_id, day)
);

-- Days whose rows above are final (computed once, then never re-read).
create table if not exists check_daily_done (
  day         date primary key,
  computed_at timestamptz not null default now()
);

alter table check_daily_stats enable row level security;
alter table check_daily_done  enable row level security;

-- Logged-in users may read the summary. There are deliberately NO insert /
-- update / delete policies: only site_response_times() below writes to it.
drop policy if exists "authenticated read check_daily_stats" on check_daily_stats;
create policy "authenticated read check_daily_stats" on check_daily_stats
  for select to authenticated using (true);

-- 30-day average response time per site, as
--   { "daysTotal": 30, "daysCovered": 27, "avgMs": { "<site id>": ms, ... } }
--
-- Each call (1) finalizes up to 3 missing past days - newest first, stopping
-- early if it has used ~2 seconds - and (2) answers from the summary plus a
-- live read of the not-yet-final days (today). On a database with no summary
-- yet, a few calls fill the 30 days in; "daysCovered" says how far along it is.
--
-- SECURITY DEFINER because it writes the summary tables, which logged-in
-- users cannot write directly. It only ever reads `checks` and writes those
-- two tables; the search_path is pinned for safety.
create or replace function site_response_times()
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_window_days   constant integer  := 30;
  c_max_new_days  constant integer  := 3;
  c_budget        constant interval := interval '2 seconds';

  v_started       timestamptz := clock_timestamp();
  v_today         date := (now() at time zone 'utc')::date;
  -- Days up to here are final. The 10-minute grace lets checks that land just
  -- after midnight UTC settle before a day is frozen.
  v_final_through date := ((now() at time zone 'utc') - interval '10 minutes')::date - 1;
  v_window_start  date := v_today - (c_window_days - 1);
  v_live_from     timestamptz;
  v_day           date;
  v_built         integer := 0;
  v_missing       integer;
  v_avg           json;
begin
  -- 1) Finalize a few missing days, newest first.
  for v_day in
    select g::date
    from generate_series(v_final_through::timestamp, v_window_start::timestamp, interval '-1 day') g
    where not exists (select 1 from check_daily_done d where d.day = g::date)
  loop
    exit when v_built >= c_max_new_days
           or (v_built >= 1 and clock_timestamp() - v_started > c_budget);

    insert into check_daily_stats (website_id, day, check_count, response_ms_sum)
    select c.website_id, v_day, count(c.response_time_ms), sum(c.response_time_ms)
    from checks c
    where c.checked_at >= (v_day::timestamp at time zone 'utc')
      and c.checked_at <  ((v_day + 1)::timestamp at time zone 'utc')
      and c.response_time_ms is not null
    group by c.website_id
    on conflict (website_id, day) do nothing;

    insert into check_daily_done (day) values (v_day) on conflict (day) do nothing;
    v_built := v_built + 1;
  end loop;

  -- 2) How many of the finalized days in the window are still missing?
  select count(*) into v_missing
  from generate_series(v_window_start::timestamp, v_final_through::timestamp, interval '1 day') g
  where not exists (select 1 from check_daily_done d where d.day = g::date);

  -- 3) Answer = finalized days from the summary + the live (not yet final) days.
  v_live_from := ((v_final_through + 1)::timestamp at time zone 'utc');

  select coalesce(json_object_agg(website_id, round(total_ms::numeric / cnt, 0)), '{}'::json)
  into v_avg
  from (
    select u.website_id, sum(u.cnt) as cnt, sum(u.total_ms) as total_ms
    from (
      select st.website_id, st.check_count::bigint as cnt, st.response_ms_sum as total_ms
      from check_daily_stats st
      join check_daily_done dn on dn.day = st.day
      where st.day between v_window_start and v_final_through
      union all
      select c.website_id, count(c.response_time_ms), sum(c.response_time_ms)::bigint
      from checks c
      where c.checked_at >= v_live_from
        and c.response_time_ms is not null
      group by c.website_id
    ) u
    group by u.website_id
  ) t
  where cnt > 0;

  return json_build_object(
    'daysTotal',   c_window_days,
    'daysCovered', c_window_days - v_missing,
    'avgMs',       v_avg
  );
end;
$$;

-- Only logged-in users (and the service role) may call it - it does write work.
revoke all on function site_response_times() from public, anon;
grant execute on function site_response_times() to authenticated, service_role;

-- Total downtime across every site, as a percentage of the time those sites
-- were actually being monitored.
--
--   downtimePercent = (sum of every site's downtime in the window)
--                     / (sum of every site's observed time in the window) * 100
--
-- "Observed time" for a site is the window length, or - for a site added
-- partway through the window - only the time since it was added. So adding
-- a new site never makes the past look healthier than it was, removing a
-- site takes its time AND its downtime out together, and with no sites at
-- all the percentage is 0 instead of a divide-by-zero error.
create or replace function fleet_downtime(p_now timestamptz default now())
returns json
language sql
stable
as $$
  with windows(label, secs) as (
    values ('24h', 86400), ('7d', 604800), ('30d', 2592000), ('90d', 7776000)
  ),
  per_window as (
    select
      w.label,
      (select count(*) from websites) as site_count,
      coalesce((
        select sum(greatest(0, least(w.secs, extract(epoch from (p_now - s.created_at)))))
        from websites s
      ), 0) as observed,
      coalesce((
        select sum(incident_overlap_seconds(i.started_at, i.recovered_at, p_now - make_interval(secs => w.secs), p_now))
        from incidents i
        where i.started_at < p_now
          and coalesce(i.recovered_at, p_now) > p_now - make_interval(secs => w.secs)
      ), 0) as downtime
    from windows w
  )
  select json_object_agg(label, json_build_object(
    'siteCount', site_count,
    'downtimeSeconds', round(downtime)::bigint,
    'observedSeconds', round(observed)::bigint,
    'downtimePercent', case
      when observed > 0 then least(100, round(downtime / observed * 100, 2))
      else 0
    end
  ))
  from per_window;
$$;

-- Make Supabase's API pick up the new/changed functions immediately.
notify pgrst, 'reload schema';