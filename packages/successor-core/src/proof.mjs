import { canonicalize, digestObject } from './integrity.mjs';
import {
  signPayload,
  verifySignedPayload,
  requireAssurance,
  timestamp,
  digestShape,
} from './signatures.mjs';

export const CANDIDATE_BINDINGS = Object.freeze([
  'constitution',
  'objectives',
  'comparators',
  'programs',
  'models',
  'prompts',
  'routing',
  'tools',
  'dependencies',
  'runtime',
  'memory',
  'workflows',
  'policies',
  'humanInterventions',
  'resourceLimits',
  'proofInterface',
]);
export const COST_CATEGORIES = Object.freeze([
  'formation',
  'evidence',
  'compute',
  'integration',
  'review',
  'retries',
  'securityRights',
  'maintenance',
  'requalification',
  'dependency',
  'rollback',
  'unwind',
]);
export const INDEPENDENCE = Object.freeze(['I0', 'I1', 'I2', 'I3', 'I4']);
const scopeFields = ['tools', 'targets', 'dataClasses', 'effects'];

export async function freezeCandidate(manifest) {
  requireAssurance(
    manifest?.schemaVersion === 1 &&
      manifest.id &&
      manifest.missionId &&
      manifest.claimantOrganizationId &&
      manifest.claimantCustodyId,
    'INVALID_CANDIDATE',
    'Manifest requires version, identity and accountable claimant'
  );
  requireAssurance(
    CANDIDATE_BINDINGS.every((k) => digestShape(manifest.bindings?.[k])) &&
      Object.keys(manifest.bindings).length === CANDIDATE_BINDINGS.length,
    'INCOMPLETE_CANDIDATE',
    'All complete-system bindings must be frozen'
  );
  requireAssurance(
    Array.isArray(manifest.parentDigests) &&
      manifest.parentDigests.every(digestShape),
    'INVALID_LINEAGE',
    'Parent release references must be exact digests'
  );
  requireAssurance(
    Array.isArray(manifest.providerGuarantees),
    'INCOMPLETE_CANDIDATE',
    'Provider guarantees must be explicitly declared, including an empty list for no hosted provider'
  );
  for (const provider of manifest.providerGuarantees) {
    requireAssurance(
      provider.id && provider.kind && digestShape(provider.configurationDigest),
      'INVALID_PROVIDER_BINDING',
      'Provider identity and configuration are required'
    );
    if (provider.kind === 'opaque-hosted')
      requireAssurance(
        provider.endpoint &&
          provider.observedAt &&
          digestShape(provider.behavioralFingerprint) &&
          provider.immutableWeights === false,
        'OPAQUE_PROVIDER_GUARANTEE',
        'Opaque providers cannot claim immutable weights'
      );
  }
  requireAssurance(
    manifest.adaptation?.enabled === false ||
      (manifest.adaptation?.enabled === true &&
        [
          'learningRule',
          'writableState',
          'allowedData',
          'resetRules',
          'checkpoints',
          'invariants',
        ].every((k) => digestShape(manifest.adaptation[k]))),
    'UNDECLARED_ADAPTATION',
    'Adaptive candidates must freeze their entire learning rule and writable state contract'
  );
  requireAssurance(
    manifest.scope &&
      scopeFields.every(
        (k) => Array.isArray(manifest.scope[k]) && manifest.scope[k].length
      ),
    'INVALID_PROOF_SCOPE',
    'Candidate scope must specify tools, targets, data and effects'
  );
  const copy = JSON.parse(canonicalize(manifest));
  return {
    manifest: copy,
    candidateDigest: await digestObject('successor-candidate-v1', copy),
    state: 'FROZEN',
  };
}

