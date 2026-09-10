import { describe, it, expect } from 'vitest';
import { sanitizeWebsitePayload, WEBSITE_WRITABLE_FIELDS } from '../frontend/src/api/websitePayload.js';

// A stand-in for exactly what api/client.js's getWebsite() returns, and
// what WebsiteForm.jsx spreads straight into its form state for editing:
// the full `websites` row, plus recentChecks/uptime joined in for the
// detail page's display only - neither of which is a real column.
const LOADED_FOR_EDIT = {
  id: 'a1b2c3',
  name: 'Example',
  url: 'https://example.com',
  enabled: true,
  check_interval_seconds: 300,
  timeout_seconds: 10,
  expected_status_code: 200,
  failure_threshold: 2,
  alert_on_slow: false,
  slow_threshold_ms: 3000,
  notify_on_down: true,
  notify_on_recovery: true,
  notify_on_slow: false,
  notify_every_failed_check: false,
  recipients: ['ops@example.com'],
  current_status: 'down',
  consecutive_failures: 3,
  last_checked_at: '2026-09-09T12:00:00.000Z',
  last_response_time_ms: 842,
  last_http_status_code: 503,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-09-09T12:00:00.000Z',
  recentChecks: [{ id: 'chk1', status: 'down' }],
  uptime: { last24h: 91.2, last7d: 99.1, last30d: 99.8, last90d: 99.9 },
};

describe('sanitizeWebsitePayload', () => {
  it('regression: strips recentChecks/uptime - the exact cause of "Could not find the \'recentChecks\' column of \'websites\' in the schema cache"', () => {
    const clean = sanitizeWebsitePayload(LOADED_FOR_EDIT);
    expect(clean).not.toHaveProperty('recentChecks');
    expect(clean).not.toHaveProperty('uptime');
  });

  it('strips server-managed monitoring state so a form save can never clobber live status with a stale snapshot', () => {
    const clean = sanitizeWebsitePayload(LOADED_FOR_EDIT);
    expect(clean).not.toHaveProperty('current_status');
    expect(clean).not.toHaveProperty('consecutive_failures');
    expect(clean).not.toHaveProperty('last_checked_at');
    expect(clean).not.toHaveProperty('last_response_time_ms');
    expect(clean).not.toHaveProperty('last_http_status_code');
  });

  it('strips id/created_at/updated_at', () => {
    const clean = sanitizeWebsitePayload(LOADED_FOR_EDIT);
    expect(clean).not.toHaveProperty('id');
    expect(clean).not.toHaveProperty('created_at');
    expect(clean).not.toHaveProperty('updated_at');
  });

  it('keeps every field the Add/Edit form actually edits, unchanged', () => {
    const clean = sanitizeWebsitePayload(LOADED_FOR_EDIT);
    for (const field of WEBSITE_WRITABLE_FIELDS) {
      expect(clean[field]).toEqual(LOADED_FOR_EDIT[field]);
    }
    expect(Object.keys(clean).sort()).toEqual([...WEBSITE_WRITABLE_FIELDS].sort());
  });

  it('does not choke on a plain "add website" payload that never had the extra fields to begin with', () => {
    const addPayload = {
      name: 'New Site',
      url: 'https://new-site.example.com',
      enabled: true,
      check_interval_seconds: 60,
      timeout_seconds: 10,
      expected_status_code: 200,
      failure_threshold: 2,
      alert_on_slow: false,
      slow_threshold_ms: 3000,
      notify_on_down: true,
      notify_on_recovery: true,
      notify_on_slow: false,
      notify_every_failed_check: false,
      recipients: [],
    };
    expect(sanitizeWebsitePayload(addPayload)).toEqual(addPayload);
  });
});
