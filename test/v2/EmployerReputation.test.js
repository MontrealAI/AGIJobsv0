const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Employer reputation', function () {
  let token,
    stakeManager,
    rep,
    validation,
    nft,
    registry,
    dispute,
    policy,
    identity;
  const { address: AGIALPHA } = require('../../config/agialpha.json');
  let owner, employer, agent, treasury;
  let feePool;

  const reward = 100;
  const stake = 200;
  const disputeFee = 1_000_000_000_000_000_000n;

  beforeEach(async () => {
    [owner, employer, agent, treasury] = await ethers.getSigners();
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
    await stakeManager.connect(owner).setSlashingPercentages(100, 0);
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
    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    feePool = await FeePool.deploy(
      await stakeManager.getAddress(),
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );
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
    const Policy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    policy = await Policy.deploy('ipfs://policy', 'ack');

    await registry
      .connect(owner)
      .setModules(
        await validation.getAddress(),
        await stakeManager.getAddress(),
        await rep.getAddress(),
        await dispute.getAddress(),
        await nft.getAddress(),
        await feePool.getAddress(),
        []
      );
    await validation.setJobRegistry(await registry.getAddress());
    await registry.connect(owner).setJobParameters(reward, stake);
    await registry.connect(owner).setMaxJobReward(1000000);
    await registry.connect(owner).setJobDurationLimit(86400);
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).setValidatorRewardPct(0);
    await nft.connect(owner).setJobRegistry(await registry.getAddress());
    await rep
      .connect(owner)
      .setAuthorizedCaller(await registry.getAddress(), true);
    await rep.connect(owner).setThreshold(0);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());
    await stakeManager.connect(owner).setFeePool(await feePool.getAddress());
    await nft.connect(owner).transferOwnership(await registry.getAddress());
    await registry.connect(owner).setTaxPolicy(await policy.getAddress());
    await policy
      .connect(owner)
      .setAcknowledger(await registry.getAddress(), true);
    await policy.connect(owner).acknowledge();
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();

    await token.mint(employer.address, 1000);
    await token.mint(agent.address, disputeFee + 1000n);

    await token
      .connect(agent)
      .approve(
        await stakeManager.getAddress(),
        BigInt(stake) + disputeFee
      );
    await stakeManager.connect(agent).depositStake(0, stake);
    await stakeManager
      .connect(owner)
      .setDisputeModule(await dispute.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
  });

  it('records positive reputation on successful finalization', async () => {
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
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
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);
    await validation.finalize(jobId);
    await registry.connect(employer).finalize(jobId);
    const [successful, failed] = await registry.getEmployerReputation(
      employer.address
    );
    expect(successful).to.equal(1n);
    expect(failed).to.equal(0n);
    const score = await registry.getEmployerScore(employer.address);
    expect(score).to.equal(ethers.parseEther('1'));
  });

  it('records dispute count when job ends in dispute', async () => {
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), reward);
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
      .submit(jobId, ethers.id('res'), 'res', 'agent', []);
    await validation.finalize(jobId);
    await registry
      .connect(agent)
      .dispute(jobId, ethers.id('evidence'), 'ipfs://evidence');
    await dispute.connect(owner).setCommittee(owner.address);
    await dispute.connect(owner).setDisputeWindow(0);
    await dispute.connect(owner).resolveDispute(jobId, true);
    await registry.connect(employer).finalize(jobId);
    const [successful, failed] = await registry.getEmployerReputation(
      employer.address
    );
    expect(successful).to.equal(0n);
    expect(failed).to.equal(1n);
    const score = await registry.getEmployerScore(employer.address);
    expect(score).to.equal(0n);
  });
});
