const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { readArtifact } = require('../utils/artifacts');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { address: AGIALPHA } = require('../../config/agialpha.json');

const { decodeJobMetadata, enrichJob } = require('../utils/jobMetadata');

describe('JobRegistry burn receipt validation', function () {
  let owner, employer, agent;
  let token, stakeManager, validation, registry, identity, registrySigner;
  const reward = 100n;
  const mintAmount = 1000n;

  beforeEach(async () => {
    [owner, employer, agent] = await ethers.getSigners();
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
    const registryAddress = await registry.getAddress();
    await network.provider.send('hardhat_setBalance', [
      registryAddress,
      '0x56BC75E2D63100000',
    ]);
    registrySigner = await ethers.getImpersonatedSigner(registryAddress);

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

    await token.mint(employer.address, mintAmount);
    await token
      .connect(employer)
      .approve(await stakeManager.getAddress(), mintAmount);
  });

  async function runLifecycle({
    topUpBurn = false,
    submitReceipt = false,
    confirmBurn = false,
    burnReceiptAmount,
  } = {}) {
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes('spec'));
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');
    const jobId = 1;

    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    const resHash = ethers.keccak256(ethers.toUtf8Bytes('result'));
    await registry.connect(agent).submit(jobId, resHash, 'ipfs://res', 'agent', []);
    await validation.setResult(true);
    await validation.finalize(jobId);

    const jobKey = ethers.zeroPadValue(ethers.toBeHex(jobId), 32);
    const jobData = await registry.jobs(jobId);
    const metadata = decodeJobMetadata(jobData.packedMetadata);
    const rewardValue = BigInt(jobData.reward.toString());
    const agentPctValue = metadata.agentPct ?? 0n;
    const agentPct = agentPctValue === 0n ? 100n : agentPctValue;
    const validatorPctValue = BigInt(
      (await registry.validatorRewardPct()).toString()
    );
    const burnPctValue = BigInt((await stakeManager.burnPct()).toString());
    const rewardAfterValidator =
      rewardValue - (rewardValue * validatorPctValue) / 100n;
    const expectedBurn =
      (rewardAfterValidator * agentPct * burnPctValue) / (100n * 100n);

    if (topUpBurn && expectedBurn > 0n) {
      await stakeManager
        .connect(registrySigner)
        .lockReward(jobKey, employer.address, expectedBurn);
    }

    const burnTx = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    if (submitReceipt) {
      const receiptAmount =
        burnReceiptAmount !== undefined ? burnReceiptAmount : expectedBurn;
      await registry
        .connect(employer)
        .submitBurnReceipt(jobId, burnTx, receiptAmount, 0);
      if (confirmBurn) {
        await registry.connect(employer).confirmEmployerBurn(jobId, burnTx);
      }
    }
    return { jobId, jobKey, burnTx, expectedBurn };
  }

  it('burns escrowed tokens and charges the employer on finalize', async () => {
    const { jobId, jobKey, expectedBurn } = await runLifecycle({
      topUpBurn: true,
    });

    expect(expectedBurn).to.be.gt(0n);
    const supplyBefore = await token.totalSupply();

    const finalizeTx = registry.connect(employer).finalize(jobId);
    await expect(finalizeTx)
      .to.emit(stakeManager, 'TokensBurned')
      .withArgs(jobKey, expectedBurn)
      .and.to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);

    const supplyAfter = await token.totalSupply();
    expect(supplyBefore - supplyAfter).to.equal(expectedBurn);

    const jobData = await registry.jobs(jobId);
    const metadata = decodeJobMetadata(jobData.packedMetadata);
    const rewardValue = BigInt(jobData.reward.toString());
    const feePct = metadata.feePct ?? 0n;
    const fee = (rewardValue * feePct) / 100n;
    const employerBalance = await token.balanceOf(employer.address);
    expect(employerBalance).to.equal(
      mintAmount - rewardValue - fee - expectedBurn
    );
  });

  it('flags mismatched burn receipts without blocking finalize', async () => {
    const { jobId, jobKey, burnTx, expectedBurn } = await runLifecycle({
      topUpBurn: true,
    });

    expect(expectedBurn).to.be.gt(0n);
    const fakeAmount = expectedBurn - 1n;
    await registry
      .connect(employer)
      .submitBurnReceipt(jobId, burnTx, fakeAmount, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTx);
    const finalizeTx = registry.connect(employer).finalize(jobId);
    await expect(finalizeTx)
      .to.emit(stakeManager, 'TokensBurned')
      .withArgs(jobKey, expectedBurn)
      .and.to.emit(registry, 'BurnDiscrepancy')
      .withArgs(jobId, fakeAmount, expectedBurn)
      .and.to.emit(registry, 'JobFinalized')
      .withArgs(jobId, agent.address);
  });
});

