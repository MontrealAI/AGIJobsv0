// apps/onebox/app.js
import errorsCatalog from '../../storage/errors/onebox.json' assert { type: 'json' };
const $ = (selector) => document.querySelector(selector);
const chat = $('#chat');
const box = $('#onebox-input');
const form = $('#onebox-form');
const sendBtn = $('#send');
const expertBtn = $('#expert');
const orchInput = $('#orch');
const tokenInput = $('#tok');
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

const COPY = {
  planning: 'Planning your workflow…',
  planPreview: (summary) =>
    `${summary}<div class="pill-row pill-row-confirm"><button class="primary-btn" id="plan-approve" type="button">Looks good</button><button class="ghost-btn" id="plan-cancel" type="button">Cancel</button></div>`,
  missing: (fields) =>
    `I still need a few details before we can simulate: <strong>${fields.join(', ')}</strong>.`,
  simulating: 'Running safety checks and estimating budget…',
  simulationPreview: (sim) => {
    const risks = sim.risks && sim.risks.length ? `<br><strong>Risks:</strong> ${sim.risks.join(', ')}` : '';
    const budget = sim.estimatedBudget ? `${sim.estimatedBudget} AGIALPHA` : '—';
    const feeSegments = [];
    if (sim.feeAmount) {
      feeSegments.push(
        `protocol fee ${sim.feeAmount} AGIALPHA${
          sim.feePct !== undefined && sim.feePct !== null ? ` (${sim.feePct}%)` : ''
        }`
      );
    } else if (sim.feePct !== undefined && sim.feePct !== null) {
      feeSegments.push(`protocol fee ${sim.feePct}%`);
    }
    if (sim.burnAmount) {
      feeSegments.push(
        `burn ${sim.burnAmount} AGIALPHA${
          sim.burnPct !== undefined && sim.burnPct !== null ? ` (${sim.burnPct}%)` : ''
        }`
      );
    } else if (sim.burnPct !== undefined && sim.burnPct !== null) {
      feeSegments.push(`burn ${sim.burnPct}%`);
    }
    const feeSummary = feeSegments.length ? ` Fee projections: ${feeSegments.join('; ')}.` : '';
    return `Est. budget <strong>${budget}</strong>.${feeSummary ? feeSummary : ''}${
      risks
    }<div class="pill-row pill-row-confirm"><button class="primary-btn" id="sim-approve" type="button">Proceed to execute</button><button class="ghost-btn" id="sim-cancel" type="button">Cancel</button></div>`;
  },
  executing: 'Executing the plan…',
  cancelled: 'Okay, cancelled. Adjust the details and try again.',
  receipt: (receipt) =>
    `🧾 <strong>Receipt ready.</strong><br>Plan: <code>${receipt.planHash ?? receipt.planId ?? '—'}</code>${
      receipt.jobId ? `<br>Job: #${receipt.jobId}` : ''
    }${receipt.cid ? `<br>CID: <code>${receipt.cid}</code>` : ''}${
      receipt.url
        ? `<br><a href="${receipt.url}" target="_blank" rel="noopener">Verify on chain</a>`
        : receipt.tx
        ? `<br>Tx: ${receipt.tx}`
        : ''
    }`,
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

const STORAGE_KEYS = {
  orch: 'ONEBOX_ORCH_URL',
  token: 'ONEBOX_ORCH_TOKEN',
  receipts: 'ONEBOX_RECEIPTS_V1',
};

let expertMode = false;
let ethereum = null;
let orchestrator = localStorage.getItem(STORAGE_KEYS.orch) || '';
let apiToken = localStorage.getItem(STORAGE_KEYS.token) || '';
let receipts = loadReceipts();
let isSubmitting = false;
let lastPlanResponse = null;
let lastExecuteRequest = null;
let lastExecuteResponse = null;
let lastSimulationResponse = null;
let lastRunStatus = null;

orchInput.value = orchestrator;
tokenInput.value = apiToken;
renderReceipts();
setModeLabel();
renderExpertDetails();

function addMessage(role, html) {
  const node = document.createElement('div');
  node.className = `msg ${role === 'user' ? 'm-user' : 'm-assist'}`;
  node.innerHTML = html;
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

function startProgress() {
  const node = document.createElement('div');
  node.className = 'msg m-assist';
  node.innerHTML = `<ul class="progress">${COPY.progressSteps
    .map((step) => `<li>${step}</li>`)
    .join('')}</ul>`;
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
  receiptList.innerHTML = '';
  if (!receipts.length) {
    receiptsEmpty.style.display = 'block';
    return;
  }
  receiptsEmpty.style.display = 'none';
  receipts.forEach((receipt) => {
    const item = document.createElement('li');
    item.className = 'receipt-card';
    const ts = new Date(receipt.timestamp).toLocaleString();
    const txLabel = receipt.url
      ? `<a href="${receipt.url}" target="_blank" rel="noopener">${truncate(receipt.tx || 'View')}</a>`
      : receipt.tx
      ? truncate(receipt.tx)
      : '—';
    item.innerHTML = `
      <strong>Job #${receipt.jobId ?? '?'} · ${receipt.status ?? 'posted'}</strong>
      <div class="receipt-meta">
        <span>${ts}</span>
        <span>Reward: ${receipt.reward ?? '—'} ${receipt.token ?? 'AGIALPHA'}</span>
      </div>
      <div>Tx: ${txLabel}</div>
      ${receipt.cid ? `<div>CID: <code>${receipt.cid}</code></div>` : ''}
    `;
    receiptList.appendChild(item);
  });
}

function truncate(value) {
  if (!value) return '';
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
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
  const base = orchestrator.trim();
  if (!base) {
    throw new Error('ORCH_NOT_SET');
  }
  const url = `${base ? base.replace(/\/$/, '') : ''}${path}`;
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
  const response = await api('/onebox/plan', { input_text: text });
  lastPlanResponse = response ?? null;
  renderExpertDetails();
  return response;
}

async function simulatePlanRequest(plan) {
  const response = await api('/onebox/simulate', { plan });
  lastSimulationResponse = response ?? null;
  renderExpertDetails();
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
    if (typeof onUpdate === 'function') {
      onUpdate(status);
    }
    renderExpertDetails();
    if (!status || status.run.state === 'succeeded' || status.run.state === 'failed') {
      break;
    }
    await sleep(1000);
  }
  return status;
}

function renderRunSteps(status) {
  if (!status || !Array.isArray(status.steps)) {
    return '';
  }
  return `<ul class="step-status">${status.steps
    .map((step) => `<li class="state-${step.state}">[${step.kind}] ${step.name}</li>`)
    .join('')}</ul>`;
}

async function executePlanWithUi(plan, progress, statusNode) {
  try {
    statusNode.innerHTML = `${COPY.executing}`;
    const response = await executePlanRequest(plan);
    const runStatus = await pollRunStatus(response.run_id, (status) => {
      statusNode.innerHTML = `${COPY.executing}<br>${renderRunSteps(status)}`;
    });
    if (runStatus && runStatus.run && runStatus.run.state === 'succeeded') {
      progress.complete();
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
    statusNode.innerHTML = `<span class="error-text">⚠️ ${error?.message || 'Execution failed.'}</span>`;
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
  addMessage('assist', `<span class="error-text">⚠️ ${ERRORS[key]}</span>`);
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

function resolveNetworkName(chainId) {
  if (typeof chainId !== 'number') return null;
  const names = {
    1: 'Ethereum Mainnet',
    5: 'Goerli Testnet',
    10: 'OP Mainnet',
    11155111: 'Sepolia Testnet',
    42161: 'Arbitrum One',
    8453: 'Base Mainnet',
    84532: 'Base Sepolia',
    137: 'Polygon PoS',
  };
  return names[chainId] || `Chain ${chainId}`;
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
      addMessage('assist', COPY.missing(plan.missing_fields));
      return;
    }
    const confirmation = addMessage('assist', COPY.planPreview(plan.preview_summary));
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
          simulationMsg.innerHTML = COPY.simulationPreview(simulation);
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
            addMessage('assist', COPY.cancelled);
          });
        } catch (error) {
          progress.fail();
          simulationMsg.innerHTML = `<span class="error-text">⚠️ Simulation failed.</span>`;
          disableForm(false);
          handleError(error);
        }
      })();
    });
    noBtn?.addEventListener('click', () => {
      yesBtn.disabled = true;
      noBtn.disabled = true;
      addMessage('assist', COPY.cancelled);
    });
  } catch (error) {
    disableForm(false);
    handleError(error);
  }
});

expertBtn.addEventListener('click', () => {
  expertMode = !expertMode;
  setModeLabel();
  if (expertMode) {
    renderExpertDetails();
  }
});

saveBtn.addEventListener('click', () => {
  orchestrator = orchInput.value.trim();
  apiToken = tokenInput.value.trim();
  localStorage.setItem(STORAGE_KEYS.orch, orchestrator);
  localStorage.setItem(STORAGE_KEYS.token, apiToken);
  addMessage('assist', '✅ Saved advanced settings.');
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

Array.from(document.querySelectorAll('.pill')).forEach((pill) => {
  pill.addEventListener('click', () => {
    const example = pill.dataset.example || '';
    box.value = example;
    box.focus();
  });
});

if (window.ethereum) {
  ethereum = window.ethereum;
}
