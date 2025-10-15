const DATA_URL = '../export/latest.json';
const FALLBACK_URL = 'sample.json';

const state = {
  filter: 'all',
  data: null,
};

const formatTime = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    hour12: false,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const formatParameters = (value) =>
  value == null ? '' : JSON.stringify(value, null, 2);

async function loadData() {
  const responses = [DATA_URL, FALLBACK_URL];
  for (const url of responses) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      if (url === FALLBACK_URL) {
        console.warn('⚠️  Using bundled sample transcript. Export a fresh run for live data.');
      }
      return json;
    } catch (error) {
      console.warn(`Failed to load ${url}:`, error);
    }
  }
  throw new Error('No transcript file available.');
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function createCard(title, description) {
  const card = document.createElement('section');
  card.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.appendChild(heading);
  if (description) {
    const p = document.createElement('p');
    p.textContent = description;
    card.appendChild(p);
  }
  return card;
}

function renderSummary(container, market) {
  const statGrid = document.createElement('div');
  statGrid.className = 'stat-grid';
  const stats = [
    { label: 'Jobs orchestrated', value: market.totalJobs },
    { label: 'Total AGIα burned', value: market.totalBurned },
    { label: 'Circulating supply', value: market.finalSupply },
    { label: 'Protocol fee', value: `${market.feePct}%` },
    { label: 'Validator reward', value: `${market.validatorRewardPct}%` },
    { label: 'Fee pool pending', value: market.pendingFees },
    { label: 'Agent stake', value: market.totalAgentStake },
    { label: 'Validator stake', value: market.totalValidatorStake },
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
    statGrid.appendChild(node);
  }
  container.appendChild(statGrid);

  if (market.mintedCertificates.length) {
    const subtitle = document.createElement('h3');
    subtitle.textContent = 'Certificates issued';
    container.appendChild(subtitle);
    const list = document.createElement('div');
    list.className = 'certificate-list';
    for (const cert of market.mintedCertificates) {
      const card = document.createElement('article');
      card.className = 'certificate-card';
      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = `Credential #${cert.jobId}`;
      const owner = document.createElement('div');
      owner.className = 'certificate-card__owner';
      owner.textContent = cert.owner;
      card.appendChild(badge);
      card.appendChild(owner);
      if (cert.uri) {
        const uri = document.createElement('div');
        uri.className = 'parameters';
        uri.textContent = cert.uri;
        card.appendChild(uri);
      }
      list.appendChild(card);
    }
    container.appendChild(list);
  } else {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent =
      'No credential NFTs minted in this run. Replay the export after the cooperative scenario to showcase agent graduation.';
    container.appendChild(notice);
  }
}

function renderActors(container, actors) {
  const grid = document.createElement('div');
  grid.className = 'actor-grid';
  const sorted = [...actors].sort((a, b) => a.role.localeCompare(b.role));
  for (const actor of sorted) {
    const card = document.createElement('article');
    card.className = 'actor-card';
    const role = document.createElement('span');
    role.className = 'actor-card__role';
    role.textContent = actor.role;
    const name = document.createElement('h3');
    name.className = 'actor-card__name';
    name.textContent = actor.name;
    const address = document.createElement('div');
    address.className = 'actor-card__address';
    address.textContent = actor.address;
    card.appendChild(role);
    card.appendChild(name);
    card.appendChild(address);
    grid.appendChild(card);
  }
  container.appendChild(grid);
}

