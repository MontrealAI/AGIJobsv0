const TRANSCRIPT_PATHS = ['export/latest.json', '../export/latest.json'];
const FALLBACK_URL = 'sample.json';

const state = {
  filter: 'all',
  data: null,
};

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API failed, falling back to execCommand', error);
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textarea);
    return result;
  } catch (error) {
    console.warn('Fallback clipboard copy failed', error);
    return false;
  }
}

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

const normaliseAddress = (value) =>
  typeof value === 'string' ? value.toLowerCase() : '';

function appendMetric(list, label, value, className) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (className) dd.className = className;
  list.appendChild(dt);
  list.appendChild(dd);
}

function renderCertificates(dd, certificates) {
  dd.className = 'certificate-tags';
  if (!certificates || certificates.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'pill muted';
    empty.textContent = 'No credentials minted yet';
    dd.appendChild(empty);
    return;
  }

  for (const cert of certificates) {
    const badge = document.createElement('span');
    badge.className = 'pill';
    badge.textContent = cert.uri ? `#${cert.jobId} · ${cert.uri}` : `Credential #${cert.jobId}`;
    dd.appendChild(badge);
  }
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
    p.textContent = description;
    card.appendChild(p);
  }
  return card;
}

function createCopyButton(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  button.textContent = 'Copy';
  button.addEventListener('click', async () => {
    const success = await copyTextToClipboard(text);
    button.dataset.state = success ? 'success' : 'error';
    button.textContent = success ? 'Copied!' : 'Copy failed';
    setTimeout(() => {
      button.dataset.state = '';
      button.textContent = 'Copy';
    }, 2000);
  });
  return button;
}

function appendCommandItem(list, entry) {
  if (!entry || !entry.command) return;
  const li = document.createElement('li');
  li.className = 'command-item';

  const header = document.createElement('div');
  header.className = 'command-item__header';

  const meta = document.createElement('div');
  meta.className = 'command-item__meta';
  const label = document.createElement('strong');
  label.textContent = entry.label || 'Command';
  const code = document.createElement('code');
  code.textContent = entry.command;
  meta.appendChild(label);
  meta.appendChild(code);
  header.appendChild(meta);

  const copy = createCopyButton(entry.command);
  header.appendChild(copy);

  li.appendChild(header);

  if (entry.description) {
    const description = document.createElement('p');
    description.className = 'command-item__description';
    description.textContent = entry.description;
    li.appendChild(description);
  }

  list.appendChild(li);
}

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

const PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High priority',
  normal: 'Ready to execute',
};

function renderScoreCard(wrapper, label, value, max, description) {
  const card = document.createElement('div');
  card.className = 'score-card';
  const metricLabel = document.createElement('div');
  metricLabel.className = 'score-card__label';
  metricLabel.textContent = label;
  const metricValue = document.createElement('div');
  metricValue.className = 'score-card__value';
  metricValue.textContent = value;
  card.appendChild(metricLabel);
  card.appendChild(metricValue);
  if (typeof max === 'number') {
    const bar = document.createElement('div');
    bar.className = 'score-card__bar';
    const fill = document.createElement('div');
    fill.className = 'score-card__bar-fill';
    const clamped = Math.max(0, Math.min(Number(value) || 0, max));
    fill.style.width = `${(clamped / max) * 100}%`;
    bar.appendChild(fill);
    card.appendChild(bar);
  }
  if (description) {
    const desc = document.createElement('p');
    desc.className = 'score-card__description';
    desc.textContent = description;
    card.appendChild(desc);
  }
  wrapper.appendChild(card);
}

