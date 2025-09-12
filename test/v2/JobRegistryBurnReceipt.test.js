const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { address: AGIALPHA } = require('../../config/agialpha.json');

describe('JobRegistry burn receipt validation', function () {
  let owner, employer, agent;
  let token, stakeManager, validation, registry, identity;
  const reward = 100n;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
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
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );
    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    validation = await Validation.deploy();
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      await validation.getAddress(),
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
    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();

    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await registry.connect(owner).setJobParameters(1000, 0);
    await registry.connect(owner).setJobDurationLimit(86400);
    await registry.connect(owner).setValidatorRewardPct(0);
    await stakeManager
      .connect(owner)
      .setJobRegistry(await registry.getAddress());
    await stakeManager
      .connect(owner)
      .setValidationModule(await validation.getAddress());
    await stakeManager.connect(owner).setBurnPct(5);
    await validation.setJobRegistry(await registry.getAddress());

    await token.mint(employer.address, 1000n);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), 1000n);
  });

  async function runLifecycle(burnAmount) {
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes('spec'));
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');
    const jobId = 1;

    await registry.connect(agent).applyForJob(jobId, '', []);
    const resHash = ethers.keccak256(ethers.toUtf8Bytes('result'));
    await registry.connect(agent).submit(jobId, resHash, 'ipfs://res', '', []);
    await validation.setResult(true);
    await validation.finalize(jobId);

    const burnTx = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTx, burnAmount, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTx);
    return jobId;
  }

  it('finalizes with sufficient burn receipt', async () => {
    const expectedBurn = 10n; // reward 100, fee 5% + burn 5% => 10
    const jobId = await runLifecycle(expectedBurn);
    await expect(registry.connect(employer).finalize(jobId)).to.emit(
      registry,
      'JobFinalized'
    );
  });

  it('reverts when burn receipt amount is too low', async () => {
    const jobId = await runLifecycle(5n); // below expected 10
    await expect(
      registry.connect(employer).finalize(jobId)
    ).to.be.revertedWithCustomError(registry, 'BurnAmountTooLow');
  });
});
