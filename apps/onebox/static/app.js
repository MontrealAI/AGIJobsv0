const chat = document.getElementById("chat");
const input = document.getElementById("box");
const sendButton = document.getElementById("send");
const expertButton = document.getElementById("expert");
const modeBadge = document.getElementById("mode");
const exampleButtons = document.querySelectorAll("[data-example]");

const orchUrl = window.localStorage.getItem("ORCH_URL") ?? "";
let expertMode = false;

function createMessageElement(role, html) {
  const div = document.createElement("div");
  div.classList.add("msg");
  div.classList.add(role === "user" ? "m-user" : "m-assistant");
  div.innerHTML = html;
  return div;
}

function appendMessage(role, html) {
  const node = createMessageElement(role, html);
  chat.appendChild(node);
  chat.scrollTop = chat.scrollHeight;
  return node;
}

function appendNote(text) {
  appendMessage("assistant", `<p class="m-note">${text}</p>`);
}

async function plan(text) {
  if (!orchUrl) {
    const normalized = text.replace(/^i\s*/i, "");
    const action = normalized.toLowerCase().includes("finalize")
      ? "finalize_job"
      : normalized.toLowerCase().includes("status")
      ? "check_status"
      : "post_job";

    return {
      summary: `I will ${normalized}. Proceed?`,
      intent: {
        action,
        payload: {
          title: normalized,
          rewardToken: "AGIALPHA",
          reward: "5.0",
          deadlineDays: 7,
        },
      },
    };
  }

  const response = await fetch(`${orchUrl}/onebox/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, expert: expertMode }),
  });

  if (!response.ok) {
    throw new Error("Planner error");
  }

  return response.json();
}

async function execute(intent) {
  appendMessage("assistant", "Working on it…");

  if (!orchUrl) {
    window.setTimeout(() => {
      appendMessage("assistant", "✅ Done. Job ID is <strong>#123</strong>.");
    }, 800);
    return;
  }

  const response = await fetch(`${orchUrl}/onebox/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent, mode: expertMode ? "wallet" : "relayer" }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    const message = payload?.error ?? "Execution failed";
    throw new Error(message);
  }

  const { jobId, receiptUrl } = payload;
  let text = `✅ Success. Job ID <strong>#${jobId}</strong>.`;
  if (receiptUrl) {
    text += ` <a href="${receiptUrl}" target="_blank" rel="noopener">Receipt</a>`;
  }
  appendMessage("assistant", text);
}

function renderConfirmation(summary, intent) {
  const wrapper = appendMessage(
    "assistant",
    `${summary}<div class="row row-confirm"><button class="pill ok" data-yes>Yes</button><button class="pill" data-no>Cancel</button></div>`
  );

  const yesButton = wrapper.querySelector("[data-yes]");
  const noButton = wrapper.querySelector("[data-no]");

  yesButton.addEventListener("click", async () => {
    try {
      await execute(intent);
    } catch (error) {
      appendMessage("assistant", `⚠️ ${error.message}`);
      appendNote("Try rephrasing in one sentence (e.g. “Create…, pay X AGIALPHA, deadline”).");
    }
  });

  noButton.addEventListener("click", () => {
    appendMessage("assistant", "Okay, cancelled.");
  });
}

async function handleSubmit() {
  const text = input.value.trim();
  if (!text) {
    input.focus();
    return;
  }

  appendMessage("user", text);
  input.value = "";

  try {
    const { summary, intent } = await plan(text);
    renderConfirmation(summary, intent);
  } catch (error) {
    appendMessage("assistant", `⚠️ ${error.message ?? "Something went wrong."}`);
    appendNote("The orchestrator planner is unavailable. Please try again or contact support.");
  }
}

sendButton.addEventListener("click", handleSubmit);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSubmit();
  }
});

exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.example;
    input.focus();
  });
});

expertButton.addEventListener("click", () => {
  expertMode = !expertMode;
  modeBadge.textContent = `Mode: ${expertMode ? "Expert" : "Guest"}`;
});

// Allow deep-linking to a preset orchestrator URL via hash: #orch=https://...
if (!orchUrl && window.location.hash.startsWith("#orch=")) {
  const [, value] = window.location.hash.split("#orch=");
  if (value) {
    window.localStorage.setItem("ORCH_URL", decodeURIComponent(value));
    window.location.href = window.location.pathname;
  }
}

// Maintain focus on load for faster demos.
window.addEventListener("DOMContentLoaded", () => {
  input.focus();
});
