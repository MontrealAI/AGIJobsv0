import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Failed to fetch ${path}: ${response.status}`);
  return response.text();
}

function setStatus(element, ok) {
  element.textContent = ok ? "Nominal" : "Intervention required";
  element.classList.toggle("status-ok", ok);
  element.classList.toggle("status-fail", !ok);
}

function setStatusText(element, ok, text) {
  element.textContent = text;
  element.classList.toggle("status-ok", ok);
  element.classList.toggle("status-fail", !ok);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function renderMetrics(telemetry) {
  document.querySelector("#dominance-score").textContent = `${telemetry.dominance.score.toFixed(1)} / 100`;
  document.querySelector("#monthly-value").textContent = `$${formatNumber(telemetry.dominance.monthlyValueUSD / 1_000_000_000_000)}T monthly throughput`;
  document.querySelector("#resilience").textContent = `${(telemetry.dominance.averageResilience * 100).toFixed(2)}% resilience`;
  document.querySelector("#energy-utilisation").textContent = `${(telemetry.energy.utilisationPct * 100).toFixed(2)}% utilisation`;
  document.querySelector("#energy-margin").textContent = `${(telemetry.energy.marginPct * 100).toFixed(2)}% safety margin`;
  document.querySelector("#coverage").textContent = `${Math.round(telemetry.governance.averageCoverageSeconds)}s coverage`;
  setStatus(document.querySelector("#coverage-status"), telemetry.governance.coverageOk);
  setStatus(document.querySelector("#energy-status"), telemetry.energy.tripleCheck && telemetry.energy.warnings.length === 0);
  const freeEnergyText = `${formatNumber(telemetry.energy.globalFreeEnergyGw)} GW free · margin ${formatNumber(
    telemetry.energy.thermostatMarginGw
  )} GW`;
  document.querySelector("#free-energy-buffer").textContent = freeEnergyText;
  setStatus(
    document.querySelector("#free-energy-status"),
    telemetry.verification.thermodynamics.withinMargin
  );
  const bridgeList = document.querySelector("#bridge-statuses");
  bridgeList.innerHTML = "";
  for (const [name, data] of Object.entries(telemetry.bridges)) {
    const li = document.createElement("li");
    li.textContent = `${name}: ${data.latencySeconds}s latency · ${data.bandwidthGbps} Gbps · ${data.protocol}`;
    li.classList.add(data.withinFailsafe ? "status-ok" : "status-fail");
    bridgeList.appendChild(li);
  }
  setStatusText(
    document.querySelector("#energy-models"),
    telemetry.verification.energyModels.withinMargin,
    telemetry.verification.energyModels.withinMargin
      ? `Aligned — ${formatNumber(telemetry.energy.models.regionalSumGw)} vs ${formatNumber(telemetry.energy.models.dysonProjectionGw)} GW`
      : "Mismatch across energy models"
  );
  const monteCarlo = telemetry.energy.monteCarlo;
  document.querySelector("#energy-monte-carlo-summary").textContent = `Breach ${(monteCarlo.breachProbability * 100).toFixed(2)}% · P95 ${formatNumber(monteCarlo.percentileGw.p95)} GW · runs ${monteCarlo.runs}`;
  setStatus(
    document.querySelector("#energy-monte-carlo-status"),
    monteCarlo.withinTolerance
  );
  setStatusText(
    document.querySelector("#compute-deviation"),
    telemetry.verification.compute.withinTolerance,
    `${telemetry.verification.compute.deviationPct.toFixed(2)}% deviation (≤ ${telemetry.verification.compute.tolerancePct}%)`
  );
  setStatusText(
    document.querySelector("#bridge-compliance"),
    telemetry.verification.bridges.allWithinTolerance,
    telemetry.verification.bridges.allWithinTolerance
      ? `All bridges ≤ ${telemetry.verification.bridges.toleranceSeconds}s`
      : "Latency exceeds tolerance"
  );
}

let mermaidInitialised = false;

async function renderMermaidDiagram(path, containerId, renderId) {
  const source = await fetchText(path);
  if (!mermaidInitialised) {
    await mermaid.initialize({ theme: "dark", securityLevel: "loose", startOnLoad: false });
    mermaidInitialised = true;
  }
  const { svg } = await mermaid.render(renderId, source);
  const container = document.querySelector(`#${containerId}`);
  container.innerHTML = svg;
}

