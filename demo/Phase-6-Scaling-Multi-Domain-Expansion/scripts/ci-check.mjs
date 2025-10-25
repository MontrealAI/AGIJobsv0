#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const root = join(__dirname, '..');
const configPath = join(root, 'config', 'domains.phase6.json');
const repoAbiPath = join(__dirname, '..', '..', '..', 'subgraph', 'abis', 'Phase6ExpansionManager.json');
const demoAbiPath = join(root, 'abi', 'Phase6ExpansionManager.json');
const repoRegistryAbiPath = join(__dirname, '..', '..', '..', 'subgraph', 'abis', 'Phase6DomainRegistry.json');
const demoRegistryAbiPath = join(root, 'abi', 'Phase6DomainRegistry.json');
const htmlPath = join(root, 'index.html');

function fail(message) {
  console.error(`\x1b[31m✖ ${message}\x1b[0m`);
  process.exit(1);
}

if (!existsSync(configPath)) {
  fail(`Config file missing: ${configPath}`);
}
if (!existsSync(repoAbiPath)) {
  fail(`ABI file missing: ${repoAbiPath}`);
}
if (!existsSync(demoAbiPath)) {
  fail(`Demo ABI file missing: ${demoAbiPath}`);
}
if (!existsSync(htmlPath)) {
  fail(`UI file missing: ${htmlPath}`);
}
if (!existsSync(repoRegistryAbiPath)) {
  fail(`Registry ABI file missing: ${repoRegistryAbiPath}`);
}
if (!existsSync(demoRegistryAbiPath)) {
  fail(`Demo registry ABI file missing: ${demoRegistryAbiPath}`);
}

const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const repoAbi = JSON.parse(readFileSync(repoAbiPath, 'utf-8'));
const demoAbi = JSON.parse(readFileSync(demoAbiPath, 'utf-8'));
const repoRegistryAbi = JSON.parse(readFileSync(repoRegistryAbiPath, 'utf-8'));
const demoRegistryAbi = JSON.parse(readFileSync(demoRegistryAbiPath, 'utf-8'));
const html = readFileSync(htmlPath, 'utf-8');

if (!Array.isArray(repoAbi) || !repoAbi.length) {
  fail('ABI file is empty or invalid.');
}

if (JSON.stringify(repoAbi) !== JSON.stringify(demoAbi)) {
  fail('Demo ABI file is out of sync with subgraph ABI. Run `cp subgraph/abis/Phase6ExpansionManager.json demo/Phase-6-Scaling-Multi-Domain-Expansion/abi/`');
}
if (JSON.stringify(repoRegistryAbi) !== JSON.stringify(demoRegistryAbi)) {
  fail('Demo registry ABI file is out of sync with subgraph ABI. Run `cp subgraph/abis/Phase6DomainRegistry.json demo/Phase-6-Scaling-Multi-Domain-Expansion/abi/`');
}

if (!config.global || !config.global.manifestURI) {
  fail('Global manifestURI must be defined.');
}

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
['iotOracleRouter', 'defaultL2Gateway', 'didRegistry', 'treasuryBridge', 'systemPause', 'escalationBridge'].forEach(
  (key) => {
    const value = config.global[key];
    if (!value || typeof value !== 'string' || !addressPattern.test(value) || /^0x0{40}$/i.test(value)) {
      fail(`Global ${key} must be a non-zero 0x-prefixed address.`);
    }
  },
);

const guards = config.global.guards;
if (!guards || typeof guards !== 'object') {
  fail('Global guards configuration is required.');
}
['treasuryBufferBps', 'circuitBreakerBps', 'anomalyGracePeriod'].forEach((key) => {
  if (typeof guards[key] !== 'number' || guards[key] < 0) {
    fail(`global.guards.${key} must be a non-negative number.`);
  }
});
if (guards.treasuryBufferBps > 10000) {
  fail('global.guards.treasuryBufferBps must be <= 10000.');
}
if (guards.circuitBreakerBps > 10000) {
  fail('global.guards.circuitBreakerBps must be <= 10000.');
}
if (guards.anomalyGracePeriod !== 0 && guards.anomalyGracePeriod < 30) {
  fail('global.guards.anomalyGracePeriod must be 0 or >= 30 seconds.');
}
if (typeof guards.autoPauseEnabled !== 'boolean') {
  fail('global.guards.autoPauseEnabled must be a boolean.');
}
if (!guards.oversightCouncil || !addressPattern.test(guards.oversightCouncil) || /^0x0{40}$/i.test(guards.oversightCouncil)) {
  fail('global.guards.oversightCouncil must be a non-zero 0x-prefixed address.');
}

