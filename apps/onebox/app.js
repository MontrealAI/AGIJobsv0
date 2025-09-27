// apps/onebox/app.js
const $ = (selector) => document.querySelector(selector);
const chat = $('#chat');
const box = $('#box');
const modeBadge = $('#mode');
const statusList = $('#status-list');
const statusEmpty = $('#status-empty');
const statusNote = $('#status-note');
const statusRefresh = $('#status-refresh');
const sendBtn = $('#send');
const expertBtn = $('#expert');
const saveBtn = $('#save');
const orchInput = $('#orch');
const tokInput = $('#tok');
const connectBtn = $('#connect');

const STORAGE_KEYS = {
  ORCH: 'ORCH_URL',
  TOKEN: 'ORCH_TOKEN',
  STATUS_INTERVAL: 'ONEBOX_STATUS_INTERVAL',
  EXPERT_MODE: 'ONEBOX_EXPERT_MODE',
};
const DEFAULT_STATUS_INTERVAL = 30000;

const COPY = {
  planning: 'Let me prepare this…',
  executing: 'Publishing to the network… this usually takes a few seconds.',
  posted: (id, url) =>
    `✅ Job <b>#${id ?? '?'}</b> is live. ${
      url
        ? `<a target="_blank" rel="noopener" href="${url}">Verify on chain</a>`
        : ''
    }`,
  finalized: (id, url) =>
    `✅ Job <b>#${id}</b> finalized. ${
      url ? `<a target="_blank" rel="noopener" href="${url}">Receipt</a>` : ''
    }`,
  cancelled: 'Okay, cancelled.',
  status: (s) => {
    const label = formatStateLabel(s.statusLabel || s.state || s.status);
    const token = s.token || s.rewardToken;
    const reward = s.reward
      ? `Reward ${s.reward}${token ? ` ${token}` : ''}`
      : '';
    const parts = [`Job <b>#${s.jobId}</b> is <b>${label || 'unknown'}</b>`];
    if (reward) {
      parts.push(reward);
    }
    return `${parts.join('. ')}.`;
  },
};

const ERRORS = {
  INSUFFICIENT_BALANCE:
    'You don’t have enough AGIALPHA to fund this job. Reduce the reward or top up.',
  INSUFFICIENT_ALLOWANCE:
    'Your wallet needs permission to use AGIALPHA. I can prepare an approval transaction.',
  IPFS_FAILED:
    'I couldn’t package your job details. Remove broken links and try again.',
  DEADLINE_INVALID:
    'That deadline is in the past. Pick at least 24 hours from now.',
  NETWORK_CONGESTED: 'The network is busy; I’ll keep retrying for a moment.',
  RELAYER_NOT_CONFIGURED:
    'The orchestrator isn’t configured to relay transactions yet. Ask the operator to set ONEBOX_RELAYER_PRIVATE_KEY.',
  JOB_ID_REQUIRED:
    'I need a job ID to continue. Include the job number in your request.',
  REQUEST_EMPTY: 'Please describe what you need before sending.',
  UNSUPPORTED_ACTION:
    'That action isn’t available yet. Try posting, checking status, or finalizing jobs.',
  NO_WALLET: 'Connect an EIP-1193 wallet before using Expert Mode.',
  NETWORK_FAILURE:
    'I couldn’t reach the orchestrator. Check the URL or try again in a moment.',
  UNKNOWN:
    'Something went wrong. Try rephrasing your request or adjust the reward/deadline.',
};

const DEMO_STATE = {
  nextJobId: 301,
  jobs: [],
};

const trackedJobs = new Map();

let expertMode = localStorage.getItem(STORAGE_KEYS.EXPERT_MODE) === '1';
let ethProvider = null;
let orchestratorUrl = (localStorage.getItem(STORAGE_KEYS.ORCH) || '').trim();
let bearerToken = (localStorage.getItem(STORAGE_KEYS.TOKEN) || '').trim();
let statusInterval = readStatusInterval();
let statusTimer = null;
let demoMode = false;

