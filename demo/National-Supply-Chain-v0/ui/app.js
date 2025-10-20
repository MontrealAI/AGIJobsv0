const TRANSCRIPT_PATHS = ['export/latest.json', '../export/latest.json', 'sample.json'];

const state = {
  data: null,
  phaseFilter: 'all',
};

const fmtNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const createCurrencyFormatter = (currency) => {
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    return (value) => formatter.format(value);
  } catch (error) {
    console.warn(`Falling back to numeric formatting for currency ${currency}:`, error);
    return (value) => `${fmtNumber.format(value)} ${currency}`.trim();
  }
};

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

const fmtSlack = (days) => `${days} d`;

async function loadData() {
  for (const path of TRANSCRIPT_PATHS) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json();
    } catch (error) {
      console.warn(`Unable to load ${path}:`, error);
    }
  }
  throw new Error('No national supply chain export found. Run npm run demo:national-supply-chain:v0.');
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function renderHeader(data) {
  document.querySelector('[data-mission-title]').textContent = data.initiative;
  document.querySelector('[data-mission-objective]').textContent = data.objective;
  document.querySelector('[data-mission-tag]').textContent = data.missionTag || 'NATIONAL-SUPPLY-CHAIN';
  document.querySelector('[data-generated-at]').textContent = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString()
    : 'Unknown';
  document.querySelector('[data-network]').textContent = data.network || '—';
  document.querySelector('[data-owner-ens]').textContent = data.ownerEns || '—';
}

function renderMetrics(data) {
  const container = document.querySelector('[data-metrics]');
  clear(container);
  const formatCurrency = createCurrencyFormatter(data.budget.currency);
  const stats = [
    { label: 'Jobs orchestrated', value: fmtNumber.format(data.metrics.jobCount) },
    { label: 'Phases', value: fmtNumber.format(data.metrics.phaseCount) },
    { label: 'Agents', value: fmtNumber.format(data.metrics.agentCount) },
    { label: 'Validators', value: fmtNumber.format(data.metrics.validatorCount) },
    { label: 'Total reward', value: formatCurrency(data.metrics.totalReward) },
    { label: 'Operator reserve', value: formatCurrency(data.budget.operatorReserve) },
    { label: 'Validator pool', value: formatCurrency(data.budget.validatorPool) },
    { label: 'Critical path (days)', value: fmtNumber.format(data.metrics.criticalPathDays) },
    { label: 'Max concurrency', value: fmtNumber.format(data.metrics.maxConcurrency) },
    { label: 'Corridor capacity (t/day)', value: fmtNumber.format(data.metrics.corridorCapacity) },
    { label: 'Validator stake', value: formatCurrency(data.metrics.validatorStake) },
  ];

  for (const stat of stats) {
    const node = document.createElement('div');
    node.className = 'stat';
    const label = document.createElement('div');
    label.className = 'stat__label';
    label.textContent = stat.label;
    const value = document.createElement('div');
    value.className = 'stat__value';
    value.textContent = stat.value;
    node.appendChild(label);
    node.appendChild(value);
    container.appendChild(node);
  }
}

function renderPhases(data) {
  const container = document.querySelector('[data-phase-filters]');
  clear(container);

  const list = document.createElement('div');
  list.className = 'pill-group';

  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = `btn ${state.phaseFilter === 'all' ? 'active' : ''}`;
  allButton.textContent = 'All phases';
  allButton.addEventListener('click', () => {
    state.phaseFilter = 'all';
    renderPhases(data);
    renderJobs(data);
  });
  container.appendChild(allButton);

  for (const phase of data.phases) {
    const card = document.createElement('article');
    card.className = `phase-card ${state.phaseFilter === phase.id ? 'active' : ''}`;
    card.tabIndex = 0;

    const title = document.createElement('h3');
    title.textContent = `${phase.title}`;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'phase-meta';
    meta.textContent = `${phase.windowDays} day window · Focus: ${phase.focus.join(', ')}`;
    card.appendChild(meta);

    const controls = document.createElement('div');
    controls.className = 'pill-group';
    for (const control of phase.ownerControls) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = control;
      controls.appendChild(pill);
    }
    card.appendChild(controls);

    const deliverables = document.createElement('div');
    deliverables.className = 'phase-meta';
    deliverables.textContent = `Deliverables: ${phase.deliverables.join('; ')}`;
    card.appendChild(deliverables);

    card.addEventListener('click', () => {
      state.phaseFilter = phase.id;
      renderPhases(data);
      renderJobs(data);
    });
    card.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        state.phaseFilter = phase.id;
        renderPhases(data);
        renderJobs(data);
      }
    });

    container.appendChild(card);
  }
}