export async function validateProtocol(protocol, candidate) {
  requireAssurance(
    protocol?.schemaVersion === 1 &&
      protocol.id &&
      protocol.candidateDigest === candidate?.candidateDigest,
    'PROTOCOL_BINDING_MISMATCH',
    'Protocol must bind the frozen exact candidate'
  );
  const frozen = await freezeCandidate(candidate.manifest);
  requireAssurance(
    frozen.candidateDigest === candidate.candidateDigest,
    'CANDIDATE_TAMPERED',
    'Candidate no longer matches its frozen digest'
  );
  requireAssurance(
    protocol.constitutionDigest === candidate.manifest.bindings.constitution &&
      protocol.comparatorsDigest === candidate.manifest.bindings.comparators,
    'PROTOCOL_BINDING_MISMATCH',
    'Protocol must bind constitution and complete comparator roster'
  );
  requireAssurance(
    Array.isArray(protocol.comparators) &&
      protocol.comparators.some((c) => c.kind === 'incumbent') &&
      protocol.comparators.some(
        (c) => c.kind === 'strongest-credible-alternative'
      ) &&
      protocol.comparators.every((c) => c.id && digestShape(c.digest)) &&
      new Set(protocol.comparators.map((c) => c.id)).size ===
        protocol.comparators.length,
    'MISSING_COMPARATOR',
    'Incumbent and strongest credible alternative must be versioned before testing'
  );
  requireAssurance(
    (await digestObject(
      'successor-comparator-roster-v1',
      protocol.comparators
    )) === protocol.comparatorsDigest,
    'COMPARATOR_ROSTER_MISMATCH',
    'The actual strongest-alternative roster must match the frozen manifest'
  );
  requireAssurance(
    digestShape(protocol.protectedSetCommitment) &&
      digestShape(protocol.scorerDigest) &&
      protocol.custodianOrganizationId &&
      protocol.custodianId,
    'INCOMPLETE_CUSTODY',
    'Protected set, scorer and custody must be committed'
  );
  requireAssurance(
    ['synthetic-public', 'protected'].includes(protocol.evidenceMode),
    'INVALID_EVIDENCE_MODE',
    'Evidence mode must distinguish fixtures from protected examinations'
  );
  requireAssurance(
    INDEPENDENCE.includes(protocol.requiredIndependence),
    'INVALID_INDEPENDENCE',
    'Unsupported independence level'
  );
  requireAssurance(
    Number.isSafeInteger(protocol.sampleSize) &&
      protocol.sampleSize >= 2 &&
      protocol.sampleSize <= 100000 &&
      protocol.stoppingRule === 'fixed-sample' &&
      protocol.maxAttempts === 1,
    'UNSUPPORTED_STOPPING_RULE',
    'This harness permits one preregistered fixed-sample attempt per protocol'
  );
  requireAssurance(
    protocol.confidence?.method === 'hoeffding-union-bound' &&
      Number.isFinite(protocol.confidence.alpha) &&
      protocol.confidence.alpha > 0 &&
      protocol.confidence.alpha < 0.5,
    'INVALID_CONFIDENCE_RULE',
    'Use a preregistered one-sided bounded confidence rule'
  );
  requireAssurance(
    protocol.sampling?.method === 'independent-case-groups' &&
      protocol.sampling.unit === 'one-case-per-independent-group' &&
      digestShape(protocol.sampling.assuranceDigest),
    'UNSUPPORTED_SAMPLING',
    'Hoeffding analysis requires preregistered independently sampled groups and a custodian assurance commitment'
  );
  const metric = protocol.metric;
  requireAssurance(
    metric?.name === 'paired-net-mission-gain' &&
      metric.unit &&
      metric.horizon &&
      metric.netOfAllCosts === true &&
      Number.isFinite(metric.minimum) &&
      Number.isFinite(metric.maximum) &&
      metric.maximum > metric.minimum,
    'INVALID_METRIC',
    'Net mission gain needs declared bounds, unit, horizon and full-cost accounting'
  );
  for (const key of ['requiredMargin', 'basisRiskReserve', 'proofDebtReserve'])
    requireAssurance(
      Number.isFinite(protocol[key]) && protocol[key] >= 0,
      'INVALID_MARGIN',
      `${key} must be nonnegative`
    );
  requireAssurance(
    protocol.hardGates &&
      Number.isSafeInteger(protocol.hardGates.maxCriticalMisses) &&
      protocol.hardGates.maxCriticalMisses >= 0 &&
      protocol.hardGates.maxCriticalRiskUpperBound > 0 &&
      protocol.hardGates.maxCriticalRiskUpperBound <= 1,
    'INVALID_HARD_GATES',
    'Critical error count and risk ceilings are mandatory'
  );
  requireAssurance(
    Array.isArray(protocol.requiredAssurances) &&
      ['reliability', 'sovereignty', 'governance', 'transfer'].every((k) =>
        protocol.requiredAssurances.includes(k)
      ),
    'INCOMPLETE_HARD_GATES',
    'Qualification must include reliability, sovereignty, governance and transfer'
  );
  requireAssurance(
    protocol.scope &&
      scopeFields.every(
        (k) =>
          Array.isArray(protocol.scope[k]) &&
          protocol.scope[k].every((v) =>
            candidate.manifest.scope[k].includes(v)
          )
      ),
    'INVALID_PROOF_SCOPE',
    'Protocol cannot expand the candidate scope'
  );
  requireAssurance(
    timestamp(protocol.registeredAt) < timestamp(protocol.expiresAt),
    'INVALID_PROTOCOL_WINDOW',
    'Protocol needs a finite validity window'
  );
  requireAssurance(
    Array.isArray(protocol.exclusions) && protocol.exclusions.length === 0,
    'UNSUPPORTED_EXCLUSIONS',
    'This fixed-sample harness does not permit post-hoc exclusions'
  );
  return {
    protocol: structuredClone(protocol),
    protocolDigest: await digestObject(
      'successor-evaluation-protocol-v1',
      protocol
    ),
  };
}

