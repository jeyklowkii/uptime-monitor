// A syntactically-valid-but-wrong Supabase URL (most commonly: someone's
// frontend/.env still has the literal placeholder from
// frontend/.env.example) doesn't make createClient() throw - it only
// validates that the string is URL-shaped, not that it points anywhere
// real. Left unchecked, that means the app renders fine and the first
// sign something's wrong is a generic browser-level "Failed to fetch"
// with no indication of why, the first time someone tries to log in.
// This function is what api/client.js's login() checks first, so a
// misconfigured project produces a specific, actionable message instead.
export function getSupabaseConfigError(url, anonKey) {
  if (!url || !anonKey) {
    return (
      'Supabase is not configured: frontend/.env is missing, or is missing ' +
      'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy the template if you haven\'t ' +
      '(`cp frontend/.env.example frontend/.env`), fill in your real project\'s values ' +
      '(Supabase dashboard -> Connect button), then restart `npm run dev:frontend-only` - ' +
      'Vite only reads .env at startup.'
    );
  }
  if (url.includes('your-project-ref')) {
    return (
      'Supabase is not configured: frontend/.env still has the placeholder URL from ' +
      'frontend/.env.example. Replace VITE_SUPABASE_URL with your real project\'s URL ' +
      '(Supabase dashboard -> Connect button), then restart `npm run dev:frontend-only` - ' +
      'Vite only reads .env at startup, so a running dev server won\'t pick up the change automatically.'
    );
  }
  return null;
}