describe('Validation burn evidence gating', function () {
  let owner, employer, agent, v1, v2, v3;
  let stakeManager, validation, registry, identity;

  beforeEach(async () => {
    [owner, employer, agent, v1, v2, v3] = await ethers.getSigners();
    const StakeMock = await ethers.getContractFactory('MockStakeManager');
    stakeManager = await StakeMock.deploy();
    await stakeManager.waitForDeployment();
    await stakeManager.setBurnPct(5);
    await stakeManager.setStake(v1.address, 1, ethers.parseEther('10'));
    await stakeManager.setStake(v2.address, 1, ethers.parseEther('10'));
    await stakeManager.setStake(v3.address, 1, ethers.parseEther('10'));

    const Validation = await ethers.getContractFactory(
      'contracts/v2/ValidationModule.sol:ValidationModule'
    );
    validation = await Validation.deploy(
      ethers.ZeroAddress,
      await stakeManager.getAddress(),
      60,
      60,
      3,
      3,
      []
    );
    await validation.waitForDeployment();

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
    await registry.waitForDeployment();

    await validation.connect(owner).setJobRegistry(await registry.getAddress());
    await validation
      .connect(owner)
      .setStakeManager(await stakeManager.getAddress());

    const Identity = await ethers.getContractFactory(
      'contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock'
    );
    identity = await Identity.deploy();
    await identity.waitForDeployment();
    await validation
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await registry
      .connect(owner)
      .setIdentityRegistry(await identity.getAddress());
    await identity.addAdditionalValidator(v1.address);
    await identity.addAdditionalValidator(v2.address);
    await identity.addAdditionalValidator(v3.address);
    await validation
      .connect(owner)
      .setValidatorPool([v1.address, v2.address, v3.address]);
    await registry.connect(owner).setJobParameters(1000, 0);
    await registry.connect(owner).setJobDurationLimit(86400);
    await registry.connect(owner).setValidatorRewardPct(0);
  });

  async function submitJob() {
    const deadline = (await time.latest()) + 1000;
    const specHash = ethers.keccak256(ethers.toUtf8Bytes('spec'));
    await registry
      .connect(employer)
      .createJob(1, deadline, specHash, 'ipfs://job');
    const jobId = 1;
    await registry.connect(agent).applyForJob(jobId, 'agent', []);
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes('result'));
    await registry
      .connect(agent)
      .submit(jobId, resultHash, 'ipfs://res', 'agent', []);
    return { jobId, resultHash };
  }

  it('delays validation until burn confirmed', async () => {
    const { jobId } = await submitJob();
    expect(await registry.validationStartPending(jobId)).to.equal(true);
    expect(await validation.revealDeadline(jobId)).to.equal(0);
    await expect(
      validation.selectValidators(jobId, 0)
    ).to.be.revertedWithCustomError(validation, 'BurnEvidenceIncomplete');

    const burnTxHash = ethers.keccak256(ethers.toUtf8Bytes('burn'));
    await registry.connect(employer).submitBurnReceipt(jobId, burnTxHash, 0, 0);
    await registry.connect(employer).confirmEmployerBurn(jobId, burnTxHash);
    expect(await registry.validationStartPending(jobId)).to.equal(false);

    await validation.selectValidators(jobId, 0);
    await ethers.provider.send('evm_mine', []);
    const tx = await validation.selectValidators(jobId, 0);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.fragment && log.fragment.name === 'ValidatorsSelected'
    );
    expect(event).to.not.equal(undefined);
  });

  it('forceFinalize without burn evidence avoids penalties', async () => {
    const { jobId } = await submitJob();
    const before1 = await stakeManager.stakeOf(v1.address, 1);
    const before2 = await stakeManager.stakeOf(v2.address, 1);
    const before3 = await stakeManager.stakeOf(v3.address, 1);

    await time.increase(4000);
    await validation.connect(employer).forceFinalize(jobId);

    expect(await stakeManager.stakeOf(v1.address, 1)).to.equal(before1);
    expect(await stakeManager.stakeOf(v2.address, 1)).to.equal(before2);
    expect(await stakeManager.stakeOf(v3.address, 1)).to.equal(before3);
    expect(await validation.validatorBanUntil(v1.address)).to.equal(0);
    expect(await registry.validationStartPending(jobId)).to.equal(false);
    expect(await registry.pendingValidationEntropy(jobId)).to.equal(0);
    const job = enrichJob(await registry.jobs(jobId));
    expect(job.state).to.equal(4); // Completed
  });
});
