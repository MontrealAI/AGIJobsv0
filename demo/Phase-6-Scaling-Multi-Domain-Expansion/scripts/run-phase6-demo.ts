#!/usr/bin/env ts-node
/*
 * Generates a Phase 6 rollout blueprint from the demo configuration.
 * Outputs calldata, bridge plans, and orchestration guidance in a single run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Interface, keccak256, toUtf8Bytes } from 'ethers';

const CONFIG_PATH = join(__dirname, '..', 'config', 'domains.phase6.json');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
  const valueFlows: number[] = [];
  const sentinels = new Set<string>();
  for (const domain of config.domains) {
    const meta = domain.metadata ?? {};
    const resilienceIndex = toNumber(meta.resilienceIndex);
    if (resilienceIndex !== undefined) {
      resilience.push(resilienceIndex);
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
  return { averageResilience, minResilience, maxResilience, totalValueFlow, sentinelCount: sentinels.size };
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
    'function setSystemPause(address newPause)',
    'function setEscalationBridge(address newBridge)',
    'function registerDomain((string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
    'function updateDomain(bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)'
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

  banner('Network telemetry');
  if (metrics.averageResilience !== undefined) {
    console.log(
      `Resilience (avg/min/max): ${metrics.averageResilience.toFixed(3)} / ${metrics.minResilience?.toFixed(3)} / ${metrics.maxResilience?.toFixed(3)}`,
    );
  } else {
    console.log('Resilience (avg/min/max): —');
  }
  console.log(`Monthly value flow across domains: ${formatUSD(metrics.totalValueFlow)}`);
  console.log(`Active sentinel families: ${metrics.sentinelCount}`);
  console.log(`Global infra integrations: ${globalInfraCount}`);
  console.log(`Domain infra touchpoints: ${domainInfraCount}`);

  banner('Global controls');
  renderTable([
    ['Manifest URI', config.global.manifestURI],
    summarizeAddress('IoT oracle router', config.global.iotOracleRouter).split(': '),
    summarizeAddress('Default L2 gateway', config.global.defaultL2Gateway).split(': '),
    summarizeAddress('Treasury bridge', config.global.treasuryBridge).split(': '),
    summarizeAddress('DID registry', config.global.didRegistry).split(': '),
    summarizeAddress('System pause', config.global.systemPause).split(': '),
    summarizeAddress('Escalation bridge', config.global.escalationBridge).split(': '),
    ['L2 sync cadence', `${config.global.l2SyncCadence}s`],
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

  console.log();
  console.log('setGlobalConfig calldata:');
  console.log(iface.encodeFunctionData('setGlobalConfig', [globalTuple]));

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
    ] as unknown as Array<[string, string]>);

    const tuple = buildDomainTuple(domain);
    console.log('  registerDomain calldata:');
    console.log(`    ${iface.encodeFunctionData('registerDomain', [tuple])}`);
    console.log('  updateDomain calldata:');
    console.log(`    ${iface.encodeFunctionData('updateDomain', [domainId, tuple])}`);
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
