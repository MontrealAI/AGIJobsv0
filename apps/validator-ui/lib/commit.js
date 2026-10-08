const { ethers } = require('ethers');
const {
  VALIDATION_PROTOCOL_ABI,
  VALIDATION_REGISTRY_ABI,
  prepareValidationCommitment,
  validationCommitmentHash,
  assertValidationReveal,
} = require('../../../shared/validationProtocol');

const STORAGE_PREFIX = 'agi-jobs.validator.v2:';
const UI_VALIDATION_ABI = [
  ...VALIDATION_PROTOCOL_ABI,
  'function jobRegistry() view returns (address)',
  'function revealVote(uint256 jobId,bool approve,bytes32 burnTxHash,bytes32 salt,string subdomain,bytes32[] proof)',
  'event ValidationRevealed(uint256 indexed jobId,address indexed validator,bool approve,bytes32 burnTxHash,string subdomain)',
];

function recordKey(record) {
  return `${STORAGE_PREFIX}${
    record.chainId
  }:${record.module.toLowerCase()}:${record.validator.toLowerCase()}:${
    record.jobId
  }`;
}

function decodeRecord(raw) {
  if (typeof raw !== 'string' || raw.length > 16384)
    throw new Error('Invalid recovery record. Preserve your original backup.');
  const record = JSON.parse(raw);
  const decimal = /^(0|[1-9][0-9]*)$/;
  for (const field of [
    'jobId',
    'chainId',
    'nonce',
    'commitDeadline',
    'revealDeadline',
  ]) {
    if (
      typeof record[field] !== 'string' ||
      !decimal.test(record[field]) ||
      BigInt(record[field]) > ethers.MaxUint256
    )
      throw new Error(`Invalid recovery ${field}.`);
  }
  if (
    BigInt(record.commitDeadline) > 8640000000000n ||
    BigInt(record.revealDeadline) > 8640000000000n ||
    BigInt(record.revealDeadline) <= BigInt(record.commitDeadline)
  )
    throw new Error('Invalid recovery deadlines.');
  for (const field of ['module', 'registry', 'validator'])
    if (!ethers.isAddress(record[field]))
      throw new Error(`Invalid recovery ${field}.`);
  for (const field of [
    'salt',
    'domain',
    'specHash',
    'burnTxHash',
    'commitHash',
    'observedBlockHash',
  ])
    if (!ethers.isHexString(record[field], 32))
      throw new Error(`Invalid recovery ${field}.`);
  if (
    record.version !== 2 ||
    typeof record.approve !== 'boolean' ||
    !Number.isSafeInteger(record.observedBlock) ||
    record.observedBlock < 0 ||
    ![
      'commit-intent',
      'commit-broadcast',
      'committed',
      'reveal-intent',
      'reveal-broadcast',
      'revealed',
    ].includes(record.status)
  )
    throw new Error('Invalid recovery record.');
  if (
    typeof record.subdomain !== 'string' ||
    record.subdomain.length > 255 ||
    !Array.isArray(record.proof) ||
    record.proof.length > 64 ||
    record.proof.some((value) => !ethers.isHexString(value, 32))
  )
    throw new Error('Invalid saved identity proof.');
  for (const field of ['commitTx', 'revealTx'])
    if (record[field] !== undefined && !ethers.isHexString(record[field], 32))
      throw new Error('Invalid saved transaction hash.');
  if (
    validationCommitmentHash(record).toLowerCase() !==
    record.commitHash.toLowerCase()
  )
    throw new Error('Recovery commitment does not match its saved decision.');
  return record;
}

function loadRecords(storage) {
  const records = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key && key.startsWith(STORAGE_PREFIX) && !key.includes(':archive:')) {
      const record = decodeRecord(storage.getItem(key));
      if (recordKey(record) !== key)
        throw new Error('Recovery record scope mismatch.');
      records.push(record);
    }
  }
  return records;
}

