const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('JobRegistry module version checks', function () {
  let owner, registry, good, bad;

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
      owner.address
    );
    const Version = await ethers.getContractFactory(
      'contracts/v2/mocks/VersionMock.sol:VersionMock'
    );
    good = await Version.deploy(2);
    bad = await Version.deploy(3);
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
          await good.getAddress(),
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
          await good.getAddress(),
          await good.getAddress(),
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
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
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
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await good.getAddress(),
          await bad.getAddress(),
          await good.getAddress(),
          []
        )
    ).to.be.revertedWithCustomError(registry, 'InvalidCertificateNFT');
  });

  it('succeeds for matching versions', async function () {
    await registry
      .connect(owner)
      .setModules(
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        await good.getAddress(),
        []
      );
    expect(await registry.validationModule()).to.equal(await good.getAddress());
  });
});