function formatStateLabel(value) {
  if (!value) {
    return 'Unknown';
  }
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normaliseStatusEntry(entry) {
  if (!entry || entry.jobId === undefined || entry.jobId === null) {
    return null;
  }

  const jobId = Number(entry.jobId);
  if (!Number.isFinite(jobId) || jobId <= 0) {
    return null;
  }

  const stateValue = entry.state || entry.status || undefined;
  const statusLabel =
    entry.statusLabel ||
    (stateValue ? formatStateLabel(stateValue) : undefined);
  const reward =
    entry.reward === undefined || entry.reward === null
      ? undefined
      : formatReward(entry.reward);
  const token = entry.token || entry.rewardToken || undefined;
  const deadline = entry.deadline !== undefined ? entry.deadline : undefined;
  const receiptUrl = entry.receiptUrl || entry.explorerUrl || undefined;

  return {
    jobId,
    state: stateValue,
    status: stateValue,
    statusLabel,
    reward,
    token,
    deadline,
    assignee: entry.assignee,
    receiptUrl,
    explorerUrl: entry.explorerUrl,
    updatedAt: entry.updatedAt ? Number(entry.updatedAt) : Date.now(),
  };
}

function firstJobCard(response) {
  if (!response) {
    return null;
  }
  const jobs = response.jobs;
  if (Array.isArray(jobs) && jobs.length > 0 && jobs[0]) {
    return jobs[0];
  }
  return null;
}

hydrateFromQueryParams();

orchInput.value = orchestratorUrl;
tokInput.value = bearerToken;

document.querySelectorAll('.pill').forEach((pill) => {
  pill.onclick = () => {
    box.value = pill.dataset.example;
    box.focus();
  };
});

const EXPERT_TOOLTIP = {
  true: 'Expert Mode enabled — transactions return calldata for signing.',
  false: 'Guest Mode — requests execute via the orchestrator relayer.',
};

updateModeBadge();

if (!orchestratorUrl) {
  demoMode = true;
  note('Demo mode active. Save an orchestrator URL in Advanced to go live.');
  renderStatuses(Array.from(trackedJobs.values()));
}

scheduleStatusPoll();

async function api(path, body) {
  if (!orchestratorUrl) {
    return demoApi(path, body);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const url = path.startsWith('http')
    ? path
    : `${orchestratorUrl.replace(/\/$/, '')}${path}`;

  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const code = await extractErrorCode(response);
      throw new Error(code.toUpperCase());
    }
    if (response.status === 204) {
      return null;
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message) {
      if (
        message.toLowerCase().includes('fetch') ||
        message.toLowerCase().includes('network')
      ) {
        throw new Error('NETWORK_FAILURE');
      }
      throw new Error(message);
    }
    throw new Error('NETWORK_FAILURE');
  }
}

async function extractErrorCode(response) {
  try {
    const raw = await response.text();
    if (!raw) {
      return 'UNKNOWN';
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') {
        return parsed || 'UNKNOWN';
      }
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.error === 'string') return parsed.error;
        if (typeof parsed.detail === 'string') return parsed.detail;
        if (
          parsed.detail &&
          typeof parsed.detail === 'object' &&
          typeof parsed.detail.error === 'string'
        ) {
          return parsed.detail.error;
        }
      }
    } catch (jsonErr) {
      if (jsonErr) {
        return raw.trim() || 'UNKNOWN';
      }
    }
    return raw.trim() || 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

