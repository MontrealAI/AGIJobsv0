// Planning assumptions only. This model never authorizes or dispatches work.
export const fields = [
  ['workers', 'Scoped worker seats', 1, 1000000, 100],
  ['jobsPerDay', 'Submitted jobs / worker / day', 1, 1000, 8],
  ['days', 'Operating days / year', 1, 366, 250],
  ['reviewers', 'Independent reviewers', 0, 1000000, 25],
  ['reviewHours', 'Review hours / reviewer / day', 1, 12, 6],
  ['reviewMinutes', 'Review minutes / submitted job', 1, 480, 20],
  ['acceptancePercent', 'Accepted jobs after review (%)', 0, 100, 90],
  ['jobValueUSD', 'Assumed USD value / accepted job', 1, 10000, 100],
  [
    'marketUSD',
    'Assumed annual market (USD)',
    1,
    100000000000000,
    40000000000000,
  ],
];
export const defaults = Object.fromEntries(
  fields.map(([id, , , , value]) => [id, value])
);

export function planCapacity(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !fields.some(([id]) => id === key))
  )
    throw new Error('Use the documented planning fields.');
  for (const [id, label, min, max] of fields) {
    if (!Number.isSafeInteger(input[id]) || input[id] < min || input[id] > max)
      throw new Error(`${label}: enter a whole number from ${min} to ${max}.`);
  }
  const submitted = input.workers * input.jobsPerDay * input.days;
  const reviewCapacity = Math.floor(
    (input.reviewers * input.reviewHours * 60 * input.days) /
      input.reviewMinutes
  );
  const reviewed = Math.min(submitted, reviewCapacity);
  const accepted = Math.floor((reviewed * input.acceptancePercent) / 100);
  const valueUSD = accepted * input.jobValueUSD;
  if (
    ![submitted, reviewCapacity, reviewed, accepted, valueUSD].every(
      Number.isSafeInteger
    )
  )
    throw new Error('These assumptions exceed safe calculation bounds.');
  return {
    submitted,
    reviewCapacity,
    reviewed,
    accepted,
    valueUSD,
    backlog: submitted - reviewed,
    rejected: reviewed - accepted,
    marketPercent: (valueUSD / input.marketUSD) * 100,
    bottleneck:
      reviewCapacity < submitted ? 'Independent review' : 'Worker throughput',
    requiredReviewers: Math.ceil(
      (submitted * input.reviewMinutes) / (input.reviewHours * 60 * input.days)
    ),
  };
}