function saveRecord(storage, record) {
  const raw = JSON.stringify(record);
  decodeRecord(raw);
  storage.setItem(recordKey(record), raw);
  if (storage.getItem(recordKey(record)) !== raw)
    throw new Error(
      'Browser storage could not preserve the recovery record. No new transaction will be sent.'
    );
}

async function readScope(validation, registry, provider, jobId, validator) {
  const [
    network,
    domain,
    round,
    nonce,
    specHash,
    module,
    registryAddress,
    block,
    registeredRegistry,
  ] = await Promise.all([
    provider.getNetwork(),
    validation.DOMAIN_SEPARATOR(),
    validation.rounds(jobId),
    validation.jobNonce(jobId),
    registry.getSpecHash(jobId),
    validation.getAddress(),
    registry.getAddress(),
    provider.getBlock('latest'),
    validation.jobRegistry(),
  ]);
  if (
    !block ||
    !block.hash ||
    registeredRegistry.toLowerCase() !== registryAddress.toLowerCase()
  )
    throw new Error(
      'The configured registry does not match the validation module.'
    );
  return {
    chainId: network.chainId.toString(),
    module,
    registry: registryAddress,
    validator,
    jobId: BigInt(jobId).toString(),
    domain,
    nonce: nonce.toString(),
    specHash,
    commitDeadline: round.commitDeadline.toString(),
    revealDeadline: round.revealDeadline.toString(),
    observedBlock: block.number,
    observedBlockHash: block.hash,
    timestamp: block.timestamp,
    tallied: round.tallied,
  };
}

async function assertScope(
  record,
  validation,
  registry,
  provider,
  signer,
  requireCurrentRound = true
) {
  const address = await signer.getAddress();
  const scope = await readScope(
    validation,
    registry,
    provider,
    record.jobId,
    address
  );
  for (const field of [
    'chainId',
    'module',
    'registry',
    'validator',
    'jobId',
    'domain',
    ...(requireCurrentRound
      ? ['nonce', 'specHash', 'commitDeadline', 'revealDeadline']
      : []),
  ])
    if (
      String(scope[field]).toLowerCase() !== String(record[field]).toLowerCase()
    )
      throw new Error(
        'The wallet, network, specification or validation round changed. Preserve this record; reconcile it before proceeding.'
      );
  const observed = await provider.getBlock(record.observedBlock);
  if (!observed || observed.hash !== record.observedBlockHash)
    throw new Error(
      'The saved round observation is no longer canonical. Reconciliation is required.'
    );
  return scope;
}

