import { digestObject } from './integrity.mjs';
import { verifyProof } from './proof.mjs';
import {
  signPayload,
  verifySignedPayload,
  requireAssurance,
  timestamp,
  digestShape,
} from './signatures.mjs';

const denied = (error) => ({
  allowed: false,
  code: error.code || 'INVALID_AUTHORIZATION',
  reason: error.message,
});
const levels = ['A0', 'A1', 'A2', 'A3', 'A4'];
const effectLevels = Object.freeze({
  observe: 'A0',
  recommend: 'A1',
  'sandbox-execution': 'A2',
  'reversible-write': 'A3',
  'consequential-payment': 'A4',
});
function safeId(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value) &&
    !['__proto__', 'prototype', 'constructor'].includes(value)
  );
}
export function minorUnits(value) {
  requireAssurance(
    typeof value === 'string' && /^(0|[1-9][0-9]{0,59})$/.test(value),
    'INVALID_BUDGET',
    'Amounts must be canonical nonnegative integer strings'
  );
  return BigInt(value);
}

export function checkPermissionBoundary(
  action,
  envelope,
  record,
  { state, assurance, now }
) {
  requireAssurance(
    safeId(envelope.id) && safeId(envelope.budget?.id),
    'INVALID_AUTHORITY',
    'Permission and budget identifiers must be safe bounded identifiers'
  );
  requireAssurance(
    state &&
      typeof state.stopped === 'boolean' &&
      state.revocationEpochs &&
      state.actions,
    'UNAVAILABLE_RUNTIME_STATE',
    'Current runtime state is mandatory'
  );
  requireAssurance(!state.stopped, 'EMERGENCY_STOP', 'Runtime is stopped');
  for (const reference of [
    'workOrderDigest',
    'evidenceDigest',
    'candidateDigest',
    'taskDigest',
  ])
    for (const value of [action[reference], envelope[reference]]) {
      if (value)
        requireAssurance(
          !state.invalidatedReferences?.[value],
          'DEPENDENCY_IMPAIRED',
          `The ${reference} dependency has been invalidated`
        );
    }
  if (action.workOrderDigest) {
    const job = state.workOrders?.[action.workOrderDigest];
    requireAssurance(
      job,
      'WORK_ORDER_UNREGISTERED',
      'Exact sealed work order must resolve in protected operator state'
    );
    requireAssurance(
      job.status === 'current',
      'DEPENDENCY_IMPAIRED',
      'Registered work order is no longer current'
    );
    requireAssurance(
      timestamp(now) < timestamp(job.expiresAt),
      'RIGHTS_OR_WORK_ORDER_EXPIRED',
      'Registered work order and its rights scope have expired'
    );
    requireAssurance(
      job.missionId === action.missionId && job.principal === action.principal,
      'WORK_ORDER_BINDING_MISMATCH',
      'Registered work order belongs to a different mission or principal'
    );
    requireAssurance(
      job.permittedTools?.includes(action.tool) &&
        job.permittedActions?.includes(action.workOrderAction) &&
        !job.prohibitedActions?.includes(action.workOrderAction),
      'WORK_ORDER_SCOPE_DENIED',
      'Action exceeds the sealed work order tool or operation mask'
    );
    requireAssurance(
      job.budget?.unit === action.currency &&
        minorUnits(action.costMinor) <= minorUnits(job.budget.limitBaseUnits),
      'WORK_ORDER_BUDGET_DENIED',
      'Action exceeds the sealed job budget or changes its unit'
    );
    requireAssurance(
      Number.isSafeInteger(job.budget.maxDurationMs) &&
        job.budget.maxDurationMs > 0 &&
        timestamp(action.deadline) - timestamp(now) <= job.budget.maxDurationMs,
      'WORK_ORDER_TIME_DENIED',
      'Action deadline exceeds the sealed work duration'
    );
    const priorLiability = Object.values(state.actions)
      .filter(
        (entry) =>
          entry.workOrderDigest === action.workOrderDigest &&
          entry.status !== 'denied'
      )
      .reduce(
        (sum, entry) =>
          sum +
          minorUnits(
            ['reserved', 'dispatching', 'unknown'].includes(entry.status)
              ? entry.reservedMinor
              : entry.costMinor
          ),
        0n
      );
    requireAssurance(
      priorLiability + minorUnits(action.costMinor) <=
        minorUnits(job.budget.limitBaseUnits),
      'WORK_ORDER_BUDGET_DENIED',
      'Parallel leases cannot multiply a sealed job budget'
    );
  }
  requireAssurance(
    assurance &&
      ['monitoring', 'cleanup', 'rollback', 'freshness'].every(
        (k) => assurance[k] === true
      ),
    'ASSURANCE_UNAVAILABLE',
    'Monitoring, cleanup, rollback and freshness must be available'
  );
  requireAssurance(
    action.mode === 'fixture' || assurance.commissioned === true,
    'UNCOMMISSIONED_RUNTIME',
    'Live effect drivers require independent commissioning'
  );
  requireAssurance(
    action.missionId === record.context.missionId &&
      action.environment === record.context.environment &&
      action.mode === record.context.mode,
    'CONTEXT_MISMATCH',
    'Action context differs from signed permission'
  );
  requireAssurance(
    !action.institutionId ||
      action.institutionId === record.context.institutionId,
    'CONTEXT_MISMATCH',
    'Action institution differs from signed permission'
  );
  requireAssurance(
    action.candidateDigest === envelope.candidateDigest &&
      digestShape(action.candidateDigest),
    'RELEASE_MISMATCH',
    'Exact candidate release is required'
  );
  requireAssurance(
    levels.includes(action.level) &&
      levels.indexOf(action.level) <= levels.indexOf(envelope.level),
    'AUTHORITY_LEVEL_DENIED',
    'Action exceeds authority level'
  );
  requireAssurance(
    Object.hasOwn(effectLevels, action.effect) &&
      levels.indexOf(action.level) >=
        levels.indexOf(effectLevels[action.effect]),
    'EFFECT_CLASSIFICATION_DENIED',
    'Effect cannot understate its required authority level; unsupported effect classes require a reviewed adapter'
  );
  const current = timestamp(now);
  requireAssurance(
    current >= timestamp(envelope.notBefore) &&
      current < timestamp(envelope.expiresAt) &&
      current < timestamp(action.deadline),
    'AUTHORITY_EXPIRED',
    'Permission or action deadline is outside its valid window'
  );
  requireAssurance(
    envelope.status !== 'revoked' &&
      envelope.status !== 'suspended' &&
      (state.revocationEpochs[envelope.id] ?? 0) === envelope.revocationEpoch,
    'AUTHORITY_REVOKED',
    'Current revocation epoch differs from the signed envelope'
  );
  requireAssurance(
    Number.isSafeInteger(envelope.revocationEpoch) &&
      envelope.revocationEpoch >= 0,
    'INVALID_REVOCATION_EPOCH',
    'Invalid revocation epoch'
  );
  requireAssurance(
    action.nonce === envelope.nonce &&
      typeof action.nonce === 'string' &&
      action.nonce.length >= 8 &&
      action.nonce.length <= 200,
    'NONCE_MISMATCH',
    'Action must bind the signed nonce'
  );
  requireAssurance(
    !Object.values(state.actions).some((a) => a.nonce === action.nonce),
    'REPLAYED_NONCE',
    'This action nonce has already been reserved or used'
  );
  for (const [property, list] of [
    ['tool', 'tools'],
    ['target', 'targets'],
    ['dataClass', 'dataClasses'],
    ['effect', 'effects'],
  ]) {
    requireAssurance(
      Array.isArray(envelope.scope?.[list]) &&
        envelope.scope[list].includes(action[property]),
      'SCOPE_DENIED',
      `Action ${property} is outside the exact allowlist`
    );
  }
  requireAssurance(
    !envelope.forbiddenEffects?.includes(action.effect),
    'PROHIBITED_EFFECT',
    'Effect is explicitly prohibited'
  );
  if (['A0', 'A1'].includes(envelope.level))
    requireAssurance(
      ['observe', 'recommend'].includes(action.effect),
      'AUTHORITY_LEVEL_DENIED',
      'Observation/recommendation authority cannot perform external effects'
    );
  if (envelope.level === 'A2')
    requireAssurance(
      action.effect === 'sandbox-execution' && action.mode === 'fixture',
      'SANDBOX_ESCAPE_DENIED',
      'This release supports A2 in fixture isolation only'
    );
  requireAssurance(
    envelope.budget?.currency === action.currency &&
      typeof envelope.budget.id === 'string',
    'BUDGET_SCOPE_MISMATCH',
    'Action requires exact budget identity and currency'
  );
  requireAssurance(
    minorUnits(action.costMinor) <= minorUnits(envelope.budget.maxMinor),
    'BUDGET_EXHAUSTED',
    'Action exceeds its signed spend ceiling'
  );
  requireAssurance(
    envelope.maxActions === 1,
    'UNSUPPORTED_CAPABILITY',
    'Effect capabilities are single-use; authorize each further action separately'
  );
  return {
    allowed: true,
    code: 'AUTHORIZED',
    authorityId: envelope.id,
    budgetId: envelope.budget.id,
    maxMinor: envelope.budget.maxMinor,
    currency: action.currency,
  };
}

