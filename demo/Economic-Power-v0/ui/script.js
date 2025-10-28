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
  {
    id: 'stabilityIndex',
    label: 'Stability Index',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'System resilience combining validator strength and risk buffers.',
  },
  {
    id: 'ownerCommandCoverage',
    label: 'Owner Command Coverage',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Share of critical surfaces with deterministic owner command paths.',
  },
  {
    id: 'treasuryAfterRun',
    label: 'Treasury After Run (AGI)',
    formatter: (value) => formatNumber(value),
    description: 'Treasury balance projected after validator rewards and payouts.',
  },
  {
    id: 'sovereignControlScore',
    label: 'Sovereign Control Score',
    formatter: (value) => `${(value * 100).toFixed(1)}%`,
    description: 'Share of smart contracts fully custodied by owner multi-sig safes.',
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

function renderSovereignty(summary) {
  const pauseResume = document.getElementById('pause-resume');
  pauseResume.innerHTML = `
    <p><strong>Pause:</strong> <code>${summary.ownerSovereignty.pauseScript}</code></p>
    <p><strong>Resume:</strong> <code>${summary.ownerSovereignty.resumeScript}</code></p>
    <p><strong>Median response:</strong> ${summary.ownerSovereignty.responseMinutes} minutes</p>
  `;

  const emergencyList = document.getElementById('emergency-contacts');
  emergencyList.innerHTML = '';
  for (const contact of summary.ownerSovereignty.emergencyContacts) {
    const li = document.createElement('li');
    li.textContent = contact;
    emergencyList.append(li);
  }

  const circuitBody = document.querySelector('#circuit-table tbody');
  circuitBody.innerHTML = '';
  for (const circuit of summary.ownerSovereignty.circuitBreakers) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${circuit.metric}</td>
      <td>${circuit.comparator} ${circuit.threshold}</td>
      <td><code>${circuit.action}</code></td>
      <td>${circuit.description}</td>
    `;
    circuitBody.append(row);
  }

  const upgradeBody = document.querySelector('#upgrade-table tbody');
  upgradeBody.innerHTML = '';
  for (const upgrade of summary.ownerSovereignty.upgradePaths) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${upgrade.module}</td>
      <td><code>${upgrade.script}</code></td>
      <td>${upgrade.description}</td>
    `;
    upgradeBody.append(row);
  }
}

function renderDeployment(summary) {
  const deployment = summary.deployment;
  const networkEl = document.getElementById('deployment-network');
  const explorerEl = document.getElementById('deployment-explorer');
  const treasuryEl = document.getElementById('deployment-treasury');
  const governanceEl = document.getElementById('deployment-governance');
  const scoreEl = document.getElementById('deployment-score');
  const automationList = document.getElementById('deployment-automation');
  const adapterList = document.getElementById('deployment-adapters');
  const tableBody = document.querySelector('#deployment-table tbody');
  const observabilityList = document.getElementById('deployment-observability');

  if (!deployment) {
    networkEl.textContent = 'No deployment data available';
    explorerEl.textContent = '';
    explorerEl.removeAttribute('href');
    treasuryEl.textContent = 'N/A';
    governanceEl.textContent = 'N/A';
    scoreEl.textContent = 'N/A';
    automationList.innerHTML = '';
    adapterList.innerHTML = '';
    tableBody.innerHTML = '';
    observabilityList.innerHTML = '';
    return;
  }

  networkEl.textContent = `${deployment.network.name} • Chain ID ${deployment.network.chainId}`;
  const explorerLabel = deployment.network.explorer.replace(/^https?:\/\//, '');
  explorerEl.href = deployment.network.explorer;
  explorerEl.textContent = explorerLabel || 'Open explorer';
  treasuryEl.textContent = deployment.treasuryOwner;
  governanceEl.textContent = deployment.governanceSafe;
  scoreEl.textContent = `${(summary.metrics.sovereignControlScore * 100).toFixed(1)}%`;

  automationList.innerHTML = '';
  const automationEntries = [
    ['Matching engine', deployment.automation.matchingEngine],
    ['Validator orchestrator', deployment.automation.validatorOrchestrator],
    ['Notification hub', deployment.automation.notificationHub],
  ];
  for (const [label, value] of automationEntries) {
    const li = document.createElement('li');
    li.textContent = `${label}: ${value}`;
    automationList.append(li);
  }

  adapterList.innerHTML = '';
  for (const adapter of deployment.stablecoinAdapters) {
    const li = document.createElement('li');
    li.textContent = `${adapter.name} • swap ${adapter.swapFeeBps} bps • slippage ${adapter.slippageBps} bps`;
    adapterList.append(li);
  }

  tableBody.innerHTML = '';
  for (const module of deployment.modules) {
    const row = document.createElement('tr');
    const lastAudit = new Date(module.lastAudit);
    const auditDisplay = Number.isNaN(lastAudit.getTime())
      ? module.lastAudit
      : lastAudit.toLocaleDateString();
    row.innerHTML = `
      <td>${module.name}</td>
      <td><code>${module.address}</code></td>
      <td>${module.version}</td>
      <td><code>${module.owner}</code></td>
      <td>${module.status.replace('-', ' ')}</td>
      <td>${auditDisplay}</td>
      <td><code>${module.upgradeScript}</code></td>
    `;
    const descriptionRow = document.createElement('tr');
    const descriptionCell = document.createElement('td');
    descriptionCell.colSpan = 7;
    descriptionCell.className = 'module-description-cell';
    descriptionCell.textContent = module.description;
    descriptionRow.append(descriptionCell);
    tableBody.append(row, descriptionRow);
  }

  observabilityList.innerHTML = '';
  for (const dashboard of deployment.observability.dashboards) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = dashboard;
    link.textContent = dashboard;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    li.append(link);
    observabilityList.append(li);
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
  renderSovereignty(summary);
  renderDeployment(summary);
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
  renderSovereignty(summary);
  renderDeployment(summary);
  await renderMermaid(summary);
  updateFooter(summary);
  window.currentSummary = summary;
}

setupFileHandlers();
bootstrap().catch(console.error);
