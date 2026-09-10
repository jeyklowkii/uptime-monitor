import { describe, it, expect } from 'vitest';
import { classifyCheck, reduceCheck } from '../supabase/functions/_shared/statusEngine.ts';

describe('classifyCheck', () => {
  it('treats a successful check as up', () => {
    expect(classifyCheck({ success: true })).toBe('up');
  });
  it('treats a failed check as down', () => {
    expect(classifyCheck({ success: false })).toBe('down');
  });
});

describe('reduceCheck - failure threshold', () => {
  it('does not confirm DOWN before the threshold is reached (no false alarms)', () => {
    const r1 = reduceCheck({
      previousStatus: 'up',
      consecutiveFailures: 0,
      failureThreshold: 2,
      checkSucceeded: false,
      isSlow: false,
      hasActiveIncident: false,
    });
    expect(r1.nextStatus).toBe('up');
    expect(r1.nextConsecutiveFailures).toBe(1);
    expect(r1.action).toBe('below_threshold');
  });

  it('confirms DOWN and starts an incident once the threshold is hit', () => {
    const r2 = reduceCheck({
      previousStatus: 'up',
      consecutiveFailures: 1,
      failureThreshold: 2,
      checkSucceeded: false,
      isSlow: false,
      hasActiveIncident: false,
    });
    expect(r2.nextStatus).toBe('down');
    expect(r2.nextConsecutiveFailures).toBe(2);
    expect(r2.action).toBe('start_incident');
  });
});

describe('reduceCheck - duplicate email prevention', () => {
  it('the exact spec scenario: UP -> 2 failures -> DOWN email -> repeated failures -> no more emails -> recovery email', () => {
    let state = { status: 'up', failures: 0, hasIncident: false };
    const events: string[] = [];

    function check(succeeded: boolean) {
      const r = reduceCheck({
        previousStatus: state.status as any,
        consecutiveFailures: state.failures,
        failureThreshold: 2,
        checkSucceeded: succeeded,
        isSlow: false,
        hasActiveIncident: state.hasIncident,
      });
      state.status = r.nextStatus;
      state.failures = r.nextConsecutiveFailures;
      if (r.action === 'start_incident') state.hasIncident = true;
      if (r.action === 'recover_incident') state.hasIncident = false;
      events.push(r.action);
    }

    check(false); // 1st failure
    check(false); // 2nd failure -> DOWN email
    check(false); // still down
    check(false); // still down
    check(true); // recovers -> RECOVERY email

    expect(events).toEqual(['below_threshold', 'start_incident', 'already_down', 'already_down', 'recover_incident']);
    expect(events.filter((a) => a === 'start_incident')).toHaveLength(1);
    expect(events.filter((a) => a === 'recover_incident')).toHaveLength(1);
  });

  it('allows a second DOWN email for a brand-new incident after recovery', () => {
    const afterRecovery = reduceCheck({
      previousStatus: 'up',
      consecutiveFailures: 0,
      failureThreshold: 2,
      checkSucceeded: false,
      isSlow: false,
      hasActiveIncident: false,
    });
    expect(afterRecovery.action).toBe('below_threshold');

    const confirmedAgain = reduceCheck({
      previousStatus: 'up',
      consecutiveFailures: 1,
      failureThreshold: 2,
      checkSucceeded: false,
      isSlow: false,
      hasActiveIncident: false,
    });
    expect(confirmedAgain.action).toBe('start_incident');
  });
});

describe('reduceCheck - slow / degraded', () => {
  it('reports "became_slow" only on the transition into degraded, not on every slow check', () => {
    const first = reduceCheck({
      previousStatus: 'up',
      consecutiveFailures: 0,
      failureThreshold: 2,
      checkSucceeded: true,
      isSlow: true,
      hasActiveIncident: false,
    });
    expect(first.nextStatus).toBe('degraded');
    expect(first.action).toBe('became_slow');

    const second = reduceCheck({
      previousStatus: 'degraded',
      consecutiveFailures: 0,
      failureThreshold: 2,
      checkSucceeded: true,
      isSlow: true,
      hasActiveIncident: false,
    });
    expect(second.action).toBe('none');
  });

  it('resets consecutive failures to 0 on any successful check', () => {
    const r = reduceCheck({
      previousStatus: 'down',
      consecutiveFailures: 5,
      failureThreshold: 2,
      checkSucceeded: true,
      isSlow: false,
      hasActiveIncident: true,
    });
    expect(r.nextConsecutiveFailures).toBe(0);
  });
});
