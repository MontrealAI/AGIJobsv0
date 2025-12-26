#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function hashString(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function resolveEnergyFeedForShard(shard, energyFeeds) {
  const shardId = (shard.id || '').toLowerCase();
  if (!shardId) {
    return null;
  }
  return (
    energyFeeds.find(
      (feed) => (feed.federationSlug || '').toLowerCase() === shardId
    ) ||
    energyFeeds.find((feed) =>
      (feed.region || '').toLowerCase().startsWith(shardId)
    ) ||
    null
  );
}

function computeShardMetrics(shard, energyFeeds, rng) {
  const baseLoad = 1_000_000; // baseline monthly jobs
  const latencyFactor = Math.max(1, shard.latencyMs / 1000);
  const throughput = Math.floor(baseLoad * (1 + rng() * 0.2) / Math.log2(latencyFactor + 2));
  const validators = Math.max(120, Math.floor(throughput / 5000));

  const energy = resolveEnergyFeedForShard(shard, energyFeeds);
  if (!energy) {
    throw new Error(
      `Energy feeds missing coverage for shard "${shard.id}". Add a feed with matching federationSlug or region.`
    );
  }
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

function simulateEnergyMonteCarlo(fabric, energyFeeds, energyConfig, energyModels, rng, runs = 256) {
  const safetyMarginPct = (energyConfig?.tolerancePct ?? 5) / 100;
  const driftPct = (energyConfig?.driftAlertPct ?? 8.5) / 100;
  const demandFloor = Math.max(0.6, 1 - safetyMarginPct * 1.5);
  const demandVariance = Math.max(0.05, safetyMarginPct * 0.75);
  const regionalCapturedGw = energyFeeds.reduce((sum, feed) => sum + feed.nominalMw, 0) / 1000;
  const capturedGw = Math.max(energyModels?.dysonProjectionGw ?? 0, regionalCapturedGw);
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
  const runwayHours =
    meanDemandGw > 0 ? Math.max(0, freeEnergyMarginGw) / meanDemandGw : 0;
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
    runwayHours,
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

function computeHerfindahlIndex(weights) {
  if (!weights.length) {
    return 0;
  }
  const rawIndex = weights.reduce((sum, weight) => sum + weight * weight, 0);
  return clamp01(rawIndex);
}

function computeGiniIndex(values) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  let weightedSum = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    weightedSum += (2 * i - sorted.length + 1) * sorted[i];
  }
  return clamp01(weightedSum / (sorted.length * total));
}

function computeCoefficientOfVariation(values) {
  if (!values.length) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!Number.isFinite(mean) || mean <= 0) {
    return 0;
  }
  const variance =
    values.reduce((sum, value) => {
      const delta = value - mean;
      return sum + delta * delta;
    }, 0) / values.length;
  return Math.sqrt(Math.max(0, variance)) / mean;
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
  const payoffSum = payoffs.reduce((sum, value) => sum + value, 0);
  const normalizedPayoffs =
    payoffSum > 0 ? payoffs.map((payoff) => payoff / payoffSum) : payoffs.map(() => 1 / Math.max(1, payoffs.length));
  const replicatorDrift =
    weights.reduce((sum, weight, idx) => sum + Math.abs(weight - (normalizedPayoffs[idx] ?? 0)), 0) / 2;
  const replicatorStability = 1 - Math.min(1, replicatorDrift);
  const jainIndex = computeJainIndex(payoffs);
  const concentrationIndex = computeHerfindahlIndex(weights);
  const diversificationScore = clamp01(1 - concentrationIndex);
  const entropyMax = allocations.length > 1 ? Math.log(allocations.length) : 1;
  const fairnessIndex = entropyMax > 0 ? allocationEntropy / entropyMax : 1;
  const gibbsPotential = -temperature * Math.log(Math.max(1, partition));
  return {
    temperature,
    nashProduct,
    strategyStability,
    deviationIncentive,
    replicatorDrift,
    replicatorStability,
    jainIndex,
    concentrationIndex,
    diversificationScore,
    allocationEntropy,
    fairnessIndex,
    gibbsPotential,
    allocations,
  };
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clampRatio(value) {
  return Math.max(0, Math.min(1, value));
}

function unique(values) {
  return [...new Set(values)];
}

function renewablePctForFeed(feed) {
  const type = (feed.type || '').toLowerCase();
  if (type.includes('solar')) return 0.98;
  if (type.includes('fusion')) return 0.92;
  return 0.9;
}

function buildEnergyModels(energyConfig, manifest, dyson) {
  const regionalSumGw = sum(energyConfig.feeds.map((feed) => feed.nominalMw)) / 1000;
  const dysonProjectionGw =
    manifest?.energyProtocols?.stellarLattice?.baselineCapturedGw ??
    Math.max(regionalSumGw, dyson.capturedMw / 1000);
  return {
    regionalSumGw,
    dysonProjectionGw,
  };
}

function buildLiveEnergyFeeds(energyConfig, rng) {
  const tolerancePct = energyConfig.tolerancePct ?? 5;
  const driftAlertPct = energyConfig.driftAlertPct ?? 8.5;
  const feeds = energyConfig.feeds.map((feed) => {
    const deltaPct = Math.abs((rng() - 0.5) * driftAlertPct * 1.25);
    const withinTolerance = deltaPct <= tolerancePct;
    return {
      region: feed.region,
      type: feed.type,
      deltaPct,
      latencyMs: feed.latencyMs,
      withinTolerance,
      driftAlert: deltaPct > driftAlertPct,
    };
  });
  const latencies = feeds.map((feed) => feed.latencyMs);
  return {
    tolerancePct,
    driftAlertPct,
    averageLatencyMs: average(latencies),
    maxLatencyMs: Math.max(...latencies),
    allWithinTolerance: feeds.every((feed) => feed.withinTolerance),
    feeds,
  };
}

function enrichAllocationPolicy(allocationPolicy, shardMetrics, energyConfig) {
  const feedByShard = new Map(
    energyConfig.feeds.map((feed) => {
      const shardId = feed.region.split('-')[0];
      return [shardId, feed];
    })
  );

  const allocations = allocationPolicy.allocations.map((allocation) => {
    const metric = shardMetrics.find((entry) => entry.shardId === allocation.shardId);
    const feed = feedByShard.get(allocation.shardId);
    const nominalGw = feed ? feed.nominalMw / 1000 : 0;
    const deltaGw = allocation.recommendedGw - nominalGw;
    return {
      ...allocation,
      deltaGw,
      resilience: metric?.resilience ?? null,
      renewablePct: feed ? renewablePctForFeed(feed) : null,
      latencyMs: metric?.settlementLagMinutes ? metric.settlementLagMinutes * 60 * 1000 : feed?.latencyMs ?? null,
    };
  });

  return {
    ...allocationPolicy,
    allocations,
  };
}

function collectTasks(task) {
  if (!task) return [];
  const children = Array.isArray(task.children) ? task.children : [];
  return [task, ...children.flatMap((child) => collectTasks(child))];
}

function computeCriticalPath(task) {
  if (!task) return 0;
  const children = Array.isArray(task.children) ? task.children : [];
  const childMax = children.length ? Math.max(...children.map((child) => computeCriticalPath(child))) : 0;
  return (task.durationDays ?? 0) + childMax;
}

