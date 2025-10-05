const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');

describe('end-to-end job lifecycle', function () {
  let token,
    stakeManager,
    rep,
    validation,
    nft,
    registry,
    dispute,
    feePool,
    policy;
  let owner, employer, agent, platform;
  const reward = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  const stakeRequired = ethers.parseUnits('200', AGIALPHA_DECIMALS);
  const platformStake = ethers.parseUnits('500', AGIALPHA_DECIMALS);
  const feePct = 10;
  const disputeFee = ethers.parseUnits('1', AGIALPHA_DECIMALS);

  beforeEach(async () => {
    [owner, employer, agent, platform] = await ethers.getSigners();

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
    await token.mint(platform.address, mintAmount);

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
    await dispute.connect(owner).setDisputeFee(disputeFee);

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
    await feePool.setBurnPct(0);

    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy(
      'ipfs://policy',
      'All taxes on participants; contract and owner exempt'
    );

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
    await stakeManager.setFeePct(feePct);
    await stakeManager.setSlashingPercentages(100, 0);
    await nft.setJobRegistry(await registry.getAddress());
    await rep.setAuthorizedCaller(await registry.getAddress(), true);
    await rep.setThreshold(0);
    await nft.transferOwnership(await registry.getAddress());

    await policy.acknowledge();
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();
    await policy.connect(platform).acknowledge();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    const identity = await Identity.deploy();
    await registry.setIdentityRegistry(await identity.getAddress());
  });

  it('distributes fees to staked operators', async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    // platform stakes
    await token
      .connect(platform)
      .approve(await stakeManager.getAddress(), platformStake);
    await stakeManager.connect(platform).depositStake(2, platformStake);
    // agent stakes
    await token
      .connect(agent)
      .approve(
        await stakeManager.getAddress(),
        stakeRequired + disputeFee
      );
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    // employer funds job
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

    // fee distributed to stakers
    expect(await feePool.pendingFees()).to.equal(fee);
    const before = await token.balanceOf(platform.address);
    await feePool.connect(platform).claimRewards();
    const after = await token.balanceOf(platform.address);
    expect(after - before).to.equal(fee);
  });
});
