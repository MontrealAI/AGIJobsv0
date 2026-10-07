import { Contract, Provider, ethers } from 'ethers';
import { StoredCommitRecord, CommitRoundScope } from './validationStore';
import {
  ValidationCommitment,
  validationCommitmentHash,
} from '../shared/validationProtocol';

export interface ValidationRoundContext {
  validation: Contract;
  registry: Contract;
  provider: Provider;
}

export function reconciliationRequired(): never {
  throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
}

export function validateStoredRound(
  record: StoredCommitRecord
): CommitRoundScope {
  const scope = record.roundScope;
  const uint = (value: unknown) =>
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
  if (
    !scope ||
    !uint(scope.chainId) ||
    !uint(scope.nonce) ||
    !uint(scope.commitDeadline) ||
    !ethers.isAddress(scope.validationModule) ||
    !ethers.isHexString(scope.domain, 32) ||
    !ethers.isHexString(scope.specHash, 32) ||
    !ethers.isHexString(scope.blockHash, 32) ||
    !Number.isSafeInteger(scope.blockNumber) ||
    scope.blockNumber < 0 ||
    !record.burnTxHash ||
    !ethers.isHexString(record.burnTxHash, 32)
  )
    reconciliationRequired();
  try {
    const expected = validationCommitmentHash({
      jobId: BigInt(record.jobId),
      validator: record.validator,
      approve: record.approve,
      salt: record.salt,
      burnTxHash: record.burnTxHash!,
      nonce: BigInt(scope.nonce),
      chainId: BigInt(scope.chainId),
      domain: scope.domain,
      specHash: scope.specHash,
    });
    if (expected.toLowerCase() !== record.commitHash.toLowerCase())
      reconciliationRequired();
  } catch {
    reconciliationRequired();
  }
  return scope;
}

export async function readActiveValidationRound(
  context: ValidationRoundContext,
  jobId: string | bigint,
  requireOpenCommitWindow = false
): Promise<CommitRoundScope> {
  const { validation, registry, provider } = context;
  const chain = validation.runner?.provider ?? provider;
  const block = await chain.getBlock('latest');
  if (!block?.hash) reconciliationRequired();
  const options = { blockTag: block.number };
  const [round, nonce, domain, specHash, network] = await Promise.all([
    validation.rounds(jobId, options),
    validation.jobNonce(jobId, options),
    validation.DOMAIN_SEPARATOR(options),
    registry.getSpecHash(jobId, options),
    chain.getNetwork(),
  ]);
  if (round.tallied || BigInt(round.commitDeadline) <= 0n)
    reconciliationRequired();
  if (
    requireOpenCommitWindow &&
    BigInt(block.timestamp) > BigInt(round.commitDeadline)
  )
    throw new Error('VALIDATION_COMMIT_WINDOW_CLOSED');
  return {
    chainId: network.chainId.toString(),
    validationModule: (await validation.getAddress()).toLowerCase(),
    nonce: nonce.toString(),
    commitDeadline: round.commitDeadline.toString(),
    domain,
    specHash,
    blockNumber: block.number,
    blockHash: block.hash,
  };
}

export async function requireValidationCommitteeMember(
  context: ValidationRoundContext,
  jobId: string | bigint,
  validator: string,
  scope: CommitRoundScope
): Promise<void> {
  const committee: string[] = await context.validation.validators(jobId, {
    blockTag: scope.blockNumber,
  });
  if (
    !committee.some(
      (address) => address.toLowerCase() === validator.toLowerCase()
    )
  )
    throw new Error('VALIDATION_VALIDATOR_NOT_SELECTED');
}

// Recheck after identity lookup, reconciliation and audit I/O, immediately
// before saving a new broadcast intent. Inspection and reveal stay available
// after the commit deadline.
export async function requireOpenValidationCommitRound(
  context: ValidationRoundContext,
  jobId: string | bigint,
  expected: CommitRoundScope,
  validator: string
): Promise<CommitRoundScope> {
  const active = await readActiveValidationRound(context, jobId, true);
  if (
    active.chainId !== expected.chainId ||
    active.validationModule !== expected.validationModule ||
    active.nonce !== expected.nonce ||
    active.commitDeadline !== expected.commitDeadline ||
    active.domain !== expected.domain ||
    active.specHash !== expected.specHash
  )
    reconciliationRequired();
  await requireValidationCommitteeMember(context, jobId, validator, active);
  return active;
}

export async function readValidationRound(
  context: ValidationRoundContext,
  vote: ValidationCommitment
): Promise<CommitRoundScope> {
  const scope = await readActiveValidationRound(context, vote.jobId);
  if (
    BigInt(scope.nonce) !== vote.nonce ||
    scope.domain !== vote.domain ||
    scope.specHash !== vote.specHash ||
    BigInt(scope.chainId) !== vote.chainId
  )
    reconciliationRequired();
  return scope;
}

