import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      // incidentService.ts uses Deno's `npm:` specifier syntax (resolved by
      // Deno itself when actually deployed as an Edge Function). Vitest
      // runs under Node, so redirect that specifier to the plain npm
      // package (installed as a devDependency purely so this alias has
      // something to point at during tests).
      'npm:@supabase/supabase-js@2': '@supabase/supabase-js',
    },
  },
});
