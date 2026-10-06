import mermaid from 'mermaid';
import {
  analyse,
  review,
  makeTask,
  validateComparison,
  jobTypes,
  workOrder,
  marketScenario,
  json,
} from './model.mjs';
mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'dark',
  themeVariables: {
    primaryColor: '#382b53',
    primaryTextColor: '#f4f1ff',
    lineColor: '#b69bdb',
  },
  flowchart: { htmlLabels: false },
});
const $ = (id) => document.getElementById(id);
const money = (n) =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
let current = null,
  loadId = 0;
const node = (tag, text, cls) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
};
function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([json(value)], { type: 'application/json' })
  );
  const a = node('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ready(value) {
  for (const id of ['download-record', 'analyse', 'task', 'candidate-file'])
    $(id).disabled = !value;
}
function clear() {
  current = null;
  ready(false);
  for (const id of [
    'summary-cards',
    'totals',
    'lineage',
    'log-summary',
    'roi-chart',
  ])
    $(id).replaceChildren();
  $('analysis-status').textContent = 'Select a valid record to begin.';
}
async function readFile(file) {
  if (!file || file.size > 8 * 1024 * 1024)
    throw new Error('Choose a JSON file smaller than 8 MiB.');
  return JSON.parse(await file.text());
}
function plot(data) {
  const svg = $('roi-chart'),
    NS = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const series = ['hgm', 'baseline'].map((id) =>
    data[id].timeline.filter((r) => r.roi !== null)
  );
  const rows = series.flat(),
    maxStep = rows.reduce((n, r) => Math.max(n, r.step), 1),
    maxRatio = rows.reduce((n, r) => Math.max(n, r.roi), 1);
  function draw(tag, attrs, text) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text) el.textContent = text;
    svg.append(el);
    return el;
  }
  for (let i = 0; i < 5; i++) {
    const y = 220 - i * 47.5;
    draw('line', {
      x1: 50,
      x2: 735,
      y1: y,
      y2: y,
      stroke: '#393148',
      'stroke-width': 1,
    });
    draw('text', { x: 8, y: y + 4 }, ((maxRatio * i) / 4).toFixed(1) + '×');
  }
  draw('text', { x: 50, y: 247 }, '0');
  draw('text', { x: 650, y: 247 }, 'Step ' + maxStep);
  series.forEach((points, i) => {
    if (points.length)
      draw('polyline', {
        points: points
          .map(
            (r) =>
              50 +
              (r.step / maxStep) * 685 +
              ',' +
              (220 - (r.roi / maxRatio) * 190)
          )
          .join(' '),
        fill: 'none',
        stroke: i ? '#83d8d6' : '#ba9fff',
        'stroke-width': 2.5,
      });
  });
  if (!rows.length)
    draw('text', { x: 210, y: 130 }, 'No completed cost — ratio unavailable');
}
function render(data, name) {
  validateComparison(data);
  current = data;
  ready(true);
  const h = data.hgm.summary,
    b = data.baseline.summary;
  const metrics = [
    [
      'HGM simulated gross value',
      money(h.gmv),
      'Seed ' + data.seed + ' · synthetic outcomes',
    ],
    ['Completed cost', money(h.cost), 'HGM · paid only in the model'],
    [
      'Reserved cost',
      money(h.reserved_cost),
      h.pending_tasks + ' unfinished task(s)',
    ],
    [
      'Value less commitments',
      money(h.gmv - h.cost - h.reserved_cost),
      'HGM · includes pending reservations',
    ],
  ];
  $('summary-cards').replaceChildren(
    ...metrics.map(([label, value, note]) => {
      const el = node('article', undefined, 'metric');
      el.append(
        node('span', label),
        node('strong', value),
        node('small', note)
      );
      return el;
    })
  );
  $('totals').replaceChildren(
    ...[
      [h, 'HGM'],
      [b, 'Baseline'],
    ].map(([s, label]) => {
      const tr = node('tr');
      [
        label,
        money(s.gmv),
        money(s.cost),
        money(s.reserved_cost),
        money(s.gmv - s.cost - s.reserved_cost),
        String(s.pending_tasks),
      ].forEach((v) => tr.append(node('td', v)));
      return tr;
    })
  );
  const agents = [...(data.hgm.timeline.at(-1)?.agents || [])]
    .sort((a, b) => b.direct_success - a.direct_success)
    .slice(0, 8);
  $('lineage').replaceChildren(
    ...agents.map((a) => {
      const row = node('div', undefined, 'lineage-row');
      row.append(
        node('strong', a.agent_id),
        node(
          'span',
          `${a.direct_success} successes / ${
            a.direct_failure
          } failures · q ${a.quality.toFixed(2)}`
        )
      );
      return row;
    })
  );
  if (!agents.length) $('lineage').append(node('p', 'No lineage recorded.'));
  $('log-summary').replaceChildren();
  for (const id of ['hgm', 'baseline']) {
    const ul = node('ul');
    data[id].logs.slice(-4).forEach((text) => ul.append(node('li', text)));
    $('log-summary').append(node('h4', id === 'hgm' ? 'HGM' : 'Baseline'), ul);
  }
  plot(data);
  $(
    'record-status'
  ).textContent = `${name} · seed ${data.seed} · ${data.hgm.timeline.length} HGM steps · simulation only`;
  $('analysis-status').textContent =
    'Ready to create an analysis or check a candidate. No worker is connected to this page.';
}
async function loadScenario() {
  const ticket = ++loadId;
  clear();
  $('record-status').textContent = 'Loading recorded simulation…';
  try {
    const response = await fetch('records/' + $('scenario').value + '.json');
    if (!response.ok)
      throw new Error(
        'Record unavailable. Rebuild the viewer or import comparison.json.'
      );
    const data = await response.json();
    if (ticket === loadId) render(data, 'Bundled recording');
  } catch (error) {
    if (ticket === loadId) {
      clear();
      $('record-status').textContent = error.message;
    }
  }
}
$('scenario').addEventListener('change', loadScenario);
$('comparison-file').addEventListener('change', async (event) => {
  const ticket = ++loadId;
  clear();
  try {
    const data = await readFile(event.target.files[0]);
    if (ticket === loadId)
      render(data, 'Imported record (untrusted provenance)');
  } catch (error) {
    if (ticket === loadId) $('record-status').textContent = error.message;
  }
});
$('download-record').addEventListener('click', () => {
  if (current) download('hgm-comparison.json', current);
});
$('analyse').addEventListener('click', async () => {
  const data = current,
    ticket = loadId;
  if (!data) return;
  try {
    const candidate = await analyse(data),
      checked = await review(data, candidate);
    if (ticket !== loadId) return;
    if (!checked.accepted) throw new Error('Analysis failed checks');
    download('benchmark-analysis.json', candidate);
    $('analysis-status').textContent =
      'Analysis created: input digest and arithmetic checked. These are simulation inputs. Independent substantive review and settlement remain unapproved.';
  } catch (error) {
    $('analysis-status').textContent = error.message;
  }
});
$('task').addEventListener('click', async () => {
  const data = current,
    ticket = loadId;
  if (!data) return;
  try {
    const task = await makeTask(data);
    if (ticket !== loadId) return;
    download('hgm-analysis-task.json', task);
    $('analysis-status').textContent =
      'Task exported. The runbook explains exact-digest admission and bounded execution. No work was dispatched.';
  } catch (error) {
    $('analysis-status').textContent = error.message;
  }
});
$('candidate-file').addEventListener('change', async (event) => {
  const data = current,
    ticket = loadId;
  if (!data) return;
  try {
    const result = await review(data, await readFile(event.target.files[0]));
    if (ticket !== loadId) return;
    $('analysis-status').textContent = result.accepted
      ? 'Content checks passed. Provider provenance, buyer use and unrelated review remain unverified.'
      : 'Candidate rejected: source binding, output fields or arithmetic differs. No approval granted.';
    download('hgm-content-review.json', result);
  } catch (error) {
    if (ticket === loadId)
      $('analysis-status').textContent = 'Candidate rejected: ' + error.message;
  }
});
for (const [id, label] of jobTypes) {
  const option = node('option', label);
  option.value = id;
  $('job-type').append(option);
}
function updateJob() {
  $('job-deliverable').textContent =
    'Deliverable: ' + jobTypes.find((x) => x[0] === $('job-type').value)[2];
}
$('job-type').addEventListener('change', updateJob);
updateJob();
$('job-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    download(
      'hgm-work-order.json',
      workOrder(
        $('job-type').value,
        Number($('budget').value),
        Number($('minutes').value)
      )
    );
    $('job-status').textContent =
      'Draft exported. Complete its admission fields with your buyer and reviewer before execution.';
  } catch (error) {
    $('job-status').textContent = error.message;
  }
});
function updateMarket() {
  try {
    const ids = ['tam', 'eligible', 'capture'];
    if (ids.some((id) => !$(id).value.trim()))
      throw new Error('Enter all three values');
    $('market-value').textContent = money(
      marketScenario(...ids.map((id) => Number($(id).value)))
    );
  } catch (error) {
    $('market-value').textContent = 'Check scenario inputs';
  }
}
for (const id of ['tam', 'eligible', 'capture'])
  $(id).addEventListener('input', updateMarket);
updateMarket();
mermaid.run({ nodes: document.querySelectorAll('.mermaid') }).catch(() => {
  const warning = node(
    'p',
    'Diagram rendering unavailable. The flow source remains visible.'
  );
  $('architecture').append(warning);
});
loadScenario();
