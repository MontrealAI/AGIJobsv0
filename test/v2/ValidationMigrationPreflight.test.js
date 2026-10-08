const { expect } = require('chai');
const { ethers, artifacts, network } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');
const { stageProtocol } = require('../../scripts/deploy/stage-protocol.cjs');
const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const {
  migrateValidationModule,
} = require('../../scripts/v2/migrateValidationModule');
const { AGIALPHA } = require('../../scripts/constants');

async function preparedStack() {
  const [owner, other] = await ethers.getSigners();
  const tokenArtifact = await artifacts.readArtifact(
    'contracts/test/MockERC20.sol:MockERC20'
  );
  await network.provider.send('hardhat_setCode', [
    AGIALPHA,
    tokenArtifact.deployedBytecode,
  ]);
  const Deployer = await ethers.getContractFactory(
    'contracts/v2/Deployer.sol:Deployer'
  );
  const deployer = await Deployer.deploy();
  const ids = {
    ens: ethers.ZeroAddress,
    nameWrapper: ethers.ZeroAddress,
    clubRootNode: ethers.ZeroHash,
    agentRootNode: ethers.ZeroHash,
    validatorMerkleRoot: ethers.ZeroHash,
    agentMerkleRoot: ethers.ZeroHash,
  };
  const addresses = await stageProtocol(deployer, ids, owner.address);
  await (await deployer.deployDefaults(ids, owner.address)).wait();
  const attach = (name, index) =>
    ethers.getContractAt(`contracts/v2/${name}.sol:${name}`, addresses[index]);
  const stake = await attach('StakeManager', 0);
  const registry = await attach('JobRegistry', 1);
  const oldValidation = await attach('ValidationModule', 2);
  const reputation = await attach('ReputationEngine', 3);
  const pause = await attach('SystemPause', 12);
  for (const contract of [stake, registry, oldValidation, reputation]) {
    await (
      await pause.executeGovernanceCall(
        await contract.getAddress(),
        contract.interface.encodeFunctionData('transferOwnership', [
          owner.address,
        ])
      )
    ).wait();
  }
  const Validation = await ethers.getContractFactory(
    'contracts/v2/ValidationModule.sol:ValidationModule'
  );
  const replacement = await Validation.deploy(
    addresses[1],
    addresses[0],
    60,
    60,
    3,
    5,
    [],
    await deployImplementations('ValidationModule', Validation.runner)
  );
  await replacement.waitForDeployment();
  await (await replacement.setReputationEngine(addresses[3])).wait();
  await (await replacement.setIdentityRegistry(addresses[11])).wait();
  await (await replacement.pause()).wait();
  await (await registry.pause()).wait();
  await (await oldValidation.pause()).wait();
  await (
    await stake.setValidationModule(await replacement.getAddress())
  ).wait();
  await (
    await reputation.setCaller(await replacement.getAddress(), true)
  ).wait();
  await (await reputation.setCaller(addresses[2], false)).wait();
  const Installer = await ethers.getContractFactory(
    'contracts/v2/ModuleInstaller.sol:ModuleInstaller'
  );
  const installer = await Installer.deploy();
  await installer.waitForDeployment();
  const options = {
    installer: await installer.getAddress(),
    registry: addresses[1],
    newValidation: await replacement.getAddress(),
  };
  const prepare = async () => {
    await (await registry.transferOwnership(options.installer)).wait();
    await (await replacement.transferOwnership(options.installer)).wait();
  };
  const createJob = async () => {
    await (await registry.unpause()).wait();
    const token = await ethers.getContractAt(
      'contracts/test/MockERC20.sol:MockERC20',
      AGIALPHA
    );
    const amount = ethers.parseEther('105');
    await (await token.mint(owner.address, amount)).wait();
    await (await token.approve(addresses[0], amount)).wait();
    await (
      await registry.createJob(
        ethers.parseEther('100'),
        (await time.latest()) + 3600,
        ethers.id('migration-job'),
        'ipfs://migration-job'
      )
    ).wait();
    return 1n;
  };
  return {
    owner,
    other,
    installer,
    registry,
    stake,
    reputation,
    replacement,
    oldValidation,
    prepare,
    options,
    createJob,
  };
}

