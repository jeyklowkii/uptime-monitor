/**
 * SSRF protection for monitoring targets: blocks localhost/private/
 * link-local/cloud-metadata IP ranges by default. Ported from the
 * Node.js version with the same behavior, including the fix for a real
 * bug found in production use: a hostname that simply doesn't resolve
 * (a typo'd domain, a not-yet-live site) is NOT a security risk - there's
 * nothing to reach - so it's allowed through. Only a hostname that
 * resolves to a blocked range is rejected.
 *
 * DNS resolution is injected (see `DnsResolver`) rather than hard-coded to
 * Deno's native API, specifically so the blocklist logic itself stays
 * unit-testable under plain Node/vitest (tests/ssrfGuard.test.js) without
 * needing the Deno runtime, which isn't available in every environment
 * this gets developed/tested in.
 */

const BLOCKED_V4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local / cloud metadata (169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4], // multicast+
];

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIPv4(str: string): boolean {
  const parts = str.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && String(Number(p)) === p && Number(p) <= 255);
}

function isIPv6(str: string): boolean {
  const stripped = str.replace(/^\[|\]$/g, '');
  if (!stripped.includes(':')) return false;
  return /^[0-9a-fA-F:]+$/.test(stripped) && stripped.split(':').length >= 3;
}

function isBlockedV4(ip: string): boolean {
  const target = ipToLong(ip);
  return BLOCKED_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipToLong(base) & mask) === (target & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    lower === '::1' || // loopback
    lower === '::' ||
    lower.startsWith('fe80:') || // link-local
    lower.startsWith('fc') ||
    lower.startsWith('fd') || // unique local
    lower.startsWith('::ffff:127.') ||
    lower.startsWith('::ffff:10.') ||
    lower.startsWith('::ffff:192.168.')
  );
}

export function isBlockedIp(ip: string): boolean {
  if (isIPv4(ip)) return isBlockedV4(ip);
  if (isIPv6(ip)) return isBlockedV6(ip);
  return true; // not a recognizable IP at all - fail closed
}

export interface DnsResolver {
  /** Returns every A/AAAA address a hostname resolves to, or [] if it doesn't resolve at all. */
  resolve(hostname: string): Promise<string[]>;
}

/** Real resolver used in production - Deno's native DNS API. */
export const denoDnsResolver: DnsResolver = {
  async resolve(hostname: string): Promise<string[]> {
    const addresses: string[] = [];
    for (const recordType of ['A', 'AAAA'] as const) {
      try {
        // @ts-ignore - Deno global, available at runtime on Supabase Edge Functions
        const records = await Deno.resolveDns(hostname, recordType);
        addresses.push(...records);
      } catch {
        // No records of this type (or resolution failed) - fine, just
        // means we won't have addresses from this record type.
      }
    }
    return addresses;
  },
};

export async function assertSafeMonitoringUrl(
  rawUrl: string,
  options: { allowInternal?: boolean; resolver?: DnsResolver } = {}
): Promise<URL> {
  const resolver = options.resolver ?? denoDnsResolver;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL must use http or https');
  }

  if (options.allowInternal) return parsed;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error('Monitoring targets on private/internal IP ranges are not allowed');
    }
    return parsed;
  }

  if (hostname === 'localhost') {
    throw new Error('Monitoring targets on private/internal IP ranges are not allowed');
  }

  const addresses = await resolver.resolve(hostname);
  if (addresses.length === 0) {
    // Doesn't resolve at all - not an SSRF risk (nothing to reach). Let it
    // through; the HTTP check itself will correctly report this as DOWN.
    return parsed;
  }

  if (addresses.some((ip) => isBlockedIp(ip))) {
    throw new Error('Monitoring targets on private/internal IP ranges are not allowed');
  }

  return parsed;
}
