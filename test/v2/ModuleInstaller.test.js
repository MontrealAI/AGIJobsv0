const { expect } = require('chai');

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
});
