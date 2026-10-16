'use strict';

// This is a deliberately small transaction boundary, not a generic signing API.
// The trusted caller retains the source/journal checks and supplies an ordinary
// in-process ethers Wallet. Neither that Wallet nor its key is a public property.
const {
  AbstractSigner,
  Transaction,
  getAddress,
  getBigInt,
} = require('ethers');
const { inspect } = require('node:util');

const UINT256_MAX = (1n << 256n) - 1n;
const MAX_TRANSACTIONS = 39;
const POLICY_FIELDS = new Set([
  'creator',
  'chainId',
  'firstNonce',
  'gasLimit',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'maxTotalCost',
  'maxTransactions',
]);
const REQUEST_FIELDS = new Set([
  'to',
  'from',
  'data',
  'value',
  'nonce',
  'chainId',
  'type',
  'gasLimit',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'accessList',
]);
const safeErrors = new WeakSet();

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  safeErrors.add(error);
  return error;
}

function rejectPolicy() {
  throw failure('ERR_TTY_FEE_POLICY', 'Invalid explicit public fee policy.');
}

function rejectRequest() {
  throw failure(
    'ERR_TTY_FEE_REQUEST',
    'Transaction request is outside the bounded policy.'
  );
}

// Snapshot only plain, data-only objects. No getters, thenables, custom objects,
// symbol keys, or silently ignored future transaction fields cross this boundary.
function snapshot(value, allowed, reject) {
  if (
    value === null ||
    typeof value !== 'object' ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    reject();
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) reject();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) reject();
    result[key] = descriptor.value;
  }
  return result;
}

function decimal(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value))
    rejectPolicy();
  const number = BigInt(value);
  if (number > UINT256_MAX) rejectPolicy();
  return number;
}

function unsigned(value) {
  if (!['string', 'number', 'bigint'].includes(typeof value)) rejectRequest();
  let number;
  try {
    number = getBigInt(value);
  } catch {
    rejectRequest();
  }
  if (number < 0n || number > UINT256_MAX) rejectRequest();
  return number;
}

function address(value, reject) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) reject();
  try {
    return getAddress(value);
  } catch {
    reject();
  }
}

/** Validate the complete public policy before reading any secret input. */
function validateFeePolicy(input) {
  try {
    const p = snapshot(input, POLICY_FIELDS, rejectPolicy);
    if (Object.keys(p).length !== POLICY_FIELDS.size) rejectPolicy();
    const creator = address(p.creator, rejectPolicy);
    if (!Number.isSafeInteger(p.chainId) || p.chainId <= 0) rejectPolicy();
    if (
      !Number.isSafeInteger(p.maxTransactions) ||
      p.maxTransactions < 1 ||
      p.maxTransactions > MAX_TRANSACTIONS
    )
      rejectPolicy();
    if (
      !Number.isSafeInteger(p.firstNonce) ||
      p.firstNonce < 0 ||
      p.firstNonce > Number.MAX_SAFE_INTEGER - p.maxTransactions
    )
      rejectPolicy();
    const gas = decimal(p.gasLimit);
    const fee = decimal(p.maxFeePerGas);
    const priority = decimal(p.maxPriorityFeePerGas);
    const total = decimal(p.maxTotalCost);
    if (
      gas === 0n ||
      fee === 0n ||
      total === 0n ||
      priority > fee ||
      gas * fee * BigInt(p.maxTransactions) > total
    )
      rejectPolicy();
    return Object.freeze({
      creator,
      chainId: p.chainId,
      firstNonce: p.firstNonce,
      gasLimit: p.gasLimit,
      maxFeePerGas: p.maxFeePerGas,
      maxPriorityFeePerGas: p.maxPriorityFeePerGas,
      maxTotalCost: p.maxTotalCost,
      maxTransactions: p.maxTransactions,
    });
  } catch (error) {
    if (safeErrors.has(error)) throw error;
    rejectPolicy();
  }
}

/**
 * sourceGuard must be synchronous and throw (or return false) on source drift.
 * Every failed send attempt permanently halts this instance. Once submission
 * starts its worst-case budget is never refunded, even if the response is lost.
 * The writer must still journal intent before invoking sendTransaction and wait
 * for each receipt before submitting another transaction.
 */
