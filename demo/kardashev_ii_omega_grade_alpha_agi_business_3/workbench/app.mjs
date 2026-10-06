import { families, templates } from './catalog.mjs';
import {
  makeTask,
  taskDigest,
  capacity,
  createExample,
  reviewEvidence,
  sha256,
  json,
} from './core.mjs';
const $ = (id) => document.getElementById(id);
let selected = 'energy',
  task,
  evidence,
  revision = 0;
function download(name, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function item(parent, tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  parent.append(element);
  return element;
}
async function renderTask() {
  const ticket = ++revision;
  $('download-task').disabled = true;
  $('task-message').textContent = '';
  const next = await makeTask(selected, $('family').value);
  const digest = await taskDigest(next);
  if (ticket !== revision) return;
  task = next;
  const template = templates.find((t) => t.id === selected);
  $('task-role').textContent = template.role;
  $('task-title').textContent = template.title;
  $('task-goal').textContent = task.goal;
  $('criteria').replaceChildren();
  task.acceptanceCriteria.forEach((x) => item($('criteria'), 'li', x));
  $('artifact').textContent = task.deliverables[0].name;
  $('task-json').textContent = json(task);
  $('task-digest').textContent = digest;
  document
    .querySelectorAll('.template')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.id === selected))
    );
  $('download-task').disabled = false;
}
function clearEvidence() {
  evidence = undefined;
  $('download-evidence').disabled = true;
  $('checks').replaceChildren();
  $('review-title').textContent = 'Ready for an artifact';
  $('review-status').textContent =
    'Run the example or open an energy-task receipt for the selected simulation lens.';
}
async function showReview(receipt, family) {
  const verdict = await reviewEvidence(
    receipt,
    await makeTask('energy', family)
  );
  if (family !== $('family').value) return;
  $('review-title').textContent = verdict.accepted
    ? 'Artifact checks passed'
    : 'Artifact checks failed';
  $('review-status').textContent = verdict.accepted
    ? 'Exact balances and hashes verified. Independent review is required. Settlement is not approved.'
    : 'The artifact failed verification. Do not accept or settle this work.';
  $('checks').replaceChildren();
  verdict.checks.forEach((c) =>
    item(
      $('checks'),
      'li',
      (c.passed ? '✓ ' : '× ') + c.label,
      c.passed ? 'pass' : 'fail'
    )
  );
  evidence = receipt;
  $('download-evidence').disabled = false;
}
function updateCapacity() {
  try {
    const form = $('capacity-form');
    const values = Object.fromEntries(
      Array.from(form.elements)
        .filter((e) => e.name)
        .map((e) => [e.name, e.value === '' ? NaN : Number(e.value)])
    );
    const result = capacity(values);
    $('annual-volume').textContent = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(result.annualVolumeUsdc);
    $('jobs-day').textContent = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(result.jobsDay);
    $('bottleneck').textContent = result.bottleneck;
    $('capacity-error').textContent = '';
  } catch (error) {
    $('annual-volume').textContent = '—';
    $('jobs-day').textContent = '—';
    $('bottleneck').textContent = 'Check inputs';
    $('capacity-error').textContent = error.message;
  }
}
for (const family of families) {
  const option = item($('family'), 'option', family.title);
  option.value = family.id;
  const card = item($('engine-cards'), 'article', '', 'engine-card');
  item(card, 'p', 'SIMULATION ENGINE', 'eyebrow');
  item(card, 'h3', family.title);
  item(card, 'p', family.focus);
  const command = `python -m ${family.module} ${family.args}`;
  item(card, 'code', command);
  const copy = item(card, 'button', 'Copy launch command', 'text-button');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(command);
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select and copy the command above';
    }
  });
  const link = item(card, 'a', 'Guide, architecture & source ↗');
  link.href = `https://github.com/MontrealAI/AGIJobsv0/tree/main/${family.module.replaceAll(
    '.',
    '/'
  )}`;
}
for (const [i, template] of templates.entries()) {
  const button = item($('templates'), 'button', '', 'template');
  button.type = 'button';
  button.dataset.id = template.id;
  item(button, 'span', String(i + 1).padStart(2, '0'));
  button.append(document.createTextNode(template.title));
  button.addEventListener('click', () => {
    selected = template.id;
    renderTask().catch(reportError);
  });
}
function reportError(error) {
  $('task-message').textContent = error.message;
}
$('family').addEventListener('change', () => {
  clearEvidence();
  renderTask().catch(reportError);
});
$('download-task').addEventListener('click', () => {
  if (task) download('task.json', json(task));
});
for (const [id, tamper] of [
  ['run-example', false],
  ['tamper-example', true],
])
  $(id).addEventListener('click', async () => {
    const family = $('family').value;
    try {
      const receipt = await createExample(family);
      if (tamper) {
        const candidate = JSON.parse(receipt.artifacts[0].content);
        candidate.summary.netKwh = '999999';
        const content = json(candidate);
        receipt.artifacts[0].content = content;
        receipt.artifacts[0].sha256 = await sha256(content);
        receipt.artifacts[0].bytes = new TextEncoder().encode(content).length;
      }
      await showReview(receipt, family);
    } catch {
      $('review-status').textContent = 'Unable to check this example.';
    }
  });
$('download-evidence').addEventListener('click', () => {
  if (evidence) download('evidence.json', json(evidence));
});
$('receipt-file').addEventListener('change', async (event) => {
  const file = event.target.files[0],
    family = $('family').value;
  if (!file) return;
  try {
    if (file.size > 262144) throw new Error('oversize');
    await showReview(JSON.parse(await file.text()), family);
  } catch {
    clearEvidence();
    $('review-title').textContent = 'File could not be verified';
    $('review-status').textContent =
      'Use valid JSON under 256 KiB with the required receipt and artifact fields.';
  }
  event.target.value = '';
});
$('capacity-form').addEventListener('submit', (event) =>
  event.preventDefault()
);
$('capacity-form').addEventListener('input', updateCapacity);
updateCapacity();
try {
  await renderTask();
  document.body.dataset.ready = 'true';
} catch (error) {
  reportError(error);
}