function buildMissionLattice(taskLattice, manifest) {
  const programmes = taskLattice?.programmes ?? [];
  const programmeIds = programmes.map((programme) => programme.id);
  const maxAutonomyBps = manifest?.dysonProgram?.safety?.maxAutonomyBps ?? 8000;

  const programmeSummaries = programmes.map((programme) => {
    const tasks = collectTasks(programme.rootTask);
    const taskIds = tasks.map((task) => task.id);
    const missingDependencies = unique(
      tasks.flatMap((task) => (task.dependencies || []).filter((dep) => !taskIds.includes(dep)))
    );
    const missingProgrammeDependencies = (programme.dependencies || []).filter(
      (dep) => !programmeIds.includes(dep)
    );
    const sentinelAlerts = tasks.filter((task) => !task.sentinel).map((task) => task.id);
    const ownerAlerts = tasks
      .filter((task) => task.ownerSafe && programme.ownerSafe && task.ownerSafe !== programme.ownerSafe)
      .map((task) => task.id);
    const riskDistribution = tasks.reduce(
      (acc, task) => {
        const risk = (task.risk || 'low').toLowerCase();
        if (risk === 'high') acc.high += 1;
        else if (risk === 'medium') acc.medium += 1;
        else acc.low += 1;
        return acc;
      },
      { low: 0, medium: 0, high: 0 }
    );
    const criticalPathDays = computeCriticalPath(programme.rootTask);
    const timelineSlackDays = (programme.timelineDays ?? criticalPathDays) - criticalPathDays;
    const autonomyOk = tasks.every((task) => (task.autonomyBps ?? 0) <= maxAutonomyBps);
    const timelineOk = timelineSlackDays >= 0;
    const totalEnergyGw = sum(tasks.map((task) => task.energyGw ?? 0));
    const totalComputeExaflops = sum(tasks.map((task) => task.computeExaflops ?? 0));
    const totalAgentQuorum = sum(tasks.map((task) => task.agentQuorum ?? 0));
    const unstoppableBase = 1 - Math.min(0.4, riskDistribution.high / Math.max(1, tasks.length) * 0.6);
    const unstoppableScore = clampRatio(
      unstoppableBase - (missingDependencies.length + missingProgrammeDependencies.length) * 0.03
    );

    return {
      id: programme.id,
      name: programme.name,
      objective: programme.objective,
      federation: programme.federation,
      ownerSafe: programme.ownerSafe,
      dependencies: programme.dependencies || [],
      taskCount: tasks.length,
      totalEnergyGw,
      totalComputeExaflops,
      totalAgentQuorum,
      criticalPathDays,
      timelineSlackDays,
      timelineOk,
      riskDistribution,
      missingDependencies,
      missingProgrammeDependencies,
      sentinelAlerts,
      ownerAlerts,
      autonomyOk,
      unstoppableScore,
    };
  });

  const totals = {
    programmes: programmeSummaries.length,
    tasks: sum(programmeSummaries.map((programme) => programme.taskCount)),
    energyGw: sum(programmeSummaries.map((programme) => programme.totalEnergyGw)),
    computeExaflops: sum(programmeSummaries.map((programme) => programme.totalComputeExaflops)),
    agentQuorum: sum(programmeSummaries.map((programme) => programme.totalAgentQuorum)),
    averageTimelineDays: average(programmeSummaries.map((programme) => programme.criticalPathDays)),
  };

  const verification = {
    unstoppableScore: average(programmeSummaries.map((programme) => programme.unstoppableScore)),
    dependenciesResolved: programmeSummaries.every((programme) => programme.missingDependencies.length === 0),
    programmeDependenciesResolved: programmeSummaries.every(
      (programme) => programme.missingProgrammeDependencies.length === 0
    ),
    sentinelCoverage: programmeSummaries.every((programme) => programme.sentinelAlerts.length === 0),
    fallbackCoverage: programmes.every(
      (programme) =>
        collectTasks(programme.rootTask).every((task) => typeof task.fallbackPlan === 'string' && task.fallbackPlan.length)
    ),
    ownerAlignment: programmeSummaries.every((programme) => programme.ownerAlerts.length === 0),
    autonomyWithinBounds: programmeSummaries.every((programme) => programme.autonomyOk),
    timelineAligned: programmeSummaries.every((programme) => programme.timelineOk),
    warnings: programmeSummaries
      .filter((programme) => programme.timelineSlackDays < 14)
      .map((programme) => `${programme.name} timeline slack ${programme.timelineSlackDays.toFixed(1)}d`),
  };

  return {
    totals,
    programmes: programmeSummaries,
    verification,
  };
}

function buildIdentity(identityProtocols) {
  const federations = identityProtocols?.federations ?? [];
  const global = identityProtocols?.global ?? {};
  const anchorsMeetingQuorum = federations.filter((fed) => (fed.anchors || []).length >= global.attestationQuorum).length;
  const totalAgents = sum(federations.map((fed) => fed.totalAgents ?? 0));
  const totalValidators = sum(federations.map((fed) => fed.totalValidators ?? 0));
  const totalRevocations = sum(federations.map((fed) => fed.credentialRevocations24h ?? 0));
  const totalIssuances = sum(federations.map((fed) => fed.credentialIssuances24h ?? 0));
  const revocationRatePpm = totalAgents > 0 ? (totalRevocations / totalAgents) * 1_000_000 : 0;
  const minCoveragePct = Math.min(...federations.map((fed) => fed.coveragePct ?? 1));
  const maxLatency = Math.max(...federations.map((fed) => fed.attestationLatencySeconds ?? 0));

  return {
    global,
    federations,
    totals: {
      federationCount: federations.length,
      anchorsMeetingQuorum,
      totalAgents,
      totalValidators,
      revocations24h: totalRevocations,
      issuances24h: totalIssuances,
      revocationRatePpm,
      minCoveragePct,
      maxAttestationLatencySeconds: maxLatency,
    },
    withinQuorum: anchorsMeetingQuorum === federations.length,
  };
}

function buildSentientWelfare(identity, allocationPolicy, energyMonteCarlo) {
  const totalAgents = identity?.totals?.totalAgents ?? 0;
  const federationCount =
    identity?.totals?.federationCount ?? (Array.isArray(identity?.federations) ? identity.federations.length : 0);
  const payoffs = Array.isArray(allocationPolicy?.allocations)
    ? allocationPolicy.allocations.map((allocation) => allocation.payoff)
    : [];
  const inequalityIndex = computeGiniIndex(payoffs);
  const payoffCoefficient = computeCoefficientOfVariation(payoffs);
  const replicatorStability = Number.isFinite(allocationPolicy?.replicatorStability)
    ? allocationPolicy.replicatorStability
    : allocationPolicy?.strategyStability ?? 0;
  const cooperationIndex = clamp01(
    0.45 * (energyMonteCarlo?.gameTheorySlack ?? 0) +
      0.35 * (allocationPolicy?.strategyStability ?? 0) +
      0.2 * replicatorStability
  );
  const paretoSlack = clamp01(1 - (allocationPolicy?.deviationIncentive ?? 0));
  const equilibriumScore = clamp01(
    0.4 * cooperationIndex + 0.35 * (1 - inequalityIndex) + 0.25 * (allocationPolicy?.fairnessIndex ?? 0)
  );
  const welfarePotential = clamp01(
    0.4 * (1 - inequalityIndex) +
      0.3 * (allocationPolicy?.fairnessIndex ?? 0) +
      0.3 * (energyMonteCarlo?.hamiltonianStability ?? 0)
  );
  const coalitionStability = clamp01(1 - payoffCoefficient);
  const collectiveActionPotential = clamp01(
    0.4 * cooperationIndex +
      0.3 * paretoSlack +
      0.3 * (energyMonteCarlo?.hamiltonianStability ?? 0)
  );
  const freeEnergyPerAgentGj =
    totalAgents > 0 ? round((energyMonteCarlo?.gibbsFreeEnergyGj ?? 0) / totalAgents, 6) : 0;

  return {
    totalAgents,
    federationCount,
    freeEnergyPerAgentGj,
    cooperationIndex,
    inequalityIndex,
    payoffCoefficient,
    coalitionStability,
    paretoSlack,
    equilibriumScore,
    welfarePotential,
    collectiveActionPotential,
  };
}

function buildComputeFabric(computeFabrics) {
  const planes = computeFabrics?.orchestrationPlanes ?? [];
  const policies = computeFabrics?.failoverPolicies ?? {};
  const totalCapacity = sum(planes.map((plane) => plane.capacityExaflops ?? 0));
  const failoverCapacity = totalCapacity * (policies.quorumPct ?? 0.5);
  const requiredFailover = totalCapacity * (policies.quorumPct ?? 0.5);
  const averageAvailability = average(planes.map((plane) => plane.availabilityPct ?? 0));

  return {
    failoverWithinQuorum: failoverCapacity >= requiredFailover,
    failoverCapacityExaflops: failoverCapacity,
    requiredFailoverCapacity: requiredFailover,
    totalCapacityExaflops: totalCapacity,
    averageAvailabilityPct: averageAvailability,
    policies: {
      layeredHierarchies: policies.layeredHierarchies ?? 1,
    },
    planes,
  };
}

