const { expect } = require('chai');
const { ethers } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');

describe('StakeManager burn reduction', function () {
  let token, stakeManager, jobRegistry, feePool, registrySigner;
  let owner, employer, agent;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
    const { AGIALPHA } = require('../../scripts/constants');
    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);
    token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    await stakeManager.connect(owner).setMinStake(1);

    const JobRegistry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    jobRegistry = await JobRegistry.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );
    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy('ipfs://policy', 'ack');
    await jobRegistry.connect(owner).setTaxPolicy(await taxPolicy.getAddress());
    await stakeManager
      .connect(owner)
      .setJobRegistry(await jobRegistry.getAddress());
    await taxPolicy.connect(agent).acknowledge();

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    await token.mint(employer.address, ethers.parseEther('1000'));
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), ethers.parseEther('1000'));

    await token.mint(owner.address, ethers.parseEther('100'));
    await token
      .connect(owner)
      .approve(await stakeManager.getAddress(), ethers.parseEther('100'));

    await stakeManager.connect(owner).setFeePool(await feePool.getAddress());
    await stakeManager.connect(owner).setFeePct(20);
    await stakeManager.connect(owner).setBurnPct(10);
  });

  it('caps burn when escrow covers only reward plus fee', async () => {
    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 150);
    await nft.mint(agent.address);

    const jobId = ethers.encodeBytes32String('burnReduce');
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, ethers.parseEther('120'));

    const beforeAgent = await token.balanceOf(agent.address);
    const afterLockEmployer = await token.balanceOf(employer.address);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(
          jobId,
          employer.address,
          agent.address,
          ethers.parseEther('100'),
          true
        )
    )
      .to.emit(stakeManager, 'StakeReleased')
      .withArgs(jobId, await feePool.getAddress(), ethers.parseEther('15'))
      .and.to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, agent.address, ethers.parseEther('105'));

    expect(await token.balanceOf(agent.address)).to.equal(
      beforeAgent + ethers.parseEther('105')
    );
    expect(await token.balanceOf(employer.address)).to.equal(afterLockEmployer);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('reduces burn then fee on finalizeJobFunds', async () => {
    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    const nft = await NFT.deploy();
    await stakeManager.connect(owner).addAGIType(await nft.getAddress(), 130);
    await nft.mint(agent.address);

    const jobId = ethers.encodeBytes32String('finalReduce');
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, ethers.parseEther('110'));

    const beforeAgent = await token.balanceOf(agent.address);
    const afterLockEmployer = await token.balanceOf(employer.address);

    await stakeManager
      .connect(owner)
      .fundOperatorRewardPool(ethers.parseEther('100'));

    await expect(
      stakeManager
        .connect(registrySigner)
        .finalizeJobFunds(
          jobId,
          employer.address,
          agent.address,
          ethers.parseEther('100'),
          0,
          ethers.parseEther('20'),
          await feePool.getAddress(),
          false
        )
    )
      .to.emit(stakeManager, 'StakeReleased')
      .withArgs(jobId, await feePool.getAddress(), ethers.parseEther('10'))
      .and.to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, agent.address, ethers.parseEther('117'));

    expect(await token.balanceOf(agent.address)).to.equal(
      beforeAgent + ethers.parseEther('117')
    );
    expect(await token.balanceOf(employer.address)).to.equal(afterLockEmployer);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('emits burn and pays correct payout when escrow fully funds burn', async () => {
    const jobId = ethers.encodeBytes32String('burned');
    const reward = ethers.parseEther('100');
    const fee = ethers.parseEther('20');
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, reward + fee);

    const expectedBurn = (reward * 10n) / 100n;
    const supplyBefore = await token.totalSupply();
    const agentBefore = await token.balanceOf(agent.address);

    await expect(
      stakeManager
        .connect(registrySigner)
        .finalizeJobFunds(
          jobId,
          employer.address,
          agent.address,
          reward,
          0,
          fee,
          ethers.ZeroAddress,
          false
        )
    )
      .to.emit(stakeManager, 'TokensBurned')
      .withArgs(jobId, expectedBurn)
      .and.to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, agent.address, reward - expectedBurn);

    const supplyAfter = await token.totalSupply();
    expect(supplyBefore - supplyAfter).to.equal(expectedBurn);
    expect(await token.balanceOf(agent.address)).to.equal(
      agentBefore + reward - expectedBurn
    );
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('settles payout, burn, and fee exactly to the escrowed funds', async () => {
    const scenarios = [
      { burnPct: 5, reward: '100', fee: '0', shortfall: '0' },
      { burnPct: 0, reward: '75', fee: '25', shortfall: '0' },
      { burnPct: 20, reward: '80', fee: '40', shortfall: '0' },
      { burnPct: 15, reward: '90', fee: '30', shortfall: '20' },
    ];

    for (const scenario of scenarios) {
      await stakeManager.connect(owner).setBurnPct(scenario.burnPct);

      const reward = ethers.parseEther(scenario.reward);
      const fee = ethers.parseEther(scenario.fee);
      const shortfall = ethers.parseEther(scenario.shortfall);
      const deposit = reward + fee - shortfall;

      const jobId = ethers.encodeBytes32String(
        `acct-${scenario.burnPct}-${scenario.shortfall}`
      );

      await stakeManager
        .connect(registrySigner)
        .lockReward(jobId, employer.address, deposit);

      const beforeEscrow = await stakeManager.jobEscrows(jobId);
      const beforeSupply = await token.totalSupply();
      const beforeAgent = await token.balanceOf(agent.address);
      const beforeEmployer = await token.balanceOf(employer.address);

      await stakeManager
        .connect(registrySigner)
        .finalizeJobFunds(
          jobId,
          employer.address,
          agent.address,
          reward,
          0,
          fee,
          ethers.ZeroAddress,
          false
        );

      const afterEscrow = await stakeManager.jobEscrows(jobId);
      const afterSupply = await token.totalSupply();
      const afterAgent = await token.balanceOf(agent.address);
      const afterEmployer = await token.balanceOf(employer.address);

      const agentDelta = afterAgent - beforeAgent;
      const employerDelta = afterEmployer - beforeEmployer;
      const burnDelta = beforeSupply - afterSupply;
      const totalOut = agentDelta + employerDelta + burnDelta;
      const escrowDelta = beforeEscrow - afterEscrow;

      expect(totalOut).to.equal(escrowDelta);
    }
  });
});
