/** Shared offline validation. Syntax and configured values never prove deployment or authority. */
import { isAddress } from 'ethers';

type ObjectValue = Record<string, unknown>;
const UINT32 = 2 ** 32 - 1;
const UINT48 = 2 ** 48 - 1;

function fail(path: string, message: string): never {
  throw new Error(`${path} ${message}`);
}
function object(value: unknown, path: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(path, 'must be an object.');
  return value as ObjectValue;
}
function keys(record: ObjectValue, allowed: string[], path: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key))
      fail(`${path}.${key}`, 'is not a supported configuration field.');
  }
}
function text(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail(path, 'must be a non-empty string without control characters.');
  }
  return value;
}
function number(
  value: unknown,
  path: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    fail(path, `must be a finite number between ${min} and ${max}.`);
  }
  return value;
}
function integer(
  value: unknown,
  path: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): number {
  const result = number(value, path, min, max);
  if (!Number.isSafeInteger(result))
    fail(path, 'must be a safe integer; no truncation is permitted.');
  return result;
}
function bool(value: unknown, path: string): void {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean.');
}
function address(value: unknown, path: string, nonzero = false): void {
  if (
    typeof value !== 'string' ||
    !isAddress(value) ||
    (nonzero && /^0x0{40}$/i.test(value))
  ) {
    fail(
      path,
      `must be a valid ${nonzero ? 'non-zero ' : ''}Ethereum address.`
    );
  }
}
function bytes32(value: unknown, path: string): void {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]{64}$/.test(value) ||
    /^0x0{64}$/.test(value)
  ) {
    fail(path, 'must be a non-zero bytes32 hex string.');
  }
}
function strings(value: unknown, path: string): void {
  if (!Array.isArray(value)) fail(path, 'must be an array.');
  const seen = new Set<string>();
  value.forEach((entry, i) => {
    const key = text(entry, `${path}[${i}]`).trim().toLowerCase();
    if (seen.has(key)) fail(path, `contains duplicate value ${key}.`);
    seen.add(key);
  });
}
function optional(
  parent: ObjectValue,
  key: string,
  path: string,
  validate: (value: unknown, path: string) => void
): void {
  if (parent[key] !== undefined) validate(parent[key], `${path}.${key}`);
}
function cadence(value: unknown, path: string): void {
  const seconds = integer(value, path);
  if (seconds !== 0 && seconds < 30)
    fail(path, 'must be 0 or at least 30 seconds.');
}
function addresses(parent: ObjectValue, keys: string[], path: string): void {
  keys.forEach((key) => optional(parent, key, path, address));
}
function telemetry(value: unknown, path: string, global = false): void {
  const record = object(value, path);
  keys(
    record,
    global
      ? [
          'manifestHash',
          'metricsDigest',
          'resilienceFloorBps',
          'automationFloorBps',
          'oversightWeightBps',
        ]
      : [
          'resilienceBps',
          'automationBps',
          'complianceBps',
          'settlementLatencySeconds',
          'usesL2Settlement',
          'sentinelOracle',
          'settlementAsset',
          'metricsDigest',
          'manifestHash',
        ],
    path
  );
  bytes32(record.metricsDigest, `${path}.metricsDigest`);
  bytes32(record.manifestHash, `${path}.manifestHash`);
  const bpsKeys = global
    ? ['resilienceFloorBps', 'automationFloorBps', 'oversightWeightBps']
    : ['resilienceBps', 'automationBps', 'complianceBps'];
  bpsKeys.forEach((key) => integer(record[key], `${path}.${key}`, 0, 10000));
  if (!global) {
    const latency = integer(
      record.settlementLatencySeconds,
      `${path}.settlementLatencySeconds`,
      0,
      UINT32
    );
    if (latency !== 0 && latency < 5)
      fail(
        `${path}.settlementLatencySeconds`,
        'must be 0 or at least 5 seconds.'
      );
    bool(record.usesL2Settlement, `${path}.usesL2Settlement`);
    addresses(record, ['sentinelOracle', 'settlementAsset'], path);
  }
}
function infrastructure(value: unknown, path: string, global = false): void {
  const record = object(value, path);
  keys(
    record,
    global
      ? [
          'meshCoordinator',
          'dataLake',
          'identityBridge',
          'topologyURI',
          'autopilotCadence',
          'enforceDecentralizedInfra',
        ]
      : [
          'agentOps',
          'dataPipeline',
          'credentialVerifier',
          'fallbackOperator',
          'controlPlaneURI',
          'autopilotCadence',
          'autopilotEnabled',
        ],
    path
  );
  text(
    record[global ? 'topologyURI' : 'controlPlaneURI'],
    `${path}.${global ? 'topologyURI' : 'controlPlaneURI'}`
  );
  addresses(
    record,
    global
      ? ['meshCoordinator', 'dataLake', 'identityBridge']
      : ['agentOps', 'dataPipeline', 'credentialVerifier', 'fallbackOperator'],
    path
  );
  optional(record, 'autopilotCadence', path, cadence);
  optional(
    record,
    global ? 'enforceDecentralizedInfra' : 'autopilotEnabled',
    path,
    bool
  );
  if (
    !global &&
    record.autopilotEnabled === true &&
    (record.autopilotCadence === undefined || record.autopilotCadence === 0)
  ) {
    fail(
      `${path}.autopilotCadence`,
      'must be at least 30 seconds when autopilot is enabled.'
    );
  }
}
function integrations(value: unknown, path: string): void {
  if (!Array.isArray(value)) fail(path, 'must be an array.');
  value.forEach((entry, i) => {
    const row = object(entry, `${path}[${i}]`);
    ['name', 'role', 'status'].forEach((key) =>
      text(row[key], `${path}[${i}].${key}`)
    );
    ['layer', 'endpoint', 'uri'].forEach((key) =>
      optional(row, key, `${path}[${i}]`, text)
    );
  });
}
function credentials(value: unknown, path: string): void {
  if (!Array.isArray(value)) fail(path, 'must be an array.');
  value.forEach((entry, i) => {
    const row = object(entry, `${path}[${i}]`);
    [
      'name',
      'requirement',
      'credentialType',
      'format',
      'registry',
      'evidence',
    ].forEach((key) => text(row[key], `${path}[${i}].${key}`));
    ['issuers', 'verifiers'].forEach((key) =>
      strings(row[key], `${path}[${i}].${key}`)
    );
    optional(row, 'notes', `${path}[${i}]`, text);
  });
}

