import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const DATA_PATH = "dashboard-data-v7.json";

function renderAlphaDomains(target, alpha) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Domain</th>
        <th>Signal</th>
        <th>Projection</th>
        <th>Drivers</th>
        <th>Horizon</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  alpha.domains.forEach((domain) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${domain.title}</td>
      <td>${(domain.signal_strength * 100).toFixed(1)}%</td>
      <td>$${(domain.alpha_projection / 1_000_000).toFixed(1)}M</td>
      <td>${domain.drivers.join(" · ")}</td>
      <td>${domain.execution_horizon}</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);

  const summary = document.createElement("p");
  summary.textContent = `Total projection $${(alpha.summary.total_projection / 1_000_000).toFixed(1)}M · Synergy ${(alpha.summary.synergy_index * 100).toFixed(1)}%`;
  target.appendChild(summary);
}

function renderOpportunityGraph(target, graph) {
  const list = document.createElement("ul");
  graph.nodes.forEach((node) => {
    const item = document.createElement("li");
    const alpha = node.alpha ? `$${(node.alpha / 1_000_000).toFixed(1)}M` : "n/a";
    item.innerHTML = `<strong>${node.label}</strong> — ${node.category} — Alpha ${alpha}`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const controls = document.createElement("div");
  controls.className = "owner-controls";
  graph.owner_controls.forEach((control) => {
    const pill = document.createElement("span");
    pill.textContent = control;
    controls.appendChild(pill);
  });
  target.appendChild(controls);
}

function renderGuardianMesh(target, mesh) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Sentinel</th>
        <th>Stake</th>
        <th>Status</th>
        <th>Capabilities</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  mesh.sentinels.forEach((sentinel) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${sentinel.id}</td>
      <td>${sentinel.stake.toLocaleString()} AGIALPHA</td>
      <td>${sentinel.status}</td>
      <td>${sentinel.capabilities.join(", ")}</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);

  const footer = document.createElement("p");
  footer.textContent = `Quorum ${mesh.coordination.quorum}/${mesh.sentinels.length} · Failover ${mesh.coordination.failover} · A2A ${mesh.coordination.a2a_bus}`;
  target.appendChild(footer);
}

function renderTreasury(target, executionRoutes) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Route</th>
        <th>Allocation</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  executionRoutes.routes.forEach((route) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${route.id}</td>
      <td>${route.allocation_percent}%</td>
      <td class="status-${route.status}">${route.status}</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);

  const switches = document.createElement("div");
  switches.className = "owner-controls";
  executionRoutes.owner_switches.forEach((item) => {
    const pill = document.createElement("span");
    pill.textContent = item;
    switches.appendChild(pill);
  });
  target.appendChild(switches);
}

function renderSimulations(target, simulations) {
  const list = document.createElement("ul");
  simulations.stress_tests.forEach((test) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${test.name}</span> — ${test.result} — owner action: ${test.owner_action}`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const meta = document.createElement("p");
  meta.innerHTML = `World model: ${simulations.world_model.version} (${simulations.world_model.scenarios} scenarios)`;
  target.appendChild(meta);
}

function renderTimeline(target, timeline) {
  const list = document.createElement("ul");
  timeline.events.forEach((event) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${event.time}</span> — ${event.event}`;
    list.appendChild(item);
  });
  target.appendChild(list);
}

function renderCI(target, ci) {
  const list = document.createElement("ul");
  ci.checks.forEach((check) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${check}</span>`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const summary = document.createElement("p");
  summary.innerHTML = `Status: <span class="badge status-${ci.status}">${ci.status.toUpperCase()}</span> · Response ${ci.response_minutes} minutes · Enforced on ${ci.enforced_on.join(", ")}`;
  target.appendChild(summary);
}

function renderSovereignty(target, surface) {
  const list = document.createElement("ul");
  list.innerHTML = `
    <li class="metric">Control surface ${(surface.score * 100).toFixed(1)}%</li>
    <li>Guardian quorum ${surface.guardian_quorum}/${surface.guardian_count}</li>
    <li>Failover guardians ${surface.failover_guardian_count}</li>
    <li>Emergency pause ${surface.emergency_pause ? "armed" : "disabled"}</li>
    <li>Circuit breaker ${surface.circuit_breaker_minutes} minutes</li>
    <li>Unstoppable reserve ${surface.unstoppable_reserve_percent.toFixed(1)}%</li>
    <li>Antifragility buffer ${surface.antifragility_buffer_percent.toFixed(1)}%</li>
    <li>Bundler ${surface.bundler}</li>
    <li>Paymaster ${surface.paymaster}</li>
    <li>Timelock ${surface.timelock}</li>
    <li>Multisig ${surface.multisig}</li>
    <li>Mutable parameters:</li>
  `;
  Object.entries(surface.mutable_parameters).forEach(([key, value]) => {
    const item = document.createElement("li");
    item.textContent = `• ${key.replace(/_/g, " ")}: ${value}`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const levers = document.createElement("div");
  levers.className = "owner-controls";
  surface.levers.forEach((lever) => {
    const pill = document.createElement("span");
    pill.textContent = lever;
    levers.appendChild(pill);
  });
  target.appendChild(levers);
}

function renderOwnerControls(target, controls) {
  target.innerHTML = "";
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

  renderOwnerControls(document.getElementById("owner-controls"), data.control_surface.levers);
  renderAlphaDomains(document.getElementById("alpha-domains"), data.alpha);
  renderOpportunityGraph(document.getElementById("opportunity-graph"), data.opportunity_graph);
  renderGuardianMesh(document.getElementById("guardian-mesh"), data.guardian_mesh);
  renderTreasury(document.getElementById("treasury"), data.execution_routes);
  renderSimulations(document.getElementById("simulations"), data.simulations);
  renderTimeline(document.getElementById("timeline"), data.timeline);
  renderCI(document.getElementById("ci-matrix"), data.ci);
  renderSovereignty(document.getElementById("owner-sovereignty"), data.control_surface);

  renderMermaid(document.getElementById("mermaid-flow"), data.mermaid.flow);
  renderMermaid(document.getElementById("mermaid-sequence"), data.mermaid.sequence);
  renderMermaid(document.getElementById("mermaid-gantt"), data.mermaid.gantt);
  renderMermaid(document.getElementById("mermaid-journey"), data.mermaid.journey);
  renderMermaid(document.getElementById("mermaid-state"), data.mermaid.state);

  document.getElementById("owner-score").textContent = `${(data.metrics.owner_empowerment * 100).toFixed(1)}%`;
  document.getElementById("antifragility").textContent = `${(data.metrics.antifragility_index * 100).toFixed(1)}%`;
  document.getElementById("control-surface").textContent = `${(data.metrics.control_surface_score * 100).toFixed(1)}%`;
  document.getElementById("unstoppable").textContent = `${(data.metrics.unstoppable_readiness * 100).toFixed(1)}%`;
  document.getElementById("automation").textContent = `${(data.metrics.automation_aperture * 100).toFixed(1)}%`;
}

bootstrap().catch((error) => {
  console.error("Failed to bootstrap Meta-Singularity console", error);
});