export async function reconcilePreviousRound(
  context: ValidationRoundContext,
  previous: StoredCommitRecord,
  next: CommitRoundScope
): Promise<void> {
  const { validation, provider } = context;
  const old = validateStoredRound(previous);
  if (
    old.chainId !== next.chainId ||
    old.validationModule.toLowerCase() !== next.validationModule ||
    old.domain !== next.domain ||
    BigInt(next.nonce) < BigInt(old.nonce) ||
    BigInt(next.commitDeadline) <= BigInt(old.commitDeadline) ||
    next.blockNumber <= old.blockNumber
  )
    reconciliationRequired();
  const chain = validation!.runner?.provider ?? provider;
  const eventInterface = new ethers.Interface([
    'event ValidationCommitted(uint256 indexed jobId,address indexed validator,bytes32 commitHash,string subdomain)',
  ]);
  const matches = (log: ethers.Log) => {
    if (
      log.removed ||
      log.address.toLowerCase() !== old.validationModule.toLowerCase()
    )
      return false;
    try {
      const event = eventInterface.parseLog(log);
      return (
        event?.args[0].toString() === previous.jobId &&
        event.args[1].toLowerCase() === previous.validator.toLowerCase() &&
        event.args[2].toLowerCase() === previous.commitHash.toLowerCase()
      );
    } catch {
      return false;
    }
  };
  const commitReceipt = async () => {
    if (previous.commitTx)
      return chain.getTransactionReceipt(previous.commitTx);
    const topics = eventInterface.encodeFilterTopics('ValidationCommitted', [
      previous.jobId,
      previous.validator,
    ]);
    let toBlock = next.blockNumber - 1;
    let pageSize = 2000;
    while (toBlock > old.blockNumber) {
      const fromBlock = Math.max(old.blockNumber + 1, toBlock - pageSize + 1);
      let logs;
      try {
        logs = await chain.getLogs({
          address: old.validationModule,
          topics,
          fromBlock,
          toBlock,
        });
      } catch (error) {
        if (pageSize === 1) throw error;
        pageSize = Math.max(1, Math.floor(pageSize / 2));
        continue;
      }
      for (const log of logs) {
        if (matches(log))
          return chain.getTransactionReceipt(log.transactionHash);
      }
      toBlock = fromBlock - 1;
    }
    return null;
  };
  const [anchor, receipt, oldCommitment, currentCommitment] = await Promise.all(
    [
      chain.getBlock(old.blockNumber),
      commitReceipt(),
      validation!.commitments(previous.jobId, previous.validator, old.nonce, {
        blockTag: next.blockNumber,
      }),
      validation!.commitments(previous.jobId, previous.validator, next.nonce, {
        blockTag: next.blockNumber,
      }),
    ]
  );
  if (
    anchor?.hash !== old.blockHash ||
    !receipt ||
    receipt.status !== 1 ||
    receipt.blockNumber <= old.blockNumber ||
    receipt.blockNumber >= next.blockNumber ||
    oldCommitment !== ethers.ZeroHash ||
    currentCommitment !== ethers.ZeroHash
  )
    reconciliationRequired();
  const [receiptBlock, observedBlock] = await Promise.all([
    chain.getBlock(receipt!.blockNumber),
    chain.getBlock(next.blockNumber),
  ]);
  if (
    receiptBlock?.hash !== receipt!.blockHash ||
    observedBlock?.hash !== next.blockHash ||
    !receipt!.logs.some(matches)
  )
    reconciliationRequired();
}

export async function assertStoredValidationRound(
  context: ValidationRoundContext,
  record: StoredCommitRecord
): Promise<CommitRoundScope> {
  const scope = validateStoredRound(record);
  const active = await readValidationRound(context, {
    jobId: BigInt(record.jobId),
    validator: record.validator,
    approve: record.approve,
    salt: record.salt,
    burnTxHash: record.burnTxHash!,
    nonce: BigInt(scope.nonce),
    chainId: BigInt(scope.chainId),
    domain: scope.domain,
    specHash: scope.specHash,
  });
  const chain = context.validation.runner?.provider ?? context.provider;
  const anchor = await chain.getBlock(scope.blockNumber);
  if (
    active.validationModule !== scope.validationModule.toLowerCase() ||
    active.commitDeadline !== scope.commitDeadline ||
    anchor?.hash !== scope.blockHash
  )
    reconciliationRequired();
  return scope;
}

export async function inspectStoredValidationRound(
  context: ValidationRoundContext,
  record: StoredCommitRecord
): Promise<{
  status: 'committed' | 'revealed' | 'fresh-round' | 'uncertain';
  roundScope: CommitRoundScope;
}> {
  const previous = validateStoredRound(record);
  const active = await readActiveValidationRound(context, record.jobId);
  if (
    active.chainId !== previous.chainId ||
    active.validationModule !== previous.validationModule.toLowerCase() ||
    active.domain !== previous.domain
  )
    reconciliationRequired();
  if (
    active.nonce !== previous.nonce ||
    active.commitDeadline !== previous.commitDeadline
  ) {
    await reconcilePreviousRound(context, record, active);
    return { status: 'fresh-round', roundScope: active };
  }
  if (active.specHash !== previous.specHash) reconciliationRequired();
  const chain = context.validation.runner?.provider ?? context.provider;
  const options = { blockTag: active.blockNumber };
  const [anchor, commitment, revealed] = await Promise.all([
    chain.getBlock(previous.blockNumber),
    context.validation.commitments(
      record.jobId,
      record.validator,
      previous.nonce,
      options
    ),
    context.validation.revealed(record.jobId, record.validator, options),
  ]);
  if (anchor?.hash !== previous.blockHash) reconciliationRequired();
  if (commitment === ethers.ZeroHash)
    return { status: 'uncertain', roundScope: active };
  if (commitment.toLowerCase() !== record.commitHash.toLowerCase())
    reconciliationRequired();
  return { status: revealed ? 'revealed' : 'committed', roundScope: active };
}