if (!Array.isArray(config.global.decentralizedInfra) || config.global.decentralizedInfra.length < 3) {
  fail('Global decentralizedInfra must include at least three integrations.');
}

config.global.decentralizedInfra.forEach((entry, idx) => {
  const context = `global.decentralizedInfra[${idx}]`;
  if (!entry || typeof entry !== 'object') {
    fail(`${context}: entry must be an object.`);
  }
  ['name', 'role', 'status'].forEach((key) => {
    if (!entry[key] || typeof entry[key] !== 'string') {
      fail(`${context}: ${key} must be a non-empty string.`);
    }
  });
  if (entry.endpoint && typeof entry.endpoint !== 'string') {
    fail(`${context}: endpoint must be a string when provided.`);
  }
});

const globalTelemetry = config.global.telemetry;
if (!globalTelemetry || typeof globalTelemetry !== 'object') {
  fail('Global telemetry configuration is required.');
}
['manifestHash', 'metricsDigest'].forEach((field) => {
  const value = globalTelemetry[field];
  if (!value || typeof value !== 'string' || value.length !== 66 || !value.startsWith('0x')) {
    fail(`global.telemetry.${field} must be a bytes32 hex string.`);
  }
});
['resilienceFloorBps', 'automationFloorBps', 'oversightWeightBps'].forEach((field) => {
  const value = globalTelemetry[field];
  if (typeof value !== 'number' || value < 0 || value > 10000) {
    fail(`global.telemetry.${field} must be a number between 0 and 10000.`);
  }
});

const globalInfrastructure = config.global.infrastructure;
if (!globalInfrastructure || typeof globalInfrastructure !== 'object') {
  fail('Global infrastructure configuration is required.');
}
['meshCoordinator', 'dataLake', 'identityBridge'].forEach((field) => {
  const value = globalInfrastructure[field];
  if (!value || typeof value !== 'string' || !addressPattern.test(value) || /^0x0{40}$/i.test(value)) {
    fail(`global.infrastructure.${field} must be a non-zero 0x-prefixed address.`);
  }
});
if (!globalInfrastructure.topologyURI || typeof globalInfrastructure.topologyURI !== 'string') {
  fail('global.infrastructure.topologyURI must be a non-empty string.');
}
if (
  typeof globalInfrastructure.autopilotCadence !== 'number' ||
  globalInfrastructure.autopilotCadence < 0
) {
  fail('global.infrastructure.autopilotCadence must be a non-negative number.');
}
if (
  globalInfrastructure.autopilotCadence !== 0 &&
  globalInfrastructure.autopilotCadence < 30
) {
  fail('global.infrastructure.autopilotCadence must be 0 or >= 30 seconds.');
}
if (typeof globalInfrastructure.enforceDecentralizedInfra !== 'boolean') {
  fail('global.infrastructure.enforceDecentralizedInfra must be boolean.');
}

if (!Array.isArray(config.domains) || config.domains.length === 0) {
  fail('At least one domain must be configured.');
}

const seen = new Set();

