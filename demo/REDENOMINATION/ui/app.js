const EXPORT_PATH = './export/latest.json';
const JOB_CONFIG_PATH = '../config/job-registry-redenominated.json';
const STAKE_CONFIG_PATH = '../config/stake-manager-redenominated.json';
const SCENARIO_PATH = '../scenario.json';

async function fetchJson(path, { optional = false } = {}) {
  const url = `${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (optional) {
      console.warn(`Optional resource unavailable: ${path}`, error);
      return null;
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

const appEl = document.getElementById('app');
const refreshButton = document.getElementById('refresh-button');
const governanceTemplate = document.getElementById('governance-template');
const timelineTemplate = document.getElementById('timeline-template');
const moduleTemplate = document.getElementById('module-template');

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }
  if (Math.abs(number) >= 1_000_000) {
    return `${number.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
  if (Math.abs(number) >= 1_000) {
    return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return number.toLocaleString(undefined, {
    maximumFractionDigits: number < 1 ? 6 : 2,
  });
}

function formatTokens(value) {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  const number = Number(value);
  if (Number.isFinite(number)) {
    const maximumFractionDigits = number < 1 ? 6 : 2;
    return `${number.toLocaleString(undefined, { maximumFractionDigits })} AGIΩ`;
  }
  return `${value} AGIΩ`;
}

function formatSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return String(value);
  }
  if (seconds >= 86400) {
    return `${seconds.toLocaleString()} s (${(seconds / 86400).toFixed(2)} days)`;
  }
  if (seconds >= 3600) {
    return `${seconds.toLocaleString()} s (${(seconds / 3600).toFixed(2)} hours)`;
  }
  return `${seconds.toLocaleString()} s`;
}

function formatPercent(value) {
  if (value === undefined || value === null || value === '') {
    return '—';
  }
  return `${value}%`;
}

function createCard(title, content) {
  const card = document.createElement('section');
  card.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = title;
  card.appendChild(heading);
  card.appendChild(content);
  return card;
}

function createList(items, className) {
  const ul = document.createElement('ul');
  ul.className = className;
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  }
  return ul;
}