function renderOwnerActions(container, ownerActions) {
  const wrapper = document.createElement('div');
  wrapper.className = 'owner-actions';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Time', 'Action', 'Contract', 'Method', 'Parameters'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const action of ownerActions) {
    const row = document.createElement('tr');
    const cells = [
      formatTime(action.at),
      action.label,
      action.contract,
      action.method,
      formatParameters(action.parameters),
    ];
    cells.forEach((value, index) => {
      const td = document.createElement('td');
      if (index === 4) {
        td.className = 'parameters';
      }
      td.textContent = value;
      row.appendChild(td);
    });
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function renderScenarios(container, scenarios, data) {
  const timelineOptions = document.createElement('div');
  timelineOptions.className = 'timeline-controls';
  const filters = [
    { id: 'all', label: 'All events' },
    { id: 'setup', label: 'Owner + protocol wiring' },
    ...scenarios.map((scenario) => ({ id: scenario.title, label: scenario.title })),
  ];

  const updateButtons = () => {
    for (const button of timelineOptions.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.filter === state.filter);
    }
  };

  for (const filter of filters) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.filter = filter.id;
    button.textContent = filter.label;
    button.addEventListener('click', () => {
      state.filter = filter.id;
      updateButtons();
      renderTimeline(document.getElementById('timeline'), data.timeline);
    });
    timelineOptions.appendChild(button);
  }
  updateButtons();
  container.appendChild(timelineOptions);

  const cards = document.createElement('div');
  cards.className = 'actor-grid';
  for (const scenario of scenarios) {
    const card = document.createElement('article');
    card.className = 'actor-card';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `Job #${scenario.jobId}`;
    const title = document.createElement('h3');
    title.className = 'actor-card__name';
    title.textContent = scenario.title;
    const blurb = document.createElement('p');
    blurb.className = 'parameters';
    blurb.textContent = `${scenario.timelineIndices.length} events recorded`;
    card.appendChild(badge);
    card.appendChild(title);
    card.appendChild(blurb);
    cards.appendChild(card);
  }
  container.appendChild(cards);
}

function renderTimeline(container, timeline) {
  const timelineContainer = document.getElementById('timeline');
  if (!timelineContainer) return;
  clearNode(timelineContainer);
  const template = document.getElementById('timeline-entry-template');
  const filtered = timeline.filter((entry) => {
    if (state.filter === 'all') return true;
    if (state.filter === 'setup') return !entry.scenario;
    return entry.scenario === state.filter;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = 'No events for the selected filter. Ensure the transcript was exported with owner actions enabled.';
    timelineContainer.appendChild(empty);
    return;
  }

  for (const entry of filtered) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector('.timeline-entry__kind').textContent = entry.kind;
    node.querySelector('.timeline-entry__time').textContent = formatTime(entry.at);
    node.querySelector('.timeline-entry__label').textContent = entry.label;
    const meta = node.querySelector('.timeline-entry__meta');
    if (entry.meta && Object.keys(entry.meta).length) {
      meta.textContent = formatParameters(entry.meta);
    } else {
      meta.textContent = '—';
    }
    timelineContainer.appendChild(node);
  }
}

function renderApp(data) {
  state.data = data;
  const app = document.getElementById('app');
  clearNode(app);

  const summaryCard = createCard('Sovereign market pulse', `Network: ${data.network}`);
  renderSummary(summaryCard, data.market);
  app.appendChild(summaryCard);

  const actorsCard = createCard('Participants and wallets');
  renderActors(actorsCard, data.actors);
  app.appendChild(actorsCard);

  const ownerCard = createCard('Owner command log', 'Every configuration call executed during the run.');
  renderOwnerActions(ownerCard, data.ownerActions);
  app.appendChild(ownerCard);

  const scenariosCard = createCard('Scenario narratives', 'Select a view to focus the timeline on a specific lifecycle.');
  renderScenarios(scenariosCard, data.scenarios, data);
  app.appendChild(scenariosCard);

  const timelineCard = createCard('Event timeline');
  const timelineContainer = document.createElement('div');
  timelineContainer.id = 'timeline';
  timelineCard.appendChild(timelineContainer);
  app.appendChild(timelineCard);

  renderTimeline(timelineContainer, data.timeline);
}

function renderError(error) {
  const app = document.getElementById('app');
  clearNode(app);
  const card = createCard('Transcript unavailable');
  const notice = document.createElement('div');
  notice.className = 'notice';
  notice.textContent = error.message;
  card.appendChild(notice);
  app.appendChild(card);
}

loadData().then(renderApp).catch(renderError);
