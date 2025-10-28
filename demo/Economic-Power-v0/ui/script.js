import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const defaultDataPath = 'data/default-summary.json';
const metricMap = [
  {
    id: 'roiMultiplier',
    label: 'ROI Multiplier',
    formatter: (value) => `${value.toFixed(2)}×`,
    description: 'Aggregate productivity lift versus escrowed value.',
  },
  {
    id: 'netYield',
    label: 'Net Yield (AGI)',
    formatter: (value) => formatNumber(value),
    description: 'Total economic value minus all payouts and buffers.',
  },
  {
    id: 'paybackHours',
    label: 'Payback Horizon',
    formatter: (value) => `${value.toFixed(1)} hours`,
    description: 'Time until generated value overtakes capital committed.',
  },
  {
    id: 'throughputJobsPerDay',
    label: 'Throughput',
    formatter: (value) => `${value.toFixed(2)} jobs/day`,
    description: 'Completed jobs per 24h once the loop stabilises.',
  },
  {
    id: 'validatorConfidence',
    label: 'Validator Confidence',
    formatter: (value) => `${(value * 100).toFixed(2)}%`,
    description: 'Average validator approval confidence in commit–reveal.',
  },
  {
    id: 'automationScore',
    label: 'Automation Score',
    formatter: (value) => value.toFixed(3),
    description: 'Autonomous orchestration coverage for the scenario.',
  },
];

async function loadSummary(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load summary data from ${path}`);
  }
  return response.json();
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function renderMetricCards(summary) {
  const container = document.getElementById('metric-cards');
  container.innerHTML = '';
  for (const metric of metricMap) {
    const card = document.createElement('article');
    card.className = 'metric-card';
    const heading = document.createElement('h3');
    heading.textContent = metric.label;
    const valueEl = document.createElement('strong');
    valueEl.textContent = metric.formatter(summary.metrics[metric.id]);
    const desc = document.createElement('span');
    desc.textContent = metric.description;
    card.append(heading, valueEl, desc);
    container.append(card);
  }
}

function renderOwnerTable(summary) {
  const tbody = document.querySelector('#owner-table tbody');
  tbody.innerHTML = '';
  for (const control of summary.ownerControl.controls) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${control.parameter}</td>
      <td>${control.current}</td>
      <td>${control.target}</td>
      <td><code>${control.script}</code></td>
      <td>${control.description}</td>
    `;
    tbody.append(row);
  }
}

function renderAssignments(summary) {
  const tbody = document.querySelector('#assignment-table tbody');
  tbody.innerHTML = '';
  for (const assignment of summary.assignments) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${assignment.jobName}</strong></td>
      <td>
        <span>${assignment.agentName}</span><br />
        <small>${assignment.agentEns}</small>
      </td>
      <td>${(assignment.endHour - assignment.startHour).toFixed(1)}</td>
      <td>${formatNumber(assignment.rewardAgi)}</td>
      <td>${formatNumber(assignment.rewardStable)}</td>
      <td>${assignment.validatorNames.join(', ')}</td>
      <td>${(assignment.validatorConfidence * 100).toFixed(2)}%</td>
      <td>${formatNumber(assignment.netValue)}</td>
    `;
    tbody.append(row);
  }
}

async function renderMermaid(summary) {
  mermaid.initialize({ startOnLoad: false, theme: 'dark' });
  const flow = document.getElementById('mermaid-flow');
  const timeline = document.getElementById('mermaid-timeline');
  flow.textContent = summary.mermaidFlow;
  timeline.textContent = summary.mermaidTimeline;
  await mermaid.run({ nodes: [flow, timeline] });
}

function updateFooter(summary) {
  const footer = document.getElementById('generated-at');
  footer.textContent = `• Generated at ${new Date(summary.generatedAt).toLocaleString()}`;
}

async function bootstrap(dataPath = defaultDataPath) {
  const summary = await loadSummary(dataPath);
  renderMetricCards(summary);
  renderOwnerTable(summary);
  renderAssignments(summary);
  await renderMermaid(summary);
  updateFooter(summary);
  window.currentSummary = summary;
}

function setupFileHandlers() {
  const fileInput = document.getElementById('file-input');
  const dropzone = document.querySelector('.dropzone');
  const reloadButton = document.getElementById('reload-default');

  reloadButton.addEventListener('click', () => {
    bootstrap().catch(console.error);
  });

  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = await file.text();
    const summary = JSON.parse(data);
    await renderSummary(summary);
  });

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const data = await file.text();
    const summary = JSON.parse(data);
    await renderSummary(summary);
  });
}

async function renderSummary(summary) {
  renderMetricCards(summary);
  renderOwnerTable(summary);
  renderAssignments(summary);
  await renderMermaid(summary);
  updateFooter(summary);
  window.currentSummary = summary;
}

setupFileHandlers();
bootstrap().catch(console.error);
