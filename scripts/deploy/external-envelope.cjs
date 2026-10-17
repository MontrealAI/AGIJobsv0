'use strict';

const { createHash } = require('node:crypto');
const { ethers } = require('ethers');

const ENVELOPE_SCHEMA = 'jobs-external-envelope-v1';
const CONTEXT_SCHEMA = 'jobs-external-operation-v1';
const CONTEXT_KEYS = [
  'schema',
  'campaignId',
  'sourceCommit',
  'sourceTree',
  'compilerInputSha256',
  'configHash',
  'planHash',
  'creationScopeHash',
  'operationIndex',
  'operationKey',
  'creator',
  'governor',
  'preparedAt',
  'expiresAt',
];
const TRANSACTION_KEYS = [
  'type',
  'chainId',
  'nonce',
  'to',
  'value',
  'data',
  'gasLimit',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'accessList',
];
const ENVELOPE_KEYS = [
  'schema',
  'context',
  'transaction',
  'unsignedHex',
  'unsignedHash',
  'policyHash',
];
const MAX_UINT256 = (1n << 256n) - 1n;

function fail(message) {
  // Do not embed input values or ethers errors: raw signed bytes are capabilities.
  throw new Error(`External envelope: ${message}`);
}

function plainObject(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    fail(`${label} must be a plain JSON object`);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      typeof key !== 'string' ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    )
      fail(`${label} must contain only enumerable JSON data properties`);
  }
}

function exactKeys(value, keys, label) {
  plainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  )
    fail(`${label} has missing or unknown fields`);
}

function jsonArray(value, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    fail(`${label} must be a plain JSON array`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1)
    fail(`${label} must be a dense JSON array`);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      fail(`${label} must contain only JSON data properties`);
  }
}

