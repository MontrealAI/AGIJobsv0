// apps/onebox/app.js
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
  confirm: (summary) =>
    `${summary}<div class="pill-row pill-row-confirm"><button class="primary-btn" id="confirm-yes" type="button">Yes, do it</button><button class="ghost-btn" id="confirm-no" type="button">Cancel</button></div>`,
  cancelled: 'Okay, cancelled. Adjust the details and try again.',
  progressSteps: [
    'Creating job specification…',
    'Securing escrow and sponsorship…',
    'Posting spec to IPFS…',
    'Inviting validators and agents…',
  ],
  posted: (receipt) =>
    `✅ Posted. <strong>Job #${receipt.jobId ?? '?'}.</strong><br>Reward: ${receipt.reward ?? '—'} ${
      receipt.token ?? 'AGIALPHA'
    }${receipt.cid ? `<br>CID: <code>${receipt.cid}</code>` : ''}${
      receipt.url
        ? `<br><a href="${receipt.url}" target="_blank" rel="noopener">View on explorer</a>`
        : receipt.tx
        ? `<br>Tx: ${receipt.tx}`
        : ''
    }`,
  finalized: (receipt) =>
    `✅ Finalized. <strong>Job #${receipt.jobId ?? '?'}.</strong>${
      receipt.url
        ? `<br><a href="${receipt.url}" target="_blank" rel="noopener">Receipt</a>`
        : receipt.tx
        ? `<br>Tx: ${receipt.tx}`
        : ''
    }`,
  status: (status) => {
    const parts = [`Job <strong>#${status.jobId}</strong> is <strong>${status.state}</strong>.`];
    if (status.reward) {
      parts.push(`Reward ${status.reward} ${status.token ?? 'AGIALPHA'}`);
    }
    if (status.deadline) {
      parts.push(`Deadline ${new Date(status.deadline * 1000).toLocaleString()}`);
    }
    if (status.assignee) {
      parts.push(`Assignee ${status.assignee}`);
    }
    return parts.join('<br>');
  },
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
];

const ERRORS = {
  ORCHESTRATOR_NOT_CONFIGURED:
    'Connect an orchestrator under Advanced → Orchestrator URL, then run the job again.',
  API_TOKEN_MISSING:
    'Add your orchestrator API token under Advanced → API token and resend the request.',
  API_TOKEN_INVALID:
    'The API token was rejected. Mint a fresh token in the orchestrator console, update Advanced → API token, and retry.',
  IDENTITY_NOT_CONFIGURED:
    'This orchestrator is missing its identity pack. Sync the ENS roots/identity bundle and restart the orchestrator before retrying.',
  STAKE_REQUIRED:
    'Staking is required for this action. Stake the required AGIALPHA via Stake Manager and rerun the command.',
  ESCROW_BALANCE_LOW:
    'Escrow balance is too low. Top up the funding wallet or lower the reward, then try again.',
  ESCROW_ALLOWANCE_REQUIRED:
    'Escrow allowance is missing. Approve AGIALPHA spending (Expert mode or wallet) and rerun the request.',
  PAYMASTER_REJECTED:
    'The account-abstraction paymaster rejected the request. Top up the paymaster or switch to Expert mode to cover gas yourself.',
  CID_MISMATCH:
    'The attachment CID does not match the orchestrator record. Re-upload the artefact and confirm the CID before resubmitting.',
  DISPUTE_OPEN:
    'A dispute is already open for this job. Follow the dispute workflow to resolution before retrying.',
  RPC_TIMEOUT:
    'The blockchain RPC timed out. Retry shortly or point Advanced settings at a faster RPC endpoint.',
  UNKNOWN_REVERT:
    'The transaction reverted unexpectedly. Review orchestrator logs or rerun in Expert mode for detailed revert data.',
  UNKNOWN: 'Something went wrong. I logged the details so we can retry safely.',
};

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
  const response = await api('/onebox/plan', { text, expert: expertMode });
  lastPlanResponse = response ?? null;
  renderExpertDetails();
  return response;
}