function renderDirectiveGroup(container, title, directives, emptyCopy) {
  const section = document.createElement('section');
  section.className = 'automation-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  section.appendChild(heading);

  if (!Array.isArray(directives) || directives.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notice';
    empty.textContent = emptyCopy;
    section.appendChild(empty);
    container.appendChild(section);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'directive-grid';
  for (const directive of directives) {
    const card = document.createElement('article');
    card.className = 'directive-card';
    const priority = document.createElement('span');
    priority.className = `priority-chip priority-${directive.priority}`;
    priority.textContent = PRIORITY_LABELS[directive.priority] || directive.priority;
    card.appendChild(priority);

    const titleEl = document.createElement('h4');
    titleEl.textContent = directive.title;
    card.appendChild(titleEl);

    const summary = document.createElement('p');
    summary.className = 'directive-summary';
    summary.textContent = directive.summary;
    card.appendChild(summary);

    if (directive.recommendedAction) {
      const action = document.createElement('code');
      action.className = 'directive-action';
      action.textContent = directive.recommendedAction;
      card.appendChild(action);
    }

    if (directive.metrics && Object.keys(directive.metrics).length) {
      const dl = document.createElement('dl');
      dl.className = 'directive-metrics';
      for (const [key, val] of Object.entries(directive.metrics)) {
        const dt = document.createElement('dt');
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.textContent = val;
        dl.appendChild(dt);
        dl.appendChild(dd);
      }
      card.appendChild(dl);
    }

    grid.appendChild(card);
  }

  section.appendChild(grid);
  container.appendChild(section);
}

function renderAutomation(container, automation) {
  if (!automation) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent =
      'Export the latest transcript to populate the autonomous command plan. The Hardhat demo now generates a machine-readable playbook.';
    container.appendChild(notice);
    return;
  }

  const intro = document.createElement('p');
  intro.className = 'automation-summary';
  intro.textContent = automation.missionSummary;
  container.appendChild(intro);

  const scoreboard = document.createElement('div');
  scoreboard.className = 'scoreboard';
  renderScoreCard(scoreboard, 'Resilience score', automation.resilienceScore, 100, 'Composite score for governance drills, disputes, and liquidity.');
  renderScoreCard(scoreboard, 'Unstoppable index', automation.unstoppableScore, 100, 'Confidence that the sovereign labour market can be steered instantly.');
  renderScoreCard(
    scoreboard,
    'Jobs orchestrated',
    automation.telemetry.totalJobs,
    undefined,
    `${automation.telemetry.mintedCertificates} credential NFTs minted`
  );
  container.appendChild(scoreboard);

  const directiveLayout = document.createElement('div');
  directiveLayout.className = 'automation-grid';
  renderDirectiveGroup(
    directiveLayout,
    'Owner directives',
    automation.autopilot.ownerDirectives,
    'Run the Hardhat export to regenerate owner directives.'
  );
  renderDirectiveGroup(
    directiveLayout,
    'Agent opportunities',
    automation.autopilot.agentOpportunities,
    'Mint credentials in the demo to unlock agent opportunities.'
  );
  renderDirectiveGroup(
    directiveLayout,
    'Validator signals',
    automation.autopilot.validatorSignals,
    'Validator telemetry populates once the simulation runs.'
  );
  renderDirectiveGroup(
    directiveLayout,
    'Treasury alerts',
    automation.autopilot.treasuryAlerts,
    'Treasury alerts appear after the protocol executes fee flows.'
  );
  container.appendChild(directiveLayout);

  const commands = document.createElement('section');
  commands.className = 'automation-section automation-commands';
  const commandsTitle = document.createElement('h3');
  commandsTitle.textContent = 'One-command launch checklist';
  commands.appendChild(commandsTitle);
  const list = document.createElement('ul');
  list.className = 'command-list command-list--palette';
  const commandEntries = [
    {
      label: 'Replay sovereign demo',
      command: automation.commands.replayDemo,
      description: 'Runs the Hardhat automation, replaying jobs, disputes, and owner drills.',
    },
    {
      label: 'Export transcript',
      command: automation.commands.exportTranscript,
      description: 'Refreshes export/latest.json so the control room reflects the latest run.',
    },
    {
      label: 'Launch control room',
      command: automation.commands.launchControlRoom,
      description: 'Starts the local UI server with an interactive replay prompt for executives.',
    },
    {
      label: 'Owner dashboard',
      command: automation.commands.ownerDashboard,
      description: 'Prints the multi-module ownership, fees, and pause status for a target network.',
    },
  ];
  for (const entry of commandEntries) {
    appendCommandItem(list, entry);
  }
  commands.appendChild(list);

  const verification = document.createElement('div');
  verification.className = 'verification-block';
  const verificationTitle = document.createElement('h4');
  verificationTitle.textContent = 'Verification guardrails';
  verification.appendChild(verificationTitle);
  const checks = document.createElement('ul');
  checks.className = 'verification-list';
  for (const context of automation.verification.requiredChecks) {
    const li = document.createElement('li');
    li.textContent = context;
    checks.appendChild(li);
  }
  verification.appendChild(checks);

  const commandList = document.createElement('ul');
  commandList.className = 'verification-commands';
  for (const cmd of automation.verification.recommendedCommands) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = cmd;
    li.appendChild(code);
    li.appendChild(createCopyButton(cmd));
    commandList.appendChild(li);
  }
  verification.appendChild(commandList);

  const docs = document.createElement('p');
  docs.className = 'verification-docs';
  docs.textContent = `Reference: ${automation.verification.docs.join(' · ')}`;
  verification.appendChild(docs);

  commands.appendChild(verification);
  container.appendChild(commands);
}

