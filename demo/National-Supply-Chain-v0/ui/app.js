const TRANSCRIPT_PATHS = ['export/latest.json', '../export/latest.json'];
const FALLBACK_URL = 'sample.json';

const state = {
  filter: 'all',
  data: null,
};

const FEEDBACK_RESET_DELAY = 2000;

const resetClipboardFeedback = (button, timer) => {
  if (timer.current) {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
  button.textContent = button.dataset.originalLabel || 'Copy';
  button.classList.remove('is-success', 'is-error');
};

const fallbackCopyText = (text) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (error) {
    console.warn('Fallback clipboard copy failed:', error);
    copied = false;
  }
  document.body.removeChild(textarea);
  return copied;
};

const copyTextToClipboard = async (text) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.warn('Clipboard API copy failed, falling back to execCommand:', error);
    }
  }
  return fallbackCopyText(text);
};

function createCopyButton(text, label) {
  const command = `${text}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-button';
  button.dataset.originalLabel = 'Copy';
  button.textContent = button.dataset.originalLabel;
  button.setAttribute('aria-label', label ? `Copy ${label}` : 'Copy command to clipboard');

  const timer = { current: undefined };

  button.addEventListener('click', async () => {
    resetClipboardFeedback(button, timer);
    button.disabled = true;

    const success = await copyTextToClipboard(command);

    button.classList.remove('is-success', 'is-error');
    if (success) {
      button.textContent = 'Copied!';
      button.classList.add('is-success');
    } else {
      button.textContent = 'Copy failed';
      button.classList.add('is-error');
    }

    button.disabled = false;

    timer.current = window.setTimeout(() => {
      resetClipboardFeedback(button, timer);
    }, FEEDBACK_RESET_DELAY);
  });

  return button;
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
      const actionWrapper = document.createElement('div');
      actionWrapper.className = 'copyable copyable--inline';
      const action = document.createElement('code');
      action.className = 'directive-action';
      action.textContent = directive.recommendedAction;
      actionWrapper.appendChild(action);
      actionWrapper.appendChild(
        createCopyButton(
          directive.recommendedAction,
          `${directive.title} recommended command`
        )
      );
      card.appendChild(actionWrapper);
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
  renderScoreCard(scoreboard, 'Unstoppable index', automation.unstoppableScore, 100, 'Confidence that the national supply chain network can be steered instantly.');
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
  list.className = 'command-list';
  const commandEntries = [
    { label: 'Replay sovereign demo', value: automation.commands.replayDemo },
    { label: 'Export transcript', value: automation.commands.exportTranscript },
    { label: 'Launch control room', value: automation.commands.launchControlRoom },
    { label: 'Owner dashboard', value: automation.commands.ownerDashboard },
  ];
  for (const entry of commandEntries) {
    const li = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = entry.label;
    li.appendChild(strong);
    const wrapper = document.createElement('div');
    wrapper.className = 'copyable copyable--block';
    const code = document.createElement('code');
    code.textContent = entry.value;
    wrapper.appendChild(code);
    wrapper.appendChild(createCopyButton(entry.value, `${entry.label} command`));
    li.appendChild(wrapper);
    list.appendChild(li);
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
    const wrapper = document.createElement('div');
    wrapper.className = 'copyable copyable--block';
    const code = document.createElement('code');
    code.textContent = cmd;
    wrapper.appendChild(code);
    wrapper.appendChild(createCopyButton(cmd, 'verification command'));
    li.appendChild(wrapper);
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
      label: 'Minimum stake',
      render: (state) => state.minStake,
    },
    {
      label: 'Max stake per address',
      render: (state) => state.maxStakePerAddress,
    },
    {
      label: 'Unbonding period',
      render: (state) => state.unbondingPeriodFormatted,
    },
    {
      label: 'Stake treasury',
      render: (state) => state.stakeTreasury,
      className: 'parameters',
    },
    {
      label: 'Stake treasury allowlist',
      render: (state) => (state.stakeTreasuryAllowed ? 'Allowlisted' : 'Revoked'),
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
    {
      label: 'Stake pauser manager',
      render: (state) => state.stakePauserManager,
      className: 'parameters',
    },
    {
      label: 'Fee pool treasury',
      render: (state) => state.feePoolTreasury,
      className: 'parameters',
    },
    {
      label: 'Fee pool treasury allowlist',
      render: (state) => (state.feePoolTreasuryAllowed ? 'Allowlisted' : 'Revoked'),
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

  if (Array.isArray(ownerControl.controlMatrix) && ownerControl.controlMatrix.length > 0) {
    const matrixSection = document.createElement('div');
    matrixSection.className = 'owner-control-section';
    const matrixTitle = document.createElement('h3');
    matrixTitle.textContent = 'Sovereign control matrix';
    matrixSection.appendChild(matrixTitle);

    const matrixGrid = document.createElement('div');
    matrixGrid.className = 'control-matrix';

    for (const entry of ownerControl.controlMatrix) {
      const card = document.createElement('article');
      card.className = 'control-card';

      const heading = document.createElement('h4');
      heading.textContent = entry.module;
      card.appendChild(heading);

      const address = document.createElement('div');
      address.className = 'control-card__address';
      address.textContent = entry.address;
      card.appendChild(address);

      const delegated = document.createElement('div');
      delegated.className = 'control-card__delegated';
      delegated.textContent = `Delegated to: ${entry.delegatedTo}`;
      card.appendChild(delegated);

      if (Array.isArray(entry.capabilities) && entry.capabilities.length > 0) {
        const list = document.createElement('ul');
        list.className = 'control-card__capabilities';
        for (const capability of entry.capabilities) {
          const item = document.createElement('li');
          item.textContent = capability;
          list.appendChild(item);
        }
        card.appendChild(list);
      }

      const status = document.createElement('p');
      status.className = 'control-card__status';
      status.textContent = entry.status;
      card.appendChild(status);

      matrixGrid.appendChild(card);
    }

    matrixSection.appendChild(matrixGrid);
    container.appendChild(matrixSection);
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
    'Live protocol economics exported from the national supply chain network simulator.'
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