// Inputs are measurements from a custodied evaluator. This function does not
// turn signed statements into empirical truth, or fixtures into hidden cases.
export async function evaluateEvidence({
  protocol,
  candidate,
  evidence,
  attemptLedger = [],
}) {
  canonicalize(evidence); // reject accessors, non-JSON values and unsafe object keys before indexing
  const { protocolDigest } = await validateProtocol(protocol, candidate);
  requireAssurance(
    Array.isArray(attemptLedger) && attemptLedger.length === 0,
    'PROTOCOL_ATTEMPT_EXHAUSTED',
    'An attempted or abandoned examination needs a new preregistered protocol'
  );
  requireAssurance(
    evidence &&
      evidence.protocolDigest === protocolDigest &&
      evidence.candidateDigest === candidate.candidateDigest &&
      evidence.protectedSetCommitment === protocol.protectedSetCommitment &&
      evidence.scorerDigest === protocol.scorerDigest,
    'EVIDENCE_BINDING_MISMATCH',
    'Measurements do not match the preregistered examination'
  );
  requireAssurance(
    timestamp(evidence.startedAt) >= timestamp(protocol.registeredAt) &&
      timestamp(evidence.completedAt) >= timestamp(evidence.startedAt) &&
      timestamp(evidence.completedAt) < timestamp(protocol.expiresAt),
    'INVALID_EXAMINATION_WINDOW',
    'Examination must occur after registration and before expiry'
  );
  requireAssurance(
    evidence.costs &&
      COST_CATEGORIES.every(
        (k) =>
          evidence.costs[k] &&
          ['measured', 'invoiced', 'estimated'].includes(
            evidence.costs[k].basis
          ) &&
          typeof evidence.costs[k].amountMinor === 'string' &&
          /^(0|[1-9][0-9]*)$/.test(evidence.costs[k].amountMinor)
      ) &&
      evidence.costCurrency,
    'INCOMPLETE_COSTS',
    'Every full-cost category requires explicit value, basis and currency'
  );
  requireAssurance(
    Array.isArray(evidence.cases) &&
      evidence.cases.length <= protocol.sampleSize,
    'INVALID_SAMPLE',
    'Too many cases or malformed sample'
  );
  requireAssurance(
    new Set(evidence.cases.map((c) => c.caseCommitment)).size ===
      evidence.cases.length &&
      evidence.cases.every((c) => digestShape(c.caseCommitment)),
    'CASE_REUSE',
    'Case commitments must be unique within this examination'
  );
  requireAssurance(
    evidence.samplingAssuranceDigest === protocol.sampling.assuranceDigest &&
      evidence.cases.every(
        (c) =>
          typeof c.correlationGroup === 'string' &&
          c.correlationGroup.length > 0
      ) &&
      new Set(evidence.cases.map((c) => c.correlationGroup)).size ===
        evidence.cases.length,
    'CORRELATED_SAMPLE_UNSUPPORTED',
    'Correlated cases cannot be counted as independent observations; use one case per independently established group or a separately reviewed clustered protocol'
  );
  const failures = [];
  const impairments = [];
  for (const [flag, code] of [
    ['contaminated', 'PROTECTED_DATA_EXPOSURE'],
    ['undeclaredAdaptation', 'UNDECLARED_ADAPTATION'],
    ['crossCaseLeakage', 'CROSS_CASE_LEAKAGE'],
    ['materialProviderChange', 'PROVIDER_CHANGED'],
  ])
    if (evidence[flag] !== false) impairments.push(code);
  const n = evidence.cases.length;
  const comparisons = [];
  let criticalMisses = 0;
  let humanMinutes = 0;
  let retries = 0;
  let abstentions = 0;
  const subgroups = {};
  for (const row of evidence.cases) {
    requireAssurance(
      row.candidate &&
        Number.isFinite(row.candidate.netUtility) &&
        typeof row.candidate.criticalMiss === 'boolean' &&
        typeof row.candidate.abstained === 'boolean' &&
        Number.isFinite(row.candidate.humanMinutes) &&
        row.candidate.humanMinutes >= 0 &&
        Number.isSafeInteger(row.candidate.retries) &&
        row.candidate.retries >= 0 &&
        Number.isFinite(row.candidate.latencyMs) &&
        row.candidate.latencyMs >= 0,
      'INVALID_MEASUREMENT',
      'Each case needs measured decisions, intervention, retries and latency'
    );
    requireAssurance(
      typeof row.subgroup === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,99}$/.test(row.subgroup) &&
        !['__proto__', 'prototype', 'constructor'].includes(row.subgroup),
      'MISSING_SUBGROUP',
      'Each case must retain a safe declared subgroup'
    );
    criticalMisses += Number(row.candidate.criticalMiss);
    humanMinutes += row.candidate.humanMinutes;
    retries += row.candidate.retries;
    abstentions += Number(row.candidate.abstained);
    subgroups[row.subgroup] ??= { count: 0, criticalMisses: 0 };
    subgroups[row.subgroup].count++;
    subgroups[row.subgroup].criticalMisses += Number(
      row.candidate.criticalMiss
    );
  }
  const alphaPerComparison =
    protocol.confidence.alpha / (protocol.comparators.length + 1);
  for (const comparator of protocol.comparators) {
    const gains = evidence.cases.map((row) => {
      const other = row.comparators?.[comparator.id];
      requireAssurance(
        other &&
          other.digest === comparator.digest &&
          Number.isFinite(other.netUtility),
        'MISSING_COMPARATOR',
        'Every case needs the same frozen comparator result'
      );
      const gain = row.candidate.netUtility - other.netUtility;
      requireAssurance(
        gain >= protocol.metric.minimum && gain <= protocol.metric.maximum,
        'METRIC_OUT_OF_BOUNDS',
        'Observed paired gain exceeds preregistered bounds'
      );
      return gain;
    });
    const mean = n ? gains.reduce((a, b) => a + b, 0) / n : null;
    const radius = n
      ? (protocol.metric.maximum - protocol.metric.minimum) *
        Math.sqrt(Math.log(1 / alphaPerComparison) / (2 * n))
      : null;
    const lowerBound = n
      ? Math.max(protocol.metric.minimum, mean - radius)
      : null;
    comparisons.push({
      comparatorId: comparator.id,
      comparatorDigest: comparator.digest,
      n,
      mean,
      interval: {
        kind: 'separate-one-sided-bounds',
        decisionBound: 'lower',
        lower: lowerBound,
        upper: n ? Math.min(protocol.metric.maximum, mean + radius) : null,
      },
      confidenceMethod: protocol.confidence.method,
      alpha: alphaPerComparison,
      robustMargin: n
        ? lowerBound -
          protocol.requiredMargin -
          protocol.basisRiskReserve -
          protocol.proofDebtReserve
        : null,
    });
  }
  const criticalRiskUpperBound = n
    ? Math.min(
        1,
        criticalMisses / n +
          Math.sqrt(Math.log(1 / alphaPerComparison) / (2 * n))
      )
    : null;
  if (criticalMisses > protocol.hardGates.maxCriticalMisses)
    failures.push('CRITICAL_MISS_CEILING');
  if (
    criticalRiskUpperBound !== null &&
    criticalRiskUpperBound > protocol.hardGates.maxCriticalRiskUpperBound
  )
    failures.push('CRITICAL_RISK_CEILING');
  if (comparisons.some((c) => c.robustMargin !== null && c.robustMargin <= 0))
    failures.push('NO_DEMONSTRATED_ADVANTAGE');
  const missingAssurances = protocol.requiredAssurances.filter(
    (k) =>
      evidence.assurances?.[k]?.status !== 'pass' ||
      !digestShape(evidence.assurances[k].evidenceDigest)
  );
  const conditional =
    Array.isArray(evidence.unmetConditions) &&
    evidence.unmetConditions.length > 0;
  const complete =
    n === protocol.sampleSize &&
    n >= 2 &&
    missingAssurances.length === 0 &&
    impairments.length === 0;
  const verdict = impairments.length
    ? 'INSUFFICIENT_EVIDENCE'
    : failures.length
    ? 'FAIL'
    : !complete
    ? 'INSUFFICIENT_EVIDENCE'
    : conditional
    ? 'CONDITIONAL_PASS'
    : protocol.narrowedScope === true
    ? 'NARROW_PASS'
    : 'PASS';
  return {
    schemaVersion: 1,
    candidateDigest: candidate.candidateDigest,
    protocolDigest,
    evidenceDigest: await digestObject(
      'successor-examination-evidence-v1',
      evidence
    ),
    protectedSetCommitment: protocol.protectedSetCommitment,
    scorerDigest: protocol.scorerDigest,
    verdict,
    currency: impairments.length ? 'impaired' : 'current',
    scope: structuredClone(protocol.scope),
    comparisons,
    sampleSize: n,
    expectedSampleSize: protocol.sampleSize,
    independentGroupCount: n,
    samplingAssuranceDigest: protocol.sampling.assuranceDigest,
    criticalMisses,
    criticalRiskUpperBound,
    humanMinutes,
    retries,
    abstentions,
    subgroups,
    failures,
    impairments,
    missingAssurances,
    unmetConditions: evidence.unmetConditions || [],
    costs: structuredClone(evidence.costs),
    costCurrency: evidence.costCurrency,
    costsAlreadyInNetGain: true,
    attempts: [
      {
        protocolDigest,
        outcome: verdict,
        startedAt: evidence.startedAt,
        completedAt: evidence.completedAt,
      },
    ],
    evidenceMode: protocol.evidenceMode,
    issuedAt: evidence.completedAt,
    expiresAt: protocol.expiresAt,
    limitations:
      protocol.evidenceMode === 'synthetic-public'
        ? [
            'Public synthetic rehearsal; no independent qualification or production authority.',
            'Intervals are conditional on independent bounded sampling; unique identifiers do not prove independence.',
          ]
        : [
            'Attribution is not factual truth; assurance depends on configured evaluator custody and scope.',
            'Independent sampling is a custodian-evidenced assumption, not established merely by case identifiers.',
          ],
  };
}