config.domains.forEach((domain, idx) => {
  const context = `domain[${idx}] (${domain.slug})`;
  if (!domain.slug || typeof domain.slug !== 'string') {
    fail(`${context}: slug is required.`);
  }
  if (seen.has(domain.slug.toLowerCase())) {
    fail(`${context}: slug is duplicated.`);
  }
  seen.add(domain.slug.toLowerCase());
  ['name', 'manifestURI', 'subgraph'].forEach((key) => {
    if (!domain[key] || typeof domain[key] !== 'string') {
      fail(`${context}: ${key} must be a non-empty string.`);
    }
  });
  ['validationModule', 'oracle', 'l2Gateway', 'executionRouter'].forEach((key) => {
    const value = domain[key];
    if (key === 'validationModule') {
      if (!value || !addressPattern.test(value) || /^0x0{40}$/i.test(value)) {
        fail(`${context}: validationModule must be a non-zero 0x-prefixed address.`);
      }
      return;
    }
    if (value && (!addressPattern.test(value) || /^0x0{40}$/i.test(value))) {
      fail(`${context}: ${key} must be a 0x-prefixed address when provided.`);
    }
  });
  if (typeof domain.heartbeatSeconds !== 'number' || domain.heartbeatSeconds < 30) {
    fail(`${context}: heartbeatSeconds must be >= 30 seconds.`);
  }
  if (!domain.operations || typeof domain.operations !== 'object') {
    fail(`${context}: operations configuration is required.`);
  }
  const ops = domain.operations;
  ['maxActiveJobs', 'maxQueueDepth', 'treasuryShareBps', 'circuitBreakerBps'].forEach((key) => {
    if (typeof ops[key] !== 'number' || ops[key] <= 0) {
      fail(`${context}: operations.${key} must be a positive number.`);
    }
  });
  if (ops.maxQueueDepth < ops.maxActiveJobs) {
    fail(`${context}: operations.maxQueueDepth must be >= operations.maxActiveJobs.`);
  }
  if (ops.treasuryShareBps > 10000 || ops.circuitBreakerBps > 10000) {
    fail(`${context}: operations treasury/circuit breaker BPS must be <= 10000.`);
  }
  if (typeof ops.requiresHumanValidation !== 'boolean') {
    fail(`${context}: operations.requiresHumanValidation must be boolean.`);
  }
  const minStakeValue = ops.minStake;
  if (
    (typeof minStakeValue !== 'string' && typeof minStakeValue !== 'number') ||
    BigInt(minStakeValue) <= 0n
  ) {
    fail(`${context}: operations.minStake must be > 0 (string or number).`);
  }
  if (!Array.isArray(domain.skillTags) || domain.skillTags.length === 0) {
    fail(`${context}: skillTags must include at least one entry.`);
  }
  const metadata = domain.metadata;
  if (!metadata || typeof metadata !== 'object') {
    fail(`${context}: metadata object is required.`);
  }
  if (!domain.telemetry || typeof domain.telemetry !== 'object') {
    fail(`${context}: telemetry object is required.`);
  }
  const telemetry = domain.telemetry;
  ['resilienceBps', 'automationBps', 'complianceBps'].forEach((field) => {
    const value = telemetry[field];
    if (typeof value !== 'number' || value < 0 || value > 10000) {
      fail(`${context}: telemetry.${field} must be between 0 and 10000.`);
    }
  });
  if (
    typeof telemetry.settlementLatencySeconds !== 'number' ||
    telemetry.settlementLatencySeconds < 0
  ) {
    fail(`${context}: telemetry.settlementLatencySeconds must be >= 0.`);
  }
  if (typeof telemetry.usesL2Settlement !== 'boolean') {
    fail(`${context}: telemetry.usesL2Settlement must be boolean.`);
  }
  ['sentinelOracle', 'settlementAsset'].forEach((field) => {
    const value = telemetry[field];
    if (value && (!addressPattern.test(value) || /^0x0{40}$/i.test(value))) {
      fail(`${context}: telemetry.${field} must be a valid 0x-prefixed address when provided.`);
    }
  });
  ['metricsDigest', 'manifestHash'].forEach((field) => {
    const value = telemetry[field];
    if (!value || typeof value !== 'string' || value.length !== 66 || !value.startsWith('0x')) {
      fail(`${context}: telemetry.${field} must be a bytes32 hex string.`);
    }
  });
  ['domain', 'l2', 'sentinel', 'uptime'].forEach((key) => {
    if (!metadata[key] || typeof metadata[key] !== 'string') {
      fail(`${context}: metadata.${key} must be a non-empty string.`);
    }
  });
  const resilienceIndex = Number.parseFloat(metadata.resilienceIndex);
  if (!Number.isFinite(resilienceIndex) || resilienceIndex <= 0 || resilienceIndex > 1) {
    fail(`${context}: metadata.resilienceIndex must be a number between 0 and 1.`);
  }
  const valueFlow = metadata.valueFlowMonthlyUSD;
  if (typeof valueFlow !== 'number' || !Number.isFinite(valueFlow) || valueFlow < 0) {
    fail(`${context}: metadata.valueFlowMonthlyUSD must be a positive number.`);
  }
  if (metadata.valueFlowDisplay && typeof metadata.valueFlowDisplay !== 'string') {
    fail(`${context}: metadata.valueFlowDisplay must be a string when provided.`);
  }
  if (!Array.isArray(domain.infrastructure) || domain.infrastructure.length < 3) {
    fail(`${context}: infrastructure must define at least three integrations.`);
  }
  domain.infrastructure.forEach((integration, infraIdx) => {
    const infraContext = `${context}.infrastructure[${infraIdx}]`;
    if (!integration || typeof integration !== 'object') {
      fail(`${infraContext}: entry must be an object.`);
    }
    ['layer', 'name', 'role', 'status'].forEach((key) => {
      if (!integration[key] || typeof integration[key] !== 'string') {
        fail(`${infraContext}: ${key} must be a non-empty string.`);
      }
    });
    ['endpoint', 'uri'].forEach((key) => {
      if (integration[key] && typeof integration[key] !== 'string') {
        fail(`${infraContext}: ${key} must be a string when provided.`);
      }
    });
  });

  if (!domain.infrastructureControl || typeof domain.infrastructureControl !== 'object') {
    fail(`${context}: infrastructureControl configuration is required.`);
  }

  const control = domain.infrastructureControl;
  if (
    !control.controlPlaneURI ||
    typeof control.controlPlaneURI !== 'string' ||
    control.controlPlaneURI.trim().length === 0
  ) {
    fail(`${context}: infrastructureControl.controlPlaneURI must be a non-empty string.`);
  }

  ['agentOps', 'dataPipeline', 'credentialVerifier', 'fallbackOperator'].forEach((field) => {
    const value = control[field];
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (typeof value !== 'string' || !addressPattern.test(value) || /^0x0{40}$/i.test(value)) {
      fail(`${context}: infrastructureControl.${field} must be a valid 0x-prefixed address when provided.`);
    }
  });

  if (control.autopilotEnabled !== undefined && typeof control.autopilotEnabled !== 'boolean') {
    fail(`${context}: infrastructureControl.autopilotEnabled must be boolean when provided.`);
  }

  if (control.autopilotCadence !== undefined) {
    const cadence = Number(control.autopilotCadence);
    if (!Number.isFinite(cadence)) {
      fail(`${context}: infrastructureControl.autopilotCadence must be a finite number.`);
    }
    if (cadence < 0) {
      fail(`${context}: infrastructureControl.autopilotCadence must be >= 0.`);
    }
    if (cadence !== 0 && cadence < 30) {
      fail(`${context}: infrastructureControl.autopilotCadence must be 0 or >= 30 seconds.`);
    }
  }
});

