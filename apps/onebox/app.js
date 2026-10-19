// apps/onebox/app.js
import errorsCatalog from '../../backend/errors/catalog.json' with { type: 'json' };
import { element, planPreview, missingFields, simulationPreview, receiptMessage, receiptCard, runSteps, errorMessage } from './dom-rendering.js';
import { buildOneboxUrl, normalisePrefix, parseOverrideParams } from './url-overrides.js';
const $ = (selector) => document.querySelector(selector);
const chat = $('#chat');
const box = $('#onebox-input');
const defaultPlaceholder = box ? box.getAttribute('placeholder') : '';
const form = $('#onebox-form');
const sendBtn = $('#send');
const expertBtn = $('#expert');
const orchInput = $('#orch');
const tokenInput = $('#tok');
const prefixInput = $('#orch-prefix');
const saveBtn = $('#save');
const connectBtn = $('#connect');
const modeBadge = $('#mode');
const receiptList = $('#receipts-list');
const receiptsEmpty = $('#receipts-empty');
const clearReceiptsBtn = $('#clear-receipts');
const expertPanel = $('#expert-panel');
const expertNetwork = $('#expert-network');
const expertContract = $('#expert-contract');
const expertPlanJson = $('#expert-plan-json');
const expertExecuteRequestJson = $('#expert-execute-request');
const expertExecuteResponseJson = $('#expert-execute-response');
const statPlanner = $('#stat-planner');
const statGuardrails = $('#stat-guardrails');
const statRelayer = $('#stat-relayer');
const shortcutsContainer = document.querySelector('.pill-row');

const formatLatency = (ms) => {
  if (typeof ms !== 'number' || Number.isNaN(ms) || !Number.isFinite(ms)) {
    return null;
  }
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const renderShortcutExamples = (examples) => {
  if (!shortcutsContainer) return;
  if (!Array.isArray(examples)) return;
  shortcutsContainer.replaceChildren();
  if (box) {
    box.setAttribute('placeholder', examples.length > 0 ? examples[0] : defaultPlaceholder || '');
  }
  if (examples.length === 0) {
    return;
  }
  const fragment = document.createDocumentFragment();
  examples.forEach((example) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pill';
    button.dataset.example = example;
    button.textContent = example;
    fragment.appendChild(button);
  });
  shortcutsContainer.appendChild(fragment);
};

const COPY = {
  planning: 'Planning your workflow…',
  planPreview: (summary, meta = {}) => planPreview(summary, formatLatency(meta.latencyMs)),
  missing: missingFields,
  simulating: 'Running safety checks and estimating budget…',
  simulationPreview: (sim, meta = {}) => simulationPreview(sim, formatLatency(meta.latencyMs)),
  executing: 'Executing the plan…',
  cancelled: 'Okay, cancelled. Adjust the details and try again.',
  receipt: receiptMessage,
  progressSteps: [
    'Planning orchestration…',
    'Simulating costs and guardrails…',
    'Executing orchestrated steps…',
    'Gathering receipts…',
  ],
};

