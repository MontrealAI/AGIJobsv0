const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');

const REVEAL_WINDOW = 256n;

function commitHashFor(seed) {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [seed])
  );
}

describe('RoutingModule commit-reveal flow', function () {
  let owner, operator, employer;
  let stakeManager;
  let routing;

  beforeEach(async () => {
    [owner, operator, employer] = await ethers.getSigners();
    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await StakeMock.deploy();

    const Routing = await ethers.getContractFactory(
      'contracts/v2/modules/RoutingModule.sol:RoutingModule'
    );
    routing = await Routing.deploy(
      await stakeManager.getAddress(),
      ethers.ZeroAddress
    );

    await stakeManager.setStake(operator.address, 2, 1);
    await routing.connect(operator).register();
  });

  it('selectOperator succeeds with a timely reveal', async () => {
    const jobId = ethers.encodeBytes32String('job-timely');
    const seed = ethers.encodeBytes32String('seed-timely');
    const commitHash = commitHashFor(seed);

    await routing.commit(jobId, commitHash);
    await network.provider.send('hardhat_mine', ['0x2']);

    const preview = await routing.selectOperator.staticCall(jobId, seed);
    expect(preview).to.equal(operator.address);

    await expect(routing.selectOperator(jobId, seed))
      .to.emit(routing, 'OperatorSelected')
      .withArgs(jobId, operator.address)
      .and.to.emit(routing, 'CommitCleared')
      .withArgs(jobId, commitHash, owner.address);

    expect(await routing.commits(jobId)).to.equal(ethers.ZeroHash);
    expect(await routing.commitBlock(jobId)).to.equal(0);
  });

  it('stale reveals emit an event and clear stored commits', async () => {
    const jobId = ethers.encodeBytes32String('job-stale');
    const seed = ethers.encodeBytes32String('seed-stale');
    const commitHash = commitHashFor(seed);

    await routing.commit(jobId, commitHash);
    await network.provider.send('hardhat_mine', [
      ethers.toBeHex(REVEAL_WINDOW + 5n),
    ]);

    const preview = await routing.selectOperator.staticCall(jobId, seed);
    expect(preview).to.equal(ethers.ZeroAddress);

    await expect(routing.selectOperator(jobId, seed))
      .to.emit(routing, 'StaleReveal')
      .withArgs(jobId, commitHash)
      .and.to.emit(routing, 'CommitCleared')
      .withArgs(jobId, commitHash, owner.address);

    expect(await routing.commits(jobId)).to.equal(ethers.ZeroHash);
    expect(await routing.commitBlock(jobId)).to.equal(0);
  });

  it('allows repeated commits and lets JobEscrow recover after a stale reveal', async () => {
    const jobId = ethers.ZeroHash;
    const seed1 = ethers.encodeBytes32String('seed-one');
    const commitHash1 = commitHashFor(seed1);

    await routing.commit(jobId, commitHash1);
    await network.provider.send('hardhat_mine', [
      ethers.toBeHex(REVEAL_WINDOW + 5n),
    ]);

    const MockToken = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      MockToken.deployedBytecode,
    ]);
    const token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    for (const signer of [owner, operator, employer]) {
      const balance = await token.balanceOf(signer.address);
      if (balance > 0n) {
        await token.connect(signer).burn(balance);
      }
    }

    const reward = ethers.parseUnits('0.0005', AGIALPHA_DECIMALS);
    await token.mint(employer.address, reward);

    const Escrow = await ethers.getContractFactory(
      'contracts/v2/modules/JobEscrow.sol:JobEscrow'
    );
    const escrow = await Escrow.deploy(await routing.getAddress());

    await token
      .connect(employer)
      .approve(await escrow.getAddress(), reward);

    await expect(
      escrow.connect(employer).postJob(reward, 'ipfs://stale', seed1)
    ).to.be.revertedWithCustomError(escrow, 'ZeroOperator');

    const seed2 = ethers.encodeBytes32String('seed-two');
    const commitHash2 = commitHashFor(seed2);

    await expect(routing.commit(jobId, commitHash2))
      .to.emit(routing, 'CommitCleared')
      .withArgs(jobId, commitHash1, owner.address)
      .and.to.emit(routing, 'SelectionCommitted')
      .withArgs(jobId, commitHash2);

    const seed3 = ethers.encodeBytes32String('seed-three');
    const commitHash3 = commitHashFor(seed3);
    await expect(routing.commit(jobId, commitHash3)).to.be.revertedWith(
      'committed'
    );

    await network.provider.send('hardhat_mine', ['0x2']);

    await token
      .connect(employer)
      .approve(await escrow.getAddress(), reward);

    await expect(
      escrow.connect(employer).postJob(reward, 'ipfs://fresh', seed2)
    )
      .to.emit(escrow, 'JobPosted')
      .withArgs(0, employer.address, operator.address, reward, 'ipfs://fresh');

    expect(await routing.commits(jobId)).to.equal(ethers.ZeroHash);
    expect(await routing.commitBlock(jobId)).to.equal(0);
  });
});