function attachReflectionButton(telemetry) {
  const button = document.querySelector("#reflect-button");
  button.addEventListener("click", () => {
    const checklist = [
      { label: "Manifesto hash", ok: telemetry.manifest.manifestoHashMatches },
      { label: "Self-improvement plan hash", ok: telemetry.manifest.planHashMatches },
      { label: "Guardian coverage", ok: telemetry.governance.coverageOk },
      { label: "Energy triple check", ok: telemetry.energy.tripleCheck },
      { label: "Free energy buffer", ok: telemetry.verification.thermodynamics.withinMargin },
      { label: "Energy Monte Carlo", ok: telemetry.energy.monteCarlo.withinTolerance },
      ...Object.entries(telemetry.bridges).map(([name, data]) => ({ label: `Bridge ${name}`, ok: data.withinFailsafe })),
    ];
    const list = document.querySelector("#reflection-checklist");
    list.innerHTML = "";
    checklist.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.label}: ${item.ok ? "✅" : "❌"}`;
      li.classList.add(item.ok ? "status-ok" : "status-fail");
      list.appendChild(li);
    });
  });
}

function renderOwnerDirectives(telemetry) {
  const list = document.querySelector("#owner-powers");
  list.innerHTML = "";
  telemetry.missionDirectives.ownerPowers.forEach((power) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${power.title}</strong> (Safe #${power.safeIndex}) — ${power.description} · <span class="uri">${power.playbookURI}</span>`;
    list.appendChild(li);
  });
  document.querySelector("#guardian-hotline").textContent = telemetry.missionDirectives.escalation.guardianHotline;
  document.querySelector("#operations-hotline").textContent = telemetry.missionDirectives.escalation.operationsHotline;
  document.querySelector("#status-page").textContent = telemetry.missionDirectives.escalation.statusPageURI;
  document.querySelector("#bridge-failover").textContent = telemetry.missionDirectives.escalation.bridgeFailover;
  document.querySelector(
    "#drill-info"
  ).textContent = `Pause drills every ${telemetry.missionDirectives.drills.pauseCadenceHours}h · guardian review ${telemetry.missionDirectives.drills.guardianReviewMinutes} minutes · next drill ${telemetry.missionDirectives.drills.nextDrillISO8601}.`;
}

