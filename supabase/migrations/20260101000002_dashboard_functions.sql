-- Real SQL aggregates instead of client-side workarounds: Supabase bills
-- by bandwidth/compute, not per-row-read the way Firestore does, so the
-- right move here is to compute once in Postgres and ship a small result
-- across the wire, rather than fetching raw rows and reducing in JS.

-- ---------------------------------------------------------------------
-- uptime_percent: % of [now - p_since, now] NOT covered by an incident
-- ---------------------------------------------------------------------
create or replace function uptime_percent(p_website_id uuid, p_since timestamptz, p_now timestamptz default now())
returns numeric
language sql
stable
as $$
  select case
    when p_now <= p_since then 100
    else greatest(0, least(100, round(
      (
        1 - coalesce(
          sum(
            extract(epoch from (
              least(coalesce(i.recovered_at, p_now), p_now) - greatest(i.started_at, p_since)
            ))
          ) filter (
            where i.started_at < p_now
              and coalesce(i.recovered_at, p_now) > p_since
          ),
          0
        ) / extract(epoch from (p_now - p_since))
      ) * 100,
      2
    )))
  end
  from incidents i
  where i.website_id = p_website_id;
$$;

-- ---------------------------------------------------------------------
-- uptime_windows: the standard 24h/7d/30d/90d set, packaged as one call
-- ---------------------------------------------------------------------
create or replace function uptime_windows(p_website_id uuid)
returns json
language sql
stable
as $$
  select json_build_object(
    'last24h', uptime_percent(p_website_id, now() - interval '1 day'),
    'last7d', uptime_percent(p_website_id, now() - interval '7 days'),
    'last30d', uptime_percent(p_website_id, now() - interval '30 days'),
    'last90d', uptime_percent(p_website_id, now() - interval '90 days')
  );
$$;

-- ---------------------------------------------------------------------
-- dashboard_websites: everything the Dashboard/Websites pages need, in
-- one round trip - current status, 24h uptime, 24h avg response time,
-- a 25-tick pulse-strip history, and the most recent incident, per site.
-- ---------------------------------------------------------------------
create or replace function dashboard_websites()
returns table (
  id uuid,
  name text,
  url text,
  enabled boolean,
  current_status text,
  consecutive_failures integer,
  check_interval_seconds integer,
  last_checked_at timestamptz,
  last_response_time_ms integer,
  last_http_status_code integer,
  uptime_24h numeric,
  avg_response_time_24h numeric,
  recent_statuses text[],
  last_incident_at timestamptz
)
language sql
stable
as $$
  select
    w.id, w.name, w.url, w.enabled, w.current_status,
    w.consecutive_failures, w.check_interval_seconds,
    w.last_checked_at, w.last_response_time_ms, w.last_http_status_code,
    uptime_percent(w.id, now() - interval '1 day'),
    (
      select round(avg(c.response_time_ms), 0)
      from checks c
      where c.website_id = w.id
        and c.checked_at > now() - interval '24 hours'
        and c.response_time_ms is not null
    ),
    (
      select array_agg(x.status order by x.checked_at asc)
      from (
        select status, checked_at from checks c2
        where c2.website_id = w.id
        order by c2.checked_at desc
        limit 25
      ) x
    ),
    (select max(started_at) from incidents i where i.website_id = w.id)
  from websites w
  order by w.name;
$$;

-- ---------------------------------------------------------------------
-- analytics_data: per-site uptime windows + 30d avg response time, plus
-- a 30-day incident count across all sites.
-- ---------------------------------------------------------------------
create or replace function analytics_data()
returns json
language sql
stable
as $$
  select json_build_object(
    'perWebsite', (
      select coalesce(json_agg(json_build_object(
        'websiteId', w.id,
        'name', w.name,
        'status', w.current_status,
        'uptime', uptime_windows(w.id),
        'avgResponseTimeMs30d', (
          select round(avg(c.response_time_ms), 0)
          from checks c
          where c.website_id = w.id
            and c.checked_at > now() - interval '30 days'
            and c.response_time_ms is not null
        )
      )), '[]'::json)
      from websites w
    ),
    'incidentsLast30d', (
      select count(*) from incidents where started_at > now() - interval '30 days'
    )
  );
$$;
