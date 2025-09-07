const { expect } = require('chai');
const { network } = require('hardhat');

describe('ModuleInstaller', function () {
  it('restricts initialize to owner and reports tax exemption', async function () {
    const [, other] = await ethers.getSigners();
    const Installer = await ethers.getContractFactory(
      'contracts/v2/ModuleInstaller.sol:ModuleInstaller'
    );
    const installer = await Installer.deploy();
    await installer.waitForDeployment();

    await expect(
      installer
        .connect(other)
        .initialize(
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          []
        )
    ).to.be.revertedWithCustomError(installer, 'OwnableUnauthorizedAccount');

    expect(await installer.isTaxExempt()).to.equal(true);
  });

  it('reverts when initialized twice', async function () {
    const Installer = await ethers.getContractFactory(
      'contracts/v2/ModuleInstaller.sol:ModuleInstaller'
    );
    const installer = await Installer.deploy();
    await installer.waitForDeployment();

    const addr = await installer.getAddress();
    const owner = await installer.owner();
    const value = ethers.hexlify(
      ethers.zeroPadValue(
        ethers.solidityPacked(['bool', 'address'], [true, owner]),
        32
      )
    );
    await network.provider.send('hardhat_setStorageAt', [addr, '0x0', value]);

    expect(await installer.initialized()).to.equal(true);

    await expect(
      installer.initialize(
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        ethers.ZeroHash,
        ethers.ZeroHash,
        ethers.ZeroHash,
        ethers.ZeroHash,
        []
      )
    ).to.be.revertedWithCustomError(installer, 'AlreadyInitialized');
  });
});
