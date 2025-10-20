const EXPORT_PATH = './export/latest.json';

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

async function loadPlaybook() {
  const response = await fetch(`${EXPORT_PATH}?t=${Date.now()}`);
  if (!response.ok) {
    throw new Error(`Unable to load playbook (${response.status})`);
  }
  return response.json();
}

function render(playbook) {
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
    const playbook = await loadPlaybook();
    render(playbook);
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