const ERROR_PATTERNS = [
  {
    key: 'ORCHESTRATOR_NOT_CONFIGURED',
    needles: [
      'ORCHESTRATOR_NOT_CONFIGURED',
      'ORCH_NOT_SET',
      'ORCHESTRATOR REQUIRED',
      'NO ORCHESTRATOR',
      'MISSING ORCHESTRATOR',
      'SET YOUR ORCHESTRATOR',
    ],
  },
  {
    key: 'API_TOKEN_MISSING',
    needles: [
      'API_TOKEN_MISSING',
      'AUTH_MISSING',
      'TOKEN REQUIRED',
      'API TOKEN REQUIRED',
      'ADD YOUR API TOKEN',
      'MISSING API TOKEN',
    ],
  },
  {
    key: 'API_TOKEN_INVALID',
    needles: [
      'API_TOKEN_INVALID',
      'AUTH_INVALID',
      'TOKEN INVALID',
      'TOKEN REJECTED',
      'UNAUTHORIZED',
      'FORBIDDEN',
    ],
  },
  {
    key: 'IDENTITY_NOT_CONFIGURED',
    needles: [
      'IDENTITY_NOT_CONFIGURED',
      'IDENTITY REQUIRED',
      'IDENTITY NOT CONFIGURED',
      'ENS REQUIRED',
      'NO IDENTITY',
      'MISSING IDENTITY',
    ],
  },
  {
    key: 'STAKE_REQUIRED',
    needles: ['STAKE_REQUIRED', 'STAKE REQUIRED', 'MUST STAKE', 'NEED TO STAKE', 'STAKE BEFORE'],
  },
  {
    key: 'ESCROW_BALANCE_LOW',
    needles: [
      'ESCROW_BALANCE_LOW',
      'INSUFFICIENT BALANCE',
      'NOT ENOUGH AGIALPHA',
      'INSUFFICIENT FUNDS',
      'BALANCE TOO LOW',
    ],
  },
  {
    key: 'ESCROW_ALLOWANCE_REQUIRED',
    needles: [
      'ESCROW_ALLOWANCE_REQUIRED',
      'INSUFFICIENT ALLOWANCE',
      'NEED ALLOWANCE',
      'REQUIRE ALLOWANCE',
      'ALLOWANCE REQUIRED',
      'APPROVE SPENDING',
    ],
  },
  {
    key: 'PAYMASTER_REJECTED',
    needles: [
      'PAYMASTER_REJECTED',
      'PAYMASTER_REJECT',
      'PAYMASTER',
      'AA PAYMASTER',
      'AA SPONSOR',
      'PAYMASTER ERROR',
    ],
  },
  {
    key: 'CID_MISMATCH',
    needles: ['CID_MISMATCH', 'CID DOES NOT MATCH', 'CID MISMATCH'],
  },
  {
    key: 'DISPUTE_OPEN',
    needles: ['DISPUTE_OPEN', 'DISPUTE OPEN', 'DISPUTE OPENED', 'DISPUTE ACTIVE', 'ACTIVE DISPUTE'],
  },
  {
    key: 'RPC_TIMEOUT',
    needles: ['RPC_TIMEOUT', 'TIMEOUT', 'TIMED OUT', 'ETIMEDOUT', 'ABORTED'],
  },
  {
    key: 'UNKNOWN_REVERT',
    needles: ['UNKNOWN_REVERT', 'REVERT'],
  },
  {
    key: 'BLOCKED',
    needles: ['BLOCKED', 'BUDGET_REQUIRED'],
  },
  {
    key: 'OVER_BUDGET',
    needles: ['OVER_BUDGET'],
  },
  {
    key: 'RUN_NOT_FOUND',
    needles: ['RUN_NOT_FOUND'],
  },
  {
    key: 'RUN_FAILED',
    needles: ['RUN_FAILED'],
  },
];

const ERRORS = errorsCatalog;

const DEFAULT_PREFIX = '/onebox';

const STORAGE_KEYS = {
  orch: 'ONEBOX_ORCH_URL',
  prefix: 'ONEBOX_ORCH_PREFIX',
  receipts: 'ONEBOX_RECEIPTS_V1',
};

try {
  localStorage.removeItem('ONEBOX_ORCH_TOKEN');
} catch (error) {
  console.warn('Unable to clear legacy API token storage', error);
}

const runtimeConfig = typeof window !== 'undefined' ? window.__ONEBOX_CONFIG__ || {} : {};

let expertMode = false;
let ethereum = null;
let orchestrator = localStorage.getItem(STORAGE_KEYS.orch) || '';
let orchestratorPrefix = DEFAULT_PREFIX;
let apiToken = '';

try {
  const storedPrefix = localStorage.getItem(STORAGE_KEYS.prefix);
  if (storedPrefix !== null && storedPrefix !== undefined) {
    const normalised = normalisePrefix(storedPrefix);
    orchestratorPrefix = normalised || '';
  }
} catch (error) {
  console.warn('Unable to restore orchestrator prefix from storage', error);
}