// Deterministic, sorted-key JSON without coercion, getters, toJSON hooks, omitted
// values, sparse arrays, cycles, or unsafe numeric integers.
function canonicalJson(value) {
  const ancestors = new Set();
  function encode(item) {
    if (item === null) return 'null';
    if (typeof item === 'boolean' || typeof item === 'string')
      return JSON.stringify(item);
    if (typeof item === 'number') {
      if (
        !Number.isFinite(item) ||
        Object.is(item, -0) ||
        (Number.isInteger(item) && !Number.isSafeInteger(item))
      )
        fail('JSON contains a noncanonical number');
      return JSON.stringify(item);
    }
    if (typeof item !== 'object') fail('JSON contains an unsupported value');
    if (ancestors.has(item)) fail('JSON contains a cycle');
    ancestors.add(item);
    let encoded;
    if (Array.isArray(item)) {
      jsonArray(item, 'JSON array');
      encoded = `[${item.map(encode).join(',')}]`;
    } else {
      plainObject(item, 'JSON object');
      encoded = `{${Object.keys(item)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(item[key])}`)
        .join(',')}}`;
    }
    ancestors.delete(item);
    return encoded;
  }
  return encode(value);
}

function sha256Json(value) {
  return createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

function hex(value, bytes, label) {
  if (
    typeof value !== 'string' ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(value) ||
    (bytes !== undefined && value.length !== 2 + bytes * 2)
  )
    fail(`${label} must be literal byte hex`);
  return value.toLowerCase();
}

function digest(value, bytes, label) {
  if (
    typeof value !== 'string' ||
    !new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(value)
  )
    fail(`${label} must be an unprefixed hex digest`);
  return value.toLowerCase();
}

function address(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value))
    fail(`${label} must be a literal address`);
  try {
    return ethers.getAddress(value);
  } catch {
    fail(`${label} has an invalid address checksum`);
  }
}

function decimal(value, label, positive = false) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    fail(`${label} must be a canonical decimal string`);
  const number = BigInt(value);
  if (number > MAX_UINT256 || (positive && number === 0n))
    fail(`${label} is outside the permitted uint256 range`);
  return value;
}

function safeInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (
    !Number.isSafeInteger(value) ||
    Object.is(value, -0) ||
    value < 0 ||
    value > maximum
  )
    fail(`${label} must be a nonnegative safe integer in range`);
  return value;
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail(`${label} must be a canonical UTC ISO timestamp`);
  return value;
}

function normalizeContext(input) {
  exactKeys(input, CONTEXT_KEYS, 'context');
  if (input.schema !== CONTEXT_SCHEMA) fail('unknown context schema');
  if (
    typeof input.campaignId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.campaignId
    )
  )
    fail('campaignId must be a UUID');
  if (
    typeof input.operationKey !== 'string' ||
    input.operationKey.length === 0 ||
    input.operationKey.trim() !== input.operationKey ||
    /[\u0000-\u001f\u007f]/.test(input.operationKey)
  )
    fail('operationKey must be a nonempty printable string');
  const creator = address(input.creator, 'creator');
  const governor = address(input.governor, 'governor');
  if (
    creator === ethers.ZeroAddress ||
    governor === ethers.ZeroAddress ||
    creator === governor
  )
    fail('creator and governor must be distinct nonzero addresses');
  const preparedAt = timestamp(input.preparedAt, 'preparedAt');
  const expiresAt = timestamp(input.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(preparedAt))
    fail('expiresAt must be later than preparedAt');
  return Object.freeze({
    schema: CONTEXT_SCHEMA,
    campaignId: input.campaignId.toLowerCase(),
    sourceCommit: digest(input.sourceCommit, 20, 'sourceCommit'),
    sourceTree: digest(input.sourceTree, 20, 'sourceTree'),
    compilerInputSha256: digest(
      input.compilerInputSha256,
      32,
      'compilerInputSha256'
    ),
    configHash: hex(input.configHash, 32, 'configHash'),
    planHash: hex(input.planHash, 32, 'planHash'),
    creationScopeHash: hex(input.creationScopeHash, 32, 'creationScopeHash'),
    operationIndex: safeInteger(input.operationIndex, 'operationIndex', 38),
    operationKey: input.operationKey,
    creator,
    governor,
    preparedAt,
    expiresAt,
  });
}

function normalizeTransaction(input) {
  exactKeys(input, TRANSACTION_KEYS, 'transaction');
  if (input.type !== 2) fail('only explicit type-2 transactions are permitted');
  jsonArray(input.accessList, 'accessList');
  if (input.accessList.length !== 0) fail('accessList must be empty');
  if (input.value !== '0') fail('value must be the decimal string zero');
  const maxFeePerGas = decimal(input.maxFeePerGas, 'maxFeePerGas', true);
  const maxPriorityFeePerGas = decimal(
    input.maxPriorityFeePerGas,
    'maxPriorityFeePerGas',
    true
  );
  if (BigInt(maxPriorityFeePerGas) > BigInt(maxFeePerGas))
    fail('maxPriorityFeePerGas must not exceed maxFeePerGas');
  return Object.freeze({
    type: 2,
    chainId: decimal(input.chainId, 'chainId', true),
    nonce: safeInteger(input.nonce, 'nonce'),
    to: input.to === null ? null : address(input.to, 'to'),
    value: '0',
    data: hex(input.data, undefined, 'data'),
    gasLimit: decimal(input.gasLimit, 'gasLimit', true),
    maxFeePerGas,
    maxPriorityFeePerGas,
    accessList: Object.freeze([]),
  });
}

// Pure construction only: no nonce, gas estimation, fee, provider or clock lookup.
// A policy hash binds data; it does not prove independent owner review. The session
// must validate the current source, operation allowlist, context and time bounds.
function buildEnvelope(input) {
  exactKeys(input, ['transaction', 'context'], 'build input');
  const context = normalizeContext(input.context);
  const transaction = normalizeTransaction(input.transaction);
  let unsignedHex;
  let unsignedHash;
  try {
    const parsed = ethers.Transaction.from(transaction);
    unsignedHex = parsed.unsignedSerialized;
    unsignedHash = parsed.unsignedHash;
  } catch {
    fail('transaction cannot be serialized as type 2');
  }
  const policy = {
    schema: ENVELOPE_SCHEMA,
    context,
    transaction,
    unsignedHex,
    unsignedHash,
  };
  return Object.freeze({
    ...policy,
    policyHash: ethers.keccak256(ethers.toUtf8Bytes(canonicalJson(policy))),
  });
}

function validateEnvelope(envelope) {
  exactKeys(envelope, ENVELOPE_KEYS, 'envelope');
  if (envelope.schema !== ENVELOPE_SCHEMA) fail('unknown envelope schema');
  const expected = buildEnvelope({
    context: envelope.context,
    transaction: envelope.transaction,
  });
  if (canonicalJson(envelope) !== canonicalJson(expected))
    fail('envelope, unsigned transaction or policy hash does not match');
  return expected;
}

function rpcDecimal(value, label) {
  if (typeof value === 'bigint') {
    if (value < 0n || value > MAX_UINT256)
      fail(`${label} is outside uint256 range`);
    return value.toString();
  }
  if (typeof value === 'number') {
    safeInteger(value, label);
    return String(value);
  }
  return decimal(value, label);
}

// Accept ethers Transaction / TransactionResponse quantities, not a loosely
// populated transaction request. Normal RPC metadata (hash/block/signature) is
// allowed; every payload field and the actual sender must be present and exact.
function requireTransactionEnvelope(envelope, transaction) {
  const expected = validateEnvelope(envelope);
  if (!transaction || typeof transaction !== 'object')
    fail('observed transaction is missing');
  if (transaction.type !== 2) fail('observed transaction type differs');
  for (const field of [
    'authorizationList',
    'authorizations',
    'blobs',
    'blobVersionedHashes',
    'maxFeePerBlobGas',
  ]) {
    if (transaction[field] !== undefined && transaction[field] !== null)
      fail(
        'observed transaction includes forbidden authorization or blob fields'
      );
  }
  const observed = normalizeTransaction({
    type: transaction.type,
    chainId: rpcDecimal(transaction.chainId, 'observed chainId'),
    nonce: transaction.nonce,
    to: transaction.to,
    value: rpcDecimal(transaction.value, 'observed value'),
    data: transaction.data,
    gasLimit: rpcDecimal(transaction.gasLimit, 'observed gasLimit'),
    maxFeePerGas: rpcDecimal(transaction.maxFeePerGas, 'observed maxFeePerGas'),
    maxPriorityFeePerGas: rpcDecimal(
      transaction.maxPriorityFeePerGas,
      'observed maxPriorityFeePerGas'
    ),
    accessList: transaction.accessList,
  });
  if (canonicalJson(observed) !== canonicalJson(expected.transaction))
    fail('observed transaction does not match the exact prepared payload');
  if (address(transaction.from, 'observed from') !== expected.context.creator)
    fail('observed sender differs from the prepared creator');
  return true;
}

function importSignedEnvelope(envelope, raw) {
  const expected = validateEnvelope(envelope);
  if (typeof raw !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(raw))
    fail('signed transaction must be canonical lowercase byte hex');
  let parsed;
  let serialized;
  let from;
  let hash;
  try {
    parsed = ethers.Transaction.from(raw);
    if (!parsed.isSigned()) fail('signed transaction has no signature');
    serialized = parsed.serialized;
    from = parsed.from;
    hash = parsed.hash;
  } catch {
    fail('signed transaction encoding or signature is invalid');
  }
  if (serialized !== raw) fail('signed transaction encoding is not canonical');
  requireTransactionEnvelope(expected, parsed);
  if (parsed.unsignedHash !== expected.unsignedHash)
    fail('signed transaction unsigned hash differs');
  if (!from || !hash) fail('signed transaction signature is invalid');
  // The caller must persist these private capability bytes without logging them.
  return Object.freeze({ hash, raw: serialized, from });
}

module.exports = {
  canonicalJson,
  sha256Json,
  buildEnvelope,
  importSignedEnvelope,
  requireTransactionEnvelope,
};
