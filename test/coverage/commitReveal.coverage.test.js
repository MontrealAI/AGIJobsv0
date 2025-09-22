const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('CommitRevealMock (coverage)', function () {
  it('increments nonces on successful reveal', async function () {
    const factory = await ethers.getContractFactory('CommitRevealMock');
    const contract = await factory.deploy();
    const [caller] = await ethers.getSigners();

    const jobId = 42n;
    const approve = true;
    const salt = ethers.encodeBytes32String('salt');
    const specHash = ethers.encodeBytes32String('spec');
    const nonce = await contract.nonces(jobId);

    const commitHash = ethers.keccak256(
      ethers.solidityPacked(
        ['uint256', 'uint256', 'bool', 'bytes32', 'bytes32'],
        [jobId, nonce, approve, salt, specHash]
      )
    );

    await contract.commit(jobId, commitHash);
    await expect(contract.reveal(jobId, approve, salt, specHash)).to.not.be
      .reverted;
    const updatedNonce = await contract.nonces(jobId);
    expect(updatedNonce).to.equal(nonce + 1n);
    const wasRevealed = await contract.revealed(jobId, caller.address);
    expect(wasRevealed).to.equal(true);
  });

  it('reverts when the reveal hash does not match the commit', async function () {
    const factory = await ethers.getContractFactory('CommitRevealMock');
    const contract = await factory.deploy();

    const jobId = 7n;
    const salt = ethers.encodeBytes32String('salt');
    const specHash = ethers.encodeBytes32String('spec');

    await expect(
      contract.reveal(jobId, true, salt, specHash)
    ).to.be.revertedWith('hash mismatch');
  });
});
