import {
  workTypes,
  parseSource,
  makeWorkOrder,
  handoff,
  runAnalysis,
  capacity,
  json,
  MAX_BYTES,
} from './core.mjs';
import { reviewEvidence } from './review.mjs';
const $ = (id) => document.getElementById(id);
const count = (n) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
let corrected,
  legacy,
  currentSource,
  generation = 0,
  bundle = null;
const downloadIds = [
  'download-evidence',
  'download-csv',
  'download-report',
  'download-source',
];
function element(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = element('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function clearEvidence(message = 'Checking source and artifacts…') {
  bundle = null;
  downloadIds.forEach((id) => ($(id).disabled = true));
  for (const id of ['checks', 'result-metrics', 'analysis-table'])
    $(id).replaceChildren();
  $('review-title').textContent = 'Review in progress';
  $('review-status').textContent = message;
}
function renderAnalysis(report) {
  const metrics = [
    ['Scenario rewards', count(BigInt(report.budget.rewards))],
    [
      'Remaining after rewards',
      count(BigInt(report.budget.remainingAfterRewards)),
    ],
    ['Dependency critical path', report.criticalPathDays + ' days'],
  ];
  $('result-metrics').replaceChildren(
    ...metrics.map(([label, value]) => {
      const div = element('div');
      div.append(element('strong', value), element('span', label));
      return div;
    })
  );
  const table = element('table'),
    head = element('thead'),
    row = element('tr'),
    body = element('tbody');
  table.append(
    element(
      'caption',
      'Reconciled allocations · ' + report.currency + ' scenario units'
    )
  );
  ['Region', 'Allocation', 'Rewards', 'Headroom'].forEach((label) =>
    row.append(element('th', label))
  );
  head.append(row);
  for (const r of report.regions) {
    const tr = element('tr');
    [
      r.name,
      count(BigInt(r.allocation)),
      count(BigInt(r.rewards)),
      count(BigInt(r.headroom)),
    ].forEach((v) => tr.append(element('td', v)));
    body.append(tr);
  }
  table.append(head, body);
  $('analysis-table').append(table);
  if (report.findings.length)
    $('analysis-table').prepend(
      element('p', 'Plan findings: ' + report.findings.join(' · '), 'notice')
    );
}
async function showReview(candidate, ticket) {
  const result = await reviewEvidence(candidate, currentSource);
  if (ticket !== generation) return;
  $('checks').replaceChildren(
    ...result.checks.map((c) =>
      element(
        'li',
        (c.passed ? '✓ ' : '✕ ') + c.name,
        c.passed ? 'pass' : 'fail'
      )
    )
  );
  $('review-title').textContent = result.passed
    ? 'Artifact checks passed'
    : 'Artifact checks failed';
  $('review-status').textContent = result.passed
    ? 'Calculations reproduce against the selected source. Review the findings below; passing content checks is not live commissioning or buyer acceptance.'
    : 'Evidence rejected. Inspect the failed checks. Previous downloads are disabled.';
  if (result.passed) {
    bundle = candidate;
    renderAnalysis(
      JSON.parse(
        bundle.artifacts.find((a) => a.name === 'analysis.json').content
      )
    );
    downloadIds.forEach((id) => ($(id).disabled = false));
  }
}
async function analyzeSource(source, label) {
  const ticket = ++generation;
  currentSource = source;
  $('source-label').textContent = 'Source: ' + label;
  clearEvidence();
  try {
    await showReview(await runAnalysis(source), ticket);
  } catch (e) {
    if (ticket === generation) {
      $('review-title').textContent = 'Analysis could not complete';
      $('review-status').textContent = e.message;
    }
  }
}
function updateBrief() {
  const type = workTypes.find((t) => t.id === $('work-type').value);
  $('brief-title').textContent = type.title;
  $('brief-output').textContent = type.output;
  $('criteria').replaceChildren(...type.checks.map((c) => element('li', c)));
  $('work-status').textContent = '';
}
async function exportOrder(format) {
  if (!$('work-form').reportValidity()) return;
  // Capture all inputs before hashing, so the export is one consistent snapshot.
  const type = $('work-type').value,
    region = $('region').value;
  const options = {
    budgetUSDC: $('budget').value,
    reviewerMinutes: $('review-minutes').valueAsNumber,
    runMinutes: $('run-minutes').valueAsNumber,
  };
  const ticket = generation;
  try {
    const order = await makeWorkOrder(corrected, type, region, options);
    download(
      `${region.toLowerCase()}-${type}.${format === 'json' ? 'json' : 'md'}`,
      format === 'json' ? json(order) : handoff(order),
      format === 'json' ? 'application/json' : 'text/markdown'
    );
    if (ticket === generation)
      $('work-status').textContent =
        'Proposal downloaded. Download the task source to accompany it. Source and runtime approvals, funding and execution are separate steps.';
  } catch (e) {
    $('work-status').textContent = e.message;
  }
}
function calculate() {
  try {
    if (!$('capacity-form').checkValidity())
      throw new Error(
        'Enter valid values in every field to calculate capacity.'
      );
    const number = (id) => $(id).valueAsNumber;
    const c = capacity({
      workers: number('workers'),
      jobsPerDay: number('jobs-per-day'),
      days: number('days'),
      reviewHoursPerDay: number('review-hours'),
      reviewMinutes: number('scale-review'),
      acceptancePercent: number('acceptance'),
      annualDemand: number('demand'),
      rewardUSDC: number('reward'),
    });
    $('capacity-number').textContent = count(c.accepted);
    const lines = [
      `Worker capacity: ${count(c.workerCapacity)} jobs/year`,
      `Reviewer capacity: ${count(c.reviewCapacity)} jobs/year`,
      `Admitted: ${count(c.admitted)} · Bottleneck: ${c.bottlenecks.join(
        ' and '
      )}`,
      `Illustrative reward volume: ${count(
        c.illustrativeRewardVolumeUSDC
      )} USDC/year`,
      `Share of the assumed $40T ceiling: ${c.shareOfAssumedMarketPercent.toFixed(
        6
      )}%`,
    ];
    $('capacity-detail').replaceChildren(
      ...lines.map((line) => element('p', line))
    );
    $('capacity-status').textContent =
      'Accepted = floor(min(demand, worker capacity, review capacity) × acceptance rate).';
  } catch (e) {
    $('capacity-number').textContent = '—';
    $('capacity-detail').replaceChildren();
    $('capacity-status').textContent = e.message;
  }
}
$('capacity-form').addEventListener('submit', (e) => {
  e.preventDefault();
  calculate();
});
$('capacity-form').addEventListener('input', calculate);
$('work-form').addEventListener('submit', (e) => {
  e.preventDefault();
  exportOrder('json');
});
$('work-form').addEventListener(
  'input',
  () => ($('work-status').textContent = '')
);
$('download-handoff').addEventListener('click', () => exportOrder('md'));
$('download-task-source').addEventListener('click', () =>
  download('source-plan.json', corrected)
);
$('work-type').addEventListener('change', updateBrief);
$('run').addEventListener('click', () => {
  analyzeSource(corrected, 'corrected project plan');
  $('evidence').scrollIntoView();
});
$('legacy').addEventListener('click', () =>
  analyzeSource(legacy, 'original historical plan · expected defects')
);
$('reset').addEventListener('click', () =>
  analyzeSource(corrected, 'corrected project plan')
);
$('download-evidence').addEventListener('click', () => {
  if (bundle) download('hypernova-evidence.json', json(bundle));
});
$('download-source').addEventListener('click', () => {
  if (bundle) download('source-plan.json', currentSource);
});
for (const [id, name, type] of [
  ['download-csv', 'allocations.csv', 'text/csv'],
  ['download-report', 'report.md', 'text/markdown'],
])
  $(id).addEventListener('click', () => {
    if (bundle)
      download(
        name,
        bundle.artifacts.find((a) => a.name === name).content,
        type
      );
  });
$('receipt-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const ticket = ++generation;
  clearEvidence('Reading the selected local file…');
  try {
    if (file.size > MAX_BYTES)
      throw new Error('Choose a JSON file of at most 1 MiB.');
    const text = await file.text();
    if (ticket !== generation) return;
    await showReview(JSON.parse(text), ticket);
  } catch (error) {
    if (ticket === generation) {
      $('review-title').textContent = 'File could not be verified';
      $('review-status').textContent = error.message;
    }
  }
});
try {
  const responses = await Promise.all(
    ['project-plan.json', 'legacy-project-plan.json'].map((name) =>
      fetch(name).then((r) => {
        if (!r.ok) throw new Error('Could not load ' + name);
        return r.text();
      })
    )
  );
  [corrected, legacy] = responses;
  currentSource = corrected;
  const plan = parseSource(corrected);
  parseSource(legacy);
  $('work-type').replaceChildren(
    ...workTypes.map((t) => {
      const option = element('option', t.title);
      option.value = t.id;
      return option;
    })
  );
  $('work-type').value = 'governance-audit';
  $('region').replaceChildren(
    ...plan.regions.map((r) => {
      const option = element('option', r.name);
      option.value = r.id;
      return option;
    })
  );
  $('region').value = 'EARTH';
  const descriptions = {
    AFRICA:
      'Microgrid research, energy-data analysis and auditable planning tools.',
    AMERICAS:
      'Coastal risk models, public-data reports and resilience software.',
    APAC: 'Wind-resource analysis, demand-response models and testable simulations.',
    EU: 'Grid optimization research, digital twins and reproducible benchmarks.',
    MENA: 'Water and hydrogen models, source-linked research and scenario analysis.',
    EARTH:
      'Cross-region data quality, budget reconciliation and governance reporting.',
  };
  $('regions').replaceChildren(
    ...plan.regions.map((r, i) => {
      const card = element('article', undefined, 'region');
      card.append(
        element('span', `0${i + 1} / ${r.id}`),
        element('h3', r.name),
        element('p', descriptions[r.id])
      );
      return card;
    })
  );
  $('jobs').replaceChildren(
    ...plan.jobs.map((j) => {
      const row = element('tr');
      [
        j.title,
        j.dependencies.join(', ') || 'None',
        j.deadlineDays,
        count(BigInt(j.reward)),
      ].forEach((v) => row.append(element('td', v)));
      return row;
    })
  );
  for (const id of [
    'run',
    'legacy',
    'reset',
    'receipt-file',
    'work-type',
    'region',
    'download-task',
    'download-handoff',
    'download-task-source',
  ])
    $(id).disabled = false;
  updateBrief();
  calculate();
  $('load-status').textContent =
    'Source plan loaded. Ready for local analysis.';
  document.body.dataset.ready = 'true';
} catch (error) {
  $('load-status').textContent =
    'Unable to initialize: ' +
    error.message +
    '. Use the source and runbook links below.';
}
