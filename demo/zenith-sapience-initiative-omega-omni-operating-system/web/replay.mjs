import { STAGES, executeStage, digest } from './engine.mjs';
function exact(v, keys) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).sort().join('|') !== [...keys].sort().join('|')
  )
    throw Error('Missing or unknown evidence fields');
}
const text = (r) => JSON.stringify(r, null, 2) + '\n';
export function reviewReplay(evidence, pins) {
  exact(evidence, [
    'schema',
    'scope',
    'records',
    'productionApproved',
    'settlementApproved',
  ]);
  if (
    evidence.schema !== 'agijobs.omega-replay-evidence.v1' ||
    typeof evidence.scope !== 'string' ||
    evidence.scope.length > 500 ||
    evidence.productionApproved !== false ||
    evidence.settlementApproved !== false ||
    !Array.isArray(evidence.records) ||
    evidence.records.length < 1 ||
    evidence.records.length > 5
  )
    throw Error('Invalid bounded replay evidence');
  let previous = null,
    previousHash = null,
    runId = null,
    options = null;
  const checks = [];
  for (let i = 0; i < evidence.records.length; i++) {
    const r = evidence.records[i];
    exact(r, [
      'schema',
      'runId',
      'stage',
      'name',
      'sourcePins',
      'options',
      'previousSha256',
      'data',
    ]);
    if (
      r.schema !== 'agijobs.omega-stage-checkpoint.v1' ||
      r.stage !== i + 1 ||
      r.name !== STAGES[i] ||
      typeof r.runId !== 'string' ||
      !/^run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        r.runId
      )
    )
      throw Error('Invalid checkpoint sequence or identity');
    exact(r.sourcePins, Object.keys(pins));
    for (const key of Object.keys(pins))
      if (r.sourcePins[key] !== pins[key])
        throw Error('Checkpoint source does not match this build');
    exact(r.options, ['injectError']);
    if (typeof r.options.injectError !== 'boolean')
      throw Error('Invalid checkpoint options');
    if (i === 0) {
      runId = r.runId;
      options = r.options;
    }
    if (
      r.runId !== runId ||
      r.options.injectError !== options.injectError ||
      r.previousSha256 !== previousHash
    )
      throw Error('Broken checkpoint identity or hash chain');
    const expected = executeStage(i, previous, options);
    if (JSON.stringify(r.data) !== JSON.stringify(expected))
      throw Error('Checkpoint differs from recomputed stage data');
    checks.push({ stage: i + 1, name: STAGES[i], passed: true });
    previous = r.data;
    previousHash = digest(text(r));
    if (i === 3 && !previous.review.accepted && evidence.records.length > 4)
      throw Error('Rejected work cannot advance');
  }
  return {
    schema: 'agijobs.omega-browser-review.v1',
    accepted: true,
    verifiedRetainedStages: evidence.records.length,
    complete: evidence.records.length === 5,
    reviewAccepted:
      evidence.records.length >= 4
        ? evidence.records[3].data.review.accepted
        : null,
    checkpointSha256: previousHash,
    checks,
    sourceConsistent: true,
    executionAttested: false,
    persistentStorageVerified: false,
    productionApproved: false,
    settlementApproved: false,
  };
}
export function advance(evidence, pins) {
  const report = reviewReplay(evidence, pins);
  if (report.complete) return structuredClone(evidence);
  if (report.reviewAccepted === false)
    throw Error('Independent review rejected this work');
  const next = structuredClone(evidence),
    i = next.records.length,
    previous = next.records.at(-1);
  next.records.push({
    schema: 'agijobs.omega-stage-checkpoint.v1',
    runId: previous.runId,
    stage: i + 1,
    name: STAGES[i],
    sourcePins: { ...pins },
    options: { ...previous.options },
    previousSha256: report.checkpointSha256,
    data: executeStage(i, previous.data, previous.options),
  });
  return next;
}
export function start(pins, injectError = false) {
  if (typeof injectError !== 'boolean') throw Error('Invalid error control');
  const runId = 'run-' + crypto.randomUUID();
  return {
    schema: 'agijobs.omega-replay-evidence.v1',
    scope:
      'browser-local deterministic code on synthetic quotes; exported replay only, no disk recovery attestation',
    records: [
      {
        schema: 'agijobs.omega-stage-checkpoint.v1',
        runId,
        stage: 1,
        name: STAGES[0],
        sourcePins: { ...pins },
        options: { injectError },
        previousSha256: null,
        data: executeStage(0, null, { injectError }),
      },
    ],
    productionApproved: false,
    settlementApproved: false,
  };
}
