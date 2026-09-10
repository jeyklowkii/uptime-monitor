// One-time setup script: creates the first (and, for this single-tenant
// app, only) administrator account in Supabase Auth. There's no sign-up
// screen in the app on purpose (see supabase/config.toml's
// enable_signup = false and the Row Level Security policies in
// supabase/migrations) - this script is how you create that first account.
//
// Usage:
//   1. Supabase Dashboard -> Project Settings -> API -> copy the
//      "service_role" key (NOT the anon key - this one bypasses Row Level
//      Security, treat it like a root password. Never commit it, never
//      put it in the frontend).
//   2. SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx \
//        npm run create-admin -- you@example.com "a-strong-password"
import { createClient } from '@supabase/supabase-js';

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run create-admin -- you@example.com "a-strong-password"');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters (Supabase Auth requirement).');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY environment variables.\n\n' +
      'Both are in Supabase Dashboard -> Project Settings -> API.'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Look for an existing user with this email first, so re-running the
  // script updates the password instead of failing with "already exists"
  // (this doubles as a "reset my password" tool).
  const { data: existingPage, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = existingPage.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (error) throw error;
    console.log(`Updated password for existing administrator: ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip the confirmation email - you created this account yourself
      user_metadata: { name: 'Administrator' },
    });
    if (error) throw error;
    console.log(`Created administrator account: ${email} (id: ${data.user.id})`);
  }
}

main().catch((err) => {
  console.error('Failed to create/update admin:', err.message);
  process.exit(1);
});
