import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfigError } from './supabaseConfig.js';

// From your Supabase project: Settings -> API. The anon key is safe to
// ship in the frontend bundle - it identifies the project and is subject
// to Row Level Security (see supabase/migrations), it doesn't grant access
// on its own. Never put the service_role key here - that one bypasses RLS
// entirely and belongs only in Edge Function secrets.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// See supabaseConfig.js for what this catches and why it's checked lazily
// (in api/client.js's login()) rather than thrown here at module-load
// time - throwing here would blank the entire app on a misconfigured
// .env instead of showing an error where one was already about to be
// shown (the login form).
export const configError = getSupabaseConfigError(supabaseUrl, supabaseAnonKey);

// Fall back to harmless placeholder strings so createClient() itself
// never throws at module-load time either (it does throw synchronously
// on a fully missing/undefined URL) - configError above is what actually
// surfaces the problem, at login time, with a specific message.
export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-anon-key');
