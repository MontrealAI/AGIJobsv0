import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const DASHBOARD_ROOT = new URL(".", document.baseURI);
const DEMO_ROOT = new URL("../../", DASHBOARD_ROOT);

const SUMMARY_PATH_CANDIDATES = [
  "../latest_run_v2.json",
  "../storage/latest_run_v2.json",
];

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatGuardians(guardians) {
  if (!Array.isArray(guardians) || guardians.length === 0) {
    return "—";
  }
  return guardians.map((entry) => `<code>${entry}</code>`).join(" &bull; ");
}

function formatRisk(value) {
  if (value === undefined || value === null) {
    return "—";
  }
  return `${value}%`;
}

function stateClass(state) {
  switch (state) {
    case "completed":
      return "state-completed";
    case "failed":
      return "state-failed";
    case "running":
      return "state-running";
    default:
      return "";
  }
}

function renderPhases(phases) {
  const body = document.querySelector("[data-phase-table]");
  if (!body) return;
  body.innerHTML = "";
  phases.forEach((phase) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${phase.label}</td>
      <td class="${stateClass(phase.state)}">${phase.state}</td>
      <td>${formatPercent(phase.completion)}</td>
      <td>${phase.weight.toFixed(2)}</td>
      <td>${phase.metric}</td>
    `;
    body.appendChild(row);
  });
}

function renderConfirmations(confirmations) {
  const list = document.querySelector("[data-list=\"confirmations\"]");
  if (!list) return;
  list.innerHTML = "";
  if (!Array.isArray(confirmations) || confirmations.length === 0) {
    const item = document.createElement("li");
    item.textContent = "All confirmations cleared.";
    list.appendChild(item);
    return;
  }
  confirmations.forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = entry;
    list.appendChild(item);
  });
}

function renderLogs(logs) {
  const container = document.querySelector("[data-field=run-logs]");
  if (!container) return;
  const normalised = Array.isArray(logs) ? logs : [];
  container.textContent = normalised.join("\n") || "No logs captured.";
}

function renderTimeline(phaseScores) {
  const timeline = document.querySelector("[data-field=timeline]");
  if (!timeline) return;
  const lines = ["gantt", "  dateFormat  X", "  title Meta-Agentic α-AGI Jobs Demo V2 Execution"];
  phaseScores.forEach((phase, index) => {
    lines.push(`  section ${phase.label}`);
    const status = phase.state === "completed" ? "done" : phase.state === "failed" ? "crit" : "active";
    lines.push(`    ${phase.metric} :${status}, ${phase.phase}, ${index}, ${Math.max(1, Math.round(phase.weight))}`);
  });
  timeline.textContent = lines.join("\n");
  requestAnimationFrame(() => mermaid.run({ nodes: [timeline] }));
}

function setField(name, value) {
  const target = document.querySelector(`[data-field=${name}]`);
  if (!target) {
    return;
  }
  if (value === undefined || value === null || value === "") {
    target.textContent = "—";
    return;
  }
  target.innerHTML = value;
}

function linkArtefact(name, path) {
  const anchor = document.querySelector(`[data-link=${name}]`);
  if (!anchor) return;
  if (path) {
    anchor.href = path;
    anchor.classList.remove("disabled");
  } else {
    anchor.removeAttribute("href");
    anchor.classList.add("disabled");
  }
}

function resolveHref(path, fallback) {
  const candidate = path || fallback;
  if (!candidate) {
    return undefined;
  }

  if (
    candidate.startsWith("http://") ||
    candidate.startsWith("https://") ||
    candidate.startsWith("./") ||
    candidate.startsWith("../") ||
    candidate.startsWith("/")
  ) {
    return candidate;
  }

  try {
    return new URL(candidate, DEMO_ROOT).href;
  } catch (error) {
    console.warn("Unable to resolve href for", candidate, error);
    return candidate;
  }
}

async function fetchSummary() {
  for (const candidate of SUMMARY_PATH_CANDIDATES) {
    try {
      const response = await fetch(candidate, { cache: "no-store" });
      if (response.ok) {
        return response.json();
      }
    } catch (error) {
      console.warn("Unable to load", candidate, error);
    }
  }
  throw new Error("Unable to locate latest run payload. Make sure the demo has been executed.");
}

function renderSummary(summary) {
  setField("run-id", summary.runId);
  setField("run-state", summary.state);
  setField("alpha-readiness", formatPercent(summary.alphaReadiness));
  const narrative = summary.scenario?.narrative || "";
  setField("scenario-title", summary.scenario?.title || "Meta-Agentic α-AGI Jobs Demo V2");
  setField("scenario-narrative", narrative.replace(/\n+/g, "<br />"));
  setField("owner-address", summary.owner?.address ?? summary.owner);
  setField("owner-guardians", formatGuardians(summary.owner?.guardians));
  setField("owner-approvals", summary.owner?.approvals_required ?? summary.owner?.approvalsRequired ?? "—");
  setField("owner-pause", summary.owner?.emergency_pause ? "<span class=\"flag flag-success\">Enabled</span>" : "<span class=\"flag flag-muted\">Disabled</span>");
  setField("treasury-token", summary.treasury?.token ?? "AGIALPHA");
  setField("treasury-balance", summary.treasury?.initial_balance ?? "—");
  setField(
    "treasury-max-drawdown",
    formatRisk(summary.treasury?.risk_limits?.max_drawdown_percent ?? summary.treasury?.risk_limits?.maxDrawdownPercent)
  );
  setField(
    "treasury-var",
    formatRisk(summary.treasury?.risk_limits?.var_percent ?? summary.treasury?.risk_limits?.varPercent)
  );
  setField(
    "treasury-buffer",
    formatRisk(summary.treasury?.risk_limits?.antifragility_buffer_percent ?? summary.treasury?.risk_limits?.antifragilityBufferPercent)
  );
  setField("gasless-paymaster", summary.gasless?.paymaster ?? "—");
  renderPhases(summary.phaseScores || []);
  renderTimeline(summary.phaseScores || []);
  renderConfirmations(summary.confirmations || []);
  renderLogs(summary.logs || []);
  linkArtefact("summary", resolveHref(summary.__sourceSummaryPath, "../latest_run_v2.json"));
  linkArtefact(
    "report",
    resolveHref(summary.__masterplanPath, "../meta_agentic_alpha_v2/reports/generated/alpha_masterplan_run.md"),
  );
  linkArtefact("dashboard", resolveHref(summary.__dashboardPath, "../storage/ui/index.html"));
}

async function bootstrap() {
  mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
  try {
    const summary = await fetchSummary();
    renderSummary(summary);
  } catch (error) {
    console.error(error);
    setField("run-state", "No run detected");
    renderLogs([String(error)]);
  }
}

bootstrap();
