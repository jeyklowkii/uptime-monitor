import { supabase, configError } from '../supabase.js';
import { sanitizeWebsitePayload } from './websitePayload.js';

// Every page in this app was originally written against Firestore, which
// returns Timestamp objects rather than strings, so `fromDoc`-style
// normalization used to matter a lot here. Postgres/PostgREST just returns
// ISO 8601 strings for timestamptz columns, and `new Date(isoString)` (used
// throughout the pages already) handles that natively - so there's no
// normalization step needed in this version at all.

function friendlyAuthError(err) {
  const message = err?.message || 'Could not sign in';
  const wrapped = new Error(
    /invalid login credentials/i.test(message) ? 'Invalid email or password' : message
  );
  wrapped.status = err?.status === 429 ? 429 : 401;
  return wrapped;
}

async function friendlyFunctionError(error) {
  // supabase.functions.invoke()'s error is a FunctionsHttpError wrapping
  // the actual Response our Edge Function returned (with our own
  // `{ error: "..." }` JSON body) - unwrap it so the UI shows OUR message
  // ("Website not found") instead of a generic "Edge Function returned a
  // non-2xx status code".
  let message = error?.message || 'Request failed';
  try {
    const body = await error?.context?.json();
    if (body?.error) message = body.error;
  } catch {
    // context wasn't JSON (network error, etc.) - fall back to error.message above.
  }
  const wrapped = new Error(message);
  wrapped.status = error?.context?.status || 400;
  return wrapped;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export function onAuthChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}

// ---------- websites ----------

async function listWebsites() {
  // One round trip: dashboard_websites() (supabase/migrations) computes
  // 24h uptime, 24h avg response time, and a 25-tick pulse-strip history
  // server-side, in SQL - real Postgres aggregates instead of the
  // client-side workarounds earlier (Firestore) versions of this app
  // needed to stay cheap.
  const { data, error } = await supabase.rpc('dashboard_websites');
  if (error) throw error;
  return data;
}

async function getWebsite(id) {
  const [{ data: website, error }, { data: recentChecks, error: checksError }, { data: uptime, error: uptimeError }] =
    await Promise.all([
      supabase.from('websites').select('*').eq('id', id).single(),
      supabase.from('checks').select('*').eq('website_id', id).order('checked_at', { ascending: false }).limit(50),
      supabase.rpc('uptime_windows', { p_website_id: id }),
    ]);
  if (error) {
    const wrapped = new Error('Website not found');
    wrapped.status = 404;
    throw wrapped;
  }
  if (checksError) throw checksError;
  if (uptimeError) throw uptimeError;
  // recentChecks/uptime are joined-in for display only, not real columns
  // on `websites` - WebsiteForm.jsx loads this whole object into its form
  // state for editing, so we can't just spread it straight back into an
  // insert/update later (PostgREST would reject the unknown columns, and
  // worse, the server-managed fields below would silently overwrite live
  // monitoring state with a stale snapshot). sanitizeWebsitePayload() is
  // the actual guard against that - see createWebsite/updateWebsite.
  return { ...website, recentChecks, uptime };
}

// The only columns a website form is ever allowed to write - see
// websitePayload.js for why this exists and what it strips out.
async function createWebsite(payload) {
  const clean = sanitizeWebsitePayload(payload);
  return unwrap(
    await supabase
      .from('websites')
      .insert({ ...clean, recipients: clean.recipients ?? [] })
      .select()
      .single()
  );
}

async function updateWebsite(id, payload) {
  return unwrap(await supabase.from('websites').update(sanitizeWebsitePayload(payload)).eq('id', id).select().single());
}

async function deleteWebsite(id) {
  // `on delete cascade` (supabase/migrations) handles checks/incidents -
  // no manual cleanup needed the way Firestore required.
  const { error } = await supabase.from('websites').delete().eq('id', id);
  if (error) throw error;
}

async function checkWebsiteNow(id) {
  const { data, error } = await supabase.functions.invoke('check-now', { body: { websiteId: id } });
  if (error) throw await friendlyFunctionError(error);
  return data;
}