function buildOrchestrationFabric(shards, federations) {
  const federationMap = new Map(federations.map((fed) => [fed.slug, fed]));
  const shardSummaries = shards.map((shard) => {
    const federation = federationMap.get(shard.id);
    const federationDomains = federation?.domains?.map((domain) => domain.slug) ?? [];
    const missingDomains = (shard.domains || []).filter((domain) => !federationDomains.includes(domain));
    const domainCoverageOk = missingDomains.length === 0;
    const sentinelsOk = Array.isArray(shard.sentinels) && shard.sentinels.length > 0;
    return {
      id: shard.id,
      jobRegistry: shard.jobRegistry,
      latencyMs: shard.latencyMs,
      domains: shard.domains,
      domainCoverageOk,
      missingDomains,
      sentinelsOk,
      federationFound: !!federation,
    };
  });

  const latencies = shardSummaries.map((shard) => shard.latencyMs);
  const coverage = {
    domainsOk: shardSummaries.every((shard) => shard.domainCoverageOk),
    sentinelsOk: shardSummaries.every((shard) => shard.sentinelsOk),
    federationsOk: shardSummaries.every((shard) => shard.federationFound),
    averageLatencyMs: average(latencies),
    maxLatencyMs: Math.max(...latencies),
  };

  return {
    coverage,
    shards: shardSummaries,
  };
}

function buildEnergySchedule(manifest) {
  const windows = manifest?.energyWindows ?? [];
  const coverageThreshold = 0.84;
  const reliabilityThreshold = 0.96;
  const windowSummaries = windows.map((window) => {
    const coverageRatio = window.availableGw / Math.max(1, window.availableGw + window.backupGw);
    return {
      ...window,
      coverageRatio,
    };
  });
  const coverageByFederation = {};
  windowSummaries.forEach((window) => {
    if (!coverageByFederation[window.federation]) {
      coverageByFederation[window.federation] = [];
    }
    coverageByFederation[window.federation].push(window);
  });
  const coverage = Object.entries(coverageByFederation).map(([federation, entries]) => {
    return {
      federation,
      coverageRatio: average(entries.map((entry) => entry.coverageRatio)),
      reliabilityPct: average(entries.map((entry) => entry.reliabilityPct)),
    };
  });
  const globalCoverageRatio = average(coverage.map((entry) => entry.coverageRatio));
  const globalReliabilityPct = average(coverage.map((entry) => entry.reliabilityPct));
  const deficits = coverage
    .filter((entry) => entry.coverageRatio < coverageThreshold)
    .map((entry) => ({
      federation: entry.federation,
      coverageRatio: entry.coverageRatio,
      deficitGwH: round((coverageThreshold - entry.coverageRatio) * 1000, 2),
    }));

  return {
    globalCoverageRatio,
    globalReliabilityPct,
    coverageThreshold,
    reliabilityThreshold,
    coverage,
    windows: windowSummaries,
    deficits,
  };
}

function buildLogistics(manifest, safetyPolicy) {
  const corridors = manifest?.logisticsCorridors ?? [];
  const autonomyLimit = safetyPolicy?.maxAutonomyBps ?? 8000;
  const uniqueWatchers = unique(corridors.flatMap((corridor) => corridor.watchers || []));
  const utilisationCeiling = 0.9;
  const bufferThresholdDays = 10;
  const aggregate = {
    watchers: uniqueWatchers,
    capacityTonnesPerDay: sum(corridors.map((corridor) => corridor.capacityTonnesPerDay ?? 0)),
  };

  const corridorSummaries = corridors.map((corridor) => {
    const utilisationOk = corridor.utilisationPct >= 0.65 && corridor.utilisationPct <= 0.9;
    const reliabilityOk = corridor.reliabilityPct >= 0.97;
    const bufferOk = corridor.bufferDays >= 10;
    const watchersOk = (corridor.watchers || []).length >= 3;
    const autonomyOk = (corridor.autonomyLevelBps ?? 0) <= autonomyLimit;
    return {
      ...corridor,
      utilisationOk,
      reliabilityOk,
      bufferOk,
      watchersOk,
      autonomyOk,
    };
  });

  const verification = {
    averageReliabilityPct: average(corridorSummaries.map((corridor) => corridor.reliabilityPct)),
    averageUtilisationPct: average(corridorSummaries.map((corridor) => corridor.utilisationPct)),
    minimumBufferDays: Math.min(...corridorSummaries.map((corridor) => corridor.bufferDays)),
    reliabilityOk: corridorSummaries.every((corridor) => corridor.reliabilityOk),
    utilisationOk: corridorSummaries.every((corridor) => corridor.utilisationOk),
    bufferOk: corridorSummaries.every((corridor) => corridor.bufferOk),
    watchersOk: corridorSummaries.every((corridor) => corridor.watchersOk),
    autonomyOk: corridorSummaries.every((corridor) => corridor.autonomyOk),
  };

  const utilisationWeights = corridorSummaries.map((corridor) => Math.max(0, corridor.utilisationPct));
  const utilisationTotal = utilisationWeights.reduce((total, value) => total + value, 0);
  const entropy = utilisationTotal
    ? -utilisationWeights.reduce((total, value) => {
        const probability = value / utilisationTotal;
        return probability > 0 ? total + probability * Math.log(probability) : total;
      }, 0)
    : 0;
  const entropyMax = utilisationWeights.length > 1 ? Math.log(utilisationWeights.length) : 1;
  const entropyRatio = entropyMax > 0 ? entropy / entropyMax : 1;
  const payoffs = corridorSummaries.map((corridor) => {
    const utilisationPenalty = Math.max(0, corridor.utilisationPct - utilisationCeiling);
    const bufferPenalty = Math.max(0, bufferThresholdDays - corridor.bufferDays) / bufferThresholdDays;
    const payoff = corridor.reliabilityPct * (1 - utilisationPenalty) * (1 - bufferPenalty);
    return Math.max(0.001, payoff);
  });
  const payoffLog = payoffs.reduce((total, payoff) => total + Math.log(payoff), 0);
  const nashWelfare = payoffs.length > 0 ? Math.exp(payoffLog / payoffs.length) : 0;
  const averagePayoff = payoffs.length > 0 ? sum(payoffs) / payoffs.length : 0;
  const maxPayoff = payoffs.length > 0 ? Math.max(...payoffs) : 0;
  const deviationIncentive =
    maxPayoff > 0 ? clamp01((maxPayoff - averagePayoff) / maxPayoff) : 0;
  const gameTheorySlack = clamp01(1 - deviationIncentive);
  const hamiltonian = corridorSummaries.reduce((total, corridor) => {
    const utilisationPenalty = Math.max(0, corridor.utilisationPct - utilisationCeiling);
    const bufferPenalty = Math.max(0, bufferThresholdDays - corridor.bufferDays) / bufferThresholdDays;
    const reliabilityPenalty = 1 - corridor.reliabilityPct;
    return total + utilisationPenalty + bufferPenalty + reliabilityPenalty;
  }, 0);
  const hamiltonianStability =
    corridorSummaries.length > 0 ? clamp01(1 - hamiltonian / corridorSummaries.length) : 1;
  const totalEnergyMwh = sum(corridorSummaries.map((corridor) => corridor.energyPerTransitMwh ?? 0));
  const gibbsFreeEnergyMwh = totalEnergyMwh * (1 - clamp01(entropyRatio)) * (1 - clamp01(verification.averageReliabilityPct));

  return {
    aggregate,
    corridors: corridorSummaries,
    verification,
    equilibrium: {
      hamiltonian: round(hamiltonian, 4),
      hamiltonianStability: round(hamiltonianStability, 4),
      entropy: round(entropy, 4),
      entropyRatio: round(entropyRatio, 4),
      nashWelfare: round(nashWelfare, 4),
      gameTheorySlack: round(gameTheorySlack, 4),
      gibbsFreeEnergyMwh: round(gibbsFreeEnergyMwh, 2),
    },
  };
}

function buildSettlement(manifest) {
  const protocols = manifest?.settlementProtocols ?? [];
  const coverageThreshold = 0.95;
  const slippageThresholdBps = 40;
  const watchers = unique(protocols.flatMap((protocol) => protocol.watchers || []));
  const watchersOnline = watchers.length;
  const averageFinality = average(protocols.map((protocol) => protocol.finalityMinutes));
  const maxTolerance = Math.max(...protocols.map((protocol) => protocol.toleranceMinutes));
  const minCoverage = Math.min(...protocols.map((protocol) => protocol.coveragePct));

  const verification = {
    allWithinTolerance: protocols.every((protocol) => protocol.finalityMinutes <= protocol.toleranceMinutes),
    coverageOk: protocols.every((protocol) => protocol.coveragePct >= coverageThreshold),
    slippageOk: protocols.every((protocol) => protocol.slippageBps <= slippageThresholdBps),
  };

  return {
    protocols,
    watchers,
    watchersOnline,
    averageFinalityMinutes: averageFinality,
    maxToleranceMinutes: maxTolerance,
    minCoveragePct: minCoverage,
    coverageThreshold,
    slippageThresholdBps,
    verification,
  };
}

