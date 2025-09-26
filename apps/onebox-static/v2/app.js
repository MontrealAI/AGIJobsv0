const ORCH_URL = window.localStorage.getItem('ORCH_URL') || '';
const API_TOKEN_KEY = 'ONEBOX_API_TOKEN';
const STATUS_INTERVAL_MS = 20_000;

let expertMode = false;
let statusTimer = null;

const chat = document.getElementById('chat');
const input = document.getElementById('box');
const composer = document.getElementById('composer');
const expertBtn = document.getElementById('expert');
const modeBadge = document.getElementById('mode');
const suggestionButtons = document.querySelectorAll('[data-fill]');
const statusList = document.getElementById('status-list');
const statusNote = document.getElementById('status-note');
const statusRefresh = document.getElementById('status-refresh');

const MESSAGE_ROLE = {
  USER: 'm-user',
  ASSISTANT: 'm-assistant',
};

const FRIENDLY_ERROR_RULES = [
  {
    test: /insufficient/i,
    message:
      'You do not have enough AGIALPHA to cover this request. Lower the reward or top up your balance and try again.',
  },
  {
    match: 'allowance',
    message:
      'We need to refresh the AGIALPHA allowance before proceeding. I can retry that automatically—please try again in a moment.',
  },
  {
    match: 'deadline',
    message: 'Deadlines must be at least 24 hours in the future. Try extending the timeline.',
  },
  {
    match: 'ens',
    message:
      'I could not confirm the required ENS identity. Make sure your agent subdomain is active before retrying.',
  },
  {
    match: 'unauthor',
    message:
      'This action needs an authorised orchestrator. Confirm you are using the official endpoint and try again.',
  },
  {
    match: 'planner',
    message: 'The planner is unavailable right now. Give me a moment and try again.',
  },
  {
    match: 'timeout',
    message: 'The orchestrator took too long to respond. Please retry shortly.',
  },
  {
    match: 'network',
    message: 'Network error. Check your connection or orchestrator URL and try again.',
  },
];

function withAuthHeaders(baseHeaders = {}) {
  try {
    const tokenRaw = window.localStorage.getItem(API_TOKEN_KEY);
    const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
    if (token) {
      return {
        ...baseHeaders,
        Authorization: `Bearer ${token}`,
      };
    }
  } catch (error) {
    // localStorage access can throw in private browsing contexts; fall back to base headers.
  }
  return baseHeaders;
}

window.oneboxSetOrchestrator = function setOrchestrator(url) {
  window.localStorage.setItem('ORCH_URL', url || '');
  window.location.reload();
};

function friendlyError(input) {
  if (!input) {
    return 'Something went wrong. Try again in a moment.';
  }
  const raw = typeof input === 'string' ? input : input.message || String(input);
  const normalised = raw.toLowerCase();
  for (const rule of FRIENDLY_ERROR_RULES) {
    if (rule.test && rule.test.test(raw)) {
      return rule.message;
    }
    if (rule.match && normalised.includes(rule.match)) {
      return rule.message;
    }
  }
  return raw;
}

function appendMessage(role, content) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;
  if (typeof content === 'string') {
    wrapper.textContent = content;
  } else if (content instanceof Node) {
    wrapper.appendChild(content);
  } else if (content !== undefined && content !== null) {
    wrapper.textContent = String(content);
  }
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
  return wrapper;
}

function appendNote(content) {
  const note = document.createElement('p');
  note.className = 'm-note';
  if (typeof content === 'string') {
    note.textContent = content;
  } else if (content instanceof Node) {
    note.appendChild(content);
  } else if (content !== undefined && content !== null) {
    note.textContent = String(content);
  }
  appendMessage(MESSAGE_ROLE.ASSISTANT, note);
}

function appendConfirmation(plan) {
  const container = document.createElement('div');
  const summary = document.createElement('p');
  summary.textContent = plan.summary || 'Ready to proceed. Shall I continue?';
  const row = document.createElement('div');
  row.className = 'row';

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.textContent = 'Yes';
  yes.className = 'pill ok';

  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = 'Cancel';
  no.className = 'pill';

  yes.addEventListener('click', () => {
    yes.disabled = true;
    no.disabled = true;
    appendNote('Okay, executing now…');
    executeIntent(plan.intent);
  });

  no.addEventListener('click', () => {
    yes.disabled = true;
    no.disabled = true;
    appendMessage(MESSAGE_ROLE.ASSISTANT, 'Okay, cancelled.');
  });

  row.append(yes, no);
  container.append(summary, row);
  appendMessage(MESSAGE_ROLE.ASSISTANT, container);
}

function normalizePlannerResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Planner returned an invalid response.');
  }
  const container = payload.intent && typeof payload.intent === 'object' ? payload : payload.data || payload;
  const intent = container.intent;
  if (!intent || typeof intent !== 'object') {
    throw new Error('Planner did not return a job intent.');
  }
  const summary =
    typeof container.summary === 'string' && container.summary.trim()
      ? container.summary.trim()
      : typeof payload.summary === 'string'
      ? payload.summary.trim()
      : '';
  const warnings = Array.isArray(container.warnings)
    ? container.warnings
    : Array.isArray(payload.warnings)
    ? payload.warnings
    : [];
  const requiresConfirmation =
    typeof container.requiresConfirmation === 'boolean'
      ? container.requiresConfirmation
      : typeof payload.requiresConfirmation === 'boolean'
      ? payload.requiresConfirmation
      : true;

  return { summary, intent, warnings, requiresConfirmation };
}

async function plan(text) {
  if (!ORCH_URL) {
    return {
      summary: `I will ${text.replace(/^i\s*/i, '')}. Proceed?`,
      intent: mockIntent(text),
      warnings: [],
      requiresConfirmation: true,
    };
  }

  const response = await fetch(`${ORCH_URL}/onebox/plan`, {
    method: 'POST',
    headers: withAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ text, expert: expertMode }),
  });

  if (!response.ok) {
    const errBody = await safeJson(response);
    throw new Error(errBody?.error || `Planner error (${response.status})`);
  }

  const payload = await response.json();
  return normalizePlannerResponse(payload);
}

async function executeIntent(intent) {
  appendMessage(MESSAGE_ROLE.ASSISTANT, 'Working on it…');

  if (!ORCH_URL) {
    window.setTimeout(() => {
      const fragment = document.createDocumentFragment();
      fragment.append('✅ Done. Job ID is ');
      const strong = document.createElement('strong');
      strong.textContent = '#123';
      fragment.appendChild(strong);
      fragment.append('.');
      appendMessage(MESSAGE_ROLE.ASSISTANT, fragment);
    }, 900);
    return;
  }

  const response = await fetch(`${ORCH_URL}/onebox/execute`, {
    method: 'POST',
    headers: withAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({ intent, mode: expertMode ? 'wallet' : 'relayer' }),
  });

  const payload = await safeJson(response);

  if (!response.ok || !payload?.ok) {
    const message = friendlyError(payload?.error || `Execution failed (${response.status})`);
    appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${message}`);
    appendNote('You can adjust the request and try again, or toggle Expert Mode to review wallet signing details.');
    return;
  }

  const fragment = document.createDocumentFragment();
  fragment.append('✅ Success. Job ID ');
  const strong = document.createElement('strong');
  strong.textContent = `#${payload.jobId}`;
  fragment.appendChild(strong);
  fragment.append('.');
  if (payload.receiptUrl) {
    fragment.append(' ');
    const link = document.createElement('a');
    link.href = payload.receiptUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Receipt';
    fragment.appendChild(link);
  }
  appendMessage(MESSAGE_ROLE.ASSISTANT, fragment);

  if (ORCH_URL) {
    loadStatus(true).catch(() => {
      /* ignore status refresh errors after success */
    });
  }
}

function mockIntent(text) {
  const lower = text.toLowerCase();
  if (lower.includes('finalize')) {
    return { action: 'finalize_job', payload: { jobId: 123 } };
  }
  if (lower.includes('status')) {
    return { action: 'check_status', payload: { jobId: 123 } };
  }
  return {
    action: 'post_job',
    payload: {
      title: text,
      reward: '5.0',
      rewardToken: 'AGIALPHA',
      deadlineDays: 7,
    },
  };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (err) {
    return undefined;
  }
}

function handlePlanSubmit(event) {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }

  appendMessage(MESSAGE_ROLE.USER, text);
  input.value = '';

  plan(text)
    .then((planResult) => {
      const { warnings = [] } = planResult;
      if (Array.isArray(warnings) && warnings.length) {
        warnings
          .map((warning) => (typeof warning === 'string' ? warning : null))
          .filter(Boolean)
          .forEach((warning) => appendNote(`⚠️ ${warning}`));
      }

      if (planResult.requiresConfirmation === false) {
        const summary = planResult.summary || 'Executing now.';
        appendMessage(MESSAGE_ROLE.ASSISTANT, summary);
        executeIntent(planResult.intent);
        return;
      }

      appendConfirmation(planResult);
    })
    .catch((err) => {
      const message = friendlyError(err);
      appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${message}`);
      appendNote('The planner could not understand that request. Try one sentence with reward and duration.');
    });
}

function renderStatusPlaceholder(message) {
  if (!statusList) return;
  statusList.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'status-empty';
  empty.textContent = message;
  statusList.appendChild(empty);
}

function createStatusPill(label, variant) {
  const pill = document.createElement('span');
  pill.className = variant === 'ok' ? 'status-pill ok' : 'status-pill';
  pill.textContent = label;
  return pill;
}

function formatReward(value, token) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value} ${token || ''}`.trim();
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return `${numeric} ${token || ''}`.trim();
  }
  return `${value} ${token || ''}`.trim();
}

function formatDeadline(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) {
      return new Date(value).toLocaleString();
    }
    if (value > 1e9) {
      return new Date(value * 1000).toLocaleString();
    }
    if (value > 0) {
      const rounded = Math.round(value);
      return `${rounded} day${rounded === 1 ? '' : 's'}`;
    }
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toLocaleString();
  }
  return text;
}

