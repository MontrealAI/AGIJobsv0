const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('Boltzmann validator reward', function () {
  const { address: AGIALPHA } = require('../../config/agialpha.json');
  const reward = 100;
  const stake = 200;
  const disputeFee = 0;

  let token,
    stakeManager,
    validation,
    rep,
    nft,
    registry,
    dispute,
    policy,
    identity,
    feePool;
  let owner, employer, agent, validator;

  beforeEach(async () => {
    [owner, employer, agent, validator] = await ethers.getSigners();
    const artifact = await artifacts.readArtifact(
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
    await validation.setValidators([validator.address]);
    await validation.setResult(true);

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
      await validation.getAddress(),
      await stakeManager.getAddress(),
      await rep.getAddress(),
      ethers.ZeroAddress,
      await nft.getAddress(),
      await feePool.getAddress(),
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
      ethers.ZeroAddress
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
    await registry.connect(owner).setMaxJobReward(1_000_000);
    await registry.connect(owner).setJobDurationLimit(86_400);
    await registry.connect(owner).setFeePct(0);
    await registry.connect(owner).setValidatorRewardPct(20);
    await registry.connect(owner).setBoltzmannReward(true);
    await registry.connect(owner).setTemperature(ethers.parseEther('1'));
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
    await policy.connect(owner).setAcknowledger(await registry.getAddress(), true);
    await policy.connect(employer).acknowledge();
    await policy.connect(agent).acknowledge();

    await token.mint(employer.address, 1000);
    await token.mint(agent.address, 1000);

    await token
      .connect(agent)
      .approve(await stakeManager.getAddress(), stake + disputeFee);
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

  it('splits validator rewards via Boltzmann weighting', async () => {
    await token
      .connect(employer)
      .approve(
        await stakeManager.getAddress(),
        BigInt(reward) + (BigInt(reward) * 10n) / 100n
      );
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      ['createJob(uint256,uint64,bytes32,string)'](
        reward,
        deadline,
        specHash,
        'uri'
      );
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, '', []);
    const assignedAt = (await registry.jobs(jobId)).assignedAt;
    const resultHash = ethers.id('result');
    await time.increaseTo(Number(assignedAt) + 10);
    await registry
      .connect(agent)
      .submit(jobId, resultHash, 'result', '', []);
    await validation.finalize(jobId);
    await registry.connect(employer).finalize(jobId);

    const completion = BigInt((await time.latest()) - Number(assignedAt));
    const maxVR = (BigInt(reward) * 20n) / 100n;
    const wAgent = Math.exp(-Number(completion));
    const wVal = Math.exp(-2);
    const shareVal = wVal / (wVal + wAgent);
    const expectedValReward = BigInt(
      Math.floor(Number(maxVR) * shareVal)
    );

    expect(await token.balanceOf(validator.address)).to.equal(
      expectedValReward
    );

    const expectedAgent =
      BigInt(1000 - stake) + (BigInt(reward) - expectedValReward);
    expect(await token.balanceOf(agent.address)).to.equal(expectedAgent);
  });
});

