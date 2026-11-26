-- ---------------------------------------------------------------------
-- Keeps the database inside the free plan, and makes deleting a website
-- reliable. Needs migration ...0004 (the daily summary) to be applied first.
--
--  * run_maintenance()  deletes raw check rows older than a keep period
--                       (default 7 days) - but ONLY once their day has been
--                       summarized into check_daily_stats, so the response-time
--                       chart is unaffected by the cleanup. Works in bounded
--                       batches and is safe to run as often as you like.
--  * delete_website()   removes a website in small batches, so a site with a
--                       long history can no longer hit the statement timeout.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------

-- Raw checks are only needed for the last few days (the website page shows
-- the latest 50, the dashboard the latest 25). Everything older lives on in
-- check_daily_stats, which is what the 30-day chart reads.
--
--   run_maintenance(p_keep_days, p_max_delete)
--     p_keep_days   keep raw checks for this many days (minimum 2)
--     p_max_delete  most rows to delete in ONE call - run again while the
--                   result says "moreToDo": true
create or replace function run_maintenance(p_keep_days integer default 7, p_max_delete integer default 100000)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  c_window_days  constant integer := 30;
  v_keep         integer := greatest(p_keep_days, 2);
  v_today        date    := (now() at time zone 'utc')::date;
  v_window_start date    := v_today - (c_window_days - 1);
  v_cutoff       date    := v_today - v_keep;   -- raw rows on days BEFORE this are eligible
  v_r            json;
  v_i            integer;
  v_day          date;
  v_deleted      bigint  := 0;
  v_n            bigint;
  v_budget       bigint;
  v_more         boolean := false;
begin
  -- 1) Make sure the 30-day window is summarized BEFORE touching any raw rows.
  for v_i in 1..4 loop
    v_r := site_response_times();
    exit when (v_r ->> 'daysCovered')::int >= (v_r ->> 'daysTotal')::int;
  end loop;

  -- 2) Delete raw checks from days older than the keep period, oldest first.
  select (min(checked_at) at time zone 'utc')::date into v_day from checks;

  while v_day is not null and v_day < v_cutoff loop
    exit when v_deleted >= p_max_delete;

    -- Never delete a day inside the chart window that has not been summarized yet.
    if v_day >= v_window_start
       and not exists (select 1 from check_daily_done d where d.day = v_day) then
      v_more := true;
      exit;
    end if;

    v_budget := p_max_delete - v_deleted;
    delete from checks
    where ctid in (
      select ctid from checks
      where checked_at >= (v_day::timestamp at time zone 'utc')
        and checked_at <  ((v_day + 1)::timestamp at time zone 'utc')
      limit v_budget
    );
    get diagnostics v_n = row_count;
    v_deleted := v_deleted + v_n;

    if v_n >= v_budget then   -- budget ran out in the middle of a day
      v_more := true;
      exit;
    end if;

    -- jump to the next day that still has rows
    select (min(checked_at) at time zone 'utc')::date into v_day
    from checks where checked_at >= ((v_day + 1)::timestamp at time zone 'utc');
  end loop;

  return json_build_object(
    'deletedChecks', v_deleted,
    'moreToDo', v_more,
    'keptDays', v_keep,
    'summaryDaysCovered', (v_r ->> 'daysCovered')::int
  );
end;
$$;

-- Only the database owner (which is who pg_cron and the SQL Editor run as)
-- and the service role may run it. Logged-in app users cannot.
revoke all on function run_maintenance(integer, integer) from public, anon, authenticated;
grant execute on function run_maintenance(integer, integer) to service_role;

-- Delete a website in small batches. Deleting a site used to be one statement
-- that also had to delete its entire check history - for a site with months of
-- history that could exceed the statement timeout. This stops monitoring the
-- site, removes up to p_batch check rows per call, and only deletes the website
-- itself once its history is gone. The app calls it repeatedly until it returns
-- {"done": true}.
create or replace function delete_website(p_id uuid, p_batch integer default 10000)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  -- Stop monitoring it right away so no new checks arrive while we clean up.
  update websites set enabled = false where id = p_id;

  delete from checks
  where ctid in (select ctid from checks where website_id = p_id limit p_batch);
  get diagnostics v_deleted = row_count;

  if v_deleted >= p_batch then
    return json_build_object('done', false, 'deleted', v_deleted);   -- more history left
  end if;

  -- History is gone: remove the site itself (its incidents and daily summary
  -- rows cascade, and those are small).
  delete from websites where id = p_id;
  return json_build_object('done', true, 'deleted', v_deleted);
end;
$$;

revoke all on function delete_website(uuid, integer) from public, anon;
grant execute on function delete_website(uuid, integer) to authenticated, service_role;

-- Make Supabase's API pick up the new functions immediately.
notify pgrst, 'reload schema';