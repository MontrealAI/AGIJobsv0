import {
  candidates,
  execute,
  matches,
  candidate,
  plan,
  market,
} from './model.mjs';
const $ = (id) => document.getElementById(id);
let source,
  sourceSha256,
  current,
  active = 0,
  recordRequest = 0;
const text = (id, value) => {
  $(id).textContent = value;
};
function download(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2) + '\n'], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function reset() {
  active++;
  current = null;
  for (const id of ['challenge', 'download-candidate', 'inject', 'stop'])
    $(id).disabled = true;
  $('run').disabled = false;
  text('lab-state', 'READY');
  text('lab-status', 'Ready. Choose Search to evaluate candidates.');
  text('program', 'Awaiting your objective');
  text('tested', '0');
  text('matched', '—');
  text('probe-result', '');
  const task = source.cases.find((item) => item.id === $('case').value);
  text('goal', task.goal);
  $('examples').replaceChildren();
  for (const example of task.training) {
    const row = document.createElement('div');
    row.className = 'example';
    for (const value of [
      JSON.stringify(example.input),
      '→',
      JSON.stringify(example.expected),
    ]) {
      const cell = document.createElement('code');
      cell.textContent = value;
      row.append(cell);
    }
    $('examples').append(row);
  }
}
$('case').addEventListener('change', reset);
$('lab-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const limit = Number($('candidate-limit').value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 400) {
    text('lab-status', 'Choose an integer candidate limit from 1 to 400.');
    return;
  }
  reset();
  const generation = ++active,
    task = source.cases.find((item) => item.id === $('case').value);
  $('run').disabled = true;
  $('stop').disabled = false;
  text('lab-state', 'SEARCHING');
  text(
    'lab-status',
    'Evaluating bounded candidates against the training examples…'
  );
  let tested = 0;
  try {
    for (const program of candidates()) {
      if (generation !== active) return;
      if (tested >= limit) break;
      tested++;
      if (matches(task, program)) {
        current = candidate(task, program, tested, sourceSha256);
        text('program', program.length ? program.join(' → ') : 'identity');
        text('matched', `${task.training.length} / ${task.training.length}`);
        text('lab-state', 'REVIEW REQUIRED');
        text(
          'lab-status',
          'Training match found. Export the candidate and challenge it with the Python reviewer before acceptance.'
        );
        for (const id of ['challenge', 'download-candidate', 'inject'])
          $(id).disabled = false;
        break;
      }
      if (tested % 4 === 0) {
        text('tested', String(tested));
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
    }
    if (!current) {
      text('lab-state', 'LIMIT REACHED');
      text(
        'lab-status',
        'No exact match within this candidate budget. No candidate is accepted. Increase the limit or revise the task.'
      );
    }
  } catch (error) {
    text('lab-state', 'ERROR');
    text('lab-status', error.message);
  } finally {
    if (generation === active) {
      text('tested', String(tested));
      $('run').disabled = false;
      $('stop').disabled = true;
    }
  }
});
$('stop').addEventListener('click', () => {
  active++;
  $('run').disabled = false;
  $('stop').disabled = true;
  text('lab-state', 'STOPPED');
  text(
    'lab-status',
    'Search stopped locally. No candidate accepted or dispatched.'
  );
});
$('challenge').addEventListener('click', () => {
  if (!current) return;
  try {
    if ($('probe').value.length > 32000) throw new Error('Input is too large.');
    const values = JSON.parse($('probe').value);
    text('probe-result', JSON.stringify(execute(values, current.operations)));
  } catch (error) {
    text('probe-result', `Cannot evaluate: ${error.message}`);
  }
});
$('download-candidate').addEventListener('click', () => {
  if (current) download('candidate.json', current);
});
$('inject').addEventListener('click', () => {
  if (!current) return;
  download('candidate-wrong.json', { ...current, operations: ['reverse'] });
  text(
    'lab-status',
    'Exported an intentionally wrong candidate. Run the Python challenger: it must reject this file even if you compute a new hash.'
  );
});
const planIds = [
  'budget',
  'worker-cost',
  'reviewer-cost',
  'review-minutes',
  'review-capacity',
  'lawful',
  'rights',
  'independent',
  'objective',
  'work-type',
];
function workOrder() {
  if (!$('objective').value.trim())
    throw new Error('Describe the deliverable and acceptance criteria.');
  const result = plan({
    budget: $('budget').value,
    workerCost: $('worker-cost').value,
    reviewerCost: $('reviewer-cost').value,
    reviewMinutes: Number($('review-minutes').value || NaN),
    reviewCapacity: Number($('review-capacity').value || NaN),
    lawful: $('lawful').checked,
    rights: $('rights').checked,
    independent: $('independent').checked,
  });
  return {
    schemaVersion: 1,
    category: $('work-type').value,
    objective: $('objective').value.trim(),
    evidenceRequired: [
      'Exact task and source hashes',
      'Editable deliverable and reproduction instructions',
      'Actual tool/session record',
      'Independent task-specific acceptance review',
      'Buyer acceptance and settlement authorization',
    ],
    authorizationAssertions: {
      lawful: $('lawful').checked,
      inputRights: $('rights').checked,
      independentReviewer: $('independent').checked,
    },
    ...result,
  };
}
function renderPlan() {
  try {
    const order = workOrder();
    text(
      'plan-status',
      order.status === 'held'
        ? `Held: ${order.reasons.join(' ')}`
        : `Ready for operator review. Estimated cost ${order.estimatedCostUsdc} USDC; unallocated ${order.unallocatedUsdc} USDC.`
    );
    $('export-order').disabled = false;
  } catch (error) {
    text('plan-status', error.message);
    $('export-order').disabled = true;
  }
}
for (const id of planIds) $(id).addEventListener('input', renderPlan);
$('export-order').addEventListener('click', () => {
  try {
    download('work-order.json', workOrder());
  } catch (error) {
    text('plan-status', error.message);
  }
});
function renderMarket() {
  try {
    const values = Object.fromEntries(
      ['addressable', 'licensed', 'reliable', 'adoption', 'fee'].map((id) => [
        id,
        $('' + id).value === '' ? NaN : Number($(id).value),
      ])
    );
    const result = market(values),
      fmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      });
    text('work-value', fmt.format(result.annualWorkValue));
    text('fee-value', fmt.format(result.annualPlatformRevenue));
    text('market-error', '');
  } catch (error) {
    text('market-error', error.message);
    text('work-value', '—');
    text('fee-value', '—');
  }
}
for (const id of ['addressable', 'licensed', 'reliable', 'adoption', 'fee'])
  $(id).addEventListener('input', renderMarket);