async function checkDigest(action, permission) {
  const actionDigest = await digestObject('successor-action-v1', action);
  requireAssurance(
    permission.actionDigest === actionDigest,
    'ACTION_DIGEST_MISMATCH',
    'Permission is bound to a different exact action'
  );
  return actionDigest;
}

// Formation leases are deliberately independent of production qualification.
// They authorize one bounded experiment, never authority for the candidate made.
export async function authorizeJobLease({
  action,
  lease,
  trustStore,
  now = Date.now(),
  state,
  assurance,
} = {}) {
  try {
    const verified = await verifySignedPayload(lease, {
      trustStore,
      purpose: 'successor.job-lease.v1',
      role: 'underwriter',
      context: lease?.context,
      now,
    });
    const permission = verified.payload;
    requireAssurance(
      permission.schemaVersion === 1 &&
        ['formation', 'evaluation', 'rehearsal'].includes(permission.kind),
      'INVALID_JOB_LEASE',
      'Unsupported job capability lease'
    );
    requireAssurance(
      permission.level === 'A2' && action.mode === 'fixture',
      'UNCOMMISSIONED_RUNTIME',
      'Current formation driver is fixture-only'
    );
    requireAssurance(
      typeof permission.principal === 'string' &&
        action.principal === permission.principal &&
        verified.key.principals?.includes(permission.principal),
      'PRINCIPAL_MISMATCH',
      'Lease principal must match action and provisioned underwriter authority'
    );
    requireAssurance(
      state?.workOrders?.[action.workOrderDigest],
      'WORK_ORDER_UNREGISTERED',
      'Exact sealed work order must resolve in protected operator state'
    );
    for (const binding of [
      'workOrderDigest',
      'taskDigest',
      'evidenceDigest',
      'deploymentId',
    ])
      requireAssurance(
        typeof permission[binding] === 'string' &&
          permission[binding] === action[binding],
        'WORK_ORDER_BINDING_MISMATCH',
        `Action has a different ${binding}`
      );
    const actionDigest = await checkDigest(action, permission);
    return {
      ...checkPermissionBoundary(action, permission, lease, {
        state,
        assurance,
        now,
      }),
      actionDigest,
      permissionDigest: verified.digest,
      validUntil: Math.min(
        timestamp(action.deadline),
        timestamp(state.workOrders[action.workOrderDigest].expiresAt),
        timestamp(permission.expiresAt),
        timestamp(verified.key.expiresAt)
      ),
    };
  } catch (error) {
    return denied(error);
  }
}