function renderInsights(container, insights) {
  if (!Array.isArray(insights) || insights.length === 0) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent =
      'Replay the grand demo export to populate mission-critical insights summarising owner control, agent success, and dispute outcomes.';
    container.appendChild(notice);
    return;
  }

  const grouped = new Map();
  for (const insight of insights) {
    const key = insight.category || 'Insight';
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(insight);
  }

  const grid = document.createElement('div');
  grid.className = 'insights-grid';

  for (const [category, entries] of grouped.entries()) {
    const card = document.createElement('article');
    card.className = 'insight-card';

    const heading = document.createElement('h3');
    heading.textContent = category;
    card.appendChild(heading);

    const list = document.createElement('ul');
    list.className = 'insight-list';

    for (const entry of entries) {
      const item = document.createElement('li');

      const title = document.createElement('div');
      title.className = 'insight-title';
      title.textContent = entry.title;
      item.appendChild(title);

      const detail = document.createElement('p');
      detail.className = 'insight-detail';
      detail.textContent = entry.detail;
      item.appendChild(detail);

      const metaBar = document.createElement('div');
      metaBar.className = 'insight-meta';
      const timeEl = document.createElement('time');
      timeEl.dateTime = entry.at;
      timeEl.textContent = formatTime(entry.at);
      metaBar.appendChild(timeEl);
      if (typeof entry.timelineIndex === 'number') {
        const span = document.createElement('span');
        span.textContent = `Timeline #${entry.timelineIndex + 1}`;
        metaBar.appendChild(span);
      }
      item.appendChild(metaBar);

      if (entry.meta && Object.keys(entry.meta).length) {
        const pre = document.createElement('pre');
        pre.className = 'parameters';
        pre.textContent = formatParameters(entry.meta);
        item.appendChild(pre);
      }

      list.appendChild(item);
    }

    card.appendChild(list);
    grid.appendChild(card);
  }

  container.appendChild(grid);
}

