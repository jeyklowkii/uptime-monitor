/**
 * Sends email via Brevo's transactional email REST API
 * (https://api.brevo.com/v3/smtp/email) - a direct API call, not SMTP.
 * Simpler than the SMTP-relay approach the Firebase version used (no
 * "Trigger Email" extension / mail-collection indirection needed): the
 * Edge Function just calls Brevo directly with its API key.
 *
 * Configure via Supabase secrets (see README):
 *   supabase secrets set BREVO_API_KEY=xkeysib-...
 *   supabase secrets set BREVO_FROM_EMAIL=alerts@yourdomain.com
 *   supabase secrets set BREVO_FROM_NAME="Website Monitor"
 */

interface Website {
  name: string;
  url: string;
}

function fmt(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
}

function fmtTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-US', { timeStyle: 'short' });
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 1) return `${seconds} seconds`;
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hours}h ${rem}m`;
}

async function send({ to, subject, text }: { to: string[]; subject: string; text: string }): Promise<void> {
  if (!to || to.length === 0) return;

  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) throw new Error('BREVO_API_KEY is not configured (supabase secrets set BREVO_API_KEY=...)');

  const fromEmail = Deno.env.get('BREVO_FROM_EMAIL') || 'alerts@example.com';
  const fromName = Deno.env.get('BREVO_FROM_NAME') || 'Website Monitor';

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: to.map((email) => ({ email })),
      subject,
      textContent: text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API error ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function sendDownAlert({
  website,
  recipients,
  reason,
  httpStatus,
  detectedAt,
}: {
  website: Website;
  recipients: string[];
  reason: string;
  httpStatus: number | null;
  detectedAt: Date;
}): Promise<void> {
  const subject = `🚨 Website DOWN: ${website.name}`;
  const text = `Website Monitoring Alert

Website: ${website.name}
URL: ${website.url}

Status: DOWN

Detected At:
${fmt(detectedAt)}

Reason:
${reason}

HTTP Status:
${httpStatus ?? 'No Response'}

The monitoring system has detected that this website is currently unavailable.

This is an automated notification.`;
  await send({ to: recipients, subject, text });
}

export async function sendRecoveryAlert({
  website,
  recipients,
  downSince,
  recoveredAt,
  durationSeconds,
  responseTimeMs,
  httpStatus,
}: {
  website: Website;
  recipients: string[];
  downSince: Date;
  recoveredAt: Date;
  durationSeconds: number;
  responseTimeMs: number | null;
  httpStatus: number | null;
}): Promise<void> {
  const subject = `✅ Website RECOVERED: ${website.name}`;
  const text = `Website Recovery Notification

Website: ${website.name}
URL: ${website.url}

Status: ONLINE

Down Since:
${fmtTime(downSince)}

Recovered At:
${fmtTime(recoveredAt)}

Total Downtime:
${fmtDuration(durationSeconds)}

Response Time:
${responseTimeMs != null ? `${responseTimeMs} ms` : '—'}

HTTP Status:
${httpStatus ?? '—'}

The website is now accessible again.

This is an automated notification.`;
  await send({ to: recipients, subject, text });
}

export async function sendSlowAlert({
  website,
  recipients,
  responseTimeMs,
  thresholdMs,
}: {
  website: Website;
  recipients: string[];
  responseTimeMs: number | null;
  thresholdMs: number;
}): Promise<void> {
  const subject = `🟡 Website SLOW: ${website.name}`;
  const text = `Website Monitoring Alert

Website: ${website.name}
URL: ${website.url}

Status: DEGRADED (slow response)

Response Time:
${responseTimeMs} ms (threshold: ${thresholdMs} ms)

This is an automated notification.`;
  await send({ to: recipients, subject, text });
}

export async function sendTestEmail({ to }: { to: string }): Promise<void> {
  await send({
    to: [to],
    subject: '✅ Website Monitor - Test Email',
    text: `This is a test email from your Website Uptime Monitoring System.

If you received this, your Brevo API key is configured correctly.

This is an automated notification.`,
  });
}