export async function admitCandidate({
  proof,
  protocol,
  candidate,
  decision,
  identity,
  trustStore,
  context,
  now = Date.now(),
}) {
  const verified = await verifyProof(proof, {
    trustStore,
    context,
    protocol,
    candidate,
    now,
    requireIndependent: true,
  });
  requireAssurance(
    ['PASS', 'NARROW_PASS'].includes(verified.payload.verdict),
    'PROOF_NOT_ADMISSIBLE',
    'Admission requires current unconditional proof within the demonstrated scope'
  );
  requireAssurance(
    decision?.schemaVersion === 1 &&
      decision.status === 'granted' &&
      decision.candidateDigest === candidate.candidateDigest &&
      decision.proofDigest === verified.digest,
    'INVALID_ADMISSION',
    'Admission must bind the exact candidate and proof'
  );
  requireAssurance(
    timestamp(decision.expiresAt) <= timestamp(verified.payload.expiresAt),
    'ADMISSION_OUTLIVES_PROOF',
    'Admission cannot outlive its proof'
  );
  requireAssurance(
    decision.scope &&
      decision.rationale &&
      decision.accountablePrincipal &&
      decision.operationalAssuranceDigest,
    'INCOMPLETE_ADMISSION',
    'Admission needs accountable ownership, rationale, scope and operational assurance'
  );
  requireAssurance(
    levels.includes(decision.maxLevel),
    'INCOMPLETE_ADMISSION',
    'Admission must declare its maximum authority posture'
  );
  for (const field of ['tools', 'targets', 'dataClasses', 'effects'])
    requireAssurance(
      Array.isArray(decision.scope[field]) &&
        decision.scope[field].every((value) =>
          verified.payload.scope[field].includes(value)
        ),
      'AUTHORITY_EXCEEDS_PROOF',
      'Admission cannot expand demonstrated scope'
    );
  const signed = await signPayload(decision, {
    identity,
    purpose: 'successor.admission.v1',
    context,
    issuedAt: new Date(timestamp(now)).toISOString(),
  });
  const principal = await verifySignedPayload(signed, {
    trustStore,
    purpose: 'successor.admission.v1',
    role: 'principal',
    context,
    now,
  });
  requireAssurance(
    principal.key.fingerprint !== verified.key.fingerprint &&
      principal.key.custodyId !== verified.key.custodyId,
    'ROLE_CONFLICT',
    'Evaluator cannot admit its own verdict or relabel its credentials'
  );
  requireAssurance(
    principal.key.principals?.includes(decision.accountablePrincipal),
    'PRINCIPAL_MISMATCH',
    'Signing key cannot act for the named accountable principal'
  );
  return signed;
}