/** Reserve the attempt before running analysis. Failed/abandoned attempts remain. */
export async function evaluateOnce({
  store,
  protocol,
  candidate,
  evidence,
  actor,
  eventId,
}) {
  requireAssurance(
    store?.transact && actor && eventId,
    'UNCONFIGURED_EVALUATION_LEDGER',
    'Examination requires a durable attempt ledger and accountable actor'
  );
  const { protocolDigest } = await validateProtocol(protocol, candidate);
  store.transact(
    (state) => {
      state.examinations ??= {};
      requireAssurance(
        !state.examinations[protocolDigest],
        'PROTOCOL_ATTEMPT_EXHAUSTED',
        'This fixed-sample examination was already attempted; obtain a fresh protocol and cases'
      );
      state.examinations[protocolDigest] = {
        status: 'started',
        candidateDigest: candidate.candidateDigest,
        eventId,
      };
    },
    {
      actor,
      eventId: `${eventId}:start`,
      reason: 'reserve preregistered examination attempt',
    }
  );
  try {
    const report = await evaluateEvidence({ protocol, candidate, evidence });
    store.transact(
      (state) => {
        state.examinations[protocolDigest] = {
          ...state.examinations[protocolDigest],
          status: 'completed',
          verdict: report.verdict,
          evidenceDigest: report.evidenceDigest,
        };
      },
      {
        actor,
        eventId: `${eventId}:complete`,
        reason: 'retain examination verdict including failure',
      }
    );
    return report;
  } catch (error) {
    store.transact(
      (state) => {
        state.examinations[protocolDigest] = {
          ...state.examinations[protocolDigest],
          status: 'abandoned',
          code: error.code || 'INVALID_EVIDENCE',
        };
      },
      {
        actor,
        eventId: `${eventId}:abandoned`,
        reason: 'preserve failed or abandoned examination attempt',
      }
    );
    throw error;
  }
}