if (typeof window !== 'undefined') {
  const overrides = parseOverrideParams(window.location.href);
  if (overrides.orchestrator !== undefined) {
    orchestrator = overrides.orchestrator || '';
    try {
      if (orchestrator) {
        localStorage.setItem(STORAGE_KEYS.orch, orchestrator);
      } else {
        localStorage.removeItem(STORAGE_KEYS.orch);
      }
    } catch (error) {
      console.warn('Unable to persist orchestrator override', error);
    }
  }
  if (overrides.prefix !== undefined) {
    orchestratorPrefix = overrides.prefix || '';
    try {
      localStorage.setItem(STORAGE_KEYS.prefix, orchestratorPrefix);
    } catch (error) {
      console.warn('Unable to persist prefix override', error);
    }
  }
  if (overrides.token !== undefined) {
    apiToken = overrides.token || '';
  }
  if (overrides.mode) {
    expertMode = overrides.mode === 'expert';
  }
  if (overrides.welcome !== undefined) {
    const intro = chat?.querySelector('.msg.m-assist');
    if (intro) {
      intro.textContent = overrides.welcome || 'Ask → Confirm → Done + Receipt.';
    }
  }
  if (Array.isArray(overrides.examples)) {
    renderShortcutExamples(overrides.examples);
  }
  if (overrides.appliedParams.length && window.history && typeof window.history.replaceState === 'function') {
    try {
      const url = new URL(window.location.href);
      for (const key of overrides.appliedParams) {
        url.searchParams.delete(key === 'oneboxPrefix' ? 'oneboxPrefix' : key);
      }
      const nextSearch = url.searchParams.toString();
      const nextUrl = nextSearch ? `${url.pathname}?${nextSearch}${url.hash}` : `${url.pathname}${url.hash}`;
      window.history.replaceState({}, document.title, nextUrl);
    } catch (error) {
      console.warn('Unable to clean URL overrides', error);
    }
  }
}

const plannerLatencySamples = [];

function updatePlannerStat(sample) {
  if (!statPlanner || typeof sample !== 'number' || Number.isNaN(sample)) return;
  plannerLatencySamples.push(sample);
  if (plannerLatencySamples.length > 8) {
    plannerLatencySamples.shift();
  }
  const average = plannerLatencySamples.reduce((sum, value) => sum + value, 0) / plannerLatencySamples.length;
  const formatted = formatLatency(average);
  statPlanner.textContent = formatted ?? '—';
}

function updateGuardrailStat(simulation, state = 'success', details = {}) {
  if (!statGuardrails) return;
  if (state === 'pending') {
    statGuardrails.textContent = 'Awaiting simulation';
    return;
  }
  if (state === 'executing') {
    statGuardrails.textContent = 'Executing orchestrated plan';
    return;
  }
  if (state === 'executed') {
    const jobId = details?.jobId;
    statGuardrails.textContent = jobId ? `Execution succeeded (job #${jobId})` : 'Execution succeeded';
    return;
  }
  if (state === 'error') {
    statGuardrails.textContent = 'Guardrail check failed';
    return;
  }
  if (!simulation) {
    statGuardrails.textContent = 'Awaiting simulation';
    return;
  }
  const segments = [];
  if (simulation.estimatedBudget) {
    const token = simulation.budgetToken || (lastPlanResponse?.plan?.budget?.token ?? 'AGIALPHA');
    segments.push(`Budget ${simulation.estimatedBudget} ${token}`);
  }
  if (simulation.feeAmount) {
    segments.push(
      `Fee ${simulation.feeAmount}${
        simulation.feePct !== undefined && simulation.feePct !== null ? ` (${simulation.feePct}%)` : ''
      }`,
    );
  } else if (simulation.feePct !== undefined && simulation.feePct !== null) {
    segments.push(`Fee ${simulation.feePct}%`);
  }
  if (simulation.burnAmount) {
    segments.push(
      `Burn ${simulation.burnAmount}${
        simulation.burnPct !== undefined && simulation.burnPct !== null ? ` (${simulation.burnPct}%)` : ''
      }`,
    );
  } else if (simulation.burnPct !== undefined && simulation.burnPct !== null) {
    segments.push(`Burn ${simulation.burnPct}%`);
  }
  const risks = Array.isArray(simulation.risks) && simulation.risks.length ? simulation.risks.join(', ') : 'None';
  segments.push(`Risks: ${risks}`);
  statGuardrails.textContent = segments.join(' · ');
}