function renderFederations(telemetry) {
  const grid = document.querySelector("#federation-grid");
  grid.innerHTML = "";
  telemetry.federations.forEach((federation) => {
    const card = document.createElement("article");
    card.classList.add("federation-card");
    const header = document.createElement("h3");
    header.textContent = federation.name;
    card.appendChild(header);

    const meta = document.createElement("p");
    meta.textContent = `Chain ${federation.chainId} · Safe ${federation.governanceSafe}`;
    card.appendChild(meta);

    const energy = document.createElement("p");
    energy.textContent = `Energy ${formatNumber(federation.energy.availableGw)} GW (${Math.round(
      federation.energy.renewablePct * 100
    )}% renewable)`;
    card.appendChild(energy);

    const freeEnergy = document.createElement("p");
    const deficit = federation.energy.deficitGw > 0 ? ` · deficit ${formatNumber(federation.energy.deficitGw)} GW` : "";
    freeEnergy.textContent = `Free energy ${formatNumber(federation.energy.freeEnergyGw)} GW${deficit}`;
    card.appendChild(freeEnergy);

    const compute = document.createElement("p");
    compute.textContent = `Compute ${formatNumber(federation.compute.exaflops)} EF · Agents ${formatNumber(
      federation.compute.agents / 1_000_000_000
    )}B`;
    card.appendChild(compute);

    const domainList = document.createElement("ul");
    domainList.classList.add("domain-list");
    federation.domains.forEach((domain) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${domain.name}</strong>: ${formatNumber(
        domain.monthlyValueUSD / 1_000_000_000
      )}B/mo · resilience ${(domain.resilience * 100).toFixed(2)}% · coverage ${domain.coverageSeconds}s`;
      domainList.appendChild(li);
    });
    card.appendChild(domainList);

    const sentinels = document.createElement("p");
    sentinels.classList.add("sentinel-row");
    sentinels.textContent = `Sentinels: ${federation.sentinels.map((s) => s.name).join(", ")}`;
    card.appendChild(sentinels);

    grid.appendChild(card);
  });
}

function renderIdentity(identity) {
  document.querySelector("#identity-root").textContent = identity.global.rootAuthority;
  document.querySelector("#identity-merkle").textContent = identity.global.identityMerkleRoot;
  document.querySelector("#identity-revocation").textContent = `${identity.totals.revocationRatePpm.toFixed(2)} ppm ≤ ${identity.global.revocationTolerancePpm} ppm`;
  document.querySelector("#identity-latency").textContent = `${identity.totals.maxAttestationLatencySeconds.toFixed(0)}s / ${identity.global.revocationWindowSeconds}s`;
  document.querySelector("#identity-summary").textContent = `${identity.withinQuorum ? "✅" : "⚠️"} ${identity.totals.anchorsMeetingQuorum}/${identity.totals.federationCount} federations at quorum ${identity.global.attestationQuorum} · coverage ${(identity.totals.minCoveragePct * 100).toFixed(2)}% (floor ${(identity.global.coverageFloorPct * 100).toFixed(2)}%)`;

  const list = document.querySelector("#identity-federations");
  list.innerHTML = "";
  identity.federations.forEach((federation) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${federation.name}</strong> — DID ${federation.didRegistry} · anchors ${federation.anchors.length} · methods ${federation.attestationMethods.join(", ")} · latency ${federation.attestationLatencySeconds}s · coverage ${(federation.coveragePct * 100).toFixed(2)}% · revocations ${federation.credentialRevocations24h.toLocaleString()}/24h`;
    list.appendChild(li);
  });
}

function renderComputeFabric(fabric) {
  document.querySelector("#fabric-summary").textContent = `${fabric.failoverWithinQuorum ? "✅" : "⚠️"} Failover ${fabric.failoverCapacityExaflops.toFixed(2)} EF vs quorum ${fabric.requiredFailoverCapacity.toFixed(2)} EF`;
  document.querySelector("#fabric-meta").textContent = `Total ${fabric.totalCapacityExaflops.toFixed(2)} EF · average availability ${(fabric.averageAvailabilityPct * 100).toFixed(2)}% · hierarchy ${fabric.policies.layeredHierarchies} layers`;

  const list = document.querySelector("#fabric-planes");
  list.innerHTML = "";
  fabric.planes.forEach((plane) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${plane.name}</strong> (${plane.geography}) — ${plane.capacityExaflops.toFixed(2)} EF · energy ${plane.energyGw.toLocaleString()} GW · latency ${plane.latencyMs} ms · availability ${(plane.availabilityPct * 100).toFixed(2)}% · partner ${plane.failoverPartner}`;
    list.appendChild(li);
  });
}

function renderLedger(ledger) {
  document.querySelector("#ledger-summary").textContent = ledger.confidence.summary;
  const composite = `${(ledger.confidence.compositeScore * 100).toFixed(2)}%`;
  document.querySelector("#ledger-score").textContent = composite;
  document
    .querySelector("#ledger-score")
    .classList.toggle("status-ok", ledger.confidence.quorum);
  document
    .querySelector("#ledger-score")
    .classList.toggle("status-fail", !ledger.confidence.quorum);

  const checkList = document.querySelector("#ledger-checks");
  checkList.innerHTML = "";
  ledger.checks.forEach((check) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${check.title}</strong> — <span class="ledger-evidence">${check.evidence}</span>`;
    li.classList.add(check.status ? "status-ok" : "status-fail");
    checkList.appendChild(li);
  });

  const methodsList = document.querySelector("#ledger-methods");
  methodsList.innerHTML = "";
  ledger.confidence.methods.forEach((method) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${method.method}</strong>: ${(method.score * 100).toFixed(2)}% — ${method.explanation}`;
    li.classList.add(method.score >= 0.95 ? "status-ok" : method.score >= 0.75 ? "status-warn" : "status-fail");
    methodsList.appendChild(li);
  });

  const alertsList = document.querySelector("#ledger-alerts");
  alertsList.innerHTML = "";
  if (ledger.alerts.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No alerts — all invariants satisfied.";
    li.classList.add("status-ok");
    alertsList.appendChild(li);
  } else {
    ledger.alerts.forEach((alert) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${alert.title}</strong> (${alert.severity}) — ${alert.evidence}`;
      li.classList.add("status-fail");
      alertsList.appendChild(li);
    });
  }
}