function createFeeBoundedSigner({
  wallet,
  policy: inputPolicy,
  sourceGuard,
} = {}) {
  const policy = validateFeePolicy(inputPolicy);
  if (
    !wallet ||
    !wallet.provider ||
    typeof wallet.getAddress !== 'function' ||
    typeof wallet.signTransaction !== 'function' ||
    typeof sourceGuard !== 'function'
  ) {
    throw failure(
      'ERR_TTY_FEE_SETUP',
      'A connected wallet and synchronous source guard are required.'
    );
  }
  const provider = wallet.provider;
  if (
    typeof provider.getNetwork !== 'function' ||
    typeof provider.getTransactionCount !== 'function' ||
    typeof provider.estimateGas !== 'function' ||
    typeof provider.broadcastTransaction !== 'function'
  ) {
    throw failure(
      'ERR_TTY_FEE_SETUP',
      'Required provider methods are unavailable.'
    );
  }
  const gasLimit = BigInt(policy.gasLimit);
  const maxFeePerGas = BigInt(policy.maxFeePerGas);
  const maxPriorityFeePerGas = BigInt(policy.maxPriorityFeePerGas);
  const maxTotalCost = BigInt(policy.maxTotalCost);
  const transactionCost = gasLimit * maxFeePerGas;
  const chainId = BigInt(policy.chainId);
  let halted = false;
  let busy = false;
  let reservedTransactions = 0;
  let reservedCost = 0n;

  function halt(code, message) {
    halted = true;
    return failure(code, message);
  }

  function checkActive() {
    if (halted)
      throw failure(
        'ERR_TTY_FEE_HALTED',
        'Signer is halted; reconcile the journal before restarting.'
      );
  }

  function guard() {
    checkActive();
    try {
      const result = sourceGuard();
      if (
        result === false ||
        (result != null && typeof result.then === 'function')
      ) {
        // Consume a rejected async guard without accepting it or leaking errors.
        if (result != null && typeof result.catch === 'function')
          result.catch(() => {});
        throw failure(
          'ERR_TTY_FEE_SOURCE',
          'Source guard must succeed synchronously.'
        );
      }
    } catch {
      throw halt(
        'ERR_TTY_FEE_SOURCE',
        'Source guard failed; signing is halted.'
      );
    }
    checkActive();
  }

  async function checkedRead(read) {
    guard();
    const result = await read();
    guard();
    return result;
  }

  function request(input) {
    const tx = snapshot(input, REQUEST_FIELDS, rejectRequest);
    if (!Object.hasOwn(tx, 'nonce') || !Object.hasOwn(tx, 'data'))
      rejectRequest();
    const nonce = unsigned(tx.nonce);
    if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) rejectRequest();
    if (typeof tx.data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(tx.data))
      rejectRequest();
    const to = tx.to == null ? null : address(tx.to, rejectRequest);
    if (
      Object.hasOwn(tx, 'from') &&
      address(tx.from, rejectRequest) !== policy.creator
    )
      rejectRequest();
    if (Object.hasOwn(tx, 'value') && unsigned(tx.value) !== 0n)
      rejectRequest();
    const exact = {
      type: 2n,
      chainId,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
    for (const key of Object.keys(exact)) {
      if (Object.hasOwn(tx, key) && unsigned(tx[key]) !== exact[key])
        rejectRequest();
    }
    if (
      Object.hasOwn(tx, 'accessList') &&
      (!Array.isArray(tx.accessList) || tx.accessList.length !== 0)
    ) {
      rejectRequest();
    }
    return Object.freeze({
      type: 2,
      chainId,
      nonce: Number(nonce),
      from: policy.creator,
      to,
      data: tx.data,
      value: 0n,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      accessList: Object.freeze([]),
    });
  }

  async function checkChainAndNonce(nonce) {
    const network = await checkedRead(() => provider.getNetwork());
    if (unsigned(network.chainId) !== chainId) {
      throw failure(
        'ERR_TTY_FEE_CHAIN',
        'Provider chain differs from the explicit policy.'
      );
    }
    const latest = unsigned(
      await checkedRead(() =>
        provider.getTransactionCount(policy.creator, 'latest')
      )
    );
    const pending = unsigned(
      await checkedRead(() =>
        provider.getTransactionCount(policy.creator, 'pending')
      )
    );
    if (latest !== pending || latest !== BigInt(nonce)) {
      throw failure(
        'ERR_TTY_FEE_NONCE',
        'Latest, pending, and journaled nonces must match.'
      );
    }
  }

  class FeeBoundedSigner extends AbstractSigner {
    constructor() {
      super(provider);
    }
    async getAddress() {
      return policy.creator;
    }

    getBudgetState() {
      return Object.freeze({
        reservedTransactions,
        reservedCost: reservedCost.toString(),
        halted,
        maxTransactions: policy.maxTransactions,
        maxTotalCost: policy.maxTotalCost,
      });
    }

    toJSON() {
      return {
        kind: 'FeeBoundedSigner',
        policy,
        budget: this.getBudgetState(),
      };
    }
    [inspect.custom]() {
      return this.toJSON();
    }

    connect() {
      throw halt(
        'ERR_TTY_FEE_METHOD',
        'Reconnecting this signer is not supported.'
      );
    }
    async signTransaction() {
      throw halt(
        'ERR_TTY_FEE_METHOD',
        'Direct transaction signing is not supported.'
      );
    }
    async signMessage() {
      throw halt('ERR_TTY_FEE_METHOD', 'Message signing is not supported.');
    }
    async signTypedData() {
      throw halt('ERR_TTY_FEE_METHOD', 'Typed-data signing is not supported.');
    }
    async authorize() {
      throw halt(
        'ERR_TTY_FEE_METHOD',
        'Authorization signing is not supported.'
      );
    }

    async sendTransaction(input) {
      checkActive();
      if (busy)
        throw halt(
          'ERR_TTY_FEE_CONCURRENT',
          'Concurrent transaction submission is not supported.'
        );
      busy = true;
      let submitting = false;
      try {
        guard();
        const tx = request(input);
        if (tx.nonce !== policy.firstNonce + reservedTransactions) {
          throw failure(
            'ERR_TTY_FEE_NONCE',
            'Transaction nonce differs from the reviewed nonce allocation.'
          );
        }
        if (
          reservedTransactions >= policy.maxTransactions ||
          reservedCost + transactionCost > maxTotalCost
        ) {
          throw failure(
            'ERR_TTY_FEE_BUDGET',
            'Explicit transaction count or total fee budget would be exceeded.'
          );
        }
        const actualCreator = await checkedRead(() => wallet.getAddress());
        if (address(actualCreator, rejectRequest) !== policy.creator) {
          throw failure(
            'ERR_TTY_FEE_CREATOR',
            'Wallet creator differs from the explicit policy.'
          );
        }
        await checkChainAndNonce(tx.nonce);
        guard();
        // Omit the proposed gas limit for estimation, so an estimate above the
        // cap can be observed rather than relying on provider out-of-gas text.
        const estimateRequest = { ...tx };
        delete estimateRequest.gasLimit;
        const estimate = unsigned(
          await checkedRead(() => provider.estimateGas(estimateRequest))
        );
        if (estimate === 0n || estimate > gasLimit) {
          throw failure(
            'ERR_TTY_FEE_GAS',
            'Read-only gas estimate exceeds the explicit gas cap.'
          );
        }
        // Recheck after estimation; never replace the nonce recorded by writer.
        await checkChainAndNonce(tx.nonce);
        guard();
        // Keep signing separate from broadcast so a Wallet's internal awaits
        // cannot skip the final source/nonce checks at the effect boundary.
        // Raw signed bytes remain local to this invocation and are never logged,
        // journaled, returned, or attached to an error by this wrapper.
        const expected = { ...tx };
        delete expected.from;
        const expectedUnsignedHash = Transaction.from(expected).unsignedHash;
        const raw = await wallet.signTransaction(tx);
        guard();
        let signed;
        try {
          if (typeof raw !== 'string') throw new Error();
          signed = Transaction.from(raw);
          if (
            !signed.isSigned() ||
            signed.unsignedHash !== expectedUnsignedHash ||
            signed.from !== policy.creator ||
            signed.serialized.toLowerCase() !== raw.toLowerCase()
          ) {
            throw new Error();
          }
        } catch {
          throw failure(
            'ERR_TTY_FEE_SIGNED',
            'Signed transaction differs from the exact reviewed request.'
          );
        }
        await checkChainAndNonce(tx.nonce);
        guard();
        reservedTransactions += 1;
        reservedCost += transactionCost;
        submitting = true;
        const response = await provider.broadcastTransaction(raw);
        guard();
        return response;
      } catch (error) {
        halted = true;
        if (safeErrors.has(error)) throw error;
        // Provider/wallet errors can embed raw transactions and other secrets.
        // Do not expose their message, cause, stack, or arbitrary properties.
        throw failure(
          submitting ? 'ERR_TTY_FEE_SUBMISSION' : 'ERR_TTY_FEE_PREFLIGHT',
          submitting
            ? 'Submission failed or its outcome is uncertain; reconcile the journal before restarting.'
            : 'Transaction preflight failed; signing is halted.'
        );
      } finally {
        busy = false;
      }
    }
  }

  Object.freeze(FeeBoundedSigner.prototype);
  return Object.freeze(new FeeBoundedSigner());
}

module.exports = Object.freeze({
  MAX_TRANSACTIONS,
  validateFeePolicy,
  createFeeBoundedSigner,
});
