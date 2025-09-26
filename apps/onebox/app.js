const STORAGE_KEY = 'agi-onebox-config-v1';
const DEFAULT_CONFIG = {
  orchestratorUrl: '',
  apiToken: '',
  statusInterval: 60,
};

const errorDictionary = new Map([
  ['InsufficientBalance', {
    headline: 'You do not have enough AGIALPHA to fund this job.',
    hint: 'Lower the reward or top up your balance; I can guide you through funding.',
  }],
  ['deadline', {
    headline: 'The requested deadline is invalid.',
    hint: 'Choose a date at least a few hours in the future.',
  }],
  ['allowance', {
    headline: 'Token approvals are missing.',
    hint: 'In Expert mode I can prepare the approval transaction for you.',
  }],
  ['network', {
    headline: 'Unable to reach the orchestrator.',
    hint: 'Check the configured URL or switch back to Demo Mode.',
  }],
]);

const state = {
  expert: false,
  pendingIntent: null,
  lastSummary: null,
  config: loadConfig(),
  statusTimer: null,
};

const dom = {
  chat: document.getElementById('chat-log'),
  input: document.getElementById('onebox-input'),
  form: document.getElementById('composer'),
  modeLabel: document.getElementById('mode-label'),
  expertToggle: document.getElementById('expert-toggle'),
  pills: document.querySelectorAll('.pill'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsDialog: document.getElementById('settings-dialog'),
  settingsForm: document.getElementById('settings-form'),
  orchField: document.getElementById('orch-url'),
  tokenField: document.getElementById('api-token'),
  statusSelect: document.getElementById('status-interval'),
  statusCards: document.getElementById('status-cards'),
  statusEmpty: document.getElementById('status-empty'),
  refreshStatus: document.getElementById('refresh-status'),
};

dom.orchField.value = state.config.orchestratorUrl;
dom.tokenField.value = state.config.apiToken;
dom.statusSelect.value = String(state.config.statusInterval);
updateStatusTimer();

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    console.warn('Failed to load config', err);
    return { ...DEFAULT_CONFIG };
  }
}

function persistConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}

function scrollChatToBottom() {
  dom.chat.scrollTop = dom.chat.scrollHeight;
}

function renderMessage(role, content, options = {}) {
  const article = document.createElement('article');
  article.classList.add('msg', role);
  if (options.className) article.classList.add(options.className);
  if (typeof content === 'string') {
    article.innerHTML = `<p class="msg-body">${content}</p>`;
  } else {
    article.append(...content);
  }
  dom.chat.appendChild(article);
  scrollChatToBottom();
  return article;
}

function renderNote(text) {
  const note = document.createElement('p');
  note.className = 'msg-note';
  note.textContent = text;
  renderMessage('assistant', note);
}

function renderConfirm(summary, intent) {
  state.pendingIntent = intent;
  state.lastSummary = summary;
  const actions = document.createElement('div');
  actions.className = 'msg-actions';

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'btn primary';
  yes.textContent = 'Proceed';
  yes.addEventListener('click', () => executeIntent(intent));

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => {
    state.pendingIntent = null;
    renderMessage('assistant', 'Okay, cancelled. Let me know if you want to try again.');
  });

  actions.append(yes, cancel);

  const summaryPara = document.createElement('p');
  summaryPara.className = 'msg-body';
  summaryPara.textContent = summary;

  const fragment = document.createDocumentFragment();
  fragment.append(summaryPara, actions);

  renderMessage('assistant', fragment, { className: 'confirm' });
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const text = dom.input.value.trim();
  if (!text) return;

  renderMessage('user', escapeHtml(text));
  dom.input.value = '';
  await planIntent(text);
}

async function planIntent(text) {
  try {
    const { summary, intent, warnings } = await callPlanner(text);
    if (warnings && warnings.length) {
      warnings.forEach((warning) => renderNote(warning));
    }
    renderConfirm(summary, intent);
  } catch (err) {
    handleError(err);
  }
}

async function executeIntent(intent) {
  renderMessage('assistant', 'Working on it…');
  try {
    const response = await callExecutor(intent);
    const { ok, jobId, txHash, receiptUrl } = response;
    if (!ok) throw new Error(response.error || 'Execution failed');

    const lines = [];
    lines.push(`✅ Success. Job ID <strong>#${jobId}</strong>.`);
    if (receiptUrl) {
      lines.push(`<a href="${receiptUrl}" target="_blank" rel="noopener">View receipt</a>`);
    } else if (txHash) {
      lines.push(`<span class="msg-note">Tx hash: ${txHash}</span>`);
    }
    renderMessage('assistant', lines.join(' '));
    state.pendingIntent = null;
    refreshStatuses();
  } catch (err) {
    handleError(err);
  }
}

