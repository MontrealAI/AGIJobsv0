import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const DATA_PATH = "dashboard-data.json";

function fmtPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function fmtList(entries) {
  if (!entries || !entries.length) return "—";
  return entries.join(", ");
}

function setField(name, value) {
  const el = document.querySelector(`[data-field="${name}"]`);
  if (el) {
    el.textContent = value ?? "—";
  }
}

function setLink(name, value) {
  const link = document.querySelector(`[data-link="${name}"]`);
  if (link && value) {
    link.href = value;
  }
}

function populatePhaseTable(phaseScores) {
  const tbody = document.querySelector("[data-phase-table]");
  if (!tbody) return;
  tbody.innerHTML = "";
  (phaseScores || []).forEach((phase) => {
    const tr = document.createElement("tr");
    const stateClass = `state-${phase.state || "pending"}`;
    tr.innerHTML = `
      <td>${phase.label}</td>
      <td class="${stateClass}">${phase.state?.toUpperCase() ?? "PENDING"}</td>
      <td>${(phase.completion * 100).toFixed(0)}%</td>
      <td>${phase.weight.toFixed(2)}</td>
      <td>${phase.metric}</td>`;
    tbody.appendChild(tr);
  });
}

function populateConfirmations(confirmations) {
  const list = document.querySelector("[data-list=\"confirmations\"]");
  if (!list) return;
  list.innerHTML = "";
  (confirmations || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderTimeline(mermaidSource) {
  const target = document.querySelector("[data-field=\"timeline\"]");
  if (!target) return;
  target.textContent = mermaidSource;
  mermaid.initialize({ startOnLoad: true, theme: "dark" });
  mermaid.run({ nodes: [target] });
}

async function loadDashboard() {
  try {
    const response = await fetch(`${DATA_PATH}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();

    setField("scenario-title", payload.scenario?.title ?? "Meta-Agentic α-AGI Jobs Demo V3");
    setField("scenario-narrative", payload.scenario?.narrative ?? "");
    setField("run-id", payload.runId);
    setField("run-state", payload.state);
    setField("alpha-readiness", fmtPercent(payload.alphaReadiness));
    setField("alpha-compounding", fmtPercent(payload.alphaCompoundingIndex));
    setField("owner-address", payload.owner?.address ?? "—");
    setField("owner-guardians", fmtList(payload.owner?.guardians ?? []));
    setField("owner-approvals", String(payload.owner?.approvals_required ?? "—"));
    setField("owner-pause", payload.owner?.emergency_pause ? "Enabled" : "Disabled");
    setField("owner-delegation", payload.owner?.can_delegate_parameters ? "Enabled" : "Disabled");
    setField("owner-charter", payload.owner?.mission_charter ?? "—");
    setField("treasury-token", payload.treasury?.token ?? "—");
    setField("treasury-balance", payload.treasury?.initial_balance ?? "—");
    setField("treasury-max-drawdown", `${payload.treasury?.risk_limits?.max_drawdown_percent ?? "—"}%`);
    setField("treasury-var", `${payload.treasury?.risk_limits?.var_percent ?? "—"}%`);
    setField(
      "treasury-buffer",
      `${payload.treasury?.risk_limits?.antifragility_buffer_percent ?? "—"}%`
    );
    setField(
      "treasury-circuit",
      `${payload.treasury?.risk_limits?.circuit_breaker_percent ?? payload.plan?.antifragility?.circuit_breaker_threshold_percent ?? "—"}%`
    );
    setField("gasless-bundler", payload.gasless?.bundler ?? "—");
    setField("gasless-paymaster", payload.gasless?.paymaster ?? "—");
    setField("hypergraph-state", payload.unstoppable?.hypergraph_state ?? "—");
    setField("mesh-quorum", String(payload.unstoppable?.multi_agent_mesh?.quorum ?? "—"));
    setField("mesh-protocol", payload.unstoppable?.multi_agent_mesh?.coordination_protocol ?? "—");
    setField(
      "mesh-sentinels",
      fmtList(payload.unstoppable?.multi_agent_mesh?.sentinel_agents ?? [])
    );
    setField("safety-oracle", payload.unstoppable?.safety_net?.antifragility_oracle ?? "—");
    setField(
      "halt-conditions",
      fmtList(payload.unstoppable?.safety_net?.halt_conditions ?? [])
    );

    populatePhaseTable(payload.phaseScores || []);
    populateConfirmations(payload.confirmations || []);
    const logs = Array.isArray(payload.logs) ? payload.logs.join("\n") : payload.logs;
    setField("run-logs", logs || "No logs available.");

    if (payload.timeline) {
      renderTimeline(payload.timeline);
    }

    setLink("summary", payload.links?.summary);
    setLink("report", payload.links?.report);
    setLink("dashboard", payload.links?.dashboard);
  } catch (error) {
    console.error("Unable to load dashboard data", error);
  }
}

window.addEventListener("DOMContentLoaded", loadDashboard);
