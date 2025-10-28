import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const DATA_PATH = "dashboard-data-v5.json";

function createList(items, className = "list-grid") {
  const list = document.createElement("ul");
  list.className = className;
  items.forEach((item) => {
    const entry = document.createElement("li");
    if (typeof item === "string") {
      entry.textContent = item;
    } else {
      entry.innerHTML = `<strong>${item.title ?? item.id}</strong><br /><span>${item.detail ?? ""}</span>`;
    }
    list.appendChild(entry);
  });
  return list;
}

function renderAlphaDomains(target, data) {
  const list = document.createElement("div");
  list.className = "list-grid";
  data.domains.forEach((domain) => {
    const container = document.createElement("div");
    container.className = "metric-card";
    container.innerHTML = `
      <strong>${domain.title}</strong>
      <span class="badge">Signal ${(domain.signal_strength * 100).toFixed(1)}%</span>
      <span>Alpha projection: $${(domain.alpha_projection / 1_000_000).toFixed(1)}M</span>
      <em>${domain.insights.join(" · ")}</em>
    `;
    const actions = createList(domain.owner_actions.map((action) => `Owner: ${action}`));
    container.appendChild(actions);
    list.appendChild(container);
  });
  target.appendChild(list);
}

function renderGuardianMesh(target, mesh) {
  const list = document.createElement("div");
  list.className = "list-grid";
  mesh.sentinels.forEach((sentinel) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <strong>${sentinel.id}</strong>
      <span class="badge">Stake ${sentinel.stake.toLocaleString()} AGIALPHA</span>
      <span>Status: ${sentinel.status}</span>
      <em>${sentinel.capabilities.join(", ")}</em>
    `;
    list.appendChild(card);
  });
  const footer = document.createElement("p");
  footer.textContent = `Quorum ${mesh.coordination.quorum}/${mesh.sentinels.length} · latency ${mesh.coordination.latency_ms}ms · owner override ${mesh.coordination.owner_override ? "enabled" : "disabled"}`;
  target.appendChild(list);
  target.appendChild(footer);
}

function renderTreasury(target, controls, risk, metrics) {
  const wrapper = document.createElement("div");
  wrapper.className = "metric-card";
  wrapper.innerHTML = `
    <strong>Liquidity Routes</strong>
    <span class="badge">Pause switch ${controls.treasury.pause_switch ? "armed" : "off"}</span>
    <span>Owner editable: ${controls.treasury.owner_editable ? "yes" : "no"}</span>
    <span>Antifragility buffer: ${(risk.antifragility_buffer_percent).toFixed(1)}%</span>
    <span>Expected ROI: ${(metrics.expected_roi * 100).toFixed(1)}%</span>
    <span>Alpha confidence: ${(metrics.alpha_confidence * 100).toFixed(1)}%</span>
    <span>Treasury at risk: ${(metrics.treasury_at_risk * 100).toFixed(1)}%</span>
  `;
  const routes = createList(
    controls.treasury.liquidity_routes.map((route) => ({
      title: route.id,
      detail: `${route.description} — max ${(route.max_allocation_percent).toFixed(0)}%`
    }))
  );
  wrapper.appendChild(routes);
  target.appendChild(wrapper);
}

function renderTimeline(target, timeline) {
  const container = document.createElement("div");
  container.className = "timeline";
  timeline.events.forEach((event) => {
    const entry = document.createElement("div");
    entry.className = "timeline-entry";
    entry.innerHTML = `<strong>${event.time}</strong><br />${event.event}`;
    container.appendChild(entry);
  });
  target.appendChild(container);
}

function renderSovereignty(target, surface) {
  const card = document.createElement("div");
  card.className = "metric-card";
  card.innerHTML = `
    <strong>Command Authority</strong>
    <span class="badge">Control surface ${(surface.score * 100).toFixed(1)}%</span>
    <span>Guardian quorum: ${surface.guardian_quorum}/${surface.guardian_count}</span>
    <span>Emergency pause: ${surface.emergency_pause ? "armed" : "disabled"}</span>
    <span>Circuit breaker: ${surface.circuit_breaker_minutes} minutes</span>
    <span>Unstoppable reserve: ${surface.unstoppable_reserve_percent.toFixed(1)}%</span>
    <span>Bundler: ${surface.bundler}</span>
    <span>Paymaster: ${surface.paymaster}</span>
    <span>Session keys: ${surface.session_keys.join(", ")}</span>
  `;
  const levers = createList(surface.levers, "list-grid");
  card.appendChild(levers);
  target.appendChild(card);
}

function renderOwnerControls(target, controls) {
  controls.forEach((control) => {
    const pill = document.createElement("span");
    pill.textContent = control;
    target.appendChild(pill);
  });
}

function renderMermaid(target, definition) {
  target.textContent = definition;
  mermaid.initialize({ startOnLoad: false, theme: "dark" });
  mermaid.run({ nodes: [target] });
}

async function bootstrap() {
  const response = await fetch(DATA_PATH);
  const data = await response.json();

  renderOwnerControls(document.getElementById("owner-controls"), data.owner_controls);
  renderAlphaDomains(document.getElementById("alpha-domains"), data.alpha);
  renderGuardianMesh(document.getElementById("guardian-mesh"), data.guardian_mesh);
  renderTreasury(
    document.getElementById("treasury"),
    data.governance.controls,
    data.governance.risk_policies,
    data.timeline
  );
  renderTimeline(document.getElementById("timeline"), data.timeline);
  renderSovereignty(document.getElementById("owner-sovereignty"), data.control_surface);
  renderMermaid(document.getElementById("mermaid-flow"), data.mermaid.flow);
  renderMermaid(document.getElementById("mermaid-sequence"), data.mermaid.sequence);

  document.getElementById("owner-score").textContent = `${(data.metrics.owner_empowerment * 100).toFixed(1)}%`;
  document.getElementById("antifragility").textContent = `${(data.metrics.antifragility_index * 100).toFixed(1)}%`;
  document.getElementById("control-surface").textContent = `${(data.metrics.control_surface_score * 100).toFixed(1)}%`;
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap dashboard", error);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="error">Unable to load dashboard-data-v5.json. Re-run meta_agentic_demo_v5.py and refresh.</div>`
  );
});
