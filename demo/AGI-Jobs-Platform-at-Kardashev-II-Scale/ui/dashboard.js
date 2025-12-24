let mermaidModule;

async function loadMermaid() {
  if (mermaidModule !== undefined) {
    return mermaidModule;
  }

  try {
    const mermaidNamespace = await import(
      "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs"
    );
    mermaidModule = mermaidNamespace?.default ?? mermaidNamespace;
  } catch (error) {
    console.error("Failed to load mermaid from CDN", error);
    mermaidModule = null;
  }

  return mermaidModule;
}

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

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function formatOptionalNumber(value, options = {}) {
  if (!isNumber(value)) {
    return "N/A";
  }
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatOptionalPercent(value, digits = 2) {
  if (!isNumber(value)) {
    return "N/A";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function applyStatus(element, status) {
  if (!element) return;
  element.classList.remove("status-ok", "status-warn", "status-fail");
  if (status) {
    element.classList.add(status);
  }
}

function setStatusUnknown(element, message = "Telemetry unavailable") {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("status-ok", "status-fail");
  element.classList.add("status-warn");
}

function average(values) {
  const numeric = values.filter(isNumber);
  if (numeric.length === 0) return null;
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

function normalizeTelemetry(rawTelemetry) {
  const telemetry = rawTelemetry ?? {};
  const shards = Array.isArray(telemetry.shards) ? telemetry.shards : [];
  const averageResilience =
    isNumber(telemetry.dominance?.averageResilience) ? telemetry.dominance.averageResilience : average(shards.map((s) => s.resilience));
  const averageUtilisation = average(shards.map((s) => s.utilisation));
  const energyMonteCarlo = telemetry.energy?.monteCarlo ?? telemetry.energyMonteCarlo ?? null;
  const marginPct =
    telemetry.energy?.marginPct ??
    energyMonteCarlo?.freeEnergyMarginPct ??
    (isNumber(energyMonteCarlo?.marginGw) && isNumber(energyMonteCarlo?.availableGw) && energyMonteCarlo.availableGw > 0
      ? energyMonteCarlo.marginGw / energyMonteCarlo.availableGw
      : null);

  const energyFeeds = telemetry.energy?.liveFeeds?.feeds ?? telemetry.energyFeeds ?? [];
  const normalizedFeeds = Array.isArray(energyFeeds)
    ? energyFeeds.map((feed) => ({
        region: feed.region ?? feed.federationSlug ?? "unknown",
        type: feed.type ?? "unknown",
        deltaPct: feed.deltaPct ?? 0,
        latencyMs: feed.latencyMs ?? 0,
        withinTolerance: feed.withinTolerance ?? true,
        driftAlert: feed.driftAlert ?? false,
      }))
    : [];

  const averageLatencyMs = average(normalizedFeeds.map((feed) => feed.latencyMs));
  const maxLatencyMs = normalizedFeeds.length
    ? Math.max(...normalizedFeeds.map((feed) => feed.latencyMs))
    : null;

  const liveFeeds = telemetry.energy?.liveFeeds ?? {
    feeds: normalizedFeeds,
    tolerancePct: 0.1,
    driftAlertPct: 0.15,
    averageLatencyMs: averageLatencyMs ?? 0,
    maxLatencyMs: maxLatencyMs ?? 0,
  };

  return {
    ...telemetry,
    dominance: telemetry.dominance ?? {
      score: telemetry.dominanceScore ?? null,
      monthlyValueUSD: telemetry.dominance?.monthlyValueUSD ?? null,
      averageResilience,
    },
    energy: telemetry.energy ?? {
      utilisationPct: isNumber(averageUtilisation) ? averageUtilisation / 100 : null,
      marginPct,
      tripleCheck: telemetry.energy?.tripleCheck ?? energyMonteCarlo?.withinTolerance ?? null,
      warnings: telemetry.energy?.warnings ?? [],
      models: telemetry.energy?.models ?? {
        regionalSumGw: energyMonteCarlo?.availableGw ?? null,
        dysonProjectionGw: energyMonteCarlo?.capturedGw ?? null,
        thermostatBudgetGw: energyMonteCarlo?.reserveGw ?? null,
      },
      monteCarlo: energyMonteCarlo,
      liveFeeds,
    },
    governance: telemetry.governance ?? {
      averageCoverageSeconds: telemetry.governance?.averageCoverageSeconds ?? null,
      coverageOk: telemetry.governance?.coverageOk ?? null,
    },
    bridges: telemetry.bridges ?? {},
    verification: telemetry.verification ?? {
      energyModels: { withinMargin: null, expected: [] },
      compute: { deviationPct: null, tolerancePct: null, withinTolerance: null },
      bridges: { allWithinTolerance: null, toleranceSeconds: null },
      energySchedule: { coverageOk: null, reliabilityOk: null },
      energyFeeds: { allWithinTolerance: null, tolerancePct: liveFeeds.tolerancePct ?? null },
      logistics: null,
      settlement: null,
    },
  };
}

function renderGlobalFailure(message) {
  const main = document.querySelector("main");
  if (!main) return;

  const alert = document.createElement("section");
  alert.classList.add("card", "status-fail");
  alert.innerHTML = `
    <div class="section-title">
      <h2>Telemetry unavailable</h2>
    </div>
    <p class="lede">${message}</p>
    <p class="lede">Regenerate artefacts with <code>npm run demo:kardashev-ii:orchestrate</code> and refresh the dashboard.</p>
  `;

  main.prepend(alert);
}

function renderLedgerUnavailable(reason) {
  const summary = document.querySelector("#ledger-summary");
  if (!summary) return;
  summary.textContent = `Stability ledger unavailable: ${reason}`;
  applyStatus(summary, "status-fail");

  const checks = document.querySelector("#ledger-checks");
  if (checks) {
    checks.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = "Re-run the orchestrator to regenerate ledger evidence.";
    li.classList.add("status-warn");
    checks.appendChild(li);
  }
}

function renderOwnerProofUnavailable(reason) {
  const score = document.querySelector("#owner-proof-score");
  if (!score) return;
  score.textContent = `Owner proof deck unavailable: ${reason}`;
  applyStatus(score, "status-fail");

  const summary = document.querySelector("#owner-proof-summary");
  if (summary) {
    summary.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = "Owner signatures could not be loaded. Refresh after regenerating artefacts.";
    li.classList.add("status-warn");
    summary.appendChild(li);
  }
}

function renderMetrics(telemetry) {
  const dominanceScore = isNumber(telemetry.dominance?.score) ? telemetry.dominance.score : null;
  const dominanceScoreElement = document.querySelector("#dominance-score");
  if (dominanceScoreElement) {
    if (dominanceScore === null) {
      setStatusUnknown(dominanceScoreElement);
    } else {
      dominanceScoreElement.textContent = `${dominanceScore.toFixed(1)} / 100`;
    }
  }

  const monthlyValue = isNumber(telemetry.dominance?.monthlyValueUSD) ? telemetry.dominance.monthlyValueUSD : null;
  const monthlyValueElement = document.querySelector("#monthly-value");
  if (monthlyValueElement) {
    monthlyValueElement.textContent =
      monthlyValue === null
        ? "Monthly value flow unavailable"
        : `$${formatNumber(monthlyValue / 1_000_000_000_000)}T monthly throughput`;
  }

  const averageResilience = isNumber(telemetry.dominance?.averageResilience) ? telemetry.dominance.averageResilience : null;
  const resilienceElement = document.querySelector("#resilience");
  if (resilienceElement) {
    resilienceElement.textContent =
      averageResilience === null ? "Resilience telemetry unavailable" : `${(averageResilience * 100).toFixed(2)}% resilience`;
  }

  const utilisation = isNumber(telemetry.energy?.utilisationPct) ? telemetry.energy.utilisationPct : null;
  const utilisationElement = document.querySelector("#energy-utilisation");
  if (utilisationElement) {
    utilisationElement.textContent =
      utilisation === null ? "Utilisation telemetry unavailable" : `${(utilisation * 100).toFixed(2)}% utilisation`;
  }

  const marginPct = isNumber(telemetry.energy?.marginPct) ? telemetry.energy.marginPct : null;
  const marginElement = document.querySelector("#energy-margin");
  if (marginElement) {
    marginElement.textContent =
      marginPct === null ? "Margin telemetry unavailable" : `${(marginPct * 100).toFixed(2)}% safety margin`;
  }

  const coverageSeconds = isNumber(telemetry.governance?.averageCoverageSeconds)
    ? telemetry.governance.averageCoverageSeconds
    : null;
  const coverageElement = document.querySelector("#coverage");
  if (coverageElement) {
    coverageElement.textContent =
      coverageSeconds === null ? "Guardian coverage unavailable" : `${Math.round(coverageSeconds)}s coverage`;
  }

  const coverageStatus = document.querySelector("#coverage-status");
  if (telemetry.governance?.coverageOk === null || telemetry.governance?.coverageOk === undefined) {
    setStatusUnknown(coverageStatus);
  } else {
    setStatus(coverageStatus, telemetry.governance.coverageOk);
  }

  const energyStatus = document.querySelector("#energy-status");
  if (telemetry.energy?.tripleCheck === null || telemetry.energy?.tripleCheck === undefined) {
    setStatusUnknown(energyStatus);
  } else {
    setStatus(energyStatus, telemetry.energy.tripleCheck && telemetry.energy.warnings.length === 0);
  }

  const bridgeList = document.querySelector("#bridge-statuses");
  if (bridgeList) {
    bridgeList.innerHTML = "";
    const bridgeEntries = Object.entries(telemetry.bridges ?? {});
    if (bridgeEntries.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No bridge telemetry loaded.";
      li.classList.add("status-warn");
      bridgeList.appendChild(li);
    } else {
      for (const [name, data] of bridgeEntries) {
        const li = document.createElement("li");
        li.textContent = `${name}: ${data.latencySeconds}s latency · ${data.bandwidthGbps} Gbps · ${data.protocol}`;
        li.classList.add(data.withinFailsafe ? "status-ok" : "status-fail");
        bridgeList.appendChild(li);
      }
    }
  }

  const energyModelsElement = document.querySelector("#energy-models");
  if (!telemetry.verification?.energyModels || !telemetry.energy?.models) {
    setStatusUnknown(energyModelsElement);
  } else {
    setStatusText(
      energyModelsElement,
      telemetry.verification.energyModels.withinMargin,
      telemetry.verification.energyModels.withinMargin
        ? `Aligned — ${formatNumber(telemetry.energy.models.regionalSumGw)} vs ${formatNumber(telemetry.energy.models.dysonProjectionGw)} GW`
        : "Mismatch across energy models"
    );
  }

  const monteCarlo = telemetry.energy?.monteCarlo;
  const monteCarloSummary = document.querySelector("#energy-monte-carlo-summary");
  if (!monteCarlo || !monteCarlo.percentileGw) {
    if (monteCarloSummary) monteCarloSummary.textContent = "No Monte Carlo telemetry.";
    setStatusUnknown(document.querySelector("#energy-monte-carlo-status"));
  } else {
    if (monteCarloSummary) {
      monteCarloSummary.textContent = `Breach ${(monteCarlo.breachProbability * 100).toFixed(2)}% · P95 ${formatNumber(
        monteCarlo.percentileGw.p95
      )} GW · runs ${monteCarlo.runs}`;
    }
    setStatus(document.querySelector("#energy-monte-carlo-status"), monteCarlo.withinTolerance);
  }

  const computeElement = document.querySelector("#compute-deviation");
  if (!telemetry.verification?.compute) {
    setStatusUnknown(computeElement);
  } else {
    setStatusText(
      computeElement,
      telemetry.verification.compute.withinTolerance,
      `${formatOptionalNumber(telemetry.verification.compute.deviationPct, { maximumFractionDigits: 2 })}% deviation (≤ ${formatOptionalNumber(
        telemetry.verification.compute.tolerancePct,
        { maximumFractionDigits: 2 }
      )}%)`
    );
  }

  const bridgeComplianceElement = document.querySelector("#bridge-compliance");
  if (!telemetry.verification?.bridges) {
    setStatusUnknown(bridgeComplianceElement);
  } else {
    setStatusText(
      bridgeComplianceElement,
      telemetry.verification.bridges.allWithinTolerance,
      telemetry.verification.bridges.allWithinTolerance
        ? `All bridges ≤ ${telemetry.verification.bridges.toleranceSeconds}s`
        : "Latency exceeds tolerance"
    );
  }

  const feedCompliance = telemetry.energy?.liveFeeds?.allWithinTolerance;
  const feedComplianceElement = document.querySelector("#energy-feed-compliance");
  if (feedCompliance === null || feedCompliance === undefined) {
    setStatusUnknown(feedComplianceElement);
  } else {
    setStatusText(
      feedComplianceElement,
      feedCompliance,
      feedCompliance
        ? `Δ ≤ ${telemetry.energy.liveFeeds.tolerancePct}% across ${telemetry.energy.liveFeeds.feeds.length} feeds`
        : `Drift > ${telemetry.energy.liveFeeds.tolerancePct}%`
    );
  }

  const feedLatencyElement = document.querySelector("#energy-feed-latency");
  if (feedLatencyElement) {
    feedLatencyElement.textContent = `Avg ${formatOptionalNumber(telemetry.energy?.liveFeeds?.averageLatencyMs, {
      maximumFractionDigits: 0,
    })} ms · Max ${formatOptionalNumber(telemetry.energy?.liveFeeds?.maxLatencyMs, { maximumFractionDigits: 0 })} ms`;
  }

  const feedList = document.querySelector("#energy-feed-list");
  if (feedList) {
    feedList.innerHTML = "";
    const feeds = telemetry.energy?.liveFeeds?.feeds ?? [];
    if (feeds.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No live feeds registered.";
      li.classList.add("status-warn");
      feedList.appendChild(li);
    } else {
      feeds.forEach((feed) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${feed.region} (${feed.type})</span><span>${feed.deltaPct.toFixed(2)}% Δ · ${feed.latencyMs} ms</span>`;
        li.classList.add(feed.withinTolerance ? "status-ok" : feed.driftAlert ? "status-warn" : "status-fail");
        feedList.appendChild(li);
      });
    }
  }

  const thermoFreeEnergy = document.querySelector("#thermo-free-energy");
  if (thermoFreeEnergy) {
    thermoFreeEnergy.textContent = monteCarlo
      ? `${formatOptionalNumber(monteCarlo.freeEnergyMarginGw, { maximumFractionDigits: 2 })} GW free energy margin`
      : "Free energy margin unavailable";
  }
  const thermoHamiltonian = document.querySelector("#thermo-hamiltonian");
  if (thermoHamiltonian) {
    thermoHamiltonian.textContent = monteCarlo
      ? `Hamiltonian stability ${formatOptionalPercent(monteCarlo.hamiltonianStability, 1)}`
      : "Hamiltonian stability unavailable";
  }
  const thermoEntropy = document.querySelector("#thermo-entropy");
  if (thermoEntropy) {
    thermoEntropy.textContent = monteCarlo
      ? `Entropy buffer ${formatOptionalNumber(monteCarlo.entropyMargin, { maximumFractionDigits: 2 })}σ`
      : "Entropy buffer unavailable";
  }
  const thermoSlack = document.querySelector("#thermo-game");
  if (thermoSlack) {
    thermoSlack.textContent = monteCarlo
      ? `Game-theoretic slack ${formatOptionalPercent(monteCarlo.gameTheorySlack, 1)}`
      : "Game-theoretic slack unavailable";
  }
  const thermoGibbs = document.querySelector("#thermo-gibbs");
  if (thermoGibbs) {
    thermoGibbs.textContent = monteCarlo
      ? `Gibbs reserve ${formatOptionalNumber(monteCarlo.gibbsFreeEnergyGj, { maximumFractionDigits: 2 })} GJ`
      : "Gibbs reserve unavailable";
  }
}

let mermaidInitialised = false;

async function renderMermaidDiagram(path, containerId, renderId) {
  const container = document.querySelector(`#${containerId}`);
  if (!container) {
    console.warn(`Mermaid container #${containerId} not found for ${path}`);
    return;
  }

  const source = await fetchText(path);
  const mermaid = await loadMermaid();
  if (!mermaid) {
    container.textContent =
      "Diagram renderer unavailable — check connectivity to the Mermaid CDN and retry.";
    container.classList.add("status-warn");
    return;
  }

  if (!mermaidInitialised) {
    await mermaid.initialize({ theme: "dark", securityLevel: "loose", startOnLoad: false });
    mermaidInitialised = true;
  }

  const { svg } = await mermaid.render(renderId, source);
  container.innerHTML = svg;
}

function attachReflectionButton(telemetry) {
  const button = document.querySelector("#reflect-button");
  if (!button) return;
  if (!telemetry.manifest || !telemetry.energy || !telemetry.bridges) {
    button.disabled = true;
    button.textContent = "Reflection unavailable";
    return;
  }
  button.addEventListener("click", () => {
    const checklist = [
      { label: "Manifesto hash", ok: telemetry.manifest.manifestoHashMatches },
      { label: "Self-improvement plan hash", ok: telemetry.manifest.planHashMatches },
      { label: "Guardian coverage", ok: telemetry.governance.coverageOk },
      { label: "Energy triple check", ok: telemetry.energy.tripleCheck },
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
  if (!list) return;
  if (!telemetry.missionDirectives) {
    list.innerHTML = "<li class=\"status-warn\">Owner directives unavailable.</li>";
    const fallbackFields = [
      "#guardian-hotline",
      "#operations-hotline",
      "#status-page",
      "#bridge-failover",
      "#drill-info",
    ];
    fallbackFields.forEach((selector) => {
      const element = document.querySelector(selector);
      if (element) {
        element.textContent = "Unavailable";
      }
    });
    return;
  }
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
  if (!grid) return;
  if (!telemetry.federations || telemetry.federations.length === 0) {
    grid.innerHTML = "<article class=\"federation-card status-warn\">Federation telemetry unavailable.</article>";
    return;
  }
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
  if (!identity) {
    const summary = document.querySelector("#identity-summary");
    if (summary) {
      summary.textContent = "Identity telemetry unavailable.";
      applyStatus(summary, "status-warn");
    }
    const list = document.querySelector("#identity-federations");
    if (list) list.innerHTML = "";
    return;
  }
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
  if (!fabric) {
    const summary = document.querySelector("#fabric-summary");
    if (summary) {
      summary.textContent = "Compute fabric telemetry unavailable.";
      applyStatus(summary, "status-warn");
    }
    const list = document.querySelector("#fabric-planes");
    if (list) list.innerHTML = "";
    const meta = document.querySelector("#fabric-meta");
    if (meta) meta.textContent = "Awaiting compute fabric orchestration.";
    return;
  }
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

function renderOrchestrationFabric(orchestration) {
  if (!orchestration) return;
  const summary = document.querySelector("#fabric-federation-summary");
  const domainsOk = orchestration.coverage.domainsOk;
  const sentinelsOk = orchestration.coverage.sentinelsOk;
  const federationsOk = orchestration.coverage.federationsOk;
  summary.textContent = `Domains ${domainsOk ? "aligned" : "review"} · Sentinels ${sentinelsOk ? "aligned" : "review"} · Federations ${federationsOk ? "aligned" : "review"}`;
  summary.classList.toggle("status-ok", domainsOk && sentinelsOk && federationsOk);
  summary.classList.toggle("status-fail", !(domainsOk && sentinelsOk && federationsOk));

  document.querySelector("#fabric-latency-summary").textContent = `Average latency ${orchestration.coverage.averageLatencyMs.toFixed(0)} ms · max ${orchestration.coverage.maxLatencyMs} ms`;

  const list = document.querySelector("#fabric-shards");
  list.innerHTML = "";
  orchestration.shards.forEach((shard) => {
    const li = document.createElement("li");
    const issues = [];
    if (!shard.domainCoverageOk && shard.missingDomains.length > 0) {
      issues.push(`missing domains ${shard.missingDomains.join("/")}`);
    }
    if (!shard.sentinelsOk) {
      issues.push("sentinel drift");
    }
    if (!shard.federationFound) {
      issues.push("no matching federation");
    }
    li.innerHTML = `<strong>${shard.id}</strong> — registry ${shard.jobRegistry} · latency ${shard.latencyMs} ms · domains ${shard.domains.join(", ")}`;
    if (issues.length > 0) {
      const issue = document.createElement("div");
      issue.textContent = issues.join(" · ");
      issue.classList.add("status-fail");
      li.appendChild(issue);
    }
    list.appendChild(li);
  });
}

function renderEnergySchedule(schedule, verification) {
  const summary = document.querySelector("#schedule-summary");
  if (!schedule) {
    summary.textContent = "No energy windows configured.";
    summary.classList.add("status-warn");
    return;
  }
  const coverage = (schedule.globalCoverageRatio * 100).toFixed(2);
  const reliability = (schedule.globalReliabilityPct * 100).toFixed(2);
  summary.textContent = `Coverage ${coverage}% (threshold ${schedule.coverageThreshold * 100}%) · Reliability ${reliability}%`;
  const scheduleOk = verification?.coverageOk && verification?.reliabilityOk;
  summary.classList.toggle("status-ok", !!scheduleOk);
  summary.classList.toggle("status-fail", scheduleOk === false);

  const coverageList = document.querySelector("#schedule-coverage");
  coverageList.innerHTML = "";
  schedule.coverage.forEach((entry) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${entry.federation.toUpperCase()}</strong><span>${(entry.coverageRatio * 100).toFixed(2)}% · ${(entry.reliabilityPct * 100).toFixed(2)}%</span>`;
    const ok = entry.coverageRatio >= schedule.coverageThreshold && entry.reliabilityPct >= schedule.reliabilityThreshold;
    li.classList.add(ok ? "status-ok" : "status-fail");
    coverageList.appendChild(li);
  });

  const windowList = document.querySelector("#energy-window-list");
  windowList.innerHTML = "";
  schedule.windows.forEach((window) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${window.federation}</strong> · ${window.startHourUTC}:00Z · ${window.durationHours}h · ${formatNumber(window.availableGw + window.backupGw)} GW · ${(window.coverageRatio * 100).toFixed(2)}% coverage · ${(window.reliabilityPct * 100).toFixed(2)}% reliability`;
    const ok = window.coverageRatio >= schedule.coverageThreshold;
    li.classList.add(ok ? "status-ok" : "status-warn");
    windowList.appendChild(li);
  });

  const deficits = document.querySelector("#schedule-deficits");
  if (!schedule.deficits || schedule.deficits.length === 0) {
    deficits.textContent = "No coverage deficits detected.";
    deficits.classList.add("status-ok");
    deficits.classList.remove("status-fail");
  } else {
    deficits.textContent = `Deficits: ${schedule.deficits
      .map((deficit) => `${deficit.federation} ${(deficit.coverageRatio * 100).toFixed(2)}% (${deficit.deficitGwH} GW·h)`).join(" · ")}`;
    deficits.classList.add("status-fail");
    deficits.classList.remove("status-ok");
  }
}

function renderMissionLattice(mission) {
  const summaryElement = document.querySelector("#mission-summary");
  const listElement = document.querySelector("#mission-programmes");
  const warningsElement = document.querySelector("#mission-warnings");

  if (!mission) {
    if (summaryElement) {
      summaryElement.textContent = "Mission telemetry unavailable.";
      applyStatus(summaryElement, "status-fail");
    }
    if (listElement) {
      listElement.innerHTML = "";
    }
    if (warningsElement) {
      warningsElement.textContent = "Mission lattice output not generated. Regenerate artefacts.";
      applyStatus(warningsElement, "status-fail");
    }
    return;
  }

  const unstoppablePct = (mission.verification.unstoppableScore * 100).toFixed(2);
  const summaryParts = [
    `${mission.totals.programmes} programmes`,
    `${mission.totals.tasks} tasks`,
    `${formatNumber(mission.totals.energyGw)} GW energy`,
    `${mission.totals.computeExaflops.toFixed(2)} EF compute`,
    `Agent quorum ${formatNumber(mission.totals.agentQuorum)}`,
    `Avg timeline ${mission.totals.averageTimelineDays.toFixed(1)}d`,
  ];

  const verificationParts = [
    `Unstoppable ${unstoppablePct}%`,
    mission.verification.dependenciesResolved && mission.verification.programmeDependenciesResolved
      ? "Dependencies resolved"
      : "Dependencies review",
    mission.verification.sentinelCoverage && mission.verification.fallbackCoverage
      ? "Sentinel & fallback nominal"
      : "Coverage review",
    mission.verification.timelineAligned && mission.verification.autonomyWithinBounds
      ? "Timelines aligned"
      : "Timeline/autonomy review",
  ];

  if (summaryElement) {
    summaryElement.textContent = `${verificationParts.join(" · ")} · ${summaryParts.join(" · ")}`;
    const summaryOk =
      mission.verification.unstoppableScore >= 0.95 &&
      mission.verification.dependenciesResolved &&
      mission.verification.programmeDependenciesResolved &&
      mission.verification.sentinelCoverage &&
      mission.verification.fallbackCoverage &&
      mission.verification.ownerAlignment &&
      mission.verification.autonomyWithinBounds &&
      mission.verification.timelineAligned;
    const summaryWarn =
      !summaryOk && (mission.verification.unstoppableScore >= 0.85 || mission.verification.warnings.length > 0);
    applyStatus(summaryElement, summaryOk ? "status-ok" : summaryWarn ? "status-warn" : "status-fail");
  }

  if (listElement) {
    listElement.innerHTML = "";
    mission.programmes.forEach((programme) => {
      const li = document.createElement("li");
      li.classList.add("mission-item");

      const header = document.createElement("div");
      header.classList.add("mission-item-header");

      const title = document.createElement("h3");
      title.textContent = programme.name;
      header.appendChild(title);

      const score = document.createElement("span");
      score.classList.add("mission-score");
      const programmeScorePct = (programme.unstoppableScore * 100).toFixed(2);
      score.textContent = `Unstoppable ${programmeScorePct}%`;
      const programmeStatus =
        programme.unstoppableScore >= 0.95 ? "status-ok" : programme.unstoppableScore >= 0.85 ? "status-warn" : "status-fail";
      score.classList.add(programmeStatus);
      header.appendChild(score);

      li.appendChild(header);

      if (programme.objective) {
        const objective = document.createElement("p");
        objective.classList.add("mission-objective");
        objective.textContent = programme.objective;
        li.appendChild(objective);
      }

      const meta = document.createElement("div");
      meta.classList.add("mission-meta");
      meta.innerHTML = `
        <span>Federation ${programme.federation}</span>
        <span>Owner safe ${programme.ownerSafe}</span>
        <span>${programme.taskCount} tasks</span>
        <span>${formatNumber(programme.totalEnergyGw)} GW</span>
        <span>${programme.totalComputeExaflops.toFixed(2)} EF</span>
        <span>Quorum ${formatNumber(programme.totalAgentQuorum)}</span>
        <span>Critical path ${programme.criticalPathDays.toFixed(1)}d</span>
        <span>Slack ${programme.timelineSlackDays.toFixed(2)}d</span>
      `;
      li.appendChild(meta);

      const riskTotal =
        programme.riskDistribution.low + programme.riskDistribution.medium + programme.riskDistribution.high;
      const risk = document.createElement("p");
      risk.classList.add("mission-risk");
      if (riskTotal > 0) {
        const lowPct = ((programme.riskDistribution.low / riskTotal) * 100).toFixed(1);
        const medPct = ((programme.riskDistribution.medium / riskTotal) * 100).toFixed(1);
        const highPct = ((programme.riskDistribution.high / riskTotal) * 100).toFixed(1);
        risk.textContent = `Risk distribution — Low ${lowPct}% · Medium ${medPct}% · High ${highPct}%`;
      } else {
        risk.textContent = "Risk distribution — No tasks registered.";
      }
      li.appendChild(risk);

      const flags = [];
      if (programme.missingDependencies.length > 0) {
        flags.push({ status: "status-fail", text: `Missing task deps: ${programme.missingDependencies.join(", ")}` });
      }
      if (programme.missingProgrammeDependencies.length > 0) {
        flags.push({
          status: "status-fail",
          text: `Missing programme deps: ${programme.missingProgrammeDependencies.join(", ")}`,
        });
      }
      if (programme.sentinelAlerts.length > 0) {
        flags.push({ status: "status-warn", text: `Sentinel alerts: ${programme.sentinelAlerts.join(", ")}` });
      }
      if (programme.ownerAlerts.length > 0) {
        flags.push({ status: "status-fail", text: `Owner safes mismatch: ${programme.ownerAlerts.join(", ")}` });
      }
      if (!programme.timelineOk) {
        flags.push({ status: "status-fail", text: `Timeline deficit ${programme.timelineSlackDays.toFixed(2)}d` });
      } else if (programme.timelineSlackDays < 14) {
        flags.push({ status: "status-warn", text: `Timeline slack ${programme.timelineSlackDays.toFixed(2)}d` });
      }
      if (!programme.autonomyOk) {
        flags.push({ status: "status-fail", text: "Autonomy exceeds bounds" });
      }
      if (programme.dependencies.length > 0 && programme.missingDependencies.length === 0) {
        flags.push({ status: "status-ok", text: `Dependencies: ${programme.dependencies.join(", ")}` });
      }

      const flagContainer = document.createElement("div");
      flagContainer.classList.add("mission-flags");
      if (flags.length === 0) {
        const badge = document.createElement("span");
        badge.classList.add("mission-badge", "status-ok");
        badge.textContent = "All invariants satisfied.";
        flagContainer.appendChild(badge);
      } else {
        flags.forEach((flag) => {
          const badge = document.createElement("span");
          badge.classList.add("mission-badge", flag.status);
          badge.textContent = flag.text;
          flagContainer.appendChild(badge);
        });
      }
      li.appendChild(flagContainer);

      listElement.appendChild(li);
    });
  }

  if (warningsElement) {
    if (mission.verification.warnings.length === 0) {
      warningsElement.textContent = "No mission advisories.";
      applyStatus(warningsElement, "status-ok");
    } else {
      warningsElement.textContent = `⚠ ${mission.verification.warnings.join(" · ")}`;
      applyStatus(warningsElement, "status-warn");
    }
  }
}

function renderLogistics(logistics, verification) {
  const summary = document.querySelector("#logistics-summary");
  if (!logistics) {
    summary.textContent = "No logistics corridors configured.";
    summary.classList.add("status-warn");
    return;
  }

  const avgReliability = (verification?.averageReliabilityPct ?? 0) * 100;
  const avgUtilisation = (verification?.averageUtilisationPct ?? 0) * 100;
  const minBuffer = verification?.minimumBufferDays ?? 0;
  const statusOk =
    verification?.reliabilityOk &&
    verification?.bufferOk &&
    verification?.utilisationOk &&
    verification?.watchersOk &&
    verification?.autonomyOk;

  summary.textContent = `Average reliability ${avgReliability.toFixed(2)}% · utilisation ${avgUtilisation.toFixed(
    2
  )}% · buffer ${minBuffer.toFixed(2)} days`;
  summary.classList.toggle("status-ok", !!statusOk);
  summary.classList.toggle("status-fail", statusOk === false);

  const watcherText = document.querySelector("#logistics-watchers");
  watcherText.textContent = `Unique watchers ${logistics.aggregate.watchers.length} · capacity ${logistics.aggregate.capacityTonnesPerDay.toLocaleString()} tonnes/day`;

  const list = document.querySelector("#logistics-corridors");
  list.innerHTML = "";
  logistics.corridors.forEach((corridor) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${corridor.name}</strong><span>${(corridor.utilisationPct * 100).toFixed(1)}% · ${(corridor.reliabilityPct * 100).toFixed(
      2
    )}% · buffer ${corridor.bufferDays.toFixed(1)}d</span>`;
    const ok =
      corridor.utilisationOk &&
      corridor.reliabilityOk &&
      corridor.bufferOk &&
      corridor.watchersOk &&
      corridor.autonomyOk;
    li.classList.add(ok ? "status-ok" : "status-warn");
    if (!ok) {
      const issues = [];
      if (!corridor.reliabilityOk) issues.push("reliability");
      if (!corridor.bufferOk) issues.push("buffer");
      if (!corridor.utilisationOk) issues.push("utilisation");
      if (!corridor.watchersOk) issues.push("watchers");
      if (!corridor.autonomyOk) issues.push("autonomy");
      const badge = document.createElement("div");
      badge.textContent = `Attention: ${issues.join(", ")}`;
      badge.classList.add("status-fail");
      li.appendChild(badge);
    }
    list.appendChild(li);
  });
}

function renderSettlement(settlement, verification) {
  const summary = document.querySelector("#settlement-summary");
  if (!settlement) {
    summary.textContent = "No settlement protocols configured.";
    summary.classList.add("status-warn");
    return;
  }
  summary.textContent = `Average finality ${settlement.averageFinalityMinutes.toFixed(2)} min (max ${settlement.maxToleranceMinutes.toFixed(2)} min) · coverage ${(settlement.minCoveragePct * 100).toFixed(2)}%`;
  const ok = verification?.allWithinTolerance && verification?.coverageOk && verification?.slippageOk;
  summary.classList.toggle("status-ok", !!ok);
  summary.classList.toggle("status-fail", ok === false);

  const watchers = document.querySelector("#settlement-watchers");
  watchers.textContent = `Watchers ${settlement.watchersOnline}/${settlement.watchers.length} · slippage threshold ${settlement.slippageThresholdBps} bps`;

  const list = document.querySelector("#settlement-protocols");
  list.innerHTML = "";
  settlement.protocols.forEach((protocol) => {
    const li = document.createElement("li");
    const withinTolerance = protocol.finalityMinutes <= protocol.toleranceMinutes;
    const withinCoverage = protocol.coveragePct >= settlement.coverageThreshold;
    li.innerHTML = `<strong>${protocol.name}</strong><span>${protocol.finalityMinutes.toFixed(2)} / ${protocol.toleranceMinutes.toFixed(2)} min · ${(protocol.coveragePct * 100).toFixed(2)}% · risk ${protocol.riskLevel}</span>`;
    li.classList.add(withinTolerance && withinCoverage ? "status-ok" : "status-warn");
    if (protocol.riskLevel === "high") {
      li.classList.remove("status-ok", "status-warn");
      li.classList.add("status-fail");
    }
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
  const [telemetryResult, ledgerResult, ownerProofResult] = await Promise.allSettled([
    fetchJson("./output/kardashev-telemetry.json"),
    fetchJson("./output/kardashev-stability-ledger.json"),
    fetchJson("./output/kardashev-owner-proof.json"),
  ]);

  if (telemetryResult.status !== "fulfilled") {
    console.error("Failed to load telemetry", telemetryResult.reason);
    renderGlobalFailure(telemetryResult.reason);
    return;
  }

  const telemetry = normalizeTelemetry(telemetryResult.value);
  renderMetrics(telemetry);
  attachReflectionButton(telemetry);
  renderOwnerDirectives(telemetry);
  renderFederations(telemetry);
  renderIdentity(telemetry.identity);
  renderComputeFabric(telemetry.computeFabric);
  renderOrchestrationFabric(telemetry.orchestrationFabric);
  renderEnergySchedule(telemetry.energy?.schedule, telemetry.verification?.energySchedule);
  renderMissionLattice(telemetry.missionLattice);
  renderLogistics(telemetry.logistics, telemetry.verification?.logistics);
  renderSettlement(telemetry.settlement, telemetry.verification?.settlement);
  renderScenarioSweep(telemetry);

  if (ledgerResult.status === "fulfilled") {
    renderLedger(ledgerResult.value);
  } else {
    console.warn("Ledger unavailable", ledgerResult.reason);
    renderLedgerUnavailable(ledgerResult.reason);
  }

  if (ownerProofResult.status === "fulfilled") {
    renderOwnerProof(ownerProofResult.value, telemetry);
  } else {
    console.warn("Owner proof unavailable", ownerProofResult.reason);
    renderOwnerProofUnavailable(ownerProofResult.reason);
  }

  const diagrams = await Promise.allSettled([
    renderMermaidDiagram("./output/kardashev-task-hierarchy.mmd", "mission-mermaid", "mission-hierarchy-diagram"),
    renderMermaidDiagram("./output/kardashev-mermaid.mmd", "mermaid-container", "kardashev-diagram"),
    renderMermaidDiagram("./output/kardashev-dyson.mmd", "dyson-container", "dyson-diagram"),
  ]);

  diagrams.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const targets = ["mission-mermaid", "mermaid-container", "dyson-container"];
    const target = document.querySelector(`#${targets[index]}`);
    if (target) {
      target.textContent = "Diagram unavailable: " + result.reason;
      target.classList.add("status-fail");
    }
  });
}

bootstrap();
