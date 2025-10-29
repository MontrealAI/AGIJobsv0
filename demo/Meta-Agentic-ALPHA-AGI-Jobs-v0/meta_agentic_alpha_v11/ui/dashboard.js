import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const DATA_PATH = "dashboard-data-v11.json";

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function renderStreams(target, identify) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Stream</th>
        <th>Domain</th>
        <th>Signal</th>
        <th>Confidence</th>
        <th>Refresh</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  identify.streams.forEach((stream) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${stream.id}</td>
      <td>${stream.domain}</td>
      <td>${percent(stream.alpha_signal)}</td>
      <td>${percent(stream.confidence)}</td>
      <td>${stream.refresh_minutes} min</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);

  if (identify.anomalies?.length) {
    const list = document.createElement("ul");
    identify.anomalies.forEach((anomaly) => {
      const item = document.createElement("li");
      item.innerHTML = `<span class="metric">${anomaly.id}</span> — ${anomaly.description} (impact ${percent(
        anomaly.impact_score
      )})`;
      list.appendChild(item);
    });
    target.appendChild(list);
  }
}

function renderIdentifyDetectors(target, identify) {
  const detectors = document.createElement("div");
  detectors.classList.add("details");
  detectors.innerHTML = `<strong>Detectors:</strong> ${identify.detectors.join(" · ")}`;
  target.appendChild(detectors);

  const watchers = document.createElement("div");
  watchers.innerHTML = `<strong>Watchers:</strong> ${identify.watchers.join(" · ")}`;
  target.appendChild(watchers);
}

function renderKnowledge(target, knowledge) {
  const list = document.createElement("ul");
  knowledge.nodes.forEach((node) => {
    const item = document.createElement("li");
    item.innerHTML = `<span class="metric">${node.label}</span> — ${node.category} · signal ${percent(
      node.signal
    )} · confidence ${percent(node.confidence)}`;
    list.appendChild(item);
  });
  target.appendChild(list);

  const retention = document.createElement("p");
  retention.innerHTML = `<strong>Retention:</strong> ${knowledge.retention.join(" · ")}`;
  target.appendChild(retention);
}

function renderList(target, items, formatter = (item) => item) {
  const list = document.createElement("ul");
  items.forEach((item) => {
    const element = document.createElement("li");
    element.innerHTML = formatter(item);
    list.appendChild(element);
  });
  target.appendChild(list);
}

function renderDesign(target, design) {
  renderList(target, design.studios, (studio) => `<span class="metric">${studio}</span>`);
  const prototypes = document.createElement("ul");
  design.prototypes.forEach((prototype) => {
    const element = document.createElement("li");
    element.innerHTML = `<strong>${prototype.name}</strong> — ${prototype.description} (${prototype.status})`;
    prototypes.appendChild(element);
  });
  target.appendChild(prototypes);
}