async function executeIntent(intent) {
  const progress = startProgress();
  try {
    const mode = expertMode ? 'wallet' : 'relayer';
    const planHash =
      lastPlanResponse &&
      typeof lastPlanResponse.planHash === 'string' &&
      lastPlanResponse.planHash.trim().length > 0
        ? lastPlanResponse.planHash.trim()
        : null;
    if (!planHash) {
      throw new Error('PLAN_HASH_REQUIRED');
    }
    const requestCreatedAt = new Date().toISOString();
    lastExecuteRequest = { intent, mode, planHash, createdAt: requestCreatedAt };
    const result = await api('/onebox/execute', lastExecuteRequest);
    lastExecuteResponse = result ?? null;
    renderExpertDetails();

    if (intent.action === 'check_status') {
      progress.complete();
      addMessage('assist', COPY.status(result));
      return;
    }

    if (mode === 'wallet' && result && result.to && result.data) {
      if (!ethereum) {
        throw new Error('RELAY_UNAVAILABLE');
      }
      const [from] = await ethereum.request({ method: 'eth_requestAccounts' });
      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from,
            to: result.to,
            data: result.data,
            value: result.value || '0x0',
          },
        ],
      });
      progress.complete();
      const receipt = buildReceipt({
        jobId: intent.payload.jobId,
        planHash: result.planHash || planHash,
        txHash,
        txHashes: result.txHashes || (result.txHash ? [result.txHash] : undefined),
        reward: intent.payload.reward,
        token: intent.payload.rewardToken,
        specCid: result.specCid,
        specGatewayUrl: result.specGatewayUrl,
        deliverableCid: result.deliverableCid,
        deliverableGatewayUrl: result.deliverableGatewayUrl,
        receiptCid: result.receiptCid,
        receiptUri: result.receiptUri,
        status: intent.action === 'finalize_job' ? 'finalized' : 'submitted',
        timestamp: Date.parse(result.createdAt || requestCreatedAt) || Date.now(),
      });
      storeReceipt(receipt);
      const url = result.receiptUrl ? result.receiptUrl.replace(/0x[a-fA-F0-9]{64}/, txHash) : null;
      receipt.url = url;
      if (intent.action === 'finalize_job') {
        addMessage('assist', COPY.finalized(receipt));
      } else {
        addMessage('assist', COPY.posted(receipt));
      }
      return;
    }

    progress.complete();
    const receipt = buildReceipt({
      jobId: result.jobId,
      planHash: result.planHash || planHash,
      txHash: result.txHash,
      txHashes: result.txHashes,
      reward: result.reward || intent.payload.reward,
      token: result.token || intent.payload.rewardToken,
      specCid: result.specCid,
      specGatewayUrl: result.specGatewayUrl,
      deliverableCid: result.deliverableCid,
      deliverableGatewayUrl: result.deliverableGatewayUrl,
      receiptCid: result.receiptCid,
      receiptUri: result.receiptUri,
      url: result.receiptUrl,
      status: result.status || (intent.action === 'finalize_job' ? 'finalized' : 'submitted'),
      timestamp: Date.parse(result.createdAt || requestCreatedAt) || Date.now(),
    });
    storeReceipt(receipt);
    if (intent.action === 'finalize_job') {
      addMessage('assist', COPY.finalized(receipt));
    } else {
      addMessage('assist', COPY.posted(receipt));
    }
  } catch (error) {
    progress.fail();
    lastExecuteResponse = { error: error?.message || 'UNKNOWN_ERROR' };
    renderExpertDetails();
    handleError(error);
  }
}

function buildReceipt(data) {
  return {
    jobId: data.jobId ?? null,
    planHash: data.planHash ?? null,
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

async function fetchStatus(jobId) {
  try {
    const status = await api(`/onebox/status?jobId=${jobId}`);
    addMessage('assist', COPY.status(status));
  } catch (error) {
    handleError(error);
  }
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
  const chainId =
    (typeof lastExecuteResponse?.chainId === 'number' && lastExecuteResponse.chainId) ||
    (typeof lastPlanResponse?.intent?.payload?.chainId === 'number' &&
      lastPlanResponse.intent.payload.chainId) ||
    null;
  if (expertNetwork) {
    expertNetwork.textContent = chainId ? `${resolveNetworkName(chainId)} (${chainId})` : '—';
  }
  if (expertContract) {
    const contractAddress =
      lastExecuteResponse?.to ||
      lastExecuteRequest?.intent?.payload?.to ||
      lastPlanResponse?.intent?.payload?.contractAddress ||
      lastPlanResponse?.intent?.payload?.escrowAddress ||
      null;
    expertContract.textContent = contractAddress || '—';
  }
  if (expertPlanJson) {
    expertPlanJson.textContent = formatJson(lastPlanResponse, 'No plan response yet.');
  }
  if (expertExecuteRequestJson) {
    expertExecuteRequestJson.textContent = formatJson(
      lastExecuteRequest,
      'No execute request yet.',
    );
  }
  if (expertExecuteResponseJson) {
    expertExecuteResponseJson.textContent = formatJson(
      lastExecuteResponse,
      'No execute response yet.',
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
    const { summary, intent } = plan;
    if (intent.action === 'check_status' && intent.payload.jobId) {
      await fetchStatus(intent.payload.jobId);
      return;
    }
    const confirmation = addMessage('assist', COPY.confirm(summary));
    const yesBtn = confirmation.querySelector('#confirm-yes');
    const noBtn = confirmation.querySelector('#confirm-no');
    yesBtn?.addEventListener('click', () => {
      yesBtn.disabled = true;
      noBtn.disabled = true;
      void executeIntent(intent);
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