export async function issueAuthority({
  envelope,
  admission,
  identity,
  trustStore,
  context,
  now = Date.now(),
}) {
  const admitted = await verifySignedPayload(admission, {
    trustStore,
    purpose: 'successor.admission.v1',
    role: 'principal',
    context,
    now,
  });
  requireAssurance(
    admitted.payload.status === 'granted' &&
      admitted.payload.candidateDigest === envelope.candidateDigest &&
      envelope.admissionDigest === admitted.digest,
    'ADMISSION_MISMATCH',
    'Authority must bind a granted admission'
  );
  requireAssurance(
    timestamp(envelope.expiresAt) <= timestamp(admitted.payload.expiresAt),
    'AUTHORITY_OUTLIVES_ADMISSION',
    'Authority cannot outlive admission'
  );
  requireAssurance(
    envelope.schemaVersion === 1 && levels.includes(envelope.level),
    'INVALID_AUTHORITY',
    'Invalid authority envelope'
  );
  requireAssurance(
    levels.includes(admitted.payload.maxLevel) &&
      levels.indexOf(envelope.level) <=
        levels.indexOf(admitted.payload.maxLevel),
    'AUTHORITY_LEVEL_DENIED',
    'Envelope cannot exceed the admitted authority posture'
  );
  requireAssurance(
    envelope.principal === admitted.payload.accountablePrincipal &&
      envelope.proofDigest === admitted.payload.proofDigest,
    'PRINCIPAL_MISMATCH',
    'Envelope principal and proof must match admission'
  );
  for (const field of ['tools', 'targets', 'dataClasses', 'effects'])
    requireAssurance(
      Array.isArray(envelope.scope?.[field]) &&
        envelope.scope[field].every((value) =>
          admitted.payload.scope[field].includes(value)
        ),
      'AUTHORITY_EXCEEDS_PROOF',
      'Authority cannot expand admitted scope'
    );
  const signed = await signPayload(envelope, {
    identity,
    purpose: 'successor.authority.v1',
    context,
    issuedAt: new Date(timestamp(now)).toISOString(),
  });
  const issuer = await verifySignedPayload(signed, {
    trustStore,
    purpose: 'successor.authority.v1',
    role: 'authorityIssuer',
    context,
    now,
  });
  requireAssurance(
    issuer.key.principals?.includes(envelope.principal),
    'PRINCIPAL_MISMATCH',
    'Signing key cannot issue authority for this principal'
  );
  return signed;
}