async function getWebsiteChecks(id, limitN = 50) {
  return unwrap(
    await supabase.from('checks').select('*').eq('website_id', id).order('checked_at', { ascending: false }).limit(limitN)
  );
}

async function getWebsiteIncidents(id) {
  return unwrap(
    await supabase.from('incidents').select('*').eq('website_id', id).order('started_at', { ascending: false })
  );
}

// ---------- incidents ----------

function flattenIncident(inc) {
  const { website, ...rest } = inc;
  return { ...rest, website_name: website?.name || '(deleted site)', website_url: website?.url || '' };
}

async function listIncidents(params) {
  let query = supabase
    .from('incidents')
    // Embedded resource: one query instead of the N+1 "look up each
    // website's name" that both prior (NoSQL) versions of this app needed.
    .select('*, website:websites(name, url)')
    .order('started_at', { ascending: false })
    .limit(500);
  if (params?.status) query = query.eq('status', params.status);

  const { data, error } = await query;
  if (error) throw error;
  return data.map(flattenIncident);
}

async function getIncident(id) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*, website:websites(name, url)')
    .eq('id', id)
    .single();
  if (error) {
    const wrapped = new Error('Incident not found');
    wrapped.status = 404;
    throw wrapped;
  }
  return flattenIncident(data);
}

// ---------- settings ----------
// SMTP itself is a Supabase Edge Function secret (BREVO_API_KEY etc.), not
// stored here - this table is just the notification-default toggles.

async function getSettings() {
  return unwrap(await supabase.from('settings').select('*').eq('id', 1).single());
}

async function updateSettings(payload) {
  return unwrap(await supabase.from('settings').update(payload).eq('id', 1).select().single());
}

async function sendTestEmail(to) {
  const { data, error } = await supabase.functions.invoke('send-test-email', { body: { to } });
  if (error) throw await friendlyFunctionError(error);
  return data;
}

// ---------- dashboard / analytics ----------

async function getSummary() {
  const sites = await listWebsites();
  const totals = { total: sites.length, online: 0, down: 0, degraded: 0, unknown: 0 };
  for (const s of sites) {
    if (s.current_status === 'up') totals.online += 1;
    else if (s.current_status === 'down') totals.down += 1;
    else if (s.current_status === 'degraded') totals.degraded += 1;
    else totals.unknown += 1;
  }

  const withAvg = sites.filter((s) => s.avg_response_time_24h != null);
  const avgResponseTimeMs = withAvg.length
    ? Math.round(withAvg.reduce((sum, s) => sum + Number(s.avg_response_time_24h), 0) / withAvg.length)
    : null;

  const overallUptime24h = sites.length
    ? Math.round((sites.reduce((sum, s) => sum + Number(s.uptime_24h), 0) / sites.length) * 100) / 100
    : 100;

  return { ...totals, avgResponseTimeMs, overallUptime24h };
}

async function getPulse() {
  const sites = await listWebsites();
  return sites.map((site) => ({
    websiteId: site.id,
    name: site.name,
    status: site.current_status,
    ticks: site.recent_statuses || [],
  }));
}

async function getAnalytics() {
  const { data, error } = await supabase.rpc('analytics_data');
  if (error) throw error;
  return data;
}

export const api = {
  login: async (email, password) => {
    // Checked here, not at module load in supabase.js - that would blank
    // the entire app on a misconfigured .env instead of showing this
    // exactly where "Failed to fetch" would otherwise appear: the login
    // form's error box, which is the first place someone would look.
    if (configError) throw new Error(configError);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw friendlyAuthError(error);
    return { user: data.user };
  },
  logout: () => supabase.auth.signOut(),

  listWebsites,
  getWebsite,
  createWebsite,
  updateWebsite,
  deleteWebsite,
  checkWebsiteNow,
  getWebsiteChecks,
  getWebsiteIncidents,

  listIncidents,
  getIncident,

  getSettings,
  updateSettings,
  sendTestEmail,

  getSummary,
  getPulse,
  getAnalytics,
};