function renderScenarioSweep(telemetry) {
  const container = document.querySelector("#scenario-list");
  container.innerHTML = "";
  const scenarios = telemetry.scenarioSweep ?? [];
  if (scenarios.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No scenarios registered.";
    li.classList.add("status-ok");
    container.appendChild(li);
    return;
  }

  scenarios.forEach((scenario) => {
    const li = document.createElement("li");
    li.classList.add("scenario-item");

    const header = document.createElement("div");
    header.classList.add("scenario-header");

    const title = document.createElement("h3");
    title.textContent = scenario.title;
    header.appendChild(title);

    const status = document.createElement("span");
    status.classList.add("scenario-status", scenario.status);
    status.textContent = `${scenario.status.toUpperCase()} · ${(scenario.confidence * 100).toFixed(1)}% conf.`;
    header.appendChild(status);

    li.appendChild(header);

    const summary = document.createElement("p");
    summary.textContent = scenario.summary;
    li.appendChild(summary);

    const metricsList = document.createElement("ul");
    metricsList.classList.add("scenario-metrics");
    scenario.metrics.forEach((metric) => {
      const metricItem = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = metric.label;
      const value = document.createElement("span");
      value.textContent = metric.value;
      value.classList.add(metric.ok ? "status-ok" : "status-fail");
      metricItem.appendChild(label);
      metricItem.appendChild(value);
      metricsList.appendChild(metricItem);
    });
    li.appendChild(metricsList);

    if (scenario.recommendedActions.length > 0) {
      const actions = document.createElement("p");
      actions.classList.add("scenario-actions");
      actions.textContent = `Recommended: ${scenario.recommendedActions.join(" · ")}`;
      li.appendChild(actions);
    }

    container.appendChild(li);
  });
}