async function callPlanner(text) {
  if (!state.config.orchestratorUrl) {
    return demoPlanner(text);
  }

  const body = JSON.stringify({ text, expert: state.expert });
  const headers = { 'Content-Type': 'application/json' };
  if (state.config.apiToken) {
    headers['Authorization'] = `Bearer ${state.config.apiToken}`;
  }

  const res = await fetch(`${state.config.orchestratorUrl.replace(/\/$/, '')}/onebox/plan`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    throw await enrichError('Planner error', res);
  }
  return res.json();
}

async function callExecutor(intent) {
  if (!state.config.orchestratorUrl) {
    return demoExecutor(intent);
  }

  const body = JSON.stringify({ intent, mode: state.expert ? 'wallet' : 'relayer' });
  const headers = { 'Content-Type': 'application/json' };
  if (state.config.apiToken) {
    headers['Authorization'] = `Bearer ${state.config.apiToken}`;
  }

  const res = await fetch(`${state.config.orchestratorUrl.replace(/\/$/, '')}/onebox/execute`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    throw await enrichError('Execution error', res);
  }
  return res.json();
}

async function fetchStatuses() {
  if (!state.config.orchestratorUrl) {
    return demoStatuses();
  }
  const headers = {};
  if (state.config.apiToken) {
    headers['Authorization'] = `Bearer ${state.config.apiToken}`;
  }
  const res = await fetch(`${state.config.orchestratorUrl.replace(/\/$/, '')}/onebox/status`, { headers });
  if (!res.ok) {
    throw await enrichError('Status error', res);
  }
  return res.json();
}

async function refreshStatuses() {
  try {
    const data = await fetchStatuses();
    renderStatuses(Array.isArray(data?.jobs) ? data.jobs : []);
  } catch (err) {
    console.warn(err);
    renderNote('Could not refresh job status right now.');
  }
}

function renderStatuses(jobs) {
  dom.statusCards.innerHTML = '';
  if (!jobs.length) {
    dom.statusCards.appendChild(dom.statusEmpty);
    dom.statusEmpty.hidden = false;
    return;
  }
  dom.statusEmpty.hidden = true;

  for (const job of jobs) {
    const card = document.createElement('article');
    card.className = 'status-card';
    card.setAttribute('role', 'listitem');

    const title = document.createElement('div');
    title.className = 'status-title';
    title.textContent = job.title || `Job #${job.jobId}`;

    const statusLine = document.createElement('div');
    statusLine.className = 'status-line';
    const statusText = document.createElement('span');
    statusText.textContent = (job.statusLabel || job.status || 'unknown').toUpperCase();
    if ((job.status || '').toLowerCase() === 'finalized') {
      statusText.className = 'status-ok';
    }
    const reward = document.createElement('span');
    reward.textContent = job.reward ? `${job.reward} ${job.rewardToken || 'AGIALPHA'}` : '';
    statusLine.append(statusText, reward);

    const meta = document.createElement('div');
    meta.className = 'status-meta';
    const parts = [];
    if (job.deadline) parts.push(`Deadline: ${job.deadline}`);
    if (job.assignee) parts.push(`Assigned to ${job.assignee}`);
    meta.textContent = parts.join(' · ');

    card.append(title, statusLine, meta);
    dom.statusCards.appendChild(card);
  }
}

function toggleExpertMode() {
  state.expert = !state.expert;
  dom.expertToggle.setAttribute('aria-pressed', String(state.expert));
  dom.expertToggle.classList.toggle('active', state.expert);
  dom.modeLabel.textContent = `Mode: ${state.expert ? 'Expert' : 'Guest'}`;
  if (!state.expert) {
    renderNote('Back in guest mode. I will execute through the orchestrator relayer.');
  } else {
    renderNote('Expert mode on. I can hand you calldata for signing if required.');
  }
}

function openSettings() {
  dom.orchField.value = state.config.orchestratorUrl;
  dom.tokenField.value = state.config.apiToken;
  dom.statusSelect.value = String(state.config.statusInterval);
  dom.settingsDialog.showModal();
}