export async function issueProof({
  report,
  identity,
  context,
  independence = 'I0',
  conflicts = [],
  endorsements = [],
}) {
  requireAssurance(
    INDEPENDENCE.includes(independence) && Array.isArray(conflicts),
    'INVALID_INDEPENDENCE',
    'Independence and conflict disclosures are required'
  );
  requireAssurance(
    !(
      report.evidenceMode === 'synthetic-public' &&
      INDEPENDENCE.indexOf(independence) > 1
    ),
    'FIXTURE_INDEPENDENCE_DENIED',
    'Public fixtures cannot claim independent protected evaluation'
  );
  const payload = {
    ...report,
    independence,
    conflicts,
    evaluatorOrganizationId: identity.organizationId,
    evaluatorCustodyId: identity.custodyId,
    endorsements,
  };
  return signPayload(payload, {
    identity,
    purpose: 'successor.proof.v1',
    context,
    issuedAt: report.issuedAt,
  });
}

/** Recompute every qualification gate available from the signed aggregates.
 * This detects contradictory receipts; it cannot authenticate raw measurements.
 */
export function validateProofReport(report, protocol) {
  const invalid = (condition, message) =>
    requireAssurance(condition, 'INVALID_PROOF_MEASUREMENTS', message);
  const sameNumber = (actual, expected) =>
    Number.isFinite(actual) &&
    Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected));
  const count = (value) => Number.isSafeInteger(value) && value >= 0;
  const n = report.sampleSize;
  invalid(
    count(n) &&
      n <= protocol.sampleSize &&
      report.expectedSampleSize === protocol.sampleSize,
    'Proof sample count must match its registered bound'
  );
  invalid(
    report.independentGroupCount === n &&
      report.samplingAssuranceDigest === protocol.sampling.assuranceDigest,
    'Proof must bind its independent sampling assurance'
  );
  invalid(
    count(report.criticalMisses) &&
      report.criticalMisses <= n &&
      count(report.abstentions) &&
      report.abstentions <= n &&
      count(report.retries) &&
      Number.isFinite(report.humanMinutes) &&
      report.humanMinutes >= 0,
    'Invalid failure, abstention or intervention measurements'
  );
  invalid(
    digestShape(report.evidenceDigest),
    'Evidence requires a canonical commitment'
  );
  invalid(
    report.costsAlreadyInNetGain === true &&
      typeof report.costCurrency === 'string' &&
      report.costCurrency.length > 0 &&
      report.costs &&
      Object.keys(report.costs).length === COST_CATEGORIES.length &&
      COST_CATEGORIES.every(
        (k) =>
          report.costs[k] &&
          ['measured', 'invoiced', 'estimated'].includes(
            report.costs[k].basis
          ) &&
          typeof report.costs[k].amountMinor === 'string' &&
          /^(0|[1-9][0-9]{0,59})$/.test(report.costs[k].amountMinor)
      ),
    'All cost categories must be accounted for exactly once'
  );
  invalid(
    Array.isArray(report.comparisons) &&
      report.comparisons.length === protocol.comparators.length &&
      new Set(report.comparisons.map((c) => c.comparatorId)).size ===
        protocol.comparators.length,
    'Proof must contain exactly the complete comparator roster'
  );
  const alpha = protocol.confidence.alpha / (protocol.comparators.length + 1);
  const expectedFailures = [];
  for (const comparator of protocol.comparators) {
    const row = report.comparisons.find(
      (c) => c.comparatorId === comparator.id
    );
    invalid(
      row &&
        row.comparatorDigest === comparator.digest &&
        row.n === n &&
        row.confidenceMethod === protocol.confidence.method &&
        sameNumber(row.alpha, alpha),
      'Comparator identity, sample or confidence rule differs from registration'
    );
    invalid(
      row.interval?.kind === 'separate-one-sided-bounds' &&
        row.interval?.decisionBound === 'lower',
      'Decision bounds must not be presented as a jointly covered two-sided interval'
    );
    if (n === 0) {
      invalid(
        row.mean === null &&
          row.interval?.lower === null &&
          row.interval?.upper === null &&
          row.robustMargin === null,
        'An empty sample cannot assert measured gains'
      );
      continue;
    }
    invalid(
      Number.isFinite(row.mean) &&
        row.mean >= protocol.metric.minimum &&
        row.mean <= protocol.metric.maximum,
      'Paired net gain must stay inside its declared bounds'
    );
    const radius =
      (protocol.metric.maximum - protocol.metric.minimum) *
      Math.sqrt(Math.log(1 / alpha) / (2 * n));
    const lower = Math.max(protocol.metric.minimum, row.mean - radius);
    const upper = Math.min(protocol.metric.maximum, row.mean + radius);
    const margin =
      lower -
      protocol.requiredMargin -
      protocol.basisRiskReserve -
      protocol.proofDebtReserve;
    invalid(
      sameNumber(row.interval?.lower, lower) &&
        sameNumber(row.interval?.upper, upper) &&
        sameNumber(row.robustMargin, margin),
      'Confidence interval or robust margin is inconsistent with registered arithmetic'
    );
  }
  const criticalRisk = n
    ? Math.min(
        1,
        report.criticalMisses / n + Math.sqrt(Math.log(1 / alpha) / (2 * n))
      )
    : null;
  invalid(
    n
      ? sameNumber(report.criticalRiskUpperBound, criticalRisk)
      : report.criticalRiskUpperBound === null,
    'Critical risk upper bound is inconsistent with the observed failures'
  );
  if (report.criticalMisses > protocol.hardGates.maxCriticalMisses)
    expectedFailures.push('CRITICAL_MISS_CEILING');
  if (
    criticalRisk !== null &&
    criticalRisk > protocol.hardGates.maxCriticalRiskUpperBound
  )
    expectedFailures.push('CRITICAL_RISK_CEILING');
  if (
    report.comparisons.some(
      (c) => c.robustMargin !== null && c.robustMargin <= 0
    )
  )
    expectedFailures.push('NO_DEMONSTRATED_ADVANTAGE');
  invalid(
    Array.isArray(report.failures) &&
      canonicalize(report.failures) === canonicalize(expectedFailures),
    'Declared failures contradict measured hard gates or comparative gain'
  );
  invalid(
    Array.isArray(report.impairments) &&
      new Set(report.impairments).size === report.impairments.length &&
      report.impairments.every((v) =>
        [
          'PROTECTED_DATA_EXPOSURE',
          'UNDECLARED_ADAPTATION',
          'CROSS_CASE_LEAKAGE',
          'PROVIDER_CHANGED',
        ].includes(v)
      ),
    'Proof impairments must be explicit recognized findings'
  );
  invalid(
    Array.isArray(report.missingAssurances) &&
      new Set(report.missingAssurances).size ===
        report.missingAssurances.length &&
      report.missingAssurances.every((v) =>
        protocol.requiredAssurances.includes(v)
      ) &&
      Array.isArray(report.unmetConditions) &&
      report.unmetConditions.every(
        (v) => typeof v === 'string' && v.length > 0
      ),
    'Assurance gaps and conditions must be explicit'
  );
  const groups = Object.values(report.subgroups || {});
  invalid(
    groups.every(
      (g) =>
        count(g.count) && count(g.criticalMisses) && g.criticalMisses <= g.count
    ) &&
      groups.reduce((s, g) => s + g.count, 0) === n &&
      groups.reduce((s, g) => s + g.criticalMisses, 0) ===
        report.criticalMisses,
    'Subgroup results must reconcile with the complete sample'
  );
  const complete =
    n === protocol.sampleSize &&
    n >= 2 &&
    report.missingAssurances.length === 0 &&
    report.impairments.length === 0;
  const verdict = report.impairments.length
    ? 'INSUFFICIENT_EVIDENCE'
    : expectedFailures.length
    ? 'FAIL'
    : !complete
    ? 'INSUFFICIENT_EVIDENCE'
    : report.unmetConditions.length
    ? 'CONDITIONAL_PASS'
    : protocol.narrowedScope === true
    ? 'NARROW_PASS'
    : 'PASS';
  invalid(
    report.verdict === verdict,
    'Declared verdict contradicts the registered decision rule'
  );
  invalid(
    Array.isArray(report.attempts) &&
      report.attempts.length === 1 &&
      report.attempts[0].protocolDigest === report.protocolDigest &&
      report.attempts[0].outcome === report.verdict &&
      report.attempts[0].completedAt === report.issuedAt,
    'Exactly one complete attempt must remain in the receipt'
  );
  invalid(
    timestamp(report.attempts[0].startedAt) >=
      timestamp(protocol.registeredAt) &&
      timestamp(report.attempts[0].startedAt) <= timestamp(report.issuedAt),
    'Attempt chronology contradicts registration'
  );
  return {
    verdict,
    comparisons: report.comparisons.length,
    criticalRiskUpperBound: criticalRisk,
  };
}