function renderOwnerProof(ownerProof, telemetry) {
  const scorePct = (ownerProof.verification.unstoppableScore * 100).toFixed(2);
  const scoreElement = document.querySelector("#owner-proof-score");
  scoreElement.textContent = `Unstoppable control score: ${scorePct}%`;
  scoreElement.classList.toggle("status-ok", ownerProof.verification.unstoppableScore >= 0.95);
  scoreElement.classList.toggle("status-warn", ownerProof.verification.unstoppableScore < 0.95);

  const secondary = ownerProof.secondaryVerification;
  const secondaryPct = (secondary.unstoppableScore * 100).toFixed(2);
  const secondaryElement = document.querySelector("#owner-proof-secondary");
  secondaryElement.textContent = `Secondary unstoppable score: ${secondaryPct}% (selectors ${
    secondary.selectorsMatch ? "✅" : "❌"
  }, pause ${secondary.pauseDecoded ? "✅" : "❌"}, resume ${secondary.resumeDecoded ? "✅" : "❌"}, match ${
    secondary.matchesPrimaryScore ? "✅" : "❌"
  })`;
  secondaryElement.classList.toggle(
    "status-ok",
    secondary.unstoppableScore >= 0.95 && secondary.matchesPrimaryScore
  );
  secondaryElement.classList.toggle(
    "status-warn",
    secondary.unstoppableScore < 0.95 || !secondary.matchesPrimaryScore
  );

  const summaryList = document.querySelector("#owner-proof-summary");
  summaryList.innerHTML = "";
  const summaryItems = [
    { label: "Selectors complete", ok: ownerProof.verification.selectorsComplete },
    { label: "Pause embedded", ok: ownerProof.pauseEmbedding.pauseAll },
    { label: "Resume embedded", ok: ownerProof.pauseEmbedding.unpauseAll },
    { label: "Targets isolated", ok: ownerProof.verification.singleOwnerTargets },
    { label: "Secondary selectors", ok: secondary.selectorsMatch },
    { label: "Secondary pause decode", ok: secondary.pauseDecoded },
    { label: "Secondary resume decode", ok: secondary.resumeDecoded },
    { label: "Scores aligned", ok: secondary.matchesPrimaryScore },
  ];
  summaryItems.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.label}: ${item.ok ? "✅" : "❌"}`;
    li.classList.add(item.ok ? "status-ok" : "status-fail");
    summaryList.appendChild(li);
  });

  const functionsList = document.querySelector("#owner-proof-functions");
  functionsList.innerHTML = "";
  ownerProof.requiredFunctions.forEach((fn) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${fn.name}</span><span>${fn.occurrences}/${fn.minimumRequired}</span>`;
    li.classList.add(fn.present ? "status-ok" : "status-fail");
    functionsList.appendChild(li);
  });

  document.querySelector("#owner-proof-tx-hash").textContent = ownerProof.hashes.transactionSet;
  document.querySelector("#owner-proof-selector-hash").textContent = ownerProof.hashes.selectorSet;

  const targets = ownerProof.targets.nonOwner;
  const targetElement = document.querySelector("#owner-proof-targets");
  if (targets.length === 0) {
    targetElement.textContent = "Call targets confined to manager and SystemPause contracts.";
    targetElement.classList.add("status-ok");
    targetElement.classList.remove("status-fail");
  } else {
    targetElement.textContent = `Unexpected targets detected: ${targets.join(", ")}`;
    targetElement.classList.add("status-fail");
    targetElement.classList.remove("status-ok");
  }
}

async function bootstrap() {
  try {
    const [telemetry, ledger, ownerProof] = await Promise.all([
      fetchJson("./output/kardashev-telemetry.json"),
      fetchJson("./output/kardashev-stability-ledger.json"),
      fetchJson("./output/kardashev-owner-proof.json"),
    ]);
    renderMetrics(telemetry);
    attachReflectionButton(telemetry);
    renderOwnerDirectives(telemetry);
    renderFederations(telemetry);
    renderIdentity(telemetry.identity);
    renderComputeFabric(telemetry.computeFabric);
    renderScenarioSweep(telemetry);
    renderLedger(ledger);
    renderOwnerProof(ownerProof, telemetry);
    await renderMermaidDiagram("./output/kardashev-mermaid.mmd", "mermaid-container", "kardashev-diagram");
    await renderMermaidDiagram("./output/kardashev-dyson.mmd", "dyson-container", "dyson-diagram");
  } catch (error) {
    console.error(error);
    const container = document.querySelector("#mermaid-container");
    container.textContent = `Failed to load assets: ${error}`;
    container.classList.add("status-fail");
  }
}

bootstrap();
