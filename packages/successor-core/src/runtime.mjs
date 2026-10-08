import { randomUUID } from 'node:crypto';
import {
  authorizeAction,
  authorizeJobLease,
  checkPermissionBoundary,
  minorUnits,
} from './authority.mjs';
import { requireAssurance, timestamp } from './signatures.mjs';
import { digestObject } from './integrity.mjs';

const copy = (value) => structuredClone(value);
const permissionFor = (request) => request.lease || request.authority;
function withoutOwnReservation(state, id) {
  const result = copy(state);
  delete result.actions[id];
  return result;
}

/**
 * Operator-only composition root. Requests never supply their own trust store,
 * assurance flags, clock, state path or effect driver. A SQLite reservation is
 * the dispatch linearization point; revocation after it is an in-flight event.
 * Current release intentionally has no live driver.
 */
export function createActionBroker({
  store,
  trustStore,
  driver,
  now = () => Date.now(),
  assurance,
  beforeDispatch,
} = {}) {
  requireAssurance(
    store?.transact && store?.read && trustStore && driver?.execute,
    'UNCONFIGURED_RUNTIME',
    'Broker requires protected state, trust and an explicitly configured driver'
  );
  const getAssurance = () =>
    typeof assurance === 'function' ? assurance() : copy(assurance);
  const getTrust = () =>
    typeof trustStore === 'function' ? trustStore() : trustStore;
  async function authorize(request, state) {
    const options = {
      ...request,
      trustStore: getTrust(),
      state,
      assurance: getAssurance(),
      now: now(),
    };
    return request.lease
      ? authorizeJobLease(options)
      : authorizeAction(options);
  }
  function recheck(request, decision, state, id) {
    requireAssurance(
      now() < decision.validUntil,
      'AUTHORITY_EXPIRED',
      'Signed assurance expired before dispatch'
    );
    const filtered = withoutOwnReservation(state, id);
    checkPermissionBoundary(
      request.action,
      permissionFor(request).payload,
      permissionFor(request),
      { state: filtered, assurance: getAssurance(), now: now() }
    );
    if (decision.proofDigest)
      requireAssurance(
        state.proofs[decision.proofDigest]?.status === 'current' &&
          state.proofs[decision.proofDigest]?.rightsCurrent === true &&
          state.proofs[decision.proofDigest]?.monitoringCurrent === true &&
          !state.proofs[decision.proofDigest]?.compromised &&
          state.admissions[decision.admissionDigest]?.status === 'granted' &&
          state.authorities[decision.authorityId]?.status === 'active',
        'FRESHNESS_UNAVAILABLE',
        'Current assurance was invalidated before dispatch'
      );
  }
  function incident(state, action, code, message) {
    state.stopped = true;
    const id = randomUUID();
    state.incidents.push({
      id,
      actionId: action.id,
      code,
      message,
      resolved: false,
      createdAt: new Date(now()).toISOString(),
    });
    action.incidentId = id;
  }
  async function execute(input) {
    const request = copy(input);
    requireAssurance(
      request.action && request.idempotencyKey && request.actor,
      'INVALID_DISPATCH',
      'Dispatch requires exact action, accountable actor and idempotency key'
    );
    requireAssurance(
      request.action.mode === 'fixture' && driver.mode === 'fixture',
      'UNCOMMISSIONED_RUNTIME',
      'No live effect driver is commissioned in this release'
    );
    const id = await digestObject('successor-dispatch-v1', {
      institutionId: permissionFor(request)?.context?.institutionId,
      missionId: request.action.missionId,
      idempotencyKey: request.idempotencyKey,
    });
    const requestDigest = await digestObject(
      'successor-dispatch-request-v1',
      request
    );
    const prior = store.read().actions[id];
    if (prior) {
      requireAssurance(
        prior.requestDigest === requestDigest,
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key was already bound to a different request'
      );
      return {
        ...copy(prior),
        replayed: true,
        dispatched: false,
        reconciliationRequired: ['reserved', 'dispatching', 'unknown'].includes(
          prior.status
        ),
      };
    }
    let decision = await authorize(request, store.read());
    requireAssurance(decision.allowed, decision.code, decision.reason);
    const permission = permissionFor(request).payload;
    store.transact(
      (state) => {
        requireAssurance(
          !state.actions[id],
          'DISPATCH_ALREADY_RESERVED',
          'Dispatch was concurrently reserved'
        );
        recheck(request, decision, state, id);
        const budget = state.budgets[decision.budgetId];
        requireAssurance(
          budget &&
            budget.currency === request.action.currency &&
            budget.status === 'active',
          'BUDGET_UNAVAILABLE',
          'Aggregate budget must be separately allocated by the operator'
        );
        const amount = minorUnits(request.action.costMinor);
        const reserved = minorUnits(budget.reservedMinor);
        const spent = minorUnits(budget.spentMinor);
        requireAssurance(
          reserved + spent + amount <= minorUnits(budget.limitMinor),
          'BUDGET_EXHAUSTED',
          'Concurrent liabilities exceed the aggregate budget'
        );
        budget.reservedMinor = String(reserved + amount);
        state.actions[id] = {
          id,
          requestDigest,
          actionDigest: decision.actionDigest,
          authorityId: decision.authorityId,
          permissionDigest: decision.permissionDigest,
          nonce: request.action.nonce,
          candidateDigest: request.action.candidateDigest,
          workOrderDigest: request.action.workOrderDigest || null,
          budgetId: decision.budgetId,
          reservedMinor: String(amount),
          currency: request.action.currency,
          status: 'reserved',
          createdAt: new Date(now()).toISOString(),
          effectId: id,
          attempts: 0,
        };
      },
      {
        actor: request.actor,
        reason: 'reserve exact bounded action',
        eventId: `${id}:reserve`,
      }
    );
    try {
      if (beforeDispatch) await beforeDispatch({ id, request: copy(request) });
      decision = await authorize(
        request,
        withoutOwnReservation(store.read(), id)
      );
      requireAssurance(decision.allowed, decision.code, decision.reason);
      store.transact(
        (state) => {
          requireAssurance(
            state.actions[id]?.status === 'reserved',
            'INVALID_DISPATCH_STATE',
            'Action is not pending dispatch'
          );
          recheck(request, decision, state, id);
          state.actions[id].status = 'dispatching';
          state.actions[id].attempts = 1;
          state.actions[id].dispatchedAt = new Date(now()).toISOString();
        },
        {
          actor: request.actor,
          reason: 'effect boundary authorization and outbox commit',
          eventId: `${id}:dispatch`,
        }
      );
    } catch (error) {
      store.transact(
        (state) => {
          const entry = state.actions[id];
          requireAssurance(
            entry.status === 'reserved',
            'RECONCILIATION_REQUIRED',
            'A dispatched action cannot be canceled as unexecuted'
          );
          const budget = state.budgets[entry.budgetId];
          budget.reservedMinor = String(
            minorUnits(budget.reservedMinor) - minorUnits(entry.reservedMinor)
          );
          entry.status = 'denied';
          entry.code = error.code || 'BOUNDARY_DENIED';
          entry.reason = error.message;
        },
        {
          actor: request.actor,
          reason: 'deny before external effect',
          eventId: `${id}:deny`,
        }
      );
      return { ...store.read().actions[id], dispatched: false };
    }
    let outcome;
    const controller = new AbortController();
    let timer;
    try {
      const remaining = Math.max(0, timestamp(request.action.deadline) - now());
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('bounded driver deadline exceeded'));
        }, remaining);
      });
      outcome = await Promise.race([
        Promise.resolve().then(() =>
          driver.execute({
            action: copy(request.action),
            effectId: id,
            deadline: request.action.deadline,
            signal: controller.signal,
          })
        ),
        timeout,
      ]);
    } catch {
      store.transact(
        (state) => {
          const entry = state.actions[id];
          entry.status = 'unknown';
          incident(
            state,
            entry,
            'UNKNOWN_EXTERNAL_OUTCOME',
            'Driver did not provide a confirmed outcome. Reconcile using the stable effect id; never blindly retry.'
          );
        },
        {
          actor: request.actor,
          reason: 'unknown external effect outcome',
          eventId: `${id}:unknown`,
        }
      );
      return {
        ...store.read().actions[id],
        dispatched: true,
        reconciliationRequired: true,
      };
    } finally {
      clearTimeout(timer);
    }
    return finish(id, outcome, request.actor);
  }
  function finish(id, outcome, actor) {
    const result = store.transact(
      (state) => {
        const entry = state.actions[id];
        requireAssurance(
          entry && ['dispatching', 'unknown'].includes(entry.status),
          'INVALID_RECONCILIATION',
          'Only unresolved dispatched actions may be completed'
        );
        if (
          !outcome ||
          !['completed', 'not_executed'].includes(outcome.status) ||
          outcome.effectId !== id
        ) {
          entry.status = 'unknown';
          incident(
            state,
            entry,
            'UNKNOWN_EXTERNAL_OUTCOME',
            'Missing or mismatched stable effect receipt'
          );
          return;
        }
        let actual;
        try {
          actual = minorUnits(outcome.costMinor);
        } catch {
          entry.status = 'unknown';
          incident(
            state,
            entry,
            'UNKNOWN_COST',
            'Effect cost needs reconciliation'
          );
          return;
        }
        const budget = state.budgets[entry.budgetId];
        const reserved = minorUnits(entry.reservedMinor);
        budget.reservedMinor = String(
          minorUnits(budget.reservedMinor) - reserved
        );
        budget.spentMinor = String(minorUnits(budget.spentMinor) + actual);
        entry.status = outcome.status;
        entry.costMinor = String(actual);
        entry.completedAt = new Date(now()).toISOString();
        entry.outputDigest = outcome.outputDigest || null;
        entry.cleanup = outcome.cleanup === true;
        entry.monitoring = outcome.monitoring === true;
        if (actual > reserved)
          incident(
            state,
            entry,
            'SPEND_BOUND_VIOLATION',
            'Driver exceeded reserved liability; no further effects permitted'
          );
        if (!entry.cleanup || !entry.monitoring)
          incident(
            state,
            entry,
            !entry.cleanup ? 'CLEANUP_FAILED' : 'MONITORING_LOST',
            'Effect completed without required containment assurance'
          );
      },
      {
        actor,
        reason: 'record independently observed effect result',
        eventId: `${id}:result:${randomUUID()}`,
      }
    );
    return {
      ...result.state.actions[id],
      dispatched: true,
      reconciliationRequired: result.state.actions[id].status === 'unknown',
    };
  }
  async function reconcile(id, { actor } = {}) {
    requireAssurance(
      actor && typeof driver.reconcile === 'function',
      'RECONCILIATION_UNAVAILABLE',
      'An accountable operator and query-only reconciliation driver are required'
    );
    const entry = store.read().actions[id];
    requireAssurance(
      entry && ['dispatching', 'unknown'].includes(entry.status),
      'INVALID_RECONCILIATION',
      'No unresolved dispatched action'
    );
    let outcome;
    try {
      outcome = await driver.reconcile({ effectId: entry.effectId });
    } catch {
      return { ...entry, reconciliationRequired: true };
    }
    // Reconciliation observes an existing effect and never calls execute.
    return finish(id, outcome, actor);
  }
  return {
    execute,
    reconcile,
    inspect: (id) => copy(store.read().actions[id] || null),
  };
}