function renderJobs(data) {
  const tbody = document.querySelector('[data-job-rows]');
  clear(tbody);
  const formatCurrency = createCurrencyFormatter(data.budget.currency);

  const jobs = data.jobs.filter((job) => state.phaseFilter === 'all' || job.phase === state.phaseFilter);

  if (jobs.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 9;
    cell.className = 'loading';
    cell.textContent = 'No jobs in this phase filter.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  for (const job of jobs) {
    const row = document.createElement('tr');
    if (job.critical) row.classList.add('critical');

    const idCell = document.createElement('td');
    idCell.textContent = job.id;
    row.appendChild(idCell);

    const titleCell = document.createElement('td');
    titleCell.textContent = job.title;
    if (job.brief && job.brief.length) {
      const hint = document.createElement('span');
      hint.className = 'subtle';
      hint.textContent = job.brief.join(' • ');
      titleCell.appendChild(hint);
    }
    row.appendChild(titleCell);

    const phaseCell = document.createElement('td');
    phaseCell.textContent = job.phaseTitle || job.phase;
    row.appendChild(phaseCell);

    const windowCell = document.createElement('td');
    windowCell.innerHTML = `${fmtDate(job.startDate)} → ${fmtDate(job.endDate)}<span class="subtle">Deadline ${fmtDate(job.deadlineDate)}</span>`;
    row.appendChild(windowCell);

    const rewardCell = document.createElement('td');
    rewardCell.textContent = formatCurrency(job.reward);
    row.appendChild(rewardCell);

    const slackCell = document.createElement('td');
    slackCell.textContent = fmtSlack(job.slackDays);
    row.appendChild(slackCell);

    const corridorCell = document.createElement('td');
    corridorCell.textContent = job.corridors.join(', ');
    row.appendChild(corridorCell);

    const agentCell = document.createElement('td');
    agentCell.innerHTML = job.assigned
      .map((assignment) => `${assignment.agent}<span class="subtle">${assignment.responsibility}</span>`)
      .join('<br/>');
    row.appendChild(agentCell);

    const validatorCell = document.createElement('td');
    validatorCell.textContent = job.validators.join(', ');
    row.appendChild(validatorCell);

    tbody.appendChild(row);
  }
}

function renderCorridors(data) {
  const container = document.querySelector('[data-corridors]');
  clear(container);

  for (const corridor of data.corridors) {
    const card = document.createElement('article');
    card.className = 'corridor-card';

    const title = document.createElement('h3');
    title.textContent = corridor.id;
    card.appendChild(title);

    const mode = document.createElement('div');
    mode.className = 'phase-meta';
    mode.textContent = `${corridor.mode} · ${corridor.capacityTonnesPerDay} t/day · Latency ${corridor.latencyHours} h`;
    card.appendChild(mode);

    const resilience = document.createElement('div');
    resilience.className = 'phase-meta';
    resilience.textContent = corridor.resilience;
    card.appendChild(resilience);

    const ownership = document.createElement('div');
    ownership.className = 'phase-meta';
    ownership.textContent = `Owner controls: ${corridor.ownerControls.join(', ')}`;
    card.appendChild(ownership);

    container.appendChild(card);
  }
}

function renderOwnerControls(data) {
  const list = document.querySelector('[data-owner-controls]');
  clear(list);
  for (const command of data.ownerPlaybooks) {
    const item = document.createElement('li');
    item.textContent = command;
    list.appendChild(item);
  }
}

function renderValidators(data) {
    const container = document.querySelector('[data-validators]');
  clear(container);
  const formatCurrency = createCurrencyFormatter(data.budget.currency);
  for (const validator of data.validators) {
    const card = document.createElement('article');
    card.className = 'validator-card';

    const title = document.createElement('h3');
    title.textContent = validator.handle;
    card.appendChild(title);

    const stake = document.createElement('div');
    stake.className = 'phase-meta';
    stake.textContent = `Stake: ${formatCurrency(validator.stake)}`;
    card.appendChild(stake);

    const mandate = document.createElement('div');
    mandate.className = 'phase-meta';
    mandate.textContent = validator.mandate;
    card.appendChild(mandate);

    container.appendChild(card);
  }
}

function renderMermaid(data) {
  const network = document.querySelector('[data-mermaid-network]');
  const gantt = document.querySelector('[data-mermaid-gantt]');
  clear(network);
  clear(gantt);
  network.textContent = data.mermaid?.network || 'graph TD\n  A[No network diagram generated]\n  A --> B[Run npm run demo:national-supply-chain:v0]';
  gantt.textContent = data.mermaid?.gantt || 'gantt\n  title Run npm run demo:national-supply-chain:v0 to generate timeline';
  if (window.mermaid) {
    window.mermaid.initialize(window.mermaidConfig || { startOnLoad: false, theme: 'dark' });
    window.mermaid.run({ nodes: [network, gantt] });
  }
}

async function init() {
  try {
    const data = await loadData();
    state.data = data;
    renderHeader(data);
    renderMetrics(data);
    renderPhases(data);
    renderJobs(data);
    renderCorridors(data);
    renderOwnerControls(data);
    renderValidators(data);
    renderMermaid(data);
    document.querySelector('[data-refresh-mermaid]').addEventListener('click', () => renderMermaid(state.data));
  } catch (error) {
    console.error(error);
    const body = document.querySelector('body');
    const notice = document.createElement('div');
    notice.className = 'card';
    notice.innerHTML = `<h2>Supply chain data missing</h2><p>${error.message}</p>`;
    body.appendChild(notice);
  }
}

window.addEventListener('DOMContentLoaded', init);