function renderExecute(target, execute) {
  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>Action</th>
        <th>Endpoint</th>
        <th>Dry-run</th>
        <th>Guarded</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const body = table.querySelector("tbody");
  execute.mesh.forEach((entry) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${entry.action}</td>
      <td><code>${entry.endpoint}</code></td>
      <td>${entry.dry_run ? "yes" : "no"}</td>
      <td>${entry.guarded ? "yes" : "no"}</td>
    `;
    body.appendChild(row);
  });
  target.appendChild(table);

  const safeguards = document.createElement("div");
  safeguards.classList.add("details");
  safeguards.innerHTML = `<strong>Safeguards:</strong> ${execute.safeguards.join(" · ")}`;
  target.appendChild(safeguards);

  const dryrun = document.createElement("div");
  dryrun.innerHTML = `<strong>Dry-run toolchain:</strong> ${execute.dry_run_tools.join(" · ")}`;
  target.appendChild(dryrun);
}

function renderTooling(target, tooling) {
  renderList(target, tooling.external_tools, (tool) => `<span class="metric">${tool}</span>`);
  const datasets = document.createElement("p");
  datasets.innerHTML = `<strong>Dataset channels:</strong> ${tooling.dataset_channels.join(" · ")}`;
  target.appendChild(datasets);
}

function renderCI(target, ci) {
  const list = document.createElement("ul");
  ci.checks.forEach((check) => {
    const element = document.createElement("li");
    element.innerHTML = `<span class="metric">${check}</span>`;
    list.appendChild(element);
  });
  target.appendChild(list);
  const summary = document.createElement("p");
  summary.innerHTML = `Status <span class="badge status-${ci.status}">${ci.status.toUpperCase()}</span> · Gatekeepers ${ci.gatekeepers.join(
    " · "
  )} · Response ${ci.response_minutes} min`;
  target.appendChild(summary);
}

function renderControlSurface(target, surface) {
  const list = document.createElement("ul");
  list.innerHTML = `
    <li>Guardians ${surface.guardian_quorum}/${surface.guardian_count} · Failover ${surface.failover_guardian_count}</li>
    <li>Unstoppable threshold ${percent(surface.unstoppable_threshold)}</li>
    <li>Emergency pause ${surface.emergency_pause ? "armed" : "inactive"}</li>
    <li>Circuit breaker ${surface.circuit_breaker_minutes} minutes</li>
    <li>Unstoppable reserve ${surface.unstoppable_reserve_percent.toFixed(1)}%</li>
    <li>Antifragility buffer ${surface.antifragility_buffer_percent.toFixed(1)}%</li>
  `;
  target.appendChild(list);

  const telemetry = document.createElement("p");
  telemetry.innerHTML = `<strong>Telemetry:</strong> ${surface.telemetry_channels.join(" · ")}`;
  target.appendChild(telemetry);

  const autopilot = document.createElement("p");
  autopilot.innerHTML = `<strong>Autopilot modes:</strong> ${Object.entries(surface.autopilot_modes)
    .map(([key, value]) => `<code>${key}</code> ${value}`)
    .join(" · ")}`;
  target.appendChild(autopilot);

  const controls = document.createElement("p");
  controls.innerHTML = `<strong>Gasless controls:</strong> ${Object.entries(surface.gasless_controls)
    .map(([key, value]) => `<code>${key}</code> → ${value}`)
    .join(" · ")}`;
  target.appendChild(controls);

  const actions = document.createElement("p");
  actions.innerHTML = `<strong>Owner actions:</strong> ${surface.owner_actions.join(" · ")}`;
  target.appendChild(actions);
}

function renderMetrics(target, metrics) {
  target.innerHTML = "";
  Object.entries(metrics).forEach(([key, value]) => {
    if (typeof value !== "number") {
      return;
    }
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `<div>${key.replace(/_/g, " ")}</div><strong>${percent(value)}</strong>`;
    target.appendChild(card);
  });
}

function renderOwnerControls(target, surface) {
  target.innerHTML = "";
  const entries = [
    [`Mission threads`, surface.mission_threads.join(" · ")],
    [`Supremacy vectors`, surface.supremacy_vectors.join(" · ")],
    [`Sovereign domains`, surface.sovereign_domains.join(" · ")],
    [`Upgrade scripts`, Object.entries(surface.upgrade_scripts)
      .map(([key, value]) => `<code>${key}</code> → ${value}`)
      .join(" · ")],
    [`Mutable parameters`, Object.entries(surface.mutable_parameters)
      .map(([key, value]) => `<code>${key}</code> → ${value}`)
      .join(" · ")],
  ];
  entries.forEach(([label, value]) => {
    const span = document.createElement("span");
    span.innerHTML = `<strong>${label}:</strong> ${value}`;
    target.appendChild(span);
  });
}

function renderMermaid(id, diagram) {
  const element = document.getElementById(id);
  if (!diagram) {
    element.textContent = "Diagram unavailable";
    return;
  }
  mermaid
    .render(`${id}-diagram`, diagram)
    .then((res) => {
      element.innerHTML = res.svg;
    })
    .catch((error) => {
      element.textContent = `Mermaid render error: ${error.message}`;
    });
}

async function bootstrap() {
  const response = await fetch(DATA_PATH);
  const data = await response.json();

  renderMetrics(document.getElementById("metric-summary"), data.metrics);
  renderOwnerControls(document.getElementById("owner-levers"), data.control_surface);

  renderStreams(document.getElementById("identify-streams"), data.identify);
  renderIdentifyDetectors(document.getElementById("identify-detectors"), data.identify);
  renderKnowledge(document.getElementById("knowledge-graph"), data.knowledge_base);
  renderList(
    document.getElementById("learn-forge"),
    [
      `<strong>Curricula:</strong> ${data.learn.curricula.join(" · ")}`,
      `<strong>Simulation channels:</strong> ${data.learn.simulation_channels.join(" · ")}`,
      `<strong>World models:</strong> ${data.learn.world_models.join(" · ")}`,
    ],
    (item) => item
  );
  renderList(
    document.getElementById("think-protocols"),
    [
      `<strong>Protocols:</strong> ${data.think.protocols.join(" · ")}`,
      `<strong>Heuristics:</strong> ${data.think.heuristics.join(" · ")}`,
      `<strong>Meta agents:</strong> ${data.think.meta_agents.join(" · ")}`,
    ],
    (item) => item
  );
  renderDesign(document.getElementById("design-studios"), data.design);
  renderList(
    document.getElementById("strategise-programs"),
    [
      `<strong>Programs:</strong> ${data.strategise.programs.join(" · ")}`,
      `<strong>Governance hooks:</strong> ${data.strategise.governance_hooks.join(" · ")}`,
      `<strong>Antifragility loops:</strong> ${data.strategise.antifragility_loops.join(" · ")}`,
    ],
    (item) => item
  );
  renderExecute(document.getElementById("execute-mesh"), data.execute);
  renderTooling(document.getElementById("tooling"), data.tooling);
  renderCI(document.getElementById("ci-grid"), data.ci_v2);
  renderControlSurface(document.getElementById("control-surface"), data.control_surface);

  renderMermaid("mermaid-flow", data.mermaid.flow);
  renderMermaid("mermaid-radar", data.mermaid.radar);
  renderMermaid("mermaid-knowledge", data.mermaid.knowledge);
  renderMermaid("mermaid-sequence", data.mermaid.sequence);
  renderMermaid("mermaid-gantt", data.mermaid.gantt);
  renderMermaid("mermaid-journey", data.mermaid.journey);
  renderMermaid("mermaid-state", data.mermaid.state);
  renderMermaid("mermaid-quadrant", data.mermaid.quadrant);

  document.getElementById("owner-score").textContent = percent(data.metrics.owner_empowerment);
  document.getElementById("supremacy-index").textContent = percent(data.metrics.supremacy_index);
  document.getElementById("unstoppable").textContent = percent(data.metrics.unstoppable_readiness);
  document.getElementById("alpha-strength").textContent = percent(data.metrics.alpha_signal_strength);
  document.getElementById("meta-ci").textContent = percent(data.metrics.meta_ci_health);
  document.getElementById("capital-flywheel").textContent = percent(data.metrics.capital_flywheel_index);
  document.getElementById("expansion-thrust").textContent = percent(data.metrics.expansion_thrust);
}

bootstrap().catch((error) => {
  document.body.innerHTML = `<main class="layout"><p>Failed to load dashboard: ${error.message}</p></main>`;
});