export async function authorizeAction({
  action,
  authority,
  admission,
  proof,
  candidate,
  protocol,
  trustStore,
  now = Date.now(),
  state,
  assurance,
} = {}) {
  try {
    const context = authority?.context;
    const [permission, admitted, proven] = await Promise.all([
      verifySignedPayload(authority, {
        trustStore,
        purpose: 'successor.authority.v1',
        role: 'authorityIssuer',
        context,
        now,
      }),
      verifySignedPayload(admission, {
        trustStore,
        purpose: 'successor.admission.v1',
        role: 'principal',
        context,
        now,
      }),
      verifyProof(proof, {
        trustStore,
        context,
        protocol,
        candidate,
        now,
        requireIndependent: true,
      }),
    ]);
    const envelope = permission.payload;
    requireAssurance(
      envelope.schemaVersion === 1 &&
        envelope.admissionDigest === admitted.digest &&
        envelope.proofDigest === proven.digest &&
        admitted.payload.proofDigest === proven.digest,
      'PROOF_ADMISSION_MISMATCH',
      'Authority, admission and proof are not the same decision chain'
    );
    requireAssurance(
      admitted.payload.status === 'granted' &&
        timestamp(now) < timestamp(admitted.payload.expiresAt),
      'ADMISSION_EXPIRED',
      'Admission must be granted and current'
    );
    requireAssurance(
      levels.includes(admitted.payload.maxLevel) &&
        levels.indexOf(envelope.level) <=
          levels.indexOf(admitted.payload.maxLevel),
      'AUTHORITY_LEVEL_DENIED',
      'Envelope exceeds the admitted authority posture'
    );
    requireAssurance(
      envelope.candidateDigest === admitted.payload.candidateDigest &&
        envelope.candidateDigest === proven.payload.candidateDigest,
      'RELEASE_MISMATCH',
      'Proof, admission and authority releases differ'
    );
    requireAssurance(
      ['PASS', 'NARROW_PASS'].includes(proven.payload.verdict),
      'PROOF_NOT_ADMISSIBLE',
      'Conditional or failed proof cannot authorize effects'
    );
    requireAssurance(
      admitted.key.fingerprint !== proven.key.fingerprint &&
        admitted.key.custodyId !== proven.key.custodyId,
      'ROLE_CONFLICT',
      'Admission and proof require separate credentials and custody'
    );
    requireAssurance(
      action.principal === envelope.principal &&
        action.principal === admitted.payload.accountablePrincipal &&
        admitted.key.principals?.includes(action.principal) &&
        permission.key.principals?.includes(action.principal),
      'PRINCIPAL_MISMATCH',
      'Named principal must match action, admission and provisioned signing authority'
    );
    requireAssurance(
      state?.proofs?.[proven.digest]?.status === 'current' &&
        state?.admissions?.[admitted.digest]?.status === 'granted' &&
        state?.authorities?.[envelope.id]?.status === 'active',
      'FRESHNESS_UNAVAILABLE',
      'Current proof, admission and authority state must be registered and unimpaired'
    );
    requireAssurance(
      state.proofs[proven.digest].rightsCurrent === true &&
        state.proofs[proven.digest].monitoringCurrent === true &&
        !state.proofs[proven.digest].compromised,
      'IMPAIRED_PROOF',
      'Rights, monitoring or evaluator assurance has been impaired'
    );
    for (const field of ['tools', 'targets', 'dataClasses', 'effects']) {
      const admittedScope = admitted.payload.scope?.[field];
      const proofScope = proven.payload.scope?.[field];
      requireAssurance(
        Array.isArray(envelope.scope?.[field]) &&
          Array.isArray(admittedScope) &&
          Array.isArray(proofScope) &&
          envelope.scope[field].every(
            (v) => admittedScope.includes(v) && proofScope.includes(v)
          ),
        'AUTHORITY_EXCEEDS_PROOF',
        'Authority must remain inside both admitted and demonstrated scope'
      );
    }
    if (envelope.level === 'A4') {
      requireAssurance(
        Array.isArray(envelope.approvals) && envelope.approvals.length >= 2,
        'DUAL_CONTROL_REQUIRED',
        'Consequential effects require two independent current approvals'
      );
      const approvers = [];
      for (const approval of envelope.approvals) {
        const verified = await verifySignedPayload(approval, {
          trustStore,
          purpose: 'successor.effect-approval.v1',
          role: 'effectApprover',
          context,
          now,
        });
        requireAssurance(
          verified.payload.actionDigest === envelope.actionDigest &&
            timestamp(now) < timestamp(verified.payload.expiresAt),
          'APPROVAL_MISMATCH',
          'Effect approval is stale or binds a different action'
        );
        approvers.push(verified.key);
      }
      requireAssurance(
        new Set(approvers.map((k) => k.custodyId)).size >= 2 &&
          new Set(approvers.map((k) => k.fingerprint)).size >= 2,
        'ROLE_CONFLICT',
        'Dual controls require different authorized credentials and custody domains'
      );
    }
    const actionDigest = await checkDigest(action, envelope);
    return {
      ...checkPermissionBoundary(action, envelope, authority, {
        state,
        assurance,
        now,
      }),
      actionDigest,
      permissionDigest: permission.digest,
      proofDigest: proven.digest,
      admissionDigest: admitted.digest,
      validUntil: Math.min(
        timestamp(action.deadline),
        timestamp(envelope.expiresAt),
        timestamp(admitted.payload.expiresAt),
        timestamp(proven.payload.expiresAt),
        timestamp(permission.key.expiresAt),
        timestamp(admitted.key.expiresAt),
        timestamp(proven.key.expiresAt)
      ),
    };
  } catch (error) {
    return denied(error);
  }
}

