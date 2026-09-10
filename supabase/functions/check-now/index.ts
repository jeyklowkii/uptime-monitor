// Powers the "Check now" button on the Websites/WebsiteDetails pages - runs
// one check immediately, same code path as scheduled-monitor. Requires a
// real signed-in session (verify_jwt stays true for this function, unlike
// scheduled-monitor - see supabase/config.toml): the frontend calls this
// via supabase.functions.invoke(), which automatically attaches the
// current user's access token.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createServiceClient, runCheckForWebsite, type WebsiteRow } from '../_shared/incidentService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Authentication required' }, 401);
    }

    // Verify the caller's token represents a real user (the platform
    // already checked the JWT signature via verify_jwt=true before this
    // code even runs, but we double check we can resolve a user from it,
    // and use this anon-scoped client only for that verification step).
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser();
    if (authError || !user) {
      return json({ error: 'Authentication required' }, 401);
    }

    const { websiteId } = await req.json().catch(() => ({}));
    if (!websiteId || typeof websiteId !== 'string') {
      return json({ error: 'websiteId is required' }, 400);
    }

    const supabase = createServiceClient();
    const { data: website, error: fetchError } = await supabase
      .from('websites')
      .select('*')
      .eq('id', websiteId)
      .single();
    if (fetchError || !website) {
      return json({ error: 'Website not found' }, 404);
    }

    const result = await runCheckForWebsite(supabase, website as WebsiteRow);

    const { data: updated } = await supabase.from('websites').select('*').eq('id', websiteId).single();
    return json({ website: updated, result });
  } catch (err) {
    console.error('check_now_error', err instanceof Error ? err.message : err);
    return json({ error: 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