async function expectPreflightRejection(env, message) {
  const before = await ethers.provider.getTransactionCount(env.owner.address);
  await expect(migrateValidationModule(env.options)).to.be.rejectedWith(
    message
  );
  expect(await ethers.provider.getTransactionCount(env.owner.address)).to.equal(
    before
  );
  expect(await env.registry.validationModule()).to.equal(
    await env.oldValidation.getAddress()
  );
}

describe('Validation migration preflight', function () {
  it('confirms complete current-module wiring and ownership without unpausing', async function () {
    const env = await preparedStack();
    await env.prepare();
    await migrateValidationModule(env.options);
    expect(await env.registry.validationModule()).to.equal(
      env.options.newValidation
    );
    expect(await env.registry.owner()).to.equal(env.owner.address);
    expect(await env.replacement.owner()).to.equal(env.owner.address);
    expect(await env.stake.validationModule()).to.equal(
      env.options.newValidation
    );
    expect(await env.reputation.callers(env.options.newValidation)).to.equal(
      true
    );
    expect(
      await env.reputation.callers(await env.oldValidation.getAddress())
    ).to.equal(false);
    expect(await env.registry.paused()).to.equal(true);
    expect(await env.replacement.paused()).to.equal(true);
  });

  it('rejects wrong authority before broadcasting', async function () {
    const env = await preparedStack();
    await env.prepare();
    await (await env.installer.transferOwnership(env.other.address)).wait();
    await expectPreflightRejection(env, 'Installer owner mismatch');
  });

  it('rejects an unpaused registry before broadcasting', async function () {
    const env = await preparedStack();
    await (await env.registry.unpause()).wait();
    await env.prepare();
    await expectPreflightRejection(env, 'JobRegistry must be paused');
  });

  it('rejects missing stake-manager wiring before broadcasting', async function () {
    const env = await preparedStack();
    await (
      await env.stake.setValidationModule(await env.oldValidation.getAddress())
    ).wait();
    await env.prepare();
    await expectPreflightRejection(
      env,
      'StakeManager validation module mismatch'
    );
  });

  it('rejects nonterminal jobs before broadcasting', async function () {
    const env = await preparedStack();
    await env.createJob();
    await (await env.registry.pause()).wait();
    await env.prepare();
    await expectPreflightRejection(env, 'Job 1 is not terminal');
  });

  it('rejects unknown historical job state before broadcasting', async function () {
    const env = await preparedStack();
    const build = await artifacts.getBuildInfo(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const layout =
      build.output.contracts['contracts/v2/JobRegistry.sol'].JobRegistry
        .storageLayout;
    const counter = layout.storage.find((entry) => entry.label === 'nextJobId');
    // Adversarial fixture: a recorded ID with no corresponding job must not be
    // treated as a safely drained registry.
    await network.provider.send('hardhat_setStorageAt', [
      env.options.registry,
      ethers.toBeHex(BigInt(counter.slot)),
      ethers.toBeHex(1, 32),
    ]);
    await env.prepare();
    await expectPreflightRejection(env, 'Job 1 has unknown state');
  });

  it('retains cancelled job state during a drained replacement', async function () {
    const env = await preparedStack();
    const jobId = await env.createJob();
    await (await env.registry.cancel(jobId)).wait();
    const before = await env.registry.jobs(jobId);
    await (await env.registry.pause()).wait();
    await env.prepare();
    await migrateValidationModule(env.options);
    expect(await env.registry.jobs(jobId)).to.deep.equal(before);
    expect(
      (await env.registry.decodeJobMetadata(before.packedMetadata)).state
    ).to.equal(7n);
  });
});