function resolveOrchestratorDisplay() {
  const base = orchestrator ? orchestrator.trim() : '';
  if (!base) {
    return '';
  }
  const trimmedBase = base.replace(/\/+$/, '');
  const prefix = normalisePrefix(orchestratorPrefix);
  return prefix ? `${trimmedBase}${prefix}` : trimmedBase;
}

function renderRelayerStatus() {
  if (!statRelayer) return;
  if (expertMode) {
    statRelayer.textContent = 'Expert wallet signing';
    return;
  }
  if (!orchestrator) {
    statRelayer.textContent = 'Set orchestrator endpoint';
    return;
  }
  let host;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : undefined;
    const display = resolveOrchestratorDisplay();
    const parsed = base ? new URL(display || orchestrator, base) : new URL(display || orchestrator);
    host = parsed.host || parsed.href;
  } catch (_) {
    host = resolveOrchestratorDisplay() || orchestrator;
  }
  if (!apiToken) {
    statRelayer.textContent = `API token required (${host})`;
    return;
  }
  statRelayer.textContent = `Guest relayer online via ${host}`;
}

if (!orchestrator && runtimeConfig.orchestratorUrl) {
  orchestrator = runtimeConfig.orchestratorUrl;
  try {
    localStorage.setItem(STORAGE_KEYS.orch, orchestrator);
  } catch (error) {
    console.warn('Unable to persist orchestrator URL from runtime config', error);
  }
}

if (!apiToken && runtimeConfig.apiToken) {
  apiToken = runtimeConfig.apiToken;
}
let receipts = loadReceipts();
let isSubmitting = false;
let lastPlanResponse = null;
let lastExecuteRequest = null;
let lastExecuteResponse = null;
let lastSimulationResponse = null;
let lastRunStatus = null;

orchInput.value = orchestrator;
tokenInput.value = apiToken;
if (prefixInput) {
  prefixInput.value = orchestratorPrefix || '';
  if (!prefixInput.placeholder) {
    prefixInput.placeholder = DEFAULT_PREFIX;
  }
}
renderReceipts();
setModeLabel();
renderExpertDetails();
renderRelayerStatus();
updateGuardrailStat(null, 'pending');

function addMessage(role, content) {
  const node = document.createElement('div');
  node.className = `msg ${role === 'user' ? 'm-user' : 'm-assist'}`;
  node.append(content ?? '');
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

function startProgress() {
  const node = document.createElement('div');
  node.className = 'msg m-assist';
  const list = element('ul', '', 'progress');
  list.append(...COPY.progressSteps.map((step) => element('li', step)));
  node.append(list);
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  const items = Array.from(node.querySelectorAll('li'));
  let index = 0;
  const timer = setInterval(() => {
    if (index < items.length) {
      const current = items[index];
      current.classList.add('is-active');
      if (index > 0) {
        items[index - 1].classList.remove('is-active');
        items[index - 1].classList.add('is-done');
      }
      index += 1;
    } else {
      clearInterval(timer);
      items.forEach((li) => li.classList.add('is-done'));
    }
  }, 1100);
  return {
    complete() {
      clearInterval(timer);
      items.forEach((li) => li.classList.add('is-done'));
    },
    fail() {
      clearInterval(timer);
      items.forEach((li) => li.classList.remove('is-active'));
    },
  };
}

function loadReceipts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.receipts);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse receipts', error);
    return [];
  }
}

function saveReceipts() {
  localStorage.setItem(STORAGE_KEYS.receipts, JSON.stringify(receipts.slice(0, 10)));
}

