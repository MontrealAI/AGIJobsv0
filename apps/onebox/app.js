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
    `${summary}<div class="pill-row" style="margin-top:12px"><button class="primary-btn" id="confirm-yes" type="button">Yes, do it</button><button class="ghost-btn" id="confirm-no" type="button">Cancel</button></div>`,
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

const ERRORS = {
  ORCH_NOT_SET: 'Set your orchestrator URL in Advanced before running jobs.',
  AUTH_MISSING: 'Add your API token in Advanced to continue.',
  AUTH_INVALID: 'The API token looks incorrect. Double-check and try again.',
  INSUFFICIENT_BALANCE: 'Not enough AGIALPHA. Lower the reward or top up and retry.',
  INSUFFICIENT_ALLOWANCE: 'We need allowance to use AGIALPHA. Enable approvals in Expert mode.',
  IPFS_FAILED: 'IPFS pinning failed. Remove broken attachments or retry in a moment.',
  DEADLINE_INVALID: 'Deadline must be at least 1 day and within protocol limits.',
  RELAY_UNAVAILABLE: 'Relayer unavailable. Retry in a moment or switch to Expert mode.',
  JOB_ID_REQUIRED: 'I need a job ID for that action. Try “Finalize job 123”.',
  UNSUPPORTED_ACTION: 'That action is not supported yet. Try posting, finalizing, or checking status.',
  IDENTITY_REQUIRED:
    'An ENS identity is required before continuing. Register the appropriate *.agent.agi.eth or *.club.agi.eth subdomain and try again.',
  STAKE_REQUIRED:
    'You need to stake before you can continue. Stake the required AGIALPHA amount and retry the action.',
  PAYMASTER_REJECT:
    'The sponsored transaction was rejected by the paymaster. Top up the paymaster balance or switch to Expert mode to supply gas yourself.',
  CID_MISMATCH:
    'The attachment CID does not match the orchestrator record. Re-upload the file and confirm the CID before retrying.',
  DISPUTE_OPENED:
    'A dispute is already open for this job. Review the dispute status and follow the evidence workflow before retrying.',
  RPC_TIMEOUT:
    'The blockchain RPC timed out while handling your request. Retry shortly or point Advanced settings to a faster RPC endpoint.',
  UNKNOWN_REVERT:
    'The transaction reverted for an unknown reason. Check orchestrator logs or rerun in Expert mode to inspect the revert details.',
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
    lastExecuteRequest = { intent, mode };
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
        txHash,
        reward: intent.payload.reward,
        token: intent.payload.rewardToken,
        specCid: result.specCid,
        specGatewayUrl: result.specGatewayUrl,
        deliverableCid: result.deliverableCid,
        deliverableGatewayUrl: result.deliverableGatewayUrl,
        status: intent.action === 'finalize_job' ? 'finalized' : 'submitted',
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
      txHash: result.txHash,
      reward: result.reward || intent.payload.reward,
      token: result.token || intent.payload.rewardToken,
      specCid: result.specCid,
      specGatewayUrl: result.specGatewayUrl,
      deliverableCid: result.deliverableCid,
      deliverableGatewayUrl: result.deliverableGatewayUrl,
      url: result.receiptUrl,
      status: result.status || (intent.action === 'finalize_job' ? 'finalized' : 'submitted'),
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
    tx: data.txHash ?? null,
    url: data.url ?? null,
    cid: data.specCid ?? null,
    specUrl: data.specGatewayUrl ?? null,
    deliverableCid: data.deliverableCid ?? null,
    deliverableUrl: data.deliverableGatewayUrl ?? null,
    reward: data.reward ?? null,
    token: data.token ?? null,
    status: data.status ?? 'submitted',
    timestamp: Date.now(),
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
  const directMatch = Object.keys(ERRORS).find((code) => upper.includes(code));
  if (directMatch) {
    return directMatch;
  }
  if (upper.includes('ENS') || upper.includes('IDENTITY')) {
    return 'IDENTITY_REQUIRED';
  }
  if (upper.includes('STAKE')) {
    return 'STAKE_REQUIRED';
  }
  if (upper.includes('PAYMASTER') || upper.includes('AA SPONSOR')) {
    return 'PAYMASTER_REJECT';
  }
  if (upper.includes('CID') && (upper.includes('MISMATCH') || upper.includes('DOES NOT MATCH'))) {
    return 'CID_MISMATCH';
  }
  if (upper.includes('DISPUTE') && (upper.includes('OPEN') || upper.includes('ACTIVE'))) {
    return 'DISPUTE_OPENED';
  }
  if (
    upper.includes('TIMEOUT') ||
    upper.includes('TIMED OUT') ||
    upper.includes('ETIMEDOUT') ||
    upper.includes('ABORTED')
  ) {
    return 'RPC_TIMEOUT';
  }
  if (upper.includes('REVERT')) {
    return 'UNKNOWN_REVERT';
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
