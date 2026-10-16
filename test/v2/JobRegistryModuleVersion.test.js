const {
  deployImplementations,
} = require('../../scripts/deploy/implementations.cjs');
const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('JobRegistry module version checks', function () {
  let owner, registry, good, bad, goodValidation;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    registry = await Registry.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address,
      await deployImplementations('JobRegistry', Registry.runner)
    );
    const Version = await ethers.getContractFactory(
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    good = await Version.deploy(2);
    bad = await Version.deploy(4);
    goodValidation = await (
      await ethers.getContractFactory('ValidationStub')
    ).deploy();
  });

  it('reverts for mismatched validation module', async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await bad.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          []
        )
    ).to.be.revertedWithCustomError(registry, 'InvalidValidationModule');
  });

  it('reverts for mismatched stake manager', async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await goodValidation.getAddress(),
          await bad.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          []
        )
    ).to.be.revertedWithCustomError(registry, 'InvalidStakeManager');
  });

  it('reverts for mismatched reputation module', async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await goodValidation.getAddress(),
          await goodValidation.getAddress(),
          await bad.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          []
        )
    ).to.be.revertedWithCustomError(registry, 'InvalidReputationModule');
  });

  it('reverts for mismatched dispute module', async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await goodValidation.getAddress(),
          await good.getAddress(),
          await goodValidation.getAddress(),
          await bad.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          []
        )
    ).to.be.revertedWithCustomError(registry, 'InvalidDisputeModule');
  });

  it('reverts for mismatched certificate NFT', async function () {
    await expect(
      registry
        .connect(owner)
        .setModules(
          await goodValidation.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await goodValidation.getAddress(),
          await bad.getAddress(),
          await good.getAddress(),
          []
        )
    ).to.be.revertedWithCustomError(registry, 'InvalidCertificateNFT');
  });

  it('rejects the actual historical version-2 validation module at construction and every configuration route', async function () {
    const {
      deployPrebuiltImplementations,
    } = require('../../scripts/deploy/prebuilt-implementations.cjs');
    const old = require('../../scripts/v2/lib/prebuilt/ValidationModule.json');
    const legacy = await new ethers.ContractFactory(
      old.abi,
      old.bytecode,
      owner
    ).deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      60,
      60,
      3,
      3,
      [],
      await deployPrebuiltImplementations('ValidationModule', owner)
    );
    const legacyAddress = await legacy.getAddress();
    // A third-party version-2 module with no reveal getter is rejected too.
    expect(good.interface.hasFunction('revealed')).to.equal(false);
    await expect(
      registry.setValidationModule(await good.getAddress())
    ).to.be.revertedWithCustomError(registry, 'InvalidValidationModule');
    expect(await legacy.version()).to.equal(2n);
    expect(legacy.interface.hasFunction('revealed')).to.equal(true);
    expect(legacy.interface.hasFunction('reputationInterfaceVersion')).to.equal(
      false
    );
    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    await expect(
      Registry.deploy(
        legacyAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        0,
        0,
        [],
        owner.address,
        await deployImplementations('JobRegistry', owner)
      )
    ).to.be.revertedWithCustomError(Registry, 'InvalidValidationModule');
    await registry.setValidationModule(await goodValidation.getAddress());
    await expect(
      registry.setValidationModule(legacyAddress)
    ).to.be.revertedWithCustomError(registry, 'InvalidValidationModule');
    await expect(
      registry.setModules(
        legacyAddress,
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        []
      )
    ).to.be.revertedWithCustomError(registry, 'InvalidValidationModule');
    const installer = await (
      await ethers.getContractFactory(
        'contracts/v2/ModuleInstaller.sol:ModuleInstaller'
      )
    ).deploy();
    await registry.transferOwnership(await installer.getAddress());
    await expect(
      installer.replaceValidationModule(
        await registry.getAddress(),
        legacyAddress,
        []
      )
    ).to.be.revertedWithCustomError(registry, 'InvalidValidationModule');
    expect(await registry.validationModule()).to.equal(
      await goodValidation.getAddress()
    );
    expect(await registry.owner()).to.equal(await installer.getAddress());
    expect(await registry.nextJobId()).to.equal(0n);
  });

  it('succeeds for matching versions', async function () {
    await registry
      .connect(owner)
      .setModules(
        await goodValidation.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        []
      );
    expect(await registry.validationModule()).to.equal(
      await goodValidation.getAddress()
    );
  });
});
