const DATA_PATH = 'export/latest.json';

const loaderEl = document.getElementById('loader');
const errorEl = document.getElementById('error');
const summaryGrid = document.getElementById('summary-grid');
const ownerJson = document.getElementById('owner-json');
const timelineList = document.getElementById('timeline-list');
const metricsBody = document.getElementById('metrics-body');
const automationColumns = document.getElementById('automation-columns');
const commandLinks = document.getElementById('command-links');

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function createSummaryItem(title, value, hint) {
  const wrapper = document.createElement('div');
  wrapper.className = 'summary-item';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const body = document.createElement('p');
  body.textContent = value;
  if (hint) {
    const small = document.createElement('small');
    small.textContent = hint;
    small.style.display = 'block';
    small.style.marginTop = '0.35rem';
    small.style.color = 'var(--muted)';
    wrapper.append(heading, body, small);
  } else {
    wrapper.append(heading, body);
  }
  return wrapper;
}

function renderSummary(data) {
  summaryGrid.innerHTML = '';
  summaryGrid.append(
    createSummaryItem('Transcript generated', new Date(data.generatedAt).toLocaleString()),
    createSummaryItem('Total jobs', data.market.totalJobs),
    createSummaryItem('Hamiltonian metrics', `${data.market.hamiltonianTelemetry.length}`),
    createSummaryItem('Owner actions', `${data.ownerActions.length}`),
    createSummaryItem('Pending fees', `${data.market.pendingFees} $AGIALPHA`),
    createSummaryItem('Validator stake', `${data.market.totalValidatorStake} $AGIALPHA`)
  );
}

function renderOwnerControl(ownerControl) {
  ownerJson.textContent = JSON.stringify(ownerControl, null, 2);
}

function renderTimeline(entries) {
  timelineList.innerHTML = '';
  entries.forEach((entry) => {
    const item = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = `[${entry.kind}] ${entry.label}`;
    const meta = document.createElement('div');
    meta.textContent = `${new Date(entry.at).toLocaleString()} — ${entry.scenario || 'Global'}`;
    meta.style.fontSize = '0.8rem';
    meta.style.marginBottom = '0.4rem';
    meta.style.color = 'var(--muted)';
    item.append(title, meta);
    if (entry.meta) {
      const detail = document.createElement('code');
      detail.textContent = JSON.stringify(entry.meta);
      detail.style.display = 'block';
      detail.style.whiteSpace = 'pre-wrap';
      detail.style.fontSize = '0.75rem';
      item.append(detail);
    }
    timelineList.append(item);
  });
}

function renderMetrics(metrics) {
  metricsBody.innerHTML = '';
  metrics.forEach((metric) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${metric.label}</td>
      <td><strong>${metric.freeEnergy.toFixed(3)}</strong></td>
      <td>${metric.hamiltonian.toFixed(3)}</td>
      <td>${metric.divergence.toFixed(4)}</td>
      <td>${metric.stackelbergLead.toFixed(3)}</td>
      <td>${formatPercent(metric.cooperationProbability)}</td>
    `;
    metricsBody.append(row);
  });
}

function renderAutomation(automation) {
  automationColumns.innerHTML = '';
  const groups = [
    ['Owner directives', automation.autopilot.ownerDirectives],
    ['Agent opportunities', automation.autopilot.agentOpportunities],
    ['Validator signals', automation.autopilot.validatorSignals],
    ['Treasury alerts', automation.autopilot.treasuryAlerts],
  ];
  groups.forEach(([title, directives]) => {
    const column = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = title;
    column.append(heading);
    directives.forEach((directive) => {
      const directiveTitle = document.createElement('strong');
      directiveTitle.textContent = `${directive.title} (${directive.priority})`;
      const summary = document.createElement('p');
      summary.textContent = directive.summary;
      column.append(directiveTitle, summary);
    });
    automationColumns.append(column);
  });

  commandLinks.innerHTML = '';
  Object.entries(automation.commands).forEach(([label, command]) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${label}</strong><br/><code>${command}</code>`;
    commandLinks.append(li);
  });
}

async function loadTranscript() {
  try {
    const response = await fetch(DATA_PATH, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Unable to load transcript (${response.status})`);
    }
    const data = await response.json();
    loaderEl.classList.add('hidden');
    renderSummary(data);
    renderOwnerControl(data.ownerControl);
    renderTimeline(data.timeline);
    renderMetrics(data.market.hamiltonianTelemetry);
    renderAutomation(data.automation);
  } catch (error) {
    loaderEl.classList.add('hidden');
    errorEl.classList.remove('hidden');
    errorEl.textContent = `Failed to load transcript: ${error}`;
  }
}

loadTranscript();