export function validatePhase6Config(value: unknown): void {
  const config = object(value, 'config');
  keys(config, ['scenario', 'global', 'domains'], 'config');
  if (config.scenario !== undefined) {
    const scenario = object(config.scenario, 'scenario');
    keys(scenario, ['mode', 'description'], 'scenario');
    if (
      typeof scenario.mode !== 'string' ||
      !['illustrative', 'operator-supplied'].includes(scenario.mode)
    )
      fail('scenario.mode', 'must be illustrative or operator-supplied.');
    text(scenario.description, 'scenario.description');
  }
  const global = object(config.global, 'global');
  keys(
    global,
    [
      'manifestURI',
      'iotOracleRouter',
      'defaultL2Gateway',
      'didRegistry',
      'treasuryBridge',
      'l2SyncCadence',
      'systemPause',
      'escalationBridge',
      'decentralizedInfra',
      'credentials',
      'guards',
      'telemetry',
      'infrastructure',
    ],
    'global'
  );
  text(global.manifestURI, 'global.manifestURI');
  addresses(
    global,
    [
      'iotOracleRouter',
      'defaultL2Gateway',
      'didRegistry',
      'treasuryBridge',
      'systemPause',
      'escalationBridge',
    ],
    'global'
  );
  for (const field of ['systemPause', 'escalationBridge']) {
    optional(global, field, 'global', (value, path) =>
      address(value, path, true)
    );
  }
  optional(global, 'l2SyncCadence', 'global', cadence);
  optional(global, 'decentralizedInfra', 'global', integrations);
  optional(global, 'infrastructure', 'global', (item, path) =>
    infrastructure(item, path, true)
  );
  optional(global, 'telemetry', 'global', (item, path) =>
    telemetry(item, path, true)
  );
  if (global.guards !== undefined) {
    const guards = object(global.guards, 'global.guards');
    keys(
      guards,
      [
        'treasuryBufferBps',
        'circuitBreakerBps',
        'anomalyGracePeriod',
        'autoPauseEnabled',
        'oversightCouncil',
      ],
      'global.guards'
    );
    ['treasuryBufferBps', 'circuitBreakerBps'].forEach((key) =>
      integer(guards[key], `global.guards.${key}`, 0, 10000)
    );
    integer(
      guards.anomalyGracePeriod,
      'global.guards.anomalyGracePeriod',
      0,
      UINT32
    );
    cadence(guards.anomalyGracePeriod, 'global.guards.anomalyGracePeriod');
    bool(guards.autoPauseEnabled, 'global.guards.autoPauseEnabled');
    optional(guards, 'oversightCouncil', 'global.guards', address);
  }
  if (global.credentials !== undefined) {
    const record = object(global.credentials, 'global.credentials');
    optional(record, 'revocationRegistry', 'global.credentials', text);
    for (const [key, required] of Object.entries({
      trustAnchors: ['name', 'did', 'role'],
      issuers: ['name', 'did', 'attestationType', 'registry'],
      policies: ['name', 'description', 'uri'],
    })) {
      if (record[key] === undefined) continue;
      if (!Array.isArray(record[key]))
        fail(`global.credentials.${key}`, 'must be an array.');
      (record[key] as unknown[]).forEach((entry, i) => {
        const path = `global.credentials.${key}[${i}]`;
        const row = object(entry, path);
        required.forEach((field) => text(row[field], `${path}.${field}`));
        optional(row, 'domains', path, strings);
        optional(row, 'policyURI', path, text);
      });
    }
  }
  if (!Array.isArray(config.domains) || config.domains.length === 0)
    fail('domains', 'must be a non-empty array.');
  const seen = new Set<string>();
  config.domains.forEach((item, index) => {
    const path = `domains[${index}]`;
    const domain = object(item, path);
    keys(
      domain,
      [
        'slug',
        'lifecycle',
        'name',
        'manifestURI',
        'subgraph',
        'validationModule',
        'oracle',
        'l2Gateway',
        'executionRouter',
        'heartbeatSeconds',
        'active',
        'operations',
        'telemetry',
        'skillTags',
        'capabilities',
        'priority',
        'metadata',
        'infrastructure',
        'infrastructureControl',
        'sunsetPlan',
        'credentials',
      ],
      path
    );
    const slug = text(domain.slug, `${path}.slug`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      fail(
        `${path}.slug`,
        'must use canonical lowercase letters, digits and single hyphens.'
      );
    if (seen.has(slug)) fail(`${path}.slug`, `duplicates ${slug}.`);
    seen.add(slug);
    ['name', 'manifestURI', 'subgraph'].forEach((key) =>
      text(domain[key], `${path}.${key}`)
    );
    address(domain.validationModule, `${path}.validationModule`, true);
    addresses(domain, ['oracle', 'l2Gateway', 'executionRouter'], path);
    optional(domain, 'heartbeatSeconds', path, (item, field) =>
      integer(item, field, 30)
    );
    optional(domain, 'active', path, bool);
    if (
      domain.lifecycle !== undefined &&
      (typeof domain.lifecycle !== 'string' ||
        !['active', 'experimental', 'sunset'].includes(domain.lifecycle))
    )
      fail(`${path}.lifecycle`, 'must be active, experimental or sunset.');
    optional(domain, 'priority', path, number);
    optional(domain, 'skillTags', path, strings);
    if (domain.capabilities !== undefined) {
      const caps = object(domain.capabilities, `${path}.capabilities`);
      const names = new Set<string>();
      Object.entries(caps).forEach(([key, value]) => {
        text(key, `${path}.capabilities key`);
        const canonical = key.trim().toLowerCase();
        if (names.has(canonical))
          fail(`${path}.capabilities`, `contains duplicate key ${canonical}.`);
        names.add(canonical);
        number(value, `${path}.capabilities.${key}`);
      });
    }
    if (domain.operations !== undefined) {
      const ops = object(domain.operations, `${path}.operations`);
      keys(
        ops,
        [
          'maxActiveJobs',
          'maxQueueDepth',
          'minStake',
          'treasuryShareBps',
          'circuitBreakerBps',
          'requiresHumanValidation',
        ],
        `${path}.operations`
      );
      const active = integer(
        ops.maxActiveJobs,
        `${path}.operations.maxActiveJobs`,
        1,
        UINT48
      );
      integer(
        ops.maxQueueDepth,
        `${path}.operations.maxQueueDepth`,
        active,
        UINT48
      );
      if (typeof ops.minStake === 'number')
        integer(ops.minStake, `${path}.operations.minStake`, 1);
      if (
        !['string', 'number'].includes(typeof ops.minStake) ||
        !/^[1-9][0-9]*$/.test(String(ops.minStake)) ||
        BigInt(ops.minStake as string | number) >= 2n ** 96n
      )
        fail(
          `${path}.operations.minStake`,
          'must be an exact positive uint96 decimal integer; use a string for large values.'
        );
      ['treasuryShareBps', 'circuitBreakerBps'].forEach((key) =>
        integer(ops[key], `${path}.operations.${key}`, 0, 10000)
      );
      optional(ops, 'requiresHumanValidation', `${path}.operations`, bool);
    }
    optional(domain, 'telemetry', path, telemetry);
    optional(domain, 'infrastructureControl', path, infrastructure);
    optional(domain, 'infrastructure', path, integrations);
    optional(domain, 'credentials', path, credentials);
    if (domain.metadata !== undefined) {
      const metadata = object(domain.metadata, `${path}.metadata`);
      optional(
        metadata,
        'resilienceIndex',
        `${path}.metadata`,
        (value, field) => number(value, field, 0, 1)
      );
      optional(metadata, 'valueFlowMonthlyUSD', `${path}.metadata`, number);
    }
    if (domain.sunsetPlan !== undefined) {
      const sunset = object(domain.sunsetPlan, `${path}.sunsetPlan`);
      optional(sunset, 'reason', `${path}.sunsetPlan`, text);
      optional(sunset, 'retirementBlock', `${path}.sunsetPlan`, (item, field) =>
        integer(item, field, 1)
      );
      optional(sunset, 'handoffDomains', `${path}.sunsetPlan`, strings);
      optional(sunset, 'notes', `${path}.sunsetPlan`, text);
    }
    if (domain.lifecycle === 'sunset') {
      const sunset = object(domain.sunsetPlan, `${path}.sunsetPlan`);
      text(sunset.reason, `${path}.sunsetPlan.reason`);
      strings(sunset.handoffDomains, `${path}.sunsetPlan.handoffDomains`);
      if (!(sunset.handoffDomains as string[]).length)
        fail(`${path}.sunsetPlan.handoffDomains`, 'must not be empty.');
    }
  });
}

/** Reject duplicate object keys before JSON.parse can silently discard evidence. */
export function parsePhase6Json(source: string): unknown {
  // Let the native parser validate JSON grammar before the structural duplicate pass.
  const parsed: unknown = JSON.parse(source);
  let index = 0;
  const space = () => {
    while (/\s/.test(source[index] ?? '') && index < source.length) index += 1;
  };
  const string = (): string => {
    const start = index++;
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2;
        continue;
      }
      if (source[index++] === '"') break;
    }
    return JSON.parse(source.slice(start, index));
  };
  const visit = (path: string): void => {
    space();
    if (source[index] === '{') {
      index += 1;
      space();
      const keys = new Set<string>();
      while (source[index] !== '}') {
        const key = string();
        if (keys.has(key)) fail(path, `contains duplicate JSON key ${key}.`);
        keys.add(key);
        space();
        index += 1;
        visit(`${path}.${key}`);
        space();
        if (source[index] !== ',') break;
        index += 1;
        space();
      }
      index += 1;
    } else if (source[index] === '[') {
      index += 1;
      space();
      let item = 0;
      while (source[index] !== ']') {
        visit(`${path}[${item++}]`);
        space();
        if (source[index] !== ',') break;
        index += 1;
        space();
      }
      index += 1;
    } else if (source[index] === '"') string();
    else {
      while (index < source.length && !/[\s,\]}]/.test(source[index]))
        index += 1;
    }
  };
  visit('config');
  return parsed;
}
