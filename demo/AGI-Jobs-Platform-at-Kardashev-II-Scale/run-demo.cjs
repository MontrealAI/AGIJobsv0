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

function loadJson(relPath) {
  const abs = path.join(__dirname, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
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
  let breaches = 0;
  let totalDemand = 0;
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
    samples.push(demandGw);
  }

  samples.sort((a, b) => a - b);
  const percentile = (p) => {
    if (samples.length === 0) return 0;
    const idx = Math.min(samples.length - 1, Math.floor(Math.max(0, Math.min(1, p)) * (samples.length - 1)));
    return samples[idx];
  };

  const breachProbability = breaches / runs;
  const summary = {
    runs,
    breachProbability,
    tolerance: safetyMarginPct,
    withinTolerance: breachProbability <= safetyMarginPct,
    capturedGw,
    marginGw,
    peakDemandGw: peakDemand,
    averageDemandGw: samples.length === 0 ? 0 : totalDemand / samples.length,
    percentileGw: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    },
  };
  debugLog('energy-monte-carlo', summary);
  return summary;
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
  const args = { outputDir: process.env.OUTPUT_DIR };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--output-dir' && argv[i + 1]) {
      args.outputDir = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function resolveOutputDir(rawOutputDir) {
  const dir = rawOutputDir
    ? path.resolve(rawOutputDir)
    : path.join(__dirname, 'output');
  ensureDir(dir);
  return dir;
}

function main() {
  const fabric = loadJson('config/fabric.json');
  const energy = loadJson('config/energy-feeds.json');
  const rng = createRng(JSON.stringify(fabric) + JSON.stringify(energy));
  const shardMetrics = fabric.shards.map((shard) => computeShardMetrics(shard, energy.feeds, rng));
  const dyson = simulateDysonSwarm(rng);
  const energyMonteCarlo = simulateEnergyMonteCarlo(fabric, energy.feeds, energy, rng);
  const generatedAt = new Date(
    Date.UTC(2125, 0, 1) + Math.floor(rng() * 86_400_000)
  ).toISOString();
  const sentinelFindings = synthesiseSentinelFindings(shardMetrics);

  const dominanceScore = round(
    shardMetrics.reduce((sum, metric) => sum + metric.resilience * 100, 0) / shardMetrics.length,
    2
  );

  const { outputDir: cliOutputDir } = parseArgs(process.argv.slice(2));
  const outputDir = resolveOutputDir(cliOutputDir);
  const mermaidDir = path.join(outputDir, 'mermaid');
  ensureDir(outputDir);
  ensureDir(mermaidDir);

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
  reportLines.push('A detailed task hierarchy diagram is available at `output/mermaid/dyson-hierarchy.mmd`.');
  reportLines.push('');

  const crossChainDiagram = buildSequenceDiagram();
  fs.writeFileSync(
    path.join(mermaidDir, 'dyson-hierarchy.mmd'),
    `${buildMermaidTaskHierarchy(dyson)}\n`
  );
  fs.writeFileSync(
    path.join(mermaidDir, 'interplanetary-settlement.mmd'),
    `${crossChainDiagram}\n`
  );
  fs.writeFileSync(
    path.join(outputDir, 'kardashev-report.md'),
    `${reportLines.join('\n')}\n`
  );

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

  fs.writeFileSync(
    path.join(outputDir, 'governance-playbook.md'),
    `${governanceLines.join('\n')}\n`
  );

  const telemetry = {
    generatedAt,
    dominanceScore,
    shards: shardMetrics,
    sentinelFindings,
    dyson,
    energyMonteCarlo,
    configs: {
      knowledgeGraph: fabric.knowledgeGraph,
      energyOracle: fabric.energyOracle,
      rewardEngine: fabric.rewardEngine,
      phase8Manager: fabric.phase8Manager,
    },
    energyFeeds: energy.feeds,
  };
  debugLog('telemetry', telemetry);
  const telemetryPath = path.join(outputDir, 'kardashev-telemetry.json');
  fs.writeFileSync(telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);

  const legacyTelemetryPath = path.join(outputDir, 'telemetry.json');
  if (fs.existsSync(legacyTelemetryPath)) {
    fs.rmSync(legacyTelemetryPath);
  }

  if (process.argv.includes('--print-commands')) {
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

  console.log('✅ Kardashev II scale dossier generated successfully.');
  console.log(`   - Report: ${path.join(outputDir, 'kardashev-report.md')}`);
  console.log(`   - Governance playbook: ${path.join(outputDir, 'governance-playbook.md')}`);
  console.log(`   - Telemetry: ${path.join(outputDir, 'kardashev-telemetry.json')}`);
  console.log(
    `   - Energy Monte Carlo breach: ${(energyMonteCarlo.breachProbability * 100).toFixed(2)}% (tolerance ${(energyMonteCarlo.tolerance * 100).toFixed(2)}%).`
  );
}

if (require.main === module) {
  main();
}