function applySettings(event) {
  event.preventDefault();
  if (dom.settingsDialog.returnValue === 'confirm') {
    state.config.orchestratorUrl = dom.orchField.value.trim();
    state.config.apiToken = dom.tokenField.value.trim();
    state.config.statusInterval = Number(dom.statusSelect.value);
    persistConfig();
    updateStatusTimer();
    renderNote(state.config.orchestratorUrl ? 'Connected to orchestrator.' : 'Demo Mode enabled. No network calls will be made.');
  }
}

function updateStatusTimer() {
  if (state.statusTimer) {
    clearInterval(state.statusTimer);
    state.statusTimer = null;
  }
  const interval = Number(state.config.statusInterval || 0);
  if (interval > 0) {
    state.statusTimer = setInterval(refreshStatuses, interval * 1000);
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

async function enrichError(prefix, response) {
  const text = await response.text();
  const error = new Error(`${prefix}: ${response.status}`);
  error.details = text;
  return error;
}

function handleError(err) {
  console.error(err);
  const { headline, hint } = matchError(err);
  const fragment = document.createDocumentFragment();
  const p = document.createElement('p');
  p.className = 'msg-body';
  p.innerHTML = `⚠️ ${headline}`;
  fragment.appendChild(p);
  if (hint) {
    const hintEl = document.createElement('p');
    hintEl.className = 'msg-note';
    hintEl.textContent = hint;
    fragment.appendChild(hintEl);
  }
  renderMessage('assistant', fragment);
}

function matchError(err) {
  if (err?.details) {
    for (const [key, copy] of errorDictionary.entries()) {
      if (err.details.includes(key)) return copy;
    }
    if (/429/.test(err.message)) {
      return {
        headline: 'You hit the rate limit.',
        hint: 'Wait a moment before trying again. The orchestrator protects against abuse.',
      };
    }
  }

  if (err?.message?.includes('Failed to fetch')) {
    return errorDictionary.get('network');
  }

  return {
    headline: err?.message || 'Something went wrong.',
    hint: 'Try rephrasing your request in one sentence. If the problem persists, check the orchestrator logs.',
  };
}

function demoPlanner(text) {
  const action = inferDemoAction(text);
  return {
    summary: `I understood: ${text}. Ready to ${actionLabel(action)}. Shall I proceed?`,
    intent: {
      action,
      payload: buildDemoPayload(text, action),
      constraints: { maxFee: 'auto' },
      userContext: {},
    },
    warnings: [],
  };
}

function actionLabel(action) {
  switch (action) {
    case 'finalize_job':
      return 'finalize the job';
    case 'check_status':
      return 'check on that job';
    default:
      return 'post the job';
  }
}

function inferDemoAction(text) {
  const lc = text.toLowerCase();
  if (lc.includes('final')) return 'finalize_job';
  if (lc.includes('status') || lc.includes('check')) return 'check_status';
  return 'post_job';
}

function buildDemoPayload(text, action) {
  if (action === 'finalize_job' || action === 'check_status') {
    const match = text.match(/(job\s*#?)(\d+)/i);
    return { jobId: match ? Number(match[2]) : 123 };
  }
  return {
    title: text,
    description: text,
    reward: '5.0',
    rewardToken: 'AGIALPHA',
    deadlineDays: 7,
  };
}

function demoExecutor(intent) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ok: true, jobId: Math.floor(Math.random() * 500) + 100, txHash: null, receiptUrl: null });
    }, 800);
  });
}

function demoStatuses() {
  return {
    jobs: state.pendingIntent ? [
      {
        jobId: 123,
        title: state.lastSummary || 'Demo job',
        status: 'open',
        reward: '5.0',
        rewardToken: 'AGIALPHA',
        deadline: 'in 7 days',
      },
    ] : [],
  };
}

function registerListeners() {
  dom.form.addEventListener('submit', handleFormSubmit);
  dom.expertToggle.addEventListener('click', toggleExpertMode);
  dom.pills.forEach((pill) => pill.addEventListener('click', () => {
    dom.input.value = pill.dataset.fill;
    dom.input.focus();
  }));
  dom.settingsBtn.addEventListener('click', openSettings);
  dom.settingsForm.addEventListener('close', applySettings);
  dom.refreshStatus.addEventListener('click', refreshStatuses);

  dom.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    dom.settingsDialog.close('confirm');
  });
  dom.settingsDialog.addEventListener('cancel', () => dom.settingsDialog.close('cancel'));
}

registerListeners();
refreshStatuses();

dom.input.focus();