// Every draft is self-contained synthetic work. No credentials or live authority.
const example = (id, title, context, goal, criteria, deliverables) => ({
  id,
  title,
  task: {
    schemaVersion: 1,
    workerProfile: 'k2_sandbox',
    goal,
    inputText: `Synthetic exercise in an isolated operator-provided workspace. Do not contact real people, spend funds, publish, or change production systems. ${context}`,
    dataClass: 'synthetic',
    allowedOrigins: ['http://127.0.0.1:4175'],
    acceptanceCriteria: criteria,
    deliverables: deliverables.map(([name, mediaType]) => ({
      name,
      mediaType,
    })),
  },
});
export const examples = [
  example(
    'supplier',
    'Supplier comparison',
    'Buy 40 fictional sensor kits. Quotes: Stellar, USD 490/unit, delivery 7 days; Boreal, USD 530/unit, 5 days; Laurentian, USD 460/unit, 12 days. Deadline: 7 days. Prices exclude tax and shipping.',
    'Compare eligible quotes and recommend the lowest-cost supplier meeting the delivery deadline.',
    [
      'Compare all three quotes and explicitly exclude late delivery.',
      'Recommend Stellar; total USD 19600; disclose excluded costs.',
      'Include source inputs and a reproducible calculation; place no order.',
    ],
    [
      ['comparison.csv', 'text/csv'],
      ['recommendation.md', 'text/markdown'],
    ]
  ),
  example(
    'reconciliation',
    'Operations reconciliation',
    'Fictional invoice rows (id, expected USD, recorded USD): A,100,100; B,250,225; C,80,80. No bank access is provided.',
    'Reconcile the synthetic ledger and prepare a discrepancy report.',
    [
      'Identify B as USD 25 short; expected total 430 and recorded total 405.',
      'Preserve all rows and label currency, rounding and assumptions.',
      'Propose an investigation; make no payment or ledger mutation.',
    ],
    [
      ['reconciliation.csv', 'text/csv'],
      ['exceptions.md', 'text/markdown'],
    ]
  ),
  example(
    'software',
    'Software maintenance',
    'The fictional JavaScript function sum(xs) returns xs.reduce((a,b)=>a+b). Empty arrays fail. Only finite numbers should be accepted. Provide a proposed replacement in Markdown; do not edit a real repository.',
    'Produce a minimal maintenance patch and executable test instructions.',
    [
      'Empty input returns 0; [2,3] returns 5; nonfinite or nonnumeric values are rejected.',
      'Explain compatibility and include boundary tests with expected outputs.',
      'Distinguish proposed tests from tests actually executed in the sandbox.',
    ],
    [
      ['patch.md', 'text/markdown'],
      ['validation.md', 'text/markdown'],
    ]
  ),
  example(
    'api',
    'API and SDK tooling',
    'Fictional GET /jobs accepts integer limit 1..100 and optional opaque cursor. Response: {jobs: [{id: string, status: string}], nextCursor: string|null}. No endpoint is live.',
    'Design a typed client and fixture-based pagination checks.',
    [
      'Validate limits and stop when nextCursor is null.',
      'Detect repeated cursors and document bounded retries; never retry mutations blindly.',
      'Provide examples and fixtures without claiming a live integration.',
    ],
    [
      ['client-design.md', 'text/markdown'],
      ['fixtures.json', 'application/json'],
    ]
  ),
  example(
    'evaluation',
    'AI evaluation',
    'Fictional labelled outcomes: case A expected accept, predicted accept; B reject, accept; C accept, reject; D reject, reject.',
    'Create an auditable evaluation report for the synthetic classifier.',
    [
      'Report TP=1, FP=1, FN=1, TN=1; accuracy=0.5.',
      'Include per-case outcomes, metric definitions and small-sample limitations.',
      'Do not infer production model safety from four synthetic cases.',
    ],
    [
      ['cases.csv', 'text/csv'],
      ['evaluation.md', 'text/markdown'],
    ]
  ),
  example(
    'analytics',
    'Data dashboards',
    'Fictional daily completed jobs: Monday 12, Tuesday 18, Wednesday 15. Unit: jobs/day. No real customer data.',
    'Specify an accessible operational dashboard and reconcile its totals.',
    [
      'Total 45, mean 15, highest day Tuesday; preserve units.',
      'Provide a table alternative and labelled chart specification.',
      'Identify missing history and avoid forecasting from three points.',
    ],
    [
      ['dashboard.json', 'application/json'],
      ['analysis.md', 'text/markdown'],
    ]
  ),
  example(
    'documentation',
    'Executable documentation',
    'Fictional CLI: tool --input INPUT.json --output REPORT.json. Required input: {values: finite number[]}. Output: {count: integer, sum: number}. Nothing is installed automatically.',
    'Write a beginner-friendly quickstart and troubleshooting guide.',
    [
      'Include prerequisites, sample input, exact command and expected result.',
      'Include empty input and malformed input examples; label unexecuted commands.',
      'Explain how to verify output and safely clean up only generated files.',
    ],
    [
      ['quickstart.md', 'text/markdown'],
      ['sample-input.json', 'application/json'],
    ]
  ),
  example(
    'research',
    'Evidence-based research',
    'Synthetic source A: generation 120 GWh, demand 100 GWh. Synthetic source B: generation 110 GWh, demand 105 GWh. These are separate scenarios, not physical measurements.',
    'Compare the supplied scenarios and write a source-traceable briefing.',
    [
      'Calculate surplus A=20 GWh and B=5 GWh without mixing scenarios.',
      'Attribute each figure to its synthetic source and preserve units.',
      'Explain uncertainty and avoid claims of deployed energy capacity.',
    ],
    [
      ['briefing.md', 'text/markdown'],
      ['evidence.json', 'application/json'],
    ]
  ),
  example(
    'accessibility',
    'Interface quality review',
    'Fictional UI specification: icon-only Submit button without an accessible name; error shown only by red colour; keyboard focus hidden by CSS. No live site is supplied.',
    'Prepare an actionable accessibility review and verification plan.',
    [
      'Address accessible names, text error descriptions and visible keyboard focus.',
      'Provide concrete fixes and both keyboard and assistive-technology checks.',
      'Do not claim a WCAG conformance audit without testing the implementation.',
    ],
    [
      ['review.md', 'text/markdown'],
      ['checks.json', 'application/json'],
    ]
  ),
  example(
    'numerical',
    'Numerical reproducibility',
    'Synthetic values: 2, 4, 6, 8. Use population variance, not sample variance. Units: dimensionless.',
    'Produce a reproducible numerical calculation with explicit conventions.',
    [
      'Report mean 5, population variance 5, and sum 20.',
      'Show formulas, input values, arithmetic and expected outputs.',
      'State that this fixture does not validate a physical or economic model.',
    ],
    [
      ['results.json', 'application/json'],
      ['reproduction.md', 'text/markdown'],
    ]
  ),
];

export function taskDraft(id) {
  const item = examples.find((item) => item.id === id);
  if (!item) throw new Error('Unknown task example.');
  return structuredClone(item.task);
}
