import fs from 'fs';
import { readGovernanceJson } from './governance-json';
import { isAddress, ZeroAddress } from 'ethers';

/** Version 1 is an intentionally bounded JSON-number subset of the Council ABI. */
export interface NationConfig {
  id: string;
  governor: string;
  weight: number;
  metadataURI: string;
}
export interface MandateConfig {
  id: string;
  quorum: number;
  metadataURI: string;
  startDelaySeconds: number;
  durationSeconds: number;
}
export interface VotePlan {
  mandateId: string;
  nationId: string;
  support: boolean;
  metadataURI: string;
}
export interface GovernanceConfig {
  schemaVersion: 1;
  owner: string;
  pauserRole: string;
  nations: NationConfig[];
  mandates: MandateConfig[];
  votes: VotePlan[];
}

function fail(field: string, reason: string): never {
  throw new Error(`Invalid governance configuration: ${field} ${reason}`);
}
function record(
  value: unknown,
  field: string,
  keys: string[]
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(field, 'must be an object');
  }
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    if (!keys.includes(key)) fail(`${field}.${key}`, 'is not allowed');
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(result, key))
      fail(`${field}.${key}`, 'is required');
  }
  return result;
}
function identifier(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-f]{64}$/.test(value) ||
    /^0x0{64}$/.test(value)
  ) {
    fail(
      field,
      'must be a nonzero canonical bytes32 (0x plus exactly 64 lowercase hex digits); no padding or conversion is performed'
    );
  }
}
export function validateGovernanceAddress(
  value: unknown,
  field: string
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]{40}$/.test(value) ||
    !isAddress(value) ||
    value.toLowerCase() === ZeroAddress
  ) {
    fail(
      field,
      'must be a valid nonzero Ethereum address (including checksum when mixed-case)'
    );
  }
}
function integer(
  value: unknown,
  field: string,
  minimum: number
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    fail(
      field,
      `must be a safe integer from ${minimum} through ${Number.MAX_SAFE_INTEGER}`
    );
  }
}
function metadata(value: unknown, field: string) {
  if (typeof value !== 'string' || Array.from(value).length > 2048)
    fail(field, 'must be a string of at most 2048 characters');
}
function list(value: unknown, field: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    fail(field, `must be an array with at most ${maximum} entries`);
  return value;
}
function unique(ids: Set<string>, id: string, field: string) {
  if (ids.has(id))
    fail(field, 'duplicates an identifier in the same namespace');
  ids.add(id);
}

export function resolveMandateWindow(
  mandate: MandateConfig,
  nowSeconds: number
): { start: bigint; end: bigint } {
  integer(nowSeconds, 'current timestamp', 1);
  integer(mandate.startDelaySeconds, 'startDelaySeconds', 0);
  integer(mandate.durationSeconds, 'durationSeconds', 0);
  const start = BigInt(nowSeconds) + BigInt(mandate.startDelaySeconds);
  // The Council uses end=0 for an open-ended mandate.
  const end =
    mandate.durationSeconds === 0
      ? 0n
      : start + BigInt(mandate.durationSeconds);
  if (
    start > BigInt(Number.MAX_SAFE_INTEGER) ||
    end > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    fail(
      `mandate ${mandate.id} time window`,
      'exceeds the safe timestamp bound'
    );
  }
  return { start, end };
}

/** Validate without rewriting bytes, addresses, order, weights, or vote intent. */
export function validateGovernanceConfig(
  input: unknown,
  nowSeconds = Math.floor(Date.now() / 1000)
): GovernanceConfig {
  const config = record(input, 'config', [
    'schemaVersion',
    'owner',
    'pauserRole',
    'nations',
    'mandates',
    'votes',
  ]);
  if (config.schemaVersion !== 1) fail('schemaVersion', 'must be 1');
  validateGovernanceAddress(config.owner, 'owner');
  identifier(config.pauserRole, 'pauserRole');
  const nationIds = new Set<string>();
  list(config.nations, 'nations', 256).forEach((value, i) => {
    const field = `nations[${i}]`;
    const nation = record(value, field, [
      'id',
      'governor',
      'weight',
      'metadataURI',
    ]);
    identifier(nation.id, `${field}.id`);
    unique(nationIds, nation.id, `${field}.id`);
    validateGovernanceAddress(nation.governor, `${field}.governor`);
    // MAX_SAFE_INTEGER is smaller than uint96.max; no precision is lost.
    integer(nation.weight, `${field}.weight`, 1);
    metadata(nation.metadataURI, `${field}.metadataURI`);
  });
  const mandateIds = new Set<string>();
  list(config.mandates, 'mandates', 256).forEach((value, i) => {
    const field = `mandates[${i}]`;
    const mandate = record(value, field, [
      'id',
      'quorum',
      'metadataURI',
      'startDelaySeconds',
      'durationSeconds',
    ]);
    identifier(mandate.id, `${field}.id`);
    unique(mandateIds, mandate.id, `${field}.id`);
    integer(mandate.quorum, `${field}.quorum`, 1);
    metadata(mandate.metadataURI, `${field}.metadataURI`);
    integer(mandate.startDelaySeconds, `${field}.startDelaySeconds`, 0);
    integer(mandate.durationSeconds, `${field}.durationSeconds`, 0);
    resolveMandateWindow(mandate as unknown as MandateConfig, nowSeconds);
  });
  list(config.votes, 'votes', 4096).forEach((value, i) => {
    const field = `votes[${i}]`;
    const vote = record(value, field, [
      'mandateId',
      'nationId',
      'support',
      'metadataURI',
    ]);
    identifier(vote.mandateId, `${field}.mandateId`);
    identifier(vote.nationId, `${field}.nationId`);
    if (!mandateIds.has(vote.mandateId))
      fail(`${field}.mandateId`, 'must reference a configured mandate');
    if (!nationIds.has(vote.nationId))
      fail(`${field}.nationId`, 'must reference a configured nation');
    if (typeof vote.support !== 'boolean')
      fail(`${field}.support`, 'must be a boolean');
    metadata(vote.metadataURI, `${field}.metadataURI`);
    // Repeated (mandate, nation) pairs are ordered recasts, as in the contract.
  });
  return input as GovernanceConfig;
}

export function loadGovernanceConfig(
  configPath: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): GovernanceConfig {
  if (!fs.existsSync(configPath))
    throw new Error(`Configuration file not found at ${configPath}`);
  return validateGovernanceConfig(readGovernanceJson(configPath), nowSeconds);
}