function normalizeStatusEntries(payload) {
  if (!payload) return [];
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.jobs)
    ? payload.jobs
    : Array.isArray(payload.data)
    ? payload.data
    : payload.job
    ? [payload.job]
    : [];

  return entries
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const id = entry.id ?? entry.jobId ?? entry.jobID ?? index;
      const state = entry.state || entry.status || entry.phase || 'Pending';
      const reward = formatReward(entry.reward ?? entry.rewardAmount ?? entry.rewardAGIA, entry.rewardToken);
      const deadline = formatDeadline(entry.deadline ?? entry.deadlineAt ?? entry.deadlineDays ?? entry.expiresAt);
      const assignee = entry.assignee || entry.agent || entry.worker || entry.validator;
      const summary = entry.summary || entry.title || entry.description || '';
      const token = entry.rewardToken || entry.token || 'AGIALPHA';
      return { id, state, reward, deadline, assignee, summary, token };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function renderStatus(entries) {
  if (!statusList) return;
  statusList.innerHTML = '';
  if (!entries.length) {
    renderStatusPlaceholder('No recent jobs yet. Your next request will appear here.');
    return;
  }

  entries.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'status-card';

    const heading = document.createElement('h3');
    heading.textContent = entry.id !== undefined ? `Job #${entry.id}` : 'Job';
    card.appendChild(heading);

    const meta = document.createElement('div');
    meta.className = 'status-meta';

    const state = String(entry.state || '').toLowerCase();
    const statePill = createStatusPill(entry.state || 'Pending',
      state.includes('open') || state.includes('active') || state.includes('complete') ? 'ok' : undefined);
    meta.appendChild(statePill);

    if (entry.reward) {
      meta.appendChild(createStatusPill(`${entry.reward}`));
    }

    if (entry.deadline) {
      meta.appendChild(createStatusPill(`Deadline: ${entry.deadline}`));
    }

    if (entry.assignee) {
      meta.appendChild(createStatusPill(`Agent: ${entry.assignee}`));
    }

    card.appendChild(meta);

    if (entry.summary) {
      const summary = document.createElement('p');
      summary.className = 'small';
      summary.textContent = entry.summary;
      card.appendChild(summary);
    }

    statusList.appendChild(card);
  });
}

async function loadStatus(manual = false) {
  if (!statusList) return;
  if (!ORCH_URL) {
    renderStatusPlaceholder('Set localStorage.ORCH_URL to enable live status.');
    if (statusNote) {
      statusNote.textContent = 'Status feed inactive until an orchestrator URL is configured.';
    }
    return;
  }

  if (statusNote) {
    statusNote.textContent = manual ? 'Refreshing…' : 'Loading status…';
  }

  try {
    const response = await fetch(`${ORCH_URL}/onebox/status`, {
      headers: withAuthHeaders(),
    });
    if (!response.ok) {
      const body = await safeJson(response);
      throw new Error(body?.error || `Status error (${response.status})`);
    }
    const payload = await response.json();
    const entries = normalizeStatusEntries(payload);
    renderStatus(entries);
    if (statusNote) {
      const time = new Date().toLocaleTimeString();
      statusNote.textContent = entries.length
        ? `Last updated ${time}`
        : `No recent jobs yet — last checked ${time}`;
    }
  } catch (error) {
    renderStatusPlaceholder(friendlyError(error));
    if (statusNote) {
      statusNote.textContent = 'Unable to load status right now. Please try again later.';
    }
    throw error;
  }
}

function scheduleStatusUpdates() {
  if (!statusList) return;
  if (statusTimer) {
    window.clearInterval(statusTimer);
    statusTimer = null;
  }
  if (!ORCH_URL) {
    renderStatusPlaceholder('Set localStorage.ORCH_URL to enable live status.');
    return;
  }
  loadStatus().catch(() => {
    /* handled inside loadStatus */
  });
  statusTimer = window.setInterval(() => {
    loadStatus().catch(() => {
      /* handled */
    });
  }, STATUS_INTERVAL_MS);
}

composer.addEventListener('submit', handlePlanSubmit);

expertBtn.addEventListener('click', () => {
  expertMode = !expertMode;
  modeBadge.textContent = `Mode: ${expertMode ? 'Expert' : 'Guest'}`;
  if (expertMode) {
    appendNote('Expert Mode enabled. Connect your wallet in the orchestrator response when prompted.');
  }
});

suggestionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    input.value = btn.dataset.fill;
    input.focus();
  });
});

statusRefresh?.addEventListener('click', () => {
  loadStatus(true).catch(() => {
    /* already surfaced */
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (statusTimer) {
      window.clearInterval(statusTimer);
      statusTimer = null;
    }
  } else {
    scheduleStatusUpdates();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== input) {
    event.preventDefault();
    input.focus();
  }
});

scheduleStatusUpdates();
input.focus();