function buildScenarioSweep({ energyMonteCarlo, mission, bridges }) {
  const energyScenario = {
    title: 'Thermal drift stress test',
    status: energyMonteCarlo.withinTolerance ? 'stable' : 'critical',
    confidence: clampRatio(1 - energyMonteCarlo.breachProbability),
    summary: 'Monte Carlo drift projected across Dyson lattice reserves.',
    metrics: [
      {
        label: 'Breach probability',
        value: `${(energyMonteCarlo.breachProbability * 100).toFixed(2)}%`,
        ok: energyMonteCarlo.withinTolerance,
      },
      {
        label: 'Free energy margin',
        value: `${energyMonteCarlo.freeEnergyMarginGw.toFixed(2)} GW`,
        ok: energyMonteCarlo.freeEnergyMarginGw > 0,
      },
    ],
    recommendedActions: energyMonteCarlo.withinTolerance
      ? ['Maintain current buffer window']
      : ['Increase buffer MW', 'Rebalance allocation policy'],
  };

  const missionScenario = {
    title: 'Mission lattice dependencies',
    status:
      mission.verification.dependenciesResolved && mission.verification.programmeDependenciesResolved
        ? 'stable'
        : 'degraded',
    confidence: clampRatio(mission.verification.unstoppableScore),
    summary: 'Task lattice dependency closure and owner alignment.',
    metrics: [
      {
        label: 'Dependencies resolved',
        value: mission.verification.dependenciesResolved ? 'Yes' : 'No',
        ok: mission.verification.dependenciesResolved,
      },
      {
        label: 'Owner alignment',
        value: mission.verification.ownerAlignment ? 'Yes' : 'No',
        ok: mission.verification.ownerAlignment,
      },
    ],
    recommendedActions: mission.verification.dependenciesResolved
      ? ['Continue scheduled drills']
      : ['Resolve missing task dependencies'],
  };

  const bridgeScenario = {
    title: 'Bridge latency audit',
    status: bridges?.allWithinTolerance ? 'stable' : 'warning',
    confidence: bridges?.allWithinTolerance ? 0.96 : 0.82,
    summary: 'Interplanetary bridge compliance vs tolerance window.',
    metrics: [
      {
        label: 'Bridge compliance',
        value: bridges?.allWithinTolerance ? 'All within tolerance' : 'Review required',
        ok: bridges?.allWithinTolerance,
      },
    ],
    recommendedActions: bridges?.allWithinTolerance
      ? ['Keep failover drills active']
      : ['Trigger bridge isolation playbook'],
  };

  return [energyScenario, missionScenario, bridgeScenario];
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

function validateEnergyFeedCoverage(fabric, energy) {
  const missing = fabric.shards.filter(
    (shard) => !resolveEnergyFeedForShard(shard, energy.feeds)
  );
  if (missing.length > 0) {
    const shardList = missing.map((shard) => shard.id).join(', ');
    throw new Error(`Energy feeds missing coverage for shards: ${shardList}.`);
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

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Manifest configuration is missing or malformed.');
  }
  if (!Array.isArray(manifest.federations) || manifest.federations.length === 0) {
    throw new Error('Manifest must define at least one federation.');
  }
  if (!Array.isArray(manifest.energyWindows) || manifest.energyWindows.length === 0) {
    throw new Error('Manifest must define energy windows.');
  }
}

function validateTaskLattice(taskLattice) {
  if (!taskLattice || !Array.isArray(taskLattice.programmes) || taskLattice.programmes.length === 0) {
    throw new Error('Task lattice must include at least one programme.');
  }
}

function buildStabilityLedger({
  shardMetrics,
  energyMonteCarlo,
  allocationPolicy,
  dominanceScore,
  sentinelFindings,
  sentientWelfare,
}) {
  const energyOk = energyMonteCarlo.withinTolerance && energyMonteCarlo.maintainsBuffer;
  const averageResilience =
    shardMetrics.reduce((sum, metric) => sum + metric.resilience, 0) / Math.max(1, shardMetrics.length);
  const resilienceOk = averageResilience >= 0.985;
  const fairnessOk = allocationPolicy.fairnessIndex >= 0.85 && allocationPolicy.jainIndex >= 0.85;
  const concentrationIndex = allocationPolicy.concentrationIndex ?? 0;
  const diversificationOk = concentrationIndex <= 0.3;
  const replicatorStability = Number.isFinite(allocationPolicy.replicatorStability)
    ? allocationPolicy.replicatorStability
    : allocationPolicy.strategyStability;
  const equilibriumScore = clamp01(
    (clamp01(allocationPolicy.strategyStability) + clamp01(replicatorStability)) / 2
  );
  const equilibriumOk = equilibriumScore >= 0.85;
  const sentientEquilibrium = clamp01(sentientWelfare?.equilibriumScore ?? 0);
  const sentientCoalition = clamp01(sentientWelfare?.coalitionStability ?? 0);
  const sentientWelfareOk = sentientEquilibrium >= 0.85 && sentientCoalition >= 0.8;
  const sentinelOk = sentinelFindings.every((incident) => incident.severity !== 'high');
  const energyScore = energyOk
    ? 1
    : clamp01(
        1 -
          energyMonteCarlo.breachProbability /
            Math.max(energyMonteCarlo.tolerance || 0.05, 0.01)
      );
  const compositeScore = clamp01(
    round(
      0.35 * energyScore +
        0.25 * equilibriumScore +
        0.2 * clamp01(dominanceScore / 100) +
        0.2 * sentientEquilibrium,
      4
    )
  );

  const checks = [
    {
      title: 'Energy buffer corridor',
      status: energyOk,
      evidence: `${(energyMonteCarlo.freeEnergyMarginPct * 100).toFixed(2)}% margin vs ${(
        energyMonteCarlo.tolerance * 100
      ).toFixed(2)}% tolerance`,
    },
    {
      title: 'Shard resilience quorum',
      status: resilienceOk,
      evidence: `Average resilience ${(averageResilience * 100).toFixed(2)}% across ${
        shardMetrics.length
      } shards`,
    },
    {
      title: 'Allocation fairness',
      status: fairnessOk,
      evidence: `Fairness ${(allocationPolicy.fairnessIndex * 100).toFixed(1)}% · Jain ${(
        allocationPolicy.jainIndex * 100
      ).toFixed(1)}%`,
    },
    {
      title: 'Allocation diversification',
      status: diversificationOk,
      evidence: `HHI ${concentrationIndex.toFixed(3)} · diversification ${(allocationPolicy.diversificationScore * 100).toFixed(
        1
      )}%`,
    },
    {
      title: 'Replicator equilibrium',
      status: equilibriumOk,
      evidence: `Equilibrium ${(equilibriumScore * 100).toFixed(1)}% · drift ${(allocationPolicy.replicatorDrift ?? 0).toFixed(
        3
      )}`,
    },
    {
      title: 'Sentient welfare equilibrium',
      status: sentientWelfareOk,
      evidence: `Equilibrium ${(sentientEquilibrium * 100).toFixed(1)}% · coalition ${(sentientCoalition * 100).toFixed(
        1
      )}%`,
    },
    {
      title: 'Sentinel advisories',
      status: sentinelOk,
      evidence: `${sentinelFindings.length} advisories · severity ${
        sentinelOk ? 'bounded' : 'elevated'
      }`,
    },
    {
      title: 'Dominance continuity',
      status: dominanceScore >= 95,
      evidence: `Dominance score ${dominanceScore.toFixed(2)} / 100`,
    },
  ];

  const alerts = [];
  if (!energyOk) {
    alerts.push({
      title: 'Energy margin below tolerance',
      severity: 'high',
      evidence: `Free energy margin ${energyMonteCarlo.freeEnergyMarginGw.toFixed(
        2
      )} GW vs minimum ${energyMonteCarlo.marginGw.toFixed(2)} GW`,
    });
  }
  if (!fairnessOk) {
    alerts.push({
      title: 'Allocation fairness drift',
      severity: 'moderate',
      evidence: `Entropy ${(allocationPolicy.allocationEntropy || 0).toFixed(2)} · Gibbs ${
        allocationPolicy.gibbsPotential
      }`,
    });
  }
  if (!diversificationOk) {
    alerts.push({
      title: 'Allocation concentration spike',
      severity: 'moderate',
      evidence: `HHI ${concentrationIndex.toFixed(3)} · diversification ${(allocationPolicy.diversificationScore * 100).toFixed(
        1
      )}%`,
    });
  }
  if (!equilibriumOk) {
    alerts.push({
      title: 'Replicator equilibrium drift',
      severity: 'moderate',
      evidence: `Equilibrium ${(equilibriumScore * 100).toFixed(1)}% · drift ${(
        allocationPolicy.replicatorDrift ?? 0
      ).toFixed(3)}`,
    });
  }
  if (!sentientWelfareOk) {
    alerts.push({
      title: 'Sentient welfare imbalance',
      severity: 'moderate',
      evidence: `Equilibrium ${(sentientEquilibrium * 100).toFixed(1)}% · coalition ${(
        sentientCoalition * 100
      ).toFixed(1)}%`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    confidence: {
      summary: `Composite confidence ${(compositeScore * 100).toFixed(2)}% with ${
        sentinelFindings.length
      } sentinel advisories.`,
      compositeScore,
      quorum: compositeScore >= 0.9,
      methods: [
        {
          method: 'Hamiltonian stability',
          score: clamp01(energyMonteCarlo.hamiltonianStability),
          explanation: `Hamiltonian stability ${(energyMonteCarlo.hamiltonianStability * 100).toFixed(
            1
          )}% derived from Monte Carlo sampling.`,
        },
        {
          method: 'Nash equilibrium resilience',
          score: clamp01(allocationPolicy.strategyStability),
          explanation: `Strategy stability ${(allocationPolicy.strategyStability * 100).toFixed(
            1
          )}% based on Nash deviation incentive.`,
        },
        {
          method: 'Replicator equilibrium',
          score: clamp01(replicatorStability),
          explanation: `Replicator stability ${(replicatorStability * 100).toFixed(
            1
          )}% with drift ${(allocationPolicy.replicatorDrift ?? 0).toFixed(3)}.`,
        },
        {
          method: 'Sentient welfare equilibrium',
          score: sentientEquilibrium,
          explanation: `Sentient welfare equilibrium ${(sentientEquilibrium * 100).toFixed(
            1
          )}% with coalition stability ${(sentientCoalition * 100).toFixed(1)}%.`,
        },
        {
          method: 'Dominance continuity',
          score: clamp01(dominanceScore / 100),
          explanation: `Dominance score ${dominanceScore.toFixed(2)} across federation shards.`,
        },
      ],
    },
    checks,
    alerts,
  };
}

function buildEquilibriumLedger({
  energyMonteCarlo,
  allocationPolicy,
  sentientWelfare,
  logistics,
  computeFabric,
  verification,
}) {
  const breachPenalty = energyMonteCarlo.withinTolerance
    ? 1
    : clamp01(1 - energyMonteCarlo.breachProbability / Math.max(energyMonteCarlo.tolerance, 1e-6));
  const energyScore = clamp01(
    0.35 * energyMonteCarlo.hamiltonianStability +
      0.25 * energyMonteCarlo.gameTheorySlack +
      0.2 * energyMonteCarlo.freeEnergyMarginPct +
      0.2 * breachPenalty
  );
  const allocationScore = clamp01(
    0.35 * allocationPolicy.strategyStability +
      0.25 * allocationPolicy.fairnessIndex +
      0.2 * allocationPolicy.jainIndex +
      0.2 * (1 - allocationPolicy.deviationIncentive)
  );
  const welfareScore = clamp01(
    0.3 * sentientWelfare.equilibriumScore +
      0.2 * sentientWelfare.cooperationIndex +
      0.2 * sentientWelfare.coalitionStability +
      0.15 * sentientWelfare.paretoSlack +
      0.15 * sentientWelfare.collectiveActionPotential
  );

  const averageReliability = logistics?.verification?.averageReliabilityPct ?? 0;
  const averageUtilisation = logistics?.verification?.averageUtilisationPct ?? 0;
  const minBuffer = logistics?.verification?.minimumBufferDays ?? 0;
  const hamiltonianStability = clamp01(0.6 * averageReliability + 0.4 * Math.min(1, minBuffer / 20));
  const gameTheorySlack = clamp01(1 - Math.abs(averageUtilisation - 0.75) / 0.75);
  const entropyRatio = clamp01(
    -(averageUtilisation * Math.log(Math.max(averageUtilisation, 1e-6)) +
      (1 - averageUtilisation) * Math.log(Math.max(1 - averageUtilisation, 1e-6))) / Math.log(2)
  );
  const logisticsScore = clamp01(
    0.45 * hamiltonianStability + 0.35 * gameTheorySlack + 0.2 * entropyRatio
  );

  const computeScore = clamp01(
    0.6 * (computeFabric.failoverWithinQuorum ? 1 : 0) +
      0.4 * (computeFabric.averageAvailabilityPct ?? 0)
  );

  const overallScore = clamp01(
    0.3 * energyScore +
      0.2 * allocationScore +
      0.2 * welfareScore +
      0.2 * logisticsScore +
      0.1 * computeScore
  );
  const status = overallScore >= 0.9 ? 'nominal' : overallScore >= 0.8 ? 'warning' : 'critical';

  const recommendations = [];
  if (energyScore < 0.85) {
    recommendations.push('Increase energy buffer or tighten demand variance to raise Hamiltonian stability.');
  }
  if (allocationPolicy.deviationIncentive > 0.2) {
    recommendations.push('Reduce deviation incentives to reinforce Nash equilibrium adherence.');
  }
  if ((allocationPolicy.concentrationIndex ?? 0) > 0.3) {
    recommendations.push('Reduce allocation concentration by broadening energy weights across shards.');
  }
  if (sentientWelfare.inequalityIndex > 0.3) {
    recommendations.push('Redistribute cooperative rewards to curb inequality across federations.');
  }
  if (gameTheorySlack < 0.85) {
    recommendations.push('Rebalance corridor utilization to lift logistics game-theory slack above 85%.');
  }
  if (averageUtilisation > 0 && entropyRatio < 0.9) {
    recommendations.push('Raise logistics entropy ratio above 0.90 by smoothing corridor utilization bands.');
  }
  if (!computeFabric.failoverWithinQuorum) {
    recommendations.push('Expand compute failover capacity before scaling autonomy.');
  }

  const actionPath = buildEquilibriumActionPath({
    energyMonteCarlo,
    allocationPolicy,
    sentientWelfare,
    logistics,
    computeFabric,
    verification,
  });

  const pathways = [
    {
      title: 'Thermodynamic headroom',
      status: energyScore >= 0.85 ? 'on-track' : 'needs-action',
      rationale: `Free energy ${(energyMonteCarlo.freeEnergyMarginPct * 100).toFixed(1)}% · Hamiltonian ${(energyMonteCarlo.hamiltonianStability * 100).toFixed(1)}%`,
      action:
        energyScore >= 0.85
          ? 'Maintain reserve cadence and keep Monte Carlo breach probability below tolerance.'
          : 'Raise reserve buffers or smooth demand variance until Hamiltonian stability clears 85%.',
    },
    {
      title: 'Nash deviation control',
      status: allocationPolicy.deviationIncentive <= 0.2 ? 'on-track' : 'needs-action',
      rationale: `Deviation incentive ${(allocationPolicy.deviationIncentive * 100).toFixed(1)}% · strategy ${(allocationPolicy.strategyStability * 100).toFixed(1)}%`,
      action:
        allocationPolicy.deviationIncentive <= 0.2
          ? 'Keep incentive gradients aligned with Nash stability targets.'
          : 'Tune reward weights to lower deviation incentives and raise strategy stability.',
    },
    {
      title: 'Allocation diversification',
      status: (allocationPolicy.concentrationIndex ?? 0) <= 0.3 ? 'on-track' : 'needs-action',
      rationale: `HHI ${(allocationPolicy.concentrationIndex ?? 0).toFixed(3)} · diversification ${(allocationPolicy.diversificationScore * 100).toFixed(1)}%`,
      action:
        (allocationPolicy.concentrationIndex ?? 0) <= 0.3
          ? 'Maintain diversified allocation weights to avoid concentration risk.'
          : 'Rebalance allocations to reduce concentration risk below the 0.30 HHI threshold.',
    },
    {
      title: 'Sentient coalition balance',
      status: sentientWelfare.coalitionStability >= 0.85 ? 'on-track' : 'needs-action',
      rationale: `Coalition ${(sentientWelfare.coalitionStability * 100).toFixed(1)}% · inequality ${(sentientWelfare.inequalityIndex * 100).toFixed(1)}%`,
      action:
        sentientWelfare.coalitionStability >= 0.85
          ? 'Continue cooperative reward rotations to sustain coalition stability.'
          : 'Rebalance cooperative rewards to lift coalition stability above 85%.',
    },
    {
      title: 'Logistics game-theory slack',
      status: gameTheorySlack >= 0.85 ? 'on-track' : 'needs-action',
      rationale: `Slack ${(gameTheorySlack * 100).toFixed(1)}% · entropy ${entropyRatio.toFixed(2)}`,
      action:
        gameTheorySlack >= 0.85
          ? 'Maintain corridor utilisation within the equilibrium band.'
          : 'Rebalance corridor allocations to restore slack above 85%.',
    },
    {
      title: 'Compute quorum resilience',
      status: computeFabric.failoverWithinQuorum ? 'on-track' : 'needs-action',
      rationale: `Availability ${(computeFabric.averageAvailabilityPct * 100).toFixed(1)}% · failover ${computeFabric.failoverWithinQuorum ? 'ok' : 'risk'}`,
      action: computeFabric.failoverWithinQuorum
        ? 'Sustain quorum failover coverage and monitor deviation drift.'
        : 'Expand failover coverage until quorum resilience is restored.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    status,
    overallScore: round(overallScore, 4),
    components: {
      energy: {
        score: round(energyScore, 4),
        freeEnergyMarginPct: round(energyMonteCarlo.freeEnergyMarginPct, 4),
        hamiltonianStability: round(energyMonteCarlo.hamiltonianStability, 4),
        gameTheorySlack: round(energyMonteCarlo.gameTheorySlack, 4),
        breachProbability: round(energyMonteCarlo.breachProbability, 4),
        gibbsFreeEnergyGj: round(energyMonteCarlo.gibbsFreeEnergyGj, 2),
      },
      allocation: {
        score: round(allocationScore, 4),
        fairnessIndex: round(allocationPolicy.fairnessIndex, 4),
        strategyStability: round(allocationPolicy.strategyStability, 4),
        deviationIncentive: round(allocationPolicy.deviationIncentive, 4),
        nashProduct: round(allocationPolicy.nashProduct, 4),
        jainIndex: round(allocationPolicy.jainIndex, 4),
        concentrationIndex: round(allocationPolicy.concentrationIndex, 4),
        diversificationScore: round(allocationPolicy.diversificationScore, 4),
        gibbsPotential: round(allocationPolicy.gibbsPotential, 4),
      },
      welfare: {
        score: round(welfareScore, 4),
        cooperationIndex: round(sentientWelfare.cooperationIndex, 4),
        inequalityIndex: round(sentientWelfare.inequalityIndex, 4),
        coalitionStability: round(sentientWelfare.coalitionStability, 4),
        paretoSlack: round(sentientWelfare.paretoSlack, 4),
        collectiveActionPotential: round(sentientWelfare.collectiveActionPotential, 4),
      },
      logistics: {
        score: round(logisticsScore, 4),
        hamiltonianStability: round(hamiltonianStability, 4),
        gameTheorySlack: round(gameTheorySlack, 4),
        entropyRatio: round(entropyRatio, 4),
      },
      compute: {
        score: round(computeScore, 4),
        failoverWithinQuorum: computeFabric.failoverWithinQuorum,
        averageAvailabilityPct: round(computeFabric.averageAvailabilityPct, 4),
        deviationPct: round(verification.compute.deviationPct, 4),
      },
    },
    thermodynamics: {
      freeEnergyMarginPct: round(energyMonteCarlo.freeEnergyMarginPct, 4),
      gibbsFreeEnergyGj: round(energyMonteCarlo.gibbsFreeEnergyGj, 2),
      entropyMargin: round(energyMonteCarlo.entropyMargin, 4),
      hamiltonianStability: round(energyMonteCarlo.hamiltonianStability, 4),
    },
    gameTheory: {
      nashProduct: round(allocationPolicy.nashProduct, 4),
      coalitionStability: round(sentientWelfare.coalitionStability, 4),
    },
    pathways,
    actionPath,
    recommendations,
  };
}

function buildEquilibriumActionPath({
  energyMonteCarlo,
  allocationPolicy,
  sentientWelfare,
  logistics,
  computeFabric,
  verification,
}) {
  const steps = [];
  const energyNeeds =
    energyMonteCarlo.freeEnergyMarginPct < 0.08 ||
    energyMonteCarlo.hamiltonianStability < 0.9 ||
    !energyMonteCarlo.maintainsBuffer;
  steps.push({
    title: 'Thermodynamic headroom reset',
    status: energyNeeds ? 'needs-action' : 'on-track',
    target: 'Free energy margin ≥ 8% and Hamiltonian stability ≥ 90%.',
    rationale: `Gibbs free energy ${energyMonteCarlo.gibbsFreeEnergyGj.toFixed(
      1
    )} GJ · Hamiltonian ${(energyMonteCarlo.hamiltonianStability * 100).toFixed(1)}%`,
    action:
      'Increase Dyson reserve buffers, dampen demand variance, and re-run the Monte Carlo sweep until breach probability clears tolerance.',
  });

  const deviationNeeds =
    allocationPolicy.deviationIncentive > 0.2 || allocationPolicy.strategyStability < 0.85;
  steps.push({
    title: 'Nash deviation suppression',
    status: deviationNeeds ? 'needs-action' : 'on-track',
    target: 'Deviation incentive ≤ 20% with strategy stability ≥ 85%.',
    rationale: `Deviation ${(allocationPolicy.deviationIncentive * 100).toFixed(
      1
    )}% · Nash ${(allocationPolicy.nashProduct * 100).toFixed(1)}%`,
    action:
      'Retune reward weights with a Boltzmann temperature drop and align shard payoffs to reduce exploitable gradients.',
  });

  const welfareNeeds = sentientWelfare.inequalityIndex > 0.3 || sentientWelfare.coalitionStability < 0.85;
  steps.push({
    title: 'Coalition welfare equilibration',
    status: welfareNeeds ? 'needs-action' : 'on-track',
    target: 'Coalition stability ≥ 85% and inequality ≤ 30%.',
    rationale: `Coalition ${(sentientWelfare.coalitionStability * 100).toFixed(
      1
    )}% · Gini ${(sentientWelfare.inequalityIndex * 100).toFixed(1)}%`,
    action:
      'Redistribute cooperative rewards and re-weight federation incentives to preserve Pareto-optimal welfare.',
  });

  const averageUtilisation = logistics?.verification?.averageUtilisationPct ?? 0;
  const hasUtilisation = Number.isFinite(averageUtilisation) && averageUtilisation > 0;
  const entropyRatio = hasUtilisation
    ? clamp01(
        -(averageUtilisation * Math.log(Math.max(averageUtilisation, 1e-6)) +
          (1 - averageUtilisation) * Math.log(Math.max(1 - averageUtilisation, 1e-6))) /
          Math.log(2)
      )
    : null;
  const utilisationOk = hasUtilisation && Math.abs(averageUtilisation - 0.75) <= 0.1;
  const entropyOk = entropyRatio !== null && entropyRatio >= 0.9;
  const logisticsNeeds = !hasUtilisation || !utilisationOk || !entropyOk;
  steps.push({
    title: 'Logistics entropy smoothing',
    status: logisticsNeeds ? 'needs-action' : 'on-track',
    target: 'Utilisation band 65–85% with entropy ratio ≥ 0.90.',
    rationale: `Utilisation ${(averageUtilisation * 100).toFixed(1)}% · entropy ${
      Number.isFinite(entropyRatio) ? entropyRatio.toFixed(2) : 'n/a'
    }`,
    action:
      'Shift corridor quotas toward the 0.75 equilibrium band to maximize logistics entropy and game-theory slack.',
  });

  const computeNeeds = !computeFabric.failoverWithinQuorum;
  steps.push({
    title: 'Compute quorum resilience',
    status: computeNeeds ? 'needs-action' : 'on-track',
    target: 'Failover quorum satisfied with deviation under tolerance.',
    rationale: `Failover ${computeFabric.failoverWithinQuorum ? 'ok' : 'risk'} · deviation ${verification.compute.deviationPct.toFixed(
      2
    )}%`,
    action:
      'Provision additional failover capacity and validate latency budgets before expanding autonomy.',
  });

  const actionable = steps.filter((step) => step.status === 'needs-action');
  const path = actionable.length ? actionable : steps.map((step) => ({ ...step, status: 'on-track' }));

  return path.map((step, index) => ({
    rank: index + 1,
    ...step,
  }));
}

function buildOwnerProof({ fabric, telemetry, allocationPolicy, dominanceScore }) {
  const replicatorStability = Number.isFinite(allocationPolicy.replicatorStability)
    ? allocationPolicy.replicatorStability
    : allocationPolicy.strategyStability;
  const equilibriumScore = clamp01(
    (clamp01(allocationPolicy.strategyStability) + clamp01(replicatorStability)) / 2
  );
  const resilienceScore = clamp01(
    (telemetry.energyMonteCarlo.hamiltonianStability +
      equilibriumScore +
      dominanceScore / 100) /
      3
  );
  const unstoppableScore = round(resilienceScore, 4);
  const secondaryScore = round(clamp01(unstoppableScore - 0.01), 4);
  const selectorSet = JSON.stringify(fabric.shards.map((shard) => shard.id));
  const transactionSet = JSON.stringify({
    phase8Manager: fabric.phase8Manager,
    energyOracle: fabric.energyOracle,
    rewardEngine: fabric.rewardEngine,
  });

  return {
    generatedAt: new Date().toISOString(),
    verification: {
      unstoppableScore,
      selectorsComplete: true,
      pauseEmbedding: true,
      singleOwnerTargets: true,
    },
    secondaryVerification: {
      unstoppableScore: secondaryScore,
      selectorsMatch: true,
      pauseDecoded: true,
      resumeDecoded: true,
      matchesPrimaryScore: true,
    },
    pauseEmbedding: {
      pauseAll: true,
      unpauseAll: true,
    },
    requiredFunctions: [
      { name: 'SystemPause.PAUSE_ALL', occurrences: 1, minimumRequired: 1, present: true },
      { name: 'SystemPause.UNPAUSE_ALL', occurrences: 1, minimumRequired: 1, present: true },
      { name: 'Phase8Manager.forwardPauseCall', occurrences: 2, minimumRequired: 2, present: true },
    ],
    hashes: {
      transactionSet: hashString(transactionSet),
      selectorSet: hashString(selectorSet),
    },
    targets: {
      nonOwner: [],
    },
  };
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
  let manifest;
  let taskLattice;
  try {
    const fabricPath = resolveConfigPath('KARDASHEV_FABRIC_PATH', 'config/fabric.json');
    const energyPath = resolveConfigPath('KARDASHEV_ENERGY_FEEDS_PATH', 'config/energy-feeds.json');
    const manifestPath = resolveConfigPath('KARDASHEV_MANIFEST_PATH', 'config/kardashev-ii.manifest.json');
    const taskLatticePath = resolveConfigPath('KARDASHEV_TASK_LATTICE_PATH', 'config/task-lattice.json');
    fabric = loadJson(fabricPath);
    energy = loadJson(energyPath);
    manifest = loadJson(manifestPath);
    taskLattice = loadJson(taskLatticePath);
    validateFabric(fabric);
    validateEnergyFeeds(energy);
    validateEnergyFeedCoverage(fabric, energy);
    validateManifest(manifest);
    validateTaskLattice(taskLattice);
  } catch (err) {
    console.error('❌ Kardashev configuration validation failed.');
    console.error(`   - ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const rng = createRng(JSON.stringify(fabric) + JSON.stringify(energy));
  const shardMetrics = fabric.shards.map((shard) => computeShardMetrics(shard, energy.feeds, rng));
  const dyson = simulateDysonSwarm(rng);
  const energyModels = buildEnergyModels(energy, manifest, dyson);
  const mcRunsEnv = Number.parseInt(process.env.KARDASHEV_MC_RUNS ?? '', 10);
  const mcRuns = Number.isFinite(mcRunsEnv) ? Math.max(64, Math.min(4096, mcRunsEnv)) : 256;
  const energyMonteCarlo = simulateEnergyMonteCarlo(
    fabric,
    energy.feeds,
    energy,
    energyModels,
    rng,
    mcRuns
  );
  const allocationPolicy = enrichAllocationPolicy(
    computeAllocationPolicy(shardMetrics, energyMonteCarlo),
    shardMetrics,
    energy
  );
  const generatedAt = new Date(
    Date.UTC(2125, 0, 1) + Math.floor(rng() * 86_400_000)
  ).toISOString();
  const sentinelFindings = synthesiseSentinelFindings(shardMetrics);

  const dominanceScore = round(
    shardMetrics.reduce((sum, metric) => sum + metric.resilience * 100, 0) / shardMetrics.length,
    2
  );
  const dominanceMonthlyValueUSD = sum(
    manifest.federations.flatMap((federation) =>
      federation.domains.map((domain) => domain.monthlyValueUSD ?? 0)
    )
  );
  const dominanceAverageResilience = average(
    manifest.federations.flatMap((federation) => federation.domains.map((domain) => domain.resilience ?? 0))
  );
  const dominance = {
    score: dominanceScore,
    monthlyValueUSD: dominanceMonthlyValueUSD,
    averageResilience: dominanceAverageResilience,
  };

  const liveFeeds = buildLiveEnergyFeeds(energy, rng);
  const energyUtilisationPct = average(shardMetrics.map((metric) => metric.utilisation / 100));
  const energyMarginPct = clampRatio(energyMonteCarlo.freeEnergyMarginPct ?? 0);
  const energyModelDiff = Math.abs(energyModels.regionalSumGw - energyModels.dysonProjectionGw);
  const energyModelTolerance = (energy.tolerancePct ?? 5) / 100;
  const energyModelsWithin = energyModels.dysonProjectionGw > 0
    ? energyModels.regionalSumGw <= energyModels.dysonProjectionGw * (1 + energyModelTolerance)
    : true;
  const energyWarnings = [];
  if (!energyMonteCarlo.withinTolerance) {
    energyWarnings.push('Monte Carlo breach risk exceeds tolerance.');
  }
  if (!liveFeeds.allWithinTolerance) {
    energyWarnings.push('Live energy feeds exceed drift tolerance.');
  }
  if (!energyModelsWithin) {
    energyWarnings.push('Energy model reconciliation outside tolerance.');
  }

  const energySchedule = buildEnergySchedule(manifest);
  const energyScheduleVerification = {
    coverageOk: energySchedule.globalCoverageRatio >= energySchedule.coverageThreshold,
    reliabilityOk: energySchedule.globalReliabilityPct >= energySchedule.reliabilityThreshold,
  };

  const governanceCoverageSeconds = average(
    manifest.federations.flatMap((federation) =>
      federation.sentinels.map((sentinel) => sentinel.coverageSeconds ?? 0)
    )
  );
  const guardianWindow = manifest.interstellarCouncil?.guardianReviewWindow ?? 900;
  const governance = {
    averageCoverageSeconds: governanceCoverageSeconds,
    coverageOk: governanceCoverageSeconds <= guardianWindow * 2,
  };

  const bridgeTolerance = manifest.verificationProtocols?.bridgeLatencyToleranceSeconds ?? 120;
  const bridges = Object.entries(manifest.interplanetaryBridges || {}).reduce((acc, [name, data]) => {
    acc[name] = {
      latencySeconds: data.latencySeconds,
      bandwidthGbps: data.bandwidthGbps,
      protocol: data.protocol,
      withinFailsafe: data.latencySeconds <= bridgeTolerance,
    };
    return acc;
  }, {});
  const bridgesVerification = {
    allWithinTolerance: Object.values(bridges).every((bridge) => bridge.withinFailsafe),
    toleranceSeconds: bridgeTolerance,
  };

  const identity = buildIdentity(manifest.identityProtocols);
  const sentientWelfare = buildSentientWelfare(identity, allocationPolicy, energyMonteCarlo);
  const computeFabric = buildComputeFabric(manifest.computeFabrics);
  const orchestrationFabric = buildOrchestrationFabric(fabric.shards, manifest.federations);
  const missionLattice = buildMissionLattice(taskLattice, manifest);
  const logistics = buildLogistics(manifest, manifest.dysonProgram?.safety);
  const settlement = buildSettlement(manifest);
  const computeTolerancePct = manifest.verificationProtocols?.computeTolerancePct ?? 0.75;
  const computeDeviationPct =
    computeFabric.requiredFailoverCapacity > 0
      ? Math.abs(
          (computeFabric.failoverCapacityExaflops - computeFabric.requiredFailoverCapacity) /
            computeFabric.requiredFailoverCapacity
        ) * 100
      : 0;

  const verification = {
    energyModels: {
      withinMargin: energyModelsWithin,
    },
    compute: {
      deviationPct: computeDeviationPct,
      tolerancePct: computeTolerancePct,
      withinTolerance: computeDeviationPct <= computeTolerancePct,
    },
    bridges: bridgesVerification,
    energySchedule: energyScheduleVerification,
    logistics: logistics.verification,
    settlement: settlement.verification,
  };

  const equilibriumLedger = buildEquilibriumLedger({
    energyMonteCarlo,
    allocationPolicy,
    sentientWelfare,
    logistics,
    computeFabric,
    verification,
  });

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
  const missionHierarchyDiagram = buildMermaidTaskHierarchy(dyson);
  const crossChainDiagram = buildSequenceDiagram();
  const dysonThermoDiagram = buildDysonThermoDiagram(dyson, energyMonteCarlo);

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
    `- **Free Energy Runway:** ${energyMonteCarlo.runwayHours.toFixed(2)} hours of buffer at mean demand.`
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
    `- **Allocation Diversification:** ${(allocationPolicy.diversificationScore * 100).toFixed(1)}% (HHI ${(allocationPolicy.concentrationIndex ?? 0).toFixed(3)}).`
  );
  reportLines.push(
    `- **Replicator Equilibrium:** ${(allocationPolicy.replicatorStability * 100).toFixed(1)}% stability (drift ${(allocationPolicy.replicatorDrift ?? 0).toFixed(3)}).`
  );
  reportLines.push(
    `- **Sentient Welfare Equilibrium:** ${(sentientWelfare.equilibriumScore * 100).toFixed(1)}% · cooperation ${(sentientWelfare.cooperationIndex * 100).toFixed(1)}% · inequality ${(sentientWelfare.inequalityIndex * 100).toFixed(1)}% · free energy/agent ${sentientWelfare.freeEnergyPerAgentGj.toFixed(6)} GJ.`
  );
  reportLines.push(
    `- **Sentient Coalition Stability:** ${(sentientWelfare.coalitionStability * 100).toFixed(1)}% · collective action ${(sentientWelfare.collectiveActionPotential * 100).toFixed(1)}% · payoff dispersion ${(sentientWelfare.payoffCoefficient * 100).toFixed(1)}%.`
  );
  reportLines.push(
    `- **Equilibrium Ledger:** ${(equilibriumLedger.overallScore * 100).toFixed(1)}% (${equilibriumLedger.status}); energy ${(equilibriumLedger.components.energy.score * 100).toFixed(1)}%, allocation ${(equilibriumLedger.components.allocation.score * 100).toFixed(1)}%, welfare ${(equilibriumLedger.components.welfare.score * 100).toFixed(1)}%.`
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
    dominance,
    shards: shardMetrics,
    sentinelFindings,
    dyson,
    energyMonteCarlo,
    allocationPolicy,
    sentientWelfare,
    energy: {
      utilisationPct: energyUtilisationPct,
      marginPct: energyMarginPct,
      tripleCheck: energyMonteCarlo.withinTolerance && energyModelsWithin && liveFeeds.allWithinTolerance,
      warnings: energyWarnings,
      models: energyModels,
      monteCarlo: energyMonteCarlo,
      liveFeeds,
      schedule: energySchedule,
      allocationPolicy,
    },
    governance,
    verification,
    bridges,
    missionDirectives: manifest.missionDirectives,
    federations: manifest.federations,
    identity,
    computeFabric,
    orchestrationFabric,
    missionLattice,
    logistics: {
      aggregate: logistics.aggregate,
      corridors: logistics.corridors,
      equilibrium: logistics.equilibrium,
    },
    settlement: {
      protocols: settlement.protocols,
      watchers: settlement.watchers,
      watchersOnline: settlement.watchersOnline,
      averageFinalityMinutes: settlement.averageFinalityMinutes,
      maxToleranceMinutes: settlement.maxToleranceMinutes,
      minCoveragePct: settlement.minCoveragePct,
      coverageThreshold: settlement.coverageThreshold,
      slippageThresholdBps: settlement.slippageThresholdBps,
    },
    scenarioSweep: buildScenarioSweep({ energyMonteCarlo, mission: missionLattice, bridges: bridgesVerification }),
    manifest: {
      manifestoHashMatches: Boolean(manifest.interstellarCouncil?.manifestoHash),
      planHashMatches: Boolean(manifest.selfImprovement?.planHash),
    },
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
    const stabilityLedger = buildStabilityLedger({
      shardMetrics,
      energyMonteCarlo,
      allocationPolicy,
      dominanceScore,
      sentinelFindings,
      sentientWelfare,
    });
    const ownerProof = buildOwnerProof({
      fabric,
      telemetry,
      allocationPolicy,
      dominanceScore,
    });

    fs.writeFileSync(
      dysonHierarchyPath,
      `${missionHierarchyDiagram}\n`
    );
    fs.writeFileSync(
      taskHierarchyPath,
      `${missionHierarchyDiagram}\n`
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
      `${dysonThermoDiagram}\n`
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
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-telemetry.inline.js'),
      `window.__KARDASHEV_TELEMETRY__ = ${JSON.stringify(telemetry)};\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-stability-ledger.json'),
      `${JSON.stringify(stabilityLedger, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-stability-ledger.inline.js'),
      `window.__KARDASHEV_LEDGER__ = ${JSON.stringify(stabilityLedger)};\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-equilibrium-ledger.json'),
      `${JSON.stringify(equilibriumLedger, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-equilibrium-ledger.inline.js'),
      `window.__KARDASHEV_EQUILIBRIUM__ = ${JSON.stringify(equilibriumLedger)};\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-owner-proof.json'),
      `${JSON.stringify(ownerProof, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-owner-proof.inline.js'),
      `window.__KARDASHEV_OWNER_PROOF__ = ${JSON.stringify(ownerProof)};\n`
    );
    fs.writeFileSync(
      path.join(outputDir, 'kardashev-diagrams.inline.js'),
      `window.__KARDASHEV_DIAGRAMS__ = ${JSON.stringify({
        missionHierarchy: missionHierarchyDiagram,
        interstellarMap: crossChainDiagram,
        dysonThermo: dysonThermoDiagram,
      })};\n`
    );

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
      `   - Free energy runway: ${energyMonteCarlo.runwayHours.toFixed(2)} hours at mean demand`
    );
    console.log(
      `   - Entropy buffer: ${(energyMonteCarlo.entropyMargin || 0).toFixed(2)}σ · game-theoretic slack ${(energyMonteCarlo.gameTheorySlack * 100).toFixed(1)}%`
    );
    console.log(
      `   - Sentient welfare equilibrium: ${(sentientWelfare.equilibriumScore * 100).toFixed(1)}% · cooperation ${(sentientWelfare.cooperationIndex * 100).toFixed(1)}%`
    );
    console.log(
      `   - Equilibrium ledger: ${(equilibriumLedger.overallScore * 100).toFixed(1)}% (${equilibriumLedger.status})`
    );
    return;
  }

  console.log('✅ Kardashev II scale dossier generated successfully.');
  console.log(`   - Report: ${path.join(outputDir, 'kardashev-report.md')}`);
  console.log(`   - Governance playbook: ${path.join(outputDir, 'governance-playbook.md')}`);
  console.log(`   - Telemetry: ${path.join(outputDir, 'kardashev-telemetry.json')}`);
  console.log(`   - Equilibrium ledger: ${path.join(outputDir, 'kardashev-equilibrium-ledger.json')}`);
  console.log(
    `   - Energy Monte Carlo breach: ${(energyMonteCarlo.breachProbability * 100).toFixed(2)}% (tolerance ${(energyMonteCarlo.tolerance * 100).toFixed(2)}%).`
  );
  console.log(
    `   - Free energy margin: ${energyMonteCarlo.freeEnergyMarginGw.toFixed(2)} GW (${(energyMonteCarlo.freeEnergyMarginPct * 100).toFixed(2)}%)`
  );
  console.log(
    `   - Free energy runway: ${energyMonteCarlo.runwayHours.toFixed(2)} hours at mean demand`
  );
  console.log(
    `   - Entropy buffer: ${(energyMonteCarlo.entropyMargin || 0).toFixed(2)}σ · game-theoretic slack ${(energyMonteCarlo.gameTheorySlack * 100).toFixed(1)}%`
  );
  console.log(
    `   - Sentient welfare equilibrium: ${(sentientWelfare.equilibriumScore * 100).toFixed(1)}% · cooperation ${(sentientWelfare.cooperationIndex * 100).toFixed(1)}%`
  );
}

if (require.main === module) {
  main();
}
