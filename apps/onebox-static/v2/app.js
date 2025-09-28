const STORAGE_KEYS = {
  ORCH_URL: 'ORCH_URL',
  API_TOKEN: 'ONEBOX_API_TOKEN',
  STATUS_INTERVAL: 'ONEBOX_STATUS_INTERVAL',
  EXPERT_MODE: 'ONEBOX_EXPERT_MODE',
};

const DEFAULT_STATUS_INTERVAL = 30_000;

let orchestratorUrl = (window.localStorage.getItem(STORAGE_KEYS.ORCH_URL) || '').trim();
let statusIntervalMs = readStatusInterval();
let expertMode = loadExpertMode();
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
const settingsBtn = document.getElementById('settings');
const settingsDialog = document.getElementById('settings-dialog');
const settingsOrch = document.getElementById('settings-orch');
const settingsToken = document.getElementById('settings-token');
const settingsInterval = document.getElementById('settings-interval');

const MESSAGE_ROLE = {
  USER: 'm-user',
  ASSISTANT: 'm-assistant',
};

if (modeBadge) {
  modeBadge.textContent = `Mode: ${expertMode ? 'Expert' : 'Guest'}`;
}

if (!orchestratorUrl) {
  appendNote('Demo Mode active. Open Settings to connect to your orchestrator.');
}

function readStatusInterval() {
  const raw = window.localStorage.getItem(STORAGE_KEYS.STATUS_INTERVAL);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_STATUS_INTERVAL;
  }
  return parsed;
}

function loadExpertMode() {
  return window.localStorage.getItem(STORAGE_KEYS.EXPERT_MODE) === '1';
}

function getStoredToken() {
  const token = window.localStorage.getItem(STORAGE_KEYS.API_TOKEN);
  return typeof token === 'string' ? token : '';
}

const ERROR_FIELDS_TO_FOLLOW = [
  'cause',
  'error',
  'errors',
  'data',
  'details',
  'body',
  'response',
  'info',
  'reason',
];

function pushUnique(array, value) {
  if (!value && value !== 0) return;
  const str = String(value).trim();
  if (!str) return;
  if (!array.includes(str)) {
    array.push(str);
  }
}

function collectErrorContext(err, state = { messages: [], codes: [], statuses: [] }, seen = new Set()) {
  if (err === null || err === undefined) {
    return state;
  }
  if (typeof err === 'string' || typeof err === 'number' || typeof err === 'bigint') {
    pushUnique(state.messages, err);
    return state;
  }

  if (seen.has(err)) {
    return state;
  }
  seen.add(err);

  if (err instanceof Error) {
    pushUnique(state.messages, err.message || err.toString());
    if ('code' in err && err.code !== undefined) {
      pushUnique(state.codes, err.code);
    }
    if ('name' in err && err.name && err.name !== 'Error') {
      pushUnique(state.codes, err.name);
    }
    if ('status' in err && Number.isFinite(err.status)) {
      const status = Number(err.status);
      if (!state.statuses.includes(status)) {
        state.statuses.push(status);
      }
    }
    if ('cause' in err) {
      collectErrorContext(err.cause, state, seen);
    }
  }

  if (typeof err === 'object' && err) {
    if ('message' in err && err.message) {
      pushUnique(state.messages, err.message);
    }
    if ('status' in err && Number.isFinite(err.status)) {
      const status = Number(err.status);
      if (!state.statuses.includes(status)) {
        state.statuses.push(status);
      }
    }
    if ('statusCode' in err && Number.isFinite(err.statusCode)) {
      const status = Number(err.statusCode);
      if (!state.statuses.includes(status)) {
        state.statuses.push(status);
      }
    }
    if ('code' in err && err.code !== undefined) {
      pushUnique(state.codes, err.code);
    }
    if ('error' in err && typeof err.error === 'string') {
      pushUnique(state.messages, err.error);
    }
    if ('statusText' in err && typeof err.statusText === 'string') {
      pushUnique(state.messages, err.statusText);
    }
    for (const key of ERROR_FIELDS_TO_FOLLOW) {
      if (key in err && err[key] !== undefined) {
        collectErrorContext(err[key], state, seen);
      }
    }
  }

  return state;
}

function toLowerList(values) {
  return values.map((value) => value.toLowerCase());
}

