const { ethers } = require('ethers');

function generateCommit(jobId, nonce, approve, salt, specHash = ethers.ZeroHash) {
  const actualSalt = salt ?? ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
    [jobId, nonce, approve, actualSalt, specHash]
  );
  return { commitHash, salt: actualSalt };
}

function scheduleReveal(contract, jobId, approve, salt, delayMs, specHash = ethers.ZeroHash) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const tx = contract.revealValidation
          ? await contract.revealValidation(jobId, approve, salt)
          : await contract.reveal(jobId, approve, salt, specHash);
        await tx.wait();
        resolve(tx);
      } catch (err) {
        reject(err);
      }
    }, delayMs);
  });
}

module.exports = { generateCommit, scheduleReveal };
