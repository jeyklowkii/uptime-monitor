import { assertSafeMonitoringUrl, type DnsResolver } from './ssrfGuard.ts';

const SERVER_ERROR_STATUSES = new Set([500, 502, 503, 504]);

export interface Website {
  url: string;
  timeout_seconds: number;
  expected_status_code: number;
  slow_threshold_ms: number;
}

export interface CheckResult {
  success: boolean;
  httpStatusCode: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  isSlow: boolean;
}

/**
 * Performs one HTTP/HTTPS check against a website. Deno's global `fetch`
 * and `AbortController` work exactly like Node's here, so this ported over
 * almost unchanged from the Express version.
 */
export async function performHttpCheck(
  website: Website,
  options: { allowInternal?: boolean; resolver?: DnsResolver } = {}
): Promise<CheckResult> {
  const startedAt = Date.now();

  // Re-validate on every single check (not just at add-time) so a hostname
  // that gets DNS-rebound to an internal IP after being added is still caught.
  try {
    await assertSafeMonitoringUrl(website.url, options);
  } catch (err) {
    return {
      success: false,
      httpStatusCode: null,
      responseTimeMs: null,
      errorMessage: err instanceof Error ? err.message : String(err),
      isSlow: false,
    };
  }

  const controller = new AbortController();
  const timeoutMs = (website.timeout_seconds || 10) * 1000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(website.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Website-Uptime-Monitor/1.0' },
    });
    const responseTimeMs = Date.now() - startedAt;

    const expected = website.expected_status_code || 200;
    const isServerError = SERVER_ERROR_STATUSES.has(response.status);
    const success = response.status === expected && !isServerError;

    return {
      success,
      httpStatusCode: response.status,
      responseTimeMs,
      errorMessage: success ? null : `Unexpected HTTP status ${response.status} (expected ${expected})`,
      isSlow: success && responseTimeMs > (website.slow_threshold_ms || 3000),
    };
  } catch (err) {
    const responseTimeMs = Date.now() - startedAt;
    const errorMessage =
      err instanceof Error && err.name === 'AbortError' ? 'Connection Timeout' : mapNetworkError(err);

    return {
      success: false,
      httpStatusCode: null,
      responseTimeMs,
      errorMessage,
      isSlow: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

function mapNetworkError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes('dns') || lower.includes('resolve') || lower.includes('not found')) return 'DNS Failure';
  if (lower.includes('connection refused') || lower.includes('econnrefused')) return 'Connection Refused';
  if (lower.includes('connection reset') || lower.includes('econnreset')) return 'Connection Reset';
  if (lower.includes('certificate') || lower.includes('tls') || lower.includes('ssl')) return 'SSL/TLS Failure';
  return message || 'Unknown network error';
}
