const $ = (sel) => document.querySelector(sel);
const chat = $('#chat');
const input = $('#box');
const sendBtn = $('#send');
const expertBtn = $('#expert');
const modeBadge = $('#mode');
const pills = document.querySelectorAll('.pill');
const orchInput = $('#orch');
const tokenInput = $('#tok');
const saveBtn = $('#save');
const connectBtn = $('#connect');

const copy = {
  planning: 'Let me prepare this…',
  executing: 'Publishing to the network… this usually takes a few seconds.',
  posted: (id, url) => `✅ Job <b>#${id ?? '?'}</b> is live. ${url ? `<a target="_blank" rel="noopener" href="${url}">Verify on chain</a>` : ''}`,
  finalized: (id, url) => `✅ Job <b>#${id}</b> finalized. ${url ? `<a target="_blank" rel="noopener" href="${url}">Receipt</a>` : ''}`,
  cancelled: 'Okay, cancelled.',
  status: (s) => `Job <b>#${s.jobId}</b> is <b>${s.state}</b>${s.reward ? `. Reward ${s.reward}` : ''}${s.token ? ` ${s.token}` : ''}.`,
};

const ERRORS = {
  INSUFFICIENT_BALANCE: 'You don’t have enough AGIALPHA to fund this job. Reduce the reward or top up.',
  INSUFFICIENT_ALLOWANCE: 'Your wallet needs permission to use AGIALPHA. I can prepare an approval transaction.',
  IPFS_FAILED: 'I couldn’t package your job details. Remove broken links and try again.',
  DEADLINE_INVALID: 'That deadline is in the past. Pick at least 24 hours from now.',
  NETWORK_CONGESTED: 'The network is busy; I’ll keep retrying for a moment.',
  NO_WALLET: 'No EIP-1193 wallet detected. Install MetaMask, Rabby, or another compatible wallet.',
  UNKNOWN: 'Something went wrong. Try rephrasing your request or adjust the reward/deadline.',
};

let expert = false;
let ethProvider = null;
let orchestrator = localStorage.getItem('onebox_orchestrator') || '';
let apiToken = localStorage.getItem('onebox_api_token') || '';

orchInput.value = orchestrator;
tokenInput.value = apiToken;
updateMode();

function addMessage(role, html) {
  const node = document.createElement('div');
  node.className = `msg ${role === 'user' ? 'm-user' : 'm-assist'}`;
  node.innerHTML = html;
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
}

function addNote(text) {
  addMessage('assist', `<div class="note">${text}</div>`);
}

async function plan(text) {
  addMessage('assist', copy.planning);
  const payload = { text, expert };
  const res = await callApi('/onebox/plan', payload);
  return res;
}

async function execute(intent) {
  addMessage('assist', copy.executing);
  const mode = expert ? 'wallet' : 'relayer';
  const res = await callApi('/onebox/execute', { intent, mode });

  if (expert && res.to && res.data) {
    if (!ethProvider) {
      throw new Error('NO_WALLET');
    }
    const [from] = await ethProvider.request({ method: 'eth_requestAccounts' });
    const txHash = await ethProvider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: res.to, data: res.data, value: res.value || '0x0' }],
    });
    const receiptUrl = (res.receiptUrl || '').includes('{tx}') ? res.receiptUrl.replace('{tx}', txHash) : res.receiptUrl;
    if (intent.action === 'finalize_job') {
      addMessage('assist', copy.finalized(res.jobId || '?', receiptUrl || ''));
    } else {
      addMessage('assist', copy.posted(res.jobId || '?', receiptUrl || ''));
    }
    return;
  }

  if (intent.action === 'finalize_job') {
    addMessage('assist', copy.finalized(res.jobId, res.receiptUrl || ''));
  } else {
    addMessage('assist', copy.posted(res.jobId, res.receiptUrl || ''));
  }
}

async function go() {
  const text = input.value.trim();
  if (!text) return;
  addMessage('user', text);
  input.value = '';
  try {
    const { summary, intent } = await plan(text);
    if (intent.action === 'check_status') {
      const id = intent.payload.jobId ?? extractJobId(text);
      const status = await callApi(`/onebox/status?jobId=${id}`);
      addMessage('assist', copy.status(status));
      return;
    }
    confirm(summary, intent);
  } catch (err) {
    handleError(err);
  }
}

function confirm(summary, intent) {
  const id = `c${Date.now()}`;
  addMessage(
    'assist',
    `${summary}<div class="row" style="margin-top:10px"><button class="pill ok" id="${id}-y">Yes</button><button class="pill" id="${id}-n">Cancel</button></div>`,
  );
  setTimeout(() => {
    const yes = document.getElementById(`${id}-y`);
    const no = document.getElementById(`${id}-n`);
    if (yes) yes.onclick = () => execute(intent);
    if (no) no.onclick = () => addMessage('assist', copy.cancelled);
  });
}

async function callApi(path, body) {
  if (!orchestrator) {
    throw new Error('NETWORK_CONGESTED');
  }
  const headers = { 'Content-Type': 'application/json' };
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
  const init = body ? { method: 'POST', headers, body: JSON.stringify(body) } : { method: 'GET', headers };
  const res = await fetch(`${orchestrator}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'UNKNOWN');
  }
  return res.json();
}

function extractJobId(text) {
  const m = text.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function handleError(err) {
  const code = normalizeError(err.message);
  addMessage('assist', `⚠️ ${ERRORS[code] || ERRORS.UNKNOWN}`);
}

function normalizeError(raw = '') {
  const upper = raw.toUpperCase();
  if (upper.includes('BALANCE')) return 'INSUFFICIENT_BALANCE';
  if (upper.includes('ALLOWANCE')) return 'INSUFFICIENT_ALLOWANCE';
  if (upper.includes('IPFS')) return 'IPFS_FAILED';
  if (upper.includes('DEADLINE')) return 'DEADLINE_INVALID';
  if (upper.includes('NO_WALLET')) return 'NO_WALLET';
  if (upper.includes('NETWORK')) return 'NETWORK_CONGESTED';
  return 'UNKNOWN';
}

function updateMode() {
  modeBadge.textContent = `Mode: ${expert ? 'Expert (wallet)' : 'Guest (walletless)'}`;
}

sendBtn.onclick = go;
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    go();
  }
});

expertBtn.onclick = () => {
  expert = !expert;
  updateMode();
};

saveBtn.onclick = () => {
  orchestrator = orchInput.value.trim();
  apiToken = tokenInput.value.trim();
  localStorage.setItem('onebox_orchestrator', orchestrator);
  localStorage.setItem('onebox_api_token', apiToken);
  addNote('Saved.');
};

connectBtn.onclick = async () => {
  if (!window.ethereum) {
    handleError(new Error('NO_WALLET'));
    return;
  }
  ethProvider = window.ethereum;
  try {
    await ethProvider.request({ method: 'eth_requestAccounts' });
    addNote('Wallet connected.');
  } catch (err) {
    handleError(err);
  }
};

pills.forEach((pill) => {
  pill.addEventListener('click', () => {
    input.value = pill.dataset.example;
    input.focus();
  });
});