function addMessage(role, html) {
  const div = document.createElement('div');
  div.className = `msg ${role === 'user' ? 'm-user' : 'm-assist'}`;
  if (typeof html === 'string') {
    div.innerHTML = html;
  } else if (html instanceof Node) {
    div.appendChild(html);
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function note(text) {
  addMessage('assist', `<div class="note">${text}</div>`);
}

function updateModeBadge() {
  if (modeBadge) {
    modeBadge.textContent = `Mode: ${
      expertMode ? 'Expert (wallet)' : 'Guest (walletless)'
    }`;
    modeBadge.title = EXPERT_TOOLTIP[expertMode ? 'true' : 'false'];
  }
}

function confirmUI(summary, intent) {
  const wrapper = document.createElement('div');
  wrapper.className = 'msg m-assist';
  wrapper.innerHTML = `${summary}<div class="row" style="margin-top:10px">
    <button class="pill ok" id="confirm-yes">Yes</button>
    <button class="pill" id="confirm-no">Cancel</button>
  </div>`;
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;

  setTimeout(() => {
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');
    if (yesBtn) {
      yesBtn.onclick = () => execute(intent);
    }
    if (noBtn) {
      noBtn.onclick = () => addMessage('assist', COPY.cancelled);
    }
  }, 0);
}

async function plan(text) {
  addMessage('assist', COPY.planning);
  return api('/onebox/plan', { text, expert: expertMode });
}

async function execute(intent) {
  addMessage('assist', COPY.executing);
  const mode = expertMode ? 'wallet' : 'relayer';
  const response = await api('/onebox/execute', { intent, mode });

  if (expertMode && response && response.to && response.data) {
    if (!ethProvider) {
      throw new Error('NO_WALLET');
    }
    const [from] = await ethProvider.request({ method: 'eth_requestAccounts' });
    const txHash = await ethProvider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from,
          to: response.to,
          data: response.data,
          value: response.value || '0x0',
        },
      ],
    });
    const receiptUrl = (response.receiptUrl || '').replace(
      /0x[0-9a-fA-F]{64}.?$/,
      txHash
    );
    if (intent.action === 'finalize_job') {
      addMessage(
        'assist',
        COPY.finalized(response.jobId || '?', receiptUrl || '')
      );
      rememberJob({ jobId: response.jobId, state: 'finalized', receiptUrl });
    } else {
      addMessage(
        'assist',
        COPY.posted(response.jobId || '?', receiptUrl || '')
      );
      rememberJob({ jobId: response.jobId, state: 'open', receiptUrl });
    }
    renderTrackedJobs();
    return;
  }

  const receiptUrl = response?.receiptUrl || '';
  if (intent.action === 'finalize_job') {
    addMessage('assist', COPY.finalized(response?.jobId ?? '?', receiptUrl));
    rememberJob({ jobId: response?.jobId, state: 'finalized', receiptUrl });
  } else {
    addMessage('assist', COPY.posted(response?.jobId ?? '?', receiptUrl));
    rememberJob({ jobId: response?.jobId, state: 'open', receiptUrl });
  }
  if (intent.action === 'post_job' && intent.payload) {
    rememberJob({
      jobId: response?.jobId,
      state: 'open',
      reward: formatReward(intent.payload.reward),
      token: intent.payload.rewardToken || 'AGIALPHA',
      deadline: intent.payload.deadlineDays
        ? humanDeadline(intent.payload.deadlineDays)
        : undefined,
    });
  }
  renderTrackedJobs();
  pollTrackedJobs();
}

async function go() {
  const text = box.value.trim();
  if (!text) {
    return;
  }
  addMessage('user', text);
  box.value = '';

  try {
    const { summary, intent } = await plan(text);

    if (intent.action === 'check_status') {
      const jobId = resolveJobId(text, intent.payload?.jobId);
      const response = await api(`/onebox/status?jobId=${jobId}`);
      const card = normaliseStatusEntry(firstJobCard(response));
      if (card) {
        addMessage('assist', COPY.status(card));
        rememberJob(card);
        renderTrackedJobs();
      } else {
        addMessage('assist', 'I couldn’t find updates for that job yet.');
      }
      return;
    }

    confirmUI(summary, intent);
  } catch (error) {
    handleError(error);
  }
}

function handleError(error) {
  const message = (error && error.message) || '';
  const upper = message.toUpperCase();
  const key =
    Object.keys(ERRORS).find((code) => upper.includes(code)) || 'UNKNOWN';
  addMessage('assist', `⚠️ ${ERRORS[key]}`);
}

function resolveJobId(text, fallback) {
  if (fallback) {
    return fallback;
  }
  const match = text.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }
  const keys = Array.from(trackedJobs.keys());
  if (keys.length > 0) {
    return keys[0];
  }
  return 0;
}

