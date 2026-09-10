import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { performHttpCheck } from './checkService.ts';
import { classifyCheck, reduceCheck, type Status } from './statusEngine.ts';
import { sendDownAlert, sendRecoveryAlert, sendSlowAlert } from './emailService.ts';

export interface WebsiteRow {
  id: string;
  name: string;
  url: string;
  timeout_seconds: number;
  expected_status_code: number;
  slow_threshold_ms: number;
  current_status: Status;
  consecutive_failures: number;
  failure_threshold: number;
  notify_on_down: boolean;
  notify_on_recovery: boolean;
  notify_on_slow: boolean;
  notify_every_failed_check: boolean;
  recipients: string[];
}

/** Service-role client - bypasses RLS by design (see supabase/migrations). */
export function createServiceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

async function getActiveIncident(supabase: SupabaseClient, websiteId: string) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('website_id', websiteId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Runs one monitoring check end-to-end: HTTP check -> log the raw result ->
 * advance the state machine -> persist -> send at most one email per state
 * transition. Both the scheduled worker and the "check now" function call
 * this, so manual and automatic checks behave identically.
 */
export async function runCheckForWebsite(supabase: SupabaseClient, website: WebsiteRow) {
  console.log('check_started', website.name, website.url);

  const raw = await performHttpCheck(website);
  const checkSucceeded = classifyCheck(raw) === 'up';
  const checkStatus = checkSucceeded ? (raw.isSlow ? 'degraded' : 'up') : 'down';

  const { error: checkInsertError } = await supabase.from('checks').insert({
    website_id: website.id,
    status: checkStatus,
    http_status_code: raw.httpStatusCode,
    response_time_ms: raw.responseTimeMs,
    error_message: raw.errorMessage,
  });
  if (checkInsertError) throw checkInsertError;

  console.log(checkSucceeded ? 'check_completed' : 'check_failed_detected', website.name, raw.errorMessage ?? raw.httpStatusCode);

  const activeIncident = await getActiveIncident(supabase, website.id);

  const { nextStatus, nextConsecutiveFailures, action } = reduceCheck({
    previousStatus: website.current_status || 'unknown',
    consecutiveFailures: website.consecutive_failures || 0,
    failureThreshold: website.failure_threshold || 2,
    checkSucceeded,
    isSlow: raw.isSlow,
    hasActiveIncident: Boolean(activeIncident),
  });

  const { error: updateError } = await supabase
    .from('websites')
    .update({
      current_status: nextStatus,
      consecutive_failures: nextConsecutiveFailures,
      last_checked_at: new Date().toISOString(),
      last_response_time_ms: raw.responseTimeMs,
      last_http_status_code: raw.httpStatusCode,
    })
    .eq('id', website.id);
  if (updateError) throw updateError;

  const recipients = website.recipients || [];

  if (action === 'start_incident') {
    console.warn('down_confirmed', website.name, nextConsecutiveFailures);
    const startedAt = new Date();
    const reason = raw.errorMessage || `HTTP ${raw.httpStatusCode}`;

    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .insert({
        website_id: website.id,
        started_at: startedAt.toISOString(),
        reason,
        status: 'active',
        notification_sent: Boolean(website.notify_on_down),
      })
      .select()
      .single();
    if (incidentError) throw incidentError;

    if (website.notify_on_down) {
      try {
        await sendDownAlert({ website, recipients, reason, httpStatus: raw.httpStatusCode, detectedAt: startedAt });
      } catch (err) {
        console.error('smtp_error', website.name, err instanceof Error ? err.message : err);
      }
    }

    return { action, incidentId: incident.id };
  }

  if (action === 'recover_incident' && activeIncident) {
    const recoveredAt = new Date();
    const startedAtDate = new Date(activeIncident.started_at);
    const durationSeconds = Math.max(0, Math.round((recoveredAt.getTime() - startedAtDate.getTime()) / 1000));

    const { error: recoverError } = await supabase
      .from('incidents')
      .update({
        recovered_at: recoveredAt.toISOString(),
        duration_seconds: durationSeconds,
        status: 'recovered',
        recovery_notification_sent: Boolean(website.notify_on_recovery),
      })
      .eq('id', activeIncident.id);
    if (recoverError) throw recoverError;

    console.log('recovery_detected', website.name, durationSeconds);

    if (website.notify_on_recovery) {
      try {
        await sendRecoveryAlert({
          website,
          recipients,
          downSince: startedAtDate,
          recoveredAt,
          durationSeconds,
          responseTimeMs: raw.responseTimeMs,
          httpStatus: raw.httpStatusCode,
        });
      } catch (err) {
        console.error('smtp_error', website.name, err instanceof Error ? err.message : err);
      }
    }
  }

  if (action === 'became_slow' && website.notify_on_slow) {
    try {
      await sendSlowAlert({
        website,
        recipients,
        responseTimeMs: raw.responseTimeMs,
        thresholdMs: website.slow_threshold_ms,
      });
    } catch (err) {
      console.error('smtp_error', website.name, err instanceof Error ? err.message : err);
    }
  }

  // Opt-in, off by default: notify on every single failed check, independent
  // of - and in addition to - the one-shot DOWN email.
  if (!checkSucceeded && website.notify_every_failed_check) {
    try {
      await sendDownAlert({
        website,
        recipients,
        reason: raw.errorMessage || `HTTP ${raw.httpStatusCode}`,
        httpStatus: raw.httpStatusCode,
        detectedAt: new Date(),
      });
    } catch (err) {
      console.error('smtp_error', website.name, err instanceof Error ? err.message : err);
    }
  }

  return { action };
}