function renderReceipts() {
  receiptList.replaceChildren();
  receiptsEmpty.style.display = receipts.length ? 'none' : 'block';
  receipts.forEach((receipt) => {
    if (receipt && typeof receipt === 'object') receiptList.append(receiptCard(receipt));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function storeReceipt(data) {
  receipts = [data, ...receipts].slice(0, 10);
  saveReceipts();
  renderReceipts();
}

async function api(path, body) {
  let url;
  try {
    url = buildOneboxUrl(orchestrator, orchestratorPrefix, path);
  } catch (error) {
    throw new Error('ORCH_NOT_SET');
  }
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
  }
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let code = 'UNKNOWN';
    try {
      const payload = await response.json();
      if (typeof payload === 'string') {
        code = payload;
      } else if (payload && typeof payload.detail === 'string') {
        code = payload.detail;
      } else if (payload?.detail?.code) {
        code = payload.detail.code;
      } else if (typeof payload?.error === 'string') {
        code = payload.error;
      } else if (payload?.error?.code) {
        code = payload.error.code;
      } else if (typeof payload?.message === 'string') {
        code = payload.message;
      }
    } catch (_) {
      try {
        code = (await response.text()) || 'UNKNOWN';
      } catch (__) {
        code = 'UNKNOWN';
      }
    }
    throw new Error((code || '').toUpperCase());
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return await response.json();
}

async function planRequest(text) {
  addMessage('assist', COPY.planning);
  lastSimulationResponse = null;
  lastExecuteRequest = null;
  lastExecuteResponse = null;
  lastRunStatus = null;
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const response = await api('/onebox/plan', { input_text: text });
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const latencyMs = Math.max(0, ended - started);
  updatePlannerStat(latencyMs);
  updateGuardrailStat(null, 'pending');
  if (response && typeof response === 'object') {
    response.__meta = { ...(response.__meta || {}), latencyMs };
  }
  lastPlanResponse = response ?? null;
  renderExpertDetails();
  return response;
}

async function simulatePlanRequest(plan) {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const response = await api('/onebox/simulate', { plan });
  const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const latencyMs = Math.max(0, ended - started);
  if (response && typeof response === 'object') {
    response.__meta = { ...(response.__meta || {}), latencyMs };
  }
  lastSimulationResponse = response ?? null;
  renderExpertDetails();
  updateGuardrailStat(response ?? null);
  return response;
}

async function executePlanRequest(plan, approvals = []) {
  lastExecuteRequest = { plan, approvals };
  const response = await api('/onebox/execute', lastExecuteRequest);
  lastExecuteResponse = response ?? null;
  renderExpertDetails();
  return response;
}

async function pollRunStatus(runId, onUpdate) {
  let status = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    status = await api(`/onebox/status?run_id=${encodeURIComponent(runId)}`);
    lastRunStatus = status ?? null;
    onUpdate(status);
    renderExpertDetails();
    if (!status || status.run.state === 'succeeded' || status.run.state === 'failed') {
      break;
    }
    await sleep(1000);
  }
  return status;
}

async function executePlanWithUi(plan, progress, statusNode) {
  try {
    statusNode.textContent = COPY.executing;
    updateGuardrailStat(null, 'executing');
    const response = await executePlanRequest(plan);
    const runStatus = await pollRunStatus(response.run_id, (status) => {
      statusNode.replaceChildren(COPY.executing, element('br'), runSteps(status));
    });
    if (runStatus && runStatus.run && runStatus.run.state === 'succeeded') {
      progress.complete();
      updateGuardrailStat(null, 'executed', { jobId: runStatus.receipts?.job_id ?? null });
      const receipt = buildReceipt({
        jobId: runStatus.receipts?.job_id ?? null,
        planHash: runStatus.run.plan_id,
        planId: runStatus.run.plan_id,
        txHash: runStatus.receipts?.txes?.[0] ?? null,
        txHashes: runStatus.receipts?.txes ?? null,
        specCid: runStatus.receipts?.cids?.[0] ?? null,
        reward: lastPlanResponse?.plan?.budget?.max ?? null,
        token: lastPlanResponse?.plan?.budget?.token ?? 'AGIALPHA',
        status: 'succeeded',
        timestamp: Date.now(),
      });
      storeReceipt(receipt);
      addMessage('assist', COPY.receipt(receipt));
    } else {
      progress.fail();
      throw new Error(runStatus?.run?.state || 'RUN_FAILED');
    }
  } catch (error) {
    progress.fail();
    updateGuardrailStat(null, 'error');
    statusNode.replaceChildren(errorMessage(error?.message || 'Execution failed.'));
    handleError(error);
  }
}

function buildReceipt(data) {
  return {
    jobId: data.jobId ?? null,
    planHash: data.planHash ?? null,
    planId: data.planId ?? null,
    tx: data.txHash ?? null,
    txs: Array.isArray(data.txHashes) && data.txHashes.length ? data.txHashes : null,
    url: data.url ?? null,
    cid: data.specCid ?? null,
    specUrl: data.specGatewayUrl ?? null,
    deliverableCid: data.deliverableCid ?? null,
    deliverableUrl: data.deliverableGatewayUrl ?? null,
    reward: data.reward ?? null,
    token: data.token ?? null,
    status: data.status ?? 'submitted',
    timestamp:
      typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
        ? data.timestamp
        : Date.now(),
    receiptCid: data.receiptCid ?? null,
    receiptUri: data.receiptUri ?? null,
  };
}

function resolveErrorKey(message) {
  if (!message) {
    return 'UNKNOWN';
  }
  const upper = message.toUpperCase();
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.needles.some((needle) => upper.includes(needle))) {
      return pattern.key;
    }
  }
  return 'UNKNOWN';
}

