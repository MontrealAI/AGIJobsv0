#!/usr/bin/env ts-node
/*
 * Generates a Phase 6 rollout blueprint from the demo configuration.
 * Outputs calldata, bridge plans, and orchestration guidance in a single run.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Interface, keccak256, toUtf8Bytes } from 'ethers';

const CONFIG_PATH = join(__dirname, '..', 'config', 'domains.phase6.json');

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
  const zero = '0x0000000000000000000000000000000000000000';
  return [
    domain.slug,
    domain.name,
    domain.manifestURI,
    domain.validationModule ?? zero,
    domain.oracle ?? zero,
    domain.l2Gateway ?? zero,
    domain.subgraph,
    domain.executionRouter ?? zero,
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
    'function registerDomain((string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)',
    'function updateDomain(bytes32 id,(string slug,string name,string metadataURI,address validationModule,address dataOracle,address l2Gateway,string subgraphEndpoint,address executionRouter,uint64 heartbeatSeconds,bool active) config)'
  ];
  const iface = new Interface(fragments);

  banner('Phase 6 blueprint generated');
  console.log('Configuration file:', CONFIG_PATH);
  console.log('ABI fragments:', fragments.join(' | '));

  banner('Global controls');
  renderTable([
    ['Manifest URI', config.global.manifestURI],
    summarizeAddress('IoT oracle router', config.global.iotOracleRouter).split(': '),
    summarizeAddress('Default L2 gateway', config.global.defaultL2Gateway).split(': '),
    summarizeAddress('Treasury bridge', config.global.treasuryBridge).split(': '),
    summarizeAddress('DID registry', config.global.didRegistry).split(': '),
    ['L2 sync cadence', `${config.global.l2SyncCadence}s`],
  ] as unknown as Array<[string, string]>);

  const globalTuple = [
    config.global.iotOracleRouter ?? '0x0000000000000000000000000000000000000000',
    config.global.defaultL2Gateway ?? '0x0000000000000000000000000000000000000000',
    config.global.didRegistry ?? '0x0000000000000000000000000000000000000000',
    config.global.treasuryBridge ?? '0x0000000000000000000000000000000000000000',
    BigInt(config.global.l2SyncCadence ?? 180),
    config.global.manifestURI,
  ];

  console.log();
  console.log('setGlobalConfig calldata:');
  console.log(iface.encodeFunctionData('setGlobalConfig', [globalTuple]));

  banner('Domain registrations');
  config.domains.forEach((domain: any) => {
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
