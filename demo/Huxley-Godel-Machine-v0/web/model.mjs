export const json = (value) => JSON.stringify(value, null, 2) + '\n';
export const canonical = (value) =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
    ? '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    : JSON.stringify(value);
export async function digest(value) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical(value))
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, '0')
  ).join('');
}
function number(value, name, max = 1e15) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new Error('Invalid ' + name);
  return value;
}
function integer(value, name, max = 100000) {
  number(value, name, max);
  if (!Number.isSafeInteger(value)) throw new Error('Invalid ' + name);
  return value;
}
const close = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
function snapshot(row) {
  for (const key of ['gmv', 'cost', 'reserved_cost']) number(row[key], key);
  for (const key of ['successes', 'failures', 'pending_tasks'])
    integer(row[key], key);
  if (
    row.roi !== null &&
    (!close(number(row.roi, 'ROI'), row.cost ? row.gmv / row.cost : 0) ||
      row.cost === 0)
  )
    throw new Error('ROI does not reconcile');
  if (row.cost > 0 && row.roi === null) throw new Error('Missing ROI');
}
export function validateComparison(data) {
  if (
    !data ||
    data.schema_version !== 1 ||
    data.evidence_class !== 'seeded-simulation' ||
    data.provider_calls !== 0 ||
    data.chain_transactions !== 0 ||
    data.production_approved !== false ||
    data.settlement_approved !== false
  )
    throw new Error(
      'Use a current HGM seeded-simulation comparison.json. This viewer cannot authenticate live execution.'
    );
  integer(data.seed, 'seed', 4294967295);
  for (const key of ['hgm', 'baseline']) {
    const strategy = data[key];
    if (
      !strategy ||
      !Array.isArray(strategy.timeline) ||
      strategy.timeline.length > 100000
    )
      throw new Error('Invalid strategy timeline');
    snapshot(strategy.summary);
    if (
      !Number.isFinite(strategy.summary.profit) ||
      !close(
        strategy.summary.profit,
        strategy.summary.gmv - strategy.summary.cost
      )
    )
      throw new Error('Profit does not reconcile');
    let previous = 0;
    for (const row of strategy.timeline) {
      snapshot(row);
      integer(row.step, 'step');
      if (row.step <= previous) throw new Error('Timeline steps must increase');
      previous = row.step;
      if (!Array.isArray(row.agents) || row.agents.length > 1000)
        throw new Error('Invalid agents');
      const ids = new Set();
      for (const agent of row.agents) {
        if (
          !/^agent-\d{4,8}$/.test(agent.agent_id) ||
          ids.has(agent.agent_id) ||
          (agent.parent_id !== null && !ids.has(agent.parent_id))
        )
          throw new Error('Invalid lineage identity');
        ids.add(agent.agent_id);
        number(agent.quality, 'quality', 1);
        for (const field of [
          'direct_success',
          'direct_failure',
          'clade_success',
          'clade_failure',
          'depth',
        ])
          integer(agent[field], field);
      }
    }
    if (strategy.timeline.length) {
      const last = strategy.timeline.at(-1);
      for (const field of [
        'gmv',
        'cost',
        'reserved_cost',
        'pending_tasks',
        'successes',
        'failures',
      ])
        if (!close(last[field], strategy.summary[field]))
          throw new Error('Summary does not match final snapshot');
    } else if (strategy.summary.cost || strategy.summary.gmv)
      throw new Error('Nonzero summary needs a timeline');
    if (
      !Array.isArray(strategy.logs) ||
      strategy.logs.some((x) => typeof x !== 'string' || x.length > 2000)
    )
      throw new Error('Invalid log');
  }
  return data;
}
export async function analyse(data) {
  validateComparison(data);
  const inputs = {
    seed: data.seed,
    hgm: data.hgm.summary,
    baseline: data.baseline.summary,
  };
  const strategies = ['hgm', 'baseline'].map((id) => {
    const s = data[id].summary;
    return {
      strategy: id,
      completedCost: s.cost,
      reservedCost: s.reserved_cost,
      committedCost: s.cost + s.reserved_cost,
      simulatedGrossValue: s.gmv,
      valueLessCommittedCost: s.gmv - s.cost - s.reserved_cost,
      pendingTasks: s.pending_tasks,
    };
  });
  return {
    schemaVersion: 1,
    inputSha256: await digest(inputs),
    evidenceClass: 'simulation-analysis',
    strategies,
    preferredInThisRun:
      strategies[0].valueLessCommittedCost ===
      strategies[1].valueLessCommittedCost
        ? 'tie'
        : strategies[0].valueLessCommittedCost >
          strategies[1].valueLessCommittedCost
        ? 'hgm'
        : 'baseline',
    productionApproved: false,
    settlementApproved: false,
  };
}
export async function review(data, candidate) {
  const expected = await analyse(data);
  return {
    schemaVersion: 1,
    accepted: canonical(expected) === canonical(candidate),
    scope:
      'Source binding and exact arithmetic only; unrelated substantive review remains required.',
    inputSha256: expected.inputSha256,
    candidateSha256: await digest(candidate),
    productionApproved: false,
    settlementApproved: false,
  };
}
export async function makeTask(data) {
  const analysis = await analyse(data);
  return {
    schemaVersion: 1,
    workerProfile: 'hgm-analysis',
    goal: 'Audit the supplied HGM simulation comparison. Return benchmark-analysis.json only. Compute each strategy independently; do not claim customer work, live revenues or payments.',
    inputText: json({
      seed: data.seed,
      hgm: data.hgm.summary,
      baseline: data.baseline.summary,
      inputSha256: analysis.inputSha256,
      outputContract: {
        schemaVersion: 1,
        inputSha256: 'copy supplied digest',
        evidenceClass: 'simulation-analysis',
        strategies: [
          'hgm then baseline: strategy, completedCost=cost, reservedCost=reserved_cost, committedCost=cost+reserved_cost, simulatedGrossValue=gmv, valueLessCommittedCost=gmv-cost-reserved_cost, pendingTasks=pending_tasks',
        ],
        preferredInThisRun:
          'larger valueLessCommittedCost: hgm, baseline or tie',
        productionApproved: false,
        settlementApproved: false,
      },
    }),
    dataClass: 'synthetic',
    allowedOrigins: ['https://github.com'],
    acceptanceCriteria: [
      'Bind the exact supplied input digest and reproduce all arithmetic without rounding.',
      'Include pending reservations; retain source classification as simulation.',
      'Use the exact output structure; both approval flags must remain false.',
    ],
    deliverables: [
      { name: 'benchmark-analysis.json', mediaType: 'application/json' },
    ],
  };
}
export const jobTypes = [
  [
    'software',
    'Software & performance',
    'Patch, benchmark and reproducible test suite',
    'Demonstrate the change against a pinned baseline and pass the agreed regression tests.',
  ],
  [
    'reports',
    'Research & editable reports',
    'Source register, checked workbook and editable report',
    'Trace each claim to an approved source and reconcile every reported calculation.',
  ],
  [
    'datasets',
    'Public data pipelines',
    'Versioned dataset, schema and repeatable pipeline',
    'Record source licenses, hashes, missing-value rules and reconciliation checks.',
  ],
  [
    'interfaces',
    'Web apps & interfaces',
    'Working application and browser test evidence',
    'Complete the agreed user journeys with keyboard and responsive layout checks.',
  ],
  [
    'science',
    'Scientific reproduction',
    'Runnable numerical experiment and results',
    'Reproduce a stated result within declared tolerances, with pinned inputs.',
  ],
  [
    'evaluations',
    'AI evaluation packages',
    'Evaluation cases, scoring rules and failure report',
    'Separate held-out cases and report errors, uncertainty and reproducible scoring.',
  ],
  [
    'documents',
    'Documents & presentations',
    'Editable document, spreadsheet and slide deck',
    'Verify numbers and citations across formats and inspect rendered exports.',
  ],
  [
    'intelligence',
    'Vendor & product research',
    'Public-source comparison and decision brief',
    'Date each source and distinguish observations, estimates and recommendations.',
  ],
  [
    'tooling',
    'APIs, SDKs & tooling',
    'Tested integration, examples and setup guide',
    'Exercise success, error and recovery paths against the agreed interface.',
  ],
  [
    'operations',
    'Authorized computer workflows',
    'Completed scoped workflow with effect log',
    'Verify each permitted effect against the task contract and capture exceptions.',
  ],
];
export function workOrder(type, budget, minutes) {
  const job = jobTypes.find((x) => x[0] === type);
  if (!job) throw new Error('Select a work category.');
  integer(budget, 'budget', 1000000);
  integer(minutes, 'review minutes', 10000);
  if (!budget || !minutes)
    throw new Error('Budget and review minutes must be positive.');
  return {
    schemaVersion: 1,
    kind: 'hgm-work-order-draft',
    title: job[1],
    deliverable: job[2],
    acceptanceCriteria: [job[3]],
    budgetUsdc: budget.toFixed(6),
    reservedReviewMinutes: minutes,
    dataPolicy:
      'Approved public, licensed or synthetic non-personal inputs only',
    execution:
      'Choose and commission an authorized OpenClaw worker or an operator-led ChatGPT Work session',
    requiredBeforeAdmission: [
      'Specific buyer goal and input hashes',
      'Exact origin and app allowlists; verified runtime identity',
      'Provider, execution, review and recovery budget allocation',
      'Unrelated reviewer and measurable acceptance criteria',
      'Signer separation, stop procedure and verified settlement deployment',
    ],
    admitted: false,
    productionApproved: false,
    settlementApproved: false,
  };
}
export function marketScenario(trillions, eligiblePercent, capturePercent) {
  number(trillions, 'market', 1000);
  number(eligiblePercent, 'eligibility', 100);
  number(capturePercent, 'capture', 100);
  return (((trillions * 1e12 * eligiblePercent) / 100) * capturePercent) / 100;
}