export function revokeAuthority(store, id, { actor, reason, eventId } = {}) {
  requireAssurance(
    safeId(id) && actor && reason && eventId,
    'INVALID_REVOCATION',
    'Revocation requires identity, reason and event id'
  );
  return store.transact(
    (state) => {
      state.revocationEpochs[id] = (state.revocationEpochs[id] ?? 0) + 1;
      if (state.authorities[id]) state.authorities[id].status = 'revoked';
      return state.revocationEpochs[id];
    },
    { actor, reason, eventId }
  );
}

/** Dependencies are operator-admitted references, not evidence-supplied commands. */
export function impairDependencies(
  store,
  { sourceIds, reason, actor, eventId } = {}
) {
  requireAssurance(
    Array.isArray(sourceIds) && sourceIds.length && reason && actor && eventId,
    'INVALID_IMPAIRMENT',
    'Impairment requires dependency identities and an accountable incident'
  );
  return store.transact(
    (state) => {
      const affected = new Set(sourceIds);
      let changed = true;
      while (changed) {
        changed = false;
        for (const [id, dependencies] of Object.entries(
          state.dependencies || {}
        ))
          if (!affected.has(id) && dependencies.some((d) => affected.has(d))) {
            affected.add(id);
            changed = true;
          }
        for (const [id, proof] of Object.entries(state.proofs))
          if (
            !affected.has(id) &&
            (proof.dependencies || []).some((d) => affected.has(d))
          ) {
            affected.add(id);
            changed = true;
          }
      }
      const impairedProofs = [];
      const revokedAuthorities = [];
      state.invalidatedReferences ??= {};
      for (const id of affected) {
        state.invalidatedReferences[id] = { sourceIds, reason, eventId };
        if (state.workOrders?.[id]) {
          state.workOrders[id].status = 'impaired';
          state.workOrders[id].impairment = { sourceIds, reason, eventId };
        }
      }
      for (const [id, proof] of Object.entries(state.proofs))
        if (affected.has(id)) {
          proof.status = 'impaired';
          proof.impairment = { sourceIds, reason, eventId };
          impairedProofs.push(id);
        }
      for (const [id, authority] of Object.entries(state.authorities))
        if (affected.has(id) || affected.has(authority.proofDigest)) {
          authority.status = 'suspended';
          authority.impairment = { sourceIds, reason, eventId };
          state.revocationEpochs[id] = (state.revocationEpochs[id] ?? 0) + 1;
          revokedAuthorities.push(id);
        }
      state.incidents.push({
        id: eventId,
        kind: 'ASSURANCE_IMPAIRED',
        sourceIds,
        affected: [...affected],
        impairedProofs,
        revokedAuthorities,
        reason,
        resolved: false,
      });
      return { affected: [...affected], impairedProofs, revokedAuthorities };
    },
    { actor, reason, eventId }
  );
}