function buildMatcher(context) {
  const lowerMessages = toLowerList(context.messages);
  const lowerCodes = toLowerList(context.codes);
  const status = context.statuses.length ? context.statuses[0] : undefined;
  return {
    primary: context.messages.find((value) => value && value.trim()),
    status,
    contains(fragment) {
      if (!fragment) return false;
      const needle = fragment.toLowerCase();
      return lowerMessages.some((message) => message.includes(needle));
    },
    hasCode(code) {
      if (!code) return false;
      const needle = String(code).toLowerCase();
      return lowerCodes.includes(needle);
    },
  };
}

const FRIENDLY_ERROR_RULES = [
  {
    id: 'insufficient_balance',
    message:
      'You need more AGIALPHA available to cover the reward and stake. Tip: Top up or adjust the amounts.',
    matches: (ctx) =>
      ctx.contains('insufficient balance') ||
      ctx.contains('insufficient funds') ||
      ctx.contains('transfer amount exceeds balance') ||
      ctx.contains('you need more agialpha'),
  },
  {
    id: 'insufficient_allowance',
    message:
      'Escrow allowance is missing. Tip: Approve AGIALPHA spending from your wallet so I can move the staked funds for you.',
    matches: (ctx) =>
      ctx.contains('insufficient allowance') ||
      ctx.contains('insufficientallowance') ||
      ctx.contains('exceeds allowance') ||
      ctx.contains('allowance is not enough') ||
      ctx.contains('approve agialpha spending'),
  },
  {
    id: 'reward_zero',
    message: 'Rewards must be greater than zero AGIALPHA. Tip: Set a positive reward before posting the job.',
    matches: (ctx) =>
      ctx.contains('zero reward') || ctx.contains('reward == 0') || ctx.contains('reward must be greater than zero'),
  },
  {
    id: 'deadline_invalid',
    message:
      'The deadline needs to be at least one day in the future. Tip: Pick a deadline that is 24 hours or more from now.',
    matches: (ctx) =>
      ctx.contains('deadline must be') || ctx.contains('deadline is in the past') || ctx.contains('deadline < now'),
  },
  {
    id: 'deadline_not_reached',
    message:
      'That step isn’t available until the job deadline passes. Tip: Wait until the deadline or adjust the schedule before retrying.',
    matches: (ctx) =>
      ctx.contains('deadline notreached') || ctx.contains('deadline not reached') || ctx.contains('too early'),
  },
  {
    id: 'job_not_found',
    message: 'I couldn’t find that job id on-chain. Tip: Check the job number or ask me for your recent jobs.',
    matches: (ctx) => ctx.contains('jobnotfound') || ctx.contains('job not found') || ctx.contains('unknown job'),
  },
  {
    id: 'role_employer_only',
    message: 'Only the employer can complete that action. Tip: Sign in with the employer account or ask me to switch roles.',
    matches: (ctx) => ctx.contains('onlyemployer') || ctx.contains('notemployer'),
  },
  {
    id: 'role_validator_only',
    message:
      'This action is limited to assigned validators. Tip: Ensure your validator ENS is registered and selected for the job.',
    matches: (ctx) =>
      ctx.contains('notvalidator') || ctx.contains('validatorbanned') || ctx.contains('unauthorizedvalidator'),
  },
  {
    id: 'role_operator_only',
    message:
      'Only the job operator can run that step. Tip: Have the operator account confirm the action or ask for a reassignment.',
    matches: (ctx) => ctx.contains('notoperator') || ctx.contains('invalidcaller'),
  },
  {
    id: 'role_governance_only',
    message:
      'Governance approval is required for this operation. Tip: Reach out to the governance team or use an approved governance key.',
    matches: (ctx) => ctx.contains('notgovernance') || ctx.contains('notgovernanceorpauser'),
  },
  {
    id: 'identity_required',
    message:
      'Identity verification is required before continuing. Tip: Finish identity verification in the Agent Gateway before using this one-box flow.',
    matches: (ctx) =>
      ctx.contains('ens name must') ||
      ctx.contains('ens required') ||
      ctx.contains('identityregistry not set') ||
      ctx.contains('identity verification'),
  },
  {
    id: 'stake_missing',
    message: 'Stake the minimum AGIALPHA before continuing. Tip: Add funds or reduce the job’s stake size.',
    matches: (ctx) =>
      ctx.contains('nostake') ||
      ctx.contains('stake required') ||
      ctx.contains('stake missing') ||
      ctx.contains('stake the minimum agialpha'),
  },
  {
    id: 'stake_too_high',
    message:
      'The requested stake exceeds the allowed maximum. Tip: Lower the stake amount or split it into smaller deposits.',
    matches: (ctx) => ctx.contains('stakeoverflow') || ctx.contains('amount too large'),
  },
  {
    id: 'aa_paymaster_rejected',
    message:
      'The account abstraction paymaster rejected this request. Tip: Retry shortly or submit the transaction manually.',
    matches: (ctx) =>
      ctx.contains('paymaster rejected') ||
      ctx.contains('managed paymaster error') ||
      ctx.contains('paymaster returned empty sponsorship') ||
      ctx.contains('aa_paymaster_rejected'),
  },
  {
    id: 'invalid_state',
    message:
      'The job isn’t in the right state for that action yet. Tip: Check the job status and try the step that matches the current phase.',
    matches: (ctx) =>
      ctx.contains('invalidstate') ||
      ctx.contains('cannotexpire') ||
      ctx.contains('alreadytallied') ||
      ctx.contains('revealpending'),
  },
  {
    id: 'already_done',
    message: 'This step has already been completed. Tip: No further action is needed unless circumstances change.',
    matches: (ctx) =>
      ctx.contains('already committed') ||
      ctx.contains('already revealed') ||
      ctx.contains('already applied') ||
      ctx.contains('alreadylisted'),
  },
  {
    id: 'burn_evidence_missing',
    message:
      'Burn evidence is missing or incomplete. Tip: Upload the burn receipt or wait for the validator to finish the burn.',
    matches: (ctx) => ctx.contains('burnevidence') || ctx.contains('burnreceipt'),
  },
  {
    id: 'validator_window_closed',
    message: 'The validation window has already closed. Tip: Wait for the next cycle or escalate through disputes if needed.',
    matches: (ctx) =>
      ctx.contains('commitphaseclosed') ||
      ctx.contains('revealphaseclosed') ||
      ctx.contains('commit closed') ||
      ctx.contains('reveal closed'),
  },
  {
    id: 'validator_window_open',
    message: 'Validator checks didn’t finish in time. Tip: Retry in a moment or contact support if it keeps failing.',
    matches: (ctx) =>
      ctx.contains('commitphaseactive') ||
      ctx.contains('reveal pending') ||
      ctx.contains('validators already selected') ||
      ctx.contains('validation timeout'),
  },
  {
    id: 'dispute_open',
    message: 'A dispute is already open for this job. Tip: Wait for resolution before taking further action.',
    matches: (ctx) =>
      ctx.contains('dispute already open') ||
      ctx.contains('dispute is already open') ||
      ctx.contains('dispute open') ||
      ctx.contains('disputed'),
  },
  {
    id: 'network_fetch',
    message:
      'I couldn’t reach the orchestrator network. Tip: Check your internet connection or try again in a few seconds.',
    matches: (ctx) =>
      ctx.contains('failed to fetch') ||
      ctx.contains('networkerror') ||
      ctx.contains('network request failed') ||
      ctx.contains('fetch event responded'),
  },
  {
    id: 'timeout',
    message: 'The blockchain RPC endpoint timed out. Tip: Try again or switch to a healthier provider.',
    matches: (ctx) =>
      ctx.contains('timeout') ||
      ctx.contains('timed out') ||
      ctx.contains('etimedout') ||
      ctx.contains('rpc timed out'),
  },
  {
    id: 'rate_limited',
    message: 'You’re sending requests too quickly. Tip: Pause for a few seconds before trying again.',
    matches: (ctx) => ctx.status === 429 || ctx.contains('too many requests'),
  },
  {
    id: 'service_unavailable',
    message: 'The relayer is offline right now. Tip: Switch to wallet mode or retry shortly.',
    matches: (ctx) =>
      ctx.status === 503 ||
      ctx.contains('service unavailable') ||
      ctx.contains('maintenance') ||
      ctx.contains('relayer is offline') ||
      ctx.contains('relayer is not configured'),
  },
  {
    id: 'unauthorized',
    message:
      'The orchestrator rejected our credentials. Tip: Check that your API token is correct and hasn’t expired.',
    matches: (ctx) => ctx.status === 401 || ctx.status === 403 || ctx.contains('unauthorized'),
  },
  {
    id: 'not_found',
    message: 'The orchestrator endpoint was not found. Tip: Verify the /onebox URLs in your configuration.',
    matches: (ctx) => ctx.status === 404 || ctx.contains('not found'),
  },
  {
    id: 'user_rejected',
    message: 'You cancelled the wallet prompt. Tip: Restart the request and approve it when you’re ready.',
    matches: (ctx) =>
      ctx.hasCode('ACTION_REJECTED') ||
      ctx.contains('user rejected') ||
      ctx.contains('user denied') ||
      ctx.contains('request rejected'),
  },
  {
    id: 'gas_estimation',
    message:
      'I couldn’t estimate the gas for that transaction. Tip: Double-check the inputs or try again with slightly different parameters.',
    matches: (ctx) =>
      ctx.hasCode('UNPREDICTABLE_GAS_LIMIT') ||
      ctx.contains('cannot estimate gas') ||
      ctx.contains('gas required exceeds allowance'),
  },
  {
    id: 'invalid_argument',
    message:
      'One of the inputs looks invalid. Tip: Use plain numbers for amounts and ensure addresses or ENS names are correct.',
    matches: (ctx) =>
      ctx.hasCode('INVALID_ARGUMENT') ||
      ctx.contains('invalid bignumber') ||
      ctx.contains('invalid argument'),
  },
  {
    id: 'json_parse',
    message:
      'The orchestrator returned data in an unexpected format. Tip: Reload the page or retry—this can happen during upgrades.',
    matches: (ctx) => ctx.contains('unexpected token') || ctx.contains('invalid json'),
  },
  {
    id: 'quota_exceeded',
    message:
      'This action exceeds the configured spend cap. Tip: Reduce the reward or wait until the orchestrator refreshes its quota.',
    matches: (ctx) => ctx.contains('spend cap') || ctx.contains('quota exceeded'),
  },
  {
    id: 'attachment_missing',
    message:
      'Required attachments were missing from the request. Tip: Re-upload the files or drop them into the chat before confirming.',
    matches: (ctx) => ctx.contains('attachment required') || ctx.contains('missing attachment'),
  },
  {
    id: 'cid_mismatch',
    message: 'The deliverable CID didn’t match what’s on record. Tip: Re-upload the correct artifact and try again.',
    matches: (ctx) =>
      ctx.contains('cid mismatch') ||
      ctx.contains('cid does not match') ||
      ctx.contains("cid didn't match") ||
      ctx.contains('cid didn’t match'),
  },
  {
    id: 'ipfs_failure',
    message: 'I couldn’t package your job details. Tip: Remove broken links and try again.',
    matches: (ctx) =>
      ctx.contains('ipfs upload failed') ||
      ctx.contains('ipfs response missing cid') ||
      ctx.contains('pinning error') ||
      ctx.contains("couldn't package your job details") ||
      ctx.contains('couldn’t package your job details') ||
      ctx.contains('pinning service is busy'),
  },
  {
    id: 'simulation_failed',
    message:
      'Simulation failed before submission. Tip: Review the planner output or switch to Expert Mode for a detailed trace.',
    matches: (ctx) => ctx.contains('simulation failed') || ctx.contains('failed simulation') || ctx.contains('sim revert'),
  },
  {
    id: 'unknown_revert',
    message: 'The transaction reverted without a known reason. Tip: Check the logs or retry with adjusted parameters.',
    matches: (ctx) =>
      ctx.contains('unknown revert') ||
      ctx.contains('reverted without a known reason') ||
      ctx.contains('unknown reason'),
  },
];

