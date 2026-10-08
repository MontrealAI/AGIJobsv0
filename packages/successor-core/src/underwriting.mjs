import {
  SCHEMA_VERSION,
  requireCondition,
  validateMission,
} from './domain.mjs';
import { cloneJson, digestObject } from './integrity.mjs';

export const SEIZE_STAGES = Object.freeze([
  'SURFACE',
  'EVALUATE',
  'INSTANTIATE',
  'ZERO_IN',
  'ELEVATE',
]);
export const SEIZE_MEANINGS = Object.freeze({
  SURFACE: 'Surface the succession event',
  EVALUATE: 'Evaluate the successor frontier',
  INSTANTIATE: 'Instantiate the succession constitution',
  ZERO_IN: 'Zero in on decisive proof',
  ELEVATE: 'Elevate one challenger',
});
const isDigest = (value) =>
  typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
function digests(values) {
  requireCondition(
    Array.isArray(values) &&
      values.length > 0 &&
      values.length <= 256 &&
      values.every(isDigest) &&
      new Set(values).size === values.length,
    'UNDERWRITING_EVIDENCE_INVALID',
    'Underwriting requires unique content-addressed evidence'
  );
  return [...values].sort();
}
function timestamp(value) {
  requireCondition(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(value) &&
      Number.isFinite(Date.parse(value)),
    'CLOCK_INVALID',
    'A valid attributable decision timestamp is required'
  );
}
async function bindings(mission, evidenceDigests) {
  return {
    constitution: await digestObject('successor.constitution.v1', mission),
    objective: await digestObject('successor.underwriting.objective.v1', {
      objective: mission.objective,
      hardGates: mission.hardGates,
      authorityCeiling: mission.authorityCeiling,
    }),
    comparators: await digestObject('successor.underwriting.comparators.v1', {
      incumbent: mission.incumbent,
      alternatives: mission.alternatives,
    }),
    evidence: await digestObject(
      'successor.underwriting.evidence.v1',
      digests(evidenceDigests)
    ),
  };
}
export async function createUnderwriting(
  input,
  { trigger, evidenceDigests, now = new Date().toISOString() } = {}
) {
  const mission = validateMission(input);
  timestamp(now);
  requireCondition(
    typeof trigger === 'string' &&
      trigger.trim().length > 0 &&
      trigger.length <= 16000,
    'SUCCESSION_TRIGGER_REQUIRED',
    'State the observed change and the incumbent assumption requiring review'
  );
  requireCondition(
    Date.parse(now) < Date.parse(mission.expiresAt),
    'MISSION_EXPIRED',
    'The mission is expired'
  );
  const record = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'SuccessorUnderwriting',
    underwritingId: `${mission.missionId}:underwriting:${mission.version}`,
    missionId: mission.missionId,
    principal: mission.principal,
    mode: mission.proofProtocol.mode,
    trigger,
    evidenceDigests: digests(evidenceDigests),
    bindings: await bindings(mission, evidenceDigests),
    budget: cloneJson(mission.budget),
    expiresAt: mission.expiresAt,
    stage: 'DRAFT',
    history: [],
    authorityCreated: 'NONE',
    signatureStatus: 'UNSIGNED_COMMITMENT',
    createdAt: now,
  };
  return {
    ...record,
    digest: await digestObject('successor.underwriting.v1', record),
  };
}
export async function verifyUnderwriting(
  record,
  input,
  evidenceDigests = record?.evidenceDigests
) {
  const mission = validateMission(input);
  const copy = cloneJson(record);
  requireCondition(
    copy &&
      typeof copy === 'object' &&
      !Array.isArray(copy) &&
      Object.keys(copy).every((key) =>
        [
          'schemaVersion',
          'kind',
          'underwritingId',
          'missionId',
          'principal',
          'mode',
          'trigger',
          'evidenceDigests',
          'bindings',
          'budget',
          'expiresAt',
          'stage',
          'history',
          'authorityCreated',
          'signatureStatus',
          'createdAt',
          'digest',
          'promotionRequest',
        ].includes(key)
      ),
    'UNDERWRITING_INVALID',
    'Unknown underwriting field'
  );
  requireCondition(
    copy.schemaVersion === SCHEMA_VERSION &&
      copy.kind === 'SuccessorUnderwriting' &&
      copy.authorityCreated === 'NONE',
    'UNDERWRITING_INVALID',
    'Unsupported underwriting record'
  );
  const { digest, ...payload } = copy;
  requireCondition(
    isDigest(digest) &&
      (await digestObject('successor.underwriting.v1', payload)) === digest,
    'UNDERWRITING_TAMPERED',
    'Underwriting record does not match its commitment'
  );
  requireCondition(
    Array.isArray(copy.history) &&
      copy.history.length <= SEIZE_STAGES.length &&
      copy.stage === (SEIZE_STAGES[copy.history.length - 1] ?? 'DRAFT') &&
      copy.history.every(
        (event, index) =>
          event.stage === SEIZE_STAGES[index] && event.actor === copy.principal
      ),
    'UNDERWRITING_INVALID',
    'Underwriting history must preserve the five attributable stages'
  );
  const expected = await bindings(mission, evidenceDigests);
  for (const key of Object.keys(expected))
    requireCondition(
      copy.bindings[key] === expected[key],
      'UNDERWRITING_STALE',
      'Mission, objective, comparator or evidence changed; review the commitment again',
      { changedBinding: key }
    );
  return copy;
}
export async function advanceUnderwriting(
  record,
  decision,
  { mission: input, evidenceDigests = record?.evidenceDigests } = {}
) {
  const mission = validateMission(input);
  const previous = await verifyUnderwriting(record, mission, evidenceDigests);
  const event = cloneJson(decision);
  timestamp(event.timestamp);
  requireCondition(
    event.actor === previous.principal,
    'ROLE_CONFLICT',
    'Only the named principal can record this underwriting decision'
  );
  requireCondition(
    Date.parse(event.timestamp) < Date.parse(previous.expiresAt),
    'UNDERWRITING_EXPIRED',
    'Underwriting commitment expired'
  );
  requireCondition(
    Date.parse(event.timestamp) >=
      Date.parse(previous.history.at(-1)?.timestamp ?? previous.createdAt),
    'EVENT_TIME_REGRESSION',
    'Underwriting events must be monotonic in time'
  );
  requireCondition(
    event.stage === SEIZE_STAGES[previous.history.length],
    'UNDERWRITING_STAGE_INVALID',
    'SEIZE decisions must follow the five declared stages exactly'
  );
  requireCondition(
    typeof event.reason === 'string' &&
      event.reason.trim().length > 0 &&
      event.reason.length <= 16000,
    'UNDERWRITING_REASON_REQUIRED',
    'Record the decision rationale and falsifier'
  );
  digests(event.evidenceDigests);
  requireCondition(
    event.evidenceDigests.every((digest) =>
      previous.evidenceDigests.includes(digest)
    ),
    'UNDERWRITING_STALE',
    'New evidence requires a renewed underwriting commitment'
  );
  for (const key of Object.keys(event))
    requireCondition(
      [
        'stage',
        'actor',
        'timestamp',
        'reason',
        'evidenceDigests',
        'candidateDigest',
        'experiment',
      ].includes(key),
      'SCHEMA_INVALID',
      'Unknown underwriting decision field',
      { key }
    );
  if (event.stage === 'ZERO_IN') {
    const experiment = event.experiment;
    requireCondition(
      experiment &&
        typeof experiment.question === 'string' &&
        experiment.question.trim() &&
        experiment.question.length <= 16000 &&
        typeof experiment.stopCondition === 'string' &&
        experiment.stopCondition.trim() &&
        experiment.stopCondition.length <= 16000,
      'DECISIVE_EXPERIMENT_REQUIRED',
      'State the bounded decision-changing question and stop condition'
    );
    requireCondition(
      Object.keys(experiment).every((key) =>
        ['question', 'stopCondition', 'costBaseUnits', 'unit'].includes(key)
      ),
      'SCHEMA_INVALID',
      'Unknown decisive experiment field'
    );
    requireCondition(
      typeof experiment.costBaseUnits === 'string' &&
        /^(0|[1-9][0-9]{0,29})$/.test(experiment.costBaseUnits) &&
        BigInt(experiment.costBaseUnits) <=
          BigInt(mission.budget.limitBaseUnits),
      'BUDGET_EXCEEDED',
      'The proposed evidence experiment must fit the constituted budget'
    );
    requireCondition(
      experiment.unit === mission.budget.unit,
      'BUDGET_UNIT_MISMATCH',
      'Experiment budget unit differs from the mission'
    );
  }
  if (event.stage === 'ELEVATE')
    requireCondition(
      isDigest(event.candidateDigest),
      'CANDIDATE_FREEZE_REQUIRED',
      'Elevate one exact frozen candidate digest'
    );
  const { digest: oldDigest, ...base } = previous;
  const next = {
    ...base,
    stage: event.stage,
    history: [
      ...base.history,
      {
        ...event,
        meaning: SEIZE_MEANINGS[event.stage],
        previousDigest: oldDigest,
      },
    ],
  };
  if (event.stage === 'ELEVATE') {
    const request = {
      schemaVersion: SCHEMA_VERSION,
      kind: 'PromotionRequest',
      missionId: mission.missionId,
      principal: mission.principal,
      candidateDigest: event.candidateDigest,
      bindings: cloneJson(previous.bindings),
      underwritingDigest: oldDigest,
      requestedProof: cloneJson(mission.proofProtocol),
      timestamp: event.timestamp,
      status: 'REQUESTED_NOT_PROVEN',
      authorityCreated: 'NONE',
    };
    next.promotionRequest = {
      ...request,
      digest: await digestObject('successor.promotion-request.v1', request),
    };
  }
  return {
    ...next,
    digest: await digestObject('successor.underwriting.v1', next),
  };
}
export async function createPromotionRequest(
  record,
  { mission, evidenceDigests = record?.evidenceDigests } = {}
) {
  const valid = await verifyUnderwriting(record, mission, evidenceDigests);
  requireCondition(
    valid.stage === 'ELEVATE' && valid.promotionRequest,
    'CANDIDATE_FREEZE_REQUIRED',
    'Complete attributable SEIZE review before requesting proof'
  );
  return cloneJson(valid.promotionRequest);
}
