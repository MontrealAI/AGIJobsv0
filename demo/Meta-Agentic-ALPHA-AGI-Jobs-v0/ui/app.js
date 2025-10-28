const metricsGrid = document.getElementById('metrics-grid');
const assignmentsBody = document.getElementById('assignments-body');
const governanceSafe = document.getElementById('governance-safe');
const emergencyList = document.getElementById('emergency-list');
const responseWindow = document.getElementById('response-window');
const commandList = document.getElementById('command-list');
const ciStatus = document.getElementById('ci-status');
const ciCommands = document.getElementById('ci-commands');
const architectureDiagram = document.getElementById('architecture-diagram');
const timelineDiagram = document.getElementById('timeline-diagram');
const coordinationDiagram = document.getElementById('coordination-diagram');

const METRIC_LABELS = {
  totalOpportunities: 'Opportunities',
  portfolioValue: 'Portfolio Value',
  capitalAtRisk: 'Capital at Risk',
  roiMultiplier: 'ROI Multiplier',
  automationCoverage: 'Automation Coverage',
  validatorConfidence: 'Validator Confidence',
  detectionLeadHours: 'Detection Lead (h)',
  worldModelFidelity: 'World Model Fidelity',
  ownerCommandCoverage: 'Owner Command Coverage',
  sovereignControlScore: 'Sovereign Control Score',
  antifragilityIndex: 'Antifragility Index',
  stabilityReserve: 'Stability Reserve',
  paybackHours: 'Payback Horizon (h)',
  treasuryVelocity: 'Treasury Velocity',
};

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value) {
  return `$${formatNumber(value)}`;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function ensureMermaid() {
  const mermaid = globalThis.mermaid;
  if (!mermaid) {
    throw new Error('Mermaid failed to load.');
  }
  mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
  return mermaid;
}

async function renderMermaid(element, definition, key) {
  const mermaid = ensureMermaid();
  try {
    const { svg } = await mermaid.render(`${key}-${Math.random().toString(36).slice(2)}`, definition);
    element.innerHTML = svg;
  } catch (error) {
    element.innerHTML = `<div class="error">Mermaid rendering error: ${String(error)}</div>`;
  }
}

function renderMetrics(metrics) {
  metricsGrid.replaceChildren();
  Object.entries(metrics).forEach(([key, value]) => {
    if (key === 'ciStatus' || !(key in METRIC_LABELS)) {
      return;
    }
    const card = document.createElement('article');
    card.className = 'metric-card';
    card.setAttribute('role', 'listitem');
    const label = document.createElement('h3');
    label.textContent = METRIC_LABELS[key] ?? key;
    const figure = document.createElement('p');
    figure.className = 'metric-value';
    if (key.includes('Value') || key.includes('Reserve') || key === 'capitalAtRisk') {
      figure.textContent = formatCurrency(value);
    } else if (typeof value === 'number' && value <= 2 && value >= 0) {
      figure.textContent = formatPercent(value);
    } else if (typeof value === 'number') {
      figure.textContent = value.toFixed(2);
    } else {
      figure.textContent = String(value);
    }
    card.append(label, figure);
    metricsGrid.append(card);
  });
}

function renderAssignments(assignments) {
  assignmentsBody.replaceChildren();
  assignments.forEach((assignment) => {
    const row = document.createElement('tr');

    const cells = [
      assignment.title,
      assignment.domain,
      `${assignment.projectedROI.toFixed(2)}x`,
      formatPercent(assignment.automation),
      formatPercent(assignment.stability),
      assignment.durationHours.toFixed(0),
    ];

    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });

    assignmentsBody.append(row);
  });
}

function renderOwnerSurface(owner, ci) {
  governanceSafe.textContent = owner.governanceSafe;
  emergencyList.replaceChildren();
  owner.emergencyContacts.forEach((contact) => {
    const li = document.createElement('li');
    li.textContent = contact;
    emergencyList.append(li);
  });
  responseWindow.textContent = `Response window: ${owner.responseMinutes} minutes`;

  commandList.replaceChildren();
  owner.commands.forEach((command) => {
    const li = document.createElement('li');
    li.innerHTML = `<code>${command.script}</code><span>${command.description}</span>`;
    commandList.append(li);
  });

  ciStatus.textContent = `Status: ${ci.status.toUpperCase()}`;
  ciCommands.replaceChildren();
  ci.commands.forEach((command) => {
    const li = document.createElement('li');
    li.textContent = command;
    ciCommands.append(li);
  });
}

async function hydrate() {
  try {
    const [dashboardRes, architectureRes, timelineRes, coordinationRes] = await Promise.all([
      fetch('../reports/dashboard.json', { cache: 'no-cache' }),
      fetch('../reports/architecture.mmd', { cache: 'no-cache' }),
      fetch('../reports/timeline.mmd', { cache: 'no-cache' }),
      fetch('../reports/coordination.mmd', { cache: 'no-cache' }),
    ]);

    if (!dashboardRes.ok) {
      throw new Error(`Failed to load dashboard.json (${dashboardRes.status})`);
    }

    const dashboard = await dashboardRes.json();
    const [architecture, timeline, coordination] = await Promise.all([
      architectureRes.text(),
      timelineRes.text(),
      coordinationRes.text(),
    ]);

    renderMetrics(dashboard.metrics);
    renderAssignments(dashboard.assignments);
    renderOwnerSurface(dashboard.owner, dashboard.ci);
    await renderMermaid(architectureDiagram, architecture, 'architecture');
    await renderMermaid(timelineDiagram, timeline, 'timeline');
    await renderMermaid(coordinationDiagram, coordination, 'coordination');
  } catch (error) {
    const message = document.createElement('div');
    message.className = 'error-banner';
    message.textContent = `Failed to load dashboard data: ${String(error)}`;
    document.body.prepend(message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  hydrate().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Hydration error', error);
  });
});
