const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');
const { readArtifact } = require('../utils/artifacts');

describe('multi-operator job lifecycle', function () {
  let token,
    stakeManager,
    rep,
    validation,
    nft,
    registry,
    dispute,
    feePool,
    policy;
  let platformRegistry, jobRouter;
  let owner, employer, agent, platform1, platform2;
  const reward = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  const stakeRequired = ethers.parseUnits('200', AGIALPHA_DECIMALS);
  const platformStake1 = ethers.parseUnits('100', AGIALPHA_DECIMALS);
  const platformStake2 = ethers.parseUnits('300', AGIALPHA_DECIMALS);
  const feePct = 10;

  beforeEach(async () => {
    [owner, employer, agent, platform1, platform2] = await ethers.getSigners();

    const artifact = await readArtifact(
      'contracts/test/MockERC20.sol:MockERC20'
    );
    await network.provider.send('hardhat_setCode', [
      AGIALPHA,
      artifact.deployedBytecode,
    ]);

    token = await ethers.getContractAt(
      'contracts/test/AGIALPHAToken.sol:AGIALPHAToken',
      AGIALPHA
    );
    const mintAmount = ethers.parseUnits('10000', AGIALPHA_DECIMALS);
    await token.mint(owner.address, mintAmount);
    await token.mint(employer.address, mintAmount);
    await token.mint(agent.address, mintAmount);
    await token.mint(platform1.address, mintAmount);
    await token.mint(platform2.address, mintAmount);

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    stakeManager = await Stake.deploy(
      0,
      10_000,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );

    await stakeManager.connect(owner).setMinStake(1);

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    validation = await Validation.deploy();

    const Rep = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    rep = await Rep.deploy(await stakeManager.getAddress());

    const NFT = await ethers.getContractFactory(
      'contracts/v2/modules/CertificateNFT.sol:CertificateNFT'
    );
    nft = await NFT.deploy('Cert', 'CERT');

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
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

    const Dispute = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      ethers.ZeroAddress,
      owner.address
    );

    const FeePoolF = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePoolF.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await feePool.setBurnPct(0);

    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy('ipfs://policy', 'ack');

    const PlatformRegistryF = await ethers.getContractFactory(
      'contracts/v2/PlatformRegistry.sol:PlatformRegistry'
    );
    platformRegistry = await PlatformRegistryF.deploy(
      await stakeManager.getAddress(),
      await rep.getAddress(),
      0
    );

    const JobRouterF = await ethers.getContractFactory(
      'contracts/v2/modules/JobRouter.sol:JobRouter'
    );
    jobRouter = await JobRouterF.deploy(await platformRegistry.getAddress());

    await registry.setModules(
      await validation.getAddress(),
      await stakeManager.getAddress(),
      await rep.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await feePool.getAddress(),
      []
    );
    await validation.setJobRegistry(await registry.getAddress());
    await registry.setFeePct(feePct);
    await registry.setValidatorRewardPct(0);
    await registry.setTaxPolicy(await policy.getAddress());
    await registry.setJobParameters(0, stakeRequired);
    await registry.setMaxJobReward(reward);
    await registry.setJobDurationLimit(86400);
    await stakeManager.setJobRegistry(await registry.getAddress());
    await stakeManager.setValidationModule(await validation.getAddress());
    await stakeManager.setDisputeModule(await dispute.getAddress());
    await nft.setJobRegistry(await registry.getAddress());
    await rep.setAuthorizedCaller(await registry.getAddress(), true);
    await rep.setThreshold(0);
    await nft.transferOwnership(await registry.getAddress());

    await policy.acknowledge();
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();
    await policy.connect(platform1).acknowledge();
    await policy.connect(platform2).acknowledge();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    const identity = await Identity.deploy();
    await registry.setIdentityRegistry(await identity.getAddress());
  });

  it('runs job lifecycle and handles multiple staked operators', async () => {
    const fee = (reward * BigInt(feePct)) / 100n;

    await token
      .connect(platform1)
      .approve(await stakeManager.getAddress(), platformStake1);
    await stakeManager.connect(platform1).depositStake(2, platformStake1);
    await platformRegistry.connect(platform1).register();
    await jobRouter.connect(platform1).register();

    await token
      .connect(platform2)
      .approve(await stakeManager.getAddress(), platformStake2);
    await stakeManager.connect(platform2).depositStake(2, platformStake2);
    await platformRegistry.connect(platform2).register();
    await jobRouter.connect(platform2).register();

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);

    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    await validation.connect(owner).setResult(true);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('result'), 'result', 'agent', []);
    await validation.finalize(jobId);
    const burnTxHash = ethers.ZeroHash;
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTxHash, fee, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTxHash);
    await registry.connect(employer).finalize(jobId);

    await feePool.connect(owner).distributeFees();
    expect(await feePool.pendingFees()).to.equal(0);
    const before1 = await token.balanceOf(platform1.address);
    const before2 = await token.balanceOf(platform2.address);
    await feePool.connect(platform1).claimRewards();
    await feePool.connect(platform2).claimRewards();
    const after1 = await token.balanceOf(platform1.address);
    const after2 = await token.balanceOf(platform2.address);
    const total = platformStake1 + platformStake2;
    expect(after1 - before1).to.equal((fee * platformStake1) / total);
    expect(after2 - before2).to.equal((fee * platformStake2) / total);

    await jobRouter.connect(platform1).deregister();
    expect(await jobRouter.registered(platform1.address)).to.equal(false);

    const cumulative = await feePool.cumulativePerToken();
    await expect(feePool.distributeFees()).to.not.be.reverted;
    expect(await feePool.cumulativePerToken()).to.equal(cumulative);
  });
});
