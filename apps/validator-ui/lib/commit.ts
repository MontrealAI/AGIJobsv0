import { ethers, Contract, TransactionResponse } from 'ethers';

export function generateCommit(
  jobId: bigint,
  nonce: bigint,
  approve: boolean,
  salt?: string,
  specHash?: string
): { commitHash: string; salt: string } {
  const actualSalt = salt ?? ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
    [jobId, nonce, approve, actualSalt, specHash ?? ethers.ZeroHash]
  );
  return { commitHash, salt: actualSalt };
}

export function scheduleReveal(
  contract: Contract,
  jobId: bigint,
  approve: boolean,
  salt: string,
  delayMs: number,
  specHash?: string
): Promise<TransactionResponse> {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const tx = contract.revealValidation
          ? await contract.revealValidation(jobId, approve, salt, '', [])
          : await contract.reveal(jobId, approve, salt, specHash);
        await tx.wait();
        resolve(tx);
      } catch (err) {
        reject(err);
      }
    }, delayMs);
  });
}
