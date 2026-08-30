require('ts-node').register({
  project: require('path').resolve(
    __dirname,
    '../../apps/validator-ui/tsconfig.json'
  ),
  compilerOptions: { module: 'commonjs', target: 'es2020' },
});
const { expect } = require('chai');
const { ethers } = require('hardhat');
const {
  generateCommit,
  scheduleReveal,
} = require('../../apps/validator-ui/lib/commit.ts');

describe('validator-ui commit/reveal', function () {
  it('commits and reveals a vote', async function () {
    const [v] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('CommitRevealMock');
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const jobId = 1n;
    const nonce = await contract.nonces(jobId);
    const specHash = ethers.id('spec');
    const { commitHash, salt } = generateCommit(
      jobId,
      nonce,
      true,
      undefined,
      specHash
    );
    await (await contract.connect(v).commit(jobId, commitHash)).wait();
    await scheduleReveal(contract.connect(v), jobId, true, salt, 0, specHash);
    const revealed = await contract.revealed(jobId, v.address);
    expect(revealed).to.equal(true);
  });
});
