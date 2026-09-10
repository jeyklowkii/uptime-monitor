// Triggered by an EXTERNAL cron service (cron-job.org, GitHub Actions, etc)
// hitting this function's URL every 1-5 minutes - deliberately NOT by
// Postgres's own pg_cron. Reason: on Supabase's free tier, a project auto-
// pauses after 7 days with no genuine *external* API activity, and internal
// pg_cron -> pg_net calls do not reliably count toward that - so a purely
// pg_cron-driven monitor can quietly stop running a week after you last
// opened the dashboard, with no warning. An external HTTP call hitting this
// function's public URL both runs the check AND counts as real API
// activity, solving both problems with one mechanism. See the README's
// "Set up the monitoring schedule" section for exact setup steps.
//
// Deployed with verify_jwt = false (supabase/config.toml) since an external
// cron service can't carry a Supabase user session - instead this is gated
// by a narrow-purpose shared secret (CRON_SECRET) that only your cron job
// knows, kept separate from the all-powerful service-role key. This
// function checks whichever *enabled* sites are actually due for a check,
// per their own check_interval_seconds - the schedule just controls how
// often we look, not how often every site gets checked.
import { createServiceClient, runCheckForWebsite, type WebsiteRow } from '../_shared/incidentService.ts';

function isDue(website: { last_checked_at: string | null; check_interval_seconds: number }): boolean {
  if (!website.last_checked_at) return true;
  const lastCheckedMs = new Date(website.last_checked_at).getTime();
  const intervalMs = (website.check_interval_seconds || 60) * 1000;
  return Date.now() - lastCheckedMs >= intervalMs;
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: sites, error } = await supabase.from('websites').select('*').eq('enabled', true);
  if (error) {
    console.error('database_error', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const due = ((sites as WebsiteRow[] | null) || []).filter((s) =>
    isDue(s as unknown as { last_checked_at: string | null; check_interval_seconds: number })
  );

  const results = await Promise.allSettled(due.map((site) => runCheckForWebsite(supabase, site)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('monitoring_worker_error', due[i].name, r.reason);
    }
  });

  return new Response(JSON.stringify({ checked: due.length, total_enabled: sites?.length ?? 0 }), {
    headers: { 'content-type': 'application/json' },
  });
});
