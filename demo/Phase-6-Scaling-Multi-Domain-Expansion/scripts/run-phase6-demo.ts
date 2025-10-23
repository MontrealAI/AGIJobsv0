#!/usr/bin/env ts-node
/*
 * Generates a Phase 6 rollout blueprint from the demo configuration.
 * Outputs calldata, bridge plans, and orchestration guidance in a single run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Interface, formatEther, keccak256, toUtf8Bytes } from 'ethers';

const CONFIG_PATH = join(__dirname, '..', 'config', 'domains.phase6.json');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES32 = '0x' + '0'.repeat(64);

function loadJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function banner(title: string) {
  console.log();
  console.log(`\x1b[38;5;111m=== ${title.toUpperCase()} ===\x1b[0m`);
}

function summarizeAddress(label: string, addr?: string | null) {
  if (!addr || /^0x0{40}$/i.test(addr)) {
    return `${label}: —`;
  }
  return `${label}: ${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function buildDomainTuple(domain: any) {
  return [
    domain.slug,
    domain.name,
    domain.manifestURI,
    domain.validationModule ?? ZERO_ADDRESS,
    domain.oracle ?? ZERO_ADDRESS,
    domain.l2Gateway ?? ZERO_ADDRESS,
    domain.subgraph,
    domain.executionRouter ?? ZERO_ADDRESS,
    BigInt(domain.heartbeatSeconds ?? 120),
    true,
  ];
}

function renderTable(rows: Array<[string, string]>) {
  const width = Math.max(...rows.map(([label]) => label.length)) + 3;
  rows.forEach(([label, value]) => {
    const padded = label.padEnd(width, ' ');
    console.log(`  \x1b[36m${padded}\x1b[0m${value}`);
  });
}

function summariseInfra(entry: Record<string, string | undefined>) {
  const layer = entry.layer ?? '—';
  const name = entry.name ?? '—';
  const role = entry.role ?? '—';
  const status = entry.status ? `status=${entry.status}` : '';
  const endpoint = entry.endpoint || entry.uri;
  const endpointSummary = endpoint ? ` @ ${endpoint}` : '';
  return `${layer}: ${name} — ${role} ${status}${endpointSummary}`.trim();
}

function formatStake(value: string | number | bigint | undefined): string {
  try {
    if (value === undefined) return '—';
    const big = typeof value === 'bigint' ? value : BigInt(value);
    return `${formatEther(big)} ETH`;
  } catch (error) {
    return String(value ?? '—');
  }
}

function formatBps(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${(value / 100).toFixed(2)}% (${value} bps)`;
}

function buildDomainOperationsTuple(domain: any) {
  const ops = domain.operations ?? {};
  const minStakeRaw = ops.minStake ?? 0;
  const minStake =
    typeof minStakeRaw === 'string'
      ? BigInt(minStakeRaw)
      : BigInt(Math.trunc(Number(minStakeRaw)));
  return [
    BigInt(Math.trunc(Number(ops.maxActiveJobs ?? 0))),
    BigInt(Math.trunc(Number(ops.maxQueueDepth ?? 0))),
    minStake,
    Number(ops.treasuryShareBps ?? 0),
    Number(ops.circuitBreakerBps ?? 0),
    Boolean(ops.requiresHumanValidation),
  ];
}

function buildDomainTelemetryTuple(domain: any) {
  const telemetry = domain.telemetry ?? {};
  const toBytes32 = (value: any) => {
    if (typeof value === 'string' && value.startsWith('0x') && value.length === 66) {
      return value;
    }
    return ZERO_BYTES32;
  };
  return [
    Number(telemetry.resilienceBps ?? 0),
    Number(telemetry.automationBps ?? 0),
    Number(telemetry.complianceBps ?? 0),
    Number(telemetry.settlementLatencySeconds ?? 0),
    Boolean(telemetry.usesL2Settlement ?? false),
    telemetry.sentinelOracle ?? ZERO_ADDRESS,
    telemetry.settlementAsset ?? ZERO_ADDRESS,
    toBytes32(telemetry.metricsDigest),
    toBytes32(telemetry.manifestHash),
  ];
}

function formatUSD(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '—';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  if (numeric >= 1e12) {
    return `$${(numeric / 1e12).toFixed(2)}T`;
  }
  if (numeric >= 1e9) {
    return `$${(numeric / 1e9).toFixed(2)}B`;
  }
  if (numeric >= 1e6) {
    return `$${(numeric / 1e6).toFixed(2)}M`;
  }
  return `$${numeric.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function toNumber(value: any): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function computeNetworkMetrics(config: any) {
  const resilience: number[] = [];
  const automation: number[] = [];
  const compliance: number[] = [];
  const latency: number[] = [];
  let l2Settlements = 0;
  const valueFlows: number[] = [];
  const sentinels = new Set<string>();
  for (const domain of config.domains) {
    const meta = domain.metadata ?? {};
    const resilienceIndex = toNumber(meta.resilienceIndex);
    if (resilienceIndex !== undefined) {
      resilience.push(resilienceIndex);
    }
    if (domain.telemetry) {
      const telemetry = domain.telemetry;
      const auto = toNumber(telemetry.automationBps);
      const comp = toNumber(telemetry.complianceBps);
      const latencySeconds = toNumber(telemetry.settlementLatencySeconds);
      if (auto !== undefined) {
        automation.push(auto);
      }
      if (comp !== undefined) {
        compliance.push(comp);
      }
      if (latencySeconds !== undefined) {
        latency.push(latencySeconds);
      }
      if (telemetry.usesL2Settlement) {
        l2Settlements += 1;
      }
    }
    const valueFlow = toNumber(meta.valueFlowMonthlyUSD);
    if (valueFlow !== undefined) {
      valueFlows.push(valueFlow);
    }
    if (meta.sentinel) {
      sentinels.add(String(meta.sentinel));
    }
  }
  const averageResilience =
    resilience.length > 0 ? resilience.reduce((acc, cur) => acc + cur, 0) / resilience.length : undefined;
  const minResilience = resilience.length > 0 ? Math.min(...resilience) : undefined;
  const maxResilience = resilience.length > 0 ? Math.max(...resilience) : undefined;
  const totalValueFlow = valueFlows.reduce((acc, cur) => acc + cur, 0);
  const averageAutomation = automation.length
    ? automation.reduce((acc, cur) => acc + cur, 0) / automation.length
    : undefined;
  const averageCompliance = compliance.length
    ? compliance.reduce((acc, cur) => acc + cur, 0) / compliance.length
    : undefined;
  const averageLatency = latency.length
    ? latency.reduce((acc, cur) => acc + cur, 0) / latency.length
    : undefined;
  return {
    averageResilience,
    minResilience,
    maxResilience,
    totalValueFlow,
    sentinelCount: sentinels.size,
    averageAutomation,
    averageCompliance,
    averageLatency,
    l2SettlementCoverage: config.domains.length ? l2Settlements / config.domains.length : 0,
  };
}

function mermaid(config: any) {
  const lines = ['graph TD', '  Owner[[Governance]] --> Expansion(Phase6ExpansionManager)'];
  config.domains.forEach((domain: any) => {
    const id = domain.slug.replace(/[^a-z0-9]/gi, '');
    lines.push(`  Expansion --> ${id}([${domain.name}])`);
    lines.push(`  ${id} --> Runtime`);
  });
  lines.push('  Runtime[Phase6 Runtime] --> IoT[IoT & external oracles]');
  lines.push('  Runtime --> L2[Layer-2 Executors]');
  lines.push('  L2 --> Settlement[Ethereum Mainnet]');
  return lines.join('\n');
}

function heartbeatSummary(domain: any, global: any) {
  const cadence = Math.max(domain.heartbeatSeconds ?? 0, global.l2SyncCadence ?? 0);
  return `${cadence}s sync cadence (domain ${domain.heartbeatSeconds}s, global ${global.l2SyncCadence}s)`;
}

(async () => {
  const config = loadJson(CONFIG_PATH);
  const fragments = [
    'function setGlobalConfig((address,address,address,address,uint64,string) config)',
    'function setGlobalGuards((uint16,uint16,uint32,bool,address) config)',
    'function setGlobalTelemetry((bytes32,bytes32,uint32,uint32,uint32) telemetry)',
    'function setSystemPause(address newPause)',
    'function setEscalationBridge(address newBridge)',
    'function registerDomain((string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
    'function updateDomain(bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
    'function setDomainOperations(bytes32 id,(uint48 maxActiveJobs,uint48 maxQueueDepth,uint96 minStake,uint16 treasuryShareBps,uint16 circuitBreakerBps,bool requiresHumanValidation) config)',
    'function setDomainTelemetry(bytes32 id,(uint32,uint32,uint32,uint32,bool,address,address,bytes32,bytes32) telemetry)'
  ];
  const iface = new Interface(fragments);

  banner('Phase 6 blueprint generated');
  console.log('Configuration file:', CONFIG_PATH);
  console.log('ABI fragments:', fragments.join(' | '));

  const metrics = computeNetworkMetrics(config);
  const globalInfraCount = Array.isArray(config.global.decentralizedInfra)
    ? config.global.decentralizedInfra.length
    : 0;
  const domainInfraCount = config.domains.reduce(
    (acc: number, domain: any) => acc + (Array.isArray(domain.infrastructure) ? domain.infrastructure.length : 0),
    0,
  );

  const guards = config.global.guards ?? {};

  banner('Network telemetry');
  if (metrics.averageResilience !== undefined) {
    console.log(
      `Resilience (avg/min/max): ${metrics.averageResilience.toFixed(3)} / ${metrics.minResilience?.toFixed(3)} / ${metrics.maxResilience?.toFixed(3)}`,
    );
  } else {
    console.log('Resilience (avg/min/max): —');
  }
  if (metrics.averageAutomation !== undefined) {
    console.log(`Automation maturity: ${formatBps(metrics.averageAutomation)} avg`);
  }
  if (metrics.averageCompliance !== undefined) {
    console.log(`Compliance assurance: ${formatBps(metrics.averageCompliance)} avg`);
  }
  if (metrics.averageLatency !== undefined) {
    console.log(`Settlement latency (avg): ${metrics.averageLatency.toFixed(1)}s`);
  }
  console.log(
    `L2 settlement coverage: ${(metrics.l2SettlementCoverage * 100).toFixed(1)}% of domains`,
  );
  console.log(`Monthly value flow across domains: ${formatUSD(metrics.totalValueFlow)}`);
  console.log(`Active sentinel families: ${metrics.sentinelCount}`);
  console.log(`Global infra integrations: ${globalInfraCount}`);
  console.log(`Domain infra touchpoints: ${domainInfraCount}`);
  console.log(
    `Guard rails: treasuryBuffer=${formatBps(guards.treasuryBufferBps)} | ` +
      `circuitBreaker=${formatBps(guards.circuitBreakerBps)} | grace=${guards.anomalyGracePeriod ?? 0}s | ` +
      `autoPause=${guards.autoPauseEnabled ? 'on' : 'off'}`,
  );

  banner('Global controls');
  const globalTelemetry = config.global.telemetry ?? {};
  renderTable([
    ['Manifest URI', config.global.manifestURI],
    summarizeAddress('IoT oracle router', config.global.iotOracleRouter).split(': '),
    summarizeAddress('Default L2 gateway', config.global.defaultL2Gateway).split(': '),
    summarizeAddress('Treasury bridge', config.global.treasuryBridge).split(': '),
    summarizeAddress('DID registry', config.global.didRegistry).split(': '),
    summarizeAddress('System pause', config.global.systemPause).split(': '),
    summarizeAddress('Escalation bridge', config.global.escalationBridge).split(': '),
    ['L2 sync cadence', `${config.global.l2SyncCadence}s`],
    ['Treasury buffer', formatBps(guards.treasuryBufferBps)],
    ['Circuit breaker', formatBps(guards.circuitBreakerBps)],
    ['Anomaly grace', guards.anomalyGracePeriod ? `${guards.anomalyGracePeriod}s` : '—'],
    ['Auto-pause enabled', String(guards.autoPauseEnabled ?? false)],
    summarizeAddress('Oversight council', guards.oversightCouncil).split(': '),
    ['Telemetry manifest hash', globalTelemetry.manifestHash ?? '—'],
    ['Telemetry metrics digest', globalTelemetry.metricsDigest ?? '—'],
    ['Telemetry resilience floor', formatBps(globalTelemetry.resilienceFloorBps)],
    ['Telemetry automation floor', formatBps(globalTelemetry.automationFloorBps)],
    ['Telemetry oversight weight', formatBps(globalTelemetry.oversightWeightBps)],
  ] as unknown as Array<[string, string]>);

  banner('Emergency levers');
  if (config.global.systemPause) {
    console.log(`System pause calldata: ${iface.encodeFunctionData('setSystemPause', [config.global.systemPause])}`);
  } else {
    console.log('System pause calldata: —');
  }
  if (config.global.escalationBridge) {
    console.log(
      `Escalation bridge calldata: ${iface.encodeFunctionData('setEscalationBridge', [config.global.escalationBridge])}`,
    );
  } else {
    console.log('Escalation bridge calldata: —');
  }

  const globalTuple = [
    config.global.iotOracleRouter ?? ZERO_ADDRESS,
    config.global.defaultL2Gateway ?? ZERO_ADDRESS,
    config.global.didRegistry ?? ZERO_ADDRESS,
    config.global.treasuryBridge ?? ZERO_ADDRESS,
    BigInt(config.global.l2SyncCadence ?? 180),
    config.global.manifestURI,
  ];
  const guardTuple = [
    Number(guards.treasuryBufferBps ?? 0),
    Number(guards.circuitBreakerBps ?? 0),
    Number(guards.anomalyGracePeriod ?? 0),
    Boolean(guards.autoPauseEnabled ?? false),
    guards.oversightCouncil ?? ZERO_ADDRESS,
  ];

  console.log();
  console.log('setGlobalConfig calldata:');
  console.log(iface.encodeFunctionData('setGlobalConfig', [globalTuple]));
  console.log('setGlobalGuards calldata:');
  console.log(iface.encodeFunctionData('setGlobalGuards', [guardTuple]));
  const telemetryTuple = [
    globalTelemetry.manifestHash ?? ZERO_BYTES32,
    globalTelemetry.metricsDigest ?? ZERO_BYTES32,
    Number(globalTelemetry.resilienceFloorBps ?? 0),
    Number(globalTelemetry.automationFloorBps ?? 0),
    Number(globalTelemetry.oversightWeightBps ?? 0),
  ];
  console.log('setGlobalTelemetry calldata:');
  console.log(iface.encodeFunctionData('setGlobalTelemetry', [telemetryTuple]));

  banner('Decentralized infrastructure mesh');
  const globalInfra = config.global.decentralizedInfra ?? [];
  if (globalInfra.length) {
    console.log('Global mesh:');
    globalInfra.forEach((entry: Record<string, string | undefined>, idx: number) => {
      console.log(`  [G${idx + 1}] ${summariseInfra(entry)}`);
    });
  }
  config.domains.forEach((domain: any) => {
    const infra = domain.infrastructure ?? [];
    console.log(`Domain ${domain.name} (${domain.slug}) integrations:`);
    infra.forEach((entry: Record<string, string | undefined>, idx: number) => {
      console.log(`  [${idx + 1}] ${summariseInfra(entry)}`);
    });
  });

  banner('Domain registrations');
  config.domains.forEach((domain: any) => {
    const metadata = domain.metadata ?? {};
    const resilienceIndex = toNumber(metadata.resilienceIndex);
    const valueFlowUSD = toNumber(metadata.valueFlowMonthlyUSD);
    const valueFlowDisplay = metadata.valueFlowDisplay ?? formatUSD(valueFlowUSD);
    const domainId = keccak256(toUtf8Bytes(String(domain.slug).toLowerCase()));
    console.log(`\n\x1b[35m${domain.name} (${domain.slug})\x1b[0m`);
    renderTable([
      ['Domain ID', domainId],
      ['Manifest', domain.manifestURI],
      ['Subgraph', domain.subgraph],
      ['Priority', String(domain.priority)],
      ['Skill tags', domain.skillTags.join(', ')],
      ['Capabilities', Object.entries(domain.capabilities || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'],
      ['Heartbeat', heartbeatSummary(domain, config.global)],
      summarizeAddress('Validation module', domain.validationModule).split(': '),
      summarizeAddress('Oracle', domain.oracle).split(': '),
      summarizeAddress('L2 gateway', domain.l2Gateway).split(': '),
      summarizeAddress('Execution router', domain.executionRouter).split(': '),
      ['Resilience index', resilienceIndex !== undefined ? resilienceIndex.toFixed(3) : '—'],
      ['Monthly value flow', valueFlowDisplay],
      ['Domain sentinel', metadata.sentinel ?? '—'],
      ['Uptime', metadata.uptime ?? '—'],
      ['Telemetry resilience', formatBps(domain.telemetry?.resilienceBps)],
      ['Telemetry automation', formatBps(domain.telemetry?.automationBps)],
      ['Telemetry compliance', formatBps(domain.telemetry?.complianceBps)],
      [
        'Telemetry settlement latency',
        domain.telemetry?.settlementLatencySeconds !== undefined
          ? `${domain.telemetry.settlementLatencySeconds}s`
          : '—',
      ],
      [
        'Uses L2 settlement',
        domain.telemetry?.usesL2Settlement === undefined
          ? '—'
          : domain.telemetry.usesL2Settlement
            ? 'yes'
            : 'no',
      ],
      ['Telemetry metrics digest', domain.telemetry?.metricsDigest ?? '—'],
      ['Telemetry manifest hash', domain.telemetry?.manifestHash ?? '—'],
    ] as unknown as Array<[string, string]>);

    const tuple = buildDomainTuple(domain);
    const opsTuple = buildDomainOperationsTuple(domain);
    const telemetryTupleDomain = buildDomainTelemetryTuple(domain);
    const ops = domain.operations ?? {};
    console.log('  registerDomain calldata:');
    console.log(`    ${iface.encodeFunctionData('registerDomain', [tuple])}`);
    console.log('  updateDomain calldata:');
    console.log(`    ${iface.encodeFunctionData('updateDomain', [domainId, tuple])}`);
    console.log('  Operations guard rails:');
    console.log(
      `    maxActiveJobs=${ops.maxActiveJobs ?? '—'} | maxQueueDepth=${ops.maxQueueDepth ?? '—'} | minStake=${formatStake(ops.minStake)}`,
    );
    console.log(
      `    treasuryShare=${formatBps(ops.treasuryShareBps)} | circuitBreaker=${formatBps(ops.circuitBreakerBps)} | requiresHumanValidation=${ops.requiresHumanValidation ? 'yes' : 'no'}`,
    );
    console.log('  setDomainOperations calldata:');
    console.log(`    ${iface.encodeFunctionData('setDomainOperations', [domainId, opsTuple])}`);
    console.log('  setDomainTelemetry calldata:');
    console.log(`    ${iface.encodeFunctionData('setDomainTelemetry', [domainId, telemetryTupleDomain])}`);
  });

  banner('Mermaid system map (copy/paste into dashboards)');
  const diagram = mermaid(config);
  console.log(diagram);

  banner('Runtime guidance');
  console.log('• Python orchestrator runtime (`orchestrator/extensions/phase6.py`) auto-selects domains using this config.');
  console.log('• IoT signals can call `ingest_iot_signal` with tags like `{"domain": "logistics", "tags": ["iot", "routing"]}`.');
  console.log('• Bridge cadence is driven by the greater of domain heartbeat and global L2 cadence.');
  console.log('• Emergency: use `forwardPauseCall(abi.encodeWithSignature("pauseAll()"))` after `setSystemPause`.');

  banner('Next steps for governance');
  console.log('1. Queue calldata (above) via multisig / timelock.');
  console.log('2. Monitor `Phase6Domain` entities in the subgraph to confirm readiness.');
  console.log('3. Use `npm run demo:phase6:ci` in CI to enforce manifest integrity.');
})();