function handleError(error) {
  const message = (error && error.message ? error.message : 'UNKNOWN').toUpperCase();
  const key = resolveErrorKey(message);
  console.error('One-box error', error);
  const entry = ERRORS[key];
  const friendly = entry && entry.message ? entry.message : key;
  const hint = entry && entry.hint ? ` ${entry.hint}` : '';
  addMessage('assist', errorMessage(`${friendly}${hint}`));
}

function setModeLabel() {
  modeBadge.textContent = `Mode: ${expertMode ? 'Expert (wallet)' : 'Guest (walletless)'}`;
  expertBtn.textContent = expertMode ? 'Switch to Guest' : 'Expert Mode';
  updateExpertPanelVisibility();
}

function updateExpertPanelVisibility() {
  if (!expertPanel) return;
  if (expertMode) {
    expertPanel.hidden = false;
  } else {
    expertPanel.open = false;
    expertPanel.hidden = true;
  }
}

function formatJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error('Failed to stringify expert payload', error);
    return fallback;
  }
}

function renderExpertDetails() {
  if (!expertPanel) return;
  if (expertNetwork) {
    expertNetwork.textContent = '—';
  }
  if (expertContract) {
    expertContract.textContent = '—';
  }
  if (expertPlanJson) {
    expertPlanJson.textContent = formatJson(lastPlanResponse, 'No plan response yet.');
  }
  if (expertExecuteRequestJson) {
    expertExecuteRequestJson.textContent = formatJson(lastExecuteRequest, 'No execute request yet.');
  }
  if (expertExecuteResponseJson) {
    expertExecuteResponseJson.textContent = formatJson(
      {
        simulation: lastSimulationResponse,
        execute: lastExecuteResponse,
        status: lastRunStatus,
      },
      'No execution data yet.',
    );
  }
}