// The caller holds an exclusive Web Lock through persistence and broadcasting.
// The record is written BEFORE asking the wallet to send either transaction.
async function commitVote({
  validation,
  registry,
  provider,
  signer,
  storage,
  jobId,
  approve,
  expectedSpecHash,
  subdomain,
  proof,
}) {
  if (typeof approve !== 'boolean')
    throw new Error('An explicit review decision is required.');
  const validator = await signer.getAddress();
  const scope = await readScope(
    validation,
    registry,
    provider,
    jobId,
    validator
  );
  if (
    scope.tallied ||
    BigInt(scope.timestamp) > BigInt(scope.commitDeadline) ||
    BigInt(scope.commitDeadline) === 0n
  )
    throw new Error('This job is not in an active commit window.');
  if (
    !ethers.isHexString(expectedSpecHash, 32) ||
    scope.specHash.toLowerCase() !== expectedSpecHash.toLowerCase()
  )
    throw new Error(
      'The displayed specification does not match the chain. Refresh and review the authoritative specification.'
    );
  if (
    !(await validation.validators(jobId)).some(
      (address) => address.toLowerCase() === validator.toLowerCase()
    )
  )
    throw new Error(
      'This wallet is not selected for the current validation round.'
    );
  const existing = storage.getItem(recordKey(scope));
  if (existing) {
    const previous = decodeRecord(existing);
    // Never replace a secret, including after a wallet rejection or uncertain send.
    // A completed vote can be archived only after its receipt is canonical.
    if (
      previous.status !== 'revealed' ||
      !previous.revealTx ||
      previous.commitDeadline === scope.commitDeadline
    )
      throw new Error(
        'A saved vote already exists. Use Check status / Reveal; never replace its secret.'
      );
    const receipt = await provider.getTransactionReceipt(previous.revealTx);
    const block = receipt && (await provider.getBlock(receipt.blockNumber));
    if (
      !receipt ||
      receipt.status !== 1 ||
      !block ||
      block.hash !== receipt.blockHash ||
      BigInt(scope.commitDeadline) <= BigInt(previous.commitDeadline)
    )
      throw new Error(
        'The previous round needs canonical receipt reconciliation.'
      );
    const archiveKey = `${recordKey(previous)}:archive:${
      previous.commitDeadline
    }:${previous.commitHash}`;
    storage.setItem(archiveKey, existing);
    if (storage.getItem(archiveKey) !== existing)
      throw new Error('Could not preserve the prior round.');
  }
  const prepared = await prepareValidationCommitment(
    validation,
    registry,
    provider,
    jobId,
    validator,
    approve,
    ethers.hexlify(ethers.randomBytes(32))
  );
  const record = {
    ...prepared,
    ...scope,
    version: 2,
    status: 'commit-intent',
    subdomain,
    proof,
  };
  delete record.timestamp;
  delete record.tallied;
  record.jobId = String(record.jobId);
  record.nonce = String(record.nonce);
  record.chainId = String(record.chainId);
  if (validationCommitmentHash(record) !== prepared.commitHash)
    throw new Error(
      'The validation context changed during preparation. Refresh and review again.'
    );
  await assertScope(record, validation, registry, provider, signer);
  saveRecord(storage, record);
  const tx = await validation
    .connect(signer)
    .commitValidation(jobId, record.commitHash, subdomain, proof);
  record.commitTx = tx.hash;
  record.status = 'commit-broadcast';
  saveRecord(storage, record);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1)
    throw new Error(
      'Commit confirmation is uncertain. Check status; do not resend.'
    );
  record.status = 'committed';
  saveRecord(storage, record);
  return record;
}

async function confirmedRevealTransaction(record, validation, provider) {
  const filter = validation.filters.ValidationRevealed(
    record.jobId,
    record.validator
  );
  let toBlock = await provider.getBlockNumber();
  let pageSize = 2000;
  while (toBlock >= record.observedBlock) {
    const fromBlock = Math.max(record.observedBlock, toBlock - pageSize + 1);
    let events;
    try {
      events = await validation.queryFilter(filter, fromBlock, toBlock);
    } catch (error) {
      if (pageSize === 1) throw error;
      pageSize = Math.max(1, Math.floor(pageSize / 2));
      continue;
    }
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (
        event.removed ||
        !event.args ||
        event.args.approve !== record.approve ||
        event.args.burnTxHash.toLowerCase() !== record.burnTxHash.toLowerCase()
      )
        continue;
      const [receipt, block, transaction] = await Promise.all([
        provider.getTransactionReceipt(event.transactionHash),
        provider.getBlock(event.blockNumber),
        provider.getTransaction(event.transactionHash),
      ]);
      let reveal;
      try {
        reveal =
          transaction &&
          validation.interface.parseTransaction({
            data: transaction.data,
            value: transaction.value,
          });
      } catch {
        continue;
      }
      if (
        !reveal ||
        !['revealValidation', 'revealVote'].includes(reveal.name) ||
        String(reveal.args.jobId) !== record.jobId ||
        reveal.args.approve !== record.approve ||
        reveal.args.burnTxHash.toLowerCase() !==
          record.burnTxHash.toLowerCase() ||
        reveal.args.salt.toLowerCase() !== record.salt.toLowerCase() ||
        transaction.from.toLowerCase() !== record.validator.toLowerCase()
      )
        continue;
      if (
        receipt &&
        receipt.status === 1 &&
        receipt.to?.toLowerCase() === record.module.toLowerCase() &&
        block &&
        block.hash === receipt.blockHash &&
        block.hash === event.blockHash &&
        BigInt(block.timestamp) > BigInt(record.commitDeadline) &&
        BigInt(block.timestamp) <= BigInt(record.revealDeadline)
      )
        return event.transactionHash;
    }
    toBlock = fromBlock - 1;
  }
  throw new Error(
    'The reveal is recorded on chain, but its canonical transaction receipt is unavailable. Preserve the record and retry Check status when the RPC history is available.'
  );
}

