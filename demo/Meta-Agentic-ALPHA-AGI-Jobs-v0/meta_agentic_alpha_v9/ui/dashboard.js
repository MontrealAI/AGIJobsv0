import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const DATA_PATH = "dashboard-data-v9.json";

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderAlphaDomains(target, alpha) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Domain</th>
        <th>Probability</th>
        <th>Confidence</th>
        <th>Delta</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  alpha.domains.forEach((domain) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${domain.name}</td>
      <td>${percent(domain.probability)}</td>
      <td>${percent(domain.confidence)}</td>
      <td>${percent(domain.delta)}</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);

  const list = document.createElement("ul");
  alpha.anomalies.forEach((anomaly) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${anomaly.id}</span> — ${anomaly.description} (impact ${percent(anomaly.impact_score)})`;
    list.appendChild(item);
  });
  target.appendChild(list);
}

function renderOpportunityGraph(target, graph) {
  const list = document.createElement("ul");
  graph.nodes.forEach((node) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${node.label}</strong> — value ${percent(node.value)} · links ${node.connections.join(", ")}`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const insights = document.createElement("ol");
  graph.insights.forEach((insight) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${insight.score.toFixed(2)}</span> — ${insight.description}`;
    insights.appendChild(item);
  });
  target.appendChild(insights);
}

function renderGuardianMesh(target, mesh) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Guardian</th>
        <th>Role</th>
        <th>Weight</th>
        <th>Capabilities</th>
        <th>Latency</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  mesh.guardians.forEach((guardian) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${guardian.address}</td>
      <td>${guardian.role}</td>
      <td>${(guardian.weight * 100).toFixed(1)}%</td>
      <td>${guardian.capabilities.join(", ")}</td>
      <td>${guardian.latency_ms} ms</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);

  const failoverList = document.createElement("ul");
  mesh.failover.forEach((guardian) => {
    const item = document.createElement("li");
    item.textContent = `${guardian.address} — ${guardian.capabilities.join(", ")} (activation ${guardian.activation_ms} ms)`;
    failoverList.appendChild(item);
  });
  target.appendChild(failoverList);

  const summary = document.createElement("p");
  summary.innerHTML = `Quorum ${mesh.quorum.required}/${mesh.quorum.total} · Response ${mesh.quorum.response_ms} ms`;
  target.appendChild(summary);
}

function renderTreasuryStreams(target, streams) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Stream</th>
        <th>Cadence</th>
        <th>Route</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  streams.streams.forEach((stream) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${stream.name}</td>
      <td>${stream.cadence}</td>
      <td>${stream.route}</td>
      <td>${Number(stream.amount).toLocaleString()} AGIALPHA</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);
}

function renderAutopilot(target, autopilot) {
  const list = document.createElement("ul");
  autopilot.modes.forEach((mode) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${mode.title}</span> — ${mode.description} (${mode.status})`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const safety = document.createElement("p");
  safety.textContent = `Safety envelope: ${autopilot.safety.session_keys} session keys · Max spend ${Number(
    autopilot.safety.max_spend
  ).toLocaleString()} · Circuit breaker ${autopilot.safety.circuit_breaker_minutes} minutes`;
  target.appendChild(safety);
}

function renderMissionThreads(target, missions) {
  const list = document.createElement("ul");
  missions.threads.forEach((thread) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${thread.id}</span> — ${thread.title} (${thread.status})`;
    list.appendChild(item);
  });
  target.appendChild(list);
}

function renderSimulations(target, simulations) {
  const details = document.createElement("p");
  details.innerHTML = `World model <strong>${simulations.world_model.name}</strong> · Autonomy layers: ${simulations.world_model.autonomy_layers.join(
    ", "
  )}`;
  target.appendChild(details);

  const risk = document.createElement("ul");
  Object.entries(simulations.risk_controls).forEach(([key, value]) => {
    const item = document.createElement("li");
    item.textContent = `${key.replace(/_/g, " ")}: ${value}`;
    risk.appendChild(item);
  });
  target.appendChild(risk);
}

function renderCI(target, ci) {
  const list = document.createElement("ul");
  ci.checks.forEach((check) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${check.name}</span> — ${check.status}`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const summary = document.createElement("p");
  summary.innerHTML = `Status <span class="badge status-${ci.status}">${ci.status.toUpperCase()}</span> · Response ${ci.response_minutes} minutes`;
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
    <li>Unstoppable threshold ${(surface.unstoppable_threshold * 100).toFixed(1)}%</li>
    <li>Bundler ${surface.bundler}</li>
    <li>Paymaster ${surface.paymaster}</li>
    <li>Timelock ${surface.timelock}</li>
    <li>Multisig ${surface.multisig}</li>
  `;
  target.appendChild(list);

  const scripts = document.createElement("p");
  scripts.innerHTML = `<strong>Control scripts:</strong> ${Object.entries(surface.control_scripts)
    .map(([name, path]) => `${name} → ${path}`)
    .join(" · ")}`;
  target.appendChild(scripts);

  const parameters = document.createElement("ul");
  Object.entries(surface.mutable_parameters).forEach(([key, value]) => {
    const item = document.createElement("li");
    item.textContent = `${key.replace(/_/g, " ")}: ${value}`;
    parameters.appendChild(item);
  });
  target.appendChild(parameters);
}

function renderOwnerLevers(target, controlSurface, commandMatrix) {
  const pills = [
    ...controlSurface.levers,
    ...commandMatrix.mission_threads,
    ...commandMatrix.unstoppable_initiatives,
    ...commandMatrix.telemetry_channels
  ];
  pills.forEach((lever) => {
    const pill = document.createElement("span");
    pill.textContent = lever;
    target.appendChild(pill);
  });
}

function renderMetrics(metrics) {
  const container = document.getElementById("metric-summary");
  container.innerHTML = `
    <div class="metric-card">Owner Empowerment <strong>${percent(metrics.owner_empowerment)}</strong></div>
    <div class="metric-card">Sovereignty Index <strong>${percent(metrics.sovereignty_index)}</strong></div>
    <div class="metric-card">Unstoppable Readiness <strong>${percent(metrics.unstoppable_readiness)}</strong></div>
    <div class="metric-card">Autopilot Mastery <strong>${percent(metrics.autopilot_mastery)}</strong></div>
    <div class="metric-card">Meta-CI Health <strong>${percent(metrics.meta_ci_health)}</strong></div>
    <div class="metric-card">Capital Flywheel <strong>${percent(metrics.capital_flywheel_index)}</strong></div>
  `;

  document.getElementById("owner-score").textContent = percent(metrics.owner_empowerment);
  document.getElementById("sovereignty-index").textContent = percent(metrics.sovereignty_index);
  document.getElementById("unstoppable").textContent = percent(metrics.unstoppable_readiness);
  document.getElementById("autopilot-mastery").textContent = percent(metrics.autopilot_mastery);
  document.getElementById("meta-ci").textContent = percent(metrics.meta_ci_health);
  document.getElementById("capital-flywheel").textContent = percent(metrics.capital_flywheel_index);
}

function renderMermaid(elementId, definition) {
  const container = document.getElementById(elementId);
  if (!definition) {
    container.textContent = "No diagram";
    return;
  }
  mermaid.renderAsync(`${elementId}-${Date.now()}`, definition).then(({ svg }) => {
    container.innerHTML = svg;
  });
}

async function bootstrap() {
  const response = await fetch(DATA_PATH);
  const data = await response.json();

  renderMetrics(data.metrics);
  renderOwnerLevers(document.getElementById("owner-levers"), data.control_surface, data.command_matrix);
  renderAlphaDomains(document.getElementById("alpha-domains"), data.alpha);
  renderOpportunityGraph(document.getElementById("opportunity-graph"), data.opportunity_graph);
  renderGuardianMesh(document.getElementById("guardian-mesh"), data.guardian_mesh);
  renderTreasuryStreams(document.getElementById("treasury-streams"), data.treasury_streams);
  renderAutopilot(document.getElementById("autopilot"), data.autopilot);
  renderMissionThreads(document.getElementById("mission-threads"), data.mission_threads);
  renderSimulations(document.getElementById("simulations"), data.simulations);
  renderCI(document.getElementById("ci-matrix"), data.ci_v2);
  renderSovereignty(document.getElementById("sovereignty-surface"), data.control_surface);

  renderMermaid("mermaid-flow", data.mermaid.flow_v9 || data.mermaid.flow);
  renderMermaid("mermaid-radar", data.mermaid.radar);
  renderMermaid("mermaid-sequence", data.mermaid.sequence_v9 || data.mermaid.sequence);
  renderMermaid("mermaid-gantt", data.mermaid.gantt_v9 || data.mermaid.gantt);
  renderMermaid("mermaid-journey", data.mermaid.journey_v9 || data.mermaid.journey);
  renderMermaid("mermaid-state", data.mermaid.state_v9 || data.mermaid.state);
  renderMermaid("mermaid-quadrant", data.mermaid.quadrant_v9 || data.mermaid.quadrant);
}

document.addEventListener("DOMContentLoaded", bootstrap);
