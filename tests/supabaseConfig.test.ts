import { describe, it, expect } from 'vitest';
import { getSupabaseConfigError } from '../frontend/src/supabaseConfig.js';

describe('getSupabaseConfigError', () => {
  it('flags a completely missing .env (both values undefined)', () => {
    expect(getSupabaseConfigError(undefined, undefined)).toMatch(/frontend\/\.env is missing/);
  });

  it('flags a missing anon key alone', () => {
    expect(getSupabaseConfigError('https://abcdefgh.supabase.co', undefined)).toBeTruthy();
  });

  it('flags a missing URL alone', () => {
    expect(getSupabaseConfigError(undefined, 'some-real-looking-key')).toBeTruthy();
  });

  // Regression: this is the scenario that produced the confusing, generic
  // "Failed to fetch" - a syntactically valid URL that's still the literal
  // template value from frontend/.env.example, so createClient() itself
  // doesn't reject it (see supabase.js's comment on that).
  it('regression: flags the literal placeholder URL from .env.example, not just a missing one', () => {
    const err = getSupabaseConfigError('https://your-project-ref.supabase.co', 'some-key');
    expect(err).toBeTruthy();
    expect(err).toMatch(/placeholder/i);
  });

  it('returns null (no error) for what a real, filled-in .env looks like', () => {
    expect(getSupabaseConfigError('https://abcdefghijklmnop.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example')).toBeNull();
  });
});
