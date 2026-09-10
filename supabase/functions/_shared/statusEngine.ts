/**
 * The state machine:
 *
 *   NORMAL -> FAILURE DETECTED -> CONFIRMED DOWN -> INCIDENT ACTIVE -> RECOVERED -> NORMAL
 *
 * Pure functions, no I/O - identical to every prior version of this app
 * (Node/Express, then Firebase Cloud Functions, now here). Keeping the
 * decision logic pure is what makes "duplicate email prevention"
 * unit-testable without a database - see tests/statusEngine.test.js, which
 * imports this file directly and runs fine under plain Node/vitest even
 * though the function itself deploys to Deno.
 */

export function classifyCheck(rawResult: { success: boolean }): 'up' | 'down' {
  return rawResult.success ? 'up' : 'down';
}

export type Status = 'unknown' | 'up' | 'down' | 'degraded';
export type Action = 'start_incident' | 'already_down' | 'below_threshold' | 'recover_incident' | 'became_slow' | 'none';

export interface ReduceCheckInput {
  previousStatus: Status;
  consecutiveFailures: number;
  failureThreshold: number;
  checkSucceeded: boolean;
  isSlow: boolean;
  hasActiveIncident: boolean;
}

export interface ReduceCheckResult {
  nextStatus: Status;
  nextConsecutiveFailures: number;
  action: Action;
}

export function reduceCheck({
  previousStatus,
  consecutiveFailures,
  failureThreshold,
  checkSucceeded,
  isSlow,
  hasActiveIncident,
}: ReduceCheckInput): ReduceCheckResult {
  if (!checkSucceeded) {
    const nextConsecutiveFailures = consecutiveFailures + 1;

    if (nextConsecutiveFailures >= failureThreshold) {
      if (hasActiveIncident) {
        // Already confirmed down and an incident is already open - do NOT
        // send another email.
        return { nextStatus: 'down', nextConsecutiveFailures, action: 'already_down' };
      }
      return { nextStatus: 'down', nextConsecutiveFailures, action: 'start_incident' };
    }

    // Not enough consecutive failures yet - don't flip the public status,
    // to avoid false alarms from a single blip.
    return { nextStatus: previousStatus, nextConsecutiveFailures, action: 'below_threshold' };
  }

  if (hasActiveIncident) {
    return {
      nextStatus: isSlow ? 'degraded' : 'up',
      nextConsecutiveFailures: 0,
      action: 'recover_incident',
    };
  }

  if (isSlow) {
    return {
      nextStatus: 'degraded',
      nextConsecutiveFailures: 0,
      action: previousStatus === 'degraded' ? 'none' : 'became_slow',
    };
  }

  return { nextStatus: 'up', nextConsecutiveFailures: 0, action: 'none' };
}
