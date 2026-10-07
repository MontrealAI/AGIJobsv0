import { Contract, Provider, ethers } from 'ethers';

// Keep runtime clients on the deployed v2 voting protocol, including the
// Solidity getter layout (dynamic Round arrays are not returned by rounds()).
export const VALIDATION_PROTOCOL_ABI = [
  'function jobNonce(uint256 jobId) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function commitments(uint256 jobId,address validator,uint256 nonce) view returns (bytes32)',
  'function commitValidation(uint256 jobId,bytes32 commitHash,string subdomain,bytes32[] proof)',
  'function revealValidation(uint256 jobId,bool approve,bytes32 burnTxHash,bytes32 salt,string subdomain,bytes32[] proof)',
  'function rounds(uint256 jobId) view returns (uint256 commitDeadline,uint256 revealDeadline,uint256 approvals,uint256 rejections,uint256 revealedCount,bool tallied,uint256 committeeSize,uint64 earlyFinalizeEligibleAt,bool earlyFinalized)',
];

export const VALIDATION_REGISTRY_ABI = [
  'function getSpecHash(uint256 jobId) view returns (bytes32)',
  'function burnEvidenceStatus(uint256 jobId) view returns (bool burnRequired,bool burnSatisfied)',
  'function hasBurnReceipt(uint256 jobId,bytes32 burnTxHash) view returns (bool)',
  'event BurnConfirmed(uint256 indexed jobId,bytes32 indexed burnTxHash)',
];

export interface ValidationCommitment {
  jobId: bigint;
  nonce: bigint;
  validator: string;
  approve: boolean;
  burnTxHash: string;
  salt: string;
  specHash: string;
  domain: string;
  chainId: bigint;
}

export function validationCommitmentHash(vote: ValidationCommitment): string {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  const outcomeHash = ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bool', 'bytes32'],
      [vote.nonce, vote.specHash, vote.approve, vote.burnTxHash]
    )
  );
  return ethers.keccak256(
    abi.encode(
      ['uint256', 'bytes32', 'bytes32', 'address', 'uint256', 'bytes32'],
      [
        vote.jobId,
        outcomeHash,
        vote.salt,
        vote.validator,
        vote.chainId,
        vote.domain,
      ]
    )
  );
}

export async function prepareValidationCommitment(
  validation: Contract,
  registry: Contract,
  provider: Provider,
  jobId: bigint | string,
  validator: string,
  approve: boolean,
  salt: string
): Promise<ValidationCommitment & { commitHash: string }> {
  const [nonce, specHash, domain, network, burnStatus] = await Promise.all([
    validation.jobNonce(jobId),
    registry.getSpecHash(jobId),
    validation.DOMAIN_SEPARATOR(),
    provider.getNetwork(),
    registry.burnEvidenceStatus(jobId),
  ]);
  if (
    (await validation.commitments(jobId, validator, nonce)) !== ethers.ZeroHash
  ) {
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
  }
  let burnTxHash = ethers.ZeroHash;
  if (burnStatus.burnRequired ?? burnStatus[0]) {
    if (!(burnStatus.burnSatisfied ?? burnStatus[1])) {
      throw new Error('VALIDATION_BURN_EVIDENCE_REQUIRED');
    }
    const events = await registry.queryFilter(
      registry.filters.BurnConfirmed(jobId)
    );
    const latest = events[events.length - 1];
    const candidate = latest && 'args' in latest ? latest.args[1] : undefined;
    if (
      !candidate ||
      candidate === ethers.ZeroHash ||
      !(await registry.hasBurnReceipt(jobId, candidate))
    ) {
      throw new Error('VALIDATION_BURN_RECEIPT_UNAVAILABLE');
    }
    burnTxHash = candidate;
  }
  const vote: ValidationCommitment = {
    jobId: BigInt(jobId),
    nonce: BigInt(nonce),
    validator,
    approve,
    burnTxHash,
    salt,
    specHash,
    domain,
    chainId: network.chainId,
  };
  return { ...vote, commitHash: validationCommitmentHash(vote) };
}

export async function assertValidationReveal(
  validation: Contract,
  registry: Contract,
  provider: Provider,
  jobId: bigint | string,
  validator: string,
  approve: boolean,
  salt: string,
  burnTxHash: string | undefined
): Promise<void> {
  if (!burnTxHash || !ethers.isHexString(burnTxHash, 32)) {
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
  }
  const [nonce, specHash, domain, network] = await Promise.all([
    validation.jobNonce(jobId),
    registry.getSpecHash(jobId),
    validation.DOMAIN_SEPARATOR(),
    provider.getNetwork(),
  ]);
  const expected = validationCommitmentHash({
    jobId: BigInt(jobId),
    nonce: BigInt(nonce),
    validator,
    approve,
    salt,
    burnTxHash,
    specHash,
    domain,
    chainId: network.chainId,
  });
  if (
    (await validation.commitments(jobId, validator, nonce)).toLowerCase() !==
    expected.toLowerCase()
  ) {
    throw new Error('VALIDATION_COMMITMENT_RECONCILIATION_REQUIRED');
  }
}

export function validationRevealDelay(
  round: { commitDeadline: bigint; revealDeadline: bigint },
  nowSeconds: number,
  leadSeconds = 1
): number {
  const commitDeadline = Number(round.commitDeadline);
  const revealDeadline = Number(round.revealDeadline);
  if (
    !Number.isSafeInteger(commitDeadline) ||
    !Number.isSafeInteger(revealDeadline) ||
    revealDeadline <= commitDeadline ||
    nowSeconds >= revealDeadline
  ) {
    throw new Error('VALIDATION_REVEAL_WINDOW_CLOSED');
  }
  const lead = Number.isFinite(leadSeconds)
    ? Math.max(1, Math.ceil(leadSeconds))
    : 1;
  const target = Math.min(
    Math.max(commitDeadline + 1, revealDeadline - 1),
    commitDeadline + lead
  );
  const delay = Math.max(0, target - nowSeconds) * 1000;
  if (!Number.isSafeInteger(delay) || delay > 2_147_483_647) {
    throw new Error('VALIDATION_REVEAL_DELAY_OUT_OF_RANGE');
  }
  return delay;
}
