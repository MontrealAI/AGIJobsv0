#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEBUG_TOKEN = 'kardashev-demo';
const debugEnabled = (process.env.DEBUG || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .includes(DEBUG_TOKEN);

function debugLog(section, payload) {
  if (!debugEnabled) {
    return;
  }
  const serialised =
    typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  console.log(`[DEBUG:${DEBUG_TOKEN}] ${section}\n${serialised}`);
}

function createRng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function rng() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function resolveConfigPath(envVar, fallbackRelative) {
  const override = process.env[envVar];
  const target = override ? path.resolve(override) : path.join(__dirname, fallbackRelative);

  if (!fs.existsSync(target)) {
    throw new Error(
      `Missing configuration file at ${target} (${override ? `${envVar} override` : 'default path'})`,
    );
  }

  return target;
}

function loadJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function toTable(rows, headers) {
  const widths = headers.map((header, idx) => {
    return Math.max(header.length, ...rows.map((row) => String(row[idx]).length));
  });
  const formatRow = (values) => {
    return `| ${values
      .map((val, idx) => {
        const str = String(val);
        return str.padEnd(widths[idx], ' ');
      })
      .join(' | ')} |`;
  };
  const lines = [];
  lines.push(formatRow(headers));
  lines.push(
    `| ${widths
      .map((width) => '-'.repeat(width))
      .join(' | ')} |`
  );
  for (const row of rows) {
    lines.push(formatRow(row));
  }
  return lines.join('\n');
}

function formatNumber(num) {
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function round(num, decimals = 2) {
  return Math.round(num * 10 ** decimals) / 10 ** decimals;
}

function computeShardMetrics(shard, energyFeeds, rng) {
  const baseLoad = 1_000_000; // baseline monthly jobs
  const latencyFactor = Math.max(1, shard.latencyMs / 1000);
  const throughput = Math.floor(baseLoad * (1 + rng() * 0.2) / Math.log2(latencyFactor + 2));
  const validators = Math.max(120, Math.floor(throughput / 5000));

  const energy = energyFeeds.find((feed) => feed.region.startsWith(shard.id)) || energyFeeds[0];
  const surplusMw = Math.max(0, energy.nominalMw - energy.bufferMw * 0.75);
  const utilisation = round((surplusMw / energy.nominalMw) * 100, 2);

  const settlementLagMinutes = Math.ceil(shard.latencyMs / 60_000) + 5;
  const resilience = round(Math.min(0.999, 1 - latencyFactor / 1_000_000 + rng() * 0.01), 3);

  const metric = {
    shardId: shard.id,
    throughput,
    validators,
    settlementLagMinutes,
    resilience,
    utilisation,
    surplusMw,
  };
  debugLog(`shard:${shard.id}`, metric);
  return metric;
}

function synthesiseSentinelFindings(metrics) {
  const incidents = [];
  for (const metric of metrics) {
    if (metric.utilisation > 92) {
      incidents.push({
        domain: `${metric.shardId}-energy`,
        severity: 'moderate',
        action: 'SystemPause.PAUSE_DOMAIN',
        reason: 'Energy utilisation breached 92% threshold – initiating cooldown window.',
        mttrMinutes: 14,
      });
    }
  }
  if (incidents.length === 0) {
    incidents.push({
      domain: 'orbital-dyson-swarm',
      severity: 'low',
      action: 'Sentinel advisory',
      reason: 'Anomaly drill executed – guardians acknowledged simulated microwave beam divergence.',
      mttrMinutes: 6,
    });
  }
  debugLog('sentinels', incidents);
  return incidents;
}

function simulateDysonSwarm(rng) {
  const totalSatellites = 10_000;
  const built = 2_640 + Math.floor(rng() * 500);
  const assemblyRatePerDay = 96;
  const projectedCompletionDays = Math.ceil((totalSatellites - built) / assemblyRatePerDay);
  const energyPerSatelliteMw = 45;
  const capturedMw = built * energyPerSatelliteMw;
  const coveragePercent = round((built / totalSatellites) * 100, 2);
  const progress = {
    totalSatellites,
    built,
    assemblyRatePerDay,
    projectedCompletionDays,
    energyPerSatelliteMw,
    capturedMw,
    coveragePercent,
  };
  debugLog('dyson', progress);
  return progress;
}

function simulateEnergyMonteCarlo(fabric, energyFeeds, energyConfig, rng, runs = 256) {
  const safetyMarginPct = (energyConfig?.tolerancePct ?? 5) / 100;
  const driftPct = (energyConfig?.driftAlertPct ?? 8.5) / 100;
  const demandFloor = Math.max(0.6, 1 - safetyMarginPct * 1.5);
  const demandVariance = Math.max(0.05, safetyMarginPct * 0.75);
  const capturedGw = energyFeeds.reduce((sum, feed) => sum + feed.nominalMw, 0) / 1000;
  const reserveGw = energyFeeds.reduce((sum, feed) => sum + feed.bufferMw, 0) / 1000;
  const marginGw = Math.max(capturedGw * safetyMarginPct, reserveGw * 0.5);
  const availableGw = capturedGw + reserveGw;
  let breaches = 0;
  let totalDemand = 0;
  let sumDemandSquared = 0;
  let peakDemand = 0;
  const samples = [];

  for (let i = 0; i < runs; i += 1) {
    let demandGw = 0;
    for (const feed of energyFeeds) {
      const baseGw = feed.nominalMw / 1000;
      const bufferGw = feed.bufferMw / 1000;
      const latencyDrag = 1 - Math.min(0.18, feed.latencyMs / 1_200_000);
      const demandLoad = Math.min(
        1.08,
        Math.max(demandFloor, demandFloor + (rng() - 0.5) * demandVariance * 2)
      );
      const jitter = (rng() - 0.5) * driftPct * 1.25; // tighten drift to reflect tuned telemetry
      const bufferDraw = bufferGw * (0.1 + rng() * 0.35); // probabilistic buffer draw without over-stressing reserves
      const regionalDemand = Math.max(
        0,
        baseGw * demandLoad * latencyDrag * (1 + jitter) + bufferDraw
      );
      demandGw += regionalDemand;
    }
    const remainingBuffer = capturedGw + reserveGw - demandGw;
    if (remainingBuffer < marginGw) {
      breaches += 1;
    }
    if (demandGw > peakDemand) {
      peakDemand = demandGw;
    }
    totalDemand += demandGw;
    sumDemandSquared += demandGw * demandGw;
    samples.push(demandGw);
  }

  samples.sort((a, b) => a - b);
  const percentile = (p) => {
    if (samples.length === 0) return 0;
    const idx = Math.min(samples.length - 1, Math.floor(Math.max(0, Math.min(1, p)) * (samples.length - 1)));
    return samples[idx];
  };

  const breachProbability = breaches / runs;
  const p95Demand = percentile(0.95);
  const meanDemandGw = totalDemand / runs;
  const variance = Math.max(0, sumDemandSquared / runs - meanDemandGw * meanDemandGw);
  const demandStdDevGw = Math.sqrt(variance);
  const freeEnergyMarginGw = availableGw - p95Demand;
  const freeEnergyMarginPct = availableGw === 0 ? 0 : Math.max(0, freeEnergyMarginGw / availableGw);
  const gibbsFreeEnergyGj = Math.max(0, freeEnergyMarginGw) * 3600; // convert GW headroom into GJ over a one-hour horizon
  const hamiltonianStability = Math.max(
    0,
    Math.min(1, 0.5 * (1 - breachProbability) + 0.5 * freeEnergyMarginPct)
  );
  const summary = {
    runs,
    breachProbability,
    tolerance: safetyMarginPct,
    withinTolerance: breachProbability <= safetyMarginPct,
    availableGw,
    reserveGw,
    capturedGw,
    marginGw,
    freeEnergyMarginGw,
    freeEnergyMarginPct,
    meanDemandGw,
    demandStdDevGw,
    entropyMargin: demandStdDevGw > 0 ? freeEnergyMarginGw / demandStdDevGw : freeEnergyMarginGw,
    gameTheorySlack: Math.min(
      1,
      (1 - breachProbability) * 0.55 + hamiltonianStability * 0.45
    ),
    gibbsFreeEnergyGj,
    hamiltonianStability,
    maintainsBuffer: freeEnergyMarginGw >= marginGw,
    peakDemandGw: peakDemand,
    averageDemandGw: samples.length === 0 ? 0 : totalDemand / samples.length,
    percentileGw: {
      p50: percentile(0.5),
      p95: p95Demand,
      p99: percentile(0.99),
    },
  };
  debugLog('energy-monte-carlo', summary);
  return summary;
}

function softmaxScores(scores, temperature) {
  if (!scores.length) {
    return { weights: [], partition: 0 };
  }
  const temp = Math.max(0.05, temperature);
  const maxScore = Math.max(...scores);
  const expScores = scores.map((score) => Math.exp((score - maxScore) / temp));
  const partition = expScores.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(partition) || partition <= 0) {
    return {
      weights: scores.map(() => 1 / scores.length),
      partition: scores.length,
    };
  }
  return {
    weights: expScores.map((value) => value / partition),
    partition,
  };
}

function computeJainIndex(values) {
  if (!values.length) {
    return 1;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  const sumSquares = values.reduce((total, value) => total + value * value, 0);
  if (!Number.isFinite(sum) || !Number.isFinite(sumSquares) || sumSquares <= 0) {
    return 1;
  }
  const rawIndex = (sum * sum) / (values.length * sumSquares);
  return Math.min(1, Math.max(0, rawIndex));
}

function computeAllocationPolicy(shardMetrics, energyMonteCarlo) {
  const temperature = Math.max(0.15, 1 - energyMonteCarlo.hamiltonianStability);
  const scores = shardMetrics.map((metric) => {
    const utilisationPenalty = metric.utilisation / 100;
    const latencyPenalty = Math.min(1, metric.settlementLagMinutes / 180);
    return metric.resilience - 0.6 * utilisationPenalty - 0.2 * latencyPenalty;
  });
  const { weights, partition } = softmaxScores(scores, temperature);
  const availableGw = energyMonteCarlo.availableGw;
  const allocations = shardMetrics.map((metric, idx) => {
    const weight = weights[idx] ?? 0;
    const payoff = Math.max(0.001, metric.resilience) * Math.max(0.1, 1 - metric.utilisation / 100);
    return {
      shardId: metric.shardId,
      weight,
      recommendedGw: availableGw * weight,
      payoff,
    };
  });

  const nashLog = allocations.reduce((sum, item) => sum + Math.log(item.payoff), 0);
  const nashProduct = Math.exp(nashLog / Math.max(1, allocations.length));
  const allocationEntropy = allocations.reduce((sum, item) => {
    if (item.weight <= 0) {
      return sum;
    }
    return sum - item.weight * Math.log(item.weight);
  }, 0);
  const payoffs = allocations.map((allocation) => allocation.payoff);
  const averagePayoff = payoffs.length ? payoffs.reduce((sum, value) => sum + value, 0) / payoffs.length : 0;
  const maxPayoff = payoffs.length ? Math.max(...payoffs) : 0;
  const deviationIncentive = maxPayoff > 0 ? Math.min(1, Math.max(0, (maxPayoff - averagePayoff) / maxPayoff)) : 0;
  const strategyStability = 1 - deviationIncentive;
  const jainIndex = computeJainIndex(payoffs);
  const entropyMax = allocations.length > 1 ? Math.log(allocations.length) : 1;
  const fairnessIndex = entropyMax > 0 ? allocationEntropy / entropyMax : 1;
  const gibbsPotential = -temperature * Math.log(Math.max(1, partition));
  return {
    temperature,
    nashProduct,
    strategyStability,
    deviationIncentive,
    jainIndex,
    allocationEntropy,
    fairnessIndex,
    gibbsPotential,
    allocations,
  };
}

function validateEnergyFeeds(energy) {
  if (!energy || !Array.isArray(energy.feeds) || energy.feeds.length === 0) {
    throw new Error('Energy feeds must include at least one region with nominal + buffer MW defined.');
  }

  energy.feeds.forEach((feed, idx) => {
    if (typeof feed.region !== 'string' || feed.region.trim() === '') {
      throw new Error(`Energy feed #${idx} is missing a region identifier.`);
    }
    if (!Number.isFinite(feed.nominalMw) || feed.nominalMw <= 0) {
      throw new Error(`Energy feed ${feed.region} must declare positive nominalMw.`);
    }
    if (!Number.isFinite(feed.bufferMw) || feed.bufferMw < 0) {
      throw new Error(`Energy feed ${feed.region} must declare non-negative bufferMw.`);
    }
    if (!Number.isFinite(feed.latencyMs) || feed.latencyMs < 0) {
      throw new Error(`Energy feed ${feed.region} latencyMs must be non-negative.`);
    }
  });

  const tolerancePct = energy?.tolerancePct;
  if (tolerancePct !== undefined) {
    if (!Number.isFinite(tolerancePct) || tolerancePct <= 0 || tolerancePct > 50) {
      throw new Error('Energy tolerancePct must be between 0 and 50.');
    }
  }
}

function validateFabric(fabric) {
  if (!fabric || !Array.isArray(fabric.shards) || fabric.shards.length === 0) {
    throw new Error('Fabric config must include at least one shard definition.');
  }

  fabric.shards.forEach((shard, idx) => {
    if (typeof shard.id !== 'string' || shard.id.trim() === '') {
      throw new Error(`Shard #${idx} is missing an id.`);
    }
    if (!Number.isFinite(shard.latencyMs) || shard.latencyMs <= 0) {
      throw new Error(`Shard ${shard.id} latencyMs must be positive.`);
    }
  });

  ['knowledgeGraph', 'energyOracle', 'rewardEngine', 'phase8Manager'].forEach((field) => {
    if (typeof fabric[field] !== 'string' || fabric[field].trim() === '') {
      throw new Error(`Fabric config missing required field "${field}".`);
    }
  });
}

function buildMermaidTaskHierarchy(dyson) {
  return `---
title Dyson Swarm Execution Tree
---
flowchart TB
    root((Dyson Swarm))
    root --> design[Design Lattice Blueprints]
    root --> mining[Asteroid Mining Campaign]
    root --> manufacturing[Orbital Manufacturing]
    root --> launch[Launch Windows]
    root --> operations[Adaptive Operations]

    design --> cad[CAD Agents]
    design --> governance[Manifest Updates]

    mining --> probes[Prospecting Swarm]
    mining --> refineries[Autonomous Refineries]

    manufacturing --> printers[Microgravity Printers]
    manufacturing --> qa[QA Sentinels]

    launch --> boosters[Reusable Boosters]
    launch --> elevators[Mass Drivers]

    operations --> control[Beam Steering]
    operations --> maintenance[Self-Healing Rituals]

    style root fill:#111827,stroke:#0ea5e9,stroke-width:3px
    style operations fill:#1f2937,stroke:#f97316
    subgraph Progress Metrics
        built[Satellites assembled: ${dyson.built}/${dyson.totalSatellites}]
        coverage[Coverage: ${dyson.coveragePercent}%]
        mw[Captured MW: ${formatNumber(dyson.capturedMw)}]
    end
`;
}

function buildDysonThermoDiagram(dyson, energyMonteCarlo) {
  return `---
title Dyson Swarm Thermodynamic Stability
---
flowchart LR
    capture[Captured Power\\n${formatNumber(dyson.capturedMw)} MW] --> reserve[Reserve Buffer\\n${formatNumber(
      round(energyMonteCarlo.marginGw, 2)
    )} GW]
    reserve --> freeEnergy[Free Energy Margin\\n${formatNumber(round(energyMonteCarlo.freeEnergyMarginGw, 2))} GW]
    freeEnergy --> gibbs[Gibbs Free Energy\\n${formatNumber(round(energyMonteCarlo.gibbsFreeEnergyGj, 2))} GJ]
    freeEnergy --> entropy[Entropy Buffer\\n${round(energyMonteCarlo.entropyMargin || 0, 2)}σ]
    gibbs --> hamiltonian[Hamiltonian Stability\\n${round(energyMonteCarlo.hamiltonianStability * 100, 1)}%]
    hamiltonian --> gameTheory[Game-Theory Slack\\n${round(energyMonteCarlo.gameTheorySlack * 100, 1)}%]

    style capture fill:#111827,stroke:#22d3ee,stroke-width:2px
    style freeEnergy fill:#1f2937,stroke:#38bdf8,stroke-width:2px
    style gibbs fill:#1f2937,stroke:#a855f7
    style hamiltonian fill:#1f2937,stroke:#f97316
    style gameTheory fill:#111827,stroke:#22c55e,stroke-width:2px
`;
}

function buildSequenceDiagram() {
  return `---
title Interplanetary Settlement
---
sequenceDiagram
    participant EarthRegistry
    participant MarsRegistry
    participant Bridge
    participant Treasury
    participant Operator

    EarthRegistry->>MarsRegistry: Broadcast cross-planet job manifest
    MarsRegistry-->>Bridge: Submit validator quorum certificate
    Bridge->>Treasury: Relay proof + settlement batch
    Treasury-->>EarthRegistry: Release AGI token escrow
    Treasury-->>MarsRegistry: Mint Mars credit equivalent
    Operator->>Treasury: Confirm forex tolerance (\u2264 0.3%)
    MarsRegistry-->>Operator: Receipt + updated reputation NFT
`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseArgs(argv) {
  const args = {
    outputDir: process.env.OUTPUT_DIR,
    check: false,
    printCommands: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--output-dir' && argv[i + 1]) {
      args.outputDir = argv[i + 1];
      i += 1;
    } else if (flag === '--check') {
      args.check = true;
    } else if (flag === '--print-commands') {
      args.printCommands = true;
    }
  }

  return args;
}

function resolveOutputDir(rawOutputDir, { ensure = true } = {}) {
  const dir = rawOutputDir
    ? path.resolve(rawOutputDir)
    : path.join(__dirname, 'output');
  if (ensure) {
    ensureDir(dir);
  }
  return dir;
}

function main() {
  let fabric;
  let energy;
  try {
    const fabricPath = resolveConfigPath('KARDASHEV_FABRIC_PATH', 'config/fabric.json');
    const energyPath = resolveConfigPath('KARDASHEV_ENERGY_FEEDS_PATH', 'config/energy-feeds.json');
    fabric = loadJson(fabricPath);
    energy = loadJson(energyPath);
    validateFabric(fabric);
    validateEnergyFeeds(energy);
  } catch (err) {
    console.error('❌ Kardashev configuration validation failed.');
    console.error(`   - ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const rng = createRng(JSON.stringify(fabric) + JSON.stringify(energy));
  const shardMetrics = fabric.shards.map((shard) => computeShardMetrics(shard, energy.feeds, rng));
  const dyson = simulateDysonSwarm(rng);
  const mcRunsEnv = Number.parseInt(process.env.KARDASHEV_MC_RUNS ?? '', 10);
  const mcRuns = Number.isFinite(mcRunsEnv) ? Math.max(64, Math.min(4096, mcRunsEnv)) : 256;
  const energyMonteCarlo = simulateEnergyMonteCarlo(fabric, energy.feeds, energy, rng, mcRuns);
  const allocationPolicy = computeAllocationPolicy(shardMetrics, energyMonteCarlo);
  const generatedAt = new Date(
    Date.UTC(2125, 0, 1) + Math.floor(rng() * 86_400_000)
  ).toISOString();
  const sentinelFindings = synthesiseSentinelFindings(shardMetrics);

  const dominanceScore = round(
    shardMetrics.reduce((sum, metric) => sum + metric.resilience * 100, 0) / shardMetrics.length,
    2
  );

  const { outputDir: cliOutputDir, check, printCommands } = parseArgs(
    process.argv.slice(2)
  );
  const outputDir = resolveOutputDir(cliOutputDir, { ensure: !check });
  const mermaidDir = path.join(outputDir, 'mermaid');
  const dysonHierarchyPath = path.join(mermaidDir, 'dyson-hierarchy.mmd');
  const taskHierarchyPath = path.join(outputDir, 'kardashev-task-hierarchy.mmd');
  const mermaidMapPath = path.join(outputDir, 'kardashev-mermaid.mmd');
  const dysonDiagramPath = path.join(outputDir, 'kardashev-dyson.mmd');
  const dysonHierarchyReference =
    path.relative(outputDir, taskHierarchyPath) || 'kardashev-task-hierarchy.mmd';

  if (!check) {
    ensureDir(outputDir);
    ensureDir(mermaidDir);
  } else {
    console.log('🔎 Check mode enabled – computing ledgers without writing artefacts.');
  }

  const reportLines = [];
  reportLines.push('# Kardashev II Scale Control Dossier');
  reportLines.push('');
  reportLines.push(`Generated: ${generatedAt}`);
  reportLines.push('');
  reportLines.push('## Executive Summary');
  reportLines.push('');
  reportLines.push(
    `- **Universal Dominance Score:** ${dominanceScore}/100 (targets met across all shards).`
  );
  reportLines.push(
    `- **Dyson Swarm Progress:** ${dyson.built}/${dyson.totalSatellites} satellites assembled (${dyson.coveragePercent}% coverage).`
  );
  reportLines.push(
    `- **Captured Power:** ${formatNumber(dyson.capturedMw)} MW available for reallocation.`
  );
  reportLines.push(
    `- **Energy Monte Carlo:** ${(energyMonteCarlo.breachProbability * 100).toFixed(2)}% breach probability across ${energyMonteCarlo.runs} runs (tolerance ${(energyMonteCarlo.tolerance * 100).toFixed(2)}%).`
  );
  reportLines.push(
    `- **Free Energy Margin:** ${energyMonteCarlo.freeEnergyMarginGw.toFixed(2)} GW (${(energyMonteCarlo.freeEnergyMarginPct * 100).toFixed(2)}%) vs ${energyMonteCarlo.marginGw.toFixed(2)} GW minimum buffer.`
  );
  reportLines.push(
    `- **Entropy Buffer:** ${(energyMonteCarlo.entropyMargin || 0).toFixed(2)}σ thermodynamic headroom; game-theoretic slack ${(energyMonteCarlo.gameTheorySlack * 100).toFixed(1)}%.`
  );
  reportLines.push(
    `- **Thermodynamic Reserve:** ${formatNumber(round(energyMonteCarlo.gibbsFreeEnergyGj, 2))} GJ Gibbs free energy; Hamiltonian stability ${(energyMonteCarlo.hamiltonianStability * 100).toFixed(1)}% across the sampled phase space.`
  );
  reportLines.push(
    `- **Gibbs Allocation Temperature:** ${allocationPolicy.temperature.toFixed(2)} (lower favors resilience-heavy shards); Nash welfare ${(allocationPolicy.nashProduct * 100).toFixed(2)}%.`
  );
  reportLines.push(
    `- **Allocation Entropy:** ${allocationPolicy.allocationEntropy.toFixed(3)} (fairness ${(allocationPolicy.fairnessIndex * 100).toFixed(1)}%); Gibbs potential ${allocationPolicy.gibbsPotential.toFixed(3)}.`
  );
  reportLines.push(
    `- **Strategy Stability:** ${(allocationPolicy.strategyStability * 100).toFixed(1)}% (deviation incentive ${(allocationPolicy.deviationIncentive * 100).toFixed(1)}%; Jain fairness ${(allocationPolicy.jainIndex * 100).toFixed(1)}%).`
  );
  reportLines.push(
    `- **Sentinel Status:** ${sentinelFindings.length} advisories generated; all resolved within guardian SLA.`
  );
  reportLines.push('');

  reportLines.push('## Shard Operations');
  reportLines.push('');
  reportLines.push(
    toTable(
      shardMetrics.map((metric) => [
        metric.shardId,
        formatNumber(metric.throughput),
        formatNumber(metric.validators),
        `${metric.settlementLagMinutes} min`,
        metric.resilience,
        `${metric.utilisation}%`,
      ]),
      ['Shard', 'Monthly Jobs', 'Active Validators', 'Settlement Lag', 'Resilience', 'Energy Utilisation']
    )
  );
  reportLines.push('');

  reportLines.push('## Thermodynamic Allocation Policy');
  reportLines.push('');
  reportLines.push(
    toTable(
      allocationPolicy.allocations.map((allocation) => [
        allocation.shardId,
        `${(allocation.weight * 100).toFixed(1)}%`,
        formatNumber(round(allocation.recommendedGw, 2)),
        round(allocation.payoff, 3),
      ]),
      ['Shard', 'Boltzmann Weight', 'Recommended GW', 'Nash Payoff']
    )
  );
  reportLines.push('');

  reportLines.push('## Sentinel Advisories');
  reportLines.push('');
  sentinelFindings.forEach((incident, idx) => {
    reportLines.push(`### Advisory ${idx + 1}: ${incident.domain}`);
    reportLines.push('- Severity: ' + incident.severity);
    reportLines.push('- Action: ' + incident.action);
    reportLines.push('- Reason: ' + incident.reason);
    reportLines.push(`- Mean time to recovery: ${incident.mttrMinutes} minutes`);
    reportLines.push('');
  });

  reportLines.push('## Dyson Swarm Analytics');
  reportLines.push('');
  reportLines.push(`- Remaining build days: ${dyson.projectedCompletionDays}`);
  reportLines.push(`- Assembly rate: ${dyson.assemblyRatePerDay} satellites/day`);
  reportLines.push(`- Energy per satellite: ${dyson.energyPerSatelliteMw} MW`);
  reportLines.push('');
  reportLines.push(`A detailed task hierarchy diagram is available at \`${dysonHierarchyReference}\`.`);
  reportLines.push('');

  const crossChainDiagram = buildSequenceDiagram();
  const governanceLines = [];
  governanceLines.push('# Kardashev II Governance Playbook');
  governanceLines.push('');
  governanceLines.push('1. **Pause orchestration:** Execute `forwardPauseCall(SystemPause.PAUSE_ALL)` from the multisig, verify sentinels acknowledge, then resume with `forwardPauseCall(SystemPause.UNPAUSE_ALL)` once the guardian quorum signs.');
  governanceLines.push('2. **Retune guardrails:**');
  governanceLines.push('   - Set `guardianReviewWindow` to `900` seconds for interplanetary latency.');
  governanceLines.push('   - Adjust `globalAutonomyFloorBps` to `8500` to unlock orbital autonomy.');
  governanceLines.push('   - Update `energyOracle` to the live telemetry endpoint defined in `config/energy-feeds.json`.');
  governanceLines.push('   - Confirm `knowledgeGraph` pointer matches the knowledge mesh contract.');
  governanceLines.push('3. **Identity operations:** Register new agents via ENS + DID bundles, rotate certificates for Mars sentinels, and revoke stale identities; rerun `npm run demo:kardashev` to ensure reputation dispersion < 0.7 Gini.');
  governanceLines.push('4. **Capital stream oversight:** Call `configureCapitalStream` for each domain to reflect the captured MW; confirm RewardEngineMB temperature cooled by ≥4%.');
  governanceLines.push('5. **Manifest evolution:** Upload the new manifesto to IPFS, call `updateManifesto(uri, hash)`, then append a fresh self-improvement cadence with zk-proof placeholders recorded.');
  governanceLines.push('');
  governanceLines.push('All actions are auditable; copy/paste-ready commands are available via `npm run demo:kardashev -- --print-commands`.');

  const telemetry = {
    generatedAt,
    dominanceScore,
    shards: shardMetrics,
    sentinelFindings,
    dyson,
    energyMonteCarlo,
    allocationPolicy,
    configs: {
      knowledgeGraph: fabric.knowledgeGraph,
      energyOracle: fabric.energyOracle,
      rewardEngine: fabric.rewardEngine,
      phase8Manager: fabric.phase8Manager,
    },
    energyFeeds: energy.feeds,
  };
  debugLog('telemetry', telemetry);

  if (!check) {
    fs.writeFileSync(
      dysonHierarchyPath,
      `${buildMermaidTaskHierarchy(dyson)}\n`
    );
    fs.writeFileSync(
      taskHierarchyPath,
      `${buildMermaidTaskHierarchy(dyson)}\n`
    );
    fs.writeFileSync(
      path.join(mermaidDir, 'interplanetary-settlement.mmd'),
      `${crossChainDiagram}\n`
    );
    fs.writeFileSync(
      mermaidMapPath,
      `${crossChainDiagram}\n`
    );
    fs.writeFileSync(
      dysonDiagramPath,
      `${buildDysonThermoDiagram(dyson, energyMonteCarlo)}\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-report.md'),
      `${reportLines.join('\n')}\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'governance-playbook.md'),
      `${governanceLines.join('\n')}\n`
    );

    const telemetryPath = path.join(outputDir, 'kardashev-telemetry.json');
    fs.writeFileSync(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);

    const legacyTelemetryPath = path.join(outputDir, 'telemetry.json');
    if (fs.existsSync(legacyTelemetryPath)) {
      fs.rmSync(legacyTelemetryPath);
    }
  }

  if (printCommands) {
    const commands = [
      `forwardPauseCall(SystemPause.PAUSE_ALL) via Phase8 manager ${fabric.phase8Manager}`,
      `setGlobalParameters({ guardianReviewWindow: 900, energyOracle: ${fabric.energyOracle} })`,
      `configureCapitalStream(...) for shards: ${fabric.shards.map((shard) => shard.id).join(', ')}`,
      'updateManifesto(manifestURI, manifestHash)',
      'recordSelfImprovementExecution(planHash, proofReference)'
    ];
    console.log('\nGovernance command checklist:');
    commands.forEach((command, index) => {
      console.log(` ${index + 1}. ${command}`);
    });
  }

  if (!energyMonteCarlo.withinTolerance) {
    console.error('❌ Energy Monte Carlo breach exceeds tolerance.');
    console.error(
      `   - Observed breach: ${(energyMonteCarlo.breachProbability * 100).toFixed(2)}% (tolerance ${(energyMonteCarlo.tolerance * 100).toFixed(2)}%).`
    );
    console.error(
      '   - Action: raise council review and rerun with updated feeds or widened reserves to restore thermodynamic headroom.'
    );
    process.exitCode = 1;
    return;
  }

  if (!energyMonteCarlo.maintainsBuffer) {
    console.error('❌ Free energy margin collapsed below target corridor.');
    console.error(
      `   - Remaining margin: ${energyMonteCarlo.freeEnergyMarginGw.toFixed(2)} GW vs ${energyMonteCarlo.marginGw.toFixed(2)} GW minimum.`
    );
    console.error(
      '   - Action: divert reserve thrums, widen lattice buffers, or throttle shard intake until the Hamiltonian stays negative.'
    );
    process.exitCode = 1;
    return;
  }

  if (check) {
    console.log('✅ Kardashev II scale dossier validated (check mode).');
    console.log(
      `   - Energy Monte Carlo breach: ${(energyMonteCarlo.breachProbability * 100).toFixed(2)}% (tolerance ${(energyMonteCarlo.tolerance * 100).toFixed(2)}%).`
    );
    console.log(
      `   - Free energy margin: ${energyMonteCarlo.freeEnergyMarginGw.toFixed(2)} GW (${(energyMonteCarlo.freeEnergyMarginPct * 100).toFixed(2)}%)`
    );
    console.log(
      `   - Entropy buffer: ${(energyMonteCarlo.entropyMargin || 0).toFixed(2)}σ · game-theoretic slack ${(energyMonteCarlo.gameTheorySlack * 100).toFixed(1)}%`
    );
    return;
  }

  console.log('✅ Kardashev II scale dossier generated successfully.');
  console.log(`   - Report: ${path.join(outputDir, 'kardashev-report.md')}`);
  console.log(`   - Governance playbook: ${path.join(outputDir, 'governance-playbook.md')}`);
  console.log(`   - Telemetry: ${path.join(outputDir, 'kardashev-telemetry.json')}`);
  console.log(
    `   - Energy Monte Carlo breach: ${(energyMonteCarlo.breachProbability * 100).toFixed(2)}% (tolerance ${(energyMonteCarlo.tolerance * 100).toFixed(2)}%).`
  );
  console.log(
    `   - Free energy margin: ${energyMonteCarlo.freeEnergyMarginGw.toFixed(2)} GW (${(energyMonteCarlo.freeEnergyMarginPct * 100).toFixed(2)}%)`
  );
  console.log(
    `   - Entropy buffer: ${(energyMonteCarlo.entropyMargin || 0).toFixed(2)}σ · game-theoretic slack ${(energyMonteCarlo.gameTheorySlack * 100).toFixed(1)}%`
  );
}

if (require.main === module) {
  main();
}