export async function verifyProof(
  record,
  {
    trustStore,
    context,
    candidate,
    protocol,
    now = Date.now(),
    requireIndependent = false,
  } = {}
) {
  const verified = await verifySignedPayload(record, {
    trustStore,
    purpose: 'successor.proof.v1',
    role: 'evaluator',
    context,
    now,
  });
  const report = verified.payload;
  const validated = await validateProtocol(protocol, candidate);
  requireAssurance(
    candidate.manifest.missionId === context.missionId,
    'CONTEXT_MISMATCH',
    'Frozen candidate belongs to a different mission than its signer context'
  );
  requireAssurance(
    report.schemaVersion === 1 &&
      report.candidateDigest === candidate.candidateDigest &&
      report.protocolDigest === validated.protocolDigest &&
      report.protectedSetCommitment === protocol.protectedSetCommitment &&
      report.scorerDigest === protocol.scorerDigest,
    'PROOF_BINDING_MISMATCH',
    'Proof does not bind the complete candidate and protocol'
  );
  requireAssurance(
    report.evidenceMode === protocol.evidenceMode &&
      canonicalize(report.scope) === canonicalize(protocol.scope),
    'PROOF_SCOPE_MISMATCH',
    'Proof mode and scope must exactly match the registered examination'
  );
  requireAssurance(
    timestamp(report.issuedAt) === timestamp(record.issuedAt) &&
      timestamp(report.issuedAt) >= timestamp(protocol.registeredAt) &&
      timestamp(report.issuedAt) <= timestamp(now),
    'INVALID_PROOF_TIME',
    'Proof chronology differs from its preregistered examination'
  );
  validateProofReport(report, protocol);
  requireAssurance(
    timestamp(now) < timestamp(report.expiresAt) &&
      timestamp(report.expiresAt) <= timestamp(protocol.expiresAt),
    'STALE_PROOF',
    'Proof is expired'
  );
  requireAssurance(
    report.currency === 'current' &&
      Array.isArray(report.impairments) &&
      report.impairments.length === 0,
    'IMPAIRED_PROOF',
    'Proof is impaired or unavailable'
  );
  requireAssurance(
    INDEPENDENCE.includes(report.independence) &&
      Array.isArray(report.conflicts),
    'INVALID_INDEPENDENCE',
    'Proof must disclose independence and conflicts'
  );
  requireAssurance(
    report.evaluatorOrganizationId === verified.key.organizationId &&
      report.evaluatorCustodyId === verified.key.custodyId,
    'EVALUATOR_IDENTITY_MISMATCH',
    'Evaluator identity is not established by its trusted signing key'
  );
  const maximum = INDEPENDENCE.indexOf(verified.key.maxIndependence || 'I0');
  requireAssurance(
    INDEPENDENCE.indexOf(report.independence) <= maximum,
    'UNSUPPORTED_INDEPENDENCE_CLAIM',
    'Trust root is not provisioned for this assurance level'
  );
  const level = INDEPENDENCE.indexOf(report.independence);
  requireAssurance(
    level >= INDEPENDENCE.indexOf(protocol.requiredIndependence),
    'INDEPENDENCE_REQUIRED',
    'Proof does not meet its preregistered independence requirement'
  );
  if (level >= 2)
    requireAssurance(
      verified.key.custodyId !== candidate.manifest.claimantCustodyId &&
        verified.key.custodyId === protocol.custodianId,
      'ROLE_CONFLICT',
      'Evaluator and claimant require separate protected custody'
    );
  if (level >= 3)
    requireAssurance(
      verified.key.organizationId !==
        candidate.manifest.claimantOrganizationId &&
        verified.key.organizationId === protocol.custodianOrganizationId &&
        report.evidenceMode === 'protected' &&
        context.mode === 'live' &&
        !verified.key.fixture &&
        report.conflicts.length === 0,
      'INDEPENDENCE_NOT_ESTABLISHED',
      'External independent proof needs separate governed custody, protected data and disclosed conflict clearance'
    );
  if (level === 4) {
    const endorsementDigest = await digestObject(
      'successor-proof-endorsement-v1',
      {
        candidateDigest: report.candidateDigest,
        protocolDigest: report.protocolDigest,
        evidenceDigest: report.evidenceDigest,
        verdict: report.verdict,
      }
    );
    const organizations = new Set([verified.key.organizationId]);
    const custody = new Set([verified.key.custodyId]);
    for (const endorsement of report.endorsements || []) {
      const other = await verifySignedPayload(endorsement, {
        trustStore,
        purpose: 'successor.proof-endorsement.v1',
        role: 'evaluator',
        context,
        now,
      });
      requireAssurance(
        other.payload.endorsementDigest === endorsementDigest &&
          other.key.maxIndependence &&
          INDEPENDENCE.indexOf(other.key.maxIndependence) >= 3 &&
          !other.key.fixture &&
          other.key.organizationId !==
            candidate.manifest.claimantOrganizationId,
        'INVALID_PROOF_ENDORSEMENT',
        'I4 requires separately governed trusted evaluators'
      );
      organizations.add(other.key.organizationId);
      custody.add(other.key.custodyId);
    }
    requireAssurance(
      organizations.size >= 2 && custody.size >= 2,
      'INSUFFICIENT_INDEPENDENT_EVALUATORS',
      'I4 needs multiple independent evaluator organizations and custody domains'
    );
  }
  if (requireIndependent) {
    requireAssurance(
      level >= Math.max(3, INDEPENDENCE.indexOf(protocol.requiredIndependence)),
      'INDEPENDENCE_REQUIRED',
      'Admission defaults to at least I3 independent evidence'
    );
    requireAssurance(
      ['PASS', 'NARROW_PASS'].includes(report.verdict) &&
        report.sampleSize === protocol.sampleSize &&
        report.unmetConditions?.length === 0 &&
        report.missingAssurances?.length === 0 &&
        report.failures?.length === 0,
      'PROOF_NOT_ADMISSIBLE',
      'Only complete unconditional passing evidence supports admission'
    );
  }
  return verified;
}
