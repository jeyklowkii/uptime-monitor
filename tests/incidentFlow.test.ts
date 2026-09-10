import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeSupabase } from '../supabase/functions/_shared/fakeSupabase.deno-test-util.ts';

vi.mock('../supabase/functions/_shared/emailService.ts', () => ({
  sendDownAlert: vi.fn(),
  sendRecoveryAlert: vi.fn(),
  sendSlowAlert: vi.fn(),
  sendTestEmail: vi.fn(),
}));

const { runCheckForWebsite } = await import('../supabase/functions/_shared/incidentService.ts');
const emailService = await import('../supabase/functions/_shared/emailService.ts');

const fakeDb = createFakeSupabase();

const WEBSITE_ID = 'site-1';
const BASE_WEBSITE = {
  id: WEBSITE_ID,
  name: 'Test Site',
  url: 'http://8.8.8.8/probe',
  timeout_seconds: 5,
  expected_status_code: 200,
  slow_threshold_ms: 3000,
  failure_threshold: 2,
  current_status: 'up',
  consecutive_failures: 0,
  notify_on_down: true,
  notify_on_recovery: true,
  notify_on_slow: false,
  notify_every_failed_check: false,
  recipients: ['ops@example.com'],
};

function mockFetchSequence(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status }))
  );
}

function currentWebsite() {
  return fakeDb._table('websites').find((w) => w.id === WEBSITE_ID)!;
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeDb._reset();
  fakeDb._table('websites').push({ ...BASE_WEBSITE });
});

describe('incidentService.runCheckForWebsite (Supabase) - end to end', () => {
  it('does not send a DOWN email until the failure threshold is reached', async () => {
    mockFetchSequence(500);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any);

    const website = currentWebsite();
    expect(website.current_status).toBe('up');
    expect(website.consecutive_failures).toBe(1);
    expect(emailService.sendDownAlert).not.toHaveBeenCalled();
    expect(fakeDb._table('incidents')).toHaveLength(0);
  });

  it('sends exactly one DOWN email for a sustained outage, then one RECOVERY email - never more', async () => {
    mockFetchSequence(500);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // 1st failure
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // 2nd -> confirms DOWN
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // still down
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // still down

    expect(emailService.sendDownAlert).toHaveBeenCalledTimes(1);
    expect(fakeDb._table('incidents')).toHaveLength(1);
    expect(fakeDb._table('incidents')[0].status).toBe('active');

    mockFetchSequence(200);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // recovers

    expect(emailService.sendRecoveryAlert).toHaveBeenCalledTimes(1);
    expect(fakeDb._table('incidents')[0].status).toBe('recovered');
    expect(fakeDb._table('incidents')[0].recovered_at).not.toBeNull();

    const website = currentWebsite();
    expect(website.current_status).toBe('up');
    expect(website.consecutive_failures).toBe(0);
  });

  it('starts a brand-new incident (and a new email) for a second, later outage', async () => {
    mockFetchSequence(500);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // incident #1 opens

    mockFetchSequence(200);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // incident #1 recovers

    mockFetchSequence(500);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any); // incident #2 opens

    expect(emailService.sendDownAlert).toHaveBeenCalledTimes(2);
    expect(emailService.sendRecoveryAlert).toHaveBeenCalledTimes(1);
    expect(fakeDb._table('incidents')).toHaveLength(2);
  });

  it('records the HTTP status and response time on every check', async () => {
    mockFetchSequence(200);
    await runCheckForWebsite(fakeDb as any, currentWebsite() as any);

    const checks = fakeDb._table('checks');
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe('up');
    expect(checks[0].http_status_code).toBe(200);
    expect(checks[0].response_time_ms).toBeGreaterThanOrEqual(0);
  });
});
