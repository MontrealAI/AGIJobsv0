import { formatEther } from 'ethers';

import type { DomainBlueprint, Phase6Blueprint } from './phase6-blueprint';

function formatBps(value?: number | null): string {
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

function formatAddress(label: string, value?: string | null): string {
  if (!value || /^0x0{40}$/i.test(value)) {
    return `${label}: —`;
  }
  return `${label}: ${value}`;
}

function renderDomain(domain: DomainBlueprint, globalCadenceSeconds: number): string {
  const lines: string[] = [];
  lines.push(`## Domain: ${domain.name} (${domain.slug})`);
  lines.push('');
  lines.push(`- **Domain ID**: ${domain.domainId}`);
  lines.push(`- **Manifest URI**: ${domain.manifestURI}`);
  lines.push(`- **Subgraph**: ${domain.subgraph}`);
  lines.push(`- **Priority Score**: ${domain.priority}`);
  lines.push(`- **Skill Tags**: ${domain.skillTags.join(', ')}`);
  const capabilities = Object.entries(domain.capabilities)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  lines.push(`- **Capability Matrix**: ${capabilities || '—'}`);
  const heartbeat = Math.max(domain.heartbeatSeconds, globalCadenceSeconds);
  lines.push(`- **Heartbeat Cadence**: ${domain.heartbeatSeconds}s (effective ${heartbeat}s with global sync)`);
  lines.push(formatAddress('Validation Module', domain.addresses.validationModule));
  lines.push(formatAddress('Execution Router', domain.addresses.executionRouter));
  lines.push(formatAddress('Layer-2 Gateway', domain.addresses.l2Gateway));
  lines.push(formatAddress('Data Oracle', domain.addresses.oracle));
  lines.push(`- **Telemetry**: resilience ${formatBps(domain.telemetry.resilienceBps)}, automation ${formatBps(domain.telemetry.automationBps)}, compliance ${formatBps(domain.telemetry.complianceBps)}`);
  lines.push(
    `- **Settlement**: ${domain.telemetry.usesL2Settlement ? 'Layer-2 accelerated' : 'Mainnet anchored'} (latency ${domain.telemetry.settlementLatencySeconds || 0}s)`,
  );
  lines.push(formatAddress('Sentinel Oracle', domain.telemetry.sentinelOracle));
  lines.push(formatAddress('Settlement Asset', domain.telemetry.settlementAsset));
  const metadata = domain.metadata;
  lines.push(`- **Resilience Index**: ${metadata.resilienceIndex?.toFixed(3) ?? '—'}`);
  lines.push(`- **Monthly Value Flow**: ${metadata.valueFlowDisplay ?? formatUSD(metadata.valueFlowMonthlyUSD)}`);
  lines.push(`- **Sentinel**: ${metadata.sentinel ?? '—'}`);
  lines.push(`- **Uptime**: ${metadata.uptime ?? '—'}`);
  lines.push('');
  lines.push('### Operations Guard Rails');
  const minStakeEth = (() => {
    try {
      return `${formatEther(BigInt(domain.operations.minStakeWei))} ETH`;
    } catch (error) {
      return domain.operations.minStakeEth;
    }
  })();
  lines.push(`- **Concurrency**: ${domain.operations.maxActiveJobs} active / ${domain.operations.maxQueueDepth} queue`);
  lines.push(`- **Minimum Stake**: ${minStakeEth}`);
  lines.push(`- **Revenue Share**: ${formatBps(domain.operations.treasuryShareBps)}`);
  lines.push(`- **Circuit Breaker**: ${formatBps(domain.operations.circuitBreakerBps)}`);
  lines.push(`- **Requires Human Validation**: ${domain.operations.requiresHumanValidation ? 'Yes' : 'No'}`);
  lines.push('');
  lines.push('### Autopilot & Control Plane');
  lines.push(formatAddress('Agent Ops', domain.infrastructureControl.agentOps));
  lines.push(formatAddress('Data Pipeline', domain.infrastructureControl.dataPipeline));
  lines.push(formatAddress('Credential Verifier', domain.infrastructureControl.credentialVerifier));
  lines.push(formatAddress('Fallback Operator', domain.infrastructureControl.fallbackOperator));
  lines.push(`- **Control Plane URI**: ${domain.infrastructureControl.controlPlaneURI}`);
  lines.push(
    `- **Autopilot**: ${domain.infrastructureControl.autopilotEnabled ? 'enabled' : 'standby'} @ ${domain.infrastructureControl.autopilotCadenceSeconds}s`,
  );
  lines.push('');
  lines.push('### Decentralized Infrastructure Mesh');
  domain.infrastructure.forEach((integration, idx) => {
    const endpoint = integration.endpoint ?? integration.uri ?? '—';
    lines.push(`- [${idx + 1}] ${integration.layer}: ${integration.name} — ${integration.role} (status: ${integration.status}, endpoint: ${endpoint})`);
  });
  lines.push('');
  lines.push('### Calldata Payloads');
  lines.push('```');
  lines.push(`registerDomain: ${domain.calldata.registerDomain}`);
  lines.push(`updateDomain: ${domain.calldata.updateDomain}`);
  lines.push(`setDomainOperations: ${domain.calldata.setDomainOperations}`);
  lines.push(`setDomainTelemetry: ${domain.calldata.setDomainTelemetry}`);
  if (domain.calldata.setDomainInfrastructure) {
    lines.push(`setDomainInfrastructure: ${domain.calldata.setDomainInfrastructure}`);
  }
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

export function createPhase6Runbook(blueprint: Phase6Blueprint): string {
  const lines: string[] = [];
  lines.push('# Phase 6 Expansion Runbook');
  lines.push('');
  lines.push(`- **Generated**: ${blueprint.generatedAt}`);
  if (blueprint.configPath) {
    lines.push(`- **Config Source**: ${blueprint.configPath}`);
  }
  lines.push(`- **Config Hash**: ${blueprint.configHash}`);
  lines.push(`- **Spec Version**: ${blueprint.specVersion}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push(`- Domains Ready: ${blueprint.metrics.domainCount}`);
  lines.push(`- Total Monthly Value Flow: ${formatUSD(blueprint.metrics.totalValueFlowUSD)}`);
  if (typeof blueprint.metrics.averageResilience === 'number') {
    lines.push(
      `- Resilience (avg/min/max): ${blueprint.metrics.averageResilience.toFixed(3)} / ${blueprint.metrics.minResilience?.toFixed(3)} / ${blueprint.metrics.maxResilience?.toFixed(3)}`,
    );
  }
  if (typeof blueprint.metrics.averageAutomation === 'number') {
    lines.push(`- Automation (avg): ${formatBps(blueprint.metrics.averageAutomation)}`);
  }
  if (typeof blueprint.metrics.averageCompliance === 'number') {
    lines.push(`- Compliance (avg): ${formatBps(blueprint.metrics.averageCompliance)}`);
  }
  lines.push(`- L2 Settlement Coverage: ${(blueprint.metrics.l2SettlementCoverage * 100).toFixed(1)}%`);
  lines.push(`- Sentinel Families: ${blueprint.metrics.sentinelFamilies}`);
  lines.push(`- Global Infra Touchpoints: ${blueprint.metrics.globalInfraCount}`);
  lines.push(`- Domain Infra Touchpoints: ${blueprint.metrics.domainInfraCount}`);
  lines.push(`- Autopilot Coverage: ${(blueprint.metrics.autopilotCoverage * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('## Global Controls & Guard Rails');
  lines.push(formatAddress('IoT Oracle Router', blueprint.global.iotOracleRouter));
  lines.push(formatAddress('Default L2 Gateway', blueprint.global.defaultL2Gateway));
  lines.push(formatAddress('Treasury Bridge', blueprint.global.treasuryBridge));
  lines.push(formatAddress('DID Registry', blueprint.global.didRegistry));
  lines.push(formatAddress('System Pause', blueprint.global.systemPause));
  lines.push(formatAddress('Escalation Bridge', blueprint.global.escalationBridge));
  lines.push(formatAddress('Mesh Coordinator', blueprint.global.meshCoordinator));
  lines.push(formatAddress('Data Lake', blueprint.global.dataLake));
  lines.push(formatAddress('Identity Bridge', blueprint.global.identityBridge));
  lines.push(`- Manifest URI: ${blueprint.global.manifestURI}`);
  lines.push(`- L2 Sync Cadence: ${blueprint.global.l2SyncCadenceSeconds}s`);
  lines.push(`- Infra Topology URI: ${blueprint.global.topologyURI ?? '—'}`);
  lines.push(
    `- Infra Autopilot: ${blueprint.global.autopilotCadenceSeconds ? `${blueprint.global.autopilotCadenceSeconds}s` : 'manual'} (${blueprint.global.enforceDecentralizedInfra ? 'enforced' : 'advisory'})`,
  );
  lines.push(`- Treasury Buffer: ${formatBps(blueprint.guards.treasuryBufferBps)}`);
  lines.push(`- Circuit Breaker: ${formatBps(blueprint.guards.circuitBreakerBps)}`);
  lines.push(`- Anomaly Grace Period: ${blueprint.guards.anomalyGracePeriod || 0}s`);
  lines.push(`- Auto Pause Enabled: ${blueprint.guards.autoPauseEnabled ? 'Yes' : 'No'}`);
  lines.push(formatAddress('Oversight Council', blueprint.guards.oversightCouncil));
  lines.push(`- Telemetry Manifest Hash: ${blueprint.telemetry.manifestHash ?? '—'}`);
  lines.push(`- Telemetry Metrics Digest: ${blueprint.telemetry.metricsDigest ?? '—'}`);
  lines.push(`- Telemetry Resilience Floor: ${formatBps(blueprint.telemetry.resilienceFloorBps)}`);
  lines.push(`- Telemetry Automation Floor: ${formatBps(blueprint.telemetry.automationFloorBps)}`);
  lines.push(`- Telemetry Oversight Weight: ${formatBps(blueprint.telemetry.oversightWeightBps)}`);
  lines.push('');
  lines.push('### Emergency Calldata');
  lines.push('```');
  if (blueprint.calldata.systemPause) {
    lines.push(`setSystemPause: ${blueprint.calldata.systemPause}`);
  }
  if (blueprint.calldata.escalationBridge) {
    lines.push(`setEscalationBridge: ${blueprint.calldata.escalationBridge}`);
  }
  lines.push(`setGlobalConfig: ${blueprint.calldata.globalConfig}`);
  lines.push(`setGlobalGuards: ${blueprint.calldata.globalGuards}`);
  lines.push(`setGlobalTelemetry: ${blueprint.calldata.globalTelemetry}`);
  if (blueprint.calldata.globalInfrastructure) {
    lines.push(`setGlobalInfrastructure: ${blueprint.calldata.globalInfrastructure}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Decentralized Infrastructure Mesh (Global)');
  blueprint.infrastructure.global.forEach((integration, idx) => {
    const endpoint = integration.endpoint ?? '—';
    lines.push(`- [G${idx + 1}] ${integration.name} — ${integration.role} (status: ${integration.status}, endpoint: ${endpoint})`);
  });
  lines.push('');
  lines.push('```mermaid');
  lines.push(blueprint.mermaid);
  lines.push('```');
  lines.push('');
  blueprint.domains.forEach((domain) => {
    lines.push(renderDomain(domain, blueprint.global.l2SyncCadenceSeconds));
  });
  lines.push('');
  lines.push('## Operational Checklist');
  lines.push('- [ ] Review calldata payloads with governance multisig');
  lines.push('- [ ] Publish updated manifest & metrics digests to IPFS/Arweave');
  lines.push('- [ ] Confirm subgraph indexing of new domain telemetry');
  lines.push('- [ ] Announce readiness to stakeholder channels with runbook attached');
  lines.push('- [ ] Monitor Resilience Index streaming dashboards for anomalies');
  lines.push('');
  return lines.join('\n');
}