function renderActors(container, actors, market, ownerControl) {
  const grid = document.createElement('div');
  grid.className = 'actor-grid';
  const sorted = [...actors].sort((a, b) => {
    const roleCompare = a.role.localeCompare(b.role);
    if (roleCompare !== 0) return roleCompare;
    return a.name.localeCompare(b.name);
  });

  const agentLookup = new Map(
    (market.agentPortfolios || []).map((entry) => [normaliseAddress(entry.address), entry])
  );
  const validatorLookup = new Map(
    (market.validatorCouncil || []).map((entry) => [normaliseAddress(entry.address), entry])
  );

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

    if (actor.role === 'Agent') {
      const portfolio = agentLookup.get(normaliseAddress(actor.address));
      if (portfolio) {
        const metrics = document.createElement('dl');
        metrics.className = 'metrics-dl';
        appendMetric(metrics, 'Liquid balance', portfolio.liquid, 'parameters');
        appendMetric(metrics, 'Active stake', portfolio.staked, 'parameters');
        appendMetric(metrics, 'Locked stake', portfolio.locked, 'parameters');
        appendMetric(metrics, 'Reputation score', portfolio.reputation, 'parameters');
        const dt = document.createElement('dt');
        dt.textContent = 'Credentials';
        const dd = document.createElement('dd');
        renderCertificates(dd, portfolio.certificates);
        metrics.appendChild(dt);
        metrics.appendChild(dd);
        card.appendChild(metrics);
      }
    } else if (actor.role === 'Validator') {
      const portfolio = validatorLookup.get(normaliseAddress(actor.address));
      if (portfolio) {
        const metrics = document.createElement('dl');
        metrics.className = 'metrics-dl';
        appendMetric(metrics, 'Liquid balance', portfolio.liquid, 'parameters');
        appendMetric(metrics, 'Staked capital', portfolio.staked, 'parameters');
        appendMetric(metrics, 'Locked stake', portfolio.locked, 'parameters');
        appendMetric(metrics, 'Reputation score', portfolio.reputation, 'parameters');
        card.appendChild(metrics);
      }
    } else if (actor.role === 'Owner' && ownerControl) {
      const insight = document.createElement('p');
      insight.className = 'parameters highlight';
      insight.textContent =
        'Owns full-spectrum authority across registry, staking, validation, dispute, certificates, and identity modules. Emergency pause powers were delegated, exercised, and restored during the drill.';
      card.appendChild(insight);
    }

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

function renderOwnerControlSnapshot(container, ownerControl) {
  if (!ownerControl) {
    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.textContent =
      'Run the latest grand demo export to populate the owner command snapshot. The Hardhat script records every governance lever exercised.';
    container.appendChild(notice);
    return;
  }

  const addressesSection = document.createElement('div');
  addressesSection.className = 'owner-control-section';
  const addressesTitle = document.createElement('h3');
  addressesTitle.textContent = 'Command identities';
  addressesSection.appendChild(addressesTitle);

  const addressList = document.createElement('dl');
  addressList.className = 'owner-control-dl';
  const addressEntries = [
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
    { label: 'Drill completed', value: formatTime(ownerControl.drillCompletedAt) },
  ];
  for (const entry of addressEntries) {
    const dt = document.createElement('dt');
    dt.textContent = entry.label;
    const dd = document.createElement('dd');
    dd.className = 'parameters';
    dd.textContent = entry.value;
    addressList.appendChild(dt);
    addressList.appendChild(dd);
  }
  addressesSection.appendChild(addressList);
  container.appendChild(addressesSection);

  const tableSection = document.createElement('div');
  tableSection.className = 'owner-control-section';
  const tableTitle = document.createElement('h3');
  tableTitle.textContent = 'Parameter authority – baseline vs live adjustments';
  tableSection.appendChild(tableTitle);

  const table = document.createElement('table');
  table.className = 'owner-control-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Setting', 'Baseline', 'During drill', 'Restored'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const rows = [
    {
      label: 'Protocol fee',
      render: (state) => `${state.feePct}%`,
    },
    {
      label: 'Validator reward share',
      render: (state) => `${state.validatorRewardPct}%`,
    },
    {
      label: 'Fee burn',
      render: (state) => `${state.burnPct}%`,
    },
    {
      label: 'Commit window',
      render: (state) => state.commitWindowFormatted,
    },
    {
      label: 'Reveal window',
      render: (state) => state.revealWindowFormatted,
    },
    {
      label: 'Reveal quorum',
      render: (state) => `${state.revealQuorumPct}%`,
    },
    {
      label: 'Minimum revealers',
      render: (state) => state.minRevealers.toString(),
    },
    {
      label: 'Non-reveal penalty',
      render: (state) => `${state.nonRevealPenaltyBps} bps`,
    },
    {
      label: 'Non-reveal ban',
      render: (state) => `${state.nonRevealBanBlocks} blocks`,
    },
    {
      label: 'Registry pauser',
      render: (state) => state.registryPauser,
      className: 'parameters',
    },
    {
      label: 'Stake manager pauser',
      render: (state) => state.stakePauser,
      className: 'parameters',
    },
    {
      label: 'Validation pauser',
      render: (state) => state.validationPauser,
      className: 'parameters',
    },
  ];

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.textContent = row.label;
    tr.appendChild(labelCell);

    const states = [ownerControl.baseline, ownerControl.upgraded, ownerControl.restored];
    for (const state of states) {
      const td = document.createElement('td');
      const value = row.render(state);
      td.textContent = value;
      if (row.className) {
        td.className = row.className;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableSection.appendChild(table);
  container.appendChild(tableSection);

  const pauseSection = document.createElement('div');
  pauseSection.className = 'owner-control-section';
  const pauseTitle = document.createElement('h3');
  pauseTitle.textContent = 'Emergency pause drill outcomes';
  pauseSection.appendChild(pauseTitle);

  const pauseTable = document.createElement('table');
  pauseTable.className = 'owner-control-table';
  const pauseHead = document.createElement('thead');
  const pauseHeadRow = document.createElement('tr');
  ['', 'Registry', 'Stake manager', 'Validation'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    pauseHeadRow.appendChild(th);
  });
  pauseHead.appendChild(pauseHeadRow);
  pauseTable.appendChild(pauseHead);

  const pauseBody = document.createElement('tbody');
  const pauseRows = [
    { label: 'Owner drill', status: ownerControl.pauseDrill.owner },
    { label: 'Moderator drill', status: ownerControl.pauseDrill.moderator },
  ];
  for (const entry of pauseRows) {
    const tr = document.createElement('tr');
    const labelCell = document.createElement('th');
    labelCell.textContent = entry.label;
    tr.appendChild(labelCell);
    ['registry', 'stake', 'validation'].forEach((key) => {
      const td = document.createElement('td');
      td.textContent = entry.status[key] ? 'Paused + resumed' : 'Not exercised';
      tr.appendChild(td);
    });
    pauseBody.appendChild(tr);
  }
  pauseTable.appendChild(pauseBody);
  pauseSection.appendChild(pauseTable);
  container.appendChild(pauseSection);

  if (Array.isArray(ownerControl.commandChecklist) && ownerControl.commandChecklist.length) {
    const commandSection = document.createElement('div');
    commandSection.className = 'owner-control-section';
    const commandTitle = document.createElement('h3');
    commandTitle.textContent = 'Mission checklist';
    commandSection.appendChild(commandTitle);
    const commandList = document.createElement('ul');
    commandList.className = 'command-list command-list--palette';
    for (const item of ownerControl.commandChecklist) {
      appendCommandItem(commandList, item);
    }
    commandSection.appendChild(commandList);
    container.appendChild(commandSection);
  }

  if (Array.isArray(ownerControl.guardrails) && ownerControl.guardrails.length) {
    const guardrailSection = document.createElement('div');
    guardrailSection.className = 'owner-control-section';
    const guardrailTitle = document.createElement('h3');
    guardrailTitle.textContent = 'Operational guardrails';
    guardrailSection.appendChild(guardrailTitle);
    const list = document.createElement('ul');
    list.className = 'guardrail-list';
    for (const guardrail of ownerControl.guardrails) {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = guardrail.title;
      const detail = document.createElement('p');
      detail.textContent = guardrail.detail;
      li.appendChild(strong);
      li.appendChild(detail);
      list.appendChild(li);
    }
    guardrailSection.appendChild(list);
    container.appendChild(guardrailSection);
  }
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

  const automationCard = createCard(
    'Autonomous mission control',
    data.automation?.headline || 'Replay the grand demo to populate the mission control playbook.'
  );
  renderAutomation(automationCard, data.automation);
  app.appendChild(automationCard);

  const insightsCard = createCard(
    'Mission-critical insights',
    'Executive highlights condensing the entire sovereign control story into actionable takeaways.'
  );
  renderInsights(insightsCard, data.insights || []);
  app.appendChild(insightsCard);

  const actorsCard = createCard('Participants and wallets');
  renderActors(actorsCard, data.actors, data.market, data.ownerControl);
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
