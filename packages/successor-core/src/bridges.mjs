import { canonicalize, cloneJson, digestObject } from './integrity.mjs';

export class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}
function requireBridge(condition, code, message) {
  if (!condition) throw new BridgeError(code, message);
}
function record(value, fields, name) {
  requireBridge(
    value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_BRIDGE_RECORD',
    `${name} must be an object`
  );
  requireBridge(
    Object.keys(value).sort().join(',') === [...fields].sort().join(','),
    'INVALID_BRIDGE_RECORD',
    `${name} has missing or unexpected fields`
  );
  return value;
}
function text(value, name, max = 200) {
  requireBridge(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= max &&
      value.trim() === value,
    'INVALID_BRIDGE_RECORD',
    `Invalid ${name}`
  );
}
function sha(value, name, prefixed = true) {
  requireBridge(
    typeof value === 'string' &&
      (prefixed ? /^sha256:[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/).test(value),
    'INVALID_BRIDGE_DIGEST',
    `Invalid ${name}`
  );
}
function boundedJson(value) {
  const serialized = canonicalize(value);
  requireBridge(
    new TextEncoder().encode(serialized).length <= 262144,
    'BRIDGE_RECORD_TOO_LARGE',
    'Bridge record exceeds 256 KiB'
  );
}

export function validateComputerWorkBinding(value) {
  const m = record(
    value,
    [
      'schemaVersion',
      'institutionId',
      'missionId',
      'environment',
      'mode',
      'candidateDigest',
      'workOrderDigest',
      'taskSha256',
      'evidenceDigest',
      'deploymentId',
      'jobId',
      'action',
      'lease',
    ],
    'Computer-work binding'
  );
  boundedJson(m);
  requireBridge(
    m.schemaVersion === '1.0.0',
    'UNSUPPORTED_BRIDGE_VERSION',
    'Unsupported computer-work binding version'
  );
  for (const field of [
    'institutionId',
    'missionId',
    'environment',
    'deploymentId',
  ])
    text(m[field], field);
  requireBridge(
    ['fixture', 'live'].includes(m.mode),
    'INVALID_BRIDGE_RECORD',
    'Invalid computer-work mode'
  );
  requireBridge(
    typeof m.jobId === 'string' && /^[1-9][0-9]{0,79}$/.test(m.jobId),
    'INVALID_BRIDGE_RECORD',
    'Invalid job ID'
  );
  for (const field of ['candidateDigest', 'workOrderDigest', 'evidenceDigest'])
    sha(m[field], field);
  sha(m.taskSha256, 'legacy task digest', false);
  requireBridge(
    m.action &&
      typeof m.action === 'object' &&
      !Array.isArray(m.action) &&
      m.lease &&
      typeof m.lease === 'object' &&
      !Array.isArray(m.lease),
    'INVALID_BRIDGE_RECORD',
    'Action and signed lease are required'
  );
  for (const field of [
    'institutionId',
    'missionId',
    'environment',
    'mode',
    'candidateDigest',
    'workOrderDigest',
    'evidenceDigest',
    'deploymentId',
    'jobId',
  ])
    requireBridge(
      m.action[field] === m[field],
      'BRIDGE_BINDING_MISMATCH',
      `Action ${field} does not match the sealed binding`
    );
  requireBridge(
    m.action.taskDigest === m.taskSha256,
    'BRIDGE_BINDING_MISMATCH',
    'Action task digest does not match the legacy task'
  );
  requireBridge(
    m.action.level === 'A2' &&
      m.action.tool === 'computer-work' &&
      m.action.effect === 'sandbox-execution',
    'BRIDGE_SCOPE_DENIED',
    'Computer-work bridge only accepts an A2 sandbox action'
  );
  requireBridge(
    m.action.costMinor === '0',
    'BRIDGE_SCOPE_DENIED',
    'Fixture computer-work cannot spend funds'
  );
  return cloneJson(m);
}

export async function computerWorkBindingDigest(value) {
  return digestObject(
    'successor-computer-work-binding-v1',
    validateComputerWorkBinding(value)
  );
}

export function validateSettlementLink(value, deployment) {
  const link = record(
    value,
    [
      'schemaVersion',
      'mode',
      'missionId',
      'workOrderDigest',
      'chainId',
      'registryAddress',
      'tokenAddress',
      'tokenSymbol',
      'decimals',
      'jobId',
      'amountMinor',
      'status',
      'transactionHash',
      'blockHash',
      'blockNumber',
      'logIndex',
      'confirmations',
      'canonical',
    ],
    'Settlement link'
  );
  boundedJson(link);
  requireBridge(
    link.schemaVersion === '1.0.0',
    'UNSUPPORTED_BRIDGE_VERSION',
    'Unsupported settlement link version'
  );
  text(link.missionId, 'mission ID');
  sha(link.workOrderDigest, 'work-order digest');
  requireBridge(
    ['fixture', 'live'].includes(link.mode),
    'INVALID_SETTLEMENT_LINK',
    'Invalid settlement mode'
  );
  requireBridge(
    typeof link.chainId === 'string' && /^[1-9][0-9]{0,39}$/.test(link.chainId),
    'INVALID_SETTLEMENT_LINK',
    'Chain ID must be an exact positive decimal string'
  );
  requireBridge(
    typeof link.jobId === 'string' && /^[1-9][0-9]{0,79}$/.test(link.jobId),
    'INVALID_SETTLEMENT_LINK',
    'Job ID must be an exact positive decimal string'
  );
  requireBridge(
    typeof link.amountMinor === 'string' &&
      /^(0|[1-9][0-9]{0,77})$/.test(link.amountMinor),
    'INVALID_SETTLEMENT_LINK',
    'Amount must be an integer base-unit string'
  );
  requireBridge(
    link.tokenSymbol === 'AGIALPHA' && link.decimals === 18,
    'SETTLEMENT_ASSET_MISMATCH',
    'This v2 bridge preserves AGIALPHA with 18 decimals; USDC proposals are not funding'
  );
  for (const field of ['registryAddress', 'tokenAddress'])
    requireBridge(
      typeof link[field] === 'string' &&
        /^0x[0-9a-fA-F]{40}$/.test(link[field]) &&
        !/^0x0{40}$/.test(link[field]),
      'INVALID_SETTLEMENT_LINK',
      `Invalid ${field}`
    );
  for (const field of ['transactionHash', 'blockHash'])
    requireBridge(
      typeof link[field] === 'string' &&
        /^0x[0-9a-fA-F]{64}$/.test(link[field]) &&
        !/^0x0{64}$/.test(link[field]),
      'INVALID_SETTLEMENT_LINK',
      `Invalid ${field}`
    );
  for (const field of ['blockNumber', 'logIndex', 'confirmations'])
    requireBridge(
      Number.isSafeInteger(link[field]) && link[field] >= 0,
      'INVALID_SETTLEMENT_LINK',
      `Invalid ${field}`
    );
  requireBridge(
    ['submitted', 'confirmed', 'reverted', 'reorged'].includes(link.status) &&
      typeof link.canonical === 'boolean',
    'INVALID_SETTLEMENT_LINK',
    'Invalid settlement status'
  );
  requireBridge(
    deployment && typeof deployment === 'object',
    'UNCONFIGURED_SETTLEMENT',
    'Trusted deployment configuration is required'
  );
  for (const field of ['chainId', 'mode', 'tokenSymbol', 'decimals'])
    requireBridge(
      link[field] === deployment[field],
      'SETTLEMENT_DEPLOYMENT_MISMATCH',
      `Settlement ${field} differs from the trusted deployment`
    );
  for (const field of ['registryAddress', 'tokenAddress'])
    requireBridge(
      link[field].toLowerCase() === String(deployment[field]).toLowerCase(),
      'SETTLEMENT_DEPLOYMENT_MISMATCH',
      `Settlement ${field} differs from the trusted deployment`
    );
  requireBridge(
    Number.isSafeInteger(deployment.minConfirmations) &&
      deployment.minConfirmations >= 1,
    'UNCONFIGURED_SETTLEMENT',
    'Trusted finality threshold is required'
  );
  requireBridge(
    link.status !== 'confirmed' ||
      (link.canonical && link.confirmations >= deployment.minConfirmations),
    'UNCONFIRMED_SETTLEMENT',
    'Confirmation requires canonical event evidence and the configured finality threshold'
  );
  return cloneJson(link);
}

export async function describeSettlementLink(value, deployment) {
  const link = validateSettlementLink(value, deployment);
  return {
    link,
    digest: await digestObject('successor-settlement-link-v1', link),
    economicOnly: true,
    simulated: link.mode === 'fixture',
    providerAuthenticated: false,
    settlementApproved: false,
    buyerAccepted: false,
    proofApproved: false,
    authorityGranted: false,
    productionApproved: false,
  };
}