function createDefinitionCard(title, entries) {
  const article = document.createElement('article');
  article.className = 'card owner-subcard';
  const heading = document.createElement('h3');
  heading.textContent = title;
  article.appendChild(heading);
  const dl = document.createElement('dl');
  dl.className = 'owner-definition-list';
  entries.forEach((entry) => {
    const dt = document.createElement('dt');
    dt.textContent = entry.label;
    const dd = document.createElement('dd');
    dd.textContent = entry.value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  article.appendChild(dl);
  return article;
}

function collectOwnerCommands(playbook = {}) {
  const commands = new Set();
  (playbook.timeline ?? []).forEach((step) => {
    if (!Array.isArray(step?.commands)) return;
    const highlighted = ['pause', 'resume', 'update-parameters', 'snapshot', 'migrate-ledgers'];
    if (highlighted.includes(step.id)) {
      step.commands.forEach((command) => commands.add(command));
    }
  });
  if (commands.size === 0) {
    commands.add('npm run demo:redenomination:owner-console');
  }
  return Array.from(commands);
}

function renderOwnerControls(playbook = {}, jobConfig = {}, stakeConfig = {}) {
  const container = document.createElement('section');
  container.className = 'card owner-controls';
  const heading = document.createElement('h2');
  heading.textContent = 'Owner guardrails';
  container.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'owner-grid';

  const stakeEntries = [
    { label: 'Global minimum stake', value: formatTokens(stakeConfig?.minStakeTokens) },
    { label: 'Agent role minimum', value: formatTokens(stakeConfig?.roleMinimums?.agentTokens) },
    { label: 'Validator role minimum', value: formatTokens(stakeConfig?.roleMinimums?.validatorTokens) },
    { label: 'Platform role minimum', value: formatTokens(stakeConfig?.roleMinimums?.platformTokens) },
    { label: 'Recommended minimum stake', value: formatTokens(stakeConfig?.stakeRecommendations?.minTokens) },
    { label: 'Unbonding period', value: formatSeconds(stakeConfig?.unbondingPeriodSeconds) },
    {
      label: 'Validator reward',
      value: formatPercent(stakeConfig?.validatorRewardPct),
    },
    {
      label: 'Slashing (employer / treasury)',
      value:
        stakeConfig?.employerSlashPct !== undefined && stakeConfig?.treasurySlashPct !== undefined
          ? `${stakeConfig.employerSlashPct}% / ${stakeConfig.treasurySlashPct}%`
          : '—',
    },
  ];

  const jobEntries = [
    { label: 'Job stake requirement', value: formatTokens(jobConfig?.jobStakeTokens) },
    { label: 'Minimum agent stake', value: formatTokens(jobConfig?.minAgentStakeTokens) },
    { label: 'Maximum job reward', value: formatTokens(jobConfig?.maxJobRewardTokens) },
    { label: 'Job duration limit', value: formatSeconds(jobConfig?.jobDurationLimitSeconds) },
    {
      label: 'Max active jobs per agent',
      value:
        jobConfig?.maxActiveJobsPerAgent !== undefined
          ? Number(jobConfig.maxActiveJobsPerAgent).toLocaleString()
          : '—',
    },
    { label: 'Protocol fee', value: formatPercent(jobConfig?.feePct) },
    { label: 'Validator reward', value: formatPercent(jobConfig?.validatorRewardPct) },
  ];

  grid.appendChild(createDefinitionCard('Stake guardrails', stakeEntries));
  grid.appendChild(createDefinitionCard('Job registry guardrails', jobEntries));
  container.appendChild(grid);

  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = 'Automation to apply updates, pause windows, and telemetry drills.';
  container.appendChild(hint);

  const commands = collectOwnerCommands(playbook);
  const primaryWrapper = document.createElement('div');
  primaryWrapper.className = 'owner-primary';
  const primaryCode = document.createElement('code');
  primaryCode.textContent = commands[0];
  primaryWrapper.appendChild(primaryCode);
  container.appendChild(primaryWrapper);

  if (commands.length > 1) {
    const list = document.createElement('ul');
    list.className = 'owner-command-list';
    commands.slice(1).forEach((command) => {
      const li = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = command;
      li.appendChild(code);
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  return container;
}

function renderGovernance(governance = []) {
  if (!governance.length) return null;
  const wrapper = document.createElement('section');
  wrapper.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = 'Governance surfaces';
  wrapper.appendChild(heading);
  const grid = document.createElement('div');
  grid.className = 'governance-grid';
  for (const surface of governance) {
    const element = governanceTemplate.content.cloneNode(true);
    element.querySelector('.card__title').textContent = surface.label;
    element.querySelector('.governance-card__role').textContent = surface.role;
    element.querySelector('.governance-card__address').textContent =
      surface.address ?? 'Not yet assigned';
    grid.appendChild(element);
  }
  wrapper.appendChild(grid);
  return wrapper;
}

function renderTokenCard(token) {
  const content = document.createElement('div');
  const description = document.createElement('p');
  description.innerHTML = `Redenominate <strong>${token.currentSymbol}</strong> into <strong>${token.targetSymbol}</strong> with a <strong>1:${token.redenominationFactor}</strong> conversion.`;
  content.appendChild(description);

  const stats = document.createElement('dl');
  stats.className = 'module-card__list';

  const addStat = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value ?? '—';
    stats.appendChild(dt);
    stats.appendChild(dd);
  };

  addStat('Current decimals', String(token.currentDecimals));
  addStat('Target decimals', String(token.targetDecimals));
  if (token.supplyBefore) {
    addStat('Supply before', token.supplyBefore.formatted);
  }
  if (token.supplyAfter) {
    addStat('Supply after', token.supplyAfter.formatted);
  }

  content.appendChild(stats);

  const rationaleTitle = document.createElement('h3');
  rationaleTitle.textContent = 'Strategic rationale';
  content.appendChild(rationaleTitle);
  content.appendChild(createList(token.rationale ?? [], 'invariant-list'));

  return createCard('Token economics', content);
}

function renderModule(title, summary, before, after) {
  const fragment = moduleTemplate.content.cloneNode(true);
  fragment.querySelector('.module-card__title').textContent = title;
  fragment.querySelector('.module-card__summary').textContent = summary;
  const beforeList = fragment.querySelector('.module-card__list--before');
  const afterList = fragment.querySelector('.module-card__list--after');

  const renderSnapshot = (list, snapshot) => {
    for (const [key, value] of Object.entries(snapshot)) {
      const dt = document.createElement('dt');
      dt.textContent = key.replace(/([a-z])([A-Z])/g, '$1 $2');
      const dd = document.createElement('dd');
      if (typeof value === 'object' && value && 'formatted' in value) {
        dd.textContent = value.formatted;
      } else {
        dd.textContent = typeof value === 'number' ? formatNumber(value) : String(value);
      }
      list.appendChild(dt);
      list.appendChild(dd);
    }
  };

  renderSnapshot(beforeList, before);
  renderSnapshot(afterList, after);
  return fragment;
}

function renderTimeline(timeline = []) {
  if (!timeline.length) return null;
  const container = document.createElement('section');
  container.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = 'Timeline & commands';
  container.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'timeline-list';

  timeline.forEach((step, index) => {
    const element = timelineTemplate.content.cloneNode(true);
    element.querySelector('.timeline-card__id').textContent = `${index + 1}`;
    element.querySelector('.timeline-card__title').textContent = step.title;
    element.querySelector('.timeline-card__description').textContent = step.description;

    const checkpoints = element.querySelector('.timeline-card__checkpoints');
    checkpoints.innerHTML = '';
    if (Array.isArray(step.checkpoints)) {
      step.checkpoints.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        checkpoints.appendChild(li);
      });
    }

    const commands = element.querySelector('.timeline-card__commands');
    commands.innerHTML = '';
    if (Array.isArray(step.commands)) {
      step.commands.forEach((command) => {
        const code = document.createElement('code');
        code.textContent = command;
        commands.appendChild(code);
      });
    }

    list.appendChild(element);
  });

  container.appendChild(list);
  return container;
}

function renderListCard(title, items, className) {
  if (!items?.length) return null;
  const content = createList(items, className);
  return createCard(title, content);
}

function renderModules(modules = {}) {
  const moduleContainer = document.createElement('section');
  moduleContainer.className = 'card';
  const heading = document.createElement('h2');
  heading.textContent = 'Module deltas';
  moduleContainer.appendChild(heading);

  const stack = document.createElement('div');
  stack.className = 'module-stack';

  for (const [name, details] of Object.entries(modules)) {
    const moduleFragment = renderModule(
      name,
      details.summary,
      details.before,
      details.after,
    );
    stack.appendChild(moduleFragment);
  }

  moduleContainer.appendChild(stack);
  return moduleContainer;
}

function renderPillars(container, pillars = []) {
  if (!container) return;
  if (!Array.isArray(pillars) || pillars.length === 0) {
    container.innerHTML = '<p class="muted">Scenario pillar catalogue unavailable.</p>';
    return;
  }

  const renderColumn = (title, items = []) => {
    if (!Array.isArray(items) || items.length === 0) return '';
    const list = items
      .map((item) => `<li><code>${item}</code></li>`)
      .join('');
    return `
      <div class="pillar-card__column">
        <h4>${title}</h4>
        <ul>${list}</ul>
      </div>
    `;
  };

  container.innerHTML = pillars
    .map((pillar, index) => {
      const evidence = pillar.evidence ?? {};
      const columns = [
        renderColumn('Documentation', evidence.docs),
        renderColumn('Automation scripts', evidence.scripts),
        renderColumn('Configuration baselines', evidence.configs),
        renderColumn('Dashboards & telemetry', evidence.dashboards)
      ]
        .filter(Boolean)
        .join('');
      return `
        <article class="pillar-card">
          <header class="pillar-card__header">
            <span class="pillar-card__index">${String(index + 1).padStart(2, '0')}</span>
            <h3>${pillar.title}</h3>
          </header>
          <p class="pillar-card__outcome"><strong>Outcome</strong> ${pillar.outcome}</p>
          <div class="pillar-card__columns">${columns}</div>
        </article>
      `;
    })
    .join('');
}

async function loadPlaybook() {
  const [playbook, jobConfig, stakeConfig, scenario] = await Promise.all([
    fetchJson(EXPORT_PATH),
    fetchJson(JOB_CONFIG_PATH, { optional: true }),
    fetchJson(STAKE_CONFIG_PATH, { optional: true }),
    fetchJson(SCENARIO_PATH, { optional: true }),
  ]);
  return { playbook, jobConfig, stakeConfig, scenario };
}

function render({ playbook, jobConfig, stakeConfig, scenario }) {
  appEl.innerHTML = '';

  const banner = document.createElement('section');
  banner.className = 'card';
  const metaTitle = document.createElement('h2');
  metaTitle.textContent = playbook.meta?.scenario ?? 'Redenomination plan';
  banner.appendChild(metaTitle);

  const metaList = document.createElement('dl');
  metaList.className = 'module-card__list';

  const addMeta = (label, value) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    metaList.appendChild(dt);
    metaList.appendChild(dd);
  };

  addMeta('Generated at', new Date(playbook.meta?.generatedAt ?? Date.now()).toLocaleString());
  addMeta('Generator', playbook.meta?.generator ?? 'unknown');
  addMeta('Version', playbook.meta?.version ?? '1.0.0');

  banner.appendChild(metaList);
  appEl.appendChild(banner);

  const tokenCard = renderTokenCard(playbook.token ?? {});
  if (tokenCard) appEl.appendChild(tokenCard);

  const governanceCard = renderGovernance(playbook.governance);
  if (governanceCard) appEl.appendChild(governanceCard);

  const modulesCard = renderModules(playbook.modules ?? {});
  if (modulesCard) appEl.appendChild(modulesCard);

  const ownerCard = renderOwnerControls(playbook, jobConfig ?? {}, stakeConfig ?? {});
  if (ownerCard) appEl.appendChild(ownerCard);

  const pillarsCard = document.createElement('section');
  pillarsCard.className = 'card pillars-card';
  const pillarsHeading = document.createElement('h2');
  pillarsHeading.textContent = 'Superintelligence pillars';
  pillarsCard.appendChild(pillarsHeading);
  const pillarsDescription = document.createElement('p');
  pillarsDescription.className = 'muted';
  pillarsDescription.textContent =
    'Cross-verify governed autonomy, verifiable compute, observability, and operational empowerment artefacts.';
  pillarsCard.appendChild(pillarsDescription);
  const pillarsContainer = document.createElement('div');
  pillarsContainer.className = 'pillars-grid';
  pillarsCard.appendChild(pillarsContainer);
  appEl.appendChild(pillarsCard);

  renderPillars(pillarsContainer, scenario?.pillars ?? []);

  const timelineCard = renderTimeline(playbook.timeline);
  if (timelineCard) appEl.appendChild(timelineCard);

  const invariantsCard = renderListCard('Critical invariants', playbook.invariants, 'invariant-list');
  if (invariantsCard) appEl.appendChild(invariantsCard);

  const verificationCard = renderListCard(
    'Verification commands',
    playbook.verification,
    'verification-list',
  );
  if (verificationCard) appEl.appendChild(verificationCard);

  const referencesCard = renderListCard('Reference material', playbook.references, 'verification-list');
  if (referencesCard) appEl.appendChild(referencesCard);
}

async function refreshPlaybook() {
  appEl.innerHTML = '';
  const loading = document.createElement('section');
  loading.className = 'card';
  loading.innerHTML = '<h2>Refreshing playbook…</h2><p>Please wait.</p>';
  appEl.appendChild(loading);
  try {
    const data = await loadPlaybook();
    render(data);
  } catch (error) {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `<h2>Unable to load playbook</h2><p>${
      error instanceof Error ? error.message : 'Unknown error'
    }</p>`;
    appEl.appendChild(card);
  }
}

refreshButton?.addEventListener('click', () => {
  refreshPlaybook();
});

document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    refreshPlaybook();
  }
});

refreshPlaybook();