function rememberJob(entry) {
  const normalised = normaliseStatusEntry(entry);
  if (!normalised) {
    return;
  }
  const existing = trackedJobs.get(normalised.jobId) || {};
  const updatedAt = normalised.updatedAt ?? Date.now();
  const merged = { ...existing };
  Object.entries(normalised).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  });
  merged.updatedAt = updatedAt;
  trackedJobs.set(normalised.jobId, merged);
}

function renderTrackedJobs() {
  renderStatuses(
    Array.from(trackedJobs.values()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)
    )
  );
}

function renderStatuses(list) {
  if (!statusList || !statusEmpty) {
    return;
  }
  if (!list || list.length === 0) {
    statusEmpty.hidden = false;
    statusList.innerHTML = '';
    if (statusNote) {
      statusNote.hidden = true;
    }
    return;
  }
  statusEmpty.hidden = true;
  statusList.innerHTML = '';
  list.forEach((item) => {
    if (!item || !item.jobId) {
      return;
    }
    const li = document.createElement('li');
    li.className = 'status-item';
    const stateValue = item.state || item.status || 'unknown';
    const stateClass = String(stateValue).toLowerCase().replace(/\s+/g, '-');
    const rewardText = item.reward
      ? `${item.reward}${item.token ? ` ${item.token}` : ''}`
      : '—';
    const deadlineText = item.deadline ? describeDeadline(item.deadline) : '—';
    li.innerHTML = `
      <div class="status-top">
        <span class="status-id">#${item.jobId}</span>
        <span class="status-chip ${stateClass}">${
      item.statusLabel || formatStateLabel(stateValue)
    }</span>
      </div>
      <div class="status-meta">Reward ${rewardText} · Deadline ${deadlineText}</div>
    `;
    if (item.receiptUrl || item.explorerUrl) {
      const links = document.createElement('div');
      links.className = 'status-links';
      const href = item.receiptUrl || item.explorerUrl;
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.textContent = 'Verify on chain';
      links.appendChild(anchor);
      li.appendChild(links);
    }
    statusList.appendChild(li);
  });
  if (statusNote) {
    statusNote.hidden = true;
  }
}

function describeDeadline(deadline) {
  if (typeof deadline === 'number') {
    const now = Math.floor(Date.now() / 1000);
    const diff = deadline - now;
    if (diff <= 0) return 'elapsed';
    const days = Math.floor(diff / 86400);
    if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`;
    const hours = Math.floor(diff / 3600);
    if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} left`;
    const minutes = Math.floor(diff / 60);
    if (minutes > 0) return `${minutes} min left`;
    return `${diff} sec left`;
  }
  if (typeof deadline === 'string') {
    return deadline;
  }
  return '—';
}

function formatReward(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') {
    return value.toString();
  }
  return String(value);
}

function humanDeadline(days) {
  const dayCount = Number(days);
  if (!Number.isFinite(dayCount) || dayCount <= 0) {
    return undefined;
  }
  return `${dayCount} day${dayCount === 1 ? '' : 's'}`;
}

async function pollTrackedJobs() {
  if (!orchestratorUrl || trackedJobs.size === 0) {
    return;
  }
  const ids = Array.from(trackedJobs.keys());
  const requests = await Promise.allSettled(
    ids.map((id) => api(`/onebox/status?jobId=${id}`))
  );
  let changed = false;
  requests.forEach((result) => {
    if (result.status === 'fulfilled') {
      const card = normaliseStatusEntry(firstJobCard(result.value));
      if (card) {
        rememberJob(card);
        changed = true;
      }
    }
  });
  if (changed) {
    renderTrackedJobs();
  }
}

function scheduleStatusPoll() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  if (statusInterval <= 0) {
    return;
  }
  statusTimer = setInterval(() => {
    pollTrackedJobs().catch(() => {
      if (statusNote) {
        statusNote.hidden = false;
        statusNote.textContent =
          'Unable to refresh status right now. Retrying shortly…';
      }
    });
  }, statusInterval);
}

function readStatusInterval() {
  const raw = localStorage.getItem(STORAGE_KEYS.STATUS_INTERVAL);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_STATUS_INTERVAL;
  }
  return parsed;
}

function hydrateFromQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const urlOverride = (
    params.get('orchestrator') ||
    params.get('orch') ||
    ''
  ).trim();
  if (urlOverride) {
    orchestratorUrl = urlOverride;
    localStorage.setItem(STORAGE_KEYS.ORCH, orchestratorUrl);
  }
  const tokenOverride = (
    params.get('token') ||
    params.get('bearer') ||
    ''
  ).trim();
  if (tokenOverride) {
    bearerToken = tokenOverride;
    localStorage.setItem(STORAGE_KEYS.TOKEN, bearerToken);
  }
  const intervalOverride = params.get('statusInterval');
  if (intervalOverride) {
    const parsed = Number(intervalOverride);
    if (Number.isFinite(parsed) && parsed >= 0) {
      statusInterval = parsed;
      localStorage.setItem(STORAGE_KEYS.STATUS_INTERVAL, String(parsed));
    }
  }
}

async function demoApi(path, body) {
  if (path.startsWith('/onebox/plan')) {
    return demoPlan(body?.text || '');
  }
  if (path.startsWith('/onebox/execute')) {
    return demoExecute(body?.intent || {});
  }
  if (path.startsWith('/onebox/status')) {
    const url = new URL(path, window.location.origin);
    const jobIdParam = Number(url.searchParams.get('jobId') || '0');
    return demoStatus(jobIdParam);
  }
  throw new Error('UNSUPPORTED_ACTION');
}

function demoPlan(text) {
  const clean = text.trim();
  if (!clean) {
    throw new Error('REQUEST_EMPTY');
  }
  const lower = clean.toLowerCase();
  if (lower.includes('status')) {
    const jobId = extractJobId(clean) || (DEMO_STATE.jobs[0]?.jobId ?? 300);
    return {
      summary: `I’ll fetch the latest updates for job #${jobId}.`,
      intent: { action: 'check_status', payload: { jobId } },
      warnings: [],
    };
  }
  if (lower.includes('final')) {
    const jobId =
      extractJobId(clean) ||
      (DEMO_STATE.jobs[0]?.jobId ?? DEMO_STATE.nextJobId - 1);
    return {
      summary: `I’ll finalize job #${jobId}. Ready?`,
      intent: { action: 'finalize_job', payload: { jobId } },
      warnings: [],
    };
  }
  const reward = extractReward(clean);
  const deadlineDays = extractDeadline(clean);
  const title = clean.length > 64 ? `${clean.slice(0, 61)}…` : clean;
  return {
    summary: `I’ll post “${title}” with reward ${reward} AGIALPHA and deadline ${deadlineDays} day${
      deadlineDays === 1 ? '' : 's'
    }. Proceed?`,
    intent: {
      action: 'post_job',
      payload: {
        title,
        description: clean,
        reward,
        rewardToken: 'AGIALPHA',
        deadlineDays,
      },
    },
    warnings: [],
  };
}

function demoExecute(intent) {
  if (!intent || !intent.action) {
    throw new Error('UNSUPPORTED_ACTION');
  }
  if (intent.action === 'post_job') {
    const jobId = DEMO_STATE.nextJobId++;
    const reward = formatReward(intent.payload?.reward) || '5.0';
    const token = intent.payload?.rewardToken || 'AGIALPHA';
    const deadlineDays = intent.payload?.deadlineDays || 7;
    const explorerUrl = `https://demo.explorer/tx/${jobId
      .toString(16)
      .padStart(8, '0')}`;
    const job = {
      jobId,
      state: 'open',
      reward,
      token,
      deadline: humanDeadline(deadlineDays),
      explorerUrl,
      updatedAt: Date.now(),
    };
    DEMO_STATE.jobs.unshift(job);
    rememberJob(job);
    return { jobId, receiptUrl: explorerUrl };
  }
  if (intent.action === 'finalize_job') {
    const jobId =
      intent.payload?.jobId ||
      DEMO_STATE.jobs[0]?.jobId ||
      DEMO_STATE.nextJobId - 1;
    const job = DEMO_STATE.jobs.find((j) => j.jobId === jobId);
    if (job) {
      job.state = 'finalized';
      job.updatedAt = Date.now();
    } else {
      DEMO_STATE.jobs.unshift({
        jobId,
        state: 'finalized',
        reward: '5.0',
        token: 'AGIALPHA',
        deadline: '—',
        explorerUrl: '#',
        updatedAt: Date.now(),
      });
    }
    rememberJob({
      jobId,
      state: 'finalized',
      receiptUrl: '#',
      updatedAt: Date.now(),
    });
    return { jobId, receiptUrl: '#' };
  }
  if (intent.action === 'check_status') {
    const jobId =
      intent.payload?.jobId ||
      DEMO_STATE.jobs[0]?.jobId ||
      DEMO_STATE.nextJobId - 1;
    return demoStatus(jobId);
  }
  throw new Error('UNSUPPORTED_ACTION');
}