async function checkVote({
  record,
  validation,
  registry,
  provider,
  signer,
  storage,
}) {
  decodeRecord(JSON.stringify(record));
  const current = decodeRecord(storage.getItem(recordKey(record)));
  if (current.commitHash !== record.commitHash)
    throw new Error('The saved vote changed. Reload recovery state.');
  Object.assign(record, current);
  const scope = await assertScope(
    record,
    validation,
    registry,
    provider,
    signer,
    false
  );
  const sameRound = [
    'nonce',
    'specHash',
    'commitDeadline',
    'revealDeadline',
  ].every(
    (field) =>
      String(scope[field]).toLowerCase() === String(record[field]).toLowerCase()
  );
  if (!sameRound) {
    try {
      record.revealTx = await confirmedRevealTransaction(
        record,
        validation,
        provider
      );
    } catch {
      throw new Error(
        'The validation round changed and the prior reveal could not be reconciled. Preserve the saved vote and check the canonical transaction history.'
      );
    }
    record.status = 'revealed';
    saveRecord(storage, record);
    return {
      record,
      ready: false,
      message:
        'The saved vote was revealed in its original round. A new round now requires a fresh explicit review decision.',
    };
  }
  await assertValidationReveal(
    validation,
    registry,
    provider,
    record.jobId,
    record.validator,
    record.approve,
    record.salt,
    record.burnTxHash
  );
  if (await validation.revealed(record.jobId, record.validator)) {
    record.revealTx = await confirmedRevealTransaction(
      record,
      validation,
      provider
    );
    record.status = 'revealed';
    saveRecord(storage, record);
    return { record, ready: false, message: 'The vote is revealed on chain.' };
  }
  if (scope.tallied || BigInt(scope.timestamp) > BigInt(scope.revealDeadline))
    return {
      record,
      ready: false,
      message:
        'The reveal window has closed. Preserve the record for reconciliation.',
    };
  if (record.status.startsWith('reveal-') || record.status === 'revealed')
    return {
      record,
      ready: false,
      message:
        'A reveal was already attempted. Check its wallet transaction; this interface will not resend an uncertain transaction.',
    };
  record.status = 'committed';
  saveRecord(storage, record);
  const ready = BigInt(scope.timestamp) > BigInt(scope.commitDeadline);
  return {
    record,
    ready,
    message: ready
      ? 'Commitment verified. Ready for your wallet to reveal.'
      : `Committed. Reveal after ${new Date(
          Number(scope.commitDeadline) * 1000
        ).toISOString()} (chain time).`,
  };
}

async function revealVote(context) {
  const { record, validation, signer, storage } = context;
  const checked = await checkVote(context);
  if (!checked.ready) throw new Error(checked.message);
  record.status = 'reveal-intent';
  saveRecord(storage, record);
  const tx = await validation
    .connect(signer)
    .revealValidation(
      record.jobId,
      record.approve,
      record.burnTxHash,
      record.salt,
      record.subdomain,
      record.proof
    );
  record.revealTx = tx.hash;
  record.status = 'reveal-broadcast';
  saveRecord(storage, record);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1)
    throw new Error(
      'Reveal confirmation is uncertain. Check status; do not resend.'
    );
  record.status = 'revealed';
  saveRecord(storage, record);
  return record;
}

module.exports = {
  UI_VALIDATION_ABI,
  VALIDATION_REGISTRY_ABI,
  STORAGE_PREFIX,
  recordKey,
  decodeRecord,
  loadRecords,
  saveRecord,
  commitVote,
  checkVote,
  revealVote,
};
