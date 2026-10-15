import { taskSourceSha256, quotes } from './fixtures.mjs';
import { parseJSON } from './json.mjs';
const keys = (o, expected, name) => {
  if (
    !o ||
    typeof o !== 'object' ||
    Array.isArray(o) ||
    Object.keys(o).sort().join('|') !== [...expected].sort().join('|')
  )
    throw Error(`${name}: unexpected or missing fields`);
};
const integer = (v, max = 1e12) => {
  if (!Number.isSafeInteger(v) || v < 0 || v > max)
    throw Error('Expected a nonnegative bounded integer');
};
const digest = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const bool = (v) => {
  if (typeof v !== 'boolean') throw Error('Expected a boolean');
};
export function validate(p) {
  keys(
    p,
    [
      'schema',
      'taskSourceSha256',
      'receipt',
      'execution',
      'usage',
      'policy',
      'productionApproved',
      'settlementApproved',
    ],
    'packet'
  );
  if (
    p.schema !== 'agijobs.supplier-evidence-desk.v1' ||
    !digest(p.taskSourceSha256)
  )
    throw Error('Invalid packet schema or task digest');
  bool(p.productionApproved);
  bool(p.settlementApproved);
  keys(p.receipt, ['artifacts'], 'receipt');
  const files = p.receipt.artifacts;
  if (!Array.isArray(files) || files.length !== 2)
    throw Error('Expected exactly two artifacts');
  for (const f of files) {
    keys(
      f,
      Object.hasOwn(f, 'mediaType')
        ? ['name', 'content', 'sha256', 'mediaType']
        : ['name', 'content', 'sha256'],
      'artifact'
    );
    if (
      typeof f.name !== 'string' ||
      !/^[A-Za-z0-9_.-]{1,80}$/.test(f.name) ||
      typeof f.content !== 'string' ||
      new TextEncoder().encode(f.content).length > 200000 ||
      !digest(f.sha256)
    )
      throw Error('Invalid artifact name, content or digest');
    if (
      Object.hasOwn(f, 'mediaType') &&
      (typeof f.mediaType !== 'string' || [...f.mediaType].length > 100)
    )
      throw Error('Invalid media type');
    if (f.name === 'comparison.json') {
      const report = parseJSON(f.content, false);
      if (
        !report ||
        typeof report !== 'object' ||
        Array.isArray(report) ||
        !Array.isArray(report.quotes) ||
        report.quotes.some(
          (q) => !q || typeof q !== 'object' || Array.isArray(q)
        )
      )
        throw Error('Comparison must contain quote objects');
    }
  }
  if (
    files
      .map((f) => f.name)
      .sort()
      .join('|') !== 'comparison.json|recommendation.md'
  )
    throw Error('Provide each expected artifact exactly once');
  keys(
    p.execution,
    [
      'mode',
      'providerCalls',
      'browserObserved',
      'externalFetches',
      'workerTerminated',
    ],
    'execution'
  );
  if (
    !['scripted-browser-lab', 'reported-live-provider'].includes(
      p.execution.mode
    )
  )
    throw Error('Invalid execution mode');
  integer(p.execution.providerCalls, 100000);
  integer(p.execution.externalFetches, 100000);
  bool(p.execution.browserObserved);
  bool(p.execution.workerTerminated);
  keys(
    p.usage,
    ['inputTokens', 'outputTokens', 'reportedCostMicrousd'],
    'usage'
  );
  for (const v of Object.values(p.usage)) if (v !== null) integer(v);
  keys(
    p.policy,
    [
      'maximumCalls',
      'maximumInputTokens',
      'maximumOutputTokens',
      'maximumCostMicrousd',
    ],
    'policy'
  );
  for (const v of Object.values(p.policy)) integer(v);
  return p;
}
export function parsePacket(text) {
  const value = parseJSON(text);
  if (value?.schema === 'agijobs.supplier-browser-evidence.v1') {
    keys(
      value,
      ['schema', 'packet', 'result', 'downloadedPacketSha256', 'hashScope'],
      'evidence'
    );
    return validate(value.packet);
  }
  return validate(value);
}
export async function sha256(text) {
  if (!globalThis.crypto?.subtle)
    throw Error('This browser requires Web Crypto to verify evidence');
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    ),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}
export async function evaluate(packet) {
  validate(packet);
  const p = structuredClone(packet),
    files = p.receipt.artifacts,
    checks = [],
    commitments = [];
  const add = (name, passed) => checks.push({ name, passed: !!passed });
  add(
    'Exactly two unique deliverables',
    files.length === 2 && new Set(files.map((f) => f.name)).size === 2
  );
  for (const f of files) {
    const actual = await sha256(f.content);
    commitments.push({ name: f.name, sha256: actual });
    add(`Integrity: ${f.name}`, actual === f.sha256);
  }
  const report = parseJSON(
    files.find((f) => f.name === 'comparison.json').content,
    false
  );
  add('Delivery limit is 7 days', report.maxDeliveryDays === 7);
  add(
    'All quotes appear once',
    Array.isArray(report.quotes) &&
      report.quotes.length === quotes.length &&
      new Set(report.quotes.map((q) => q.supplier)).size === quotes.length
  );
  for (const source of quotes) {
    const observed = report.quotes.find((q) => q.supplier === source.supplier);
    add(
      `${source.supplier}: total and eligibility`,
      observed?.totalCents ===
        source.quantity * source.unitCents + source.shippingCents &&
        observed?.eligible === source.deliveryDays <= 7
    );
  }
  const winner = quotes
    .filter((q) => q.deliveryDays <= 7)
    .sort(
      (a, b) =>
        a.quantity * a.unitCents +
        a.shippingCents -
        (b.quantity * b.unitCents + b.shippingCents)
    )[0];
  add(
    'Lowest eligible total wins',
    report.recommendedSupplier === winner.supplier
  );
  add('No purchase claimed', report.purchaseExecuted === false);
  const brief = files.find((f) => f.name === 'recommendation.md').content;
  add(
    'Brief names the recommendation and no-purchase boundary',
    brief.includes(winner.supplier) && brief.includes('No purchase')
  );
  const artifactReview = {
    schemaVersion: 1,
    reviewer: 'deterministic fixture acceptance rules',
    accepted: checks.every((c) => c.passed),
    settlementApproved: false,
    productionApproved: false,
    checks,
  };
  const ex = p.execution,
    u = p.usage,
    policy = p.policy;
  const gates = {
    artifactAcceptance: artifactReview.accepted,
    taskIdentity: p.taskSourceSha256 === taskSourceSha256,
    browserObservationReported: ex.browserObserved,
    cleanupReported: ex.workerTerminated,
    zeroExternalFetchesReported: ex.externalFetches === 0,
    callsWithinPolicy: ex.providerCalls <= policy.maximumCalls,
    usageKnown: Object.values(u).every((v) => v !== null),
    inputWithinPolicy:
      u.inputTokens !== null && u.inputTokens <= policy.maximumInputTokens,
    outputWithinPolicy:
      u.outputTokens !== null && u.outputTokens <= policy.maximumOutputTokens,
    reportedCostWithinPolicy:
      u.reportedCostMicrousd !== null &&
      u.reportedCostMicrousd <= policy.maximumCostMicrousd,
    authorityClaimsAbsent: !p.productionApproved && !p.settlementApproved,
  };
  return {
    schema: 'agijobs.supplier-evidence-desk-result.v1',
    mode: 'offline-evidence-review',
    packetComplete: Object.values(gates).every(Boolean),
    artifactReview,
    checks: gates,
    unresolvedGates: Object.keys(gates).filter((k) => !gates[k]),
    executionMode: ex.mode,
    usage: { ...u },
    policy: { ...policy },
    taskSourceSha256,
    artifactCommitments: commitments,
    executionAttested: false,
    costAttested: false,
    admitted: false,
    settlementApproved: false,
    productionApproved: false,
  };
}
