import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

const DATA_PATH = "dashboard-data-v10.json";

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function createList(items, formatter) {
  const list = document.createElement("ul");
  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = formatter(item);
    list.appendChild(li);
  });
  return list;
}

function renderAlphaDomains(target, alpha) {
  if (!alpha.domains?.length) {
    target.textContent = "Run the demo to populate live alpha domains.";
    return;
  }
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

  if (alpha.anomalies?.length) {
    target.appendChild(
      createList(alpha.anomalies, (anomaly) => `
        <span class="metric">${anomaly.id}</span> — ${anomaly.description} (impact ${percent(anomaly.impact_score)})`)
    );
  }
}

function renderOpportunityGraph(target, graph) {
  if (!graph.nodes?.length) {
    target.textContent = "Run the demo to regenerate the opportunity graph.";
    return;
  }
  target.appendChild(
    createList(graph.nodes, (node) => `
      <strong>${node.label}</strong> — value ${percent(node.value)} · links ${node.connections?.join(", ") ?? "N/A"}`)
  );
  if (graph.insights?.length) {
    const list = document.createElement("ol");
    graph.insights.forEach((insight) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="metric">${insight.score.toFixed(3)}</span> — ${insight.description}`;
      list.appendChild(li);
    });
    target.appendChild(list);
  }
}

function renderGuardianMesh(target, mesh) {
  if (!mesh.guardians?.length) {
    target.textContent = "Run the demo to load guardian telemetry.";
    return;
  }
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
  target.appendChild(
    createList(mesh.failover ?? [], (guardian) => `
      ${guardian.address} — ${guardian.capabilities.join(", ")} (activation ${guardian.activation_ms} ms)`)
  );
  const summary = document.createElement("p");
  summary.innerHTML = `Quorum ${mesh.quorum.required}/${mesh.quorum.total} · Response ${mesh.quorum.response_ms} ms · Heartbeat ${
    mesh.heartbeat_seconds || 0
  } seconds`;
  target.appendChild(summary);
}

function renderTreasuryStreams(target, streams) {
  if (!streams.streams?.length) {
    target.textContent = "Run the demo to load treasury streams.";
    return;
  }
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
  if (!autopilot.modes?.length) {
    target.textContent = "Run the demo to populate autopilot modes.";
    return;
  }
  target.appendChild(
    createList(autopilot.modes, (mode) => `
      <span class="metric">${mode.title}</span> — ${mode.description} (${mode.status})`)
  );
  const safety = document.createElement("p");
  safety.textContent = `Safety envelope: ${autopilot.safety.session_keys} session keys · Max spend ${Number(
    autopilot.safety.max_spend
  ).toLocaleString()} · Circuit breaker ${autopilot.safety.circuit_breaker_minutes} minutes`;
  target.appendChild(safety);
}

function renderMissionThreads(target, missions) {
  if (!missions.threads?.length) {
    target.textContent = "Run the demo to unlock mission threads.";
    return;
  }
  target.appendChild(
    createList(missions.threads, (thread) => `
      <span class="metric">${thread.id}</span> — ${thread.title}${thread.status ? ` (${thread.status})` : ""}`)
  );
}

function renderSimulations(target, simulations) {
  if (!simulations.world_model) {
    target.textContent = "Run the demo to view simulation envelope.";
    return;
  }
  const details = document.createElement("p");
  details.innerHTML = `World model <strong>${simulations.world_model.name}</strong> · Autonomy layers: ${
    simulations.world_model.autonomy_layers.join(", ")
  }`;
  target.appendChild(details);
  target.appendChild(
    createList(Object.entries(simulations.risk_controls ?? {}), ([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
  );
}

function renderCI(target, ci) {
  if (!ci.checks?.length) {
    target.textContent = "Run the demo to validate CI grid.";
    return;
  }
  target.appendChild(
    createList(ci.checks, (check) => `<span class="metric">${check.name}</span> — ${check.status}`)
  );
  const summary = document.createElement("p");
  summary.innerHTML = `Status <span class="badge status-${ci.status}">${ci.status.toUpperCase()}</span> · Response ${
    ci.response_minutes
  } minutes`;
  target.appendChild(summary);
}

function renderHyperstructure(target, hyperstructure) {
  target.appendChild(
    createList(hyperstructure.vectors ?? [], (vector) => `<span class="metric">${vector}</span>`)
  );
  if (hyperstructure.owner_switches?.length) {
    const title = document.createElement("p");
    title.textContent = "Owner override switches:";
    target.appendChild(title);
    target.appendChild(createList(hyperstructure.owner_switches, (item) => item));
  }
}

function renderMarketSentinels(target, sentinels) {
  target.appendChild(
    createList(sentinels.signals ?? [], (signal) => `
      <span class="metric">${signal.name}</span> — uptime ${(signal.uptime * 100).toFixed(2)}%`)
  );
  if (sentinels.sentinel_clusters?.length) {
    const clusters = document.createElement("p");
    clusters.textContent = `Clusters: ${sentinels.sentinel_clusters.join(", ")}`;
    target.appendChild(clusters);
  }
}

function renderSovereignty(target, surface) {
  if (!surface) {
    target.textContent = "Run the demo to materialise the control surface.";
    return;
  }
  const entries = [
    `<span class="metric">Control surface ${(surface.score ? surface.score * 100 : 100).toFixed(1)}%</span>`,
    `Guardian quorum ${surface.guardian_quorum}/${surface.guardian_count}`,
    `Failover guardians ${surface.failover_guardian_count}`,
    `Emergency pause ${surface.emergency_pause ? "armed" : "disabled"}`,
    `Circuit breaker ${surface.circuit_breaker_minutes ?? 0} minutes`,
    `Unstoppable reserve ${surface.unstoppable_reserve_percent?.toFixed?.(1) ?? "N/A"}%`,
    `Antifragility buffer ${surface.antifragility_buffer_percent?.toFixed?.(1) ?? "N/A"}%`,
    `Unstoppable threshold ${(surface.unstoppable_threshold * 100).toFixed(1)}%`,
    `Bundler ${surface.bundler}`,
    `Paymaster ${surface.paymaster}`,
    `Timelock ${surface.timelock}`,
    `Multisig ${surface.multisig}`,
    `Supercluster integrations: ${(surface.supercluster_integrations ?? []).join(", ")}`,
    `Owner decisions: ${(surface.owner_decisions ?? []).join(", ")}`,
    `Command protocols: ${(surface.command_protocols ?? []).join(", ")}`
  ];
  target.appendChild(createList(entries, (value) => value));
}

function renderMermaid(id, definition) {
  if (!definition) return;
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = definition;
  mermaid.run({ nodes: [element] });
}

function renderMetrics(data) {
  const metrics = data.metrics;
  const summary = document.getElementById("metric-summary");
  const fields = [
    { label: "Owner Empowerment", value: percent(metrics.owner_empowerment) },
    { label: "Sovereignty Index", value: percent(metrics.sovereignty_index) },
    { label: "Unstoppable Readiness", value: percent(metrics.unstoppable_readiness) },
    { label: "Autopilot Mastery", value: percent(metrics.autopilot_mastery) },
    { label: "Meta-CI Health", value: percent(metrics.meta_ci_health) },
    { label: "Capital Flywheel", value: percent(metrics.capital_flywheel_index) },
    { label: "Guardian Resilience", value: percent(metrics.guardian_resilience) },
    { label: "Superintelligence Yield", value: percent(metrics.superintelligence_yield) },
    { label: "Alpha Conversion", value: percent(metrics.alpha_conversion) }
  ];
  fields.forEach(({ label, value }) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
    summary.appendChild(card);
  });
  document.getElementById("owner-score").textContent = percent(metrics.owner_empowerment);
  document.getElementById("sovereignty-index").textContent = percent(metrics.sovereignty_index);
  document.getElementById("unstoppable").textContent = percent(metrics.unstoppable_readiness);
  document.getElementById("autopilot-mastery").textContent = percent(metrics.autopilot_mastery);
  document.getElementById("meta-ci").textContent = percent(metrics.meta_ci_health);
  document.getElementById("capital-flywheel").textContent = percent(metrics.capital_flywheel_index);
  document.getElementById("superintelligence").textContent = percent(metrics.superintelligence_yield);
}

function renderOwnerLevers(target, surface) {
  const levers = [
    ...surface.hyperstructure_vectors ?? [],
    ...surface.market_sentinels ?? [],
    ...surface.onchain_controls ?? [],
    ...surface.portfolio_modes ?? [],
    ...surface.simulation_envelopes ?? [],
    ...surface.owner_decisions ?? [],
    ...surface.ci_controls ?? [],
    ...surface.treasury_routes ?? []
  ];
  target.appendChild(createList(levers, (lever) => lever));
}

async function bootstrap() {
  const response = await fetch(DATA_PATH);
  const data = await response.json();

  renderMetrics(data);
  renderOwnerLevers(document.getElementById("owner-levers"), data.control_surface ?? {});
  renderAlphaDomains(document.getElementById("alpha-domains"), data.alpha ?? {});
  renderOpportunityGraph(document.getElementById("opportunity-graph"), data.opportunity_graph ?? {});
  renderGuardianMesh(document.getElementById("guardian-mesh"), data.guardian_mesh ?? {});
  renderTreasuryStreams(document.getElementById("treasury-streams"), data.treasury_streams ?? {});
  renderAutopilot(document.getElementById("autopilot"), data.autopilot ?? {});
  renderMissionThreads(document.getElementById("mission-threads"), data.missions ?? {});
  renderSimulations(document.getElementById("simulations"), data.simulations ?? {});
  renderCI(document.getElementById("ci-matrix"), data.ci ?? {});
  renderHyperstructure(document.getElementById("hyperstructure"), data.hyperstructure ?? {});
  renderMarketSentinels(document.getElementById("market-sentinels"), data.market_sentinels ?? {});
  renderSovereignty(document.getElementById("sovereignty-surface"), data.control_surface ?? {});

  renderMermaid("mermaid-flow", data.mermaid?.flow_v10);
  renderMermaid("mermaid-radar", data.mermaid?.radar_v10);
  renderMermaid("mermaid-sequence", data.mermaid?.sequence_v10);
  renderMermaid("mermaid-gantt", data.mermaid?.gantt_v10);
  renderMermaid("mermaid-journey", data.mermaid?.journey_v10);
  renderMermaid("mermaid-state", data.mermaid?.state_v10);
  renderMermaid("mermaid-quadrant", data.mermaid?.quadrant_v10);
}

bootstrap().catch((error) => {
  const root = document.querySelector("main");
  const message = document.createElement("p");
  message.textContent = `Unable to load dashboard data: ${error}`;
  root.appendChild(message);
});
