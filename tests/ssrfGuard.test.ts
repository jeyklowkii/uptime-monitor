import { describe, it, expect } from 'vitest';
import { isBlockedIp, assertSafeMonitoringUrl, type DnsResolver } from '../supabase/functions/_shared/ssrfGuard.ts';

function fakeResolver(addresses: string[]): DnsResolver {
  return { resolve: async () => addresses };
}
function failingResolver(): DnsResolver {
  return { resolve: async () => [] }; // matches denoDnsResolver's behavior when nothing resolves
}

describe('isBlockedIp', () => {
  it('blocks loopback and private ranges', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.5')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('169.254.169.254')).toBe(true); // cloud metadata endpoint
    expect(isBlockedIp('::1')).toBe(true);
  });

  it('allows public IPs, including the RFC 5737 documentation ranges', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('192.0.2.1')).toBe(false); // TEST-NET-1 - useful for testing DOWN alerts
  });
});

describe('assertSafeMonitoringUrl', () => {
  it('rejects non-http(s) protocols', async () => {
    await expect(assertSafeMonitoringUrl('ftp://example.com')).rejects.toThrow();
  });

  it('rejects malformed URLs', async () => {
    await expect(assertSafeMonitoringUrl('not a url')).rejects.toThrow();
  });

  it('rejects localhost', async () => {
    await expect(assertSafeMonitoringUrl('http://localhost:3000')).rejects.toThrow();
  });

  it('rejects a literal private IP', async () => {
    await expect(assertSafeMonitoringUrl('http://192.168.0.10')).rejects.toThrow();
  });

  it('accepts a literal public IP', async () => {
    await expect(assertSafeMonitoringUrl('http://8.8.8.8')).resolves.toBeInstanceOf(URL);
  });

  it('rejects a hostname that resolves to a private IP', async () => {
    const resolver = fakeResolver(['10.0.0.5']);
    await expect(assertSafeMonitoringUrl('http://internal.example.com', { resolver })).rejects.toThrow(
      /private\/internal/
    );
  });

  it('accepts a hostname that resolves to a public IP', async () => {
    const resolver = fakeResolver(['93.184.216.34']);
    await expect(assertSafeMonitoringUrl('http://public.example.com', { resolver })).resolves.toBeInstanceOf(URL);
  });

  // Regression test: a typo'd or not-yet-live domain used to be rejected at
  // add-time with "Could not resolve hostname", which made it impossible to
  // add a site specifically to test the DOWN alert (its whole point is that
  // it doesn't resolve/respond). A hostname that doesn't resolve at all is
  // not an SSRF risk - there's nothing to reach - so it must be allowed
  // through here; the periodic check is what reports it as DOWN.
  it('does NOT reject a hostname that fails to resolve at all', async () => {
    const resolver = failingResolver();
    await expect(
      assertSafeMonitoringUrl('http://this-domain-does-not-exist-xyz.test', { resolver })
    ).resolves.toBeInstanceOf(URL);
  });

  it('allowInternal bypasses every check, including localhost', async () => {
    await expect(assertSafeMonitoringUrl('http://localhost:9999', { allowInternal: true })).resolves.toBeInstanceOf(
      URL
    );
  });
});
