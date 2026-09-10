// The only columns a website form is ever allowed to write. Deliberately
// excludes server-managed fields (current_status, consecutive_failures,
// last_checked_at, last_response_time_ms, last_http_status_code, id,
// created_at, updated_at) - those belong to the monitoring worker, not
// whatever was on the page when someone clicked "Save". Also strips
// display-only joined-in fields like recentChecks/uptime that
// api/client.js's getWebsite() adds for the detail page but that don't
// exist as real columns on `websites` at all - sending those straight
// back in an update is exactly the bug this module exists to prevent
// (PostgREST rejects unknown columns with "Could not find the 'X' column
// ... in the schema cache").
export const WEBSITE_WRITABLE_FIELDS = [
  'name',
  'url',
  'enabled',
  'check_interval_seconds',
  'timeout_seconds',
  'expected_status_code',
  'failure_threshold',
  'alert_on_slow',
  'slow_threshold_ms',
  'notify_on_down',
  'notify_on_recovery',
  'notify_on_slow',
  'notify_every_failed_check',
  'recipients',
];

export function sanitizeWebsitePayload(payload) {
  const clean = {};
  for (const key of WEBSITE_WRITABLE_FIELDS) {
    if (payload[key] !== undefined) clean[key] = payload[key];
  }
  return clean;
}
