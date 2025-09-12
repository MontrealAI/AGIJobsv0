const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('StakeManager AGIType bonuses', function () {
  let owner, employer, agent, val1, val2, val3, registrySigner;
  let token, stakeManager, jobRegistry;
  let nft1, nft2, malicious;

  beforeEach(async () => {
    [owner, employer, agent, val1, val2, val3] = await ethers.getSigners();

    const { AGIALPHA } = require('../../scripts/constants');
    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );

    const StakeManager = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await StakeManager.deploy(
      0,
      100,
      0,
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

    const registryAddr = await jobRegistry.getAddress();
    await ethers.provider.send('hardhat_setBalance', [
      registryAddr,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddr);

    const NFT = await ethers.getContractFactory(
      'contracts/legacy/MockERC721.sol:MockERC721'
    );
    nft1 = await NFT.deploy();
    nft2 = await NFT.deploy();

    const Mal = await ethers.getContractFactory(
      'contracts/legacy/MaliciousERC721.sol:MaliciousERC721'
    );
    malicious = await Mal.deploy();

    await token.mint(employer.address, 1000);
  });

  it('applies highest AGIType bonus', async () => {
    await stakeManager.connect(owner).addAGIType(await nft1.getAddress(), 150);
    await stakeManager.connect(owner).addAGIType(await nft2.getAddress(), 175);
    await nft1.mint(agent.address);
    await nft2.mint(agent.address);

    const jobId = ethers.encodeBytes32String('job1');
    await token.connect(employer).approve(await stakeManager.getAddress(), 175);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 175);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, employer.address, agent.address, 100)
    )
      .to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, agent.address, 175);

    expect(await stakeManager.getTotalPayoutPct(agent.address)).to.equal(175n);
    expect(await token.balanceOf(agent.address)).to.equal(175n);
    expect(await stakeManager.jobEscrows(jobId)).to.equal(0n);
  });

  it('ignores NFTs with failing balanceOf', async () => {
    await stakeManager
      .connect(owner)
      .addAGIType(await malicious.getAddress(), 150);

    const jobId = ethers.encodeBytes32String('job2');
    await token.connect(employer).approve(await stakeManager.getAddress(), 100);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 100);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, employer.address, agent.address, 100)
    )
      .to.emit(stakeManager, 'RewardPaid')
      .withArgs(jobId, agent.address, 100);
  });

  it('ignores duplicate NFTs', async () => {
    await stakeManager.connect(owner).addAGIType(await nft1.getAddress(), 150);
    await stakeManager.connect(owner).addAGIType(await nft2.getAddress(), 175);
    await nft1.mint(agent.address);
    await nft1.mint(agent.address);
    await nft2.mint(agent.address);

    expect(await stakeManager.getTotalPayoutPct(agent.address)).to.equal(175n);
  });

  it('caps total payout percentage', async () => {
    await stakeManager.connect(owner).addAGIType(await nft1.getAddress(), 180);
    await nft1.mint(agent.address);
    await stakeManager.connect(owner).setMaxTotalPayoutPct(150);

    expect(await stakeManager.getTotalPayoutPct(agent.address)).to.equal(150n);
  });

  it('reverts when bonus payout exceeds escrow and no fees or burns are set', async () => {
    await stakeManager.connect(owner).addAGIType(await nft1.getAddress(), 150);
    await nft1.mint(agent.address);

    const jobId = ethers.encodeBytes32String('job3');
    await token.connect(employer).approve(await stakeManager.getAddress(), 100);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 100);

    await expect(
      stakeManager
        .connect(registrySigner)
        .releaseReward(jobId, employer.address, agent.address, 100)
    ).to.be.revertedWithCustomError(stakeManager, 'InsufficientEscrow');
  });

  it('reverts when AGI type payout exceeds the cap', async () => {
    const max = await stakeManager.MAX_PAYOUT_PCT();
    await expect(
      stakeManager.connect(owner).addAGIType(await nft1.getAddress(), max + 1n)
    ).to.be.revertedWithCustomError(stakeManager, 'InvalidPercentage');
  });

  it('weights validator rewards by NFT boost', async () => {
    await stakeManager.connect(owner).addAGIType(await nft1.getAddress(), 150);
    await nft1.mint(val1.address);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const validation = await Validation.deploy();
    await validation.setValidators([val1.address, val2.address, val3.address]);
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());

    const jobId = ethers.encodeBytes32String('valJob');
    await token.connect(employer).approve(await stakeManager.getAddress(), 350);
    await stakeManager
      .connect(registrySigner)
      .lockReward(jobId, employer.address, 350);

    await stakeManager
      .connect(registrySigner)
      .distributeValidatorRewards(jobId, 350);

    expect(await token.balanceOf(val1.address)).to.equal(150n);
    expect(await token.balanceOf(val2.address)).to.equal(100n);
    expect(await token.balanceOf(val3.address)).to.equal(100n);
  });

  it('reverts when setting max below current AGI types', async () => {
    await stakeManager.connect(owner).addAGIType(await nft1.getAddress(), 150);
    await expect(
      stakeManager.connect(owner).setMaxAGITypes(0)
    ).to.be.revertedWithCustomError(stakeManager, 'MaxAGITypesBelowCurrent');
  });
});
