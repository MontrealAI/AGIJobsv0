const { ethers } = require('ethers');

function generateCommit(jobId, nonce, approve, salt) {
  const actualSalt = salt ?? ethers.hexlify(ethers.randomBytes(32));
  const commitHash = ethers.solidityPackedKeccak256(
    ['uint256', 'uint256', 'bool', 'bytes32'],
    [jobId, nonce, approve, actualSalt]
  );
  return { commitHash, salt: actualSalt };
}

function scheduleReveal(contract, jobId, approve, salt, delayMs) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const tx = await contract.reveal(jobId, approve, salt);
        await tx.wait();
        resolve(tx);
      } catch (err) {
        reject(err);
      }
    }, delayMs);
  });
}

module.exports = { generateCommit, scheduleReveal };
