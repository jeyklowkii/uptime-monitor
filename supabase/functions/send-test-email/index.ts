// Powers the "Send test email" button on the Settings page. Requires a
// real signed-in session (verify_jwt stays true - see supabase/config.toml).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendTestEmail } from '../_shared/emailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required' }, 401);

    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await anonClient.auth.getUser();
    if (authError || !user) return json({ error: 'Authentication required' }, 401);

    const { to } = await req.json().catch(() => ({}));
    if (!to || typeof to !== 'string' || !/\S+@\S+\.\S+/.test(to)) {
      return json({ error: 'A valid email address is required' }, 400);
    }

    await sendTestEmail({ to });
    return json({ sent: true });
  } catch (err) {
    console.error('send_test_email_error', err instanceof Error ? err.message : err);
    return json({ error: err instanceof Error ? err.message : 'Could not send test email' }, 502);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
