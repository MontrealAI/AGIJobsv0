import {
  stages,
  stageById,
  makeTask,
  outputContracts,
  capacity,
  json,
  sha256,
  validateScenario,
} from './model.mjs';
import { execute, renderReport } from './execute.mjs';
import { reviewBundle, reviewReceipt, reviewCandidate } from './review.mjs';
const $ = (id) => document.getElementById(id);
const money = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value));
let source,
  bundle,
  sequence = 0;
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
};
function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = node('a', '');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function selected() {
  const stage = stageById($('stage').value);
  $('stage-title').textContent = stage.title;
  $('stage-goal').textContent = stage.goal;
  $('stage-dependencies').textContent = stage.dependencies.length
    ? stage.dependencies.map((id) => stageById(id).short).join(' + ')
    : 'Approved synthetic source';
  $('stage-artifact').textContent = stage.file;
  $('stage-contract').textContent = json(outputContracts[stage.id]);
  document
    .querySelectorAll('[data-stage]')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.stage === stage.id)
      )
    );
}
function artifactView() {
  const row = bundle?.results?.find(
    (r) => r.stageId === $('artifact-stage').value
  );
  $('artifact-content').textContent = row
    ? row.artifact.content
    : 'No verified rehearsal bundle selected.';
}
function clearEvidence() {
  bundle = null;
  $('findings').replaceChildren();
  $('review-checks').replaceChildren();
  document.querySelectorAll('[data-work-decision]').forEach((cell) => {
    cell.textContent = 'Awaiting evaluation';
    delete cell.dataset.decision;
  });
  for (const id of ['download-evidence', 'download-report', 'wrong-answer'])
    $(id).disabled = true;
  document.querySelectorAll('[data-stage]').forEach((b) => {
    b.classList.remove('ready');
    b.querySelector('.state').textContent = 'Ready';
  });
  artifactView();
}
function showReview(result, label) {
  $('review-title').textContent = result.accepted
    ? 'Artifact checks passed'
    : 'Artifact checks failed';
  $('review-title').className = result.accepted ? 'pass' : 'fail';
  $('review-status').textContent =
    label +
    ' · ' +
    result.verifiedArtifacts +
    ' artifact(s) checked. Production and settlement are not approved. Provider execution is not assessed.';
  $('review-checks').replaceChildren(
    ...result.checks.map((c) =>
      node(
        'li',
        (c.passed ? 'Pass: ' : 'Fail: ') + c.label,
        c.passed ? 'pass' : 'fail'
      )
    )
  );
  if (result.error && !result.checks.some((c) => !c.passed))
    $('review-checks').append(node('li', result.error, 'fail'));
}
function setBundle(value, accepted) {
  bundle = value;
  artifactView();
  for (const id of ['download-evidence', 'download-report', 'wrong-answer'])
    $(id).disabled = !accepted;
  if (!accepted) return;
  const dossier = JSON.parse(
    value.results.find((r) => r.stageId === 'execute').artifact.content
  );
  const fields = [
    [money(dossier.committedUsdc), 'Reserved work orders · USDC'],
    [money(dossier.unallocatedUsdc), 'Unallocated, including reserve · USDC'],
    [String(dossier.readyWorkIds.length), 'Review-ready work orders'],
    [String(dossier.deferredWorkIds.length), 'Deferred work orders'],
  ];
  const decisions = JSON.parse(
    value.results.find((r) => r.stageId === 'strategise').artifact.content
  ).decisions;
  const routes = JSON.parse(
    value.results.find((r) => r.stageId === 'think').artifact.content
  ).routes;
  for (const decision of decisions) {
    const cell = document.querySelector(
      `[data-work-decision="${decision.workId}"]`
    );
    cell.dataset.decision = decision.status;
    cell.textContent =
      decision.status === 'admitted' ? 'Review-ready' : 'Deferred';
    const worker = routes.find((r) => r.workId === decision.workId).workerId;
    cell.append(
      node(
        'small',
        (worker || 'No qualified worker') +
          ' · ' +
          decision.reason.replaceAll('-', ' ')
      )
    );
  }
  $('findings').replaceChildren(
    ...fields.map(([v, text]) => {
      const box = node('div', '', 'finding');
      box.append(node('strong', v), node('span', text));
      return box;
    })
  );
  document.querySelectorAll('[data-stage]').forEach((b) => {
    b.classList.add('ready');
    b.querySelector('.state').textContent = 'Checked';
  });
}
function failed(message) {
  clearEvidence();
  $('review-title').textContent = 'File could not be verified';
  $('review-title').className = 'fail';
  $('review-status').textContent = message;
}
function calculate() {
  try {
    const entries = [...$('capacity-form').querySelectorAll('input')].map(
      (el) => {
        if (!el.value.trim() || !el.validity.valid)
          throw new Error(
            'Complete every field with an assumption within its stated limits.'
          );
        return [el.name, Number(el.value)];
      }
    );
    const result = capacity(Object.fromEntries(entries));
    $('annual-volume').textContent = money(result.annualVolumeUsdc);
    $('capacity-status').textContent =
      new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(
        result.jobsPerDay
      ) +
      ' accepted jobs/day · Constraint: ' +
      result.bottleneck;
    const percent = (result.annualVolumeUsdc / result.milestoneUsdc) * 100;
    $('milestone').value = Math.min(100, percent);
    $('milestone-text').textContent =
      percent.toFixed(2) + '% of the $40B/year scenario milestone.';
  } catch (error) {
    $('annual-volume').textContent = '—';
    $('capacity-status').textContent = error.message;
    $('milestone').value = 0;
    $('milestone-text').textContent =
      'No estimate while assumptions are invalid.';
  }
}
$('capacity-form').addEventListener('input', calculate);
$('capacity-form').addEventListener('submit', (event) =>
  event.preventDefault()
);
calculate();
$('stage').addEventListener('change', selected);
$('artifact-stage').addEventListener('change', artifactView);
$('download-task').addEventListener('click', async () => {
  try {
    const id = $('stage').value;
    download(id + '.task.json', json(await makeTask(source, id)));
  } catch (error) {
    $('load-status').textContent = error.message;
  }
});
$('run').addEventListener('click', async () => {
  const ticket = ++sequence;
  clearEvidence();
  $('run').disabled = true;
  $('review-title').textContent = 'Computing six stages…';
  $('review-title').className = '';
  try {
    const value = await execute(source);
    const result = await reviewBundle(value, source);
    if (ticket !== sequence) return;
    showReview(result, 'Synthetic rehearsal');
    setBundle(value, result.accepted);
    $('load-status').textContent =
      'Six portfolio evaluation artifacts computed and checked. No provider calls or transactions.';
    $('evidence').scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  } catch (error) {
    if (ticket === sequence) failed(error.message);
  } finally {
    if (ticket === sequence) $('run').disabled = false;
  }
});
$('download-evidence').addEventListener('click', () => {
  if (bundle) download('meta-agentic-alpha-evidence.json', json(bundle));
});
$('download-report').addEventListener('click', () => {
  if (bundle)
    download(
      'meta-agentic-alpha-dossier.md',
      renderReport(bundle),
      'text/markdown'
    );
});
$('wrong-answer').addEventListener('click', async () => {
  if (!bundle) return;
  const wrong = structuredClone(bundle),
    ticket = ++sequence;
  clearEvidence();
  const artifact = wrong.results[0].artifact;
  const data = JSON.parse(artifact.content);
  data.plannedRewardsUsdc = '1.000000';
  artifact.content = json(data);
  artifact.bytes = new TextEncoder().encode(artifact.content).length;
  artifact.sha256 = await sha256(artifact.content);
  const result = await reviewBundle(wrong, source);
  if (ticket !== sequence) return;
  showReview(result, 'Deliberately wrong answer with a recomputed valid hash');
  setBundle(wrong, false);
});
$('receipt-file').addEventListener('change', async () => {
  const file = $('receipt-file').files[0];
  if (!file) return;
  const ticket = ++sequence,
    kind = $('evidence-kind').value,
    id = $('stage').value,
    job = $('expected-job').value.trim(),
    deployment = $('expected-deployment').value.trim();
  clearEvidence();
  try {
    if (file.size > 1048576)
      throw new Error('Choose a JSON file at most 1 MiB.');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(
      await file.arrayBuffer()
    );
    if (kind === 'candidate') {
      const result = await reviewCandidate(content, source, id);
      if (ticket === sequence)
        showReview(
          result,
          'Candidate bytes / ' +
            stageById(id).short +
            ' / provenance not assessed'
        );
      return;
    }
    const data = JSON.parse(content);
    const receipt = data?.provider === 'openclaw-responses';
    const result = receipt
      ? await reviewReceipt(data, source, id, job, deployment)
      : await reviewBundle(data, source);
    if (ticket !== sequence) return;
    showReview(
      result,
      receipt
        ? 'Worker receipt / ' + stageById(id).short
        : 'Imported rehearsal bundle'
    );
    if (!receipt && result.accepted) setBundle(data, true);
  } catch (error) {
    if (ticket === sequence) failed(error.message);
  } finally {
    $('receipt-file').value = '';
  }
});
try {
  const response = await fetch('scenario.json', { cache: 'no-store' });
  if (!response.ok)
    throw new Error(
      'The bundled scenario could not be loaded. Refresh or use the terminal quickstart.'
    );
  source = validateScenario(await response.json());
  for (const [index, stage] of stages.entries()) {
    for (const id of ['stage', 'artifact-stage']) {
      const option = node('option', stage.title);
      option.value = stage.id;
      $(id).append(option);
    }
    const item = node('li', ''),
      button = node('button', ''),
      label = node(
        'span',
        String(index + 1).padStart(2, '0') + ' ' + stage.short
      );
    button.dataset.stage = stage.id;
    button.type = 'button';
    button.append(label, node('span', 'Ready', 'state'));
    button.addEventListener('click', () => {
      $('stage').value = stage.id;
      selected();
    });
    item.append(button);
    $('stage-list').append(item);
  }
  for (const w of source.work) {
    const row = node('tr', ''),
      title = node('td', w.title);
    title.append(node('small', w.id + ' / ' + w.skill));
    row.append(
      title,
      node('td', w.deliverable),
      node('td', money(w.rewardUsdc)),
      node('td', w.reviewMinutes + ' min')
    );
    const decision = node('td', 'Awaiting evaluation');
    decision.dataset.workDecision = w.id;
    row.append(decision);
    $('work-rows').append(row);
  }
  selected();
  $('run').disabled = false;
  $('download-task').disabled = false;
  $('load-status').textContent =
    'Ready · Source and all execution assets are local.';
  document.body.dataset.ready = 'true';
} catch (error) {
  $('load-status').textContent = error.message;
  $('load-status').className = 'fail';
  $('receipt-file').disabled = true;
  document.body.dataset.ready = 'failed';
}