function withAuthHeaders(baseHeaders = {}) {
  try {
    const tokenRaw = window.localStorage.getItem(STORAGE_KEYS.API_TOKEN);
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
  window.localStorage.setItem(STORAGE_KEYS.ORCH_URL, url || '');
  window.location.reload();
};

function friendlyError(input) {
  if (input === null || input === undefined) {
    return 'Something went wrong. Try again in a moment.';
  }

  const context = collectErrorContext(input);
  const matcher = buildMatcher(context);

  for (const rule of FRIENDLY_ERROR_RULES) {
    try {
      if (rule.matches(matcher)) {
        return rule.message;
      }
    } catch (err) {
      console.warn(`Error rule ${rule.id} threw during evaluation`, err);
    }
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed) {
      return trimmed;
    }
    return 'Something went wrong. Try again in a moment.';
  }

  if (matcher.primary) {
    return matcher.primary;
  }

  try {
    return JSON.stringify(input);
  } catch (err) {
    return 'Something went wrong. Try again in a moment.';
  }
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
    executeIntent(plan);
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
  const missingFields = Array.isArray(container.missingFields)
    ? container.missingFields
    : Array.isArray(payload.missingFields)
    ? payload.missingFields
    : [];
  const requiresConfirmation =
    typeof container.requiresConfirmation === 'boolean'
      ? container.requiresConfirmation
      : typeof payload.requiresConfirmation === 'boolean'
      ? payload.requiresConfirmation
      : true;

  const planHash =
    typeof container.planHash === 'string' && container.planHash.trim()
      ? container.planHash.trim()
      : typeof payload.planHash === 'string' && payload.planHash.trim()
      ? payload.planHash.trim()
      : null;

  const createdAtCandidate =
    container.createdAt !== undefined ? container.createdAt : payload.createdAt !== undefined ? payload.createdAt : null;

  const createdAt =
    typeof createdAtCandidate === 'string' && createdAtCandidate.trim()
      ? createdAtCandidate.trim()
      : Number.isFinite(createdAtCandidate)
      ? createdAtCandidate
      : null;

  return { summary, intent, warnings, missingFields, requiresConfirmation, planHash, createdAt };
}