async function renderRecord() {
  const request = ++recordRequest,
    id = $('record').value;
  try {
    const response = await fetch(`legacy/python/${id}/report.json`);
    if (!response.ok)
      throw new Error('Record is unavailable. Rebuild the site.');
    const data = await response.json();
    if (request !== recordRequest) return;
    if (data.evidence_class !== 'seeded-simulation')
      throw new Error('Unexpected evidence classification.');
    text(
      'record-summary',
      `Final fitness ${data.final_score.toFixed(4)} · ${
        data.evolution.length
      } generations · Verification ${
        data.verification.overall_pass ? 'PASS' : 'ATTENTION'
      }. Simulation credits: ${data.reward_summary.total_reward.toLocaleString(
        'en-US'
      )}.`
    );
    $('record-link').href = `legacy/python/${id}/report.json`;
    const ns = 'http://www.w3.org/2000/svg',
      svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 320 100');
    svg.setAttribute('role', 'img');
    svg.setAttribute(
      'aria-label',
      'Best fitness per generation on a fixed zero-to-one scale'
    );
    const points = data.evolution
      .map(
        (item, i) =>
          `${10 + (i * 300) / Math.max(1, data.evolution.length - 1)},${
            90 - item.best_score * 80
          }`
      )
      .join(' ');
    const line = document.createElementNS(ns, 'polyline');
    line.setAttribute('points', points);
    line.setAttribute('stroke', '#ccabff');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-width', '2');
    svg.append(line);
    $('trajectory').replaceChildren(svg);
  } catch (error) {
    if (request === recordRequest) {
      text('record-summary', error.message);
      $('trajectory').replaceChildren();
    }
  }
}
$('record').addEventListener('change', renderRecord);
renderPlan();
renderMarket();
renderRecord();
try {
  const response = await fetch('cases.json');
  if (!response.ok) throw new Error('Unable to load laboratory fixtures.');
  const bytes = await response.arrayBuffer();
  sourceSha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (x) => x.toString(16).padStart(2, '0')
  ).join('');
  source = JSON.parse(new TextDecoder().decode(bytes));
  reset();
} catch (error) {
  text(
    'lab-status',
    `Laboratory unavailable: ${error.message} Serve the built site over HTTPS or localhost.`
  );
}