function demoStatus(jobId) {
  if (!jobId) {
    return { jobs: [] };
  }
  const job = DEMO_STATE.jobs.find((j) => j.jobId === jobId);
  const card = job
    ? {
        jobId: job.jobId,
        status: job.state || 'open',
        statusLabel: formatStateLabel(job.state || 'open'),
        reward: job.reward,
        rewardToken: job.token,
        deadline: job.deadline,
        explorerUrl: job.explorerUrl,
        updatedAt: job.updatedAt,
      }
    : {
        jobId,
        status: 'open',
        statusLabel: 'Open',
        reward: '5.0',
        rewardToken: 'AGIALPHA',
        deadline: '7 days',
        explorerUrl: '#',
        updatedAt: Date.now(),
      };
  rememberJob(card);
  renderTrackedJobs();
  return { jobs: [card] };
}

function extractJobId(text) {
  const match = text.match(/\b(\d{1,10})\b/);
  return match ? Number(match[1]) : null;
}

function extractReward(text) {
  const rewardMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:agialpha|agi|token)/i);
  if (rewardMatch) {
    return rewardMatch[1];
  }
  const genericMatch = text.match(/\b(\d+(?:\.\d+)?)\b/);
  return genericMatch ? genericMatch[1] : '5.0';
}

function extractDeadline(text) {
  const deadlineMatch = text.match(/(\d+)\s*(?:day|days|d)\b/i);
  if (deadlineMatch) {
    return Number(deadlineMatch[1]);
  }
  const weekMatch = text.match(/week/i);
  if (weekMatch) {
    return 7;
  }
  return 7;
}

sendBtn.onclick = go;
box.onkeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    go();
  }
};

expertBtn.onclick = () => {
  expertMode = !expertMode;
  localStorage.setItem(STORAGE_KEYS.EXPERT_MODE, expertMode ? '1' : '0');
  updateModeBadge();
  note(
    expertMode
      ? 'Expert Mode on. I’ll return calldata for signing.'
      : 'Guest Mode on. I’ll use the relayer when possible.'
  );
};

saveBtn.onclick = () => {
  orchestratorUrl = orchInput.value.trim();
  bearerToken = tokInput.value.trim();
  localStorage.setItem(STORAGE_KEYS.ORCH, orchestratorUrl);
  localStorage.setItem(STORAGE_KEYS.TOKEN, bearerToken);
  demoMode = !orchestratorUrl;
  note('Saved.');
  if (demoMode) {
    note(
      'Demo mode active. Requests will be simulated until an orchestrator URL is provided.'
    );
  }
  scheduleStatusPoll();
  if (!demoMode) {
    pollTrackedJobs();
  }
};

if (statusRefresh) {
  statusRefresh.onclick = () => {
    pollTrackedJobs()
      .then(() => {
        renderTrackedJobs();
      })
      .catch(() => {
        if (statusNote) {
          statusNote.hidden = false;
          statusNote.textContent =
            'Unable to refresh status right now. Retrying shortly…';
        }
      });
  };
}

if (connectBtn) {
  connectBtn.onclick = async () => {
    if (window.ethereum) {
      try {
        ethProvider = window.ethereum;
        await ethProvider.request({ method: 'eth_requestAccounts' });
        note('Wallet connected.');
      } catch (error) {
        handleError(error);
      }
    } else {
      note('No EIP-1193 provider found.');
    }
  };
}
