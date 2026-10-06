export const families = [
  {
    id: 'foundation',
    title: 'Foundation',
    focus: 'Resource-ledger and recursive-job foundations.',
    module: 'demo.kardashev_ii_omega_grade_alpha_agi_business_3',
    args: '--max-cycles 3 --no-resume',
  },
  {
    id: 'business',
    title: 'Business 3',
    focus:
      'Worker coordination, validation windows, integrity and owner controls.',
    module: 'demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo',
    args: '--cycles 3 --no-resume',
  },
  {
    id: 'omega',
    title: 'Omega',
    focus: 'An operator mission plan with recursive job graphs.',
    module: 'demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_omega',
    args: '--cycles 3 --duration 3',
  },
  {
    id: 'supreme',
    title: 'Supreme',
    focus: 'Message-bus orchestration, checkpoints and planetary telemetry.',
    module: 'demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_supreme',
    args: '--cycles 3 --no-resume --validator_commit_delay_seconds 1 --validator_reveal_delay_seconds 1',
  },
  {
    id: 'ultra',
    title: 'Ultra',
    focus: 'Mission archives and bounded orchestration with owner commands.',
    module: 'demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra',
    args: 'launch --cycles 3 --no-sim',
  },
];
export const templates = [
  {
    id: 'energy',
    title: 'Energy & scientific analysis',
    role: 'Numerical analyst',
    goal: 'Audit a synthetic energy ledger and identify every deficit.',
    input: '',
    artifact: 'analysis.json',
    criteria: [
      'Preserve each source row exactly once and compute netKwh as generated minus consumed.',
      'Report the exact total netKwh and all deficit IDs in source order.',
      'Include schemaVersion: 1, kind: energy-balance, sourceSha256, rows: [{id, netKwh}], summary: {netKwh, deficits}, productionApproved: false and settlementApproved: false. Use decimal strings for all energy amounts.',
    ],
  },
  {
    id: 'performance',
    title: 'Performance optimization',
    role: 'Performance engineer',
    goal: 'Design and benchmark a bounded optimization for a synthetic deduplication workload.',
    input:
      'Synthetic input generator: integers i % 997 for i from 0 through 99999. Preserve first-occurrence order. Compare a quadratic baseline with a set-based approach. Record runtime, versions and benchmark method; do not invent benchmark results.',
    artifact: 'benchmark.md',
    criteria: [
      'Demonstrate output equivalence including empty input and duplicates.',
      'Include runnable code, environment and measured timing or explicitly mark the benchmark unexecuted.',
    ],
  },
  {
    id: 'feature',
    title: 'Open-source features',
    role: 'Software engineer',
    goal: 'Implement an accessible CSV preview component as reviewable source text.',
    input:
      'Synthetic CSV: name,units\nSolar,12\nStorage,8. Support quoted commas, empty cells and keyboard navigation. No external data or deployment.',
    artifact: 'implementation.md',
    criteria: [
      'Include source code, build instructions and tests for quoted and malformed CSV.',
      'Explain keyboard behavior and label any checks that were not executed.',
    ],
  },
  {
    id: 'sdk',
    title: 'API & SDK tooling',
    role: 'Integration engineer',
    goal: 'Produce a typed client specification for a synthetic job-status API.',
    input:
      'GET /jobs/{id} returns {id:string,status:posted|working|review|complete}. Read-only requests only. Include timeout, cancellation and bounded GET retries; no transaction methods.',
    artifact: 'sdk.md',
    criteria: [
      'Supply runnable client code and fixture tests for each status and malformed replies.',
      'Document error handling, cancellation and limits.',
    ],
  },
  {
    id: 'tests',
    title: 'Automated testing',
    role: 'Quality engineer',
    goal: 'Write a reproducible test package for a synthetic invoice calculator.',
    input:
      'totalCents = quantity * unitCents + shippingCents. All inputs are nonnegative integers. Reject values above 1000000. Accept zero. No tax, payment or live invoice system.',
    artifact: 'tests.md',
    criteria: [
      'Cover boundaries, zero, invalid inputs and integer totals.',
      'Include runnable commands and distinguish executed tests from proposed tests.',
    ],
  },
  {
    id: 'evals',
    title: 'AI evaluation packages',
    role: 'Evaluation designer',
    goal: 'Create a synthetic evaluation set for evidence-grounded summarization.',
    input:
      'Source: Array A generated 120 kWh and consumed 90 kWh. Array B generated 50 kWh and consumed 70 kWh. Nothing is known about real-world energy production.',
    artifact: 'evaluation.json',
    criteria: [
      'Include at least five cases, expected facts and a reproducible scoring rubric.',
      'Include unsupported-claim and omission cases; do not equate this small eval with general intelligence.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Data dashboards',
    role: 'Data visualization engineer',
    goal: 'Build a small accessible dashboard from synthetic energy data.',
    input:
      'Rows: north generated=12500 consumed=8700; east generated=8400 consumed=9100; west generated=10200 consumed=6400. Units kWh. Preserve negative balances.',
    artifact: 'dashboard.md',
    criteria: [
      'Include self-contained source text and a table fallback.',
      'Show east as a deficit; disclose units and synthetic provenance.',
    ],
  },
  {
    id: 'research',
    title: 'Product intelligence',
    role: 'Research analyst',
    goal: 'Compare synthetic suppliers against an explicit delivery constraint.',
    input:
      'Quantity 40, max delivery 7 days. Boreal: 12 USDC/unit + 50 shipping, 5 days. Laurentian: 10.5/unit + 40 shipping, 12 days. Stellar: 11.5/unit + 30 shipping, 7 days. No purchases.',
    artifact: 'comparison.md',
    criteria: [
      'Show exact total costs and eligibility for all suppliers.',
      'Recommend the lowest-cost eligible supplier and disclose that all quotes are synthetic.',
    ],
  },
  {
    id: 'documents',
    title: 'Documents & executable guides',
    role: 'Technical writer',
    goal: 'Prepare an operator guide for an authorized, bounded computer-work task.',
    input:
      'Workflow: task definition, permission check, specialist execution, automated checking, independent review, separate settlement. Only public/licensed/synthetic inputs. No secrets or private files.',
    artifact: 'guide.md',
    criteria: [
      'Include prerequisites, a reproducible local example, expected outputs and stop/recovery steps.',
      'Separate artifact checking, independent review and signer approval.',
    ],
  },
  {
    id: 'reproduction',
    title: 'Numerical reproduction',
    role: 'Scientific computing specialist',
    goal: 'Reproduce a synthetic energy balance calculation with exact arithmetic.',
    input:
      'Generated kWh: [12500,8400,10200]. Consumed kWh: [8700,9100,6400]. Compute each difference, sum, and deficit indices. Explain assumptions and provide executable code.',
    artifact: 'reproduction.md',
    criteria: [
      'Report differences [3800,-700,3800] and total 6900 kWh.',
      'Provide runnable verification and separate simulated quantities from measured physical output.',
    ],
  },
];
export const energySource = {
  kind: 'energy-balance',
  goal: 'Reconcile synthetic array generation and consumption in kWh.',
  rows: [
    { id: 'north', generatedKwh: '12500', consumedKwh: '8700' },
    { id: 'east', generatedKwh: '8400', consumedKwh: '9100' },
    { id: 'west', generatedKwh: '10200', consumedKwh: '6400' },
  ],
};
