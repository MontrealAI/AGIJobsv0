#!/usr/bin/env ts-node
/*
 * Generates a Phase 6 rollout blueprint from the demo configuration.
 * Outputs calldata, bridge plans, and orchestration guidance in a single run.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildPhase6Blueprint,
  loadPhase6Config,
  Phase6Blueprint,
  DomainBlueprint,
  DecentralizedInfraEntry,
  DomainInfrastructureEntry,
} from './phase6-blueprint';

const DEFAULT_CONFIG_PATH = join(__dirname, '..', 'config', 'domains.phase6.json');

interface CliOptions {
  configPath: string;
  jsonOutput?: string;
}

function parseArgs(): CliOptions {
  const argv = process.argv.slice(2);
  const options: CliOptions = { configPath: DEFAULT_CONFIG_PATH };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--config expects a path');
      }
      options.configPath = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--config=')) {
      options.configPath = arg.split('=', 2)[1] ?? DEFAULT_CONFIG_PATH;
      continue;
    }
    if (arg === '--json') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        options.jsonOutput = '-';
      } else {
        options.jsonOutput = next;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--json=')) {
      const value = arg.split('=', 2)[1];
      options.jsonOutput = value && value.length ? value : '-';
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    console.warn(`Unknown option: ${arg}`);
  }

  return options;
}

function printUsage(): void {
  console.log(
    `Phase 6 blueprint orchestrator\n\n` +
      `Usage: npm run demo:phase6:orchestrate -- [options]\n\n` +
      `Options:\n` +
      `  --config <path>         Use a custom Phase 6 config file (default: ${DEFAULT_CONFIG_PATH})\n` +
      `  --json [path|-]         Emit JSON blueprint to <path>; use '-' for stdout\n` +
      `  -h, --help              Show this message\n`,
  );
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

function renderTable(rows: Array<[string, string]>) {
  const width = Math.max(...rows.map(([label]) => label.length)) + 3;
  rows.forEach(([label, value]) => {
    const padded = label.padEnd(width, ' ');
    console.log(`  \x1b[36m${padded}\x1b[0m${value}`);
  });
}

function summariseInfra(entry: DecentralizedInfraEntry | DomainInfrastructureEntry) {
  const layer = 'layer' in entry && entry.layer ? entry.layer : '—';
  const name = entry.name ?? '—';
  const role = entry.role ?? '—';
  const status = entry.status ? `status=${entry.status}` : '';
  const endpoint = entry.endpoint || ('uri' in entry ? entry.uri : undefined);
  const endpointSummary = endpoint ? ` @ ${endpoint}` : '';
  return `${layer}: ${name} — ${role} ${status}${endpointSummary}`.trim();
}

function formatBps(value: number | undefined | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return `${(value / 100).toFixed(2)}% (${value} bps)`;
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

function formatCadenceSeconds(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return '—';
  }
  if (value === 0) {
    return 'manual';
  }
  return `${value}s`;
}

function formatAutopilotSummary(enabled: boolean, cadenceSeconds: number): string {
  const cadence = formatCadenceSeconds(cadenceSeconds);
  return `${enabled ? 'enabled' : 'standby'} @ ${cadence}`;
}

function heartbeatSummary(domain: DomainBlueprint, globalCadenceSeconds: number) {
  const cadence = Math.max(domain.heartbeatSeconds, globalCadenceSeconds);
  return `${cadence}s sync cadence (domain ${domain.heartbeatSeconds}s, global ${globalCadenceSeconds}s)`;
}

function printBlueprint(blueprint: Phase6Blueprint, options: CliOptions) {
  banner('Phase 6 blueprint generated');
  if (options.configPath) {
    console.log('Configuration file:', options.configPath);
  }
  console.log('Spec version:', blueprint.specVersion);
  console.log('Configuration hash:', blueprint.configHash);
  console.log('ABI fragments:', blueprint.fragments.join(' | '));

  const metrics = blueprint.metrics;
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
  console.log(`L2 settlement coverage: ${(metrics.l2SettlementCoverage * 100).toFixed(1)}% of domains`);
  console.log(`Monthly value flow across domains: ${formatUSD(metrics.totalValueFlowUSD)}`);
  console.log(`Active sentinel families: ${metrics.sentinelFamilies}`);
  console.log(`Global infra integrations: ${metrics.globalInfraCount}`);
  console.log(`Domain infra touchpoints: ${metrics.domainInfraCount}`);
  console.log(
    `Autopilot coverage: ${(metrics.autopilotCoverage * 100).toFixed(1)}% ` +
      `(${metrics.autopilotEnabledCount}/${metrics.domainCount} domains)`,
  );
  if (metrics.resilienceStdDev !== undefined) {
    console.log(`Resilience deviation: ±${metrics.resilienceStdDev.toFixed(4)}`);
  }
  if (metrics.resilienceFloorCoverage !== undefined) {
    console.log(
      `Resilience floor coverage: ${(metrics.resilienceFloorCoverage * 100).toFixed(1)}% ` +
        `(breaches ${metrics.resilienceFloorBreaches ?? 0})`,
    );
  }
  if (metrics.automationFloorCoverage !== undefined) {
    console.log(
      `Automation floor coverage: ${(metrics.automationFloorCoverage * 100).toFixed(1)}% ` +
        `(breaches ${metrics.automationFloorBreaches ?? 0})`,
    );
  }
  console.log(
    `Credential coverage: ${(metrics.credentialCoverage * 100).toFixed(1)}% ` +
      `(${metrics.credentialedDomainCount}/${metrics.domainCount} domains, ${metrics.credentialRequirementCount} requirements)`,
  );
  console.log(
    `Guard rails: treasuryBuffer=${formatBps(blueprint.guards.treasuryBufferBps)} | ` +
      `circuitBreaker=${formatBps(blueprint.guards.circuitBreakerBps)} | grace=${blueprint.guards.anomalyGracePeriod}s | ` +
      `autoPause=${blueprint.guards.autoPauseEnabled ? 'on' : 'off'}`,
  );

  banner('Credential governance mesh');
  console.log(
    `Global revocation registry: ${blueprint.credentials.global.revocationRegistry ?? '—'} | ` +
      `requirements ${blueprint.credentials.totals.requirements} across ${blueprint.credentials.totals.credentialedDomains} domains`,
  );
  if (blueprint.credentials.global.trustAnchors.length) {
    console.log('Trust anchors:');
    blueprint.credentials.global.trustAnchors.forEach((anchor, idx) => {
      console.log(
        `  [TA${idx + 1}] ${anchor.name} — DID ${anchor.did} | role=${anchor.role}` +
          (anchor.policyURI ? ` | policy=${anchor.policyURI}` : ''),
      );
    });
  }
  if (blueprint.credentials.global.issuers.length) {
    console.log('Issuers:');
    blueprint.credentials.global.issuers.forEach((issuer, idx) => {
      console.log(
        `  [ISS${idx + 1}] ${issuer.name} — DID ${issuer.did} | attestation=${issuer.attestationType} | ` +
          `domains=${issuer.domains.join(', ') || '—'}`,
      );
    });
  }
  if (blueprint.credentials.global.policies.length) {
    console.log('Policies:');
    blueprint.credentials.global.policies.forEach((policy, idx) => {
      console.log(`  [POL${idx + 1}] ${policy.name} — ${policy.description} (${policy.uri})`);
    });
  }

  banner('Global controls');
  renderTable([
    ['Manifest URI', blueprint.global.manifestURI],
    summarizeAddress('IoT oracle router', blueprint.global.iotOracleRouter).split(': '),
    summarizeAddress('Default L2 gateway', blueprint.global.defaultL2Gateway).split(': '),
    summarizeAddress('Treasury bridge', blueprint.global.treasuryBridge).split(': '),
    summarizeAddress('DID registry', blueprint.global.didRegistry).split(': '),
    summarizeAddress('System pause', blueprint.global.systemPause).split(': '),
    summarizeAddress('Escalation bridge', blueprint.global.escalationBridge).split(': '),
    summarizeAddress('Mesh coordinator', blueprint.global.meshCoordinator).split(': '),
    summarizeAddress('Data lake', blueprint.global.dataLake).split(': '),
    summarizeAddress('Identity bridge', blueprint.global.identityBridge).split(': '),
    ['L2 sync cadence', `${blueprint.global.l2SyncCadenceSeconds}s`],
    ['Infra topology URI', blueprint.global.topologyURI ?? '—'],
    ['Infra autopilot cadence', formatCadenceSeconds(blueprint.global.autopilotCadenceSeconds)],
    ['Infra enforcement', blueprint.global.enforceDecentralizedInfra ? 'enforced' : 'advisory'],
    ['Treasury buffer', formatBps(blueprint.guards.treasuryBufferBps)],
    ['Circuit breaker', formatBps(blueprint.guards.circuitBreakerBps)],
    ['Anomaly grace', blueprint.guards.anomalyGracePeriod ? `${blueprint.guards.anomalyGracePeriod}s` : '—'],
    ['Auto-pause enabled', String(blueprint.guards.autoPauseEnabled)],
    summarizeAddress('Oversight council', blueprint.guards.oversightCouncil).split(': '),
    ['Telemetry manifest hash', blueprint.telemetry.manifestHash ?? '—'],
    ['Telemetry metrics digest', blueprint.telemetry.metricsDigest ?? '—'],
    ['Telemetry resilience floor', formatBps(blueprint.telemetry.resilienceFloorBps)],
    ['Telemetry automation floor', formatBps(blueprint.telemetry.automationFloorBps)],
    ['Telemetry oversight weight', formatBps(blueprint.telemetry.oversightWeightBps)],
  ] as unknown as Array<[string, string]>);

  banner('Emergency levers');
  console.log(`System pause calldata: ${blueprint.calldata.systemPause ?? '—'}`);
  console.log(`Escalation bridge calldata: ${blueprint.calldata.escalationBridge ?? '—'}`);

  console.log();
  console.log('setGlobalConfig calldata:');
  console.log(blueprint.calldata.globalConfig);
  console.log('setGlobalGuards calldata:');
  console.log(blueprint.calldata.globalGuards);
  console.log('setGlobalTelemetry calldata:');
  console.log(blueprint.calldata.globalTelemetry);

  banner('Decentralized infrastructure mesh');
  const globalInfra = blueprint.infrastructure.global;
  if (globalInfra.length) {
    console.log('Global mesh:');
    globalInfra.forEach((entry, idx) => {
      console.log(`  [G${idx + 1}] ${summariseInfra(entry)}`);
    });
  }
  console.log(
    `Global control plane: ${blueprint.global.topologyURI ?? '—'} | ` +
      `autopilot ${formatAutopilotSummary(
        blueprint.global.autopilotCadenceSeconds > 0,
        blueprint.global.autopilotCadenceSeconds,
      )} | enforcement=${blueprint.global.enforceDecentralizedInfra ? 'strict' : 'advisory'}`,
  );
  for (const domain of blueprint.domains) {
    const infra = blueprint.infrastructure.domains[domain.slug] ?? [];
    console.log(`Domain ${domain.name} (${domain.slug}) integrations:`);
    infra.forEach((entry, idx) => {
      console.log(`  [${idx + 1}] ${summariseInfra(entry)}`);
    });
  }

  banner('Domain registrations');
  blueprint.domains.forEach((domain) => {
    const metadata = domain.metadata;
    const valueFlowDisplay = metadata.valueFlowDisplay ?? formatUSD(metadata.valueFlowMonthlyUSD);
    const control = domain.infrastructureControl;
    console.log(`\n\x1b[35m${domain.name} (${domain.slug})\x1b[0m`);
    renderTable([
      ['Domain ID', domain.domainId],
      ['Manifest', domain.manifestURI],
      ['Subgraph', domain.subgraph],
      ['Priority', domain.priority.toString()],
      ['Skill tags', domain.skillTags.join(', ') || '—'],
      [
        'Capabilities',
        Object.entries(domain.capabilities)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ') || '—',
      ],
      ['Heartbeat', heartbeatSummary(domain, blueprint.global.l2SyncCadenceSeconds)],
      summarizeAddress('Validation module', domain.addresses.validationModule).split(': '),
      summarizeAddress('Oracle', domain.addresses.oracle).split(': '),
      summarizeAddress('L2 gateway', domain.addresses.l2Gateway).split(': '),
      summarizeAddress('Execution router', domain.addresses.executionRouter).split(': '),
      [
        'Resilience index',
        metadata.resilienceIndex !== null && metadata.resilienceIndex !== undefined
          ? metadata.resilienceIndex.toFixed(3)
          : '—',
      ],
      ['Monthly value flow', valueFlowDisplay],
      ['Domain sentinel', metadata.sentinel ?? '—'],
      ['Uptime', metadata.uptime ?? '—'],
      ['Telemetry resilience', formatBps(domain.telemetry.resilienceBps)],
      ['Telemetry automation', formatBps(domain.telemetry.automationBps)],
      ['Telemetry compliance', formatBps(domain.telemetry.complianceBps)],
      [
        'Telemetry settlement latency',
        domain.telemetry.settlementLatencySeconds
          ? `${domain.telemetry.settlementLatencySeconds}s`
          : '—',
      ],
      ['Uses L2 settlement', domain.telemetry.usesL2Settlement ? 'yes' : 'no'],
      ['Telemetry metrics digest', domain.telemetry.metricsDigest],
      ['Telemetry manifest hash', domain.telemetry.manifestHash],
      summarizeAddress('Agent ops coordinator', control.agentOps).split(': '),
      summarizeAddress('Data pipeline', control.dataPipeline).split(': '),
      summarizeAddress('Credential verifier', control.credentialVerifier).split(': '),
      summarizeAddress('Fallback operator', control.fallbackOperator).split(': '),
      ['Control plane URI', control.controlPlaneURI],
      [
        'Credential requirements',
        domain.credentials.length
          ? domain.credentials.map((credential) => credential.name).join('; ')
          : '—',
      ],
      ['Autopilot posture', formatAutopilotSummary(control.autopilotEnabled, control.autopilotCadenceSeconds)],
    ] as unknown as Array<[string, string]>);

    console.log('  registerDomain calldata:');
    console.log(`    ${domain.calldata.registerDomain}`);
    console.log('  updateDomain calldata:');
    console.log(`    ${domain.calldata.updateDomain}`);
    console.log('  Operations guard rails:');
    console.log(
      `    maxActiveJobs=${domain.operations.maxActiveJobs} | maxQueueDepth=${domain.operations.maxQueueDepth} | minStake=${domain.operations.minStakeEth}`,
    );
    console.log(
      `    treasuryShare=${formatBps(domain.operations.treasuryShareBps)} | circuitBreaker=${formatBps(domain.operations.circuitBreakerBps)} | requiresHumanValidation=${domain.operations.requiresHumanValidation ? 'yes' : 'no'}`,
    );
    console.log('  setDomainOperations calldata:');
    console.log(`    ${domain.calldata.setDomainOperations}`);
    console.log('  setDomainTelemetry calldata:');
    console.log(`    ${domain.calldata.setDomainTelemetry}`);
    console.log('  setDomainInfrastructure calldata:');
    console.log(`    ${domain.calldata.setDomainInfrastructure}`);
    if (domain.credentials.length) {
      console.log('  Credential requirements:');
      domain.credentials.forEach((credential, idx) => {
        console.log(
          `    [CR${idx + 1}] ${credential.name} — ${credential.requirement} | format=${credential.format} | ` +
            `issuers=${credential.issuers.join(', ') || '—'} | verifiers=${credential.verifiers.join(', ') || '—'} ` +
            `| registry=${credential.registry}` +
            (credential.notes ? ` | notes=${credential.notes}` : ''),
        );
      });
    } else {
      console.log('  Credential requirements: none');
    }
  });

  banner('Mermaid system map (copy/paste into dashboards)');
  console.log(blueprint.mermaid);

  banner('Runtime guidance');
  console.log('• Python orchestrator runtime (`orchestrator/extensions/phase6.py`) auto-selects domains using this config.');
  console.log('• IoT signals can call `ingest_iot_signal` with tags like `{"domain": "logistics", "tags": ["iot", "routing"]}`.');
  console.log('• Bridge cadence is driven by the greater of domain heartbeat and global L2 cadence.');
  console.log('• Emergency: use `forwardPauseCall(abi.encodeWithSignature("pauseAll()"))` after `setSystemPause`.');

  banner('Next steps for governance');
  console.log('1. Queue calldata (above) via multisig / timelock.');
  console.log('2. Monitor `Phase6Domain` entities in the subgraph to confirm readiness.');
  console.log('3. Use `npm run demo:phase6:ci` in CI to enforce manifest integrity.');
}

(async () => {
  const options = parseArgs();
  const config = loadPhase6Config(options.configPath);
  const blueprint = buildPhase6Blueprint(config, { configPath: options.configPath });

  if (options.jsonOutput === '-') {
    console.log(JSON.stringify(blueprint, null, 2));
    return;
  }

  printBlueprint(blueprint, options);

  if (options.jsonOutput) {
    writeFileSync(options.jsonOutput, JSON.stringify(blueprint, null, 2));
    console.log(`\nBlueprint JSON saved to ${options.jsonOutput}`);
  }
})();