const registry = config.registry;
if (!registry || typeof registry !== 'object') {
  fail('registry configuration is required.');
}
if (registry.manifestHash && (!registry.manifestHash.startsWith('0x') || registry.manifestHash.length !== 66)) {
  fail('registry.manifestHash must be a bytes32 hex string when provided.');
}
if (registry.contract && (!addressPattern.test(registry.contract) || /^0x0{40}$/i.test(registry.contract))) {
  fail('registry.contract must be a valid 0x-prefixed address when provided.');
}
if (!Array.isArray(registry.domains) || registry.domains.length === 0) {
  fail('registry.domains must contain at least one domain.');
}

const domainSlugs = new Set(config.domains.map((domain) => domain.slug.toLowerCase()));
registry.domains.forEach((registryDomain, idx) => {
  const context = `registry.domains[${idx}]`;
  if (!registryDomain || typeof registryDomain !== 'object') {
    fail(`${context} must be an object.`);
  }
  if (!registryDomain.slug || typeof registryDomain.slug !== 'string') {
    fail(`${context}.slug must be a non-empty string.`);
  }
  if (!domainSlugs.has(registryDomain.slug.toLowerCase())) {
    fail(`${context}.slug must correspond to an existing domain slug.`);
  }
  if (!registryDomain.manifestHash || registryDomain.manifestHash.length !== 66 || !registryDomain.manifestHash.startsWith('0x')) {
    fail(`${context}.manifestHash must be a bytes32 hex string.`);
  }
  if (registryDomain.metadataURI && typeof registryDomain.metadataURI !== 'string') {
    fail(`${context}.metadataURI must be a string when provided.`);
  }
  const credentialRule = registryDomain.credentialRule;
  if (credentialRule) {
    if (typeof credentialRule !== 'object') {
      fail(`${context}.credentialRule must be an object when provided.`);
    }
    if (credentialRule.attestor && (!addressPattern.test(credentialRule.attestor) || /^0x0{40}$/i.test(credentialRule.attestor))) {
      fail(`${context}.credentialRule.attestor must be a valid address when provided.`);
    }
    if (
      credentialRule.schemaId &&
      (typeof credentialRule.schemaId !== 'string' || credentialRule.schemaId.length !== 66 || !credentialRule.schemaId.startsWith('0x'))
    ) {
      fail(`${context}.credentialRule.schemaId must be a bytes32 hex string when provided.`);
    }
    if (credentialRule.uri && typeof credentialRule.uri !== 'string') {
      fail(`${context}.credentialRule.uri must be a string when provided.`);
    }
  }
  if (!Array.isArray(registryDomain.skills) || registryDomain.skills.length === 0) {
    fail(`${context}.skills must include at least one skill definition.`);
  }
  registryDomain.skills.forEach((skill, skillIdx) => {
    const skillContext = `${context}.skills[${skillIdx}]`;
    if (!skill || typeof skill !== 'object') {
      fail(`${skillContext} must be an object.`);
    }
    if (!skill.key || typeof skill.key !== 'string') {
      fail(`${skillContext}.key must be a non-empty string.`);
    }
    if (!skill.label || typeof skill.label !== 'string') {
      fail(`${skillContext}.label must be a non-empty string.`);
    }
    if (!skill.metadataURI || typeof skill.metadataURI !== 'string') {
      fail(`${skillContext}.metadataURI must be a non-empty string.`);
    }
    if (skill.requiresCredential !== undefined && typeof skill.requiresCredential !== 'boolean') {
      fail(`${skillContext}.requiresCredential must be boolean when provided.`);
    }
    if (skill.active !== undefined && typeof skill.active !== 'boolean') {
      fail(`${skillContext}.active must be boolean when provided.`);
    }
  });
  if (!Array.isArray(registryDomain.agents) || registryDomain.agents.length === 0) {
    fail(`${context}.agents must include at least one agent.`);
  }
  registryDomain.agents.forEach((agent, agentIdx) => {
    const agentContext = `${context}.agents[${agentIdx}]`;
    if (!agent || typeof agent !== 'object') {
      fail(`${agentContext} must be an object.`);
    }
    if (!agent.address || typeof agent.address !== 'string' || !addressPattern.test(agent.address) || /^0x0{40}$/i.test(agent.address)) {
      fail(`${agentContext}.address must be a non-zero 0x-prefixed address.`);
    }
    if (!agent.alias || typeof agent.alias !== 'string') {
      fail(`${agentContext}.alias must be a non-empty string.`);
    }
    if (!agent.did || typeof agent.did !== 'string') {
      fail(`${agentContext}.did must be a non-empty string.`);
    }
    if (!agent.manifestHash || agent.manifestHash.length !== 66 || !agent.manifestHash.startsWith('0x')) {
      fail(`${agentContext}.manifestHash must be a bytes32 hex string.`);
    }
    if (
      agent.credentialHash &&
      (typeof agent.credentialHash !== 'string' || agent.credentialHash.length !== 66 || !agent.credentialHash.startsWith('0x'))
    ) {
      fail(`${agentContext}.credentialHash must be a bytes32 hex string when provided.`);
    }
    if (agent.approved !== undefined && typeof agent.approved !== 'boolean') {
      fail(`${agentContext}.approved must be boolean when provided.`);
    }
    if (agent.active !== undefined && typeof agent.active !== 'boolean') {
      fail(`${agentContext}.active must be boolean when provided.`);
    }
    if (!Array.isArray(agent.skills)) {
      fail(`${agentContext}.skills must be an array.`);
    }
    agent.skills.forEach((skillKey, skillIndex) => {
      if (typeof skillKey !== 'string' || !skillKey.trim()) {
        fail(`${agentContext}.skills[${skillIndex}] must be a non-empty string.`);
      }
    });
  });
});

if (!html.includes('mermaid')) {
  fail('index.html must embed a mermaid diagram.');
}

console.log('\x1b[32mPhase 6 demo configuration validated successfully.\x1b[0m');
console.log(`• Config domains: ${config.domains.length}`);
console.log(`• Global manifest: ${config.global.manifestURI}`);