async function plan(text) {
  if (!orchestratorUrl) {
    return {
      summary: `I will ${text.replace(/^i\s*/i, '')}. Proceed?`,
      intent: mockIntent(text),
      warnings: [],
      missingFields: [],
      requiresConfirmation: true,
      planHash: null,
      createdAt: null,
    };
  }

  const response = await fetch(`${orchestratorUrl}/onebox/plan`, {
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

async function executeIntent(plan) {
  appendMessage(MESSAGE_ROLE.ASSISTANT, 'Working on it…');

  const intent = plan?.intent;
  const planHash = plan?.planHash ?? null;
  const createdAt = plan?.createdAt ?? null;

  if (!intent || typeof intent !== 'object') {
    appendMessage(MESSAGE_ROLE.ASSISTANT, '⚠️ Missing job intent. Try planning your request again.');
    return;
  }

  if (!orchestratorUrl) {
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

  const body = {
    intent,
    mode: expertMode ? 'wallet' : 'relayer',
  };

  if (planHash) {
    body.planHash = planHash;
  }
  if (createdAt !== null && createdAt !== undefined && createdAt !== '') {
    body.createdAt = createdAt;
  }

  const response = await fetch(`${orchestratorUrl}/onebox/execute`, {
    method: 'POST',
    headers: withAuthHeaders({
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
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

  if (orchestratorUrl) {
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

      const missingFields = Array.isArray(planResult.missingFields)
        ? planResult.missingFields.filter((field) => typeof field === 'string' && field.trim())
        : [];

      if (missingFields.length) {
        appendMissingFieldsRequest(planResult, missingFields);
        return;
      }

      if (planResult.requiresConfirmation === false) {
        const summary = planResult.summary || 'Executing now.';
        appendMessage(MESSAGE_ROLE.ASSISTANT, summary);
        executeIntent(planResult);
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

function humanizeMissingField(field) {
  if (!field && field !== 0) return '';
  const raw = String(field).trim();
  if (!raw) return '';
  const normalized = raw.toLowerCase();
  switch (normalized) {
    case 'reward':
      return 'reward';
    case 'rewardtoken':
    case 'reward_token':
      return 'reward token';
    case 'deadlinedays':
    case 'deadline':
    case 'deadline_days':
      return 'deadline';
    case 'jobid':
    case 'job_id':
      return 'job ID';
    default: {
      const spaced = raw
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .trim();
      return spaced ? spaced.toLowerCase() : raw;
    }
  }
}

function describeMissingFields(fields) {
  const friendly = fields
    .map((field) => humanizeMissingField(field))
    .map((field) => field && field.trim())
    .filter(Boolean);
  if (!friendly.length) {
    return { list: '', count: 0 };
  }
  if (friendly.length === 1) {
    return { list: friendly[0], count: 1 };
  }
  if (friendly.length === 2) {
    return { list: `${friendly[0]} and ${friendly[1]}`, count: 2 };
  }
  const head = friendly.slice(0, -1).join(', ');
  const tail = friendly[friendly.length - 1];
  return { list: `${head}, and ${tail}`, count: friendly.length };
}

function appendMissingFieldsRequest(plan, fields) {
  const { list, count } = describeMissingFields(fields);
  if (!count) return;

  const container = document.createElement('div');

  if (plan.summary) {
    const summary = document.createElement('p');
    summary.textContent = plan.summary;
    container.appendChild(summary);
  }

  const prompt = document.createElement('p');
  prompt.textContent =
    count === 1
      ? `I still need the ${list} before I can continue. Please provide it so I can finish planning.`
      : `I still need the following details before I can continue: ${list}. Please provide them so I can finish planning.`;
  container.appendChild(prompt);

  appendMessage(MESSAGE_ROLE.ASSISTANT, container);
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
  if (!orchestratorUrl) {
    renderStatusPlaceholder('Configure the orchestrator in Settings to enable live status.');
    if (statusNote) {
      statusNote.textContent = 'Status feed inactive until an orchestrator URL is configured.';
    }
    return;
  }

  if (statusNote) {
    statusNote.textContent = manual ? 'Refreshing…' : 'Loading status…';
  }

  try {
    const response = await fetch(`${orchestratorUrl}/onebox/status`, {
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
  if (!orchestratorUrl) {
    renderStatusPlaceholder('Configure the orchestrator in Settings to enable live status.');
    return;
  }
  loadStatus().catch(() => {
    /* handled inside loadStatus */
  });
  if (statusIntervalMs > 0) {
    statusTimer = window.setInterval(() => {
      loadStatus().catch(() => {
        /* handled */
      });
    }, statusIntervalMs);
  }
}

composer.addEventListener('submit', handlePlanSubmit);

expertBtn.addEventListener('click', () => {
  expertMode = !expertMode;
  modeBadge.textContent = `Mode: ${expertMode ? 'Expert' : 'Guest'}`;
  window.localStorage.setItem(STORAGE_KEYS.EXPERT_MODE, expertMode ? '1' : '0');
  if (expertMode) {
    appendNote('Expert Mode enabled. Connect your wallet in the orchestrator response when prompted.');
  } else {
    appendNote('Guest Mode enabled. I will execute via the orchestrator relayer.');
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

settingsBtn?.addEventListener('click', () => {
  if (!settingsDialog) return;
  if (settingsOrch) {
    settingsOrch.value = orchestratorUrl;
  }
  if (settingsToken) {
    settingsToken.value = getStoredToken();
  }
  if (settingsInterval) {
    const value = statusIntervalMs > 0 ? String(statusIntervalMs) : '0';
    const option = Array.from(settingsInterval.options || []).find((opt) => opt.value === value);
    settingsInterval.value = option ? value : (statusIntervalMs > 0 ? String(DEFAULT_STATUS_INTERVAL) : '0');
  }
  settingsDialog.showModal();
});

settingsDialog?.addEventListener('close', () => {
  if (!settingsDialog || settingsDialog.returnValue !== 'confirm') return;
  const previousUrl = orchestratorUrl;
  const url = (settingsOrch?.value || '').trim();
  orchestratorUrl = url;
  if (url) {
    window.localStorage.setItem(STORAGE_KEYS.ORCH_URL, url);
    if (url !== previousUrl) {
      appendNote(`Connected to orchestrator at ${url}`);
    }
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.ORCH_URL);
    if (previousUrl) {
      appendNote('Demo Mode enabled. Requests will be simulated.');
    }
  }

  const token = (settingsToken?.value || '').trim();
  if (token) {
    window.localStorage.setItem(STORAGE_KEYS.API_TOKEN, token);
  } else {
    window.localStorage.removeItem(STORAGE_KEYS.API_TOKEN);
  }

  const intervalRaw = Number(settingsInterval?.value || DEFAULT_STATUS_INTERVAL);
  if (Number.isFinite(intervalRaw) && intervalRaw >= 0) {
    statusIntervalMs = intervalRaw;
    if (intervalRaw === DEFAULT_STATUS_INTERVAL) {
      window.localStorage.removeItem(STORAGE_KEYS.STATUS_INTERVAL);
    } else {
      window.localStorage.setItem(STORAGE_KEYS.STATUS_INTERVAL, String(intervalRaw));
    }
  } else {
    statusIntervalMs = DEFAULT_STATUS_INTERVAL;
    window.localStorage.removeItem(STORAGE_KEYS.STATUS_INTERVAL);
  }

  scheduleStatusUpdates();
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
