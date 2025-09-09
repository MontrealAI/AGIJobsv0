const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('IdentityRegistry ether rejection', function () {
  let owner, registry;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const Identity = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    registry = await Identity.deploy(
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await registry.waitForDeployment();
  });

  it('reverts on direct ether transfer', async () => {
    await expect(
      owner.sendTransaction({ to: await registry.getAddress(), value: 1n })
    ).to.be.revertedWithCustomError(registry, 'EtherNotAccepted');
  });

  it('reverts on unknown calldata with value', async () => {
    await expect(
      owner.sendTransaction({
        to: await registry.getAddress(),
        data: '0x12345678',
        value: 1n,
      })
    ).to.be.revertedWithCustomError(registry, 'EtherNotAccepted');
  });

  it('reports tax exemption', async () => {
    expect(await registry.isTaxExempt()).to.equal(true);
  });
});
