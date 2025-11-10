const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { AGIALPHA, AGIALPHA_DECIMALS } = require('../../scripts/constants');

describe('comprehensive job flows', function () {
  const reward = ethers.parseUnits('1000', AGIALPHA_DECIMALS);
  const stakeRequired = ethers.parseUnits('200', AGIALPHA_DECIMALS);
  const feePct = 10;
  const disputeFee = ethers.parseUnits('1', AGIALPHA_DECIMALS);

  let token,
    stakeManager,
    rep,
    validation,
    nft,
    registry,
    dispute,
    feePool,
    policy,
    identity;
  let owner, employer, agent, platform, buyer;

  beforeEach(async () => {
    [owner, employer, agent, platform, buyer] = await ethers.getSigners();

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
    await token.mint(employer.address, mintAmount);
    await token.mint(agent.address, mintAmount);
    await token.mint(platform.address, mintAmount);
    await token.mint(buyer.address, mintAmount);
    await token.mint(owner.address, mintAmount);

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
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
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
      owner.address,
      owner.address
    );
    await dispute.setDisputeFee(disputeFee);
    await dispute.setDisputeWindow(0);

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
    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await registry.setIdentityRegistry(await identity.getAddress());
    await registry.setFeePct(feePct);
    await registry.setValidatorRewardPct(0);
    await registry.setTaxPolicy(await policy.getAddress());
    await registry.setJobParameters(0, stakeRequired);
    await registry.setMaxJobReward(reward);
    await registry.setJobDurationLimit(86400);
    await stakeManager.setJobRegistry(await registry.getAddress());
    await stakeManager.setValidationModule(await validation.getAddress());
    await stakeManager.setDisputeModule(await dispute.getAddress());
    await stakeManager.setSlashingPercentages(100, 0);
    await nft.setJobRegistry(await registry.getAddress());
    await nft.setStakeManager(await stakeManager.getAddress());
    await rep.setAuthorizedCaller(await registry.getAddress(), true);
    await rep.setThreshold(0);
    await nft.transferOwnership(await registry.getAddress());

    await policy.acknowledge();
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();
    await policy.connect(platform).acknowledge();
    await policy.connect(buyer).acknowledge();
  });

  it('executes successful job flow with certificate trade', async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    await identity.addAdditionalAgent(agent.address);
    await token
      .connect(agent)
      .approve(
        await stakeManager.getAddress(),
        stakeRequired + disputeFee
      );
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
    await validation.setResult(true);
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
    expect(await nft.ownerOf(jobId)).to.equal(agent.address);
    const price = ethers.parseUnits('10', AGIALPHA_DECIMALS);
    await nft.connect(agent).list(jobId, price);
    await token.connect(buyer).approve(await nft.getAddress(), price);
    await nft.connect(buyer).purchase(jobId);
    expect(await nft.ownerOf(jobId)).to.equal(buyer.address);
  });

  it('rejects unverified agent identities', async () => {
    const Verifier = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryToggle.sol:IdentityRegistryToggle'
    );
    const verifier = await Verifier.deploy();
    await verifier.setResult(false);
    await registry.setIdentityRegistry(await verifier.getAddress());
    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stakeRequired);
    await stakeManager.connect(agent).depositStake(0, stakeRequired);
    const fee = (reward * BigInt(feePct)) / 100n;
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward + fee);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'uri');
    await expect(
      registry.connect(agent).applyForJob(1, 'agent', [])
    ).to.be.revertedWithCustomError(registry, 'NotAuthorizedAgent');
  });

  it('resolves disputes with stake slashing', async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    await identity.addAdditionalAgent(agent.address);
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
    await validation.setResult(false);
    await registry
      .connect(agent)
      .submit(jobId, ethers.id('bad'), 'bad', 'agent', []);
    await validation.finalize(jobId);
    // fund and impersonate dispute module to resolve
    await network.provider.send('hardhat_setBalance', [
      await dispute.getAddress(),
      '0x56BC75E2D63100000',
    ]);
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [await dispute.getAddress()],
    });
    const disputeSigner = await ethers.getSigner(await dispute.getAddress());
    await registry.connect(disputeSigner).resolveDispute(jobId, true);
    const burnTxHash2 = ethers.ZeroHash;
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTxHash2, fee, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTxHash2);
    await registry.connect(employer).finalize(jobId);
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [await dispute.getAddress()],
    });
    expect(await stakeManager.stakeOf(agent.address, 0)).to.equal(0);
  });

  it('blocks blacklisted agents', async () => {
    const fee = (reward * BigInt(feePct)) / 100n;
    await identity.addAdditionalAgent(agent.address);
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
    await rep.setBlacklist(agent.address, true);
    await expect(
      registry.connect(agent).applyForJob(1, 'agent', [])
    ).to.be.revertedWithCustomError(registry, 'BlacklistedAgent');
  });

  it('enforces fresh tax policy acknowledgements', async () => {
    await policy.bumpPolicyVersion();
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await expect(
      registry.connect(employer).createJob(reward, deadline, specHash, 'uri')
    )
      .to.be.revertedWithCustomError(registry, 'TaxPolicyNotAcknowledged')
      .withArgs(employer.address);
  });
});
