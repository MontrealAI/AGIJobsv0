const { expect } = require('chai');
const { ethers } = require('hardhat');
const { generateCommit, scheduleReveal } = require('../../apps/validator-ui/lib/commit');

describe('validator-ui commit/reveal', function () {
  it('commits and reveals a vote', async function () {
    const [v] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('CommitRevealMock');
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const jobId = 1n;
    const nonce = await contract.nonces(jobId);
    const { commitHash, salt } = generateCommit(jobId, nonce, true);
    await (await contract.connect(v).commit(jobId, commitHash)).wait();
    await scheduleReveal(contract.connect(v), jobId, true, salt, 0);
    const revealed = await contract.revealed(jobId, v.address);
    expect(revealed).to.equal(true);
  });
});
