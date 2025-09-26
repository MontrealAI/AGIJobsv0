const ORCH_URL = window.localStorage.getItem('ORCH_URL') || '';
let expertMode = false;
const chat = document.getElementById('chat');
const input = document.getElementById('box');
const composer = document.getElementById('composer');
const expertBtn = document.getElementById('expert');
const modeBadge = document.getElementById('mode');
const suggestionButtons = document.querySelectorAll('[data-fill]');

const MESSAGE_ROLE = {
  USER: 'm-user',
  ASSISTANT: 'm-assistant',
};

function appendMessage(role, html) {
  const wrapper = document.createElement('div');
  wrapper.className = `msg ${role}`;
  wrapper.innerHTML = html;
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
}

function appendNote(html) {
  appendMessage(MESSAGE_ROLE.ASSISTANT, `<p class="m-note">${html}</p>`);
}

function createConfirmRow(summary, intent) {
  const row = document.createElement('div');
  row.className = 'row';
  row.style.marginTop = '10px';

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.textContent = 'Yes';
  yes.className = 'pill ok';
  yes.addEventListener('click', () => executeIntent(intent));

  const no = document.createElement('button');
  no.type = 'button';
  no.textContent = 'Cancel';
  no.className = 'pill';
  no.addEventListener('click', () => appendMessage(MESSAGE_ROLE.ASSISTANT, 'Okay, cancelled.'));

  row.append(yes, no);
  return `<p>${summary}</p>${row.outerHTML}`;
}

async function plan(text) {
  if (!ORCH_URL) {
    return {
      summary: `I will ${text.replace(/^i\s*/i, '')}. Proceed?`,
      intent: mockIntent(text),
    };
  }

  const response = await fetch(`${ORCH_URL}/onebox/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, expert: expertMode }),
  });

  if (!response.ok) {
    const errBody = await safeJson(response);
    throw new Error(errBody?.error || 'Planner error');
  }

  return response.json();
}

async function executeIntent(intent) {
  appendMessage(MESSAGE_ROLE.ASSISTANT, 'Working on it…');

  if (!ORCH_URL) {
    window.setTimeout(() => {
      appendMessage(MESSAGE_ROLE.ASSISTANT, '✅ Done. Job ID is <strong>#123</strong>.');
    }, 900);
    return;
  }

  const response = await fetch(`${ORCH_URL}/onebox/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intent, mode: expertMode ? 'wallet' : 'relayer' }),
  });

  const payload = await safeJson(response);

  if (!response.ok || !payload?.ok) {
    const message = payload?.error || 'Execution failed';
    appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${message}`);
    appendNote('Try rephrasing your request or adjusting the reward/deadline.');
    return;
  }

  const receiptLink = payload.receiptUrl
    ? ` <a href="${payload.receiptUrl}" target="_blank" rel="noopener">Receipt</a>`
    : '';
  appendMessage(
    MESSAGE_ROLE.ASSISTANT,
    `✅ Success. Job ID <strong>#${payload.jobId}</strong>.${receiptLink}`,
  );
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
    .then(({ summary, intent }) => {
      const html = createConfirmRow(summary, intent);
      appendMessage(MESSAGE_ROLE.ASSISTANT, html);
    })
    .catch((err) => {
      appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${err.message}`);
      appendNote('The planner could not understand that request. Try one sentence with reward and duration.');
    });
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

window.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== input) {
    event.preventDefault();
    input.focus();
  }
});

input.focus();