function disableForm(disabled) {
  isSubmitting = disabled;
  sendBtn.disabled = disabled;
  box.disabled = disabled;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting) return;
  const text = box.value.trim();
  if (!text) return;
  addMessage('user', text);
  box.value = '';
  disableForm(true);

  try {
    const plan = await planRequest(text);
    disableForm(false);
    if (!plan) {
      handleError(new Error('UNKNOWN'));
      return;
    }
    if (Array.isArray(plan.missing_fields) && plan.missing_fields.length) {
      updateGuardrailStat(null, 'pending');
      addMessage('assist', COPY.missing(plan.missing_fields));
      return;
    }
    const confirmation = addMessage(
      'assist',
      COPY.planPreview(plan.preview_summary, plan?.__meta || {}),
    );
    const yesBtn = confirmation.querySelector('#plan-approve');
    const noBtn = confirmation.querySelector('#plan-cancel');
    yesBtn?.addEventListener('click', () => {
      if (!yesBtn || yesBtn.disabled) return;
      yesBtn.disabled = true;
      if (noBtn) noBtn.disabled = true;
      disableForm(true);
      const progress = startProgress();
      const simulationMsg = addMessage('assist', COPY.simulating);
      (async () => {
        try {
          const simulation = await simulatePlanRequest(plan.plan);
          if (!simulation) {
            throw new Error('BLOCKED');
          }
          simulationMsg.replaceChildren(COPY.simulationPreview(simulation, simulation.__meta || {}));
          const simApprove = simulationMsg.querySelector('#sim-approve');
          const simCancel = simulationMsg.querySelector('#sim-cancel');
          simApprove?.addEventListener('click', () => {
            if (!simApprove || simApprove.disabled) return;
            simApprove.disabled = true;
            if (simCancel) simCancel.disabled = true;
            const execMsg = addMessage('assist', COPY.executing);
            void executePlanWithUi(plan.plan, progress, execMsg).finally(() => {
              disableForm(false);
            });
          });
          simCancel?.addEventListener('click', () => {
            if (simApprove) simApprove.disabled = true;
            simCancel.disabled = true;
            progress.fail();
            disableForm(false);
            updateGuardrailStat(null, 'pending');
            addMessage('assist', COPY.cancelled);
          });
        } catch (error) {
          progress.fail();
          simulationMsg.replaceChildren(errorMessage('Simulation failed.'));
          updateGuardrailStat(null, 'error');
          disableForm(false);
          handleError(error);
        }
      })();
  });
  noBtn?.addEventListener('click', () => {
    yesBtn.disabled = true;
    noBtn.disabled = true;
    updateGuardrailStat(null, 'pending');
    addMessage('assist', COPY.cancelled);
  });
  } catch (error) {
    disableForm(false);
    updateGuardrailStat(null, 'error');
    handleError(error);
  }
});

expertBtn.addEventListener('click', () => {
  expertMode = !expertMode;
  setModeLabel();
  if (expertMode) {
    renderExpertDetails();
  }
  renderRelayerStatus();
});

saveBtn.addEventListener('click', () => {
  orchestrator = orchInput.value.trim();
  apiToken = tokenInput.value.trim();
  orchestratorPrefix = prefixInput ? normalisePrefix(prefixInput.value) : orchestratorPrefix;
  try {
    if (orchestrator) {
      localStorage.setItem(STORAGE_KEYS.orch, orchestrator);
    } else {
      localStorage.removeItem(STORAGE_KEYS.orch);
    }
    localStorage.setItem(STORAGE_KEYS.prefix, orchestratorPrefix || '');
  } catch (error) {
    console.warn('Unable to persist advanced settings', error);
  }
  addMessage('assist', '✅ Saved advanced settings. API token kept in memory until you close this tab.');
  renderRelayerStatus();
});

connectBtn.addEventListener('click', async () => {
  if (!window.ethereum) {
    addMessage('assist', '⚠️ No EIP‑1193 wallet detected.');
    return;
  }
  try {
    ethereum = window.ethereum;
    await ethereum.request({ method: 'eth_requestAccounts' });
    addMessage('assist', '✅ Wallet connected. Expert mode ready.');
  } catch (error) {
    handleError(error);
  }
});

clearReceiptsBtn.addEventListener('click', () => {
  receipts = [];
  saveReceipts();
  renderReceipts();
});

if (shortcutsContainer) {
  shortcutsContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    if (!target.classList.contains('pill')) {
      return;
    }
    const example = target.dataset.example || target.textContent || '';
    box.value = example;
    box.focus();
  });
}

if (window.ethereum) {
  ethereum = window.ethereum;
}
