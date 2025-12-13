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

const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const repoAbi = JSON.parse(readFileSync(repoAbiPath, 'utf-8'));
const demoAbi = JSON.parse(readFileSync(demoAbiPath, 'utf-8'));
const html = readFileSync(htmlPath, 'utf-8');

if (!Array.isArray(repoAbi) || !repoAbi.length) {
  fail('ABI file is empty or invalid.');
}

if (JSON.stringify(repoAbi) !== JSON.stringify(demoAbi)) {
  fail('Demo ABI file is out of sync with subgraph ABI. Run `cp subgraph/abis/Phase6ExpansionManager.json demo/Phase-6-Scaling-Multi-Domain-Expansion/abi/`');
}

if (!config.global || !config.global.manifestURI) {
  fail('Global manifestURI must be defined.');
}

const addressPattern = /^0x[0-9a-fA-F]{40}$/;
const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;

function validateAddress(value, context) {
  if (!value || typeof value !== 'string' || !addressPattern.test(value) || /^0x0{40}$/i.test(value)) {
    fail(`${context} must be a non-zero 0x-prefixed address.`);
  }
}

['iotOracleRouter', 'defaultL2Gateway', 'didRegistry', 'treasuryBridge', 'systemPause', 'escalationBridge'].forEach(
  (key) => validateAddress(config.global[key], `Global ${key}`),
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

const globalCredentials = config.global.credentials;
if (!globalCredentials || typeof globalCredentials !== 'object') {
  fail('Global credentials configuration is required.');
}

const trustAnchors = globalCredentials.trustAnchors;
if (!Array.isArray(trustAnchors) || trustAnchors.length < 3) {
  fail('global.credentials.trustAnchors must include at least three entries.');
}
trustAnchors.forEach((anchor, idx) => {
  const context = `global.credentials.trustAnchors[${idx}]`;
  if (!anchor || typeof anchor !== 'object') {
    fail(`${context}: entry must be an object.`);
  }
  ['name', 'did', 'role'].forEach((field) => {
    if (!anchor[field] || typeof anchor[field] !== 'string') {
      fail(`${context}: ${field} must be a non-empty string.`);
    }
  });
  if (anchor.policyURI && typeof anchor.policyURI !== 'string') {
    fail(`${context}: policyURI must be a string when provided.`);
  }
});

const issuerEntries = globalCredentials.issuers;
if (!Array.isArray(issuerEntries) || issuerEntries.length === 0) {
  fail('global.credentials.issuers must include at least one entry.');
}
issuerEntries.forEach((issuer, idx) => {
  const context = `global.credentials.issuers[${idx}]`;
  if (!issuer || typeof issuer !== 'object') {
    fail(`${context}: entry must be an object.`);
  }
  ['name', 'did', 'attestationType', 'registry'].forEach((field) => {
    if (!issuer[field] || typeof issuer[field] !== 'string') {
      fail(`${context}: ${field} must be a non-empty string.`);
    }
  });
  if (!Array.isArray(issuer.domains) || issuer.domains.length === 0) {
    fail(`${context}: domains must be a non-empty array of strings.`);
  }
  issuer.domains.forEach((domain, domainIdx) => {
    if (typeof domain !== 'string' || !domain.trim()) {
      fail(`${context}: domains[${domainIdx}] must be a non-empty string.`);
    }
  });
});

const credentialPolicies = globalCredentials.policies;
if (!Array.isArray(credentialPolicies) || credentialPolicies.length < 2) {
  fail('global.credentials.policies must include at least two entries.');
}
credentialPolicies.forEach((policy, idx) => {
  const context = `global.credentials.policies[${idx}]`;
  if (!policy || typeof policy !== 'object') {
    fail(`${context}: entry must be an object.`);
  }
  ['name', 'description', 'uri'].forEach((field) => {
    if (!policy[field] || typeof policy[field] !== 'string') {
      fail(`${context}: ${field} must be a non-empty string.`);
    }
  });
});

if (!globalCredentials.revocationRegistry || typeof globalCredentials.revocationRegistry !== 'string') {
  fail('global.credentials.revocationRegistry must be a non-empty string.');
}

const globalTelemetry = config.global.telemetry;
if (!globalTelemetry || typeof globalTelemetry !== 'object') {
  fail('Global telemetry configuration is required.');
}
['manifestHash', 'metricsDigest'].forEach((field) => {
  const value = globalTelemetry[field];
  if (!value || typeof value !== 'string' || !bytes32Pattern.test(value)) {
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
  validateAddress(globalInfrastructure[field], `global.infrastructure.${field}`);
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
      validateAddress(value, `${context}: validationModule`);
      return;
    }
    if (value) {
      validateAddress(value, `${context}: ${key}`);
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
  if (!Array.isArray(domain.credentials) || domain.credentials.length === 0) {
    fail(`${context}: credentials array is required with at least one entry.`);
  }
  domain.credentials.forEach((credential, credIdx) => {
    const credContext = `${context}.credentials[${credIdx}]`;
    if (!credential || typeof credential !== 'object') {
      fail(`${credContext}: entry must be an object.`);
    }
    ['name', 'requirement', 'credentialType', 'format'].forEach((field) => {
      if (!credential[field] || typeof credential[field] !== 'string') {
        fail(`${credContext}: ${field} must be a non-empty string.`);
      }
    });
    ['issuers', 'verifiers'].forEach((field) => {
      const list = credential[field];
      if (!Array.isArray(list) || list.length === 0) {
        fail(`${credContext}: ${field} must be a non-empty array of strings.`);
      }
      list.forEach((entry, entryIdx) => {
        if (typeof entry !== 'string' || !entry.trim()) {
          fail(`${credContext}: ${field}[${entryIdx}] must be a non-empty string.`);
        }
      });
    });
    ['registry', 'evidence'].forEach((field) => {
      if (!credential[field] || typeof credential[field] !== 'string') {
        fail(`${credContext}: ${field} must be a non-empty string.`);
      }
    });
    if (credential.notes && typeof credential.notes !== 'string') {
      fail(`${credContext}: notes must be a string when provided.`);
    }
  });
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
    if (value) {
      validateAddress(value, `${context}: telemetry.${field}`);
    }
  });
  ['metricsDigest', 'manifestHash'].forEach((field) => {
    const value = telemetry[field];
    if (!value || typeof value !== 'string' || !bytes32Pattern.test(value)) {
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

if (!html.includes('mermaid')) {
  fail('index.html must embed a mermaid diagram.');
}

console.log('\x1b[32mPhase 6 demo configuration validated successfully.\x1b[0m');
console.log(`• Config domains: ${config.domains.length}`);
console.log(`• Global manifest: ${config.global.manifestURI}`);
