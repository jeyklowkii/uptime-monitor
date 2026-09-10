-- At 5 sites checked every 5 minutes, `checks` grows by roughly
-- 8-10 MB/month - a small fraction of the free tier's 500 MB, but it adds
-- up over years with no bound. Call this periodically (a monthly manual
-- run is plenty - see the README) to delete check rows older than
-- `retention_days`. Incidents are NOT cleaned up - they're the historical
-- record you actually want to keep, and there are orders of magnitude
-- fewer of them than raw checks.
create or replace function cleanup_old_checks(retention_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from checks where checked_at < now() - (retention_days || ' days')::interval;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
