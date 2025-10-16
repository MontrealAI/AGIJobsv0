const TRANSCRIPT_PATHS = ['export/latest.json', '../export/latest.json'];
const FALLBACK_URL = 'sample.json';

const state = {
  filter: 'all',
  ownerActionSearch: '',
  data: null,
  downloadUrl: null,
};

const HIGHLIGHT_CLASS = {
  owner: 'highlight-card--owner',
  agent: 'highlight-card--agent',
  validator: 'highlight-card--validator',
  market: 'highlight-card--market',
};

const STATUS_CLASS = {
  'owner-in-command': 'status-pill status-pill--success',
  'action-needed': 'status-pill status-pill--warning',
};

const STATUS_LABEL = {
  'owner-in-command': 'Owner in command',
  'action-needed': 'Action required',
};

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    hour12: false,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatParameters(value) {
  return value == null ? '' : JSON.stringify(value, null, 2);
}

async function loadData() {
  const responses = [...TRANSCRIPT_PATHS, FALLBACK_URL];
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
    p.className = 'card__description';
    p.textContent = description;
    card.appendChild(p);
  }
  return card;
}

function createDownloadUrl(data) {
  if (state.downloadUrl) {
    URL.revokeObjectURL(state.downloadUrl);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  state.downloadUrl = URL.createObjectURL(blob);
  return state.downloadUrl;
}

function renderHero(data) {
  const header = document.createElement('header');
  header.className = 'hero';

  const title = document.createElement('h1');
  title.textContent = 'AGI Jobs v2 Sovereign Command Center';
  header.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'hero__subtitle';
  subtitle.textContent = `Network: ${data.network} • Transcript generated ${formatTime(data.generatedAt)}`;
  header.appendChild(subtitle);

  const actions = document.createElement('div');
  actions.className = 'hero__actions';
  const downloadLink = document.createElement('a');
  downloadLink.className = 'button';
  downloadLink.textContent = 'Download transcript JSON';
  downloadLink.href = createDownloadUrl(data);
  downloadLink.download = 'agi-jobs-grand-demo.json';
  actions.appendChild(downloadLink);
  header.appendChild(actions);

  if (data.empowerment?.quickStart?.length) {
    const quickStartCard = document.createElement('div');
    quickStartCard.className = 'hero__quickstart';
    const quickHeading = document.createElement('h3');
    quickHeading.textContent = 'Quick start checklist';
    quickStartCard.appendChild(quickHeading);
    const list = document.createElement('ol');
    for (const item of data.empowerment.quickStart) {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    }
    quickStartCard.appendChild(list);
    header.appendChild(quickStartCard);
  }

  return header;
}

function renderHighlightsCard(highlights) {
  const card = createCard(
    'Empowerment highlights',
    'Instant signal for non-technical owners: what this run proved about control, prosperity, and safety.'
  );
  const grid = document.createElement('div');
  grid.className = 'highlight-grid';
  for (const highlight of highlights || []) {
    const article = document.createElement('article');
    const categoryClass = HIGHLIGHT_CLASS[highlight.category] || 'highlight-card';
    article.className = `highlight-card ${categoryClass}`;
    const h3 = document.createElement('h3');
    h3.textContent = highlight.title;
    article.appendChild(h3);
    const p = document.createElement('p');
    p.textContent = highlight.body;
    article.appendChild(p);
    grid.appendChild(article);
  }
  if (!grid.childElementCount) {
    const p = document.createElement('p');
    p.className = 'notice';
    p.textContent = 'Run the Hardhat export to populate empowerment highlights.';
    card.appendChild(p);
  } else {
    card.appendChild(grid);
  }
  return card;
}

function renderScoreboardCard(scoreboard) {
  const card = createCard(
    'Sovereign market scoreboard',
    'These metrics surface the production value unlocked during the simulation.'
  );
  const grid = document.createElement('div');
  grid.className = 'scoreboard-grid';
  for (const entry of scoreboard || []) {
    const item = document.createElement('article');
    item.className = 'scoreboard-card';
    const label = document.createElement('span');
    label.className = 'scoreboard-card__label';
    label.textContent = entry.label;
    const value = document.createElement('strong');
    value.className = 'scoreboard-card__value';
    value.textContent = entry.value;
    const explanation = document.createElement('p');
    explanation.className = 'scoreboard-card__explanation';
    explanation.textContent = entry.explanation;
    item.appendChild(label);
    item.appendChild(value);
    item.appendChild(explanation);
    grid.appendChild(item);
  }
  card.appendChild(grid);
  return card;
}

function renderMarketSummaryCard(market) {
  const card = createCard(
    'Market telemetry',
    'Production-grade metrics captured from the Hardhat simulation run.'
  );
function renderSummary(container, market, meta = {}) {
  const metaBar = document.createElement('div');
  metaBar.className = 'summary-meta';
  if (meta.generatedAt) {
    const generated = document.createElement('div');
    generated.className = 'summary-meta__item';
    generated.textContent = `Transcript generated ${formatTime(meta.generatedAt)}`;
    metaBar.appendChild(generated);
  }
  if (meta.network) {
    const network = document.createElement('div');
    network.className = 'summary-meta__item';
    network.textContent = meta.network;
    metaBar.appendChild(network);
  }
  if (typeof meta.ownerActions === 'number') {
    const ownerActionCount = document.createElement('div');
    ownerActionCount.className = 'summary-meta__item';
    ownerActionCount.textContent = `${meta.ownerActions} owner command(s)`;
    metaBar.appendChild(ownerActionCount);
  }
  if (typeof meta.timelineEntries === 'number') {
    const timelineCount = document.createElement('div');
    timelineCount.className = 'summary-meta__item';
    timelineCount.textContent = `${meta.timelineEntries} recorded events`;
    metaBar.appendChild(timelineCount);
  }
  if (metaBar.childElementCount > 0) {
    container.appendChild(metaBar);
  }

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
  card.appendChild(statGrid);

  if (market.mintedCertificates?.length) {
    const subtitle = document.createElement('h3');
    subtitle.textContent = 'Certificates issued';
    card.appendChild(subtitle);
    const list = document.createElement('div');
    list.className = 'certificate-list';
    for (const cert of market.mintedCertificates) {
      const certificateCard = document.createElement('article');
      certificateCard.className = 'certificate-card';
      const badge = document.createElement('div');
      badge.className = 'badge';
      badge.textContent = `Credential #${cert.jobId}`;
      const owner = document.createElement('div');
      owner.className = 'certificate-card__owner';
      owner.textContent = cert.owner;
      certificateCard.appendChild(badge);
      certificateCard.appendChild(owner);
      if (cert.uri) {
        const uri = document.createElement('div');
        uri.className = 'parameters';
        uri.textContent = cert.uri;
        certificateCard.appendChild(uri);
      }
      list.appendChild(certificateCard);
    }
    card.appendChild(list);
  } else {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = 'Replay the export after the cooperative scenario to showcase credential minting.';
    card.appendChild(notice);
  }

  return card;
}

function renderOwnerConfidenceCard(confidence) {
  const card = createCard('Owner command readiness', confidence?.summary || '');
  const pill = document.createElement('span');
  pill.className = STATUS_CLASS[confidence?.status] || 'status-pill';
  pill.textContent = STATUS_LABEL[confidence?.status] || 'Status unavailable';
  card.appendChild(pill);

  if (confidence?.checks?.length) {
    const list = document.createElement('ul');
    list.className = 'owner-confidence-list';
    for (const check of confidence.checks) {
      const li = document.createElement('li');
      li.textContent = check;
      list.appendChild(li);
    }
    card.appendChild(list);
  }
  return card;
}

function renderActorsCard(actors) {
  const card = createCard(
    'Participants and wallets',
    'Nations, AI agents, validators, moderators, and owners that participated in the run.'
  );
  const grid = document.createElement('div');
  grid.className = 'actor-grid';
  const sorted = [...actors].sort((a, b) => a.role.localeCompare(b.role));
  for (const actor of sorted) {
    const article = document.createElement('article');
    article.className = 'actor-card';
    const role = document.createElement('span');
    role.className = 'actor-card__role';
    role.textContent = actor.role;
    const name = document.createElement('h3');
    name.className = 'actor-card__name';
    name.textContent = actor.name;
    const address = document.createElement('div');
    address.className = 'actor-card__address';
    address.textContent = actor.address;
    article.appendChild(role);
    article.appendChild(name);
    article.appendChild(address);
    grid.appendChild(article);
  }
  card.appendChild(grid);
  return card;
}

function renderOwnerActionsCard(ownerActions) {
  const card = createCard(
    'Owner command log',
    'Every configuration call executed during the run. Use the search box to drill into contracts or parameters.'
  );
  const wrapper = document.createElement('div');
  wrapper.className = 'owner-actions';

  const controls = document.createElement('div');
  controls.className = 'owner-actions__controls';
  const label = document.createElement('label');
  label.textContent = 'Filter actions:';
  label.setAttribute('for', 'owner-action-search');
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'owner-action-search';
  input.placeholder = 'Search by contract, method, or description';
  input.value = state.ownerActionSearch;
  input.addEventListener('input', () => {
    state.ownerActionSearch = input.value.toLowerCase();
    updateTable();
  });
  controls.appendChild(label);
  controls.appendChild(input);
  wrapper.appendChild(controls);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Time', 'Action', 'Contract', 'Method', 'Parameters'].forEach((heading) => {
    const th = document.createElement('th');
    th.textContent = heading;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  wrapper.appendChild(table);
  card.appendChild(wrapper);

  function updateTable() {
    clearNode(tbody);
    const query = state.ownerActionSearch;
    const filtered = ownerActions.filter((action) => {
      if (!query) return true;
      const haystack = [
        action.label,
        action.contract,
        action.method,
        JSON.stringify(action.parameters ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    if (filtered.length === 0) {
      const empty = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'notice';
      td.textContent = 'No actions match the current filter.';
      empty.appendChild(td);
      tbody.appendChild(empty);
      return;
    }

    for (const action of filtered) {
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
  }

  updateTable();
  return card;
}

function renderOwnerControlCard(ownerControl) {
  const card = createCard(
    'Owner sovereign control snapshot',
    'Baseline safeguards, live adjustments, and delegated emergency drills captured from the run.'
  );

  if (!ownerControl) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = 'Run the latest grand demo export to populate the owner command snapshot.';
    card.appendChild(notice);
    return card;
  }

  const addressesSection = document.createElement('div');
  addressesSection.className = 'owner-control-section';
  const addressesTitle = document.createElement('h3');
  addressesTitle.textContent = 'Command identities';
  addressesSection.appendChild(addressesTitle);
  const addressList = document.createElement('dl');
  addressList.className = 'owner-control-dl';
  const entries = [
    { label: 'Owner', value: ownerControl.ownerAddress },
    { label: 'Moderator', value: ownerControl.moderatorAddress },
    { label: 'Registry', value: ownerControl.modules.registry },
    { label: 'Stake manager', value: ownerControl.modules.stake },
    { label: 'Validation module', value: ownerControl.modules.validation },
    { label: 'Fee pool', value: ownerControl.modules.feePool },
    { label: 'Dispute module', value: ownerControl.modules.dispute },
    { label: 'Certificate NFT', value: ownerControl.modules.certificate },
    { label: 'Reputation engine', value: ownerControl.modules.reputation },
    { label: 'Identity registry', value: ownerControl.modules.identity },
  ];
  for (const entry of entries) {
    const dt = document.createElement('dt');
    dt.textContent = entry.label;
    const dd = document.createElement('dd');
    dd.className = 'parameters';
    dd.textContent = entry.value;
    addressList.appendChild(dt);
    addressList.appendChild(dd);
  }
  addressesSection.appendChild(addressList);
  card.appendChild(addressesSection);

  const tableSection = document.createElement('div');
  tableSection.className = 'owner-control-section';
  const tableTitle = document.createElement('h3');
  tableTitle.textContent = 'Parameter authority – baseline vs drill vs restored';
  tableSection.appendChild(tableTitle);
  const table = document.createElement('table');
  table.className = 'owner-control-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Setting', 'Baseline', 'During drill', 'Restored'].forEach((heading) => {
    const th = document.createElement('th');
    th.textContent = heading;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const rows = [
    { label: 'Protocol fee', key: 'feePct', format: (value) => `${value}%` },
    {
      label: 'Validator reward share',
      key: 'validatorRewardPct',
      format: (value) => `${value}%`,
    },
    { label: 'Fee burn', key: 'burnPct', format: (value) => `${value}%` },
    {
      label: 'Commit window',
      key: 'commitWindowFormatted',
      format: (value, state) => state.commitWindowFormatted || `${value}s`,
    },
    {
      label: 'Reveal window',
      key: 'revealWindowFormatted',
      format: (value, state) => state.revealWindowFormatted || `${value}s`,
    },
    {
      label: 'Reveal quorum',
      key: 'revealQuorumPct',
      format: (value) => `${value}%`,
    },
    { label: 'Minimum revealers', key: 'minRevealers', format: (value) => `${value}` },
    {
      label: 'Non-reveal penalty',
      key: 'nonRevealPenaltyBps',
      format: (value, state) => `${state.nonRevealPenaltyBps} bps`,
    },
    {
      label: 'Non-reveal ban',
      key: 'nonRevealBanBlocks',
      format: (value, state) => `${state.nonRevealBanBlocks} blocks`,
    },
    {
      label: 'Registry pauser',
      key: 'registryPauser',
      format: (value) => value,
      className: 'parameters',
    },
    {
      label: 'Stake manager pauser',
      key: 'stakePauser',
      format: (value) => value,
      className: 'parameters',
    },
    {
      label: 'Validation pauser',
      key: 'validationPauser',
      format: (value) => value,
      className: 'parameters',
    },
  ];

  const states = [ownerControl.baseline, ownerControl.upgraded, ownerControl.restored];
  for (const row of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = row.label;
    tr.appendChild(th);
    for (const stateEntry of states) {
      const td = document.createElement('td');
      const rawValue = stateEntry[row.key];
      const display = row.format(rawValue, stateEntry);
      td.textContent = display;
      if (row.className) td.className = row.className;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableSection.appendChild(table);
  card.appendChild(tableSection);

  const pauseSection = document.createElement('div');
  pauseSection.className = 'owner-control-section';
  const pauseTitle = document.createElement('h3');
  pauseTitle.textContent = 'Emergency pause drill outcomes';
  pauseSection.appendChild(pauseTitle);
  const pauseTable = document.createElement('table');
  pauseTable.className = 'owner-control-table';
  const pauseHead = document.createElement('thead');
  const pauseRow = document.createElement('tr');
  ['', 'Registry', 'Stake manager', 'Validation'].forEach((heading) => {
    const th = document.createElement('th');
    th.textContent = heading;
    pauseRow.appendChild(th);
  });
  pauseHead.appendChild(pauseRow);
  pauseTable.appendChild(pauseHead);
  const pauseBody = document.createElement('tbody');
  const pauseRows = [
    { label: 'Owner drill', status: ownerControl.pauseDrill.owner },
    { label: 'Moderator drill', status: ownerControl.pauseDrill.moderator },
  ];
  for (const entry of pauseRows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = entry.label;
    tr.appendChild(th);
    ['registry', 'stake', 'validation'].forEach((key) => {
      const td = document.createElement('td');
      td.textContent = entry.status[key] ? 'Paused + resumed' : 'Not exercised';
      tr.appendChild(td);
    });
    pauseBody.appendChild(tr);
  }
  pauseTable.appendChild(pauseBody);
  pauseSection.appendChild(pauseTable);
  card.appendChild(pauseSection);

  return card;
}

function renderScenarioDeckCard(scenarios) {
  const card = createCard(
    'Scenario narratives',
    'Each job lifecycle highlights how AGI Jobs routes value, enforces accountability, and maintains owner control.'
  );
  if (!scenarios?.length) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent = 'No scenarios recorded yet. Export a fresh run to populate this section.';
    card.appendChild(notice);
    return card;
  }
  const grid = document.createElement('div');
  grid.className = 'scenario-grid';
  for (const scenario of scenarios) {
    const article = document.createElement('article');
    article.className = 'scenario-card';
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `Job #${scenario.jobId}`;
    article.appendChild(badge);
    const title = document.createElement('h3');
    title.textContent = scenario.title;
    article.appendChild(title);
    const summary = document.createElement('p');
    summary.className = 'scenario-card__summary';
    summary.textContent = scenario.highlights?.[0] || 'Scenario executed during the demo run.';
    article.appendChild(summary);

    const actors = document.createElement('p');
    actors.className = 'scenario-card__actors';
    actors.textContent = `${scenario.employer.name} → ${scenario.agent.name}`;
    article.appendChild(actors);

    const metricList = document.createElement('ul');
    metricList.className = 'scenario-card__metrics';
    for (const metric of scenario.metrics || []) {
      const li = document.createElement('li');
      li.textContent = `${metric.label}: ${metric.value}`;
      metricList.appendChild(li);
    }
    article.appendChild(metricList);

    if (scenario.payouts?.length) {
      const payoutHeading = document.createElement('h4');
      payoutHeading.textContent = 'Value transfers';
      article.appendChild(payoutHeading);
      const payoutList = document.createElement('ul');
      payoutList.className = 'scenario-card__payouts';
      for (const payout of scenario.payouts) {
        const li = document.createElement('li');
        li.textContent = `${payout.participant.name}: ${payout.delta}`;
        payoutList.appendChild(li);
      }
      article.appendChild(payoutList);
    }

    const highlightList = document.createElement('ul');
    highlightList.className = 'scenario-card__highlights';
    for (const highlight of scenario.highlights.slice(1)) {
      const li = document.createElement('li');
      li.textContent = highlight;
      highlightList.appendChild(li);
    }
    if (highlightList.childElementCount) {
      article.appendChild(highlightList);
    }

    grid.appendChild(article);
  }
  card.appendChild(grid);
  return card;
}

function renderTimelineControls(container, data) {
  const timelineOptions = document.createElement('div');
  timelineOptions.className = 'timeline-controls';
  const filters = [
    { id: 'all', label: 'All events' },
    { id: 'setup', label: 'Owner + protocol wiring' },
    ...(data.scenarios || []).map((scenario) => ({
      id: scenario.title,
      label: scenario.title,
    })),
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
}

function renderTimelineSection(data) {
  const card = createCard(
    'Event timeline',
    'Follow the market across wiring, scenarios, owner actions, and dispute arbitration.'
  );
  renderTimelineControls(card, data);
  const timelineContainer = document.createElement('div');
  timelineContainer.id = 'timeline';
  card.appendChild(timelineContainer);
  return card;
}

function renderTimeline(container, timeline) {
  const timelineContainer = container;
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

  app.appendChild(renderHero(data));
  app.appendChild(renderHighlightsCard(data.empowerment?.highlights));
  app.appendChild(renderScoreboardCard(data.empowerment?.scoreboard));
  app.appendChild(renderMarketSummaryCard(data.market));
  app.appendChild(renderOwnerConfidenceCard(data.empowerment?.ownerConfidence));
  app.appendChild(renderActorsCard(data.actors));
  app.appendChild(renderOwnerActionsCard(data.ownerActions));
  app.appendChild(renderOwnerControlCard(data.ownerControl));
  app.appendChild(renderScenarioDeckCard(data.scenarios));
  const timelineCard = renderTimelineSection(data);
  const summaryCard = createCard(
    'Sovereign market pulse',
    'Live protocol economics exported from the sovereign labour market simulator.'
  );
  renderSummary(summaryCard, data.market, {
    generatedAt: data.generatedAt,
    network: data.network,
    ownerActions: data.ownerActions.length,
    timelineEntries: data.timeline.length,
  });
  app.appendChild(summaryCard);

  const actorsCard = createCard('Participants and wallets');
  renderActors(actorsCard, data.actors);
  app.appendChild(actorsCard);

  const ownerCard = createCard('Owner command log', 'Every configuration call executed during the run.');
  renderOwnerActions(ownerCard, data.ownerActions);
  app.appendChild(ownerCard);

  const controlCard = createCard(
    'Owner sovereign control snapshot',
    'Baseline safeguards, live adjustments, and delegated emergency drills captured from the run.'
  );
  renderOwnerControlSnapshot(controlCard, data.ownerControl);
  app.appendChild(controlCard);

  const scenariosCard = createCard('Scenario narratives', 'Select a view to focus the timeline on a specific lifecycle.');
  renderScenarios(scenariosCard, data.scenarios, data);
  app.appendChild(scenariosCard);

  const timelineCard = createCard('Event timeline');
  const timelineContainer = document.createElement('div');
  timelineContainer.id = 'timeline';
  timelineCard.appendChild(timelineContainer);
  app.appendChild(timelineCard);
  renderTimeline(document.getElementById('timeline'), data.timeline);
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
